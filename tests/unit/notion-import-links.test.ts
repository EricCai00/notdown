import test from "node:test";
import assert from "node:assert/strict";
import { prepareNotionImport } from "../../server/notion-import.js";
import { notionFixture, notionRoot, notionChild, notionSibling } from "./notion-import-fixture.js";
import { stablePageUuid } from "../../src/vault/page-id.js";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec.js";

const childPath = `/p/${notionChild.replace(/-/g, "")}?pvs=25`;
const missing = "66666666-6666-4666-8666-666666666666";
const remote = `https://www.notion.so/Title-${notionSibling.replace(/-/g, "")}?pvs=25`;
async function prepare(source: string, variant: "notdown" | "notion-markdown", includeChildren = true, existingPages?: { id: string; pageId: string }[]) {
  const calls: string[] = [], fixture = notionFixture(calls);
  const plan = await prepareNotionImport({ token: "test-token-example", pageId: notionRoot, variant, includeChildren }, {
    wait: async () => {},
    existingPages,
    fetch: async (input, init) => {
      const response = await fixture(input, init), json = await response.json();
      if (json.object === "page_markdown" && json.id === notionRoot) json.markdown = source;
      return Response.json(json, { status: response.status });
    },
  });
  return { plan, calls };
}

for (const variant of ["notdown", "notion-markdown"] as const) {
  test(`${variant} localizes both mention carriers and preserves labels, examples and unknown attributes`, async () => {
    const protectedSource = [
      '```xml', `<mention-page url="${remote}">Code</mention-page>`, '```',
      `Inline \`<mention-page url="${remote}">Code</mention-page>\``,
      `<future><mention-page url="${remote}">Opaque</mention-page></future>`,
      `\\<mention-page url="${remote}">Escaped</mention-page>`,
      `<mention-user url="${remote}">User</mention-user>`,
      `<mention type="agent" url="${remote}">Agent</mention>`,
      `<mention-page url="https://example.com/${notionSibling}">External</mention-page>`,
      `<mention-page url="${remote}">Unclosed`,
    ].join('\r\n');
    const editable = [
      `Text <mention-page future='keep url="literal"' url = '${remote}'>[Literal](${childPath}) &amp; label</mention-page>.`, '',
      `<mention url="${remote}"/> and <mention-page url="${childPath}"/>`, '',
      `<callout>`, `\t<mention-page url="${remote}">Nested</mention-page>`, '</callout>', '',
      '| Page |', '| --- |', `| <mention-page url="${remote}">Cell</mention-page> |`, '',
    ].join('\r\n');
    const { plan } = await prepare(editable + protectedSource, variant);
    const child = plan.pages.find(p => (p.metadata.notionImport as any).pageId === notionChild)!;
    const sibling = plan.pages.find(p => (p.metadata.notionImport as any).pageId === notionSibling)!;
    const expected = editable.replaceAll(remote, `#page/${sibling.id}`).replace(`url="${childPath}"`, `url="#page/${child.id}"`) + protectedSource;
    assert.equal(plan.pages[0].source, expected);
    const config = plan.pages[0].metadata.syntax as any;
    const doc = parseNative(expected, config);
    doc.check();
    assert.equal(serializeNative(doc, config), expected);
  });

  test(`${variant} resolves unique prior imports, keeps missing and ambiguous targets remote, and never follows mentions`, async () => {
    const local = stablePageUuid("prior-import-child"), other = stablePageUuid("other-copy");
    const missingUrl = `https://www.notion.so/${missing}`;
    const source = `<mention-page url="${childPath}">Child</mention-page>\n\n<mention url="${remote}">Sibling</mention>\n\n<page-link url="${missingUrl}">Missing</page-link>\n\n[Child](${childPath})\n`;
    const existingPages = [{ id: local, pageId: notionChild.replace(/-/g, "").toUpperCase() }];
    const { plan, calls } = await prepare(source, variant, false, existingPages);
    assert.equal(plan.pages.length, 1);
    assert.equal(plan.pages[0].source, source.replaceAll(childPath, `#page/${local}`));
    assert.ok(plan.warnings.some(w => w.includes(missing) && w.includes("not imported")));
    assert.ok(plan.warnings.some(w => w.includes(notionSibling) && w.includes("not imported")));
    assert.ok(calls.every(call => call.startsWith(`/v1/pages/${notionRoot}`)));
    const withChildren = await prepare(source, variant);
    assert.equal(withChildren.plan.pages.length, 3);
    assert.ok(!withChildren.calls.some(call => call.includes(missing)));
    const repeated = await prepare(source, variant, false, [...existingPages, { id: plan.pages[0].id, pageId: notionRoot }, { id: other, pageId: missing.replace(/^6/, "7") }]);
    assert.equal(repeated.plan.id, plan.id);
    const changed = await prepare(source, variant, false, [{ id: other, pageId: notionChild }]);
    assert.notEqual(changed.plan.id, plan.id);
    const ambiguous = await prepare(source, variant, false, [...existingPages, { id: other, pageId: notionChild }]);
    assert.ok(!ambiguous.plan.pages[0].source.includes(`#page/${local}`));
    assert.ok(ambiguous.plan.pages[0].source.includes(`url="https://www.notion.so${childPath}"`));
    assert.ok(ambiguous.plan.warnings.some(w => w.includes(notionChild) && w.includes("multiple existing local copies")));
    const sameBatch = await prepare(source, variant, true, [...existingPages, { id: other, pageId: notionChild }]);
    const child = sameBatch.plan.pages.find(p => (p.metadata.notionImport as any).pageId === notionChild)!;
    assert.ok(sameBatch.plan.pages[0].source.includes(`url="#page/${child.id}"`));
    assert.equal(sameBatch.plan.id, withChildren.plan.id);
  });

  test(`${variant} mention anchors stay remote even when the target has a local copy`, async () => {
    const anchored = `${childPath}#${missing.replace(/-/g, "")}`;
    const source = `<mention-page url="${anchored}">Block</mention-page>\n\n<mention url="${remote}#${missing}">Other block</mention>\n`;
    const { plan } = await prepare(source, variant);
    assert.equal(plan.pages[0].source, source.replace(anchored, `https://www.notion.so${anchored}`));
    assert.ok(plan.warnings.some(w => w.includes("block anchors")));
  });

  test(`${variant} does not convert an external database carrier into an ordinary local page`, async () => {
    const source = `<database url="${remote}" inline="true"/>\n`;
    const { plan } = await prepare(source, variant, false, [{ id: stablePageUuid("ordinary-page"), pageId: notionSibling }]);
    assert.equal(plan.pages[0].source, source);
    assert.ok(!plan.warnings.some(w => w.includes(notionSibling) && w.includes("multiple existing local copies")));
  });

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
      .replace(`https://www.notion.so/${notionChild}`, `#page/${child.id}`) + protectedSource.replace(remote, `#page/${sibling.id}`);
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
