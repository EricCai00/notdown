import { editorKind } from "../../src/document/node-identity";
import test from "node:test";
import assert from "node:assert/strict";
import { EditorState, TextSelection } from "prosemirror-state";
import { history, undo } from "prosemirror-history";
import { editorSchema } from "../../src/document/editor-schema";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec";
import { editorFingerprint } from "../../src/document/editor-markdown";
import { renderNotionMarkdown } from "../../src/document/document-format";
import { isListItem } from "../../src/document/list-items";
import { convertListItem } from "../../src/editor/editor-convert";
import { indentEditorBlock, outdentEditorBlock } from "../../src/editor/editor-blocks";
import { childStructureCatalog } from "../../src/catalog/block-catalog-data";
import { contentObject } from "../../src/document/content-objects";
import type { SyntaxConfig } from "../../src/markdown-engine/config";
import { commandEnabled } from "../../src/markdown-engine/config";
import { moveTableCell, tableLineBreak } from "../../src/editor/editor-table";
const config: SyntaxConfig = { version: 1, variant: "markdown_mmd", extensions: {} };
const position = (state: EditorState, text: string) => {
  let found = -1;
  state.doc.descendants((node, pos) => { if (node.isText && node.text === text) found = pos; });
  assert(found >= 0, text);
  return found;
};

test("table extension gates follow the encoding and disabled/fenced source stays recoverable", () => {
  assert(commandEnabled({ ...config, extensions: { pipe_tables: false, notion_tables: false } }, 'table'));
  const samples: [SyntaxConfig, string, string][] = [
    [config, '| A | B |\n| --- | --- |\n| Joined ||\n[Caption]', 'mmd_tables'],
    [{ ...config, variant: 'gfm' }, '| A | B |\n| --- | --- |\n| One | Two |', 'pipe_tables'],
    [{ ...config, variant: 'notion-markdown' }, '<table custom="keep"><tr><td>Cell</td></tr></table>', 'notion_tables'],
  ];
  for (const [syntax, source, flag] of samples) {
    const disabled = { ...syntax, extensions: { [flag]: false } };
    const disabledDoc = parseNative(source, disabled);
    assert.equal(serializeNative(disabledDoc, disabled), source);
    assert.equal(editorKind(parseNative(serializeNative(disabledDoc, disabled), syntax).firstChild!), 'table');
    const fenced = '```md\n' + source + '\n```';
    assert.equal(editorKind(parseNative(fenced, syntax).firstChild!), 'code_block');
    assert.equal(serializeNative(parseNative(fenced, syntax), syntax), fenced);
  }
  const malformed = '<table custom="keep">\n<tr><td>Unclosed';
  const notion: SyntaxConfig = { ...config, variant: 'notion-markdown' };
  assert.equal(serializeNative(parseNative(malformed, notion), notion), malformed);
});

test("three list item node types retain identity through conversion, mixed nesting and undo", () => {
  assert.equal(editorSchema.nodes["list_item"], undefined);
  let state = EditorState.create({ doc: parseNative('- Bullet\n- [x] Task\n\n4. Number', { ...config, extensions: { task_lists: true } }), plugins: [history()] });
  const names: string[] = [];
  state.doc.descendants(n => { if (isListItem(n)) names.push(editorKind(n)); });
  assert.deepEqual(names, ["bullet_list_item", "task_list_item", "numbered_list_item"]);
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, position(state, "Task"))));
  assert(indentEditorBlock(state, tr => { state = state.apply(tr); }));
  assert.equal(editorKind(state.doc.firstChild!.firstChild!.lastChild!.firstChild!), "task_list_item");
  assert(outdentEditorBlock(state, tr => { state = state.apply(tr); }));
  assert.equal(editorKind(state.doc.firstChild!.child(1)), "task_list_item");
  const tr = convertListItem(state, "number");
  assert(tr);
  state = state.apply(tr);
  assert.equal(editorKind(state.doc.child(1).firstChild!), "numbered_list_item");
  state.doc.check();
  assert(undo(state, change => { state = state.apply(change); }));
  const written = serializeNative(state.doc, config);
  assert.equal(editorKind(parseNative(written, config).firstChild!.firstChild!), "bullet_list_item");
});

