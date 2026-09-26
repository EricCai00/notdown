import test from "node:test";
import assert from "node:assert/strict";
import { EditorState, TextSelection } from "prosemirror-state";
import { history, undo } from "prosemirror-history";
import { editorSchema as schema } from "../../src/document/editor-schema";
import { createEditorNode, editorKind } from "../../src/document/node-identity";
import { exampleReferenceChoices, exampleReferenceMatch, insertExampleReference } from "../../src/editor/example-reference-input";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec";
import { exampleLists } from "../../src/editor/example-lists";

const source = '(@alpha) Alpha case\n(@beta) 中文案例\n\nBetween\n\n(@alpha) Repeated\n(@) Anonymous';
const config = { version: 1 as const, variant: "notdown" as const, extensions: {} };
function stateFor(text: string, block = "paragraph", mark?: string) {
  const marks = mark ? [schema.marks[mark].create(mark === "link" ? { href: "https://example.com" } : null)] : undefined;
  const doc = parseNative(source, config);
  const paragraph = createEditorNode(schema, block, null, schema.text(text, marks));
  const next = doc.copy(doc.content.append(schema.nodes.doc.create(null, paragraph).content));
  return EditorState.create({ doc: next, selection: TextSelection.create(next, next.content.size - 1), plugins: [history(), exampleLists()] });
}
test("example queries allow inline, empty and text searches, excluding escapes, code, links and selections", () => {
  for (const text of ['(@', 'See(@alpha', 'See (@中文', 'See (@Alpha case', '`code` (@beta']) {
    const state = stateFor(text), match = exampleReferenceMatch(state);
    assert.ok(match, text);
    assert.equal(state.doc.textBetween(match.from, match.to), text.slice(text.lastIndexOf('(@')));
  }
  for (const text of ['@alpha', '\\(@alpha', '(@alpha)', '(@alpha\nnext', '`code (@alpha', 'See (\\@alpha'])
    assert.equal(exampleReferenceMatch(stateFor(text)), null, text);
  assert.equal(exampleReferenceMatch(stateFor('(@', 'code_block')), null);
  for (const mark of ['code', 'link']) assert.equal(exampleReferenceMatch(stateFor('(@alpha', 'paragraph', mark)), null);
  const state = stateFor('See (@alpha');
  assert.equal(exampleReferenceMatch(state.apply(state.tr.setSelection(TextSelection.create(state.doc, state.selection.from - 2, state.selection.from)))), null);
});
test("choices show each named example once and search labels, numbers and body", () => {
  const doc = parseNative(source, config);
  assert.deepEqual(exampleReferenceChoices(doc), [
    { label: 'alpha', number: 1, text: 'Alpha case' }, { label: 'beta', number: 2, text: '中文案例' },
  ]);
  for (const query of ['BETA', '2', '中文']) assert.equal(exampleReferenceChoices(doc, query)[0]?.label, 'beta');
  assert.equal(exampleReferenceChoices(doc, 'Repeated').length, 0);
  assert.equal(exampleReferenceChoices(doc, 'missing').length, 0);
});
test("completion inserts a formatted reference atom with one undo step and preserves an existing closing parenthesis", () => {
  let state = stateFor('See (@be)', 'paragraph', 'strong');
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, state.selection.from - 1)));
  const before = state.doc;
  state = state.apply(insertExampleReference(state, 'beta')!);
  assert.equal(state.doc.lastChild!.textContent, 'See ()');
  const atom = state.doc.lastChild!.child(1);
  assert.equal(atom.attrs.raw, '@beta');
  assert.equal(atom.attrs.label, '2');
  assert.equal(editorKind(atom.marks[0]), 'strong');
  assert.equal(state.selection.from, state.doc.content.size - 1);
  assert.ok(undo(state, tr => { state = state.apply(tr); }));
  assert.ok(state.doc.eq(before));
  assert.equal(insertExampleReference(state, 'missing'), null);
});
for (const variant of ['markdown', 'notdown'] as const) test(`${variant}: a reference at paragraph start stays inline after saving`, () => {
  let state = stateFor('(@be');
  state = state.apply(insertExampleReference(state, 'beta')!);
  state = state.apply(state.tr.insertText(' illustrates this case.'));
  const syntax = { ...config, variant }, saved = serializeNative(state.doc, syntax);
  const reopened = parseNative(saved, syntax);
  assert.equal(editorKind(reopened.lastChild!), 'paragraph', saved);
  assert.equal(reopened.lastChild!.child(1).attrs.raw, '@beta', saved);
  assert.equal(reopened.lastChild!.child(1).attrs.label, '2', saved);
  assert.equal(exampleReferenceChoices(reopened).length, 2);
});
