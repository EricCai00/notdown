import { test, expect, type Page } from "@playwright/test";

async function visibility(page: Page) {
  await page.getByRole("button", { name: "View settings", exact: true }).click();
  await page.getByRole("button", { name: "Property visibility", exact: true }).click();
  return page.getByRole("dialog", { name: "Property visibility", exact: true });
}

test("feed bylines, readable properties, visibility and order survive reload without rewriting records", async ({ page, request }, info) => {
  const snapshot = await (await request.post("/api/databases", { data: { title: "Database 1" } })).json();
  const source = snapshot.dataSources[0];
  const schema = await (await request.put(`/api/data-sources/${source.id}`, { data: { baseRevision: source.revision, properties: [
    ...source.properties,
    { id: "assign", key: "assign", name: "Assign", type: "people" },
    { id: "blocked", key: "blocked", name: "Blocked by", type: "relation" },
    { id: "date", key: "date", name: "Date", type: "date" },
    { id: "status", key: "status", name: "Status", type: "status", options: [{ id: "todo", name: "Not started", color: "gray" }, { id: "doing", name: "In progress", color: "blue" }] },
  ] } })).json();
  const records: any[] = [];
  for (let i = 0; i < 3; i++) {
    const created = await (await request.post(`/api/data-sources/${source.id}/records`, { data: { baseRevision: schema.revision, title: `Card ${i + 1}`, properties: {
      assign: [{ id: "eric", name: "Eric Cai" }],
      date: { start: "2026-10-27", end: "2026-10-31" }, status: i === 2 ? "doing" : "todo",
      blocked: i === 1 ? [{ pageId: records[0].id, title: "Old title" }] : [],
    } } })).json();
    expect(created.id, JSON.stringify(created)).toBeTruthy();
    const body = i === 2 ? "A **shared update**.\n\n<script>window.feedUnsafe = true</script>" : "---\nauthor: Eric Cai\n---\n";
    const saved = await (await request.put(`/api/pages/${created.id}`, { data: { baseRevision: created.revision, body } })).json();
    expect(saved.id, JSON.stringify(saved)).toBeTruthy(); records.push(saved);
  }
  await page.goto(`/#database/${snapshot.database.id}`);
  await page.getByRole("button", { name: "New view", exact: true }).click();
  await page.getByRole("dialog", { name: "New view", exact: true }).getByRole("button", { name: "Feed", exact: true }).click();
  await page.getByRole("button", { name: "Create view", exact: true }).click();
  const cards = page.locator(".database-layout-feed .database-record-card");
  const recordCard = (index: number) => page.locator(`.database-layout-feed .database-record-card[data-page-id="${records[index].id}"]`);
  const first = recordCard(0);
  await expect(cards).toHaveCount(3);
  await expect(first.locator(".database-feed-author")).toHaveText("Eric Cai");
  await expect(first.locator(".database-feed-avatar")).toHaveText("E");
  await expect(first.locator(".database-feed-header time")).toContainText("Updated");
  await expect(first.locator('[data-property-id="date"]')).toHaveText("October 27, 2026 → October 31, 2026");
  await expect(first.locator('[data-property-id="assign"]')).toHaveText("Eric Cai");
  await expect(first.locator(".database-feed-content")).toHaveCount(0);
  await expect(recordCard(2).locator(".database-feed-content strong")).toHaveText("shared update");
  await expect(recordCard(2).locator(".database-feed-author")).toHaveCount(0);
  await expect(recordCard(2).locator(".database-feed-avatar svg")).toBeVisible();
  expect(await page.evaluate(() => !!(window as any).feedUnsafe)).toBe(false);
  await expect(first).toHaveCSS("border-radius", "16px");
  await recordCard(1).getByRole("button", { name: "Card 1", exact: true }).click();
  await expect(page.locator(".database-peek-mount")).toBeVisible();
  await page.getByRole("button", { name: "Close record", exact: true }).click();
  await page.screenshot({ path: info.outputPath("feed-desktop.png"), fullPage: true });
  let menu = await visibility(page);
  await expect(menu.getByRole("textbox")).toBeFocused();
  await expect(menu).toContainText("Shown in feed");
  await expect(menu).toHaveCSS("border-radius", "10px");
  const menuBounds = (await menu.boundingBox())!;
  expect(menuBounds.width).toBe(360); expect(menuBounds.height).toBeLessThan(500);
  await expect(menu.getByRole("switch", { name: "Name", exact: true })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("feed-properties.png"), fullPage: true });
  await menu.getByRole("button", { name: "Hide all", exact: true }).click();
  await menu.getByRole("textbox").fill("date");
  await expect(menu.getByRole("switch")).toHaveCount(1);
  await menu.getByRole("switch", { name: "Date", exact: true }).click();
  await menu.getByRole("textbox").fill("");
  await menu.getByRole("switch", { name: "Status", exact: true }).click();
  await menu.locator('[data-property-id="status"]').dragTo(menu.locator('[data-property-id="date"]'));
  await menu.getByRole("button", { name: "Close", exact: true }).click();
  await expect(first.locator(".database-card-property")).toHaveText(["Not started", "October 27, 2026 → October 31, 2026"]);
  await page.reload();
  await expect(first.locator(".database-card-property")).toHaveText(["Not started", "October 27, 2026 → October 31, 2026"]);
  menu = await visibility(page);
  await menu.locator('[data-property-id="date"]').getByRole("button", { name: "Move up", exact: true }).click();
  await menu.getByRole("button", { name: "Close", exact: true }).click();
  await expect(first.locator(".database-card-property")).toHaveText(["October 27, 2026 → October 31, 2026", "Not started"]);
  menu = await visibility(page);
  const latest = await (await request.get(`/api/databases/${snapshot.database.id}`)).json();
  const feed = latest.views.find((view: any) => view.type === "feed");
  const external = await request.put(`/api/database-views/${feed.id}`, { data: { baseRevision: feed.revision, name: "Shared feed" } });
  expect(external.ok()).toBeTruthy();
  await menu.getByRole("switch", { name: "Status", exact: true }).click();
  await menu.getByRole("button", { name: "Close", exact: true }).click();
  await expect(menu.getByRole("button", { name: "Discard menu changes", exact: true })).toBeVisible();
  await expect(menu.getByRole("switch", { name: "Status", exact: true })).toHaveAttribute("aria-checked", "false");
  const afterConflict = await (await request.get(`/api/databases/${snapshot.database.id}`)).json();
  expect(afterConflict.views.find((view: any) => view.id === feed.id).propertyIds).toEqual(feed.propertyIds);
  await menu.getByRole("button", { name: "Discard menu changes", exact: true }).click();
  await page.reload();
  await page.setViewportSize({ width: 390, height: 844 });
  const bounds = await first.evaluate(el => ({ width: el.getBoundingClientRect().width, scroll: el.scrollWidth }));
  expect(bounds.scroll).toBeLessThanOrEqual(Math.ceil(bounds.width));
  await page.screenshot({ path: info.outputPath("feed-narrow.png"), fullPage: true });
  menu = await visibility(page);
  const narrowMenu = (await menu.boundingBox())!;
  expect(narrowMenu.x).toBeGreaterThanOrEqual(0); expect(narrowMenu.x + narrowMenu.width).toBeLessThanOrEqual(390);
  await menu.getByRole("button", { name: "Close", exact: true }).click();
  await page.evaluate(() => localStorage.setItem("notdown-ui-language", "zh-CN")); await page.reload();
  await expect(first.locator(".database-feed-header time")).toContainText("更新于");
  await expect(first.locator('[data-property-id="date"]')).toHaveText("2026年10月27日 → 2026年10月31日");
  for (const record of records) {
    const saved = await (await request.get(`/api/pages/${record.id}`)).json();
    expect(saved.body).toBe(record.body); expect(saved.properties).toEqual(record.properties); expect(saved.revision).toBe(record.revision);
  }
});
