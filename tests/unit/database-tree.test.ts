import { test } from "node:test";
import assert from "node:assert/strict";
import { databaseTree } from "../../src/features/databases/database-tree";
import type { Page } from "../../src/shared/types";
import type { Database } from "../../src/features/databases/database-model";
const page = (id: string, extra: Partial<Page> = {}): Page => ({ id, title: id, parent: null, icon: "file-text", properties: {}, body: "", revision: "r", updated: "", ...extra });
const db = (id: string, extra: Partial<Database> = {}): Database => ({ id, title: id, dataSourceIds: ["source"], viewIds: [], revision: "r", ...extra });

test("legacy databases project records under a virtual host without modifying stored pages", () => {
  const record = page("record", { dataSourceId: "source" });
  const tree = databaseTree([record], [db("db")]);
  assert.equal(tree.pages.find(item => item.id === "record")!.parent, "db");
  assert.equal(tree.pages.find(item => item.id === "db")!.databaseId, "db");
  assert.ok(tree.virtualIds.has("db"));
  assert.equal(record.parent, null);
});
test("native database host preserves parent and nested record children without duplication", () => {
  const tree = databaseTree([page("parent"), page("db", { databaseId: "db", parent: "parent" }), page("record", { parent: "db", dataSourceId: "source" }), page("child", { parent: "record" })], [db("db", { pageId: "db" })]);
  assert.equal(tree.pages.length, 4);
  assert.equal(tree.virtualIds.size, 0);
  assert.equal(tree.pages.find(item => item.id === "db")!.parent, "parent");
  assert.equal(tree.pages.find(item => item.id === "child")!.parent, "record");
});
test("shared source keeps an existing canonical parent and avoids a projected cycle", () => {
  const tree = databaseTree([page("a", { databaseId: "a" }), page("b", { databaseId: "b" }), page("record", { parent: "b", dataSourceId: "source" })], [db("a"), db("b")]);
  assert.equal(tree.pages.find(item => item.id === "record")!.parent, "b");
  const cycle = databaseTree([page("record", { dataSourceId: "source" }), page("db", { databaseId: "db", parent: "record" })], [db("db")]);
  assert.equal(cycle.pages.find(item => item.id === "record")!.parent, null);
});

test("database tree preserves hosted icons and uses legacy resource icons without changing storage", () => {
  const host = page("host", { databaseId: "host", icon: "🚀" });
  const tree = databaseTree([host], [db("host", { pageId: "host", icon: "stale-resource-icon" }), db("legacy", { dataSourceIds: [], icon: "book-open" })]);
  assert.equal(tree.pages.find(item => item.id === "host")!.icon, "🚀");
  assert.equal(tree.pages.find(item => item.id === "legacy")!.icon, "book-open");
  assert.equal(host.icon, "🚀");
});

test("removing a database icon keeps the empty stored value for the common page fallback", () => {
  const tree = databaseTree([page("host", { databaseId: "host", icon: "" })], [db("host", { pageId: "host" }), db("legacy", { dataSourceIds: [], icon: "" })]);
  assert.equal(tree.pages.find(item => item.id === "host")!.icon, "");
  assert.equal(tree.pages.find(item => item.id === "legacy")!.icon, "");
});

test("missing declared hosts and trashed resources never become virtual sidebar databases", () => {
  const legacy = db("legacy");
  const deleted = db("deleted", { pageId: "deleted" });
  const trashed = db("trashed", { trashed: true });
  const tree = databaseTree([], [deleted, trashed, legacy]);
  assert.deepEqual(tree.pages.map(page => page.id), ["legacy"]);
  assert.deepEqual([...tree.virtualIds], ["legacy"]);
});
