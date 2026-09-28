import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "prosemirror-state";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec";
import { editorKind } from "../../src/document/node-identity";
import { type SyntaxConfig } from "../../src/markdown-engine/config";
import { escapeXml } from "../../src/document/notion-syntax";
import { pageReminders } from "../../src/features/dates/reminders";
import type { Page } from "../../src/shared/types";

test("meeting preferences round-trip only in Notdown and retain unknown fields and fenced content", () => {
  const settings = { language: "zh", selected: "custom", future: { keep: true }, custom: [{ id: "custom", name: "Review", prompt: "Decisions\nand risks" }] };
  const source = `<meeting-notes future="keep" meeting-config="${escapeXml(JSON.stringify(settings))}">\n\tMeeting <mention-date start="2026-09-27"/>\n\t<notes>\n\t\t~~~xml\n\t\t<meeting-notes>literal</meeting-notes>\n\t\t~~~\n\t</notes>\n</meeting-notes>\n\nTail`;
  for (const variant of ["notdown", "notion-markdown"] as const) {
    const config: SyntaxConfig = { version: 1, variant, extensions: { notion_meeting_notes: true } };
    const doc = parseNative(source, config); assert.equal(editorKind(doc.firstChild), variant === "notdown" ? "meeting_notes" : "opaque_block");
    const edited = EditorState.create({ doc }).tr.insertText("!", doc.content.size - 1).doc;
    assert.equal(serializeNative(edited, config), source + "!");
    if (variant === "notdown") {
      const node = doc.firstChild!;
      const changed = EditorState.create({ doc }).tr.setNodeMarkup(0, undefined, { ...node.attrs, title: 'Renamed <mention-date start="2026-09-28"/>' }).doc;
      const saved = serializeNative(changed, config), reopened = parseNative(saved, config).firstChild!;
      assert.deepEqual(JSON.parse(reopened.attrs.nfmAttrs["meeting-config"]), settings);
      assert.equal(reopened.attrs.nfmAttrs.future, "keep"); assert.equal(reopened.firstChild!.firstChild!.textContent, "<meeting-notes>literal</meeting-notes>");
      assert.throws(() => serializeNative(changed, { ...config, variant: "notion-markdown" }), /Notdown/);
    }
  }
});

test("meeting title reminders use the existing reminder service and remain Notdown-only", () => {
  const body = '<meeting-notes>\n\tMeeting <mention-date start="2030-06-16T14:30:00+08:00" reminder="2030-06-16T06:00:00.000Z" future="keep"/>\n\t<notes>\n\t\tAgenda\n\t</notes>\n</meeting-notes>';
  for (const variant of ["notdown", "notion-markdown"] as const) {
    const syntax: SyntaxConfig = { version: 1, variant, extensions: { notion_meeting_notes: true, notion_custom: true } };
    const doc = parseNative(body, syntax);
    assert.equal(editorKind(doc.firstChild), variant === "notdown" ? "meeting_notes" : "opaque_block");
    assert.equal(serializeNative(doc, syntax), body);
    const reminders = pageReminders({ id: "meeting", title: "Review", body, bodyFormat: "notion-markdown", syntax } as Page);
    assert.equal(reminders.length, variant === "notdown" ? 1 : 0);
    if (reminders.length) assert.equal(reminders[0].at, Date.parse("2030-06-16T06:00:00.000Z"));
  }
});
