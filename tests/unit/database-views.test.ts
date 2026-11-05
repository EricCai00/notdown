import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createVault } from "../../server/vault.js";
import { queryDatabase, databaseGroups, calendarDate, shiftDay, validFilter } from "../../src/features/databases/database-query.js";
import { importNotionView } from "../../server/notion-view-import.js";
import type { DatabaseDataSource, DatabaseView } from "../../src/features/databases/database-model.js";
import type { Page } from "../../src/shared/types.js";

const source: DatabaseDataSource = { id: "source", title: "Tasks", revision: "", properties: [
  { id: "title", name: "Name", key: "title", type: "title" },
  { id: "state", name: "Status", key: "state", type: "status", options: [{ id: "todo", name: "To do" }, { id: "done", name: "Done" }] },
  { id: "points", name: "Points", key: "points", type: "number" },
  { id: "date", name: "Date", key: "date", type: "date" },
  { id: "checked", name: "Checked", key: "checked", type: "checkbox" },
] };
const view: DatabaseView = { id: "view", databaseId: "db", dataSourceId: "source", name: "View", type: "board", revision: "", layout: { groupBy: "state" } };
const page = (id: string, properties: Record<string, unknown>): Page => ({ id, title: id, properties, dataSourceId: "source", body: "", icon: "", revision: "", updated: "", parent: null });
const pages = [page("A", { state: "todo", points: 0, checked: false, date: { start: "2026-10-27" } }), page("B", { state: "done", points: 12, checked: true }), page("C", { points: 3 })];
test("all layouts share typed filters, stable multiple sorts and explicit OR", () => {
  assert.deepEqual(queryDatabase(pages, source, { ...view, filters: [{ propertyId: "points", operator: "greater_than", value: "2" }] }).map(page => page.id), ["B", "C"]);
  assert.deepEqual(queryDatabase(pages, source, { ...view, filterMode: "or", filters: [{ propertyId: "state", operator: "equals", value: "todo" }, { propertyId: "checked", operator: "equals", value: "true" }] }).map(page => page.id), ["A", "B"]);
  assert.deepEqual(queryDatabase(pages, source, { ...view, filters: [{ propertyId: "checked", operator: "is_empty" }] }).map(page => page.id), ["C"]);
  assert.deepEqual(queryDatabase(pages, source, { ...view, filters: [{ propertyId: "date", operator: "on_or_after", value: "2026-10-27" }] }).map(page => page.id), ["A"]);
  assert.deepEqual(queryDatabase(pages, source, { ...view, sorts: [{ propertyId: "points", direction: "descending" }] }).map(page => page.id), ["B", "C", "A"]);
  assert.equal(validFilter({ propertyId: "points", operator: "greater_than", value: "NaN" }, source.properties), false);
  assert.equal(validFilter({ propertyId: "date", operator: "equals", value: "2026-02-30" }, source.properties), false);
});
test("group order and visibility preserve empty and unassigned groups", () => {
  const groups = databaseGroups(pages, source.properties[1], { ...view, layout: { groupBy: "state", groupOrder: ["done", "todo", ""], hiddenGroups: ["todo"] } });
  assert.deepEqual(groups.map(group => [group.key, group.pages.map(page => page.id)]), [["done", ["B"]], ["", ["C"]]]);
  assert.equal(databaseGroups([], source.properties[1], view).length, 3);
  assert.equal(databaseGroups([], source.properties[1], { ...view, layout: { hideEmptyGroups: true } }).length, 0);
});
test("calendar handles leap dates, ranges and timed values without discarding time zones", () => {
  assert.equal(shiftDay("2028-02-28", 1), "2028-02-29");
  assert.equal(shiftDay("2026-12-31", 1), "2027-01-01");
  assert.equal(calendarDate({ start: "2026-10-27", end: "2026-10-29" })?.movable, true);
  assert.equal(calendarDate({ start: "2026-10-27T09:00:00-07:00" })?.movable, false);
  assert.equal(calendarDate({ start: "2026-10-27", time_zone: "America/Los_Angeles" })?.movable, false);
  assert.equal(calendarDate({ start: "2026-10-29", end: "2026-10-27" }), undefined);
});
test("Notion layouts map stable property identities while preserving unsupported definitions", () => {
  const fields = source.properties.map(field => ({ ...field, notion: { id: field.id, type: field.type } }));
  const imported = importNotionView({ name: "Board", type: "board", configuration: { group_by: { property_id: "state" }, cover: { type: "page_cover" }, properties: [{ property_id: "points", visible: false }] } }, fields, "source");
  assert.equal(imported.type, "board"); assert.equal(imported.layout?.groupBy, "state"); assert.equal(imported.layout?.preview, "cover"); assert.ok(!imported.propertyIds?.includes("points"));
  assert.equal(importNotionView({ type: "calendar", configuration: { date_property_id: "date", view_range: "week" } }, fields, "source").layout?.calendarRange, "week");
  const unsupported = importNotionView({ type: "map", configuration: { custom: 123 } }, fields, "source"); assert.equal(unsupported.type, "table"); assert.equal(unsupported.notion.configuration.custom, 123); assert.ok(unsupported.importWarnings.length);
});
test("view layouts round trip with CAS, field-reference protection and unknown-field preservation", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-views-")); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const vault = createVault(root), db = await vault.databases.create({ title: "Views" });
  const ds = await vault.databases.updateSource(db.dataSources[0].id, { properties: [db.dataSources[0].properties[0], ...source.properties.slice(1)] }, db.dataSources[0].revision);
  let snapshot = await vault.databases.get(db.database.id);
  for (const type of ["board", "gallery", "list", "calendar"] as const) snapshot = await vault.databases.createView(db.database.id, { type, name: type, layout: { groupBy: "state", datePropertyId: "date", custom: { retained: true } } }, snapshot.database.revision);
  assert.equal((await createVault(root).databases.get(db.database.id)).views.length, 5);
  const current = snapshot.views.at(-1)!;
  const saved = await vault.databases.updateView(current.id, { name: "Calendar" }, current.revision);
  assert.deepEqual(saved.layout?.custom, { retained: true });
  await assert.rejects(vault.databases.updateView(current.id, { name: "Stale" }, current.revision), /changed/);
  await assert.rejects(vault.databases.updateView(current.id, { layout: { datePropertyId: "state" } }, saved.revision), /Date property/);
  await assert.rejects(vault.databases.updateSource(ds.id, { properties: ds.properties.filter(field => field.id !== "date") }, ds.revision), /references from views/);
  const display = { ...saved.layout, columnWidths: { points: 180, [ds.properties[0].id]: 320, unknown: 200 }, collapsedGroups: ["done"], showGroupCount: false, groupColors: { "": "blue" }, showDataSourceTitle: true, showVerticalLines: false, showPageIcon: false, wrapContent: true, openPagesIn: "center" as const, loadLimit: 25, frozenPropertyId: "points", wrapPropertyIds: ["points"] };
  const displayed = await vault.databases.updateView(current.id, { layout: display }, saved.revision);
  assert.deepEqual((await createVault(root).databases.get(db.database.id)).views.find(view => view.id === current.id)?.layout, display);
  for (const layout of [{ columnWidths: [] }, { columnWidths: { points: 63 } }, { columnWidths: { points: 2001 } }, { columnWidths: { points: 100.5 } }, { columnWidths: { points: "200" } }, { collapsedGroups: ["done", "done"] }, { groupColors: { "": "unknown" } }, { loadLimit: -1 }, { showPageIcon: "yes" }, { openPagesIn: "unknown" }, { frozenPropertyId: "missing" }, { wrapPropertyIds: ["missing"] }]) await assert.rejects(vault.databases.updateView(current.id, { layout: layout as any }, displayed.revision), /Invalid/);
  await assert.rejects(vault.databases.updateSource(ds.id, { properties: ds.properties.map(field => field.id === "date" ? { ...field, type: "text" } : field) }, ds.revision), /Date property/);
  assert.equal((await vault.databases.get(db.database.id)).dataSources[0].properties.find(field => field.id === "date")?.type, "date");
});
