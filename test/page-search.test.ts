import { test } from "node:test";
import assert from "node:assert/strict";
import { searchPages } from "../src/page-search.js";
import type { Page } from "../src/types.js";

const page = (id: string, title: string, body = "", updated = "2026-09-12") =>
  ({
    id,
    title,
    body,
    updated,
    properties: {},
    parent: null,
    icon: "",
    revision: "1",
  }) satisfies Page;
test("search prioritizes title matches and matches Chinese content", () => {
  const body = page("body", "随记", "编辑体验");
  const exact = page("exact", "编辑体验");
  const longer = page("longer", "编辑体验研究");
  assert.deepEqual(
    searchPages([body, longer, exact], "编辑体验").map((p) => p.id),
    ["exact", "longer", "body"],
  );
});
test("search supports quoted phrases, multiple terms, literal punctuation and recent pages", () => {
  const first = page("first", "Markdown [notes]", "block editing 原型");
  const second = page("second", "notes", "editing block 原型");
  assert.deepEqual(
    searchPages([first, second], '"block editing" 原型').map((p) => p.id),
    ["first"],
  );
  assert.deepEqual(
    searchPages([first, second], "[notes]").map((p) => p.id),
    ["first"],
  );
  assert.deepEqual(
    searchPages([first, second], "", ["missing", "second", "first"]).map(
      (p) => p.id,
    ),
    ["second", "first"],
  );
});
