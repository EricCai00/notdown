import { editorKind } from "../../src/document/node-identity";
import assert from "node:assert/strict";
import test from "node:test";
import { EditorState } from "prosemirror-state";
import { contentObject, resolveContentObject } from "../../src/document/content-objects";
import { blockCatalog } from "../../src/catalog/block-catalog-data";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec";
import type { SyntaxConfig } from "../../src/markdown-engine/config";
import { htmlDocument } from "../../src/document/document-format";

test("raw HTML stays literal and sanitized while unsupported formats retain their complete source", () => {
  const config: SyntaxConfig = { version: 1, variant: "markdown", extensions: { raw_attribute: true, raw_html: false } };
  const raw = '```{=html}\n<i>*literal*</i><script>bad()</script>\n```';
  const html = htmlDocument("Test", raw, [], "markdown", config);
  assert(html.includes('<i>*literal*</i>'));
  assert(!html.includes('<em>literal</em>'));
  assert(!html.includes('<script>'));
  for (const source of ['```{=latex}\n<b>literal</b>\n```', '`<b>literal</b>`{=latex}']) {
    const output = htmlDocument("Test", source, [], "markdown", config);
    assert(output.includes('&lt;b&gt;literal&lt;/b&gt;'));
    assert(output.includes('{=latex}'));
    assert(!output.includes('<b>literal</b>'));
  }
  const off = { ...config, extensions: { raw_attribute: false } };
  assert.equal(resolveContentObject(parseNative(raw, off).firstChild!)?.id, "block.code_block");
  const notion: SyntaxConfig = { version: 1, variant: "notion-markdown", extensions: { raw_attribute: true } };
  assert.notEqual(resolveContentObject(parseNative(raw, notion).firstChild!)?.id, "block.html_block");
  for (const source of ['\\begin{center}\nText\n\\end{center}', 'Before \\textbf{word} after']) {
    const doc = parseNative(source, { ...config, extensions: { raw_tex: true } });
    const node = editorKind(doc.firstChild!) === "syntax_block" ? doc.firstChild! : doc.firstChild!.child(1);
    assert.equal(resolveContentObject(node)?.id, "block.unsupported");
  }
});

test("raw source shares HTML objects and preserves other formats as unsupported", () => {
  for (const variant of ["markdown", "markdown_mmd", "notdown"] as const) {
    const config: SyntaxConfig = { version: 1, variant, extensions: { raw_attribute: true, raw_html: false } };
    for (const format of ["html", "latex", "openxml", "odt", "epub", "*", "unknown-format"]) {
      for (const inline of [false, true]) {
        const raw = inline ? '`<b>*literal*</b>`{=' + format + '}'
          : '````{=' + format + '}\r\n<b>*literal*</b>\r\n\r\n```\r\n````';
        const source = (inline ? 'Before ' + raw + ' after.' : raw) + '\r\n\r\nTail\r\n';
        const doc = parseNative(source, config);
        const node = inline ? doc.firstChild!.child(1) : doc.firstChild!;
        assert.equal(resolveContentObject(node)?.id, format === "html" ? inline ? "inline.inline_html" : "block.html_block" : "block.unsupported", variant + ':' + format);
        assert.equal(serializeNative(doc, config), source);
        const state = EditorState.create({ doc });
        const changed = state.tr.insertText("!", doc.content.size - 1).doc;
        const saved = serializeNative(changed, config);
        assert.equal(saved, source.replace("Tail", "Tail!"));
        const reopened = parseNative(saved, config);
        assert.equal(resolveContentObject(inline ? reopened.firstChild!.child(1) : reopened.firstChild!)?.id, resolveContentObject(node)?.id);
      }
    }
  }
  assert.equal(contentObject("block.raw_source"), undefined);
  assert.equal(contentObject("inline.raw_source"), undefined);
  assert(!blockCatalog.some(entry => entry.id.endsWith(".raw_source")));
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
      doc.descendants(node => assert.notEqual(editorKind(node), "mention"));
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
      reopened.descendants(node => assert.notEqual(editorKind(node), "mention"));
    }
  }
});
