import { test, expect, type APIRequestContext } from "@playwright/test";

async function fixture(request: APIRequestContext, scale = "5-years") {
  let snapshot = await (await request.post("/api/databases", { data: { title: "Readable timeline titles" } })).json();
  const initial = snapshot.dataSources[0];
  const source = await (await request.put(`/api/data-sources/${initial.id}`, { data: { baseRevision: initial.revision, properties: [
    ...initial.properties, { id: "date", key: "date", name: "Date", type: "date" },
    { id: "before", key: "before", name: "Blocked by", type: "relation", localRelation: true, dependencyRole: "blockedBy" },
  ] } })).json();
  const records = [];
  for (const [title, date] of [
    ["Card 1", { start: "2026-11-03", end: "2026-11-04" }],
    ["短卡片也要显示完整任务名称 · Review the complete release checklist", { start: "2026-11-03", end: "2026-11-03" }],
    ["Later acceptance", { start: "2026-11-09", end: "2026-11-11" }],
    ["Earlier zoned meeting", { start: "2026-11-03T09:00:00", end: "2026-11-03T11:30:00", time_zone: "America/Los_Angeles" }],
  ]) records.push(await (await request.post(`/api/data-sources/${source.id}/records`, { data: { title, properties: { date }, baseRevision: source.revision } })).json());
  snapshot = await (await request.get(`/api/databases/${snapshot.database.id}`)).json();
  snapshot = await (await request.post(`/api/databases/${snapshot.database.id}/views`, { data: {
    baseRevision: snapshot.database.revision, name: "Timeline", type: "timeline", rowOrder: records.map(p => p.id),
    layout: { datePropertyId: "date", timelineScale: scale, timelineTable: false },
  } })).json();
  return { source, records, snapshot, view: snapshot.views.at(-1) };
}

test("edge arrows stay pinned during continuous scrolling with and without the name column", async ({ page, request }, info) => {
  const data = await fixture(request, "quarter");
  const distant = [];
  for (const [title, start] of [["Earlier task", "2020-01-01"], ["Future task", "2035-01-01"]]) {
    const response = await request.post(`/api/data-sources/${data.source.id}/records`, {
      data: { baseRevision: data.source.revision, title, properties: { date: { start, end: start } } },
    });
    expect(response.ok()).toBeTruthy(); distant.push(await response.json());
  }
  await page.clock.setFixedTime(new Date("2026-11-03T12:00:00Z"));
  await page.goto(`/#database/${data.snapshot.database.id}?view=${data.view.id}`);
  for (const showTable of [false, true]) {
    if (showTable) await page.getByRole("button", { name: "Show table", exact: true }).click();
    await expect(page.locator(".database-timeline-grid")).toHaveCSS("--timeline-label", showTable ? "210px" : "0px");
    for (const width of [1440, 900]) {
      await page.setViewportSize({ width, height: 900 });
      const arrows = page.locator('.database-timeline-jump:visible');
      await expect(page.getByRole("button", { name: "Jump to task: Earlier task", exact: true })).toBeInViewport();
      await expect(page.getByRole("button", { name: "Jump to task: Future task", exact: true })).toBeInViewport();
      await expect.poll(() => page.locator(".database-timeline-scroll").evaluate(el => {
        const viewport = el.querySelector(".database-timeline-jump-viewport")!;
        const label = parseFloat(getComputedStyle(el.querySelector(".database-timeline-grid")!).getPropertyValue("--timeline-label"));
        return viewport.getBoundingClientRect().width - (el.clientWidth - label);
      })).toBe(0);
      // Sample before scroll handlers run as well as after each animation frame:
      // compensating absolute positions in a scroll handler produces a visible lag.
      const result = await page.locator(".database-timeline-scroll").evaluate(async scroller => {
        const left = scroller.querySelector<HTMLElement>('[title^="Earlier task:"]')!;
        const right = scroller.querySelector<HTMLElement>('[title^="Future task:"]')!;
        await new Promise(requestAnimationFrame);
        const original = [left.getBoundingClientRect().x, right.getBoundingClientRect().x];
        const start = scroller.scrollLeft, deviations: number[] = [];
        const sample = () => deviations.push(...[left, right].map((arrow, i) => Math.abs(arrow.getBoundingClientRect().x - original[i])));
        for (let i = 0; i < 48; i++) {
          scroller.scrollLeft = start + Math.round(Math.sin(i / 5) * 160);
          sample(); await new Promise(requestAnimationFrame); sample();
        }
        scroller.scrollLeft = start;
        return { maxDeviation: Math.max(...deviations), original };
      });
      expect(result.maxDeviation).toBeLessThan(1);
      const bounds = (await page.locator(".database-timeline-scroll").boundingBox())!;
      expect(result.original[0] - bounds.x).toBeCloseTo((showTable ? 210 : 0) + 8, 0);
      expect(bounds.x + bounds.width - result.original[1]).toBeCloseTo(24, 0);
      await expect(arrows).toHaveCount(2);
    }
  }
  await page.screenshot({ path: info.outputPath("stable-edge-arrows.png") });
  await page.getByRole("button", { name: "Jump to task: Future task", exact: true }).click();
  await expect(page.locator(`.database-timeline-row[data-page-id='${distant[1].id}'] .database-timeline-bar-title`)).toBeInViewport();
  for (const record of distant) expect((await (await request.get(`/api/pages/${record.id}`)).json()).properties.date).toEqual(record.properties.date);
});

