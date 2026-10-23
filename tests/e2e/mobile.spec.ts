import { test, expect, type Page } from "@playwright/test";
import { promises as fs } from "node:fs";
import { zipSync, unzipSync } from "fflate";

async function start(page: Page) {
  await page.goto("/"); await expect(page.locator("#mobile-app")).toHaveAttribute("data-ready", "true");
}
async function create(page: Page, title: string) {
  const empty = page.getByRole("button", { name: "Create a page", exact: true });
  if (await empty.isVisible()) await empty.click();
  else { await page.getByRole("button", { name: "Open pages", exact: true }).click(); await page.getByRole("button", { name: "New page", exact: true }).click(); }
  await expect(page.locator(".pm-document")).toBeVisible();
  await page.getByRole("textbox", { name: "Page title", exact: true }).fill(title);
}
async function saved(page: Page) { await expect(page.locator("#mobile-save-state")).toHaveText("Saved on this device"); }
async function exportZip(page: Page) {
  await saved(page);
  await page.getByRole("button", { name: "Notebook options", exact: true }).click();
  const download = page.waitForEvent("download"); await page.getByRole("button", { name: "Export notebook ZIP", exact: true }).click();
  const file = await download; return new Uint8Array(await fs.readFile((await file.path())!));
}

test("empty notebook, Chinese editing, source switching and reload use persistent local files", async ({ page }) => {
  const failures: string[] = []; page.on("pageerror", error => failures.push(error.message));
  await start(page); await expect(page.locator(".mobile-empty")).toBeVisible();
  await create(page, "手机笔记"); await expect(page.locator(".pm-document")).toHaveText("");
  await page.locator(".pm-document").click(); await page.keyboard.insertText("中文输入与 Markdown 保存。");
  await page.locator(".mobile-modes").getByRole("button", { name: "Source", exact: true }).click();
  await expect(page.locator(".cm-content")).toContainText("中文输入与 Markdown 保存。");
  await expect(page.locator('[data-view="source"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-view="document"]')).toHaveAttribute("aria-pressed", "false");
  await page.locator('[data-view="document"]').click();
  await expect(page.locator(".pm-document")).toBeVisible();
  await expect(page.locator('[data-view="document"]')).toHaveAttribute("aria-pressed", "true");
  await saved(page); await page.reload(); await expect(page.locator("#mobile-app")).toHaveAttribute("data-ready", "true");
  await expect(page.getByRole("textbox", { name: "Page title" })).toHaveValue("手机笔记");
  await expect(page.locator(".pm-document")).toContainText("中文输入与 Markdown 保存。");
  await page.screenshot({ path: "test-results/mobile-editor.png", fullPage: true });
  expect(failures).toEqual([]);
});

test("Markdown import and ZIP export preserve BOM, CRLF, unknown syntax and metadata", async ({ page }) => {
  await start(page);
  const source = "\uFEFF---\r\ntitle: 导入原文\r\nfuture: {keep: true}\r\n---\r\n\r\n```alien\r\n<unrecognized value=\"keep\">\r\n```\r\n";
  await page.locator("#mobile-import").setInputFiles({ name: "original.md", mimeType: "text/markdown", buffer: Buffer.from(source) });
  await expect(page.getByRole("textbox", { name: "Page title" })).toHaveValue("导入原文");
  await saved(page);
  const files = unzipSync(await exportZip(page));
  const name = Object.keys(files).find(name => name.startsWith("pages/") && name.endsWith(".md"))!;
  expect(Buffer.from(files[name]).toString("utf8")).toBe(source);
  expect(JSON.parse(Buffer.from(files["metadata.json"]).toString()).version).toBe(1);
});

test("new page navigation flushes pending input and mobile search uses page content", async ({ page }) => {
  await start(page); await create(page, "First");
  await page.locator(".pm-document").click(); await page.keyboard.insertText("等待保存的内容");
  await create(page, "Second"); await saved(page);
  await page.getByRole("button", { name: "Open pages" }).click();
  await page.getByRole("searchbox", { name: "Search pages" }).fill("等待保存");
  await expect(page.locator(".mobile-page-row")).toHaveCount(1);
  await page.getByRole("button", { name: "First", exact: true }).click();
  await expect(page.locator(".pm-document")).toContainText("等待保存的内容");
});

