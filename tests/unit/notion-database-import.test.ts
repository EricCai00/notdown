import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { prepareNotionImport } from "../../server/notion-import.js";
import { createVault } from "../../server/vault.js";

const database = "11111111-1111-4111-8111-111111111111";
const source = "22222222-2222-4222-8222-222222222222";
const first = "33333333-3333-4333-8333-333333333333";
const second = "44444444-4444-4444-8444-444444444444";
const missing = "55555555-5555-4555-8555-555555555555";
const view = "66666666-6666-4666-8666-666666666666";
const parent = "77777777-7777-4777-8777-777777777777";
const rich = (value: string) => [{ plain_text: value }];
const schema = { object: "data_source", id: source, title: rich("Tasks"), properties: {
  Name: { id: "title", type: "title", title: {} },
  Progress: { id: "status", type: "status", status: { options: [{ id: "in-progress", name: "In progress", color: "blue" }] } },
  Count: { id: "count", type: "number", number: {} },
  Done: { id: "done", type: "checkbox", checkbox: {} },
  Due: { id: "date", type: "date", date: {} },
  Related: { id: "r%3Ax", type: "relation", relation: { data_source_id: source } },
  Result: { id: "formula", type: "formula", formula: { expression: "prop(Count) + 1" } },
  Future: { id: "future", type: "future_property", future_property: { preserve: 7 } },
} };
function record(id: string) {
  return { object: "page", id, parent: { type: "data_source_id", data_source_id: source }, properties: {
    Name: { id: "title", type: "title", title: rich(id === first ? "First record" : "Second record") },
    Progress: { id: "status", type: "status", status: { id: "in-progress", name: "In progress" } },
    Count: { id: "count", type: "number", number: 0 },
    Done: { id: "done", type: "checkbox", checkbox: false },
    Due: { id: "date", type: "date", date: { start: "2026-09-27", end: "2026-09-28", time_zone: null } },
    Related: { id: "r%3Ax", type: "relation", relation: [{ id: second }], has_more: id === first },
    Result: { id: "formula", type: "formula", formula: { type: "number", number: 1 } },
    Future: { id: "future", type: "future_property", future_property: { keep: true } },
  } };
}
function fixture(calls: { url: string; method: string; body?: any }[] = [], options: { loop?: boolean; viewsUnavailable?: boolean; incomplete?: boolean } = {}): typeof fetch {
  return async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, "https://api.notion.com");
    const pathname = url.pathname, body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url: pathname + url.search, method: init!.method!, body });
    assert.equal(init?.method, pathname.endsWith("/query") ? "POST" : "GET");
    if (pathname === `/v1/pages/${database}` || pathname === `/v1/pages/${source}` || pathname === `/v1/databases/${source}`) return Response.json({}, { status: 404 });
    if (pathname === `/v1/databases/${database}`) return Response.json({ object: "database", id: database, title: rich("Project"), data_sources: [{ id: source, name: "Tasks" }], future: { untouched: true } });
    if (pathname === `/v1/data_sources/${source}`) return Response.json(schema);
    if (pathname.endsWith("/query")) return Response.json({ object: "list", results: body.start_cursor ? [record(second)] : [record(first)], has_more: !body.start_cursor || options.loop === true, next_cursor: "next query", ...(options.incomplete ? { request_status: { type: "incomplete" } } : {}) });
    if (pathname === "/v1/views") return options.viewsUnavailable ? Response.json({}, { status: 404 }) : Response.json({ results: [{ id: view, object: "view" }], has_more: false, next_cursor: null });
    if (pathname === `/v1/views/${view}`) return Response.json({ id: view, object: "view", type: "board", filter: { unknown: true } });
    if (pathname.includes("/properties/")) {
      assert.ok(pathname.endsWith("/r%3Ax"), "property IDs must be decoded once then URL encoded once");
      return Response.json({ results: [{ type: "relation", relation: { id: url.searchParams.has("start_cursor") ? missing : second } }], has_more: !url.searchParams.has("start_cursor"), next_cursor: "next property" });
    }
    const id = pathname.split("/")[3];
    if (pathname.endsWith("/markdown")) return Response.json({ object: "page_markdown", id, markdown: `Body ${id}\n`, truncated: false, unknown_block_ids: [] });
    if (pathname.startsWith("/v1/pages/")) return Response.json(id === parent ? { object: "page", id, properties: { Name: { type: "title", title: rich("Parent") } } } : record(id));
    if (pathname.endsWith("/children")) return Response.json({ results: id === parent ? [{ id: database, type: "child_database", has_children: false }] : [], has_more: false, next_cursor: null });
    throw new Error(`Unexpected URL ${url}`);
  };
}
const input = { token: "test-token-not-persisted", pageId: database, includeChildren: false };
const wait = async () => {};

