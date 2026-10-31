import { randomUUID } from "node:crypto";
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { renameDatabaseTitle } from "./database-ui-helper";

async function createPage(request: APIRequestContext, title: string, body = "") {
  const response = await request.post("/api/pages", { data: { title, body, syntax: { version: 1, variant: "notdown", extensions: {} } } });
  expect(response.status()).toBe(201);
  return response.json();
}

async function databaseNamed(request: APIRequestContext, title: string) {
  const databases = await (await request.get("/api/databases")).json();
  const database = databases.find((item: any) => item.title === title);
  expect(database).toBeTruthy();
  return (await request.get(`/api/databases/${database.id}`)).json();
}

async function addRecord(page: Page, title: string, container = page.locator("#main")) {
  await container.getByRole("button", { name: "Add row", exact: true }).click();
  await page.getByLabel("Row title", { exact: true }).fill(title);
  await page.getByRole("button", { name: "Create row", exact: true }).click();
  await expect(container.getByRole("button", { name: `Open ${title}`, exact: true })).toBeVisible();
}
async function insertDatabase(page: Page, mode: "full" | "inline") {
  await page.locator('.inline-slash [data-insert="database"]').click();
  const dialog = page.getByRole("dialog", { name: "Create database", exact: true });
  await dialog.getByLabel("Database display", { exact: true }).selectOption(mode);
  await dialog.getByRole("button", { name: "Create database", exact: true }).click();
}

async function expand(page: Page, id: string) {
  const toggle = page.locator(`#page-tree [data-toggle="${id}"]`);
  await expect(toggle).toHaveCount(1);
  if (await toggle.getAttribute("aria-expanded") === "false") {
    await page.locator(`#page-tree [data-page-row="${id}"]`).hover();
    await toggle.click();
  }
}

