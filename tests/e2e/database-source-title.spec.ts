import { test, expect, type APIRequestContext } from "@playwright/test";

const syntax = { version: 1, variant: "notdown", extensions: {} };
async function post(request: APIRequestContext, url: string, data: unknown) {
  const response = await request.post(url, { data });
  expect(response.ok(), await response.text()).toBeTruthy(); return response.json();
}
async function snapshot(request: APIRequestContext, id: string) { return (await request.get(`/api/databases/${id}`)).json(); }

test("full-page source titles edit directly and save only the active source name", async ({ page, request }, info) => {
  let db = await post(request, "/api/databases", { title: "Container title stays" });
  db = await post(request, `/api/databases/${db.database.id}/data-sources`, { title: "Second source", baseRevision: db.database.revision });
  const source = db.dataSources[1];
  await page.goto(`/#database/${db.database.id}`);
  await page.getByRole("tab", { name: "Second source", exact: true }).click();
  const title = page.getByRole("textbox", { name: "Data source title", exact: true });
  await title.click(); await expect(title).toBeFocused();
  await expect(page.locator(".database-source-title button, .database-source-title svg")).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "Manage data sources", exact: true })).toHaveCount(0);
  await title.fill("Renamed source"); await title.press("Enter");
  await expect.poll(async () => (await snapshot(request, db.database.id)).dataSources[1].title).toBe("Renamed source");
  await expect(title).toBeFocused();
  await expect(page.getByRole("tab", { name: "Second source", exact: true })).toHaveAttribute("title", "Second source · Renamed source");
  // A second edit in the same input must use the acknowledged new revision.
  await title.fill("Final source name"); await title.press("Tab");
  await expect.poll(async () => (await snapshot(request, db.database.id)).dataSources[1].title).toBe("Final source name");
  const saved = await snapshot(request, db.database.id);
  expect(saved.database).toEqual(db.database); expect(saved.views).toEqual(db.views);
  expect(saved.dataSources[0]).toEqual(db.dataSources[0]);
  expect(saved.dataSources[1]).toEqual({ ...source, title: "Final source name", revision: saved.dataSources[1].revision });
  await page.getByRole("button", { name: "View settings", exact: true }).click();
  await page.getByRole("button", { name: "Manage data sources", exact: true }).click();
  await expect(page.getByRole("button", { name: "Show data source Final source name", exact: true })).toBeVisible();
  await page.keyboard.press("Escape"); await page.keyboard.press("Escape");
  await page.reload(); await expect(title).toHaveValue("Final source name");
  await page.getByRole("tab", { name: "Table", exact: true }).click(); await expect(title).toHaveValue("Container title stays");
  await page.getByRole("tab", { name: "Second source", exact: true }).click(); await expect(title).toHaveValue("Final source name");
  await page.screenshot({ path: info.outputPath("editable-full-page-source.png"), fullPage: true });
});

test("inline linked source rename saves pending cells and keeps container, view and Markdown titles", async ({ page, request }, info) => {
  const owner = await post(request, "/api/databases", { title: "Original owner" }), source = owner.dataSources[0];
  const row = await post(request, `/api/data-sources/${source.id}/records`, { title: "Existing record", baseRevision: source.revision });
  const parent = await post(request, "/api/pages", { title: "Source name host", syntax });
  const db = await post(request, "/api/databases", { title: "Linked container", parent: parent.id, parentRevision: parent.revision, dataSourceId: source.id, sourceRevision: source.revision });
  const body = `Before\n\n<database url="#page/${db.database.id}" inline="true">Literal reference title</database>\n\nAfter\n`;
  expect((await request.put(`/api/pages/${parent.id}`, { data: { baseRevision: parent.revision, body } })).ok()).toBeTruthy();
  await page.goto(`/#page/${parent.id}`);
  const inline = page.getByRole("region", { name: "Inline database", exact: true });
  const title = inline.getByRole("textbox", { name: "Data source title", exact: true });
  await expect(inline.locator(".database-linked-heading")).toBeVisible();
  await expect(inline.getByRole("img", { name: "Linked data source", exact: true })).toBeVisible();
  await expect(inline.locator(".database-view-link")).toHaveCount(0);
  await expect(inline.locator(".database-source-title button")).toHaveCount(0);
  await inline.getByLabel("Name: Existing record", { exact: true }).fill("Pending record title");
  await title.fill("Shared source name"); await title.press("Enter");
  await expect.poll(async () => (await snapshot(request, owner.database.id)).dataSources[0].title).toBe("Shared source name");
  expect((await (await request.get(`/api/pages/${row.id}`)).json()).title).toBe("Pending record title");
  const saved = await snapshot(request, db.database.id);
  expect(saved.database).toEqual(db.database); expect(saved.views).toEqual(db.views);
  expect((await (await request.get(`/api/pages/${parent.id}`)).json()).body).toBe(body);
  await page.reload(); await expect(title).toHaveValue("Shared source name");
  await expect(title).toHaveCSS("font-size", "23px");
  await expect(title).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await page.screenshot({ path: info.outputPath("editable-inline-source.png"), fullPage: true });
  await inline.getByRole("button", { name: "Open as page", exact: true }).click();
  await expect(page.locator(".database-title-icon .database-linked-icon")).toBeVisible();
  await expect(page.locator(".database-source-title")).toHaveCount(0);
  await expect(page.getByRole("tab", { name: db.views[0].name, exact: true })).toHaveText(db.views[0].name);
  await page.screenshot({ path: info.outputPath("linked-full-page-title.png"), fullPage: true });
  expect((await request.put(`/api/database-views/${owner.views[0].id}`, { data: { baseRevision: owner.views[0].revision, layout: { showDataSourceTitle: true } } })).ok()).toBeTruthy();
  await page.goto(`/#database/${owner.database.id}`);
  await expect(page.getByRole("textbox", { name: "Data source title", exact: true })).toHaveValue("Shared source name");
  await expect(page.getByRole("textbox", { name: "Database title", exact: true })).toHaveValue("Original owner");
});

