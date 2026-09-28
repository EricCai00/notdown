import { test } from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "prosemirror-state";
import { history, undo } from "prosemirror-history";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec";
import { syncedEditing, syncedNodes, syncUrl, wrapSyncedBlocks, unsyncTransaction } from "../../src/blocks/synced-editing";
import { findSyncedSourceInDoc } from "../../src/blocks/synced-source";
import type { SyntaxConfig } from "../../src/markdown-engine/config";

const config: SyntaxConfig = { version: 1, variant: "notdown", extensions: {} };
const source = '<synced_block id="original" custom="keep">\nShared **content**\n</synced_block>';
const reference = `<synced_block_reference url="${syncUrl("page-a", "original")}" auto-sync="true" extra="keep">\nShared **content**\n</synced_block_reference>`;

test("edits in either local copy propagate in one undo event and keep wrapper attributes", () => {
  let state = EditorState.create({ doc: parseNative(source + "\n\n" + reference, config), plugins: [history(), syncedEditing(() => "page-a", () => true)] });
  const ref = syncedNodes(state.doc)[1];
  state = state.applyTransaction(state.tr.insertText("New ", ref.pos + 2)).state;
  assert.deepEqual(syncedNodes(state.doc).map(item => item.node.textContent), ["New Shared content", "New Shared content"]);
  assert.equal(syncedNodes(state.doc)[0].node.attrs.nfmAttrs.custom, "keep");
  assert.equal(syncedNodes(state.doc)[1].node.attrs.nfmAttrs.extra, "keep");
  assert.ok(undo(state, tr => { state = state.applyTransaction(tr).state; }));
  assert.deepEqual(syncedNodes(state.doc).map(item => item.node.textContent), ["Shared content", "Shared content"]);
  state = state.applyTransaction(state.tr.insertText("Original ", 2)).state;
  assert.deepEqual(syncedNodes(state.doc).map(item => item.node.textContent), ["Original Shared content", "Original Shared content"]);
});

test("manual snapshots and disabled dialects never acquire automatic copy edits", () => {
  for (const enabled of [true, false]) {
    let state = EditorState.create({ doc: parseNative(source + "\n\n" + reference.replace('auto-sync="true"', 'auto-sync="false"'), config), plugins: [syncedEditing(() => "page-a", () => enabled)] });
    state = state.applyTransaction(state.tr.insertText("Updated ", 2)).state;
    assert.equal(syncedNodes(state.doc)[1].node.textContent, "Shared content");
  }
});

test("contiguous paragraphs wrap without losing content; nested or disjoint selections are refused", () => {
  const state = EditorState.create({ doc: parseNative("First **bold**\n\nSecond\n\nThird", config) });
  const first = state.doc.firstChild!;
  const tr = wrapSyncedBlocks(state, [0, first.nodeSize])!;
  assert.equal(tr.doc.firstChild!.childCount, 2);
  assert.equal(tr.doc.firstChild!.textContent, "First boldSecond");
  assert.match(serializeNative(tr.doc, config), /First \*\*bold\*\*/);
  assert.equal(wrapSyncedBlocks(state, [0, first.nodeSize + state.doc.child(1).nodeSize]), null);
  assert.equal(wrapSyncedBlocks(EditorState.create({ doc: tr.doc }), [0]), null);
});

test("auto-sync is supplemental and stays recoverable without behavior in official Notion Markdown", () => {
  const official: SyntaxConfig = { version: 1, variant: "notion-markdown", extensions: { notion_synced: true } };
  const doc = parseNative(reference, official);
  assert.equal(syncedNodes(doc).length, 0);
  assert.equal(serializeNative(doc, official).trim(), reference);
});

test("ambiguous source IDs fail rather than replacing the wrong source", () => {
  const doc = parseNative(source + "\n\n" + source, config);
  assert.throws(() => findSyncedSourceInDoc(doc, "original"), /ambiguous/);
});

test("unsync removes container indentation without turning rich text into code; unknown syntax survives", () => {
  const body = '<synced_block_reference url="#page/p#block=b" custom="keep">\n\tShared **bold**\n\n\t```text\n\t<unknown>literal code</unknown>\n\t```\n\n\t<unknown url="https://example.com" custom="opaque"/>\n</synced_block_reference>';
  const state = EditorState.create({ doc: parseNative(body, config) });
  const tr = unsyncTransaction(state, 0)!;
  const output = serializeNative(tr.doc, config), parsed = parseNative(output, config);
  assert.equal(parsed.firstChild!.type.name, "block.paragraph");
  assert.match(output, /^Shared \*\*bold\*\*/);
  assert.match(output, /<unknown>literal code<\/unknown>/);
  assert.match(output, /custom="opaque"/);
  assert.equal(parsed.child(1).type.name, "block.code_block");
});
