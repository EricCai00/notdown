import { editorKind } from "../../src/document/node-identity";
import test from "node:test";
import assert from "node:assert/strict";
import { EditorState, TextSelection } from "prosemirror-state";
import { history, undo } from "prosemirror-history";
import { buildInlineInsertion, insertInlineObject, inlineChoices } from "../../src/document/inline-objects";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec";
import { commandEnabled, enabled, supportsOption, type Dialect, type SyntaxConfig } from "../../src/markdown-engine/config";
import { mmdCitations, replaceMmdInlineBody } from "../../src/document/mmd-citations";
import { replaceImageCaption } from "../../src/document/image-caption";
const config = (variant: Dialect, extensions: Record<string, boolean> = {}): SyntaxConfig => ({ version: 1, variant, extensions });

test("Notdown URL citations coexist with explicitly defined footnotes and literal code", () => {
  const source = "[^https://example.com]";
  for (const footnotes of [true, false]) {
    const c = config("notdown", { footnotes });
    const doc = parseNative(source, c);
    assert.equal(editorKind(doc.firstChild!.firstChild!), "citation");
    assert.equal(serializeNative(doc, c), source);
  }
  const disabled = parseNative(source, config("notdown", { notion_mentions: false }));
  assert.equal(disabled.firstChild!.textContent, source);
  const c = config("notdown"), defined = source + "\n\n[^https://example.com]: Explicit existing note";
  const doc = parseNative(defined, c);
  assert.equal(editorKind(doc.firstChild!.firstChild!), "footnote_reference");
  assert.equal(serializeNative(doc, c), defined);
  const code = parseNative("`" + source + "`", c);
  assert.equal(editorKind(code.firstChild!.firstChild!), "text");
  assert.equal(code.firstChild!.textContent, source);
});

test("inline object extensions cannot leak into unrelated dialects even through explicit flags", () => {
  const names = ["mmd_citations", "mmd_abbreviations", "glossary", "metadata_variables", "critic_markup"];
  for (const variant of ["commonmark", "gfm", "commonmark_x", "typora", "obsidian", "markdown_strict", "markdown_phpextra", "markdown", "markdown_github", "notion-markdown"] as Dialect[]) {
    const c = config(variant, Object.fromEntries(names.map(n => [n, true])));
    for (const name of names) { assert.equal(enabled(c, name), false, `${variant}/${name}`); assert.equal(supportsOption(c, name), false); }
  }
  for (const variant of ["markdown_mmd", "notdown"] as Dialect[]) for (const name of names) assert(enabled(config(variant), name));
  assert(commandEnabled(config("notion-markdown"), "citation"));
  assert(!commandEnabled(config("notion-markdown", { notion_mentions: false }), "citation"));
  assert(!commandEnabled(config("gfm", { citations: true }), "citation"));
  assert(commandEnabled(config("markdown"), "citation"));
});

test("reference insertion is inline, appends one definition, preserves code and undoes both together", () => {
  for (const [variant, command, encoding] of [["markdown_mmd", "citation", "mmd"], ["notdown", "glossary", "mmd"], ["markdown_phpextra", "abbreviation", "php"]] as const) {
    const c = config(variant), source = "Before after\n\n```text\n[#keep]: not a definition\n```\n\nTail";
    const doc = parseNative(source, c); let state = EditorState.create({ doc, selection: TextSelection.create(doc, 8), plugins: [history()] });
    const input = buildInlineInsertion(command, encoding, { key: "ABC", body: "The definition" }, c, doc);
    state = state.apply(insertInlineObject(state, input, s => parseNative(s, c)));
    state.doc.check(); const output = serializeNative(state.doc, c);
    assert(output.includes("Before ")); assert(output.includes("after")); assert(output.includes("```text\n[#keep]: not a definition\n```"));
    const reopened = parseNative(output, c); assert.equal(inlineChoices(reopened, command, encoding).get("ABC"), "The definition", output);
    assert.equal(buildInlineInsertion(command, encoding, { key: "ABC" }, c, reopened).definition, undefined);
    assert(undo(state, tr => state = state.apply(tr))); assert.equal(serializeNative(state.doc, c), source);
  }
});

