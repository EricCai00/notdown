import assert from "node:assert/strict";
import test from "node:test";
import { EditorState } from "prosemirror-state";
import { blockifyNotionImages } from "../../server/notion-image-import.js";
import { prepareNotionImport } from "../../server/notion-import.js";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec.js";
import { imageTransaction } from "../../src/editor/image-transactions.js";
import { imageModel } from "../../src/document/image-layout.js";
import { notionFixture, notionImagesRoot, notionImagesSource } from "./notion-import-fixture.js";

for (const variant of ["notdown", "notion-markdown"] as const) {
  const config = { version: 1 as const, variant, notionVersion: "v2" as const, extensions: {} };
  test(`${variant} import splits mixed and nested images into blocks without losing text or marks`, () => {
    const source = [
      '**Before ![Caption](https://example.com/a.png "Image title") after** ![](b.png) tail',
      '- Parent\n\n    ![Nested](nested.png)\n\n    End',
      '> Quote ![Quoted](quote.png) end',
      '<callout>\n<p>Callout</p>\n\nText ![Inside](inside.png) end\n</callout>',
      '# Heading ![Heading](heading.png) end',
      '`![Code](inline.png)`\n\n```md\n![Code](fenced.png)\n```',
      '<future>![Example](unknown.png)</future>',
    ].join("\n\n");
    const saved = blockifyNotionImages(source, variant);
    const doc = parseNative(saved, config); doc.check();
    const images: any[] = [], strong: string[] = [];
    doc.descendants(node => {
      assert.notEqual(node.type.name, "inline.image", saved);
      if (node.type.name === "block.image_block") images.push(node.attrs);
      if (node.isText && node.marks.some(mark => mark.type.name === "strong")) strong.push(node.text!);
    });
    assert.deepEqual(images.map(image => image.src), ["https://example.com/a.png", "b.png", "nested.png", "quote.png", "inside.png", "heading.png"]);
    assert.equal(images[0].caption, "Caption"); assert.equal(images[0].title, "Image title");
    assert.deepEqual(strong, ["Before ", " after"]);
    assert.ok(doc.textContent.includes("tail")); assert.ok(doc.textContent.includes("End"));
    assert.ok(saved.includes('`![Code](inline.png)`\n\n```md\n![Code](fenced.png)\n```'));
    assert.ok(saved.includes('<future>![Example](unknown.png)</future>'));
    assert.equal(blockifyNotionImages(saved, variant), saved);
    assert.equal(serializeNative(doc, config), saved);
  });

  test(`${variant} images as the only content of list paragraphs preserve valid containers`, () => {
    for (const source of ['- ![](a.png)', '3. ![](a.png)', '- [x] ![](a.png)', '> ![](a.png)', '- Parent\n    - ![](a.png)']) {
      const saved = blockifyNotionImages(source, variant), doc = parseNative(saved, config);
      doc.check(); let images = 0, position = -1;
      doc.descendants((node, pos) => { assert.notEqual(node.type.name, "inline.image"); if (node.type.name === "block.image_block") { images++; position = pos; } });
      assert.equal(images, 1, saved);
      let state = EditorState.create({ doc });
      state = state.apply(imageTransaction(state, position, doc.nodeAt(position)!, { caption: "Edited nested caption" }, variant === "notdown"));
      const reopened = parseNative(serializeNative(state.doc, config), config); reopened.check();
      const captions: string[] = [];
      reopened.descendants(node => { assert.notEqual(node.type.name, "inline.image"); if (node.type.name === "block.image_block") captions.push(node.attrs.caption); });
      assert.deepEqual(captions, ["Edited nested caption"], source);
    }
  });

  test(`${variant} preserves unchanged source and normalizes the preview while archiving the original`, async () => {
    const unchanged = '![](a.png)\r\n\r\n```md\r\nBefore ![](code.png) after\r\n```\r\n\r\n<future>![](unknown.png)</future>';
    assert.equal(blockifyNotionImages(unchanged, variant), unchanged);
    const plan = await prepareNotionImport({ token: "test-secret-not-saved", pageId: notionImagesRoot, variant,
      includeChildren: false, downloadAssets: false }, { fetch: notionFixture(), wait: async () => {} });
    const doc = parseNative(plan.pages[0].source, config); doc.check(); let images = 0;
    doc.descendants(node => { assert.notEqual(node.type.name, "inline.image"); if (node.type.name === "block.image_block") images++; });
    assert.equal(images, 6);
    assert.equal(plan.originals.find(file => file.path === `pages/${notionImagesRoot}.md`)!.data.toString(), notionImagesSource);
  });
}

test("Notdown table images become blocks inside the same cell after saving", () => {
  const config = { version: 1 as const, variant: "notdown" as const, notionVersion: "v2" as const, extensions: {} };
  const source = '| A | B |\n| --- | --- |\n| Before ![Caption](a.png) after | C |';
  const saved = blockifyNotionImages(source, "notdown"), doc = parseNative(saved, config); doc.check();
  const table = doc.firstChild!;
  assert.equal(table.type.name, "block.table"); assert.equal(table.childCount, 2);
  const cell = table.lastChild!.firstChild!;
  assert.equal(cell.childCount, 3); assert.equal(cell.child(0).textContent, "Before");
  assert.equal(cell.child(1).type.name, "block.image_block"); assert.equal(imageModel(cell.child(1))!.caption, "Caption");
  assert.equal(imageModel(cell.child(1))!.src, "a.png");
  assert.equal(cell.child(2).textContent, "after"); assert.equal(table.lastChild!.lastChild!.textContent, "C");
  doc.descendants(node => assert.notEqual(node.type.name, "inline.image"));
  assert.equal(blockifyNotionImages(saved, "notdown"), saved);
});
