import { editorKind } from "../../src/document/node-identity";
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { EditorState } from "prosemirror-state";
import { editorSchema as schema } from "../../src/document/editor-schema.js";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec.js";
import {
  dialects,
  extensions,
  enabled,
  supportsOption,
  pandocDefaults,
  pendingExtensions,
  type Dialect,
  type SyntaxConfig,
} from "../../src/markdown-engine/config.js";

const added: Dialect[] = [
  "markdown",
  "markdown_strict",
  "markdown_phpextra",
  "markdown_mmd",
  "markdown_github",
  "commonmark_x",
];
const config = (
  variant: Dialect,
  flags: Record<string, boolean> = {},
): SyntaxConfig => ({ version: 1, variant, extensions: flags });
const types = (source: string, c: SyntaxConfig) =>
  parseNative(source, c).content.content.map((n) => editorKind(n));

test("list interruption flags never swallow consecutive list items", () => {
  for (const variant of added) {
    const c = config(variant);
    for (const source of [
      "3. item\n4. item\n5. item",
      "- one\n- two\n- three",
    ]) {
      const doc = parseNative(source, c);
      assert.equal(doc.firstChild!.childCount, 3, variant + " " + source);
      assert.equal(serializeNative(doc, c), source);
      const changed = EditorState.create({ doc }).tr.insertText(
        " edited",
        doc.content.size - 3,
      ).doc;
      assert.equal(
        parseNative(serializeNative(changed, c), c).firstChild!.childCount,
        3,
      );
    }
  }
  assert.deepEqual(types("text\n- item", config("markdown_phpextra")), [
    "paragraph",
  ]);
});

test("only Pandoc presets use the captured Pandoc defaults for implemented extensions", () => {
  assert.equal(dialects.length, 14);
  assert(dialects.every((d) => d.native));
  for (const variant of ["markdown", "commonmark_x", "markdown_github"] as Dialect[]) {
    const c = config(variant);
    for (const extension of extensions.filter(
      (e) => !e.id.startsWith("notion_"),
    )) {
      if (Object.hasOwn(pandocDefaults[variant], extension.id))
        assert.equal(
          enabled(c, extension.id),
          pandocDefaults[variant][extension.id],
          variant + " " + extension.id,
        );
    }
    for (const name of pendingExtensions(c))
      assert.equal(enabled(config(variant, { [name]: true }), name), false);
    assert.equal(
      enabled(config(variant, { future_extension: true }), "future_extension"),
      false,
    );
  }
  assert.equal(
    supportsOption(config("commonmark"), "blank_before_header"),
    false,
  );
  assert.equal(supportsOption(config("notion-markdown"), "smart"), false);
});

test("the six readers differ on headings, lists, fences, typography and default blocks", () => {
  const checks: [Dialect, string, string[]][] = [
    ["markdown", "text\n# Heading", ["paragraph"]],
    ["markdown", "# Heading\n# Next", ["heading", "heading"]],
    ["markdown_strict", "#nospace", ["heading"]],
    ["markdown_github", "#nospace", ["paragraph"]],
    ["markdown_phpextra", "~~~\nx\n~~~", ["code_block"]],
    ["markdown_phpextra", "```\nx\n```", ["code_block"]],
    ["markdown_mmd", "```\nx\n```", ["code_block"]],
    ["markdown_strict", "~~~\nx\n~~~", ["paragraph"]],
    ["markdown_strict", "text\n- item", ["paragraph"]],
    ["markdown_github", "text\n- item", ["paragraph", "bullet_list"]],
    ["commonmark_x", "Term\n:   Definition", ["definition_list"]],
    ["markdown_mmd", "Term\n:   Definition", ["definition_list"]],
    ["markdown", "| Line\n|   Indent", ["line_block"]],
    ["commonmark_x", "::: {.note}\nBody\n:::", ["fenced_div"]],
  ];
  for (const [variant, source, expected] of checks) {
    const c = config(variant),
      doc = parseNative(source, c);
    doc.check();
    assert.deepEqual(types(source, c), expected, variant + " " + source);
    assert.equal(serializeNative(doc, c), source);
  }
  assert.match(
    parseNative("foo_bar_baz", config("markdown_strict")).toString(),
    /em\("bar"\)/,
  );
  assert.equal(
    parseNative("foo_bar_baz", config("markdown_mmd")).textContent,
    "foo_bar_baz",
  );
  assert.equal(
    parseNative('"hello" -- ...', config("markdown")).textContent,
    "“hello” – …",
  );
  assert.equal(
    parseNative('"hello" -- ...', config("markdown_strict")).textContent,
    '"hello" -- ...',
  );
  assert.equal(
    parseNative(":smile:", config("markdown_github")).textContent,
    "😄",
  );
});

