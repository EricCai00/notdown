import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "prosemirror-state";
import {
  parseNotionMarkdown,
  serializeNotionMarkdown,
} from "../src/notion-markdown.js";
import { editorSchema as schema } from "../src/editor-schema.js";
import { editorFingerprint } from "../src/editor-markdown.js";
import { moveEditorBlock } from "../src/editor-blocks.js";

test("Notion edits retain leading, trailing and multiple block gaps, CRLF, fenced code and unknown raw blocks", () => {
  const body =
    "\r\n# Title\r\n\r\n\r\nParagraph\r\n\r\n```text\r\na\r\n\r\nb\r\n```\r\n\r\n<future>\r\n\tUnknown\r\n\r\n</future>\r\n\r\nTail\r\n\r\n";
  const doc = parseNotionMarkdown(body);
  const edited = EditorState.create({ doc }).tr.insertText(
    " edited",
    1 + "Title".length,
  ).doc;
  const output = serializeNotionMarkdown(edited);
  assert.equal(output, body.replace("# Title", "# Title edited"));
  const reopened = parseNotionMarkdown(output);
  reopened.check();
  assert.equal(reopened.childCount, doc.childCount);
  assert.equal(serializeNotionMarkdown(reopened), output);
});

test("Notion new block boundaries use blank lines while list rows stay compact; moves keep content recoverable", () => {
  const doc = parseNotionMarkdown("First\nSecond\n\n- One\n- Two\n\nTail");
  const edited = EditorState.create({ doc }).tr.insertText(" edited", 6).doc;
  assert.equal(
    serializeNotionMarkdown(edited),
    "First edited\n\nSecond\n\n- One\n- Two\n\nTail",
  );
  const inserted = EditorState.create({ doc: parseNotionMarkdown("First") });
  const changed = inserted.tr.insert(
    inserted.doc.content.size,
    schema.nodes.paragraph.create(null, schema.text("New")),
  ).doc;
  assert.equal(serializeNotionMarkdown(changed), "First\n\nNew");
  const moved = moveEditorBlock(
    EditorState.create({ doc }),
    0,
    doc.content.size - doc.lastChild!.nodeSize,
    "after",
  );
  assert(moved);
  const written = serializeNotionMarkdown(moved.doc);
  assert.match(written, /Tail\n\nFirst$/);
  assert.equal(
    editorFingerprint(parseNotionMarkdown(written)),
    editorFingerprint(moved.doc),
  );
});

test("Notion rewritten containers separate sibling blocks and keep code blank lines and descendants", () => {
  const body =
    '<callout icon="💡">\n\tFirst\n\t\n\tSecond\n\t\n\t```text\n\tx\n\t\n\ty\n\t```\n</callout>\n\nTail';
  const doc = parseNotionMarkdown(body);
  const changed = EditorState.create({ doc }).tr.insertText(
    " edited",
    2 + "First".length,
  ).doc;
  const written = serializeNotionMarkdown(changed);
  assert.equal(written, body.replace("First", "First edited"));
  assert.equal(
    editorFingerprint(parseNotionMarkdown(written)),
    editorFingerprint(changed),
  );
});
