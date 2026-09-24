import test from "node:test";
import assert from "node:assert/strict";
import { codeLanguage, codeLanguageLabel, filterCodeLanguages } from "../../src/editor/code-languages.js";
import { highlightedCodeRanges } from "../../src/editor/code-highlighting.js";
import { EditorState } from "prosemirror-state";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec.js";
import type { SyntaxConfig } from "../../src/markdown-engine/config.js";

const examples: Record<string, string> = {
  actionscript: 'package { public class Hello { public var message:String = "hello"; } }',
  awk: 'BEGIN { FS = "," } /hello/ { print $1 }',
  batch: '@echo off\r\nset "name=hello"\r\necho %name%',
  django: '<h1>{{ title|upper }}</h1>{% if user %}Hello{% endif %}',
  epl: '.版本 2\n.子程序 问好\n.局部变量 名称, 文本型\n名称 ＝ “你好”\n调试输出 (名称)',
  "excel-formula": '=IF($A$1>0, SUM(B2:B9), "empty")',
  octave: '# Octave\nfunction y = square(x)\ny = x.^2;\nendfunction',
  jinja: '<p>{% for item in items %}{{ item }}{% endfor %}</p>',
  lean: '/- outer /- inner -/ still comment -/\r\ntheorem identity (p : Prop) : p → p := by\r\n  intro h\r\n  exact h',
  regex: '^(?<name>[A-Za-z]+)\\s+\\d{2,4}$',
  sed: '# comment\n1,3s#foo\\#bar#baz#g\n/old/d\ny/abc/ABC/',
  sparql: 'PREFIX ex: <https://example.org/>\nSELECT ?name WHERE { ?s ex:name ?name . FILTER(?name != "") }',
  svg: '<svg xmlns="http://www.w3.org/2000/svg"><circle r="8" /></svg>',
  turtle: '@prefix ex: <https://example.org/> .\nex:item ex:name "hello" .',
  vimscript: '" comment\nlet g:name = "hello"\nfunction! Greet()\n  echo g:name\nendfunction',
  wenyan: '吾有一言。曰「「😀 <&>」」。名之曰「甲」。書之。',
  wikitext: "== Heading ==\n'''Bold''' and [[Page|label]] {{Template}}",
};

for (const [language, source] of Object.entries(examples)) {
  test(`${language} highlights original text and survives a fenced edit`, () => {
    const ranges = highlightedCodeRanges(source, language);
    assert(ranges.length > 0, language);
    let end = 0;
    for (const range of ranges) {
      assert(range.from >= end && range.to > range.from && range.to <= source.length);
      assert(!/[\uD800-\uDBFF]$/.test(source.slice(range.from, range.to)), "no split surrogate pair");
      end = range.to;
    }
    const config: SyntaxConfig = { version: 1, variant: "notdown", extensions: {} };
    const body = `\`\`\`${language}\n${source}\n\`\`\`\n`;
    const doc = parseNative(body, config);
    assert.equal(serializeNative(doc, config), body);
    const state = EditorState.create({ doc });
    const saved = serializeNative(state.tr.insertText(" ", 1).doc, config);
    assert.equal(parseNative(saved, config).firstChild!.attrs.params, language);
    assert.equal(parseNative(saved, config).firstChild!.textContent, " " + doc.firstChild!.textContent);
  });
}

test("search crosses groups while SVG, templates and Wolfram keep their own identities", () => {
  assert.deepEqual(filterCodeLanguages("").map(group => group.label), ["Notion", "Custom"]);
  const script = filterCodeLanguages("script");
  assert.deepEqual(script.map(group => group.label), ["Notion", "Custom"]);
  assert(script[0].languages.some(language => language.id === "javascript"));
  assert(script[1].languages.some(language => language.id === "actionscript"));
  for (const alias of ["lean4", "as3", "文言", "octave", "gawk", "cmd", "mediawiki", "jinja2", "dtl", "svg", "ttl", "易语言", "EPL", "rq", "viml", "gsed", "regexp", "xlsx"])
    assert(filterCodeLanguages(alias).some(group => group.label === "Custom"), alias);
  assert.equal(codeLanguageLabel("Mathematica"), "Wolfram Language");
  assert.equal(codeLanguage("wolfram-language"), codeLanguage("mathematica"));
  assert.equal(codeLanguage("svg")?.id, "svg");
  assert.equal(codeLanguage("xml")?.id, "xml");
  assert.notEqual(codeLanguage("jinja2"), codeLanguage("django"));
  assert.deepEqual(filterCodeLanguages("mermaid"), []);
  assert.deepEqual(filterCodeLanguages("no-such-language"), []);
});

