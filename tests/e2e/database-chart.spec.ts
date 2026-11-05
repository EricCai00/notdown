import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function choose(page: Page, label: string, value: string) {
  if (label === "Chart type") {
    await page.getByRole("group", { name: label, exact: true }).getByRole("button", { name: value, exact: true }).click();
    return;
  }
  await page.getByRole("dialog", { name: "Layout", exact: true }).getByRole("button", { name: label, exact: true }).click();
  await page.getByRole("dialog", { name: label, exact: true }).getByRole("button", { name: value, exact: true }).click();
}
async function settings(page: Page) {
  await page.getByRole("button", { name: "Configure chart", exact: true }).click();
  const root = page.getByRole("dialog", { name: "View settings", exact: true });
  if (await root.isVisible()) await root.getByRole("button", { name: "Layout", exact: true }).click();
  return page.getByRole("dialog", { name: "Layout", exact: true });
}
async function fixture(request: any) {
  let snapshot = await (await request.post("/api/databases", { data: { title: "Team delivery" } })).json();
  const ds = snapshot.dataSources[0];
  const schema = await (await request.put(`/api/data-sources/${ds.id}`, { data: { baseRevision: ds.revision, properties: [...ds.properties,
    { id: "team", key: "team", name: "Team", type: "select", options: [{id:"design",name:"Design"},{id:"engineering",name:"Engineering"},{id:"marketing",name:"Marketing"}] },
    { id: "status", key: "status", name: "Status", type: "status", options: [{id:"planned",name:"Planned"},{id:"progress",name:"In progress"},{id:"done",name:"Complete"}] },
    { id: "date", key: "date", name: "Date", type: "date" }, { id: "amount", key: "amount", name: "Points", type: "number" }
  ] } })).json();
  const records = [];
  for (const [i, [team, status, amount]] of ([['design','planned',12],['design','progress',24],['design','done',18],['engineering','planned',8],['engineering','progress',32],['engineering','done',28],['marketing','progress',16],['marketing','done',10]] as const).entries()) {
    const response = await request.post(`/api/data-sources/${ds.id}/records`, { data: { baseRevision: schema.revision, title: `Deliverable ${i + 1}`, properties: { team, status, amount, date: {start: `2026-11-${i < 4 ? '01' : '02'}`} } } });
    expect(response.ok()).toBeTruthy(); records.push(await response.json());
  }
  snapshot = await (await request.get(`/api/databases/${snapshot.database.id}`)).json();
  snapshot = await (await request.post(`/api/databases/${snapshot.database.id}/views`, { data: { baseRevision: snapshot.database.revision, type: "chart", name: "Progress by team", layout: { chartGroupBy: "team", chartSeriesBy: "status", chartValueId: "amount", chartAggregation: "sum", chartAxisNames: true } } })).json();
  const chart = snapshot.views.at(-1);
  return { snapshot, chart, records, schema };
}

