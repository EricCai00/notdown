import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSidebarTreePreferences, SidebarTreeExpansion } from "../../src/app/sidebar-tree-state";

test("sidebar tree defaults safely to collapsed pages and validates saved preferences", () => {
  for (const raw of [null, "broken", "null", "[]", "42", '{"expandDepth":-1}', '{"expandDepth":1.5}', '{"expandDepth":11}', '{"expandDepth":"2","databaseChildren":"other"}']) {
    assert.deepEqual(parseSidebarTreePreferences(raw), { databaseChildren: "pages", expandDepth: 0 });
  }
  assert.deepEqual(parseSidebarTreePreferences('{"databaseChildren":"views","expandDepth":2}'), { databaseChildren: "views", expandDepth: 2 });
  assert.equal(parseSidebarTreePreferences('{"expandDepth":"all"}').expandDepth, "all");
});

test("default depth applies to new branches while manual choices survive rerenders until reset", () => {
  const state = new SidebarTreeExpansion();
  assert.equal(state.isExpanded("root", 0, 0), false);
  assert.equal(state.isExpanded("root", 0, 1), true);
  assert.equal(state.isExpanded("child", 1, 1), false);
  assert.equal(state.isExpanded("child", 1, 2), true);
  state.set("root", false);
  state.set("child", true);
  assert.equal(state.isExpanded("root", 0, "all"), false);
  assert.equal(state.isExpanded("child", 1, 0), true);
  assert.equal(state.isExpanded("new", 2, 2), false);
  state.reset();
  assert.equal(state.isExpanded("root", 0, "all"), true);
  assert.equal(state.isExpanded("child", 1, 0), false);
});