test("Makefile stays in Notion and is highlighted without a duplicate Custom entry", () => {
  const groups = filterCodeLanguages("makefile");
  assert.deepEqual(groups.map(group => group.label), ["Notion"]);
  assert.equal(groups[0].languages.length, 1);
  assert(highlightedCodeRanges('all: app\n\t$(CC) -o app main.c\n', "makefile").length > 0);
});

test("EPL colors copied source without reading directives inside strings or comments", () => {
  const source = '.版本 2\n\' .子程序 注释\n调试输出 (“.如果真 😀”, "it\'s text", 真, #换行符)\n.如果真 (真)\n.如果真结束';
  const ranges = highlightedCodeRanges(source, "易语言");
  const texts = (kind: string) => ranges.filter(range => range.className.includes(`pm-code-${kind}`)).map(range => source.slice(range.from, range.to));
  assert.deepEqual(texts("keyword"), [".版本", ".如果真", ".如果真结束"]);
  assert.deepEqual(texts("string"), ['“.如果真 😀”', '"it\'s text"']);
  assert.deepEqual(texts("comment"), ["' .子程序 注释"]);
  assert(texts("function").includes("调试输出"));
});

test("sed handles alternate and escaped separators without swallowing subsequent commands", () => {
  const source = '# comment\ns#foo\\#bar#baz#g\ns/a\\/b/c/g\n2,4d\ny/abc/ABC/';
  const ranges = highlightedCodeRanges(source, "sed");
  const colored = (text: string, kind: string) => {
    const start = source.indexOf(text);
    return ranges.some(range => range.from <= start && range.to >= start + text.length && range.className.includes(`pm-code-${kind}`));
  };
  assert(colored("# comment", "comment"));
  assert(colored("baz", "string"));
  assert(colored("d", "keyword"));
  assert(colored("y", "keyword"));
});

test("regex and Excel formula grammars recognize domain syntax", () => {
  for (const [language, source, needle] of [
    ["regex", '^(?<name>[A-Z]+)\\d{2,4}$', "\\d"],
    ["excel-formula", '=IF($A$1>0,"He said ""yes""",SUM(B2:B9))', "IF"],
  ]) {
    const start = source.indexOf(needle);
    assert(highlightedCodeRanges(source, language).some(range => range.from <= start && range.to >= start + needle.length), language);
  }
});

test("Octave comments and strings do not consume transpose operators or following code", () => {
  const source = '#{\nnot code\n#}\nx = "a # b % c"; y = \'it\'\'s fine\';\ny = A\' + B.\'; # tail\nif x != y\nendif';
  const ranges = highlightedCodeRanges(source, "octave");
  const texts = (kind: string) => ranges.filter(range => range.className.includes(`pm-code-${kind}`)).map(range => source.slice(range.from, range.to));
  assert.deepEqual(texts("string"), ['"a # b % c"', "'it''s fine'"]);
  assert.deepEqual(texts("comment"), ["#{\nnot code\n#}", "# tail"]);
  assert(texts("operator").includes("'"));
  assert(texts("operator").includes(".'"));
  assert(texts("keyword").includes("endif"));
});

test("template hooks preserve HTML, Unicode, comments and literal placeholder-looking text", () => {
  for (const language of ["jinja", "django"]) {
    const source = '<p title="{{ name }}">plain words 😀 {# hidden #}{{ value|upper }} ___DJANGO0___ ___JINJA20___</p>';
    const ranges = highlightedCodeRanges(source, language);
    assert(ranges.some(range => source.slice(range.from, range.to) === "name"));
    assert(ranges.some(range => source.slice(range.from, range.to) === "{# hidden #}" && range.className.includes("pm-code-comment")));
    const start = source.indexOf("plain words");
    assert(!ranges.some(range => range.from <= start && range.to > start), "plain HTML text stays plain");
    assert(ranges.some(range => range.to === source.length), "restored offsets reach the closing tag");
  }
});

test("Lean uses nested comment state and Wenyan colors quoted strings across Unicode", () => {
  const lean = examples.lean;
  const ranges = highlightedCodeRanges(lean, "lean4");
  assert(ranges.some(range => range.from === lean.indexOf("theorem") && range.className.includes("pm-code-keyword")));
  const commentEnd = lean.indexOf("\r\n");
  assert(!ranges.some(range => range.from < commentEnd && range.className.includes("pm-code-keyword")));
  const wenyan = examples.wenyan;
  assert(highlightedCodeRanges(wenyan, "wenyan-lang").some(range =>
    wenyan.slice(range.from, range.to).includes("😀 <&>") && range.className.includes("pm-code-string")));
});
