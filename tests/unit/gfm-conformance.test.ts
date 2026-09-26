import { editorKind } from "../../src/document/node-identity";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EditorState } from "prosemirror-state";
import { parseNative, renderGfmSyntax, serializeNative } from "../../src/markdown-engine/codec";
import { gfmTagfilter } from "../../src/markdown-engine/gfm";
import { renderNotionMarkdown } from "../../src/document/document-format";
import { renderRawHtml } from "../../src/markdown-engine/html";
import { canonicalHtml } from "../../scripts/dialect-audit/compare";
import type { SyntaxConfig } from "../../src/markdown-engine/config";

const config: SyntaxConfig = { version: 1, variant: "gfm", extensions: {} };
const dir = new URL("../../docs/fixtures/dialect-audit/", import.meta.url);
const corpus = JSON.parse(readFileSync(new URL("cases.json", dir), "utf8"));
const suite = corpus.suites.gfm;
const source = readFileSync(new URL(suite.file, dir), "utf8");
const examples = suite.cases.filter((item: { id: string }) => item.id.startsWith("gfm-example-"));

test("all 677 official GFM examples: syntax, valid editable schema and exact source preservation", () => {
  assert.equal(examples.length, 677);
  let verbatimSpec = 0;
  for (const example of examples) {
    const raw = source.slice(example.start, example.end);
    const doc = parseNative(raw, config);
    doc.check();
    assert.equal(serializeNative(doc, config), raw, example.id);
    const actual = renderGfmSyntax(raw);
    if (canonicalHtml(actual) === canonicalHtml(example.expected)) verbatimSpec++;
    // §6.8's four inherited examples intentionally describe core autolinks,
    // without §6.9's bare-link extension. Test that profile as well as defaults.
    const coreAutolinks = [611, 617, 620, 621].some(id => example.id === `gfm-example-${id}`);
    const profile = coreAutolinks ? { ...config, extensions: { autolink_bare_uris: false } } : config;
    assert.equal(canonicalHtml(renderGfmSyntax(raw, profile)), canonicalHtml(gfmTagfilter(example.expected)), example.id);
    const expectedDefault = coreAutolinks ? ({
      "gfm-example-611": '<p>&lt;<a href="http://foo.bar/baz">http://foo.bar/baz</a> bim&gt;</p>',
      "gfm-example-617": '<p>&lt; <a href="http://foo.bar">http://foo.bar</a> &gt;</p>',
      "gfm-example-620": '<p><a href="http://example.com">http://example.com</a></p>',
      "gfm-example-621": '<p><a href="mailto:foo@bar.example.com">foo@bar.example.com</a></p>',
    } as Record<string, string>)[example.id] : gfmTagfilter(example.expected);
    assert.equal(canonicalHtml(actual), canonicalHtml(expectedDefault), example.id + " defaults");
    // The production export takes the parsed (and potentially edited) document,
    // then applies the same safe HTML policy to the complete HTML fragment.
    assert.equal(canonicalHtml(renderNotionMarkdown(raw, [], { document: doc })),
      canonicalHtml(renderRawHtml(expectedDefault, false, true)), example.id + " safe export");
  }
  assert.equal(verbatimSpec, 668, "remaining nine examples compose core grammar with GFM extensions");
});

test("GFM marks, exact link boundaries and protocol links reach editable nodes", () => {
  const raw = "~one~ ~~two~~ ~~~three~~~\n\nabcwww.example.com www.example.com https://example.com/a&amp; mailto:a.b-c_d@a.b xmpp:foo@bar.baz/txt/bin\n";
  const doc = parseNative(raw, config);
  assert.equal(editorKind(doc.firstChild!.child(0).marks[0]), "strike");
  assert.equal(doc.firstChild!.textContent, "one two ~~~three~~~");
  const links: [string, string][] = [];
  doc.descendants(node => { for (const mark of node.marks) if (editorKind(mark) === "link") links.push([node.textContent, mark.attrs.href]); });
  assert.deepEqual(links, [
    ["www.example.com", "http://www.example.com"],
    ["https://example.com/a", "https://example.com/a"],
    ["mailto:a.b-c_d@a.b", "mailto:a.b-c_d@a.b"],
    ["xmpp:foo@bar.baz/txt", "xmpp:foo@bar.baz/txt"],
  ]);
  const changed = EditorState.create({ doc }).tr.insertText("!", 4).doc;
  assert.equal(parseNative(serializeNative(changed, config), config).firstChild!.textContent, "one! two ~~~three~~~");
});

test("GFM tasks accept whitespace, ordered/nested items and keep loose lists when edited", () => {
  for (const raw of ["- [x]\n  task", "1. [X] task", "- [ ]    task", "- [x]\ttask"]) {
    const doc = parseNative(raw, config);
    assert.equal(editorKind(doc.firstChild!.firstChild!), "task_list_item", raw);
    assert.equal(doc.firstChild!.firstChild!.textContent, "task", raw);
  }
  const doc = parseNative("- first\n\n- second\n", config);
  assert.equal(doc.firstChild!.attrs.tight, false);
  const changed = EditorState.create({ doc }).tr.insertText("!", 4).doc;
  assert.equal(parseNative(serializeNative(changed, config), config).firstChild!.attrs.tight, false);
  const zero = parseNative("0. first\n1. second", config);
  assert.equal(zero.firstChild!.attrs.order, 0);
  const editedZero = EditorState.create({ doc: zero }).tr.insertText("!", 4).doc;
  assert.equal(parseNative(serializeNative(editedZero, config), config).firstChild!.attrs.order, 0);
});

