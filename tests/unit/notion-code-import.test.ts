import test from "node:test";
import assert from "node:assert/strict";
import { hasUnknownNotionCodeLanguage, supplementNotionCodeLanguages } from "../../server/notion-code-import.js";
import { prepareNotionImport } from "../../server/notion-import.js";
import { codeLanguages } from "../../src/editor/code-languages.js";
import { v2Fixture, v2Id, v2Root } from "./notion-v2-fixture.js";

const text = '# Shell 😀\nfor i in $(ls *.pdbqt); do\nname=${i%.*};\necho "$name shen"\ndone';
const block = (language = "shell", content = text, id = "code-1") => ({ object: "block", id, type: "code", code: { language, rich_text: [{ type: "text", text: { content } }] } });
const knownLabels = [...new Set(["", "mermaid", "MeRmAiD", ...codeLanguages.flatMap(language => [language.id, language.label, ...(language.aliases ?? [])])])];
const knownSource = knownLabels.map((label, index) => `\`\`\`${label}\nKnown code ${index}\n\`\`\``).join("\n\n");

test("menu IDs, labels, aliases, empty labels and Mermaid skip language recovery", () => {
  assert.equal(hasUnknownNotionCodeLanguage(knownSource), false);
  assert.equal(hasUnknownNotionCodeLanguage('```markdown\n```shen\n```\n'), false);
  assert.equal(hasUnknownNotionCodeLanguage('`shen` and Shell in prose'), false);
  assert.equal(hasUnknownNotionCodeLanguage('```shen\necho ok\n```'), true);
  assert.equal(hasUnknownNotionCodeLanguage('<callout>\n\t```shen\n\techo ok\n\t```\n</callout>'), true);
});

test("a mixed page recovers only unknown labels and preserves ambiguity with known blocks", () => {
  const source = '```python\nknown body\n```\n\n```shen\nunknown body\n```';
  const result = supplementNotionCodeLanguages(source, [block("shell", "known body"), block("shell", "unknown body", "code-2")]);
  assert.equal(result.source, source.replace("```shen", "```shell"));
  assert.equal(result.restored, 1);
  const duplicate = source.replace("unknown body", "known body");
  const ambiguous = supplementNotionCodeLanguages(duplicate, [block("shell", "known body")]);
  assert.equal(ambiguous.source, duplicate);
  assert.equal(ambiguous.restored, 0);
});

test("verified code languages change only the opening tag, retaining code, unknown attributes and CRLF", () => {
  const source = `Before shen\r\n\r\n\`\`\`shen {future="keep"}\r\n${text.replaceAll("\n", "\r\n")}\r\n\`\`\`\r\n\r\nAfter`;
  const result = supplementNotionCodeLanguages(source, [block()]);
  assert.equal(result.restored, 1);
  assert.equal(result.source, source.replace('```shen {', '```shell {'));
  assert.deepEqual(result.evidence, [{ blockId: "code-1", from: "shen", to: "shell" }]);
});

test("nested fences and longer fences retain literal inner fence examples", () => {
  const source = `<callout>\n\tText\n\n\t\`\`\`shen\n${text.split("\n").map(line => `\t${line}`).join("\n")}\n\t\`\`\`\n</callout>`;
  assert.equal(supplementNotionCodeLanguages(source, [block()]).source, source.replace("```shen", "```shell"));
  const literal = '```shen\necho "shell"\n```';
  const outer = `\`\`\`\`shen\n${literal}\n\`\`\`\``;
  assert.equal(supplementNotionCodeLanguages(outer, [block("shell", literal)]).source, outer.replace("````shen", "````shell"));
});

