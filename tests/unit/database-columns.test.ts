import test from "node:test";
import assert from "node:assert/strict";
import { databaseViewProperties, notionTableProperties } from "../../src/features/databases/database-columns.js";
import type { Database, DatabaseDataSource, DatabaseProperty, DatabaseView } from "../../src/features/databases/database-model.js";

const fields: DatabaseProperty[] = [
  { id: "comment", name: "Comment", key: "comment", type: "text", notion: { id: "r%3Ax" } },
  { id: "since", name: "Since", key: "since", type: "number", notion: { id: "since" } },
  { id: "name", name: "Name", key: "title", type: "title", notion: { id: "title" } },
];
const remote = (ids: unknown[], data_source_id = "remote-source") => ({ type: "table", data_source_id,
  configuration: { type: "table", properties: ids.map(property_id => ({ property_id, visible: true })) } });
const names = (values: DatabaseProperty[]) => values.map(field => field.name);
const source: DatabaseDataSource = { id: "source", title: "Imported", properties: fields, notion: { id: "remote-source" }, revision: "source-revision" };
const view: DatabaseView = { id: "view", databaseId: "database", dataSourceId: source.id, name: "All records", type: "table", propertyIds: fields.map(field => field.id), revision: "view-revision" };
const database: Database = { id: "database", title: "Imported", dataSourceIds: [source.id], viewIds: [view.id], notionViews: [remote(["title", "since", "r:x"])], revision: "database-revision" };

test("uses table property IDs, encoded IDs and names, skips unrelated sources and preserves omitted fields", () => {
  assert.deepEqual(names(notionTableProperties(fields, [remote(["since"], "other"), remote(["title", "since", "r:x", "since", "unknown"])], "remote-source")), ["Name", "Since", "Comment"]);
  assert.deepEqual(names(notionTableProperties(fields, [remote(["Comment", null, "Name"])], "remote-source")), ["Comment", "Name", "Since"]);
  assert.deepEqual(names(notionTableProperties(fields, [remote(["since"])], "remote-source")), ["Name", "Since", "Comment"]);
  assert.deepEqual(names(notionTableProperties(fields, [remote(["r%3Ax", "title", "since"])], "remote-source")), ["Comment", "Name", "Since"]);
});

test("unavailable, invalid or non-table views use a stable title-first fallback without dropping hidden properties", () => {
  for (const views of [undefined, [], [null, { ...remote(["since"]), type: "board" }], [remote(["missing"])], [{ ...remote(["since"]), configuration: null }]]) {
    assert.deepEqual(names(notionTableProperties(fields, views, "remote-source")), ["Name", "Comment", "Since"]);
  }
  const hidden = remote(["title", "since", "r:x"]); hidden.configuration.properties[1].visible = false;
  assert.deepEqual(names(notionTableProperties(fields, [hidden], "remote-source")), ["Name", "Since", "Comment"]);
});

test("legacy import projection repairs the default without rewriting resources, custom views or local databases", () => {
  const original = JSON.stringify({ source, view, database });
  assert.deepEqual(names(databaseViewProperties(source, view, database)), ["Name", "Since", "Comment"]);
  assert.deepEqual(names(databaseViewProperties(source, view, { ...database, notionViews: [] })), ["Name", "Comment", "Since"]);
  assert.deepEqual(names(databaseViewProperties(source, { ...view, propertyIds: ["since", "name"] }, database)), ["Since", "Name"]);
  assert.deepEqual(names(databaseViewProperties({ ...source, notion: undefined }, view, database)), ["Comment", "Since", "Name"]);
  assert.deepEqual(names(databaseViewProperties(source, { ...view, propertyIds: ["since"] }, database)), ["Name", "Since"]);
  assert.equal(JSON.stringify({ source, view, database }), original);
});
