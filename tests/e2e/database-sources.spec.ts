import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

const dialog = (page: Page, name: string) => page.getByRole("dialog", { name, exact: true });
const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
async function database(request: APIRequestContext, title: string) {
  const response = await request.post("/api/databases", { data: { title } });
  expect(response.ok()).toBeTruthy(); return response.json();
}
async function snapshot(request: APIRequestContext, id: string) { return (await request.get(`/api/databases/${id}`)).json(); }
async function manager(page: Page) { await button(page, "View settings").click(); await button(page, "Manage data sources").click(); }
async function newSource(page: Page) { await manager(page); await button(page, "Add data source").click(); }
async function linkMenu(page: Page) { await manager(page); await button(page, "Link existing data source").click(); }

test("creating sources keeps schemas and rows separate, supports cancellation and reload", async ({ page, request }, info) => {
  const target = await database(request, "Source management");
  await page.goto(`/#database/${target.database.id}`);
  await newSource(page);
  await page.getByLabel("Data source name", { exact: true }).fill("Cancelled source");
  await page.keyboard.press("Escape"); await page.keyboard.press("Escape");
  expect((await snapshot(request, target.database.id)).dataSources).toHaveLength(1);
  await newSource(page);
  await page.getByLabel("Data source name", { exact: true }).fill("Independent tasks");
  await page.screenshot({ path: info.outputPath("new-source.png") });
  await button(page, "Create data source").click();
  await expect(page.getByRole("tab", { name: "Independent tasks", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { level: 2, name: "Current data source: Independent tasks", exact: true })).toBeVisible();
  await button(page, "Add row").click();
  await page.getByLabel("Row title", { exact: true }).fill("Independent record");
  await button(page, "Create row").click();
  await expect(button(page, "Open Independent record")).toBeVisible();
  const current = await snapshot(request, target.database.id), source = current.dataSources.find((item: any) => item.title === "Independent tasks");
  expect(current.database.dataSourceIds).toHaveLength(2); expect(current.views).toHaveLength(2);
  expect(current.pages[0]).toMatchObject({ dataSourceId: source.id, parent: target.hostPage.id });
  expect(source.properties.map((item: any) => item.name)).toEqual(["Name"]);
  await page.getByRole("tab", { name: "Table", exact: true }).click();
  await expect(page.locator(".database-source-title")).toHaveText("Source management");
  await expect(button(page, "Open Independent record")).toHaveCount(0);
  await button(page, "View settings").click();
  await dialog(page, "View settings").getByRole("button", { name: "Source", exact: true }).click();
  await dialog(page, "Source").getByRole("button", { name: "Manage data sources", exact: true }).click();
  await button(page, "Show data source Independent tasks").click();
  await page.reload();
  await expect(page.getByRole("tab", { name: "Independent tasks", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(button(page, "Open Independent record")).toBeVisible();
});

test("source relationships are searchable and link to their exact database views", async ({ page, request }, info) => {
  const owner = await database(request, "Product work"), target = await database(request, "Overview mapping");
  const original = owner.dataSources[0];
  const source = await (await request.put(`/api/data-sources/${original.id}`, { data: { baseRevision: original.revision, title: "Roadmap" } })).json();
  const linked = await (await request.post(`/api/databases/${target.database.id}/data-sources/link`, { data: { baseRevision: target.database.revision, dataSourceId: source.id, sourceRevision: source.revision } })).json();
  await page.goto(`/#database/${target.database.id}`);
  await expect(page.locator(".database-view-link")).toHaveText("Link");
  await button(page, "View settings").click();
  await dialog(page, "View settings").getByRole("button", { name: "Manage data sources", exact: true }).click();
  const manager = dialog(page, "Manage data sources");
  await expect(manager.getByText("Source", { exact: true })).toBeVisible();
  await expect(manager.getByText("Linked", { exact: true })).toBeVisible();
  await expect(manager.getByRole("button", { name: "Show data source Roadmap", exact: true })).toHaveAttribute("title", "From Product work · Views: Roadmap");
  await button(page, "Data source options for Roadmap").click();
  await button(page, "Source details").click();
  const details = dialog(page, "Data source details");
  await expect(details.getByRole("link", { name: "Open Table in Product work", exact: true })).toBeVisible();
  await expect(details.getByRole("link", { name: "Open Roadmap in Overview mapping", exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("source-relationships.png") });
  await details.getByRole("button", { name: "Back", exact: true }).click();
  await button(page, "Browse all data sources").click();
  await dialog(page, "All data sources").getByLabel("Filter data sources", { exact: true }).fill("Roadmap");
  await expect(dialog(page, "All data sources").locator("tbody tr")).toHaveCount(1);
  await page.keyboard.press("Escape"); await page.keyboard.press("Escape");
  await button(page, "All databases").click();
  await page.getByRole("tab", { name: "Data sources", exact: true }).click();
  await page.getByLabel("Filter data sources", { exact: true }).fill("Product work");
  const row = page.locator(`[data-source-id="${source.id}"]`);
  await expect(row).toContainText("Roadmap"); await expect(row).toContainText("Overview mapping");
  await page.screenshot({ path: info.outputPath("source-catalog.png"), fullPage: true });
  await row.getByRole("link", { name: "Open Roadmap in Overview mapping", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`#database/${target.database.id}\\?view=${linked.views[1].id}$`));
  await expect(page.locator(".database-source-title")).toHaveText("Roadmap");
});

test("two title levels follow the active source and honor explicit visibility after reload", async ({ page, request }, info) => {
  const target = await database(request, "Two level titles");
  await request.post(`/api/databases/${target.database.id}/data-sources`, { data: { baseRevision: target.database.revision, title: "Second collection" } });
  await page.goto(`/#database/${target.database.id}`);
  await expect(page.locator(".database-source-title")).toHaveText("Two level titles");
  await page.getByRole("tab", { name: "Second collection", exact: true }).click();
  const title = page.locator(".database-source-title"); await expect(title).toHaveText("Second collection");
  const headingBounds = await page.locator(".database-heading").boundingBox(), sourceBounds = await title.boundingBox(), tabsBounds = await page.getByRole("tablist", { name: "Database views" }).boundingBox();
  expect(sourceBounds!.y).toBeGreaterThan(headingBounds!.y); expect(tabsBounds!.y).toBeGreaterThan(sourceBounds!.y);
  await button(page, "Current data source: Second collection").click();
  await expect(dialog(page, "Manage data sources")).toBeVisible(); await page.keyboard.press("Escape");
  await page.screenshot({ path: info.outputPath("two-level-titles.png"), fullPage: true });
  await button(page, "View settings").click();
  await dialog(page, "View settings").getByRole("button", { name: "Layout", exact: true }).click();
  const toggle = dialog(page, "Layout").getByRole("switch", { name: "Show data source titles", exact: true });
  await expect(toggle).toHaveAttribute("aria-checked", "true"); await toggle.click();
  await dialog(page, "Layout").getByRole("button", { name: "Done", exact: true }).click();
  await expect(title).toHaveCount(0); await page.reload(); await expect(title).toHaveCount(0);
  await page.getByRole("tab", { name: "Table", exact: true }).click(); await expect(title).toHaveText("Two level titles");
});

test("linking shares original records and fields, keeps ownership, and is not offered twice", async ({ page, request }, info) => {
  const target = await database(request, "Shared dashboard"), owner = await database(request, `Projects ${randomUUID()}`);
  const original = owner.dataSources[0];
  const response = await request.put(`/api/data-sources/${original.id}`, { data: { baseRevision: original.revision, title: "Project records", properties: [...original.properties, { id: "notes", key: "notes", name: "Notes", type: "text" }] } });
  expect(response.ok()).toBeTruthy(); const source = await response.json();
  const created = await request.post(`/api/data-sources/${source.id}/records`, { data: { baseRevision: source.revision, title: "Shared page", properties: { notes: "Original value" } } });
  expect(created.ok()).toBeTruthy(); const row = await created.json();
  await page.goto(`/#database/${target.database.id}`); await linkMenu(page);
  await page.getByLabel("Search data sources", { exact: true }).fill(owner.database.title);
  const choice = `Link Project records from ${owner.database.title}`;
  await expect(button(page, choice)).toBeVisible();
  await page.screenshot({ path: info.outputPath("link-source.png") });
  await button(page, choice).click();
  await expect(page.getByLabel("Notes: Shared page", { exact: true })).toHaveValue("Original value");
  const linked = await snapshot(request, target.database.id);
  expect(linked.pages.map((item: any) => item.id)).toEqual([row.id]);
  expect(linked.pages[0].parent).toBe(owner.hostPage.id);
  await page.getByLabel("Notes: Shared page", { exact: true }).fill("Edited from the dashboard");
  // Opening management must flush the pending cell before taking its source snapshot.
  await linkMenu(page);
  await page.getByLabel("Search data sources", { exact: true }).fill(owner.database.title);
  await expect(button(page, choice)).toHaveCount(0);
  await page.keyboard.press("Escape"); await page.keyboard.press("Escape");
  await page.goto(`/#database/${owner.database.id}`);
  await expect(page.getByLabel("Notes: Shared page", { exact: true })).toHaveValue("Edited from the dashboard");
  await page.reload();
  await expect(page.getByLabel("Notes: Shared page", { exact: true })).toHaveValue("Edited from the dashboard");
  expect((await (await request.get(`/api/pages/${row.id}`)).json()).body).toBe(row.body);
});

test("inline source creation preserves its outer Markdown and independent records", async ({ page, request }, info) => {
  const target = await database(request, "Inline sources");
  const body = `Before\n\n<database future="keep" url="#page/${target.hostPage.id}" inline="true">Inline sources</database>\n\nAfter\n`;
  const outer = await (await request.post("/api/pages", { data: { title: "Inline source host", body, syntax: { version: 1, variant: "notdown", extensions: {} }, bodyFormat: "notion-markdown" } })).json();
  await page.goto(`/#page/${outer.id}`);
  const inline = page.getByRole("region", { name: "Inline database", exact: true });
  await inline.getByRole("button", { name: "View settings", exact: true }).click();
  await button(page, "Manage data sources").click();
  await button(page, "Add data source").click();
  await page.getByLabel("Data source name", { exact: true }).fill("Inline second source");
  await button(page, "Create data source").click();
  await expect(inline.getByRole("tab", { name: "Inline second source", exact: true })).toHaveAttribute("aria-selected", "true");
  await inline.getByRole("button", { name: "Add row", exact: true }).click();
  await page.getByLabel("Row title", { exact: true }).fill("Inline second record");
  await button(page, "Create row").click();
  await expect(inline.getByRole("button", { name: "Open Inline second record", exact: true })).toBeVisible();
  await page.reload();
  await expect(inline.getByRole("button", { name: "Open Inline second record", exact: true })).toBeVisible();
  expect((await (await request.get(`/api/pages/${outer.id}`)).json()).body).toBe(body);
  await page.screenshot({ path: info.outputPath("inline-sources.png"), fullPage: true });
});

test("stale source operations retain the choice without creating partial resources", async ({ page, request }) => {
  const target = await database(request, "Source conflicts"), owner = await database(request, `Conflict owner ${randomUUID()}`);
  await page.goto(`/#database/${target.database.id}`); await newSource(page);
  await page.getByLabel("Data source name", { exact: true }).fill("Local source draft");
  const concurrent = await request.post(`/api/databases/${target.database.id}/data-sources`, { data: { baseRevision: target.database.revision, title: "Other window source" } });
  expect(concurrent.ok()).toBeTruthy();
  await button(page, "Create data source").click();
  await expect(dialog(page, "New data source").getByRole("status")).toContainText(/changed/i);
  await expect(page.getByLabel("Data source name", { exact: true })).toHaveValue("Local source draft");
  expect((await snapshot(request, target.database.id)).dataSources.map((item: any) => item.title)).not.toContain("Local source draft");
  await button(page, "Discard menu changes").click(); await page.reload(); await linkMenu(page);
  const source = owner.dataSources[0], choice = `Link ${source.title} from ${owner.database.title}`;
  await expect(button(page, choice)).toBeVisible();
  expect((await request.put(`/api/data-sources/${source.id}`, { data: { baseRevision: source.revision, title: "Changed source" } })).ok()).toBeTruthy();
  await button(page, choice).click();
  await expect(dialog(page, "Link existing data source").getByRole("status")).toContainText(/changed/i);
  expect((await snapshot(request, target.database.id)).database.dataSourceIds).not.toContain(source.id);
});
