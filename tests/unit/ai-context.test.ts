import assert from "node:assert/strict";
import test from "node:test";
import { EditorState } from "prosemirror-state";
import { aiPageText, aiPrompt, aiReferences } from "../../src/blocks/ai-context";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec";
import { escapeXml } from "../../src/document/notion-syntax";
const syntax = { version: 1 as const, variant: "notdown" as const, extensions: {} };

test("AI settings reuse mention syntax and preserve unknown fields and fenced payloads", () => {
  const context = '<mention-page url="#page/a">A &amp; B</mention-page> <mention-user url="person://eric">Eric</mention-user>';
  const source = `<ai-block prompt="Old" context="${escapeXml(context)}" generate="summary" using="specified" search="selected" future="keep">\n\`\`\`html\n</ai-block>\n\`\`\`\n</ai-block>`;
  let state = EditorState.create({ doc: parseNative(source, syntax) });
  assert.equal(serializeNative(state.doc, syntax), source);
  state = state.apply(state.tr.setNodeMarkup(0, undefined, { ...state.doc.firstChild!.attrs, prompt: 'New\n"prompt"' }));
  const saved = serializeNative(state.doc, syntax), node = parseNative(saved, syntax).firstChild!;
  assert.equal(node.attrs.context, context); assert.equal(node.attrs.prompt, 'New\n"prompt"'); assert.equal(node.attrs.nfmAttrs.future, "keep");
  assert.equal(node.firstChild!.textContent, "</ai-block>");
  assert.deepEqual(aiReferences(context).map(r => [r.kind, r.target, r.label]), [["page", "#page/a", "A & B"], ["user", "person://eric", "Eric"]]);
  const official = parseNative(source, { ...syntax, variant: "notion-markdown", extensions: { notion_ai_block: true } });
  assert.notEqual(official.firstChild?.type.name, "block.ai_block");
});

test("page context excludes AI outputs and presets supply real instructions", () => {
  const doc = parseNative("# Source\n\nLive text\n\n<ai-block>\nOld AI result\n</ai-block>", syntax);
  assert.equal(aiPageText(doc), "Source\n\nLive text");
  assert.match(aiPrompt("summary", "In Chinese"), /Summarize/);
  assert(!aiPrompt("summary", "Hidden custom instruction").includes("Hidden custom instruction"));
  assert.match(aiPrompt("key-points", ""), /bulleted list/);
  assert.equal(aiPrompt("custom", "  My prompt  "), "My prompt");
});
