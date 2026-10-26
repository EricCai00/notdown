import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import { createApp } from "../../server/app.js";
import { api } from "../../src/shared/types.js";
import { notionFixture, notionRoot } from "./notion-import-fixture.js";
import { prepareNotionImport } from "../../server/notion-import.js";
import type { ImportProgress } from "../../src/shared/import-progress.js";

test("Notion streams page counts before completion, commits persisted pages, and reports errors", async t => {
  const temporaryRoot = path.resolve(os.tmpdir());
  const vaultPath = await fs.mkdtemp(path.join(temporaryRoot, "notdown-progress-"));
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const fixture = notionFixture();
  const app = createApp({ vaultPath, notionImportTransport: {
    wait: async () => {},
    fetch: async (input, init) => {
      if (String(input).includes(`/pages/${notionRoot}/markdown`)) await gate;
      return fixture(input, init);
    },
  } });
  await app.locals.vault.init();
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    release();
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    app.locals.closeRNotebook();
    assert.equal(path.dirname(path.resolve(vaultPath)), temporaryRoot);
    assert.ok(path.basename(vaultPath).startsWith("notdown-progress-"));
    await fs.rm(vaultPath, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}/api`;
  const post = (endpoint: string, body: unknown) => fetch(`${base}${endpoint}`, {
    method: "POST", headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" }, body: JSON.stringify(body),
  });
  const response = await post("/notion/import/preview", { token: "test-secret-not-saved", pageId: notionRoot });
  assert.match(response.headers.get("content-type")!, /application\/x-ndjson/);
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let source = "";
  while (!source.includes("Reading page Markdown — waiting for Notion")) source += decoder.decode((await reader.read()).value, { stream: true });
  // The Markdown request is still blocked, so these are truly live events.
  assert.match(source, /"completed":0/);
  assert.match(source, /Checking the local vault/);
  assert.match(source, /Reading page details/);
  assert.match(source, /"requestCount":2/);
  assert.ok(!source.includes('"type":"result"'));
  assert.equal((await app.locals.vault.list()).length, 0);
  release();
  while (true) {
    const { value, done } = await reader.read();
    source += decoder.decode(value, { stream: !done });
    if (done) break;
  }
  const events = source.trim().split("\n").map(line => JSON.parse(line));
  assert.ok(!source.includes("test-secret-not-saved"));
  const progress = events.filter(event => event.type === "progress");
  assert.ok(progress.every(event => event.total === undefined));
  assert.deepEqual([...new Set(progress.filter(event => event.phase === "reading").map(event => event.completed))], [0, 1, 2, 3]);
  assert.ok(progress.some(event => event.completed === 1 && event.currentTitle === "Same title"));
  assert.ok(progress.some(event => event.phase === "restoring" && event.currentTitle === "Same title"));
  assert.ok(progress.some(event => event.step?.includes("Scanning child pages and blocks (page 2)")));
  assert.ok(progress.some(event => event.discovered === 3));
  const preview = events.at(-1).result;
  assert.equal(preview.pages, 3);
  const committed = (await (await post("/import/commit", { id: preview.id })).text()).trim().split("\n").map(line => JSON.parse(line));
  assert.deepEqual(committed.filter(event => event.phase === "importing" && event.currentTitle && event.completed > 0).map(event => event.completed), [1, 1, 2, 2, 3]);
  assert.ok(committed.filter(event => event.type === "progress").every(event => event.total === 3));
  assert.equal(committed.at(-1).result.pageIds.length, 3);
  assert.equal((await app.locals.vault.list()).length, 3);
  const repeated = (await (await post("/import/commit", { id: preview.id })).text()).trim().split("\n").map(line => JSON.parse(line));
  assert.equal(repeated.at(-1).result.alreadyImported, true);
  const failed = await (await post("/notion/import/preview", { token: "test-secret-not-saved", pageId: "invalid" })).text();
  assert.match(failed, /"type":"error"/);
  assert.ok(!failed.includes("test-secret-not-saved"));
  // A failed streamed preview must release the single-preview guard.
  const retry = await post("/notion/import/preview", { token: "test-secret-not-saved", pageId: notionRoot, includeChildren: false });
  assert.equal(retry.status, 200);
  assert.match(await retry.text(), /"type":"result"/);
});

test("Notion reports rate-limit waits and retry attempts before waiting, without exposing cursors or credentials", async () => {
  const progress: ImportProgress[] = [], waits: number[] = [];
  const fixture = notionFixture();
  let attempts = 0;
  await prepareNotionImport({ token: "test-secret-not-saved", pageId: notionRoot }, {
    fetch: async (input, init) => ++attempts === 1
      ? new Response(null, { status: 429, headers: { "Retry-After": "2" } }) : fixture(input, init),
    onProgress: value => progress.push(value),
    wait: async ms => {
      waits.push(ms);
      if (ms === 2000) assert.match(progress.at(-1)!.step!, /rate limit: waiting 2s before retry 1\/2/);
    },
  });
  assert.ok(waits.includes(2000));
  assert.ok(progress.some(value => value.step?.includes("retry 1/2") && value.requestCount === 2));
  const text = JSON.stringify(progress);
  for (const secret of ["test-secret-not-saved", "second page&cursor", "https://api.notion.com", "Authorization"]) assert.ok(!text.includes(secret));
});

test("API progress reader handles split Unicode, multiple events, errors and truncated streams", async t => {
  const messages = [
    { type: "progress", phase: "reading", completed: 1, currentTitle: "当前页面 📘" },
    { type: "result", result: { pages: 1 } },
  ];
  const bytes = new TextEncoder().encode(messages.map(event => JSON.stringify(event)).join("\n") + "\n");
  let requests = 0;
  t.mock.method(globalThis, "fetch", async (_input: unknown, init: RequestInit) => {
    assert.equal((init.headers as Record<string, string>).Accept, "application/x-ndjson");
    const content = requests++ === 0 ? bytes : new TextEncoder().encode(requests === 2 ? '{"type":"error","error":"Read failed"}\n' : '{"type":"progress","phase":"reading","completed":0}\n');
    return new Response(new ReadableStream({ start(controller) {
      for (const byte of content) controller.enqueue(Uint8Array.of(byte));
      controller.close();
    } }), { headers: { "Content-Type": "application/x-ndjson" } });
  });
  const progress: unknown[] = [];
  assert.deepEqual(await api("/notion/import/preview", {}, event => progress.push(event)), { pages: 1 });
  assert.deepEqual(progress, [messages[0]]);
  await assert.rejects(api("/notion/import/preview", {}, () => {}), /Read failed/);
  await assert.rejects(api("/notion/import/preview", {}, () => {}), /closed before completion/);
});
