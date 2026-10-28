import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { prepareNotionImport } from "../../server/notion-import.js";
import { createVault } from "../../server/vault.js";
import { databaseSourceView } from "../../src/features/databases/database-reference.js";
import { wikiFixture, wikiId, wiki, wikiSource, childDatabase, childSource, otherSource, wikiHome } from "./notion-wiki-fixture.js";

const wait = async () => {};
test("Wiki imports one own source, a deduplicated multi-source child database, editable Home and separate views", async t => {
  const calls: string[] = [], fixture = wikiFixture();
  const plan = await prepareNotionImport({ token: "fixture-test-token", pageId: wiki }, { wait, fetch: async (input, init) => { calls.push(new URL(String(input)).pathname); return fixture(input, init); } });
  const resources = plan.databaseResources!, dbs = Object.values(resources.databases), sources = Object.values(resources.dataSources);
  assert.equal(dbs.length, 2); assert.equal(sources.length, 3); assert.equal(plan.pages.length, 6);
  const parent = dbs.find(db => (db.notion as any).id === wiki)!, child = dbs.find(db => (db.notion as any).id === childDatabase)!;
  assert.equal(parent.dataSourceIds.length, 1); assert.equal(child.dataSourceIds.length, 2);
  assert.ok(parent.notionWiki); assert.equal(child.notionWikiParentSourceId, parent.dataSourceIds[0]);
  assert.equal(calls.filter(url => url === `/v1/databases/${childDatabase}`).length, 1);
  const home = plan.pages.find(page => page.id === parent.homePageId)!;
  assert.equal(home.metadata.parent, parent.pageId);
  assert.ok(home.source.includes("<columns>")); assert.ok(home.source.includes(`url="#page/${child.pageId}"`));
  assert.ok(!home.metadata.databaseId); assert.ok(!home.metadata.dataSourceId); assert.ok(!(home.metadata.notionImport as any).pageId);
  assert.equal(plan.originals.find(file => file.path === `pages/${wiki}.md`)!.data.toString(), wikiHome);
  assert.equal(plan.pages.find(page => page.id === child.pageId)!.metadata.parent, parent.pageId);
  const selected = Object.values(resources.views).find(view => view.name === "Selected projects")!, ds = resources.dataSources[selected.dataSourceId];
  assert.equal((ds.notion as any).id, childSource);
  assert.deepEqual(selected.propertyIds!.map(id => ds.properties.find(field => field.id === id)!.name), ["Count", "Name"]);
  assert.equal(selected.filters?.length, 1); assert.equal(selected.sorts?.length, 1);
  assert.equal(Object.values(resources.views).filter(view => view.dataSourceId === ds.id).length, 2);
  const mine = Object.values(resources.views).find(view => view.name === "Pages I own")!;
  assert.deepEqual(mine.filters, []); assert.ok((mine.importWarnings as string[]).some(message => message.includes("filters")));
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-wiki-"));
  t.after(async () => { assert.equal(path.dirname(temp), path.resolve(os.tmpdir())); assert.ok(path.basename(temp).startsWith("notdown-wiki-")); await fs.rm(temp, { recursive: true, force: true }); });
  const vault = createVault(temp); await vault.importBatch(plan);
  assert.equal((await vault.databases.get(parent.id)).pages.length, 1);
  assert.equal((await vault.databases.get(child.id)).pages.length, 2);
  const snapshot = await vault.databases.get(child.id);
  assert.equal(databaseSourceView(snapshot, `collection://${otherSource.replace(/-/g, "").toUpperCase()}`)?.name, "Tasks");
  assert.equal(databaseSourceView(snapshot, `collection://${wikiSource}`), undefined);
  assert.equal(databaseSourceView(snapshot, `https://example.com/${otherSource}`), undefined);
  const savedHome = await vault.get(home.id);
  await vault.update(home.id, { body: savedHome.body + "\nLocal change" }, savedHome.revision);
  assert.equal((await vault.importBatch(plan)).alreadyImported, true);
  assert.match((await vault.get(home.id)).body, /Local change/);
  assert.equal((await prepareNotionImport({ token: "fixture-test-token", pageId: wiki }, { wait, fetch: wikiFixture() })).id, plan.id);
});

for (const variant of ["notdown", "notion-markdown"] as const) test(`${variant} recovers Home from blocks when Markdown is unavailable`, async () => {
  const plan = await prepareNotionImport({ token: "fixture-test-token", pageId: wiki, variant }, { wait, fetch: wikiFixture({ noMarkdown: true }) });
  const home = plan.pages.find(page => (page.metadata.notionImport as any).resourceType === "wiki-home")!;
  assert.match(home.source, /Knowledge home/); assert.match(home.source, /<todo checked="true">Reviewed<\/todo>/);
  assert.ok(plan.warnings.some(message => message.includes("Home reconstructed")));
});

