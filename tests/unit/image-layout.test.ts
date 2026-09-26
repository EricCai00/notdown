import assert from "node:assert/strict";
import test from "node:test";
import { EditorState } from "prosemirror-state";
import { history, undo } from "prosemirror-history";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec";
import { imageModel, readImageCrop, replaceImageAttributes, replaceImageDestination } from "../../src/document/image-layout";
import { imageTransaction } from "../../src/editor/image-transactions";
import { renderNotionMarkdown } from "../../src/document/document-format";
import { commandEnabled } from "../../src/markdown-engine/config";

const config = { version: 1 as const, variant: "notdown" as const, extensions: {} };
const source = '![Caption](assets/image.png "Title"){alt="Alternative" custom="width=999 keep" width="400"}\r\n\r\n```md\r\n![Not an image](example.png){width="123"}\r\n```';

test("image layout edits preserve source attributes, destination/title, and code fences with one-step undo", () => {
  let state = EditorState.create({ doc: parseNative(source, config), plugins: [history()] });
  const original = state.doc.firstChild!;
  assert.equal(imageModel(original)?.alt, "Alternative");
  assert.equal(serializeNative(state.doc, config), source);
  state = state.apply(imageTransaction(state, 0, original, { layout: { width: "360", align: "right", crop: ".1,.1,.8,.8,1.5" } }, true));
  const saved = serializeNative(state.doc, config);
  assert.match(saved, /\(assets\/image.png "Title"\)/);
  assert.match(saved, /custom="width=999 keep" width="360" align="right" crop=".1,.1,.8,.8,1.5"/);
  assert.ok(saved.endsWith('```md\r\n![Not an image](example.png){width="123"}\r\n```'));
  const reopened = parseNative(saved, config);
  assert.equal(imageModel(reopened.firstChild!)?.attributes.align, "right");
  assert.match(renderNotionMarkdown(saved, [], { document: reopened }), /aspect-ratio:1.5/);
  undo(state, tr => state = state.apply(tr));
  assert.equal(serializeNative(state.doc, config), source);
});

test("caption removal and source replacement retain layout and never mutate the asset", () => {
  let state = EditorState.create({ doc: parseNative(source, config) });
  state = state.apply(imageTransaction(state, 0, state.doc.firstChild!, { caption: "", src: "assets/new(image).png" }, true));
  const saved = serializeNative(state.doc, config);
  assert.match(saved, /!\[\]\(assets\/new%28image%29.png "Title"\)/);
  assert.match(saved, /width="400"/);
  assert.match(saved, /alt="Alternative"/);
  assert.equal(replaceImageDestination('![A](<assets/a.png> "Keep")', "assets/b.png"), '![A](assets/b.png "Keep")');
  assert.throws(() => replaceImageDestination('![A][ref]', "assets/b.png"), /reference-style/);
  assert.throws(() => replaceImageDestination('![A](a.png)', "javascript:bad"));
});

test("bounded layout editing keeps unknown quoted values and rejects incomplete syntax", () => {
  assert.equal(replaceImageAttributes('![A [nested]](a(b).png "Keep ) title"){future="crop=old width=999" width="300"}', { width: "200" }),
    '![A [nested]](a(b).png "Keep ) title"){future="crop=old width=999" width="200"}');
  assert.equal(replaceImageAttributes('![A][ref]', { align: "left" }), '![A][ref] {align="left"}');
  assert.equal(replaceImageAttributes('![A](a.png){width="300"}', { width: null }), '![A](a.png)');
  for (const raw of ['```\n![A](a.png)\n```', '![A](unfinished', '![A](a.png){custom="broken}', '![A](a.png) after'])
    assert.throws(() => replaceImageAttributes(raw, { width: "200" }));
});

test("unsupported dialects retain crop as unknown data without activating it; stale controls are rejected", () => {
  for (const variant of ["notion-markdown", "commonmark", "markdown", "gfm"] as const) {
    const other = { ...config, variant, extensions: { link_attributes: true } };
    assert.equal(commandEnabled(other, "image_layout"), false);
    const input = '![A](assets/a.png){crop=".1,.1,.5,.5,1" align="right"}';
    const doc = parseNative(input, other);
    assert.equal(serializeNative(doc, other), input);
    assert.doesNotMatch(renderNotionMarkdown(input, [], { document: doc }), /aspect-ratio:/);
  }
  const state = EditorState.create({ doc: parseNative(source, config) });
  assert.throws(() => imageTransaction(state, 0, state.doc.firstChild!, { layout: { width: "400" } }, false));
  const changed = state.apply(imageTransaction(state, 0, state.doc.firstChild!, { caption: "Changed" }, true));
  assert.throws(() => imageTransaction(changed, 0, state.doc.firstChild!, { layout: { width: "200" } }, true), /changed/);
  for (const bad of ["0,0,0,1,1", "-.1,0,.5,.5,1", ".9,0,.5,.5,1", "0,0,1,1,Infinity", "0,0,1,1,0", "0,0,1,1"])
    assert.equal(readImageCrop(bad), null);
});

test("caption-free images keep crop in page rendering and HTML export", () => {
  const body = '![](assets/a.png){width="320" crop=".1,.1,.8,.8,1.5"}';
  const doc = parseNative(body, config);
  assert.equal(serializeNative(doc, config), body);
  assert.match(renderNotionMarkdown(body, [], { document: doc }), /aspect-ratio:1.5/);
});

test("editing the second image retains both images and their source identities", () => {
  const body = '![First](assets/first.png)\r\n\r\n\r\n![Second](assets/second.png){custom="keep"}\r\n\r\nTail';
  const state = EditorState.create({ doc: parseNative(body, config) });
  const second = state.doc.child(1), pos = state.doc.firstChild!.nodeSize;
  const changed = state.apply(imageTransaction(state, pos, second, { layout: { width: "250" } }, true));
  assert.equal(changed.doc.child(1).attrs.sourceKey, second.attrs.sourceKey);
  assert.equal(serializeNative(changed.doc, config), body.replace('custom="keep"', 'custom="keep" width="250"'));
});
