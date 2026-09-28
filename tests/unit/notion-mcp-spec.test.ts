import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "prosemirror-state";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec";
import { type SyntaxConfig } from "../../src/markdown-engine/config";
import { editorKind } from "../../src/document/node-identity";
import { safeReference } from "../../src/document/notion-syntax";
import { DocumentSession } from "../../src/markdown-engine/session";
import { editorFingerprint } from "../../src/document/editor-markdown";

const tabs = '<tabs future="keep">\n\t<tab icon="icons/document_gray">\n\t\tFirst\n\t\tTab content\n\t</tab>\n\t<tab>\n\t\tSecond\n\t\t```xml\n\t\t</tabs>\n\t\t```\n\t</tab>\n</tabs>';
const meeting = '<meeting-notes>\n\tWeekly meeting\n\t<summary>\n\t\tSummary\n\t</summary>\n\t<notes future="keep">\n\t\tUser notes\n\t</notes>\n\t<transcript>\n\t\tTranscript\n\t</transcript>\n</meeting-notes>';
for (const variant of ["notdown", "notion-markdown"] as const) {
  const config: SyntaxConfig = { version: 1, variant, extensions: {} };
  test(`${variant}: MCP blocks are native, preserve original source and survive an independent edit`, () => {
    const cases = [
      [tabs, "block.tabs"], [meeting, "block.meeting_notes"],
      [meeting.replace('Weekly meeting', '<span color="blue">Rich title</span>'), "block.meeting_notes"],
      ['<folder url="{{1}}">Folder</folder>', "block.folder"],
      ['<database data-source-url="collection://abc" inline="true" wiki="true" icon="📘" future="keep">Wiki</database>', "block.database"],
      ['<embed src="file-upload://abc" color="blue">HTML caption</embed>', "block.web_embed"],
      ['<table>\n<colgroup>\n<col width="120" color="blue"><col width="">\n</colgroup>\n<tr><td>A</td><td>B</td></tr>\n</table>', "block.table"],
      ['<synced_block>\n\tOriginal\n</synced_block>', "block.synced_block"],
      ['<synced_block_reference url="{{2}}" notice="No permission">\n\tContent\n</synced_block_reference>', "block.synced_block"],
    ];
    for (const [body, type] of cases) {
      const source = body.replace(/\n/g, "\r\n") + '\r\n\r\nTail\r\n';
      const doc = parseNative(source, config); doc.check();
      assert.equal(doc.firstChild!.type.name, type, body);
      assert.equal(serializeNative(doc, config), source);
      const changed = EditorState.create({ doc }).tr.insertText("!", doc.content.size - 1).doc;
      assert.equal(serializeNative(changed, config), source.replace("Tail", "Tail!"));
    }
  });
  test(`${variant}: edits to tabs and meeting notes use the official carrier, keep sections and undo`, () => {
    const source = tabs + '\n\n' + meeting;
    const session = new DocumentSession(source, config), doc = session.snapshot.doc;
    const first = doc.firstChild!.firstChild!;
    session.documentChanged(EditorState.create({ doc }).tr.setNodeMarkup(1, undefined, { ...first.attrs, title: "Renamed" }).doc);
    assert.ok(session.snapshot.source.includes('\t\tRenamed\n'));
    assert.ok(!session.snapshot.source.includes('active="'));
    assert.ok(!session.snapshot.source.includes('title="Renamed"'));
    assert.ok(session.snapshot.source.includes('icon="icons/document_gray"'));
    const reopened = parseNative(session.snapshot.source, config);
    assert.equal(reopened.firstChild!.firstChild!.attrs.title, "Renamed");
    assert.equal(reopened.child(1).child(2).attrs.section, "transcript");
    session.undo(); assert.equal(session.snapshot.source, source);
    const notes = doc.child(1), pos = doc.firstChild!.nodeSize;
    const edited = EditorState.create({ doc }).tr.setNodeMarkup(pos, undefined, { ...notes.attrs, title: "New title" }).doc;
    const saved = serializeNative(edited, config);
    assert.ok(saved.includes('\tNew title\n'));
    assert.ok(saved.includes('<transcript>\n\t\tTranscript\n\t</transcript>'));
    assert.equal(parseNative(saved, config).child(1).attrs.title, "New title");
  });
  test(`${variant}: MCP math and multiline code coexist with REST math and URL citations`, () => {
    const source = 'MCP $`x^2`$ REST $y+1$ `first<br>second` [^example.com] [^{{1}}] [^https://example.com]\n\n<mention-date start="2026-09-27" startTime="09:00" end="2026-09-28" endTime="10:00" timeZone="Asia/Shanghai"/> <mention-agent url="agent://x">Helper</mention-agent>\n\nTail';
    const doc = parseNative(source, config), math: any[] = [], cites: string[] = [];
    doc.descendants(node => {
      if (editorKind(node) === "inline_math") math.push([node.attrs.value, node.attrs.delimiter]);
      if (editorKind(node) === "citation") cites.push(node.attrs.url);
    });
    assert.deepEqual(math, [["x^2", "gfm"], ["y+1", "dollars"]]);
    assert.deepEqual(cites, ["example.com", "{{1}}", "https://example.com"]);
    assert.ok(doc.firstChild!.textContent.includes("first\nsecond"));
    assert.equal(doc.child(1).firstChild!.attrs.nfmAttrs.endTime, "10:00");
    assert.equal(doc.child(1).lastChild!.type.name, "inline.mention_agent");
    const changed = EditorState.create({ doc }).tr.insertText("!", 1).doc;
    const saved = serializeNative(changed, config);
    assert.ok(saved.includes('$`x^2`$')); assert.ok(saved.includes('$y+1$'));
    assert.ok(saved.includes('`first<br>second`'));
    assert.equal(editorFingerprint(parseNative(saved, config).firstChild!), editorFingerprint(changed.firstChild!));
  });
  test(`${variant}: broken containers and literals stay recoverable; official flags can disable blocks`, () => {
    for (const body of ['<tabs>\n\t<tab>\nNo indented title\n\t</tab>\n</tabs>', '<meeting-notes>\n\tTitle\n\t<notes>\n\t\tMissing close', '<embed src="x"/> trailing', '<meeting-notes>\n\tTitle\n\t<notes/> discarded\n</meeting-notes>']) {
      assert.equal(serializeNative(parseNative(body, config), config), body);
      assert.equal(editorKind(parseNative(body, config).firstChild), "opaque_block");
    }
    const code = '```xml\n' + tabs + '\n```';
    assert.equal(editorKind(parseNative(code, config).firstChild), "code_block");
    assert.equal(parseNative(tabs, { ...config, extensions: { notion_tabs: false } }).firstChild!.type.name, "block.unsupported");
  });
  test(`${variant}: creating notes from a title-only meeting and editing reference attributes stay native`, () => {
    const doc = parseNative('<meeting-notes>\n\tTitle\n</meeting-notes>', config);
    const renamed = EditorState.create({ doc }).tr.setNodeMarkup(0, undefined, { ...doc.firstChild!.attrs, title: 'Renamed' }).doc;
    const source = serializeNative(renamed, config);
    assert.equal(parseNative(source, config).firstChild!.attrs.title, 'Renamed');
    assert.ok(!source.includes('<empty-block/>'));
    const typed = EditorState.create({ doc }).tr.insertText('My notes', 2).doc;
    const reopened = parseNative(serializeNative(typed, config), config);
    assert.equal(reopened.firstChild!.firstChild!.attrs.section, 'notes');
    assert.equal(reopened.firstChild!.textContent, 'My notes');
    const attachment = parseNative('<file src="{{1}}">Attachment</file>', config).firstChild!;
    const withAttachment = doc.type.create(doc.attrs, doc.firstChild!.type.create(doc.firstChild!.attrs, attachment));
    assert.equal(parseNative(serializeNative(withAttachment, config), config).firstChild!.firstChild!.firstChild!.type.name, 'block.file');
    const nested = '<columns>\n\t<column>\n' + tabs.split('\n').map(line => '\t\t' + line).join('\n') + '\n\t</column>\n\t<column>\n\t\tOther\n\t</column>\n</columns>';
    const nestedDoc = parseNative(nested, config);
    assert.equal(nestedDoc.firstChild!.firstChild!.firstChild!.type.name, 'block.tabs');
    assert.equal(serializeNative(nestedDoc, config), nested);
    for (const raw of ['<embed src="{{1}}" future="keep">Caption</embed>', '<folder url="{{2}}" future="keep">Folder</folder>', '<database data-source-url="collection://x" wiki="true" future="keep">Wiki</database>']) {
      const doc = parseNative(raw, config), node = doc.firstChild!;
      const field = editorKind(node) === 'notion_embed' ? 'caption' : 'label';
      const changed = EditorState.create({ doc }).tr.setNodeMarkup(0, undefined, { ...node.attrs, [field]: 'Edited & kept' }).doc;
      const saved = serializeNative(changed, config), reopened = parseNative(saved, config).firstChild!;
      assert.equal(reopened.type, node.type);
      assert.equal(reopened.attrs[field], 'Edited & kept');
      assert.equal(reopened.attrs.nfmAttrs.future, 'keep');
      assert.ok(!saved.includes('editorRepresentation'));
    }
  });
}
test("MCP references without a URL map remain unresolved, and local object protocols stay Notdown-only", () => {
  assert.equal(safeReference("{{1}}"), "");
  assert.equal(safeReference("file-upload://abc"), "");
  const config: SyntaxConfig = { version: 1, variant: "notion-markdown", extensions: { notion_tabs: true, notion_meeting_notes: true } };
  for (const body of ['<tabs active="0">\n<tab title="Local">Body</tab>\n</tabs>', '<meeting-notes title="Local">Body</meeting-notes>', '<html-embed/>', '<web-embed/>', '<button/>', '<ai-block/>']) {
    assert.equal(parseNative(body, config).firstChild!.type.name, "block.unsupported", body);
  }
});