test("local image renders after reload while exported Markdown retains its relative path", async ({ page }) => {
  await start(page); await create(page, "Image note"); await page.locator(".pm-document").click();
  await page.getByRole("button", { name: "Insert image", exact: true }).click();
  const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6VvAAAAAASUVORK5CYII=", "base64");
  await page.locator("#mobile-image").setInputFiles({ name: "pixel.png", mimeType: "image/png", buffer: pixel });
  const image = page.locator(".pm-document img").first();
  await expect(image).toBeVisible(); await expect.poll(() => image.evaluate(node => (node as HTMLImageElement).naturalWidth)).toBe(1);
  await saved(page); await page.reload(); await expect(page.locator("#mobile-app")).toHaveAttribute("data-ready", "true");
  await expect.poll(() => image.evaluate(node => (node as HTMLImageElement).naturalWidth)).toBe(1);
  const files = unzipSync(await exportZip(page));
  const source = Buffer.from(files[Object.keys(files).find(key => key.startsWith("pages/") && key.endsWith(".md"))!]).toString();
  expect(source).toMatch(/assets\/[a-f0-9-]+\.png/); expect(source).not.toContain("blob:");
  expect(Object.keys(files).filter(key => key.startsWith("assets/"))).toHaveLength(1);
});

test("ZIP restore creates a separate notebook and keeps unknown files", async ({ page }) => {
  await start(page); await create(page, "Existing notebook page"); await saved(page);
  const source = "# Imported\n\nFrom another device.\n";
  const entries = { "pages/from-desktop.md": Buffer.from(source), "attachments/custom.bin": Buffer.from([0, 255, 37]), "future.json": Buffer.from('{"keep":true}') };
  await page.locator("#mobile-import").setInputFiles({ name: "Desktop-vault.zip", mimeType: "application/zip", buffer: Buffer.from(zipSync(entries)) });
  await expect(page.getByRole("textbox", { name: "Page title" })).toHaveValue("from-desktop");
  await expect(page.locator(".pm-document")).toContainText("From another device.");
  const files = unzipSync(await exportZip(page));
  expect(Buffer.from(files["future.json"]).toString()).toBe('{"keep":true}'); expect(Buffer.from(files["attachments/custom.bin"])).toEqual(entries["attachments/custom.bin"]);
  await page.getByRole("button", { name: "Open pages" }).click();
  await page.getByRole("combobox", { name: "Notebook", exact: true }).selectOption("main");
  await expect(page.getByRole("textbox", { name: "Page title" })).toHaveValue("Existing notebook page");
});

test("two windows retain a stale draft and create a recoverable copy", async ({ page, context }) => {
  await start(page); await create(page, "Shared note"); await saved(page);
  const second = await context.newPage(); await start(second);
  await page.locator(".pm-document").click(); await page.keyboard.insertText("first window saved"); await saved(page);
  await second.locator(".pm-document").click(); await second.keyboard.insertText("second window draft");
  await expect(second.locator("#mobile-recovery")).toBeVisible();
  await second.getByRole("button", { name: "Save draft as new page" }).click();
  await expect(second.getByRole("textbox", { name: "Page title" })).toHaveValue("Shared note (recovered)");
  await expect(second.locator(".pm-document")).toContainText("second window draft");
  const files = unzipSync(await exportZip(second));
  const sources = Object.entries(files).filter(([name]) => name.startsWith("pages/")).map(([, data]) => Buffer.from(data).toString());
  expect(sources.some(source => source.includes("first window saved"))).toBe(true);
  expect(sources.some(source => source.includes("second window draft"))).toBe(true);
  expect(Object.keys(files).some(name => /^\.history\/conflicts\/.*\.md$/.test(name))).toBe(true);
});

test("editing needs no API connection and toolbar fits narrow and keyboard-sized viewports", async ({ page }) => {
  await page.route("**/api/**", route => route.abort());
  await start(page); await create(page, "Offline");
  await page.locator(".pm-document").click(); await page.keyboard.insertText("No Node server required."); await saved(page);
  await page.setViewportSize({ width: 320, height: 450 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const toolbar = await page.locator(".mobile-tools").boundingBox();
  expect(toolbar).not.toBeNull(); expect(toolbar!.y + toolbar!.height).toBeLessThanOrEqual(451);
  await page.screenshot({ path: "test-results/mobile-narrow.png", fullPage: true });
});
