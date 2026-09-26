import assert from "node:assert/strict";
import test from "node:test";
import { EditorState, TextSelection } from "prosemirror-state";
import { editorSchema as schema } from "../../src/document/editor-schema";
import { pageInputMatch, pageInputChoices, insertPageInput } from "../../src/editor/page-reference-input";
import { commandEnabled, type SyntaxConfig } from "../../src/markdown-engine/config";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec";
import { editorKind } from "../../src/document/node-identity";

function state(text: string, code = false) {
  const doc = schema.nodes.doc.create(null, schema.nodes[code ? "block.code_block" : "block.paragraph"].create(null, schema.text(text)));
  return EditorState.create({ schema, doc, selection: TextSelection.create(doc, text.length + 1) });
}
test("page completion recognizes Unicode names and leaves syntax, code and escapes alone", () => {
  for (const [text, trigger, query] of [["[[", "[[", ""], ["See [[中文 页面", "[[", "中文 页面"], ["+", "+", ""], ["See +中文 页面", "+", "中文 页面"], ["@中文 页面", "@", "中文 页面"]]) {
    const match = pageInputMatch(state(text), trigger === "@");
    assert.equal(match?.trigger, trigger); assert.equal(match?.query, query);
    assert.equal(match?.from, text.length + 1 - trigger.length - query.length);
  }
  for (const text of ["\\[[Name", "[[Name]]", "[[Page#Heading", "[[Page|Alias", "a+b", "+ ", "`[[Code", "(@example"]) assert.equal(pageInputMatch(state(text)), null, text);
  assert.equal(pageInputMatch(state("[[Code", true)), null);
  assert.equal(pageInputMatch(state("mail@site"), true), null);
  const marked = state("[[Code");
  assert.equal(pageInputMatch(marked.apply(marked.tr.addMark(1, 7, schema.marks.code.create()))), null);
  assert.equal(pageInputMatch(marked.apply(marked.tr.addMark(1, 7, schema.marks.link.create({ href: "https://example.com" })))), null);
});
test("page choices hide trashed ancestors, retain duplicate titles and prefer exact names", () => {
  const pages = [{ id: "long", title: "Note more" }, { id: "b", title: "Note" }, { id: "a", title: "Note" }, { id: "trash", title: "Note", trashed: true }, { id: "child", title: "Note", parent: "trash" }];
  assert.deepEqual(pageInputChoices(pages, "note").map(page => page.id), ["a", "b", "long"]);
});
test("completions round-trip in Wiki, official Notion and plain Markdown without private syntax", () => {
  for (const variant of ["notdown", "notion-markdown", "commonmark"] as const) {
    const config: SyntaxConfig = { version: 1, variant, extensions: {} };
    const before = state("See [[Destination");
    const tr = insertPageInput(before, pageInputMatch(before)!, { id: "stable-page", title: "Destination" }, name => commandEnabled(config, name));
    const source = serializeNative(tr.doc, config);
    const after = parseNative(source, config);
    assert.ok(source.includes("stable-page"), source);
    if (variant === "notion-markdown") { assert.ok(source.includes("<mention-page")); assert.ok(!source.includes("[[")); }
    if (variant === "commonmark") { assert.ok(source.includes("](#page/stable-page)")); assert.equal(editorKind(after.firstChild!.lastChild!), "text"); }
    else assert.equal(editorKind(after.firstChild!.lastChild!), "page_link");
    assert.equal(tr.selection.from, tr.doc.content.size - 1);
  }
});
test("choosing a Wiki completion consumes existing closing brackets but preserves adjacent text", () => {
  const full = state("[[Dest]] tail");
  const before = full.apply(full.tr.setSelection(TextSelection.create(full.doc, 7)));
  const tr = insertPageInput(before, pageInputMatch(before)!, { id: "target", title: "Dest" }, () => true);
  assert.equal(tr.doc.textContent, " tail");
  assert.equal(tr.doc.firstChild!.firstChild!.attrs.target, "target");
});