test("a conflicting source rename keeps its original revision and draft across reload", async ({ page, request }) => {
  const db = await post(request, "/api/databases", { title: "Concurrent source" }), source = db.dataSources[0];
  expect((await request.put(`/api/database-views/${db.views[0].id}`, { data: { baseRevision: db.views[0].revision, layout: { showDataSourceTitle: true } } })).ok()).toBeTruthy();
  await page.goto(`/#database/${db.database.id}`);
  const title = page.getByRole("textbox", { name: "Data source title", exact: true });
  const writes: any[] = [];
  page.on("request", request => { if (request.method() === "PUT" && request.url().endsWith(`/api/data-sources/${source.id}`)) writes.push(request.postDataJSON()); });
  await title.fill("Keep local name");
  expect((await request.put(`/api/data-sources/${source.id}`, { data: { baseRevision: source.revision, title: "Other window name" } })).ok()).toBeTruthy();
  await title.press("Enter");
  await expect(page.locator(".database-message")).toContainText(/changed.*preserved/i);
  await expect(title).toHaveValue("Keep local name");
  await page.reload(); await expect(title).toHaveValue("Keep local name");
  await expect(page.getByRole("button", { name: "Retry save", exact: true })).toBeVisible();
  await page.waitForTimeout(800); expect(writes).toHaveLength(1);
  await page.getByRole("button", { name: "Retry save", exact: true }).click();
  await expect.poll(() => writes.length).toBe(2);
  expect(writes.every(write => write.baseRevision === source.revision)).toBeTruthy();
  await expect(page.locator(".database-message")).toContainText(/changed.*preserved/i);
  expect((await snapshot(request, db.database.id)).dataSources[0].title).toBe("Other window name");
  await page.getByRole("button", { name: "Discard draft and reload", exact: true }).click();
  await expect(title).toHaveValue("Other window name");
});

test("typing during a source-name save retains the latest name and cell edits", async ({ page, request }) => {
  const db = await post(request, "/api/databases", { title: "Slow source" }), source = db.dataSources[0];
  await post(request, `/api/data-sources/${source.id}/records`, { title: "Slow record", baseRevision: source.revision });
  expect((await request.put(`/api/database-views/${db.views[0].id}`, { data: { baseRevision: db.views[0].revision, layout: { showDataSourceTitle: true } } })).ok()).toBeTruthy();
  await page.goto(`/#database/${db.database.id}`);
  let release!: () => void, started!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; }), received = new Promise<void>(resolve => { started = resolve; });
  await page.route(`**/api/data-sources/${source.id}`, async route => {
    if (route.request().method() === "PUT" && route.request().postDataJSON().title === "First name") { started(); await gate; }
    await route.continue();
  });
  const title = page.getByRole("textbox", { name: "Data source title", exact: true });
  await title.fill("First name"); await title.press("Enter"); await received;
  await title.fill("Latest name");
  const cell = page.getByLabel("Name: Slow record", { exact: true });
  await cell.fill("Latest record"); await cell.press("Enter"); release();
  await expect.poll(async () => (await snapshot(request, db.database.id)).dataSources[0].title).toBe("Latest name");
  await expect.poll(async () => (await snapshot(request, db.database.id)).pages[0].title).toBe("Latest record");
  await expect(title).toHaveValue("Latest name");
  await title.fill("   "); await title.press("Enter");
  await expect(page.getByRole("button", { name: "Discard draft and reload", exact: true })).toBeVisible();
  await expect(title).toHaveValue("   "); await title.press("Escape");
  await expect(title).toHaveValue("Latest name");
});
