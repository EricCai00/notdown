import { editorKind } from "../../src/document/node-identity";
import assert from "node:assert/strict";
import test from "node:test";
import { EditorState, TextSelection, NodeSelection } from "prosemirror-state";
import { history, undoDepth } from "prosemirror-history";
import type { EditorView } from "prosemirror-view";
import type { Node as PMNode } from "prosemirror-model";
import { editorSchema as schema } from "../../src/document/editor-schema";
import {
  parseEditorMarkdown,
  serializeEditorMarkdown,
} from "../../src/document/editor-markdown";
import {
  inlineMarkNavigation,
  moveAcrossInlineMarks,
} from "../../src/editor/inline-mark-navigation";

function harness(source: string | PMNode, pos: number) {
  const plugin = inlineMarkNavigation(schema);
  let state = EditorState.create({
    doc: typeof source === "string" ? parseEditorMarkdown(source) : source,
    plugins: [history(), plugin],
  });
  state = state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, pos)),
  );
  const view = {
    get state() {
      return state;
    },
    editable: true,
    composing: false,
    dispatch(tr: Parameters<EditorView["dispatch"]>[0]) {
      state = state.applyTransaction(tr).state;
    },
  } as unknown as EditorView;
  return {
    get state() {
      return state;
    },
    view,
    move: (direction: -1 | 1) =>
      moveAcrossInlineMarks(direction)(state, view.dispatch),
    key: (event: Partial<KeyboardEvent>) =>
      plugin.props.handleKeyDown!.call(plugin, view, event as KeyboardEvent),
    input: (text: string) => {
      const { from, to } = state.selection;
      const defaultTransaction = () => state.tr.insertText(text, from, to);
      if (!plugin.props.handleTextInput!.call(plugin, view, from, to, text, defaultTransaction)) {
        view.dispatch(defaultTransaction());
      }
    },
  };
}

for (const tail of ["bbb", "", "\n\nNext"]) {
  test(`right arrow exits code without changing content, position or history (${JSON.stringify(tail)})`, () => {
    const editor = harness("aaa`code`" + tail, 8);
    const before = editor.state.doc;
    assert.equal(editor.move(1), true);
    assert.equal(editor.state.selection.from, 8);
    assert.equal(editor.state.doc, before);
    assert.equal(undoDepth(editor.state), 0);
    assert.equal(
      editor.move(1),
      false,
      "next arrow belongs to native navigation",
    );
    editor.view.dispatch(editor.state.tr.insertText("z"));
    assert.equal(
      serializeEditorMarkdown(editor.state.doc),
      "aaa`code`z" + tail,
    );
  });
}

test("left reenters at the same position and code input extends the run", () => {
  const editor = harness("aaa`code`bbb", 8);
  editor.move(1);
  assert.equal(editor.move(-1), true);
  assert.equal(editor.state.selection.from, 8);
  editor.view.dispatch(editor.state.tr.insertText("z"));
  assert.equal(serializeEditorMarkdown(editor.state.doc), "aaa`codez`bbb");
});

test("left boundary supports entering and exiting, including a one-character run", () => {
  const editor = harness("a`x`b", 2);
  assert.equal(editor.move(1), true);
  assert.equal(editor.move(-1), true);
  editor.view.dispatch(editor.state.tr.insertText("z"));
  assert.equal(serializeEditorMarkdown(editor.state.doc), "az`x`b");
});

test("native arrow arrival at the start preserves the inside state", () => {
  const editor = harness("a`xy`b", 3);
  assert.equal(editor.key({ key: "ArrowLeft" }), false);
  editor.view.dispatch(
    editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 2)),
  );
  assert.ok(schema.marks.code.isInSet(editor.state.storedMarks!));
  assert.equal(editor.move(-1), true);
  editor.view.dispatch(editor.state.tr.insertText("z"));
  assert.equal(serializeEditorMarkdown(editor.state.doc), "az`xy`b");
});

test("modified arrows, composition, selections and read-only views pass through", () => {
  const editor = harness("a`code`b", 6);
  for (const flag of [
    "ctrlKey",
    "metaKey",
    "altKey",
    "shiftKey",
    "isComposing",
  ]) {
    assert.equal(editor.key({ key: "ArrowRight", [flag]: true }), false);
  }
  Object.defineProperty(editor.view, "composing", {
    value: true,
    configurable: true,
  });
  assert.equal(editor.key({ key: "ArrowRight" }), false);
  Object.defineProperty(editor.view, "composing", { value: false });
  Object.defineProperty(editor.view, "editable", { value: false });
  assert.equal(editor.key({ key: "ArrowRight" }), false);
  editor.view.dispatch(
    editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 2, 6)),
  );
  assert.equal(editor.move(1), false);
  editor.view.dispatch(
    editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 0)),
  );
  assert.equal(editor.move(1), false);
});

