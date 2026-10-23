import assert from "node:assert/strict";
import test from "node:test";
import { EditorState, TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { history, undo } from "prosemirror-history";
import { editorSchema as schema } from "../../src/document/editor-schema";
import { createEditorNode } from "../../src/document/node-identity";
import { toggleHeadingEnter } from "../../src/editor/toggle-heading";
import { outdentEditorBlock } from "../../src/editor/editor-blocks";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec";
import { editorFingerprint } from "../../src/document/editor-markdown";

const p = (text = "") => schema.nodes["block.paragraph"].create(null, text ? schema.text(text) : undefined);
const title = createEditorNode(schema, "heading", { level: 2, toggle: true, nfmAttrs: { custom: "keep" } }, [
  schema.text("Head"), schema.text("tail", [schema.marks.strong.create()]),
]);

for (const expanded of [true, false]) test(`Enter in an ${expanded ? "expanded" : "collapsed"} title preserves marks, children and undo`, () => {
  const group = schema.nodes["structure.nested_block"].create(null, [title, p("Child")]);
  const doc = schema.nodes.doc.create(null, [group, p("Tail")]);
  const state = EditorState.create({ doc, plugins: [history()], selection: TextSelection.create(doc, 6) });
  const view = { nodeDOM: () => ({ classList: { contains: () => !expanded } }) } as unknown as EditorView;
  let next = state;
  assert.equal(toggleHeadingEnter(state, tr => { next = state.apply(tr); }, view), true);
  next.doc.check();
  const toggle = next.doc.firstChild!;
  assert.equal(toggle.firstChild!.textContent, "Head");
  assert.equal(toggle.firstChild!.type.name, "block.toggle_heading");
  assert.deepEqual(toggle.firstChild!.attrs.nfmAttrs, { custom: "keep" });
  const paragraph = expanded ? toggle.child(1) : next.doc.child(1);
  assert.equal(paragraph.type.name, "block.paragraph");
  assert.equal(paragraph.textContent, "tail");
  assert.equal(paragraph.firstChild!.marks[0].type.name, "strong");
  assert.equal(toggle.lastChild!.textContent, "Child");
  assert.equal(next.selection.$from.parent, paragraph);
  assert.equal(undo(next, tr => { next = next.apply(tr); }), true);
  assert.ok(next.doc.eq(doc));
});

test("Enter reuses an existing empty child, while a title-start Enter keeps the subtree together", () => {
  const group = schema.nodes["structure.nested_block"].create(null, [title, p()]);
  const doc = schema.nodes.doc.create(null, group);
  let state = EditorState.create({ doc, selection: TextSelection.create(doc, title.nodeSize) });
  assert.equal(toggleHeadingEnter(state, tr => { state = state.apply(tr); }), true);
  assert.ok(state.doc.eq(doc));
  assert.equal(state.selection.$from.parent.type.name, "block.paragraph");
  state = EditorState.create({ doc, selection: TextSelection.create(doc, 2) });
  assert.equal(toggleHeadingEnter(state, tr => { state = state.apply(tr); }), true);
  assert.equal(state.doc.firstChild!.type.name, "block.paragraph");
  assert.ok(state.doc.child(1).eq(group));
  assert.ok(state.selection.$from.parent.eq(title));
});

for (const variant of ["notdown", "notion-markdown"] as const) test(`${variant}: outdented content saves at its new depth and undo restores exact source`, () => {
  const config = { version: 1 as const, variant, extensions: {} };
  const code = '```ts\r\nconst text = "\\t";\r\n```';
  const source = '## Heading {toggle="true"}\r\n\tChild\r\n\r\n' + code + '\r\n\r\nTail';
  const doc = parseNative(source, config);
  let position = 0;
  doc.descendants((node, pos) => { if (node.isText && node.text === "Child") position = pos; });
  const state = EditorState.create({ doc, plugins: [history()], selection: TextSelection.create(doc, position) });
  let next = state;
  assert.equal(outdentEditorBlock(state, tr => { next = state.apply(tr); }), true);
  const output = serializeNative(next.doc, config);
  assert.match(output, /\r\n\r\nChild\r\n/);
  assert.ok(output.includes(code));
  assert.equal(editorFingerprint(parseNative(output, config)), editorFingerprint(next.doc));
  assert.equal(undo(next, tr => { next = next.apply(tr); }), true);
  assert.equal(serializeNative(next.doc, config), source);
});
