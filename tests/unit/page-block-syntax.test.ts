import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "prosemirror-state";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec";
import { dialects, commandEnabled, type SyntaxConfig } from "../../src/markdown-engine/config";
import { parseNotionMarkdown } from "../../src/document/notion-markdown";
import { DocumentSession } from "../../src/markdown-engine/session";
import { getContentCapabilities } from "../../src/document/content-objects";
const config = (variant: SyntaxConfig["variant"]): SyntaxConfig => ({ version: 1, variant, extensions: {} });
const child = '<page url="#page/child">Child</page>';
const link = '<page-link url="#page/child" future="keep">Link to the same child</page-link>';

test("page and page-link encode distinct block types without ownership context or role", () => {
  const c = config("notdown");
  const source = child + '\r\n\r\n' + link + '\r\n\r\n<mention-page url="#page/child">Mention</mention-page>\r\n';
  const session = new DocumentSession(source, c);
  const doc = session.snapshot.doc;
  assert.equal(doc.child(0).type.name, "block.child_page");
  assert.equal(doc.child(1).type.name, "block.link_to_page");
  assert.equal(doc.child(2).firstChild!.type.name, "inline.internal_link");
  assert.equal(serializeNative(doc, c), source);
  const state = EditorState.create({ doc });
  const at = doc.child(0).nodeSize;
  const edited = state.tr.setNodeMarkup(at, undefined, { ...doc.child(1).attrs, label: "Edited link" }).doc;
  session.documentChanged(edited);
  assert.ok(session.snapshot.source.includes('<page-link url="#page/child" future="keep">Edited link</page-link>'));
  assert.ok(session.snapshot.source.startsWith(child));
  assert.ok(!session.snapshot.source.includes("role="));
  session.undo(); assert.equal(session.snapshot.source, source);
  session.redo(); assert.equal(session.snapshot.doc.child(1).type.name, "block.link_to_page");
  session.configure(config("notion-markdown"));
  assert.equal(session.snapshot.doc.child(1).type.name, "block.unsupported");
  session.configure(c);
  assert.equal(session.snapshot.doc.child(1).type.name, "block.link_to_page");
});

test("page-link is Notdown-only even with explicit overrides; official serialization rejects it", () => {
  for (const { id } of dialects) {
    const c = { ...config(id), extensions: { notion_pages: true } };
    const source = link + '\n\nTail';
    const doc = parseNative(source, c);
    const links: string[] = [];
    doc.descendants(node => { if (node.type.name === "block.link_to_page") links.push(node.type.name); });
    assert.equal(links.length, id === "notdown" ? 1 : 0, id);
    assert.equal(commandEnabled(c, "link"), id === "notdown", id);
    assert.equal(getContentCapabilities("block.link_to_page", c).available, id === "notdown", id);
    const edited = EditorState.create({ doc }).tr.insertText("!", doc.content.size - 1).doc;
    assert.ok(serializeNative(edited, c).startsWith(link), id);
  }
  const doc = parseNative(link, config("notdown"));
  assert.throws(() => serializeNative(doc, config("notion-markdown")), /only.*Notdown/);
  assert.equal(parseNotionMarkdown(link).firstChild!.type.name, "block.unsupported");
  assert.equal(parseNotionMarkdown(child).firstChild!.type.name, "block.child_page");
});

test("official child pages, old role attributes and unknown link blocks retain source", () => {
  const unknown = '<unknown url="https://www.notion.so/parent#source-block" alt="link_to_page"/>';
  const source = '<page role="child" url="#page/missing" future="keep">Child</page>\r\n\r\n' + unknown + '\r\n';
  for (const variant of ["notdown", "notion-markdown"] as const) {
    const c = config(variant), doc = parseNative(source, c);
    assert.equal(doc.firstChild!.type.name, "block.child_page");
    assert.equal(doc.child(1).type.name, "block.unsupported");
    assert.equal(doc.child(1).attrs.alt, "link_to_page");
    assert.equal(serializeNative(doc, c), source);
  }
});

test("nested page-link edits preserve sibling page tags, fences and unknown containers", () => {
  const c = config("notdown");
  const examples = '```xml\n' + link + '\n```\n\n<future>\n' + link + '\n</future>\n';
  const source = '<columns>\n\t<column>\n\t\t' + child + '\n\t\t' + link + '\n\t</column>\n\t<column>\n\t\tOther\n\t</column>\n</columns>\n\n' + examples;
  const doc = parseNative(source, c);
  let position = -1;
  doc.descendants((node, pos) => { if (node.type.name === "block.link_to_page") position = pos; });
  assert.ok(position >= 0);
  const node = doc.nodeAt(position)!;
  const edited = EditorState.create({ doc }).tr.setNodeMarkup(position, undefined, { ...node.attrs, label: "Edited" }).doc;
  const saved = serializeNative(edited, c);
  assert.ok(saved.includes(child));
  assert.ok(saved.includes('<page-link url="#page/child" future="keep">Edited</page-link>'));
  assert.ok(saved.endsWith(examples));
});

