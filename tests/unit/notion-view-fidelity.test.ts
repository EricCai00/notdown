import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { prepareNotionImport } from "../../server/notion-import.js";
import { readNotionViewCache, supplementNotionView } from "../../server/notion-view-cache.js";
import { createVault } from "../../server/vault.js";
import { stablePageUuid } from "../../src/vault/page-id.js";
import { timelineDependencyBinding, timelineDependencyEdges } from "../../src/features/databases/database-dependencies.js";
import { fidelityDatabase as dbId, fidelitySource as sourceId, fidelityViews, fidelityPages, fidelityCache, fidelityRawViews, fidelityFixture } from "./notion-view-fidelity-fixture.js";
const options = { fetch: fidelityFixture(), wait: async () => {}, readViewNames: async () => ({ views: [] }), readViewCache: async () => ({ views: fidelityCache() }) };
const input = { token: "test-view-fidelity-token", pageId: dbId, useDesktopCache: true };

test("unreadable Feed, native Map/Place, default table order and source row order survive import and reload", async t => {
  const plan = await prepareNotionImport(input, options), resources = plan.databaseResources!, source = Object.values(resources.dataSources)[0], views = Object.values(resources.views);
  assert.deepEqual(views.map(v => [v.name, v.type]), [["Timeline view", "timeline"], ["Table", "table"], ["Calendar", "calendar"], ["Feed", "feed"], ["Map", "map"]]);
  assert.deepEqual(views[1].propertyIds?.map(id => source.properties.find(f => f.id === id)?.name), ["Name", "Assign", "Blocked by", "Blocking", "Date", "Place", "Status"]);
  assert.deepEqual(views.map(v => v.notion), fidelityRawViews);
  assert.deepEqual(Object.values(resources.databases)[0].notionViews, fidelityRawViews);
  const place = source.properties.find(f => f.name === "Place")!; assert.equal(place.type, "place"); assert.equal(place.readOnly, true); assert.equal(views[4].layout?.mapPlaceId, place.id);
  const local = (id: string) => stablePageUuid(`notion-${plan.id.slice(0, 24)}-${id}`);
  assert.deepEqual(views[1].rowOrder?.slice(0, 4), [fidelityPages[0], fidelityPages[2], fidelityPages[1], fidelityPages[3]].map(local));
  assert.ok(plan.originals.some(f => f.path === `view-recovery/${fidelityViews[3]}.json`));
  const noCache = await prepareNotionImport({ ...input, useDesktopCache: false }, { ...options, readViewCache: async () => { throw Error("must not read cache"); } });
  assert.equal(Object.values(noCache.databaseResources!.views).length, 4);
  assert.ok(noCache.warnings.some(v => v.includes("no readable data source")));
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-fidelity-")); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const vault = createVault(root); await vault.importBatch(plan); const snapshot = await createVault(root).databases.get(Object.keys(resources.databases)[0]);
  assert.equal(snapshot.pages.length, 7); assert.deepEqual(snapshot.views.map(v => v.type), views.map(v => v.type));
  assert.deepEqual(timelineDependencyEdges(snapshot.dataSources[0], snapshot.views[0], snapshot.pages).map(edge => `${edge.from}/${edge.to}`).sort(), [
    `${local(fidelityPages[3])}/${local(fidelityPages[1])}`, `${local(fidelityPages[2])}/${local(fidelityPages[4])}`,
  ].sort());
  assert.deepEqual(snapshot.views[1].rowOrder, views[1].rowOrder);
});

test("imported dependency binding requires exact property and same-source identities; names alone never enable it", () => {
  const source: any = { id: "local-source", notion: { id: sourceId }, properties: [{ id: "out", key: "out", name: "Any translated label", type: "relation", readOnly: true, notion: { id: "fyS%5D", relation: { data_source_id: sourceId } } }] };
  const view: any = { dataSourceId: source.id, notion: { data_source_id: sourceId, configuration: { arrows_by: { property_id: "fyS]" } } } };
  const original = JSON.stringify({ source, view });
  assert.deepEqual(timelineDependencyBinding(source, view), { field: source.properties[0], imported: true });
  for (const changed of [{ ...view, dataSourceId: "other" }, { ...view, notion: { ...view.notion, data_source_id: dbId } }, { ...view, notion: { configuration: { arrows_by: { property_id: "Blocking" } } } }, { ...view, notion: {} }]) assert.equal(timelineDependencyBinding(source, changed), undefined);
  assert.equal(timelineDependencyBinding({ ...source, properties: [{ ...source.properties[0], notion: { id: "fyS]", relation: { data_source_id: dbId } } }] }, view), undefined);
  const page = (id: string, props = {}, extra = {}) => ({ id, dataSourceId: source.id, properties: props, ...extra } as any);
  assert.deepEqual(timelineDependencyEdges(source, view, [page("a", {out:[{pageId:"b"},{pageId:"b"},{pageId:"a"},{pageId:"foreign"},{pageId:"deleted"},{notionPageId:"unknown"}]}),page("b"),page("foreign",{},{dataSourceId:"other"}),page("deleted",{},{trashed:true})]), [{ from: "a", to: "b" }]);
  assert.equal(JSON.stringify({source,view}),original);
});