test("base-rule extension switches change actual parsing and preserve source", () => {
  const source = "text\n# Heading";
  assert.deepEqual(
    types(source, config("markdown", { blank_before_header: false })),
    ["paragraph", "heading"],
  );
  assert.deepEqual(types("text\n> quote", config("markdown")), ["paragraph"]);
  assert.deepEqual(
    types(
      "text\n> quote",
      config("markdown", { blank_before_blockquote: false }),
    ),
    ["paragraph", "blockquote"],
  );
  assert.deepEqual(
    types("#nospace", config("markdown_strict", { space_in_atx_header: true })),
    ["paragraph"],
  );
  assert.deepEqual(
    types(
      "text\n- item",
      config("markdown_strict", { lists_without_preceding_blankline: true }),
    ),
    ["paragraph", "bullet_list"],
  );
  assert.deepEqual(
    types(
      "```\nx\n```",
      config("markdown_strict", { backtick_code_blocks: true }),
    ),
    ["code_block"],
  );
  assert.deepEqual(
    types(
      "~~~\nx\n~~~",
      config("markdown_strict", { fenced_code_blocks: true }),
    ),
    ["code_block"],
  );
  assert.equal(
    parseNative("x\ny", config("markdown", { ignore_line_breaks: true }))
      .textContent,
    "xy",
  );
  assert.match(
    parseNative("x\\\ny", config("markdown")).toString(),
    /character\.line_break/,
  );
  assert.doesNotMatch(
    parseNative("x\\\ny", config("markdown_strict")).toString(),
    /character\.line_break/,
  );
  assert.equal(parseNative("\\@", config("markdown")).textContent, "@");
  assert.equal(
    parseNative("\\@", config("markdown_strict")).textContent,
    "\\@",
  );
  assert.equal(
    parseNative("5. Five", config("markdown")).firstChild!.attrs.order,
    5,
  );
  assert.equal(
    parseNative("5. Five", config("markdown_strict")).firstChild!.attrs.order,
    1,
  );
});

test("code created or edited in every reader serializes to a supported spelling", () => {
  const code = "first\n\n```\nlast";
  for (const variant of added) {
    const c = config(variant),
      doc = schema.nodes["doc"].create(null, [
        schema.nodes["block.code_block"].create(null, schema.text(code)),
      ]);
    const written = serializeNative(doc, c),
      reopened = parseNative(written, c);
    reopened.check();
    assert.equal(
      editorKind(reopened.firstChild!),
      "code_block",
      variant + " " + written,
    );
    assert.equal(reopened.firstChild!.textContent, code, variant);
    if (variant === "markdown_strict") assert(written.startsWith("    first"));
    if (variant === "markdown_phpextra") assert(written.startsWith("````"));
    if (variant === "markdown_mmd") assert(written.startsWith("````"));
    const changed = EditorState.create({ doc: reopened }).tr.insertText(
      "EDIT ",
      1,
    ).doc;
    assert.equal(
      parseNative(serializeNative(changed, c), c).firstChild!.textContent,
      "EDIT " + code,
    );
  }
});

test("literal punctuation and metadata-looking paragraphs survive structured writing in every reader", () => {
  for (const variant of added)
    for (const text of [
      "~plain~ <word> \\@ $money ^plain^",
      "#nospace",
      "Title: facts",
      "% plain",
    ]) {
      const c = config(variant),
        doc = schema.nodes["doc"].create(null, [
          schema.nodes["block.paragraph"].create(null, schema.text(text)),
        ]);
      const written = serializeNative(doc, c),
        reopened = parseNative(written, c);
      reopened.check();
      assert.equal(
        editorKind(reopened.firstChild!),
        "paragraph",
        variant + " " + written,
      );
      assert.equal(reopened.textContent, text, variant + " " + written);
    }
  // Enabling a metadata reader must not assume broad backslash escaping is on.
  const c = config("markdown_strict", {
    mmd_title_block: true,
    pandoc_title_block: true,
    all_symbols_escapable: false,
  });
  for (const text of ["Title: facts", "% plain"]) {
    const doc = schema.nodes["doc"].create(null, [
      schema.nodes["block.paragraph"].create(null, schema.text(text)),
    ]);
    const reopened = parseNative(serializeNative(doc, c), c);
    assert.equal(editorKind(reopened.firstChild!), "paragraph");
    assert.equal(reopened.textContent, text);
  }
});

