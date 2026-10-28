import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("notdown-sidebar-hidden", "[]"));
});

async function create(request: APIRequestContext, title: string, parent: string | null = null) {
  const response = await request.post("/api/pages", { data: { title, parent, body: "Original body", properties: { custom: "keep" } } });
  expect(response.ok()).toBeTruthy();
  return response.json();
}
async function menu(page: Page, id: string) {
  await expect(page.locator("#app")).not.toHaveAttribute("inert", "");
  await page.locator(`#page-tree [data-open="${id}"]`).click({ button: "right" });
  const actions = page.getByRole("menu", { name: /Page actions for/ });
  await expect(actions).toBeVisible();
  return actions;
}

async function topMenu(page: Page) {
  await expect(page.locator("#app")).not.toHaveAttribute("inert", "");
  await page.locator("#page-options > summary").click();
  return page.locator("#page-options [role=menu]");
}
async function expandPage(page: Page, id: string) {
  const toggle = page.locator(`#page-tree [data-toggle="${id}"]`);
  if (await toggle.getAttribute("aria-expanded") !== "true") { await page.locator(`#page-tree [data-page-row="${id}"]`).hover(); await toggle.click(); }
}

test("top-right menu shares all page actions and trashes the current page with pending input", async ({ page, request, context }) => {
  const note = await create(request, "Top menu page");
  const parent = await create(request, "Top menu destination");
  await page.goto(`/#page/${note.id}`);
  await expect(page.locator("#page-title")).toHaveValue(note.title);
  let actions = await topMenu(page);
  await expect(actions.locator("[data-current-page-action]")).toHaveCount(8);
  await actions.getByRole("menuitem", { name: "Add to Favorites", exact: true }).click();
  await expect(page.locator(`#favorite-pages [data-open="${note.id}"]`)).toBeVisible();
  actions = await topMenu(page);
  await actions.getByRole("menuitem", { name: "Remove from Favorites", exact: true }).click();
  await expect(page.locator(`#favorite-pages [data-open="${note.id}"]`)).toHaveCount(0);
  await (await topMenu(page)).getByRole("menuitem", { name: "Rename", exact: true }).click();
  await page.getByLabel("Page name", { exact: true }).fill("Top menu renamed");
  await page.getByRole("button", { name: "Save name", exact: true }).click();
  await expect(page.locator("#page-title")).toHaveValue("Top menu renamed");
  await (await topMenu(page)).getByRole("menuitem", { name: "Move to", exact: true }).click();
  await page.getByRole("dialog").locator("select").selectOption(parent.id);
  await page.getByRole("button", { name: "Move page", exact: true }).click();
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).parent).toBe(parent.id);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await (await topMenu(page)).getByRole("menuitem", { name: "Copy link", exact: true }).click();
  await expect(page.locator(".toast")).toHaveText("Page link copied.");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(`#page/${note.id}`);
  await (await topMenu(page)).getByRole("menuitem", { name: "Duplicate", exact: true }).click();
  await expect(page.locator("#page-title")).toHaveValue("Top menu renamed (copy)");
  await expandPage(page, parent.id);
  await page.locator(`#page-tree [data-open="${note.id}"]`).click();
  await expect(page.locator("#page-title")).toHaveValue("Top menu renamed");
  await page.locator(".pm-document").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(" saved before trash");
  await (await topMenu(page)).getByRole("menuitem", { name: "Move to Trash", exact: true }).click();
  await expect(page.locator(`#page-tree [data-open="${note.id}"]`)).toHaveCount(0);
  await expect(page.locator("#main h1")).toHaveText("Vault");
  const stored = await (await request.get(`/api/pages/${note.id}`)).json();
  expect(stored.trashed).toBe(true);
  expect(stored.body).toContain("saved before trash");
  await page.getByRole("button", { name: "Trash", exact: true }).click();
  await page.locator(`[data-restore="${note.id}"]`).click();
  await expect(page.locator(`#page-tree [data-open="${note.id}"]`)).toBeVisible();
});

test("old running servers cannot silently accept Trash or favorite actions", async ({ page, request }) => {
  const note = await create(request, "Old server protection");
  await page.goto(`/#page/${note.id}`);
  await expect(page.locator("#page-title")).toHaveValue(note.title);
  await page.route("**/api/status", async (route) => {
    const response = await route.fetch();
    const info = await response.json();
    delete info.capabilities;
    await route.fulfill({ response, json: info });
  });
  let writes = 0;
  page.on("request", (req) => { if (req.method() === "PUT") writes++; });
  await (await menu(page, note.id)).getByRole("menuitem", { name: "Move to Trash", exact: true }).click();
  await expect(page.locator(".toast")).toContainText("server needs to be restarted");
  await expect(page.locator(`#page-tree [data-open="${note.id}"]`)).toBeVisible();
  await (await topMenu(page)).getByRole("menuitem", { name: "Add to Favorites", exact: true }).click();
  await expect(page.locator(".toast")).toContainText("server needs to be restarted");
  expect(writes).toBe(0);
  const saved = await (await request.get(`/api/pages/${note.id}`)).json();
  expect(saved.trashed).not.toBe(true);
  expect(saved.favorite).not.toBe(true);
});

