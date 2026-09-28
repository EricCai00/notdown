import { editorKind } from "../../src/document/node-identity";
import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "prosemirror-state";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec";
import { metadataValues } from "../../src/markdown-engine/products";
import { contentObject, resolveContentObject } from "../../src/document/content-objects";
import { editorSchema } from "../../src/document/editor-schema";
import type { SyntaxConfig } from "../../src/markdown-engine/config";

const mmd: SyntaxConfig = { version: 1, variant: "markdown_mmd", extensions: {} };
test("MMD metadata shares the front-matter object without acquiring YAML semantics", () => {
  for (const [before, after] of [['', ''], ['---\n', '\n---'], ['---\n', '\n...'], ['', '\n...']]) {
    const raw = before + 'Title: **Literal**\nCount: 001\nFlag: true\nList: [a, b]\nEmpty:\nBase Header Level: 2\n2nd-Key_Name: Keep' + after;
    const doc = parseNative(raw + '\n\nValue [%base headerlevel]', mmd);
    const node = doc.firstChild!;
    assert.equal(resolveContentObject(node)?.id, 'metadata.yaml_front_matter');
    assert.equal(node.attrs.metadataForm, 'mmd');
    assert.deepEqual({ ...metadataValues(node.attrs.raw, node.attrs.metadataForm) }, {
      title: '**Literal**', count: '001', flag: 'true', list: '[a, b]', empty: '', baseheaderlevel: '2', '2nd-key_name': 'Keep',
    });
    assert.equal(doc.lastChild!.lastChild!.attrs.label, '2');
    assert.equal(serializeNative(doc, mmd), raw + '\n\nValue [%base headerlevel]');
  }
  const yaml: SyntaxConfig = { ...mmd, variant: 'markdown', extensions: { yaml_metadata_block: true, metadata_values: true } };
  const node = parseNative('---\nCount: 1\nList: [a, b]\n---', yaml).firstChild!;
  assert.equal(node.attrs.metadataForm, 'yaml');
  assert.deepEqual(metadataValues(node.attrs.raw, 'yaml'), { Count: 1, List: ['a', 'b'] });
  assert.equal(contentObject('metadata.mmd_title_block'), undefined);
});

test("MMD enforces document position and ASCII keys, and treats continuations as one plain value", () => {
  const raw = 'Comment: First  \ncontinuation without colon  \n  URL: https://example.com  \nBase Header Level: 2\nbaseheaderlevel: 3';
  assert.deepEqual({ ...metadataValues(raw, 'mmd') }, { comment: 'First\ncontinuation without colon\nURL: https://example.com', baseheaderlevel: '3' });
  for (const source of ['\nTitle: Late', '  Title: Indented', '_Key: Invalid', '标题: Invalid', 'Key!: Invalid', '---\n_Key: Invalid\n---', '> Title: In quote', '```\nTitle: In code\n```']) {
    const doc = parseNative(source, mmd);
    assert.notEqual(doc.firstChild!.attrs.metadataForm, 'mmd', source);
    assert.equal(serializeNative(doc, mmd), source);
  }
});

test("MMD metadata preserves CRLF through adjacent edits, disabled switches and reopening", () => {
  const raw = '---\r\nTitle: Original\r\n  continuation: text\r\n...\r\n\r\nBody';
  let state = EditorState.create({ doc: parseNative(raw, mmd) });
  state = state.apply(state.tr.insertText('!', state.doc.content.size - 1));
  assert.equal(serializeNative(state.doc, mmd), raw + '!');
  for (const flag of ['metadata_values', 'mmd_title_block']) {
    const disabled = { ...mmd, extensions: { [flag]: false } };
    assert.equal(serializeNative(parseNative(raw, disabled), disabled), raw);
  }
  const preserved = parseNative(raw, { ...mmd, extensions: { metadata_values: false } }).firstChild!;
  assert.equal(editorKind(preserved), 'opaque_block');
  assert.equal(resolveContentObject(preserved)?.id, 'metadata.yaml_front_matter');
});

test("database references preserve official attributes without creating a local database engine", () => {
  assert.equal(editorSchema.nodes["database"], undefined);
  assert.equal(contentObject('block.database_reference'), undefined);
  const raw = '<database url="https://example.com/db" inline="true" custom="keep">Existing</database>\n\nTail';
  for (const variant of ['notion-markdown', 'commonmark'] as const) {
    const config: SyntaxConfig = { version: 1, variant, extensions: { notion_databases: true } };
    let state = EditorState.create({ doc: parseNative(raw, config) });
    assert.equal(resolveContentObject(state.doc.firstChild!)?.id, 'block.database');
    state = state.apply(state.tr.insertText('!', state.doc.content.size - 1));
    assert.equal(serializeNative(state.doc, config), raw + '!');
  }
});
