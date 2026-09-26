import { editorKind } from "../../src/document/node-identity";
import assert from "node:assert/strict";
import test from "node:test";
import { type Node as PMNode } from "prosemirror-model";
import { EditorState, TextSelection } from "prosemirror-state";
import { type EditorView } from "prosemirror-view";
import { undoInputRule } from "prosemirror-inputrules";
import { history, undo } from "prosemirror-history";
import { editorSchema as schema } from "../../src/document/editor-schema.js";
import { markdownRules, mathBlockEnter } from "../../src/editor/editor-input-rules.js";
import type { CodeInputMode } from "../../src/editor/code-input-preferences";
import type { InlineSyntaxCodec } from "../../src/editor/inline-syntax-input";
import { restoreFootnotes } from "../../src/editor/footnotes";
import { commandEnabled, dialects } from "../../src/markdown-engine/config";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec";
import {
  parseEditorMarkdown,
  serializeEditorMarkdown,
} from "../../src/document/editor-markdown.js";

function harness(
  doc = schema.nodes["doc"].create(null, schema.nodes["block.paragraph"].create()),
  position?: number,
  allow?: (command: string) => boolean,
  codeMode?: () => CodeInputMode,
  inlineCodec?: InlineSyntaxCodec,
) {
  const plugin = markdownRules(allow, undefined, codeMode, inlineCodec);
  let state = EditorState.create({ schema, doc, plugins: [plugin] });
  state = state.apply(
    state.tr.setSelection(
      TextSelection.create(state.doc, position ?? state.doc.content.size - 1),
    ),
  );
  const view = {
    get state() {
      return state;
    },
    composing: false,
    dispatch(tr: Parameters<EditorView["dispatch"]>[0]) {
      state = state.apply(tr);
    },
  } as unknown as EditorView;
  const type = (value: string) => {
    for (const character of value) {
      const { from, to } = state.selection;
      const handled = plugin.props.handleTextInput!.call(
        plugin,
        view,
        from,
        to,
        character,
        () => state.tr.insertText(character, from, to),
      );
      if (!handled) view.dispatch(state.tr.insertText(character, from, to));
      state.doc.check();
    }
  };
  const input = (value: string) => {
    const { from, to } = state.selection;
    const handled = plugin.props.handleTextInput!.call(
      plugin,
      view,
      from,
      to,
      value,
      () => state.tr.insertText(value, from, to),
    );
    if (!handled) view.dispatch(state.tr.insertText(value, from, to));
    state.doc.check();
    return handled;
  };
  return {
    get state() {
      return state;
    },
    view,
    type,
    input,
  };
}

test("typed headings, parenthesized lists and backtick fences follow each active dialect", () => {
  for (const { id: variant } of dialects) {
    const config = { version: 1 as const, variant, extensions: {} };
    for (const [typed, source] of [
      ["##### ", "##### Heading"], ["###### ", "###### Heading"],
      ["1) ", "1) Item"], ["```", "```\ncode\n```"],
    ]) {
      const editor = harness(undefined, undefined, command => commandEnabled(config, command));
      editor.type(typed);
      const expected = parseNative(source, config).firstChild!;
      assert.equal(editorKind(editor.state.doc.firstChild!), editorKind(expected), `${variant}: ${typed}`);
      if (editorKind(expected) === "heading") assert.equal(editor.state.doc.firstChild!.attrs.level, expected.attrs.level, variant);
    }
  }
});

function paragraph(...nodes: PMNode[]) {
  return schema.nodes["doc"].create(null, schema.nodes["block.paragraph"].create(null, nodes));
}

const notdownInputConfig = { version: 1 as const, variant: "notdown" as const, extensions: {} };
function syntaxHarness(source = "", flags: Record<string, boolean> = {}) {
  const config = { ...notdownInputConfig, extensions: flags };
  const doc = parseNative(source, config);
  return harness(doc, 1, name => commandEnabled(config, name), undefined, {
    parse: text => parseNative(text, config), context: document => serializeNative(document, config),
  });
}

