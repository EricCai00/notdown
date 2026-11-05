import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createVault } from "../../server/vault.js";
import {
  dashboardRows,
  moveDashboardWidget,
} from "../../src/features/databases/database-dashboard-model.js";
import type {
  DatabaseView,
  DashboardRow,
} from "../../src/features/databases/database-model.js";
test("legacy dashboard projection and moving widgets preserve identities and unknown fields", () => {
  const view = {
    id: "d",
    databaseId: "db",
    dataSourceId: "s",
    name: "Dashboard",
    type: "dashboard",
    revision: "r",
    layout: { dashboardViewIds: ["a", "b", "c"] },
  } as DatabaseView;
  const rows = dashboardRows(view, []);
  assert.equal(rows.length, 2);
  assert.equal(view.layout?.dashboardRows, undefined);
  rows[0].future = "keep";
  const moved = moveDashboardWidget(rows, "legacy-a", rows[1].id, 1);
  assert.deepEqual(
    moved.map((row) => row.widgets.map((w) => w.viewId)),
    [["b"], ["c", "a"]],
  );
  assert.equal(moved[0].future, "keep");
  assert.equal(rows[0].widgets.length, 2);
  const full: DashboardRow[] = [
    {
      id: "one",
      height: 240,
      widgets: ["a", "b", "c", "d"].map((id) => ({
        id,
        viewId: id,
        databaseId: "db",
        width: 1,
      })),
    },
    {
      id: "two",
      height: 240,
      widgets: [{ id: "e", viewId: "e", databaseId: "db", width: 1 }],
    },
  ];
  assert.deepEqual(moveDashboardWidget(full, "e", "one", 0), full);
});
test("dashboard cross-source settings, geometry, malformed boundaries, CAS and missing views", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-dashboard-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const vault = createVault(root);
  const one = await vault.databases.create({ title: "Projects" }),
    two = await vault.databases.create({ title: "Incidents" });
  const ds = await vault.databases.updateSource(
    two.dataSources[0].id,
    {
      properties: [
        ...two.dataSources[0].properties,
        { id: "amount", key: "amount", name: "Amount", type: "number" },
      ],
    },
    two.dataSources[0].revision,
  );
  const snap = await vault.databases.createView(
    one.database.id,
    { type: "dashboard", name: "Overview" },
    one.database.revision,
  );
  const dash = snap.views.at(-1)!;
  const rows: DashboardRow[] = [
    {
      id: "row",
      height: 320,
      future: "retained",
      widgets: [
        {
          id: "widget",
          databaseId: two.database.id,
          viewId: two.views[0].id,
          width: 2,
          settings: {
            type: "chart",
            layout: {
              chartType: "number",
              chartValueId: "amount",
              chartAggregation: "sum",
            },
          },
        },
      ],
    },
  ];
  const saved = await vault.databases.updateView(
    dash.id,
    {
      layout: {
        dashboardRows: rows,
        dashboardFilters: [
          {
            sourceId: ds.id,
            filters: [
              { propertyId: "amount", operator: "greater_than", value: "10" },
            ],
          },
        ],
      },
    },
    dash.revision,
  );
  assert.equal(
    (await createVault(root).databases.get(one.database.id)).views.at(-1)!
      .layout?.dashboardRows?.[0].future,
    "retained",
  );
  await assert.rejects(
    vault.databases.updateView(
      dash.id,
      { layout: { dashboardRows: [] } },
      dash.revision,
    ),
    /changed/,
  );
  for (const change of [
    { height: 179 },
    { height: 901 },
    { widgets: Array(5).fill(rows[0].widgets[0]) },
    { widgets: [{ ...rows[0].widgets[0], width: -1 }] },
    { widgets: [{ ...rows[0].widgets[0], databaseId: one.database.id }] },
    { widgets: [{ ...rows[0].widgets[0], settings: { type: "dashboard" } }] },
    { widgets: [{ ...rows[0].widgets[0], settings: { layout: 3 } }] },
    {
      widgets: [
        {
          ...rows[0].widgets[0],
          settings: {
            filters: [
              { propertyId: "missing", operator: "equals", value: "a" },
            ],
          },
        },
      ],
    },
  ])
    await assert.rejects(
      vault.databases.updateView(
        dash.id,
        { layout: { dashboardRows: [{ ...rows[0], ...change }] as any } },
        saved.revision,
      ),
    );
  await assert.rejects(
    vault.databases.updateView(
      dash.id,
      { layout: { dashboardFilters: [null] as any } },
      saved.revision,
    ),
  );
  await assert.rejects(vault.databases.updateSource(ds.id, { properties: two.dataSources[0].properties }, ds.revision), /dashboard widgets/);
  assert.equal(
    (await vault.databases.get(two.database.id)).views[0].type,
    "table",
  );
});
