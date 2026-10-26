import test from "node:test";
import assert from "node:assert/strict";
import type { Page } from "../../src/shared/types";
import { mobilePageTree } from "../../src/mobile/page-tree";

const page = (id: string, parent: string | null, sidebarOrder: string): Page => ({
  id, parent, sidebarOrder, title: id, icon: "file", body: "", properties: {}, revision: "r", updated: "",
});

test("mobile navigation uses desktop sibling order and retains collapsed descendants", () => {
  const pages = [page("root-b", null, "8"), page("child-b", "root-a", "6"), page("grandchild", "child-a", "4"), page("root-a", null, "2"), page("child-a", "root-a", "3")];
  const original = JSON.stringify(pages);
  assert.deepEqual(mobilePageTree(pages, new Set()).map(row => [row.page.id, row.depth]), [
    ["root-a", 0], ["child-a", 1], ["grandchild", 2], ["child-b", 1], ["root-b", 0],
  ]);
  assert.deepEqual(mobilePageTree(pages, new Set(["root-a"])).map(row => row.page.id), ["root-a", "root-b"]);
  assert.deepEqual(mobilePageTree(pages, new Set(["child-a"])).map(row => row.page.id), ["root-a", "child-a", "child-b", "root-b"]);
  assert.equal(JSON.stringify(pages), original);
});

test("missing parents, self references and cycles remain reachable exactly once", () => {
  const pages = [page("orphan", "missing", "1"), page("a", "b", "2"), page("b", "a", "3"), page("self", "self", "4")];
  const rows = mobilePageTree(pages, new Set());
  assert.deepEqual(rows.map(row => row.page.id).sort(), ["a", "b", "orphan", "self"]);
  assert.equal(rows.find(row => row.page.id === "orphan")!.depth, 0);
  assert.equal(mobilePageTree(pages, new Set(["a"])).filter(row => row.page.id === "b").length, 0);
});
