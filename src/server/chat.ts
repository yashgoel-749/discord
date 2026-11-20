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
  usernameChangeAllowedAt,
  friendshipSchema,
  friendPrivacySchema,
} from "@/lib/model";
import { transitionFriendship, FriendshipError } from "@/lib/friendships";
import { database } from "./db";
import { HttpError } from "./http";
import { livePresence } from "./presence";

const messagePermission = (peer: string) =>
  `(NOT EXISTS (SELECT 1 FROM friendships f WHERE f.status='blocked' AND ((f.requester_id=$1 AND f.addressee_id=${peer}) OR (f.addressee_id=$1 AND f.requester_id=${peer}))) AND (EXISTS (SELECT 1 FROM friendships f WHERE f.status='accepted' AND ((f.requester_id=$1 AND f.addressee_id=${peer}) OR (f.addressee_id=$1 AND f.requester_id=${peer}))) OR EXISTS (SELECT 1 FROM memberships a JOIN memberships b ON a.server_id=b.server_id WHERE a.user_id=$1 AND b.user_id=${peer})))`;
const access = `((EXISTS (SELECT 1 FROM memberships mm WHERE mm.server_id=r.server_id AND mm.user_id=$1) OR EXISTS (SELECT 1 FROM participants pp WHERE pp.room_id=r.id AND pp.user_id=$1)) AND (r.kind<>'dm' OR EXISTS (SELECT 1 FROM participants peer WHERE peer.room_id=r.id AND peer.user_id<>$1 AND ${messagePermission("peer.user_id")})))`;
const userColumns = `u.id, u.name, u.username, u.color, u.status, u.bio`;
const publicUserColumns = `u.id, u.name, u.username, u.color, CASE WHEN ${livePresence} THEN u.status ELSE 'offline' END AS status, u.bio`;

export async function usernameAvailable(username: string, userId?: string) {
  const result = await database().query(
    `SELECT id FROM "user" WHERE lower(username)=$1 AND ($2::text IS NULL OR id<>$2)`,
    [username, userId ?? null],
  );
  return result.rowCount === 0;
}

