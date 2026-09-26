import test from "node:test";
import assert from "node:assert/strict";
import { EditorState, TextSelection } from "prosemirror-state";
import { history, undo } from "prosemirror-history";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec";
import type { SyntaxConfig } from "../../src/markdown-engine/config";
import { editorKind } from "../../src/document/node-identity";
import { blockAtPos, moveEditorBlock, deleteEditorBlock, duplicateEditorBlock, deleteEditorBlocks } from "../../src/editor/editor-blocks";
import { convertListItem } from "../../src/editor/editor-convert";
import { editDefinition } from "../../src/editor/definition-commands";

const source = "Alpha\n\n:   First paragraph.\n\n    Second paragraph.\n\n:   Other definition.\n\n    ```text\n    Code child\n    ```\n\nBeta\n:   Beta body.\n\nGamma\n\n~   Gamma body.\n\nTail";
const config: SyntaxConfig = { version: 1, variant: "notdown", extensions: {} };
const document = () => parseNative(source, config);
function positions(doc = document()) {
  const result: Record<string, number> = {};
  doc.descendants((node, pos) => {
    if (editorKind(node) === "definition_list_item") result[node.firstChild!.textContent] = pos;
    if (node.isTextblock) result[node.textContent] = pos;
  });
  return result;
}
const terms = (doc: ReturnType<typeof document>) => {
  const result: string[] = [];
  doc.descendants(node => { if (editorKind(node) === "definition_term") result.push(node.textContent); });
  return result;
};

test("each term owns its definitions, while every definition body block resolves independently", () => {
  const doc = document(), at = positions(doc), list = doc.firstChild!;
  assert.equal(list.type.name, "structure.definition_list");
  assert.equal(list.childCount, 3);
  assert.equal(list.firstChild!.type.name, "block.definition_list_item");
  assert.equal(list.firstChild!.childCount, 3, "one term, two definitions");
  const item = blockAtPos(doc, at.Alpha + 1)!;
  assert.equal(item.node, list.firstChild);
  assert.equal(item.end, 1 + list.firstChild!.nodeSize);
  for (const text of ["First paragraph.", "Second paragraph.", "Other definition.", "Code child", "Beta body."]) {
    const block = blockAtPos(doc, at[text] + 1)!;
    assert.equal(block.pos, at[text]);
    assert.equal(block.node.textContent, text);
  }
  assert.equal(serializeNative(doc, config), source);
});

test("term groups move, duplicate and delete independently with undo and valid Markdown", () => {
  const doc = document(), at = positions(doc);
  let state = EditorState.create({ doc, plugins: [history()] });
  const alpha = blockAtPos(doc, at.Alpha + 1)!.pos, beta = blockAtPos(doc, at.Beta + 1)!.pos;
  const moved = moveEditorBlock(state, alpha, beta, "after")!;
  assert(moved);
  state = state.apply(moved);
  state.doc.check();
  assert.deepEqual(terms(state.doc), ["Beta", "Alpha", "Gamma"]);
  const reopened = parseNative(serializeNative(state.doc, config), config);
  assert.deepEqual(terms(reopened), ["Beta", "Alpha", "Gamma"]);
  assert.equal(reopened.firstChild!.child(1).childCount, 3);
  assert(undo(state, tr => { state = state.apply(tr); }));
  assert.equal(serializeNative(state.doc, config), source);
  const duplicated = duplicateEditorBlock(state, alpha)!;
  assert.deepEqual(terms(duplicated.doc), ["Alpha", "Alpha", "Beta", "Gamma"]);
  assert.equal(duplicated.doc.firstChild!.child(1).textContent, doc.firstChild!.firstChild!.textContent);
  const deleted = deleteEditorBlock(state, beta)!;
  assert.deepEqual(terms(deleted.doc), ["Alpha", "Gamma"]);
  assert(!serializeNative(deleted.doc, config).includes("Beta body"));
  const removed = deleteEditorBlocks(state, [alpha, beta, blockAtPos(doc, at.Gamma + 1)!.pos])!;
  assert.equal(removed.doc.childCount, 1);
  assert.equal(removed.doc.textContent, "Tail");
});

test("definition children move across item boundaries and out of the list without losing siblings", () => {
  const doc = document(), at = positions(doc), state = EditorState.create({ doc });
  const outside = moveEditorBlock(state, at["Code child"], at.Tail, "after")!;
  assert(outside);
  assert.equal(editorKind(outside.doc.lastChild!), "code_block");
  assert.equal(outside.doc.lastChild!.textContent, "Code child");
  assert.deepEqual(terms(outside.doc), ["Alpha", "Beta", "Gamma"]);
  const intoBeta = moveEditorBlock(state, at["Second paragraph."], at.Beta + 1, "inside")!;
  assert(intoBeta);
  assert.equal(intoBeta.doc.firstChild!.child(1).lastChild!.childCount, 2);
  assert.deepEqual(terms(parseNative(serializeNative(intoBeta.doc, config), config)), ["Alpha", "Beta", "Gamma"]);
  const lastChild = deleteEditorBlock(state, at["Beta body."])!;
  lastChild.doc.check();
  assert.equal(lastChild.doc.firstChild!.child(1).lastChild!.firstChild!.textContent, "");
  const single = parseNative("Only\n: Body\n\nTail", config);
  const movedLast = moveEditorBlock(EditorState.create({ doc: single }), 1, single.firstChild!.nodeSize, "after")!;
  movedLast.doc.check();
  assert.equal(movedLast.doc.firstChild!.textContent, "Tail");
  assert.deepEqual(terms(parseNative(serializeNative(movedLast.doc, config), config)), ["Only"]);
});

test("definition controls and conversions operate on only the selected term group", () => {
  const doc = document(), at = positions(doc);
  const state = EditorState.create({ doc, selection: TextSelection.create(doc, at.Alpha + 1) });
  for (const type of ["text", "heading1", "list", "number", "task", "quote", "code"] as const) {
    const converted = convertListItem(state, type)!;
    assert(converted, type);
    converted.doc.check();
    assert.deepEqual(terms(converted.doc), ["Beta", "Gamma"], type);
    for (const text of ["Alpha", "First paragraph.", "Second paragraph.", "Other definition.", "Code child", "Beta body.", "Tail"])
      assert(converted.doc.textContent.includes(text), `${type}: ${text}`);
    const reopened = parseNative(serializeNative(converted.doc, config), config);
    assert.deepEqual(terms(reopened), ["Beta", "Gamma"], type);
  }
  let updated = state;
  assert(editDefinition("down")(state, tr => { updated = state.apply(tr); }));
  assert.deepEqual(terms(updated.doc), ["Beta", "Alpha", "Gamma"]);
  assert(editDefinition("add")(updated, tr => { updated = updated.apply(tr); }));
  assert.deepEqual(terms(updated.doc), ["Beta", "Alpha", "Term", "Gamma"]);
  assert.equal(editorKind(updated.selection.$from.parent), "definition_term");
});
