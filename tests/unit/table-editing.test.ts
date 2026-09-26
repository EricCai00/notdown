import { editorKind } from "../../src/document/node-identity";
import test from "node:test";
import assert from "node:assert/strict";
import { EditorState, TextSelection } from "prosemirror-state";
import { editorSchema as schema } from "../../src/document/editor-schema.js";
import { blockAtPos, moveEditorBlock } from "../../src/editor/editor-blocks.js";
import { itemAtSelection } from "../../src/editor/editor-input-rules.js";
import { tableLineBreak } from "../../src/editor/editor-table.js";

test("cell positions resolve to the table and cannot become nested page blocks", () => {
  const table = schema.nodes["block.table"].create(null, schema.nodes["structure.table_row"].create(null, schema.nodes["structure.table_cell"].create(null, schema.nodes["block.paragraph"].create(null, schema.text("cell")))));
  const doc = schema.nodes["doc"].create(null, [table, schema.nodes["block.paragraph"].create(null, schema.text("outside"))]);
  const state = EditorState.create({ doc, selection: TextSelection.create(doc, 5) });
  assert.equal(editorKind(blockAtPos(doc, 5)?.node), "table");
  assert.equal(moveEditorBlock(state, table.nodeSize, 5, "inside"), null);
  let next = state;
  assert.equal(tableLineBreak(state, tr => { next = state.apply(tr); }), true);
  const cell = next.doc.firstChild!.firstChild!.firstChild!;
  assert.equal(cell.childCount, 1);
  assert.equal(editorKind(cell.firstChild!.child(1)), "hard_break");
});

test("cell input does not target a list item outside the table", () => {
  const table = schema.nodes["block.table"].create(null, schema.nodes["structure.table_row"].create(null, schema.nodes["structure.table_cell"].create(null, schema.nodes["block.paragraph"].create(null, schema.text("cell")))));
  const doc = schema.nodes["doc"].create(null, schema.nodes["structure.bullet_list"].create(null, schema.nodes["block.bullet_list_item"].create(null, [schema.nodes["block.paragraph"].create(null, schema.text("item")), table])));
  let pos = 0;
  doc.descendants((node, offset) => { if (node.isText && node.text === "cell") pos = offset; });
  const state = EditorState.create({ doc, selection: TextSelection.create(doc, pos) });
  assert.equal(itemAtSelection(state), null);
});
