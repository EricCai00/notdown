import test from "node:test";
import assert from "node:assert/strict";
import { vaultListProperties } from "../../src/features/pages/vault-list-properties";
import type { DatabaseDataSource } from "../../src/features/databases/database-model";
import type { Page } from "../../src/shared/types";

const page: Page = { id: "record", title: "OneNote", dataSourceId: "source", parent: null, icon: "", body: "Original", revision: "rev", updated: "", properties: {} };
const source: DatabaseDataSource = { id: "source", title: "Applications", revision: "schema", properties: [
  { id: "legacy", key: "notion_585479d7-a14b-5d75-a6a3-64f2df000001", name: "Usage", type: "status", options: [{ id: "used", name: "Used" }] },
  { id: "new", key: "585479d7-a14b-5d75-a6a3-64f2df000002", name: "Platforms", type: "multi_select", options: [{ id: "win", name: "Windows" }, { id: "mac", name: "macOS" }] },
  { id: "count", key: "count", name: "Count", type: "number" },
  { id: "done", key: "done", name: "Done", type: "checkbox" },
  { id: "date", key: "date", name: "Schedule", type: "date" },
  { id: "relation", key: "related", name: "Related", type: "relation" },
] };

test("vault list resolves legacy and UUID keys through their own schema, preserving values and source", () => {
  const input = { ...page, properties: {
    [source.properties[0].key]: "used", [source.properties[1].key]: ["win", "mac"], count: 0, done: false,
    date: { start: "2026-11-03", end: "2026-11-05" }, related: [{ pageId: "target" }], cover: "assets/cover.png", extra: { nested: true },
  } };
  const original = JSON.stringify(input);
  const result = vaultListProperties(input, source, new Map([["target", { ...page, id: "target", title: "Notion" }]]));
  assert.deepEqual(result.map(({ name, value }) => [name, value]), [
    ["Usage", "Used"], ["Platforms", "Windows, macOS"], ["Count", "0"], ["Done", "☐"],
    ["Schedule", "2026-11-03 → 2026-11-05"], ["Related", "Notion"], ["cover", "assets/cover.png"], ["extra", '{"nested":true}'],
  ]);
  assert.equal(JSON.stringify(input), original);
});

test("vault list retains unknown page keys and never borrows names from another source", () => {
  const input = { ...page, properties: { count: 0, done: false, unset: null, tags: ["one", "two"], person: [{ name: "Eric" }], blank: [] } };
  for (const schema of [undefined, { ...source, id: "other" }]) {
    assert.deepEqual(vaultListProperties(input, schema, new Map()).map(({ name, value }) => [name, value]), [
      ["count", "0"], ["done", "false"], ["unset", "—"], ["tags", "one, two"], ["person", "Eric"], ["blank", "—"],
    ]);
  }
  assert.deepEqual(vaultListProperties({ ...page, dataSourceId: undefined, properties: { category: "Notes" } }, undefined, new Map()), [
    { key: "category", name: "category", value: "Notes" },
  ]);
});
