import { parseNative } from "../../src/markdown-engine/codec";
import assert from "node:assert/strict";
import test from "node:test";
import { EditorState, NodeSelection, TextSelection } from "prosemirror-state";
import { type Node as PMNode } from "prosemirror-model";
import { editorSchema as s } from "../../src/document/editor-schema";
import {
  convertListItem,
  convertTextblockToCode,
  type ListItemConversion,
} from "../../src/editor/editor-convert";
import {
  parseEditorMarkdown,
  serializeEditorMarkdown,
} from "../../src/document/editor-markdown";

const p = (text: string) =>
  s.nodes.paragraph.create(null, text ? s.text(text) : undefined);
const li = (
  text: string,
  children: PMNode[] = [],
  checked: boolean | null = null,
) => s.nodes[checked === null ? "bullet_list_item" : "task_list_item"].create({ checked }, [p(text), ...children]);
const ul = (...items: PMNode[]) => s.nodes.bullet_list.create(null, items);
const ol = (order: number, ...items: PMNode[]) =>
  s.nodes.ordered_list.create({ order }, items.map(item => item.attrs.checked === null ? s.nodes.numbered_list_item.create(item.attrs, item.content) : item));

function textPosition(doc: PMNode, text: string, offset = 0): number {
  let result = -1;
  doc.descendants((node, pos) => {
    if (node.isText && node.text === text) result = pos + offset;
  });
  assert.notEqual(result, -1, `Missing text: ${text}`);
  return result;
}

function convert(
  doc: PMNode,
  text: string,
  type: ListItemConversion,
  offset = 0,
) {
  const state = EditorState.create({
    doc,
    selection: TextSelection.create(doc, textPosition(doc, text, offset)),
  });
  const tr = convertListItem(state, type);
  assert.ok(tr, `Expected conversion to ${type}`);
  tr.doc.check();
  assert.ok(
    tr.steps.length <= 1,
    "Conversion is one atomic document replacement",
  );
  return state.apply(tr);
}

test("numbering one bullet item preserves siblings and nested children", () => {
  const nested = ul(li("nested"));
  const first = li("first", [], true);
  const last = li("last", [], false);
  const doc = s.nodes.doc.create(null, ul(first, li("middle", [nested]), last));
  const result = convert(doc, "middle", "number", 3);
  assert.equal(result.doc.childCount, 3);
  assert.ok(result.doc.child(0).firstChild!.eq(first));
  assert.equal(result.doc.child(1).type.name, "ordered_list");
  assert.equal(result.doc.child(1).attrs.order, 1);
  assert.ok(result.doc.child(1).firstChild!.child(1).eq(nested));
  assert.ok(result.doc.child(2).firstChild!.eq(last));
  assert.equal(result.selection.$from.parentOffset, 3);
});

test("splitting an ordered list retains the following original number", () => {
  const doc = s.nodes.doc.create(
    null,
    ol(3, li("first"), li("middle"), li("last")),
  );
  const result = convert(doc, "middle", "list");
  assert.equal(result.doc.child(0).attrs.order, 3);
  assert.equal(result.doc.child(1).type.name, "bullet_list");
  assert.equal(result.doc.child(2).attrs.order, 5);
  assert.equal(
    serializeEditorMarkdown(result.doc).trim(),
    "3. first\n\n- middle\n\n5. last",
  );
});

test("task conversion changes only the current checkbox and keeps a compatible list", () => {
  const doc = s.nodes.doc.create(
    null,
    ul(li("first", [], true), li("middle"), li("last", [], false)),
  );
  const result = convert(doc, "middle", "task");
  assert.equal(result.doc.childCount, 1);
  assert.deepEqual(
    Array.from(
      { length: 3 },
      (_, i) => result.doc.firstChild!.child(i).attrs.checked,
    ),
    [true, false, false],
  );
  const plain = convert(result.doc, "middle", "list");
  assert.deepEqual(
    Array.from(
      { length: 3 },
      (_, i) => plain.doc.firstChild!.child(i).attrs.checked,
    ),
    [true, null, false],
  );
});

test("task conversion from an ordered item leaves ordered siblings unchanged", () => {
  const doc = s.nodes.doc.create(
    null,
    ol(8, li("first", [], true), li("middle"), li("last")),
  );
  const result = convert(doc, "middle", "task");
  assert.equal(result.doc.child(0).attrs.order, 8);
  assert.equal(result.doc.child(0).firstChild!.attrs.checked, true);
  assert.equal(result.doc.child(1).type.name, "bullet_list");
  assert.equal(result.doc.child(1).firstChild!.attrs.checked, false);
  assert.equal(result.doc.child(2).attrs.order, 10);
});

