import { editorKind } from "../../src/document/node-identity";
import test from "node:test";
import assert from "node:assert/strict";
import { EditorState, TextSelection } from "prosemirror-state";
import { editorSchema as schema } from "../../src/document/editor-schema.js";
import { lineBlockEnter } from "../../src/editor/line-block.js";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec.js";
import type { SyntaxConfig } from "../../src/markdown-engine/config.js";

const config: SyntaxConfig = { version: 1, variant: "notdown", extensions: {} };
function enter(state: EditorState) {
  let next = state;
  assert.equal(lineBlockEnter(state), true);
  assert.equal(lineBlockEnter(state, tr => { next = state.apply(tr); }), true);
  next.doc.check();
  return next;
}

test("Enter splits a line in place and retains inline marks", () => {
  const doc = parseNative("| **AlphaBeta**\n| Omega", config);
  const state = EditorState.create({ doc, selection: TextSelection.create(doc, 7) });
  const next = enter(state);
  assert.equal(next.doc.childCount, 1);
  const block = next.doc.firstChild!;
  assert.equal(block.childCount, 3);
  assert.equal(block.child(0).textContent, "Alpha");
  assert.equal(block.child(1).textContent, "Beta");
  assert.equal(block.child(2).textContent, "Omega");
  assert.equal(editorKind(block.child(0).firstChild!.marks[0]), "strong");
  assert.equal(editorKind(block.child(1).firstChild!.marks[0]), "strong");
  assert.equal(editorKind(next.selection.$from.parent), "line");
  assert.equal(serializeNative(next.doc, config), "| **Alpha**\n| **Beta**\n| Omega");
});

test("two Enters at the end create a paragraph without a trailing empty line", () => {
  const doc = parseNative("| Alpha", config);
  const state = EditorState.create({ doc, selection: TextSelection.create(doc, 7) });
  const once = enter(state);
  assert.equal(once.doc.childCount, 1);
  assert.equal(once.doc.firstChild!.childCount, 2);
  const twice = enter(once);
  assert.equal(twice.doc.childCount, 2);
  assert.equal(twice.doc.firstChild!.childCount, 1);
  assert.equal(editorKind(twice.selection.$from.parent), "paragraph");
  const typed = twice.apply(twice.tr.insertText("Outside"));
  assert.equal(serializeNative(typed.doc, config), "| Alpha\n\nOutside");
});

test("exiting an empty line preserves the surrounding lines, marks and block attributes", () => {
  for (const texts of [["", "After"], ["Before", "", "After"], [""]]) {
    const block = schema.nodes["block.line_block"].create({ color: "blue", nfmAttrs: { custom: "keep" } }, texts.map(text => schema.nodes["structure.line"].create(null, text ? schema.text(text, [schema.marks.em.create()]) : null)));
    const doc = schema.nodes["doc"].create(null, block);
    const index = texts.indexOf("");
    const pos = 2 + texts.slice(0, index).reduce((sum, text) => sum + text.length + 2, 0);
    const next = enter(EditorState.create({ doc, selection: TextSelection.create(doc, pos) }));
    assert.equal(editorKind(next.selection.$from.parent), "paragraph");
    const remaining: string[] = [];
    next.doc.forEach(node => {
      if (editorKind(node) !== "line_block") return;
      assert.equal(node.attrs.color, "blue");
      assert.deepEqual(node.attrs.nfmAttrs, { custom: "keep" });
      node.forEach(line => {
        remaining.push(line.textContent);
        assert.equal(editorKind(line.firstChild!.marks[0]), "em");
      });
    });
    assert.deepEqual(remaining, texts.filter(Boolean));
  }
});

test("a selected range is replaced within the same line block; ordinary paragraphs are untouched", () => {
  const doc = parseNative("| AlphaBeta\n\nTail", config);
  const next = enter(EditorState.create({ doc, selection: TextSelection.create(doc, 4, 7) }));
  assert.equal(next.doc.firstChild!.child(0).textContent, "Al");
  assert.equal(next.doc.firstChild!.child(1).textContent, "Beta");
  const ordinary = EditorState.create({ doc: parseNative("Ordinary", config) });
  assert.equal(lineBlockEnter(ordinary), false);
});