test("inline shorthand completes marks and CriticMarkup only at their own closing delimiter", () => {
  for (const [source, mark, kind, text] of [
    ["^2^", "superscript", "", "2"], ["~2~", "subscript", "", "2"],
    ["{++added++}", "critic", "addition", "added"], ["{--removed--}", "critic", "deletion", "removed"],
    ["{==bright==}", "critic", "highlight", "bright"], ["{>>secret<<}", "critic", "comment", "secret"],
    ["{~~old~>new~~}", "critic", "substitution", "new"],
  ]) {
    const editor = syntaxHarness();
    editor.type(source.slice(0, -1));
    assert.equal(editor.state.doc.textContent, source.slice(0, -1), source);
    editor.type(source.slice(-1));
    const node = editor.state.doc.firstChild!.firstChild!;
    assert.equal(node.textContent, text, source);
    assert.equal(node.marks[0].type.name, mark, source);
    if (kind) assert.equal(node.marks[0].attrs.kind, kind);
    if (kind === "substitution") assert.equal(node.marks[0].attrs.old, "old");
    assert.equal(serializeNative(editor.state.doc, notdownInputConfig), source);
    assert.equal(undoInputRule(editor.state, editor.view.dispatch), true);
    assert.equal(editor.state.doc.textContent, source);
    const continuation = syntaxHarness(); continuation.type(source); continuation.type(" after");
    assert.equal(continuation.state.doc.firstChild!.lastChild!.marks.length, 0);
  }
  const rich = syntaxHarness(); rich.type("{++**bold**++}");
  assert.deepEqual(rich.state.doc.firstChild!.firstChild!.marks.map(mark => mark.type.name).sort(), ["critic", "strong"]);
  const replace = syntaxHarness(); replace.type("{~~**old**~>**new**~~}");
  const replacement = replace.state.doc.firstChild!.firstChild!;
  assert.equal(replacement.marks.find(mark => mark.type.name === "critic")!.attrs.old, "**old**");
  assert.equal(serializeNative(replace.state.doc, notdownInputConfig), "{~~**old**~>**new**~~}");
});

test("closed emoji, autolinks, HTML, abbreviation and citation syntax uses the active codec", () => {
  for (const [source, type] of [
    [":smile:", "text"], ["<https://example.com/path>", "text"], ["<me@example.com>", "text"],
    ["<kbd>Enter</kbd>", "inline.inline_html"],
    ["[>(HTML) Hypertext Markup Language]", "inline.abbreviation"],
    ["[@doe]", "inline.citation"], ["[#doe]", "inline.citation"], ["[^https://example.com]", "inline.citation"],
  ]) {
    const editor = syntaxHarness(); editor.type(source);
    assert.equal(editor.state.doc.firstChild!.firstChild!.type.name, type, source);
    if (source === ":smile:") assert.equal(editor.state.doc.textContent, "😄");
    if (/^<(https|me@)/.test(source)) assert.equal(editor.state.doc.firstChild!.firstChild!.marks[0].type.name, "link");
    assert.equal(undoInputRule(editor.state, editor.view.dispatch), true, source);
    assert.equal(editor.state.doc.textContent, source);
  }
  for (const [source, definition, title] of [
    ["[>HTML]", "[>HTML]: Hypertext Markup Language", "Hypertext Markup Language"],
    ["[#doe]", "[#doe]: Jane Doe. A book.", "Jane Doe. A book."],
  ]) {
    const editor = syntaxHarness("Start\n\n" + definition);
    editor.type(source);
    assert.equal(editor.state.doc.firstChild!.firstChild!.attrs.title, title);
  }
});

test("inline note typing preserves rich text and leaves code, escapes and disabled syntax literal", () => {
  const note = syntaxHarness(); note.type("^[a **bold** note]");
  const restored = restoreFootnotes(note.state.doc);
  const node = restored.firstChild!.firstChild!;
  assert.equal(editorKind(node), "inline_note");
  assert.equal(node.textContent, "a bold note");
  assert.equal(node.child(1).marks[0].type.name, "strong");
  assert.equal(serializeNative(restored, notdownInputConfig), "^[a **bold** note]");
  assert.equal(undoInputRule(note.state, note.view.dispatch), true);
  assert.equal(note.state.doc.textContent, "^[a bold note]");
  assert.equal(note.state.doc.firstChild!.child(1).marks[0].type.name, "strong");
  for (const source of ["\\^2^", "\\~2~", "\\{++text++}", "\\<https://example.com>", "\\:smile:", "\\^[note]", "<javascript:alert(1)>"]) {
    const editor = syntaxHarness(); editor.type(source);
    assert.equal(editor.state.doc.textContent, source, source);
  }
  for (const [source, flag] of [["^2^", "superscript"], ["~2~", "subscript"], ["{==text==}", "critic_markup"], [":smile:", "emoji"], ["^[note]", "inline_notes"], ["<kbd>Enter</kbd>", "raw_html"]]) {
    const editor = syntaxHarness("", { [flag]: false }); editor.type(source);
    assert.equal(editor.state.doc.textContent, source);
  }
  const code = syntaxHarness("`literal`");
  code.view.dispatch(code.state.tr.setSelection(TextSelection.create(code.state.doc, 3)));
  code.type("{++text++} ^2^ :smile:");
  assert.equal(code.state.doc.firstChild!.childCount, 1);
  assert.equal(code.state.doc.firstChild!.firstChild!.marks[0].type.name, "code");
  for (const prefix of ["`", "``"]) {
    const literal = syntaxHarness(); literal.type(prefix + " :smile: {++text++} ^2^");
    assert.equal(literal.state.doc.textContent, prefix + " :smile: {++text++} ^2^");
  }
});

