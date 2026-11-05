import {
  test,
  expect,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
async function fixture(request: APIRequestContext) {
  let snap = await (
    await request.post("/api/databases", { data: { title: "Launch overview" } })
  ).json();
  let ds = snap.dataSources[0];
  ds = await (
    await request.put(`/api/data-sources/${ds.id}`, {
      data: {
        baseRevision: ds.revision,
        properties: [
          ...ds.properties,
          { id: "budget", key: "budget", name: "Budget", type: "number" },
          {
            id: "status",
            key: "status",
            name: "Status",
            type: "select",
            options: [
              { id: "todo", name: "Planned", color: "blue" },
              { id: "done", name: "Complete", color: "green" },
            ],
          },
        ],
      },
    })
  ).json();
  for (const [title, budget, status] of [
    ["Design system", 120, "done"],
    ["Mobile release", 80, "todo"],
    ["Documentation", 40, "todo"],
  ])
    await request.post(`/api/data-sources/${ds.id}/records`, {
      data: {
        baseRevision: ds.revision,
        title,
        properties: { budget, status },
      },
    });
  for (const [name, layout] of [
    [
      "Total budget",
      { chartType: "number", chartValueId: "budget", chartAggregation: "sum" },
    ],
    ["By status", { chartType: "donut", chartGroupBy: "status" }],
  ]) {
    snap = await (
      await request.get(`/api/databases/${snap.database.id}`)
    ).json();
    snap = await (
      await request.post(`/api/databases/${snap.database.id}/views`, {
        data: {
          baseRevision: snap.database.revision,
          name,
          type: "chart",
          layout,
        },
      })
    ).json();
  }
  const rows = [
    {
      id: "metrics",
      height: 240,
      widgets: snap.views
        .slice(1)
        .map((v: any, i: number) => ({
          id: "w" + i,
          viewId: v.id,
          databaseId: snap.database.id,
          width: i ? 1 : 2,
        })),
    },
    {
      id: "records",
      height: 300,
      widgets: [
        {
          id: "table",
          viewId: snap.views[0].id,
          databaseId: snap.database.id,
          width: 1,
        },
      ],
    },
  ];
  snap = await (
    await request.post(`/api/databases/${snap.database.id}/views`, {
      data: {
        baseRevision: snap.database.revision,
        name: "Overview",
        type: "dashboard",
        layout: { dashboardRows: rows },
      },
    })
  ).json();
  return { snap, dash: snap.views.at(-1), ds };
}
async function open(page: Page, id: string) {
  await page.goto(`/#database/${id}`);
  await page.getByRole("tab", { name: "Overview", exact: true }).click();
  await expect(page.locator(".database-dashboard-widget")).toHaveCount(3);
}
async function menu(page: Page, id: string, label: string) {
  await page
    .locator(`[data-widget-id="${id}"]`)
    .getByRole("button", { name: "Widget options", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Widget options", exact: true })
    .getByRole("button", { name: label, exact: true })
    .click();
}
test("dashboard view/edit modes, resizing, drag/drop, duplicate and independent settings persist", async ({
  page,
  request,
}, info) => {
  test.setTimeout(90000);
  const { snap, dash } = await fixture(request);
  await open(page, snap.database.id);
  await expect(
    page.getByRole("button", { name: "Save layout", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.locator('[data-widget-id="w0"] .database-chart-number'),
  ).toHaveText("240");
  await page.screenshot({
    path: info.outputPath("dashboard-view.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Edit dashboard", exact: true })
    .click();
  const resize = page.getByRole("separator", {
    name: "Resize widget widths",
    exact: true,
  });
  await resize.focus();
  await page.keyboard.press("ArrowRight");
  const height = page
    .getByRole("separator", { name: "Resize row height", exact: true })
    .first();
  await height.focus();
  await page.keyboard.press("ArrowDown");
  await menu(page, "w0", "Duplicate widget");
  await expect(page.locator(".database-dashboard-widget")).toHaveCount(4);
  const duplicate = page
    .locator('[data-row-id="metrics"] .database-dashboard-widget')
    .nth(1);
  await duplicate
    .getByRole("button", { name: "Configure widget", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "View name", exact: true })
    .fill("Independent metric");
  await page
    .getByRole("dialog", { name: "View settings", exact: true })
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await expect(duplicate.locator(".dashboard-widget-title")).toHaveText(
    "Independent metric",
  );
  await page
    .locator('[data-widget-id="w1"]')
    .getByRole("button", { name: "Drag widget", exact: true })
    .dragTo(page.locator('[data-widget-id="table"]'));
  await expect(
    page.locator('[data-row-id="records"] .database-dashboard-widget'),
  ).toHaveCount(2);
  await page.getByRole("button", { name: "Save layout", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Edit dashboard", exact: true }),
  ).toBeVisible();
  let latest = await (
    await request.get(`/api/databases/${snap.database.id}`)
  ).json();
  let saved = latest.views.find((v: any) => v.id === dash.id);
  expect(saved.layout.dashboardRows[0].height).toBe(260);
  expect(saved.layout.dashboardRows[0].widgets[0].width).toBeCloseTo(2.1);
  expect(latest.views.find((v: any) => v.name === "Total budget")).toBeTruthy();
  expect(latest.views.some((v: any) => v.name === "Independent metric")).toBe(
    false,
  );
  await page.reload();
  await expect(page.locator(".database-dashboard-widget")).toHaveCount(4);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: info.outputPath("dashboard-mobile.png"),
    fullPage: true,
  });
  const boxes = await page
    .locator(".database-dashboard-widget")
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getBoundingClientRect().width),
    );
  expect(Math.max(...boxes)).toBeLessThan(390);
});
test("widgets from another database, source filters and conflict drafts remain recoverable", async ({
  page,
  request,
}, info) => {
  test.setTimeout(90000);
  const { snap, dash } = await fixture(request);
  const other = await (
    await request.post("/api/databases", {
      data: { title: "Customer requests" },
    })
  ).json();
  const ds = other.dataSources[0];
  await request.post(`/api/data-sources/${ds.id}/records`, {
    data: { baseRevision: ds.revision, title: "External request" },
  });
  await open(page, snap.database.id);
  await page
    .getByRole("button", { name: "Edit dashboard", exact: true })
    .click();
  await page.getByRole("button", { name: "Add widget", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Add widget", exact: true })
    .getByRole("button", { name: "Customer requests", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Add widget", exact: true })
    .getByRole("button", { name: "Table", exact: true })
    .first()
    .click();
  await expect(
    page.locator(".dashboard-record-title", { hasText: "External request" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save layout", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Edit dashboard", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.locator(".dashboard-record-title", { hasText: "External request" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Edit dashboard", exact: true })
    .click();
  await menu(page, "table", "Remove widget");
  await expect(page.locator(".database-dashboard-widget")).toHaveCount(3);
  let latest = await (
    await request.get(`/api/databases/${snap.database.id}`)
  ).json();
  const current = latest.views.find((v: any) => v.id === dash.id);
  await request.put(`/api/database-views/${dash.id}`, {
    data: { baseRevision: current.revision, name: "Overview remotely renamed" },
  });
  await page.getByRole("button", { name: "Save layout", exact: true }).click();
  await expect(page.locator(".dashboard-status")).toContainText("changed");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Save layout", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".database-dashboard-widget")).toHaveCount(3);
  latest = await (
    await request.get(`/api/databases/${snap.database.id}`)
  ).json();
  expect(
    latest.views
      .find((v: any) => v.id === dash.id)
      .layout.dashboardRows.flatMap((r: any) => r.widgets),
  ).toHaveLength(4);
  await page
    .getByRole("button", { name: "Cancel editing", exact: true })
    .click();
  await expect(page.locator(".database-dashboard-widget")).toHaveCount(4);
  await page.screenshot({
    path: info.outputPath("dashboard-multi-source.png"),
    fullPage: true,
  });
});

test('global filters are local until explicitly saved and never mutate source views', async({page,request})=>{
 test.setTimeout(90000);const {snap,ds,dash}=await fixture(request);await open(page,snap.database.id);
 await page.getByRole('button',{name:'Global filters',exact:true}).click();await page.getByRole('dialog',{name:'Global filters',exact:true}).getByRole('button',{name:ds.title,exact:true}).click();
 const filter=page.getByRole('dialog',{name:'Filter',exact:true});await filter.getByRole('combobox',{name:'Filter property',exact:true}).selectOption('status');await filter.getByRole('combobox',{name:'Filter operator',exact:true}).selectOption('equals');await filter.getByRole('combobox',{name:'Filter value',exact:true}).selectOption('done');await filter.getByRole('button',{name:'Close',exact:true}).click();
 await expect(page.locator('[data-widget-id="w0"] .database-chart-number')).toHaveText('120');await expect(page.locator('.dashboard-record-title',{hasText:'Mobile release'})).toHaveCount(0);
 let latest=await (await request.get(`/api/databases/${snap.database.id}`)).json();expect(latest.views.find((v:any)=>v.id===dash.id).layout.dashboardFilters).toBeUndefined();
 await page.reload();await expect(page.locator('[data-widget-id="w0"] .database-chart-number')).toHaveText('120');
 await page.getByRole('button',{name:'Save widget settings',exact:true}).click();await expect(page.getByRole('button',{name:'Edit dashboard',exact:true})).toBeVisible();
 latest=await (await request.get(`/api/databases/${snap.database.id}`)).json();expect(latest.views.find((v:any)=>v.id===dash.id).layout.dashboardFilters[0].filters[0].value).toBe('done');expect(latest.views.find((v:any)=>v.name==='Total budget').filters??[]).toHaveLength(0);
 await page.getByRole('button',{name:'Full screen',exact:true}).click();await expect(page.locator('.database-layout-dashboard')).toHaveClass(/is-fullscreen/);await page.keyboard.press('Escape');await expect(page.locator('.database-layout-dashboard')).not.toHaveClass(/is-fullscreen/);
 await page.evaluate(()=>localStorage.setItem('notdown-ui-language','zh-CN'));await page.reload();await page.getByRole('button',{name:'编辑仪表盘',exact:true}).click();await expect(page.getByRole('button',{name:'保存布局',exact:true})).toBeVisible();
});
