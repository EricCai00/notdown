import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "prosemirror-state";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec.js";
import { renderRawHtml } from "../../src/markdown-engine/html.js";
import { type SyntaxConfig } from "../../src/markdown-engine/config.js";
import { htmlDocument } from "../../src/document/document-format.js";
import { blockAtPos, moveEditorBlock, deleteEditorBlock } from "../../src/editor/editor-blocks.js";
const config = (extensions: Record<string, boolean> = {}): SyntaxConfig => ({
  version: 1,
  variant: "commonmark",
  extensions,
});
const examples = [
  [
    "definition_lists",
    "Term\n:   First **meaning**.\n\n    Second paragraph.\n\nOther\n~   Another definition.",
    "definition_list",
  ],
  [
    "footnotes",
    "[^note]: First **note**.\n\n    Second paragraph.",
    "footnote",
  ],
  [
    "line_blocks",
    "| The first line\n|   Indented *verse*\n| Last line",
    "line_block",
  ],
  [
    "fenced_divs",
    '::: {#example .note key="value"}\n## Title\n\nBody\n\n::: {.inner}\nNested\n:::\n:::',
    "fenced_div",
  ],
] as const;
test("editing line blocks preserves empty lines without replacement placeholders", () => {
  for (const variant of ["commonmark", "gfm", "markdown"] as const) {
    for (const space_in_atx_header of [true, false]) {
      const c: SyntaxConfig = {
        version: 1, variant, extensions: { line_blocks: true, space_in_atx_header },
      };
      const source = "| First line\n| \n| \n| Last line\n\nTail\n";
      const doc = parseNative(source, c);
      assert.equal(doc.firstChild!.type.name, "line_block");
      const changed = EditorState.create({ doc }).tr.insertText("EDIT ", 2).doc;
      const expected = source.replace("First line", "EDIT First line");
      const saved = serializeNative(changed, c);
      assert.equal(saved, expected, `${variant}, space_in_atx_header=${space_in_atx_header}`);
      const reopened = parseNative(saved, c);
      assert.equal(reopened.firstChild!.child(1).textContent, "");
      assert.equal(reopened.firstChild!.child(2).textContent, "");
      assert.equal(serializeNative(reopened, c), expected);
    }
  }
});
test("a lone pipe is an empty line-block row, never an MMD table separator", () => {
  for (const variant of ["notdown", "markdown_mmd"] as const) {
    for (const empty of ["|", "| ", "| \t"]) {
      for (const newline of ["\n", "\r\n"]) {
        const c: SyntaxConfig = { version: 1, variant, extensions: { line_blocks: true } };
        const rows = ["| dada", "| dasdasd", empty, "|   indented", "| $1\\$2", empty];
        const source = rows.join(newline) + newline + newline + "| Name | Count |" + newline + "| --- | --- |" + newline + "| Apple | 3 |";
        const doc = parseNative(source, c);
        doc.check();
        const lines = doc.firstChild!;
        assert.equal(lines.type.name, "line_block", `${variant}: ${JSON.stringify(empty)}`);
        assert.equal(lines.childCount, rows.length);
        assert.equal(lines.child(2).textContent.trim(), "");
        assert.equal(lines.child(3).textContent, "  indented");
        assert.equal(doc.lastChild!.type.name, "table");
        assert.equal(serializeNative(doc, c), source);
        const edited = EditorState.create({ doc }).tr.insertText("EDIT ", 2).doc;
        const saved = serializeNative(edited, c);
        const reopened = parseNative(saved, c).firstChild!;
        assert.equal(reopened.type.name, "line_block");
        assert.equal(reopened.childCount, rows.length);
        for (let i = 0; i < rows.length; i++) {
          assert.equal(reopened.child(i).textContent, (i === 0 ? "EDIT " : "") + lines.child(i).textContent);
        }
        assert(saved.endsWith(source.slice(source.indexOf("| Name | Count |"))));
        const fenced = "```text\n" + rows.join("\n") + "\n```";
        assert.equal(parseNative(fenced, c).firstChild!.type.name, "code_block");
        assert.equal(serializeNative(parseNative(fenced, c), c), fenced);
      }
    }
  }
});

test("invalid MMD separators stay text when line blocks are disabled", () => {
  const c: SyntaxConfig = { version: 1, variant: "markdown_mmd", extensions: { line_blocks: false } };
  for (const source of ["| A\n| B\n|", "[Caption]\n| A\n| B\n|", "Text\n| A\n| B\n|"]) {
    const doc = parseNative(source, c);
    doc.descendants(node => { assert.notEqual(node.type.name, "table"); });
    assert.equal(serializeNative(doc, c), source);
  }
});

test("valid MMD separators retain grouped headers, spans and captions before a lone pipe", () => {
  const c: SyntaxConfig = { version: 1, variant: "notdown", extensions: {} };
  for (const source of [
    "| Header |\n| --- |\n| Value |",
    "[Caption]\n| Group ||\n| A | B |\n| :=== | ===: |\n| Wide ||",
  ]) {
    const raw = source + "\n|";
    const doc = parseNative(raw, c);
    doc.check();
    assert.equal(doc.firstChild!.type.name, "table");
    assert.equal(doc.lastChild!.type.name, "line_block");
    assert.equal(serializeNative(doc, c), raw);
  }
});

