import assert from "node:assert/strict";
import test from "node:test";
import { extensionProvenance, groupExtensions, extensionProvenanceHtml, isBuiltInSyntax } from "../../src/catalog/extension-provenance";
import { catalogExtensions } from "../../src/catalog/catalog-relations";
import { dialects, enabled, supportsOption } from "../../src/markdown-engine/config";
import { extensionCategories, extensionCategory } from "../../src/catalog/extension-categories";
import { notionFeatureOrigins } from "../../src/catalog/extension-feature-origins";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec";

test("CommonMark core syntax is a separate read-only group, not an inference from missing flags", () => {
  for (const variant of ["commonmark", "gfm", "commonmark_x"] as const) {
    const groups = groupExtensions(catalogExtensions, variant);
    assert.equal(groups.find(g => g.id === "builtin")!.id, "builtin");
    assert.equal(groups.find(g => g.id === "builtin")!.entries.length, 9);
    for (const { id } of groups.find(g => g.id === "builtin")!.entries) {
      assert(isBuiltInSyntax(variant, id));
      assert(!supportsOption({ version: 1, variant, extensions: {} }, id));
      assert.equal(extensionProvenance(variant, id).syntax?.authority, "spec");
    }
    assert(!isBuiltInSyntax(variant, "raw_html"));
    assert(!isBuiltInSyntax(variant, "unknown_extension"));
  }
  assert(!isBuiltInSyntax("commonmark", "alerts"));
  assert(!isBuiltInSyntax("typora", "backtick_code_blocks"));
  assert(!isBuiltInSyntax("markdown", "escaped_line_breaks"));
  assert.match(extensionProvenanceHtml("commonmark", "escaped_line_breaks"), /built in · no switch/);
});

test("CommonMark-family native parsing supports the displayed core rules without enabling extensions", () => {
  const source = "first\\\nsecond\n\n```\ncode\n```\n\n~~~\ntilde\n~~~\n\n\\+ foo_bar_baz\n\n#not a heading\n\n7. Seven\n\nparagraph\n- item\n\n[ref]\n\n[ref]: https://example.com\n";
  for (const variant of ["commonmark", "gfm", "commonmark_x"] as const) {
    const config = { version: 1 as const, variant, extensions: {} };
    const doc = parseNative(source, config);
    const nodes: string[] = [];
    let linked = false;
    doc.descendants(node => {
      nodes.push(node.type.name);
      if (node.type.name === "ordered_list") assert.equal(node.attrs.order, 7);
      if (node.marks.some(mark => mark.type.name === "link")) linked = true;
    });
    assert(nodes.includes("hard_break"));
    assert.equal(nodes.filter(type => type === "code_block").length, 2);
    assert(nodes.includes("bullet_list"));
    assert(!nodes.includes("heading"));
    assert(doc.textContent.includes("+ foo_bar_baz"));
    assert(linked);
    assert.equal(serializeNative(doc, config), source);
  }
});

test("GFM specification, GitHub documentation and Pandoc-only defaults remain separate", () => {
  for (const id of ["pipe_tables", "task_lists", "strikeout", "autolink_bare_uris"]) {
    assert.equal(extensionProvenance("gfm", id).syntax?.source, "GFM Spec");
  }
  for (const id of ["alerts", "footnotes", "emoji", "tex_math_dollars", "tex_math_gfm", "diagrams", "gfm_auto_identifiers"]) {
    assert.equal(extensionProvenance("gfm", id).syntax?.source, "GFM Docs");
  }
  const groups = groupExtensions(catalogExtensions, "gfm");
  assert(groups.find(g => g.id === "other")!.entries.some(e => e.id === "yaml_metadata_block"));
  assert(!extensionProvenance("gfm", "yaml_metadata_block").syntax);
  assert.equal(extensionProvenance("commonmark", "backtick_code_blocks").pandoc, "not-listed");
  assert.equal(extensionProvenance("commonmark", "backtick_code_blocks").syntax?.authority, "spec");
  assert.equal(extensionProvenance("markdown", "abbreviations").pandoc, "off");
});

test("Typora preferences remain opt-in, with no invented Pandoc preset", () => {
  for (const id of ["highlight", "subscript", "superscript", "tex_math_dollars", "alerts", "diagrams", "smart", "hard_line_breaks", "space_in_atx_header"]) {
    const evidence = extensionProvenance("typora", id);
    assert.equal(evidence.syntax?.requirement, "optional", id);
    assert(evidence.syntax?.setting, id);
    assert.equal(evidence.pandoc, "no-preset");
  }
  assert(!enabled({ version: 1, variant: "typora", extensions: {} }, "highlight"));
  assert.match(extensionProvenanceHtml("typora", "highlight"), /Optional setting/);
  assert.equal(extensionProvenance("typora", "pipe_tables").syntax?.requirement, "required");
  assert.equal(extensionProvenance("typora", "notion_callouts").syntax, undefined);
  assert.deepEqual(extensionProvenance("notion-markdown", "notdown_callouts"), extensionProvenance("notion-markdown", "notion_callouts"));
});

