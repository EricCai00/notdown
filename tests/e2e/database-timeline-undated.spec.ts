import { test, expect, type APIRequestContext } from "@playwright/test";

async function fixture(request: APIRequestContext, nested = false) {
  let snapshot = await (await request.post("/api/databases", { data: { title: "Timeline tasks" } })).json();
  const initial = snapshot.dataSources[0];
  const source = await (await request.put(`/api/data-sources/${initial.id}`, { data: {
    baseRevision: initial.revision,
    properties: [...initial.properties, { id: "date", key: "date", name: "Date", type: "date" }, { id: "notes", key: "notes", name: "Notes", type: "text" }, ...(nested ? [
      { id: "parent", key: "parent", name: "Parent item", type: "relation", localRelation: true, subitemRole: "parent" },
      { id: "children", key: "children", name: "Sub-item", type: "relation", readOnly: true, subitemRole: "children", inversePropertyId: "parent" },
    ] : [])],
    ...(nested ? { subitems: { enabled: true, parentPropertyId: "parent", childrenPropertyId: "children" } } : {}),
  } })).json();
  const records: any[] = [];
  for (const [title, properties] of [
    ["Scheduled task", { date: { start: "2026-11-14", end: "2026-11-17" } }],
    ["GEM, MolFormer跑通", {}],
    ["蛋白模型+AMP预测", { date: null, notes: "keep me" }],
    ["迁移学习知识", {}],
  ] as const) {
    // Attach the undated child after its parent has been created.
    const values = nested && title === "迁移学习知识" ? { parent: [{ pageId: records[0].id }] } : properties;
    const response = await request.post(`/api/data-sources/${source.id}/records`, { data: { baseRevision: source.revision, title, properties: values } });
    expect(response.ok()).toBeTruthy(); records.push(await response.json());
  }
  snapshot = await (await request.get(`/api/databases/${snapshot.database.id}`)).json();
  snapshot = await (await request.post(`/api/databases/${snapshot.database.id}/views`, { data: {
    baseRevision: snapshot.database.revision, name: "Timeline", type: "timeline", layout: { datePropertyId: "date" },
  } })).json();
  return { snapshot, source, records, timeline: snapshot.views.at(-1) };
}

test("undated records live in a searchable toolbar popover and opening it never writes dates", async ({ page, request }, info) => {
  const data = await fixture(request);
  await page.clock.setFixedTime(new Date("2026-11-14T12:00:00Z"));
  await page.goto(`/#database/${data.snapshot.database.id}?view=${data.timeline.id}`);
  const trigger = page.getByRole("button", { name: "No date (3)", exact: true });
  await expect(page.locator(".database-toolbar-actions").getByRole("button", { name: "No date (3)", exact: true })).toBeVisible();
  await expect(page.locator(".database-timeline-row[data-page-id]")).toHaveCount(1);
  await expect(page.locator(".database-timeline-no-date")).toHaveCount(0);
  await trigger.click();
  const menu = page.getByRole("dialog", { name: "No date", exact: true });
  const search = menu.getByRole("searchbox", { name: "Search for a page...", exact: true });
  await expect(search).toBeFocused();
  await expect(menu.locator(".database-timeline-undated-item")).toHaveCount(3);
  await page.screenshot({ path: info.outputPath("timeline-undated-menu.png"), fullPage: true });
  await search.fill("amp"); await expect(menu.locator(".database-timeline-undated-item")).toHaveCount(1);
  await expect(menu).toContainText("蛋白模型+AMP预测");
  await search.fill("missing task"); await expect(menu).toContainText("No pages found");
  await search.fill("GEM"); await menu.getByRole("button", { name: "Open GEM, MolFormer跑通", exact: true }).click();
  await expect(menu).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Record title", exact: true })).toHaveValue("GEM, MolFormer跑通");
  await page.getByRole("button", { name: "Close record", exact: true }).click();
  await page.getByRole("button", { name: "Search database", exact: true }).click();
  await page.getByRole("searchbox", { name: "Search database records", exact: true }).fill("迁移");
  await expect(page.getByRole("button", { name: "No date (1)", exact: true })).toBeVisible();
  await expect(page.locator(".database-timeline-row[data-page-id]")).toHaveCount(0);
  await page.getByRole("button", { name: "Close database search", exact: true }).click();
  await expect(trigger).toBeVisible();
  await trigger.click(); await page.keyboard.press("Escape"); await expect(menu).toHaveCount(0);
  await trigger.click(); await trigger.click(); await expect(menu).toHaveCount(0);
  await page.getByRole("button", { name: "Show table", exact: true }).click();
  await expect(page.getByRole("button", { name: "No date (3)", exact: true })).toHaveCount(1);
  await expect(page.locator(".database-timeline-row[data-page-id]")).toHaveCount(1);
  await trigger.click(); await page.getByRole("tab", { name: "Table", exact: true }).click();
  await expect(menu).toHaveCount(0); await expect(trigger).toHaveCount(0);
  await expect(page.locator(".database-scroll-locked")).toHaveCount(0);
  for (const record of data.records) expect((await (await request.get(`/api/pages/${record.id}`)).json()).properties.date).toEqual(record.properties.date);
});

