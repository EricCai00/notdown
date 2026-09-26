import { editorKind } from "../../src/document/node-identity";
import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "prosemirror-state";
import { history, undo, redo } from "prosemirror-history";
import {
  columnWidths,
  columnWidthTransaction,
  resizeColumnPair,
} from "../../src/blocks/column-widths.js";
import {
  parseNotionMarkdown,
  serializeNotionMarkdown,
} from "../../src/document/notion-markdown.js";
import { renderNotionMarkdown, htmlDocument } from "../../src/document/document-format.js";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec.js";
import type { SyntaxConfig } from "../../src/markdown-engine/config.js";

const body =
  '<columns custom="keep">\n\t<column width-ratio="0.3" future="yes">\n\t\tLeft\n\t\t```text\n\t\t<column width-ratio="fake">\n\t\t```\n\t</column>\n\t<column width-ratio="0.7">\n\t\tRight\n\t</column>\n</columns>\n\n<future untouched="yes"/>\n';

test("column resize persists ratios and unknown fields without altering fenced or unrelated source", () => {
  const doc = parseNotionMarkdown(body);
  assert.equal(serializeNotionMarkdown(doc), body);
  assert.deepEqual(columnWidths(doc.firstChild!), [0.3, 0.7]);
  const state = EditorState.create({ doc });
  const updated = state.apply(columnWidthTransaction(state, 0, [0.4, 0.6])!);
  updated.doc.check();
  const source = serializeNotionMarkdown(updated.doc);
  assert.match(source, /<columns custom="keep">/);
  assert.match(source, /<column width-ratio="0.4" future="yes">/);
  assert.match(source, /<column width-ratio="0.6">/);
  assert.match(source, /<column width-ratio="fake">/);
  assert.ok(source.endsWith('\n\n<future untouched="yes"/>\n'));
  assert.deepEqual(
    columnWidths(parseNotionMarkdown(source).firstChild!),
    [0.4, 0.6],
  );
  assert.match(
    renderNotionMarkdown(source),
    /--column-widths:minmax\(0, 0.4fr\) minmax\(0, 0.6fr\)/,
  );
  assert.match(
    htmlDocument("Widths", source, [], "notion-markdown"),
    /grid-template-columns:var\(--column-widths/,
  );
});

test("invalid and incomplete ratios safely display equally and preserve raw values", () => {
  for (const value of [
    "",
    "NaN",
    "Infinity",
    "0",
    "-1",
    "1",
    "0.5; color:red",
  ]) {
    const source = body.replace('width-ratio="0.3"', `width-ratio="${value}"`);
    const doc = parseNotionMarkdown(source);
    assert.deepEqual(columnWidths(doc.firstChild!), [0.5, 0.5]);
    assert.equal(serializeNotionMarkdown(doc), source);
  }
  const partial = parseNotionMarkdown(body.replace(' width-ratio="0.3"', ""));
  assert.deepEqual(columnWidths(partial.firstChild!), [0.5, 0.5]);
  const invalid = parseNotionMarkdown(
    '<columns>\n\t<column width-ratio="0.3">\n\t\tKeep\n</columns>',
  );
  assert.equal(editorKind(invalid.firstChild!), "opaque_block");
});

test("drag clamps adjacent columns to a usable size and preserves other ratios", () => {
  const widths = [0.2, 0.3, 0.5];
  assert.deepEqual(
    resizeColumnPair(widths, 0, 100, 1000),
    [0.30000000000000004, 0.19999999999999996, 0.5],
  );
  const small = resizeColumnPair(widths, 0, -10000, 1000);
  assert.equal(small[0], 0.08);
  assert.equal(small[2], 0.5);
  assert.ok(Math.abs(small[0] + small[1] - 0.5) < 1e-10);
});

test("one resize transaction supports undo and redo including original source", () => {
  let state = EditorState.create({
    doc: parseNotionMarkdown(body),
    plugins: [history()],
  });
  state = state.apply(columnWidthTransaction(state, 0, [0.4, 0.6])!);
  const resized = serializeNotionMarkdown(state.doc);
  assert.ok(
    undo(state, (tr) => {
      state = state.apply(tr);
    }),
  );
  assert.equal(serializeNotionMarkdown(state.doc), body);
  assert.ok(
    redo(state, (tr) => {
      state = state.apply(tr);
    }),
  );
  assert.equal(serializeNotionMarkdown(state.doc), resized);
});

test("Notdown columns retain widths through codec and extension disable", () => {
  for (const variant of ["notdown"] as const) {
    const config: SyntaxConfig = {
      version: 1,
      variant,
      extensions: { notion_columns: true },
    };
    const state = EditorState.create({ doc: parseNative(body, config) });
    const resized = state.apply(
      columnWidthTransaction(state, 0, [0.25, 0.75])!,
    );
    const source = serializeNative(resized.doc, config);
    assert.deepEqual(
      columnWidths(parseNative(source, config).firstChild!),
      [0.25, 0.75],
    );
    const disabled = { ...config, extensions: { notion_columns: false } };
    assert.equal(
      serializeNative(parseNative(source, disabled), disabled),
      source,
    );
  }
});