test("nested identical emphasis preserves outer formatting through structured edits", () => {
  for (const marker of ["*", "**", "~~"]) {
    const raw = `${marker}one ${marker}two${marker} three${marker}`;
    const doc = parseNative(raw, config), mark = marker === "*" ? "em" : marker === "**" ? "strong" : "strike";
    assert.equal(doc.firstChild!.textContent, "one two three");
    doc.firstChild!.forEach(node => assert(node.marks.some(item => editorKind(item) === mark), raw));
    const changed = EditorState.create({ doc }).tr.insertText("!", 3).doc;
    parseNative(serializeNative(changed, config), config).firstChild!.forEach(node => assert(node.marks.some(item => editorKind(item) === mark), raw));
  }
});

test("GFM table headers, escaped code pipes and cell line breaks survive edits", () => {
  const raw = "| Head | Other |\n| :--- | ---: |\n| `a\\|b` | first<br>second |\n";
  const doc = parseNative(raw, config);
  assert.equal(doc.firstChild!.firstChild!.firstChild!.attrs.header, true);
  let position = 0;
  doc.descendants((node, pos) => { if (node.isText && node.text === "Head") position = pos; });
  const changed = EditorState.create({ doc }).tr.insertText("!", position + 4).doc;
  const written = serializeNative(changed, config), restored = parseNative(written, config);
  assert.match(written, /`a\\\|b`/);
  assert.match(written, /first<br>second/);
  assert.equal(restored.firstChild!.firstChild!.firstChild!.attrs.nfmAttrs.align, "left");
  let breaks = 0;
  restored.descendants(node => { if (editorKind(node) === "hard_break") breaks++; });
  assert.equal(breaks, 1);
});

test("tagfilter is scoped to HTML tokens and safe previews preserve source after adjacent CRLF edits", () => {
  const raw = "Start\r\n\r\n<script>alert(1)</script>\r\n\r\n`<script>literal</script>`\r\n\r\n```html\r\n<textarea>code</textarea>\r\n```\r\n";
  const doc = parseNative(raw, config);
  assert.equal(doc.child(1).attrs.raw, "<script>alert(1)</script>");
  assert.match(renderRawHtml(doc.child(1).attrs.raw, doc.child(1).attrs.tagfilter), /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  const changed = EditorState.create({ doc }).tr.insertText("!", 6).doc;
  const written = serializeNative(changed, config);
  assert.equal(written, raw.replace("Start", "Start!"));
  const html = renderNotionMarkdown(raw, [], { document: changed });
  assert.match(html, /Start!/);
  assert.doesNotMatch(html, /<script|<textarea/);
  assert.match(html, /&lt;textarea&gt;code&lt;\/textarea&gt;/);
  const disabled = { ...config, extensions: { pipe_tables: false, strikeout: false, task_lists: false, autolink_bare_uris: false } };
  assert.equal(parseNative("~one~ ~~two~~", disabled).firstChild!.firstChild!.marks.length, 0);
  assert.doesNotMatch(renderGfmSyntax("www.example.com", disabled), /<a /);
  assert.doesNotMatch(renderGfmSyntax("- [x] task", disabled), /<input/);
  assert.equal(editorKind(parseNative("| A | B |\n| --- | --- |", disabled).firstChild!), "paragraph");
});

test("whole-fragment safe GFM export preserves HTML containers and rejects active content", () => {
  const raw = '<details>\n<summary>More</summary>\n\n# Heading\n\n**body**\n\n</details>\n\n[local](../README.md)\n\n<img src="javascript:evil()" onerror="evil()">';
  const html = renderNotionMarkdown(raw, [], { document: parseNative(raw, config) });
  assert.match(html, /<details>[\s\S]*<h1>Heading<\/h1>[\s\S]*<strong>body<\/strong>[\s\S]*<\/details>/);
  assert.match(html, /href="\.\.\/README.md"/);
  assert.doesNotMatch(html, /javascript:|onerror/);
  const anchors = '<a name="custom-anchor"></a>\n\n[jump](#custom-anchor)\n\n123456789. Item';
  const anchored = renderNotionMarkdown(anchors, [], { document: parseNative(anchors, config) });
  assert.match(anchored, /id="md-custom-anchor"/);
  assert.match(anchored, /href="#md-custom-anchor"/);
  assert.match(anchored, /start="123456789"/);
  assert.doesNotMatch(parseNative("~one~", { ...config, variant: "commonmark" }).toString(), /strike/);
});

test("HTML containers spanning Markdown blocks have one recoverable source editor", () => {
  const raw = '<details>\n<summary>More</summary>\n\n# Inner\n\n```html\n</details>\n```\n\n<!-- </details> -->\n\n**body**\n\n</details>\n\nTail';
  const doc = parseNative(raw, config);
  assert.equal(doc.childCount, 2);
  assert.equal(editorKind(doc.firstChild!), "html_block");
  assert.equal(doc.firstChild!.attrs.gfmConfig.variant, "gfm");
  assert.match(doc.firstChild!.attrs.raw, /\*\*body\*\*/);
  assert.equal(serializeNative(doc, config), raw);
  const changed = EditorState.create({ doc }).tr.insertText("!", doc.content.size - 1).doc;
  assert.equal(serializeNative(changed, config), raw + "!");
  const changedHtml = EditorState.create({ doc }).tr.setNodeMarkup(0, undefined, {
    ...doc.firstChild!.attrs, raw: doc.firstChild!.attrs.raw.replace("**body**", "**edited**"),
  }).doc;
  const saved = serializeNative(changedHtml, config);
  assert.equal(saved, raw.replace("**body**", "**edited**"));
  assert.match(renderNotionMarkdown(saved, [], { document: changedHtml }), /<strong>edited<\/strong>/);
});