test("a root database is a single sidebar page and its records are children", async ({ page, request }) => {
  await page.goto("/");
  await page.locator('#sidebar [data-action="databases"]').click();
  await page.locator("#main").getByRole("button", { name: "New database", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Database title", exact: true })).toHaveValue("New database");
  await expect(page.getByRole("dialog", { name: "New database", exact: true })).toHaveCount(0);
  await renameDatabaseTitle(page, "Root collection E2E");
  const snapshot = await databaseNamed(request, "Root collection E2E");
  expect(snapshot.hostPage.id).toBe(snapshot.database.id);
  expect(snapshot.hostPage.databaseId).toBe(snapshot.database.id);
  expect(snapshot.hostPage.parent).toBeNull();
  const hostRow = page.locator(`#page-tree [data-page-row="${snapshot.hostPage.id}"]`);
  await expect(hostRow).toHaveCount(1);
  await expect(hostRow).toHaveAttribute("style", /--depth:\s*0/);
  await addRecord(page, "Root collection record");
  const records = await (await request.get("/api/pages")).json();
  const record = records.find((item: any) => item.title === "Root collection record");
  expect(record.parent).toBe(snapshot.hostPage.id);
  expect(record.dataSourceId).toBe(snapshot.dataSources[0].id);
  await expand(page, snapshot.hostPage.id);
  const recordRow = page.locator(`#page-tree [data-page-row="${record.id}"]`);
  await expect(recordRow).toHaveCount(1);
  await expect(recordRow).toHaveAttribute("style", /--depth:\s*1/);
  await recordRow.locator(`[data-open="${record.id}"]`).click();
  await expect(page.locator("#page-title")).toHaveValue("Root collection record");
  await hostRow.locator(`[data-open-database="${snapshot.database.id}"]`).click();
  await expect(page).toHaveURL(new RegExp(`#database/${snapshot.database.id}$`));
  await expect(page.getByRole("textbox", { name: "Database title", exact: true })).toHaveValue("Root collection E2E");
  await hostRow.getByRole("button", { name: "Add database record", exact: true }).click();
  await page.getByLabel("Row title", { exact: true }).fill("Record created from the tree");
  await page.getByRole("button", { name: "Create row", exact: true }).click();
  await expect.poll(async () => (await (await request.get("/api/pages")).json()).find((item: any) => item.title === "Record created from the tree")?.parent).toBe(snapshot.hostPage.id);
  await page.reload();
  await expand(page, snapshot.hostPage.id);
  await expect(hostRow).toHaveCount(1);
  await expect(recordRow).toHaveAttribute("style", /--depth:\s*1/);
});

test("a database created under a page preserves pending text and keeps records two levels deep", async ({ page, request }) => {
  const parent = await createPage(request, "Collection parent E2E", "Original text");
  await page.goto(`/#page/${parent.id}`);
  await page.locator(".pm-document").fill("Pending parent text before creating a collection");
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/database");
  await insertDatabase(page, "full");
  await renameDatabaseTitle(page, "Nested collection E2E");
  await expect.poll(async () => (await (await request.get(`/api/pages/${parent.id}`)).json()).body).toContain("Pending parent text before creating a collection");
  const snapshot = await databaseNamed(request, "Nested collection E2E");
  expect(snapshot.hostPage.parent).toBe(parent.id);
  await addRecord(page, "Nested collection record");
  const record = (await (await request.get("/api/pages")).json()).find((item: any) => item.title === "Nested collection record");
  expect(record.parent).toBe(snapshot.hostPage.id);
  await expand(page, parent.id);
  await expand(page, snapshot.hostPage.id);
  await expect(page.locator(`#page-tree [data-page-row="${snapshot.hostPage.id}"]`)).toHaveAttribute("style", /--depth:\s*1/);
  await expect(page.locator(`#page-tree [data-page-row="${record.id}"]`)).toHaveCount(1);
  await expect(page.locator(`#page-tree [data-page-row="${record.id}"]`)).toHaveAttribute("style", /--depth:\s*2/);
  await page.reload();
  await expand(page, parent.id);
  await expand(page, snapshot.hostPage.id);
  await expect(page.locator(`#page-tree [data-page-row="${record.id}"]`)).toHaveAttribute("style", /--depth:\s*2/);
  await page.screenshot({ path: "test-results/database-nested-hierarchy.png" });
});

test("the full-page database slash command creates a child database after collecting page input", async ({ page, request }) => {
  const parent = await createPage(request, "Slash collection parent", "");
  await page.goto(`/#page/${parent.id}`);
  await page.locator(".pm-document").click();
  await page.keyboard.type("Keep text before the database.");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/database");
  await expect(page.locator('.inline-slash [data-insert="database"]')).toBeVisible();
  await page.locator(".inline-slash").screenshot({ path: "test-results/database-creation-menu.png" });
  await insertDatabase(page, "full");
  await expect(page.getByRole("textbox", { name: "Database title", exact: true })).toHaveValue("New database");
  await expect(page.getByRole("dialog", { name: "New database", exact: true })).toHaveCount(0);
  await renameDatabaseTitle(page, "Slash full-page collection");
  const snapshot = await databaseNamed(request, "Slash full-page collection");
  expect(snapshot.hostPage.parent).toBe(parent.id);
  await expect(page).toHaveURL(new RegExp(`#database/${snapshot.database.id}$`));
  const saved = await (await request.get(`/api/pages/${parent.id}`)).json();
  expect(saved.body).toContain("Keep text before the database.");
  expect(saved.body).not.toMatch(/^\s*\/database\s*$/m);
  expect(saved.body).toContain(`<database url="#page/${snapshot.hostPage.id}" inline="false">`);
  await page.goto(`/#page/${parent.id}`);
  await expand(page, parent.id);
  await expect(page.locator(`#page-tree [data-page-row="${snapshot.hostPage.id}"]`)).toHaveAttribute("style", /--depth:\s*1/);
});

test("an inline database reuses the official reference and the same nested records after reload", async ({ page, request }) => {
  const parent = await createPage(request, "Inline collection parent", "Before inline database");
  await page.goto(`/#page/${parent.id}`);
  await page.locator(".pm-document").click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/database");
  const creation = page.waitForResponse(response => new URL(response.url()).pathname === "/api/databases" && response.request().method() === "POST");
  await insertDatabase(page, "inline");
  const snapshot = await (await creation).json();
  expect(snapshot.hostPage.parent).toBe(parent.id);
  await expect(page).toHaveURL(new RegExp(`#page/${parent.id}$`));
  const inline = page.getByRole("region", { name: "Inline database", exact: true });
  await expect(inline).toBeVisible();
  await expect(inline.locator(".pm-database-reference")).toHaveText("New database");
  await expect(page.getByRole("dialog", { name: "New database", exact: true })).toHaveCount(0);
  await inline.getByRole("button", { name: "Open as page", exact: true }).click();
  await renameDatabaseTitle(page, "Inline collection E2E", snapshot.database.id);
  await page.goBack();
  await expect(inline).toBeVisible();
  await addRecord(page, "Inline collection record", inline);
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${parent.id}`)).json()).body).toContain("<database");
  const saved = await (await request.get(`/api/pages/${parent.id}`)).json();
  expect(saved.body).toContain("Before inline database");
  expect(saved.body).toContain(snapshot.hostPage.id);
  const record = (await (await request.get("/api/pages")).json()).find((item: any) => item.title === "Inline collection record");
  expect(record.parent).toBe(snapshot.hostPage.id);
  await page.reload();
  await expect(inline.getByRole("button", { name: "Open Inline collection record", exact: true })).toBeVisible();
  expect((await (await request.get(`/api/pages/${parent.id}`)).json()).body).toBe(saved.body);
});

test("legacy databases without host pages project into the tree without writing page files", async ({ page, request }) => {
  const beforePages = await (await request.get("/api/pages")).json();
  const beforeDatabases = await (await request.get("/api/databases")).json();
  const databaseId = randomUUID(), sourceId = randomUUID(), viewId = randomUUID();
  const revision = "a".repeat(64);
  const database = { id: databaseId, title: "Legacy unhosted collection", dataSourceIds: [sourceId], viewIds: [viewId], revision, future: { keep: true } };
  const source = { id: sourceId, title: database.title, properties: [{ id: randomUUID(), key: "title", name: "Name", type: "title" }], revision };
  const view = { id: viewId, databaseId, dataSourceId: sourceId, name: "Table", type: "table", revision };
  const legacyRecord = { id: randomUUID(), title: "Legacy projected record", parent: null, dataSourceId: sourceId, body: "Preserve original record placement", properties: {}, icon: "file-text", revision, updated: "2026-09-28T00:00:00.000Z" };
  await page.route("**/api/pages", route => route.fulfill({ json: [...beforePages, legacyRecord] }));
  await page.route("**/api/databases", route => route.fulfill({ json: [...beforeDatabases, database] }));
  await page.route(`**/api/databases/${databaseId}`, route => route.fulfill({ json: { database, dataSources: [source], views: [view], pages: [legacyRecord] } }));
  const writes: string[] = [];
  page.on("request", req => { if (new URL(req.url()).pathname.startsWith("/api/") && !["GET", "HEAD"].includes(req.method())) writes.push(`${req.method()} ${req.url()}`); });
  await page.goto("/");
  const entry = page.locator("#page-tree").getByRole("button", { name: database.title, exact: true });
  await expect(entry).toHaveCount(1);
  await expand(page, databaseId);
  const recordRow = page.locator(`#page-tree [data-page-row="${legacyRecord.id}"]`);
  await expect(recordRow).toHaveCount(1);
  await expect(recordRow).toHaveAttribute("style", /--depth:\s*1/);
  await entry.click();
  await expect(page).toHaveURL(new RegExp(`#database/${databaseId}$`));
  await expect(page.getByRole("textbox", { name: "Database title", exact: true })).toHaveValue(database.title);
  await page.reload();
  await expect(entry).toHaveCount(1);
  await expand(page, databaseId);
  await expect(recordRow).toHaveCount(1);
  expect(writes).toEqual([]);
  expect(await (await request.get("/api/pages")).json()).toEqual(beforePages);
  expect(await (await request.get("/api/databases")).json()).toEqual(beforeDatabases);
});
