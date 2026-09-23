import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "prosemirror-state";
import { parseNative, serializeNative } from "../src/markdown-engine/codec";
import type { SyntaxConfig } from "../src/markdown-engine/config";
import { plainText } from "../src/plain-text";
import { renderNotionMarkdown } from "../src/document-format";
import { exampleLists } from "../src/example-lists";

const config = (extensions: Record<string, boolean> = {}): SyntaxConfig => ({ version: 1, variant: "markdown", extensions });

test("small caps preserve HTML/bracketed encoding and unknown attributes after editing", () => {
  const c = config({ native_spans: true, bracketed_spans: true });
  for (const source of ['[Small]{.smallcaps data-custom="keep"}', '<span class="smallcaps" data-custom="keep">Small</span>']) {
    const doc = parseNative(source, c), changed = EditorState.create({ doc }).tr.insertText("X", 2).doc;
    const output = serializeNative(changed, c), reopened = parseNative(output, c);
    assert.equal(reopened.firstChild!.firstChild!.marks.find(m => m.type.name === "small_caps")?.attrs.attributes["data-custom"], "keep", output);
    assert.equal(output.startsWith("<span"), source.startsWith("<span"));
  }
});

test("Div closing tags inside code fences cannot truncate content", () => {
  const c = config({ native_divs: true, fenced_code_blocks: true });
  const source = '<div class="sample">\n\n```html\n</div>\n```\n\nKept\n\n</div>\n\nTail';
  const doc = parseNative(source, c); assert.equal(doc.firstChild!.type.name, "fenced_div");
  assert.equal(doc.firstChild!.firstChild!.textContent, "</div>");
  assert.equal(doc.firstChild!.lastChild!.textContent, "Kept");
  assert.equal(serializeNative(doc, c), source);
  const mixed = '<div class="sample">Inline opening text\n\nBody\n\n</div>';
  assert.equal(serializeNative(parseNative(mixed, c), c), mixed);
});

test("raw TeX keeps balanced nested command arguments as one editable object", () => {
  const c = config({ raw_tex: true });
  const raw = '\\textbf{outer \\emph{inner}}';
  const doc = parseNative(raw + " tail", c);
  assert.equal(doc.firstChild!.firstChild!.attrs.raw, raw);
  assert.equal(doc.firstChild!.lastChild!.textContent, " tail");
});

test("example item deletion renumbers later items and their references", () => {
  const c = config({ example_lists: true });
  const doc = parseNative('(@first) First\n(@second) Second\n\nSee @second.', c);
  let state = EditorState.create({ doc, plugins: [exampleLists()] });
  state = state.apply(state.tr.delete(1, 1 + doc.firstChild!.firstChild!.nodeSize));
  assert.equal(state.doc.firstChild!.firstChild!.attrs.number, 1);
  let reference = ""; state.doc.descendants(n => { if (n.attrs.kind === "example-reference") reference = n.attrs.label; });
  assert.equal(reference, "1");
  const saved = serializeNative(state.doc, c); assert.equal(parseNative(saved, c).firstChild!.firstChild!.attrs.number, 1);
});
for (const [name, source, type] of [
  ["grid_tables", "+-------+-------+\n| Name  | Value |\n+=======+=======+\n| One   | Two   |\n+-------+-------+", "table"],
  ["simple_tables", "Name    Value\n------- -------\nOne     Two", "table"],
  ["multiline_tables", "---------------\nName    Value\n------- -------\nOne     Two\n        Three\n---------------", "table"],
  ["native_divs", '<div class="example">\n\nText **bold**\n\n</div>', "fenced_div"],
  ["raw_tex", "\\begin{center}\nhello\n\\end{center}", "syntax_block"],
  ["example_lists", "(@first) One\n(@second) Two", "example_list"],
  ["fancy_lists", "a. One\nb. Two", "ordered_list"],
  ["literate_haskell", "> main = print 1\n> value = 2", "code_block"],
  ["tex_math_single_backslash", "\\[\nx+1\n\\]", "equation"],
  ["tex_math_gfm", "```math\nx+1\n```", "equation"],
] as const) test(`${name}: source retention, editing and reopening`, () => {
  const c = config({ [name]: true });
  if (name === "tex_math_gfm") c.variant = "gfm";
  const input = source.replace(/\n/g, "\r\n") + "\r\n\r\nTail";
  const doc = parseNative(input, c); doc.check();
  assert.equal(doc.firstChild!.type.name, type);
  assert.equal(serializeNative(doc, c), input);
  let pos: number | undefined;
  doc.firstChild!.descendants((n, p) => { if (pos === undefined && n.isText) pos = p + 1; });
  const tr = EditorState.create({ doc }).tr;
  if (pos !== undefined) tr.insertText("edited ", pos);
  else tr.setNodeMarkup(0, undefined, { ...doc.firstChild!.attrs, raw: source.replace("hello", "edited") });
  const output = serializeNative(tr.doc, c), reopened = parseNative(output, c); reopened.check();
  assert.equal(reopened.firstChild!.type.name, type, output);
  assert.equal(reopened.lastChild!.textContent, "Tail", output);
});