test("creation rejects incompatible syntax, delimiter injection and definition overwrites", () => {
  const c = config("markdown_mmd"), doc = parseNative("[#key]\n\n[#key]: Original", c);
  assert.throws(() => buildInlineInsertion("citation", "mmd", { key: "key", body: "Replacement" }, c, doc), /already/);
  assert.throws(() => buildInlineInsertion("citation", "mmd", { key: "bad]", body: "Text" }, c, doc), /brackets/);
  assert.throws(() => buildInlineInsertion("substitution", "critic", { old: "old", text: "bad~~}" }, c, doc), /delimiters/);
  assert.throws(() => buildInlineInsertion("citation", "mmd", { key: "key" }, config("gfm"), doc), /unavailable/);
  assert.throws(() => buildInlineInsertion("citation", "notion", { key: "javascript:alert(1)" }, config("notion-markdown"), doc), /URL/);
  assert.deepEqual(buildInlineInsertion("citation", "mmd", { key: "external" }, c, doc, { external: "Real bibliography entry" }), { inline: "[#external]" });
  assert.deepEqual(buildInlineInsertion("citation", "mmd", { inline: "true", body: "Jane Doe. A book." }, c, doc), { inline: "[#Jane Doe. A book.]" });
});

test("MMD bibliography numbering is independent of footnotes and preserves mismatched/unused definitions", () => {
  const c = config("markdown_mmd"), source = "Note [^a] [] [#Doe:2006] and [#John Doe. Title. Press, 2006.] [locator][#Doe:2006]. [#known] [p. 4][#known]\n\n[^a]: Footnote\n\n[#Doe2006]: Different key\n\n[#known]: Real source\n\n[Not cited][#hidden]\n\n[#hidden]: Hidden reference";
  const doc = parseNative(source, c), projection = mmdCitations(doc);
  assert.equal(projection.entries.length, 5);
  assert.deepEqual(projection.refs.map(r => r.number), [1, 2, 3, 4, 4, 5]);
  assert.equal(projection.refs[2].label, "(locator, 3)");
  assert(projection.refs.at(-1)!.suppressed); assert(projection.entries[0].missing);
  assert.deepEqual(projection.entries.at(-1)!.references, []);
  assert.equal(projection.unused[0].key, "Doe2006"); assert.equal(serializeNative(doc, c), source);
});

test("MMD hidden citations retain numbering but only visible occurrences have backlinks", () => {
  const c = config("markdown_mmd");
  const source = "[Not cited][#book] [#book] [not cited][#book] [p. 2][#book]\n\n[#book]: Book title";
  const projection = mmdCitations(parseNative(source, c));
  assert.equal(projection.entries.length, 1);
  assert.deepEqual(projection.entries[0].references, projection.refs.filter(ref => !ref.suppressed).map(ref => ref.pos));
  assert.equal(projection.entries[0].references.length, 2);
});

test("inline bibliography editing preserves locator, delimiter suffix, marks and surrounding source", () => {
  for (const variant of ["markdown_mmd", "notdown"] as const) {
    const c = config(variant), raw = "[p. 8][#Jane Doe. Original book.;][]";
    const source = `Before **${raw}** after\n\n\`[#Jane Doe. Original book.]\`\n\n[#unused]: Keep this`;
    const doc = parseNative(source, c), target = mmdCitations(doc).entries[0].inline!;
    const next = replaceMmdInlineBody(target.node.attrs.raw, "Alex Roe. *New book*. 2025.");
    assert.equal(next, "[p. 8][#Alex Roe. *New book*. 2025.;][]");
    let state = EditorState.create({ doc, plugins: [history()] });
    state = state.apply(state.tr.setNodeMarkup(target.pos, undefined, { ...target.node.attrs, raw: next }));
    assert.equal(serializeNative(state.doc, c), source.replace(raw, next));
    assert(undo(state, tr => state = state.apply(tr)));
    assert.equal(serializeNative(state.doc, c), source);
    for (const invalid of ["", "key", "Bad ] text", "Bad \\ text", "Two\nlines", "Trailing semicolon;"])
      assert.throws(() => replaceMmdInlineBody(raw, invalid));
  }
});

test("caption updates touch only the image label, preserving URL/title/unknown attributes", () => {
  const source = '![Old [caption]](image.png "Title"){alt="Alternative" custom="keep"}';
  const output = replaceImageCaption(source, "New [caption]");
  assert.equal(output, '![New \\[caption\\]](image.png "Title"){alt="Alternative" custom="keep"}');
  const c = config("markdown"); assert.equal(parseNative(output, c).firstChild!.attrs.kind, "figure");
  assert.throws(() => replaceImageCaption(source, "line\nbreak"));
});
