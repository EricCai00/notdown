import assert from "node:assert/strict";
import test from "node:test";
import { icons } from "lucide";
import { emojiIconPresentation, lucidePageIcon, lucidePageIcons } from "../../src/shared/page-icons";

test("page icon catalog exposes every bundled Lucide export and resolves names with digits", () => {
  assert.equal(lucidePageIcons.length, Object.keys(icons).length);
  for (const { name, node } of lucidePageIcons) assert.equal(lucidePageIcon(name), node, name);
  for (const [name, node] of Object.entries(icons)) assert.equal(lucidePageIcon(name), node, name);
  assert.equal(lucidePageIcon("link-2"), icons.Link2);
  assert.equal(lucidePageIcon("grid-2x2"), icons.Grid2X2);
  assert.equal(lucidePageIcon("arrow-down-0-1"), icons.ArrowDown01);
  assert.equal(lucidePageIcon("a-arrow-down"), icons.AArrowDown);
  assert.equal(lucidePageIcon("home"), icons.House);
});

test("unrecognized names and custom symbols cannot access arbitrary properties or markup", () => {
  for (const value of [undefined, "", "not-a-lucide-icon", "constructor", "__proto__", "🚀", "👩🏽‍💻", '<img src=x onerror="alert(1)">']) {
    assert.equal(lucidePageIcon(value), undefined);
  }
});

test("bare imported emoji request emoji presentation without altering explicit selectors or sequences", () => {
  assert.equal(emojiIconPresentation("⚗"), "⚗️");
  assert.equal(emojiIconPresentation("⚗️"), "⚗️");
  assert.equal(emojiIconPresentation("⚗\uFE0E"), "⚗\uFE0E");
  assert.equal(emojiIconPresentation("☀ ⚙ ❤"), "☀️ ⚙️ ❤️");
  assert.equal(emojiIconPresentation("👁‍🗨"), "👁️‍🗨️");
  for (const icon of ["☝🏻", "👩🏽‍💻", "🏳️‍🌈", "🇯🇵", "1️⃣", "1\u20E3", "#*0123456789", "∑", "ABC", "file-text", "🚀"]) {
    assert.equal(emojiIconPresentation(icon), icon, icon);
  }
});
