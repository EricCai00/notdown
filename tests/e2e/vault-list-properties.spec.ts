import { test, expect, type Page } from "@playwright/test";

async function expectPropertyHeadingAtGap(page: Page) {
  const offset = await page.locator(".pages-table").evaluate(table => {
    const heading = table.querySelector(".vault-list-properties-heading > span")!.getBoundingClientRect();
    const property = table.querySelector(".vault-list-property")!;
    const key = property.querySelector("dt")!.getBoundingClientRect();
    const value = property.querySelector("dd")!.getBoundingClientRect();
    return Math.abs(heading.x + heading.width / 2 - (key.right + value.left) / 2);
  });
  expect(offset, "property heading is centered on the gap between key and value").toBeLessThan(1);
}

test("vault list shows source property names and readable values without changing legacy keys", async ({ page, request }, info) => {
  const snapshot = await (await request.post("/api/databases", { data: { title: "Applications" } })).json();
  const initial = snapshot.dataSources[0];
  const legacy = "notion_585479d7-a14b-5d75-a6a3-64f2df000001";
  const uuid = "585479d7-a14b-5d75-a6a3-64f2df000002";
  const schemaResponse = await request.put(`/api/data-sources/${initial.id}`, { data: { baseRevision: initial.revision, properties: [
    ...initial.properties,
    { id: "usage", key: legacy, name: "Usage", type: "status", options: [{ id: "used-id", name: "Used note apps", color: "blue" }] },
    { id: "platforms", key: uuid, name: "Platforms", type: "multi_select", options: [{ id: "windows-id", name: "Windows" }, { id: "mac-id", name: "macOS" }] },
    { id: "count", key: "count", name: "Count", type: "number" },
    { id: "done", key: "done", name: "Done", type: "checkbox" },
  ] } });
  expect(schemaResponse.ok()).toBeTruthy();
  const schema = await schemaResponse.json();
  const response = await request.post(`/api/data-sources/${initial.id}/records`, { data: { baseRevision: schema.revision, title: "OneNote", properties: { [legacy]: "used-id", [uuid]: ["windows-id", "mac-id"], count: 0, done: false } } });
  expect(response.ok()).toBeTruthy();
  const record = await response.json();
  const ordinary = await (await request.post("/api/pages", { data: { title: "Ordinary page", properties: { "Custom <name>": "Value <text>", tags: ["Personal", "Work"] } } })).json();
  await page.goto("/#vault/list");
  const row = page.locator(".pages-table tr").filter({ has: page.locator(`[data-open="${record.id}"]`) });
  await expect(row.locator("dt")).toHaveText(["Usage", "Platforms", "Count", "Done"]);
  await expect(row.locator("dd")).toHaveText(["Used note apps", "Windows, macOS", "0", "☐"]);
  await expect(row).not.toContainText("notion_");
  await expect(row).not.toContainText("used-id");
  const colors = await row.locator(".vault-list-property").first().evaluate(el => [getComputedStyle(el.querySelector("dt")!).color, getComputedStyle(el.querySelector("dd")!).color]);
  expect(colors[0]).not.toBe(colors[1]);
  const ordinaryRow = page.locator(".pages-table tr").filter({ has: page.locator(`[data-open="${ordinary.id}"]`) });
  await expect(ordinaryRow.locator("dt")).toHaveText(["Custom <name>", "tags"]);
  await expect(ordinaryRow.locator("dd")).toHaveText(["Value <text>", "Personal, Work"]);
  const search = page.getByRole("textbox", { name: "Filter pages", exact: true });
  await search.fill("Platforms"); await expect(row).toBeVisible(); await expect(ordinaryRow).toHaveCount(0);
  await search.fill("Windows"); await expect(row).toBeVisible();
  await search.fill("");
  await expectPropertyHeadingAtGap(page);
  await page.screenshot({ path: info.outputPath("vault-list-properties.png"), fullPage: true });
  await page.setViewportSize({ width: 600, height: 850 });
  await expect(row.locator("dd").first()).toBeVisible();
  await expectPropertyHeadingAtGap(page);
  await page.screenshot({ path: info.outputPath("vault-list-properties-narrow.png"), fullPage: true });
  const renamed = await request.put(`/api/data-sources/${initial.id}`, { data: { baseRevision: schema.revision, properties: schema.properties.map((field: any) => field.id === "usage" ? { ...field, name: "Application category" } : field) } });
  expect(renamed.ok()).toBeTruthy();
  await page.reload();
  await expect(row.locator("dt").first()).toHaveText("Application category");
  const after = await (await request.get(`/api/pages/${record.id}`)).json();
  expect(after.properties).toEqual(record.properties); expect(after.revision).toBe(record.revision); expect(after.body).toBe(record.body);
});
