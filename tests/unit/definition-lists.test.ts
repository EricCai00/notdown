import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "prosemirror-state";
import type { Node as PMNode } from "prosemirror-model";
import { parseFragment, type DefaultTreeAdapterMap } from "parse5";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec";
import type { SyntaxConfig } from "../../src/markdown-engine/config";
import { htmlDocument } from "../../src/document/document-format";
import { isEditorKind } from "../../src/document/node-identity";

const fixture = "Compact\n:   First **part**.\n\n    Second part.\n\n:   Another definition.\n\nLoose\n\n~   First paragraph.\n\n    Second paragraph.\n\n~   Another loose definition.\n\nCompact again\n~   Last definition.";
function descriptions(doc: PMNode) {
  const result: PMNode[] = [];
  doc.descendants(node => { if (isEditorKind(node, "definition_description")) result.push(node); });
  return result;
}
function htmlDefinitions(source: string, config: SyntaxConfig) {
  const html = htmlDocument("Definitions", source, [], "markdown", config);
  const definitions: { tags: string[]; text: string }[] = [];
  type HtmlNode = DefaultTreeAdapterMap["childNode"] | DefaultTreeAdapterMap["documentFragment"];
  const text = (n: HtmlNode): string => "value" in n ? n.value : "childNodes" in n ? n.childNodes.map(text).join("") : "";
  function visit(node: HtmlNode) {
    if ("tagName" in node && node.tagName === "dd") {
      definitions.push({ tags: node.childNodes.flatMap(n => "tagName" in n ? [n.tagName] : []), text: text(node) });
    }
    if ("childNodes" in node) node.childNodes.forEach(visit);
  }
  visit(parseFragment(html));
  return definitions;
}

for (const variant of ["notdown", "markdown", "rmarkdown"] as const) {
  const config: SyntaxConfig = { version: 1, variant, extensions: {} };
  test(`${variant}: term spacing controls all definitions, including later compact terms`, () => {
    for (const newline of ["\n", "\r\n"]) {
      const source = fixture.replaceAll("\n", newline);
      const doc = parseNative(source, config);
      doc.check();
      assert.deepEqual(descriptions(doc).map(n => n.attrs.tight), [true, true, false, false, true]);
      assert.deepEqual(descriptions(doc).map(n => n.attrs.marker), [":", ":", "~", "~", "~"]);
      assert.equal(descriptions(doc)[0].childCount, 2, "editable source blocks remain available");
      assert.equal(serializeNative(doc, config), source);
      let editPos = 0;
      doc.descendants((n, pos) => { if (n.isText && n.text === "First paragraph.") editPos = pos; });
      const changed = EditorState.create({ doc }).tr.insertText("EDIT ", editPos).doc;
      const saved = serializeNative(changed, config);
      assert.match(saved, /Loose\r?\n\r?\n~   EDIT First paragraph\./);
      assert.deepEqual(descriptions(parseNative(saved, config)).map(n => n.attrs.tight), [true, true, false, false, true]);
      assert.deepEqual(descriptions(parseNative(saved, config)).map(n => n.attrs.marker), [":", ":", "~", "~", "~"]);
      const defs = htmlDefinitions(saved, config);
      assert.deepEqual(defs.map(d => d.tags), [["strong"], [], ["p", "p"], ["p"], []]);
      assert.match(defs[0].text, /First part\.\s+Second part\./);
    }
  });

  test(`${variant}: compact definitions retain nested lists, code and independent nested definitions`, () => {
    const source = "Outer\n:   Before.\n\n    - A list item\n\n    ```text\n    Term\n    : literal\n    ```\n\n    Inner\n\n    :   Inner paragraph.\n\n        Another inner paragraph.\n\n    After.";
    const doc = parseNative(source, config);
    doc.check();
    assert.deepEqual(descriptions(doc).map(n => n.attrs.tight), [true, false]);
    const defs = htmlDefinitions(source, config);
    assert.deepEqual(defs[0].tags, ["ul", "pre", "dl"]);
    assert.deepEqual(defs[1].tags, ["p", "p"]);
    assert.match(defs[0].text, /Term\n: literal/);
    const quoted = fixture.split("\n").map(line => "> " + line).join("\n");
    if (variant !== "notdown")
      assert.deepEqual(descriptions(parseNative(quoted, config)).map(n => n.attrs.tight), [true, true, false, false, true]);
    assert.equal(serializeNative(doc, config), source);
  });
}

test("definition spacing does not enable disabled syntax or change PHP Extra paragraph behavior", () => {
  const php: SyntaxConfig = { version: 1, variant: "markdown_phpextra", extensions: {} };
  assert.equal(descriptions(parseNative(fixture, php))[0].attrs.tight, null);
  assert.deepEqual(htmlDefinitions(fixture, php)[0].tags, ["p", "p"]);
  for (const variant of ["notdown", "markdown"] as const) {
    const config: SyntaxConfig = { version: 1, variant, extensions: { definition_lists: false } };
    assert.equal(descriptions(parseNative(fixture, config)).length, 0);
    assert.equal(serializeNative(parseNative(fixture, config), config), fixture);
    assert.equal(descriptions(parseNative("```md\n" + fixture + "\n```", { ...config, extensions: {} })).length, 0);
  }
});