test("divider, quote and line shortcuts preserve nested context and undo", () => {
  const config = { version: 1 as const, variant: "notdown" as const, extensions: {} };
  for (const source of [
    "Target",
    "Parent\n\tTarget\n\t\tChild\n\nSibling",
    "- Parent\n\t- Target\n\t\t- Child\n\t- Following\n- Sibling",
    "> Target\n\nSibling",
    '<columns>\n\t<column>\n\t\tTarget\n\t</column>\n\t<column>\n\t\tSibling\n\t</column>\n</columns>',
  ]) {
    for (const [trigger, kind] of [["---", "horizontal_rule"], ['" ', "blockquote"], ["| ", "line_block"]]) {
      const doc = parseNative(source, config);
      let pos = -1;
      doc.descendants((node, at) => { if (node.isTextblock && node.textContent === "Target") pos = at + 1; });
      assert.ok(pos > 0, source);
      const editor = harness(doc, pos, name => commandEnabled(config, name));
      editor.view.dispatch(editor.state.tr.delete(pos, pos + 6));
      const before = editor.state.doc;
      editor.type(trigger);
      let count = 0;
      editor.state.doc.descendants(node => { if (editorKind(node) === kind) count++; });
      assert.ok(count > 0, `${source}: ${trigger}`);
      editor.type("Continue");
      const reloaded = parseNative(serializeNative(editor.state.doc, config), config);
      assert.ok(reloaded.textContent.includes("Continue"));
      for (const text of ["Parent", "Child", "Following", "Sibling"]) {
        if (before.textContent.includes(text)) assert.ok(reloaded.textContent.includes(text), text);
      }
      const reversible = harness(before, pos, name => commandEnabled(config, name));
      reversible.type(trigger);
      assert.equal(undoInputRule(reversible.state, reversible.view.dispatch), true);
      assert.ok(reversible.state.doc.eq(EditorState.create({ doc: before }).tr.insertText(trigger, pos).doc));
      assert.ok(reversible.state.doc.textContent.includes(trigger));
    }
  }
});

test("highlight input obeys dialects, preserves marks and exits the highlight", () => {
  for (const { id: variant } of dialects) {
    const config = { version: 1 as const, variant, extensions: {} };
    const editor = harness(undefined, undefined, name => commandEnabled(config, name));
    editor.type("==重点==");
    assert.equal(editor.state.doc.firstChild!.firstChild!.marks.some(mark => mark.type === schema.marks.highlight), commandEnabled(config, "highlight"), variant);
    if (commandEnabled(config, "highlight")) {
      editor.type(" outside");
      assert.equal(editor.state.doc.firstChild!.lastChild!.marks.length, 0);
      assert.match(serializeNative(editor.state.doc, config), /==重点== outside/);
    }
  }
  const formatted = harness(paragraph(schema.text("==bold", [schema.marks.strong.create()])));
  formatted.type("==");
  assert.deepEqual(formatted.state.doc.firstChild!.firstChild!.marks.map(mark => mark.type.name).sort(), ["highlight", "strong"]);
  for (const trigger of ["\\==text==", "===="]) {
    const literal = harness(); literal.type(trigger);
    assert.equal(literal.state.doc.textContent, trigger);
  }
});

test("Notion-compatible aliases preserve conflicting dialect syntax and undo", () => {
  for (const variant of ["gfm", "notdown", "notion-markdown", "markdown"] as const) {
    const config = { version: 1 as const, variant, extensions: {} };
    const allow = (name: string) => commandEnabled(config, name);
    for (const trigger of ['" ', '| ']) {
      const editor = harness(undefined, undefined, allow);
      editor.type(trigger);
      const lines = trigger === '| ' && allow("lines");
      const converted = lines || trigger === '" ' || allow("input_pipe_quote");
      assert.equal(editorKind(editor.state.doc.firstChild!), lines ? "line_block" : converted ? "blockquote" : "paragraph", `${variant}: ${trigger}`);
      if (converted) { assert.equal(undoInputRule(editor.state, editor.view.dispatch), true); assert.equal(editor.state.doc.textContent, trigger); }
    }
    for (const trigger of ["a. ", "i. "]) {
      const editor = harness(undefined, undefined, allow);
      editor.type(trigger);
      assert.equal(editorKind(editor.state.doc.firstChild!), "ordered_list");
      assert.equal(editor.state.doc.firstChild!.attrs.markerStyle, allow("input_fancy_list") ? trigger[0] === "a" ? "alpha" : "roman" : "decimal");
      assert.equal(undoInputRule(editor.state, editor.view.dispatch), true);
      assert.equal(editor.state.doc.textContent, trigger);
    }
    const strike = harness(undefined, undefined, allow);
    strike.type("~word~");
    assert.equal(strike.state.doc.firstChild!.firstChild!.marks.some(mark => mark.type === schema.marks.strike), allow("input_single_strike"), variant);
    const quote = harness(undefined, undefined, allow);
    quote.type("> ");
    assert.equal(editorKind(quote.state.doc.firstChild!), "blockquote");
    const display = harness(undefined, undefined, allow);
    display.type("$$x$$");
    assert.equal(display.state.doc.textContent, "$$x$$");
  }
  const double = harness(undefined, undefined, name => name !== "input_fancy_list");
  double.type("~~word~~");
  assert.equal(double.state.doc.textContent, "word");
  assert.equal(double.state.doc.firstChild!.firstChild!.marks[0].type, schema.marks.strike);
  for (const trigger of ['"', '|', 'a.', 'i.']) {
    const editor = harness(paragraph(schema.text(trigger, [schema.marks.code.create()])));
    editor.type(" ");
    assert.equal(editorKind(editor.state.doc.firstChild!), "paragraph");
    assert.equal(editor.state.doc.textContent, trigger + " ");
  }
});

