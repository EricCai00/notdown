import test from "node:test";
import assert from "node:assert/strict";
import { EditorState, TextSelection } from "prosemirror-state";
import { history, undo } from "prosemirror-history";
import { editTable } from "../../src/editor/table-commands";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec";
import type { SyntaxConfig } from "../../src/markdown-engine/config";
import { TableSelection, tableMap, selectTableCells, pasteTableText, selectedTableText } from "../../src/editor/table-selection";

const config: SyntaxConfig = { version: 1, variant: "markdown", extensions: { grid_tables: true, pipe_tables: true, table_captions: true } };
test("table rectangle selection copies, pastes, clears and merges as reversible cell operations", () => {
  let state = initial();
  const map = tableMap(state.doc, 0);
  state = state.apply(state.tr.setSelection(new TableSelection(state.doc.resolve(map.cells[0].pos), state.doc.resolve(map.cells[3].pos))));
  assert.equal(selectedTableText(state.selection as TableSelection), "A\tB\nC\tD");
  assert.equal(pasteTableText(state, "one\ttwo\tthree"), null);
  state = state.apply(pasteTableText(state, "1\t2\n3\t4")!);
  assert.equal(state.doc.textContent, "1234"); state.doc.check();
  assert(editTable("merge-selection", "grid")(state, tr => state = state.apply(tr)));
  assert.equal(state.doc.firstChild!.firstChild!.firstChild!.attrs.colspan, 2);
  assert.equal(state.doc.firstChild!.firstChild!.firstChild!.attrs.rowspan, 2);
  assert.equal(parseNative(serializeNative(state.doc, config), config).textContent, "1234");
});

test("row/column movement and selection preserve unknown metadata; spans block unsafe moves", () => {
  let state = initial();
  assert(editTable("column-right")(state, tr => state = state.apply(tr)));
  assert.equal(state.doc.textContent, "BADC");
  assert(editTable("row-before")(state, tr => state = state.apply(tr)));
  assert.equal(state.doc.firstChild!.childCount, 3);
  const selection = selectTableCells(state, "column")!;
  state = state.apply(state.tr.setSelection(selection));
  assert.equal(selection.cells.length, 3);
  const tr = state.tr; selection.replace(tr); state = state.apply(tr); state.doc.check();
  assert.equal(state.doc.firstChild!.child(1).firstChild!.textContent, "");
  assert(editTable("merge-down")(state, tr => state = state.apply(tr)));
  assert.equal(editTable("row-down")(state), false);
});
function initial() {
  const doc = parseNative("| A | B |\n|---|---|\n| C | D |", config);
  return EditorState.create({ doc, selection: TextSelection.create(doc, 4), plugins: [history()] });
}
test("table merge, split, row and column operations preserve content, geometry and history", () => {
  let state = initial();
  const run = (name: Parameters<typeof editTable>[0]) => assert(editTable(name, "grid")(state, tr => state = state.apply(tr)), name);
  run("merge-right"); state.doc.check();
  assert.equal(state.doc.firstChild!.firstChild!.firstChild!.attrs.colspan, 2);
  assert.equal(state.doc.firstChild!.firstChild!.firstChild!.textContent, "AB");
  const output = serializeNative(state.doc, config), reopened = parseNative(output, config); reopened.check();
  assert.equal(reopened.firstChild!.firstChild!.firstChild!.attrs.colspan, 2, output);
  assert.equal(reopened.firstChild!.textContent, "ABCD");
  assert(undo(state, tr => state = state.apply(tr)));
  assert.equal(state.doc.firstChild!.firstChild!.childCount, 2);
  run("merge-down");
  const vertical = parseNative(serializeNative(state.doc, config), config);
  assert.equal(vertical.firstChild!.firstChild!.firstChild!.attrs.rowspan, 2);
  run("split"); state.doc.check();
  assert.equal(state.doc.firstChild!.child(1).childCount, 2);
  run("row-after"); assert.equal(state.doc.firstChild!.childCount, 3);
  run("column-after"); assert.equal(state.doc.firstChild!.firstChild!.childCount, 3);
  run("delete-row"); assert.equal(state.doc.firstChild!.childCount, 2);
  run("delete-column"); assert.equal(state.doc.firstChild!.firstChild!.childCount, 2);
  state.doc.check();
});
test("span controls require an enabled encoding and table captions survive edits", () => {
  let state = initial();
  assert.equal(editTable("merge-right", null)(state), false);
  assert(editTable("caption")(state, tr => state = state.apply(tr)));
  const source = serializeNative(state.doc, config);
  assert.equal(parseNative(source, config).firstChild!.firstChild!.type.name, "table_caption", source);
});

test("column insertion and deletion keep width and unknown column attributes aligned", () => {
  let state = initial();
  state = state.apply(state.tr.setNodeMarkup(0, undefined, { ...state.doc.firstChild!.attrs, widths: ["100", "200"], columnAttrs: [{ custom: "first" }, { custom: "second" }] }));
  assert(editTable("column-after")(state, tr => state = state.apply(tr)));
  assert.deepEqual(state.doc.firstChild!.attrs.widths, ["100", "", "200"]);
  assert.deepEqual(state.doc.firstChild!.attrs.columnAttrs, [{ custom: "first" }, {}, { custom: "second" }]);
  assert(editTable("delete-column")(state, tr => state = state.apply(tr)));
  assert.deepEqual(state.doc.firstChild!.attrs.widths, ["", "200"]);
  assert.deepEqual(state.doc.firstChild!.attrs.columnAttrs, [{}, { custom: "second" }]);
});