test("scheduling an undated record updates its count, preserves other properties and respects conflicts", async ({ page, request }) => {
  const data = await fixture(request);
  await page.clock.setFixedTime(new Date("2026-11-14T12:00:00Z"));
  await page.goto(`/#database/${data.snapshot.database.id}?view=${data.timeline.id}`);
  await page.getByRole("button", { name: "No date (3)", exact: true }).click();
  await page.getByRole("button", { name: "Add to timeline: 蛋白模型+AMP预测", exact: true }).click();
  await expect(page.getByRole("button", { name: "No date (2)", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open 蛋白模型+AMP预测", exact: true })).toBeVisible();
  const scheduled = await (await request.get(`/api/pages/${data.records[2].id}`)).json();
  expect(scheduled.properties.date).toEqual({ start: "2026-11-14", end: null });
  expect(scheduled.properties.notes).toBe("keep me");
  await page.reload(); await expect(page.getByRole("button", { name: "No date (2)", exact: true })).toBeVisible();
  const baseline = await (await request.get(`/api/pages/${data.records[1].id}`)).json();
  expect((await request.put(`/api/pages/${baseline.id}`, { data: { baseRevision: baseline.revision, body: "External draft" } })).ok()).toBeTruthy();
  await page.getByRole("button", { name: "No date (2)", exact: true }).click();
  await page.getByRole("button", { name: "Add to timeline: GEM, MolFormer跑通", exact: true }).click();
  await expect(page.locator(".database-message").first()).toContainText("Edits remain in this tab");
  const current = await (await request.get(`/api/pages/${baseline.id}`)).json();
  expect(current.body).toBe("External draft"); expect(current.properties.date).toEqual(baseline.properties.date);
});

test("undated children remain accessible with collapsed parents and read-only dates still allow opening", async ({ page, request }) => {
  const data = await fixture(request, true);
  const source = await (await request.get(`/api/data-sources/${data.source.id}`)).json();
  await request.put(`/api/data-sources/${source.id}`, { data: { baseRevision: source.revision, properties: source.properties.map((field: any) => field.id === "date" ? { ...field, readOnly: true } : field) } });
  await page.clock.setFixedTime(new Date("2026-11-14T12:00:00Z"));
  await page.goto(`/#database/${data.snapshot.database.id}?view=${data.timeline.id}`);
  await expect(page.locator(".database-timeline-row[data-page-id]")).toHaveCount(1);
  await page.getByRole("button", { name: "No date (3)", exact: true }).click();
  await expect(page.getByRole("button", { name: "Add to timeline: 迁移学习知识", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Open 迁移学习知识", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Record title", exact: true })).toHaveValue("迁移学习知识");
});