test("heading then greater-than creates a reversible toggle heading in supported dialects", () => {
  for (const variant of ["notdown", "notion-markdown"] as const) {
    const allow = (name: string) => commandEnabled({ version: 1, variant, extensions: {} }, name);
    for (const level of [1, 2, 3, 4]) {
      const editor = harness(undefined, undefined, allow);
      editor.type(`${"#".repeat(level)} > `);
      const group = editor.state.doc.firstChild!;
      assert.equal(editorKind(group), "nested_block");
      assert.equal(group.firstChild!.type.name, "block.toggle_heading");
      assert.equal(group.firstChild!.attrs.level, level);
      assert.equal(group.textContent, "");
      assert.equal(undoInputRule(editor.state, editor.view.dispatch), true);
      assert.equal(editorKind(editor.state.doc.firstChild!), "heading");
      assert.equal(editor.state.doc.firstChild!.attrs.toggle, false);
      assert.equal(editor.state.doc.textContent, "> ");
      const composed = harness(undefined, undefined, allow);
      assert.equal(composed.input(`${"#".repeat(level)} > `), true);
      assert.equal(composed.state.doc.firstChild!.firstChild!.attrs.toggle, true);
      composed.type("Title");
      assert.equal(composed.state.doc.textContent, "Title");
    }
  }
});

test("toggle heading input preserves descendants, marks and ordinary quote boundaries", () => {
  const head = schema.nodes["block.heading"].create({ level: 2 }, schema.text("Title", [schema.marks.strong.create()]));
  const group = schema.nodes["structure.nested_block"].create(null, [head, schema.nodes["block.paragraph"].create(null, schema.text("Child"))]);
  const editor = harness(schema.nodes.doc.create(null, group), 2);
  editor.type("> ");
  assert.equal(editor.state.doc.firstChild!.childCount, 2);
  assert.equal(editor.state.doc.firstChild!.firstChild!.attrs.toggle, true);
  assert.ok(editor.state.doc.firstChild!.firstChild!.content.eq(head.content));
  assert.equal(editor.state.doc.firstChild!.lastChild!.textContent, "Child");
  assert.equal(undoInputRule(editor.state, editor.view.dispatch), true);
  assert.equal(editor.state.doc.firstChild!.firstChild!.attrs.toggle, false);
  for (const variant of ["gfm", "notdown"] as const) {
    const allow = (name: string) => commandEnabled({ version: 1, variant, extensions: { notion_nesting: false } }, name);
    const plain = harness(undefined, undefined, allow);
    plain.type("## > ");
    assert.equal(editorKind(plain.state.doc.firstChild!), "blockquote");
  }
  const quote = harness();
  quote.type("> ");
  assert.equal(editorKind(quote.state.doc.firstChild!), "blockquote");
  const code = harness(schema.nodes.doc.create(null, schema.nodes["block.code_block"].create()));
  code.type("## > ");
  assert.equal(code.state.doc.textContent, "## > ");
});

test("closing dollars create inline math with marks, caret continuation and reversible source", () => {
  const editor = harness(paragraph(schema.text("Before $x^2", [schema.marks.strong.create()])));
  editor.type("$");
  const math = editor.state.doc.firstChild!.lastChild!;
  assert.equal(editorKind(math), "inline_math");
  assert.equal(math.attrs.value, "x^2");
  assert.ok(math.marks.some(mark => editorKind(mark) === "strong"));
  assert.equal(undoInputRule(editor.state, editor.view.dispatch), true);
  assert.equal(editor.state.doc.textContent, "Before $x^2$");

  const plain = harness();
  plain.type("Before $x^2$ after $y$");
  assert.equal(serializeEditorMarkdown(plain.state.doc), "Before $x^2$ after $y$");
  assert.equal(plain.state.doc.firstChild!.childCount, 4);
  const composed = harness();
  assert.equal(composed.input("$x + y$"), true);
  assert.equal(composed.state.doc.firstChild!.firstChild!.attrs.value, "x + y");
  const escaped = harness();
  escaped.type("$x\\$y$");
  assert.equal(escaped.state.doc.firstChild!.firstChild!.attrs.value, "x\\$y");
});

