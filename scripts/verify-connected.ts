import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { stateSchema, type AppState, type Command } from "../src/lib/model";
import { voicePresenceSchema } from "../src/lib/voice-presence";

const origin = "http://localhost:3100";
const db = await PGlite.create();
await db.exec(await readFile(resolve("db/001_initial.sql"), "utf8"));
await db.exec(await readFile(resolve("db/001_initial.sql"), "utf8"));
const socket = new PGLiteSocketServer({ db, host: "127.0.0.1", port: 54329, maxConnections: 10 });
await socket.start();
const server = spawn(
  process.execPath,
  [resolve("node_modules/next/dist/bin/next"), "start", "--port", "3100"],
  {
    env: {
      ...process.env,
      DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54329/postgres",
      APP_URL: origin,
      BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
      LIVEKIT_URL: "",
      LIVEKIT_API_KEY: "",
      LIVEKIT_API_SECRET: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let logs = "";
server.stdout.on("data", (data) => {
  logs += String(data);
});
server.stderr.on("data", (data) => {
  logs += String(data);
});

async function ready() {
  await new Promise<void>((resolveReady, reject) => {
    const timer = setTimeout(() => reject(new Error(`Next server did not start\n${logs}`)), 30000);
    const onData = (data: Buffer) => {
      if (data.toString().includes("Ready in")) {
        clearTimeout(timer);
        resolveReady();
      }
    };
    server.stdout.on("data", onData);
    server.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    server.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Next exited with ${code}\n${logs}`));
    });
  });
}

async function api(path: string, cookie = "", data?: unknown, requestOrigin = origin) {
  return fetch(`${origin}${path}`, {
    method: data === undefined ? "GET" : "POST",
    headers: {
      Cookie: cookie,
      ...(data === undefined ? {} : { "Content-Type": "application/json", Origin: requestOrigin }),
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    signal: AbortSignal.timeout(20000),
  });
}
async function expectState(response: Response): Promise<AppState> {
  const data: unknown = await response.json();
  assert.equal(response.status, 200, JSON.stringify(data));
  return stateSchema.parse(data);
}
async function register(name: string, email: string) {
  const response = await api("/api/auth/sign-up/email", "", {
    name,
    email,
    password: "test-password-123!",
  });
  const text = await response.text();
  assert.equal(response.status, 200, text);
  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  assert.ok(cookie.includes("session_token"), "Registration must create a session cookie");
  const state = await expectState(await api("/api/relay", cookie));
  assert.equal(state.me.email, email);
  return { cookie, id: state.me.id };
}
async function command(cookie: string, input: Command) {
  return expectState(await api("/api/relay", cookie, input));
}

try {
  await ready();
  assert.equal((await api("/api/relay")).status, 401);
  assert.equal((await api("/api/voice?serverId=missing")).status, 401);
  assert.equal(
    (await api("/api/auth/sign-up/email", "", { padding: "x".repeat(21000) })).status,
    413,
  );
  const alice = await register("Alice Builder", "alice@example.com");
  const bob = await register("Bob Builder", "bob@example.com");
  const outsider = await register("Outside User", "outsider@example.com");
  let state = await command(alice.cookie, {
    type: "createServer",
    name: "Connected Builders",
    description: "A real database-backed test",
  });
  const community = state.servers.find((s) => s.name === "Connected Builders");
  assert.ok(community);
  const room = state.rooms.find((r) => r.serverId === community.id && r.kind === "text");
  assert.ok(room);
  assert.deepEqual(community.memberIds, [alice.id]);
  assert.equal(
    (
      await api("/api/relay", outsider.cookie, {
        type: "send",
        roomId: room.id,
        content: "unauthorized",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await api("/api/relay", bob.cookie, {
        type: "createRoom",
        serverId: community.id,
        name: "blocked",
        kind: "text",
      })
    ).status,
    403,
  );
  assert.equal((await api("/api/relay", bob.cookie, { type: "dm", userId: alice.id })).status, 403);
  assert.equal(
    (
      await api(
        "/api/relay",
        alice.cookie,
        { type: "profile", name: "Alice", bio: "", status: "online" },
        "https://untrusted.example",
      )
    ).status,
    403,
  );
  assert.equal(
    (await api("/api/relay", alice.cookie, { type: "send", roomId: room.id, content: " " })).status,
    400,
  );
  assert.equal((await api("/api/relay", alice.cookie, { padding: "x".repeat(21000) })).status, 413);

  state = await command(bob.cookie, { type: "join", inviteCode: community.inviteCode });
  assert.ok(state.servers.some((s) => s.id === community.id));
  state = await command(bob.cookie, {
    type: "send",
    roomId: room.id,
    content: "Hello from another account",
  });
  const message = state.messages.find((m) => m.content === "Hello from another account");
  assert.ok(message);
  assert.equal(message.authorId, bob.id);
  state = await expectState(await api("/api/relay", alice.cookie));
  assert.ok(state.messages.some((m) => m.id === message.id));
  assert.ok(state.users.every((user) => !("email" in user)));
  assert.equal(
    (
      await api("/api/relay", alice.cookie, {
        type: "edit",
        messageId: message.id,
        content: "tampered",
      })
    ).status,
    403,
  );
  assert.equal(
    (await api("/api/relay", alice.cookie, { type: "delete", messageId: message.id })).status,
    403,
  );
  state = await command(bob.cookie, {
    type: "edit",
    messageId: message.id,
    content: "An edited shared message",
  });
  assert.equal(state.messages.find((m) => m.id === message.id)?.edited, true);
  state = await command(alice.cookie, { type: "react", messageId: message.id, emoji: "🚀" });
  assert.deepEqual(state.messages.find((m) => m.id === message.id)?.reactions, [
    { emoji: "🚀", userIds: [alice.id] },
  ]);
  state = await command(alice.cookie, { type: "react", messageId: message.id, emoji: "🚀" });
  assert.deepEqual(state.messages.find((m) => m.id === message.id)?.reactions, []);

  state = await command(alice.cookie, { type: "dm", userId: bob.id });
  const dm = state.rooms.find((r) => r.kind === "dm" && r.participantIds.includes(bob.id));
  assert.ok(dm);
  state = await command(alice.cookie, { type: "dm", userId: bob.id });
  assert.equal(
    state.rooms.filter((r) => r.kind === "dm" && r.participantIds.includes(bob.id)).length,
    1,
  );
  await command(alice.cookie, { type: "send", roomId: dm.id, content: "A private hello" });
  const bobState = await expectState(await api("/api/relay", bob.cookie));
  assert.ok(bobState.messages.some((m) => m.roomId === dm.id && m.content === "A private hello"));
  const outsiderState = await expectState(await api("/api/relay", outsider.cookie));
  assert.equal(outsiderState.rooms.length, 0);
  assert.equal(outsiderState.messages.length, 0);
  assert.equal(
    (
      await api("/api/relay", outsider.cookie, {
        type: "send",
        roomId: dm.id,
        content: "intrusion",
      })
    ).status,
    403,
  );

  state = await command(alice.cookie, {
    type: "createRoom",
    serverId: community.id,
    name: "voice-lounge",
    kind: "voice",
  });
  const voice = state.rooms.find((r) => r.name === "voice-lounge");
  assert.ok(voice);
  assert.equal((await api(`/api/voice?serverId=${community.id}`, outsider.cookie)).status, 403);
  const presenceResponse = await api(`/api/voice?serverId=${community.id}`, bob.cookie);
  assert.equal(presenceResponse.status, 200);
  const presence = voicePresenceSchema.parse(await presenceResponse.json());
  assert.deepEqual(presence.channels, { [voice.id]: { phase: "unavailable" } });
  assert.equal(presenceResponse.headers.get("cache-control"), "private, no-store");
  assert.equal((await api("/api/voice", outsider.cookie, { roomId: voice.id })).status, 403);
  assert.equal((await api("/api/voice", bob.cookie, { roomId: voice.id })).status, 503);
  state = await command(bob.cookie, {
    type: "profile",
    name: "Bobby",
    bio: "Building together",
    status: "idle",
  });
  assert.equal(state.me.name, "Bobby");
  state = await command(bob.cookie, { type: "delete", messageId: message.id });
  assert.ok(!state.messages.some((m) => m.id === message.id));
  assert.equal((await api("/api/auth/sign-out", bob.cookie, {})).status, 200);
  assert.equal((await api("/api/relay", bob.cookie)).status, 401);
  const login = await api("/api/auth/sign-in/email", "", {
    email: "bob@example.com",
    password: "test-password-123!",
  });
  assert.equal(login.status, 200, await login.text());
  const loginCookie = login.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  assert.equal((await expectState(await api("/api/relay", loginCookie))).me.name, "Bobby");
  process.stdout.write(
    "Connected checks passed: migration rerun, real registration/login/logout, sessions, membership, invites, shared messages, edit/delete permissions, reactions, DM privacy, profile changes, body/origin checks, and voice authorization.\n",
  );
} catch (error) {
  process.stderr.write(`Connected check failed. Server diagnostics:\n${logs}\n`);
  throw error;
} finally {
  if (server.exitCode === null && !server.killed) {
    const stopped = once(server, "exit");
    server.kill();
    await stopped;
  }
  await socket.stop();
  await db.close();
}
