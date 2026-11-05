import { test, expect } from "@playwright/test";
import { createBlockDatabase } from "./database-fixture";
test.setTimeout(90_000);

test("table hover controls, range selection, select all and bulk property assignment persist", async ({ page, request }, info) => {
  const fixture = await createBlockDatabase(request);
  await page.goto(`/#database/${fixture.database.id}`);
  const rows = page.locator("tbody tr[data-page-id]:visible"), toolbar = page.getByRole("toolbar", { name: "Selected rows" });
  await expect(rows).toHaveCount(15);
  await page.mouse.move(5, 5);
  await expect(rows.first().locator(".database-row-controls")).toHaveCSS("opacity", "0");
  await rows.first().hover();
  await expect(rows.first().locator(".database-row-handle svg circle")).toHaveCount(6);
  await page.screenshot({ path: info.outputPath("row-hover.png") });
  await expect(rows.first().getByRole("button", { name: "Add row above" })).toBeVisible();
  await rows.first().locator(".database-row-select").check();
  await rows.nth(2).locator(".database-row-select").click({ modifiers: ["Shift"] });
  await expect(toolbar).toContainText("3 selected");
  await expect(page.locator("thead .database-select-all")).toHaveJSProperty("indeterminate", true);
  await toolbar.getByRole("button", { name: "Edit property: Class", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Edit property", exact: true });
  await dialog.getByRole("button", { name: "Class: Selected rows", exact: true }).click();
  await page.getByRole("option", { name: "Media", exact: true }).click();
  await dialog.getByRole("button", { name: "Apply to selected rows" }).click();
  await expect(dialog).toHaveCount(0);
  for (const record of fixture.records.slice(0, 3)) await expect.poll(async () => (await (await request.get(`/api/pages/${record.id}`)).json()).properties.class).toBe("media");
  expect((await (await request.get(`/api/pages/${fixture.records[3].id}`)).json()).properties.class).toBe("basic");
  await page.locator("thead .database-select-all").check(); await expect(toolbar).toContainText("15 selected");
  await page.screenshot({ path: info.outputPath("selected-table.png") });
  await page.locator("thead .database-select-all").uncheck(); await expect(toolbar).toBeHidden();
  await rows.first().getByRole("button", { name: "Add row above" }).click();
  await page.getByLabel("Row title", { exact: true }).fill("Inserted above Text");
  await page.getByRole("button", { name: "Create row", exact: true }).click();
  await expect(rows.first()).toContainText("OPEN");
  await expect(rows.first().locator('[data-type="title"] input')).toHaveValue("Inserted above Text");
  await page.reload(); await expect(rows.first().locator('[data-type="title"] input')).toHaveValue("Inserted above Text");
});

test("dragging nonadjacent selected rows keeps their order and saves the view order", async ({ page, request }) => {
  const fixture = await createBlockDatabase(request);
  await page.goto(`/#database/${fixture.database.id}`);
  const rows = page.locator("tbody tr[data-page-id]:visible");
  await rows.nth(0).locator(".database-row-select").check();
  await rows.nth(2).locator(".database-row-select").check();
  const target = rows.nth(5), box = (await target.boundingBox())!;
  await rows.first().hover();
  await rows.first().locator(".database-row-handle").dragTo(target, { targetPosition: { x: 110, y: box.height - 2 } });
  await expect.poll(async () => (await (await request.get(`/api/databases/${fixture.database.id}`)).json()).views[0].rowOrder.slice(4, 6)).toEqual([fixture.records[0].id, fixture.records[2].id]);
  await expect(rows.nth(4)).toHaveAttribute("data-page-id", fixture.records[0].id);
  await page.reload(); await expect(rows.nth(4)).toHaveAttribute("data-page-id", fixture.records[0].id); await expect(rows.nth(5)).toHaveAttribute("data-page-id", fixture.records[2].id);
});

test("bulk conflict stops later writes and retains the remaining draft", async ({ page, request }) => {
  const fixture = await createBlockDatabase(request);
  await page.goto(`/#database/${fixture.database.id}`);
  const rows = page.locator("tbody tr[data-page-id]:visible");
  await rows.nth(0).locator(".database-row-select").check(); await rows.nth(1).locator(".database-row-select").check();
  await page.getByRole("button", { name: "Edit property: Notion Syntax", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Edit property", exact: true });
  await dialog.getByLabel("Notion Syntax: Selected rows", { exact: true }).fill("Bulk draft");
  const record = fixture.records[0];
  expect((await request.put(`/api/pages/${record.id}`, { data: { baseRevision: record.revision, body: "External update" } })).ok()).toBeTruthy();
  await dialog.getByRole("button", { name: "Apply to selected rows" }).click();
  await expect(dialog.getByRole("status")).toContainText("preserved");
  expect((await (await request.get(`/api/pages/${fixture.records[1].id}`)).json()).properties.notionSyntax).toBe("<page>…</page>");
  expect(await page.evaluate(() => Object.keys(sessionStorage).some(key => key.startsWith("notdown-database-draft:") && sessionStorage.getItem(key)?.includes("Bulk draft")))).toBeTruthy();
});

test("grouped select all respects collapsed groups and a load limit", async ({ page, request }) => {
  const fixture = await createBlockDatabase(request);
  for (let index = 0; index < 15; index++) expect((await request.post(`/api/data-sources/${fixture.schema.id}/records`, { data: { baseRevision: fixture.schema.revision, title: `Extra ${index}`, properties: { inMarkdown: "no" } } })).ok()).toBeTruthy();
  const snapshot = await (await request.get(`/api/databases/${fixture.database.id}`)).json(), view = snapshot.views[0];
  expect((await request.put(`/api/database-views/${view.id}`, { data: { baseRevision: view.revision, layout: { groupBy: fixture.fields[1].id, collapsedGroups: ["no"], loadLimit: 25 } } })).ok()).toBeTruthy();
  await page.goto(`/#database/${fixture.database.id}`);
  const rows = page.locator("tbody tr[data-page-id]:visible");
  await expect(page.locator(".database-group-columns")).not.toHaveCount(0);
  const count = await rows.count(); expect(count).toBeGreaterThan(0); expect(count).toBeLessThan(25);
  await page.locator(".database-group-columns .database-select-all").first().check();
  await expect(page.getByRole("toolbar", { name: "Selected rows" })).toContainText(`${count} selected`);
  await expect(page.locator(".database-row-selected")).toHaveCount(count);
  await expect(rows.first().locator(".database-row-handle")).toHaveAttribute("draggable", "false");
});