test("inline math typing follows dialect defaults and the dollar-math switch", () => {
  const settings: Record<string, boolean>[] = [{}, { tex_math_dollars: true }, { tex_math_dollars: false }];
  for (const { id: variant } of dialects) {
    for (const extensions of settings) {
      const config = { version: 1 as const, variant, extensions };
      const allowed = commandEnabled(config, "inline_equation");
      const editor = harness(undefined, undefined, command => commandEnabled(config, command));
      editor.type("$x$");
      assert.equal(editorKind(editor.state.doc.firstChild!.firstChild!), allowed ? "inline_math" : "text", variant);
      if (!allowed) assert.equal(editor.state.doc.textContent, "$x$");
    }
  }
});

test("inline math leaves literal dollars, code, line breaks and existing atoms intact", () => {
  for (const value of ["$$", "$$x$$", "\\$x$", "$ x$", "$x $", "$x\\$", "$x\ny$", "$5 and $10"]) {
    const editor = harness();
    editor.type(value);
    assert.equal(editor.state.doc.textContent, value);
    assert.equal(editor.state.doc.firstChild!.childCount, 1);
  }
  const code = harness(schema.nodes.doc.create(null, schema.nodes["block.code_block"].create()));
  code.type("$x$");
  assert.equal(code.state.doc.textContent, "$x$");
  const inline = harness(paragraph(schema.text("$x", [schema.marks.code.create()])));
  inline.type("$");
  assert.equal(inline.state.doc.textContent, "$x$");
  const mixedCode = harness(paragraph(schema.text("$"), schema.text("x", [schema.marks.code.create()]), schema.text("y")));
  mixedCode.type("$");
  assert.equal(mixedCode.state.doc.textContent, "$xy$");
  const atom = schema.nodes["inline.internal_link"].create({ target: "page", label: "Page" });
  const mixed = harness(paragraph(schema.text("$x"), atom, schema.text("y")));
  mixed.type("$");
  assert.ok(mixed.state.doc.firstChild!.child(1).eq(atom));
  const line = harness(paragraph(schema.text("$x"), schema.nodes["character.line_break"].create(), schema.text("y")));
  line.type("$");
  assert.equal(line.state.doc.firstChild!.childCount, 3);
  const currency = harness(paragraph(schema.text("$x10")), 3);
  currency.type("$");
  assert.equal(currency.state.doc.textContent, "$x$10");
});

test("Enter after standalone dollars follows math availability and undo restores the trigger", () => {
  for (const { id: variant } of dialects) {
    const allowed = commandEnabled({ version: 1, variant, extensions: {} }, "equation");
    let state = EditorState.create({ schema, doc: paragraph(schema.text("$$")), plugins: [history()] });
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 3)));
    const dispatch = (tr: Parameters<EditorView["dispatch"]>[0]) => { state = state.apply(tr); state.doc.check(); };
    assert.equal(mathBlockEnter(() => allowed)(state, dispatch), allowed, variant);
    if (allowed) {
      assert.equal(editorKind(state.doc.firstChild!), "equation", variant);
      assert.equal(state.doc.textContent, "");
      assert.equal(undo(state, dispatch), true);
    }
    assert.equal(editorKind(state.doc.firstChild!), "paragraph");
    assert.equal(state.doc.textContent, "$$");
  }
});

test("math Enter leaves literal text, selections, code and table cells alone", () => {
  for (const text of ["$", "$$x", "text $$", "\\$$", "$$ "]) {
    const editor = harness(paragraph(schema.text(text)));
    assert.equal(mathBlockEnter(() => true)(editor.state, editor.view.dispatch), false);
    assert.equal(editor.state.doc.textContent, text);
  }
  const inline = harness(paragraph(schema.text("$$", [schema.marks.code.create()])));
  assert.equal(mathBlockEnter(() => true)(inline.state), false);
  const selected = harness(paragraph(schema.text("$$")), 2);
  assert.equal(mathBlockEnter(() => true)(selected.state), false);
  selected.view.dispatch(selected.state.tr.setSelection(TextSelection.create(selected.state.doc, 1, 3)));
  assert.equal(mathBlockEnter(() => true)(selected.state), false);
  for (const source of ["```\n$$\n```", "| Header |\n| --- |\n| $$ |"] ) {
    const doc = parseNative(source, { version: 1, variant: "gfm", extensions: {} });
    let pos = 0;
    doc.descendants((node, at) => { if (node.isTextblock && node.textContent === "$$") pos = at + 3; });
    assert.ok(pos);
    const editor = harness(doc, pos);
    assert.equal(mathBlockEnter(() => true)(editor.state), false);
    assert.ok(editor.state.doc.eq(doc));
  }
});

