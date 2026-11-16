import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import nextEnv from "@next/env";
import { chromium, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { RoomServiceClient } from "livekit-server-sdk";
import { stateSchema, type Command } from "../src/lib/model";
import { voicePresenceSchema } from "../src/lib/voice-presence";

nextEnv.loadEnvConfig(process.cwd());
const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = process.env;
if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET)
  throw new Error("Configure LiveKit in .env.local before running test:voice");
const service = new RoomServiceClient(
  LIVEKIT_URL.replace(/^wss:/, "https:"),
  LIVEKIT_API_KEY,
  LIVEKIT_API_SECRET,
);
await service.listRooms();
const origin = "http://localhost:3101";
const db = await PGlite.create();
await db.exec(await readFile(resolve("db/001_initial.sql"), "utf8"));
const socket = new PGLiteSocketServer({ db, host: "127.0.0.1", port: 54330, maxConnections: 10 });
await socket.start();
const server = spawn(
  process.execPath,
  [resolve("node_modules/next/dist/bin/next"), "start", "--port", "3101"],
  {
    env: {
      ...process.env,
      DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54330/postgres",
      APP_URL: origin,
      BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
      LIVEKIT_URL,
      LIVEKIT_API_KEY,
      LIVEKIT_API_SECRET,
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
const ready = new Promise<void>((resolveReady, reject) => {
  const timer = setTimeout(() => reject(new Error("Voice test server did not start")), 30000);
  server.stdout.on("data", (data: Buffer) => {
    if (data.toString().includes("Ready in")) {
      clearTimeout(timer);
      resolveReady();
    }
  });
  server.once("error", (error) => {
    clearTimeout(timer);
    reject(error);
  });
  server.once("exit", (code) => {
    clearTimeout(timer);
    reject(new Error(`Voice test server exited: ${code}`));
  });
});

async function command(context: BrowserContext, data?: Command) {
  const response = data
    ? await context.request.post(`${origin}/api/relay`, { data, headers: { Origin: origin } })
    : await context.request.get(`${origin}/api/relay`);
  assert.equal(response.status(), 200, "Chat request must succeed");
  return stateSchema.parse(await response.json());
}
async function register(context: BrowserContext, name: string) {
  const response = await context.request.post(`${origin}/api/auth/sign-up/email`, {
    headers: { Origin: origin },
    data: {
      name,
      email: `voice-${randomUUID()}@example.com`,
      password: randomBytes(24).toString("hex"),
    },
  });
  assert.equal(response.status(), 200, "Registration must succeed");
  return (await command(context)).me;
}
async function monitorAudio(context: BrowserContext) {
  await context.addInitScript(() => {
    const connections: RTCPeerConnection[] = [];
    Object.defineProperty(window, "relayTestConnections", { value: connections });
    window.RTCPeerConnection = class extends RTCPeerConnection {
      constructor(...args: ConstructorParameters<typeof RTCPeerConnection>) {
        super(...args);
        connections.push(this);
      }
    };
  });
}
async function receivedAudio(page: Page) {
  return page.evaluate(async () => {
    const connections: unknown = Reflect.get(window, "relayTestConnections");
    if (!Array.isArray(connections)) throw new Error("Audio monitor missing");
    let bytes = 0;
    for (const connection of connections) {
      if (!(connection instanceof RTCPeerConnection) || connection.connectionState === "closed")
        continue;
      const report = await connection.getStats();
      report.forEach((stat) => {
        if (
          stat.type === "inbound-rtp" &&
          stat.kind === "audio" &&
          typeof stat.bytesReceived === "number"
        )
          bytes += stat.bytesReceived;
      });
    }
    return bytes;
  });
}
const pollOptions = { timeout: 45000, intervals: [250, 500, 1000] };
let browser: Browser | undefined;
const roomNames: string[] = [];
try {
  await ready;
  browser = await chromium.launch({
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
  });
  const alice = await browser.newContext({ permissions: ["microphone", "camera"] });
  const bob = await browser.newContext({ permissions: ["microphone", "camera"] });
  const observer = await browser.newContext();
  await monitorAudio(alice);
  await monitorAudio(bob);
  await monitorAudio(observer);
  const aliceUser = await register(alice, "Voice Alice");
  const bobUser = await register(bob, "Voice Bob");
  await register(observer, "Voice Observer");
  let state = await command(alice, {
    type: "createServer",
    name: "Voice Builders",
    description: "",
  });
  const community = state.servers.find((item) => item.name === "Voice Builders");
  assert.ok(community);
  const denied = await observer.request.get(`${origin}/api/voice?serverId=${community.id}`);
  assert.equal(denied.status(), 403, "Nonmembers must not see voice occupants");
  const anonymous = await browser.newContext();
  assert.equal(
    (await anonymous.request.get(`${origin}/api/voice?serverId=${community.id}`)).status(),
    401,
  );
  await anonymous.close();
  await command(bob, { type: "join", inviteCode: community.inviteCode });
  await command(observer, { type: "join", inviteCode: community.inviteCode });
  state = await command(alice, {
    type: "createRoom",
    serverId: community.id,
    name: "stay-connected",
    kind: "voice",
  });
  const voice = state.rooms.find((item) => item.name === "stay-connected");
  assert.ok(voice);
  const livekitRoom = `relay-${voice.id}`;
  roomNames.push(livekitRoom);
  state = await command(alice, {
    type: "createRoom",
    serverId: community.id,
    name: "other-call",
    kind: "voice",
  });
  const otherVoice = state.rooms.find((item) => item.name === "other-call");
  assert.ok(otherVoice);
  roomNames.push(`relay-${otherVoice.id}`);
  await command(alice, { type: "createServer", name: "Another Community", description: "" });
  await command(alice, { type: "dm", userId: bobUser.id });

  const a = await alice.newPage();
  const b = await bob.newPage();
  for (const page of [a, b]) {
    await page.goto(origin);
    await page
      .getByRole("navigation", { name: "Communities" })
      .getByRole("button", { name: "Voice Builders", exact: true })
      .click();
    await page.getByRole("button", { name: "stay-connected", exact: true }).click();
    await page.getByRole("button", { name: "Join conversation", exact: true }).click();
    await expect(
      page.getByRole("region", { name: "Active voice call" }).getByRole("status"),
    ).toHaveText("Voice connected", { timeout: 45000 });
  }
  await expect
    .poll(async () => (await service.listParticipants(livekitRoom)).length, pollOptions)
    .toBe(2);
  const originalSid = (await service.getParticipant(livekitRoom, aliceUser.id)).sid;
  assert.equal((await service.getParticipant(livekitRoom, aliceUser.id)).name, "Voice Alice");
  assert.equal((await service.getParticipant(livekitRoom, bobUser.id)).name, "Voice Bob");
  const watching = await observer.newPage();
  await watching.goto(origin);
  await watching
    .getByRole("navigation", { name: "Communities" })
    .getByRole("button", { name: "Voice Builders", exact: true })
    .click();
  const roster = watching.getByRole("list", { name: "stay-connected participants", exact: true });
  await expect(roster.getByText("Voice Alice", { exact: true })).toBeVisible({ timeout: 15000 });
  await expect(roster.getByText("Voice Bob", { exact: true })).toBeVisible();
  await expect(watching.getByRole("region", { name: "Active voice call" })).toHaveCount(0);
  assert.equal(
    await watching.evaluate(() => {
      const connections: unknown = Reflect.get(window, "relayTestConnections");
      return Array.isArray(connections) ? connections.length : -1;
    }),
    0,
    "Reading members must not join a call",
  );
  const observed = await observer.request.get(`${origin}/api/voice?serverId=${community.id}`);
  assert.equal(observed.status(), 200);
  const directory = voicePresenceSchema.parse(await observed.json());
  assert.deepEqual(Object.keys(directory.channels).sort(), [voice.id, otherVoice.id].sort());
  assert.deepEqual(directory.channels[otherVoice.id], { phase: "ready", members: [] });
  assert.equal(observed.headers()["cache-control"], "private, no-store");
  await mkdir("test-results", { recursive: true });
  await watching.screenshot({ path: "test-results/voice-member-roster.png" });
  await watching.route("**/api/voice?serverId=*", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Presence temporarily unavailable" }),
    }),
  );
  await expect(
    watching.getByText("Voice members unavailable", { exact: true }).first(),
  ).toBeVisible({ timeout: 15000 });
  await expect(roster).toHaveCount(0);
  await watching.unroute("**/api/voice?serverId=*");
  await expect(roster.getByText("Voice Alice", { exact: true })).toBeVisible({ timeout: 15000 });
  await expect.poll(() => receivedAudio(a), pollOptions).toBeGreaterThan(0);
  await expect.poll(() => receivedAudio(b), pollOptions).toBeGreaterThan(0);

  async function stillConnected() {
    const before = await receivedAudio(a);
    await expect.poll(() => receivedAudio(a), pollOptions).toBeGreaterThan(before);
    assert.equal(
      (await service.getParticipant(livekitRoom, aliceUser.id)).sid,
      originalSid,
      "Browsing must not disconnect and reconnect the participant",
    );
    await expect(a.getByRole("region", { name: "Active voice call" })).toBeVisible();
  }
  await a.getByRole("button", { name: "general", exact: true }).click();
  await a
    .getByRole("textbox", { name: "Message", exact: true })
    .fill("Typing without leaving voice");
  await a.getByRole("button", { name: "Send message" }).click();
  await expect(a.getByText("Typing without leaving voice", { exact: true })).toBeVisible();
  await stillConnected();
  await a
    .getByRole("navigation", { name: "Communities" })
    .getByRole("button", { name: "Another Community", exact: true })
    .click();
  await stillConnected();
  await a.getByRole("button", { name: "Direct messages", exact: true }).click();
  await a
    .getByRole("complementary", { name: "Channels", exact: true })
    .getByRole("button", { name: /Voice Bob/ })
    .first()
    .click();
  await expect(a.getByRole("heading", { name: "Voice Bob", exact: true })).toBeVisible();
  await stillConnected();
  await a.getByRole("button", { name: "Mute microphone", exact: true }).click();
  await expect(a.getByRole("button", { name: "Unmute microphone", exact: true })).toBeVisible();
  await expect(
    roster
      .getByRole("listitem")
      .filter({ hasText: "Voice Alice" })
      .getByRole("img", { name: "Microphone muted", exact: true }),
  ).toBeVisible({ timeout: 15000 });
  await expect
    .poll(
      async () =>
        (await service.getParticipant(livekitRoom, aliceUser.id)).tracks.some((t) => t.muted),
      pollOptions,
    )
    .toBe(true);
  await a.getByRole("button", { name: "Unmute microphone", exact: true }).click();
  await expect(
    roster
      .getByRole("listitem")
      .filter({ hasText: "Voice Alice" })
      .getByRole("img", { name: "Microphone on", exact: true }),
  ).toBeVisible({ timeout: 15000 });
  await stillConnected();
  await a.setViewportSize({ width: 390, height: 844 });
  await stillConnected();
  assert.ok(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await a.getByRole("button", { name: "Your settings", exact: true }).click();
  await expect(a.getByRole("dialog")).toBeVisible();
  await a.keyboard.press("Escape");
  await mkdir("test-results", { recursive: true });
  await a.screenshot({ path: "test-results/voice-persistent-mobile.png" });
  await a.getByRole("button", { name: "Return to voice call", exact: true }).click();
  await expect(a.getByRole("heading", { name: "stay-connected", exact: true })).toBeVisible();
  await stillConnected();
  await a.setViewportSize({ width: 1440, height: 1000 });
  await a.getByRole("button", { name: "other-call", exact: true }).click();
  await stillConnected();
  await a.getByRole("button", { name: "Switch voice channel", exact: true }).click();
  await expect
    .poll(
      async () => (await service.listParticipants(`relay-${otherVoice.id}`)).map((p) => p.identity),
      pollOptions,
    )
    .toEqual([aliceUser.id]);
  await expect
    .poll(
      async () => (await service.listParticipants(livekitRoom)).map((p) => p.identity),
      pollOptions,
    )
    .toEqual([bobUser.id]);
  await expect(roster.getByText("Voice Alice", { exact: true })).toHaveCount(0, { timeout: 15000 });
  const switchedRoster = watching.getByRole("list", {
    name: "other-call participants",
    exact: true,
  });
  await expect(switchedRoster.getByText("Voice Alice", { exact: true })).toBeVisible({
    timeout: 15000,
  });
  await a.getByRole("button", { name: "Disconnect voice", exact: true }).click();
  await expect(a.getByRole("region", { name: "Active voice call" })).toHaveCount(0);
  await expect
    .poll(
      async () => (await service.listParticipants(`relay-${otherVoice.id}`)).length,
      pollOptions,
    )
    .toBe(0);
  await b.getByRole("button", { name: "Your settings", exact: true }).click();
  await expect(switchedRoster).toHaveCount(0, { timeout: 15000 });
  await b.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(b.getByRole("region", { name: "Active voice call" })).toHaveCount(0);
  await expect
    .poll(async () => (await service.listParticipants(livekitRoom)).length, pollOptions)
    .toBe(0);
  await expect(roster).toHaveCount(0, { timeout: 15000 });
  process.stdout.write(
    "Voice checks passed: real two-browser audio, persistent calls through navigation, named participants, spectator rosters, membership privacy, mute updates, joins/leaves/channel switches, mobile controls, disconnect, and sign-out.\n",
  );
} finally {
  const cleanup = await Promise.allSettled([
    (async () => {
      await browser?.close();
      if (roomNames.length === 0) return;
      const rooms = await service.listRooms(roomNames);
      for (const room of rooms) {
        if (roomNames.includes(room.name)) await service.deleteRoom(room.name);
      }
    })(),
    (async () => {
      if (server.exitCode === null && !server.killed) {
        const stopped = once(server, "exit");
        server.kill();
        await stopped;
      }
      await socket.stop();
      await db.close();
    })(),
  ]);
  for (const result of cleanup) {
    if (result.status === "rejected") {
      process.stderr.write("Voice test resource cleanup failed.\n");
      process.exitCode = 1;
    }
  }
}
