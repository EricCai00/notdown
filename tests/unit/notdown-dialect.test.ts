import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "prosemirror-state";
import { dialects, extensions, enabled, commandEnabled, supportsOption, syntaxFormat, validSyntax, resetExtensions, type SyntaxConfig } from "../../src/markdown-engine/config";
import { localObjectPlugins, notdownMarkdownDefaults } from "../../src/markdown-engine/presets";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec";
import { DocumentSession } from "../../src/markdown-engine/session";
import { objectSamples } from "../../src/document/object-model";
import { variantsForObject } from "../../src/catalog/catalog-relations";
import { groupExtensions } from "../../src/catalog/extension-provenance";
import { renderPreview } from "../../server/pandoc";

const config = (flags: Record<string, boolean> = {}): SyntaxConfig => ({ version: 1, variant: "notdown", extensions: flags });

test("Notdown inherits all Notion defaults and enables additional Markdown content and block encodings", () => {
  const base: SyntaxConfig = { version: 1, variant: "notion-markdown", extensions: {} };
  assert(dialects.some(d => d.id === "notdown" && d.label === "Notdown"));
  assert(validSyntax(config()));
  assert.equal(syntaxFormat(config()), "notion-markdown");
  for (const extension of extensions) {
    const block = Object.values(localObjectPlugins).includes(extension.id);
    assert.equal(enabled(config(), extension.id), extension.id === "symbol_replacements" || block || !!notdownMarkdownDefaults[extension.id] || enabled(base, extension.id), extension.id);
    assert.equal(supportsOption(config(), extension.id), true, extension.id);
  }
  for (const command of ["toggle_heading", "callout", "table", "columns", "toc", "link", "color", "underline", ...Object.keys(localObjectPlugins)]) assert(commandEnabled(config(), command), command);
  assert.equal(variantsForObject("block.tabs").find(d => d.id === "notdown")?.status, "default");
  assert.equal(variantsForObject("block.tabs").find(d => d.id === "notion-markdown")?.status, "unavailable");
  const group = groupExtensions(extensions, "notdown").find(g => g.id === "other")!;
  const blocks = group.entries.filter(e => Object.values(localObjectPlugins).includes(e.id));
  assert.equal(blocks.length, 9);
  assert(blocks.every(e => !e.label.startsWith("Local ")));
});

test("Notdown blocks parse, round-trip and preserve raw blocks when explicitly disabled", () => {
  for (const [name, sample] of Object.entries(objectSamples)) {
    const source = sample.replace(/\n/g, "\r\n") + "\r\n\r\nTail";
    const session = new DocumentSession(source, config());
    assert.equal(session.snapshot.doc.firstChild!.type.name, name);
    assert.equal(serializeNative(session.snapshot.doc, config()), source);
    session.configure(config({ [localObjectPlugins[name]]: false, future_option: true }));
    assert.equal(session.snapshot.doc.firstChild!.type.name, "opaque_block");
    assert.equal(session.snapshot.source, source);
    assert.equal(serializeNative(session.snapshot.doc, session.snapshot.config), source);
    session.configure({ ...session.snapshot.config, extensions: resetExtensions(session.snapshot.config) });
    assert.deepEqual(session.snapshot.config.extensions, { future_option: true });
    assert.equal(session.snapshot.doc.firstChild!.type.name, name);
    const state = EditorState.create({ doc: session.snapshot.doc });
    const written = serializeNative(state.tr.insertText(" edited", state.doc.content.size - 1).doc, config());
    assert(written.startsWith(sample.replace(/\n/g, "\r\n")));
    assert(written.endsWith("Tail edited"));
  }
});

test("Notdown retains Notion nesting, marks, XML attributes and literal code fences across preset switches", () => {
  const source = '# Title {custom="keep"}\n\tNested **bold**\n\n<callout icon="💡" custom="keep">\n<span color="red">Colored</span>\n</callout>\n\n' + objectSamples.tabs + '\n\n```xml\n' + objectSamples.tabs + '\n```';
  const session = new DocumentSession(source, config());
  let tabs = 0, nested = 0, color = false;
  session.snapshot.doc.descendants(node => {
    if (node.type.name === "tabs") tabs++;
    if (node.type.name === "nested_block") nested++;
    if (node.marks.some(mark => mark.type.name === "color")) color = true;
  });
  assert.equal(tabs, 1); assert(nested > 0); assert(color);
  assert.equal(serializeNative(session.snapshot.doc, config()), source);
  session.configure({ version: 1, variant: "notion-markdown", extensions: {} });
  assert.equal(session.snapshot.source, source);
  assert(session.undo());
  assert.equal(session.snapshot.config.variant, "notdown");
  assert.equal(serializeNative(session.snapshot.doc, config()), source);
  assert(!enabled(config({ notdown_callouts: false }), "notion_callouts"));
  assert.equal(parseNative(objectSamples.tabs, config({ notion_tabs: false })).firstChild!.type.name, "opaque_block");
});

test("Notdown Lab preview uses its native defaults and honors explicit block overrides", async () => {
  const render = (extensions: Record<string, boolean>) => renderPreview({ source: objectSamples.tabs, variant: "notdown", extensions, plugins: [] });
  assert.match((await render({})).html, /class="pm-tabs"/);
  assert.doesNotMatch((await render({ notion_tabs: false })).html, /class="pm-tabs"/);
  assert.equal((await render({})).engine, "Notdown codec");
  assert.equal((await render({ grid_tables: true })).engine, "Notdown codec");
});