export async function snapshot(userId: string): Promise<AppState> {
  const db = database();
  const [meResult, usersResult, serversResult, roomsResult, messagesResult, relationshipsResult] =
    await Promise.all([
      db.query(
        `SELECT ${userColumns},u.email,u.username_changed_at AS "usernameChangedAt",u.friend_request_privacy AS "friendRequestPrivacy" FROM "user" u WHERE u.id=$1`,
        [userId],
      ),
      db.query(
        `SELECT DISTINCT ${publicUserColumns} FROM "user" u WHERE u.id=$1 OR EXISTS (SELECT 1 FROM memberships a JOIN memberships b ON a.server_id=b.server_id WHERE a.user_id=$1 AND b.user_id=u.id) OR EXISTS (SELECT 1 FROM participants a JOIN participants b ON a.room_id=b.room_id WHERE a.user_id=$1 AND b.user_id=u.id) OR EXISTS (SELECT 1 FROM friendships f WHERE (f.requester_id=$1 AND f.addressee_id=u.id) OR (f.addressee_id=$1 AND f.requester_id=u.id))`,
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
        `SELECT m.id,m.room_id AS "roomId",m.author_id AS "authorId",m.content,m.created_at AS "createdAt",m.edited,COALESCE((SELECT json_agg(x) FROM (SELECT emoji,json_agg(user_id) AS "userIds" FROM reactions WHERE message_id=m.id GROUP BY emoji) x),'[]'::json) AS reactions FROM messages m JOIN rooms r ON r.id=m.room_id WHERE ${access} AND NOT EXISTS (SELECT 1 FROM friendships f WHERE f.status='blocked' AND $1=ANY(f.blocked_by) AND ((f.requester_id=$1 AND f.addressee_id=m.author_id) OR (f.addressee_id=$1 AND f.requester_id=m.author_id))) ORDER BY m.created_at DESC,m.id DESC LIMIT 300`,
        [userId],
      ),
      db.query(
        `SELECT id,requester_id AS "requesterId",addressee_id AS "addresseeId",status,blocked_by AS "blockedBy",created_at AS "createdAt" FROM friendships WHERE requester_id=$1 OR addressee_id=$1 ORDER BY created_at DESC,id`,
        [userId],
      ),
    ]);
  const meRow = meResult.rows[0];
  const me = stateSchema.shape.me.parse({
    ...meRow,
    usernameChangedAt:
      meRow.usernameChangedAt instanceof Date
        ? meRow.usernameChangedAt.toISOString()
        : meRow.usernameChangedAt,
  });
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
  const relationships = z
    .array(friendshipSchema.extend({ id: z.string(), createdAt: z.string() }))
    .parse(
      relationshipsResult.rows.map((row) => ({
        ...row,
        createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
      })),
    );
  const list = (predicate: (row: (typeof relationships)[number]) => boolean) =>
    relationships.filter(predicate).map((row) => ({
      id: row.id,
      userId: row.requesterId === userId ? row.addresseeId : row.requesterId,
      createdAt: row.createdAt,
    }));
  return stateSchema.parse({
    me,
    users,
    servers: z.array(serverSchema).parse(serversResult.rows),
    rooms,
    messages,
    friends: list((row) => row.status === "accepted"),
    incoming: list((row) => row.status === "pending" && row.addresseeId === userId),
    outgoing: list((row) => row.status === "pending" && row.requesterId === userId),
    blocked: list((row) => row.status === "blocked" && row.blockedBy.includes(userId)),
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
    case "friendRequest":
    case "friendAccept":
    case "friendDecline":
    case "friendCancel":
    case "friendRemove":
    case "block":
    case "unblock": {
      let peerId: string;
      if (command.type === "friendRequest") {
        const rate = await db.query(
          `UPDATE command_limits SET friend_count=CASE WHEN friend_window_start<now()-interval '1 hour' THEN 1 ELSE friend_count+1 END,friend_window_start=CASE WHEN friend_window_start<now()-interval '1 hour' THEN now() ELSE friend_window_start END WHERE user_id=$1 RETURNING friend_count`,
          [userId],
        );
        if (z.object({ friend_count: z.number() }).parse(rate.rows[0]).friend_count > 20)
          throw new HttpError(
            429,
            "You can send up to 20 friend requests per hour. Try again later.",
          );
        const found = await db.query(`SELECT id FROM "user" WHERE lower(username)=$1`, [
          command.username,
        ]);
        if (!found.rowCount) throw new HttpError(404, "No one with that username");
        peerId = z.object({ id: z.string() }).parse(found.rows[0]).id;
      } else peerId = command.userId;
      if (peerId === userId) throw new HttpError(400, "You cannot add or block yourself");
      const client = await db.connect();
      try {
        await client.query("BEGIN");
        const people = await client.query(
          `SELECT id,friend_request_privacy FROM "user" WHERE id=ANY($1::text[]) ORDER BY id FOR UPDATE`,
          [[userId, peerId]],
        );
        if (people.rowCount !== 2) throw new HttpError(404, "This person is no longer available");
        const pair = await client.query(
          `SELECT id,requester_id AS "requesterId",addressee_id AS "addresseeId",status,blocked_by AS "blockedBy" FROM friendships WHERE least(requester_id,addressee_id)=least($1::text,$2::text) AND greatest(requester_id,addressee_id)=greatest($1::text,$2::text) FOR UPDATE`,
          [userId, peerId],
        );
        const current = pair.rowCount ? friendshipSchema.parse(pair.rows[0]) : null;
        const next = transitionFriendship({
          actorId: userId,
          peerId,
          current,
          action: command.type,
        });
        if (command.type === "friendRequest" && !current) {
          const peer = z
            .array(z.object({ id: z.string(), friend_request_privacy: friendPrivacySchema }))
            .parse(people.rows)
            .find((person) => person.id === peerId);
          if (!peer || peer.friend_request_privacy === "no_one")
            throw new HttpError(403, "This person is not accepting friend requests");
          if (peer.friend_request_privacy === "communities") {
            const shared = await client.query(
              `SELECT 1 FROM memberships a JOIN memberships b ON a.server_id=b.server_id WHERE a.user_id=$1 AND b.user_id=$2 LIMIT 1`,
              [userId, peerId],
            );
            if (!shared.rowCount)
              throw new HttpError(
                403,
                "This person only accepts requests from members of their communities",
              );
          }
        }
        if (next) {
          if (pair.rowCount)
            await client.query(
              `UPDATE friendships SET status=$2,blocked_by=$3,updated_at=now() WHERE id=$1`,
              [pair.rows[0].id, next.status, next.blockedBy],
            );
          else
            await client.query(
              `INSERT INTO friendships(id,requester_id,addressee_id,status,blocked_by) VALUES($1,$2,$3,$4,$5)`,
              [randomUUID(), next.requesterId, next.addresseeId, next.status, next.blockedBy],
            );
        } else if (pair.rowCount)
          await client.query(`DELETE FROM friendships WHERE id=$1`, [pair.rows[0].id]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        if (error instanceof FriendshipError) throw new HttpError(400, error.message);
        throw error;
      } finally {
        client.release();
      }
      break;
    }
    case "send": {
      const client = await db.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `SELECT u.id FROM "user" u JOIN participants p ON p.user_id=u.id WHERE p.room_id=$1 ORDER BY u.id FOR UPDATE OF u`,
          [command.roomId],
        );
        const result = await client.query(
          `INSERT INTO messages(id,room_id,author_id,content) SELECT $2,r.id,$1,$3 FROM rooms r WHERE r.id=$4 AND r.kind IN ('text','dm') AND ${access} RETURNING id`,
          [userId, randomUUID(), command.content, command.roomId],
        );
        if (!result.rowCount) throw new HttpError(403, "You cannot send messages in this channel");
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
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
      const client = await db.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `SELECT id FROM "user" WHERE id=ANY($1::text[]) ORDER BY id FOR UPDATE`,
          [[userId, command.userId]],
        );
        const allowed = await client.query(`SELECT 1 WHERE ${messagePermission("$2::text")}`, [
          userId,
          command.userId,
        ]);
        if (!allowed.rowCount)
          throw new HttpError(
            403,
            "You must be friends or share a community, and neither person can have blocked the other",
          );
        const roomResult = await client.query(
          `INSERT INTO rooms(id,name,topic,kind,dm_key) VALUES($1,'Direct message','Just between you two','dm',$2) ON CONFLICT(dm_key) DO UPDATE SET dm_key=EXCLUDED.dm_key RETURNING id`,
          [randomUUID(), key],
        );
        const roomId = z.object({ id: z.string() }).parse(roomResult.rows[0]).id;
        await client.query(
          `INSERT INTO participants(room_id,user_id) SELECT $1,actor FROM unnest($2::text[]) actor ON CONFLICT DO NOTHING`,
          [roomId, [userId, command.userId]],
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
    case "profile": {
      const client = await db.connect();
      try {
        await client.query("BEGIN");
        const result = await client.query(
          `SELECT username,username_changed_at FROM "user" WHERE id=$1 FOR UPDATE`,
          [userId],
        );
        const row = result.rows[0];
        const changedAt =
          row.username_changed_at instanceof Date
            ? row.username_changed_at.toISOString()
            : row.username_changed_at;
        const allowedAt = usernameChangeAllowedAt(changedAt);
        if (
          command.username &&
          command.username !== row.username &&
          allowedAt &&
          Date.now() < new Date(allowedAt).getTime()
        )
          throw new HttpError(
            429,
            `You can change your username again on ${new Date(allowedAt).toLocaleDateString("en-US")}`,
          );
        await client.query(
          `UPDATE "user" SET name=$2,bio=$3,status=$4,"updatedAt"=now(),username=COALESCE($5,username),username_changed_at=CASE WHEN $5::text IS NOT NULL AND $5<>username THEN now() ELSE username_changed_at END,friend_request_privacy=COALESCE($6,friend_request_privacy) WHERE id=$1`,
          [
            userId,
            command.name,
            command.bio,
            command.status,
            command.username ?? null,
            command.friendRequestPrivacy ?? null,
          ],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "23505"
        )
          throw new HttpError(409, "That username is already taken");
        throw error;
      } finally {
        client.release();
      }
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
    `SELECT u.name FROM rooms r JOIN "user" u ON u.id=$1 WHERE r.id=$2 AND r.kind='voice' AND ${access}`,
    [userId, roomId],
  );
  if (!result.rowCount) throw new HttpError(403, "You cannot join this voice channel");
  await limitCommands(userId);
  return z.object({ name: userSchema.shape.name }).parse(result.rows[0]).name;
}