test("Markdown-only blocks parse, edit, serialize and retain surrounding original source", () => {
  for (const [flag, source, type] of examples) {
    const c = config({ [flag]: true });
    const doc = parseNative(source + "\n\nTail\n", c);
    doc.check();
    assert.equal(doc.firstChild!.type.name, type, flag);
    assert.equal(serializeNative(doc, c), source + "\n\nTail\n");
    let pos = 0;
    doc.descendants((n, at) => {
      if (!pos && n.isText) pos = at;
    });
    const changed = EditorState.create({ doc }).tr.insertText("EDIT ", pos).doc;
    const saved = serializeNative(changed, c),
      reopened = parseNative(saved, c);
    reopened.check();
    assert.equal(reopened.firstChild!.type.name, type, flag + " edited");
    assert(reopened.textContent.includes("EDIT "));
    assert(saved.endsWith("\n\nTail\n"));
    const off = parseNative(source, config());
    assert(!off.toString().includes(type + "("), flag + " off");
    assert.equal(serializeNative(off, config()), source);
    assert.equal(
      parseNative("```md\n" + source + "\n```", c).firstChild!.type.name,
      "code_block",
    );
  }
});
test("HTML blocks and inline fragments render HTML with unchanged raw source and safe export", () => {
  const source =
    '<h2 class="from-browser">Web results</h2>\n\n<div>\nfsdf\n</div>\n\nBefore <span style="color: red">red **bold**</span> after.';
  const c = config(),
    doc = parseNative(source, c);
  doc.check();
  assert.equal(doc.firstChild!.type.name, "html_block");
  assert(doc.toString().includes("html_inline"));
  const html = htmlDocument("Title", source, [], "markdown", c);
  assert(html.includes("<h2>Web results</h2>"));
  assert(
    html.includes('<span style="color:red">red <strong>bold</strong></span>'),
  );
  assert.equal(serializeNative(doc, c), source);
  const edited = EditorState.create({ doc }).tr.setNodeMarkup(0, undefined, {
    ...doc.firstChild!.attrs,
    raw: "<h2>Edited</h2>",
  }).doc;
  assert(serializeNative(edited, c).startsWith("<h2>Edited</h2>"));
  assert(serializeNative(edited, c).endsWith("after."));
  assert.equal(
    parseNative(source, config({ raw_html: false })).firstChild!.type.name,
    "opaque_block",
  );
  assert.equal(
    parseNative("```html\n<h2>literal</h2>\n```", c).firstChild!.type.name,
    "code_block",
  );
  assert.equal(
    parseNative("<table><tr><td>HTML table</td></tr></table>", c).firstChild!
      .type.name,
    "html_block",
  );
});
test("HTML projection strips scripts, handlers, app actions, unsafe URLs and global style while keeping raw bytes", () => {
  const raw =
    '<script>alert(1)</script><style>body{display:none}</style><div id="editor" class="pm-document" data-action="delete" onclick="evil()" style="color: red;position:fixed;background-image:url(https://bad)">Safe</div><a href="javascript:evil()">Bad</a><svg onload="evil()"></svg><img src="x" onerror="evil()"><p><b>Good</b></p>';
  const clean = renderRawHtml(raw);
  assert.equal(renderRawHtml(clean), clean);
  assert.equal(
    clean,
    '<div id="md-editor" data-md-id="editor" style="color:red">Safe</div><a>Bad</a><img><p><b>Good</b></p>',
  );
  assert.equal(serializeNative(parseNative(raw, config()), config()), raw);
});
test("footnotes retain identifiers, continuation blocks, and references outside code", () => {
  const c = config({ footnotes: true }),
    source =
      "Text[^longnote]. `[^literal]`\n\n[^longnote]: Note\n\n    - One\n    - Two\n\nTail";
  const doc = parseNative(source, c);
  doc.check();
  assert(doc.firstChild!.toString().includes("footnote_reference"));
  assert.equal(doc.child(1).child(1).type.name, "bullet_list");
  assert.equal(doc.child(1).attrs.label, "longnote");
  assert.equal(doc.lastChild!.textContent, "Tail");
  assert(
    htmlDocument("Title", source, [], "markdown", c).includes(
      'href="#md-note-longnote"',
    ),
  );
  assert.equal(serializeNative(doc, c), source);
});
test("line blocks yield to pipe tables; Div nesting ignores fences and retains incomplete input", () => {
  const c = config({ pipe_tables: true, line_blocks: true, fenced_divs: true });
  assert.equal(
    parseNative("| A | B |\n| --- | --- |\n| 1 | 2 |", c).firstChild!.type.name,
    "table",
  );
  assert.equal(
    parseNative("| one long\n  continued\n| two", c).firstChild!.firstChild!
      .textContent,
    "one long continued",
  );
  const source = "::: {.box}\n```md\n:::\n```\n\nBody\n:::";
  const doc = parseNative(source, c);
  doc.check();
  assert.equal(doc.firstChild!.firstChild!.type.name, "code_block");
  assert.equal(doc.firstChild!.lastChild!.textContent, "Body");
  assert.equal(
    parseNative("::: {.box}\nUnclosed", c).firstChild!.type.name,
    "opaque_block",
  );
});
test("Div code boundaries, inline HTML in line blocks and GFM footnote defaults remain distinct", () => {
  const c = config({ fenced_divs: true, line_blocks: true });
  const source = "::: {.box}\n    :::\n\nInside\n:::\n\nTail";
  const doc = parseNative(source, c);
  doc.check();
  assert.equal(doc.firstChild!.type.name, "fenced_div");
  assert.equal(doc.firstChild!.firstChild!.type.name, "code_block");
  assert.equal(doc.firstChild!.lastChild!.textContent, "Inside");
  assert.equal(doc.lastChild!.textContent, "Tail");
  const verse = "| A <em>gentle</em> line\n| Another";
  const lines = parseNative(verse, c);
  assert(lines.toString().includes("html_inline"));
  assert.equal(serializeNative(lines, c), verse);
  assert(
    htmlDocument("Verse", verse, [], "markdown", c).includes("<em>gentle</em>"),
  );
  const gfm: SyntaxConfig = { version: 1, variant: "gfm", extensions: {} };
  assert.equal(
    parseNative("[^n]: Note", { ...gfm, extensions: { footnotes: true } }).firstChild!.type.name,
    "footnote",
  );
  assert.equal(
    parseNative("[^n]: Note", { ...gfm, extensions: { footnotes: false } })
      .firstChild!.type.name,
    "paragraph",
  );
});

