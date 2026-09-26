import { editorKind } from "../../src/document/node-identity";
import assert from "node:assert/strict";
import test from "node:test";
import { EditorState } from "prosemirror-state";
import { history, undo } from "prosemirror-history";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec";
import { blockAtPos, moveEditorBlock } from "../../src/editor/editor-blocks";
import type { SyntaxConfig } from "../../src/markdown-engine/config";

const config: SyntaxConfig = { version: 1, variant: "notion-markdown", extensions: {} };
test("callout first paragraph moves the container, subsequent paragraphs and nested items move independently", () => {
  const doc = parseNative('<callout icon="❗">\n\tFirst\n\n\tSecond\n\n\t- Nested\n</callout>\n\nTail', config);
  const positions = new Map<string, number>();
  doc.descendants((node, pos) => { if (node.isText) positions.set(node.text!, pos); });
  assert.equal(editorKind(blockAtPos(doc, positions.get("First")!)?.node), "callout");
  const second = blockAtPos(doc, positions.get("Second")!)!;
  assert.equal(editorKind(second.node), "paragraph");
  assert.equal(editorKind(blockAtPos(doc, positions.get("Nested")!)?.node), "bullet_list_item");
  let state = EditorState.create({ doc, plugins: [history()] });
  const moved = moveEditorBlock(state, second.pos, positions.get("Tail")!, "after");
  assert(moved);
  state = state.apply(moved);
  assert.equal(state.doc.firstChild!.textContent, "FirstNested");
  assert.equal(state.doc.lastChild!.textContent, "Second");
  assert(undo(state, tr => { state = state.apply(tr); }));
  assert(state.doc.eq(doc));
});

test("changing and removing a callout icon survives CRLF reopening and retains unknown attributes", () => {
  const source = '<callout icon="❗" custom="keep">\r\n\tFirst\r\n\r\n\tSecond\r\n</callout>\r\n\r\nTail';
  const doc = parseNative(source, config);
  assert.equal(serializeNative(doc, config), source);
  for (const icon of ["✅", "", "<unsafe>"]) {
    const state = EditorState.create({ doc });
    const changed = state.apply(state.tr.setNodeMarkup(0, undefined, { ...doc.firstChild!.attrs, icon }));
    const encoded = serializeNative(changed.doc, config);
    const reopened = parseNative(encoded, config);
    assert.equal(reopened.firstChild!.attrs.icon, icon);
    assert.equal(reopened.firstChild!.attrs.nfmAttrs.custom, "keep");
    assert.equal(reopened.firstChild!.textContent, "FirstSecond");
    assert.equal(reopened.lastChild!.textContent, "Tail");
  }
});
