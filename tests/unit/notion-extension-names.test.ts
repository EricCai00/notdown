import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "prosemirror-state";
import { legacyLocalExtensionIds, canonicalExtensionId, normalizeSyntax, enabled, commandEnabled, type SyntaxConfig } from "../../src/markdown-engine/config";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec";
import { catalogExtension, objectsForExtension } from "../../src/catalog/catalog-relations";
import { objectSamples } from "../../src/document/object-model";
import { localObjectPlugins } from "../../src/markdown-engine/presets";

test("renamed Notion block switches read old configurations and canonical overrides win", () => {
  for (const [old, current] of Object.entries(legacyLocalExtensionIds)) {
    assert.equal(canonicalExtensionId(old), current);
    assert.equal(catalogExtension(old)?.id, current);
    assert.deepEqual(objectsForExtension(old), objectsForExtension(current));
    const nodeName = Object.keys(localObjectPlugins).find(key => localObjectPlugins[key] === current && objectSamples[key])!;
    const source = objectSamples[nodeName];
    assert(source, current);
    for (const active of [true, false]) {
      const config: SyntaxConfig = { version: 1, variant: "notdown", extensions: { [old]: active, future_flag: true } };
      const normalized = normalizeSyntax(config);
      assert.equal(normalized.extensions[current], active);
      assert.equal(normalized.extensions[old], undefined);
      assert(normalized.extensions.future_flag);
      assert.equal(enabled(config, current), active);
      const doc = parseNative(source, config);
      assert.equal(doc.firstChild!.type.name, active ? nodeName : "opaque_block", current);
      assert.equal(serializeNative(doc, config), source);
      const conflict = { ...config, extensions: { [old]: active, [current]: !active } };
      assert.equal(enabled(conflict, old), !active);
      assert.equal(normalizeSyntax(conflict).extensions[current], !active);
    }
  }
  assert.equal(catalogExtension("local_figure"), undefined);
  assert.equal(canonicalExtensionId("constructor"), "constructor");
});

test("colors and underline parse, edit and gate independently, preserving disabled source", () => {
  const underline = '<span underline="true">Underlined</span>';
  const color = '<span color="red">Red</span>';
  for (const variant of ["notion-markdown", "notdown", "commonmark"] as const) {
    for (const active of ["notion_colors", "notion_underline"]) {
      const config: SyntaxConfig = { version: 1, variant, extensions: { raw_html: false, notion_colors: active === "notion_colors", notion_underline: active === "notion_underline" } };
      const source = active === "notion_colors" ? color : underline;
      const mark = active === "notion_colors" ? "color" : "underline";
      const doc = parseNative(source, config);
      assert(doc.firstChild!.firstChild!.marks.some(m => m.type.name === mark), variant + active);
      assert.equal(commandEnabled(config, "color"), active === "notion_colors");
      assert.equal(commandEnabled(config, "underline"), active === "notion_underline");
      const edited = EditorState.create({ doc }).tr.insertText("X", 2).doc;
      const saved = serializeNative(edited, config);
      assert(parseNative(saved, config).firstChild!.firstChild!.marks.some(m => m.type.name === mark));
      for (const disabledSource of [active === "notion_colors" ? underline : color, '<span color="red" underline="true">Both</span>', '```\n' + source + '\n```']) {
        const preserved = parseNative(disabledSource, config);
        assert.equal(serializeNative(preserved, config), disabledSource);
      }
    }
  }
  assert(objectsForExtension("notion_underline").some(r => r.objectId === "inline.underline"));
  assert(!objectsForExtension("notion_colors").some(r => r.objectId === "inline.underline"));
});
