import { editorKind } from "../../src/document/node-identity";
import { localObjectPlugins } from "../../src/markdown-engine/presets";
import assert from "node:assert/strict";
import test from "node:test";
import { EditorState } from "prosemirror-state";
import { objectSamples } from "../../src/document/object-model";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec";
import { contentObject, resolveContentObject } from "../../src/document/content-objects";
import { enabled, normalizeSyntax } from "../../src/markdown-engine/config";
import { catalogExtensions } from "../../src/catalog/catalog-relations";

test("Notion extension migration preserves old configurations and gives new keys precedence", () => {
  const config = { version: 1 as const, variant: "notion-markdown" as const, extensions: { notdown_callouts: false, notdown_toc: true, notion_toc: false, future_option: true } };
  assert.equal(enabled(config, "notion_callouts"), false);
  assert.equal(enabled(config, "notdown_toc"), false);
  assert.deepEqual(normalizeSyntax(config).extensions, { notion_callouts: false, notion_toc: false, future_option: true });
  let outside = false;
  for (const entry of catalogExtensions) { if (entry.status === "out-of-scope") outside = true; else assert.equal(outside, false); }
});
for (const [name, sample] of Object.entries(objectSamples)) test(`${name} is editable, preserves source, unknown attributes and survives reopening`, () => {
  for (const variant of ["notdown"] as const) {
    const config = { version: 1 as const, variant, extensions: Object.fromEntries(Object.values(localObjectPlugins).map(id => [id, true])) };
    const source = sample.replace(/\n/g, "\r\n") + "\r\n\r\nTail";
    let state = EditorState.create({ doc: parseNative(source, config) }); state.doc.check();
    assert.equal(editorKind(state.doc.firstChild!), name);
    assert.equal(resolveContentObject(state.doc.firstChild!)?.id, "block." + name);
    assert.equal(contentObject("block." + name)?.status, "implemented");
    assert.equal(serializeNative(state.doc, config), source);
    state = state.apply(state.tr.setNodeMarkup(0, undefined, { ...state.doc.firstChild!.attrs, nfmAttrs: { ...state.doc.firstChild!.attrs.nfmAttrs, custom: "keep" } }));
    const result = serializeNative(state.doc, config), reopened = parseNative(result, config);
    assert.equal(reopened.firstChild!.attrs.nfmAttrs.custom, "keep", result);
    assert.equal(editorKind(reopened.firstChild!), name, result);
    assert.equal(reopened.lastChild!.textContent, "Tail");
  }
});

test("incomplete local objects, trailing text and code fences remain recoverable", () => {
  for (const variant of ["notdown"] as const) {
    const config = { version: 1 as const, variant, extensions: Object.fromEntries(Object.values(localObjectPlugins).map(id => [id, true])) };
    for (const source of ['<bookmark title="Card"/> trailing text', '<tabs>\n<tab title="First">\nUnclosed', '<tabs>\nUnexpected content\n</tabs>']) {
      const doc = parseNative(source, config); assert.equal(editorKind(doc.firstChild!), "opaque_block");
      assert.equal(doc.firstChild!.attrs.raw, source); assert.equal(serializeNative(doc, config), source);
    }
    const source = '<ai-block prompt="Test">\n```html\n</ai-block>\n```\n\nKept\n</ai-block>';
    const doc = parseNative(source, config); assert.equal(editorKind(doc.firstChild!), "ai_block");
    assert.equal(doc.firstChild!.lastChild!.textContent, "Kept"); assert.equal(serializeNative(doc, config), source);
  }
});

test("local object bodies inside quotes keep their container boundaries", () => {
  const config = { version: 1 as const, variant: "notdown" as const, extensions: Object.fromEntries(Object.values(localObjectPlugins).map(id => [id, true])) };
  const source = '> Quote\n\t<ai-block prompt="Test">\n\t\tInner content\n\t</ai-block>\n\nTail';
  const doc = parseNative(source, config); assert.equal(editorKind(doc.firstChild!), "blockquote");
  assert.equal(editorKind(doc.firstChild!.child(1)), "ai_block");
  assert.equal(doc.firstChild!.child(1).textContent, "Inner content"); assert.equal(doc.lastChild!.textContent, "Tail");
});