test("short date bars retain full clickable titles at coarse scales", async ({ page, request }, info) => {
  const data = await fixture(request);
  await page.clock.setFixedTime(new Date("2026-11-03T12:00:00Z"));
  await page.goto(`/#database/${data.snapshot.database.id}?view=${data.view.id}`);
  const row = page.locator(`.database-timeline-row[data-page-id='${data.records[1].id}']`);
  const bar = row.locator(".database-timeline-bar"), title = row.locator(".database-timeline-bar-title");
  for (const scale of ["5 Years", "Year", "Month"]) {
    await page.getByRole("button", { name: "Time scale", exact: true }).click();
    await page.getByRole("dialog", { name: "Time scale", exact: true }).getByRole("button", { name: scale, exact: true }).click();
    await expect(page.getByRole("button", { name: "Time scale", exact: true })).toHaveText(scale);
    await expect(title).toBeInViewport();
    await expect.poll(() => title.evaluate(el => {
      const text = el.getBoundingClientRect(), bar = el.closest(".database-timeline-bar")!.getBoundingClientRect();
      return { readable: text.width > 300, overflow: text.right - bar.right > 100, short: bar.width <= 32, unclipped: el.scrollWidth <= el.clientWidth };
    })).toEqual({ readable: true, overflow: true, short: true, unclipped: true });
    await page.screenshot({ path: info.outputPath(`short-title-${scale.replaceAll(" ", "-")}.png`) });
  }
  await page.getByRole("button", { name: "Show table", exact: true }).click();
  await expect(title).toBeInViewport();
  const text = (await title.boundingBox())!;
  // Click the extended part of the title, well outside the date bar and handles.
  await page.mouse.click(text.x + text.width - 20, text.y + text.height / 2);
  await expect(page.locator(".database-peek-mount")).toBeVisible();
  expect((await (await request.get(`/api/pages/${data.records[1].id}`)).json()).properties.date).toEqual(data.records[1].properties.date);
});

test("extended titles drag the short bar without moving its resize or dependency anchors", async ({ page, request }) => {
  const data = await fixture(request, "month");
  await page.clock.setFixedTime(new Date("2026-11-03T12:00:00Z"));
  await page.goto(`/#database/${data.snapshot.database.id}?view=${data.view.id}`);
  const row = page.locator(`.database-timeline-row[data-page-id='${data.records[1].id}']`);
  const bar = row.locator(".database-timeline-bar"), title = row.locator(".database-timeline-bar-title");
  await expect(title).toBeInViewport();
  const text = (await title.boundingBox())!;
  await page.mouse.move(text.x + text.width - 20, text.y + text.height / 2);
  await page.mouse.down(); await page.mouse.move(text.x + text.width + 16, text.y + text.height / 2, { steps: 5 }); await page.mouse.up();
  await expect.poll(async () => (await (await request.get(`/api/pages/${data.records[1].id}`)).json()).properties.date.start).toBe("2026-11-04");
  const bounds = (await bar.boundingBox())!;
  const end = (await row.locator(".database-timeline-handle.is-end").boundingBox())!;
  expect(end.x + end.width).toBeCloseTo(bounds.x + bounds.width - 1, 0);
  await page.mouse.move(end.x + 3, end.y + 10); await page.mouse.down();
  await page.mouse.move(end.x + 39, end.y + 10, { steps: 5 }); await page.mouse.up();
  await expect.poll(async () => (await (await request.get(`/api/pages/${data.records[1].id}`)).json()).properties.date.end).toBe("2026-11-05");
  await title.hover();
  const connector = (await row.locator(".database-timeline-connector").boundingBox())!;
  const resized = (await bar.boundingBox())!;
  expect(connector.x).toBeCloseTo(resized.x + resized.width - 1, 0);
});

test("a later prerequisite cannot be attached to an earlier timed meeting when automatic scheduling is enabled", async ({ page, request }) => {
  const data = await fixture(request, "month"), meeting = data.records[3];
  await page.clock.setFixedTime(new Date("2026-11-03T12:00:00Z"));
  await page.goto(`/#database/${data.snapshot.database.id}?view=${data.view.id}`);
  await page.getByRole("button", { name: "Open Later acceptance", exact: true }).hover();
  const from = (await page.getByRole("button", { name: "Edit dependencies: Later acceptance", exact: true }).boundingBox())!;
  const to = (await page.getByRole("button", { name: "Open Earlier zoned meeting", exact: true }).boundingBox())!;
  await page.mouse.move(from.x + 12, from.y + 10); await page.mouse.down();
  await page.mouse.move(to.x + 20, to.y + 18, { steps: 8 }); await page.mouse.up();
  await expect(page.locator(".database-message").first()).toContainText("Edit the timed or zoned date");
  await expect(page.locator(".database-timeline-links path")).toHaveCount(0);
  const saved = await (await request.get(`/api/pages/${meeting.id}`)).json();
  expect(saved.properties.date).toEqual(meeting.properties.date);
  expect(saved.properties.before ?? []).toEqual([]);
  expect(saved.revision).toBe(meeting.revision);
});
