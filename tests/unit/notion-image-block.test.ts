import assert from "node:assert/strict";
import test from "node:test";
import { EditorState } from "prosemirror-state";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec";
import { imageModel } from "../../src/document/image-layout";
import { imageTransaction } from "../../src/editor/image-transactions";

for (const variant of ["notdown", "notion-markdown"] as const) {
  const config = { version: 1 as const, variant, extensions: {} };
  test(`${variant} standalone and nested images have block identity without rewriting source`, () => {
    const source = '![](a.png)\r\n\r\n![Caption](b.png) {color="blue" future="keep"}\r\n\r\n- Parent\r\n\t![](nested.png)\r\n\r\n<callout>\r\n\t![Nested](callout.png)\r\n</callout>\r\n\r\n```md\r\n![](literal.png)\r\n```';
    const doc = parseNative(source, config);
    doc.check();
    const images: string[] = [];
    doc.descendants(node => {
      assert.notEqual(node.type.name, "inline.image");
      if (node.type.name === "block.image_block") images.push(imageModel(node)!.src);
    });
    assert.deepEqual(images, ["a.png", "b.png", "nested.png", "callout.png"]);
    assert.equal(serializeNative(doc, config), source);
    assert.equal(parseNative(serializeNative(doc, config), config).firstChild!.type.name, "block.image_block");
  });
  test(`${variant} caption addition and removal retain a real image block after saving`, () => {
    const source = '![](a.png) {color="blue" future="keep"}\r\n\r\nTail';
    let state = EditorState.create({ doc: parseNative(source, config) });
    state = state.apply(imageTransaction(state, 0, state.doc.firstChild!, { caption: "New caption" }, variant === "notdown"));
    let saved = serializeNative(state.doc, config);
    assert.match(saved, /!\[New caption\]\(a.png\)/);
    assert.match(saved, /future="keep"/);
    state = EditorState.create({ doc: parseNative(saved, config) });
    assert.equal(state.doc.firstChild!.type.name, "block.image_block");
    state = state.apply(imageTransaction(state, 0, state.doc.firstChild!, { caption: "" }, variant === "notdown"));
    saved = serializeNative(state.doc, config);
    const reopened = parseNative(saved, config);
    assert.equal(reopened.firstChild!.type.name, "block.image_block");
    assert.equal(imageModel(reopened.firstChild!)!.caption, "");
    assert.match(saved, /!\[\]\(a.png\)/);
    assert.match(saved, /future="keep"/);
  });
}

test("Notdown retains images inside text as inline nodes; official Notion keeps them literal", () => {
  const source = "Before ![Alt](a.png) after";
  for (const variant of ["notdown", "notion-markdown", "commonmark"] as const) {
    const config = { version: 1 as const, variant, extensions: {} };
    const doc = parseNative(source, config);
    const types: string[] = [];
    doc.descendants(node => { types.push(node.type.name); });
    assert.equal(types.includes("inline.image"), variant !== "notion-markdown");
    assert.ok(!types.includes("block.image_block"));
    assert.equal(serializeNative(doc, config), source);
  }
});
