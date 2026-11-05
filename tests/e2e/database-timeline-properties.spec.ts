import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

async function fixture(request: APIRequestContext, scale = "5-years") {
  let snapshot = await (await request.post("/api/databases", { data: { title: "Timeline properties" } })).json();
  const initial = snapshot.dataSources[0];
  const source = await (await request.put(`/api/data-sources/${initial.id}`, { data: { baseRevision: initial.revision, properties: [
    ...initial.properties,
    { id: "date", key: "date", name: "Date", type: "date" },
    { id: "status", key: "status", name: "Status", type: "status", options: [{ id: "doing", name: "In progress", color: "blue" }] },
    { id: "count", key: "count", name: "Count", type: "number" },
    { id: "check", key: "check", name: "Checked", type: "checkbox" },
    { id: "assign", key: "assign", name: "Assign", type: "people" },
    { id: "before", key: "before", name: "Blocked by", type: "relation", localRelation: true, dependencyRole: "blockedBy" },
  ] } })).json();
  const person = await (await request.post("/api/people", { data: { name: "Maya" } })).json();
  const records = [];
  for (const [title, start, end] of [
    ["Card 2", "2026-11-02", "2026-11-04"],
    ["单日任务 · Today", "2026-11-03", "2026-11-03"],
    ["长任务 · Three months", "2026-10-01", "2026-12-15"],
    ["Later acceptance", "2026-11-09", "2026-11-11"],
  ]) records.push(await (await request.post(`/api/data-sources/${source.id}/records`, { data: {
    baseRevision: source.revision, title, properties: { date: { start, end }, status: "doing", count: 0, check: false, assign: [{ id: person.id, name: "Maya" }] },
  } })).json());
  for (const record of records) expect(record.id, JSON.stringify(record)).toBeTruthy();
  records[3] = await (await request.put(`/api/data-sources/${source.id}/records/${records[3].id}`, { data: {
    baseRevision: records[3].revision, schemaRevision: source.revision, propertyId: "before", value: [{ pageId: records[0].id, title: "Old title" }],
  } })).json();
  snapshot = await (await request.get(`/api/databases/${snapshot.database.id}`)).json();
  snapshot = await (await request.post(`/api/databases/${snapshot.database.id}/views`, { data: {
    baseRevision: snapshot.database.revision, name: "Timeline", type: "timeline", rowOrder: records.map(record => record.id),
    propertyIds: [source.properties[0].id, "date", "status", "count", "check", "assign", "before"],
    layout: { datePropertyId: "date", timelineScale: scale, timelineTable: false },
  } })).json();
  expect(snapshot.views, JSON.stringify(snapshot)).toBeDefined();
  return { snapshot, records, view: snapshot.views.at(-1) };
}

async function visibility(page: Page) {
  await page.getByRole("button", { name: "View settings", exact: true }).click();
  await page.getByRole("button", { name: "Property visibility", exact: true }).click();
  return page.getByRole("dialog", { name: "Property visibility", exact: true });
}

test("timeline properties extend beside short titles and persist visibility/order without changing records", async ({ page, request }, info) => {
  const data = await fixture(request);
  await page.clock.setFixedTime(new Date("2026-11-03T12:00:00Z"));
  await page.goto(`/#database/${data.snapshot.database.id}?view=${data.view.id}`);
  const bar = page.locator(`.database-timeline-row[data-page-id='${data.records[3].id}'] .database-timeline-bar`);
  const properties = bar.locator(".database-timeline-property");
  await expect(properties).toHaveText(["November 9, 2026 → November 11, 2026", "In progress", "0", "☐", "Maya", /Card 2$/]);
  await expect(bar.locator(".database-timeline-open button")).toHaveCount(0);
  const geometry = await bar.evaluate(el => ({ bar: el.clientWidth, content: el.querySelector(".database-timeline-content")!.getBoundingClientRect().width }));
  expect(geometry.bar).toBeLessThan(25); expect(geometry.content).toBeGreaterThan(500);
  await expect(bar.locator(".database-timeline-bar-title")).toHaveCSS("font-weight", "500");
  let menu = await visibility(page);
  await menu.getByRole("button", { name: "Hide all", exact: true }).click();
  await menu.getByRole("textbox").fill("date");
  await expect(menu.getByRole("switch")).toHaveCount(1);
  await menu.getByRole("switch", { name: "Date", exact: true }).click();
  await menu.getByRole("textbox").fill("");
  await menu.getByRole("switch", { name: "Status", exact: true }).click();
  await menu.locator('[data-property-id="status"]').getByRole("button", { name: "Move up", exact: true }).click();
  await menu.getByRole("button", { name: "Close", exact: true }).click();
  await expect(properties).toHaveText(["In progress", "November 9, 2026 → November 11, 2026"]);
  await page.reload();
  await expect(properties).toHaveText(["In progress", "November 9, 2026 → November 11, 2026"]);
  await page.screenshot({ path: info.outputPath("timeline-properties.png") });
  menu = await visibility(page);
  const latest = await (await request.get(`/api/databases/${data.snapshot.database.id}`)).json();
  const view = latest.views.find((item: any) => item.id === data.view.id);
  expect((await request.put(`/api/database-views/${view.id}`, { data: { baseRevision: view.revision, name: "External timeline" } })).ok()).toBeTruthy();
  await menu.getByRole("switch", { name: "Status", exact: true }).click();
  await menu.getByRole("button", { name: "Close", exact: true }).click();
  await expect(menu.getByRole("button", { name: "Discard menu changes", exact: true })).toBeVisible();
  await expect(menu.getByRole("switch", { name: "Status", exact: true })).toHaveAttribute("aria-checked", "false");
  for (const record of data.records) {
    const saved = await (await request.get(`/api/pages/${record.id}`)).json();
    expect(saved.properties).toEqual(record.properties); expect(saved.revision).toBe(record.revision);
  }
});

