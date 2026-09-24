import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "prosemirror-state";
import { dialects, enabled, commandEnabled, defaultSyntax, resetExtensions, type Dialect, type SyntaxConfig } from "../../src/markdown-engine/config";
import { localObjectPlugins } from "../../src/markdown-engine/presets";
import { objectSamples } from "../../src/document/object-model";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec";
import { DocumentSession } from "../../src/markdown-engine/session";
import { variantsForObject } from "../../src/catalog/catalog-relations";
import { htmlDocument, extractLinks } from "../../src/document/document-format";

const config = (variant: Dialect, extensions: Record<string, boolean> = {}): SyntaxConfig => ({ version: 1, variant, extensions });
const has = (source: string, c: SyntaxConfig, type: string) => {
  let found = false;
  parseNative(source, c).descendants(n => { if (n.type.name === type || n.marks.some(m => m.type.name === type)) found = true; });
  return found;
};

test("supplemental carriers cannot be enabled in upstream dialects, including by saved overrides", () => {
  for (const { id: variant } of dialects.filter(d => d.id !== "notdown")) for (const [name, sample] of Object.entries(objectSamples)) {
    const base = config(variant), plugin = localObjectPlugins[name], active = config(variant, { [plugin]: true, future_option: true });
    assert(!enabled(base, plugin), `${variant}: ${plugin}`);
    assert(!commandEnabled(base, name));
    assert(!has(sample, base, name), `${variant} accidentally parsed ${name}`);
    assert(!commandEnabled(active, name));
    const source = sample.replace(/\n/g, "\r\n") + "\r\n\r\nTail";
    const session = new DocumentSession(source, active);
    assert.notEqual(session.snapshot.doc.firstChild!.type.name, name);
    assert.equal(serializeNative(session.snapshot.doc, active), source);
    session.configure(base);
    assert.equal(session.snapshot.source, source);
    assert.equal(serializeNative(session.snapshot.doc, base), source);
    const disabledState = EditorState.create({ doc: session.snapshot.doc });
    const disabledEdit = disabledState.tr.insertText(" edited", disabledState.doc.content.size - 1).doc;
    assert(serializeNative(disabledEdit, base).startsWith(sample.replace(/\n/g, "\r\n")));
    session.configure(active);
    assert.notEqual(session.snapshot.doc.firstChild!.type.name, name);
    const state = EditorState.create({ doc: session.snapshot.doc });
    const changed = state.tr.insertText(" edited", state.doc.content.size - 1).doc;
    const written = serializeNative(changed, active);
    assert(written.startsWith(sample.replace(/\n/g, "\r\n")), `${variant}: preserved ${name}`);
    assert.deepEqual(resetExtensions(active), { future_option: true });
  }
  assert(variantsForObject("block.tabs").every(v => v.status === (v.id === "notdown" ? "default" : "unavailable")));
  assert.deepEqual(defaultSyntax("markdown"), config("commonmark"));
});

test("activating a container does not implicitly activate its nested local objects", () => {
  const source = '<tabs>\n<tab title="One">\n<ai-block prompt="Test">\nText\n</ai-block>\n</tab>\n</tabs>';
  for (const { id: variant } of dialects) {
    const c = config(variant, { notion_tabs: true, notion_ai_block: false });
    assert.equal(has(source, c, "tabs"), variant === "notdown");
    assert(!has(source, c, "ai_block"));
    assert.equal(serializeNative(parseNative(source, c), c), source);
    assert.equal(has(source, config(variant, { notion_tabs: true, notion_ai_block: true }), "ai_block"), variant === "notdown");
  }
});

test("strict GFM defaults exclude GitHub website features and Pandoc additions", () => {
  const c = config("gfm");
  for (const flag of ["alerts", "footnotes", "emoji", "tex_math_dollars", "tex_math_gfm", "yaml_metadata_block", "diagrams", "gfm_auto_identifiers", "notion_columns"])
    assert(!enabled(c, flag), flag);
  for (const flag of ["pipe_tables", "task_lists", "strikeout", "autolink_bare_uris"]) assert(enabled(c, flag));
  assert(!has("> [!NOTE]\n> Body", c, "callout"));
  assert(has("> [!NOTE]\n> Body", config("gfm", { alerts: true }), "callout"));
  assert(!has("> [!NOTE]- Folded title\n> Body", config("gfm", { alerts: true }), "callout"));
  assert(has("> [!NOTE]- Folded title\n> Body", config("obsidian"), "callout"));
});

