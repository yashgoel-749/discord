import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { usernameSchema } from "../src/lib/model";

test("username migration backfills valid unique names and is rerunnable", async () => {
  const db = await PGlite.create();
  try {
    await db.exec(await readFile("db/001_initial.sql", "utf8"));
    await db.exec(
      `INSERT INTO "user"(id,name,email) VALUES ('a','Mia Chen','a@example.com'),('b','Mia Chen','b@example.com'),('c','Admin','c@example.com'),('d','💖','d@example.com'),('e','a...b___','e@example.com')`,
    );
    const migration = await readFile("db/002_usernames_friends.sql", "utf8");
    await db.exec(migration);
    const first = await db.query<{ username: string }>('SELECT username FROM "user" ORDER BY id');
    for (const row of first.rows) usernameSchema.parse(row.username);
    assert.equal(new Set(first.rows.map((row) => row.username)).size, 5);
    assert.deepEqual(
      first.rows.slice(0, 2).map((row) => row.username),
      ["mia_chen", "mia_chen1"],
    );
    await db.exec(migration);
    assert.deepEqual((await db.query('SELECT username FROM "user" ORDER BY id')).rows, first.rows);
    await assert.rejects(
      db.exec(
        `INSERT INTO "user"(id,name,email,username) VALUES ('f','Other','f@example.com','MIA_CHEN')`,
      ),
      /duplicate key/,
    );
  } finally {
    await db.close();
  }
});

test("presence migration is additive, rerunnable, and cascades revoked sessions", async () => {
  const db = await PGlite.create();
  try {
    await db.exec(await readFile("db/001_initial.sql", "utf8"));
    await db.exec(await readFile("db/002_usernames_friends.sql", "utf8"));
    await db.exec(
      `INSERT INTO "user"(id,name,email,username,status) VALUES('a','Alice','a@example.com','alice','dnd'); INSERT INTO session(id,"userId",token,"expiresAt","createdAt","updatedAt") VALUES('s','a','token',now()+interval '1 day',now(),now()); INSERT INTO command_limits(user_id,window_start,count) VALUES('a',now(),7);`,
    );
    const migration = await readFile("db/003_presence.sql", "utf8");
    await db.exec(migration);
    await db.exec(
      `INSERT INTO user_presence(session_id,tab_id,user_id,expires_at) VALUES('s','00000000-0000-4000-8000-000000000001','a',now()+interval '2 minutes')`,
    );
    await db.exec(migration);
    assert.deepEqual((await db.query(`SELECT status FROM "user" WHERE id='a'`)).rows, [
      { status: "dnd" },
    ]);
    assert.deepEqual((await db.query("SELECT count,presence_count FROM command_limits")).rows, [
      { count: 7, presence_count: 0 },
    ]);
    assert.equal((await db.query("SELECT * FROM user_presence")).rows.length, 1);
    await db.exec("DELETE FROM session WHERE id='s'");
    assert.equal((await db.query("SELECT * FROM user_presence")).rows.length, 0);
  } finally {
    await db.close();
  }
});
