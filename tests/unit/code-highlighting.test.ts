import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "prosemirror-state";
import { codeLanguages, codeLanguageGroups, codeLanguage, codeLanguageLabel } from "../../src/editor/code-languages.js";
import { codeGrammar, hasCodeHighlighter, codeHighlighting, highlightedCodeRanges, codeHighlightLimit } from "../../src/editor/code-highlighting.js";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec.js";
import type { SyntaxConfig } from "../../src/markdown-engine/config.js";

test("the Notion and Custom menu entries all have a highlighter or intentional plain-text mode", () => {
  assert.deepEqual(codeLanguageGroups.map(group => [group.label, group.languages.length]), [["Notion", 87], ["Custom", 17]]);
  assert.equal(codeLanguages.length, 104);
  assert.equal(new Set(codeLanguages.map(language => language.id)).size, 104);
  assert(!codeLanguages.some(language => language.id === "mermaid"));
  assert.deepEqual(codeLanguages.filter(language => !language.grammar).map(language => language.label), ["ASCII Art", "Plain Text"]);
  for (const language of codeLanguages) {
    assert.equal(hasCodeHighlighter(language.id), !!language.grammar, language.label);
    assert.equal(codeLanguage(language.label), language);
    for (const alias of language.aliases ?? []) assert.equal(codeLanguage(alias), language, alias);
  }
});

// Exercise the formerly missing grammars with real syntax, rather than just registration.
const samples: Record<string, string> = {
  agda: "module Main where\ndata Bool : Set where true false : Bool",
  assembly: "section .text\nmov eax, 42",
  bnf: '<number> ::= "0" | "1"',
  dhall: "let answer = 42 in answer",
  ebnf: 'digit = "0" | "1" ;',
  hcl: 'resource "aws_instance" "web" { ami = "abc" }',
  idris: "module Main\nanswer : Nat\nanswer = 42",
  llvm: "define i32 @main() { ret i32 0 }",
  mathematica: "Plot[Sin[x], {x, 0, Pi}]",
  "notion-formula": 'if(prop("Done"), true, 42)',
  purescript: "module Main where\nanswer :: Int\nanswer = 42",
  smalltalk: "true ifTrue: [Transcript show: 'hello'].",
  solidity: "pragma solidity ^0.8.0; contract Counter { uint value = 1; }",
  toml: '[package]\nname = "hello"\nversion = 1',
  abap: "DATA answer TYPE i VALUE 42.",
  arduino: "void setup() { pinMode(13, OUTPUT); }",
  basic: '10 PRINT "Hello"',
  clojure: "(def answer 42)",
  coffeescript: "square = (x) -> x * x",
  dart: "void main() { print('hello'); }",
  elixir: "defmodule Main do\n def answer, do: 42\nend",
  elm: "module Main exposing (..)\nanswer = 42",
  erlang: "-module(main).\nanswer() -> 42.",
  "f#": "let answer = 42",
  flow: "const answer: number = 42;",
  fortran: "program hello\ninteger :: answer = 42\nend program hello",
  gherkin: "Feature: Hello\n Scenario: World\n Given a value",
  glsl: "uniform float time; void main() { gl_Position = vec4(1.0); }",
  groovy: 'def answer = "hello"',
  haskell: "module Main where\nanswer :: Int\nanswer = 42",
  julia: "function answer()\n return 42\nend",
  latex: "\\section{Hello} $x^2$",
  lisp: "(defun answer () 42)",
  livescript: "square = (x) -> x * x",
  matlab: "function y = square(x)\ny = x.^2;\nend",
  nix: 'let answer = 42; in { inherit answer; }',
  ocaml: "let answer = 42;;",
  pascal: "program Hello; begin writeln('Hello'); end.",
  racket: "#lang racket\n(define answer 42)",
  reason: "let answer = 42;",
  rocq: "Theorem identity : forall P : Prop, P -> P. Proof. auto. Qed.",
  sass: "$color: red\nbody\n  color: $color",
  scala: "object Main { val answer: Int = 42 }",
  scheme: "(define answer 42)",
  verilog: "module main; reg answer = 1; endmodule",
  vhdl: "entity main is port (a : in bit); end main;",
};