test("Home fallback retains nested content under an unsupported wrapper exactly once", async () => {
  const fixture = wikiFixture({ noMarkdown: true });
  const outer = { object: "block", id: wikiId(40), type: "unsupported", unsupported: { block_type: "future_container" }, has_children: true };
  const inner = { object: "block", id: wikiId(41), type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: "Nested Home content" } }] } };
  const plan = await prepareNotionImport({ token: "fixture-test-token", pageId: wiki }, { wait, fetch: async (input, init) => {
    const route = new URL(String(input)).pathname;
    if (route === `/v1/blocks/${wikiId(40)}/children`) return Response.json({ results: [inner], has_more: false });
    if (route === `/v1/pages/${wikiId(40)}/markdown`) return Response.json({}, { status: 404 });
    const response = await fixture(input, init);
    if (route === `/v1/blocks/${wiki}/children`) { const result = await response.json(); result.results.push(outer); return Response.json(result); }
    return response;
  } });
  const home = plan.pages.find(page => (page.metadata.notionImport as any).resourceType === "wiki-home")!;
  assert.equal(home.source.split("Nested Home content").length - 1, 1);
  assert.match(home.source, /<unknown/);
});

test("unreadable Home is reported without inventing a blank recovered page; inaccessible child stays remote", async () => {
  const plan = await prepareNotionImport({ token: "fixture-test-token", pageId: wiki }, { wait, fetch: wikiFixture({ noHome: true }) });
  assert.ok(plan.warnings.some(message => message.includes("Home page could not be recovered")));
  assert.ok(!plan.pages.some(page => (page.metadata.notionImport as any).resourceType === "wiki-home"));
  const missing = await prepareNotionImport({ token: "fixture-test-token", pageId: wiki }, { wait, fetch: wikiFixture({ inaccessibleChild: true }) });
  assert.equal(Object.keys(missing.databaseResources!.databases).length, 1);
  assert.ok(missing.pages.some(page => page.source.includes(`https://www.notion.so/${childDatabase}`)));
});

test("a direct data-source import keeps only that source and its views", async () => {
  const plan = await prepareNotionImport({ token: "fixture-test-token", pageId: childSource }, { wait, fetch: wikiFixture() });
  assert.equal(Object.keys(plan.databaseResources!.dataSources).length, 1);
  assert.equal(Object.keys(plan.databaseResources!.views).length, 2);
  assert.equal(plan.pages.length, 2);
  assert.ok(!plan.originals.some(file => file.data.toString().includes(`"id": "${otherSource}"`)));
});

test("excluding descendants keeps Wiki records and Home but leaves child databases remote", async () => {
  const plan = await prepareNotionImport({ token: "fixture-test-token", pageId: wiki, includeChildren: false }, { wait, fetch: wikiFixture() });
  assert.equal(Object.keys(plan.databaseResources!.databases).length, 1);
  assert.equal(Object.keys(plan.databaseResources!.dataSources).length, 1);
  assert.equal(plan.pages.length, 3);
  const home = plan.pages.find(page => (page.metadata.notionImport as any).resourceType === "wiki-home")!;
  assert.ok(home.source.includes(`https://www.notion.so/${childDatabase}`));
  assert.equal(plan.pages.filter(page => page.metadata.title === "Guide").length, 1);
});

test("a linked view shares one source and its records while preserving the canonical owner and raw database", async () => {
  const fixture = wikiFixture(), linked = { object: "view", id: wikiId(26), data_source_id: wikiSource, name: "Linked knowledge", type: "table" };
  const plan = await prepareNotionImport({ token: "fixture-test-token", pageId: wiki }, { wait, fetch: async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === `/v1/views/${linked.id}`) return Response.json(linked);
    const response = await fixture(input, init);
    if (url.pathname === "/v1/views" && url.searchParams.get("database_id") === childDatabase) {
      const result = await response.json(); result.results.push(linked); return Response.json(result);
    }
    return response;
  } });
  const resources = plan.databaseResources!, parent = Object.values(resources.databases).find(db => (db.notion as any).id === wiki)!;
  const child = Object.values(resources.databases).find(db => (db.notion as any).id === childDatabase)!;
  assert.equal(Object.keys(resources.dataSources).length, 3);
  assert.equal(child.dataSourceIds.length, 3);
  assert.equal((child.notion as any).data_sources.length, 2);
  const view = Object.values(resources.views).find(view => view.name === linked.name)!;
  assert.equal(view.dataSourceId, parent.dataSourceIds[0]);
  assert.equal(resources.dataSources[view.dataSourceId].ownerDatabaseId, parent.id);
  const guide = plan.pages.filter(page => page.metadata.title === "Guide");
  assert.equal(guide.length, 1); assert.equal(guide[0].metadata.parent, parent.pageId);
});

test("cyclic Wiki containment and mismatched view responses fail before writing a partial import", async () => {
  const fixture = wikiFixture();
  await assert.rejects(prepareNotionImport({ token: "fixture-test-token", pageId: wiki }, { wait, fetch: async (input, init) => {
    if (new URL(String(input)).pathname === `/v1/data_sources/${childSource}/query`) return Response.json({ results: [{ object: "data_source", id: wikiSource, parent: { database_id: wiki } }], has_more: false });
    return fixture(input, init);
  } }), /cyclic Wiki/);
  await assert.rejects(prepareNotionImport({ token: "fixture-test-token", pageId: wiki }, { wait, fetch: async (input, init) => {
    if (new URL(String(input)).pathname === `/v1/views/${wikiId(22)}`) return Response.json({ object: "view" });
    return fixture(input, init);
  } }), /mismatched view/);
});
