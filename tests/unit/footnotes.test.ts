import { editorKind } from "../../src/document/node-identity";
import test from "node:test";
import assert from "node:assert/strict";
import { EditorState, TextSelection } from "prosemirror-state";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec";
import { projectFootnotes, restoreFootnotes, footnotePresentation } from "../../src/editor/footnotes";
import { blockAtPos } from "../../src/editor/editor-blocks";
import type { SyntaxConfig } from "../../src/markdown-engine/config";
import { history, undo, redo } from "prosemirror-history";
import { footnoteChoices, newFootnote } from "../../src/editor/footnotes";
import { insertMenuItems } from "../../src/editor/insert-menu";
import { contentObjects, getContentCapabilities, resolveContentObject } from "../../src/document/content-objects";

const config: SyntaxConfig = { version: 1, variant: "notdown", extensions: {} };
test("projecting newly inserted inline notes keeps the caret after the reference in prose", () => {
  for (const source of ["Body", "Parent\n\tBody\n\nOther[^a]\n\n[^a]: Existing note"]) {
    const doc = projectFootnotes(parseNative(source, config));
    let position = 0;
    doc.descendants((node, pos) => { if (node.isTextblock && node.textContent === "Body") position = pos + 1 + node.content.size; });
    let state = EditorState.create({ doc, selection: TextSelection.create(doc, position), plugins: [footnotePresentation()] });
    const note = parseNative("^[Long **formatted** note]", config).firstChild!.firstChild!;
    const tr = state.tr.replaceSelectionWith(note);
    tr.setSelection(TextSelection.create(tr.doc, position + note.nodeSize));
    state = state.applyTransaction(tr).state;
    assert.equal(state.selection.$from.parent.textContent, "Body");
    assert.equal(editorKind(state.selection.$from.nodeBefore!), "footnote_reference");
    state = state.applyTransaction(state.tr.insertText(" after")).state;
    assert.match(serializeNative(restoreFootnotes(state.doc), config), /Body\^\[Long \*\*formatted\*\* note\] after/);
  }
});
test("inline-note syntax belongs to Footnote without a separate insertion or object", () => {
  assert(!contentObjects.some(object => /inline[_. ]note/i.test(object.id + " " + object.name)));
  for (const variant of ["markdown", "notdown"] as const) {
    const syntax: SyntaxConfig = { version: 1, variant, extensions: { inline_notes: true } };
    const input = "Text^[A **formatted** note].\r\n\r\nTail\r\n";
    const doc = parseNative(input, syntax);
    let notes = 0;
    doc.descendants(node => {
      if (editorKind(node) !== "inline_note") return;
      notes++;
      assert.equal(resolveContentObject(node)?.id, "inline.footnote");
    });
    assert.equal(notes, 1);
    assert(getContentCapabilities("inline.footnote", syntax).adapters.some(adapter => adapter.extensions.includes("inline_notes")));
    assert.equal(serializeNative(doc, syntax), input);
    const changed = EditorState.create({ doc }).tr.insertText("!", doc.content.size - 1).doc;
    const output = serializeNative(changed, syntax);
    assert.match(output, /Text\^\[A \*\*formatted\*\* note\]\./);
    assert.equal(parseNative(output, syntax).textContent, changed.textContent);
    const items = insertMenuItems(syntax);
    assert.equal(items.filter(item => item[0] === "footnote").length, 1);
    assert(!items.some(item => item[0] === "inline_note"));
    const disabled = { ...syntax, extensions: { inline_notes: false } };
    assert.equal(serializeNative(parseNative(input, disabled), disabled), input);
  }
});
const source = '[^a]: First definition.\r\n\r\nBody [^b] then [^a] and [^b].\r\n\r\n<callout future="keep">\r\n\t[^b]: Nested definition.\r\n\r\n\tKeep body.\r\n</callout>\r\n\r\n[^orphan]: Keep unreferenced.';

