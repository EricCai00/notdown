import assert from "node:assert/strict";
import test from "node:test";
import { EditorState } from "prosemirror-state";
import { contentObject, resolveContentObject } from "../../src/document/content-objects";
import { blockCatalog } from "../../src/catalog/block-catalog-data";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec";
import type { SyntaxConfig } from "../../src/markdown-engine/config";

test("raw inline is a primary object with a real raw_attribute example", () => {
  const entry = blockCatalog.find(e => e.id === "inline.raw_source")!;
  assert.ok(entry.sample);
  const config: SyntaxConfig = { version: 1, variant: entry.variant, extensions: { raw_attribute: true } };
  const doc = parseNative(entry.sample, config);
  assert.equal(resolveContentObject(doc.firstChild!.child(1))?.id, "inline.raw_source");
  assert.equal(serializeNative(doc, config), entry.sample);
  let state = EditorState.create({ doc });
  state = state.apply(state.tr.insertText("!", state.doc.content.size - 1));
  const reopened = parseNative(serializeNative(state.doc, config), config);
  assert.equal(reopened.firstChild!.child(1).attrs.raw, doc.firstChild!.child(1).attrs.raw);
  assert.equal(contentObject("inline.media"), undefined);
  assert.equal(contentObject("inline.mention_agent"), undefined);
});

test("file transclusion placements resolve to one semantic object", () => {
  const config: SyntaxConfig = { version: 1, variant: "markdown_mmd", extensions: {} };
  const doc = parseNative("{{fragment.txt}}\n\nBefore {{fragment.txt}} after", config);
  assert.equal(resolveContentObject(doc.firstChild!)?.id, "block.file_transclusion");
  assert.equal(resolveContentObject(doc.lastChild!.child(1))?.id, "block.file_transclusion");
  assert.equal(contentObject("inline.file_transclusion"), undefined);
  assert.equal(contentObject("block.file_transclusion")!.adapters.length, 2);
});

test("removed agent mentions preserve literal content, unknown attributes and CRLF after reopening", () => {
  for (const variant of ["notion-markdown", "commonmark"] as const) {
    const config: SyntaxConfig = { version: 1, variant, extensions: { notion_mentions: true } };
    for (const tag of [
      '<mention-agent url="https://example.com/a" custom="keep">Helper</mention-agent>',
      '<mention-agent url="https://example.com/a" custom="keep"/>',
      '<mention-agent custom="keep">Unclosed',
    ]) {
      const source = `Before ${tag} after\r\n\r\nTail\r\n`;
      const doc = parseNative(source, config);
      doc.descendants(node => assert.notEqual(node.type.name, "mention"));
      assert.equal(serializeNative(doc, config), source);
      let state = EditorState.create({ doc });
      state = state.apply(state.tr.insertText("!", state.doc.content.size - 1));
      assert.equal(serializeNative(state.doc, config), source.replace("Tail", "Tail!"));
      if (!doc.firstChild!.isTextblock) {
        assert.equal(parseNative(serializeNative(state.doc, config), config).firstChild!.attrs.raw, doc.firstChild!.attrs.raw);
        continue;
      }
      state = state.apply(state.tr.insertText("!", doc.firstChild!.nodeSize - 1));
      const reopened = parseNative(serializeNative(state.doc, config), config);
      let recovered = "";
      reopened.firstChild!.forEach(node => { recovered += node.isText ? node.textContent : node.attrs.raw || ""; });
      assert.equal(recovered, `Before ${tag} after!`);
      reopened.descendants(node => assert.notEqual(node.type.name, "mention"));
    }
  }
});