test("heading conversion retains the item's descendants and following blocks", () => {
  const nested = ul(li("child"));
  const tail = p("details");
  const doc = s.nodes.doc.create(
    null,
    ul(li("first"), li("middle", [nested, tail]), li("last")),
  );
  const result = convert(doc, "middle", "heading2", 2);
  assert.deepEqual(
    Array.from(
      { length: result.doc.childCount },
      (_, i) => result.doc.child(i).type.name,
    ),
    ["bullet_list", "nested_block", "bullet_list"],
  );
  assert.equal(result.doc.child(1).firstChild!.attrs.level, 2);
  assert.ok(result.doc.child(1).child(1).eq(nested));
  assert.ok(result.doc.child(1).child(2).eq(tail));
  assert.equal(result.selection.$from.parentOffset, 2);
});

test("converting a nested row keeps the result inside its ancestor item", () => {
  const doc = s.nodes.doc.create(
    null,
    ul(
      li("parent", [
        ol(4, li("first"), li("middle", [ul(li("grandchild"))]), li("last")),
      ]),
      li("outside"),
    ),
  );
  const result = convert(doc, "middle", "heading1");
  const parent = result.doc.firstChild!.firstChild!;
  assert.equal(result.doc.childCount, 1);
  assert.equal(result.doc.firstChild!.childCount, 2);
  assert.deepEqual(
    Array.from(
      { length: parent.childCount },
      (_, i) => parent.child(i).type.name,
    ),
    ["paragraph", "ordered_list", "nested_block", "ordered_list"],
  );
  assert.equal(parent.lastChild!.attrs.order, 6);
  assert.equal(parent.child(2).child(1).textContent, "grandchild");
});

test("quote conversion retains the entire item inside the quote", () => {
  const item = li("middle", [ul(li("child")), p("details")]);
  const doc = s.nodes.doc.create(null, ul(li("first"), item, li("last")));
  const result = convert(doc, "middle", "quote", 4);
  assert.equal(result.doc.child(1).type.name, "blockquote");
  assert.ok(result.doc.child(1).content.eq(item.content));
  assert.equal(result.selection.$from.parentOffset, 4);
});

test("code conversion renders atom Markdown while retaining nested children", () => {
  const first = s.nodes.paragraph.create(null, [
    s.text("open ", [s.marks.strong.create()]),
    s.nodes.page_link.create({ target: "page-id", label: "Project" }),
    s.text(" now"),
  ]);
  const item = s.nodes.bullet_list_item.create(null, [first, ul(li("child"))]);
  const doc = s.nodes.doc.create(null, ul(item, li("last")));
  const atomEnd = 3 + 5 + 1;
  const state = EditorState.create({
    doc,
    selection: TextSelection.create(doc, atomEnd),
  });
  const tr = convertListItem(state, "code");
  assert.ok(tr);
  tr.doc.check();
  assert.equal(tr.doc.firstChild!.type.name, "code_block");
  assert.equal(tr.doc.firstChild!.textContent, "open [[page-id|Project]] now");
  assert.equal(tr.doc.firstChild!.firstChild!.marks.length, 0);
  assert.equal(tr.doc.child(1).textContent, "child");
  assert.equal(
    tr.selection.$from.parentOffset,
    "open [[page-id|Project]]".length,
  );
});

test("caret in a later child block follows that block through conversion", () => {
  const doc = s.nodes.doc.create(
    null,
    ul(li("middle", [p("details")]), li("last")),
  );
  const result = convert(doc, "details", "text", 3);
  assert.equal(result.selection.$from.parent.textContent, "details");
  assert.equal(result.selection.$from.parentOffset, 3);
});

test("code conversion keeps link text and image targets", () => {
  const first = s.nodes.paragraph.create(null, [
    s.text("Recording", [s.marks.link.create({ href: "recording.mp3" })]),
    s.text(" "),
    s.text("Clip", [s.marks.link.create({ href: "clip.mp4" })]),
    s.text(" "),
    s.nodes.image.create({ src: "photo.png", alt: "" }),
  ]);
  const doc = s.nodes.doc.create(
    null,
    ul(s.nodes.bullet_list_item.create(null, first)),
  );
  const state = EditorState.create({
    doc,
    selection: TextSelection.create(doc, 3),
  });
  const tr = convertListItem(state, "code");
  assert.ok(tr);
  tr.doc.check();
  assert.equal(
    tr.doc.firstChild!.textContent,
    "Recording Clip ![](photo.png)",
  );
});

