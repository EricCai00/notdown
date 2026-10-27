import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { readNotionDesktopCache, supplementNotionDates, cachedReminder, type CachedNotionBlock } from "../../server/notion-desktop-cache.js";
import { prepareNotionImport } from "../../server/notion-import.js";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec.js";

const page = "c0000000-0000-4000-8000-000000000001", id = "c0000000-0000-4000-8000-000000000002";
const date = { type: "datetime", start_date: "2026-10-24", start_time: "09:00", time_zone: "America/Los_Angeles", date_format: "relative", reminder: { unit: "day", value: 0, time: "09:00", defaultTimeZone: "America/Los_Angeles" } };
const properties = (d: object) => ({ title: [["‣", [["d", d]]]] });
const cached = (d: object = date): CachedNotionBlock => ({ id, type: "text", version: 117, lastEdited: Date.parse("2026-10-26T15:53:59.832Z"), properties: properties(d) });
const block = () => ({ object: "block", id, type: "paragraph", last_edited_time: "2026-10-26T15:53:00.000Z", paragraph: { rich_text: [{ type: "mention", mention: { type: "date", date: { start: "2026-10-24T09:00:00.000-07:00", end: null } } }] } });
const source = '<date start="2026-10-24" start-time="09:00" time-zone="America/Los_Angeles" custom="preserve"/>';

test("read-only SQLite snapshot is account-scoped, live-only and never exports other records", async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-cache-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, "notion.db"), db = new DatabaseSync(file);
  db.exec("CREATE TABLE block(id TEXT,meta_user_id TEXT,space_id TEXT,alive INTEGER,type TEXT,version REAL,last_edited_time REAL,properties TEXT)");
  const insert = db.prepare("INSERT INTO block VALUES(?,?,?,?,?,?,?,?)");
  insert.run(page, "owner", "space", 1, "page", 1, 0, "{}");
  insert.run(id, "owner", "space", 1, "text", 117, cached().lastEdited, JSON.stringify(properties(date)));
  insert.run(id, "other", "space", 1, "text", 3, 0, '{"secret":"must not export"}');
  const deleted = "c0000000-0000-4000-8000-000000000003", otherSpace = "c0000000-0000-4000-8000-000000000004";
  insert.run(deleted, "owner", "space", 0, "text", 3, 0, "{}");
  insert.run(otherSpace, "owner", "different-space", 1, "text", 3, 0, "{}");
  db.close();
  const before = await fs.readFile(file);
  const result = await readNotionDesktopCache(page, [id, deleted, otherSpace], file);
  assert.deepEqual(result.blocks, [cached()]);
  assert.deepEqual(await fs.readFile(file), before);
  assert.equal(JSON.stringify(result).includes("secret"), false);
  const writer = new DatabaseSync(file);
  writer.prepare("INSERT INTO block VALUES(?,?,?,?,?,?,?,?)").run(page, "other", "space", 1, "page", 1, 0, "{}");
  writer.close();
  assert.match((await readNotionDesktopCache(page, [id], file)).warning!, /ambiguous/);
  assert.deepEqual((await readNotionDesktopCache(page, [id], path.join(dir, "missing.db"))).blocks, []);
  assert.equal(await fs.stat(path.join(dir, "missing.db")).catch(() => null), null);
});

test("verified reminder and date format survive codec roundtrip, literals and unknowns are protected", () => {
  const input = `${source}\n\n\`\`\`xml\n${source}\n\`\`\`\n\n<future>${source}</future>\n\n<mention url="user://one">${source}</mention>`;
  const result = supplementNotionDates(input, [block()], { blocks: [cached()] });
  assert.equal(result.restored, 1);
  assert.match(result.source.split("\n")[0], /reminder="2026-10-24T16:00:00.000Z"/);
  assert.match(result.source.split("\n")[0], /reminder-offset="0"/);
  assert.ok(result.source.includes(`\`\`\`xml\n${source}\n\`\`\``));
  assert.ok(result.source.includes(`<future>${source}</future>`));
  assert.match(result.source, /custom="preserve"/);
  const syntax = { variant: "notdown", version: 1, notionVersion: "v2", extensions: {} } as const;
  const doc = parseNative(result.source.split("\n")[0], syntax);
  assert.match(serializeNative(doc, syntax), /reminder="2026-10-24T16:00:00.000Z"/);
  assert.deepEqual(result.evidence[0].date, date);
});

