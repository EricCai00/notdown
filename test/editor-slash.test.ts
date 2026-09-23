import assert from "node:assert/strict";
import { editorSchema } from "../src/editor-schema";
import test from "node:test";
import { Schema, type Node as ProseMirrorNode } from "prosemirror-model";
import { schema as basic } from "prosemirror-schema-basic";
import { addListNodes } from "prosemirror-schema-list";
import {
  EditorState,
  TextSelection,
  type Transaction,
  type PluginView,
} from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import {
  cancelSlash,
  consumeSlash,
  createSlashPlugin,
  getSlashState,
  slashPluginKey,
} from "../src/editor-slash.js";

const schema = editorSchema;
const paragraph = (value = "") =>
  schema.nodes.paragraph.create(null, value ? schema.text(value) : undefined);
function harness(doc = schema.nodes.doc.create(null, paragraph()), at = 1) {
  let state = EditorState.create({
    doc,
    selection: TextSelection.create(doc, at),
    plugins: [createSlashPlugin(() => {})],
  });
  const view = {
    get state() {
      return state;
    },
    dispatch(tr: Transaction) {
      state = state.apply(tr);
    },
  };
  return {
    view,
    get state() {
      return state;
    },
    type(text: string) {
      view.dispatch(state.tr.insertText(text));
    },
    select(from: number, to = from) {
      view.dispatch(
        state.tr.setSelection(TextSelection.create(state.doc, from, to)),
      );
    },
    match: () => getSlashState(state),
  };
}

test("the initial slash opens immediately with an empty query; later transactions update it", () => {
  const editor = harness();
  editor.type("/");
  assert.deepEqual(editor.match(), { from: 1, to: 2, query: "" });
  editor.type("heading2");
  assert.deepEqual(editor.match(), { from: 1, to: 10, query: "heading2" });
});

test("the UI callback fires on the first slash, then on query edits, without DOM input hooks", () => {
  const events: unknown[] = [];
  const plugin = createSlashPlugin((value) => events.push(value));
  let state = EditorState.create({ schema, plugins: [plugin] });
  let lifecycle: PluginView | undefined;
  const view = {
    get state() {
      return state;
    },
    composing: false,
    dispatch(tr: Transaction) {
      const previous = state;
      state = state.apply(tr);
      lifecycle?.update?.(view as EditorView, previous);
    },
  };
  lifecycle = plugin.spec.view!(view as EditorView);
  view.dispatch(state.tr.insertText("/"));
  view.dispatch(state.tr.insertText("h2"));
  assert.deepEqual(events, [
    { from: 1, to: 2, query: "" },
    { from: 1, to: 4, query: "h2" },
  ]);
  const handled = plugin.props.handleKeyDown!.call(
    plugin,
    view as EditorView,
    { key: "Escape", isComposing: false } as KeyboardEvent,
  );
  assert.equal(handled, true);
  assert.equal(events.at(-1), null);
  assert.equal(state.doc.textContent, "/h2");
  lifecycle.destroy?.();
});

test("cancel retains literal text and does not reopen the same trigger while typing", () => {
  const editor = harness();
  editor.type("/h");
  cancelSlash(editor.view);
  assert.equal(editor.state.doc.textContent, "/h");
  editor.type("eading");
  assert.equal(editor.match(), null);
  editor.type(" /");
  assert.deepEqual(editor.match(), { from: 10, to: 11, query: "" });
});

test("cancelled anchors map through edits before the query", () => {
  const editor = harness();
  editor.type("/h1");
  cancelSlash(editor.view);
  editor.view.dispatch(editor.state.tr.insertText("prefix ", 1));
  editor.type("2");
  assert.equal(editor.state.doc.textContent, "prefix /h12");
  assert.equal(editor.match(), null);
});

test("deleting a cancelled trigger and typing a new one opens a fresh command", () => {
  const editor = harness();
  editor.type("/");
  cancelSlash(editor.view);
  editor.view.dispatch(editor.state.tr.delete(1, 2));
  editor.type("/");
  assert.deepEqual(editor.match(), { from: 1, to: 2, query: "" });
});

test("ranged selection closes a command and restoring the caret does not reopen it", () => {
  const editor = harness();
  editor.type("/quote");
  editor.select(1, 3);
  assert.equal(editor.match(), null);
  editor.select(7);
  assert.equal(editor.match(), null);
});

