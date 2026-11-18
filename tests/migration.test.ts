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
