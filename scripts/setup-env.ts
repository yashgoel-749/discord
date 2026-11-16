import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const origin = process.argv[2] ?? "http://localhost:3000";
const url = new URL(origin);
if (!["http:", "https:"].includes(url.protocol) || url.origin !== origin)
  throw new Error("Provide an HTTP or HTTPS origin without a trailing slash");

const template = await readFile(resolve(".env.example"), "utf8");
const contents = template
  .replace(/^BETTER_AUTH_SECRET=$/m, `BETTER_AUTH_SECRET=${randomBytes(32).toString("hex")}`)
  .replace(/^APP_URL=.*$/m, `APP_URL=${origin}`);

try {
  await writeFile(resolve(".env.local"), contents, { flag: "wx", mode: 0o600 });
  process.stdout.write(
    "Created .env.local with a random authentication secret. Add the rotated DATABASE_URL privately.\n",
  );
} catch (error) {
  if (error instanceof Error && "code" in error && error.code === "EEXIST")
    process.stdout.write(".env.local already exists and was left unchanged.\n");
  else throw error;
}
