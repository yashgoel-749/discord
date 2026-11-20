import "server-only";
import { presenceLeaseSeconds, type PresenceCommand } from "@/lib/presence";
import { database } from "./db";
import { HttpError, type actorSession } from "./http";

export const livePresence = `EXISTS (SELECT 1 FROM user_presence p JOIN session s ON s.id=p.session_id WHERE p.user_id=u.id AND s."userId"=u.id AND NOT p.closed AND p.expires_at>now() AND s."expiresAt">now())`;

export async function recordPresence(
  actor: Awaited<ReturnType<typeof actorSession>>,
  command: PresenceCommand,
) {
  const client = await database().connect();
  const { userId, sessionId } = actor;
  try {
    await client.query("BEGIN");
    await client.query(`SELECT id FROM "user" WHERE id=$1 FOR UPDATE`, [userId]);
    const session = await client.query(
      `SELECT id FROM session WHERE id=$1 AND "userId"=$2 AND "expiresAt">now() FOR SHARE`,
      [sessionId, userId],
    );
    if (!session.rowCount) throw new HttpError(401, "Please sign in to continue");
    const limit = await client.query(
      `INSERT INTO command_limits(user_id,window_start,count,presence_window_start,presence_count) VALUES($1,now(),0,now(),1) ON CONFLICT(user_id) DO UPDATE SET presence_count=CASE WHEN command_limits.presence_window_start<now()-interval '1 minute' THEN 1 ELSE command_limits.presence_count+1 END,presence_window_start=CASE WHEN command_limits.presence_window_start<now()-interval '1 minute' THEN now() ELSE command_limits.presence_window_start END RETURNING presence_count`,
      [userId],
    );
    if (limit.rows[0].presence_count > 180)
      throw new HttpError(429, "Too many presence updates. Please try again shortly.");

    if (command.type === "heartbeat") {
      await client.query(
        `UPDATE user_presence SET expires_at=now()+make_interval(secs=>$4) WHERE session_id=$1 AND tab_id=$2 AND user_id=$3 AND NOT closed`,
        [sessionId, command.tabId, userId, presenceLeaseSeconds],
      );
    } else {
      const live = await client.query(
        `SELECT ${livePresence} AS live FROM "user" u WHERE u.id=$1`,
        [userId],
      );
      const inserted = await client.query(
        `INSERT INTO user_presence(session_id,tab_id,user_id,expires_at,closed) VALUES($1,$2,$3,now()+make_interval(secs=>$4),$5) ON CONFLICT(session_id,tab_id) ${command.type === "close" ? "DO UPDATE SET closed=true,expires_at=now()" : "DO NOTHING"} RETURNING tab_id`,
        [
          sessionId,
          command.tabId,
          userId,
          command.type === "close" ? 0 : presenceLeaseSeconds,
          command.type === "close",
        ],
      );
      if (command.type === "open" && inserted.rowCount && !live.rows[0].live)
        await client.query(`UPDATE "user" SET status='online',"updatedAt"=now() WHERE id=$1`, [
          userId,
        ]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
