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
  assert.match(source, /<column future="yes" ratio="40">/);
  assert.match(source, /<column ratio="60">/);
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

const officialBody = body.replaceAll('width-ratio="0.3"', 'ratio="30"')
  .replaceAll('width-ratio="0.7"', 'ratio="70"');

test("official percentage ratios render and survive edits in both NFM and Notdown", () => {
  for (const variant of ["notion-markdown", "notdown"] as const) {
    const config: SyntaxConfig = { version: 1, variant, extensions: {} };
    let state = EditorState.create({ doc: parseNative(officialBody, config), plugins: [history()] });
    assert.equal(editorKind(state.doc.firstChild), "columns");
    assert.deepEqual(columnWidths(state.doc.firstChild!), [0.3, 0.7]);
    assert.equal(serializeNative(state.doc, config), officialBody);
    state = state.apply(columnWidthTransaction(state, 0, [0.375, 0.625])!);
    state.doc.check();
    const source = serializeNative(state.doc, config);
    assert.match(source, /<column ratio="37.5" future="yes">/);
    assert.match(source, /<column ratio="62.5">/);
    assert.match(source, /<columns custom="keep">/);
    assert.match(source, /<column width-ratio="fake">/); // Code remains literal.
    assert.ok(source.endsWith('\n\n<future untouched="yes"/>\n'));
    assert.deepEqual(columnWidths(parseNative(source, config).firstChild!), [0.375, 0.625]);
    assert.match(htmlDocument("Widths", source, [], "notion-markdown", config), /--column-widths:minmax\(0, 0.375fr\) minmax\(0, 0.625fr\)/);
    assert.match(renderNotionMarkdown(source), /data-ratio="37.5"/);
    assert.ok(undo(state, tr => { state = state.apply(tr); }));
    assert.equal(serializeNative(state.doc, config), officialBody);
    assert.ok(redo(state, tr => { state = state.apply(tr); }));
    assert.equal(serializeNative(state.doc, config), source);
    const disabled = { ...config, extensions: { notion_columns: false } };
    const opaque = parseNative(source, disabled);
    assert.equal(editorKind(opaque.firstChild), "opaque_block");
    assert.equal(serializeNative(opaque, disabled), source);
  }
});

test("missing or invalid official ratios fall back to equal widths without changing source", () => {
  const config: SyntaxConfig = { version: 1, variant: "notion-markdown", extensions: {} };
  for (const value of ["", "NaN", "Infinity", "0", "-1", "100", "101", "30%", "30; color:red"]) {
    const source = officialBody.replace('ratio="30"', `ratio="${value}"`);
    const doc = parseNative(source, config);
    assert.deepEqual(columnWidths(doc.firstChild!), [0.5, 0.5], value);
    assert.equal(serializeNative(doc, config), source);
    const edited = EditorState.create({ doc }).tr.insertText("!", 3).doc;
    assert.equal(parseNative(serializeNative(edited, config), config).firstChild!.firstChild!.attrs.nfmAttrs.ratio, value);
  }
  const partial = officialBody.replace(' ratio="30"', "");
  assert.deepEqual(columnWidths(parseNative(partial, config).firstChild!), [0.5, 0.5]);
  const normalized = officialBody.replace('ratio="30"', 'ratio="20"').replace('ratio="70"', 'ratio="60"');
  assert.deepEqual(columnWidths(parseNative(normalized, config).firstChild!), [0.25, 0.75]);
  const both = officialBody.replace('ratio="30"', 'ratio="30" width-ratio="0.8"').replace('ratio="70"', 'ratio="70" width-ratio="0.2"');
  assert.deepEqual(columnWidths(parseNotionMarkdown(both).firstChild!), [0.3, 0.7]);
});

test("resizing new columns writes every official percentage and totals exactly 100", () => {
  const source = '<columns>\n<column>\nOne\n</column>\n<column>\nTwo\n</column>\n<column>\nThree\n</column>\n</columns>';
  const config: SyntaxConfig = { version: 1, variant: "notion-markdown", extensions: {} };
  const state = EditorState.create({ doc: parseNative(source, config) });
  const resized = state.apply(columnWidthTransaction(state, 0, [1 / 3, 1 / 3, 1 / 3])!);
  const result = serializeNative(resized.doc, config);
  assert.doesNotMatch(result, /width-ratio/);
  assert.deepEqual([...result.matchAll(/ratio="([\d.]+)"/g)].map(match => Number(match[1])), [33.3333, 33.3333, 33.3334]);
});