test("new containers drag as a complete block and keep source after moving", () => {
  for (const [flag, source, type] of examples) {
    const c = config({ [flag]: true }),
      doc = parseNative(source + "\n\nTail", c);
    let at = 0;
    doc.descendants((n, pos) => {
      if (!at && n.isText) at = pos;
    });
    if (type === "footnote") {
      assert.equal(blockAtPos(doc, at), null);
      assert.equal(moveEditorBlock(EditorState.create({ doc }), 0, doc.firstChild!.nodeSize, "after"), null);
      continue;
    }
    assert.equal(blockAtPos(doc, at)?.node.type.name, type === "fenced_div" ? "heading" : type);
    assert.equal(blockAtPos(doc, 0)?.node.type.name, type);
    const tr = moveEditorBlock(
      EditorState.create({ doc }),
      0,
      doc.firstChild!.nodeSize,
      "after",
    );
    assert(tr);
    tr.doc.check();
    const reopened = parseNative(serializeNative(tr.doc, c), c);
    reopened.check();
    assert.equal(reopened.lastChild!.type.name, type);
  }
});

test("Div children resolve independently, move across the container boundary and retain both encodings", () => {
  for (const [opening, closing] of [['::: {.box custom="keep"}', ':::'], ['<div class="box" custom="keep">', '</div>']]) {
    const c: SyntaxConfig = { ...config({ fenced_divs: true, native_divs: true }), variant: "markdown" };
    const source = `${opening}\nFirst\n\nSecond\n${closing}\n\nTail`;
    const doc = parseNative(source, c);
    const group = doc.firstChild!;
    const first = 1, second = first + group.firstChild!.nodeSize, tail = group.nodeSize;
    assert.equal(blockAtPos(doc, first + 1)?.pos, first);
    assert.equal(blockAtPos(doc, second + 1)?.pos, second);
    assert.equal(blockAtPos(doc, 0)?.node.type.name, "fenced_div");
    const state = EditorState.create({ doc });
    const moved = moveEditorBlock(state, first, tail, "after")!;
    assert(moved);
    assert.equal(moved.doc.firstChild!.textContent, "Second");
    assert.equal(moved.doc.lastChild!.textContent, "First");
    const saved = serializeNative(moved.doc, c);
    assert(saved.startsWith(opening));
    const reopened = parseNative(saved, c);
    assert.equal(reopened.firstChild!.type.name, "fenced_div");
    assert.equal(reopened.firstChild!.textContent, "Second");
    assert.equal(reopened.lastChild!.textContent, "First");
    const reordered = moveEditorBlock(state, second, first, "before")!;
    assert.equal(reordered.doc.firstChild!.firstChild!.textContent, "Second");
    const deleted = deleteEditorBlock(state, first)!;
    assert.equal(deleted.doc.firstChild!.type.name, "fenced_div");
    assert.equal(deleted.doc.firstChild!.textContent, "Second");
  }
});

test("nested Div boundaries and their first children remain separate drag targets", () => {
  const inner = parseNative('::: {.inner}\nNested\n:::', config({ fenced_divs: true })).firstChild!;
  const schema = inner.type.schema;
  const outer = schema.nodes.fenced_div.create(null, inner);
  const doc = schema.nodes.doc.create(null, schema.nodes.callout.create(null, outer));
  doc.check();
  assert.equal(blockAtPos(doc, 1)?.node, outer);
  assert.equal(blockAtPos(doc, 2)?.node, inner);
  assert.equal(blockAtPos(doc, 4)?.node, inner.firstChild);
});