test("chart series, legend, keyboard drilldown, styled export and narrow layout", async ({ page, request }, info) => {
  test.setTimeout(90000);
  const data = await fixture(request);
  await page.goto(`/#database/${data.snapshot.database.id}`);
  await page.getByRole("tab", { name: "Progress by team", exact: true }).click();
  await expect(page.locator(".database-chart-mark")).toHaveCount(8);
  await expect.poll(() => page.locator(".database-chart-scroll > svg").evaluate(el => el.getBoundingClientRect().height)).toBe(360);
  await expect.poll(() => page.locator(".database-chart-scroll > svg").evaluate(el => el.getBoundingClientRect().width)).toBeGreaterThan(800);
  const mark = page.getByRole("button", { name: "Design · In progress: 24", exact: true });
  await mark.hover(); await expect(page.getByRole("tooltip")).toContainText("24");
  await mark.focus(); await page.keyboard.press("Enter");
  await expect(page.locator(".database-chart-records tbody tr")).toHaveCount(1);
  await expect(page.locator(".database-chart-records")).toContainText("Deliverable 2");
  await page.keyboard.press("Escape"); await expect(mark).toBeFocused();
  await page.locator(".database-chart-legend").getByRole("button", { name: "Planned", exact: true }).click();
  await expect(page.locator(".database-chart-mark")).toHaveCount(6);
  await expect(page.locator(".database-chart-legend").getByRole("button", { name: "Planned", exact: true })).toHaveAttribute("aria-pressed", "false");
  await page.locator(".database-chart-legend").getByRole("button", { name: "Planned", exact: true }).click();
  await page.screenshot({ path: info.outputPath("stacked-chart.png"), fullPage: true });
  for (const kind of ["SVG", "PNG"]) {
    await page.getByRole("button", { name: "Save chart as…", exact: true }).click();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: `Download ${kind}`, exact: true }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe(`Progress by team.${kind.toLowerCase()}`);
    const path = info.outputPath(file.suggestedFilename()); await file.saveAs(path);
    const bytes = await readFile(path);
    if (kind === "SVG") { const svg = bytes.toString(); expect(svg).toContain("Progress by team"); expect(svg).toContain("In progress"); expect(svg).not.toContain("var(--"); }
    else { expect(bytes.subarray(1,4).toString()).toBe("PNG"); expect(bytes.readUInt32BE(16)).toBeGreaterThan(500); }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.locator(".database-chart-scroll").evaluate(el => el.scrollWidth <= el.clientWidth + 4)).toBe(true);
  await page.screenshot({ path: info.outputPath("narrow-chart.png"), fullPage: true });
  for (const record of data.records) expect((await (await request.get(`/api/pages/${record.id}`)).json()).body).toBe(record.body);
});

