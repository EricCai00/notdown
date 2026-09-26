import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "prosemirror-state";
import { history, undo } from "prosemirror-history";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec";
import { editorKind } from "../../src/document/node-identity";
import { renderNotionMarkdown } from "../../src/document/document-format";
import { exampleLists } from "../../src/editor/example-lists";
import { nextExampleLabel, normalizeExampleNumbering } from "../../src/document/example-numbering";
import { findReferenceLocation, referenceLocations } from "../../src/document/reference-locations";
import { internalReference } from "../../src/document/internal-reference";
import { blockAtPos, deleteEditorBlocks, moveEditorBlock } from "../../src/editor/editor-blocks";
import type { Node as PMNode } from "prosemirror-model";
import type { SyntaxConfig } from "../../src/markdown-engine/config";

const source = '(@fooa) First\n(@foo) Sample\n\nIntervening text\n\n(@food) Third\n(@foo) Repeated\n(@good) Good\n\nSee @foo and @good.\n\n(@) Anonymous';
function items(doc: PMNode) {
  const found: { pos: number; node: PMNode }[] = [];
  doc.descendants((node, pos) => { if (editorKind(node) === "example_list_item") found.push({ node, pos }); });
  return found;
}
function references(doc: PMNode) {
  const found: string[] = [];
  doc.descendants(node => { if (node.attrs.kind === "example-reference") found.push(node.attrs.label); });
  return found;
}
test("shared immutable anonymous rows still get a separate position-based list start", () => {
  const doc = parseNative('(@) Anonymous', { version: 1, variant: "markdown", extensions: {} });
  const repeated = normalizeExampleNumbering(doc.copy(doc.content.append(doc.content)));
  assert.deepEqual(items(repeated).map(({ node }) => node.attrs.number), [1, 2]);
  assert.equal(repeated.child(0).attrs.start, 1);
  assert.equal(repeated.child(1).attrs.start, 2);
});
for (const variant of ["markdown", "notdown"] as const) {
  const config: SyntaxConfig = { version: 1, variant, extensions: { example_lists: true } };
  test(`${variant}: new example labels avoid existing labels but ignore literal code`, () => {
    const doc = parseNative('(@example) First\n(@example-2) Second\n(@example-4) Fourth\n\n```md\n(@example-3) Code\n```', config);
    assert.equal(nextExampleLabel(doc), 'example-3');
    assert.equal(nextExampleLabel(parseNative('(@) Anonymous', config)), 'example');
  });
  test(`${variant}: repeated examples share numbering, unique anchors and unchanged source`, () => {
    const input = source.replaceAll('\n', '\r\n');
    const doc = parseNative(input, config);
    assert.deepEqual(items(doc).map(({ node }) => node.attrs.number), [1, 2, 3, 2, 4, 5]);
    assert.deepEqual(references(doc), ["2", "4"]);
    assert.equal(items(doc)[3].node.attrs.referenceId, null);
    const reference = internalReference("#md-example-foo")!;
    assert.equal(findReferenceLocation(doc, reference)?.pos, items(doc)[1].pos);
    assert.equal(referenceLocations(doc).filter(location => location.fragment === reference.fragment).length, 1);
    assert.equal(serializeNative(doc, config), input);
    const html = renderNotionMarkdown(input, [], { document: doc });
    assert.equal((html.match(/id="md-example-foo"/g) || []).length, 1);
    assert.match(html, /value="2"[^>]*>.*?Repeated/s);
    const state = EditorState.create({ doc, plugins: [exampleLists()] });
    const last = items(doc).at(-1)!;
    const edited = state.apply(state.tr.insertText("!", last.pos + 2));
    assert.deepEqual(items(edited.doc).map(({ node }) => node.attrs.number), [1, 2, 3, 2, 4, 5]);
    const saved = serializeNative(edited.doc, config);
    assert.deepEqual(items(parseNative(saved, config)).map(({ node }) => node.attrs.number), [1, 2, 3, 2, 4, 5]);
    assert.match(saved, /\(@foo\) Repeated/);
  });
  test(`${variant}: individual example selection, deletion, movement and undo keep references in sync`, () => {
    let state = EditorState.create({ doc: parseNative(source, config), plugins: [history(), exampleLists()] });
    const before = state.doc, rows = items(before);
    for (const row of rows) {
      assert.equal(blockAtPos(before, row.pos + 3)?.pos, row.pos);
      assert.equal(editorKind(blockAtPos(before, row.pos)!.listNode!), "example_list");
    }
    state = state.apply(deleteEditorBlocks(state, [rows[1].pos])!);
    assert.deepEqual(items(state.doc).map(({ node }) => node.attrs.number), [1, 2, 3, 4, 5]);
    assert.deepEqual(references(state.doc), ["3", "4"]);
    assert.equal(items(state.doc)[2].node.attrs.referenceId, "md-example-foo");
    const reference = internalReference("#md-example-foo")!;
    assert.equal(findReferenceLocation(state.doc, reference)?.pos, items(state.doc)[2].pos);
    assert.ok(undo(state, tr => { state = state.apply(tr); }));
    assert.ok(state.doc.eq(before));
    assert.equal(findReferenceLocation(state.doc, reference)?.pos, rows[1].pos);
    state = state.apply(moveEditorBlock(state, rows[3].pos, rows[0].pos, "before")!);
    state.doc.check();
    assert.deepEqual(items(state.doc).map(({ node }) => node.attrs.number), [1, 2, 1, 3, 4, 5]);
    assert.deepEqual(references(state.doc), ["1", "4"]);
    assert.equal(findReferenceLocation(state.doc, reference)?.pos, items(state.doc)[0].pos);
    state = state.apply(deleteEditorBlocks(state, items(state.doc).map(row => row.pos))!);
    state.doc.check();
    assert.equal(items(state.doc).length, 0);
    assert.deepEqual(references(state.doc), ["@foo", "@good"]);
    assert.equal(findReferenceLocation(state.doc, reference), undefined);
  });
  test(`${variant}: anonymous and prototype-like labels are safe; fences and disabled syntax stay literal`, () => {
    const input = '(@__proto__) First\n(@constructor) Second\n(@__proto__) Again\n(@) Anonymous\n\nSee @__proto__ and @constructor.\n\n```md\n(@constructor) Code\n```';
    const doc = parseNative(input, config);
    assert.deepEqual(items(doc).map(({ node }) => node.attrs.number), [1, 2, 1, 3]);
    assert.deepEqual(references(doc), ["1", "2"]);
    assert.equal(serializeNative(doc, config), input);
    assert.equal(items(parseNative(input, { ...config, extensions: { example_lists: false } })).length, 0);
  });
}
