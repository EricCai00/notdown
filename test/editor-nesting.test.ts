import test from "node:test";
import assert from "node:assert/strict";
import { EditorState, TextSelection, type Command } from "prosemirror-state";
import { history, undo } from "prosemirror-history";
import { editorSchema as schema } from "../src/editor-schema.js";
import {
  parseEditorMarkdown,
  serializeEditorMarkdown,
  editorFingerprint,
} from "../src/editor-markdown.js";
import {
  indentEditorBlock,
  outdentEditorBlock,
  backspaceEditorBlock,
  exitEmptyList,
  blockAtPos,
  moveEditorBlock,
  deleteEditorBlock,
} from "../src/editor-blocks.js";
import { renderMarkdown, extractLinks } from "../src/markdown.js";

function stateFor(source: string) {
  return EditorState.create({
    schema,
    doc: parseEditorMarkdown(source),
    plugins: [history()],
  });
}
function select(state: EditorState, text: string, offset = 0) {
  let pos = -1;
  state.doc.descendants((node, at) => {
    if (node.isTextblock && node.textContent === text) pos = at + 1 + offset;
  });
  assert.notEqual(pos, -1, `Missing row ${text}`);
  return state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, pos)),
  );
}
function run(state: EditorState, command: Command) {
  let next = state;
  assert.equal(
    command(state, (tr) => {
      next = state.apply(tr);
    }),
    true,
  );
  next.doc.check();
  return next;
}
function roundtrip(state: EditorState) {
  assert.equal(
    editorFingerprint(parseEditorMarkdown(serializeEditorMarkdown(state.doc))),
    editorFingerprint(state.doc),
  );
}

test("text Tab creates real parent/child nodes; repeat and Shift Tab retain caret and Markdown", () => {
  let state = select(
    stateFor("Parent\n\nChild\n\nGrandchild\n\nTail"),
    "Child",
    3,
  );
  state = run(state, indentEditorBlock);
  assert.equal(state.doc.firstChild?.type.name, "nested_block");
  assert.equal(state.selection.$from.parentOffset, 3);
  roundtrip(state);
  state = run(select(state, "Grandchild"), indentEditorBlock);
  state = run(state, indentEditorBlock);
  assert.equal(state.doc.firstChild?.child(1).type.name, "nested_block");
  roundtrip(state);
  state = run(state, outdentEditorBlock);
  assert.equal(state.doc.firstChild?.childCount, 3);
  state = run(state, outdentEditorBlock);
  assert.equal(state.doc.child(1).textContent, "Grandchild");
  roundtrip(state);
});

test("parent text drag moves subtree; child drag, delete and undo preserve siblings", () => {
  let state = run(
    select(stateFor("Parent\n\nChild\n\nTail"), "Child"),
    indentEditorBlock,
  );
  const parent = blockAtPos(state.doc, 2)!;
  const tail = blockAtPos(state.doc, select(state, "Tail").selection.from)!;
  const tr = moveEditorBlock(state, parent.pos, tail.pos, "after")!;
  assert.ok(tr);
  state = state.apply(tr);
  assert.equal(state.doc.firstChild?.textContent, "Tail");
  assert.equal(state.doc.lastChild?.textContent, "ParentChild");
  roundtrip(state);
  const child = blockAtPos(state.doc, select(state, "Child").selection.from)!;
  state = state.apply(deleteEditorBlock(state, child.pos)!);
  assert.equal(state.doc.lastChild?.type.name, "paragraph");
  assert.equal(state.doc.lastChild?.textContent, "Parent");
  state = run(state, undo);
  assert.ok(state.doc.textContent.includes("Child"));
});

test("list Backspace removes marker first without merging or discarding descendants", () => {
  let state = select(
    stateFor("- First\n- Second\n  - Nested\n- Last"),
    "Second",
  );
  state = run(state, backspaceEditorBlock);
  assert.equal(state.doc.child(1).type.name, "nested_block");
  assert.equal(state.doc.child(1).firstChild?.textContent, "Second");
  assert.ok(state.doc.textContent.includes("Nested"));
  roundtrip(state);
});