test("unknown, changed, ambiguous and malformed code remains unchanged without verified identity", () => {
  const source = `\`\`\`shen\n${text}\n\`\`\``;
  for (const blocks of [[], [block("shell", text + " changed")], [block(), block("python", text, "code-2")], [block("shell\n```python")], [{ ...block(), in_trash: true }]]) {
    assert.equal(supplementNotionCodeLanguages(source, blocks).source, source);
  }
  const repeated = source + "\n\n" + source;
  assert.equal(supplementNotionCodeLanguages(repeated, [block()]).source, repeated);
  assert.equal(supplementNotionCodeLanguages("```shen\n```", [block("shell", "")]).restored, 0);
  assert.equal(supplementNotionCodeLanguages(source, [block("shen")]).restored, 0);
  assert.equal(supplementNotionCodeLanguages(source.replace("shen\n", "zsh\n"), [block()]).restored, 0);
  assert.equal(supplementNotionCodeLanguages(source.replace(/```$/, ""), [block()]).restored, 0);
});

for (const variant of ["notdown", "notion-markdown"]) test(`${variant} known languages add zero Block API requests`, async () => {
  const calls: string[] = [], fallback = v2Fixture();
  const transport: typeof fetch = async (input, init) => {
    const url = new URL(String(input)); calls.push(url.pathname);
    assert.ok(!url.pathname.startsWith("/v1/blocks/"), "known languages must not trigger Block API reads");
    if (url.pathname === `/v1/pages/${v2Root}/markdown`) return Response.json({ object: "page_markdown", id: v2Root, markdown: knownSource, truncated: false, unknown_block_ids: [] });
    return fallback(input, init);
  };
  const result = await prepareNotionImport({ token: "test-token-example", pageId: v2Root, variant, includeChildren: false, downloadAssets: false, useDesktopCache: false }, { fetch: transport, wait: async () => {} });
  assert.equal(result.pages[0].source, knownSource);
  assert.equal(calls.length, 2, "only page metadata and page Markdown are needed");
  assert.ok(!result.originals.some(file => file.path.startsWith("code-language-recovery/")));
});

for (const variant of ["notdown", "notion-markdown"]) for (const includeChildren of [false, true]) test(`${variant} unknown language recovery reuses block reads (includeChildren=${includeChildren})`, async () => {
  const source = `\`\`\`shen\n${text}\n\`\`\``;
  const calls: string[] = [], fallback = v2Fixture();
  const transport: typeof fetch = async (input, init) => {
    const url = new URL(String(input)); calls.push(url.pathname);
    if (url.pathname === `/v1/pages/${v2Root}/markdown`) return Response.json({ object: "page_markdown", id: v2Root, markdown: source, truncated: false, unknown_block_ids: [] });
    if (url.pathname === `/v1/blocks/${v2Root}/children`) return Response.json({ results: [{ object: "block", id: v2Id(91), type: "toggle", has_children: true, toggle: {} }], has_more: false, next_cursor: null });
    if (url.pathname === `/v1/blocks/${v2Id(91)}/children`) return Response.json({ results: [block("shell", text, v2Id(92))], has_more: false, next_cursor: null });
    return fallback(input, init);
  };
  const result = await prepareNotionImport({ token: "test-token-example", pageId: v2Root, variant, includeChildren, downloadAssets: false, useDesktopCache: true }, { fetch: transport, wait: async () => {}, readCache: async () => { throw new Error("Code languages must not depend on desktop cache"); } });
  assert.equal(result.pages.length, 1);
  assert.equal(result.pages[0].source, source.replace("```shen", "```shell"));
  assert.equal(result.originals.find(file => file.path === `pages/${v2Root}.md`)!.data.toString(), source);
  assert.ok(result.originals.some(file => file.path === `code-language-recovery/${v2Root}.json`));
  assert.ok(result.warnings.some(message => message.includes("restored 1 code language")));
  assert.ok(calls.includes(`/v1/blocks/${v2Id(91)}/children`));
  assert.equal(calls.filter(call => call.startsWith("/v1/blocks/")).length, 2, "page and container fetched once, including when hierarchy discovery already read them");
});
