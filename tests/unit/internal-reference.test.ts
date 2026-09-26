import { editorKind } from "../../src/document/node-identity";
import assert from "node:assert/strict";
import test from "node:test";
import { EditorState } from "prosemirror-state";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec";
import { nodeReference, internalReference, referenceHref, referenceLabel, resolveReferencePage } from "../../src/document/internal-reference";
import { referenceLocations, findReferenceLocation } from "../../src/document/reference-locations";
import { resolveContentObject, resolveMarkObject, contentObject } from "../../src/document/content-objects";
import { extractLinks, htmlDocument } from "../../src/document/document-format";
import { insertMenuItems } from "../../src/editor/insert-menu";
import type { Dialect, SyntaxConfig } from "../../src/markdown-engine/config";
import { parseRoute, routeHash } from "../../src/features/pages/page-navigation";
const config = (variant: Dialect): SyntaxConfig => ({ version: 1, variant, extensions: {} });
const pages = [{ id: "p1", title: "Example" }, { id: "p2", title: "Other" }];

test("page routes preserve encoded heading chains and block fragments", () => {
  for (const fragment of ["Details", "Overview#Details", "^item", "中文标题"]) {
    const route = { kind: "page" as const, id: "p1", fragment };
    assert.deepEqual(parseRoute(routeHash(route)), route);
  }
  assert.equal(parseRoute("#page/p1#%ZZ"), null);
});

test("one reference model and catalog object classify page and location links", () => {
  const doc = parseNative('[[Example]] [[Example#Details]] [[Example#^item]] [[#Details]]\n\n<mention-page url="#page/p1" custom="keep">Old title</mention-page>\n\n[Page](Example.md) [Heading](Example.md#details)', config("notdown"));
  const refs: string[] = [];
  doc.descendants(node => {
    const ref = nodeReference(node);
    if (ref) { refs.push(ref.kind); assert.equal(resolveContentObject(node)?.id, "inline.internal_link"); }
    for (const mark of node.marks) if (editorKind(mark) === "link") assert.equal(resolveMarkObject(mark)?.id, "inline.internal_link");
  });
  assert.deepEqual(refs, ["page", "location", "location", "location", "page"]);
  assert(!contentObject("inline.mention_page_or_data_source")?.adapters.some(a => a.carrier === "page_link"));
});

test("references split fragments, preserve aliases, and never guess duplicate titles", () => {
  for (const [raw, syntax, fragment] of [["Example#Details", "wiki", "Details"], ["#page/p1#%5Eitem", "markdown", "^item"], ["Example.md#details", "markdown", "details"]] as const) {
    const ref = internalReference(raw, syntax)!;
    assert.equal(ref.fragment, fragment);
    assert.equal(resolveReferencePage(ref, pages)?.id, "p1");
    assert.equal(referenceHref(ref, "p1"), "#page/p1#" + encodeURIComponent(fragment));
  }
  assert.equal(resolveReferencePage(internalReference("Example", "wiki")!, [...pages, { id: "p3", title: "Example" }]), undefined);
  assert.equal(resolveReferencePage(internalReference("folder/Example", "wiki")!, pages), undefined);
  const doc = parseNative("[[Example|Custom name]] [[Example]]", config("obsidian"));
  const a = doc.firstChild!.firstChild!;
  assert.equal(referenceLabel(a, nodeReference(a)!, pages[0]), "Custom name");
  assert.equal(referenceLabel(doc.firstChild!.lastChild!, nodeReference(doc.firstChild!.lastChild!)!, { id: "p1", title: "Renamed" }), "Renamed");
});

test("edited Notdown paragraphs retain mixed reference syntax and unknown mention attributes", () => {
  const source = '[[Example#Details|Section]] <mention-page url="#page/p1" custom="keep">Example</mention-page> [More](Example.md#details)';
  const doc = parseNative(source, config("notdown"));
  const state = EditorState.create({ doc });
  const changed = state.tr.insertText(" edited", doc.content.size - 1).doc;
  const output = serializeNative(changed, config("notdown"));
  assert(output.includes("[[Example#Details|Section]]"), output);
  assert(output.includes('custom="keep"'), output);
  assert(output.includes("[More](Example.md#details)"), output);
  assert.equal(serializeNative(doc, config("notdown")), source);
});

test("Obsidian paragraph, structured block and list-line IDs resolve without scanning code", () => {
  const source = '## Details\n\nParagraph ^para\n\n- List line ^item\n- Another\n\n> Quote\n\n^quote\n\n```md\nFake ^code\n```\n\nEscaped \\^literal\n\n`inline ^inline`';
  for (const variant of ["obsidian", "notdown"] as const) {
    const doc = parseNative(source, config(variant));
    const locations = referenceLocations(doc);
    assert.deepEqual(locations.filter(l => l.kind === "block").map(l => l.fragment), ["^para", "^item", "^quote"], variant);
    assert(findReferenceLocation(doc, internalReference("#^item", "wiki")!));
    assert.equal(serializeNative(doc, config(variant)), source);
    const state = EditorState.create({ doc });
    const changed = state.tr.insertText("Updated ", 1).doc;
    const written = serializeNative(changed, config(variant));
    assert.deepEqual(referenceLocations(parseNative(written, config(variant))).filter(l => l.kind === "block").map(l => l.fragment), ["^para", "^item", "^quote"]);
  }
  assert.equal(referenceLocations(parseNative(source, config("typora"))).filter(l => l.kind === "block").length, 0);
});

test("heading chains, Typora fragments and explicit HTML anchors use the same location index", () => {
  const doc = parseNative('## Overview\n\n### Details\n\n<a id="custom-anchor"></a> Target', config("obsidian"));
  assert(findReferenceLocation(doc, internalReference("Example#Overview#Details", "wiki")!));
  assert(findReferenceLocation(doc, internalReference("#details")!));
  assert(findReferenceLocation(doc, internalReference("#custom-anchor")!));
  assert.equal(findReferenceLocation(doc, internalReference("#missing")!), undefined);
});

test("backlinks unify mentions, Wiki references and Markdown paths without fragment pollution", () => {
  assert.deepEqual(extractLinks('[[Example#Details]] [[Example#^item]] [Other](Other.md#anchor) <mention-page url="#page/p1">Example</mention-page> [local](#details) [external](https://example.com)', "markdown", config("notdown"), pages), ["p1", "p2"]);
});

test("insert menu exposes page and location links across dialects", () => {
  for (const variant of ["typora", "obsidian", "notion-markdown", "notdown", "commonmark"] as const) {
    const items = insertMenuItems(config(variant));
    assert.equal(items.find(i => i[0] === "page_link")?.[2], "Page link");
    assert.equal(items.find(i => i[0] === "location_link")?.[2], "Location link");
    assert(!items.some(i => i[0] === "mention" || i[0] === "link"));
  }
});

test("HTML export keeps location and explicit display text", () => {
  const html = htmlDocument("Test", "[[Example#Details|Section]]", pages, "markdown", config("obsidian"));
  assert(html.includes('href="#page/p1#Details"'), html);
  assert(html.includes("Section"), html);
});
