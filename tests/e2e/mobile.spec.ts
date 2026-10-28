import { test, expect, type Page } from "@playwright/test";
import { promises as fs } from "node:fs";
import { zipSync, unzipSync } from "fflate";

test("mobile external references use English inert labels and preserve original source after reload", async ({ page }, info) => {
  await start(page); await create(page, "External reference setup"); await saved(page);
  const target = "df111111-1111-4111-8111-111111111111", user = "df222222-2222-4222-8222-222222222222";
  const source = `<mention-page url="https://www.notion.so/${target}">Saved page</mention-page> and <mention-user url="user://${user}">Saved user</mention-user>.\n`;
  await page.locator("#mobile-import").setInputFiles({ name: "External references.md", mimeType: "text/markdown", buffer: Buffer.from(source) });
  const editor = page.locator(".pm-document");
  await expect(editor.locator(".page-mention .page-link-label")).toHaveText("Unknown page");
  await expect(editor.locator(".page-mention")).not.toHaveAttribute("href");
  await expect(editor.locator('[data-mention-kind="user"]')).toHaveText("@Unknown user");
  await expect(editor.locator('[data-mention-kind="user"]')).toHaveAttribute("aria-disabled", "true");
  await saved(page); await page.reload(); await expect(page.locator("#mobile-app")).toHaveAttribute("data-ready", "true");
  await expect(editor.locator(".page-mention .page-link-label")).toBeVisible();
  await expect(editor.locator('[data-mention-kind="user"]')).toHaveText("@Unknown user");
  await page.screenshot({ path: info.outputPath("external-unknowns-mobile.png") });
  await page.locator('[data-view="source"]').click();
  await expect(page.locator(".cm-content")).toContainText(`https://www.notion.so/${target}`);
  await expect(page.locator(".cm-content")).toContainText(`user://${user}`);
});