test("Trash Delete sends the page and children to the system adapter while Restore remains available", async ({ page, request }) => {
  const parent = await create(request, "Delete to system bin");
  const child = await create(request, "Delete child", parent.id);
  await page.goto(`/#page/${parent.id}`);
  await expect(page.locator("#page-title")).toHaveValue(parent.title);
  await (await topMenu(page)).getByRole("menuitem", { name: "Move to Trash", exact: true }).click();
  await expect(page.locator(`#page-tree [data-open="${parent.id}"]`)).toHaveCount(0);
  await page.getByRole("button", { name: "Trash", exact: true }).click();
  await expect(page.locator(`[data-restore="${parent.id}"]`)).toBeVisible();
  await page.locator(`[data-recycle="${parent.id}"]`).click();
  await expect(page.locator(`[data-recycle="${parent.id}"]`)).toHaveCount(0);
  await expect(page.locator(".toast")).toContainText("Windows Recycle Bin");
  expect((await request.get(`/api/pages/${parent.id}`)).status()).toBe(404);
  expect((await request.get(`/api/pages/${child.id}`)).status()).toBe(404);
});

test("recycling a page trashed in another window closes its stale editor", async ({ page, request }) => {
  const note = await create(request, "Externally trashed current page");
  await page.goto(`/#page/${note.id}`);
  await expect(page.locator("#page-title")).toHaveValue(note.title);
  await request.put(`/api/pages/${note.id}`, { data: { baseRevision: note.revision, trashed: true } });
  await page.getByRole("button", { name: "Trash", exact: true }).click();
  await page.locator(`[data-recycle="${note.id}"]`).click();
  await expect(page.locator("#main h1")).toHaveText("Vault");
  await expect(page.locator("#page-title")).toHaveCount(0);
  expect((await request.get(`/api/pages/${note.id}`)).status()).toBe(404);
});

test("sidebar menu targets the clicked page; favorites, rename, move and links persist", async ({ page, request, context }) => {
  const active = await create(request, "Menu active");
  const target = await create(request, "Menu target");
  const destination = await create(request, "Menu destination");
  const child = await create(request, "Menu child", target.id);
  await page.goto(`/#page/${active.id}`);
  await expect(page.locator("#page-title")).toHaveValue(active.title);
  let actions = await menu(page, target.id);
  await expect(actions.getByRole("menuitem")).toHaveCount(8);
  await actions.getByRole("menuitem", { name: "Add to Favorites", exact: true }).click();
  await expect(page.locator(`#favorite-pages [data-open="${target.id}"]`)).toBeVisible();
  await expect(page.locator("#page-title")).toHaveValue(active.title);
  actions = await menu(page, target.id);
  await actions.getByRole("menuitem", { name: "Rename", exact: true }).click();
  await page.getByLabel("Page name", { exact: true }).fill("Renamed menu target");
  await page.getByRole("button", { name: "Save name", exact: true }).click();
  await expect(page.locator(`#page-tree [data-open="${target.id}"]`)).toContainText("Renamed menu target");
  actions = await menu(page, target.id);
  await actions.getByRole("menuitem", { name: "Move to", exact: true }).click();
  await expect(page.getByRole("dialog").locator("select").locator(`option[value="${child.id}"]`)).toHaveCount(0);
  await page.getByRole("dialog").locator("select").selectOption(destination.id);
  await page.getByRole("button", { name: "Move page", exact: true }).click();
  await expect.poll(async () => (await (await request.get(`/api/pages/${target.id}`)).json()).parent).toBe(destination.id);
  await expandPage(page, destination.id);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  actions = await menu(page, target.id);
  await actions.getByRole("menuitem", { name: "Copy link", exact: true }).click();
  await expect(page.locator(".toast")).toHaveText("Page link copied.");
  const url = await page.evaluate(() => navigator.clipboard.readText());
  expect(url).toContain(`#page/${target.id}`);
  await page.goto(url);
  await expect(page.locator("#page-title")).toHaveValue("Renamed menu target");
  actions = await menu(page, target.id);
  await actions.getByRole("menuitem", { name: "Remove from Favorites", exact: true }).click();
  await expect(page.locator(`#favorite-pages [data-open="${target.id}"]`)).toHaveCount(0);
});

