import { test, expect } from "@playwright/test";

test("settings header stays visible; Escape, backdrop and close button dismiss settings", async ({ page }) => {
  await page.goto("/");
  const open = () => page.locator('#sidebar [data-action="settings"]').click();
  await open();
  const dialog = page.getByRole("dialog", { name: "Workspace settings" });
  const heading = dialog.locator(".dialog-heading");
  await expect(dialog.locator(".settings-body .runtime-settings")).toBeAttached();
  await expect(dialog.locator(":scope > .settings-section")).toHaveCount(0);
  const before = await heading.boundingBox();
  await dialog.locator(".settings-body").evaluate(element => element.scrollTop = element.scrollHeight);
  await expect(heading.getByRole("button", { name: "Close", exact: true })).toBeInViewport();
  expect((await heading.boundingBox())!.y).toBe(before!.y);
  await page.screenshot({ path: ".run/logs/settings-fixed-header.png" });
  await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0);
  await open(); await page.mouse.click(5, 5); await expect(dialog).toHaveCount(0);
  await open(); await dialog.getByRole("button", { name: "Close", exact: true }).click(); await expect(dialog).toHaveCount(0);
});

test("sidebar shortcuts can be hidden, persist after reload, and be restored", async ({ page }) => {
  await page.goto("/"); await page.locator('#sidebar [data-action="settings"]').click();
  const preferences = page.locator(".sidebar-preferences");
  await preferences.getByLabel("Attachments", { exact: true }).uncheck();
  await preferences.getByLabel("Search", { exact: true }).uncheck();
  await page.keyboard.press("Escape");
  await expect(page.locator('#sidebar [data-action="attachments"]')).toBeHidden();
  await expect(page.locator('#sidebar [data-action="search"]')).toBeHidden();
  await page.reload(); await expect(page.locator('#sidebar [data-action="attachments"]')).toBeHidden();
  await page.keyboard.press("Control+k"); await expect(page.locator("#search-input")).toBeVisible(); await page.keyboard.press("Escape");
  await page.locator('#sidebar [data-action="settings"]').click();
  await page.getByRole("button", { name: "Show all shortcuts" }).click(); await page.keyboard.press("Escape");
  await expect(page.locator('#sidebar [data-action="attachments"]')).toBeVisible();
  await expect(page.locator('#sidebar [data-action="search"]')).toBeVisible();
});

test("browser creates a vault in another tab after saving; tabs keep separate content and assets", async ({ page, request }) => {
  const note = await (await request.post("/api/pages", { data: { title: "Vault switch source", body: "Original before switch", bodyFormat: "markdown" } })).json();
  await page.goto(`/#page/${note.id}`); await expect(page.locator("#page-title")).toHaveValue(note.title);
  await page.locator(".page-pane .ProseMirror").fill("Pending before vault switch");
  await page.locator(".workspace-switch").click();
  await expect(page.locator("[data-vault-create]")).toBeVisible();
  await page.screenshot({ path: ".run/logs/browser-vault-manager.png" });
  await page.locator("[data-new-tab]").check();
  await page.locator('[data-vault-create] input[name="name"]').fill(`Browser test ${Date.now()}`);
  const popup = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Create vault", exact: true }).click();
  const other = await popup;
  await expect(other).toHaveURL(/\/v\/[a-f0-9]{64}\/$/);
  await expect(other.locator(".workspace-switch")).toContainText("Browser test");
  const source = await (await request.get(`/api/pages/${note.id}`)).json(); expect(source.body).toContain("Pending before vault switch");
  await expect(page.locator("#page-title")).toHaveValue(note.title);
  await other.locator('#sidebar [data-action="new"]').first().click();
  await other.locator("#page-title").fill("Only in second vault");
  await other.locator(".page-pane .ProseMirror").fill("Second vault body");
  await other.keyboard.press("Control+s");
  await expect(other.locator("#save-status")).toContainText("Saved");
  const otherBase = new URL(other.url()); otherBase.hash = "";
  const entries = await (await request.get(otherBase.href + "api/pages")).json(); expect(entries).toHaveLength(1); expect(entries[0].title).toBe("Only in second vault");
  const upload = await (await request.post(otherBase.href + "api/assets", { data: { name: "vault-proof.png", contentType: "image/png", data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aDTsAAAAASUVORK5CYII=" } })).json();
  const updated = await request.put(otherBase.href + `api/pages/${entries[0].id}`, { data: { body: `![proof](${upload.path})`, baseRevision: entries[0].revision } }); expect(updated.ok()).toBeTruthy();
  await other.reload();
  const image = other.locator('.page-pane img[alt="proof"]'); await expect(image).toBeVisible();
  await expect(image).toHaveJSProperty("complete", true); expect(await image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(1);
  expect((await (await request.get("/api/pages")).json()).some((item: any) => item.title === "Only in second vault")).toBe(false);
  await other.screenshot({ path: ".run/logs/browser-vault-isolation.png" });
  await other.close();
});

test("a save conflict prevents creating or switching a browser vault", async ({ page, request }) => {
  const note = await (await request.post("/api/pages", { data: { title: "Switch conflict", body: "Before", bodyFormat: "markdown" } })).json();
  await page.goto(`/#page/${note.id}`); await expect(page.locator("#page-title")).toHaveValue(note.title);
  await page.locator(".workspace-switch").click();
  await request.put(`/api/pages/${note.id}`, { data: { body: "External edit", baseRevision: note.revision } });
  // Keep the draft pending while the modal is open, bypassing the ordinary autosave timer.
  await page.evaluate(() => { const editor = document.querySelector('.page-pane .ProseMirror')!; editor.textContent = "Pending conflicting draft"; });
  await page.locator('[data-vault-create] input[name="name"]').fill(`Must not create ${Date.now()}`);
  let opened = false; page.on("request", req => { if (req.url().endsWith("/api/vaults/open")) opened = true; });
  await page.getByRole("button", { name: "Create vault", exact: true }).click();
  await expect(page.locator("#save-status")).toContainText("Conflict");
  expect(opened).toBe(false); expect(new URL(page.url()).pathname).toBe("/");
});

test("settings opens an existing vault in this tab without changing the root vault", async ({ page, request, context }) => {
  const entry = await (await request.post("/api/vaults/open", { data: { mode: "create", name: `Switch here ${Date.now()}` } })).json();
  const root = await (await request.get("/api/status")).json();
  await page.goto("/"); await page.locator('#sidebar [data-action="settings"]').click();
  await page.getByRole("button", { name: "Manage knowledge bases" }).click();
  await page.locator('[data-vault-open] input[name="path"]').fill(entry.path);
  await page.getByRole("button", { name: "Open vault", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(entry.url));
  await expect(page.locator(".workspace-switch")).toContainText(entry.name);
  const other = await context.newPage(); await other.goto("/");
  const stillDefault = await (await request.get("/api/status")).json(); expect(stillDefault.vaultPath).toBe(root.vaultPath);
  await expect(other.locator(".workspace-switch small")).not.toHaveText(entry.name);
});
