import { editorKind } from "../../src/document/node-identity";
import { parseNative } from "../../src/markdown-engine/codec";
import assert from "node:assert/strict";
import test from "node:test";
import { Fragment, type Node as EditorNode } from "prosemirror-model";
import { editorSchema as schema } from "../../src/document/editor-schema.js";
import { localMediaSource } from "../../src/document/editor-schema.js";
import {
  editorFingerprint,
  parseEditorMarkdown,
  serializeEditorMarkdown,
} from "../../src/document/editor-markdown.js";

function replaceText(
  node: EditorNode,
  before: string,
  after: string,
): EditorNode {
  if (node.isText)
    return schema.text(node.text!.replace(before, after), node.marks);
  const content: EditorNode[] = [];
  node.forEach((child) => content.push(replaceText(child, before, after)));
  return node.copy(Fragment.from(content));
}

function assertSemanticRoundtrip(doc: EditorNode): string {
  const output = serializeEditorMarkdown(doc);
  const reparsed = parseEditorMarkdown(output);
  assert.equal(editorFingerprint(reparsed), editorFingerprint(doc), output);
  reparsed.check();
  return output;
}

test("continuous editor no-op preserves every byte and invisible references", () => {
  const samples = [
    "",
    " \r\n\r\n",
    '[ref]: https://example.com/ "Reference"\r\n\r\n',
    "\r\n# Heading\r\nparagraph [link][ref]\r\n\r\n[ref]: https://example.com/\r\n\r\n- [ ] First\r\n- [X] Second\r\n  - Nested\r\n\r\n```md\r\n[[literal]]\r\n<svg>\r\n```\r\n\r\nLast",
    '::page{id="note"}\n\n:::columns\n## Left\n\n[[other|Other]]\n:::column\n- [x] Right\n:::\n',
    "| Left | Right |\n| --- | --- |\n| 1 | 2 |\n\n:::future\nkeep [[raw]]\n:::\n\n<script>alert('x')</script>",
  ];
  for (const source of samples) {
    const doc = parseEditorMarkdown(source);
    doc.check();
    assert.equal(serializeEditorMarkdown(doc), source);
  }
});

test("every task is a distinct list_item with nested editable children", () => {
  const source =
    "- [ ] Parent\n  - [x] Child\n  - Sibling\n- [X] Done\n- Plain\n\n3. Third\n4. Fourth";
  const doc = parseEditorMarkdown(source);
  const list = doc.child(0);
  assert.equal(editorKind(list), "bullet_list");
  assert.equal(list.childCount, 3);
  assert.equal(list.child(0).attrs.checked, false);
  assert.equal(list.child(1).attrs.checked, true);
  assert.equal(list.child(2).attrs.checked, null);
  assert.equal(list.child(0).child(0).textContent, "Parent");
  const nested = list.child(0).child(1);
  assert.equal(editorKind(nested), "bullet_list");
  assert.equal(nested.childCount, 2);
  assert.equal(nested.child(0).attrs.checked, true);
  assert.equal(nested.child(1).attrs.checked, null);
  assert.equal(doc.child(1).attrs.order, 3);
  const changed = replaceText(doc, "Child", "Edited child");
  const markdown = assertSemanticRoundtrip(changed);
  assert.match(
    markdown,
    /^- \[ \] Parent\n  - \[x\] Edited child\n  - Sibling\n- \[x\] Done\n- Plain/,
  );
});

test("page mentions are stable atoms and ordinary links are editable marked labels", () => {
  const source =
    'Read [[note-1|Project plan]] and [the website](https://example.com/a?b=1 "Title") plus `[[literal]]`.\n\n::page{id="note-2"}';
  const doc = parseEditorMarkdown(source);
  const paragraph = doc.child(0);
  const atoms: EditorNode[] = [];
  let linked: EditorNode | undefined;
  paragraph.forEach((node) => {
    if (editorKind(node) === "page_link") atoms.push(node);
    if (node.marks.some((mark) => editorKind(mark) === "link")) linked = node;
  });
  assert.equal(atoms.length, 1);
  assert.equal(atoms[0].isAtom, true);
  assert.deepEqual(
    { ...atoms[0].attrs },
    { kind: "", raw: "", title: "", html: "", config: null, editorRepresentation: "page_link", target: "note-1", label: "Project plan", url: "", syntaxForm: "wiki", labelMode: "custom", nfmAttrs: {} },
  );
  assert.equal(linked?.text, "the website");
  assert.equal(linked?.marks[0].attrs.href, "https://example.com/a?b=1");
  assert.equal(editorKind(doc.child(1)), "child_page");
  assert.equal(doc.child(1).attrs.target, "note-2");
  const output = assertSemanticRoundtrip(replaceText(doc, "Read", "See"));
  assert.match(output, /\[\[note-1\|Project plan\]\]/);
  assert.match(
    output,
    /\[the website\]\(https:\/\/example.com\/a\?b=1 "Title"\)/,
  );
  assert.match(output, /`\[\[literal\]\]`/);
});

