import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  type Command,
  type AppState,
  stateSchema,
  roomSchema,
  serverSchema,
  userSchema,
  messageSchema,
} from "@/lib/model";
import { database } from "./db";
import { HttpError } from "./http";

const access = `(EXISTS (SELECT 1 FROM memberships mm WHERE mm.server_id=r.server_id AND mm.user_id=$1) OR EXISTS (SELECT 1 FROM participants pp WHERE pp.room_id=r.id AND pp.user_id=$1))`;
const userColumns = `u.id, u.name, u.color, u.status, u.bio`;

export async function snapshot(userId: string): Promise<AppState> {
  const db = database();
  const [meResult, usersResult, serversResult, roomsResult, messagesResult] = await Promise.all([
    db.query(`SELECT ${userColumns},u.email FROM "user" u WHERE u.id=$1`, [userId]),
    db.query(
      `SELECT DISTINCT ${userColumns} FROM "user" u WHERE u.id=$1 OR EXISTS (SELECT 1 FROM memberships a JOIN memberships b ON a.server_id=b.server_id WHERE a.user_id=$1 AND b.user_id=u.id) OR EXISTS (SELECT 1 FROM participants a JOIN participants b ON a.room_id=b.room_id WHERE a.user_id=$1 AND b.user_id=u.id)`,
      [userId],
    ),
    db.query(
      `SELECT s.id,s.name,s.description,s.icon,s.color,s.owner_id AS "ownerId",s.invite_code AS "inviteCode",(SELECT json_agg(mm.user_id) FROM memberships mm WHERE mm.server_id=s.id) AS "memberIds" FROM servers s JOIN memberships m ON m.server_id=s.id WHERE m.user_id=$1 ORDER BY s.created_at`,
      [userId],
    ),
    db.query(
      `SELECT r.id,r.server_id AS "serverId",r.name,r.topic,r.kind,COALESCE((SELECT json_agg(p.user_id) FROM participants p WHERE p.room_id=r.id),'[]'::json) AS "participantIds" FROM rooms r WHERE ${access} ORDER BY r.created_at`,
      [userId],
    ),
    db.query(
      `SELECT m.id,m.room_id AS "roomId",m.author_id AS "authorId",m.content,m.created_at AS "createdAt",m.edited,COALESCE((SELECT json_agg(x) FROM (SELECT emoji,json_agg(user_id) AS "userIds" FROM reactions WHERE message_id=m.id GROUP BY emoji) x),'[]'::json) AS reactions FROM messages m JOIN rooms r ON r.id=m.room_id WHERE ${access} ORDER BY m.created_at DESC,m.id DESC LIMIT 300`,
      [userId],
    ),
  ]);
  const me = stateSchema.shape.me.parse(meResult.rows[0]);
  const users = z.array(userSchema).parse(usersResult.rows);
  const rooms = z
    .array(roomSchema)
    .parse(roomsResult.rows)
    .map((room) => {
      if (room.kind !== "dm") return room;
      return {
        ...room,
        name:
          users.find((u) => room.participantIds.includes(u.id) && u.id !== userId)?.name ??
          "Direct message",
      };
    });
  const messages = z
    .array(messageSchema)
    .parse(
      messagesResult.rows.map((row) => ({
        ...row,
        createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
      })),
    )
    .reverse();
  return stateSchema.parse({
    me,
    users,
    servers: z.array(serverSchema).parse(serversResult.rows),
    rooms,
    messages,
  });
}

export async function limitCommands(userId: string) {
  const result = await database().query(
    `INSERT INTO command_limits(user_id,window_start,count) VALUES($1,now(),1) ON CONFLICT(user_id) DO UPDATE SET count=CASE WHEN command_limits.window_start < now()-interval '1 minute' THEN 1 ELSE command_limits.count+1 END,window_start=CASE WHEN command_limits.window_start < now()-interval '1 minute' THEN now() ELSE command_limits.window_start END RETURNING count`,
    [userId],
  );
  const { count } = z.object({ count: z.number() }).parse(result.rows[0]);
  if (count > 60) throw new HttpError(429, "Slow down a little. Try again in a minute.");
}

