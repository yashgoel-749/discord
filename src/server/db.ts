import "server-only";
import pg from "pg";

declare global {
  var relayPool: pg.Pool | undefined;
}

export function database() {
  if (!process.env.DATABASE_URL) throw new Error("Neon DATABASE_URL is not configured");
  globalThis.relayPool ??= new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    connectionTimeoutMillis: 30000,
    idleTimeoutMillis: 20000,
  });
  return globalThis.relayPool;
}
