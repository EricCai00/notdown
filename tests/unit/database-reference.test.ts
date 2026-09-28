import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "prosemirror-state";
import { databaseReference, databaseHostId } from "../../src/features/databases/database-reference";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec";
import { commandEnabled, type SyntaxConfig } from "../../src/markdown-engine/config";
import { insertMenuItems } from "../../src/editor/insert-menu";

const host = "11111111-1111-4111-8111-111111111111";
test("database references use the official tag and only a safe local host identity", () => {
  assert.equal(databaseHostId(`#page/${host}`), host);
  for (const value of ["https://notion.so/abc", "#page/../secret", "#page/a#block=b", "#page/%E0%A4", "#database/abc", null]) assert.equal(databaseHostId(value), undefined);
  assert.throws(() => databaseReference("../x", "title"));
  assert.equal(databaseReference(host, '<Projects> & "Tasks"\n2026'), `<database url="#page/${host}" inline="true">&lt;Projects&gt; &amp; &quot;Tasks&quot; 2026</database>`);
});
for (const variant of ["notdown", "notion-markdown"] as const) {
  const config: SyntaxConfig = { version: 1, variant, extensions: {} };
  test(`${variant} local inline database source preserves attributes, surrounding prose and code fences`, () => {
    const raw = `<database future='keep' url="#page/${host}" inline="true" wiki="false">Projects</database>`;
    const source = `Before\r\n\r\n${raw}\r\n\r\n\`\`\`xml\r\n${raw}\r\n\`\`\`\r\n\r\nAfter\r\n`;
    const doc = parseNative(source, config); doc.check();
    assert.equal(doc.child(1).type.name, "block.database");
    assert.equal(doc.child(1).attrs.inline, true);
    assert.equal(doc.child(1).attrs.nfmAttrs.future, "keep");
    assert.equal(doc.child(2).type.name, "block.code_block");
    assert.equal(serializeNative(doc, config), source);
    const edited = EditorState.create({ doc }).tr.insertText("!", 1).doc;
    assert.equal(serializeNative(edited, config), source.replace("Before", "!Before"));
    const disabled = { ...config, extensions: { notion_databases: false } };
    const opaque = parseNative(raw, disabled);
    assert.equal(opaque.firstChild!.type.name, "block.unsupported");
    assert.equal(serializeNative(opaque, disabled), raw);
  });
  test(`${variant} editing database label preserves unknown future values`, () => {
    const source = `<database url="#page/${host}" inline="future-mode" wiki="future-wiki" future="unchanged">Old</database>`;
    const doc = parseNative(source, config), node = doc.firstChild!;
    const edited = EditorState.create({ doc }).tr.setNodeMarkup(0, undefined, { ...node.attrs, label: "New" }).doc;
    const saved = serializeNative(edited, config);
    assert.ok(saved.includes('inline="future-mode"'));
    assert.ok(saved.includes('wiki="future-wiki"'));
    assert.ok(saved.includes('future="unchanged"'));
    assert.equal(parseNative(saved, config).firstChild!.attrs.label, "New");
  });
}
test("database insertion has two explicit commands and inline respects dialect boundaries", () => {
  for (const variant of ["notdown", "notion-markdown", "commonmark", "gfm"] as const) {
    const config: SyntaxConfig = { version: 1, variant, extensions: { notion_databases: true } };
    const available = variant === "notdown" || variant === "notion-markdown";
    assert.equal(commandEnabled(config, "database_full_page"), true);
    assert.equal(commandEnabled(config, "database_inline"), available);
    const menu = insertMenuItems(config);
    assert.deepEqual(menu.find(item => item[0] === "database_full_page")?.slice(2, 3), ["Database - Full page"]);
    assert.equal(menu.find(item => item[0] === "database_full_page")?.[5], "Databases");
    assert.equal(menu.some(item => item[0] === "database_inline"), available);
  }
});
