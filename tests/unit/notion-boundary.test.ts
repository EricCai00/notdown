import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "prosemirror-state";
import { editorSchema as schema } from "../../src/document/editor-schema";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec";
import { enabled, supportsOption, commandEnabled, type SyntaxConfig } from "../../src/markdown-engine/config";
import { getContentCapabilities } from "../../src/document/content-objects";
import { objectVariantState } from "../../src/catalog/catalog-relations";
import { renderNotionMarkdown } from "../../src/document/document-format";

const official: SyntaxConfig = { version: 1, variant: "notion-markdown", extensions: {} };
const notdown: SyntaxConfig = { ...official, variant: "notdown" };
const html = (source: string, config = official) => renderNotionMarkdown(source, [], { document: parseNative(source, config) });

test("NFM keeps inline images and autolinks literal in paragraphs, styles and tables", () => {
  for (const line of [
    'Before ![alt](https://example.com/a.png) after',
    'Before <https://example.com> <a@example.com> https://example.com after',
    '<span color="red">Before ![alt](a.png) <https://example.com></span>',
    '<table><tr><td>![alt](a.png) <https://example.com></td></tr></table>',
    '- ![alt](a.png)', '> ![alt](a.png)', '# ![alt](a.png)',
  ]) {
    const source = line + '\r\n\r\nTail';
    for (const extensions of [{}, { autolink_bare_uris: true, raw_html: true }] as Record<string, boolean>[]) {
      const config = { ...official, extensions };
      const doc = parseNative(source, config);
      doc.check();
      assert.doesNotMatch(html(source, config), /<img\b|<a\b/);
      assert.equal(serializeNative(doc, config), source);
      const edited = EditorState.create({ doc }).tr.insertText(" edited", doc.content.size - 1).doc;
      assert.equal(serializeNative(edited, config), source + " edited");
    }
  }
  assert.match(html('Before ![alt](a.png) <https://example.com> https://example.com', notdown), /<img\b/);
  assert.match(html('<https://example.com>', notdown), /<a\b/);
});

test("NFM images remain media blocks, including caption, color and child blocks", () => {
  for (const source of ['![Caption](a.png) {color="blue"}', 'Parent\n\t![Caption](a.png)', '- Parent\n\t![Caption](a.png)', '> Parent\n\t![Caption](a.png)', '<callout>\n\t![Caption](a.png)\n</callout>']) {
    const doc = parseNative(source, official);
    assert.match(html(source), /<img\b/);
    assert.equal(serializeNative(doc, official), source);
    const generated = serializeNative(schema.nodes.doc.create(null, doc.content), official);
    assert.match(html(generated), /<img\b/);
  }
});

test("NFM supports explicit links and page mentions, without wiki or heading slug semantics", () => {
  const source = '[Page](https://notion.so/page) [Fragment](#some-heading) <mention-page url="https://notion.so/page">Page</mention-page> [[Page]]\n# Some heading';
  const doc = parseNative(source, official);
  const result = html(source);
  assert.match(result, /href="https:\/\/notion.so\/page"/);
  assert.match(result, /href="#some-heading"/);
  assert.match(result, /class="page-mention"/);
  assert.match(result, /\[\[Page\]\]/);
  assert.doesNotMatch(result, /id="(?:md-)?some-heading"/);
  assert.equal(serializeNative(doc, official), source);
  assert.equal(getContentCapabilities("inline.internal_link", official).available, true);
  for (const id of ["inline.image", "inline.autolink"]) {
    assert.equal(objectVariantState(id, "notion-markdown").status, "unavailable");
    assert.equal(objectVariantState(id, "notdown").status, "default");
  }
});

test("NFM preserves unsupported blocks without applying their semantics or changing adjacent edits", () => {
  for (const unsupported of [
    '# Plain heading\n\tChild', '1. [x] Ordered task', '~~~js\n<mention-page url="x"/>\n~~~',
    '<table><tr><th>Header</th></tr></table>', '<span class="smallcaps">Text</span>',
    '![Caption](a.png "Title")',
  ]) {
    const source = unsupported.replace(/\n/g, "\r\n") + "\r\n\r\nTail";
    const doc = parseNative(source, official);
    assert.equal(doc.firstChild!.type.name, "opaque_block", unsupported);
    assert.equal(serializeNative(doc, official), source);
    const edited = EditorState.create({ doc }).tr.insertText(" edited", doc.content.size - 1).doc;
    assert.equal(serializeNative(edited, official), source + " edited");
  }
  const toggle = parseNative('# Toggle {toggle="true"}\n\tChild', official);
  assert.equal(toggle.firstChild!.type.name, "nested_block");
  assert.equal(toggle.firstChild!.firstChild!.attrs.toggle, true);
});

test("NFM citation URLs do not interpret Markdown footnote labels, and honor their switch", () => {
  const source = 'Citation [^https://example.com] and literal [^note]';
  const doc = parseNative(source, official);
  let citations = 0;
  doc.descendants(node => { if (node.type.name === "citation") citations++; });
  assert.equal(citations, 1);
  assert.match(doc.textContent, /\[\^note\]/);
  assert.equal(parseNative(source, { ...official, extensions: { notion_mentions: false } }).firstChild!.type.name, "opaque_block");
  assert.equal(serializeNative(doc, official), source);
});

test("NFM rejects unsupported generated inline structures while Notdown retains them", () => {
  const image = schema.nodes.image.create({ src: "a.png", alt: "A" });
  const doc = schema.nodes.doc.create(null, schema.nodes.paragraph.create(null, [schema.text("Before "), image]));
  assert.throws(() => serializeNative(doc, official), /not documented/);
  assert.match(serializeNative(doc, notdown), /!\[A\]\(a.png\)/);
  const summary = schema.nodes.doc.create(null, schema.nodes.toggle_block.create(null,
    schema.nodes.paragraph.create(null, image)));
  assert.throws(() => serializeNative(summary, official), /not documented/);
  const markDoc = schema.nodes.doc.create(null, schema.nodes.paragraph.create(null,
    schema.text("Small", [schema.marks.small_caps.create()])));
  assert.throws(() => serializeNative(markDoc, official), /not documented/);
});

test("NFM does not accept a nonofficial extension through an early option branch", () => {
  for (const name of ["gutenberg", "raw_html", "autolink_bare_uris", "wikilinks_title_after_pipe", "auto_identifiers", "footnotes"]) {
    const config = { ...official, extensions: { [name]: true } };
    assert.equal(supportsOption(config, name), false, name);
    assert.equal(enabled(config, name), false, name);
  }
  assert.equal(commandEnabled(official, "ordered_task"), false);
});