test("ordinary paragraph to code keeps page and image targets and link text", () => {
  const paragraph = s.nodes.paragraph.create(null, [
    s.text("before ", [s.marks.strong.create()]),
    s.nodes.page_link.create({ target: "page-id", label: "Project" }),
    s.text(" "),
    s.nodes.image.create({ src: "photo.png", alt: "Photo" }),
    s.text(" "),
    s.text("Recording", [s.marks.link.create({ href: "recording.mp3" })]),
    s.text(" after"),
  ]);
  const doc = s.nodes.doc.create(null, [p("above"), paragraph, p("below")]);
  const sourcePos = doc.firstChild!.nodeSize;
  const caret = sourcePos + 1 + "before ".length + 1;
  const state = EditorState.create({
    doc,
    selection: TextSelection.create(doc, caret),
  });
  const tr = convertTextblockToCode(state);
  assert.ok(tr);
  tr.doc.check();
  assert.equal(tr.steps.length, 1);
  assert.equal(tr.doc.child(1).type.name, "code_block");
  assert.equal(
    tr.doc.child(1).textContent,
    "before [[page-id|Project]] ![Photo](photo.png) Recording after",
  );
  assert.equal(tr.doc.child(1).firstChild!.marks.length, 0);
  assert.ok(tr.doc.firstChild!.eq(doc.firstChild!));
  assert.ok(tr.doc.lastChild!.eq(doc.lastChild!));
  assert.equal(
    tr.selection.$from.parentOffset,
    "before [[page-id|Project]]".length,
  );
});

test("ordinary code conversion preserves hard breaks and backward selection", () => {
  const paragraph = s.nodes.paragraph.create(null, [
    s.text("one"),
    s.nodes.hard_break.create(),
    s.text("two"),
  ]);
  const doc = s.nodes.doc.create(null, paragraph);
  const state = EditorState.create({
    doc,
    selection: TextSelection.create(doc, 7, 2),
  });
  const tr = convertTextblockToCode(state);
  assert.ok(tr);
  assert.equal(tr.doc.firstChild!.textContent, "one\ntwo");
  assert.equal(tr.selection.anchor, 7);
  assert.equal(tr.selection.head, 2);
});

test("ordinary code conversion rejects cross-block selections and first list paragraphs", () => {
  const doc = s.nodes.doc.create(null, [p("first"), p("last")]);
  const state = EditorState.create({
    doc,
    selection: TextSelection.create(doc, 2, 9),
  });
  assert.equal(convertTextblockToCode(state), null);
  const listDoc = s.nodes.doc.create(null, ul(li("first")));
  assert.equal(
    convertTextblockToCode(EditorState.create({ doc: listDoc })),
    null,
  );
});

test("selection direction and marks survive conversion", () => {
  const first = s.nodes.paragraph.create(
    null,
    s.text("formatted", [s.marks.strong.create()]),
  );
  const doc = s.nodes.doc.create(
    null,
    ul(s.nodes.bullet_list_item.create(null, first)),
  );
  const from = textPosition(doc, "formatted");
  const state = EditorState.create({
    doc,
    selection: TextSelection.create(doc, from + 7, from + 2),
  });
  const tr = convertListItem(state, "heading3");
  assert.ok(tr);
  assert.equal(tr.selection.$anchor.parentOffset, 7);
  assert.equal(tr.selection.$head.parentOffset, 2);
  assert.equal(tr.doc.firstChild!.firstChild!.marks[0].type.name, "strong");
});

test("a node-selected list item can be converted", () => {
  const doc = s.nodes.doc.create(null, ul(li("only")));
  const state = EditorState.create({
    doc,
    selection: NodeSelection.create(doc, 1),
  });
  const tr = convertListItem(state, "text");
  assert.ok(tr);
  assert.equal(tr.doc.firstChild!.type.name, "paragraph");
  assert.equal(tr.selection.$from.parent.textContent, "only");
});

test("non-list and cross-item selections are not converted", () => {
  const plain = s.nodes.doc.create(null, p("plain"));
  assert.equal(
    convertListItem(EditorState.create({ doc: plain }), "number"),
    null,
  );
  const doc = s.nodes.doc.create(null, ul(li("first"), li("last")));
  const state = EditorState.create({
    doc,
    selection: TextSelection.create(
      doc,
      textPosition(doc, "first"),
      textPosition(doc, "last", 2),
    ),
  });
  assert.equal(convertListItem(state, "heading1"), null);
});

test("Markdown source for unaffected content survives item conversion", () => {
  const source =
    "Intro **exact**.\n\n- first\n- middle\n  - child\n- last\n\nAfter _exact_.\n";
  const doc = parseEditorMarkdown(source);
  const result = convert(doc, "middle", "heading2");
  const markdown = serializeEditorMarkdown(result.doc);
  assert.ok(markdown.startsWith("Intro **exact**.\n\n"));
  assert.ok(markdown.endsWith("After _exact_.\n"));
  assert.match(markdown, /## middle/);
  assert.equal(
    parseNative(markdown, { version: 1, variant: "notdown", extensions: {} }).textContent,
    result.doc.textContent,
  );
});
