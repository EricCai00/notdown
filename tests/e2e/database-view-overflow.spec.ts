import { test, expect } from "@playwright/test";

test("overflow keeps the current view name and icon visible through switching and resizing", async ({ page, request }, info) => {
  let snapshot = await (await request.post("/api/databases", { data: { title: "View overflow" } })).json();
  for (const name of ["首图 · 沉浸画廊", "封面 · 渐变卡片", "首块 · 文字摘要", "整页 · 图文预览", "无预览 · 紧凑卡片", "精选 · 评分排序"]) {
    const response = await request.post(`/api/databases/${snapshot.database.id}/views`, {
      data: { baseRevision: snapshot.database.revision, type: "gallery", name },
    });
    expect(response.ok()).toBeTruthy();
    snapshot = await response.json();
  }
  const current = snapshot.views.at(-2), last = snapshot.views.at(-1);
  const iconResponse = await request.put(`/api/database-views/${current.id}`, {
    data: { baseRevision: current.revision, icon: "telescope" },
  });
  expect(iconResponse.ok()).toBeTruthy();
  const baseline = await (await request.get(`/api/databases/${snapshot.database.id}`)).json();
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.goto(`/#database/${snapshot.database.id}?view=${current.id}`);
  const selected = page.locator('[data-db-tab][aria-selected="true"]');
  const more = page.getByRole("button", { name: "More database views", exact: true });
  const checkCurrent = async (name: string, icon: string) => {
    await expect(selected).toBeVisible();
    await expect(selected).toHaveText(name);
    await expect(selected.locator(`[data-view-icon="${icon}"]`)).toBeVisible();
    await expect.poll(() => page.locator(".database-view-tabs").evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    const hiddenCount = await page.locator("[data-db-tab][hidden]").count();
    await expect(more).toHaveText(`${hiddenCount} more…`);
  };
  await checkCurrent(current.name, "telescope");
  await page.screenshot({ path: info.outputPath("current-view-visible.png") });
  await more.click();
  await expect(page.getByRole("menuitemradio", { name: current.name, exact: true })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("menuitemradio", { name: last.name, exact: true }).click();
  await checkCurrent(last.name, "layout-grid");
  await page.setViewportSize({ width: 800, height: 900 });
  await checkCurrent(last.name, "layout-grid");
  await page.reload();
  await checkCurrent(last.name, "layout-grid");
  await more.click();
  await page.getByRole("menuitemradio", { name: current.name, exact: true }).click();
  await checkCurrent(current.name, "telescope");
  await page.setViewportSize({ width: 2400, height: 1000 });
  await expect(more).toBeHidden();
  await expect(page.locator("[data-db-tab]:visible")).toHaveCount(snapshot.views.length);
  expect(await page.locator("[data-db-tab]").evaluateAll(tabs => tabs.map(tab => tab.getAttribute("data-db-tab")))).toEqual(snapshot.views.map((view: { id: string }) => view.id));
  const after = await (await request.get(`/api/databases/${snapshot.database.id}`)).json();
  expect(after.database.revision).toBe(baseline.database.revision);
  expect(after.views).toEqual(baseline.views);
});
