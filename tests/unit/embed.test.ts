import { editorKind } from "../../src/document/node-identity";
import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "prosemirror-state";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec";
import { commandEnabled, type SyntaxConfig } from "../../src/markdown-engine/config";
import { editorSchema as schema } from "../../src/document/editor-schema";
import { DocumentSession } from "../../src/markdown-engine/session";

const config: SyntaxConfig = { version: 1, variant: "notdown", extensions: {} };
test("HTML layout extends native embed only in Notdown; both source encodings survive edits", () => {
  const html = '<embed src="assets/a.html" width="70%" height="220" align="center" title="a.html" future="keep">Caption</embed>';
  const session = new DocumentSession(html, config), node = session.snapshot.doc.firstChild!;
  assert.equal(editorKind(node), 'notion_embed');
  session.documentChanged(EditorState.create({ doc: session.snapshot.doc }).tr.setNodeMarkup(0, undefined, { ...node.attrs, nfmAttrs: { ...node.attrs.nfmAttrs, width: '50%' } }).doc);
  assert.ok(session.snapshot.source.includes('width="50%"')); assert.ok(session.snapshot.source.includes('future="keep"')); assert.ok(session.snapshot.source.endsWith('>Caption</embed>'));
  session.undo(); assert.equal(session.snapshot.source, html);
  assert.equal(editorKind(parseNative(html, { ...config, variant: 'notion-markdown' }).firstChild), 'opaque_block');
  assert.equal(editorKind(parseNative('<embed src="assets/a.html">Caption</embed>', { ...config, variant: 'notion-markdown' }).firstChild), 'notion_embed');
});
test("embed presentation attributes round-trip with unknown fields and stay within the Notdown carrier", () => {
  const source = '<web-embed url="assets/a.html" title="a.html" caption="A &amp; B" width="75%" height="430" align="right" future="keep"/>\n\n```html\n<web-embed/>\n```';
  const session = new DocumentSession(source, config), node = session.snapshot.doc.firstChild!;
  assert.equal(node.attrs.caption, 'A & B'); assert.equal(node.attrs.height, '430'); assert.equal(node.attrs.width, '75%');
  session.documentChanged(EditorState.create({ doc: session.snapshot.doc }).tr.setNodeMarkup(0, undefined, { ...node.attrs, caption: '中文\n"caption" <end>', height: '500' }).doc);
  const result = session.snapshot.source;
  assert.ok(result.includes('future="keep"')); assert.ok(result.endsWith('```html\n<web-embed/>\n```'));
  const parsed = parseNative(result, config).firstChild!;
  assert.equal(parsed.attrs.caption, '中文\n"caption" <end>'); assert.equal(parsed.attrs.align, 'right'); assert.equal(parsed.attrs.height, '500');
  session.undo(); assert.equal(session.snapshot.source, source);
  const official = new DocumentSession('<embed src="assets/a.html" future="keep">Original</embed>', { ...config, variant: 'notion-markdown' });
  official.documentChanged(EditorState.create({ doc: official.snapshot.doc }).tr.setNodeMarkup(0, undefined, { ...official.snapshot.doc.firstChild!.attrs, caption: 'New & caption' }).doc);
  assert.equal(official.snapshot.source, '<embed src="assets/a.html" future="keep">New &amp; caption</embed>');
  assert.equal(editorKind(parseNative(source, { ...config, variant: 'notion-markdown', extensions: { notion_web_embed: true } }).firstChild), 'opaque_block');
});
test("local HTML files and remote URLs share the web embed carrier with distinct sandbox policies", () => {
  const local = parseNative('<web-embed url="assets/example.html" custom="keep"/>', config).firstChild!;
  const web = parseNative('<web-embed url="https://example.com"/>', config).firstChild!;
  const iframe = parseNative('<iframe src="https://example.com"></iframe>', { ...config, variant: "typora" }).firstChild!;
  assert.equal(local.type, web.type); assert.equal(web.type, iframe.type);
  assert.equal(local.type.name, "block.web_embed");
  assert.equal(schema.nodes["block.html_embed"], undefined);
  const localDOM = local.type.spec.toDOM!(local) as readonly any[];
  const webDOM = web.type.spec.toDOM!(web) as readonly any[];
  assert.equal(localDOM[1].src, "/assets/example.html"); assert.equal(localDOM[1].sandbox, "");
  assert.equal(localDOM[1].srcdoc, undefined);
  assert.equal(webDOM[1].sandbox, "allow-scripts allow-forms allow-presentation");
  assert.notEqual(editorKind(parseNative('<html-embed/>', config).firstChild), "html_embed");
  for (const unsafe of ['assets/../page.html', '/assets/a.html', 'javascript:alert(1)', 'assets/a.html?x', 'assets/%2e%2e/a.html']) {
    const node = web.type.create({ ...web.attrs, url: unsafe });
    assert.equal((node.type.spec.toDOM!(node) as readonly any[])[1].src, "");
  }
});

