import { editorKind } from "../../src/document/node-identity";
import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "prosemirror-state";
import { TextSelection } from "prosemirror-state";
import { editTable } from "../../src/editor/table-commands";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec";
import { dialects, enabled, supportsOption, type SyntaxConfig } from "../../src/markdown-engine/config";
import { objectSamples } from "../../src/document/object-model";
import { localObjectPlugins } from "../../src/markdown-engine/presets";
import { pageReminders } from "../../src/features/dates/reminders";
import type { Page } from "../../src/shared/types";
const config = (variant: SyntaxConfig["variant"]): SyntaxConfig => ({ version: 1, variant, extensions: {} });

test("supplemental Notion objects are Notdown-only even with legacy or explicit overrides", () => {
  const legacySamples = { ...objectSamples, tabs: '<tabs active="0">\n<tab title="First">\nBody\n</tab>\n</tabs>', meeting_notes: '<meeting-notes title="Meeting" audio="assets/a.wav">\nBody\n</meeting-notes>' };
  for (const { id } of dialects) for (const [name, sample] of Object.entries(legacySamples)) {
    const flag = localObjectPlugins[name];
    const c = { ...config(id), extensions: { [flag]: true, [flag.replace(/^notion_/, "local_")]: true } };
    const official = id === "notion-markdown" && ["tabs", "meeting_notes"].includes(name);
    assert.equal(enabled(c, flag), id === "notdown" || official);
    assert.equal(supportsOption(c, flag), id === "notdown" || official);
    const doc = parseNative(sample + "\n\nTail", c);
    assert.equal(editorKind(doc.firstChild) === name, id === "notdown", id + name);
    const edited = EditorState.create({ doc }).tr.insertText("!", doc.content.size - 1).doc;
    assert(serializeNative(edited, c).startsWith(sample), id + name);
  }
});

test("custom properties and retired directives stay recoverable without activating official semantics", () => {
  const samples = [
    '<page-link url="#page/child">Link to child</page-link>',
    '<columns>\n<column width-ratio="0.3">\nLeft\n</column>\n<column>\nRight\n</column>\n</columns>',
    '<mention-date start="2026-09-23" reminder="2026-09-23T12:00:00Z"/>',
    '<mention-date start="2026-09-23T12:00:00Z"/>',
    '<details open="false">\n<summary>Title</summary>\n\tChild\n</details>',
    '<synced_block id="local" auto-refresh="true">\n\tSnapshot\n</synced_block>',
  ];
  for (const source of samples) {
    const official = parseNative(source, config("notion-markdown"));
    assert.equal(editorKind(official.firstChild), "opaque_block", source);
    assert.equal(serializeNative(official, config("notion-markdown")), source);
    const extended = parseNative(source, config("notdown"));
    assert.notEqual(editorKind(extended.firstChild), "opaque_block", source);
    assert.throws(() => serializeNative(extended, config("notion-markdown")), /only.*Notdown/);
  }
  for (const source of [':::nest\nParent\n:::children\nChild\n:::endnest', ':::columns\nLeft\n:::column\nRight\n:::', '::page{id="old"}', '<figure src="old.png" alt="Alt" caption="Caption"/>']) {
    for (const variant of ["notdown", "notion-markdown"] as const) {
      const doc = parseNative(source, config(variant));
      assert.equal(editorKind(doc.firstChild), "opaque_block", source);
      assert.equal(serializeNative(doc, config(variant)), source);
      const fence = "```text\n" + source + "\n```";
      assert.equal(editorKind(parseNative(fence, config(variant)).firstChild), "code_block");
    }
  }
});

test("official dates and styles remain active; reminders only execute in Notdown", () => {
  for (const source of ['<mention-date start="2026-09-23" startTime="12:30" timeZone="Asia/Shanghai"/>', '<span color="red" underline="true">Text</span>']) {
    const doc = parseNative(source, config("notion-markdown"));
    assert.equal(editorKind(doc.firstChild), "paragraph");
    assert.equal(serializeNative(doc, config("notion-markdown")), source);
  }
  const page = { id: "test", title: "Test", body: '<mention-date start="2026-09-23" reminder="2026-09-23T12:00:00Z"/>', bodyFormat: "notion-markdown", syntax: config("notdown") } as Page;
  assert.equal(pageReminders(page).length, 1);
  assert.equal(pageReminders({ ...page, syntax: config("notion-markdown") }).length, 0);
});

test("figures use existing Pandoc syntax, require a caption and do not register local_figure", () => {
  const c = config("notdown");
  assert(!enabled({ ...c, extensions: { local_figure: true } }, "local_figure"));
  assert.equal(parseNative('![Caption](image.png){alt="Description"}', c).firstChild?.attrs.kind, "figure");
  assert.match(parseNative('![Caption](image.png){alt="Description"}', c).firstChild!.attrs.html, /alt="Description"/);
  assert.notEqual(parseNative('![](image.png)', c).firstChild?.attrs.kind, "figure");
});

test("Notion table merges use Pandoc and decline conversion when unknown attributes would be lost", () => {
  const c = config("notdown");
  for (const extra of ["", ' custom="keep"']) {
    const source = `<table${extra}>\n<tr><td>A</td><td>B</td></tr>\n</table>`;
    const doc = parseNative(source, c);
    let state = EditorState.create({ doc, selection: TextSelection.create(doc, 4) });
    assert.equal(editTable("merge-right", null)(state), false);
    assert.equal(editTable("merge-right", "grid")(state, tr => state = state.apply(tr)), !extra);
    const saved = serializeNative(state.doc, c);
    if (extra) assert.equal(saved, source);
    else {
      assert(!saved.includes("<table"));
      assert.equal(parseNative(saved, c).firstChild!.firstChild!.firstChild!.attrs.colspan, 2);
    }
  }
});
