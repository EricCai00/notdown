import { editorKind } from "../../src/document/node-identity";
import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "prosemirror-state";
import type { Node as PMNode } from "prosemirror-model";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec";
import { type SyntaxConfig } from "../../src/markdown-engine/config";
import { insertMenuItems, insertGroups } from "../../src/editor/insert-menu";
import { icons } from "../../src/shared/icons";

const config: SyntaxConfig = { version: 1, variant: "notdown", extensions: {} };
const types = (doc: PMNode) => {
  const result: string[] = [];
  doc.descendants(node => { result.push(editorKind(node)); result.push(...node.marks.map(mark => editorKind(mark))); });
  return result;
};
const samples: [string, string][] = [
  ["definition_list", "Term\n: Definition"],
  ["footnote", "[^note]: Note"],
  ["line_block", "| First\n| Second"],
  ["fenced_div", "::: {.box}\nEditable\n:::"],
  ["syntax_block", "```mermaid\ngraph LR\nA-->B\n```"],
  ["callout", "> [!TIP]\n> Tip"],
  ["table", "| A | B |\n|---|---|\n| One | Two |"],
  ["example_list", "(@example) Example"],
];

test("Notdown mixes Markdown blocks inside Notion containers, edits and reopens without losing carriers", () => {
  for (const [type, sample] of samples) {
    const source = '<callout icon="💡" future="keep">\r\n' + sample.split("\n").map(line => "\t" + line).join("\r\n") + '\r\n\r\n\tTail\r\n</callout>\r\n\r\n<future keep="yes">raw</future>';
    const doc = parseNative(source, config); doc.check();
    assert(types(doc).includes(type), type);
    assert.equal(serializeNative(doc, config), source);
    let pos = -1;
    doc.descendants((node, at) => { if (node.isText && node.text === "Tail") pos = at; });
    assert(pos > 0, type);
    const edited = EditorState.create({ doc }).tr.insertText("New ", pos).doc;
    const written = serializeNative(edited, config), reopened = parseNative(written, config);
    reopened.check();
    assert(types(reopened).includes(type), written);
    assert.match(written, /future="keep"/);
    assert.match(written, /<future keep="yes">raw<\/future>$/);
    assert(reopened.textContent.includes("New Tail"));
  }
});

test("Notdown combines Notion colors and mentions with Markdown marks and preserves them after a real edit", () => {
  const source = '<span color="red" future="yes">**Bold** ~sub~ ^sup^ ==mark== <span underline="true">under</span> <span color="blue">inner</span></span> <mention-date/> [span]{.custom} ^[note]';
  const doc = parseNative(source, config);
  for (const type of ["color", "strong", "subscript", "superscript", "highlight", "underline", "mention", "native_span", "inline_note"]) assert(types(doc).includes(type), type);
  const edited = EditorState.create({ doc }).tr.insertText("!", doc.content.size - 1).doc;
  const written = serializeNative(edited, config), reopened = parseNative(written, config);
  for (const type of ["color", "strong", "subscript", "superscript", "highlight", "underline", "mention", "native_span", "inline_note"]) assert(types(reopened).includes(type), type + written);
  assert.match(written, /future="yes"/);
  assert.equal(reopened.textContent, edited.textContent);
  for (const parsed of [doc, reopened]) parsed.descendants(node => {
    if (node.text === "inner") assert.equal(node.marks.find(mark => editorKind(mark) === "color")?.attrs.color, "blue");
  });
});

test("Notdown keeps disabled extensions, unfinished carriers, code and unknown XML recoverable", () => {
  const source = '```md\nTerm\n: Definition\n==literal==\n<callout/>\n```\n\n::: {.unfinished}\nKeep';
  const doc = parseNative(source, config);
  assert.equal(editorKind(doc.firstChild!), "code_block");
  assert(!types(doc).includes("definition_list"));
  assert(!types(doc).includes("highlight"));
  assert.equal(editorKind(doc.lastChild!), "opaque_block");
  assert.equal(serializeNative(doc, config), source);
  const disabled = { ...config, extensions: { definition_lists: false, highlight: false } };
  const raw = 'Term\n: Definition\n\n==literal==';
  const off = parseNative(raw, disabled);
  assert(!types(off).includes("definition_list")); assert(!types(off).includes("highlight"));
  assert.equal(serializeNative(off, disabled), raw);
  assert(types(parseNative(raw, config)).includes("definition_list"));
});

test("Notdown exposes H5/H6 without changing the Notion preset", () => {
  for (const level of [5, 6]) {
    const source = "#".repeat(level) + " Title";
    const doc = parseNative(source, config);
    assert.equal(doc.firstChild!.attrs.level, level);
    const edited = EditorState.create({ doc }).tr.insertText("!", doc.content.size - 1).doc;
    assert.equal(parseNative(serializeNative(edited, config), config).firstChild!.attrs.level, level);
    assert.equal(parseNative(source, { ...config, variant: "notion-markdown" }).firstChild!.attrs.level, 4);
  }
});

test("Notdown keeps Markdown attributes, HTML, references, space lists and explicit line breaks alongside tab nesting", () => {
  const source = '### Header {#anchor .title}\n\nText <kbd>Ctrl</kbd>\n\n[ref]: https://example.com\n\n[ref]\n\n1. Parent\n  1. Child\n\nTab parent\n\tTab child\n\nFirst\\\nSecond\nThird';
  const doc = parseNative(source, config); doc.check();
  assert.equal(doc.firstChild!.attrs.markdownAttrs.id, "anchor");
  for (const name of ["html_inline", "link", "ordered_list", "nested_block", "hard_break"]) assert(types(doc).includes(name), name);
  let lists = 0; doc.descendants(node => { if (editorKind(node) === "ordered_list") lists++; });
  assert.equal(lists, 2);
  assert.equal(doc.lastChild!.textContent, "Third");
  assert.equal(serializeNative(doc, config), source);
  const edited = EditorState.create({ doc }).tr.insertText("!", doc.content.size - 1).doc;
  const written = serializeNative(edited, config);
  assert(written.startsWith(source.slice(0, -"Third".length)));
  assert.equal(parseNative(written, config).lastChild!.textContent, "Third!");
});

test("every insertion has a registered icon and group; disabled commands are absent", () => {
  const items = insertMenuItems(config);
  assert.equal(items.find(item => item[0] === "tabs")?.[5], "Notion advanced");
  assert.equal(items.find(item => item[0] === "html_embed")?.[5], "Notion embeds");
  assert.equal(items.find(item => item[0] === "embed")?.[5], "Notion embeds");
  assert.equal(items.find(item => item[0] === "footnote")?.[5], "Markdown inline");
  assert.equal(items.find(item => item[0] === "footnote")?.[1], "footnote");
  assert(!items.some(item => item[0] === "inline_note"));
  assert.equal(new Set(items.map(item => item[0])).size, items.length);
  for (const [id, icon, , , , group] of items) {
    const name = icon.split("-").map(part => part[0].toUpperCase() + part.slice(1)).join("");
    assert(Object.hasOwn(icons, name), id + ": " + name);
    assert(insertGroups.includes(group), id);
  }
  for (const id of ["footnote", "definitions", "diagram", "inline_equation", "color", "subscript"]) assert(items.some(item => item[0] === id), id);
  const off = insertMenuItems({ ...config, extensions: { footnotes: false, notion_colors: false, notion_underline: false, diagrams: false } });
  for (const id of ["footnote", "color", "background", "underline", "diagram"]) assert(!off.some(item => item[0] === id), id);
});
