import assert from "node:assert/strict";
import test from "node:test";
import { Schema, type Node as PMNode } from "prosemirror-model";
import { EditorState, TextSelection, type Command } from "prosemirror-state";
import { history, undo } from "prosemirror-history";
import { editorSchema } from "../src/editor-schema.js";
import {
  editorFingerprint,
  parseEditorMarkdown,
  serializeEditorMarkdown,
} from "../src/editor-markdown.js";
import {
  blockAtPos,
  deleteEditorBlock,
  duplicateEditorBlock,
  indentEditorBlock,
  moveEditorBlock,
  outdentEditorBlock,
} from "../src/editor-blocks.js";

// No DOM is needed to exercise exactly the nested schema used by the editor.
const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { content: "inline*", group: "block" },
    heading: {
      content: "inline*",
      group: "block",
      attrs: { level: { default: 2 } },
    },
    text: { group: "inline" },
    bullet_list: { content: "list_item+", group: "block" },
    ordered_list: {
      content: "list_item+",
      group: "block",
      attrs: { order: { default: 1 } },
    },
    list_item: {
      content: "paragraph block*",
      attrs: { checked: { default: null } },
    },
    opaque_block: {
      group: "block",
      atom: true,
      attrs: { source: { default: "" } },
    },
  },
  marks: { strong: {} },
});
const p = (text = "", strong = false) =>
  schema.node(
    "paragraph",
    null,
    text
      ? schema.text(text, strong ? [schema.marks.strong.create()] : [])
      : undefined,
  );
const li = (
  text: string,
  children: PMNode[] = [],
  checked: boolean | null = null,
) => schema.node("list_item", { checked }, [p(text), ...children]);
const ul = (...children: PMNode[]) =>
  schema.node("bullet_list", null, children);
const ol = (order: number, ...children: PMNode[]) =>
  schema.node("ordered_list", { order }, children);
const doc = (...children: PMNode[]) => schema.node("doc", null, children);

function pos(document: PMNode, label: string) {
  let result = -1;
  document.descendants((node, position) => {
    if (node.isText && node.text === label && result < 0) result = position;
  });
  assert.ok(result >= 0, `Missing text ${label}`);
  return result;
}

function stateFor(document: PMNode, label?: string) {
  return EditorState.create({
    schema,
    doc: document,
    plugins: [history()],
    ...(label
      ? { selection: TextSelection.create(document, pos(document, label)) }
      : {}),
  });
}