test("v2 page-link blocks inside space-indented lists retain identity, labels and source after edits", () => {
  const c: SyntaxConfig = { ...config("notdown"), notionVersion: "v2" };
  const source = [
    '- Develop a note app',
    '  <page url="#page/child">', '  Child', '  </page>', '',
    '  ' + link, '',
    '  - Nested idea', '',
    'Tail', '',
  ].join('\r\n');
  const doc = parseNative(source, c);
  doc.check();
  const item = doc.firstChild!.firstChild!;
  assert.equal(item.child(1).type.name, "block.child_page");
  assert.equal(item.child(2).type.name, "block.link_to_page");
  assert.equal(item.child(2).attrs.target, "child");
  assert.equal(item.child(2).attrs.label, "Link to the same child");
  assert.equal(item.child(2).attrs.nfmAttrs.future, "keep");
  assert.equal(item.child(3).firstChild!.textContent, "Nested idea");
  assert.equal(serializeNative(doc, c), source);
  let position = -1;
  doc.descendants((node, pos) => { if (node.type.name === "block.link_to_page") position = pos; });
  const edited = EditorState.create({ doc }).tr.setNodeMarkup(position, undefined, { ...item.child(2).attrs, label: "Updated & [literal]" }).doc;
  const saved = serializeNative(edited, c), reopened = parseNative(saved, c);
  reopened.check();
  const links: string[] = [];
  reopened.descendants(node => { if (node.type.name === "block.link_to_page") links.push(node.attrs.label); });
  assert.deepEqual(links, ["Updated & [literal]"]);
  assert.ok(saved.includes('future="keep"'));
  assert.ok(saved.includes('<page url="#page/child">'));
  assert.ok(saved.endsWith('Tail\r\n'));
});

test("v2 page-link carriers remain Notdown-only and never consume literal or malformed examples", () => {
  const source = [
    '- Parent', '', '  ' + link, '',
    '  ```xml', '  ' + link, '  ```', '',
    '  `' + link + '`', '',
    '  <future>', '  ' + link, '  </future>', '',
    '  \\' + link, '',
    '  <page-link url="#page/child">Unclosed',
  ].join('\n');
  for (const variant of ["notdown", "notion-markdown"] as const) {
    const c: SyntaxConfig = { ...config(variant), notionVersion: "v2", extensions: { notion_pages: true } };
    const doc = parseNative(source, c);
    doc.check();
    const links: string[] = [];
    doc.descendants(node => { if (node.type.name === "block.link_to_page") links.push(node.attrs.label); });
    assert.deepEqual(links, variant === "notdown" ? ["Link to the same child"] : []);
    assert.equal(serializeNative(doc, c), source);
    const edited = EditorState.create({ doc }).tr.insertText("!", 2).doc;
    const reopened = parseNative(serializeNative(edited, c), c);
    const examples: string[] = [], reopenedLinks: string[] = [];
    reopened.descendants(node => {
      if (node.type.name === "block.code_block") examples.push(node.textContent);
      if (node.type.name === "block.link_to_page") reopenedLinks.push(node.attrs.label);
    });
    assert.deepEqual(examples, [link]);
    assert.deepEqual(reopenedLinks, links);
  }
});

test("v2 page links render in list and quote carriers while retaining literal titles", () => {
  const label = "[Literal] **title** &amp; &lt;tag&gt;";
  const carrier = `<page-link url="#page/child" future="keep">${label}</page-link>`;
  const wrappers = [
    carrier,
    '- Parent\n\t' + carrier,
    '1. Parent\n\n   ' + carrier,
    '> Parent\n>\n> ' + carrier,
    '<ul><li>Parent\n\n' + carrier + '</li></ul>',
    '<callout>\n' + carrier + '\n</callout>',
  ];
  for (const source of wrappers) {
    const c: SyntaxConfig = { ...config("notdown"), notionVersion: "v2" };
    const doc = parseNative(source, c), labels: string[] = [];
    doc.check();
    doc.descendants(node => { if (node.type.name === "block.link_to_page") labels.push(node.attrs.label); });
    assert.deepEqual(labels, ["[Literal] **title** & <tag>"], source);
    assert.equal(serializeNative(doc, c), source);
    const disabled = parseNative(source, { ...c, extensions: { notion_pages: false } });
    disabled.descendants(node => { assert.notEqual(node.type.name, "block.link_to_page"); });
  }
});
