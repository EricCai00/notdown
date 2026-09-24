import assert from "node:assert/strict";
import test from "node:test";
import { EditorState, TextSelection } from "prosemirror-state";
import { editorSchema as schema } from "../../src/document/editor-schema";
import { emojiChoices, emojiInputMatch } from "../../src/editor/emoji-input";
import { commandEnabled, dialects, enabled, type SyntaxConfig } from "../../src/markdown-engine/config";
import { parseNative } from "../../src/markdown-engine/codec";
import { DocumentSession } from "../../src/markdown-engine/session";

function stateFor(text: string, block = "paragraph", mark?: string) {
  const doc = schema.nodes.doc.create(null, schema.nodes[block].create(null,
    schema.text(text, mark ? [schema.marks[mark].create(mark === "link" ? { href: "https://example.com" } : null)] : undefined)));
  return EditorState.create({ doc, selection: TextSelection.create(doc, doc.content.size - 1) });
}

test("emoji query needs whitespace and letters, and excludes code, links, escapes and selections", () => {
  for (const value of ["Text :s", " :smile", "Text :sweat_sm", "Text :SMILE"]) {
    const state = stateFor(value), match = emojiInputMatch(state)!;
    assert.ok(match, value);
    assert.equal(state.doc.textBetween(match.from, match.to), value.slice(value.lastIndexOf(":")));
  }
  for (const value of [":sm", "Text :", "Text:sm", "https://sm", "Text \\:sm", "Text ::sm", "Text :smile:", "Text :sm ile", "Text :123", "`code :sm"]) {
    assert.equal(emojiInputMatch(stateFor(value)), null, value);
  }
  assert.equal(emojiInputMatch(stateFor("code :sm", "code_block")), null);
  for (const mark of ["code", "link"]) assert.equal(emojiInputMatch(stateFor("Text :sm", "paragraph", mark)), null);
  const state = stateFor("Text :sm");
  assert.equal(emojiInputMatch(state.apply(state.tr.setSelection(TextSelection.create(state.doc, 2, 9)))), null);
  assert.ok(emojiInputMatch(stateFor("Text :sm", "heading", "strong")));
});

test("suggestions rank exact names first, deduplicate aliases and agree with the Markdown reader", () => {
  assert.deepEqual(emojiChoices("smile")[0], { name: "smile", icon: "😄" });
  assert.deepEqual(emojiChoices("SMILE"), emojiChoices("smile"));
  assert.deepEqual(emojiChoices("zzzznotanemoji"), []);
  assert.deepEqual(emojiChoices(""), []);
  const choices = emojiChoices("s");
  assert.ok(choices.length <= 48);
  assert.equal(new Set(choices.map(choice => choice.icon)).size, choices.length);
  for (const { name, icon } of choices) {
    assert.equal(parseNative(`:${name}:`, { version: 1, variant: "typora", extensions: {} }).textContent, icon);
  }
});

test("completion follows effective emoji support across every dialect and extension override", () => {
  for (const { id: variant } of dialects) {
    for (const extensions of [{}, { emoji: true }, { emoji: false }] as Record<string, boolean>[]) {
      const config: SyntaxConfig = { version: 1, variant, extensions };
      assert.equal(commandEnabled(config, "emoji_shortcode"), enabled(config, "emoji"));
      // Inserting Unicode from the existing insert menu remains available everywhere.
      assert.equal(commandEnabled(config, "emoji"), true);
    }
  }
  assert.equal(commandEnabled({ version: 1, variant: "notion-markdown", extensions: { emoji: true } }, "emoji_shortcode"), false);
});

test("undo restores the typed shortcode as prose, without reinterpreting it as MMD metadata", () => {
  const session = new DocumentSession("", { version: 1, variant: "notdown", extensions: {} });
  session.documentChanged(stateFor("Hello :smile").doc);
  session.breakHistory();
  session.documentChanged(stateFor("Hello 😄").doc);
  assert.equal(session.undo(), true);
  assert.equal(session.snapshot.doc.firstChild?.type.name, "paragraph");
  assert.equal(session.snapshot.doc.textContent, "Hello :smile");
  assert.equal(session.redo(), true);
  assert.equal(session.snapshot.doc.textContent, "Hello 😄");
  session.sourceChanged("# Source heading", true);
  session.undo();
  session.redo();
  assert.equal(session.snapshot.doc.firstChild?.type.name, "heading");
  assert.equal(session.snapshot.doc.textContent, "Source heading");
});