test("ending list then Backspace returns directly to the previous item, with no phantom bullet", () => {
  for (const source of [
    "- First\n- ",
    "1. First\n2. ",
    "- [ ] First\n- [ ] ",
  ]) {
    let state = select(stateFor(source), "");
    state = run(state, exitEmptyList);
    assert.equal(state.doc.lastChild?.type.name, "paragraph");
    state = run(state, backspaceEditorBlock);
    assert.equal(state.doc.childCount, 1);
    assert.equal(state.doc.firstChild?.childCount, 1);
    assert.equal(state.selection.$from.parent.textContent, "First");
    assert.equal(state.selection.$from.parentOffset, 5);
  }
});

test("plain text after list joins its last row in one Backspace; nested text outdents first", () => {
  let state = run(
    select(stateFor("- List\n\nText"), "Text"),
    backspaceEditorBlock,
  );
  assert.equal(state.doc.textContent, "ListText");
  assert.equal(state.selection.$from.parentOffset, 4);
  state = run(select(stateFor("Parent\n\nChild"), "Child"), indentEditorBlock);
  state = run(select(state, "Child"), backspaceEditorBlock);
  assert.equal(state.doc.childCount, 2);
  assert.equal(state.doc.textContent, "ParentChild");
});

test("nest syntax preserves fences, links, source bytes, list children and malformed input", () => {
  const source =
    ":::nest\r\nParent [[target]]\r\n\r\nChild\r\n\r\n```md\r\n:::endnest\r\n```\r\n:::endnest\r\n";
  const state = stateFor(source);
  assert.equal(state.doc.firstChild?.type.name, "nested_block");
  assert.equal(serializeEditorMarkdown(state.doc), source);
  assert.deepEqual(extractLinks(source), ["target"]);
  assert.match(renderMarkdown(source), /pm-nested-block/);
  const changed = run(select(state, "Child"), outdentEditorBlock);
  roundtrip(changed);
  for (const raw of [
    ":::nest\nNo end",
    "```md\n:::nest\nParent\n:::endnest\n```",
    ":::nest\n- Invalid parent\n:::endnest",
  ])
    assert.equal(serializeEditorMarkdown(stateFor(raw).doc), raw);
});

test("empty text parents and children roundtrip without becoming the same row", () => {
  for (const content of [
    [
      schema.nodes.paragraph.create(),
      schema.nodes.paragraph.create(null, schema.text("Child")),
    ],
    [
      schema.nodes.paragraph.create(null, schema.text("Parent")),
      schema.nodes.paragraph.create(),
    ],
  ]) {
    const state = EditorState.create({
      schema,
      doc: schema.nodes.doc.create(
        null,
        schema.nodes.nested_block.create(null, content),
      ),
    });
    roundtrip(state);
  }
});

test("literal nesting delimiters typed as prose remain text after saving", () => {
  const p = (text: string) =>
    schema.nodes.paragraph.create(null, schema.text(text));
  const state = EditorState.create({
    schema,
    doc: schema.nodes.doc.create(
      null,
      schema.nodes.nested_block.create(null, [p("Parent"), p(":::endnest")]),
    ),
  });
  roundtrip(state);
});

test("empty nested list Enter lifts one level and retains the bullet", () => {
  let state = run(
    select(stateFor("- Parent\n  - Child\n  - "), ""),
    exitEmptyList,
  );
  assert.equal(state.doc.firstChild?.childCount, 2);
  assert.equal(state.doc.firstChild?.lastChild?.type.name, "list_item");
  state = run(state, exitEmptyList);
  assert.equal(state.doc.lastChild?.type.name, "paragraph");
});

test("text outdent brings later siblings underneath the lifted block", () => {
  const source = ":::nest\nParent\n:::children\nChild\n\nFollowing\n:::endnest";
  const state = run(select(stateFor(source), "Child"), outdentEditorBlock);
  assert.equal(state.doc.firstChild?.textContent, "Parent");
  assert.equal(state.doc.lastChild?.type.name, "nested_block");
  assert.equal(state.doc.lastChild?.firstChild?.textContent, "Child");
  assert.equal(state.doc.lastChild?.lastChild?.textContent, "Following");
  roundtrip(state);
});