test("database import reads paginated records and properties, retains source definitions and maps relations", async t => {
  const calls: { url: string; method: string; body?: any }[] = [];
  const plan = await prepareNotionImport(input, { fetch: fixture(calls), wait });
  assert.equal(plan.pages.length, 3);
  const resources = plan.databaseResources!;
  const ds = Object.values(resources.dataSources)[0];
  const db = Object.values(resources.databases)[0];
  const fields = Object.fromEntries(ds.properties.map(field => [field.name, field]));
  const a = plan.pages.find(page => page.metadata.title === "First record")!;
  const b = plan.pages.find(page => page.metadata.title === "Second record")!;
  const props = a.metadata.properties as any;
  assert.equal(plan.pages[0].metadata.databaseId, db.id);
  assert.equal(a.metadata.dataSourceId, ds.id);
  assert.equal(a.metadata.parent, plan.pages[0].id);
  assert.deepEqual(Object.values(resources.views)[0].rowOrder, [a.id, b.id]);
  assert.equal(a.source, `Body ${first}\n`);
  assert.equal(fields.Name.key, "title");
  assert.equal(props[fields.Count.key], 0);
  assert.equal(props[fields.Done.key], false);
  assert.equal(props[fields.Progress.key], "in-progress");
  assert.deepEqual(props[fields.Related.key], [{ notionPageId: second, pageId: b.id }, { notionPageId: missing, unresolved: true, url: `https://www.notion.so/${missing.replace(/-/g, "")}` }]);
  assert.equal(fields.Result.readOnly, true);
  assert.equal(props[fields.Result.key].snapshot, true);
  assert.equal(props[fields.Future.key].future_property.keep, true);
  assert.deepEqual((db.notion as any).future, { untouched: true });
  assert.equal((db.notionViews as any)[0].type, "board");
  assert.ok(plan.warnings.some(value => value.includes("Local tables show all records")));
  assert.ok(calls.some(call => call.body?.start_cursor === "next query"));
  assert.ok(!JSON.stringify(plan).includes(input.token));
  assert.ok(plan.originals.some(file => file.data.includes(Buffer.from('"future_property"'))));

  const root = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-notion-database-"));
  t.after(async () => { assert.equal(path.dirname(root), path.resolve(os.tmpdir())); await fs.rm(root, { recursive: true, force: true }); });
  const vault = createVault(root);
  const committed = await vault.importBatch(plan);
  const snapshot = await vault.databases.get(db.id);
  assert.equal(snapshot.pages.length, 2);
  assert.deepEqual(snapshot.views[0].rowOrder, [a.id, b.id]);
  assert.ok(snapshot.database.revision);
  assert.equal((await vault.get(a.id)).body, a.source);
  const changed = await vault.databases.updateCell(ds.id, a.id, { propertyId: fields.Count.id, value: 8, baseRevision: (await vault.get(a.id)).revision, schemaRevision: snapshot.dataSources[0].revision });
  assert.equal(changed.properties[fields.Count.key], 8);
  assert.equal((await vault.importBatch(plan)).alreadyImported, true);
  assert.equal((await vault.get(a.id)).properties[fields.Count.key], 8);
  assert.equal(committed.pageIds.length, 3);
});

test("direct data source and descendant database imports share the same editable model", async () => {
  for (const pageId of [source, parent]) {
    const plan = await prepareNotionImport({ ...input, pageId, includeChildren: true }, { fetch: fixture([], { viewsUnavailable: true }), wait });
    assert.equal(Object.keys(plan.databaseResources!.dataSources).length, 1);
    assert.equal(plan.pages.length, pageId === parent ? 4 : 3);
    assert.ok(plan.warnings.some(value => value.includes("views are unavailable")));
    const host = plan.pages.find(page => page.metadata.databaseId)!;
    const recordIndex = plan.pages.findIndex(page => page.metadata.dataSourceId);
    assert.ok(plan.pages.indexOf(host) < recordIndex, "host is committed before its records");
  }
});

test("database queries never prepare a silently truncated or nonadvancing snapshot", async () => {
  for (const options of [{ loop: true }, { incomplete: true }]) {
    await assert.rejects(prepareNotionImport(input, { fetch: fixture([], options), wait }), /pagination did not advance|incomplete database query/);
  }
});

test("paginated title values and renamed record properties retain their stable field binding", async () => {
  const base = fixture();
  const plan = await prepareNotionImport(input, { wait, fetch: async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === `/v1/pages/${first}/properties/title`) return Response.json({
      results: [{ type: "title", title: { plain_text: url.searchParams.has("start_cursor") ? "complete" : "Fully " } }],
      has_more: !url.searchParams.has("start_cursor"), next_cursor: "next title",
    });
    const response = await base(input, init), json = await response.json();
    for (const page of json.results ?? []) if (page.object === "page" && page.id === first) {
      page.properties.Name.title = Array.from({ length: 25 }, () => ({ plain_text: "Truncated" }));
      page.properties.RenamedCount = page.properties.Count;
      delete page.properties.Count;
    }
    return Response.json(json, { status: response.status });
  } });
  const page = plan.pages.find(page => (page.metadata.notionImport as any).pageId === first)!;
  const field = Object.values(plan.databaseResources!.dataSources)[0].properties.find(field => field.name === "Count")!;
  assert.equal(page.metadata.title, "Fully complete");
  assert.equal((page.metadata.properties as any)[field.key], 0);
  assert.ok(plan.originals.some(file => file.data.includes(Buffer.from('"next title"'))));
});
