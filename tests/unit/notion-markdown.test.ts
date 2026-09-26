import { editorKind } from "../../src/document/node-identity";
import test from "node:test";
import assert from "node:assert/strict";
import { EditorState, TextSelection } from "prosemirror-state";
import {
  parseNotionMarkdown,
  serializeNotionMarkdown,
} from "../../src/document/notion-markdown.js";
import { parseEditorMarkdown } from "../../src/document/editor-markdown.js";
import {
  extractLinks,
  getOutline,
  htmlDocument,
  renderNotionMarkdown,
} from "../../src/document/document-format.js";
import { editorSchema as schema } from "../../src/document/editor-schema.js";
import { indentEditorBlock, moveEditorBlock } from "../../src/editor/editor-blocks.js";
import { tableCellStyle } from "../../src/editor/editor-table.js";

const canonical = (body: string) => {
  const doc = parseNotionMarkdown(body);
  doc.check();
  // Bypass unchanged-subtree reuse so this exercises the actual writer.
  return serializeNotionMarkdown(
    doc.type.create(
      { ...doc.attrs, source: null, sourceFormat: "markdown" },
      doc.content,
    ),
  );
};
test("Notion uses one line per block, tabs for descendants, br for internal breaks and explicit empty blocks", () => {
  const body =
    "Parent<br>second line\n\tChild\n\t\tGrandchild\n\t<empty-block/>\nSibling\n\n<empty-block/>";
  const doc = parseNotionMarkdown(body);
  doc.check();
  assert.equal(doc.childCount, 3);
  assert.equal(editorKind(doc.firstChild), "nested_block");
  assert.equal(editorKind(doc.firstChild?.child(0).child(1)), "hard_break");
  assert.equal(editorKind(doc.firstChild?.child(1)), "nested_block");
  assert.equal(doc.firstChild?.lastChild?.textContent, "");
  assert.equal(serializeNotionMarkdown(doc), body);
  assert.equal(
    canonical(body),
    "Parent<br>second line\n\tChild\n\t\tGrandchild\n\t\n\t<empty-block/>\n\nSibling\n\n<empty-block/>",
  );
});
test("mixed nested lists retain one independently editable row per item and all descendants", () => {
  const body =
    "- Parent\n\t- [x] Child<br>continuation\n\t\tOrdinary child\n\t1. Number one\n\t2. Number two\n- Sibling\nOutside";
  const doc = parseNotionMarkdown(body);
  doc.check();
  assert.equal(doc.firstChild?.childCount, 2);
  assert.equal(doc.firstChild?.firstChild?.childCount, 3);
  assert.equal(
    doc.firstChild?.firstChild?.child(1).firstChild?.attrs.checked,
    true,
  );
  assert.equal(
    canonical(body),
    body.replace("\n\t1.", "\n\t\n\t1.").replace("\nOutside", "\n\nOutside"),
  );
});
test("official columns can contain blocks, more than two columns and nested columns", () => {
  const body =
    '<columns>\n\t<column>\n\t\t# Left\n\t\tText\n\t</column>\n\t<column>\n\t\t<callout icon="💡" color="blue_bg">\n\t\t\tA thought\n\t\t</callout>\n\t</column>\n\t<column>\n\t\tRight\n\t</column>\n</columns>';
  const doc = parseNotionMarkdown(body);
  doc.check();
  assert.equal(editorKind(doc.firstChild), "columns");
  assert.equal(doc.firstChild?.childCount, 3);
  assert.equal(editorKind(doc.firstChild?.child(1).firstChild), "callout");
  assert.equal(
    canonical(body),
    body
      .replace("# Left\n", "# Left\n\t\t\n")
      .replaceAll("\t</column>\n\t<column>", "\t</column>\n\t\n\t<column>"),
  );
  const nested =
    "<columns>\n\t<column>\n\t\t<columns>\n\t\t\t<column>\n\t\t\t\tInner left\n\t\t\t</column>\n\t\t\t<column>\n\t\t\t\tInner right\n\t\t\t</column>\n\t\t</columns>\n\t</column>\n\t<column>\n\t\tOuter right\n\t</column>\n</columns>";
  const nestedDoc = parseNotionMarkdown(nested);
  nestedDoc.check();
  assert.equal(
    editorKind(nestedDoc.firstChild?.firstChild?.firstChild),
    "columns",
  );
  assert.equal(
    canonical(nested),
    nested
      .replace(
        "\t\t\t</column>\n\t\t\t<column>",
        "\t\t\t</column>\n\t\t\t\n\t\t\t<column>",
      )
      .replace("\t</column>\n\t<column>", "\t</column>\n\t\n\t<column>"),
  );
});
test("code fence contents never interpret tabs, closing tags, nests, mentions or br", () => {
  const body =
    '<callout icon="💡">\n\t```html\n\t</callout>\n\t\t<columns>\n\t:::nest\n\t<mention-page url="#page/a">a</mention-page><br>\n\t```\n</callout>\nAfter';
  const doc = parseNotionMarkdown(body);
  doc.check();
  assert.equal(editorKind(doc.firstChild?.firstChild), "code_block");
  assert.equal(doc.childCount, 2);
  assert.equal(
    canonical(body),
    body.replace("</callout>\nAfter", "</callout>\n\nAfter"),
  );
  assert.deepEqual(extractLinks(body, "notion-markdown"), []);
});
test("rich text preserves nested spans, page/user/date mentions, citations and inline math", () => {
  const body =
    'Before **bold** <span color="red"><span underline="true">red underlined</span></span> <mention-page url="#page/target">A &amp; B</mention-page> <mention-user url="user://ada">Ada</mention-user> <mention-date start="2026-09-12"/> $x^2$ [^https://example.com] after';
  const doc = parseNotionMarkdown(body);
  doc.check();
  const names: string[] = [];
  doc.descendants((node) => {
    names.push(editorKind(node));
  });
  assert.ok(names.includes("page_link"));
  assert.ok(names.includes("mention"));
  assert.ok(names.includes("inline_math"));
  assert.ok(names.includes("citation"));
  const text = doc.firstChild!.content.content.find(
    (node) => node.text === "red underlined",
  );
  assert.deepEqual(
    text?.marks.map((mark) => editorKind(mark)),
    ["underline", "color"],
  );
  assert.deepEqual(extractLinks(body, "notion-markdown"), ["target"]);
  const rewritten = canonical(body);
  assert.match(
    rewritten,
    /<mention-page url="#page\/target">A &amp; B<\/mention-page>/,
  );
  assert.equal(parseNotionMarkdown(rewritten).textContent, doc.textContent);
});
test("page, preserved database source, media, toc and unknown blocks retain official attributes after edits", () => {
  const body =
    '<page url="#page/child">Child</page>\n<database url="https://notion.so/db" inline="true" icon="📚">Reading</database>\n<audio src="assets/a.mp3">Recording</audio>\n<video src="assets/v.mp4">Video</video>\n<file src="assets/f.zip">File</file>\n<pdf src="assets/p.pdf">PDF</pdf>\n<table_of_contents/>\n<unknown url="https://notion.so/x" alt="bookmark"/>';
  const doc = parseNotionMarkdown(body);
  doc.check();
  assert.deepEqual(
    doc.content.content.map((node) => editorKind(node)),
    [
      "child_page",
      "opaque_block",
      "media_block",
      "media_block",
      "media_block",
      "media_block",
      "table_of_contents",
      "unknown_block",
    ],
  );
  assert.equal(canonical(body), body.replaceAll("\n", "\n\n"));
});
test("details, toggle headings, quotes, equations and synced block snapshots round trip", () => {
  const body =
    '<details color="green_bg">\n<summary>Toggle **title**</summary>\n\tChild\n</details>\n## Heading {toggle="true"}\n\tChild of heading\n> quote<br>same quote\n\tNested quote child\n> separate quote\n$$\nx^2 + y^2\n$$\n<synced_block_reference url="https://notion.so/block">\n\tSnapshot\n</synced_block_reference>';
  const doc = parseNotionMarkdown(body);
  doc.check();
  assert.equal(doc.childCount, 6);
  assert.equal(
    canonical(body),
    body
      .replace("</details>\n", "</details>\n\n")
      .replace("Child of heading\n", "Child of heading\n\n")
      .replace("Nested quote child\n", "Nested quote child\n\n")
      .replace("> separate quote\n", "> separate quote\n\n")
      .replace("$$\n<synced", () => "$$\n\n<synced"),
  );
});
test("XML tables preserve widths and header attributes and cells are editable paragraphs", () => {
  const body =
    '<table fit-page-width="true" header-row="true">\n\t<colgroup>\n\t\t<col width="120"/>\n\t\t<col width="240"/>\n\t</colgroup>\n\t<tr>\n\t\t<td>**Name**</td>\n\t\t<td>Value<br>continued</td>\n\t</tr>\n</table>';
  const doc = parseNotionMarkdown(body);
  doc.check();
  assert.equal(editorKind(doc.firstChild), "table");
  assert.equal(doc.firstChild?.firstChild?.childCount, 2);
  assert.deepEqual(doc.firstChild?.attrs.widths, ["120", "240"]);
  assert.equal(canonical(body), body);
  assert.equal(
    editorKind(parseNotionMarkdown("| Name | Value |\n| --- | --- |\n| A | B |").firstChild),
    "table",
  );
});
test("table cell, row and column colors survive editing with official precedence in HTML", () => {
  const body =
    '<table>\n\t<colgroup>\n\t\t<col color="yellow_bg"/>\n\t\t<col color="blue"/>\n\t</colgroup>\n\t<tr color="green_bg">\n\t\t<td color="red_bg">Cell</td>\n\t\t<td>Row</td>\n\t</tr>\n\t<tr>\n\t\t<td>Column</td>\n\t\t<td>Text</td>\n\t</tr>\n</table>';
  let state = EditorState.create({ doc: parseNotionMarkdown(body) });
  let cellPos = 0;
  state.doc.descendants((node, pos) => {
    if (node.isText && node.text === "Cell") cellPos = pos;
  });
  state = state.apply(state.tr.insertText("Edited ", cellPos));
  const output = serializeNotionMarkdown(state.doc);
  assert.equal(output, body.replace(">Cell<", ">Edited Cell<"));
  const table = parseNotionMarkdown(output).firstChild!;
  assert.equal(tableCellStyle(table, 0, 0), "background-color:#fdebec");
  assert.equal(tableCellStyle(table, 0, 1), "background-color:#edf3ec");
  assert.equal(tableCellStyle(table, 1, 0), "background-color:#fbf3db");
  assert.equal(tableCellStyle(table, 1, 1), "color:#337ea9");
  const html = renderNotionMarkdown(output);
  assert.match(html, /<td style="background-color:#fdebec"><p>Edited Cell/);
  assert.match(html, /<td style="color:#337ea9"><p>Text/);
});

