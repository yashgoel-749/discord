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
import { chromium, expect, type Route } from "@playwright/test";
import pg from "pg";
import { prepareSocketProtocol } from "./pglite-protocol";

const origin = "http://localhost:3100";
const db = await PGlite.create();
await db.exec(await readFile(resolve("db/001_initial.sql"), "utf8"));
await db.exec(await readFile(resolve("db/001_initial.sql"), "utf8"));
await db.exec(await readFile(resolve("db/002_usernames_friends.sql"), "utf8"));
await db.exec(await readFile(resolve("db/002_usernames_friends.sql"), "utf8"));
prepareSocketProtocol(db);
const socket = new PGLiteSocketServer({ db, host: "127.0.0.1", port: 54329, maxConnections: 10 });
await socket.start();
const testDb = new pg.Pool({
  connectionString: "postgresql://postgres:postgres@127.0.0.1:54329/postgres",
  max: 1,
});
const server = spawn(
  process.execPath,
  [resolve("node_modules/next/dist/bin/next"), "start", "--port", "3100"],
  {
    env: {
      ...process.env,
      DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54329/postgres",
      DATABASE_POOL_SIZE: "1",
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
    username: name.toLowerCase().replaceAll(" ", "."),
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
  assert.equal(
    (await expectState(await api("/api/relay", alice.cookie))).me.username,
    "alice.builder",
  );
  assert.equal((await api("/api/username?username=ALICE.BUILDER", bob.cookie)).status, 200);
  assert.equal(
    (await (await api("/api/username?username=ALICE.BUILDER", bob.cookie)).json()).available,
    false,
  );
  assert.equal(
    (
      await api("/api/auth/sign-up/email", "", {
        name: "Duplicate",
        email: "duplicate@example.com",
        username: "ALICE.BUILDER",
        password: "test-password-123!",
      })
    ).status,
    409,
  );
  assert.equal(
    (await api("/api/auth/update-user", alice.cookie, { username: "bypass" })).status,
    400,
  );
  await command(alice.cookie, {
    type: "profile",
    name: "Alice Builder",
    bio: "",
    status: "online",
    username: "alice.new",
  });
  assert.equal(
    (
      await api("/api/relay", alice.cookie, {
        type: "profile",
        name: "Alice Builder",
        bio: "",
        status: "online",
        username: "alice.again",
      })
    ).status,
    429,
  );
  assert.equal(
    (
      await api("/api/relay", bob.cookie, {
        type: "profile",
        name: "Bob Builder",
        bio: "",
        status: "online",
        username: "alice.new",
      })
    ).status,
    409,
  );
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
  await testDb.query(`UPDATE command_limits SET count=0,window_start=now()`);
  assert.equal(
    (await api("/api/relay", alice.cookie, { type: "friendRequest", username: "unknown.person" }))
      .status,
    404,
  );
  assert.equal(
    (await api("/api/relay", alice.cookie, { type: "friendRequest", username: "alice.new" }))
      .status,
    400,
  );
  state = await command(alice.cookie, { type: "friendRequest", username: "@OUTSIDE.USER" });
  assert.equal(state.outgoing[0]?.userId, outsider.id);
  assert.equal(
    (await expectState(await api("/api/relay", outsider.cookie))).incoming[0]?.userId,
    alice.id,
  );
  assert.equal((await expectState(await api("/api/relay", loginCookie))).incoming.length, 0);
  assert.equal(
    (await api("/api/relay", alice.cookie, { type: "friendRequest", username: "outside.user" }))
      .status,
    400,
  );
  assert.equal(
    (await api("/api/relay", loginCookie, { type: "friendAccept", userId: alice.id })).status,
    400,
  );
  state = await command(outsider.cookie, { type: "friendAccept", userId: alice.id });
  assert.equal(state.friends[0]?.userId, alice.id);
  assert.equal(
    (await api("/api/relay", alice.cookie, { type: "friendRequest", username: "outside.user" }))
      .status,
    400,
  );
  await command(alice.cookie, { type: "friendRemove", userId: outsider.id });
  await command(alice.cookie, { type: "friendRequest", username: "outside.user" });
  assert.equal(
    (await command(outsider.cookie, { type: "friendDecline", userId: alice.id })).incoming.length,
    0,
  );
  await command(alice.cookie, { type: "friendRequest", username: "outside.user" });
  assert.equal(
    (await command(alice.cookie, { type: "friendCancel", userId: outsider.id })).outgoing.length,
    0,
  );
  await command(alice.cookie, { type: "friendRequest", username: "outside.user" });
  state = await command(outsider.cookie, { type: "friendRequest", username: "alice.new" });
  assert.equal(state.friends[0]?.userId, alice.id, "A mutual request auto-accepts");
  assert.equal(state.incoming.length + state.outgoing.length, 0);
  await command(alice.cookie, { type: "block", userId: outsider.id });
  state = await expectState(await api("/api/relay", outsider.cookie));
  assert.equal(state.friends.length, 0);
  assert.equal(state.blocked.length, 0, "Other people's block lists are private");
  assert.equal(
    (await api("/api/relay", outsider.cookie, { type: "friendRequest", username: "alice.new" }))
      .status,
    400,
  );
  await command(outsider.cookie, { type: "block", userId: alice.id });
  await command(alice.cookie, { type: "unblock", userId: outsider.id });
  assert.equal(
    (await api("/api/relay", alice.cookie, { type: "friendRequest", username: "outside.user" }))
      .status,
    400,
  );
  await command(outsider.cookie, { type: "unblock", userId: alice.id });
  const visibleMessage = await command(loginCookie, {
    type: "send",
    roomId: room.id,
    content: "Hide this when blocked",
  });
  assert.ok(
    visibleMessage.messages.some((message) => message.content === "Hide this when blocked"),
  );
  state = await command(alice.cookie, { type: "block", userId: bob.id });
  assert.ok(!state.messages.some((message) => message.authorId === bob.id));
  assert.equal(state.blocked.find((blocked) => blocked.userId === bob.id)?.userId, bob.id);
  assert.ok(!state.rooms.some((room) => room.id === dm.id));
  assert.ok(
    !(await expectState(await api("/api/relay", loginCookie))).rooms.some(
      (room) => room.id === dm.id,
    ),
  );
  assert.equal(
    (await api("/api/relay", loginCookie, { type: "send", roomId: dm.id, content: "Blocked DM" }))
      .status,
    403,
  );
  assert.equal((await api("/api/relay", alice.cookie, { type: "dm", userId: bob.id })).status, 403);
  assert.equal(
    (await api("/api/relay", loginCookie, { type: "dm", userId: alice.id })).status,
    403,
  );
  await command(alice.cookie, { type: "unblock", userId: bob.id });
  await testDb.query(
    `UPDATE command_limits SET friend_count=20,friend_window_start=now() WHERE user_id=$1`,
    [alice.id],
  );
  assert.equal(
    (await api("/api/relay", alice.cookie, { type: "friendRequest", username: "outside.user" }))
      .status,
    429,
  );
  await testDb.query(`UPDATE command_limits SET friend_count=0 WHERE user_id=$1`, [alice.id]);
  const privacy = (value: "everyone" | "communities" | "no_one") =>
    command(alice.cookie, {
      type: "profile",
      name: "Alice Builder",
      bio: "",
      status: "online",
      friendRequestPrivacy: value,
    });
  await privacy("no_one");
  assert.equal(
    (await api("/api/relay", loginCookie, { type: "friendRequest", username: "alice.new" })).status,
    403,
  );
  await privacy("communities");
  assert.equal(
    (await api("/api/relay", outsider.cookie, { type: "friendRequest", username: "alice.new" }))
      .status,
    403,
  );
  await command(loginCookie, { type: "friendRequest", username: "alice.new" });
  await command(alice.cookie, { type: "friendDecline", userId: bob.id });
  await privacy("everyone");
  const simultaneous = await Promise.all([
    api("/api/relay", alice.cookie, { type: "friendRequest", username: "outside.user" }),
    api("/api/relay", outsider.cookie, { type: "friendRequest", username: "alice.new" }),
  ]);
  const simultaneousResults = await Promise.all(
    simultaneous.map(async (response) => ({
      status: response.status,
      body: await response.json(),
    })),
  );
  assert.deepEqual(
    simultaneousResults.map((response) => response.status),
    [200, 200],
    JSON.stringify(simultaneousResults),
  );
  state = await expectState(await api("/api/relay", outsider.cookie));
  assert.equal(state.friends.length, 1, "Concurrent mutual requests converge to one friendship");
  state = await command(outsider.cookie, { type: "dm", userId: alice.id });
  const friendDM = state.rooms.find(
    (room) => room.kind === "dm" && room.participantIds.includes(alice.id),
  );
  assert.ok(friendDM, "Friends can DM without a shared community");
  await command(outsider.cookie, {
    type: "send",
    roomId: friendDM.id,
    content: "Friends beyond communities",
  });
  assert.ok(
    (await expectState(await api("/api/relay", alice.cookie))).messages.some(
      (message) => message.content === "Friends beyond communities",
    ),
  );
  await command(alice.cookie, { type: "friendRemove", userId: outsider.id });
  assert.equal(
    (
      await api("/api/relay", outsider.cookie, {
        type: "send",
        roomId: friendDM.id,
        content: "No longer allowed",
      })
    ).status,
    403,
  );
  assert.ok(
    !(await expectState(await api("/api/relay", outsider.cookie))).rooms.some(
      (room) => room.id === friendDM.id,
    ),
  );
  const browser = await chromium.launch();
  try {
    const aliceBrowser = await browser.newContext();
    const bobBrowser = await browser.newContext();
    for (const [context, cookie] of [
      [aliceBrowser, alice.cookie],
      [bobBrowser, loginCookie],
    ] satisfies [import("@playwright/test").BrowserContext, string][]) {
      await context.addCookies(
        cookie.split("; ").map((entry) => {
          const index = entry.indexOf("=");
          return { name: entry.slice(0, index), value: entry.slice(index + 1), url: origin };
        }),
      );
    }
    const a = await aliceBrowser.newPage();
    const b = await bobBrowser.newPage();
    const held: { current: { route: Route; body: string } | null } = { current: null };
    let reads = 0;
    await a.route("**/api/relay", async (route) => {
      if (route.request().method() !== "GET" || ++reads !== 2) {
        await route.continue();
        return;
      }
      const response = await route.fetch();
      held.current = { route, body: await response.text() };
    });
    await a.goto(origin);
    await b.goto(origin);
    await expect(a.getByRole("tab", { name: "All", exact: true })).toBeVisible();
    await expect.poll(() => held.current !== null, { timeout: 15000 }).toBe(true);
    await a.getByRole("tab", { name: "Add Friend", exact: true }).click();
    await a.getByRole("textbox", { name: "Username", exact: true }).fill("@bob.builder");
    await a.getByRole("button", { name: "Send friend request", exact: true }).click();
    await expect(a.getByRole("status")).toContainText("Friend request sent");
    await a.getByRole("tab", { name: /^Pending/ }).click();
    await expect(a.getByRole("tabpanel").getByText("@bob.builder", { exact: true })).toBeVisible();
    const stale = held.current;
    if (stale)
      await stale.route
        .fulfill({ status: 200, contentType: "application/json", body: stale.body })
        .catch(() => {});
    await a.unroute("**/api/relay");
    await expect(a.getByRole("tabpanel").getByText("@bob.builder", { exact: true })).toBeVisible();
    await expect(b.getByRole("status")).toContainText("New friend request from @alice.new", {
      timeout: 15000,
    });
    await b.getByRole("tab", { name: /^Pending/ }).click();
    await b.getByRole("button", { name: "Accept", exact: true }).click();
    await a.getByRole("tab", { name: "All", exact: true }).click();
    await expect(a.getByRole("tabpanel").getByText("@bob.builder", { exact: true })).toBeVisible({
      timeout: 15000,
    });
    await a.getByRole("tabpanel").getByRole("button", { name: "Message", exact: true }).click();
    await expect(a.getByRole("heading", { name: "Bobby", exact: true })).toBeVisible();
    await a.getByRole("textbox", { name: "Message", exact: true }).fill("Hello @bob.builder!");
    await a.getByRole("button", { name: "Send message", exact: true }).click();
    const mentioned = a.getByTestId("message").filter({ hasText: "Hello @bob.builder!" });
    await mentioned.getByRole("button", { name: "@bob.builder", exact: true }).click();
    await expect(a.getByRole("dialog").getByText("@bob.builder", { exact: true })).toBeVisible();
    await a.getByRole("dialog").getByRole("button", { name: "Block", exact: true }).click();
    await a
      .getByRole("navigation", { name: "Communities" })
      .getByRole("button", { name: "Direct messages", exact: true })
      .click();
    await a.getByRole("tab", { name: "Blocked", exact: true }).click();
    await expect(a.getByRole("tabpanel").getByText("@bob.builder", { exact: true })).toBeVisible();
    await a.getByRole("button", { name: "Unblock", exact: true }).click();
    await b.getByRole("button", { name: "Account settings", exact: true }).click();
    const usernameInput = b.getByRole("textbox", { name: "Username", exact: true });
    await usernameInput.fill("a..b");
    await expect(
      b.getByText("Two consecutive dots are not allowed", { exact: true }),
    ).toBeVisible();
    await usernameInput.fill("alice.new");
    await expect(b.getByText("That username is already taken", { exact: true })).toBeVisible({
      timeout: 15000,
    });
    await usernameInput.fill("bobby.available");
    await expect(b.getByText("Available", { exact: true })).toBeVisible({ timeout: 15000 });
    await b
      .getByRole("combobox", { name: "Who can send me friend requests", exact: true })
      .selectOption("no_one");
    await b.getByRole("button", { name: "Save changes", exact: true }).click();
    await b.getByRole("button", { name: "Account settings", exact: true }).click();
    await expect(b.getByText(/^Next change allowed:/)).toBeVisible();
    await expect(
      b.getByRole("combobox", { name: "Who can send me friend requests", exact: true }),
    ).toHaveValue("no_one");
  } finally {
    await browser.close();
  }
  assert.ok(
    !logs.includes("uncaughtException"),
    "The server must not have uncaught protocol errors",
  );
  process.stdout.write(
    "Connected checks passed: usernames/backfill/uniqueness/cooldown, friendship transitions and privacy, independent blocks, DM authorization, rate limits, browser friend lists/toasts/settings/mentions/stale polling, and existing chat/auth/voice access controls.\n",
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
  await testDb.end();
  await socket.stop();
  await db.close();
}