async function start(page: Page, fixture = "") {
  await page.goto("/"); await expect(page.locator("#mobile-app")).toHaveAttribute("data-ready", "true");
  if (await page.locator(".mobile-sync-dialog[open]").isVisible()) {
    const cloud = await (await page.request.post("/__mobile-test/notebook" + fixture)).json();
    const settings = page.getByRole("region", { name: "Cloud sync", exact: true });
    await settings.getByLabel("WebDAV server URL").fill(cloud.url);
    await settings.getByLabel("Remote notebook folder").fill(cloud.folder);
    await settings.getByLabel("WebDAV account", { exact: true }).fill(cloud.email);
    await settings.getByLabel("Application password", { exact: true }).fill(cloud.password);
    await settings.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(settings.getByRole("combobox", { name: "Cloud notebook", exact: true })).toHaveValue(/.+/);
    await expect(settings.getByLabel("New notebook name")).toBeHidden();
    await settings.getByRole("button", { name: "Enable sync" }).click();
    await expect(page.locator(".mobile-sync-dialog[open]")).toHaveCount(0);
  }
}
async function create(page: Page, title: string) {
  const empty = page.getByRole("button", { name: "Create a page", exact: true });
  if (await empty.isVisible()) await empty.click();
  else { await page.getByRole("button", { name: "Open pages", exact: true }).click(); await page.getByRole("button", { name: "New page", exact: true }).click(); }
  await expect(page.locator("#mobile-pages")).toBeHidden();
  await expect(page.getByRole("textbox", { name: "Page title", exact: true })).toHaveValue("Untitled page");
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

test("mobile page dialect preserves pending source and unknown settings across reload", async ({ page }, testInfo) => {
  await start(page); await create(page, "Existing page"); await saved(page);
  const source = '---\nsyntax:\n  version: 1\n  variant: obsidian\n  future: keep\n  extensions:\n    highlight: false\n    future_extension: true\nfuture_note: preserve\n---\n# Dialect source\n\n<!-- unknown content -->\n\n```future\n::literal{keep=true}\n```\n';
  await page.locator("#mobile-import").setInputFiles({ name: "Dialect source.md", mimeType: "text/markdown", buffer: Buffer.from(source) });
  await expect(page.locator("#mobile-workspace")).toHaveAttribute("data-variant", "obsidian");
  await page.locator('[data-view="source"]').click();
  await page.locator(".cm-content").click(); await page.keyboard.press("Control+End");
  await page.keyboard.insertText("\nPending source survives dialect changes.\n");
  await page.getByRole("button", { name: "Notebook options", exact: true }).click();
  const select = page.getByRole("combobox", { name: "Page dialect", exact: true });
  await expect(page.locator("#mobile-menu-title")).toHaveText("Notebook");
  await expect(select).toBeVisible();
  await expect(page.getByRole("button", { name: "Done", exact: true })).toHaveCount(0);
  await expect(select).toHaveValue("obsidian");
  await expect(select.locator("option")).toHaveCount(14);
  await expect(select.locator("optgroup")).toHaveCount(4);
  for (const variant of ["gfm", "notdown", "rmarkdown", "quarto"]) {
    await select.selectOption(variant);
    await expect(select).toBeEnabled();
    await expect(page.locator("#mobile-workspace")).toHaveAttribute("data-variant", variant);
    await saved(page);
  }
  expect(await page.locator("#mobile-menu-items").evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("mobile-page-dialect.png"), fullPage: true });
  await page.getByRole("button", { name: "Close menu", exact: true }).click();
  await page.reload(); await expect(page.locator("#mobile-workspace")).toHaveAttribute("data-variant", "quarto");
  await expect(page.locator(".pm-document")).toContainText("Pending source survives dialect changes.");
  await page.getByRole("button", { name: "Notebook options", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Page dialect", exact: true })).toHaveValue("quarto");
  await page.getByRole("button", { name: "Close menu", exact: true }).click();
  const files = unzipSync(await exportZip(page));
  const markdown = Object.entries(files).find(([name, data]) => name.startsWith("pages/") && name.endsWith(".md") && Buffer.from(data).toString().includes("future_note: preserve"))!;
  const result = Buffer.from(markdown[1]).toString();
  expect(result).toContain("future: keep"); expect(result).toContain("future_note: preserve");
  expect(result).toContain("future_extension: true"); expect(result).toContain("variant: quarto");
  expect(result).toContain('<!-- unknown content -->\n\n```future\n::literal{keep=true}\n```');
  expect(result).toContain("Pending source survives dialect changes.");
});

test("mobile dialect switching stops on conflicts and retains both drafts", async ({ page, context }) => {
  await start(page); await create(page, "Dialect conflict"); await saved(page);
  const second = await context.newPage(); await start(second);
  await context.setOffline(true);
  await page.locator(".pm-document").fill("Other window saved text"); await saved(page);
  await second.locator(".pm-document").fill("Keep this pending dialect draft");
  await expect(second.locator("#mobile-recovery")).toBeVisible();
  await second.getByRole("button", { name: "Notebook options", exact: true }).click();
  const select = second.getByRole("combobox", { name: "Page dialect", exact: true });
  await select.selectOption("gfm");
  await expect(select).toBeEnabled(); await expect(select).toHaveValue("notdown");
  await expect(second.locator("#mobile-notice")).toContainText("dialect was not changed");
  await second.getByRole("button", { name: "Close menu", exact: true }).click();
  await expect(second.locator(".pm-document")).toContainText("Keep this pending dialect draft");
  await second.getByRole("button", { name: "Save draft as new page" }).click(); await saved(second);
  const files = unzipSync(await exportZip(second));
  const sources = Object.entries(files).filter(([name]) => name.startsWith("pages/")).map(([, data]) => Buffer.from(data).toString());
  expect(sources.some(source => source.includes("Other window saved text"))).toBe(true);
  expect(sources.some(source => source.includes("Keep this pending dialect draft"))).toBe(true);
  expect(Object.keys(files).some(name => /^\.history\/conflicts\/.*\.md$/.test(name))).toBe(true);
});

async function addDatabaseProperty(page: Page, name: string, type = "text", options?: string) {
  await page.getByRole("button", { name: "Add property", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add property", exact: true });
  await dialog.getByLabel("Property name", { exact: true }).fill(name);
  await dialog.getByRole("combobox", { name: "Property type", exact: true }).selectOption(type);
  if (options) await dialog.getByLabel("Options (one per line)").fill(options);
  await dialog.getByRole("button", { name: "Save property", exact: true }).click();
  await expect(dialog).toHaveCount(0);
}
async function addDatabaseRow(page: Page, title: string) {
  await page.getByRole("button", { name: "Add row", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add row", exact: true });
  await dialog.getByLabel("Row title", { exact: true }).fill(title);
  await dialog.getByRole("button", { name: "Create row", exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

test("mobile full-page databases create fields, records, saved views and edit record pages", async ({ page }, testInfo) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await start(page); await create(page, "Database parent");
  await page.locator(".pm-document").click();
  await page.getByRole("button", { name: "Insert block", exact: true }).click();
  await page.getByRole("button", { name: "Database - Full page", exact: true }).click();
  await expect(page.getByLabel("Database title", { exact: true })).toHaveValue("New database");
  await page.getByLabel("Database title", { exact: true }).fill("Mobile tasks");
  await addDatabaseProperty(page, "Note");
  await addDatabaseProperty(page, "State", "status", "To do\nDone");
  await addDatabaseRow(page, "First task");
  await page.getByLabel("Note: First task", { exact: true }).fill("Pending cell before opening record");
  await page.getByRole("button", { name: "Open First task", exact: true }).click();
  await expect(page.getByLabel("Page title", { exact: true })).toHaveValue("First task");
  await expect(page.getByLabel("Note: First task", { exact: true })).toHaveValue("Pending cell before opening record");
  await page.getByLabel("Note: First task", { exact: true }).fill("Edited in record");
  await page.getByRole("button", { name: "State: First task", exact: true }).click();
  await page.getByRole("option", { name: "Done", exact: true }).click();
  await page.locator(".pm-document").fill("Record body from phone");
  await page.getByRole("button", { name: "Back to database", exact: false }).click();
  await expect(page.getByLabel("Note: First task", { exact: true })).toHaveValue("Edited in record");
  await expect(page.getByRole("button", { name: "State: First task", exact: true })).toHaveText("Done");
  await page.getByRole("button", { name: "New view", exact: true }).click();
  await page.getByRole("dialog", { name: "Add a new view", exact: true }).getByRole("button", { name: "Table", exact: true }).click();
  const view = page.getByRole("dialog", { name: "New view", exact: true });
  await view.getByLabel("View name").fill("Done tasks");
  await view.getByRole("button", { name: "Create view", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Done tasks", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "View settings", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "View settings", exact: true });
  await settings.getByRole("combobox", { name: "Sort by", exact: true }).selectOption({ label: "Name" });
  await settings.getByRole("combobox", { name: "Filter property", exact: true }).selectOption({ label: "Note" });
  await settings.getByLabel("Contains", { exact: true }).fill("Edited");
  await settings.getByRole("button", { name: "Save view", exact: true }).click();
  await expect(settings).toHaveCount(0);
  await expect(page.locator("#mobile-databases")).toBeVisible();
  expect(await page.locator("#mobile-content").evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("mobile-full-database.png"), fullPage: true });
  await page.reload();
  await expect(page.getByLabel("Database title", { exact: true })).toHaveValue("Mobile tasks");
  await expect(page.getByRole("tab", { name: "Done tasks", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "Open pages", exact: true }).click();
  const rows = page.locator(".mobile-page-tree-row");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(1)).toHaveAttribute("data-depth", "1");
  await expect(rows.nth(2)).toHaveAttribute("data-depth", "2");
  await page.getByRole("button", { name: "First task", exact: true }).click();
  await expect(page.locator(".pm-document")).toContainText("Record body from phone");
  expect(errors).toEqual([]);
});

test("mobile inline databases edit in place, preserve source, open full pages and reload", async ({ page }, testInfo) => {
  await start(page); await create(page, "Inline parent");
  await page.locator(".pm-document").fill("Before inline database");
  await page.getByRole("button", { name: "Insert block", exact: true }).click();
  await page.getByRole("button", { name: "Database - Inline", exact: true }).click();
  const inline = page.getByRole("region", { name: "Inline database", exact: true });
  await expect(inline.locator(".database-table")).toBeVisible();
  await addDatabaseProperty(page, "Note"); await addDatabaseRow(page, "Inline task");
  await inline.getByLabel("Note: Inline task", { exact: true }).fill("Saved before source");
  await page.locator(".mobile-modes").getByRole("button", { name: "Source", exact: true }).click();
  await expect(page.locator(".cm-content")).toBeVisible();
  await expect(page.locator(".cm-content")).toContainText('inline="true"');
  await expect(page.locator(".cm-content")).toContainText("Before inline database");
  const body = await page.locator(".cm-content .cm-line").allTextContents();
  await page.locator(".mobile-modes").getByRole("button", { name: "Page", exact: true }).click();
  await expect(inline.getByLabel("Note: Inline task", { exact: true })).toHaveValue("Saved before source");
  expect(await page.locator("#mobile-content").evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("mobile-inline-database.png"), fullPage: true });
  await inline.locator(":scope > .pm-database-reference").click();
  await expect(page.locator("#mobile-databases")).toBeVisible();
  await page.getByLabel("Database title", { exact: true }).fill("Renamed inline");
  await page.getByRole("button", { name: "Open pages", exact: true }).click();
  await page.getByRole("button", { name: "Inline parent", exact: true }).click();
  await expect(inline.getByLabel("Note: Inline task", { exact: true })).toHaveValue("Saved before source");
  await page.locator(".mobile-modes").getByRole("button", { name: "Source", exact: true }).click();
  await expect(page.locator(".cm-content")).toBeVisible();
  expect(await page.locator(".cm-content .cm-line").allTextContents()).toEqual(body);
  await page.reload();
  await expect(inline.getByLabel("Note: Inline task", { exact: true })).toHaveValue("Saved before source");
});

test("mobile database conflicts retain pending cells and block navigation", async ({ page, context }) => {
  await start(page);
  await page.getByRole("button", { name: "Open pages", exact: true }).click();
  await page.getByRole("button", { name: "New database", exact: true }).click();
  await addDatabaseProperty(page, "Note"); await addDatabaseRow(page, "Conflict row");
  const other = await context.newPage(); await other.goto("/");
  await expect(other.getByLabel("Note: Conflict row", { exact: true })).toBeVisible();
  await other.getByLabel("Note: Conflict row", { exact: true }).fill("Other window value");
  await other.getByLabel("Note: Conflict row", { exact: true }).press("Tab");
  await expect(other.locator(".database-message")).toHaveText("Saved locally");
  const note = page.getByLabel("Note: Conflict row", { exact: true });
  await note.fill("Keep this conflicting draft");
  await page.getByRole("button", { name: "All databases", exact: true }).click();
  await expect(page.locator(".database-message")).toContainText(/preserved/i);
  await expect(note).toHaveValue("Keep this conflicting draft");
  await expect(page.getByLabel("Database title", { exact: true })).toBeVisible();
  await other.reload();
  await expect(other.getByLabel("Note: Conflict row", { exact: true })).toHaveValue("Other window value");
  await page.reload();
  await expect(page.getByLabel("Note: Conflict row", { exact: true })).toHaveValue("Keep this conflicting draft");
  await other.close();
});

test("mobile opens synced full-page and inline databases without rewriting imported references", async ({ page }) => {
  await start(page, "?databases=1");
  await page.getByRole("button", { name: "Open pages", exact: true }).click();
  await page.getByRole("button", { name: "Desktop database parent", exact: true }).click();
  const inline = page.getByRole("region", { name: "Inline database", exact: true });
  await expect(inline.getByLabel("Note: Imported row", { exact: true })).toHaveValue("Imported value");
  const initial = unzipSync(await exportZip(page));
  const parent = Object.entries(initial).find(([name, bytes]) => name.startsWith("pages/") && Buffer.from(bytes).toString().includes('future="preserve"'))!;
  expect(parent).toBeTruthy();
  await inline.getByLabel("Note: Imported row", { exact: true }).fill("Phone edit of imported row");
  await page.getByRole("link", { name: "Imported full", exact: true }).click();
  await expect(page.getByLabel("Database title", { exact: true })).toHaveValue("Imported full");
  await page.getByRole("button", { name: "Open pages", exact: true }).click();
  await page.getByRole("button", { name: "Desktop database parent", exact: true }).click();
  await expect(inline.getByLabel("Note: Imported row", { exact: true })).toHaveValue("Phone edit of imported row");
  const final = unzipSync(await exportZip(page));
  expect(Buffer.from(final[parent[0]]).toString()).toBe(Buffer.from(parent[1]).toString());
  const metadata = JSON.parse(Buffer.from(final["metadata.json"]).toString());
  expect(Object.values(metadata.databases).some((database: any) => database.futureDatabase?.keep)).toBe(true);
  expect(Object.values(metadata.pages).some((page: any) => page.futurePage?.keep)).toBe(true);
});

test("first launch requires an existing cloud notebook and cannot bypass setup", async ({ page }, testInfo) => {
  await page.goto("/"); await expect(page.locator("#mobile-app")).toHaveAttribute("data-ready", "true");
  const setup = page.locator(".mobile-sync-dialog[open]");
  await expect(setup).toBeVisible();
  await expect(setup.getByRole("button", { name: "Close", exact: true })).toBeHidden();
  await expect(page.locator(".pm-document")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Create a page", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape"); await expect(setup).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("notdown:back"))); await expect(setup).toBeVisible();
  await page.reload(); await expect(setup).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("mobile-cloud-onboarding.png"), fullPage: true });
});

test("first sync shows live resource and attachment progress, retains failure and retries", async ({ page }, testInfo) => {
  await page.goto("/"); await expect(page.locator("#mobile-app")).toHaveAttribute("data-ready", "true");
  const cloud = await (await page.request.post("/__mobile-test/notebook?progress=1")).json();
  const settings = page.getByRole("region", { name: "Cloud sync", exact: true });
  await settings.getByLabel("WebDAV server URL").fill(cloud.url);
  await settings.getByLabel("Remote notebook folder").fill(cloud.folder);
  await settings.getByLabel("WebDAV account", { exact: true }).fill(cloud.email);
  await settings.getByLabel("Application password", { exact: true }).fill(cloud.password);
  await settings.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(settings.getByRole("combobox", { name: "Cloud notebook", exact: true })).toHaveValue(/.+/);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const pattern = `**/*${cloud.delayedChunk}*`;
  await page.route(pattern, async route => { await gate; await route.abort("failed"); });
  try {
    await settings.getByRole("button", { name: "Enable sync" }).click();
    const progress = settings.locator("[data-sync-progress]");
    await expect(progress).toBeVisible();
    await expect(progress.locator("[data-sync-stage]")).toContainText("1.0 MiB / 2.0 MiB (49%)");
    await expect(progress.locator("[data-sync-counts]")).toContainText("Downloaded 2");
    await expect(progress.locator("[data-sync-current]")).toHaveText("assets/progress.bin");
    await expect(progress.getByRole("progressbar")).toHaveAttribute("value", "1048576");
    await expect(progress.locator("[data-sync-time]")).toContainText("Waiting for the current step", { timeout: 20000 });
    expect(await page.locator(".mobile-sync-dialog").evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("mobile-first-sync-progress.png"), fullPage: true });
    release();
    await expect(progress.locator("[data-sync-stage]")).toContainText("Sync stopped");
    await expect(progress.getByRole("progressbar")).toHaveAttribute("aria-busy", "false");
    await expect(settings.locator("[data-sync-feedback]")).toContainText("Cannot reach WebDAV");
    await expect(progress.locator("[data-sync-counts]")).toContainText("Downloaded 2");
    await page.unroute(pattern);
    await settings.getByRole("button", { name: "Sync now", exact: true }).click();
    await expect(page.locator(".mobile-sync-dialog[open]")).toHaveCount(0);
    await expect(page.locator(".pm-document")).toContainText("Progress test note");
    await page.getByRole("button", { name: "Notebook options" }).click();
    await page.getByRole("button", { name: "Cloud sync", exact: true }).click();
    await expect(settings.locator("[data-sync-stage]")).toHaveText("Sync completed");
    await expect(settings.getByRole("progressbar")).toHaveAttribute("value", "1");
    await expect(settings.locator("[data-sync-counts]")).toContainText("Downloaded 1");
  } finally { release(); }
});

test("an empty remote folder cannot be initialized as a new notebook on mobile", async ({ page }) => {
  await page.goto("/"); await expect(page.locator("#mobile-app")).toHaveAttribute("data-ready", "true");
  const cloud = await (await page.request.post("/__mobile-test/notebook")).json();
  const settings = page.getByRole("region", { name: "Cloud sync", exact: true });
  await settings.getByLabel("WebDAV server URL").fill(cloud.url);
  await settings.getByLabel("Remote notebook folder").fill(cloud.folder + "/not-created");
  await settings.getByLabel("WebDAV account", { exact: true }).fill(cloud.email);
  await settings.getByLabel("Application password", { exact: true }).fill(cloud.password);
  await settings.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(settings.locator("[data-sync-feedback]")).toContainText("Create and sync this notebook on your computer first");
  await expect(settings.getByLabel("New notebook name")).toBeHidden();
  await settings.getByRole("button", { name: "Enable sync" }).click();
  await expect(settings.locator("[data-sync-feedback]")).toContainText("Choose an existing cloud notebook");
  await expect(page.locator(".pm-document")).toHaveCount(0);
  await page.reload(); await expect(page.locator(".mobile-sync-dialog[open]")).toBeVisible();
});

test("disconnect returns to required cloud setup without exposing a standalone editor", async ({ page }) => {
  await start(page); await create(page, "Cloud-linked note"); await saved(page);
  await page.getByRole("button", { name: "Notebook options" }).click();
  await page.getByRole("button", { name: "Cloud sync", exact: true }).click();
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
  await expect(page.locator("#mobile-app")).toHaveAttribute("data-connected", "false");
  await expect(page.locator(".mobile-sync-dialog[open]")).toBeVisible();
  await expect(page.locator(".pm-document")).toHaveCount(0);
  await page.reload(); await expect(page.locator(".mobile-sync-dialog[open]")).toBeVisible();
});

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

test("ZIP restore cannot create a separate mobile notebook", async ({ page }) => {
  await start(page); await create(page, "Existing notebook page"); await saved(page);
  const source = "# Imported\n\nFrom another device.\n";
  const entries = { "pages/from-desktop.md": Buffer.from(source), "attachments/custom.bin": Buffer.from([0, 255, 37]), "future.json": Buffer.from('{"keep":true}') };
  await page.locator("#mobile-import").setInputFiles({ name: "Desktop-vault.zip", mimeType: "application/zip", buffer: Buffer.from(zipSync(entries)) });
  await expect(page.locator("#mobile-notice")).toContainText("Restore vault ZIP backups on your computer");
  await expect(page.getByRole("textbox", { name: "Page title" })).toHaveValue("Existing notebook page");
  await expect(page.getByRole("combobox", { name: "Notebook", exact: true })).toHaveCount(0);
});

test("two windows retain a stale draft and create a recoverable copy", async ({ page, context }) => {
  await start(page); await create(page, "Shared note"); await saved(page);
  const second = await context.newPage(); await start(second);
  // Keep the second window stale deliberately; foreground cloud refresh may otherwise update it before typing.
  await context.setOffline(true);
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

test("keyboard dismissal keeps the current page and saves document, source and title input", async ({ page }) => {
  await start(page); await create(page, "Keyboard note");
  const editor = page.locator(".pm-document");
  await expect(page.getByRole("button", { name: "Hide keyboard", exact: true }).locator("svg")).toBeVisible();
  await editor.click(); await page.keyboard.insertText("待保存的正文");
  await page.getByRole("button", { name: "Hide keyboard", exact: true }).click();
  await expect(editor).not.toBeFocused(); await saved(page);
  await expect(page.locator("#mobile-pages")).not.toBeVisible();
  await page.locator('[data-view="source"]').click();
  const source = page.locator(".cm-content");
  await source.click(); await page.keyboard.press("Control+End"); await page.keyboard.insertText("\nSource draft");
  await page.evaluate(() => window.dispatchEvent(new Event("notdown:back")));
  await expect(source).not.toBeFocused(); await saved(page);
  await expect(page.locator("#mobile-pages")).not.toBeVisible();
  await page.getByRole("textbox", { name: "Page title", exact: true }).fill("键盘收起后保留标题");
  await page.evaluate(() => window.dispatchEvent(new Event("notdown:keyboard-dismiss")));
  await expect(page.getByRole("textbox", { name: "Page title", exact: true })).not.toBeFocused(); await saved(page);
  await page.reload(); await expect(editor).toContainText("待保存的正文"); await expect(editor).toContainText("Source draft");
  await expect(page.getByRole("textbox", { name: "Page title", exact: true })).toHaveValue("键盘收起后保留标题");
});

test("mobile page list follows desktop order, nests descendants and retains collapse state after search", async ({ page }, testInfo) => {
  await start(page, "?tree=1");
  await page.getByRole("button", { name: "Open pages", exact: true }).click();
  const titles = page.locator(".mobile-page-row > span:last-child");
  await expect(titles).toHaveText(["A first root", "First child", "Grandchild", "Second child", "Z last root"]);
  expect(await page.locator(".mobile-page-tree-row").evaluateAll(rows => rows.map(row => (row as HTMLElement).dataset.depth))).toEqual(["0", "1", "2", "1", "0"]);
  await page.screenshot({ path: testInfo.outputPath("mobile-page-hierarchy.png"), fullPage: true });
  const toggle = page.getByRole("button", { name: "Expand or collapse A first root", exact: true });
  await toggle.click(); await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(titles).toHaveText(["A first root", "Z last root"]);
  const search = page.getByRole("searchbox", { name: "Search pages", exact: true });
  await search.fill("Grandchild content"); await expect(titles).toHaveText(["Grandchild"]);
  await page.evaluate(() => window.dispatchEvent(new Event("notdown:back")));
  await expect(search).not.toBeFocused(); await expect(page.locator("#mobile-pages")).toBeVisible();
  await search.fill(""); await expect(titles).toHaveText(["A first root", "Z last root"]);
  await toggle.click(); await expect(titles).toHaveText(["A first root", "First child", "Grandchild", "Second child", "Z last root"]);
  await page.getByRole("button", { name: "Grandchild", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Page title", exact: true })).toHaveValue("Grandchild");
  await expect(page.locator(".pm-document")).toContainText("Grandchild content");
});

test("editing needs no API connection and toolbar fits narrow and keyboard-sized viewports", async ({ page }) => {
  await page.route("**/api/**", route => route.abort());
  await start(page); await create(page, "Offline");
  await page.locator(".pm-document").click(); await page.keyboard.insertText("No Node server required."); await saved(page);
  await page.setViewportSize({ width: 320, height: 450 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const toolbar = await page.locator(".mobile-tools").boundingBox();
  expect(toolbar).not.toBeNull(); expect(toolbar!.y + toolbar!.height).toBeLessThanOrEqual(451);
  for (const button of await page.locator(".mobile-tools > button:visible").all()) {
    const bounds = (await button.boundingBox())!;
    expect(bounds.width).toBeGreaterThanOrEqual(44); expect(bounds.height).toBeGreaterThanOrEqual(44);
    expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
  }
  for (const button of await page.locator('.mobile-tool-scroll[data-tools-level="main"] button').all()) {
    const bounds = (await button.boundingBox())!;
    expect(bounds.width).toBeGreaterThanOrEqual(44); expect(bounds.height).toBeGreaterThanOrEqual(44);
  }
  await page.screenshot({ path: "test-results/mobile-narrow.png", fullPage: true });
});

test("page switching reads one Markdown file and reuses the unchanged page drawer", async ({ page }) => {
  await start(page, "?tree=1");
  await page.getByRole("button", { name: "Open pages", exact: true }).click();
  const row = await page.getByRole("button", { name: "Grandchild", exact: true }).elementHandle();
  await page.getByRole("button", { name: "Close pages", exact: true }).click();
  await page.getByRole("button", { name: "Open pages", exact: true }).click();
  expect(await row!.evaluate(element => element.isConnected)).toBe(true);
  await page.evaluate(() => {
    const reads: string[] = []; (window as any).__pageReads = reads;
    const get = IDBObjectStore.prototype.get;
    IDBObjectStore.prototype.get = function(key) {
      if (typeof key === "string" && /\/pages\/[^/]+\.md$/.test(key)) reads.push(key);
      return get.call(this, key);
    };
  });
  await page.getByRole("button", { name: "Grandchild", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Page title", exact: true })).toHaveValue("Grandchild");
  await expect(page.locator(".pm-document")).toContainText("Grandchild content");
  // IndexedDB stat and content reads both request the same file entry.
  expect(await page.evaluate(() => [...new Set((window as any).__pageReads)].length)).toBe(1);
});

test("page drawer refreshes hierarchy changes made in the source metadata", async ({ page }) => {
  await start(page, "?tree=1");
  await page.getByRole("button", { name: "Open pages", exact: true }).click();
  const parent = await page.getByRole("button", { name: "A first root", exact: true }).getAttribute("data-page-id");
  await page.getByRole("button", { name: "Z last root", exact: true }).click();
  await page.locator('[data-view="source"]').click();
  await page.locator(".cm-content").click(); await page.keyboard.press("Control+Home");
  await page.keyboard.insertText(`---\nparent: ${parent}\n---\n`);
  await page.getByRole("button", { name: "Hide keyboard", exact: true }).click(); await saved(page);
  await page.getByRole("button", { name: "Open pages", exact: true }).click();
  await expect(page.getByRole("button", { name: "Z last root", exact: true }).locator("..")).toHaveAttribute("data-depth", "1");
});

test("switching pages captures pending source input and keeps it after reopening", async ({ page }) => {
  await start(page, "?tree=1");
  await page.getByRole("button", { name: "Open pages", exact: true }).click();
  await page.getByRole("button", { name: "Grandchild", exact: true }).click();
  await page.locator('[data-view="source"]').click();
  await page.locator(".cm-content").click(); await page.keyboard.press("Control+End");
  await page.keyboard.insertText("\n切页前的待保存输入");
  await page.getByRole("button", { name: "Open pages", exact: true }).click();
  await page.getByRole("button", { name: "Second child", exact: true }).click();
  await expect(page.locator(".pm-document")).toContainText("Second child content");
  await expect(page.locator(".pm-document")).not.toContainText("切页前的待保存输入");
  await page.getByRole("button", { name: "Open pages", exact: true }).click();
  await page.getByRole("button", { name: "Grandchild", exact: true }).click();
  await expect(page.locator(".pm-document")).toContainText("切页前的待保存输入");
  await page.reload(); await expect(page.locator(".pm-document")).toContainText("切页前的待保存输入");
});

test("slow attachments load after the text and cannot block editing or another page", async ({ page }) => {
  await start(page); await create(page, "Image note");
  await page.locator(".pm-document").click(); await page.keyboard.insertText("Text before the image");
  await page.getByRole("button", { name: "Insert image", exact: true }).click();
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6VvAAAAAASUVORK5CYII=", "base64");
  await page.locator("#mobile-image").setInputFiles({ name: "slow.png", mimeType: "image/png", buffer: png });
  await expect(page.locator(".pm-document img")).toHaveAttribute("src", /^blob:/); await saved(page);
  await create(page, "Plain note"); await saved(page); await page.reload();
  await expect(page.getByRole("textbox", { name: "Page title", exact: true })).toHaveValue("Plain note");
  await page.evaluate(() => {
    const releases: (() => void)[] = []; (window as any).__assetReleases = releases;
    const get = IDBObjectStore.prototype.get;
    (window as any).__restoreAssetGet = () => { IDBObjectStore.prototype.get = get; };
    IDBObjectStore.prototype.get = function(key) {
      const request = get.call(this, key);
      if (typeof key === "string" && /\/assets\/[^/]+\.png$/.test(key)) {
        Object.defineProperty(request, "onsuccess", { set(handler) {
          request.addEventListener("success", event => releases.push(() => handler.call(request, event)));
        } });
      }
      return request;
    };
  });
  await page.getByRole("button", { name: "Open pages", exact: true }).click();
  await page.getByRole("button", { name: "Image note", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Page title", exact: true })).toHaveValue("Image note");
  await expect(page.locator(".pm-document")).toContainText("Text before the image");
  await expect.poll(() => page.evaluate(() => (window as any).__assetReleases.length)).toBeGreaterThan(0);
  await page.locator(".pm-document p").first().click(); await page.keyboard.press("Home"); await page.keyboard.insertText("Edited while loading. ");
  await page.getByRole("button", { name: "Open pages", exact: true }).click();
  await page.getByRole("button", { name: "Plain note", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Page title", exact: true })).toHaveValue("Plain note");
  await page.evaluate(() => {
    (window as any).__restoreAssetGet();
    (window as any).__assetReleases.splice(0).forEach((release: () => void) => release());
  });
  await page.getByRole("button", { name: "Open pages", exact: true }).click();
  await page.getByRole("button", { name: "Image note", exact: true }).click();
  await expect(page.locator(".pm-document img")).toHaveAttribute("src", /^blob:/);
  await expect(page.locator(".pm-document")).toContainText("Edited while loading.");
  await page.locator('[data-view="source"]').click();
  await expect(page.locator(".cm-content")).toContainText("assets/");
  await expect(page.locator(".cm-content")).not.toContainText("blob:");
});

async function importTouchNote(page: Page, source: string) {
  await start(page);
  await page.locator("#mobile-import").setInputFiles({ name: "Touch controls.md", mimeType: "text/markdown", buffer: Buffer.from(source) });
  await expect(page.locator(".pm-document")).toBeVisible();
  await saved(page);
}
async function blockAction(page: Page, name: string) {
  await page.getByRole("button", { name: "Block actions", exact: true }).tap();
  await page.locator("#mobile-menu").getByRole("button", { name, exact: true }).tap();
}
async function selectText(page: Page, text: string) {
  await page.locator(".pm-document p").filter({ hasText: text }).first().evaluate(element => {
    const range = document.createRange(); range.selectNodeContents(element);
    const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    (element.closest("[contenteditable=true]") as HTMLElement).focus();
    document.dispatchEvent(new Event("selectionchange"));
  });
}
test("touch toolbar inserts separately from conversion and supports block actions with undo", async ({ page }) => {
  await importTouchNote(page, "First block\n\nSecond block\n");
  await page.locator(".pm-document p").first().tap();
  await expect(page.locator(".pm-block-handle, .pm-block-add, .pm-selection-box")).toHaveCount(0);
  await blockAction(page, "Duplicate block");
  await expect(page.locator(".pm-document > p")).toHaveText(["First block", "First block", "Second block"]);
  await page.getByRole("button", { name: "Undo", exact: true }).tap();
  await expect(page.locator(".pm-document > p")).toHaveText(["First block", "Second block"]);
  await page.locator(".pm-document p").first().tap();
  await blockAction(page, "Move down");
  await expect(page.locator(".pm-document > p")).toHaveText(["Second block", "First block"]);
  await page.getByRole("button", { name: "Insert block", exact: true }).tap();
  await page.locator("#mobile-tool-panel").getByRole("button", { name: "Heading 2", exact: true }).tap();
  await page.keyboard.insertText("New heading");
  await expect(page.locator(".pm-document h2")).toHaveText("New heading");
  await expect(page.locator(".pm-document > p")).toHaveText(["Second block", "First block"]);
  await blockAction(page, "Turn into…");
  await page.locator("#mobile-tool-panel").getByRole("button", { name: "Text", exact: true }).tap();
  await expect(page.locator(".pm-document > p")).toHaveText(["Second block", "First block", "New heading"]);
  await blockAction(page, "Delete block");
  await expect(page.locator(".pm-document > p")).toHaveText(["Second block", "First block"]);
  await saved(page); await page.reload();
  await expect(page.locator(".pm-document > p")).toHaveText(["Second block", "First block"]);
});
test("touch formatting keeps the selected text, toggles marks, and source disables block actions", async ({ page }) => {
  await importTouchNote(page, "Format this\n\nKeep this\n");
  await selectText(page, "Format this");
  await page.getByRole("button", { name: "Text formatting", exact: true }).tap();
  await page.locator(".mobile-tools").getByRole("button", { name: "Bold", exact: true }).tap();
  await expect(page.locator(".pm-document strong")).toHaveText("Format this");
  await expect(page.locator(".pm-selection-menu")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Bold", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".pm-document")).toBeFocused();
  await page.getByRole("button", { name: "Bold", exact: true }).tap();
  await expect(page.locator(".pm-document strong")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Bold", exact: true })).toHaveAttribute("aria-pressed", "false");
  await page.locator('[data-view="source"]').tap();
  await expect(page.getByRole("button", { name: "Block actions", exact: true })).toBeDisabled();
  await expect(page.locator(".cm-content")).toContainText("Format this");
  await page.locator('[data-view="document"]').tap();
  await page.locator(".pm-document p").last().tap(); await page.keyboard.press("End"); await page.keyboard.insertText("/");
  await expect(page.locator("#mobile-menu[open]")).toHaveCount(0);
});
test("font toolbar stays above the keyboard and combines styles for subsequent typing", async ({ page }, testInfo) => {
  await importTouchNote(page, "Write here\n\nUntouched\n");
  await page.setViewportSize({ width: 393, height: 460 });
  await page.locator(".pm-document > p").first().tap(); await page.keyboard.press("End");
  const tap = (name: string) => page.getByRole("button", { name, exact: true }).tap();
  await tap("Text formatting");
  await expect(page.locator("#mobile-menu[open]")).toHaveCount(0);
  await tap("Bold"); await tap("Italic");
  await expect(page.getByRole("button", { name: "Bold", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Italic", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".pm-document")).toBeFocused();
  await page.keyboard.insertText("Both");
  await expect(page.locator(".pm-document strong em, .pm-document em strong")).toHaveText("Both");
  await expect(page.locator("#mobile-notice")).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath("mobile-font-toolbar.png"), scale: "css" });
  const back = (await page.getByRole("button", { name: "Back to editing tools", exact: true }).boundingBox())!;
  expect(back.x).toBeLessThan(10);
  await tap("Bold"); await tap("Italic"); await page.keyboard.insertText(" Plain");
  await tap("Back to editing tools");
  await expect(page.locator(".pm-document")).toBeFocused();
  await expect(page.getByRole("button", { name: "Back to editing tools", exact: true })).toBeHidden();
  await saved(page); await page.reload();
  await expect(page.locator(".pm-document strong em, .pm-document em strong")).toHaveText("Both");
  await expect(page.locator(".pm-document > p").first()).toContainText("Both Plain");
});

test("mobile italic displays CJK emphasis and colors can be chosen and reset independently", async ({ page }, testInfo) => {
  await importTouchNote(page, '<span color="yellow_bg" custom="keep">中文样式</span>\n\nUntouched\n');
  await page.setViewportSize({ width: 320, height: 460 });
  await selectText(page, "中文样式");
  const tap = (name: string) => page.getByRole("button", { name, exact: true }).tap();
  const palette = page.locator("#mobile-tool-panel");
  const choose = async (kind: string, color: string) => {
    await tap(kind);
    await palette.getByRole("button", { name: color, exact: true }).tap();
    await expect(palette).toBeHidden();
    await expect(page.locator(".pm-document")).toBeFocused();
  };
  await tap("Text formatting"); await tap("Italic");
  await expect(page.locator(".pm-document em")).toHaveText("中文样式");
  await expect(page.locator(".pm-document em")).toHaveCSS("font-style", "italic");
  await expect(page.locator(".pm-document em")).toHaveCSS("font-synthesis", "style");
  await choose("Text color", "Red text");
  const both = page.locator('.pm-document [data-text-color="red"][data-bg-color="yellow"]');
  await expect(both).toHaveText("中文样式");
  await expect(both).toHaveCSS("color", "rgb(212, 76, 71)");
  await tap("Background color");
  await expect(palette.getByRole("button", { name: "Yellow background", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(palette.locator(".mobile-color-choices button")).toHaveCount(10);
  expect(await palette.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await expect(page.locator("#mobile-notice")).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath("mobile-color-palette.png"), scale: "css" });
  await palette.getByRole("button", { name: "Blue background", exact: true }).tap();
  await expect(page.locator('.pm-document [data-text-color="red"][data-bg-color="blue"]')).toHaveText("中文样式");
  await choose("Text color", "Default text");
  await expect(page.locator('.pm-document [data-text-color=""][data-bg-color="blue"]')).toHaveText("中文样式");
  await choose("Background color", "Default background");
  await expect(page.locator(".pm-document [data-bg-color]")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Text color", exact: true })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("button", { name: "Background color", exact: true })).toHaveAttribute("aria-pressed", "false");
  await tap("Back to editing tools"); await tap("Undo");
  await expect(page.locator('.pm-document [data-bg-color="blue"]')).toHaveText("中文样式");
  await tap("Redo"); await expect(page.locator(".pm-document [data-bg-color]")).toHaveCount(0);
  await page.locator('[data-view="source"]').tap();
  await expect(page.locator(".cm-content")).toContainText('custom="keep"');
  await expect(page.locator(".cm-content")).not.toContainText("color=");
  await page.locator('[data-view="document"]').tap();
  await saved(page); await page.reload();
  await expect(page.locator(".pm-document em")).toHaveText("中文样式");
  await expect(page.locator(".pm-document > p").last()).toHaveText("Untouched");
});

test("mobile caret colors can change and stop without changing previously typed text", async ({ page }) => {
  await importTouchNote(page, "Start\n");
  const editor = page.locator(".pm-document");
  await editor.tap(); await page.keyboard.press("End");
  const tap = (name: string) => page.getByRole("button", { name, exact: true }).tap();
  const choose = async (kind: string, color: string) => {
    await tap(kind); await page.locator("#mobile-tool-panel").getByRole("button", { name: color, exact: true }).tap();
  };
  await tap("Text formatting");
  await choose("Text color", "Green text"); await choose("Background color", "Purple background");
  await page.keyboard.insertText("Both");
  await expect(editor.locator('[data-text-color="green"][data-bg-color="purple"]')).toHaveText("Both");
  await choose("Text color", "Default text"); await page.keyboard.insertText("Background");
  await expect(editor.locator('[data-text-color=""][data-bg-color="purple"]')).toHaveText("Background");
  await choose("Background color", "Default background"); await page.keyboard.insertText("Plain");
  await expect(editor.locator("p")).toHaveText("StartBothBackgroundPlain");
  expect(await editor.locator("p").evaluate(element => element.lastChild?.nodeType)).toBe(3);
  await saved(page); await page.reload();
  await expect(editor.locator('[data-text-color="green"][data-bg-color="purple"]')).toHaveText("Both");
  await expect(editor.locator('[data-text-color=""][data-bg-color="purple"]')).toHaveText("Background");
});

test("mobile v2 editing saves ordinary headings, lists and styles using Notion Markdown", async ({ page }) => {
  await start(page, "?v2=1");
  await expect(page.locator(".pm-document")).toContainText("Style me");
  await page.locator(".pm-document h2").tap(); await page.keyboard.press("End"); await page.keyboard.insertText("!");
  await page.locator(".pm-document li p").first().tap(); await page.keyboard.press("End"); await page.keyboard.insertText("!");
  await selectText(page, "Style me");
  await page.getByRole("button", { name: "Text formatting", exact: true }).tap();
  await page.getByRole("button", { name: "Bold", exact: true }).tap();
  await page.getByRole("button", { name: "Italic", exact: true }).tap();
  await page.locator('[data-view="source"]').tap();
  const source = page.locator(".cm-content");
  await expect(source).toContainText("## Heading!");
  await expect(source).toContainText("- First!");
  await expect(source).toContainText("***Style me***");
  await expect(source).not.toContainText("<h2>"); await expect(source).not.toContainText("<ul>");
  await expect(source).not.toContainText("<b>"); await expect(source).not.toContainText("<i>");
  await saved(page); await page.reload();
  await page.locator('[data-view="document"]').tap();
  await expect(page.locator(".pm-document h2")).toHaveText("Heading!");
  await expect(page.locator(".pm-document strong em, .pm-document em strong")).toHaveText("Style me");
});

test("primary toolbar moves list subtrees, indents and outdents with undo and reload", async ({ page }) => {
  await importTouchNote(page, "- First\n- Second\n  - Child\n- Third\n");
  const tap = (name: string) => page.getByRole("button", { name, exact: true }).tap();
  const rows = page.locator(".pm-document > ul > li");
  await rows.nth(1).locator("p").first().tap();
  await tap("Move up");
  await expect(rows.first()).toContainText("Second"); await expect(rows.first().locator("ul li")).toHaveText("Child");
  await expect(page.getByRole("button", { name: "Move up", exact: true })).toBeDisabled();
  await tap("Move down"); await tap("Increase indent");
  await expect(rows).toHaveCount(2);
  await expect(rows.first().locator("ul li").first()).toContainText("Second");
  await expect(page.locator(".pm-document")).toBeFocused();
  await tap("Decrease indent"); await expect(rows).toHaveCount(3);
  await tap("Undo"); await expect(rows).toHaveCount(2);
  await tap("Redo"); await expect(rows).toHaveCount(3);
  await saved(page); await page.reload();
  await expect(rows.nth(1)).toContainText("Second");
  await expect(rows.nth(1).locator("ul li")).toHaveText("Child");
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
});

test("conversion grid preserves content and its keyboard button returns to typing", async ({ page }, testInfo) => {
  await importTouchNote(page, "Convert this\n\nKeep this\n");
  await page.locator(".pm-document > p").first().tap();
  await page.getByRole("button", { name: "Turn into", exact: true }).tap();
  const panel = page.getByRole("region", { name: "Turn into", exact: true });
  await expect(panel).toBeVisible(); await expect(page.locator(".pm-document")).not.toBeFocused();
  const text = (await panel.getByRole("button", { name: "Text", exact: true }).boundingBox())!;
  const h1 = (await panel.getByRole("button", { name: "Heading 1", exact: true }).boundingBox())!;
  expect(h1.y).toBe(text.y); expect(h1.x).toBeGreaterThan(text.x + text.width);
  await page.screenshot({ path: testInfo.outputPath("mobile-conversion-grid.png"), scale: "css" });
  await page.getByRole("button", { name: "Show keyboard", exact: true }).tap();
  await expect(panel).toBeHidden(); await expect(page.locator(".pm-document")).toBeFocused();
  await page.getByRole("button", { name: "Turn into", exact: true }).tap();
  await panel.getByRole("button", { name: "Heading 4", exact: true }).tap();
  await expect(page.locator(".pm-document > h4")).toHaveText("Convert this");
  await expect(page.locator(".pm-document > p")).toHaveText("Keep this");
  await page.getByRole("button", { name: "Undo", exact: true }).tap();
  await expect(page.locator(".pm-document > p")).toHaveText(["Convert this", "Keep this"]);
  await page.locator('[data-view="source"]').tap();
  for (const name of ["Turn into", "Move up", "Move down", "Increase indent", "Decrease indent"])
    await expect(page.getByRole("button", { name, exact: true })).toBeDisabled();
});

test("toolbar swipes horizontally while the keyboard button remains fixed", async ({ page }) => {
  await importTouchNote(page, "Toolbar swipe\n");
  await page.setViewportSize({ width: 320, height: 450 });
  await page.locator(".pm-document > p").tap();
  const row = page.locator('[data-tools-level="main"]');
  const bounds = (await row.boundingBox())!;
  const keyboard = page.getByRole("button", { name: "Hide keyboard", exact: true });
  const before = (await keyboard.boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: bounds.x + bounds.width - 10, y: bounds.y + 22 }] });
  for (let x = bounds.x + bounds.width - 30; x > bounds.x + 15; x -= 30)
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: bounds.y + 22 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect.poll(() => row.evaluate(element => element.scrollLeft)).toBeGreaterThan(60);
  expect((await keyboard.boundingBox())!.x).toBe(before.x);
  await expect(page.locator(".pm-document")).toBeFocused();
  await expect(page.locator("#mobile-tool-panel")).toBeHidden();
  await cdp.detach();
});

test("touch table controls use the bottom sheet and stacked columns preserve source", async ({ page }, testInfo) => {
  const source = '<columns>\n<column>\nLeft text\n</column>\n<column>\nRight text\n</column>\n</columns>\n\n| A | B |\n| --- | --- |\n| C | D |\n';
  await importTouchNote(page, source);
  // Node-view wrappers use sections for both official and extended columns.
  const sections = page.locator(".note-columns section");
  await expect(sections).toHaveCount(2);
  const first = (await sections.first().boundingBox())!, second = (await sections.last().boundingBox())!;
  expect(second.y).toBeGreaterThanOrEqual(first.y + first.height);
  await expect(page.locator(".pm-column-resizer:visible, .pm-table-controls")).toHaveCount(0);
  await page.locator(".pm-document td").filter({ hasText: "C" }).tap();
  await blockAction(page, "Insert row below");
  await expect(page.locator(".pm-document tr")).toHaveCount(3);
  await page.getByRole("button", { name: "Undo", exact: true }).tap();
  await expect(page.locator(".pm-document tr")).toHaveCount(2);
  await page.getByRole("button", { name: "Hide keyboard", exact: true }).tap();
  await page.getByRole("button", { name: "Block actions", exact: true }).tap();
  await page.screenshot({ path: testInfo.outputPath("touch-block-sheet.png"), fullPage: true });
  await page.getByRole("button", { name: "Close menu", exact: true }).tap();
  await page.locator('[data-view="source"]').tap();
  await expect(page.locator(".cm-content")).toContainText("<columns>");
  await expect(page.locator(".cm-content")).toContainText("Right text");
});
test("keyboard-hidden long press drags blocks with a drop line and keeps the keyboard closed", async ({ page }, testInfo) => {
  await importTouchNote(page, "First drag\n\nSecond drag\n\nThird drag\n");
  await page.getByRole("button", { name: "Hide keyboard", exact: true }).tap();
  const cdp = await page.context().newCDPSession(page);
  const first = (await page.locator(".pm-document > p").first().boundingBox())!;
  const last = (await page.locator(".pm-document > p").last().boundingBox())!;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: first.x + 45, y: first.y + 12 }] });
  await expect(page.locator(".pm-touch-drag-preview")).toBeVisible();
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: last.x + 45, y: last.y + last.height - 2 }] });
  await expect(page.locator(".pm-touch-drop-line")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("touch-block-drag.png"), scale: "css" });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(page.locator(".pm-document > p")).toHaveText(["Second drag", "Third drag", "First drag"]);
  expect(await page.locator(".pm-document").evaluate(element => element.contains(document.activeElement))).toBe(false);
  await expect(page.locator(".pm-touch-drag-preview")).toBeHidden();
  await page.getByRole("button", { name: "Undo", exact: true }).tap();
  await expect(page.locator(".pm-document > p")).toHaveText(["First drag", "Second drag", "Third drag"]);
  await cdp.detach();
});
test("scrolling, cancelled gestures and editing focus do not reorder touch blocks", async ({ page }) => {
  await importTouchNote(page, Array.from({ length: 30 }, (_, i) => `Row ${i}`).join("\n\n") + "\n");
  await page.getByRole("button", { name: "Hide keyboard", exact: true }).tap();
  const cdp = await page.context().newCDPSession(page);
  const first = (await page.locator(".pm-document > p").first().boundingBox())!;
  const point = { x: first.x + 45, y: first.y + 12 };
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: point.x, y: point.y - 50 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(page.locator(".pm-touch-drag-preview")).toBeHidden();
  await page.locator(".pm-document > p").first().scrollIntoViewIfNeeded();
  const rect = (await page.locator(".pm-document > p").first().boundingBox())!;
  const startPoint = { x: rect.x + 45, y: rect.y + 12 };
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [startPoint] });
  await expect(page.locator(".pm-touch-drag-preview")).toBeVisible();
  await cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
  await expect(page.locator(".pm-touch-drag-preview")).toBeHidden();
  await page.locator(".pm-document > p").first().tap();
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [startPoint] });
  await page.waitForTimeout(600);
  await expect(page.locator(".pm-touch-drag-preview")).toBeHidden();
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(page.locator(".pm-document > p").first()).toHaveText("Row 0");
  await expect(page.locator(".pm-document > p")).toHaveCount(30);
  await cdp.detach();
});

test("native keyboard state allows dragging a focused list row with all descendants", async ({ page }) => {
  await importTouchNote(page, "- Parent row\n  - Child row\n- Sibling row\n\nTail\n");
  const parent = page.locator(".pm-document li > .pm-item-content > p").filter({ hasText: "Parent row" });
  const sibling = page.locator(".pm-document li > .pm-item-content > p").filter({ hasText: "Sibling row" });
  await parent.tap();
  const cdp = await page.context().newCDPSession(page);
  const first = (await parent.boundingBox())!, last = (await sibling.boundingBox())!;
  const point = { x: first.x + 35, y: first.y + 12 };
  // Capacitor keeps the editor focused when the system dismisses the IME.
  await page.evaluate(() => window.dispatchEvent(Object.assign(new Event("notdown:keyboard-state"), { visible: false })));
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
  await expect(page.locator(".pm-touch-drag-preview")).toBeVisible();
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: last.x + 35, y: last.y + last.height - 2 }] });
  await expect(page.locator(".pm-touch-drop-line")).toBeVisible();
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  const rows = page.locator(".pm-document > ul > li");
  await expect(rows.first()).toHaveText("Sibling row");
  await expect(rows.last()).toContainText("Parent row");
  await expect(rows.last().locator("ul li")).toHaveText("Child row");
  await saved(page); await page.reload();
  await expect(rows.first()).toHaveText("Sibling row");
  await expect(rows.last().locator("ul li")).toHaveText("Child row");
  await cdp.detach();
});

test("long drag scrolls near the edge and a second finger cancels without changing source", async ({ page }) => {
  await importTouchNote(page, Array.from({ length: 45 }, (_, i) => `Drag row ${i}`).join("\n\n") + "\n");
  await page.getByRole("button", { name: "Hide keyboard", exact: true }).tap();
  const cdp = await page.context().newCDPSession(page);
  const first = (await page.locator(".pm-document > p").first().boundingBox())!;
  const content = (await page.locator("#mobile-content").boundingBox())!;
  const point = { x: first.x + 35, y: content.y + content.height - 12, id: 1 };
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: first.x + 35, y: first.y + 12, id: 1 }] });
  await expect(page.locator(".pm-touch-drag-preview")).toBeVisible();
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [point] });
  await expect.poll(() => page.locator("#mobile-content").evaluate(element => element.scrollTop)).toBeGreaterThan(80);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point, { x: 220, y: 40, id: 2 }] });
  await expect(page.locator(".pm-touch-drag-preview")).toBeHidden();
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(page.locator(".pm-document > p").first()).toHaveText("Drag row 0");
  await expect(page.locator(".pm-document > p")).toHaveCount(45);
  await cdp.detach();
});
