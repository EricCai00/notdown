import test from "node:test";
import assert from "node:assert/strict";
import { prepareNotionImport } from "../../server/notion-import.js";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec.js";
import { notionRoot, notionChild, notionFixture } from "./notion-import-fixture.js";

test("Notion import localizes parsed page blocks, preserves examples and resolves ownership after discovery", async () => {
  const linked = "66666666-6666-4666-8666-666666666666";
  const grandchild = "77777777-7777-4777-8777-777777777777";
  const literal = "88888888-8888-4888-8888-888888888888";
  const url = (id: string) => `https://www.notion.so/${id}`;
  const examples = [
    '```xml', `<page url="${url(literal)}">Code</page>`, '```', '',
    `Inline \`<page url="${url(literal)}">Code</page>\``, '',
    '<future>', `\t<page url="${url(literal)}">Opaque</page>`, '</future>', '',
    `<page url="https://example.com/${literal}">External</page>`, '',
  ].join('\r\n');
  const source = [
    `<page url="${url(grandchild)}">Grandchild reference</page>`, '',
    `<page role="child" url="${url(linked)}">Legacy role is not ownership</page>`, '',
    '<columns>', '\t<column>',
    `\t\t<page future='keep url="literal"' url = '${url(notionChild)}'>Child</page>`,
    '\t</column>', '\t<column>', '\t\tText', '\t</column>', '</columns>', '', examples,
  ].join('\r\n');
  const calls: string[] = [];
  const fixture = notionFixture(calls);
  const plan = await prepareNotionImport({ token: "test-token-example", pageId: notionRoot }, {
    wait: async () => {},
    fetch: async (input, init) => {
      const response = await fixture(input, init);
      const json = await response.json();
      if (json.object === "page_markdown" && json.id === notionRoot) json.markdown = source;
      if (String(input).includes(`/blocks/${notionChild}/children`)) json.results = [
        { id: grandchild, type: "child_page", has_children: false },
      ];
      return Response.json(json, { status: response.status });
    },
  });
  const byNotion = (id: string) => plan.pages.find(p => (p.metadata.notionImport as any).pageId === id)!;
  const parent = byNotion(notionRoot), child = byNotion(notionChild);
  assert.equal(child.metadata.parent, parent.id);
  assert.equal(byNotion(grandchild).metadata.parent, child.id);
  assert.equal(byNotion(linked).metadata.parent, null);
  assert.equal(plan.pages.length, 5);
  assert.ok(!calls.some(call => call.includes(literal)));
  assert.ok(parent.source.endsWith(examples));
  assert.equal(parent.source, source
    .replace(url(grandchild), `#page/${byNotion(grandchild).id}`)
    .replace(url(linked), `#page/${byNotion(linked).id}`)
    .replace(url(notionChild), `#page/${child.id}`));
  assert.equal(plan.originals.find(f => f.path === `pages/${notionRoot}.md`)!.data.toString(), source);
  for (const variant of ["notdown", "notion-markdown"] as const) {
    const config = { version: 1 as const, variant, extensions: {} };
    const doc = parseNative(parent.source, config);
    const types: string[] = [];
    doc.descendants(node => { if (["block.child_page", "block.link_to_page"].includes(node.type.name)) types.push(node.type.name); });
    assert.deepEqual(types, ["block.child_page", "block.child_page", "block.child_page", "block.child_page"]);
    assert.equal(serializeNative(doc, config), parent.source);
  }
});
