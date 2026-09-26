import assert from "node:assert/strict";
import test from "node:test";
import { EditorState } from "prosemirror-state";
import { mediaFileMatches, mediaInsertMarkdown } from "../../src/blocks/media-insert";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec";
import { insertMenuItems } from "../../src/editor/insert-menu";
import { blockPropertiesTransaction, blockPropertyFields } from "../../src/editor/block-properties";
import { fileSizeLabel, mediaFilename } from "../../src/document/media";

const config = { version: 1 as const, variant: "notdown" as const, extensions: {} };

test("the selected insertion type wins over the resource extension and survives editing", () => {
  for (const variant of ["notdown", "notion-markdown"] as const) {
    const syntax = { ...config, variant };
    for (const kind of ["file", "audio", "video", "pdf"] as const) {
      const source = mediaInsertMarkdown(kind, "A & B.mp3", "assets/same.mp3", syntax);
      const doc = parseNative(source, syntax);
      assert.equal(doc.firstChild!.type.name, `block.${kind}`);
      assert.equal(serializeNative(doc, syntax), source);
      const state = EditorState.create({ doc });
      const tr = blockPropertiesTransaction(state, 0, doc.firstChild!, { caption: "Renamed" });
      assert.ok(tr);
      const saved = serializeNative(state.apply(tr).doc, syntax);
      assert.equal(parseNative(saved, syntax).firstChild!.type.name, `block.${kind}`);
      const dom = JSON.stringify(doc.firstChild!.type.spec.toDOM!(doc.firstChild!));
      if (kind === "file") {
        assert.match(dom, /pm-file-icon/);
        assert.doesNotMatch(dom, /\["(?:audio|video|object)"/);
        assert.equal(blockPropertyFields(doc.firstChild!)[1].label, "File name");
      } else assert.match(dom, kind === "pdf" ? /\["object"/ : new RegExp(`\\["${kind}"`));
    }
  }
});

test("separate insertion entries respect dialect boundaries and portable fallback", () => {
  for (const variant of ["notdown", "notion-markdown"] as const) {
    const items = insertMenuItems({ ...config, variant });
    for (const id of ["image", "audio", "video", "pdf", "file"]) assert.equal(items.filter(item => item[0] === id).length, 1);
    assert.equal(items.find(item => item[0] === "file")![2], "File");
  }
  const commonmark = { ...config, variant: "commonmark" as const };
  const ids = insertMenuItems(commonmark).map(item => item[0]);
  assert.ok(ids.includes("image") && ids.includes("file"));
  for (const kind of ["audio", "video", "pdf"] as const) {
    assert.ok(!ids.includes(kind));
    assert.throws(() => mediaInsertMarkdown(kind, "File", "assets/a", commonmark));
  }
  assert.equal(mediaInsertMarkdown("file", "A [B].mp3", "assets/a.mp3", commonmark).trim(), "[A \\[B\\].mp3](assets/a.mp3)");
  const image = mediaInsertMarkdown("image", "A [B].png", "assets/a.png", config);
  const doc = parseNative(image, config);
  assert.equal(doc.firstChild!.type.name, "block.image_block");
  assert.equal(serializeNative(doc, config), image);
});

test("media edits retain unknown attributes and fenced examples verbatim", () => {
  const source = '<file src="assets/a.mp3" future="keep">Music.mp3</file>\r\n\r\n```xml\r\n<audio src="assets/a.mp3">Example</audio>\r\n```';
  const state = EditorState.create({ doc: parseNative(source, config) });
  assert.equal(serializeNative(state.doc, config), source);
  const tr = blockPropertiesTransaction(state, 0, state.doc.firstChild!, { caption: "New name.mp3" })!;
  const saved = serializeNative(state.apply(tr).doc, config);
  assert.match(saved, /future="keep"/);
  assert.ok(saved.includes('```xml\r\n<audio src="assets/a.mp3">Example</audio>\r\n```'));
});

test("media chooser validates typed uploads while file accepts any format", () => {
  assert.ok(mediaFileMatches("file", { name: "a.mp3", type: "audio/mpeg" }));
  assert.ok(mediaFileMatches("audio", { name: "a.mp3", type: "" }));
  assert.ok(!mediaFileMatches("audio", { name: "a.mp3", type: "image/png" }));
  assert.ok(!mediaFileMatches("pdf", { name: "a.txt", type: "text/plain" }));
  assert.equal(fileSizeLabel(0), "0 B");
  assert.equal(fileSizeLabel(2202009), "2.1 MiB");
  assert.equal(mediaFilename("assets/a%20b.pdf?download=1"), "a b.pdf");
});