test("cache supplements only missing settings; conflicting types, sources and explicit properties remain intact", () => {
  const cached = fidelityCache()[1], raw = { ...fidelityRawViews[1], configuration: { type: "table", properties: [{ property_id: "title", visible: true }] } };
  assert.deepEqual(supplementNotionView(raw, { ...cached, format: { table_properties: [{ property: "_unc", visible: true }] } }, dbId, [sourceId])?.effective.configuration.properties, raw.configuration.properties);
  for (const bad of [{ ...cached, type: "feed" }, { ...cached, parentId: sourceId }, { ...cached, sourceId: dbId }, { ...cached, id: sourceId }]) assert.equal(supplementNotionView(raw, bad, dbId, [sourceId]), undefined);
});

test("desktop view recovery never exports unlisted, foreign-source, foreign-account, deleted or ambiguous views", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-view-cache-")); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const file = path.join(root, "notion.db"), db = new DatabaseSync(file);
  db.exec("CREATE TABLE block(id TEXT,type TEXT,alive INTEGER,meta_user_id TEXT,space_id TEXT,view_ids TEXT,collection_id TEXT); CREATE TABLE collection_view(id TEXT,parent_id TEXT,parent_table TEXT,meta_user_id TEXT,space_id TEXT,alive INTEGER,type TEXT,name TEXT,version INTEGER,format TEXT,query2 TEXT,page_sort TEXT)");
  db.prepare("INSERT INTO block VALUES(?,?,?,?,?,?,?)").run(dbId, "collection_view", 1, "owner", "space", JSON.stringify(fidelityViews), sourceId);
  const insert = db.prepare("INSERT INTO collection_view VALUES(?,?,?,?,?,?,?,?,?,?,?,?)");
  insert.run(fidelityViews[3], dbId, "block", "owner", "space", 1, "feed", null, 8, "{}", "{}", "[]");
  insert.run(fidelityViews[3], dbId, "block", "other", "space", 1, "feed", "private", 8, "{}", "{}", "[]");
  db.close(); const before = await fs.readFile(file);
  const result = await readNotionViewCache(dbId, [fidelityViews[3]], [sourceId], file);
  assert.equal(result.views.length, 1); assert.equal(result.views[0].name, null); assert.ok(!JSON.stringify(result).includes("private"));
  assert.deepEqual(await fs.readFile(file), before);
  assert.equal((await readNotionViewCache(dbId, [fidelityViews[3]], [dbId], file)).views.length, 0);
  assert.equal((await readNotionViewCache(dbId, [fidelityPages[0]], [sourceId], file)).views.length, 0);
});

test("repair operations retain records, imported identities and CAS while inserting the recovered view in source order", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-repair-views-")); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const plan = await prepareNotionImport({ ...input, useDesktopCache: false }, options);
  const resources = plan.databaseResources!, sourceDraft = Object.values(resources.dataSources)[0];
  const field = sourceDraft.properties.find(p => p.name === "Place")!; field.type = "unknown";
  const oldMap = Object.values(resources.views).find(v => (v.notion as any)?.type === "map")!;
  oldMap.type = "table"; oldMap.layout = {};
  const recordDraft = plan.pages.find(p => p.metadata.dataSourceId)!;
  (recordDraft.metadata.properties as Record<string, unknown>)[field.key] = { type: "place", place: null, snapshot: true, future: "keep" };
  const vault = createVault(root); await vault.importBatch(plan);
  const databaseId = Object.keys(resources.databases)[0];
  const before = await vault.databases.get(databaseId); let source = before.dataSources[0];
  await assert.rejects(vault.databases.updateSource(source.id, { properties: source.properties.map(p => p.id === field.id ? { ...p, type: "place", readOnly: false } : p) }, source.revision), /Changing a populated/);
  const promoted = await vault.databases.updateSource(source.id, { properties: source.properties.map(p => p.id === field.id ? { ...p, type: "place" } : p) }, source.revision);
  assert.equal(promoted.properties.find(p => p.id === field.id)?.type, "place");
  assert.deepEqual((await vault.databases.get(databaseId)).pages, before.pages);
  const map = (await vault.databases.get(databaseId)).views.find(v => v.id === oldMap.id)!;
  await vault.databases.updateView(map.id, { type: "map", layout: { mapPlaceId: field.id } }, map.revision);
  let snapshot = await vault.databases.get(databaseId);
  snapshot = await vault.databases.createView(databaseId, { type: "feed", name: "Feed", beforeViewId: map.id, notion: { id: fidelityViews[3] } }, snapshot.database.revision);
  assert.deepEqual(snapshot.views.map(v => v.type), ["timeline", "table", "calendar", "feed", "map"]);
  assert.ok(!Object.hasOwn(snapshot.views[3], "beforeViewId"));
  await assert.rejects(vault.databases.createView(databaseId, { type: "feed", beforeViewId: map.id }, before.database.revision), /changed/);
  assert.deepEqual((await createVault(root).databases.get(databaseId)).views.map(v => v.type), ["timeline", "table", "calendar", "feed", "map"]);
});
