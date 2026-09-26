import { createEditorNode, editorKind } from "../../src/document/node-identity";
import assert from "node:assert/strict";
import test from "node:test";
import { EditorState, TextSelection } from "prosemirror-state";
import { editorSchema as schema } from "../../src/document/editor-schema";
import { emojiCategories, emojiChoices, emojiInputMatch, emojiSections } from "../../src/editor/emoji-input";
import { emojiCount, emojiGroups } from "../../src/blocks/emoji-catalog";
import definitions from "markdown-it-emoji/lib/data/full.mjs";
import { commandEnabled, dialects, enabled, type SyntaxConfig } from "../../src/markdown-engine/config";
import { parseNative } from "../../src/markdown-engine/codec";
import { DocumentSession } from "../../src/markdown-engine/session";

function stateFor(text: string, block = "paragraph", mark?: string) {
  const doc = schema.nodes["doc"].create(null, createEditorNode(schema, block, null, schema.text(text, mark ? [schema.marks[mark].create(mark === "link" ? { href: "https://example.com" } : null)] : undefined)));
  return EditorState.create({ doc, selection: TextSelection.create(doc, doc.content.size - 1) });
}

test("emoji query works at line start or after whitespace, excluding code, links, escapes and selections", () => {
  for (const value of [":sm", "Text\n:sm", "Text :s", " :smile", "Text :sweat_sm", "Text :SMILE"]) {
    const state = stateFor(value), match = emojiInputMatch(state)!;
    assert.ok(match, value);
    assert.equal(state.doc.textBetween(match.from, match.to), value.slice(value.lastIndexOf(":")));
  }
  for (const value of [":", "Text :", "Text:sm", "https://sm", "Text \\:sm", "Text ::sm", "Text :smile:", "Text :sm ile", "Text :123", "`code :sm"]) {
    assert.equal(emojiInputMatch(stateFor(value)), null, value);
  }
  assert.equal(emojiInputMatch(stateFor("code :sm", "code_block")), null);
  for (const mark of ["code", "link"]) assert.equal(emojiInputMatch(stateFor("Text :sm", "paragraph", mark)), null);
  const state = stateFor("Text :sm");
  assert.equal(emojiInputMatch(state.apply(state.tr.setSelection(TextSelection.create(state.doc, 2, 9)))), null);
  assert.ok(emojiInputMatch(stateFor("Text :sm", "heading", "strong")));
  const doc = schema.nodes.doc.create(null, createEditorNode(schema, "paragraph", null, [
    schema.text("Before"), createEditorNode(schema, "hard_break"), schema.text(":sm"),
  ]));
  const afterBreak = EditorState.create({ doc, selection: TextSelection.create(doc, doc.content.size - 1) });
  assert.equal(emojiInputMatch(afterBreak)?.query, "sm");
});

test("suggestions rank exact names first, deduplicate aliases and agree with the Markdown reader", () => {
  assert.equal(emojiChoices("smile")[0].icon, "😄");
  assert.equal(emojiChoices("smile")[0].shortcode, "smile");
  assert.deepEqual(emojiChoices("SMILE"), emojiChoices("smile"));
  assert.deepEqual(emojiChoices("zzzznotanemoji"), []);
  assert.deepEqual(emojiChoices(""), []);
  const choices = emojiChoices("s");
  assert.ok(choices.length > 48);
  assert.equal(new Set(choices.map(choice => choice.icon)).size, choices.length);
  for (const { shortcode, icon } of choices) {
    if (shortcode) assert.equal(parseNative(`:${shortcode}:`, { version: 1, variant: "typora", extensions: {} }).textContent.replace(/\uFE0F/g, ""), icon.replace(/\uFE0F/g, ""));
  }
});

test("categories include the entire Unicode catalog, including emoji without shortcodes", () => {
  assert.equal(emojiCategories.length, 8);
  for (const category of emojiCategories) {
    assert.ok(category.choices.length, category.name);
    assert.equal(new Set(category.choices.map(choice => choice.icon)).size, category.choices.length);
    for (const choice of category.choices) if (choice.shortcode) assert.equal(definitions[choice.shortcode].replace(/\uFE0F/g, ""), choice.icon.replace(/\uFE0F/g, ""));
  }
  const icons = emojiCategories.flatMap(category => category.choices.map(choice => choice.icon));
  assert.equal(icons.length, emojiCount);
  assert.equal(emojiCount, 3972);
  assert.deepEqual(new Set(icons), new Set(emojiGroups.flatMap(group => group.entries.map(([icon]) => icon))));
  assert.ok(emojiCategories.flatMap(category => category.choices).filter(choice => !choice.shortcode).length > 1000);
  for (const [category, icon] of [["People", "😄"], ["Nature", "🐶"], ["Food & Drink", "🍕"], ["Travel & Places", "🚀"], ["Flags", "🇨🇳"]]) {
    assert.ok(emojiCategories.find(item => item.name === category)?.choices.some(choice => choice.icon === icon), category);
  }
});

test("search covers CLDR names, keywords, skin tones and shortcodes, grouped without omissions", () => {
  for (const query of ["s", "smile", "melting", "technologist", "dark_skin_tone"]) {
    const matches = emojiChoices(query), sections = emojiSections(query);
    assert.ok(matches.length, query);
    assert.deepEqual(new Set(sections.flatMap(section => section.choices.map(choice => choice.icon))), new Set(matches.map(choice => choice.icon)));
    assert.ok(sections.every(section => section.choices.length));
  }
  assert.ok(emojiSections("s").length > 1);
  assert.ok(emojiChoices("melting").some(choice => choice.icon === "🫠"));
  assert.ok(emojiChoices("technologist").some(choice => choice.icon === "🧑🏿‍💻"));
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
  assert.equal(editorKind(session.snapshot.doc.firstChild), "paragraph");
  assert.equal(session.snapshot.doc.textContent, "Hello :smile");
  assert.equal(session.redo(), true);
  assert.equal(session.snapshot.doc.textContent, "Hello 😄");
  session.sourceChanged("# Source heading", true);
  session.undo();
  session.redo();
  assert.equal(editorKind(session.snapshot.doc.firstChild), "heading");
  assert.equal(session.snapshot.doc.textContent, "Source heading");
});
