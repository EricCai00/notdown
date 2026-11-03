import { test, expect, type APIRequestContext } from "@playwright/test";

async function post(request: APIRequestContext, url: string, data: unknown) {
  const response = await request.post(url, { data });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

test("inline database controls keep their styles and local scrolling in table and board views", async ({ page, request }, info) => {
  await page.setViewportSize({ width: 1920, height: 1000 });
  let db = await post(request, "/api/databases", { title: "Used note apps" });
  const source = db.dataSources[0];
  const updated = await request.put(`/api/data-sources/${source.id}`, { data: {
    baseRevision: source.revision,
    properties: [...source.properties, { id: "support", key: "support", name: "Markdown", type: "select",
      options: [{ id: "yes", name: "Supported", color: "green" }, { id: "no", name: "Not supported", color: "red" }] },
      ...Array.from({ length: 7 }, (_, index) => ({ id: `field-${index}`, key: `field-${index}`, name: `Column ${index}`, type: "text" }))],
  } });
  expect(updated.ok()).toBeTruthy();
  const schema = await updated.json();
  for (const [title, support] of [["Obsidian", "yes"], ["Stickies", "no"]])
    await post(request, `/api/data-sources/${source.id}/records`, { title, properties: { support }, baseRevision: schema.revision });
  db = await post(request, `/api/databases/${db.database.id}/views`, {
    baseRevision: db.database.revision, name: "Board", type: "board", dataSourceId: source.id, layout: { groupBy: "support" },
  });
  const parent = await post(request, "/api/pages", {
    title: "Note apps", syntax: { version: 1, variant: "notdown", extensions: {} },
    body: `Prose keeps its normal width\n\n<database url="#page/${db.database.id}" inline="true"></database>\n\nAfter the database\n`,
  });
  await page.goto(`/#page/${parent.id}`);
  const inline = page.getByRole("region", { name: "Inline database", exact: true });
  const tab = inline.getByRole("tab", { name: "Table", exact: true });
  await expect(tab).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(tab).toHaveCSS("border-radius", "22px");
  await expect(tab).toHaveCSS("margin", "0px");
  await expect(tab).toHaveCSS("background-color", "rgb(243, 243, 242)");
  await expect(inline.getByLabel("Data source title", { exact: true })).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(inline.getByRole("button", { name: "Search database", exact: true })).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(inline.getByLabel("Markdown: Obsidian", { exact: true })).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  const create = inline.getByRole("button", { name: "Add row", exact: true });
  await expect(create).toHaveCSS("margin", "0px");
  const createBounds = (await create.boundingBox())!, menuBounds = (await inline.getByLabel("New options", { exact: true }).boundingBox())!;
  expect(Math.abs(createBounds.x + createBounds.width - menuBounds.x)).toBeLessThan(1);
  expect(createBounds.height).toBe(menuBounds.height);

  const prose = page.locator(".pm-document > p").filter({ hasText: "Prose keeps its normal width" });
  const normal = (await prose.boundingBox())!;
  const scroll = inline.locator(".database-table-scroll");
  await expect.poll(async () => (await scroll.boundingBox())!.width).toBeGreaterThan(normal.width + 100);
  expect((await inline.locator(".database-toolbar").boundingBox())!.width).toBeLessThanOrEqual(normal.width + 2);
  await scroll.evaluate(element => { element.scrollLeft = 400; });
  expect(await scroll.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
  await page.screenshot({ path: info.outputPath("inline-table.png") });

  await inline.getByRole("tab", { name: "Board", exact: true }).click();
  const card = inline.locator(".database-card-title").filter({ hasText: "Obsidian" });
  await expect(card).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(card).toHaveCSS("margin", "0px");
  await expect(card).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await page.screenshot({ path: info.outputPath("inline-board.png") });
  await page.setViewportSize({ width: 1100, height: 900 });
  expect(await page.locator("#main").evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  expect((await (await request.get(`/api/pages/${parent.id}`)).json()).fullWidth).not.toBe(true);
});
