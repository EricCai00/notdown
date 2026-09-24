import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "prosemirror-state";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec";
import { projectFootnotes, restoreFootnotes, footnotePresentation } from "../../src/editor/footnotes";
import { blockAtPos } from "../../src/editor/editor-blocks";
import type { SyntaxConfig } from "../../src/markdown-engine/config";
import { history, undo, redo } from "prosemirror-history";
import { footnoteChoices, newFootnote } from "../../src/editor/footnotes";
import { insertMenuItems } from "../../src/editor/insert-menu";

const config: SyntaxConfig = { version: 1, variant: "notdown", extensions: {} };
const source = '[^a]: First definition.\r\n\r\nBody [^b] then [^a] and [^b].\r\n\r\n<callout future="keep">\r\n\t[^b]: Nested definition.\r\n\r\n\tKeep body.\r\n</callout>\r\n\r\n[^orphan]: Keep unreferenced.';
test("footnotes project to one ordered footer and restore exact source including nested definitions", () => {
  const original = parseNative(source, config), projected = projectFootnotes(original);
  projected.check();
  const footer = projected.lastChild!;
  assert.equal(footer.type.name, "footnote_section");
  assert.deepEqual(Array.from({ length: footer.childCount }, (_, i) => footer.child(i).attrs.label), ["b", "a", "orphan"]);
  assert(projectFootnotes(projected).eq(projected));
  assert(restoreFootnotes(projected).eq(original));
  assert.equal(serializeNative(restoreFootnotes(projected), config), source);
  projected.descendants((node, pos) => {
    if (node.type.name.startsWith("footnote") && node.isBlock) {
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
  assert.equal(next.selection.$from.parent.type.name, "paragraph");
});
test("changing first reference reorders definitions without changing Markdown identifiers", () => {
  const state = EditorState.create({ doc: projectFootnotes(parseNative('Body [^b] then [^a].\n\n[^a]: A\n\n[^b]: B', config)), plugins: [footnotePresentation()] });
  let first = 0;
  state.doc.descendants((node, pos) => { if (node.type.name === "footnote_reference" && node.attrs.label === "b") first = pos; });
  const next = state.applyTransaction(state.tr.delete(first, first + 1)).state;
  assert.equal(next.doc.lastChild!.firstChild!.attrs.label, "a");
  assert.doesNotMatch(serializeNative(restoreFootnotes(next.doc), config), /\[\^b\]: B/);
  let remaining = 0;
  next.doc.descendants((node, pos) => { if (node.type.name === "footnote_reference") remaining = pos; });
  const withoutReferences = next.applyTransaction(next.tr.delete(remaining, remaining + 1)).state;
  assert.equal(withoutReferences.doc.lastChild!.type.name, "paragraph");
  assert.deepEqual(footnoteChoices(withoutReferences.doc), []);
});

test("last-reference cleanup preserves imported orphans and is undone with the deletion", () => {
  const input = "Body [^a] and [^a].\n\n[^a]: Keep **formatting**.\n\n[^orphan]: Legacy content.";
  let state = EditorState.create({ doc: projectFootnotes(parseNative(input, config)), plugins: [footnotePresentation(), history()] });
  const removeFirst = () => {
    let position: number | undefined;
    state.doc.descendants((node, pos) => { if (position === undefined && node.type.name === "footnote_reference") position = pos; });
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
  note.forEach(child => types.push(child.type.name));
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