for (const [language, source] of Object.entries(samples)) {
  test(`colors ${language} syntax with valid original-text offsets`, () => {
    const ranges = highlightedCodeRanges(source, language);
    assert(ranges.some(range => !range.className.endsWith("pm-code-punctuation")), language);
    let end = 0;
    for (const range of ranges) {
      assert(range.from >= end && range.to > range.from && range.to <= source.length);
      assert.match(range.className, /^pm-code-token(?: pm-code-[a-z0-9-]+)+$/);
      end = range.to;
    }
  });
}

test("formula strings, comments, operators and functions keep their lexical boundaries", () => {
  const source = '/* prop("fake") */ lets(x, "😀 <&> \\"quoted\\" /* text */", prop("完成") and true)';
  const ranges = highlightedCodeRanges(source, "Notion Formula");
  const texts = (kind: string) => ranges.filter(r => r.className.includes(`pm-code-${kind}`)).map(r => source.slice(r.from, r.to));
  assert.deepEqual(texts("comment"), ['/* prop("fake") */']);
  assert.deepEqual(texts("string"), ['"😀 <&> \\"quoted\\" /* text */"', '"完成"']);
  assert.deepEqual(texts("function"), ["prop"]);
  assert.deepEqual(texts("operator"), ["and"]);
});

test("plain text, ASCII art, diagrams, unknown names and large blocks do not receive tokens", () => {
  for (const language of ["", "text", "Plain Text", "ASCII Art", "ascii-art", "mermaid", "unknown-future-language"])
    assert.deepEqual(highlightedCodeRanges('const value = "<&😀>"', language), [], language);
  assert.deepEqual(highlightedCodeRanges("x".repeat(codeHighlightLimit + 1), "javascript"), []);
  assert.equal(codeLanguageLabel(" CSharp "), "C#");
  assert.equal(codeLanguageLabel("unknown-future-language"), "unknown-future-language");
  for (const name of ["js", "tsx", "dockerfile", "coq", "vbnet", "yml", "ini", "python-repl"])
    assert(codeGrammar(name), name);
});

test("highlighting and editing preserve fence names, Unicode and unknown attributes through Markdown", () => {
  const config: SyntaxConfig = { version: 1, variant: "notdown", extensions: {} };
  for (const language of ["notion-formula", "Notion Formula", "ASCII Art", "visual basic", "CSharp", "future-language"] ) {
    const source = '```' + language + ' {caption="Example" future="keep"}\nprop("😀 <&> 名称")\n```\n';
    const doc = parseNative(source, config);
    const original = doc.toJSON();
    const state = EditorState.create({ doc, plugins: [codeHighlighting()] });
    assert.deepEqual(state.doc.toJSON(), original);
    assert.equal(serializeNative(state.doc, config), source);
    const edited = state.apply(state.tr.insertText("!", 1));
    const saved = serializeNative(edited.doc, config);
    assert(saved.includes('future="keep"'));
    const reopened = parseNative(saved, config);
    assert.equal(reopened.firstChild!.attrs.params, language);
    assert.equal(reopened.firstChild!.textContent, '!prop("😀 <&> 名称")');
  }
});

test("Mermaid still uses the existing diagram path and survives a disabled diagram extension", () => {
  const source = "```mermaid\nflowchart LR\nA-->B\n```\n";
  const config: SyntaxConfig = { version: 1, variant: "notdown", extensions: {} };
  const diagram = parseNative(source, config);
  assert.equal(diagram.firstChild!.type.name, "syntax_block");
  assert.equal(diagram.firstChild!.attrs.kind, "diagram");
  assert.equal(serializeNative(diagram, config), source);
  const off = { ...config, extensions: { diagrams: false } };
  const code = parseNative(source, off);
  assert.equal(code.firstChild!.type.name, "code_block");
  assert.equal(serializeNative(code, off), source);
});
