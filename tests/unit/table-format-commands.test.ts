import test from "node:test";
import assert from "node:assert/strict";
import { EditorState, TextSelection } from "prosemirror-state";
import { history, undo } from "prosemirror-history";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec";
import { alignTableColumns, clearTableContents, colorTable, duplicateTableAxis } from "../../src/editor/table-format-commands";
import { selectTableCells, tableMap } from "../../src/editor/table-selection";
import type { SyntaxConfig } from "../../src/markdown-engine/config";

const body = "[Caption][keep-id]\n| A | B |\n| --- | --- |\n| C | D |\n| E | F |";
const config: SyntaxConfig = { version: 1, variant: "markdown_mmd", extensions: {} };
function initial(source = body, syntax = config) {
  const doc = parseNative(source, syntax), cell = tableMap(doc, 0).cells[2];
  return EditorState.create({ doc, selection: TextSelection.near(doc.resolve(cell.pos + 1)), plugins: [history()] });
}
test("MMD column alignment and duplication retain caption, content and round-trip geometry", () => {
  let state = initial(); const apply = (tr: Parameters<typeof state.apply>[0]) => { state = state.apply(tr); };
  assert(alignTableColumns("right")(state, apply));
  assert(duplicateTableAxis("row")(state, apply));
  let reopened = parseNative(serializeNative(state.doc, config), config);
  assert.equal(tableMap(reopened, 0).height, 4);
  assert.equal(reopened.firstChild!.attrs.captionId, "keep-id");
  assert.equal(tableMap(reopened, 0).cells[0].node.attrs.nfmAttrs.align, "right");
  assert.equal(tableMap(reopened, 0).grid[2][0].node.textContent, "C");
  assert(duplicateTableAxis("column")(state, apply));
  reopened = parseNative(serializeNative(state.doc, config), config);
  assert.equal(tableMap(reopened, 0).width, 3);
  assert.equal(reopened.firstChild!.attrs.captionId, "keep-id");
});
test("clear operates on the selected axis and undo restores all cells", () => {
  let state = initial();
  state = state.apply(state.tr.setSelection(selectTableCells(state, "row")!));
  assert(clearTableContents(state, tr => { state = state.apply(tr); }));
  assert.equal(tableMap(state.doc, 0).grid[1][0].node.textContent, "");
  assert.equal(tableMap(state.doc, 0).grid[2][0].node.textContent, "E");
  assert(undo(state, tr => { state = state.apply(tr); }));
  assert.equal(tableMap(state.doc, 0).grid[1][0].node.textContent, "C");
});
test("official table colors persist at each scope without rewriting unknown attributes", () => {
  const syntax: SyntaxConfig = { version: 1, variant: "notion-markdown", extensions: {} };
  let state = initial('<table custom="keep">\n<tr><td>A</td><td>B</td></tr>\n<tr custom="row"><td custom="cell">C</td><td>D</td></tr>\n</table>', syntax);
  const apply = (tr: Parameters<typeof state.apply>[0]) => { state = state.apply(tr); };
  assert(colorTable("row", "blue_bg")(state, apply));
  assert(colorTable("column", "red")(state, apply));
  assert(colorTable("cell", "green_bg")(state, apply));
  const output = serializeNative(state.doc, syntax), reopened = parseNative(output, syntax);
  assert.match(output, /custom="keep"/); assert.match(output, /custom="cell"/);
  assert.equal(reopened.firstChild!.child(1).attrs.nfmAttrs.color, "blue_bg");
  assert.equal(reopened.firstChild!.attrs.columnAttrs[0].color, "red");
  assert.equal(tableMap(reopened, 0).cells[2].node.attrs.nfmAttrs.color, "green_bg");
  assert.equal(alignTableColumns("right")(state), false);
  assert(colorTable("cell", "")(state, apply));
  assert.equal(tableMap(state.doc, 0).cells[2].node.attrs.nfmAttrs.color, undefined);
});
test("native Markdown colors and unsafe merged duplicates are rejected", () => {
  let state = initial(); assert.equal(colorTable("cell", "blue")(state), false);
  const cell = tableMap(state.doc, 0).cells[2];
  state = state.apply(state.tr.setNodeMarkup(cell.pos, undefined, { ...cell.node.attrs, colspan: 2 }));
  assert.equal(duplicateTableAxis("row")(state), false);
});