test("subscript, superscript, abbreviation and metadata retain source through neighboring edits", () => {
  const c = config("markdown"),
    body = "H~2~O and x^2^\n\nTail";
  const doc = parseNative(body, c);
  assert.match(doc.toString(), /subscript\("2"\)/);
  assert.match(doc.toString(), /superscript\("2"\)/);
  const marked = schema.nodes["doc"].create(null, schema.nodes["block.paragraph"].create(null, [
      schema.text("two words", [schema.marks.superscript.create()]),
    ]));
  assert.equal(
    parseNative(serializeNative(marked, c), c).firstChild!.firstChild!.text,
    "two words",
  );
  assert.equal(
    editorKind(parseNative(serializeNative(marked, c), c).firstChild!.firstChild!.marks[0]),
    "superscript",
  );
  const abbreviation = "*[HTML]: Hyper Text Markup Language\n\nHTML document";
  const abbr = parseNative(abbreviation, config("markdown_phpextra"));
  assert.match(abbr.toString(), /abbreviation\("HTML"\)/);
  const changed = EditorState.create({ doc: abbr }).tr.insertText(
    " edited",
    abbr.content.size - 1,
  ).doc;
  const saved = serializeNative(changed, config("markdown_phpextra"));
  assert(saved.startsWith("*[HTML]: Hyper Text Markup Language"));
  assert.match(
    parseNative(saved, config("markdown_phpextra")).toString(),
    /abbreviation\("HTML"\)/,
  );
  for (const [variant, metadata] of [
    ["markdown", "% Title\n% Author"],
    ["markdown", "---\ntitle: Example\n---"],
    ["markdown_mmd", "Title: Example\nAuthor: Me"],
  ] as const) {
    const c = config(variant),
      source = metadata + "\n\nTail",
      doc = parseNative(source, c);
    doc.check();
    assert.equal(editorKind(doc.firstChild!), enabled(c,'metadata_values')?'syntax_block':'opaque_block');
    const changed = EditorState.create({ doc }).tr.insertText(
      " edit",
      doc.content.size - 1,
    ).doc;
    assert.equal(serializeNative(changed, c), source + " edit");
  }
});

test("fenced Div syntax distinguishes the Markdown and CommonMark reader families", () => {
  const source = "::: Warning :::::\nText\n:::";
  assert.equal(
    editorKind(parseNative(source, config("markdown")).firstChild!),
    "fenced_div",
  );
  assert.notEqual(
    editorKind(parseNative(source, config("commonmark_x")).firstChild!),
    "fenced_div",
  );
  assert.deepEqual(types("text\n::: {.note}\nBody\n:::", config("markdown")), [
    "paragraph",
  ]);
  assert.deepEqual(
    types("text\n::: {.note}\nBody\n:::", config("commonmark_x")),
    ["paragraph", "fenced_div"],
  );
  const code = "::: {.box}\n```\n::: fake :::::\n```\n:::";
  const doc = parseNative(code, config("commonmark_x"));
  doc.check();
  assert.equal(editorKind(doc.firstChild!.firstChild!), "code_block");
  // A disabled code fence cannot hide the closing Div marker from the scanner.
  const strict = config("markdown_strict", { fenced_divs: true });
  assert.deepEqual(types("::: note\n~~~\n:::\n\nTail", strict), [
    "fenced_div",
    "paragraph",
  ]);
});

test("core block decisions match installed Pandoc for Pandoc-defined variants", (t) => {
  const binary = process.env.PANDOC_PATH || "pandoc";
  if (
    spawnSync(binary, ["--version"], { encoding: "utf8", windowsHide: true })
      .error
  ) {
    t.skip("Pandoc is not installed");
    return;
  }
  const names: Record<string, string> = {
    Para: "paragraph",
    Header: "heading",
    CodeBlock: "code_block",
    BlockQuote: "blockquote",
    BulletList: "bullet_list",
    OrderedList: "ordered_list",
    DefinitionList: "definition_list",
    LineBlock: "line_block",
    Div: "fenced_div",
    RawBlock: "html_block",
  };
  const samples = [
    "1) Item",
    "Hello. world",
    "abc) text",
    "(a. text",
    "IIV. text",
    "iV. text",
    "A. Smith",
    "A.  Item",
    "I.  Item",
    "text\n# Heading",
    "# Heading\n# Next",
    "#nospace",
    "text\n> quote",
    "text\n- item",
    "~~~\nx\n~~~",
    "```\nx\n```",
    "Term\n:   Definition",
    "| Line\n| Other",
    "::: {.note}\nBody\n:::",
  ];
  for (const variant of ["markdown", "commonmark_x", "markdown_github"] as Dialect[])
    for (const source of samples) {
      const output = spawnSync(binary, ["--from", variant, "--to", "json"], {
        input: source,
        encoding: "utf8",
        windowsHide: true,
      });
      assert.equal(output.status, 0, output.stderr);
      const expected = JSON.parse(output.stdout).blocks.map(
        (n: { t: string }) => names[n.t],
      );
      const actual = types(source, config(variant));
      // A disabled explicit container stays as a recoverable raw block in Notdown.
      // Pandoc displays that spelling as a paragraph; neither interprets it as Div.
      const projected =
        source.startsWith(":::") && !enabled(config(variant), "fenced_divs")
          ? actual.map((name) => (name === "opaque_block" ? "paragraph" : name))
          : actual;
      assert.deepEqual(projected, expected, variant + " " + source);
    }
});
