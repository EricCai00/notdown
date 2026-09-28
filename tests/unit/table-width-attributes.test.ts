import test from "node:test";
import assert from "node:assert/strict";
import { EditorState, TextSelection } from "prosemirror-state";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec";
import { tableMap } from "../../src/editor/table-selection";
import { tableWidthAttrs } from "../../src/editor/table-column-widths";
import { editTable } from "../../src/editor/table-commands";
import { resizeTable } from "../../src/editor/table-resize";
import { readTableColumnWidths } from "../../src/document/table-width-attributes";
import { commandEnabled } from "../../src/markdown-engine/config";
import { tableCellStyle } from "../../src/editor/editor-table";
const syntax = { version: 1, variant: "notdown", extensions: {} } as const;
const body = '| A | B |\n| --- | --- |\n| C | D |';

test("Notdown explicit widths preserve MMD caption, spans, unknown attributes and untouched source", () => {
  for (const caption of ['', '[Caption][stable]\n']) {
    const source = caption + body + '\n\n: {tbl-colwidths="[30,70]" future="keep"}';
    const doc = parseNative(source, syntax), table = doc.firstChild!;
    assert.equal(doc.childCount, 1); assert.deepEqual(table.attrs.widths, ['30','70']);
    assert.equal(serializeNative(doc, syntax), source);
    const changed = table.type.create(tableWidthAttrs(table, [40,60], true), table.content);
    const output = serializeNative(doc.type.create(null, changed), syntax);
    const reopened = parseNative(output, syntax);
    assert.equal(reopened.childCount, 1); assert.deepEqual(reopened.firstChild!.attrs.widths, ['40','60']);
    assert.equal(reopened.firstChild!.attrs.markdownAttrs.future, 'keep');
    if (caption) { assert.equal(reopened.firstChild!.firstChild!.textContent, 'Caption'); assert.equal(reopened.firstChild!.attrs.captionId, 'stable'); assert.equal(reopened.firstChild!.attrs.captionSide, 'top'); }
  }
});
test("column edits and count resizing keep explicit width metadata aligned", () => {
  const doc = parseNative(body + '\n\n: {tbl-colwidths="[30,70]"}', syntax);
  let state = EditorState.create({doc, selection: TextSelection.near(doc.resolve(tableMap(doc, 0).cells[0].pos + 1))});
  const apply = (tr: Parameters<typeof state.apply>[0]) => {state = state.apply(tr);};
  assert(editTable('column-right')(state, apply));
  assert.deepEqual(parseNative(serializeNative(state.doc, syntax), syntax).firstChild!.attrs.widths, ['70','30']);
  assert(editTable('column-after')(state, apply));
  let reopened = parseNative(serializeNative(state.doc, syntax), syntax);
  assert.equal(reopened.firstChild!.attrs.widths.length, 3);
  const resized = resizeTable(reopened.firstChild!, 4, 3);
  reopened = parseNative(serializeNative(reopened.type.create(null, resized), syntax), syntax);
  assert.equal(reopened.firstChild!.attrs.widths.length, 4);
});
test("invalid or mismatched widths stay recoverable and never produce a layout", () => {
  for (const value of ['[0,100]', '[-1,2]', '[1]', '["30",70]', 'auto', '[1e309,1]']) {
    assert.equal(readTableColumnWidths(value, 2), null);
    const source = body + `\n\n: {tbl-colwidths='${value}'}`;
    const doc = parseNative(source, syntax);
    assert.deepEqual(doc.firstChild!.attrs.widths, []);
    assert.equal(serializeNative(doc, syntax), source);
  }
  const fenced = '```md\n' + body + '\n\n: {tbl-colwidths="[30,70]"}\n```';
  assert.equal(serializeNative(parseNative(fenced, syntax), syntax), fenced);
});

test("grid encoding and rendered percentages retain widths while other dialects stay gated", () => {
  const doc = parseNative(body + '\n\n: {tbl-colwidths="[30,70]"}', syntax), table = doc.firstChild!;
  const grid = table.type.create({ ...table.attrs, syntaxForm: 'grid' }, table.content);
  const reopened = parseNative(serializeNative(doc.type.create(null, grid), syntax), syntax);
  assert.equal(reopened.firstChild!.attrs.syntaxForm, 'grid');
  assert.deepEqual(reopened.firstChild!.attrs.widths, ['30','70']);
  assert.match(tableCellStyle(reopened.firstChild!, 0, 0), /width:30%/);
  assert(commandEnabled(syntax, 'table_column_widths'));
  assert.equal(commandEnabled({ ...syntax, extensions: { table_attributes: false } }, 'table_column_widths'), false);
  assert.equal(commandEnabled({ ...syntax, variant: 'markdown_mmd' }, 'table_column_widths'), false);
  assert.equal(commandEnabled({ ...syntax, variant: 'notion-markdown' }, 'table_column_widths'), false);
});
