import assert from "node:assert/strict";
import test from "node:test";
import { EditorState, TextSelection } from "prosemirror-state";
import { editorSchema as schema } from "../../src/document/editor-schema";
import { codeFenceMatch, codeFenceChoices } from "../../src/editor/code-fence-input";
import { codeBlockInput } from "../../src/editor/editor-input-rules";
import { lastCodeLanguage, rememberCodeLanguage } from "../../src/editor/code-input-preferences";

function stateFor(text: string, code = false) {
  const node = schema.nodes[code ? "block.code_block" : "block.paragraph"].create(null, schema.text(text));
  const state = EditorState.create({ schema, doc: schema.nodes.doc.create(null, node) });
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, text.length + 1)));
}

test("language completion recognizes full fences and ranks exact aliases first", () => {
  for (const query of ["", "py", "c++", "c#", "vb.net", "custom-lang"]) {
    const state = stateFor("```" + query);
    assert.equal(codeFenceMatch(state)?.query, query);
    const match = codeFenceMatch(state)!;
    const tr = codeBlockInput(state, match.from, match.to, query)!;
    tr.doc.check();
    assert.equal(tr.doc.firstChild!.attrs.params, query);
    assert.equal(tr.doc.textContent, "");
  }
  assert.equal(codeFenceChoices("js")[0].id, "javascript");
  assert.equal(codeFenceChoices("c++")[0].id, "c++");
  assert.equal(codeFenceChoices("excel")[0].id, "excel-formula");
  assert.equal(codeFenceChoices("unlisted-language").length, 0);
  for (const text of ["``", "Before ```js", "\\```js", "```js\nrest"]) assert.equal(codeFenceMatch(stateFor(text)), null);
  assert.equal(codeFenceMatch(stateFor("```js", true)), null);
  const middle = stateFor("```js");
  assert.equal(codeFenceMatch(middle.apply(middle.tr.setSelection(TextSelection.create(middle.doc, 4)))), null);
});

test("last language persists explicit choices, allows Plain Text reset, and rejects fence injection", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  } });
  try {
    assert.equal(lastCodeLanguage(), "");
    rememberCodeLanguage("python");
    assert.equal(lastCodeLanguage(), "python");
    rememberCodeLanguage("bad\n```\ntext");
    assert.equal(lastCodeLanguage(), "python");
    rememberCodeLanguage("");
    assert.equal(lastCodeLanguage(), "");
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