test("chart type icons switch directly with keyboard access and localized labels", async ({ page, request }, info) => {
  const data = await fixture(request);
  await page.goto(`/#database/${data.snapshot.database.id}`);
  await page.getByRole("tab", { name: "Progress by team", exact: true }).click();
  const panel = await settings(page);
  const picker = page.getByRole("group", { name: "Chart type", exact: true });
  await expect(picker.getByRole("button")).toHaveCount(5);
  await expect(picker.getByRole("button", { name: "Vertical bar", exact: true })).toHaveAttribute("aria-pressed", "true");
  const line = picker.getByRole("button", { name: "Line chart", exact: true });
  await line.focus(); await page.keyboard.press("Enter");
  await expect(line).toBeFocused();
  await expect(line).toHaveAttribute("aria-pressed", "true");
  await expect(picker.locator('[aria-pressed="true"]')).toHaveCount(1);
  await expect(page.locator(".database-chart-line")).toHaveCount(3);
  await expect(panel.getByRole("switch", { name: "Smooth line", exact: true })).toBeVisible();
  await panel.screenshot({ path: info.outputPath("chart-type-icons.png") });
  await panel.getByRole("button", { name: "Close", exact: true }).click();
  await page.reload(); await settings(page);
  await expect(line).toHaveAttribute("aria-pressed", "true");
  await page.setViewportSize({ width: 390, height: 844 });
  const boxes = await picker.getByRole("button").evaluateAll(elements => elements.map(el => ({ top: el.getBoundingClientRect().top, right: el.getBoundingClientRect().right })));
  expect(new Set(boxes.map(box => box.top)).size).toBe(1);
  expect(Math.max(...boxes.map(box => box.right))).toBeLessThan(390);
  await panel.getByRole("button", { name: "Close", exact: true }).click();
  await page.evaluate(() => localStorage.setItem("notdown-ui-language", "zh-CN")); await page.reload();
  await page.getByRole("button", { name: "配置图表", exact: true }).click();
  await expect(page.getByRole("group", { name: "图表类型", exact: true }).getByRole("button", { name: "折线图", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("chart settings persist cumulative lines and preserve drafts on revision conflict", async ({ page, request }, info) => {
  test.setTimeout(90000);
  const data = await fixture(request); await page.goto(`/#database/${data.snapshot.database.id}`);
  await page.getByRole("tab", { name: "Progress by team", exact: true }).click();
  await settings(page); await choose(page, "Chart type", "Line chart"); await choose(page, "What to show", "Date");
  const panel = page.getByRole("dialog", { name: "Layout", exact: true });
  await panel.getByRole("switch", { name: "Cumulative", exact: true }).click();
  await panel.getByRole("switch", { name: "Smooth line", exact: true }).click();
  await panel.getByRole("switch", { name: "Gradient area", exact: true }).click();
  await choose(page, "Chart height", "Large");
  await page.screenshot({ path: info.outputPath("chart-settings.png"), fullPage: true });
  await panel.getByRole("button", { name: "Close", exact: true }).click();
  await page.reload();
  await expect(page.locator(".database-chart-line")).toHaveCount(3);
  await expect(page.getByRole("button", { name: "2026-11-02 · In progress: 72", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "2026-11-02 · In progress: 72", exact: true }).click();
  await expect(page.locator(".database-chart-records tbody tr")).toHaveCount(3);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.screenshot({ path: info.outputPath("cumulative-chart.png"), fullPage: true });
  const latest = (await (await request.get(`/api/databases/${data.snapshot.database.id}`)).json()).views.find((v:any)=>v.id===data.chart.id);
  expect(latest.layout).toMatchObject({chartCumulative:true,chartHeight:"large",chartSmooth:true,chartArea:true});
  await settings(page); await choose(page, "Color", "Purple");
  expect((await request.put(`/api/database-views/${latest.id}`, { data: {baseRevision:latest.revision,name:"External chart name"} })).ok()).toBeTruthy();
  await panel.getByRole("button", { name: "Close", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Discard menu changes", exact: true })).toBeVisible();
  const stored = (await (await request.get(`/api/databases/${data.snapshot.database.id}`)).json()).views.find((v:any)=>v.id===latest.id);
  expect(stored.name).toBe("External chart name"); expect(stored.layout.chartColor).not.toBe("purple");
});

test("chart signed stacks and donut validation", async ({ page, request }) => {
  const data = await fixture(request);
  const first = data.records[0]; expect((await request.put(`/api/data-sources/${data.schema.id}/records/${first.id}`, {data:{baseRevision:first.revision,schemaRevision:data.schema.revision,propertyId:"amount",value:-12}})).ok()).toBeTruthy();
  await page.goto(`/#database/${data.snapshot.database.id}`); await page.getByRole("tab", {name:"Progress by team",exact:true}).click();
  const negative = page.getByRole("button", {name:"Design · Planned: -12",exact:true}); await expect(negative).toBeVisible();
  expect(Number(await negative.getAttribute("height"))).toBeGreaterThan(0);
  await settings(page); await choose(page,"Chart type","Donut"); await choose(page,"What to show","Status");
  await page.getByRole("dialog",{name:"Layout",exact:true}).getByRole("button",{name:"Close",exact:true}).click();
  await expect(page.locator(".database-layout-hint")).toContainText("non-negative");
  await expect(page.getByRole("button",{name:"Save chart as…",exact:true})).toBeDisabled();
  await page.evaluate(()=>localStorage.setItem("notdown-ui-language","zh-CN")); await page.reload();
  await expect(page.getByRole("button",{name:"图表另存为…",exact:true})).toBeDisabled();
});

test("chart type autosave preserves the scrolled database position", async ({ page, request }) => {
  const data = await fixture(request);
  expect((await request.put(`/api/database-views/${data.chart.id}`, { data: {
    baseRevision: data.chart.revision, layout: { ...data.chart.layout, chartHeight: "extra-large" },
  } })).ok()).toBeTruthy();
  await page.setViewportSize({ width: 1440, height: 650 });
  await page.goto(`/#database/${data.snapshot.database.id}`);
  await page.getByRole("tab", { name: "Progress by team", exact: true }).click();
  const pane = page.locator(".database-table-pane");
  await pane.evaluate(el => el.scrollTop = 100);
  await settings(page);
  const before = await pane.evaluate(el => el.scrollTop);
  expect(before).toBeGreaterThan(0);
  const saved = page.waitForResponse(response => response.url().endsWith(`/api/database-views/${data.chart.id}`) && response.request().method() === "PUT");
  await choose(page, "Chart type", "Line chart");
  expect((await saved).ok()).toBeTruthy();
  await expect(page.locator(".database-chart-line")).toHaveCount(3);
  await expect.poll(() => pane.evaluate(el => el.scrollTop)).toBe(before);
  const panel = page.getByRole("dialog", { name: "Layout", exact: true });
  await panel.getByRole("button", { name: "Close", exact: true }).click();
  await expect(panel).toHaveCount(0);
  await expect.poll(() => pane.evaluate(el => el.scrollTop)).toBe(before);
});
