import { test, expect, type Page } from "@playwright/test";
import { createBlockDatabase } from "./database-fixture";

const dialog = (page: Page, name: string) => page.getByRole("dialog", { name, exact: true });
const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
async function layout(page: Page) {
  await button(page, "View settings").click();
  await dialog(page, "View settings").getByRole("button", { name: "Layout", exact: true }).click();
  return dialog(page, "Layout");
}

test("anchored view menus persist display choices, wrap cells, freeze and page opening mode", async ({ page, request }, info) => {
  const fixture = await createBlockDatabase(request), url = `/#database/${fixture.database.id}`;
  await page.goto(url);
  await button(page, "New view").click();
  await expect(dialog(page, "New view")).toBeVisible();
  await page.screenshot({ path: info.outputPath("new-view.png") });
  await page.getByLabel("View name", { exact: true }).fill("Cancelled view");
  await page.keyboard.press("Escape");
  await expect(dialog(page, "New view")).toHaveCount(0);
  expect((await (await request.get(`/api/databases/${fixture.database.id}`)).json()).views).toHaveLength(1);

  const settings = await layout(page);
  for (const name of ["Show data source titles", "Show vertical lines", "Show page icon", "Wrap all content"]) await settings.getByRole("switch", { name, exact: true }).click();
  await settings.getByRole("button", { name: "Open pages in", exact: true }).click();
  await dialog(page, "Open pages in").getByRole("button", { name: "Center peek", exact: true }).click();
  await page.screenshot({ path: info.outputPath("view-settings.png") });
  await settings.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator(".database-source-title")).toBeVisible();
  await expect(page.locator(".database-workspace")).toHaveAttribute("data-vertical-lines", "false");
  await expect(page.locator(".database-page-icon").first()).toBeHidden();
  const cell = page.getByLabel("Notion Syntax: Text", { exact: true });
  await expect(cell).toHaveJSProperty("tagName", "TEXTAREA");
  await cell.fill("First line\nSecond line of the same property"); await cell.press("Tab");
  await button(page, "Edit Notion Syntax property").click();
  await dialog(page, "Property settings").getByRole("button", { name: "Freeze", exact: true }).click();
  await button(page, "Save property").click();
  await expect(page.locator("th.database-frozen-column")).toHaveAttribute("aria-label", "Notion Syntax");
  await page.getByLabel("Name: Text", { exact: true }).hover();
  await button(page, "Open Text").click();
  await expect(page.locator(".database-center-peek")).toBeVisible();
  await button(page, "Close record").click(); await page.reload();
  await expect(cell).toHaveValue("First line\nSecond line of the same property");
  await expect(page.locator("th.database-frozen-column")).toHaveAttribute("aria-label", "Notion Syntax");
  const again = await layout(page);
  await again.getByRole("button", { name: "Open pages in", exact: true }).click();
  await dialog(page, "Open pages in").getByRole("button", { name: "Full page", exact: true }).click();
  let release!: () => void, submitted = false;
  const held = new Promise<void>(resolve => release = resolve);
  await page.route("**/api/database-views/*", async route => {
    if (route.request().method() === "PUT") { submitted = true; await held; }
    await route.continue();
  });
  try {
    await again.getByRole("button", { name: "Close", exact: true }).click();
    await expect.poll(() => submitted).toBe(true);
    await page.getByLabel("Name: Text", { exact: true }).hover();
    await button(page, "Open Text").click();
  } finally { release(); }
  await expect(page.locator("#page-title")).toHaveValue("Text");
});