test("callout folds and same-line titles require Obsidian syntax while basic alerts remain available", () => {
  for (const { id: variant } of dialects) {
    const c = config(variant, { alerts: true });
    const extended = variant === "obsidian" || variant === "notdown";
    for (const suffix of ["", "   ", "+", "-", " Title", "+ Title", "- Title"]) {
      const source = `> [!NOTE]${suffix}\r\n>\r\n> Body\r\n\r\nTail`;
      const expected = enabled(c, "alerts") && (extended || !suffix.trim());
      const doc = parseNative(source, c);
      assert.equal(has(source, c, "callout"), expected, `${variant}: ${suffix}`);
      assert.equal(serializeNative(doc, c), source);
      if (expected) {
        assert.equal(doc.firstChild!.attrs.fold, suffix.match(/^[+-]/)?.[0] || "");
        assert.equal(doc.firstChild!.attrs.title.trim(), suffix.includes("Title") ? "Title" : "");
      }
      const edited = EditorState.create({ doc }).tr.insertText(" edited", doc.content.size - 1).doc;
      assert.equal(serializeNative(edited, c), source + " edited");
      assert(!has(source, config(variant, { alerts: false }), "callout"));
    }
    if (!enabled(c, "alerts")) continue;
    const basic = parseNative("> [!NOTE]\n> Body", c);
    let end = 0;
    basic.descendants((node, pos) => { if (node.isText && node.text === "Body") end = pos + 4; });
    const edited = EditorState.create({ doc: basic }).tr.insertText(" edited", end).doc;
    const reopened = parseNative(serializeNative(edited, c), c).firstChild!;
    assert.equal(reopened.type.name, "callout");
    assert.equal(reopened.textContent, "Body edited");
    assert.equal(reopened.attrs.fold, "");
    assert.equal(reopened.attrs.title, "");
  }
});

test("switching callout dialects preserves recoverable source and leaves code literal", () => {
  const source = "> [!NOTE]+ Title\r\n> Body\r\n\r\nTail";
  const session = new DocumentSession(source, config("obsidian"));
  session.configure(config("markdown", { alerts: true }));
  assert.equal(session.snapshot.doc.firstChild!.type.name, "blockquote");
  assert.equal(session.snapshot.source, source);
  const doc = session.snapshot.doc;
  session.documentChanged(EditorState.create({ doc }).tr.insertText(" edited", doc.content.size - 1).doc);
  session.configure(config("obsidian"));
  assert.equal(session.snapshot.source, source + " edited");
  assert.equal(session.snapshot.doc.firstChild!.attrs.title, "Title");
  assert.equal(session.snapshot.doc.firstChild!.attrs.fold, "+");
  for (const variant of ["obsidian", "notdown", "markdown"] as const) {
    const c = config(variant, { alerts: true });
    const fenced = "```md\n> [!NOTE]- Title\n> Body\n```";
    assert(!has(fenced, c, "callout"));
    assert.equal(serializeNative(parseNative(fenced, c), c), fenced);
  }
});

test("exports and link indexing use the same pure defaults as the editor", () => {
  const source = "[[target]]\n\n~~ordinary text~~\n\n" + objectSamples.tabs;
  assert.deepEqual(extractLinks(source, "markdown"), []);
  const html = htmlDocument("Default CommonMark", source);
  assert(!html.includes("pm-tabs"));
  assert(!html.includes("<s>"));
  assert(html.includes("~~ordinary text~~"));
  assert.deepEqual(extractLinks(source, "markdown", config("commonmark", { wikilinks_title_after_pipe: true })), ["target"]);
});

test("Typora optional inline syntax does not disable its native display math", () => {
  const c = config("typora"), source = "==highlight== H~2~O x^2^ $x$\n\n$$\nx^2\n$$";
  for (const flag of ["highlight", "subscript", "superscript", "tex_math_dollars", "alerts", "diagrams", "header_attributes", "link_attributes", "fenced_code_attributes"]) assert(!enabled(c, flag), flag);
  assert(!has(source, c, "inline_math"));
  assert(has(source, c, "equation"));
  assert(has(source, config("typora", { tex_math_dollars: true }), "inline_math"));
});

test("product spellings do not leak across native presets", () => {
  assert(!has("[toc]", config("obsidian"), "table_of_contents"));
  assert(!has("{{TOC}}", config("typora"), "table_of_contents"));
  assert(!has("[toc]", config("markdown_mmd"), "table_of_contents"));
  assert(has("{{TOC}}", config("markdown_mmd"), "table_of_contents"));
  assert(!has("{{file.md}}", config("obsidian"), "syntax_block"));
  assert(has("![[file.md]]", config("obsidian"), "syntax_block"));
  assert(!has("```sequence\nA->B\n```", config("obsidian"), "syntax_block"));
  assert(has("```mermaid\ngraph TD; A-->B\n```", config("obsidian"), "syntax_block"));
  assert(has("```\ncode\n```", config("markdown_phpextra"), "code_block"));
  assert.equal(parseNative("\\: \\|", config("markdown_phpextra")).textContent, ": |");
  assert.equal(parseNative("3. Three", config("markdown_phpextra")).firstChild!.attrs.order, 3);
  assert(enabled(config("markdown_mmd"), "raw_attribute"));
  assert(!has("Before {{file.md}} after", config("obsidian"), "syntax_inline"));
});

test("disabled foreign containers follow native paragraph/HTML boundaries and code stays literal", () => {
  for (const variant of ["commonmark", "gfm", "markdown_strict"] as const) {
    const c = config(variant), source = "before\n:::nest\ninside\n:::children\nchild\n:::endnest\n\nafter";
    assert(!has(source, c, "nested_block"));
    assert(has(source, c, "opaque_block"));
    assert.equal(serializeNative(parseNative(source, c), c), source);
  }
  for (const variant of ["commonmark", "gfm", "notion-markdown"] as const) {
    const c = config(variant, { notion_tabs: true }), source = "```xml\n" + objectSamples.tabs + "\n```";
    assert(!has(source, c, "tabs"));
    assert.equal(serializeNative(parseNative(source, c), c), source);
  }
});