test("space ends a command; URL paths and embedded slashes remain literal", () => {
  const editor = harness();
  editor.type("/quote ");
  assert.equal(editor.match(), null);
  editor.type("https://example.com/path");
  assert.equal(editor.match(), null);
  editor.type(" /");
  assert.equal(editor.match()?.query, "");
});

test("consuming a query deletes only its transaction range and preserves surrounding text", () => {
  const editor = harness(
    schema.nodes.doc.create(null, paragraph("left  right")),
    6,
  );
  editor.type("/h2");
  assert.equal(consumeSlash(editor.view), true);
  assert.equal(editor.state.doc.textContent, "left  right");
  assert.equal(editor.state.selection.from, 6);
  assert.equal(editor.match(), null);
  assert.equal(consumeSlash(editor.view), false);
});

test("CJK comma opens and searches Chinese commands but normal punctuation stays literal", () => {
  const editor = harness();
  editor.type("、");
  assert.deepEqual(editor.match(), { from: 1, to: 2, query: "" });
  editor.type("标题");
  assert.deepEqual(editor.match(), { from: 1, to: 4, query: "标题" });
  const sentence = harness();
  sentence.type("文字、文字");
  assert.equal(sentence.match(), null);
});

test("composition holds command actions until the final state transaction", () => {
  const editor = harness();
  editor.view.dispatch(
    editor.state.tr.setMeta(slashPluginKey, {
      type: "composition",
      active: true,
    }),
  );
  editor.type("、");
  editor.type("标题");
  assert.equal(editor.match(), null);
  assert.equal(consumeSlash(editor.view), false);
  editor.view.dispatch(
    editor.state.tr.setMeta(slashPluginKey, {
      type: "composition",
      active: false,
    }),
  );
  assert.deepEqual(editor.match(), { from: 1, to: 4, query: "标题" });
});

test("nested list queries use their own textblock and absolute document positions", () => {
  const doc = schema.nodes.doc.create(null, [
    paragraph("/previous"),
    schema.nodes.bullet_list.create(
      null,
      schema.nodes.bullet_list_item.create(null, [
        paragraph("parent"),
        schema.nodes.bullet_list.create(
          null,
          schema.nodes.bullet_list_item.create(null, paragraph()),
        ),
      ]),
    ),
  ]);
  let at = 1;
  doc.descendants((node: ProseMirrorNode, position: number) => {
    if (node.isTextblock) at = position + 1 + node.content.size;
  });
  const editor = harness(doc, at);
  editor.type("/list");
  assert.deepEqual(editor.match(), { from: at, to: at + 5, query: "list" });
  consumeSlash(editor.view);
  assert.equal(editor.state.doc.firstChild?.textContent, "/previous");
});

test("fenced and inline code never open a slash menu", () => {
  const fenced = harness(
    schema.nodes.doc.create(null, schema.nodes.code_block.create()),
    1,
  );
  fenced.type("/");
  assert.equal(fenced.match(), null);
  const inline = harness();
  inline.view.dispatch(
    inline.state.tr.insertText("/").addMark(1, 2, schema.marks.code.create()),
  );
  assert.equal(inline.match(), null);
});

test("a previous hard-break line cannot leak its slash into the current query", () => {
  const doc = schema.nodes.doc.create(
    null,
    schema.nodes.paragraph.create(null, [
      schema.text("/old"),
      schema.nodes.hard_break.create(),
      schema.text("current"),
    ]),
  );
  const editor = harness(doc, doc.content.size - 1);
  editor.type("text");
  assert.equal(editor.match(), null);
});

test("plus-triggered menu filters without a literal slash and consumes only its query", () => {
  const editor = harness();
  editor.view.dispatch(
    editor.state.tr.setMeta(slashPluginKey, { type: "open", from: 1 }),
  );
  assert.deepEqual(editor.match(), { from: 1, to: 1, query: "" });
  editor.type("heading");
  assert.equal(editor.state.doc.textContent, "heading");
  assert.equal(editor.match()?.query, "heading");
  assert.ok(consumeSlash(editor.view));
  assert.equal(editor.state.doc.textContent, "");
  assert.equal(editor.match(), null);
  editor.type("Ordinary text");
  assert.equal(editor.match(), null);
});

test("dismissing a plus-triggered menu keeps input and does not reopen", () => {
  const editor = harness();
  editor.view.dispatch(
    editor.state.tr.setMeta(slashPluginKey, { type: "open", from: 1 }),
  );
  editor.type("draft");
  cancelSlash(editor.view);
  editor.type(" continues");
  assert.equal(editor.state.doc.textContent, "draft continues");
  assert.equal(editor.match(), null);
});
