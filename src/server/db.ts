import "server-only";
import pg from "pg";
import { z } from "zod";

declare global {
  var relayPool: pg.Pool | undefined;
}

export function database() {
  if (!process.env.DATABASE_URL) throw new Error("Neon DATABASE_URL is not configured");
  globalThis.relayPool ??= new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: z.coerce
      .number()
      .int()
      .min(1)
      .max(20)
      .parse(process.env.DATABASE_POOL_SIZE ?? 5),
    connectionTimeoutMillis: 30000,
    idleTimeoutMillis: 20000,
  });
  return globalThis.relayPool;
}