test("stale, changed, duplicated, unsupported and already configured dates remain intact", () => {
  const old = { ...cached(), lastEdited: cached().lastEdited - 60000 };
  for (const snapshot of [{ blocks: [old] }, { blocks: [cached({ ...date, start_date: "2026-10-25" })] }, { blocks: [cached({ ...date, reminder: { unit: "month", value: 1 } })] }, { blocks: [] }]) {
    const r = supplementNotionDates(source, [block()], snapshot);
    assert.equal(r.source, source); assert.equal(r.restored, 0);
  }
  assert.equal(supplementNotionDates(`${source} ${source}`, [block()], { blocks: [cached()] }).restored, 0);
  assert.equal(supplementNotionDates(source, [block(), { ...block(), id: page }], { blocks: [cached()] }).restored, 0);
  assert.equal(supplementNotionDates(source, [{ ...block(), last_edited_time: "2026-10-26T15:53:58.000Z" }], { blocks: [cached()] }).restored, 0);
  assert.equal(supplementNotionDates(source, [{ ...block(), last_edited_time: new Date(cached().lastEdited).toISOString() }], { blocks: [cached()] }).restored, 1);
  const configured = source.replace('custom="preserve"', 'reminder="2026-10-23T16:00:00Z"');
  assert.equal(supplementNotionDates(configured, [block()], { blocks: [cached()] }).source, configured);
  assert.equal(supplementNotionDates(configured, [block()], { blocks: [cached()] }).restored, 0);
  const plain = supplementNotionDates(source, [block()], { blocks: [cached({ ...date, reminder: undefined })] });
  assert.equal(plain.restored, 0); assert.ok(!plain.source.includes('reminder='));
});

test("reminder conversion respects calendar DST, independent reminder time and unknown zones", () => {
  assert.equal(cachedReminder(date), "2026-10-24T16:00:00.000Z");
  assert.equal(cachedReminder({ ...date, start_date: "2026-03-08", reminder: { ...date.reminder, value: 1 } }), "2026-03-07T17:00:00.000Z");
  assert.equal(cachedReminder({ ...date, reminder: { ...date.reminder, time: "08:00" } }), "2026-10-24T15:00:00.000Z");
  assert.equal(cachedReminder({ ...date, reminder: { unit: "minute", value: 15 } }), "2026-10-24T15:45:00.000Z");
  assert.equal(cachedReminder({ ...date, time_zone: "not/a-zone" }), undefined);
  assert.equal(cachedReminder({ ...date, start_date: "2026-03-08", reminder: { ...date.reminder, time: "02:30" } }), undefined);
  assert.equal(cachedReminder({ ...date, reminder: { unit: "day", value: -1, time: "09:00" } }), undefined);
});

const input = { token: "test-token-no-persist", pageId: page, includeChildren: false, downloadAssets: false, variant: "notdown", useDesktopCache: true };
const transport: typeof fetch = async value => {
  const url = new URL(String(value));
  if (url.pathname.endsWith("/markdown")) return Response.json({ object: "page_markdown", id: page, markdown: source, truncated: false, unknown_block_ids: [] });
  if (url.pathname.endsWith("/children")) return Response.json({ results: [block()], has_more: false, next_cursor: null });
  if (url.pathname === `/v1/pages/${page}`) return Response.json({ object: "page", id: page, properties: {} });
  throw Error(`Unexpected request ${url.pathname}`);
};

test("API import supplements and archives evidence; cache changes affect identity; official dialect and opt-out avoid cache reads", async () => {
  let reads = 0;
  const readCache = async (root: string, ids: readonly string[]) => { reads++; assert.equal(root, page); assert.deepEqual(ids, [id]); return { blocks: [cached()] }; };
  const options = { fetch: transport, readCache, wait: async () => {} };
  const plan = await prepareNotionImport(input, options);
  assert.match(plan.pages[0].source, /reminder="2026-10-24T16:00:00.000Z"/);
  const archived = plan.originals.find(o => o.path.startsWith("desktop-cache/"))!;
  assert.deepEqual(JSON.parse(archived.data.toString()).dates[0].date, date);
  assert.ok(plan.warnings.some(w => w.includes("restored 1 reminder")));
  assert.equal(reads, 1);
  const plain = await prepareNotionImport({ ...input, useDesktopCache: false }, options);
  const official = await prepareNotionImport({ ...input, variant: "notion-markdown" }, options);
  assert.equal(reads, 1);
  assert.ok(!official.pages[0].source.includes('reminder='));
  assert.notEqual(plan.id, plain.id);
  const again = await prepareNotionImport(input, options);
  assert.equal(plan.id, again.id);
  const failed = await prepareNotionImport(input, { ...options, readCache: async () => { throw Error("private path"); } });
  assert.ok(!failed.pages[0].source.includes('reminder='));
  assert.ok(!failed.warnings.join().includes("private path"));
  await assert.rejects(prepareNotionImport({ ...input, useDesktopCache: "bad" }, options), /selection/);
});