for (const variant of ["markdown", "notdown"] as const) test(`${variant}: inline notes share the footer and numbering while retaining their source syntax`, () => {
  const syntax = { ...config, variant };
  const input = "Body^[A **formatted** note\r\nwith a [link](https://example.com)]. [^inline-note] then^[Second] and [^inline-note].\r\n\r\n[^inline-note]: Regular note.\r\n\r\n`^[literal]`\r\n";
  const original = parseNative(input, syntax), doc = projectFootnotes(original);
  doc.check();
  assert.equal(doc.firstChild!.textContent.includes("formatted"), false);
  const footer = doc.lastChild!;
  assert.equal(footer.childCount, 3);
  assert.deepEqual(Array.from({ length: footer.childCount }, (_, i) => footer.child(i).attrs.inlineNote), [true, false, true]);
  assert.equal(new Set(Array.from({ length: footer.childCount }, (_, i) => footer.child(i).attrs.label)).size, 3);
  assert.equal(footnoteChoices(doc).length, 1, "anonymous notes are not reusable named definitions");
  assert(projectFootnotes(doc).eq(doc));
  assert(restoreFootnotes(doc).eq(original));
  assert.equal(serializeNative(restoreFootnotes(doc), syntax), input);

  let state = EditorState.create({ doc, plugins: [footnotePresentation(), history()] });
  let textEnd = 0;
  doc.descendants((node, pos) => { if (node.isText && node.text === "Second") textEnd = pos + node.nodeSize; });
  state = state.applyTransaction(state.tr.setSelection(TextSelection.create(state.doc, textEnd)).insertText(" edited")).state;
  const saved = serializeNative(restoreFootnotes(state.doc), syntax);
  assert.match(saved, /then\^\[Second edited\]/);
  assert.doesNotMatch(saved, /\[\^inline-note-\d+\]/);
  assert.equal(editorKind(state.selection.$from.parent), "paragraph");
  assert.equal(state.selection.$from.parent.textContent, "Second edited");
  const fragment = state.doc.copy(state.doc.content.cut(0, state.doc.firstChild!.nodeSize));
  assert.match(serializeNative(restoreFootnotes(fragment), syntax), /then\^\[Second edited\]/, "fragment restoration uses current content");

  let marker = 0;
  state.doc.descendants((node, pos) => { if (editorKind(node) === "footnote_reference" && node.attrs.inlineNote) marker = pos; });
  state = state.applyTransaction(state.tr.delete(marker, marker + 1)).state;
  assert.equal(state.doc.lastChild!.childCount, 2);
  assert.doesNotMatch(serializeNative(restoreFootnotes(state.doc), syntax), /Second/);
  undo(state, tr => { state = state.applyTransaction(tr).state; });
  assert.equal(serializeNative(restoreFootnotes(state.doc), syntax), saved);
});

test("inline-note footer rejects a second paragraph instead of losing it during serialization", () => {
  const doc = projectFootnotes(parseNative("Text^[Single paragraph]", config));
  const state = EditorState.create({ doc, plugins: [footnotePresentation()] });
  let split = 0;
  doc.descendants((node, pos) => { if (node.isText && node.text === "Single paragraph") split = pos + 6; });
  const result = state.applyTransaction(state.tr.split(split));
  assert.equal(result.transactions.length, 0);
  assert.equal(serializeNative(restoreFootnotes(result.state.doc), config), "Text^[Single paragraph]");
});

test("multiline inline notes preserve Notdown line boundaries and literal or disabled syntax", () => {
  const source = "Separate line\nBody^[First\nsecond] after\nAnother line\n\n`^[code]` \\^[escaped]\n\n```md\n^[fenced]\n```\n\nUnclosed^[note\n\nStill separate]";
  const doc = parseNative(source, config), projected = projectFootnotes(doc);
  assert.equal(doc.child(0).textContent, "Separate line");
  assert.equal(doc.child(2).textContent, "Another line");
  assert.equal(projected.lastChild!.childCount, 1);
  assert.equal(serializeNative(restoreFootnotes(projected), config), source);
  const disabledSyntaxCases: SyntaxConfig[] = [
    { ...config, extensions: { inline_notes: false } },
    { ...config, variant: "notion-markdown" as const, extensions: { inline_notes: true, footnotes: true } },
  ];
  for (const syntax of disabledSyntaxCases) {
    const plain = projectFootnotes(parseNative("Body^[note]", syntax));
    assert.equal(plain.textContent, "Body^[note]");
    assert.notEqual(editorKind(plain.lastChild), "footnote_section");
  }
});

test("footnotes project to one ordered footer and restore exact source including nested definitions", () => {
  const original = parseNative(source, config), projected = projectFootnotes(original);
  projected.check();
  const footer = projected.lastChild!;
  assert.equal(editorKind(footer), "footnote_section");
  assert.deepEqual(Array.from({ length: footer.childCount }, (_, i) => footer.child(i).attrs.label), ["b", "a", "orphan"]);
  assert(projectFootnotes(projected).eq(projected));
  assert(restoreFootnotes(projected).eq(original));
  assert.equal(serializeNative(restoreFootnotes(projected), config), source);
  projected.descendants((node, pos) => {
    if (editorKind(node).startsWith("footnote") && node.isBlock) {
      assert.equal(blockAtPos(projected, pos), null);
      if (node.childCount) assert.equal(blockAtPos(projected, pos + 1), null);
    }
  });
});
test("editing a projected definition updates its original source location and retains other content", () => {
  const state = EditorState.create({ doc: projectFootnotes(parseNative(source, config)), plugins: [footnotePresentation()] });
  let end = 0;
  state.doc.descendants((node, pos) => { if (node.isText && node.text === "Nested definition.") end = pos + node.nodeSize; });
  const next = state.applyTransaction(state.tr.insertText(" Edited", end)).state;
  const baseline = EditorState.create({ doc: parseNative(source, config) });
  let originalEnd = 0;
  baseline.doc.descendants((node, pos) => { if (node.isText && node.text === "Nested definition.") originalEnd = pos + node.nodeSize; });
  assert.equal(serializeNative(restoreFootnotes(next.doc), config), serializeNative(baseline.tr.insertText(" Edited", originalEnd).doc, config));
  assert.equal(editorKind(next.selection.$from.parent), "paragraph");
});
test("changing first reference reorders definitions without changing Markdown identifiers", () => {
  const state = EditorState.create({ doc: projectFootnotes(parseNative('Body [^b] then [^a].\n\n[^a]: A\n\n[^b]: B', config)), plugins: [footnotePresentation()] });
  let first = 0;
  state.doc.descendants((node, pos) => { if (editorKind(node) === "footnote_reference" && node.attrs.label === "b") first = pos; });
  const next = state.applyTransaction(state.tr.delete(first, first + 1)).state;
  assert.equal(next.doc.lastChild!.firstChild!.attrs.label, "a");
  assert.doesNotMatch(serializeNative(restoreFootnotes(next.doc), config), /\[\^b\]: B/);
  let remaining = 0;
  next.doc.descendants((node, pos) => { if (editorKind(node) === "footnote_reference") remaining = pos; });
  const withoutReferences = next.applyTransaction(next.tr.delete(remaining, remaining + 1)).state;
  assert.equal(editorKind(withoutReferences.doc.lastChild!), "paragraph");
  assert.deepEqual(footnoteChoices(withoutReferences.doc), []);
});

