import assert from "node:assert/strict";
import test from "node:test";
import { EditorState, TextSelection } from "prosemirror-state";
import { editorSchema as schema } from "../../src/document/editor-schema";
import { inlineColorTransaction, selectedInlineColor } from "../../src/editor/inline-colors";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec";

const config = { version: 1 as const, variant: "notdown" as const, extensions: {} };
function state(source: string, caret = false) {
  const doc = parseNative(source, config);
  return EditorState.create({ doc, selection: TextSelection.create(doc, 1, caret ? 1 : doc.firstChild!.nodeSize - 1) });
}

test("colors replace and clear one channel while retaining other styles and unknown fields", () => {
  let next = state('<span color="yellow_bg" custom="keep">**Words**</span>');
  next = next.apply(inlineColorTransaction(next, "color", "red", true)!);
  assert.equal(selectedInlineColor(next, "color"), "red");
  assert.equal(selectedInlineColor(next, "background"), "yellow");
  next = next.apply(inlineColorTransaction(next, "background", "purple", true)!);
  next = next.apply(inlineColorTransaction(next, "color", "", true)!);
  assert.equal(selectedInlineColor(next, "color"), "");
  assert.equal(selectedInlineColor(next, "background"), "purple");
  next = next.apply(inlineColorTransaction(next, "background", "", true)!);
  const saved = serializeNative(next.doc, config);
  assert.ok(saved.includes('custom="keep"'));
  assert.ok(!saved.includes('color='));
  assert.ok(next.doc.firstChild!.firstChild!.marks.some(mark => mark.type === schema.marks.strong));
  assert.ok(parseNative(saved, config).textContent === "Words");
});

test("caret colors are stored alongside bold/italic and clearing them leaves subsequent typing plain", () => {
  let next = state("Words", true);
  next = next.apply(next.tr.setStoredMarks([schema.marks.strong.create(), schema.marks.em.create()]));
  next = next.apply(inlineColorTransaction(next, "color", "blue", true)!);
  next = next.apply(inlineColorTransaction(next, "background", "green", true)!);
  assert.equal(next.storedMarks!.length, 3);
  next = next.apply(inlineColorTransaction(next, "color", "", true)!);
  assert.equal(selectedInlineColor(next, "background"), "green");
  next = next.apply(inlineColorTransaction(next, "background", "", true)!);
  assert.deepEqual(next.storedMarks!.map(mark => mark.type.name), ["strong", "em"]);
  assert.equal(selectedInlineColor(next, "color"), "");
});

test("mixed selections receive one color without changing outside text or heterogeneous backgrounds", () => {
  let next = state('Plain <span color="red" bg_color="yellow">middle</span> tail');
  next = next.apply(next.tr.setSelection(TextSelection.create(next.doc, 3, 13)));
  assert.equal(selectedInlineColor(next, "color"), null);
  next = next.apply(inlineColorTransaction(next, "color", "green", true)!);
  assert.equal(selectedInlineColor(next, "color"), "green");
  assert.equal(next.doc.firstChild!.firstChild!.text, "Pl");
  assert.equal(next.doc.firstChild!.firstChild!.marks.length, 0);
  assert.ok(serializeNative(next.doc, config).includes('bg_color="yellow"'));
});

test("official Notion color changes use a single documented color attribute", () => {
  let next = state('<span color="red">Words</span>');
  next = next.apply(inlineColorTransaction(next, "background", "blue", false)!);
  assert.equal(selectedInlineColor(next, "color"), "");
  assert.equal(selectedInlineColor(next, "background"), "blue");
  const saved = serializeNative(next.doc, { ...config, variant: "notion-markdown" });
  assert.ok(saved.includes('color="blue_bg"'));
  assert.ok(!saved.includes('bg_color='));
  next = next.apply(inlineColorTransaction(next, "color", "", false)!);
  assert.equal(selectedInlineColor(next, "background"), "blue");
  next = next.apply(inlineColorTransaction(next, "background", "", false)!);
  assert.equal(next.doc.firstChild!.firstChild!.marks.length, 0);
  assert.equal(inlineColorTransaction(next, "color", 'red" future="bad', false), null);
});
