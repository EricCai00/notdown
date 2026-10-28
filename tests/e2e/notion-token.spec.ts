import { test, expect, type Page } from "@playwright/test";
import { notionRoot } from "../unit/notion-import-fixture.js";

async function openImport(page: Page) {
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page.getByRole("button", { name: "Import from Notion API", exact: true }).click();
}

test("Notion token autofills after closing and reloading, updates and can be forgotten", async ({ page }) => {
  await page.goto("/");
  await openImport(page);
  const token = page.getByLabel("Integration token", { exact: true });
  await expect(token).toHaveAttribute("type", "password");
  await expect(token).toHaveValue("");
  await token.fill("  first-notion-key  ");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await openImport(page);
  await expect(token).toHaveValue("first-notion-key");
  await token.fill("replacement-notion-key");
  await page.reload();
  await openImport(page);
  await expect(token).toHaveValue("replacement-notion-key");
  await page.screenshot({ path: ".run/logs/notion-token-browser.png" });
  await page.getByLabel("Page URL or ID", { exact: true }).fill(notionRoot);
  await page.getByLabel("Include descendant pages").uncheck();
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.locator("#notion-status")).toContainText("Ready");
  await expect(token).toHaveValue("replacement-notion-key");
  await page.getByLabel("Page URL or ID", { exact: true }).fill("invalid");
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.locator("#notion-status")).toContainText("Enter a Notion page");
  await expect(token).toHaveValue("replacement-notion-key");
  await token.clear();
  await page.keyboard.press("Escape");
  await page.reload();
  await openImport(page);
  await expect(token).toHaveValue("");
});

test("unavailable token storage reports the problem while allowing a Notion preview", async ({ page }) => {
  await page.addInitScript(() => {
    const get = Storage.prototype.getItem, set = Storage.prototype.setItem;
    Storage.prototype.getItem = function(key) {
      if (key === "notdown-notion-import-token") throw new Error("Storage unavailable");
      return get.call(this, key);
    };
    Storage.prototype.setItem = function(key, value) {
      if (key === "notdown-notion-import-token") throw new Error("Storage unavailable");
      return set.call(this, key, value);
    };
  });
  await page.goto("/");
  await openImport(page);
  await expect(page.locator("#notion-token-status")).toContainText("could not be loaded");
  await page.getByLabel("Integration token", { exact: true }).fill("temporary-notion-key");
  await expect(page.locator("#notion-token-status")).toContainText("could not be saved");
  await page.getByLabel("Page URL or ID", { exact: true }).fill(notionRoot);
  await page.getByLabel("Include descendant pages").uncheck();
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.locator("#notion-status")).toContainText("Ready");
  await expect(page.getByRole("button", { name: "Import copies", exact: true })).toBeEnabled();
});
