import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "prosemirror-state";
import { history, closeHistory, undo } from "prosemirror-history";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec";
import { adjustColumnWidths, tableColumnWidths, tableWidthAttrs, tableWidthsKey, setViewTableWidths } from "../../src/editor/table-column-widths";
import type { SyntaxConfig } from "../../src/markdown-engine/config";

test("native table widths survive codec and undo with unknown column attributes intact", () => {
  const syntax: SyntaxConfig = { version: 1, variant: "notdown", extensions: {} };
  const source = '<table custom="table"><colgroup><col width="120" color="red" future="keep"/><col width="240"/></colgroup>\n<tr><td>A</td><td>B</td></tr>\n</table>';
  let state = EditorState.create({ doc: parseNative(source, syntax), plugins: [history(), tableColumnWidths()] });
  const attrs = tableWidthAttrs(state.doc.firstChild!, adjustColumnWidths([120, 240], 0, 40))!;
  state = state.apply(closeHistory(state.tr).setNodeMarkup(0, undefined, attrs));
  const output = serializeNative(state.doc, syntax), reopened = parseNative(output, syntax);
  assert.deepEqual(reopened.firstChild!.attrs.widths, ["160", "200"]);
  assert.equal(reopened.firstChild!.attrs.columnAttrs[0].future, "keep");
  assert.equal(reopened.firstChild!.attrs.columnAttrs[0].color, "red");
  assert.equal(reopened.firstChild!.attrs.nfmAttrs.custom, "table");
  assert(undo(state, tr => { state = state.apply(tr); }));
  assert.deepEqual(state.doc.firstChild!.attrs.widths, ["120", "240"]);
});
test("temporary MMD sizing preserves exact source, maps past edits and drops on table replacement", () => {
  const syntax: SyntaxConfig = { version: 1, variant: "markdown_mmd", extensions: {} };
  const source = '[Caption][id]\n| A | B |\n| :--- | ---: |\n| C | D |';
  let state = EditorState.create({ doc: parseNative(source, syntax), plugins: [tableColumnWidths()] });
  const original = serializeNative(state.doc, syntax), doc = state.doc;
  assert.equal(tableWidthAttrs(doc.firstChild!, [100, 200]), null);
  state = state.apply(setViewTableWidths(state, 0, [100, 200]));
  assert.equal(state.doc, doc); assert.equal(serializeNative(state.doc, syntax), original);
  state = state.apply(state.tr.setMeta(tableWidthsKey, { history: "undo" }));
  assert.equal(tableWidthsKey.getState(state)!.values.size, 0);
  state = state.apply(state.tr.setMeta(tableWidthsKey, { history: "redo" }));
  assert.deepEqual(tableWidthsKey.getState(state)!.values.get(0), [100, 200]);
  const paragraph = state.schema.nodes["block.paragraph"].create(null, state.schema.text("Before"));
  state = state.apply(state.tr.insert(0, paragraph));
  assert.deepEqual(tableWidthsKey.getState(state)!.values.get(paragraph.nodeSize), [100, 200]);
  state = state.apply(state.tr.delete(paragraph.nodeSize, state.doc.content.size));
  assert.equal(tableWidthsKey.getState(state)!.values.size, 0);
});
test("column resizing clamps both adjacent tracks without changing other columns or total width", () => {
  for (const delta of [-1000, 1000]) {
    const widths = adjustColumnWidths([160, 240, 300], 0, delta);
    assert.equal(widths.reduce((a, b) => a + b, 0), 700);
    assert.equal(widths[2], 300); assert(widths[0] >= 48); assert(widths[1] >= 48);
  }
});

test("official native col widths remain editable while unknown column syntax remains recoverable", () => {
  const syntax: SyntaxConfig = { version: 1, variant: "notion-markdown", extensions: {} };
  const source = '<table><colgroup><col width="120" color="red"/><col width="240"/></colgroup>\n<tr><td>A</td><td>B</td></tr>\n</table>';
  const doc = parseNative(source, syntax), table = doc.firstChild!;
  assert.deepEqual(table.attrs.widths, ["120", "240"]);
  const next = doc.type.create(null, table.type.create(tableWidthAttrs(table, [150, 210]), table.content));
  const reopened = parseNative(serializeNative(next, syntax), syntax);
  assert.deepEqual(reopened.firstChild!.attrs.widths, ["150", "210"]);
  const unknown = source.replace('color="red"', 'color="red" future="keep"');
  assert.equal(serializeNative(parseNative(unknown, syntax), syntax), unknown);
});