test("all variants partition every extension once and retain required/spec/optional ordering and scope", () => {
  for (const { id: variant } of dialects) {
    const groups = groupExtensions(catalogExtensions, variant);
    const all = groups.flatMap(g => g.entries.map(e => e.id));
    assert.equal(all.length, catalogExtensions.length);
    assert.equal(new Set(all).size, catalogExtensions.length);
    assert.equal(groups.at(-1)!.id, "outside");
    assert(groups.at(-1)!.entries.every(e => e.status === "out-of-scope" || e.id === "raw_tex"));
    assert(groups.at(-1)!.entries.some(e => e.id === "raw_tex"));
    const others = groups.find(g => g.id === "other")!.entries;
    const categoryRanks = others.map(entry => Object.keys(extensionCategories).indexOf(extensionCategory(entry.id)));
    assert.deepEqual(categoryRanks, [...categoryRanks].sort((a, b) => a - b), variant);
    for (const entry of others) {
      assert.equal(extensionProvenance(variant, entry.id).syntax, undefined);
    }
    const specified = groups.find(g => g.id === "specified")!.entries;
    const ranks = specified.map(e => { const s = extensionProvenance(variant, e.id).syntax!; return Number(s.requirement === "optional") * 2 + Number(s.authority === "docs"); });
    assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b), variant);
    for (const e of specified) assert.match(extensionProvenance(variant, e.id).syntax!.url, /^https:\/\//);
  }
});

test("extension sources have exactly three categories, independent of dialect and block presentation", () => {
  assert.deepEqual(Object.values(extensionCategories), ["Pandoc extensions", "Notdown Notion extensions", "Notdown Markdown extensions"]);
  for (const entry of catalogExtensions) assert.equal(extensionCategory(entry.id), entry.category, entry.id);
  assert.equal(extensionCategory("pipe_tables"), "pandoc");
  assert.equal(extensionCategory("notion_callouts"), "notion");
  assert.equal(extensionCategory("notdown_callouts"), "notion");
  assert.equal(extensionCategory("notion_tabs"), "notion");
  assert.equal(extensionCategory("highlight"), "product");
  for (const { id: variant } of dialects) {
    const groups = groupExtensions(catalogExtensions, variant);
    assert.equal(groups[0].id, "specified");
    assert(groups.find(group => group.id === "other")!.entries.some(entry => entry.id === "notion_tabs"));
  }
});

test("Notion product counterparts do not assert official local-tag syntax or change defaults", () => {
  for (const [id, origin] of Object.entries(notionFeatureOrigins)) {
    assert.equal(extensionCategory(id), "notion", id);
    const entry = catalogExtensions.find(e => e.id === id)!;
    assert(entry.references.some(ref => ref.url === origin.url), id);
    assert.match(entry.namingNote, /Notdown variant only/);
    for (const variant of ["typora", "notion-markdown", "notdown"] as const) {
      assert.equal(extensionProvenance(variant, id).syntax, undefined, id);
      assert(groupExtensions(catalogExtensions, variant).find(g => g.id === "other")!.entries.some(e => e.id === id));
      assert.match(extensionProvenanceHtml(variant, id), /local encoding/);
      assert.equal(enabled({ version: 1, variant, extensions: {} }, id), variant === "notdown", id);
    }
  }
  assert.equal(extensionCategory("raw_html"), "pandoc");
  assert.equal(extensionCategory("html_embed"), "product");
  assert.equal(extensionCategory("implicit_figures"), "pandoc");
  assert.equal(extensionCategory("emoji"), "pandoc");
  assert.equal(extensionProvenance("notion-markdown", "emoji").syntax, undefined);
  assert.match(extensionProvenance("notion-markdown", "diagrams").syntax!.note!, /Mermaid/);
});

test("product standards and Pandoc reader additions do not leak into each other", () => {
  assert.equal(extensionProvenance("markdown_mmd", "metadata_values").syntax?.source, "MultiMarkdown Docs");
  assert.equal(extensionProvenance("markdown_mmd", "yaml_metadata_block").syntax, undefined);
  assert.equal(extensionProvenance("markdown_mmd", "smart").syntax?.requirement, "optional");
  assert.equal(extensionProvenance("markdown_phpextra", "fenced_code_attributes").syntax?.source, "PHP Extra Docs");
  assert.equal(extensionProvenance("obsidian", "comments").syntax?.source, "Obsidian Docs");
  assert.equal(extensionProvenance("commonmark", "alerts").syntax, undefined);
  assert.equal(extensionProvenance("markdown_github", "alerts").syntax?.source, "Pandoc legacy variant");
});
