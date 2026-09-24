import assert from "node:assert/strict";
import test from "node:test";
import { EditorState, TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { undoInputRule } from "prosemirror-inputrules";
import { editorSchema as schema } from "../../src/document/editor-schema";
import {
  symbolReplacementPlugin,
  symbolReplacements,
} from "../../src/editor/symbol-replacements";
import { markdownRules } from "../../src/editor/editor-input-rules";
import {
  commandEnabled,
  dialects,
  supportsOption,
  type SyntaxConfig,
} from "../../src/markdown-engine/config";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec";

const config: SyntaxConfig = { version: 1, variant: "notdown", extensions: {} };
function harness(syntax = config, content = schema.nodes.paragraph.create()) {
  const allow = (command: string) => commandEnabled(syntax, command);
  const plugins = [
    markdownRules(allow),
    symbolReplacementPlugin(() => allow("symbol_replacements")),
  ];
  let state = EditorState.create({
    schema,
    doc: schema.nodes.doc.create(null, content),
    plugins,
  });
  state = state.apply(
    state.tr.setSelection(
      TextSelection.create(state.doc, state.doc.content.size - 1),
    ),
  );
  const view = {
    get state() {
      return state;
    },
    composing: false,
    dispatch(tr) {
      state = state.apply(tr);
    },
  } as EditorView;
  return {
    view,
    get state() {
      return state;
    },
    type(value: string) {
      for (const character of value) {
        const { from, to } = state.selection;
        const handled = plugins.some((plugin) =>
          plugin.props.handleTextInput!.call(
            plugin,
            view,
            from,
            to,
            character,
            () => state.tr.insertText(character),
          ),
        );
        if (!handled) view.dispatch(state.tr.insertText(character));
        state.doc.check();
      }
    },
  };
}

test("every symbol shortcut works with real character-by-character input", () => {
  for (const [source, symbol] of symbolReplacements) {
    const editor = harness();
    editor.type("Plan " + source);
    assert.equal(editor.state.doc.textContent, "Plan " + symbol, source);
  }
});

test("Notdown defaults on, can disable live, and other dialects cannot force it on", () => {
  for (const { id: variant } of dialects) {
    const syntax: SyntaxConfig = {
      version: 1,
      variant,
      extensions: { symbol_replacements: true },
    };
    assert.equal(
      supportsOption(syntax, "symbol_replacements"),
      variant === "notdown",
    );
    const editor = harness(syntax);
    editor.type("->");
    assert.equal(
      editor.state.doc.textContent,
      variant === "notdown" ? "→" : "->",
    );
  }
  const syntax = { ...config, extensions: { symbol_replacements: false } };
  const editor = harness(syntax);
  editor.type("-> ");
  syntax.extensions.symbol_replacements = true;
  editor.type("->");
  assert.equal(editor.state.doc.textContent, "-> →");
});

test("Backspace restores the last input and formatting remains intact", () => {
  const editor = harness(
    config,
    schema.nodes.paragraph.create(
      null,
      schema.text("Bold ", [schema.marks.strong.create()]),
    ),
  );
  editor.type("->");
  assert.equal(
    editor.state.doc.firstChild!.firstChild!.marks[0].type.name,
    "strong",
  );
  assert(undoInputRule(editor.state, editor.view.dispatch));
  assert.equal(editor.state.doc.textContent, "Bold ->");
  editor.type(" ");
  assert.equal(editor.state.doc.textContent, "Bold -> ");
  const chain = harness();
  chain.type("<->");
  assert(undoInputRule(chain.state, chain.view.dispatch));
  assert.equal(chain.state.doc.textContent, "←>");
});

test("code, links, escapes, URLs and longer operators are protected", () => {
  for (const content of [
    schema.nodes.code_block.create(null, schema.text("code X")),
    schema.nodes.paragraph.create(
      null,
      schema.text("code X", [schema.marks.code.create()]),
    ),
    schema.nodes.paragraph.create(
      null,
      schema.text("link X", [
        schema.marks.link.create({ href: "https://example.com" }),
      ]),
    ),
  ]) {
    const editor = harness(config, content);
    editor.view.dispatch(
      editor.state.tr.setSelection(
        TextSelection.create(
          editor.state.doc,
          editor.state.doc.content.size - 2,
        ),
      ),
    );
    editor.type("-> <= ...");
    assert(
      editor.state.doc.textContent.includes("-> <= ..."),
      editor.state.doc.textContent,
    );
  }
  for (const source of [
    "\\->",
    "\\<-",
    "\\...",
    "https://example.com/->",
    "`x ->",
    "$x <=",
    "x -->",
    "x ==> ",
    "<!--",
    "---",
  ]) {
    const editor = harness();
    editor.type(source);
    if (source === "---")
      assert.equal(editor.state.doc.firstChild!.type.name, "horizontal_rule");
    else assert.equal(editor.state.doc.textContent, source, source);
  }
});

test("loading, pasting and serializing source never run typing replacements", () => {
  const source = "Literal -> <- <-> => <=> <= >= != +/- ... (c) (r) (tm)\n";
  const doc = parseNative(source, config);
  assert.equal(serializeNative(doc, config), source);
  const editor = harness();
  editor.view.dispatch(editor.state.tr.insertText(source.trim()));
  assert.equal(editor.state.doc.textContent, source.trim());
  const typed = harness();
  typed.type("Plan -> done");
  const saved = serializeNative(typed.state.doc, config);
  assert(saved.includes("Plan → done"));
  assert.equal(parseNative(saved, config).textContent, "Plan → done");
});
