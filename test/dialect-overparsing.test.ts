import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "prosemirror-state";
import { dialects, enabled, supportsOption, usesNotionSyntax, type Dialect, type SyntaxConfig } from "../src/markdown-engine/config";
import { parseNative, serializeNative } from "../src/markdown-engine/codec";

const config = (variant: Dialect, extensions: Record<string, boolean> = {}): SyntaxConfig => ({ version: 1, variant, extensions });
const contains = (source: string, c: SyntaxConfig, type: string) => {
  let found = false;
  parseNative(source, c).descendants(n => { if (n.type.name === type || n.marks.some(m => m.type.name === type)) found = true; });
  return found;
};

test("all twelve dialects retain their heading limits, including Notion's H5/H6 conversion", () => {
  for (const { id } of dialects) for (let level = 1; level <= 7; level++) {
    const c = config(id), source = "#".repeat(level) + " Heading\r\n\r\nTail";
    const doc = parseNative(source, c), head = doc.firstChild!;
    doc.check();
    assert.equal(head.type.name, level <= 6 ? "heading" : "paragraph", `${id}: H${level}`);
    if (level <= 6) assert.equal(head.attrs.level, c.variant === "notion-markdown" ? Math.min(4, level) : level);
    assert.equal(serializeNative(doc, c), source);
    const edited = EditorState.create({ doc }).tr.insertText(" edited", doc.content.size - 1).doc;
    assert.equal(serializeNative(edited, c), source + " edited");
  }
});

test("ordered-parenthesis markers are not inherited by the original Markdown family", () => {
  const native = new Set<Dialect>(["commonmark", "gfm", "obsidian", "commonmark_x", "markdown", "notdown"]);
  for (const { id } of dialects) {
    const c = config(id), source = "1) Item\n\nTail";
    assert.equal(contains(source, c, "ordered_list"), native.has(id), id);
    assert.equal(serializeNative(parseNative(source, c), c), source);
    assert.equal(contains("> 1) Item", c, "ordered_list"), !usesNotionSyntax(c) && native.has(id), id);
    if (["markdown_strict", "markdown_phpextra", "markdown_mmd", "markdown_github", "typora"].includes(id)) {
      assert(contains(source, config(id, { fancy_lists: true }), "ordered_list"), id);
      assert(!contains(source, config(id, { fancy_lists: false }), "ordered_list"), id);
    }
  }
});

test("fancy lists reject ordinary words, malformed parentheses and single-space capital initials", () => {
  for (const { id } of dialects) {
    const c = config(id, { fancy_lists: true });
    for (const source of ["Hello. world", "abc) text", "(a. text", "IIV. text", "iV. text", "A. Smith"]) {
      assert(!contains(source, c, "ordered_list"), `${id}: ${source}`);
      assert.equal(serializeNative(parseNative(source, c), c), source);
    }
    if (!enabled(c, "fancy_lists")) continue;
    for (const source of ["a. Item", "iv. Item", "(a) Item", "A.  Item", "I.  Item"]) {
      const doc = parseNative(source, c);
      assert.equal(doc.firstChild!.type.name, "ordered_list", `${id}: ${source}`);
      const edited = EditorState.create({ doc }).tr.insertText("X", 3).doc;
      const reopened = parseNative(serializeNative(edited, c), c);
      assert.equal(reopened.firstChild!.type.name, "ordered_list", `${id}: ${source}`);
      assert.equal(reopened.textContent, "XItem");
    }
  }
});

test("opt-in Notion inline carriers cannot enable disabled descendants", () => {
  for (const { id } of dialects) {
    const c = config(id, { notion_colors: true, strikeout: false, tex_math_dollars: false, notion_link_preview: false, native_spans: false });
    for (const [body, type] of [["$x$", "inline_math"], ["~~strike~~", "strike"], ['<mention-link url="https://example.com">Link</mention-link>', "link_mention"]]) {
      const source = `<span color="red">${body}</span>`;
      assert(!contains(source, c, type), `${id}: ${type}`);
      assert.equal(serializeNative(parseNative(source, c), c), source);
    }
  }
});

test("disabling Notion nesting also disables standalone toggle headings", () => {
  for (const variant of ["notion-markdown", "notdown"] as const) {
    const source = '## Fold {toggle="true"}', c = config(variant, { notion_nesting: false });
    assert.equal(parseNative(source, c).firstChild!.type.name, "opaque_block");
    assert.equal(serializeNative(parseNative(source, c), c), source);
    assert.equal(parseNative(source, config(variant)).firstChild!.attrs.toggle, true);
  }
});

test("self-closing Notion block tags with trailing prose do not eat that prose", () => {
  for (const variant of ["notion-markdown", "notdown"] as const) for (const tag of ["empty-block", "table_of_contents", "unknown", "page", "file"]) {
    const c = config(variant), source = `<${tag}/> keep this text`;
    const doc = parseNative(source, c);
    assert.equal(doc.firstChild!.type.name, "paragraph");
    assert.equal(doc.textContent, source);
    const edited = EditorState.create({ doc }).tr.insertText(" edited", doc.content.size - 1).doc;
    assert.equal(parseNative(serializeNative(edited, c), c).textContent, source + " edited");
  }
});

test("shortcut reference switches apply equally to links and images, only where supported", () => {
  for (const { id } of dialects.filter(d => !usesNotionSyntax({ variant: d.id }))) {
    const c = config(id, { shortcut_reference_links: false, implicit_figures: false, implicit_header_references: false });
    const allowed = !supportsOption(c, "shortcut_reference_links");
    for (const [prefix, type] of [["", "link"], ["!", "image"]]) {
      const source = `${prefix}[label]\n\n[label]: https://example.com/pic.png`;
      assert.equal(contains(source, c, type), allowed, `${id}: ${type}`);
      assert.equal(serializeNative(parseNative(source, c), c), source);
      assert(contains(`${prefix}[label][]\n\n[label]: https://example.com/pic.png`, c, type), `${id}: full ${type}`);
    }
  }
});

test("default syntax matrix rejects inactive extensions and keeps code literal in every dialect", () => {
  const samples = [
    ["strikeout", "~~text~~", "strike"], ["highlight", "==text==", "highlight"],
    ["tex_math_dollars", "$x$", "inline_math"], ["subscript", "H~2~O", "subscript"],
    ["superscript", "x^2^", "superscript"], ["pipe_tables", "| A | B |\n|---|---|\n| x | y |", "table"],
    ["task_lists", "- [x] Task", "task_list_item"], ["definition_lists", "Term\n: Definition", "definition_list"],
    ["footnotes", "Text[^n]\n\n[^n]: Note", "footnote_reference"],
    ["alerts", "> [!NOTE]\n> Text", "callout"], ["fenced_divs", "::: {.box}\nText\n:::", "fenced_div"],
  ];
  for (const { id } of dialects) for (const [flag, source, type] of samples) {
    const c = config(id);
    // Notion's official example permits pipe tables via notion_tables.
    const expected = enabled(c, flag) || type === "table" && usesNotionSyntax(c);
    assert.equal(contains(source, c, type), expected, `${id}: ${flag}`);
    assert.equal(serializeNative(parseNative(source, c), c), source);
    const fenced = id === "markdown_strict" ? source.split("\n").map(l => "    " + l).join("\n") : "```\n" + source + "\n```";
    assert(!contains(fenced, c, type), `${id}: fenced ${flag}`);
    assert.equal(serializeNative(parseNative(fenced, c), c), fenced);
  }
});
