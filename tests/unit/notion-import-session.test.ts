import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { NotionImportSession } from "../../server/notion-import-session.js";
import { prepareNotionImport } from "../../server/notion-import.js";
import { notionFixture, notionRoot } from "./notion-import-fixture.js";
import { largeNotionFixture, largeNotionRoot, largeNotionId } from "./notion-large-import-fixture.js";

const input = { token: "test-secret-not-saved", pageId: notionRoot, downloadAssets: false };
const limits = { pages: 1, requests: 2, milliseconds: 60_000, idleMs: 60_000 };

test("suspended batches preserve exact requests, pagination, hierarchy, links and batch identity", async t => {
  const expectedCalls: string[] = [], actualCalls: string[] = [];
  const expected = await prepareNotionImport(input, { fetch: notionFixture(expectedCalls), wait: async () => {} });
  const session = new NotionImportSession(input, { fetch: notionFixture(actualCalls), wait: async () => {} }, limits);
  t.after(() => session.cancel());
  let result = await session.read(() => {}), batches = 0, previousRequests = 0;
  while ("continuationId" in result) {
    assert.equal(result.continuationId, session.id);
    assert.ok(!JSON.stringify(result).includes(input.token));
    assert.ok((result.progress.requestCount ?? 0) - previousRequests <= 2);
    previousRequests = result.progress.requestCount ?? 0;
    const stopped = actualCalls.length;
    await delay(5);
    assert.equal(actualCalls.length, stopped, "paused traversal must make no requests");
    assert.ok(++batches < 50);
    result = await session.read(() => {});
  }
  assert.ok(batches > 3);
  assert.deepEqual(actualCalls, expectedCalls);
  assert.deepEqual(result, expected);
});

test("large sessions cross 500 pages, 1,500 requests and 20 MiB without truncating forward links or archives", async t => {
  const calls: string[] = [];
  const session = new NotionImportSession({ ...input, pageId: largeNotionRoot }, { fetch: largeNotionFixture(1201, 20 * 1024, calls), wait: async () => {} });
  t.after(() => session.cancel());
  let result = await session.read(() => {}), batches = 0;
  while ("continuationId" in result) { assert.ok(++batches < 100); result = await session.read(() => {}); }
  assert.equal(result.pages.length, 1201);
  assert.ok(calls.length > 1500);
  assert.equal(calls.length, new Set(calls).size);
  assert.ok(result.originals.reduce((sum, item) => sum + item.data.length, 0) > 20 * 1024 * 1024);
  const last = result.pages.find(page => page.path.includes(largeNotionId(1200)))!;
  assert.ok(result.pages[0].source.includes(`#page/${last.id}`));
  assert.equal(result.pages.filter(page => page.metadata.parent === result.pages[0].id).length, 1200);
});

test("legacy previews remain bounded and large sessions still reject oversized individual responses and invalid budgets", async t => {
  await assert.rejects(prepareNotionImport({ ...input, pageId: largeNotionRoot }, { fetch: largeNotionFixture(), wait: async () => {} }), /500 pages/);
  const oversized = new NotionImportSession(input, { fetch: async () => new Response(Buffer.alloc(20 * 1024 * 1024 + 1)), wait: async () => {} });
  t.after(() => oversized.cancel());
  await assert.rejects(oversized.read(() => {}), /single Notion response exceeds 20 MiB/);
  const invalid = new NotionImportSession({ ...input, snapshotMiB: 999999 }, { fetch: async () => { throw new Error("Should not request content"); } });
  t.after(() => invalid.cancel());
  await assert.rejects(invalid.read(() => {}), /snapshot budget/);
  const full = new NotionImportSession({ ...input, pageId: largeNotionRoot, snapshotMiB: 20 }, { fetch: largeNotionFixture(601, 40 * 1024), wait: async () => {} });
  t.after(() => full.cancel());
  await assert.rejects((async () => { while ("continuationId" in await full.read(() => {})) { /* finish batches */ } })(), /20 MiB snapshot budget/);
});

test("large sessions copy more than 500 distinct attachments within their snapshot budget", async t => {
  const fixture = largeNotionFixture(1);
  const markdown = Array.from({ length: 501 }, (_, i) => `![Asset ${i}](https://example.com/${i}.png)`).join("\n\n");
  let reads = 0;
  const session = new NotionImportSession({ ...input, pageId: largeNotionRoot, downloadAssets: true }, {
    wait: async () => {},
    fetch: (url, init) => String(url).includes("/markdown?")
      ? Promise.resolve(Response.json({ object: "page_markdown", id: largeNotionRoot, markdown, truncated: false, unknown_block_ids: [] }))
      : fixture(url, init),
    readAsset: async url => { reads++; return { data: Buffer.from(url), contentType: "image/png" }; },
  });
  t.after(() => session.cancel());
  let result = await session.read(() => {});
  while ("continuationId" in result) result = await session.read(() => {});
  assert.equal(reads, 501);
  assert.equal(result.assets.length, 501);
  assert.ok(!result.pages[0].source.includes("https://example.com/"));
  assert.ok(!result.warnings.some(warning => warning.includes("could not be saved")));
});

