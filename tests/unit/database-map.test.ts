import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createVault } from "../../server/vault.js";
import { googleMapsUrl, photonPlaces, readPlace, validCoordinates } from "../../src/features/databases/database-place.js";
import { mapRecords } from "../../src/features/databases/database-map-model.js";
import { queryDatabase } from "../../src/features/databases/database-query.js";
import type { DatabaseDataSource, DatabaseView } from "../../src/features/databases/database-model.js";
import type { Page } from "../../src/shared/types.js";

const source: DatabaseDataSource = { id: "source", title: "Travel", revision: "", properties: [
  { id: "title", key: "title", name: "Name", type: "title" }, { id: "place", key: "place", name: "Place", type: "place" },
  { id: "lat", key: "lat", name: "Latitude", type: "number" }, { id: "lng", key: "lng", name: "Longitude", type: "number" },
  { id: "tags", key: "tags", name: "Type", type: "multi_select", options: [{ id: "food", name: "Food", color: "orange" }, { id: "stay", name: "Stay", color: "red;bad" }] },
] };
const view: DatabaseView = { id: "map", databaseId: "db", dataSourceId: "source", name: "Map", type: "map", revision: "", layout: { mapPlaceId: "place", mapColorBy: "tags" } };
const page = (id: string, properties: Record<string, unknown>) => ({ id, title: id, dataSourceId: "source", properties } as Page);

test("map uses strict WGS84 coordinates, keeps missing records and never mutates old coordinate views", () => {
  assert.ok(validCoordinates(0, 0)); assert.ok(validCoordinates(-90, 180));
  for (const [a, b] of [["0", 0], [null, 0], [NaN, 0], [91, 0], [0, -181], [0, Infinity]]) assert.equal(validCoordinates(a, b), false);
  assert.equal(readPlace({ latitude: "35", longitude: 135 }), undefined);
  const rows = [page("Kyoto", { place: { name: "Kyoto Station", address: "Japan", latitude: 35, longitude: 135, future: true }, lat: 0, lng: 0, tags: ["food"] }), page("missing", { place: { latitude: 99, longitude: 135 }, tags: ["stay"] })];
  const model = mapRecords(source, rows, view); assert.equal(model.located, 1); assert.equal(model.records.length, 2); assert.equal(model.records[0].color, "orange"); assert.equal(model.records[1].color, "gray");
  const legacy = { ...view, layout: { mapLatitudeId: "lat", mapLongitudeId: "lng" } }, before = JSON.stringify(legacy);
  assert.deepEqual(mapRecords(source, rows, legacy).records[0].place, { latitude: 0, longitude: 0 }); assert.equal(JSON.stringify(legacy), before);
  assert.equal(mapRecords(source, rows, { ...view, layout: { mapPlaceId: "gone", mapLatitudeId: "lat", mapLongitudeId: "lng" } }).configured, false);
});

test("map caps pins after shared search, filtering and sorting and uses the first multi-select option", () => {
  const rows = Array.from({ length: 110 }, (_, i) => page(String(i), { place: { name: i < 3 ? "Kyoto" : "Osaka", latitude: 35, longitude: 135 }, tags: ["food", "stay"] }));
  rows.unshift(page("missing", {})); const all = mapRecords(source, rows, view);
  assert.equal(all.located, 110); assert.equal(all.pinned, 100); assert.equal(all.records[100].pinned, true); assert.equal(all.records[101].pinned, false); assert.equal(all.records[1].category, "Food");
  const selected = queryDatabase(rows, source, { ...view, sorts: [{ propertyId: "title", direction: "descending" }], filters: [{ propertyId: "place", operator: "contains", value: "kyoto" }] }, "food");
  assert.deepEqual(selected.map(row => row.id), ["2", "1", "0"]); assert.equal(mapRecords(source, selected, view).pinned, 3);
});

test("geocoder payloads validate geometry and links use only validated coordinates", () => {
  assert.deepEqual(photonPlaces(null), []);
  const places = photonPlaces({ features: [{ geometry: { type: "Point", coordinates: [135, 35] }, properties: { name: "京都駅", city: "Kyoto", country: "Japan", street: "Main" } }, { geometry: { type: "Point", coordinates: [999, 35] }, properties: {} }, { geometry: { type: "LineString", coordinates: [1, 2] }, properties: {} }, null] });
  assert.equal(places.length, 1); assert.equal(places[0].latitude, 35); assert.equal(places[0].longitude, 135);
  const url = new URL(googleMapsUrl(places[0])); assert.equal(url.origin, "https://www.google.com"); assert.equal(url.searchParams.get("query"), "35,135"); assert.equal(url.searchParams.get("api"), "1");
});

test("place records and map settings preserve unknown fields, reject invalid edits, and retain both versions on CAS conflicts", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-map-")); t.after(() => fs.rm(root, { recursive: true, force: true })); const vault = createVault(root);
  let snap = await vault.databases.create({ title: "Trips" });
  const ds = await vault.databases.updateSource(snap.dataSources[0].id, { properties: source.properties }, snap.dataSources[0].revision);
  snap = await vault.databases.get(snap.database.id); snap = await vault.databases.createView(snap.database.id, { name: "Map", type: "map" }, snap.database.revision);
  const map = snap.views.find(view => view.type === "map")!;
  const saved = await vault.databases.updateView(map.id, { layout: { ...view.layout, mapHeight: "large", future: { preserved: true } } }, map.revision);
  for (const layout of [{ mapHeight: "giant" }, { mapPlaceId: "lat" }, { mapColorBy: "place" }, { mapLongitudeId: "place" }]) await assert.rejects(vault.databases.updateView(map.id, { layout: layout as any }, saved.revision));
  await assert.rejects(vault.databases.updateSource(ds.id, { properties: ds.properties.filter(field => field.id !== "place") }, ds.revision), /references/);
  await assert.rejects(vault.databases.updateSource(ds.id, { properties: ds.properties.map(field => field.id === "place" ? { ...field, type: "text" } : field) }, ds.revision), /Place property/);
  for (const place of [{ latitude: "35", longitude: 135 }, { latitude: 91, longitude: 0 }, { latitude: 35 }, { latitude: 35, longitude: 135, name: 123 }]) await assert.rejects(vault.databases.createRecord(ds.id, { title: "Bad", properties: { place } }, ds.revision), /Invalid value/);
  const record = await vault.databases.createRecord(ds.id, { title: "Kyoto", properties: { place: { name: "Station", latitude: 35, longitude: 135, future: { keep: true } } } }, ds.revision);
  await vault.databases.updateCell(ds.id, record.id, { propertyId: "place", value: { name: "Saved", latitude: 36, longitude: 136, future: { keep: true } }, baseRevision: record.revision, schemaRevision: ds.revision });
  await assert.rejects(vault.databases.updateCell(ds.id, record.id, { propertyId: "place", value: { name: "My draft", latitude: 37, longitude: 137 }, baseRevision: record.revision, schemaRevision: ds.revision }), /modified/);
  await assert.rejects(vault.databases.updateView(map.id, { layout: { mapHeight: "small" } }, map.revision), /changed/);
  const reload = await createVault(root).databases.get(snap.database.id);
  assert.deepEqual(reload.pages[0].properties.place, { name: "Saved", latitude: 36, longitude: 136, future: { keep: true } }); assert.equal(reload.views.find(v => v.id === map.id)!.layout!.mapHeight, "large");
  assert.deepEqual(reload.views.find(v => v.id === map.id)!.layout!.future, { preserved: true });
  const conflicts = (await fs.readdir(path.join(root, ".history", "database-conflicts")));
  assert.ok(conflicts.length >= 1);
});