test("math Enter in a nested list preserves parents, children and siblings", () => {
  const doc = parseEditorMarkdown("- Parent\n  - Target\n    - Child\n  - Following\n- Sibling");
  let pos = 0;
  doc.descendants((node, at) => { if (node.isTextblock && node.textContent === "Target") pos = at + 1; });
  const editor = harness(doc, pos);
  const typed = editor.state.tr.insertText("$$", pos, pos + "Target".length);
  editor.view.dispatch(typed.setSelection(TextSelection.create(typed.doc, pos + 2)));
  assert.equal(mathBlockEnter(() => true)(editor.state, editor.view.dispatch), true);
  editor.state.doc.check();
  const parent = editor.state.doc.firstChild!.firstChild!;
  assert.equal(parent.firstChild!.textContent, "Parent");
  const kinds: string[] = [], texts: string[] = [];
  parent.descendants(node => { if (node.isTextblock) { kinds.push(editorKind(node)); texts.push(node.textContent); } });
  assert.deepEqual(texts, ["Parent", "", "Child", "Following"]);
  assert.ok(kinds.includes("equation"));
  assert.equal(editor.state.doc.firstChild!.lastChild!.textContent, "Sibling");
});

test("the third backtick creates an empty code block immediately and can be undone", () => {
  const editor = harness();
  editor.type("``");
  assert.equal(editorKind(editor.state.doc.firstChild!), "paragraph");
  editor.type("`");
  assert.equal(editorKind(editor.state.doc.firstChild!), "code_block");
  assert.equal(editor.state.doc.textContent, "");
  assert.equal(editor.state.doc.firstChild!.attrs.params, "");
  assert.equal(undoInputRule(editor.state, editor.view.dispatch), true);
  assert.equal(editorKind(editor.state.doc.firstChild!), "paragraph");
  assert.equal(editor.state.doc.textContent, "```");

  const code = harness();
  code.type("```const value = 1;");
  assert.equal(code.state.doc.firstChild!.textContent, "const value = 1;");
  assert.equal(serializeEditorMarkdown(code.state.doc), "```\nconst value = 1;\n```");
  const composed = harness();
  assert.equal(composed.input("```js "), true);
  assert.equal(composed.state.doc.firstChild!.attrs.params, "javascript");
});

test("Markdown code input waits for a space and resolves language aliases", () => {
  for (const [typed, params] of [["", ""], ["js", "javascript"], ["c++", "c++"], ["c#", "c#"], ["vb.net", "vb.net"], ["custom-lang", "custom-lang"]]) {
    const editor = harness(undefined, undefined, undefined, () => "markdown");
    editor.type("```" + typed);
    assert.equal(editorKind(editor.state.doc.firstChild!), "paragraph");
    assert.equal(editor.state.doc.textContent, "```" + typed);
    editor.type(" ");
    assert.equal(editorKind(editor.state.doc.firstChild!), "code_block");
    assert.equal(editor.state.doc.firstChild!.attrs.params, params);
    assert.equal(editor.state.doc.textContent, "");
    assert.equal(undoInputRule(editor.state, editor.view.dispatch), true);
    assert.equal(editor.state.doc.textContent, "```" + typed + " ");
  }
});

test("immediate code fences respect disabled dialects, inline code and line boundaries", () => {
  const disabled = harness(undefined, undefined, command => command !== "backtick_code");
  disabled.type("```");
  assert.equal(editorKind(disabled.state.doc.firstChild!), "paragraph");
  assert.equal(disabled.state.doc.textContent, "```");
  for (const prefix of ["Text ", "\\"]) {
    const editor = harness();
    editor.type(prefix + "```");
    assert.equal(editorKind(editor.state.doc.firstChild!), "paragraph");
    assert.equal(editor.state.doc.textContent, prefix + "```");
  }
  const inline = harness(paragraph(schema.text("``", [schema.marks.code.create()])));
  inline.type("`");
  assert.equal(editorKind(inline.state.doc.firstChild!), "paragraph");
  assert.equal(inline.state.doc.textContent, "```");
});

test("typed Markdown marks remove delimiters without flattening existing linked text", () => {
  const doc = paragraph(
    schema.text("**"),
    schema.text("linked", [
      schema.marks.link.create({ href: "https://example.com" }),
    ]),
    schema.text("*"),
  );
  const editor = harness(doc);
  editor.type("*");
  const text = editor.state.doc.child(0).child(0);
  assert.equal(text.text, "linked");
  assert.deepEqual(
    text.marks.map((mark) => editorKind(mark)),
    ["link", "strong"],
  );
  assert.equal(text.marks[0].attrs.href, "https://example.com");
  assert.equal(
    serializeEditorMarkdown(editor.state.doc),
    "[**linked**](https://example.com)",
  );
  assert.equal(undoInputRule(editor.state, editor.view.dispatch), true);
  assert.equal(editor.state.doc.textContent, "**linked**");
  assert.equal(editorKind(editor.state.doc.child(0).child(1).marks[0]), "link");
});