test("exiting code preserves marks that continue past its boundary", () => {
  const code = schema.marks.code.create();
  const strong = schema.marks.strong.create();
  const doc = schema.nodes["doc"].create(null, schema.nodes["block.paragraph"].create(null, [
      schema.text("a", [code]),
      schema.text("b", [code, strong]),
      schema.text("c", [strong]),
    ]));
  let state = EditorState.create({ doc });
  state = state.apply(state.tr.setSelection(TextSelection.create(doc, 2)));
  moveAcrossInlineMarks(1)(state, (tr) => {
    state = state.apply(tr);
  });
  assert.deepEqual(
    state.storedMarks?.map((mark) => editorKind(mark)),
    ["strong", "code"],
  );
  state = state.apply(state.tr.setSelection(TextSelection.create(doc, 3)));
  moveAcrossInlineMarks(1)(state, (tr) => {
    state = state.apply(tr);
  });
  assert.deepEqual(
    state.storedMarks?.map((mark) => editorKind(mark)),
    ["strong"],
  );
});

for (const type of Object.values(schema.marks)) {
  test(`${type.name}: both edges support explicit inside/outside input without altering existing content`, () => {
    const mark = type.create(
      type.name === "link" ? { href: "https://example.com" } : undefined,
    );
    const doc = schema.nodes["doc"].create(null, schema.nodes["block.paragraph"].create(null, [
        schema.text("a"),
        schema.text("xy", [mark]),
        schema.text("b"),
      ]));
    for (const [pos, direction] of [
      [2, -1],
      [4, 1],
    ] as const) {
      const editor = harness(doc, pos);
      editor.view.dispatch(editor.state.tr.setStoredMarks([mark]));
      assert.equal(editor.move(direction), true);
      assert.equal(editor.state.doc, doc);
      assert.equal(editor.state.selection.from, pos);
      assert.equal(undoDepth(editor.state), 0);
      assert.deepEqual(editor.state.storedMarks, []);
      assert.equal(editor.move(-direction as -1 | 1), true);
      assert.ok(mark.isInSet(editor.state.storedMarks!));
      editor.move(direction);
      editor.view.dispatch(editor.state.tr.insertText("z"));
      assert.equal(editor.state.doc.nodeAt(pos)!.marks.length, 0);
    }
  });
}

test("nested colors exit independently; co-ending styles exit together", () => {
  const strong = schema.marks.strong.create();
  const color = schema.marks.color.create({ color: "red" });
  const doc = schema.nodes["doc"].create(null, schema.nodes["block.paragraph"].create(null, [
      schema.text("a", [strong]),
      schema.text("b", [strong, color]),
      schema.text("c", [strong]),
    ]));
  const editor = harness(doc, 3);
  editor.move(1);
  assert.deepEqual(editor.state.storedMarks, [strong]);
  editor.view.dispatch(
    editor.state.tr
      .setSelection(TextSelection.create(doc, 2))
      .setStoredMarks([strong, color]),
  );
  editor.move(-1);
  assert.deepEqual(editor.state.storedMarks, [strong]);
  const combined = harness(
    schema.nodes["doc"].create(null, schema.nodes["block.paragraph"].create(null, schema.text("xy", [strong, color]))),
    3,
  );
  combined.move(1);
  assert.deepEqual(combined.state.storedMarks, []);
});

test("adjacent colors have a neutral slot and retain exact attributes on reentry", () => {
  const red = schema.marks.color.create({
    color: "red",
    nfmAttrs: { future: "keep" },
  });
  const blue = schema.marks.color.create({ color: "blue" });
  const doc = schema.nodes["doc"].create(null, schema.nodes["block.paragraph"].create(null, [
      schema.text("a", [red]),
      schema.text("b", [blue]),
    ]));
  const editor = harness(doc, 2);
  editor.move(1);
  assert.deepEqual(editor.state.storedMarks, []);
  editor.move(1);
  assert.deepEqual(editor.state.storedMarks, [blue]);
  editor.move(-1);
  assert.deepEqual(editor.state.storedMarks, []);
  editor.move(-1);
  assert.deepEqual(editor.state.storedMarks, [red]);
  assert.equal(editor.state.doc, doc);
});

test("native arrival inside a noninclusive link retains link input until exiting", () => {
  const editor = harness("a[xy](https://example.com)b", 3);
  editor.key({ key: "ArrowRight" });
  editor.view.dispatch(
    editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 4)),
  );
  assert.ok(schema.marks.link.isInSet(editor.state.storedMarks!));
  editor.input("X");
  editor.input("Y");
  assert.ok(schema.marks.link.isInSet(editor.state.storedMarks!));
  editor.move(1);
  editor.view.dispatch(editor.state.tr.insertText("z"));
  assert.equal(
    serializeEditorMarkdown(editor.state.doc),
    "a[xyXY](https://example.com)zb",
  );
});
