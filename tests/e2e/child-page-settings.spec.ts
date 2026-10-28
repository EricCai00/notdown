import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

const syntax = { version: 1, variant: "notdown", extensions: {} };
async function fixture(request: APIRequestContext) {
  const response = await request.post("/api/vaults/open", { data: { mode: "create", name: `Child pages ${Date.now()}` } });
  expect(response.ok()).toBeTruthy();
  const entry = await response.json(), prefix = new URL(entry.url, "http://localhost").pathname.replace(/\/$/, "");
  const create = async (title: string, parent: string | null = null, body = "Original body") => {
    const result = await request.post(`${prefix}/api/pages`, { data: { title, parent, body, syntax } });
    expect(result.ok()).toBeTruthy(); return result.json();
  };
  const get = async (id: string) => (await request.get(`${prefix}/api/pages/${id}`)).json();
  return { prefix, create, get };
}
async function settings(page: Page) {
  await page.locator('#sidebar [data-action="settings"]').click();
  const dialog = page.getByRole("dialog", { name: "Workspace settings", exact: true });
  await dialog.getByRole("navigation", { name: "Settings sections" }).getByRole("button", { name: "Editing", exact: true }).click();
  await expect(dialog.locator('.child-page-settings input[name="allowUninserted"]')).toBeEnabled();
  return dialog;
}
const row = (page: Page, id: string) => page.locator(`#page-tree [data-page-row="${id}"]`);

test("disallowing missing entries backfills existing pages, saves pending input, and persists", async ({ page, request }, info) => {
  const { prefix, create, get } = await fixture(request);
  const parent = await create("Policy parent"), child = await create("Existing child", parent.id);
  const other = await create("Other parent"), nested = await create("Other child", other.id);
  await page.goto(`${prefix}/#page/${parent.id}`);
  await expect(page.locator("#page-title")).toHaveValue(parent.title);
  await page.locator(".pm-document").click(); await page.keyboard.press("Control+End");
  await page.keyboard.type(" pending settings edit");
  const dialog = await settings(page);
  await dialog.getByLabel("Allow child pages without a block in the parent page", { exact: true }).uncheck();
  await expect(dialog.locator('.child-page-settings [role="status"]')).toContainText("Saved.");
  await expect(dialog.getByLabel("Automatically insert child page blocks", { exact: true })).toBeChecked();
  await expect(dialog.getByLabel("Automatically insert child page blocks", { exact: true })).toBeDisabled();
  expect((await get(parent.id)).body).toContain("pending settings edit");
  expect((await get(parent.id)).body).toContain(child.id);
  expect((await get(other.id)).body).toContain(nested.id);
  await page.screenshot({ path: info.outputPath("child-page-settings.png") });
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.locator('.ProseMirror [data-pm-node-type="block.child_page"]')).toHaveCount(1);
  await page.reload();
  const reopened = await settings(page);
  await expect(reopened.getByLabel("Allow child pages without a block in the parent page", { exact: true })).not.toBeChecked();
  await reopened.getByLabel("Allow child pages without a block in the parent page", { exact: true }).check();
  await expect(reopened.locator('.child-page-settings [role="status"]')).toContainText("saved");
  await expect(reopened.getByLabel("Automatically insert child page blocks", { exact: true })).not.toBeChecked();
  await expect(reopened.getByLabel("Automatically insert child page blocks", { exact: true })).toBeEnabled();
  expect((await get(parent.id)).body.split(child.id).length - 1).toBe(1);
});