test("property cascades rename and recolor stable option IDs, reorder and protect used values", async ({ page, request }, info) => {
  const fixture = await createBlockDatabase(request);
  await page.goto(`/#database/${fixture.database.id}`);
  await button(page, "Edit In Markdown property").click();
  await dialog(page, "Property settings").getByRole("button", { name: "Edit property", exact: true }).click();
  await dialog(page, "Edit property").getByRole("button", { name: "Not Available", exact: true }).click();
  await dialog(page, "Option settings").getByLabel("Option name", { exact: true }).fill("Not supported");
  await dialog(page, "Option settings").getByRole("button", { name: "Purple", exact: true }).click();
  await page.screenshot({ path: info.outputPath("option-colors.png") });
  await dialog(page, "Option settings").getByRole("button", { name: "Back", exact: true }).click();
  await dialog(page, "Edit property").getByRole("button", { name: "Move Not supported up", exact: true }).click();
  await dialog(page, "Edit property").getByRole("button", { name: "Done", exact: true }).click();
  const schema = await (await request.get(`/api/data-sources/${fixture.schema.id}`)).json();
  const property = schema.properties.find((item: any) => item.key === "inMarkdown");
  expect(property.options[1]).toEqual(expect.objectContaining({ id: "no", name: "Not supported", color: "purple" }));
  expect((await (await request.get(`/api/pages/${fixture.records[1].id}`)).json()).properties.inMarkdown).toBe("no");
  await page.reload();
  await expect(page.locator('.database-tag[data-color="purple"]').first()).toHaveText("Not supported");
  await button(page, "Edit In Markdown property").click();
  await dialog(page, "Property settings").getByRole("button", { name: "Edit property", exact: true }).click();
  await dialog(page, "Edit property").getByRole("button", { name: "Not supported", exact: true }).click();
  await dialog(page, "Option settings").getByRole("button", { name: "Delete option", exact: true }).click();
  await dialog(page, "Edit property").getByRole("button", { name: "Done", exact: true }).click();
  await expect(dialog(page, "Edit property").getByRole("status")).toContainText("Options used by records cannot be removed");
  await button(page, "Discard menu changes").click();
  await button(page, "Edit In Markdown property").click();
  await dialog(page, "Property settings").getByRole("button", { name: "Change type", exact: true }).click();
  await page.screenshot({ path: info.outputPath("property-types.png") });
  await dialog(page, "Change type").getByRole("button", { name: "Number", exact: true }).click();
  await button(page, "Save property").click();
  await expect(dialog(page, "Property settings").getByRole("status")).toContainText("Changing a populated field type");
  await button(page, "Discard menu changes").click();
});

test("table groups, compact list properties and load more survive reload", async ({ page, request }, info) => {
  const fixture = await createBlockDatabase(request);
  for (let index = 0; index < 11; index++) expect((await request.post(`/api/data-sources/${fixture.schema.id}/records`, { data: { baseRevision: fixture.schema.revision, title: `Extra ${index}` } })).ok()).toBeTruthy();
  await page.goto(`/#database/${fixture.database.id}`);
  const settings = await layout(page);
  await settings.getByRole("button", { name: "Load limit", exact: true }).click();
  await dialog(page, "Load limit").getByRole("button", { name: "25", exact: true }).click();
  await settings.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator("tbody tr[data-page-id]:visible")).toHaveCount(25);
  await button(page, "Load more (25 of 26)").click();
  await expect(page.locator("tbody tr[data-page-id]:visible")).toHaveCount(26);
  await page.reload(); await expect(page.locator("tbody tr[data-page-id]:visible")).toHaveCount(25);
  await button(page, "Edit In Markdown property").click();
  await dialog(page, "Property settings").getByRole("button", { name: "Group", exact: true }).click();
  await dialog(page, "Group").getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator(".database-table-group")).toHaveCount(4);
  const list = await layout(page);
  await list.getByRole("button", { name: "List", exact: true }).click();
  await dialog(page, "Layout").getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator(".database-layout-list .database-record-card")).toHaveCount(25);
  await page.screenshot({ path: info.outputPath("list.png"), fullPage: true });
  await page.reload();
  await expect(page.locator(".database-layout-list .database-record-card")).toHaveCount(25);
  await page.setViewportSize({ width: 390, height: 844 });
  await button(page, "View settings").click();
  await dialog(page, "View settings").getByRole("button", { name: "Property visibility", exact: true }).click();
  const bounds = await dialog(page, "Property visibility").boundingBox(); expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
});

