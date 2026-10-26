import { test, expect } from "@playwright/test";

test("page history previews source and restores it with the matching page properties", async ({ page, request }) => {
  const created = await request.post("/api/pages", { data: { title: "History browser note", body: "Original history text", bodyFormat: "markdown", properties: { stage: "before" } } });
  const before = await created.json();
  const edited = await request.put(`/api/pages/${before.id}`, { data: { body: "New history text", properties: { stage: "after" }, baseRevision: before.revision } });
  expect(edited.ok()).toBe(true);
  await page.goto(`/#page/${before.id}`);
  await expect(page.locator("#page-title")).toHaveValue("History browser note");
  await page.locator("#page-options > summary").click();
  await page.getByRole("menuitem", { name: "Page history", exact: true }).click();
  await expect(page.locator(".history-version")).toHaveCount(1);
  await page.locator(".history-version").click();
  await expect(page.locator("[data-history-source]")).toHaveText("Original history text");
  await page.screenshot({ path: ".run/logs/page-history-preview-2026-10-25.png" });
  await page.getByRole("button", { name: "Restore this version" }).click();
  await expect(page.locator("#dialog")).toHaveCount(0);
  await expect(page.locator(".page-pane .ProseMirror")).toContainText("Original history text");
  const restored = await (await request.get(`/api/pages/${before.id}`)).json();
  expect(restored.properties.stage).toBe("before");
  await page.reload();
  await expect(page.locator(".page-pane .ProseMirror")).toContainText("Original history text");
});

test("history restore refuses an external edit made while a preview is open", async ({ page, request }) => {
  const before = await (await request.post("/api/pages", { data: { title: "History conflict note", body: "Version one", bodyFormat: "markdown" } })).json();
  const second = await (await request.put(`/api/pages/${before.id}`, { data: { body: "Version two", baseRevision: before.revision } })).json();
  await page.goto(`/#page/${before.id}`); await expect(page.locator("#page-title")).toHaveValue("History conflict note");
  await page.locator("#page-options > summary").click(); await page.getByRole("menuitem", { name: "Page history", exact: true }).click();
  await page.locator(".history-version").click(); await expect(page.locator("[data-history-source]")).toHaveText("Version one");
  const outside = await request.put(`/api/pages/${before.id}`, { data: { body: "External version three", baseRevision: second.revision } }); expect(outside.ok()).toBe(true);
  await page.getByRole("button", { name: "Restore this version" }).click();
  await expect(page.locator("[data-history-message]")).toContainText("preserved");
  expect((await (await request.get(`/api/pages/${before.id}`)).json()).body).toBe("External version three");
});

test("Git history can be enabled in settings and creates a named local checkpoint", async ({ page, request }) => {
  test.setTimeout(90_000);
  const initial = await (await request.get("/api/history/settings")).json();
  test.skip(!initial.available, "Git is not installed on this test host");
  try {
    await page.goto("/");
    await page.locator("#page-options > summary").click(); await page.getByRole("menuitem", { name: "Settings", exact: true }).click();
    const settings = page.locator(".history-settings");
    await expect(settings.locator('input[name="gitEnabled"]')).toBeEnabled();
    await settings.locator('input[name="gitEnabled"]').check();
    await settings.getByRole("button", { name: "Save history settings", exact: true }).click();
    await expect(settings.locator("[data-history-status]")).toHaveText("History settings saved.", { timeout: 45_000 });
    await expect(settings.locator("[data-history-git-detail]")).toContainText("Git history enabled");
    await request.post("/api/pages", { data: { title: "Checkpoint content", body: "Checkpoint text" } });
    await settings.locator('input[name="message"]').fill("Browser checkpoint");
    await settings.getByRole("button", { name: "Create checkpoint", exact: true }).click();
    await expect(settings.locator("[data-history-status]")).toContainText("Checkpoint created", { timeout: 45_000 });
    await settings.scrollIntoViewIfNeeded(); await page.screenshot({ path: ".run/logs/git-history-settings-2026-10-25.png" });
  } finally {
    const current = await (await request.get("/api/history/settings")).json();
    await request.put("/api/history/settings", { data: { settings: initial.settings, baseRevision: current.revision } });
  }
});