test("table navigation enters structured cells and code-cell Enter remains a text newline", () => {
  const source = '| A | B |\n| --- | --- |\n| - One | ```js | \\\n| - Two | let x = 1 | \\\n| | ``` |';
  let state = EditorState.create({ doc: parseNative(source, config) });
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, position(state, 'B'))));
  assert(moveTableCell(1)(state, tr => { state = state.apply(tr); }));
  assert.equal(state.selection.$from.parent.textContent, 'One');
  assert(moveTableCell(1)(state, tr => { state = state.apply(tr); }));
  assert.equal(editorKind(state.selection.$from.parent), 'code_block');
  assert(tableLineBreak(state, tr => { state = state.apply(tr); }));
  assert.equal(state.selection.$from.parent.textContent, '\nlet x = 1');
  state.doc.check();
  assert.equal(editorFingerprint(parseNative(serializeNative(state.doc, config), config).firstChild!), editorFingerprint(state.doc.firstChild!));
});

for (const source of [
  '| Group ||\n| A | B |\n| :--- | ---: |\n| **Joined** ||\n\n| next | last |\n[Caption][table-id]',
  '| A | B | C |\n| --- | --- | --- |\n| Wide || right |\n| ^^ || bottom |\n[Span caption]',
  '| A | B |\n| --- | --- |\n| pipe \\| value | last |',
  '| A | B |\n| --- | --- |\n| - One | ```js | \\\n| - Two | let x = 1 | \\\n| | ``` |\n[Code and list][Keep-Label]',
  '[Top caption][Top-Label]\n| A | B |\n| --- | --- |\n| One | Two |',
]) test("MMD table edits retain spans, headers, caption and section structure: " + source.split('\n')[0], () => {
  const doc = parseNative(source, config);
  assert.equal(editorKind(doc.firstChild!), "table");
  if (source.includes('let x')) {
    assert.equal(editorKind(doc.firstChild!.lastChild!.child(0).firstChild!), 'bullet_list');
    assert.equal(editorKind(doc.firstChild!.lastChild!.child(1).firstChild!), 'code_block');
    assert.match(doc.textContent, /let x = 1/);
  }
  assert.equal(serializeNative(doc, config), source);
  let state = EditorState.create({ doc, plugins: [history()] });
  let at = 0;
  doc.descendants((node, pos) => { if (node.isText && !at) at = pos; });
  state = state.apply(state.tr.insertText("Edited ", at));
  const written = serializeNative(state.doc, config);
  const reopened = parseNative(written, config);
  assert.equal(editorFingerprint(reopened.firstChild!), editorFingerprint(state.doc.firstChild!), written);
  const html = renderNotionMarkdown(written, [], { document: reopened });
  if (source.includes('||')) assert.match(html, /colspan="2"/);
  if (source.includes('^^')) assert.match(html, /rowspan="2"/);
  if (source.includes('[table-id]')) assert.match(html, /<caption id="tableid">/);
  assert(undo(state, change => { state = state.apply(change); }));
  assert.equal(serializeNative(state.doc, config), source);
});

test("all table encodings use one table node and untouched CRLF survives adjacent edits", () => {
  const source = '| A | B |\r\n| --- | --- |\r\n| One ||\r\n\r\nAfter';
  let state = EditorState.create({ doc: parseNative(source, config) });
  state = state.apply(state.tr.insertText('!', state.doc.content.size - 1));
  assert.equal(serializeNative(state.doc, config), source + '!');
  for (const [variant, source] of [
    ['gfm', '| A | B |\n| --- | --- |\n| One | Two |'],
    ['notion-markdown', '<table>\n<tr>\n<td>One</td>\n</tr>\n</table>'],
  ] as const) assert.equal(editorKind(parseNative(source, { version: 1, variant, extensions: {} }).firstChild!), 'table');
  for (const child of childStructureCatalog) {
    assert(child.parents?.length);
    for (const parent of child.parents!) assert(contentObject(parent), parent);
  }
  assert(!childStructureCatalog.some(e => ['doc', 'text', 'syntax_block', 'nested_block'].includes(e.id)));
});
