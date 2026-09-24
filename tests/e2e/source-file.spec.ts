import { test, expect } from "@playwright/test";

test("source menu saves pending input and displays full Markdown in a browser tab", async ({ page, request }) => {
  const note = await (await request.post("/api/pages", { data: { title: "Source browser", body: "Original body" } })).json();
  await page.goto(`/#page/${note.id}`);
  await page.locator("#page-title").fill("Saved before opening");
  await page.locator(".page-pane .ProseMirror").fill("Pending editor body");
  const menu = page.locator("#source-file-options");
  await menu.locator("summary").click();
  await expect(menu.getByRole("menuitem")).toHaveCount(3);
  await page.screenshot({ path: "test-results/source-file-menu.png" });
  const popupPromise = page.waitForEvent("popup");
  await menu.getByRole("menuitem", { name: "Show in browser" }).click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL(new RegExp(`/api/pages/${note.id}/source$`));
  expect((await (await request.get(`/api/pages/${note.id}`)).json()).title).toBe("Saved before opening");
  await expect(popup.locator("body")).toContainText("Pending editor body");
  await expect(popup.locator("body")).not.toContainText(`id: ${note.id}`);
  expect(await popup.evaluate(() => window.opener)).toBeNull();
  await popup.close();
  await menu.locator("summary").click();
  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("menuitem").first()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).not.toHaveAttribute("open");
  await expect(menu.locator("summary")).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await menu.locator("summary").click();
  const bounds = await menu.locator('[role="menu"]').boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "test-results/source-file-menu-mobile.png" });
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('[data-action="home"]').click();
  await expect(menu).toBeHidden();
});

test("source menu copies real paths and calls default-app endpoint after saving", async ({ page, request, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const note = await (await request.post("/api/pages", { data: { title: "Source path", body: "Local body" } })).json();
  await page.goto(`/#page/${note.id}`);
  const menu = page.locator("#source-file-options");
  await menu.locator("summary").click();
  await menu.getByRole("menuitem", { name: "Copy file path" }).click();
  await expect(page.locator(".toast")).toHaveText("File path copied.");
  const file = await (await request.get(`/api/pages/${note.id}/source-file`)).json();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(file.path);
  let savedTitle = "";
  await page.route(`**/api/pages/${note.id}/source-file/open`, async (route) => {
    savedTitle = (await (await request.get(`/api/pages/${note.id}`)).json()).title;
    expect(route.request().method()).toBe("POST");
    expect(route.request().postDataJSON()).toEqual({});
    await route.fulfill({ status: 200, json: { opened: true } });
  });
  await page.locator("#page-title").fill("Native app saved title");
  await menu.locator("summary").click();
  await menu.getByRole("menuitem", { name: "Open in default app" }).click();
  await expect(page.locator(".toast")).toHaveText("Source file opened in the default app.");
  expect(savedTitle).toBe("Native app saved title");
  await page.route(`**/api/pages/${note.id}/source-file/open`, route => route.fulfill({ status: 503, json: { error: "Default app unavailable" } }));
  await menu.locator("summary").click();
  await menu.getByRole("menuitem", { name: "Open in default app" }).click();
  await expect(page.locator(".toast")).toHaveText("Default app unavailable");
});

test("failed saves prevent opening and preserve the local draft", async ({ page, request }) => {
  const note = await (await request.post("/api/pages", { data: { title: "Save failure", body: "Preserved body" } })).json();
  await page.goto(`/#page/${note.id}`);
  let opened = 0;
  await page.route(`**/api/pages/${note.id}/source-file/open`, async route => {
    opened++;
    await route.fulfill({ json: { opened: true } });
  });
  await page.route(`**/api/pages/${note.id}`, async route => {
    if (route.request().method() === "PUT") await route.fulfill({ status: 500, json: { error: "Save unavailable" } });
    else await route.continue();
  });
  await page.locator("#page-title").fill("Recoverable local edits");
  await page.locator("#source-file-options summary").click();
  await page.getByRole("menuitem", { name: "Open in default app" }).click();
  await expect(page.locator("#save-status")).toContainText("Save failed");
  expect(opened).toBe(0);
  await expect(page.locator("#page-title")).toHaveValue("Recoverable local edits");
  expect((await (await request.get(`/api/pages/${note.id}`)).json()).title).toBe("Save failure");
});

test("a real revision conflict closes the reserved source tab and preserves both edits", async ({ page, request, context }) => {
  const note = await (await request.post("/api/pages", { data: { title: "Conflict source", body: "Original body" } })).json();
  await page.goto(`/#page/${note.id}`);
  await page.route(`**/api/pages/${note.id}`, async route => {
    if (route.request().method() === "PUT") {
      const external = await request.put(`/api/pages/${note.id}`, { data: { baseRevision: note.revision, body: "External body" } });
      expect(external.status()).toBe(200);
    }
    await route.continue();
  });
  // Change the editor without waiting for the autosave debounce.
  await page.locator(".page-pane .ProseMirror").fill("Local conflicting body");
  await page.locator("#source-file-options summary").click();
  await page.getByRole("menuitem", { name: "Show in browser" }).click();
  await expect(page.locator("#save-status")).toContainText("Both versions preserved");
  await expect.poll(() => context.pages().length).toBe(1);
  const conflicts = await (await request.get("/api/conflicts")).json();
  const conflict = conflicts.find((entry: { pageId: string }) => entry.pageId === note.id);
  expect(conflict).toBeTruthy();
  const source = await (await request.get(`/api/pages/${note.id}/source`)).text();
  expect(source).toContain("External body");
  await expect(page.locator("[data-conflict-diff]")).toContainText("Local conflicting body");
});