test("automatic insertion follows sidebar creation and drag without stale parent conflicts", async ({ page, request }) => {
  const { prefix, create, get } = await fixture(request);
  const parent = await create("Auto parent"), old = await create("Existing uninserted", parent.id), dragged = await create("Drag into parent");
  await page.goto(`${prefix}/#page/${parent.id}`);
  const dialog = await settings(page);
  await dialog.getByLabel("Automatically insert child page blocks", { exact: true }).check();
  await expect(dialog.locator('.child-page-settings [role="status"]')).toContainText("saved");
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  expect((await get(parent.id)).body).not.toContain(old.id);
  await row(page, parent.id).hover();
  await row(page, parent.id).locator("[data-child]").click();
  await expect(page.locator("#page-title")).toHaveValue("New page");
  const list = await (await request.get(`${prefix}/api/pages`)).json();
  const created = list.find((item: any) => item.parent === parent.id && item.title === "New page");
  expect((await get(parent.id)).body).toContain(created.id);
  await row(page, parent.id).locator(".tree-page").click();
  await expect(page.locator("#page-title")).toHaveValue(parent.title);
  await expect(page.locator('.ProseMirror [data-pm-node-type="block.child_page"]')).toHaveCount(1);
  const box = await row(page, parent.id).boundingBox();
  await row(page, dragged.id).locator(".tree-page").dragTo(row(page, parent.id), { targetPosition: { x: 90, y: box!.height / 2 } });
  await expect.poll(async () => (await get(dragged.id)).parent).toBe(parent.id);
  await expect(page.locator('.ProseMirror [data-pm-node-type="block.child_page"]')).toHaveCount(2);
  await page.locator(".pm-document").click(); await page.keyboard.press("Control+End"); await page.keyboard.type(" after drag");
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await get(parent.id)).body).toContain("after drag");
  await expect(page.locator("dialog[open]")).toHaveCount(0);
});

test("existing children can be inserted from sidebar and relation context menus without duplication", async ({ page, request }) => {
  const { prefix, create, get } = await fixture(request);
  const parent = await create("Manual parent"), child = await create("Manual child", parent.id);
  await page.goto(`${prefix}/#page/${parent.id}`);
  await expect(page.locator(`.child-card[data-open="${child.id}"]`)).toBeVisible();
  await page.locator(`.child-card[data-open="${child.id}"]`).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Insert into parent page", exact: true }).click();
  await expect(page.locator('.ProseMirror [data-pm-node-type="block.child_page"]')).toHaveCount(1);
  const before = await get(parent.id);
  if (await row(page, child.id).count() === 0) {
    await row(page, parent.id).hover();
    await row(page, parent.id).locator(".tree-toggle").click();
  }
  await row(page, child.id).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Insert into parent page", exact: true }).click();
  await expect(page.locator(".toast")).toContainText("already has an entry");
  expect((await get(parent.id)).revision).toBe(before.revision);
  await row(page, parent.id).click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "Insert into parent page", exact: true })).toHaveCount(0);
});

test("strict source saves put removed entries back in both source and page views", async ({ page, request }) => {
  const { prefix, create, get } = await fixture(request);
  const parent = await create("Strict source"), child = await create("Required child", parent.id);
  await page.goto(`${prefix}/#page/${parent.id}`);
  const dialog = await settings(page);
  await dialog.getByLabel("Allow child pages without a block in the parent page", { exact: true }).uncheck();
  await expect(dialog.locator('.child-page-settings [role="status"]')).toContainText("Saved.");
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Source", exact: true }).click();
  const source = page.locator("#source-editor");
  await source.fill("Source replacement");
  await page.keyboard.press("Control+s");
  await expect(source).toContainText(child.id);
  expect((await get(parent.id)).body).toContain("Source replacement");
  await page.getByRole("button", { name: "Page", exact: true }).click();
  await expect(page.locator('.ProseMirror [data-pm-node-type="block.child_page"]')).toHaveCount(1);
});

test("automatic insertion preserves inline new-page completion and the parent draft", async ({ page, request }) => {
  const { prefix, create, get } = await fixture(request);
  const parent = await create("Completion parent", null, "");
  await page.goto(`${prefix}/#page/${parent.id}`);
  const dialog = await settings(page);
  await dialog.getByLabel("Automatically insert child page blocks", { exact: true }).check();
  await expect(dialog.locator('.child-page-settings [role="status"]')).toContainText("saved");
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await page.locator(".pm-document > p").last().click();
  await page.keyboard.type("Before +New inline child");
  await page.locator(".pm-page-input").getByRole("option", { name: "Create “New inline child”", exact: true }).click();
  await expect(page.locator('.pm-document [data-pm-node-type="inline.internal_link"]')).toBeVisible();
  await page.keyboard.press("Control+s");
  await expect(page.locator('.ProseMirror [data-pm-node-type="block.child_page"]')).toHaveCount(1);
  const body = (await get(parent.id)).body;
  expect(body).toContain("Before [["); expect(body).toContain("|New inline child]]"); expect(body).toContain("<page url=");
  await expect(page.locator("dialog[open]")).toHaveCount(0);
});
