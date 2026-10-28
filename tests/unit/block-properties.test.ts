import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "prosemirror-state";
import { history, undo } from "prosemirror-history";
import { blockPropertyFields, blockPropertiesTransaction } from "../../src/editor/block-properties";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec";
import { objectSamples } from "../../src/document/object-model";
import type { SyntaxConfig } from "../../src/markdown-engine/config";
import { metadataValues } from "../../src/markdown-engine/products";

const config: SyntaxConfig = { version: 1, variant: "notdown", extensions: { notion_bookmark: true, notion_tabs: true } };
test("block property saves preserve unknown attributes, no-op source and undo as one transaction", () => {
  const raw = '<bookmark url="https://example.com" title="Before" custom="keep"/>\r\n\r\nTail';
  let state = EditorState.create({ doc: parseNative(raw, config), plugins: [history()] });
  const original = state.doc.firstChild!;
  assert.equal(blockPropertiesTransaction(state, 0, original, { title: "Before" }), null);
  assert.equal(serializeNative(state.doc, config), raw);
  state = state.apply(blockPropertiesTransaction(state, 0, original, { title: "After", description: "Description" })!);
  assert.equal(state.doc.firstChild!.attrs.nfmAttrs.custom, "keep");
  assert.match(serializeNative(state.doc, config), /title="After"/);
  assert(undo(state, tr => { state = state.apply(tr); }));
  assert(state.doc.firstChild!.eq(original));
  assert.equal(serializeNative(state.doc, config), raw);
});

test("properties validate tabs, reject stale targets and reset changed synced sources", () => {
  const state = EditorState.create({ doc: parseNative('<tabs active="0">\n<tab title="First">\nBody\n</tab>\n<tab title="Second">\nOther\n</tab>\n</tabs>', config) });
  assert.throws(() => blockPropertiesTransaction(state, 0, state.doc.firstChild!, { active: "2" }), /Active tab/);
  assert.throws(() => blockPropertiesTransaction(state, 0, state.doc.firstChild!, { active: "0.5" }), /Active tab/);
  const changed = state.apply(blockPropertiesTransaction(state, 0, state.doc.firstChild!, { active: "1" })!);
  assert.throws(() => blockPropertiesTransaction(changed, 0, state.doc.firstChild!, { active: "0" }), /changed/);
  const sync = EditorState.create({ doc: parseNative('<synced_block_reference url="#page/old#block=id" source-revision="old" snapshot-hash="hash" custom="keep">\nText\n</synced_block_reference>', config) });
  const next = sync.apply(blockPropertiesTransaction(sync, 0, sync.doc.firstChild!, { url: "#page/new#block=id" })!);
  assert.equal(next.doc.firstChild!.attrs.nfmAttrs["source-revision"], undefined);
  assert.equal(next.doc.firstChild!.attrs.nfmAttrs["snapshot-hash"], undefined);
  assert.equal(next.doc.firstChild!.attrs.nfmAttrs.custom, "keep");
});

test("metadata dialog edits only changed scalar fields and preserves structured values and plain-text semantics", () => {
  const syntax: SyntaxConfig = { version: 1, variant: "markdown", extensions: { metadata_values: true } };
  const state = EditorState.create({ doc: parseNative('---\nauthor: Before\ncount: 2\nextra: [one, two]\n---\n\nText', syntax) });
  const node = state.doc.firstChild!;
  assert(!blockPropertyFields(node).some(f => f.key === "extra"));
  assert.throws(() => blockPropertiesTransaction(state, 0, node, { count: "oops" }), /number/);
  const next = state.apply(blockPropertiesTransaction(state, 0, node, { author: "After", count: "3" })!);
  const raw = serializeNative(next.doc, syntax);
  assert.match(raw, /author: After/); assert.match(raw, /count: 3/);
  assert.deepEqual(metadataValues(next.doc.firstChild!.attrs.raw, "yaml").extra, ["one", "two"]);
  const mmd = { ...syntax, variant: "markdown_mmd" as const };
  const text = EditorState.create({ doc: parseNative('Title: **Plain text**\nCount: 002\n\nText', mmd) });
  const edited = text.apply(blockPropertiesTransaction(text, 0, text.doc.firstChild!, { title: "Changed" })!);
  assert.match(serializeNative(edited.doc, mmd), /Title: Changed/);
  assert.match(serializeNative(edited.doc, mmd), /Count: 002/);
});