test("an interrupted continuation retries only that cursor and never replays earlier reads", async t => {
  const calls: string[] = [], fixture = notionFixture(calls);
  let failed = false, failures = 0;
  const session = new NotionImportSession(input, { wait: async () => {}, fetch: async (url, init) => {
    if (!failed && String(url).includes("start_cursor=")) { failed = true; failures++; throw new Error("private-token-and-URL"); }
    return fixture(url, init);
  } });
  t.after(() => session.cancel());
  const paused = await session.read(() => {});
  assert.ok("continuationId" in paused);
  assert.match(paused.error!, /Could not connect/);
  assert.ok(!paused.error!.includes("private-token"));
  const before = calls.slice();
  const complete = await session.read(() => {});
  assert.ok(!("continuationId" in complete));
  assert.equal(complete.pages.length, 3);
  assert.equal(failures, 1);
  for (const endpoint of before) assert.equal(calls.filter(value => value === endpoint).length, before.filter(value => value === endpoint).length);
  const expectedCalls: string[] = [];
  await prepareNotionImport(input, { fetch: notionFixture(expectedCalls), wait: async () => {} });
  assert.deepEqual(calls, expectedCalls);
});

test("a long rate-limit wait is handed to automatic continuation without losing the pending read", async t => {
  const fixture = notionFixture(); let limited = false;
  const session = new NotionImportSession(input, { wait: async () => {}, fetch: async (url, init) => {
    if (!limited) { limited = true; return new Response(null, { status: 429, headers: { "Retry-After": "60" } }); }
    return fixture(url, init);
  } });
  t.after(() => session.cancel());
  const paused = await session.read(() => {});
  assert.ok("continuationId" in paused);
  assert.match(paused.error!, /429/); assert.equal(paused.retryAfterMs, 60_000);
  const complete = await session.read(() => {});
  assert.ok(!("continuationId" in complete)); assert.equal(complete.pages.length, 3);
});

test("cancellation, idle expiry and overlapping reads cannot restart or duplicate a traversal", async t => {
  const calls: string[] = [];
  const session = new NotionImportSession(input, { fetch: notionFixture(calls), wait: async () => {} }, { ...limits, idleMs: 30 });
  t.after(() => session.cancel());
  const first = session.read(() => {});
  await assert.rejects(session.read(() => {}), /already being read/);
  assert.ok("continuationId" in await first);
  const count = calls.length;
  await delay(60);
  await assert.rejects(session.read(() => {}), /expired/);
  assert.equal(calls.length, count);
  session.cancel();
  await assert.rejects(session.read(() => {}), /expired/);
});

test("idle expiry never cancels an active batch, but still expires a paused traversal", async t => {
  const fixture = notionFixture();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let first = true;
  const session = new NotionImportSession(input, { wait: async () => {}, fetch: async (url, init) => {
    if (first) { first = false; await gate; }
    return fixture(url, init);
  } }, { ...limits, idleMs: 20 });
  t.after(() => { release(); session.cancel(); });
  const active = session.read(() => {});
  await delay(60); release();
  assert.ok("continuationId" in await active, "an active batch must outlive the idle interval");
  await delay(60);
  await assert.rejects(session.read(() => {}), /expired/);
});

test("a 384-page tree completes in page batches without losing descendants or rereading requests", async t => {
  const id = (index: number) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(index).padStart(12, "0")}`;
  const urls: string[] = [];
  const session = new NotionImportSession({ ...input, pageId: id(0) }, { wait: async () => {}, fetch: async url => {
    const parsed = new URL(String(url)); urls.push(parsed.pathname + parsed.search);
    const pageId = parsed.pathname.split("/")[3];
    if (parsed.pathname.endsWith("/markdown")) return Response.json({ object: "page_markdown", id: pageId, markdown: "Page\n", truncated: false, unknown_block_ids: [] });
    if (parsed.pathname.startsWith("/v1/pages/")) return Response.json({ object: "page", id: pageId, properties: {} });
    const offset = Number(parsed.searchParams.get("start_cursor") ?? 1);
    return Response.json({ results: pageId === id(0) ? Array.from({ length: Math.min(100, 384 - offset) }, (_, i) => ({ object: "block", id: id(offset + i), type: "child_page", has_children: false })) : [], has_more: pageId === id(0) && offset + 100 < 384, next_cursor: String(offset + 100) });
  } });
  t.after(() => session.cancel());
  let result = await session.read(() => {}), batches = 0;
  while ("continuationId" in result) { assert.ok(++batches < 50); result = await session.read(() => {}); }
  assert.ok(batches >= 15);
  assert.equal(result.pages.length, 384);
  assert.equal(new Set(urls).size, urls.length);
  assert.equal(result.pages.filter(page => page.metadata.parent === result.pages[0].id).length, 383);
});