function run(command: Command, state: EditorState) {
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

function moved(
  document: PMNode,
  source: string,
  target: string,
  placement: "before" | "after" | "inside",
) {
  const state = stateFor(document);
  const transaction = moveEditorBlock(
    state,
    pos(document, source),
    pos(document, target),
    placement,
  );
  assert.ok(transaction, `${source} ${placement} ${target}`);
  const result = state.apply(transaction);
  result.doc.check();
  return result;
}

test("each consecutive list row and each nested child resolves to its own block", () => {
  const document = doc(
    ul(li("Parent", [ul(li("Child"))]), li("Sibling")),
    p("Tail"),
  );
  const parent = blockAtPos(document, pos(document, "Parent"))!;
  const child = blockAtPos(document, pos(document, "Child"))!;
  const sibling = blockAtPos(document, pos(document, "Sibling"))!;
  assert.equal(parent.node.firstChild?.textContent, "Parent");
  assert.equal(child.node.firstChild?.textContent, "Child");
  assert.equal(sibling.node.firstChild?.textContent, "Sibling");
  assert.notEqual(parent.pos, child.pos);
  assert.ok(child.end < parent.end);
  assert.equal(blockAtPos(document, child.pos)?.pos, child.pos);
  assert.equal(blockAtPos(document, 0)?.pos, parent.pos);
  assert.equal(
    blockAtPos(document, pos(document, "Tail"))?.node.type.name,
    "paragraph",
  );
});

test("dragging a parent moves its complete nested subtree and checkbox state", () => {
  const parent = li(
    "Parent",
    [ul(li("Child", [], false), li("Second child", [], true))],
    true,
  );
  const document = doc(ul(parent, li("Sibling"), li("Last")));
  const result = moved(document, "Parent", "Last", "after");
  assert.ok(result.doc.eq(doc(ul(li("Sibling"), li("Last"), parent))));
  assert.ok(run(undo, result).doc.eq(document));
});

test("a nested item moves alone between lists and removes its empty old list", () => {
  const child = schema.node("list_item", { checked: true }, [
    p("Child", true),
    schema.node("opaque_block", { source: ":::unknown\n[[literal]]\n:::" }),
  ]);
  const document = doc(
    ul(li("Parent", [ul(child)])),
    p("Separator"),
    ul(li("Target")),
  );
  const result = moved(document, "Child", "Target", "before");
  assert.ok(
    result.doc.eq(
      doc(ul(li("Parent")), p("Separator"), ul(child, li("Target"))),
    ),
  );
  assert.equal(
    result.doc.lastChild?.firstChild?.firstChild?.firstChild?.marks[0].type
      .name,
    "strong",
  );
});

test("a child can be dragged before its parent without leaving an empty nested bullet", () => {
  const child = li("Child", [ul(li("Grandchild"))]);
  const result = moved(
    doc(ul(li("Parent", [ul(child)]), li("Tail"))),
    "Child",
    "Parent",
    "before",
  );
  assert.ok(result.doc.eq(doc(ul(child, li("Parent"), li("Tail")))));
});

test("dragging into a descendant or onto itself is rejected without changing the document", () => {
  const document = doc(ul(li("Parent", [ul(li("Child"))]), li("Tail")));
  const state = stateFor(document);
  for (const placement of ["before", "after", "inside"] as const) {
    assert.equal(
      moveEditorBlock(
        state,
        pos(document, "Parent"),
        pos(document, "Child"),
        placement,
      ),
      null,
    );
    assert.equal(
      moveEditorBlock(
        state,
        pos(document, "Parent"),
        pos(document, "Parent"),
        placement,
      ),
      null,
    );
  }
  assert.ok(state.doc.eq(document));
});

test("inside nests one item with its descendants beneath the target row", () => {
  const movedItem = li("Moving", [ul(li("Grandchild"))], false);
  const result = moved(
    doc(ul(li("Parent", [ul(li("Existing"))]), movedItem)),
    "Moving",
    "Parent",
    "inside",
  );
  assert.ok(
    result.doc.eq(doc(ul(li("Parent", [ul(li("Existing"), movedItem)])))),
  );
});

test("moving a child beside a normal paragraph preserves a list wrapper", () => {
  const document = doc(
    ul(li("Parent", [ul(li("Child", [], true))])),
    p("Tail"),
  );
  const result = moved(document, "Child", "Tail", "after");
  assert.ok(
    result.doc.eq(doc(ul(li("Parent")), p("Tail"), ul(li("Child", [], true)))),
  );
});

test("moving the only list row elsewhere removes the old list rather than inventing content", () => {
  const document = doc(ul(li("Only")), p("Middle"), p("Tail"));
  const result = moved(document, "Only", "Tail", "after");
  assert.ok(result.doc.eq(doc(p("Middle"), p("Tail"), ul(li("Only")))));
});

test("a normal block dragged between rows splits a list and retains its block type", () => {
  const heading = schema.node("heading", { level: 2 }, schema.text("Heading"));
  const document = doc(heading, ol(5, li("First"), li("Second"), li("Third")));
  const result = moved(document, "Heading", "Second", "before");
  assert.ok(
    result.doc.eq(
      doc(ol(5, li("First")), heading, ol(6, li("Second"), li("Third"))),
    ),
  );
});

test("a normal paragraph may be a child of a list row without becoming another bullet", () => {
  const result = moved(
    doc(p("Details"), ul(li("Parent"))),
    "Details",
    "Parent",
    "inside",
  );
  assert.ok(result.doc.eq(doc(ul(li("Parent", [p("Details")])))));
  assert.equal(
    blockAtPos(result.doc, pos(result.doc, "Details"))?.node.type.name,
    "paragraph",
  );
  const childMoved = moved(result.doc, "Details", "Parent", "after");
  assert.ok(childMoved.doc.eq(doc(ul(li("Parent")), p("Details"))));
});

test("deleting a nested row removes its subtree and leaves sibling rows intact", () => {
  const document = doc(
    ul(li("Parent", [ul(li("Delete", [ul(li("Nested"))]), li("Keep"))])),
  );
  const state = stateFor(document);
  const tr = deleteEditorBlock(state, pos(document, "Delete"));
  assert.ok(tr);
  const result = state.apply(tr);
  result.doc.check();
  assert.ok(result.doc.eq(doc(ul(li("Parent", [ul(li("Keep"))])))));
  assert.ok(run(undo, result).doc.eq(document));
});

test("deleting the last row produces one editable empty paragraph", () => {
  const document = doc(ul(li("Only")));
  const state = stateFor(document);
  const tr = deleteEditorBlock(state, pos(document, "Only"));
  assert.ok(tr);
  assert.ok(state.apply(tr).doc.eq(doc(p())));
});

test("duplicating a parent duplicates descendants and can be undone atomically", () => {
  const item = li("Parent", [ul(li("Child", [], true))], false);
  const document = doc(ul(item, li("Tail")));
  const state = stateFor(document);
  const tr = duplicateEditorBlock(state, pos(document, "Parent"));
  assert.ok(tr);
  const result = state.apply(tr);
  assert.ok(result.doc.eq(doc(ul(item, item, li("Tail")))));
  assert.ok(run(undo, result).doc.eq(document));
});

test("Tab nests the selected item and all descendants into the previous sibling", () => {
  const item = li("Moving", [ul(li("Child"))], true);
  const document = doc(
    ul(li("Parent", [ul(li("Existing"))]), item, li("Tail")),
  );
  const result = run(indentEditorBlock, stateFor(document, "Moving"));
  assert.ok(
    result.doc.eq(
      doc(ul(li("Parent", [ul(li("Existing"), item)]), li("Tail"))),
    ),
  );
  assert.ok(run(undo, result).doc.eq(document));
});

test("Shift Tab follows the list tree model, bringing following siblings under the lifted row", () => {
  const document = doc(
    ul(
      li("Parent", [
        ul(li("Before"), li("Lift", [ul(li("Child"))], true), li("Following")),
      ]),
      li("Tail"),
    ),
  );
  const result = run(outdentEditorBlock, stateFor(document, "Lift"));
  assert.ok(
    result.doc.eq(
      doc(
        ul(
          li("Parent", [ul(li("Before"))]),
          li("Lift", [ul(li("Child"), li("Following"))], true),
          li("Tail"),
        ),
      ),
    ),
  );
  assert.ok(run(undo, result).doc.eq(document));
});

test("Tab on the first item is a no-op; Shift Tab at top level returns a paragraph", () => {
  const document = doc(ul(li("First"), li("Second")));
  const state = stateFor(document, "First");
  assert.equal(indentEditorBlock(state), false);
  const result = run(outdentEditorBlock, state);
  assert.ok(result.doc.eq(doc(p("First"), ul(li("Second")))));
});

test("all supported nested drag destinations retain every row exactly once", () => {
  const document = doc(
    p("Intro"),
    ul(
      li(
        "Parent",
        [ul(li("Child", [ul(li("Grandchild", [], true))]), li("Sibling"))],
        false,
      ),
      li("Next", [p("Details")]),
    ),
    p("Divider"),
    ol(3, li("Numbered"), li("Numbered next")),
    p("Tail"),
  );
  const labels: string[] = [];
  document.descendants((node) => {
    if (node.isText) labels.push(node.text!);
  });
  const originalText = [...labels].sort();
  let checked = 0;
  for (const source of labels) {
    for (const target of labels) {
      for (const placement of ["before", "after", "inside"] as const) {
        const state = stateFor(document);
        const tr = moveEditorBlock(
          state,
          pos(document, source),
          pos(document, target),
          placement,
        );
        if (!tr) continue;
        const result = state.apply(tr);
        result.doc.check();
        const after: string[] = [];
        result.doc.descendants((node) => {
          if (node.isText) after.push(node.text!);
        });
        assert.deepEqual(
          after.sort(),
          originalText,
          `${source} ${placement} ${target}`,
        );
        assert.ok(
          run(undo, result).doc.eq(document),
          `${source} ${placement} ${target} undo`,
        );
        checked++;
      }
    }
  }
  assert.ok(checked > 100);
});

test("nested drag and Tab transactions roundtrip through real Markdown, while undo restores exact source", () => {
  const source =
    '[ref]: https://example.com/ "Reference"\r\n\r\n' +
    "# Notes\r\n\r\n- [ ] Parent\r\n  - [X] Child\r\n  - Sibling\r\n- [x] Next\r\n\r\n" +
    "See [[target|Page name]] and [reference][ref].\r\n\r\n```md\r\n[[literal]]\r\n```\r\n";
  const document = parseEditorMarkdown(source);
  const initial = EditorState.create({
    schema: editorSchema,
    doc: document,
    plugins: [history()],
    selection: TextSelection.create(document, pos(document, "Next")),
  });
  const drag = moveEditorBlock(
    initial,
    pos(document, "Child"),
    pos(document, "Next"),
    "inside",
  );
  assert.ok(drag);
  for (const result of [initial.apply(drag), run(indentEditorBlock, initial)]) {
    const markdown = serializeEditorMarkdown(result.doc);
    const reparsed = parseEditorMarkdown(markdown);
    reparsed.check();
    assert.equal(
      editorFingerprint(reparsed),
      editorFingerprint(result.doc),
      markdown,
    );
    assert.match(markdown, /\[ref\]: https:\/\/example\.com\//);
    assert.match(markdown, /\[\[target\|Page name\]\]/);
    assert.match(markdown, /```md\r\n\[\[literal\]\]\r\n```/);
    assert.equal(serializeEditorMarkdown(run(undo, result).doc), source);
  }
});
