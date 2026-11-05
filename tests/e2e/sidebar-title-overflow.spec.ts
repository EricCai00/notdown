import { test, expect, type Locator } from "@playwright/test";

test("long sidebar titles stay on one line with actions visible at different widths", async ({ page, request }, info) => {
  const title = "Database 视图展示 · 从这里开始 VeryLongUnbrokenPageTitle".repeat(3);
  const parent = await (await request.post("/api/pages", { data: { title, favorite: true, icon: "📚" } })).json();
  const child = await (await request.post("/api/pages", { data: { title, parent: parent.id } })).json();
  const database = await (await request.post("/api/databases", { data: { title } })).json();
  const source = database.dataSources[0];
  const updated = await (await request.post(`/api/databases/${database.database.id}/views`, { data: {
    baseRevision: database.database.revision, dataSourceId: source.id, name: title, type: "list",
  } })).json();
  await page.addInitScript(() => localStorage.setItem("notdown-sidebar-tree", JSON.stringify({ databaseChildren: "views", expandDepth: 1 })));
  await page.goto(`/#page/${parent.id}`);
  await expect(page.locator("#page-title")).toHaveValue(title);
  const rows = [
    page.locator(`#page-tree [data-page-row="${parent.id}"]`),
    page.locator(`#page-tree [data-page-row="${child.id}"]`),
    page.locator(`#favorite-pages [data-page-row="${parent.id}"]`),
    page.locator(`#page-tree [data-page-row="${database.hostPage.id}"]`),
    page.locator(`[data-database-view-row="${updated.views.at(-1).id}"]`),
  ];
  const check = async (row: Locator) => {
    const label = row.locator(".tree-page > span:last-child");
    await expect(label).toHaveCSS("text-overflow", "ellipsis");
    const bounds = await label.evaluate(el => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return { lines: new Set(Array.from(range.getClientRects(), rect => Math.round(rect.y))).size, clipped: el.scrollWidth > el.clientWidth,
        right: el.getBoundingClientRect().right };
    });
    expect(bounds.lines).toBe(1);
    expect(bounds.clipped).toBe(true);
    expect((await row.boundingBox())!.height).toBe(30);
    const action = row.locator(".tree-menu");
    if (await action.count()) {
      await expect(action).toHaveCSS("opacity", "1");
      expect(bounds.right).toBeLessThanOrEqual((await action.boundingBox())!.x + 1);
    }
  };
  for (const width of [200, 300, 480]) {
    await page.evaluate(value => document.documentElement.style.setProperty("--sidebar-width", `${value}px`), width);
    for (const row of rows) {
      await row.hover();
      await check(row);
      await page.mouse.move(900, 100);
      await row.locator(".tree-page").focus();
      await check(row);
      await page.locator("#page-title").focus();
      expect((await row.boundingBox())!.height).toBe(30);
    }
  }
  await rows[0].hover();
  await page.screenshot({ path: info.outputPath("sidebar-single-line.png") });
});
