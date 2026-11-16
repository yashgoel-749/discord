import test from "node:test";
import assert from "node:assert/strict";
import { createDemo, applyDemoCommand } from "../src/lib/demo";
import { commandSchema, stateSchema, authSchema } from "../src/lib/model";

test("demo starts with validated communities, private conversations, and text history", () => {
  const state = stateSchema.parse(createDemo());
  assert.equal(state.me.name, "Alex Morgan");
  assert.equal(state.servers.length, 3);
  assert.equal(state.rooms.find((r) => r.id === "dm-mia")?.kind, "dm");
  assert.ok(state.messages.some((m) => m.roomId === "general"));
  assert.ok(!("email" in state.users[1]));
});

test("messages are trimmed, attributed to the current user, editable and deletable", () => {
  const initial = createDemo();
  const sent = applyDemoCommand(initial, {
    type: "send",
    roomId: "general",
    content: "  Hello Relay!  ",
  });
  const message = sent.messages.at(-1);
  assert.ok(message);
  assert.equal(message.content, "Hello Relay!");
  assert.equal(message.authorId, initial.me.id);
  assert.equal(initial.messages.length + 1, sent.messages.length);
  assert.ok(!initial.messages.some((m) => m.id === message.id));
  const edited = applyDemoCommand(sent, {
    type: "edit",
    messageId: message.id,
    content: "Hello again",
  });
  assert.equal(edited.messages.at(-1)?.content, "Hello again");
  assert.equal(edited.messages.at(-1)?.edited, true);
  const deleted = applyDemoCommand(edited, { type: "delete", messageId: message.id });
  assert.ok(!deleted.messages.some((m) => m.id === message.id));
});

test("another member's message cannot be edited or deleted", () => {
  assert.throws(() =>
    applyDemoCommand(createDemo(), { type: "edit", messageId: "m1", content: "tampered" }),
  );
  assert.throws(() => applyDemoCommand(createDemo(), { type: "delete", messageId: "m1" }));
});

test("reactions toggle without duplicate participants", () => {
  const state = createDemo();
  const reacted = applyDemoCommand(state, { type: "react", messageId: "m2", emoji: "🚀" });
  assert.deepEqual(reacted.messages.find((m) => m.id === "m2")?.reactions, [
    { emoji: "🚀", userIds: ["you"] },
  ]);
  const removed = applyDemoCommand(reacted, { type: "react", messageId: "m2", emoji: "🚀" });
  assert.deepEqual(removed.messages.find((m) => m.id === "m2")?.reactions, []);
});

test("creating a community grants ownership and a general text channel", () => {
  const next = applyDemoCommand(createDemo(), {
    type: "createServer",
    name: "Friends",
    description: "Our place",
  });
  const server = next.servers.find((s) => s.name === "Friends");
  assert.ok(server);
  assert.equal(server.ownerId, next.me.id);
  assert.deepEqual(server.memberIds, [next.me.id]);
  const channel = next.rooms.find((r) => r.serverId === server.id);
  assert.equal(channel?.name, "general");
  const withVoice = applyDemoCommand(next, {
    type: "createRoom",
    serverId: server.id,
    name: "lounge",
    kind: "voice",
  });
  assert.ok(withVoice.rooms.some((r) => r.serverId === server.id && r.kind === "voice"));
});

test("DM creation reuses an existing two-person conversation", () => {
  const once = applyDemoCommand(createDemo(), { type: "dm", userId: "james" });
  const twice = applyDemoCommand(once, { type: "dm", userId: "james" });
  const rooms = twice.rooms.filter((r) => r.kind === "dm" && r.participantIds.includes("james"));
  assert.equal(rooms.length, 1);
  assert.deepEqual(rooms[0].participantIds, ["you", "james"]);
  assert.throws(() => applyDemoCommand(once, { type: "dm", userId: "you" }));
});

test("profile updates remain consistent with author rendering", () => {
  const state = applyDemoCommand(createDemo(), {
    type: "profile",
    name: "Alex New",
    bio: "Hello world",
    status: "dnd",
  });
  assert.equal(state.me.name, "Alex New");
  assert.equal(state.users.find((u) => u.id === state.me.id)?.status, "dnd");
});

test("invalid, empty, oversized, and voice messages are rejected", () => {
  assert.equal(
    commandSchema.safeParse({ type: "send", roomId: "general", content: "   " }).success,
    false,
  );
  assert.equal(
    commandSchema.safeParse({ type: "send", roomId: "general", content: "x".repeat(4001) }).success,
    false,
  );
  assert.equal(
    commandSchema.safeParse({
      type: "createRoom",
      serverId: "studio",
      name: "Invalid Channel",
      kind: "text",
    }).success,
    false,
  );
  assert.throws(() =>
    applyDemoCommand(createDemo(), { type: "send", roomId: "lounge", content: "Hi" }),
  );
  assert.throws(() =>
    applyDemoCommand(createDemo(), { type: "send", roomId: "missing", content: "Hi" }),
  );
});

test("account boundary validates email, display name, and password strength", () => {
  assert.equal(
    authSchema.safeParse({
      action: "register",
      email: "test@example.com",
      password: "long-password",
      name: "",
    }).success,
    false,
  );
  assert.equal(
    authSchema.safeParse({ action: "login", email: "invalid", password: "long-password" }).success,
    false,
  );
  assert.equal(
    authSchema.safeParse({ action: "login", email: "test@example.com", password: "short" }).success,
    false,
  );
  assert.equal(
    authSchema.parse({
      action: "register",
      email: "TEST@example.com",
      password: "long-password",
      name: "Tester",
    }).email,
    "test@example.com",
  );
});
