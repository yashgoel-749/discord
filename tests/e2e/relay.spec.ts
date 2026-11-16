import { test, expect } from "@playwright/test";

test("send, persist, search, edit, react, and delete a message", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "general", exact: true })).toBeVisible();
  const composer = page.getByRole("textbox", { name: "Message", exact: true });
  await composer.fill("Hello from the browser test");
  await composer.press("Enter");
  await expect(page.getByText("Hello from the browser test", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Hello from the browser test", { exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Search messages" }).fill("browser test");
  const message = page.getByTestId("message").filter({ hasText: "Hello from the browser test" });
  await message.hover();
  await message.getByRole("button", { name: "Edit message" }).click();
  await page
    .getByRole("textbox", { name: "Message", exact: true })
    .last()
    .fill("Hello from the edited browser test");
  await page.getByRole("dialog").getByRole("button", { name: "Save message", exact: true }).click();
  const updated = page
    .getByTestId("message")
    .filter({ hasText: "Hello from the edited browser test" });
  await expect(updated).toBeVisible();
  await updated.hover();
  await updated.getByRole("button", { name: "Add reaction", exact: true }).click();
  await page.getByRole("button", { name: "React with 🚀" }).click();
  await expect(updated.getByRole("button", { name: "🚀 reaction, 1, remove" })).toBeVisible();
  await updated.hover();
  await updated.getByRole("button", { name: "Delete message" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete message" }).click();
  await expect(
    page.getByTestId("message").filter({ hasText: "Hello from the edited browser test" }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("create a community and channel, and open a private conversation", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create community", exact: true }).click();
  await page.getByRole("textbox", { name: "Community name" }).fill("Browser Builders");
  await page.getByRole("textbox", { name: "A little about it" }).fill("Built together");
  await page.getByRole("dialog").getByRole("button", { name: "Create community" }).click();
  await expect(
    page
      .getByRole("navigation", { name: "Communities" })
      .getByRole("button", { name: "Browser Builders", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Create text channel" }).click();
  await page.getByRole("textbox", { name: "Channel name" }).fill("shipping");
  await page.getByRole("button", { name: "Create channel", exact: true }).click();
  await page.getByRole("button", { name: "shipping", exact: true }).click();
  await expect(page.getByRole("heading", { name: "shipping", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Direct messages", exact: true }).click();
  await page
    .getByRole("complementary", { name: "Channels" })
    .getByRole("button", { name: /James Wilson/ })
    .click();
  await expect(page.getByRole("heading", { name: "James Wilson", exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Message", exact: true }).fill("Private hello");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Private hello", { exact: true })).toBeVisible();
});

test("mobile navigation fits the viewport and voice demo never requests a microphone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("textbox", { name: "Message", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "The lounge", exact: true }).click();
  await page.getByRole("button", { name: "Join conversation" }).click();
  await expect(
    page.getByText("This is a local demo. Connect Neon and LiveKit", { exact: false }),
  ).toContainText("no microphone is used in demo mode");
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(fits).toBe(true);
  await page.screenshot({ path: "test-results/relay-mobile.png", fullPage: true });
});

test("desktop demo renders and unauthenticated service endpoints fail closed", async ({
  page,
  request,
}) => {
  const externalFontRequests: string[] = [];
  page.on("request", (request) => {
    if (/fonts\.(googleapis|gstatic)\.com/.test(request.url()))
      externalFontRequests.push(request.url());
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "general", exact: true })).toBeVisible();
  expect(externalFontRequests).toEqual([]);
  await page.screenshot({ path: "test-results/relay-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "About Relay", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "About Relay" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "About Relay" })).toHaveCount(0);
  const chat = await request.get("/api/relay");
  expect(chat.status()).toBe(503);
  const auth = await request.get("/api/auth/get-session");
  expect(auth.status()).toBe(503);
  const mutation = await request.post("/api/relay", {
    data: { type: "send", roomId: "general", content: "bad" },
  });
  expect(mutation.status()).toBe(403);
});
