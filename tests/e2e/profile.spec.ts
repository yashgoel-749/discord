import { test, expect } from "@playwright/test";

test("profile changes persist and demo reset requires confirmation", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Account settings", exact: true }).click();
  await page.getByRole("textbox", { name: "Display name" }).fill("Browser Alex");
  await page.getByRole("textbox", { name: "About you" }).fill("Profile checked in a real browser");
  await page.getByRole("combobox", { name: "Availability" }).selectOption("dnd");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Account settings", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Display name" })).toHaveValue("Browser Alex");
  await expect(page.getByRole("combobox", { name: "Availability" })).toHaveValue("dnd");
  await page.getByRole("button", { name: "Reset local demo" }).click();
  await page.getByRole("button", { name: "Keep my demo" }).click();
  await page.getByRole("button", { name: "Account settings", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Display name" })).toHaveValue("Browser Alex");
  await page.getByRole("button", { name: "Reset local demo" }).click();
  await page.getByRole("button", { name: "Reset demo", exact: true }).click();
  await page.getByRole("button", { name: "Account settings", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Display name" })).toHaveValue("Alex Morgan");
});
