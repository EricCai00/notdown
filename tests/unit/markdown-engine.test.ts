import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "prosemirror-state";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec.js";
import {
  defaultSyntax,
  enabled,
  validSyntax,
  resetExtensions,
  type SyntaxConfig,
} from "../../src/markdown-engine/config.js";
import { DocumentSession } from "../../src/markdown-engine/session.js";
import {
  getOutline,
  extractLinks,
  htmlDocument,
} from "../../src/document/document-format.js";
import { createVault, VaultError } from "../../server/vault.js";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const config = (
  variant: SyntaxConfig["variant"],
  extensions: Record<string, boolean> = {},
): SyntaxConfig => ({ version: 1, variant, extensions });
test("native variants change real parsing rules without rewriting source", () => {
  const source =
    "# Title\n\n~~gone~~\n\n- [x] Done\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n";
  const common = parseNative(source, config("commonmark")),
    gfm = parseNative(source, config("gfm"));
  common.check();
  gfm.check();
  assert(!common.toString().includes("strike("));
  assert(gfm.toString().includes("strike("));
  assert.equal(gfm.child(2).firstChild!.attrs.checked, true);
  assert.equal(common.child(2).firstChild!.attrs.checked, null);
  assert.equal(gfm.lastChild!.type.name, "table");
  assert.equal(serializeNative(common, config("commonmark")), source);
  assert.equal(serializeNative(gfm, config("gfm")), source);
  const changed = EditorState.create({ doc: gfm }).tr.insertText(
    " edited",
    3,
  ).doc;
  const written = serializeNative(changed, config("gfm"));
  assert(written.includes("| A | B |\n| --- | --- |"));
  assert(parseNative(written, config("gfm")).toString().includes("table"));
});
test("each enabled Notion container is available in Markdown and disabling preserves its raw payload", () => {
  const examples = [
    [
      "notion_callouts",
      '<callout icon="💡">\n\tCareful\n</callout>',
      "callout",
    ],
    [
      "notion_columns",
      "<columns>\n\t<column>\n\t\tLeft\n\t</column>\n\t<column>\n\t\tRight\n\t</column>\n</columns>",
      "columns",
    ],
    [
      "notion_toggles",
      "<details>\n<summary>Title</summary>\n\tBody\n</details>",
      "toggle_block",
    ],
    ["notion_tables", "<table>\n<tr>\n<td>A</td>\n</tr>\n</table>", "table"],
    ["notion_media", '<audio src="assets/a.mp3">clip</audio>', "media_block"],
    [
      "notion_pages",
      '<page url="https://example.com">page</page>',
      "child_page",
    ],
    [
      "notion_databases",
      '<database url="https://example.com">db</database>',
      "opaque_block",
    ],
    [
      "notion_synced",
      "<synced_block>\n\tShared\n</synced_block>",
      "synced_block",
    ],
    ["notion_toc", "<table_of_contents/>", "table_of_contents"],
  ];
  for (const [extension, source, type] of examples) {
    for (const variant of ["notion-markdown", "commonmark"] as const) {
      const on = config(variant, { [extension]: true }),
        off = config(variant, { [extension]: false, raw_html: false });
      const active = parseNative(source, on),
        inactive = parseNative(source, off);
      active.check();
      inactive.check();
      assert.equal(
        active.firstChild!.type.name,
        type,
        extension + " " + variant,
      );
      assert.equal(
        inactive.firstChild!.type.name,
        "opaque_block",
        extension + " disabled " + variant,
      );
      assert.equal(serializeNative(inactive, off), source);
      const fenced = "```text\n" + source + "\n```";
      assert.equal(parseNative(fenced, on).firstChild!.type.name, "code_block");
    }
  }
});
test("extension flags affect inline rules, preserve code literals, and persist edited pipe tables", () => {
  const c = config("commonmark", {
    tex_math_dollars: true,
    wikilinks_title_after_pipe: true,
    notion_colors: true,
    notion_mentions: true,
  });
  const source =
    '$x^2$ and [[target|Label]] and <span color="red">Red</span>\n\n`$literal$ [[x]]`';
  const doc = parseNative(source, c);
  doc.check();
  assert(doc.toString().includes("inline_math"));
  assert(doc.toString().includes("page_link"));
  assert(doc.toString().includes("color("));
  assert.deepEqual(extractLinks(source, "markdown", c), ["target"]);
  const mathOff = parseNative("$x$\n\n$$\nx\n$$", config("commonmark"));
  assert(!mathOff.toString().includes("inline_math"));
  const tableSource = "| A | B |\n| :--- | ---: |\n| 1 | 2 |";
  const g = config("gfm");
  const table = parseNative(tableSource, g);
  const edited = EditorState.create({ doc: table }).tr.insertText("X", 4).doc;
  const saved = serializeNative(edited, g),
    reopened = parseNative(saved, g);
  reopened.check();
  assert.equal(reopened.firstChild!.type.name, "table");
  assert(reopened.textContent.includes("XA"));
  assert(saved.includes("| :--- | ---: |"));
  assert.equal(
    reopened.firstChild!.firstChild!.lastChild!.attrs.nfmAttrs.align,
    "right",
  );
  assert(htmlDocument("Title", source, [], "markdown", c).includes("katex"));
  assert.equal(
    parseNative("one\ntwo", config("commonmark")).firstChild!.textContent,
    "one two",
  );
  assert.equal(
    parseNative(
      "one\ntwo",
      config("commonmark", { hard_line_breaks: true }),
    ).firstChild!.child(1).type.name,
    "hard_break",
  );
  const marks = parseNative('**<span color="red">Both</span>**', c).firstChild!
    .firstChild!.marks;
  assert.deepEqual(marks.map((m) => m.type.name).sort(), ["color", "strong"]);
});
test("source, blocks, syntax changes and shared undo retain a single recoverable draft", () => {
  const c = config("notion-markdown");
  const session = new DocumentSession("Before\n\nTail", c);
  session.sourceChanged("Source edit\n\nTail");
  session.breakHistory();
  const doc = EditorState.create({ doc: session.snapshot.doc }).tr.insertText(
    "!",
    2,
  ).doc;
  session.documentChanged(doc);
  const changed = session.snapshot.source;
  assert(session.undo());
  assert.equal(session.snapshot.source, "Source edit\n\nTail");
  assert(session.redo());
  assert.equal(session.snapshot.source, changed);
  session.configure(config("commonmark"));
  assert.equal(session.snapshot.source, changed);
  assert.equal(session.format, "markdown");
  assert(session.undo());
  assert.equal(session.snapshot.config.variant, "notion-markdown");
  assert.equal(session.snapshot.source, changed);
  session.sourceChanged("Deferred", true);
  assert.equal(session.snapshot.source, "Deferred");
  session.project();
  assert.equal(session.snapshot.doc.textContent, "Deferred");
});
test("unknown syntax, reference definitions, CRLF and unknown configuration fields survive neighboring edits", () => {
  const c = {
    ...config("commonmark"),
    future: { keep: 1 },
    extensions: { future_extension: true },
  };
  assert(validSyntax(c));
  assert.equal(enabled(c, "future_extension"), false);
  assert.deepEqual(
    resetExtensions({
      ...c,
      extensions: { future_extension: true, pipe_tables: true },
    }),
    { future_extension: true },
  );
  const source =
    '# Title\r\n\r\n<future option="keep">\r\nunknown\r\n</future>\r\n\r\n[ref]: https://example.com\r\n\r\n[Label][ref]\r\n';
  const doc = parseNative(source, c);
  assert.equal(serializeNative(doc, c), source);
  const next = EditorState.create({ doc }).tr.insertText("!", 3).doc;
  const written = serializeNative(next, c);
  assert(written.includes('<future option="keep">\r\nunknown\r\n</future>'));
  assert(written.includes("[ref]: https://example.com"));
  assert.equal(getOutline(written, "markdown", c)[0].text, "Ti!tle");
});
test("syntax configuration is persisted atomically with Markdown and survives CAS conflict recovery", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "notdown-syntax-"));
  try {
    const vault = createVault(directory);
    const page = await vault.create({
      title: "Syntax",
      body: "Text",
      syntax: config("commonmark"),
      bodyFormat: "markdown",
    });
    const saved = await vault.update(
      page.id,
      { body: "Changed", syntax: { ...config("gfm"), future: { keep: true } } },
      page.revision,
    );
    assert.equal(saved.syntax?.variant, "gfm");
    assert.equal(saved.bodyFormat, "markdown");
    const reopened = await vault.get(page.id);
    assert.deepEqual(reopened.syntax, saved.syntax);
    await assert.rejects(
      vault.update(
        page.id,
        { syntax: config("notion-markdown") },
        saved.revision,
      ),
      (e) => e instanceof VaultError && e.status === 400,
    );
    await assert.rejects(
      vault.update(
        page.id,
        { body: "Other branch", syntax: config("notion-markdown") },
        page.revision,
      ),
      (e) => e instanceof VaultError && e.status === 409,
    );
    const conflicts = await vault.listConflicts();
    assert.equal(conflicts.length, 1);
    const branch = conflicts[0];
    assert.equal(branch.proposed.syntax?.variant, "notion-markdown");
    assert.equal(branch.proposed.body, "Other branch");
    const resolved = await vault.resolveConflict(branch.id, {}, saved.revision);
    assert.equal(resolved.syntax?.variant, "notion-markdown");
    const legacy = await vault.update(
      page.id,
      { body: "Legacy", bodyFormat: "markdown", syntax: null },
      resolved.revision,
    );
    assert.equal(legacy.syntax, undefined);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