test("editing one paragraph leaves unrelated formatting, tables, definitions and CRLF intact", () => {
  const source =
    '\r\n#  Keep heading  \r\n\r\nBefore **text**\r\n\r\n[ref]: https://example.com/ "Keep"\r\n\r\n| A | B |\r\n| --- | --- |\r\n| 1 | 2 |\r\n\r\n:::future\r\n[a]: literal-data\r\n:::\r\n';
  const doc = parseEditorMarkdown(source);
  const output = serializeEditorMarkdown(replaceText(doc, "Before", "After"));
  assert.equal(output, source.replace("Before", "After"));
  assert.equal(editorKind(doc.child(2)), "opaque_block");
  assert.equal(editorKind(doc.child(3)), "opaque_block");
});

test("deleting a block preserves reference definitions attached to its boundary", () => {
  const source = "First\n\n[ref]: https://example.com/\n\nSecond\n\nThird\n";
  const doc = parseEditorMarkdown(source);
  const changed = doc.copy(Fragment.from([doc.child(0), doc.child(2)]));
  const output = serializeEditorMarkdown(changed);
  assert.match(output, /First\n\nThird/);
  assert.match(output, /\[ref\]: https:\/\/example.com\//);
  assert.doesNotMatch(output, /Second/);
  assert.equal((output.match(/\[ref\]:/g) ?? []).length, 1);
});

test("reordering unterminated blocks does not merge them or duplicate definitions", () => {
  const source = "# Heading\nparagraph\n\n[ref]: https://example.com/\n\nLast";
  const doc = parseEditorMarkdown(source);
  const moved = doc.copy(
    Fragment.from([doc.child(2), doc.child(0), doc.child(1)]),
  );
  const output = serializeEditorMarkdown(moved);
  const reparsed = parseEditorMarkdown(output);
  assert.deepEqual(
    Array.from(
      { length: reparsed.childCount },
      (_, index) => reparsed.child(index).textContent,
    ),
    ["Last", "Heading", "paragraph"],
  );
  assert.equal((output.match(/\[ref\]:/g) ?? []).length, 1);
  const duplicated = doc.copy(
    Fragment.from([doc.child(0), doc.child(1), doc.child(2), doc.child(2)]),
  );
  assert.equal(
    (serializeEditorMarkdown(duplicated).match(/\[ref\]:/g) ?? []).length,
    1,
  );
});

test("edited fenced code retains angle brackets and chooses a non-conflicting fence", () => {
  const doc = parseEditorMarkdown("```html\n<div>Old</div>\n```\n\nTail");
  const changed = replaceText(doc, "Old", "New\n```\n[[still literal]]");
  const output = assertSemanticRoundtrip(changed);
  assert.match(
    output,
    /^````html\n<div>New\n```\n\[\[still literal\]\]<\/div>\n````/,
  );
});

test("two columns preserve page atoms, nested lists, and code after editing", () => {
  const doc = parseEditorMarkdown(
    ":::columns\nLeft [[page]]\n:::column\n- [ ] Parent\n  - Child\n\n```md\n:::column\n```\n:::",
  );
  assert.equal(editorKind(doc.child(0)), "columns");
  assert.equal(doc.child(0).childCount, 2);
  const changed = replaceText(doc, "Child", "Nested child");
  const output = serializeEditorMarkdown(changed);
  assert.doesNotMatch(output, /^:::columns/m);
  const reopened = parseNative(output, { version: 1, variant: "notdown", extensions: {} });
  assert.equal(editorKind(reopened.firstChild), "columns");
  assert.equal(reopened.textContent, changed.textContent);
  assert.equal(editorKind(reopened.firstChild?.child(1).lastChild), "code_block");
});

test("new paragraphs escape Markdown syntax while raw HTML stays inert", () => {
  const raw = parseEditorMarkdown('<script>alert("x")</script>\n\nText');
  assert.equal(editorKind(raw.child(0)), "opaque_block");
  const htmlSpec = schema.nodes["block.unsupported"].spec.toDOM!(raw.child(0));
  assert.deepEqual(htmlSpec, [
    "pre",
    { class: "opaque-block", contenteditable: "false" },
    ["code", '<script>alert("x")</script>'],
  ]);
  const doc = schema.nodes["doc"].create(null, [
    schema.nodes["block.paragraph"].create(null, schema.text(
        "# literal\n- not a list\n1. text\n[[not a page]]\n<img src=x>",
      )),
  ]);
  assertSemanticRoundtrip(doc);
});

test("changed formatted inline content retains mark boundaries and code delimiters", () => {
  const doc = parseEditorMarkdown(
    "A [*link* **bold** `code`](https://example.com) and ~~removed~~ with `` `literal` ``.",
  );
  assertSemanticRoundtrip(replaceText(doc, "A ", "Updated "));
});

test("literal thematic and setext syntax remains plain paragraph content", () => {
  for (const text of ["---", "===", "line\n---", "line\n=", "- - -", "* * *"]) {
    const doc = schema.nodes["doc"].create(null, schema.nodes["block.paragraph"].create(null, schema.text(text)));
    assertSemanticRoundtrip(doc);
  }
});

test("editing or deleting a list preserves its invisible nested reference definitions", () => {
  const source =
    '- Parent\n\n  [inside]: https://example.com/ "Keep"\n\n  Child [link][inside]\n\nTail [outside][inside]';
  const doc = parseEditorMarkdown(source);
  const output = serializeEditorMarkdown(
    replaceText(doc, "Parent", "Changed parent"),
  );
  assert.match(output, /\[inside\]: https:\/\/example.com\/ "Keep"/);
  assert.equal((output.match(/\[inside\]:/g) ?? []).length, 1);
  assertSemanticRoundtrip(replaceText(doc, "Parent", "Changed parent"));
  const deleted = serializeEditorMarkdown(
    doc.copy(Fragment.from([doc.child(1)])),
  );
  assert.match(deleted, /\[inside\]: https:\/\/example.com\/ "Keep"/);
  assert.equal(
    parseEditorMarkdown(deleted).child(0).lastChild?.marks[0].attrs.href,
    "https://example.com/",
  );
});

test("reference-looking fenced text never becomes a hidden definition", () => {
  const source = "- Parent\n\n  ```md\n  [inside]: literal-code\n  ```\n\nTail";
  const doc = parseEditorMarkdown(source);
  assert.equal(doc.attrs.sourceHidden.length, 0);
  const output = serializeEditorMarkdown(
    replaceText(doc, "Parent", "Changed parent"),
  );
  assert.equal((output.match(/\[inside\]: literal-code/g) ?? []).length, 1);
  assertSemanticRoundtrip(replaceText(doc, "Parent", "Changed parent"));
});

test("image alt labels and hard breaks survive an adjacent text edit", () => {
  const doc = parseEditorMarkdown(
    'Before ![**Bold** and \\[literal\\]](assets/image.png "Title")  \nAfter',
  );
  assert.equal(doc.child(0).child(1).attrs.alt, "Bold and [literal]");
  assertSemanticRoundtrip(replaceText(doc, "Before", "Updated"));
});

test("local audio and video stay ordinary links through edits and CRLF roundtrips", () => {
  const source = "[录音](assets/voice.mp3)\r\n\r\n[演示](./assets/demo.webm#t=3)\r\n\r\nTail\r\n";
  const doc = parseEditorMarkdown(source);
  for (const [index, href] of [[0, "assets/voice.mp3"], [1, "./assets/demo.webm#t=3"]] as const) {
    const node = doc.child(index).firstChild!;
    assert.equal(editorKind(node), "text");
    assert.equal(editorKind(node.marks[0]), "link");
    assert.equal(node.marks[0].attrs.href, href);
  }
  assert.equal(schema.nodes["media"], undefined);
  assert.equal(serializeEditorMarkdown(doc), source);
  assert.equal(serializeEditorMarkdown(replaceText(doc, "Tail", "Changed")), source.replace("Tail", "Changed"));
  assert.match(assertSemanticRoundtrip(replaceText(doc, "录音", "新录音")), /^\[新录音\]\(assets\/voice.mp3\)/);
});

test("remote and absolute media URLs remain links and code stays literal", () => {
  const source =
    "[Remote](https://example.com/demo.mp4)\n\n[Authority](//example.com/voice.mp3)\n\n[Root](/assets/demo.mp4)\n\n`[inline](assets/a.mp3)`\n\n```md\n[code](assets/a.mp3)\n```";
  const doc = parseEditorMarkdown(source);
  let media = 0;
  doc.descendants((node) => {
    if (editorKind(node) === "media") media++;
  });
  assert.equal(media, 0);
  for (let index = 0; index < 3; index++)
    assert.equal(editorKind(doc.child(index).child(0).marks[0]), "link");
  assert.equal(editorKind(doc.child(3).child(0).marks[0]), "code");
  assert.equal(editorKind(doc.child(4)), "code_block");
  assert.equal(serializeEditorMarkdown(doc), source);
});

test("local media source validation rejects scheme, authority, absolute, or backslash URLs", () => {
  for (const src of [
    "https://host/audio.mp3",
    "//host/audio.mp3",
    "/audio.mp3",
    "\\\\host\\audio.mp3",
    "C:\\audio.mp3",
    "javascript:bad",
    "data:audio/mp3,x",
    "\naudio.mp3",
  ]) {
    assert.equal(localMediaSource(src), "");
  }
  assert.equal(localMediaSource("../assets/a%20b.ogg"), "../assets/a%20b.ogg");
});