test("emphasis and strike retain strong marks and page-link atoms", () => {
  for (const delimiter of ["*", "~~"]) {
    const atom = schema.nodes["inline.internal_link"].create({
      target: "中文/🧠",
      label: "计划",
    });
    const doc = paragraph(
      schema.text(delimiter),
      schema.text("Bold ", [schema.marks.strong.create()]),
      atom,
      ...(delimiter.length > 1 ? [schema.text(delimiter.slice(0, -1))] : []),
    );
    const editor = harness(doc);
    editor.type(delimiter.at(-1)!);
    const content = editor.state.doc.child(0);
    assert.equal(content.childCount, 2);
    assert.equal(content.child(0).text, "Bold ");
    assert.equal(
      content.child(0).marks.some((mark) => editorKind(mark) === "strong"),
      true,
    );
    assert.equal(editorKind(content.child(1)), "page_link");
    assert.equal(content.child(1).attrs.target, "中文/🧠");
    assert.equal(
      content
        .child(1)
        .marks.some(
          (mark) => editorKind(mark) === (delimiter === "*" ? "em" : "strike"),
        ),
      true,
    );
  }
});

test("inline code converts only text and leaves atoms intact", () => {
  const editor = harness(paragraph(schema.text("`hello")));
  editor.type("`");
  assert.equal(editor.state.doc.textContent, "hello");
  assert.equal(editorKind(editor.state.doc.child(0).child(0).marks[0]), "code");
  editor.type("plain");
  assert.equal(serializeEditorMarkdown(editor.state.doc), "`hello`plain");
  const atom = schema.nodes["inline.internal_link"].create({ target: "page", label: "Page" });
  const mixed = harness(paragraph(schema.text("`"), atom));
  mixed.type("`");
  assert.equal(editorKind(mixed.state.doc.child(0).child(1)), "page_link");
  assert.equal(mixed.state.doc.child(0).childCount, 3);
  assert.equal(mixed.state.doc.child(0).child(1).marks.length, 0);
});

test("typing a completed link preserves the label's existing strong mark", () => {
  const editor = harness(
    paragraph(
      schema.text("["),
      schema.text("Label", [schema.marks.strong.create()]),
      schema.text("](https://example.com"),
    ),
  );
  editor.type(")");
  const label = editor.state.doc.child(0).child(0);
  assert.equal(label.text, "Label");
  assert.deepEqual(
    label.marks.map((mark) => editorKind(mark)),
    ["link", "strong"],
  );
  assert.equal(label.marks[0].attrs.href, "https://example.com");
});

test("Unicode and emoji wiki syntax becomes one page atom with a stable label", () => {
  const editor = harness();
  editor.type("[[研究/🧠|每日计划]]");
  const atom = editor.state.doc.child(0).child(0);
  assert.equal(editorKind(atom), "page_link");
  assert.deepEqual(
    { ...atom.attrs },
    { kind: "", raw: "", title: "", html: "", config: null, editorRepresentation: "page_link", target: "研究/🧠", label: "每日计划", url: "", syntaxForm: "wiki", labelMode: "custom", nfmAttrs: {} },
  );
  assert.equal(
    serializeEditorMarkdown(editor.state.doc),
    "[[研究/🧠|每日计划]]",
  );
});

test("bullet shortcut then checkbox shortcut produces a task without an extra nested list", () => {
  const editor = harness();
  editor.type("- ");
  assert.equal(editorKind(editor.state.doc.child(0)), "bullet_list");
  editor.type("[ ] Buy milk");
  const list = editor.state.doc.child(0);
  assert.equal(list.childCount, 1);
  assert.equal(list.child(0).attrs.checked, false);
  assert.equal(list.child(0).childCount, 1);
  assert.equal(list.child(0).textContent, "Buy milk");
  assert.equal(serializeEditorMarkdown(editor.state.doc), "- [ ] Buy milk");
});

test("standalone completed todo and nested todo shortcuts preserve surrounding items", () => {
  const standalone = harness();
  standalone.type("[x] Done");
  assert.equal(standalone.state.doc.child(0).child(0).attrs.checked, true);
  const doc = parseEditorMarkdown("- Parent\n  - Child\n- Sibling");
  let childPosition = 0;
  doc.descendants((node, pos) => {
    if (editorKind(node) === "paragraph" && node.textContent === "Child")
      childPosition = pos + 1;
  });
  const nested = harness(doc, childPosition);
  nested.type("[ ] ");
  const parent = nested.state.doc.child(0).child(0);
  assert.equal(parent.attrs.checked, null);
  assert.equal(parent.child(1).child(0).attrs.checked, false);
  assert.equal(parent.child(1).child(0).textContent, "Child");
  assert.equal(nested.state.doc.child(0).child(1).textContent, "Sibling");
});

