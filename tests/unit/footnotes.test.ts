import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "prosemirror-state";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec";
import { projectFootnotes, restoreFootnotes, footnotePresentation } from "../../src/editor/footnotes";
import { blockAtPos } from "../../src/editor/editor-blocks";
import type { SyntaxConfig } from "../../src/markdown-engine/config";

const config: SyntaxConfig = { version: 1, variant: "notdown", extensions: {} };
const source = '[^a]: First definition.\r\n\r\nBody [^b] then [^a] and [^b].\r\n\r\n<callout future="keep">\r\n\t[^b]: Nested definition.\r\n\r\n\tKeep body.\r\n</callout>\r\n\r\n[^orphan]: Keep unreferenced.';
test("footnotes project to one ordered footer and restore exact source including nested definitions", () => {
  const original = parseNative(source, config), projected = projectFootnotes(original);
  projected.check();
  const footer = projected.lastChild!;
  assert.equal(footer.type.name, "footnote_section");
  assert.deepEqual(Array.from({ length: footer.childCount }, (_, i) => footer.child(i).attrs.label), ["b", "a", "orphan"]);
  assert(projectFootnotes(projected).eq(projected));
  assert(restoreFootnotes(projected).eq(original));
  assert.equal(serializeNative(restoreFootnotes(projected), config), source);
  projected.descendants((node, pos) => {
    if (node.type.name.startsWith("footnote") && node.isBlock) {
      assert.equal(blockAtPos(projected, pos), null);
      if (node.childCount) assert.equal(blockAtPos(projected, pos + 1), null);
    }
  });
});
test("editing a projected definition updates its original source location and retains other content", () => {
  const state = EditorState.create({ doc: projectFootnotes(parseNative(source, config)), plugins: [footnotePresentation()] });
  let end = 0;
  state.doc.descendants((node, pos) => { if (node.isText && node.text === "Nested definition.") end = pos + node.nodeSize; });
  const next = state.applyTransaction(state.tr.insertText(" Edited", end)).state;
  const baseline = EditorState.create({ doc: parseNative(source, config) });
  let originalEnd = 0;
  baseline.doc.descendants((node, pos) => { if (node.isText && node.text === "Nested definition.") originalEnd = pos + node.nodeSize; });
  assert.equal(serializeNative(restoreFootnotes(next.doc), config), serializeNative(baseline.tr.insertText(" Edited", originalEnd).doc, config));
  assert.equal(next.selection.$from.parent.type.name, "paragraph");
});
test("changing first reference reorders definitions without changing Markdown identifiers", () => {
  const state = EditorState.create({ doc: projectFootnotes(parseNative('Body [^b] then [^a].\n\n[^a]: A\n\n[^b]: B', config)), plugins: [footnotePresentation()] });
  let first = 0;
  state.doc.descendants((node, pos) => { if (node.type.name === "footnote_reference" && node.attrs.label === "b") first = pos; });
  const next = state.applyTransaction(state.tr.delete(first, first + 1)).state;
  assert.equal(next.doc.lastChild!.firstChild!.attrs.label, "a");
  assert.match(serializeNative(restoreFootnotes(next.doc), config), /\[\^b\]: B/);
  let remaining = 0;
  next.doc.descendants((node, pos) => { if (node.type.name === "footnote_reference") remaining = pos; });
  const withoutReferences = next.applyTransaction(next.tr.delete(remaining, remaining + 1)).state;
  assert.equal(withoutReferences.doc.lastChild!.firstChild!.attrs.label, "a");
  assert.equal(withoutReferences.doc.lastChild!.lastChild!.attrs.label, "b");
});
