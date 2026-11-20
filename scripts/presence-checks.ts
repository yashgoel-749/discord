import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chromium, expect } from "@playwright/test";
import type pg from "pg";
import { stateSchema, type User } from "../src/lib/model";
import type { PresenceCommand } from "../src/lib/presence";

export async function checkPresence({
  origin,
  user,
  observerCookie,
  testDb,
}: {
  origin: string;
  user: { id: string; cookie: string };
  observerCookie: string;
  testDb: pg.Pool;
}) {
  const request = (path: string, cookie: string, body?: unknown, requestOrigin = origin) =>
    fetch(`${origin}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Cookie: cookie,
        ...(body === undefined
          ? {}
          : { Origin: requestOrigin, "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(20000),
    });
  const snapshot = async (cookie = observerCookie) => {
    const response = await request("/api/relay", cookie);
    assert.equal(response.status, 200);
    return stateSchema.parse(await response.json());
  };
  const status = async () => (await snapshot()).users.find((peer) => peer.id === user.id)?.status;
  const pulse = async (command: PresenceCommand, cookie = user.cookie) => {
    const response = await request("/api/presence", cookie, command);
    assert.equal(response.status, 204, await response.text());
  };
  const select = async (availability: User["status"]) => {
    const me = (await snapshot(user.cookie)).me;
    const response = await request("/api/relay", user.cookie, {
      type: "profile",
      name: me.name,
      bio: me.bio,
      status: availability,
    });
    assert.equal(response.status, 200, await response.text());
  };
  await testDb.query("DELETE FROM user_presence WHERE user_id=$1", [user.id]);
  assert.equal(await status(), "offline", "A valid login cookie alone is not presence");
  const first = randomUUID();
  const second = randomUUID();
  assert.equal((await request("/api/presence", "", { type: "open", tabId: first })).status, 401);
  assert.equal(
    (
      await request(
        "/api/presence",
        user.cookie,
        { type: "open", tabId: first },
        "https://untrusted.example",
      )
    ).status,
    403,
  );
  assert.equal(
    (await request("/api/presence", user.cookie, { type: "open", tabId: "invalid" })).status,
    400,
  );
  await pulse({ type: "open", tabId: first });
  assert.equal(await status(), "online");
  await select("dnd");
  await pulse({ type: "heartbeat", tabId: first });
  await pulse({ type: "open", tabId: first });
  await pulse({ type: "open", tabId: second });
  assert.equal(
    await status(),
    "dnd",
    "Additional tabs and duplicate opens preserve manual choices",
  );
  await pulse({ type: "close", tabId: second }, observerCookie);
  assert.equal(await status(), "dnd", "Another account cannot close this user's tab");
  await pulse({ type: "close", tabId: first });
  assert.equal(await status(), "dnd");
  await pulse({ type: "close", tabId: second });
  assert.equal(await status(), "offline");
  assert.equal(
    (await snapshot(user.cookie)).me.status,
    "dnd",
    "Effective offline does not replace the saved choice",
  );
  await pulse({ type: "heartbeat", tabId: second });
  await pulse({ type: "open", tabId: second });
  assert.equal(await status(), "offline", "Delayed requests cannot reopen a closed document");
  const reordered = randomUUID();
  await pulse({ type: "close", tabId: reordered });
  await pulse({ type: "open", tabId: reordered });
  await pulse({ type: "heartbeat", tabId: reordered });
  assert.equal(await status(), "offline", "Close wins even when it arrives before open");
  const recovery = randomUUID();
  await pulse({ type: "open", tabId: recovery });
  assert.equal(await status(), "online", "Reopening after the last tab closes starts online");
  await select("idle");
  await testDb.query(
    "UPDATE user_presence SET expires_at=now()-interval '1 second' WHERE user_id=$1",
    [user.id],
  );
  assert.equal(
    await status(),
    "offline",
    "Missed close signals expire without a background worker",
  );
  assert.equal((await snapshot(user.cookie)).me.status, "idle");
  await pulse({ type: "heartbeat", tabId: recovery });
  assert.equal(await status(), "idle", "Connection recovery retains the manual choice");
  await select("offline");
  await pulse({ type: "heartbeat", tabId: recovery });
  assert.equal(await status(), "offline", "Invisible stays offline despite a live tab");
  await select("idle");
  const login = await request("/api/auth/sign-in/email", "", {
    email: "bob@example.com",
    password: "test-password-123!",
  });
  assert.equal(login.status, 200, await login.text());
  const deviceCookie = login.headers
    .getSetCookie()
    .map((entry) => entry.split(";")[0])
    .join("; ");
  const device = randomUUID();
  await pulse({ type: "open", tabId: device }, deviceCookie);
  await pulse({ type: "close", tabId: recovery });
  assert.equal(await status(), "idle", "A second authenticated device keeps the user present");
  assert.equal((await request("/api/auth/sign-out", deviceCookie, {})).status, 200);
  assert.equal(
    await status(),
    "offline",
    "Revoked sessions stop counting even if cleanup was missed",
  );
  assert.equal(
    (await request("/api/presence", deviceCookie, { type: "heartbeat", tabId: device })).status,
    401,
  );
  await testDb.query(
    "UPDATE command_limits SET presence_window_start=now(),presence_count=180 WHERE user_id=$1",
    [user.id],
  );
  assert.equal(
    (await request("/api/presence", user.cookie, { type: "open", tabId: randomUUID() })).status,
    429,
  );
  await select("dnd");
  await testDb.query("UPDATE command_limits SET presence_count=0 WHERE user_id=$1", [user.id]);

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    await context.addCookies(
      user.cookie.split("; ").map((entry) => {
        const index = entry.indexOf("=");
        return { name: entry.slice(0, index), value: entry.slice(index + 1), url: origin };
      }),
    );
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(origin);
    await expect.poll(status, { timeout: 15000 }).toBe("online");
    await page.getByRole("button", { name: "Account settings", exact: true }).click();
    for (const choice of ["dnd", "idle", "offline", "online"] satisfies User["status"][]) {
      await page.getByRole("combobox", { name: "Availability", exact: true }).selectOption(choice);
      await page.getByRole("button", { name: "Save changes", exact: true }).click();
      await expect.poll(status, { timeout: 15000 }).toBe(choice);
      await page.getByRole("button", { name: "Account settings", exact: true }).click();
      await expect(page.getByRole("combobox", { name: "Availability", exact: true })).toHaveValue(
        choice,
      );
    }
    await page.getByRole("combobox", { name: "Availability", exact: true }).selectOption("dnd");
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    const extra = await context.newPage();
    const backgroundHeartbeat = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/presence") &&
        response.request().postDataJSON()?.type === "heartbeat" &&
        response.status() === 204,
      { timeout: 35000 },
    );
    const extraOpen = extra.waitForResponse(
      (response) =>
        response.url().endsWith("/api/presence") &&
        response.request().postDataJSON()?.type === "open" &&
        response.status() === 204,
    );
    await extra.goto(origin);
    await extraOpen;
    await backgroundHeartbeat;
    await expect(
      extra.getByRole("button", { name: "Account settings", exact: true }),
    ).toBeVisible();
    await expect.poll(status, { timeout: 15000 }).toBe("dnd");
    await page.close({ runBeforeUnload: true });
    await expect.poll(status, { timeout: 15000 }).toBe("dnd");
    await extra.close({ runBeforeUnload: true });
    await expect.poll(status, { timeout: 15000 }).toBe("offline");
    const reopened = await context.newPage();
    await reopened.goto(origin);
    await expect.poll(status, { timeout: 15000 }).toBe("online");
    await reopened.reload();
    await expect.poll(status, { timeout: 15000 }).toBe("online");
    await reopened.getByRole("button", { name: "Account settings", exact: true }).click();
    await reopened.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect.poll(status, { timeout: 15000 }).toBe("offline");
    await expect(reopened.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
}