test("code colors and nested heading source lines survive canonical writing", () => {
  const body =
    '```ts {color="blue_bg"}\n\tconst text = "<br>";\n```\nParent\n\t## Nested {toggle="true"}\n\t\tChild';
  assert.equal(canonical(body), body.replace("```\nParent", "```\n\nParent"));
  const heading = getOutline(body, "notion-markdown")[0];
  assert.equal(heading.line, 5);
  assert.equal(heading.text, "Nested");
  assert.match(renderNotionMarkdown(body), /background-color:#e7f3f8/);
});

test("old text nesting and wiki/page/columns directives convert without private output syntax", () => {
  const old =
    ':::nest\nParent\n:::children\nChild  \nsecond line\n:::endnest\n\n::page{id="child"}\n\n[[target|Title]]\n\n:::columns\nLeft\n:::column\nRight\n:::';
  const body = serializeNotionMarkdown(parseEditorMarkdown(old));
  assert.doesNotMatch(body, /:::|::page|\[\[/);
  assert.match(body, /^Parent\n\tChild<br>second line/);
  const doc = parseNotionMarkdown(body);
  doc.check();
  assert.equal(editorKind(doc.firstChild), "nested_block");
  assert.equal(editorKind(doc.lastChild), "columns");
});
test("ordinary CommonMark soft lines stay one block when a legacy page migrates", () => {
  const body = serializeNotionMarkdown(
    parseEditorMarkdown("one\ncontinued\n\nnext\n\n    code"),
  );
  const doc = parseNotionMarkdown(body);
  doc.check();
  assert.equal(doc.childCount, 3);
  assert.match(body, /^one<br>continued\n\nnext\n\n```/);
});
test("unknown and malformed markup remains intact next to edited content; renderer never executes it", () => {
  const body =
    'Text\r\n<unknown url="javascript:alert(1)" alt="<img src=x onerror=alert(1)>"/>\r\n<future data="v">\r\n\tHidden\r\n</future>';
  let state = EditorState.create({ doc: parseNotionMarkdown(body) });
  state = state.apply(state.tr.insertText(" edited", 5));
  const output = serializeNotionMarkdown(state.doc);
  assert.match(output, /\r\n<future data="v">\r\n\tHidden\r\n<\/future>/);
  assert.equal(serializeNotionMarkdown(parseNotionMarkdown(output)), output);
  const html = renderNotionMarkdown(output);
  assert.doesNotMatch(html, /href="javascript:|<img src=x|<future/);
  const malformed = "<columns>\n\t<column>\n\t\tText\n\t</column>";
  assert.equal(
    editorKind(parseNotionMarkdown(malformed).firstChild),
    "opaque_block",
  );
  assert.equal(canonical(malformed), malformed);
});
test("Tab nesting, child and parent dragging still produce a reconstructable tree", () => {
  let state = EditorState.create({
    doc: parseNotionMarkdown("Parent\nChild\nTail"),
  });
  state = state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, 10)),
  );
  assert.equal(
    indentEditorBlock(state, (tr) => {
      state = state.apply(tr);
    }),
    true,
  );
  assert.equal(serializeNotionMarkdown(state.doc), "Parent\n\tChild\n\nTail");
  const group = state.doc.firstChild!;
  const moved = moveEditorBlock(state, 0, group.nodeSize, "after");
  assert.ok(moved);
  state = state.apply(moved);
  // The original separator travels with Tail when its block moves to the front.
  assert.equal(serializeNotionMarkdown(state.doc), "\nTail\n\nParent\n\tChild");
  assert.equal(
    parseNotionMarkdown(serializeNotionMarkdown(state.doc)).lastChild
      ?.childCount,
    2,
  );
});
test("outline, references and HTML share enhanced parsing in columns and nested content", () => {
  const body =
    '# Heading\nParent\n\t- Item\n\t\t<mention-page url="#page/ref">Reference</mention-page>\n<table_of_contents/>\n<callout icon="💡" color="blue_bg">\n\t## Inner heading\n</callout>';
  const outline = getOutline(body, "notion-markdown");
  assert.equal(outline[0].text, "Heading");
  assert.deepEqual(extractLinks(body, "notion-markdown"), ["ref"]);
  const html = htmlDocument("Example", body, [], "notion-markdown");
  assert.match(html, /nfm-heading-0/);
  assert.match(html, /pm-callout/);
  assert.match(html, /Inner heading/);
  assert.doesNotMatch(html, /&lt;callout|&lt;mention-page/);
});

test("Chinese page names and explicit external page URLs survive migration and graph indexing", () => {
  const converted = serializeNotionMarkdown(
    parseEditorMarkdown("[[中文页面|名称]]"),
  );
  assert.deepEqual(extractLinks(converted, "notion-markdown"), ["中文页面"]);
  const body =
    '<mention-page url="./Other%20page.md">Other page</mention-page>\n<page url="https://notion.so/page?a[]=1&amp;b=2">Page</page>';
  assert.equal(
    canonical(body),
    body.replace("</mention-page>\n", "</mention-page>\n\n"),
  );
  assert.match(renderNotionMarkdown(body), /href="\.\/Other%20page.md"/);
});
test("literal entities, empty equations and colored empty blocks are not corrupted", () => {
  const p = schema.nodes["block.paragraph"].create(null, schema.text("Literal &copy; and $x$ and <br>"));
  const serialized = serializeNotionMarkdown(schema.nodes["doc"].create(null, p));
  assert.equal(parseNotionMarkdown(serialized).textContent, p.textContent);
  assert.equal(editorKind(parseNotionMarkdown("$$$$").firstChild), "equation");
  assert.equal(
    canonical('<empty-block color="blue_bg"/>'),
    '<empty-block color="blue_bg"/>',
  );
  const quote = serializeNotionMarkdown(
    parseEditorMarkdown("> # A heading\n>\n> text"),
  );
  assert.match(quote, /# A heading/);
  assert.match(quote, /text/);
});
