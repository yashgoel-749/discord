import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import nextEnv from "@next/env";
import pg from "pg";

nextEnv.loadEnvConfig(process.cwd());
if (!process.env.DATABASE_URL)
  throw new Error("Set DATABASE_URL in .env.local before running db:migrate");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  for (const file of ["001_initial.sql", "002_usernames_friends.sql", "003_presence.sql"])
    await pool.query(await readFile(resolve("db", file), "utf8"));
  process.stdout.write("Relay database schema is ready.\n");
} finally {
  await pool.end();
}
