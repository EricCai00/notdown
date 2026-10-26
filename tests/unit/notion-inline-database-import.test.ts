import test from "node:test";
import assert from "node:assert/strict";
import { prepareNotionImport } from "../../server/notion-import.js";
import { parseNotionMarkdown, serializeNotionMarkdown } from "../../src/document/notion-markdown.js";
import { editorKind } from "../../src/document/node-identity.js";
import { inlineRoot, inlineDatabases, inlineSources, inlineUrl, inlineDatabaseSource, inlineDatabaseFixture } from "./notion-inline-database-fixture.js";

async function prepare(source: string, variant: "notdown" | "notion-markdown", includeChildren = true, unavailable = false) {
  const calls: string[] = [], fixture = inlineDatabaseFixture();
  const plan = await prepareNotionImport({ token: "test-token-example", pageId: inlineRoot, variant, includeChildren }, {
    wait: async () => {}, fetch: async (input, init) => {
      const url = new URL(String(input)); calls.push(url.pathname);
      if (unavailable && url.pathname === `/v1/databases/${inlineDatabases[1]}`) return Response.json({}, { status: 404 });
      const response = await fixture(input, init), json = await response.json();
      if (json.object === "page_markdown" && json.id === inlineRoot) json.markdown = source;
      return Response.json(json, { status: response.status });
    },
  });
  return { plan, calls };
}

for (const variant of ["notdown", "notion-markdown"] as const) {
  test(`${variant} localizes both inline databases and preserves their resource identity through the codec`, async () => {
    const { plan, calls } = await prepare(inlineDatabaseSource, variant);
    const root = plan.pages[0], hosts = inlineDatabases.map(id => plan.pages.find(page => (page.metadata.notionImport as any).pageId === id)!);
    assert.equal(plan.pages.length, 5);
    assert.equal(Object.keys(plan.databaseResources!.databases).length, 2);
    for (const view of Object.values(plan.databaseResources!.views)) {
      const source = plan.databaseResources!.dataSources[view.dataSourceId];
      assert.equal(source.properties[0].type, "title");
      assert.deepEqual(view.propertyIds!.map(id => source.properties.find(field => field.id === id)!.name),
        source.title === "Used note apps" ? ["Name", "Since", "Markdown", "Comments"] : ["Name", "Comments"]);
      assert.equal(Object.keys((source.notion as any).properties)[0], "Comments", "preserve the original schema");
    }
    let expected = inlineDatabaseSource;
    hosts.forEach((host, index) => {
      assert.equal(host.metadata.parent, root.id);
      assert.equal(plan.databaseResources!.databases[host.metadata.databaseId as string].pageId, host.id);
      expected = expected.replace(inlineUrl(inlineDatabases[index]), `#page/${host.id}`);
      assert.ok(!calls.includes(`/v1/pages/${inlineDatabases[index]}`), "database tags must not fetch the page endpoint");
    });
    assert.equal(root.source, expected);
    const inspect = (source: string) => {
      const references: any[] = [];
      parseNotionMarkdown(source).descendants(node => { if (editorKind(node) === "database") references.push(node.attrs); });
      assert.deepEqual(references.map(ref => [ref.url, ref.inline, ref.dataSourceUrl]), hosts.map((host, index) => [`#page/${host.id}`, true, `collection://${inlineSources[index]}`]));
    };
    inspect(root.source);
    inspect(serializeNotionMarkdown(parseNotionMarkdown(root.source)));
    assert.equal(plan.originals.find(file => file.path === `pages/${inlineRoot}.md`)!.data.toString(), inlineDatabaseSource);
    assert.equal((await prepare(inlineDatabaseSource, variant)).plan.id, plan.id);
  });

  test(`${variant} rewrites only parsed database URL attributes, preserving nesting, inline false and literal source`, async () => {
    const url = inlineUrl(inlineDatabases[0]);
    const tag = `<database future='url="${url}"' inline='false' url='${url}?v=${inlineDatabases[1]}' data-source-url="collection://${inlineSources[0]}">[Literal title](${url})</database>`;
    const protectedSource = ["```md", tag, "```", "", `Inline \`${tag}\``, "", "<future>", `\t${tag}`, "</future>", "", `<database url="${inlineUrl(inlineRoot)}" inline="true">Ordinary page is not a database</database>`, ""].join("\r\n");
    const nested = ["<columns>", "\t<column>", `\t\t${tag}`, "\t</column>", "\t<column>", "\t\tOther column", "\t</column>", "</columns>", ""].join("\r\n");
    const { plan } = await prepare(nested + protectedSource, variant);
    const host = plan.pages.find(page => (page.metadata.notionImport as any).pageId === inlineDatabases[0])!;
    assert.equal(plan.pages[0].source, nested.replace(`url='${url}?v=${inlineDatabases[1]}'`, `url='#page/${host.id}'`) + protectedSource);
  });

  test(`${variant} retains remote references for excluded or unavailable databases`, async () => {
    const excluded = await prepare(inlineDatabaseSource, variant, false);
    assert.equal(excluded.plan.pages.length, 1);
    assert.equal(excluded.plan.pages[0].source, inlineDatabaseSource);
    assert.ok(!excluded.calls.some(path => path.startsWith("/v1/databases/")));
    const { plan } = await prepare(inlineDatabaseSource, variant, true, true);
    const host = plan.pages.find(page => (page.metadata.notionImport as any).pageId === inlineDatabases[0])!;
    assert.equal(plan.pages[0].source, inlineDatabaseSource.replace(inlineUrl(inlineDatabases[0]), `#page/${host.id}`));
    assert.ok(plan.warnings.some(warning => warning.includes("unavailable") && warning.includes(inlineDatabases[1])));
  });
}
