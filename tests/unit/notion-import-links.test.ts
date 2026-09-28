import test from "node:test";
import assert from "node:assert/strict";
import { prepareNotionImport } from "../../server/notion-import.js";
import { notionFixture, notionRoot, notionChild, notionSibling } from "./notion-import-fixture.js";

const childPath = `/p/${notionChild.replace(/-/g, "")}?pvs=25`;
const missing = "66666666-6666-4666-8666-666666666666";
const remote = `https://www.notion.so/Title-${notionSibling.replace(/-/g, "")}?pvs=25`;
async function prepare(source: string, variant: "notdown" | "notion-markdown", includeChildren = true) {
  const calls: string[] = [], fixture = notionFixture(calls);
  const plan = await prepareNotionImport({ token: "test-token-example", pageId: notionRoot, variant, includeChildren }, {
    wait: async () => {},
    fetch: async (input, init) => {
      const response = await fixture(input, init), json = await response.json();
      if (json.object === "page_markdown" && json.id === notionRoot) json.markdown = source;
      return Response.json(json, { status: response.status });
    },
  });
  return { plan, calls };
}

for (const variant of ["notdown", "notion-markdown"] as const) {
  test(`${variant} imports relative and absolute inline page links without changing surrounding source`, async () => {
    const protectedSource = [
      '```md', `## [Code](${childPath})`, '```', '',
      '- Nested API code', '\t```md', `[Unindented code body](${childPath})`, '\t```', '',
      `Inline \`[Code](${childPath})\` and $[Math](${childPath})$.`, '',
      `<future>`, `\t[Unknown](${childPath})`, '</future>', '',
      `<callout><future>[Single-line unknown](${childPath})</future></callout>`, '',
      `<mention-page url="${remote}">[Literal label](${childPath})</mention-page>`, '',
      `![Image [label](${childPath})](${childPath})`, '',
      `\\[Escaped](${childPath})`, '',
      `[External](https://example.com${childPath})`, '',
      `[Lookalike](https://notion.so.evil.test${childPath})`, '',
      `[Unrelated relative](/files/${notionChild})`, '',
      `[Fake query page](https://www.notion.so/?id=${notionChild})`, '',
    ].join('\r\n');
    const editable = [
      `## 1. [Python](${childPath})`, '',
      `[**Deep Learning**](<${remote}> "Keep title")`, '',
      '<columns>', '\t<column>', `\t\t- [Nested](${childPath})`, '\t</column>',
      '\t<column>', `\t\t<span color="blue">[Styled](${childPath})</span>`, '\t</column>', '</columns>', '',
      `<callout icon="[Attribute](${childPath})">`, `\t[Callout](${childPath})`, '</callout>', '',
      `Text [Visible](${childPath}) {future="[Attribute](${childPath})"}`, '',
      `| Name | Page |`, '| --- | --- |', `| Child | [Cell](${childPath}) |`, '',
      `<page url="https://www.notion.so/${notionChild}">Child</page>`, '',
    ].join('\r\n');
    const source = editable + protectedSource;
    const { plan, calls } = await prepare(source, variant);
    const root = plan.pages[0], child = plan.pages.find(p => (p.metadata.notionImport as any).pageId === notionChild)!;
    const sibling = plan.pages.find(p => (p.metadata.notionImport as any).pageId === notionSibling)!;
    const expected = editable
      .replaceAll(`](${childPath})`, `](#page/${child.id})`)
      .replaceAll(`Attribute](#page/${child.id})`, `Attribute](${childPath})`)
      .replace(remote, `#page/${sibling.id}`)
      .replace(`https://www.notion.so/${notionChild}`, `#page/${child.id}`) + protectedSource;
    assert.equal(root.source, expected);
    assert.equal(plan.pages.length, 3);
    assert.ok(!calls.some(call => call.includes(missing)));
    assert.equal(plan.originals.find(f => f.path === `pages/${notionRoot}.md`)!.data.toString(), source);
    assert.equal((await prepare(source, variant)).plan.id, plan.id);
  });

  test(`${variant} keeps missing targets and block anchors usable on Notion without fetching link destinations`, async () => {
    const absent = `/p/${missing}?pvs=25`, anchored = `${childPath}#${missing.replace(/-/g, "")}`;
    const source = `[Missing](${absent})\n[Block](${anchored})\n[Remote](${remote})\n`;
    const { plan, calls } = await prepare(source, variant);
    assert.equal(plan.pages[0].source, source.replace(absent, `https://www.notion.so${absent}`).replace(anchored, `https://www.notion.so${anchored}`).replace(remote, `#page/${plan.pages.find(p => (p.metadata.notionImport as any).pageId === notionSibling)!.id}`));
    assert.ok(plan.warnings.some(w => w.includes("block anchors")));
    assert.ok(!calls.some(call => call.includes(missing)));
    const single = await prepare(`[Child](${childPath})\n`, variant, false);
    assert.equal(single.plan.pages.length, 1);
    assert.equal(single.plan.pages[0].source, `[Child](https://www.notion.so${childPath})\n`);
  });
}