test("duplicate collects pending editor input; trash and restore retain child pages", async ({ page, request }) => {
  const parent = await create(request, "Duplicate and trash");
  const child = await create(request, "Retained child", parent.id);
  await page.goto(`/#page/${parent.id}`);
  const editor = page.locator(".pm-document");
  await editor.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(" pending edit");
  await (await menu(page, parent.id)).getByRole("menuitem", { name: "Duplicate", exact: true }).click();
  await expect(page.locator("#page-title")).toHaveValue(`${parent.title} (copy)`);
  await expect(editor).toContainText("pending edit");
  const all = await (await request.get("/api/pages")).json();
  const copy = all.find((entry: any) => entry.title === `${parent.title} (copy)`);
  expect(copy.properties.custom).toBe("keep");
  expect((await (await request.get(`/api/pages/${parent.id}`)).json()).body).toContain("pending edit");
  await expandPage(page, parent.id);
  await page.locator(`#page-tree [data-open="${child.id}"]`).click();
  await (await menu(page, parent.id)).getByRole("menuitem", { name: "Move to Trash", exact: true }).click();
  await expect(page.locator(`#page-tree [data-open="${parent.id}"]`)).toHaveCount(0);
  await expect(page.locator(`#page-tree [data-open="${child.id}"]`)).toHaveCount(0);
  await expect(page.locator("#main h1")).toHaveText("Vault");
  await page.getByRole("button", { name: "Trash", exact: true }).click();
  await page.locator(`[data-restore="${parent.id}"]`).click();
  await expect(page.locator(`#page-tree [data-open="${child.id}"]`)).toHaveCount(1);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.locator(`#page-tree [data-open="${parent.id}"]`).click();
  await expect(editor).toContainText("pending edit");
});

test("keyboard menu fits viewport and stale rename is preserved as a conflict", async ({ page, request }) => {
  const note = await create(request, "Stale menu target");
  await page.goto(`/#page/${note.id}`);
  await expect(page.locator("#page-title")).toHaveValue(note.title);
  const trigger = page.locator(`#page-tree [data-page-menu="${note.id}"]`);
  await trigger.focus();
  await page.keyboard.press("Shift+F10");
  const actions = page.getByRole("menu", { name: /Page actions for/ });
  await expect(actions).toBeVisible();
  await page.keyboard.press("End");
  await expect(actions.getByRole("menuitem", { name: "Move to Trash", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(actions).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  const box = await actions.boundingBox();
  expect(box!.x + box!.width).toBeLessThanOrEqual(1440);
  expect(box!.y + box!.height).toBeLessThanOrEqual(1000);
  await page.screenshot({ path: "test-results/page-context-menu.png" });
  await actions.getByRole("menuitem", { name: "Rename", exact: true }).click();
  await request.put(`/api/pages/${note.id}`, { data: { baseRevision: note.revision, body: "External version" } });
  await page.getByLabel("Page name", { exact: true }).fill("Local rename");
  await page.getByRole("button", { name: "Save name", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Two versions detected; both have been preserved" })).toBeVisible();
  const disk = await (await request.get(`/api/pages/${note.id}`)).json();
  expect(disk.title).toBe(note.title);
  expect(disk.body).toBe("External version");
  const conflicts = await (await request.get("/api/conflicts")).json();
  expect(conflicts.some((entry: any) => entry.pageId === note.id && entry.proposed.title === "Local rename")).toBeTruthy();
});

test("a conflict on a page trashed by another window can still be reviewed and restored", async ({ page, request }) => {
  const active = await create(request, "Trash conflict active");
  const note = await create(request, "Trash conflict target");
  await page.goto(`/#page/${active.id}`);
  await (await menu(page, note.id)).getByRole("menuitem", { name: "Rename", exact: true }).click();
  await request.put(`/api/pages/${note.id}`, { data: { baseRevision: note.revision, trashed: true } });
  await page.getByLabel("Page name", { exact: true }).fill("Recovered trash conflict");
  await page.getByRole("button", { name: "Save name", exact: true }).click();
  await expect(page.locator(".toast")).toContainText("Both versions are preserved");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Conflicts and versions", exact: true }).click();
  await page.locator(".conflict-list > div").filter({ hasText: "Recovered trash conflict" }).getByRole("button", { name: "Review and merge" }).click();
  await expect(page.getByRole("heading", { name: "Two versions detected; both have been preserved" })).toBeVisible();
  await page.getByRole("button", { name: "Save merged version", exact: true }).click();
  await expect(page.locator("#main h1")).toHaveText("Vault");
  await page.getByRole("button", { name: "Trash", exact: true }).click();
  await page.locator(`[data-restore="${note.id}"]`).click();
  await expect(page.locator(`#page-tree [data-open="${note.id}"]`)).toContainText("Recovered trash conflict");
});