test("stale property menus retain their edits and block navigation", async ({ page, request }) => {
  const fixture = await createBlockDatabase(request);
  await page.goto(`/#database/${fixture.database.id}`);
  await button(page, "Edit In Markdown property").click();
  await page.getByLabel("Property name", { exact: true }).fill("Local draft name");
  expect((await request.put(`/api/data-sources/${fixture.schema.id}`, { data: { baseRevision: fixture.schema.revision, title: "External schema change" } })).ok()).toBeTruthy();
  await button(page, "Save property").click();
  await expect(dialog(page, "Property settings").getByRole("status")).toContainText(/changed/i);
  await expect(page.getByLabel("Property name", { exact: true })).toHaveValue("Local draft name");
  await page.getByRole("button", { name: "Databases", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`#database/${fixture.database.id}$`));
  expect((await (await request.get(`/api/data-sources/${fixture.schema.id}`)).json()).properties.find((item: any) => item.key === "inMarkdown").name).toBe("In Markdown");
  await button(page, "Discard menu changes").click();
});

test("group sections repeat columns, collapse, recolor, add records and restore hidden groups", async ({ page, request }, info) => {
  const fixture = await createBlockDatabase(request);
  await page.goto(`/#database/${fixture.database.id}`);
  await button(page, "Edit In Markdown property").click();
  await dialog(page, "Property settings").getByRole("button", { name: "Group", exact: true }).click();
  await dialog(page, "Group").getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator(".database-group-columns")).toHaveCount(4);
  await expect(button(page, "New page in Not Available")).toBeVisible();
  await button(page, "Collapse group Available").click();
  await expect(page.locator("tbody tr[data-page-id]:visible")).toHaveCount(4);
  await page.reload();
  await expect(button(page, "Expand group Available")).toBeVisible();
  await button(page, "Expand group Available").click();
  await expect(page.locator("tbody tr[data-page-id]:visible")).toHaveCount(15);
  await button(page, "Group options: Not Available").click();
  await page.screenshot({ path: info.outputPath("group-menu.png") });
  await dialog(page, "Group options").getByRole("switch", { name: "Show aggregation", exact: true }).click();
  await expect(dialog(page, "Group options")).toHaveCount(0);
  await button(page, "Group options: Not Available").click();
  await dialog(page, "Group options").getByRole("button", { name: "Blue", exact: true }).click();
  await expect(page.locator('.database-table-group[data-group="no"] .database-tag')).toHaveAttribute("data-color", "blue");
  await expect(page.locator(".database-group-count")).toHaveCount(0);
  await button(page, "New page in Not Available").click();
  await page.getByLabel("Row title", { exact: true }).fill("Created inside a group");
  await button(page, "Create row").click();
  const snapshot = await (await request.get(`/api/databases/${fixture.database.id}`)).json();
  expect(snapshot.pages.find((item: any) => item.title === "Created inside a group").properties.inMarkdown).toBe("no");
  await button(page, "Group options: Not Available").click();
  await dialog(page, "Group options").getByRole("button", { name: "Hide group", exact: true }).click();
  await expect(page.locator('.database-table-group[data-group="no"]')).toHaveCount(0);
  await button(page, "View settings").click();
  await dialog(page, "View settings").getByRole("button", { name: "Group", exact: true }).click();
  await dialog(page, "Group").getByRole("switch", { name: "Not Available", exact: true }).click();
  await dialog(page, "Group").getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator('.database-table-group[data-group="no"]')).toBeVisible();
  await page.screenshot({ path: info.outputPath("grouped-table.png"), fullPage: true });
  await button(page, "Group options: Sometime Available").click();
  await dialog(page, "Group options").getByRole("button", { name: "Move to Trash", exact: true }).click();
  await expect(dialog(page, "Move group to Trash")).toContainText("1 page");
  await dialog(page, "Move group to Trash").getByRole("button", { name: "Move to Trash", exact: true }).click();
  await expect.poll(async () => (await (await request.get(`/api/pages/${fixture.callout.id}`)).json()).trashed).toBe(true);
  expect((await (await request.get(`/api/pages/${fixture.records[0].id}`)).json()).trashed).not.toBe(true);
});