test("native inline syntax remains editable and uses its encoding after changes", () => {
  const c = config({ native_spans: true, bracketed_spans: true, inline_notes: true, inline_code_attributes: true, mark: true });
  const doc = parseNative('[Small]{.smallcaps} <span class="user">Native</span> ^[a **note**] `code`{.sample} ==light==', c);
  doc.check();
  const marks = new Set<string>(); doc.descendants(n => { n.marks.forEach(m => marks.add(m.type.name)); });
  for (const mark of ["small_caps", "native_span", "strong", "code", "highlight"]) assert.ok(marks.has(mark), mark);
  const changed = EditorState.create({ doc }).tr.insertText("X", 2).doc;
  const output = serializeNative(changed, c); const reopened = parseNative(output, c); reopened.check();
  assert.equal(reopened.textContent, changed.textContent, output);
});

test("table captions and attributes persist across edited pipe and grid encodings", () => {
  for (const source of ["| Name | Value |\n|---|---|\n| One | Two |", "+-----+-----+\n| One | Two |\n+-----+-----+"]) {
    const c = config({ table_captions: true, table_attributes: true, grid_tables: true, pipe_tables: true });
    const input = source + '\n\nTable: **Numbers** {#data .striped}\n\nTail';
    const doc = parseNative(input, c); assert.equal(doc.firstChild!.type.name, "table");
    assert.equal(doc.firstChild!.attrs.markdownAttrs.id, "data");
    assert.equal(doc.firstChild!.firstChild!.type.name, "table_caption");
    const changed = EditorState.create({ doc }).tr.insertText("New ", 2).doc;
    const output = serializeNative(changed, c), reopened = parseNative(output, c);
    assert.equal(reopened.firstChild!.attrs.markdownAttrs.id, "data", output);
    assert.equal(reopened.firstChild!.firstChild!.textContent, "New Numbers", output);
    assert.equal(reopened.lastChild!.textContent, "Tail");
  }
});

test("reference switches, path rebasing and source positions preserve Markdown spelling", () => {
  const source = '[label] [ref] and [ref]\n\n[ref]: files/note.md';
  const c = config({ spaced_reference_links: true, shortcut_reference_links: false, rebase_relative_paths: true, sourcepos: true }); c.variant = "typora"; c.sourcePath = "chapters/page.md";
  const doc = parseNative(source, c), first = doc.firstChild!.firstChild!;
  assert.equal(first.marks[0]?.attrs.href, "chapters/files/note.md");
  assert.equal(doc.firstChild!.lastChild!.textContent, " and [ref]");
  assert.equal(doc.firstChild!.attrs.markdownAttrs._sourcepos, "1:1-1:23");
  const changed = EditorState.create({ doc }).tr.insertText("X", 2).doc;
  const result = serializeNative(changed, c);
  assert(!result.includes("_sourcepos")); assert(!result.includes("_rebased")); assert(!result.includes("chapters/files"));
  assert.equal(serializeNative(doc, c), source);
});

test("LaTeX macro context renders math without rewriting formulas or code examples", () => {
  const c = config({ latex_macros: true });
  const source = '\\newcommand{\\RR}{\\mathbb{R}}\n\n$\\RR$\n\n```tex\n\\newcommand{\\bad}{x}\n```';
  const doc = parseNative(source, c); assert.equal(doc.firstChild!.attrs.data.latexDefinition, true);
  const math = doc.child(1).firstChild!; assert.equal(math.attrs.value, "\\RR"); assert.match(math.attrs.latexPrefix, /newcommand/);
  assert.equal(serializeNative(doc, c), source);
  assert.equal(doc.lastChild!.type.name, "code_block");
  assert(!renderNotionMarkdown(source, [], { document: doc }).includes("katex-error"));
  const off = parseNative(source, config({ latex_macros: false })); assert.equal(off.child(1).firstChild!.attrs.latexPrefix, "");
});

test("Gutenberg changes plain-text export and leaves Markdown persistence alone", () => {
  const c = config({ gutenberg: true }), source = "# Title\n\n**Strong** and *emphasis*";
  assert.match(plainText(source, c), /STRONG and _emphasis_/);
  assert.equal(serializeNative(parseNative(source, c), c), source);
});

test("legacy dashes require smart typography and do not touch code", () => {
  const source = "-5 -- `-- -5`";
  assert.match(parseNative(source, config({ smart: true, old_dashes: true })).textContent, /^–5 — -- -5$/);
  assert.equal(parseNative(source, config({ smart: false, old_dashes: true })).textContent, source.replaceAll("`", ""));
});