test("last-reference cleanup preserves imported orphans and is undone with the deletion", () => {
  const input = "Body [^a] and [^a].\n\n[^a]: Keep **formatting**.\n\n[^orphan]: Legacy content.";
  let state = EditorState.create({ doc: projectFootnotes(parseNative(input, config)), plugins: [footnotePresentation(), history()] });
  const removeFirst = () => {
    let position: number | undefined;
    state.doc.descendants((node, pos) => { if (position === undefined && editorKind(node) === "footnote_reference") position = pos; });
    state = state.applyTransaction(state.tr.delete(position!, position! + 1)).state;
    state.doc.check();
  };
  removeFirst();
  assert.equal(footnoteChoices(state.doc).length, 2);
  const beforeLastDeletion = serializeNative(restoreFootnotes(state.doc), config);
  removeFirst();
  assert.deepEqual(footnoteChoices(state.doc).map(note => note.label), ["orphan"]);
  assert.doesNotMatch(serializeNative(restoreFootnotes(state.doc), config), /Keep/);
  undo(state, tr => { state = state.applyTransaction(tr).state; });
  assert.equal(serializeNative(restoreFootnotes(state.doc), config), beforeLastDeletion);
  redo(state, tr => { state = state.applyTransaction(tr).state; });
  assert.deepEqual(footnoteChoices(state.doc).map(note => note.label), ["orphan"]);
});

test("new notes allocate distinct identifiers and preserve literal user text", () => {
  const doc = parseNative("Body [^note] [^note2].\n\n[^old]: old", config);
  const note = newFootnote(doc, "<script>hello</script>\n[^escape]: literal");
  assert.equal(note.attrs.label, "note3");
  const container = doc.type.create(null, note);
  const roundtrip = parseNative(serializeNative(container, config), config);
  assert.equal(roundtrip.firstChild?.textContent, note.textContent);
  assert.equal(roundtrip.firstChild?.childCount, 2);
});

test("footnote blocks survive edits and Markdown roundtrips", () => {
  const blocks = "Paragraph\n\n## Heading\n\n- Item\n\n1. Ordered\n\n> Quote\n\n```js\nconst x = 1;\n```\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n---\n\nTerm\n: Definition\n\n$$\nx^2\n$$";
  const markdown = "Body [^a].\n\n[^a]: " + blocks.replace(/\n/g, "\n    ");
  const doc = projectFootnotes(parseNative(markdown, config));
  const note = doc.lastChild!.firstChild!;
  const types: string[] = [];
  note.forEach(child => types.push(editorKind(child)));
  for (const name of ["paragraph", "heading", "bullet_list", "ordered_list", "blockquote", "code_block", "table", "horizontal_rule", "definition_list", "equation"]) assert(types.includes(name), name);
  const state = EditorState.create({ doc, plugins: [footnotePresentation()] });
  let pos = 0;
  doc.descendants((node, at) => { if (node.isText && node.text === "Paragraph") pos = at; });
  const updated = state.applyTransaction(state.tr.insertText("Edited ", pos)).state;
  const reparsed = parseNative(serializeNative(restoreFootnotes(updated.doc), config), config);
  assert.deepEqual(footnoteChoices(reparsed), footnoteChoices(updated.doc));
  reparsed.check();
});

test("footer menu offers active Markdown content, excluding page containers and nested notes", () => {
  const items = new Set(insertMenuItems(config, true).map(item => item[0]));
  for (const id of ["text", "heading1", "list", "quote", "code", "table", "equation"]) assert(items.has(id), id);
  for (const id of ["child", "columns", "tabs", "button", "footnote", "inline_note"]) assert(!items.has(id), id);
});
