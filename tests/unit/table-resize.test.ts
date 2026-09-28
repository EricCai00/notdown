import test from "node:test";
import assert from "node:assert/strict";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec";
import { resizeTable } from "../../src/editor/table-resize";
import { tableMap } from "../../src/editor/table-selection";
import type { SyntaxConfig } from "../../src/markdown-engine/config";

const config: SyntaxConfig = { version: 1, variant: "markdown_mmd", extensions: {} };
const source = "[Caption][stable]\n| A | B |\n| :--- | ---: |\n| C | D |\n| E | F |";
test("resize preserves MMD caption, alignment, header and source when dragged back", () => {
  const doc = parseNative(source, config), original = doc.firstChild!;
  const expanded = resizeTable(original, 4, 5);
  const reopened = parseNative(serializeNative(doc.type.create(null, expanded), config), config);
  const map = tableMap(reopened, 0);
  assert.equal(map.width, 4); assert.equal(map.height, 5);
  assert.equal(map.node.attrs.captionId, "stable");
  assert.equal(map.grid[4][1].node.attrs.nfmAttrs.align, "right");
  assert.equal(map.grid[2][0].node.textContent, "E");
  const reduced = resizeTable(original, 0, 0);
  assert.equal(tableMap(doc.type.create(null, reduced), 0).height, 1);
  assert.equal(tableMap(doc.type.create(null, reduced), 0).grid[0][0].node.textContent, "A");
  assert.equal(resizeTable(original, 2, 3), original);
});
test("resize clips merged spans and preserves surviving official attributes", () => {
  const syntax: SyntaxConfig = { version: 1, variant: "notdown", extensions: {} };
  const doc = parseNative('<table custom="table"><colgroup><col color="red"/><col color="blue"/></colgroup>\n<tr custom="row"><td custom="cell">A</td><td>B</td></tr>\n<tr><td>C</td><td>D</td></tr>\n</table>', syntax);
  const original = doc.firstChild!, firstRow = original.firstChild!, first = firstRow.firstChild!;
  const merged = original.copy(original.content.replaceChild(0, firstRow.copy(firstRow.content.replaceChild(0,
    first.type.create({ ...first.attrs, rowspan: 2 }, first.content)))).replaceChild(1,
    original.child(1).copy(original.child(1).content.cut(original.child(1).firstChild!.nodeSize))));
  const reduced = resizeTable(merged, 1, 1), map = tableMap(doc.type.create(null, reduced), 0);
  assert.equal(map.cells[0].h, 1); assert.equal(map.width, 1);
  assert.equal(map.node.attrs.nfmAttrs.custom, "table");
  assert.equal(map.node.firstChild!.attrs.nfmAttrs.custom, "row");
  assert.equal(map.cells[0].node.attrs.nfmAttrs.custom, "cell");
  assert.equal(resizeTable(merged, 2, 2), merged);
});