test("mixed embeds retain source through independent edits, undo and dialect changes without leaking PM fields", () => {
  const html = '<web-embed url="assets/example.html" custom="html"/>', web = '<web-embed url="https://example.com" custom="web"/>';
  const source = html + '\r\n\r\n' + web + '\r\n\r\nTail\r\n';
  const session = new DocumentSession(source, config);
  const doc = session.snapshot.doc;
  const edited = EditorState.create({ doc }).tr.setNodeMarkup(doc.child(0).nodeSize, undefined, { ...doc.child(1).attrs, url: "https://example.com/new" }).doc;
  session.documentChanged(edited);
  const saved = session.snapshot.source;
  assert.ok(saved.startsWith(html + '\r\n\r\n'));
  assert.ok(saved.includes('url="https://example.com/new"'));
  assert.ok(!/editorRepresentation=|kind=|data=|config=|raw=/.test(saved));
  assert.equal(editorKind(parseNative(saved, config).child(1)), "web_embed");
  session.undo(); assert.equal(session.snapshot.source, source);
  session.redo(); assert.equal(session.snapshot.source, saved);
  session.configure({ ...config, variant: "notion-markdown" });
  assert.equal(session.snapshot.doc.child(0).type.name, "block.unsupported");
  assert.equal(session.snapshot.doc.child(1).type.name, "block.unsupported");
  session.configure(config);
  assert.equal(session.snapshot.doc.child(0).type, session.snapshot.doc.child(1).type);
  assert.equal(session.snapshot.source, saved);
});
test("embed commands, optional dialects, disabled encodings and malformed boundaries", () => {
  assert(commandEnabled(config, "embed")); assert(commandEnabled(config, "html_embed"));
  assert(commandEnabled({ ...config, variant: "notion-markdown" }, "html_embed"));
  assert(!commandEnabled({ ...config, variant: "notion-markdown" }, "embed"));
  assert(!commandEnabled({ ...config, variant: "typora" }, "html_embed"));
  assert(commandEnabled({ ...config, variant: "typora" }, "embed"));
  for (const [tag, type, flag] of [["web-embed", "web_embed", "notion_web_embed"]]) {
    const source = `<${tag} custom="keep"/>\n\nTail`;
    const parsed = parseNative(source, config);
    assert.equal(editorKind(parsed.firstChild), type);
    assert.equal(serializeNative(parsed, config), source);
    assert.equal(editorKind(parseNative(source, { ...config, extensions: { [flag]: false } }).firstChild), "opaque_block");
    assert.notEqual(editorKind(parseNative(source, { version: 1, variant: "gfm", extensions: { [flag]: true } }).firstChild), type);
    assert.equal(editorKind(parseNative(`<${tag}/> trailing`, config).firstChild), "opaque_block");
    const code = '```html\n' + source + '\n```';
    assert.equal(editorKind(parseNative(code, config).firstChild), "code_block");
    assert.equal(serializeNative(parseNative(code, config), config), code);
  }
});