test("dependency crossings stay behind task content and keep card clicks from removing the link", async ({ page, request }, info) => {
  const data = await fixture(request, "month");
  await page.clock.setFixedTime(new Date("2026-11-03T12:00:00Z"));
  await page.goto(`/#database/${data.snapshot.database.id}?view=${data.view.id}`);
  const path = page.locator(".database-timeline-links path");
  await expect(path).toHaveCount(1);
  await expect(path).toHaveCSS("stroke-opacity", "0.65");
  const crossing = await path.evaluate((el, recordId) => {
    const line = el as SVGPathElement, bar = document.querySelector(`.database-timeline-row[data-page-id='${recordId}'] .database-timeline-bar`)!, rect = bar.getBoundingClientRect();
    for (let length = 0; length < line.getTotalLength(); length += 1) {
      const point = line.getPointAtLength(length), screen = new DOMPoint(point.x, point.y).matrixTransform(line.getScreenCTM()!);
      if (screen.x > rect.left + 8 && screen.x < rect.right - 8 && screen.y > rect.top + 8 && screen.y < rect.bottom - 8) {
        const hit = document.elementFromPoint(screen.x, screen.y);
        return { x: screen.x, y: screen.y, pageId: hit?.closest<HTMLElement>(".database-timeline-row")?.dataset.pageId };
      }
    }
    return null;
  }, data.records[2].id);
  expect(crossing?.pageId).toBe(data.records[2].id);
  await page.screenshot({ path: info.outputPath("timeline-link-behind-cards.png") });
  await page.mouse.click(crossing!.x, crossing!.y);
  await expect(page.locator(".database-peek-mount")).toBeVisible();
  const saved = await (await request.get(`/api/pages/${data.records[3].id}`)).json();
  expect(saved.properties.before).toEqual(data.records[3].properties.before);
});

test("offscreen tasks show only an edge arrow and return their title/properties when reached", async ({ page, request }, info) => {
  const data = await fixture(request);
  await page.clock.setFixedTime(new Date("2026-11-03T12:00:00Z"));
  await page.goto(`/#database/${data.snapshot.database.id}?view=${data.view.id}`);
  const row = page.locator(`.database-timeline-row[data-page-id='${data.records[0].id}']`);
  const jump = row.getByRole("button", { name: "Jump to task: Card 2", exact: true });
  for (const [direction, arrow] of [["Previous period", "→"], ["Next period", "←"]]) {
    await page.getByRole("button", { name: "Today", exact: true }).click();
    // Cover tasks within the padded grid and tasks beyond its date window.
    for (let i = 0; i < 2; i++) {
      const heading = page.locator(".database-timeline-toolbar h2"), before = await heading.textContent();
      await page.getByRole("button", { name: direction, exact: true }).click();
      await expect(heading).not.toHaveText(before!);
      await expect(jump).toHaveAttribute("data-direction", arrow === "←" ? "left" : "right");
      await expect(jump).toBeInViewport();
      await expect(row.locator(".database-timeline-content:visible")).toHaveCount(0);
      const bounds = (await jump.boundingBox())!, viewport = (await page.locator(".database-timeline-scroll").boundingBox())!;
      expect(bounds.width).toBeLessThanOrEqual(18);
      expect(arrow === "←" ? bounds.x - viewport.x : viewport.x + viewport.width - bounds.x - bounds.width).toBeLessThan(28);
    }
    await page.screenshot({ path: info.outputPath(`timeline-offscreen-${direction.split(" ")[0]}.png`) });
    await jump.click();
    await expect(row.locator(".database-timeline-bar-title")).toBeInViewport();
    await expect(row.locator('.database-timeline-bar [data-property-id="status"]')).toBeVisible();
    await expect(jump).toBeHidden();
  }
  await page.getByRole("button", { name: "Next period", exact: true }).click();
  await expect(jump).toHaveAttribute("data-direction", "left");
  await page.getByRole("button", { name: "Show table", exact: true }).click();
  await page.setViewportSize({ width: 800, height: 900 });
  await expect(jump).toBeInViewport();
  await expect.poll(() => row.evaluate(el => {
    const name = el.querySelector(".database-timeline-label")!.getBoundingClientRect();
    const jump = el.querySelector<HTMLButtonElement>(".database-timeline-jump")!;
    return jump.hidden ? NaN : jump.getBoundingClientRect().left - name.right;
  })).toBeCloseTo(8, 0);
});
