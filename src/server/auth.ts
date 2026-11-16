import "server-only";
import { betterAuth } from "better-auth";
import { database } from "./db";

function makeAuth() {
  if (!process.env.BETTER_AUTH_SECRET || process.env.BETTER_AUTH_SECRET.length < 32)
    throw new Error("Set BETTER_AUTH_SECRET to at least 32 random characters");
  if (!process.env.APP_URL) throw new Error("Set APP_URL to the app's public origin");
  return betterAuth({
    database: database(),
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.APP_URL,
    trustedOrigins: [process.env.APP_URL],
    emailAndPassword: { enabled: true, minPasswordLength: 10, maxPasswordLength: 128 },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 30,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 60, max: 3 },
      },
    },
    user: {
      additionalFields: {
        color: { type: "string", defaultValue: "#a78bfa", input: false },
        status: { type: "string", defaultValue: "online", input: false },
        bio: { type: "string", defaultValue: "", input: false },
      },
    },
    session: { expiresIn: 60 * 60 * 24 * 7 },
  });
}

let instance: ReturnType<typeof makeAuth> | undefined;
export function auth() {
  instance ??= makeAuth();
  return instance;
}
