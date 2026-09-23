import assert from "node:assert/strict";
import test from "node:test";
import { EditorState } from "prosemirror-state";
import { bookmarks, parseBookmarkMetadata, publicBookmarkAddress } from "../../server/bookmarks";
import { bookmarkUrl } from "../../src/features/bookmarks/bookmark";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec";

test("bookmark metadata uses HTML parsing, decodes entities and resolves assets without executing markup", () => {
  const data = parseBookmarkMetadata('<title>Fallback</title><meta content="标题 &amp; detail" property="og:title"><meta name="description" content="A &quot;quote&quot;"><link href="../icon.png" rel="shortcut icon"><meta property="og:image" content="/cover.png"><script>throw 1</script>', "https://example.com/path/page");
  assert.deepEqual(data, { title: "标题 & detail", description: 'A "quote"', icon: "https://example.com/icon.png", image: "https://example.com/cover.png" });
  assert.equal(parseBookmarkMetadata('<title>A &amp; B</title><meta property="og:image" content="javascript:alert(1)">', "https://example.com").image, "");
  assert.equal(parseBookmarkMetadata("<title>A &amp; B</title>", "https://example.com").title, "A & B");
});

test("bookmark URL validation and public destination boundaries", () => {
  for (const url of ["javascript:alert(1)", "file:///vault", "data:text/html,Hi", "https://user:secret@example.com", "not a url", "//example.com"]) assert.equal(bookmarkUrl(url), "");
  assert.equal(bookmarkUrl(" http://bilibili.com "), "http://bilibili.com/");
  for (const ip of ["127.0.0.1", "10.0.0.1", "169.254.169.254", "172.16.0.1", "192.168.0.1", "100.64.0.1", "224.0.0.1", "::1", "::ffff:127.0.0.1", "192.0.2.1", "198.51.100.1", "203.0.113.1"]) assert.equal(publicBookmarkAddress(ip), false, ip);
  assert.equal(publicBookmarkAddress("93.184.216.34"), true);
});

test("resolver follows bounded web redirects and rejects private hosts without network access", async () => {
  await assert.rejects(bookmarks().resolve({ url: "http://127.0.0.1" }), /Could not load/);
  await assert.rejects(bookmarks().resolve({ url: "https://[::1]" }), /Could not load/);
  await assert.rejects(bookmarks().resolve({ url: "file:///test" }), /valid/);
  let count = 0;
  const service = bookmarks(async url => {
    count++;
    if (count === 1) return { status: 302, location: "/target", type: "", body: Buffer.alloc(0) };
    assert.equal(url.href, "https://example.com/target");
    return { status: 200, type: "text/html; charset=utf-8", body: Buffer.from("<title>Redirected 中文</title>") };
  });
  assert.equal((await service.resolve({ url: "https://example.com" })).title, "Redirected 中文");
  count = 0;
  await assert.rejects(bookmarks(async () => { count++; return { status: 302, location: "/loop", type: "", body: Buffer.alloc(0) }; }).resolve({ url: "https://example.com" }), /Could not load/);
  assert.equal(count, 5);
});

test("bookmark edits preserve unknown fields, untouched fences and icon across Markdown codecs", () => {
  for (const variant of ["notdown"] as const) {
    const config = { version: 1 as const, variant, extensions: { notion_bookmark: true } };
    const source = '<bookmark custom="keep"/>\n\n```html\n<bookmark unknown="literal"/>\n```\n';
    let state = EditorState.create({ doc: parseNative(source, config) });
    assert.equal(serializeNative(state.doc, config), source);
    state = state.apply(state.tr.setNodeMarkup(0, undefined, { ...state.doc.firstChild!.attrs, url: "https://example.com", title: '中文 & "Title"', icon: "https://example.com/favicon.ico" }));
    const saved = serializeNative(state.doc, config), reopened = parseNative(saved, config);
    assert.equal(reopened.firstChild!.attrs.nfmAttrs.custom, "keep");
    assert.equal(reopened.firstChild!.attrs.icon, "https://example.com/favicon.ico");
    assert.equal(reopened.firstChild!.attrs.title, '中文 & "Title"');
    assert.ok(saved.includes('```html\n<bookmark unknown="literal"/>\n```'));
  }
});
