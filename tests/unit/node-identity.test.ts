import assert from "node:assert/strict";
import test from "node:test";
import { EditorState } from "prosemirror-state";
import { history, undo } from "prosemirror-history";
import type { EditorView } from "prosemirror-view";
import { editorSchema as schema } from "../../src/document/editor-schema";
import { editorFingerprint } from "../../src/document/editor-markdown";
import {
  contentObject,
  resolveContentObject,
} from "../../src/document/content-objects";
import { createEditorNode, namedNodeViews } from "../../src/document/node-identity";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec";
import type { SyntaxConfig } from "../../src/markdown-engine/config";

const config: SyntaxConfig = { version: 1, variant: "notdown", extensions: {} };

test("schema registers actual object IDs, with no old node-name aliases", () => {
  for (const [name, type] of Object.entries(schema.nodes)) {
    assert.equal(type.name, name);
    if (["doc", "text"].includes(name) || name.startsWith("structure."))
      continue;
    assert(contentObject(name), `Missing content object for ${name}`);
    assert.equal(resolveContentObject(type.create())?.id, name);
  }
  for (const old of [
    "paragraph",
    "page_link",
    "mention",
    "link_mention",
    "media_block",
    "syntax_block",
    "blockquote",
  ])
    assert.equal(schema.nodes[old], undefined, old);
  assert.equal(schema.node("block.paragraph").toJSON().type, "block.paragraph");
  assert.equal(
    schema.nodes["inline.mention_person"].create().attrs.kind,
    "user",
  );
  assert.equal(
    schema.nodes["inline.date_or_reminder"].create().attrs.kind,
    "date",
  );
  assert.equal(schema.nodes["block.audio"].create().attrs.type, "audio");
  assert.equal(schema.nodes["block.diagram"].create().attrs.kind, "diagram");
});

test("mentions and source objects expose canonical names through edits, undo and Markdown reopening", () => {
  const source =
    '<mention-user url="user://alice" future="keep">Alice</mention-user> <mention-date start="2026-09-24"/> <mention-page url="#page/example">Page</mention-page> <mention-link url="https://example.com">Link</mention-link>\r\n\r\n<audio src="clip.mp3">Audio</audio>\r\n\r\n```mermaid\r\ngraph LR\r\nA --> B\r\n```\r\n\r\nTail\r\n';
  const doc = parseNative(source, config),
    names = new Set<string>();
  doc.descendants((node) => {
    names.add(node.type.name);
  });
  for (const name of [
    "inline.mention_person",
    "inline.date_or_reminder",
    "inline.internal_link",
    "inline.link",
    "block.audio",
    "block.diagram",
  ])
    assert(names.has(name), name);
  assert.equal(serializeNative(doc, config), source);
  let state = EditorState.create({ doc, plugins: [history()] });
  state = state.apply(state.tr.insertText("!", doc.content.size - 1));
  const saved = serializeNative(state.doc, config);
  assert.equal(saved, source.replace("Tail", "Tail!"));
  const reopened = parseNative(saved, config);
  assert.equal(editorFingerprint(reopened), editorFingerprint(state.doc));
  assert.equal(
    reopened.firstChild!.firstChild!.type.name,
    "inline.mention_person",
  );
  assert(
    undo(state, (tr) => {
      state = state.apply(tr);
    }),
  );
  assert.equal(serializeNative(state.doc, config), source);
});

test("shared object IDs retain distinct encodings and replace incompatible node views", () => {
  const native = schema.nodes["block.html_block"].create({
    raw: "<b>native</b>",
  });
  const raw = createEditorNode(schema, "syntax_block", {
    kind: "raw",
    raw: "```{=html}\n<b>raw</b>\n```",
    data: { format: "html", code: "<b>raw</b>" },
    config,
  });
  assert.equal(native.type, raw.type);
  assert.equal(native.type.name, "block.html_block");
  let updates = 0;
  const views = namedNodeViews({
    html_block: () => ({
      dom: {} as HTMLElement,
      update: () => {
        updates++;
        return true;
      },
    }),
    syntax_block: () => ({ dom: {} as HTMLElement }),
  });
  const view = views["block.html_block"](
    native,
    {} as EditorView,
    () => 0,
    [],
    {} as never,
  );
  assert.equal(view.update!(native, [], {} as never), true);
  assert.equal(view.update!(raw, [], {} as never), false);
  assert.equal(updates, 1);
});

test("dotted IDs preserve structural constraints and official Agent source", () => {
  const doc = parseNative(
    '- Parent\n  - Child\n\n<mention-agent url="agent://x" future="keep">Helper</mention-agent>\n',
    config,
  );
  doc.check();
  assert.equal(doc.firstChild!.type.name, "structure.bullet_list");
  assert.equal(doc.firstChild!.firstChild!.type.name, "block.bullet_list_item");
  assert.match(
    serializeNative(doc, config),
    /<mention-agent url="agent:\/\/x" future="keep">Helper<\/mention-agent>/,
  );
  assert.equal(doc.child(1).firstChild!.type.name, "inline.mention_agent");
});
