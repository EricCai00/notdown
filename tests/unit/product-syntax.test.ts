import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec.js";
import { renderNotionMarkdown } from "../../src/document/document-format.js";
import { editorSchema as schema } from "../../src/document/editor-schema.js";
import { Fragment } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import {
  type Dialect,
  type SyntaxConfig,
} from "../../src/markdown-engine/config.js";
import {
  diagramSource,
  syntaxHtml,
} from "../../src/markdown-engine/product-render.js";
import { bibliographyEntries } from "../../src/markdown-engine/bibliography.js";
const config = (
  variant: Dialect,
  extensions: Record<string, boolean> = {},
): SyntaxConfig => ({ version: 1, variant, extensions });
const fixtures = JSON.parse(
  await readFile(
    new URL("../../docs/data/user-syntax-audit-2026-09-15.json", import.meta.url),
    "utf8",
  ),
);
for (const fixture of fixtures)
  test("user syntax " + fixture.id + ": " + fixture.name, () => {
    const variant =
      fixture.origin === "Typora"
        ? "typora"
        : fixture.origin === "Obsidian"
          ? "obsidian"
          : fixture.origin === "PHP Markdown Extra"
            ? "markdown_phpextra"
            : "markdown_mmd";
    const c = config(variant, {
        fenced_code_attributes: true, metadata_values: true, alerts: true, tex_math_dollars: true, subscript: true, superscript: true, highlight: true, diagrams: true, raw_attribute: true,
        smart: true,
        escaped_line_breaks: true,
        startnum: true,
      }),
      doc = parseNative(fixture.source, c);
    doc.check();
    assert.equal(serializeNative(doc, c), fixture.source);
    const changed = schema.nodes.doc.create(
      doc.attrs,
      doc.content.append(
        Fragment.from(
          schema.nodes.paragraph.create(null, schema.text("Neighbor")),
        ),
      ),
    );
    const written = serializeNative(changed, c);
    for (const original of fixture.source.split("\n\n"))
      assert(written.includes(original));
    parseNative(written, c).check();
    const types = new Set<string>();
    doc.descendants((n) => {
      types.add(n.type.name);
      for (const m of n.marks) types.add(m.type.name);
    });
    const expected: Record<number, string> = {
      1: "equation",
      2: "footnote",
      3: "syntax_block",
      4: "table_of_contents",
      5: "callout",
      6: "link",
      8: "inline_math",
      9: "subscript",
      10: "superscript",
      11: "highlight",
      12: "syntax_block",
      13: "syntax_block",
      14: "syntax_block",
      15: "syntax_block",
      16: "heading",
      17: "ordered_list",
      18: "ordered_list",
      19: "syntax_block",
      20: "syntax_inline",
      21: "page_link",
      22: "link",
      23: "html_block",
      24: "syntax_block",
      25: "heading",
      26: "heading",
      27: "heading",
      28: "image",
      29: "paragraph",
      30: "code_block",
      31: "code_block",
      32: "definition_list",
      33: "paragraph",
      34: "ordered_list",
      35: "syntax_inline",
      36: "syntax_inline",
      37: "syntax_inline",
      38: "syntax_inline",
      39: "syntax_inline",
      40: "syntax_inline",
      41: "critic",
      42: "critic",
      43: "critic",
      44: "critic",
      45: "critic",
      46: "link",
      47: "hard_break",
      48: "syntax_block",
      49: "syntax_block",
      50: "syntax_inline",
      51: "syntax_block",
      52: "image",
      53: "link",
      54: "equation",
      55: "superscript",
      56: "subscript",
      57: "syntax_inline",
      58: "syntax_block",
      60: "table_of_contents",
      61: "table_of_contents",
      62: "table",
    };
    if (expected[fixture.id])
      assert(types.has(expected[fixture.id]), doc.toString());
    if (fixture.id === 7) assert.equal(doc.textContent, "😄");
    if (fixture.id === 18)
      assert.equal(
        doc.firstChild!.firstChild!.child(1).type.name,
        "ordered_list",
      );
    if (fixture.id === 24)
      assert.match(syntaxHtml(doc.firstChild!), /<em>true<\/em>/);
    if (fixture.id === 25)
      assert.equal(doc.firstChild!.attrs.markdownAttrs.id, "heading-id");
    if (fixture.id === 26)
      assert.equal(doc.firstChild!.attrs.markdownAttrs.class, "main");
    if (fixture.id === 27)
      assert.equal(doc.firstChild!.attrs.markdownAttrs.lang, "fr");
    if (fixture.id === 34) assert.equal(doc.firstChild!.attrs.order, 3);
    if (fixture.id === 59) assert.match(doc.textContent, /— – …/);
    if (fixture.id === 31)
      assert.equal(doc.firstChild!.attrs.markdownAttrs.id, "example-1");
    if (fixture.id === 43)
      assert.equal(
        doc.firstChild!.firstChild!.marks[0].attrs.kind,
        "substitution",
      );
    if (fixture.id === 57)
      assert.equal(doc.lastChild!.child(1).attrs.label, "foo-test");
    if (fixture.id === 62) {
      const html = renderNotionMarkdown(fixture.source, [], { document: doc });
      assert.match(html, /colspan="2"/);
      assert.match(html, /Prototype table/);
      assert.match(html, /New section/);
    }
  });

