import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "prosemirror-state";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec";
import { type SyntaxConfig } from "../../src/markdown-engine/config";
import { inlineColorStyle } from "../../src/document/notion-syntax";
import { renderPreview } from "../../server/pandoc";

const config: SyntaxConfig = { version: 1, variant: "notdown", extensions: {} };
const colorMark = (source: string) => parseNative(source, config).firstChild!.firstChild!.marks.find(m => m.type.name === "color")!;

test("Notdown inline colors round-trip together, with unknown fields and Markdown formatting after editing", () => {
  const source = '<span color="red" bg_color="yellow" custom="a&amp;b">**words**</span>\r\n\r\nTail';
  const doc = parseNative(source, config);
  assert.equal(serializeNative(doc, config), source);
  const mark = doc.firstChild!.firstChild!.marks.find(m => m.type.name === "color")!;
  assert.equal(mark.attrs.color, "red");
  assert.equal(mark.attrs.bg_color, "yellow");
  assert.equal(inlineColorStyle(mark.attrs), "color:#d44c47;background-color:#fbf3db");
  const edited = EditorState.create({ doc }).tr.insertText("NEW", 1, 6).doc;
  const written = serializeNative(edited, config);
  assert.match(written, /color="red"/);
  assert.match(written, /bg_color="yellow"/);
  assert.match(written, /custom="a&amp;b"/);
  assert.match(written, /\*\*NEW\*\*/);
  assert.equal(colorMark(written).attrs.bg_color, "yellow");
});

test("background-only, legacy and nested spans keep independent channels", () => {
  assert.equal(inlineColorStyle(colorMark('<span bg_color="blue">words</span>').attrs), "background-color:#e7f3f8");
  const legacy = '<span color="yellow_bg">words</span>';
  assert.equal(serializeNative(parseNative(legacy, config), config), legacy);
  assert.equal(inlineColorStyle(colorMark(legacy).attrs), "background-color:#fbf3db");
  for (const source of [
    '<span color="red"><span bg_color="yellow">words</span></span>',
    '<span bg_color="yellow"><span color="red">words</span></span>',
    '<span color="yellow_bg"><span color="red">words</span></span>',
  ]) {
    assert.equal(inlineColorStyle(colorMark(source).attrs), "color:#d44c47;background-color:#fbf3db");
    const doc = parseNative(source, config);
    const edited = EditorState.create({ doc }).tr.insertText("!", 2).doc;
    assert.equal(inlineColorStyle(colorMark(serializeNative(edited, config)).attrs), "color:#d44c47;background-color:#fbf3db");
  }
  assert.equal(inlineColorStyle(colorMark('<span color="yellow_bg" bg_color="blue">words</span>').attrs), "background-color:#e7f3f8");
});

test("clearing a styled native span does not restore stale color attributes", () => {
  const doc = parseNative('<span color="red" bg_color="yellow" class="example" custom="keep">words</span>', config);
  const state = EditorState.create({ doc });
  const updated = state.tr.addMark(1, 6, state.schema.marks.color.create({ color: "blue", bg_color: "green", nfmAttrs: { class: "example", custom: "keep" } })).doc;
  const changedSource = serializeNative(updated, config);
  assert(colorMark(changedSource), changedSource);
  assert.equal(inlineColorStyle(colorMark(changedSource).attrs), "color:#337ea9;background-color:#edf3ec", changedSource);
  const cleared = state.tr.removeMark(1, 6, state.schema.marks.color).doc;
  const written = serializeNative(cleared, config);
  assert.doesNotMatch(written, /color=/);
  assert.match(written, /class="example"/);
  assert.match(written, /custom="keep"/);
  assert(!parseNative(written, config).firstChild!.firstChild!.marks.some(mark => mark.type.name === "color"));
});

test("other variants and disabled colors preserve the source without activating supplemental styles", () => {
  const source = '<span color="red" bg_color="yellow" custom="keep">words</span>';
  for (const restricted of [
    { ...config, extensions: { notion_colors: false } },
    { ...config, variant: "notion-markdown" as const, extensions: { notion_colors: true } },
    { ...config, variant: "commonmark" as const, extensions: { notion_colors: true } },
  ]) {
    const doc = parseNative(source, restricted);
    doc.descendants(node => assert(!node.marks.some(mark => mark.attrs.bg_color)));
    assert.equal(serializeNative(doc, restricted), source);
  }
  assert.throws(() => serializeNative(parseNative(source, config), { ...config, variant: "notion-markdown" }), /Notdown/);
});

test("code, malformed spans and unsupported colors remain recoverable without executable CSS", () => {
  for (const source of [
    '`<span color="red" bg_color="yellow">words</span>`',
    '```xml\n<span color="red" bg_color="yellow">words</span>\n```',
    '<span color="red" bg_color="yellow">unclosed',
    '<span color="red" bg_color="yellow" bg_color="blue">duplicate</span>',
  ]) {
    const doc = parseNative(source, config);
    assert.equal(serializeNative(doc, config), source);
    doc.descendants(node => assert(!node.marks.some(mark => mark.attrs.bg_color)));
  }
  for (const value of ["constructor", "toString", "#fff", "red;position:fixed", "url(javascript:alert(1))", "yellow_bg"]) {
    const source = `<span color="red" bg_color="${value}">words</span>`;
    assert.equal(inlineColorStyle(colorMark(source).attrs), "color:#d44c47");
    const doc = parseNative(source, config);
    const edited = EditorState.create({ doc }).tr.insertText("!", 2).doc;
    assert(serializeNative(edited, config).includes(`bg_color="${value}"`));
  }
});

test("HTML preview renders both channels", async () => {
  const result = await renderPreview({ source: '<span color="red" bg_color="yellow">words</span>', variant: "notdown", extensions: {}, plugins: [] });
  assert.match(result.html, /color:\s*#d44c47/);
  assert.match(result.html, /background-color:\s*#fbf3db/);
});
