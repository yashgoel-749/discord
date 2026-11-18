import test from "node:test";
import assert from "node:assert/strict";
import { usernameSchema, usernameChangeAllowedAt, authSchema } from "../src/lib/model";

test("usernames normalize case and validate every public naming rule", () => {
  for (const name of ["abc", "alex.morgan", "alex_12", "a".repeat(20)])
    assert.equal(usernameSchema.parse(name), name);
  assert.equal(usernameSchema.parse("  Alex.Morgan  "), "alex.morgan");
  for (const name of [
    "ab",
    "a".repeat(21),
    ".abc",
    "abc.",
    "_abc",
    "abc_",
    "a..b",
    "a b",
    "a-b",
    "éabc",
    "admin",
    "relay",
    "support",
    "system",
    "everyone",
    "here",
  ])
    assert.equal(usernameSchema.safeParse(name).success, false, name);
});
test("signup requires username, login does not", () => {
  const input = { email: "a@example.com", password: "long-password", name: "Alice" };
  assert.equal(authSchema.safeParse({ ...input, action: "register" }).success, false);
  assert.equal(
    authSchema.safeParse({ ...input, action: "register", username: "alice" }).success,
    true,
  );
  assert.equal(authSchema.safeParse({ ...input, action: "login" }).success, true);
});
test("username cooldown is fourteen days and absent for backfilled accounts", () => {
  assert.equal(usernameChangeAllowedAt(null), null);
  assert.equal(usernameChangeAllowedAt("2026-11-01T12:00:00.000Z"), "2026-11-15T12:00:00.000Z");
});