test("product inline edits retain CriticMarkup, attributes and literal syntax", () => {
  for (const [variant, source] of [
    ["markdown_mmd", "{~~old~>new~~}"],
    ["markdown_phpextra", "## title {#my-id .note}"],
    ["markdown_mmd", "## title [my-id]"],
    ["typora", "==highlight=="],
  ] as const) {
    const c = config(variant),
      doc = parseNative(source, c),
      edit = EditorState.create({ doc }).tr.insertText("EDIT", 2).doc;
    const saved = serializeNative(edit, c),
      again = parseNative(saved, c);
    again.check();
    assert.equal(again.textContent, edit.textContent);
    if (variant === "markdown_phpextra" || source.includes("[my-id]"))
      assert.equal(again.firstChild!.attrs.markdownAttrs.id, "my-id");
  }
  for (const variant of ["typora", "obsidian", "markdown_mmd"] as const) {
    const c = config(variant),
      text = "==literal== %%literal%% {{file.txt}} {++literal++}",
      doc = schema.nodes.doc.create(
        null,
        schema.nodes.paragraph.create(null, schema.text(text)),
      );
    assert.equal(parseNative(serializeNative(doc, c), c).textContent, text);
  }
});
test("extension switches and fenced code delimit parsing", () => {
  assert.match(
    parseNative(
      "> [!NOTE]\n> text",
      config("typora", { alerts: false }),
    ).toString(),
    /blockquote/,
  );
  assert.equal(
    parseNative("==text==", config("typora", { highlight: false })).textContent,
    "==text==",
  );
  assert.equal(
    parseNative("%%text%%", config("obsidian", { comments: false }))
      .textContent,
    "%%text%%",
  );
  const raw = "```text\n%%comment%%\n{++change++}\n{{file.txt}}\n[toc]\n```";
  assert.equal(
    parseNative(raw, config("markdown_mmd")).firstChild!.type.name,
    "code_block",
  );
  assert.equal(
    parseNative("```mermaid\nA-->B\n```", config("typora", { diagrams: false }))
      .firstChild!.type.name,
    "code_block",
  );
});
test("diagram adapters and real BibTeX lookup", () => {
  assert.match(
    diagramSource("sequence", "Alice->Bob: hello"),
    /Alice->>Bob: hello/,
  );
  assert.match(
    diagramSource("flow", "s=>start: Start\ne=>end: End\ns->e"),
    /s --> e/,
  );
  assert.deepEqual(
    bibliographyEntries(
      '@book{doe, author={John Doe}, title={A {Nested} Title}, year=2006, publisher="Press"}',
    ),
    { doe: "John Doe. (2006). A Nested Title. Press" },
  );
});

test("reference attributes resolve, MMD image edits write native attributes, export anchors and fallback keep content", () => {
  const php = config("markdown_phpextra");
  const reference = parseNative(
    '[Example][ref]\n\n[ref]: url "title" {#id .class}',
    php,
  );
  assert.equal(
    reference.firstChild!.firstChild!.marks[0].attrs.markdownAttrs.id,
    "id",
  );
  const mmd = config("markdown_mmd");
  const doc = parseNative('before ![image](url "title" width=40px)', mmd);
  const edited = EditorState.create({ doc }).tr.insertText("edit ", 1).doc;
  const saved = serializeNative(edited, mmd);
  assert.match(saved, /width="40px"\)/);
  const image = parseNative(saved, mmd).firstChild!.lastChild!;
  assert.equal(image.attrs.markdownAttrs.width, "40px");
  const body =
    "# Target\n\n[Jump](#target)\n\n[toc]\n\n```mermaid\nflowchart LR\nA-->B\n```";
  const html = renderNotionMarkdown(body, [], {
    document: parseNative(body, config("typora")),
  });
  assert.match(html, /href="#md-target"/);
  assert.match(html, /id="md-target"/);
  assert.match(html, /A--&gt;B/);
});
