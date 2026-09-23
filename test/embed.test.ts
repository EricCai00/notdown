import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "prosemirror-state";
import { parseNative, serializeNative } from "../src/markdown-engine/codec";
import { commandEnabled, type SyntaxConfig } from "../src/markdown-engine/config";

const config: SyntaxConfig = { version: 1, variant: "notdown", extensions: {} };
test("embed commands, optional dialects, disabled encodings and malformed boundaries", () => {
  assert(commandEnabled(config, "embed")); assert(commandEnabled(config, "html_embed"));
  for (const [tag, type, flag] of [["web-embed", "embed_web_contents", "notion_web_embed"], ["html-embed", "html_embed", "notion_html_document"]]) {
    const source = `<${tag} custom="keep"/>\n\nTail`;
    const parsed = parseNative(source, config);
    assert.equal(parsed.firstChild?.type.name, type);
    assert.equal(serializeNative(parsed, config), source);
    assert.equal(parseNative(source, { ...config, extensions: { [flag]: false } }).firstChild?.type.name, "opaque_block");
    assert.notEqual(parseNative(source, { version: 1, variant: "gfm", extensions: { [flag]: true } }).firstChild?.type.name, type);
    assert.equal(parseNative(`<${tag}/> trailing`, config).firstChild?.type.name, "opaque_block");
    const code = '```html\n' + source + '\n```';
    assert.equal(parseNative(code, config).firstChild?.type.name, "code_block");
    assert.equal(serializeNative(parseNative(code, config), config), code);
  }
});
test("edited HTML retains literal closing tags, fences, entities, whitespace and unknown attributes", () => {
  const doc = parseNative('<html-embed custom="keep"/>\n\nTail', config);
  const html = '<!doctype html>\n<pre>\n```html\n</html-embed>\n&amp; & < >\n</pre>\n';
  const edited = EditorState.create({ doc }).tr.setNodeMarkup(0, undefined, { ...doc.firstChild!.attrs, html }).doc;
  const written = serializeNative(edited, config), parsed = parseNative(written, config);
  assert.equal(parsed.firstChild?.attrs.html, html);
  assert.equal(parsed.firstChild?.attrs.nfmAttrs.custom, "keep");
  assert.equal(parsed.lastChild?.textContent, "Tail");
});
