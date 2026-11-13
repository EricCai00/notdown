import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import { createApp } from "../../server/app.js";
import { notionFixture, notionRoot, notionSource } from "./notion-import-fixture.js";

async function fixture(t: TestContext) {
  const vaultPath = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-preview-lifetime-"));
  const calls: string[] = [];
  const app = createApp({ vaultPath, notionImportTransport: { fetch: notionFixture(calls), wait: async () => {} } });
  await app.locals.vault.init();
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}/api`;
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    app.locals.closeRNotebook();
    assert.equal(path.dirname(path.resolve(vaultPath)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(vaultPath).startsWith("notdown-preview-lifetime-"));
    await fs.rm(vaultPath, { recursive: true, force: true });
  });
  const send = (endpoint: string, body: unknown, method = "POST") => fetch(`${base}${endpoint}`, {
    method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  return { app, calls, send };
}

test("a completed Notion snapshot commits after two days without rereading or changing its reviewed bytes", async t => {
  const { app, calls, send } = await fixture(t);
  let now = Date.now();
  t.mock.method(Date, "now", () => now);
  let preview = await (await send("/notion/import/preview", { token: "test-secret-not-saved", pageId: notionRoot, batched: true, downloadAssets: false })).json();
  const continuationId = preview.continuationId;
  while (preview.continuationId) preview = await (await send("/notion/import/preview", { continuationId })).json();
  assert.equal(preview.pages, 3);
  assert.equal(preview.documents[0].source, notionSource);
  // The dialog releases the read session once it has the complete preview.
  assert.equal((await send(`/notion/import/preview/${continuationId}`, {}, "DELETE")).status, 200);
  const readCount = calls.length;
  now += 48 * 60 * 60_000;
  assert.equal((await app.locals.vault.list()).length, 0);
  const response = await send("/import/commit", { id: preview.id });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).pageIds.length, 3);
  assert.equal((await app.locals.vault.get(preview.documents[0].id)).body, notionSource);
  assert.equal(calls.length, readCount);
  const repeat = await send("/import/commit", { id: preview.id });
  assert.equal(repeat.status, 200);
  assert.equal((await repeat.json()).alreadyImported, true);
});

test("completed Markdown snapshots retain the three most recent selections, independent of time and invalid previews", async t => {
  const { send } = await fixture(t);
  let now = Date.now();
  t.mock.method(Date, "now", () => now);
  const input = (name: string) => ({ name, dialect: "gfm", files: [{ path: `${name}.md`, data: Buffer.from(`Original ${name}`).toString("base64") }] });
  const preview = async (name: string) => {
    const response = await send("/import/preview", input(name));
    assert.equal(response.status, 200);
    return response.json();
  };
  const a = await preview("A"), b = await preview("B"), c = await preview("C");
  now += 48 * 60 * 60_000;
  assert.equal((await send("/import/preview", {})).status, 400);
  assert.equal((await send("/import/commit", { id: a.id })).status, 200);
  // Re-previewing the same content refreshes its retention order without
  // evicting another reviewed snapshot or changing its identity.
  assert.equal((await preview("A")).id, a.id);
  await preview("D");
  const lost = await send("/import/commit", { id: b.id });
  assert.equal(lost.status, 410);
  assert.match((await lost.json()).error, /no longer available/);
  assert.equal((await send("/import/commit", { id: a.id })).status, 200);
  assert.equal((await send("/import/commit", { id: c.id })).status, 200);
});