test("heading shortcut in a list lifts just that item and keeps nested children", () => {
  const doc = parseEditorMarkdown("- Before\n- Target\n  - Child\n- After");
  let position = 0;
  doc.descendants((node, pos) => {
    if (editorKind(node) === "paragraph" && node.textContent === "Target")
      position = pos + 1;
  });
  const editor = harness(doc, position);
  editor.type("## ");
  let heading: PMNode | undefined;
  const texts: string[] = [];
  editor.state.doc.descendants((node) => {
    if (editorKind(node) === "heading") heading = node;
    if (node.isTextblock) texts.push(node.textContent);
  });
  assert.equal(heading?.attrs.level, 2);
  assert.equal(heading?.textContent, "Target");
  assert.deepEqual(texts, ["Before", "Target", "Child", "After"]);
});

test("nested heading shortcut preserves the containing parent item", () => {
  const doc = parseEditorMarkdown(
    "- Parent\n  - Target\n    - Child\n  - Following\n- Sibling",
  );
  let position = 0;
  doc.descendants((node, pos) => {
    if (editorKind(node) === "paragraph" && node.textContent === "Target")
      position = pos + 1;
  });
  const editor = harness(doc, position);
  editor.type("#### ");
  assert.equal(editor.state.doc.childCount, 1);
  const list = editor.state.doc.child(0);
  assert.equal(list.childCount, 2);
  const parent = list.child(0);
  assert.equal(parent.child(0).textContent, "Parent");
  assert.equal(editorKind(parent.child(1)), "nested_block");
  assert.equal(parent.child(1).firstChild!.attrs.level, 4);
  assert.equal(parent.child(1).firstChild!.textContent, "Target");
  assert.equal(parent.child(1).child(1).textContent, "Child");
  assert.equal(parent.child(2).textContent, "Following");
  assert.equal(list.child(1).textContent, "Sibling");
});

test("whole-input composition conversion and literal escaped syntax are safe", () => {
  const composed = harness();
  assert.equal(composed.input("**中文**"), true);
  assert.equal(composed.state.doc.textContent, "中文");
  assert.equal(
    editorKind(composed.state.doc.child(0).child(0).marks[0]),
    "strong",
  );
  const escaped = harness();
  escaped.type("\\**literal**");
  assert.equal(escaped.state.doc.textContent, "\\**literal**");
  assert.equal(escaped.state.doc.child(0).child(0).marks.length, 0);
});

test("unsafe URLs and dividers typed before existing text remain literal", () => {
  const unsafe = harness();
  unsafe.type("[label](javascript:evil)");
  assert.equal(unsafe.state.doc.textContent, "[label](javascript:evil)");
  assert.equal(unsafe.state.doc.child(0).child(0).marks.length, 0);
  const divider = harness(paragraph(schema.text("Keep")), 1);
  divider.type("---");
  assert.equal(editorKind(divider.state.doc.child(0)), "paragraph");
  assert.equal(divider.state.doc.textContent, "---Keep");
});

test("replacement input and composition-end conversion retain the matched inline content", () => {
  const replacement = harness(paragraph(schema.text("**bold*tail")));
  replacement.view.dispatch(
    replacement.state.tr.setSelection(
      TextSelection.create(replacement.state.doc, 8, 12),
    ),
  );
  replacement.type("*");
  assert.equal(replacement.state.doc.textContent, "bold");
  assert.equal(
    editorKind(replacement.state.doc.child(0).child(0).marks[0]),
    "strong",
  );
  const compositionEnd = harness(paragraph(schema.text("**中文**")));
  assert.equal(compositionEnd.input(""), true);
  assert.equal(compositionEnd.state.doc.textContent, "中文");
  assert.equal(
    editorKind(compositionEnd.state.doc.child(0).child(0).marks[0]),
    "strong",
  );
});

test("balanced URL parentheses convert and a page mention never becomes a nested anchor", () => {
  const editor = harness();
  editor.type('[Guide](https://example.com/a_(b) "A guide")');
  assert.equal(editor.state.doc.textContent, "Guide");
  assert.equal(
    editor.state.doc.child(0).child(0).marks[0].attrs.href,
    "https://example.com/a_(b)",
  );
  assert.equal(
    editor.state.doc.child(0).child(0).marks[0].attrs.title,
    "A guide",
  );
  const atom = schema.nodes["inline.internal_link"].create({ target: "page", label: "Page" });
  const mixed = harness(
    paragraph(schema.text("["), atom, schema.text("](https://example.com")),
  );
  mixed.type(")");
  assert.equal(editorKind(mixed.state.doc.child(0).child(1)), "page_link");
  assert.equal(mixed.state.doc.child(0).child(1).marks.length, 0);
});
