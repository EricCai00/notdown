import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "prosemirror-state";
import { history, undo, redo, closeHistory } from "prosemirror-history";
import { citationCleanup } from "../../src/editor/citations";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec";
import { mmdCitations } from "../../src/document/mmd-citations";
import type { SyntaxConfig } from "../../src/markdown-engine/config";

for (const variant of ["markdown_mmd", "notdown"] as const) test(`${variant}: final citation deletion removes only its ref and undo/redo restores both`, () => {
  const config: SyntaxConfig = { version: 1, variant, extensions: {} };
  const source = 'First [#book], again [p. 8][#book]. Other [#other].\n\n[#book]: **Book** with unknown text\n\n[#other]: Other book\n\n[#unused]: Keep unused\n';
  let state = EditorState.create({ doc: parseNative(source, config), plugins: [history(), citationCleanup()] });
  const dispatch = (tr: Parameters<typeof state.apply>[0]) => { state = state.apply(tr); };
  const remove = () => {
    const pos = mmdCitations(state.doc).entries.find(entry => entry.key === "book")!.references[0];
    dispatch(closeHistory(state.tr.delete(pos, pos + state.doc.nodeAt(pos)!.nodeSize)));
  };
  remove();
  const oneReference = serializeNative(state.doc, config);
  assert.match(oneReference, /\[#book\]: \*\*Book\*\*/);
  remove();
  const removed = serializeNative(state.doc, config);
  assert.doesNotMatch(removed, /\[#book\]/);
  assert.match(removed, /\[#other\]: Other book/);
  assert.match(removed, /\[#unused\]: Keep unused/);
  assert.equal(undo(state, dispatch), true);
  assert.equal(serializeNative(state.doc, config), oneReference);
  assert.equal(redo(state, dispatch), true);
  assert.equal(serializeNative(state.doc, config), removed);
});

test("unused definitions survive opening, adjacent edits, projection, and undo of a new reference", () => {
  const config: SyntaxConfig = { version: 1, variant: "markdown_mmd", extensions: {} };
  const source = 'Text\n\n[#unused]: Keep original\n';
  let state = EditorState.create({ doc: parseNative(source, config), plugins: [history(), citationCleanup()] });
  const dispatch = (tr: Parameters<typeof state.apply>[0]) => { state = state.apply(tr); };
  assert.equal(serializeNative(state.doc, config), source);
  dispatch(state.tr.insertText("Extra ", 1));
  const beforeInsert = serializeNative(state.doc, config);
  const citation = parseNative('[#unused]', config).firstChild!.firstChild!;
  dispatch(closeHistory(state.tr.insert(1, citation)));
  assert.equal(undo(state, dispatch), true);
  assert.equal(serializeNative(state.doc, config), beforeInsert);
  assert.equal(redo(state, dispatch), true);
  const replacement = parseNative(source, config);
  dispatch(state.tr.replaceWith(0, state.doc.content.size, replacement.content).setMeta("addToHistory", false).setMeta("pageMetadataProjection", true));
  assert.equal(serializeNative(state.doc, config), source);
});

test("suppressed citations count as references; code examples do not; whole-block deletion cleans all matching definitions", () => {
  const config: SyntaxConfig = { version: 1, variant: "markdown_mmd", extensions: {} };
  const source = '[#book]\n\n[Not cited][#book]\n\n`[#book]`\n\n[#book]: Book\n\n[#book]: Duplicate\n\n[#unrelated]: Keep\n';
  let state = EditorState.create({ doc: parseNative(source, config), plugins: [citationCleanup()] });
  state = state.apply(state.tr.delete(0, state.doc.firstChild!.nodeSize));
  assert.match(serializeNative(state.doc, config), /\[#book\]: Book/);
  state = state.apply(state.tr.delete(0, state.doc.firstChild!.nodeSize));
  const saved = serializeNative(state.doc, config);
  assert.doesNotMatch(saved, /\[#book\]:/);
  assert.match(saved, /`\[#book\]`/);
  assert.match(saved, /\[#unrelated\]: Keep/);
});