export async function execute(userId: string, command: Command) {
  const db = database();
  await limitCommands(userId);
  switch (command.type) {
    case "send": {
      const result = await db.query(
        `INSERT INTO messages(id,room_id,author_id,content) SELECT $2,r.id,$1,$3 FROM rooms r WHERE r.id=$4 AND r.kind IN ('text','dm') AND ${access} RETURNING id`,
        [userId, randomUUID(), command.content, command.roomId],
      );
      if (!result.rowCount) throw new HttpError(403, "You cannot send messages in this channel");
      break;
    }
    case "edit":
    case "delete": {
      const predicate = `m.id=$2 AND m.author_id=$1 AND EXISTS(SELECT 1 FROM rooms r WHERE r.id=m.room_id AND ${access})`;
      const result =
        command.type === "edit"
          ? await db.query(
              `UPDATE messages m SET content=$3,edited=true WHERE ${predicate} RETURNING id`,
              [userId, command.messageId, command.content],
            )
          : await db.query(`DELETE FROM messages m WHERE ${predicate} RETURNING id`, [
              userId,
              command.messageId,
            ]);
      if (!result.rowCount)
        throw new HttpError(403, "You can only change your own accessible messages");
      break;
    }
    case "react": {
      const client = await db.connect();
      try {
        await client.query("BEGIN");
        const allowed = await client.query(
          `SELECT m.id FROM messages m JOIN rooms r ON r.id=m.room_id WHERE m.id=$2 AND ${access} FOR UPDATE OF m`,
          [userId, command.messageId],
        );
        if (!allowed.rowCount) throw new HttpError(403, "Message is not accessible");
        const deleted = await client.query(
          `DELETE FROM reactions WHERE message_id=$1 AND user_id=$2 AND emoji=$3 RETURNING message_id`,
          [command.messageId, userId, command.emoji],
        );
        if (!deleted.rowCount)
          await client.query(
            `INSERT INTO reactions(message_id,user_id,emoji) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,
            [command.messageId, userId, command.emoji],
          );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
      break;
    }
    case "createServer": {
      const id = randomUUID();
      await db.query(
        `WITH s AS (INSERT INTO servers(id,name,description,icon,owner_id,invite_code) VALUES($1,$2,$3,$4,$5,$6) RETURNING id), member AS (INSERT INTO memberships(server_id,user_id) SELECT id,$5 FROM s) INSERT INTO rooms(id,server_id,name,topic,kind) SELECT $7,id,'general','Your community starts here.','text' FROM s`,
        [
          id,
          command.name,
          command.description,
          command.name.slice(0, 1).toUpperCase(),
          userId,
          randomUUID(),
          randomUUID(),
        ],
      );
      break;
    }
    case "createRoom": {
      const result = await db.query(
        `INSERT INTO rooms(id,server_id,name,topic,kind) SELECT $1,id,$2,'A new place to connect.',$3 FROM servers WHERE id=$4 AND owner_id=$5 RETURNING id`,
        [randomUUID(), command.name, command.kind, command.serverId, userId],
      );
      if (!result.rowCount) throw new HttpError(403, "Only the server owner can create channels");
      break;
    }
    case "join": {
      const result = await db.query(
        `INSERT INTO memberships(server_id,user_id) SELECT id,$1 FROM servers WHERE invite_code=$2 ON CONFLICT DO NOTHING RETURNING server_id`,
        [userId, command.inviteCode],
      );
      if (!result.rowCount) {
        const exists = await db.query(`SELECT id FROM servers WHERE invite_code=$1`, [
          command.inviteCode,
        ]);
        if (!exists.rowCount)
          throw new HttpError(404, "Invite not found. Check the code and try again.");
      }
      break;
    }
    case "dm": {
      if (userId === command.userId) throw new HttpError(400, "Choose another member");
      const key = JSON.stringify([userId, command.userId].sort());
      const result = await db.query(
        `WITH permitted AS (SELECT 1 FROM memberships a JOIN memberships b ON a.server_id=b.server_id WHERE a.user_id=$1 AND b.user_id=$2 LIMIT 1), room AS (INSERT INTO rooms(id,name,topic,kind,dm_key) SELECT $3,'Direct message','Just between you two','dm',$4 FROM permitted ON CONFLICT(dm_key) DO UPDATE SET dm_key=EXCLUDED.dm_key RETURNING id) INSERT INTO participants(room_id,user_id) SELECT room.id,actor FROM room CROSS JOIN unnest(ARRAY[$1::text,$2::text]) actor ON CONFLICT DO NOTHING RETURNING room_id`,
        [userId, command.userId, randomUUID(), key],
      );
      if (!result.rowCount) {
        const existing = await db.query(
          `SELECT r.id FROM rooms r JOIN participants p ON p.room_id=r.id WHERE r.dm_key=$1 AND p.user_id=$2`,
          [key, userId],
        );
        if (!existing.rowCount)
          throw new HttpError(403, "You must share a community to start a conversation");
      }
      break;
    }
    case "profile": {
      await db.query(`UPDATE "user" SET name=$2,bio=$3,status=$4,"updatedAt"=now() WHERE id=$1`, [
        userId,
        command.name,
        command.bio,
        command.status,
      ]);
      break;
    }
    default: {
      const exhaustive: never = command;
      return exhaustive;
    }
  }
}

export async function voiceAdmission(userId: string, roomId: string) {
  const result = await database().query(
    `SELECT r.id FROM rooms r WHERE r.id=$2 AND r.kind='voice' AND ${access}`,
    [userId, roomId],
  );
  if (!result.rowCount) throw new HttpError(403, "You cannot join this voice channel");
  await limitCommands(userId);
}
