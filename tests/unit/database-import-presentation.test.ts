import test from "node:test";
import assert from "node:assert/strict";
import { databaseImportWarnings, importedPlaceText, notionSubitemWarning } from "../../src/features/databases/database-import-presentation.js";
import { valueText } from "../../src/features/databases/database-query.js";
import { importNotionView } from "../../server/notion-view-import.js";
import type { DatabaseProperty, DatabaseView } from "../../src/features/databases/database-model.js";
import { prepareNotionImport } from "../../server/notion-import.js";
import { createVault } from "../../server/vault.js";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fidelityFixture, fidelityDatabase, fidelityPages } from "./notion-view-fidelity-fixture.js";

const field: DatabaseProperty = { id: "place", key: "place", name: "Place", type: "unknown", readOnly: true, notion: { type: "place" } };
test("legacy and new Place snapshots display values without exposing or modifying their envelopes", () => {
  for (const place of [null, { name: "Library", address: "Main Street", latitude: 0, longitude: 0, future: { keep: true } }, { latitude: 0, longitude: 0 }]) {
    const value = { id: "KHBf", type: "place", place, snapshot: true, unknown: 7 };
    const before = JSON.stringify(value);
    const text = place === null ? "" : "name" in place ? "Library, Main Street" : "0, 0";
    assert.equal(importedPlaceText(field, value), text);
    assert.equal(valueText(field, value), text);
    assert.equal(importedPlaceText({ ...field, type: "place" }, place), text);
    assert.equal(JSON.stringify(value), before);
  }
  assert.equal(importedPlaceText(field, { type: "place", snapshot: true, place: { future: true } }), "Preserved value");
  assert.equal(importedPlaceText({ ...field, notion: { type: "future" } }, { snapshot: true }), undefined);
});

test("empty imported titles are a read-only display projection, preserving source, explicit names and local renames", async t => {
  const base = fidelityFixture();
  const plan = await prepareNotionImport({ token: "presentation-test", pageId: fidelityDatabase, useDesktopCache: false }, { wait: async () => {}, fetch: async (input, init) => {
    const response = await base(input, init), json = await response.json();
    const title = (record: any) => {
      if (record.object !== "page") return;
      if ([fidelityPages[4], fidelityPages[5]].includes(record.id)) record.properties.Name.title = [];
      if (record.id === fidelityPages[6]) record.properties.Name.title = [{ plain_text: "Untitled", text: { content: "Untitled" } }];
    };
    title(json); json.results?.forEach(title); return Response.json(json, { status: response.status });
  } });
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-empty-titles-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const vault = createVault(root); await vault.importBatch(plan);
  const snapshot = await vault.databases.get(Object.keys(plan.databaseResources!.databases)[0]);
  const empty = snapshot.pages.filter(page => page.importedEmptyTitle);
  assert.equal(empty.length, 2); assert.ok(empty.every(page => page.title === "Untitled"));
  assert.equal(snapshot.pages.filter(page => page.title === "Untitled" && !page.importedEmptyTitle).length, 1);
  const metadataBefore = await fs.readFile(path.join(root, "metadata.json"));
  const source = snapshot.dataSources[0], field = source.properties.find(field => field.type === "title")!;
  await createVault(root).databases.get(snapshot.database.id);
  assert.deepEqual(await fs.readFile(path.join(root, "metadata.json")), metadataBefore);
  const renamed = await vault.databases.updateCell(source.id, empty[0].id, { propertyId: field.id, value: "Local name", baseRevision: empty[0].revision, schemaRevision: source.revision });
  assert.equal(renamed.importedEmptyTitle, undefined); assert.equal(renamed.title, "Local name");
  assert.equal(renamed.body, empty[0].body);
});

test("a toggle column alone does not assert a sub-item hierarchy, and existing false warnings are projected away", () => {
  const raw = { type: "table", configuration: { subtasks: { toggle_column_id: "title" } } };
  const mapped = importNotionView(raw, [], "source");
  assert.ok(!mapped.importWarnings.includes(notionSubitemWarning));
  const view = { ...mapped, importWarnings: [notionSubitemWarning, "Other warning"], id: "v", databaseId: "d", dataSourceId: "s", revision: "keep" } as DatabaseView;
  const before = JSON.stringify(view);
  assert.deepEqual(databaseImportWarnings(view), ["Other warning"]);
  assert.equal(JSON.stringify(view), before);
  for (const display_mode of ["nested", "flat", "future_mode"]) {
    const mapped = importNotionView({ ...raw, configuration: { subtasks: { display_mode } } }, [], "source");
    assert.ok(mapped.importWarnings.includes(notionSubitemWarning));
    assert.deepEqual(databaseImportWarnings({ ...view, ...mapped }), [notionSubitemWarning]);
  }
  assert.deepEqual(databaseImportWarnings({ ...view, notion: undefined }), [notionSubitemWarning, "Other warning"]);
  assert.ok(importNotionView({ ...raw, configuration: { subtasks: { future_setting: true } } }, [], "source").importWarnings.includes(notionSubitemWarning));
});
