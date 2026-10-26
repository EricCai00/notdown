import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { createVault } from "../../server/vault";
import { createWebDavClient, webDavAddress, type WebDavConnection } from "../../src/sync/webdav";
import { createWebDavFixture, davCredentials } from "./webdav-fixture";
import { itemRevision } from "../../src/sync/protocol";
import { hashBytes } from "../../src/vault/crypto";
import { createApp } from "../../server/app";
import type { AddressInfo } from "node:net";

async function setup(t: test.TestContext) {
  const dav = await createWebDavFixture(); t.after(dav.close);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-dav-")); t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const a = createVault(path.join(directory, "a")), b = createVault(path.join(directory, "b"));
  const credentials = { provider: "webdav", url: dav.url, folder: "Notdown/Test", ...davCredentials };
  const connection = (): WebDavConnection => ({ provider: "webdav", url: dav.url, folder: credentials.folder, username: davCredentials.email, password: davCredentials.password, enabled: true });
  async function connect() {
    await a.sync.handle("sign-in", "POST", credentials); await a.sync.handle("connect", "POST", { name: "My notes" });
    await b.sync.handle("sign-in", "POST", credentials); await b.sync.handle("connect", "POST", { vaultId: (await a.sync.status()).vaultId });
  }
  return { dav, a, b, connect, credentials, connection };
}

test("WebDAV sync preserves Markdown, attachments and conflicts even when If-None-Match is ignored", async t => {
  const { a, b, dav, connect } = await setup(t); await connect();
  const page = await a.create({ title: "中文", body: '\uFEFF---\r\nfuture: keep\r\n---\r\n```raw\r\n<keep>\r\n```\r\n' });
  const data = Buffer.alloc(1024 * 1024 + 71, 123), asset = await a.uploadAsset("sample.png", "image/png", data.toString("base64"));
  await a.sync.run(); await b.sync.run(); assert.equal((await b.get(page.id)).body, page.body); assert.deepEqual(await b.readAsset(asset.path), data);
  await a.update(page.id, { body: "desktop" }, (await a.get(page.id)).revision);
  await b.update(page.id, { body: "mobile" }, (await b.get(page.id)).revision);
  await a.sync.run(); await b.sync.run();
  const [conflict] = await b.listConflicts(); assert.ok(conflict.syncId); assert.equal(conflict.current.body, "mobile"); assert.equal(conflict.proposed.body, "desktop");
  await b.resolveConflict(conflict.id, { body: "merged" }, (await b.get(page.id)).revision);
  await b.sync.run(); await a.sync.run(); assert.equal((await a.get(page.id)).body, "merged");
  const before = dav.requests.length; await a.sync.run(); assert.equal(dav.requests.length - before, 1, "unchanged sync reads only the small head");
  assert.equal(JSON.stringify(await a.sync.status()).includes(davCredentials.password), false);
  assert.equal((await a.exportFiles()).some(file => Buffer.from(file.data).includes(davCredentials.password)), false);
});

test("WebDAV reports reading records and verified attachment chunk progress", async t => {
  const { a, connect, connection } = await setup(t); await connect();
  await a.create({ body: "Progress record" }); await a.sync.run();
  const settings = await a.sync.status();
  const client = createWebDavClient({ ...connection(), vaultId: settings.vaultId }, async () => {});
  const records: number[][] = [];
  const pulled = await client.remote.pull(0, (done, total) => records.push([done, total]));
  assert.deepEqual(records[0], [0, pulled.items.length]); assert.deepEqual(records.at(-1), [pulled.items.length, pulled.items.length]);
  const bytes = Buffer.alloc(1024 * 1024 + 71, 123), hash = hashBytes(bytes), upload: number[][] = [], download: number[][] = [];
  await client.remote.upload(hash, bytes, (done, total) => upload.push([done, total]));
  assert.deepEqual(upload, [[0, bytes.length], [1024 * 1024, bytes.length], [bytes.length, bytes.length]]);
  assert.deepEqual(await client.remote.download(hash, (done, total) => download.push([done, total])), Uint8Array.from(bytes));
  assert.deepEqual(download, upload);
});

test("unsupported conditional writes or weak ETags cannot enable sync", async t => {
  const { a, dav, credentials } = await setup(t);
  dav.flags.ignoreIfMatch = true; await assert.rejects(a.sync.handle("sign-in", "POST", credentials), /ignores conditional/);
  assert.equal((await a.sync.status()).signedIn, false); assert.equal(dav.files.size, 0);
  dav.flags.ignoreIfMatch = false; dav.flags.weakEtag = true;
  await assert.rejects(a.sync.handle("sign-in", "POST", credentials), /strong ETag/);
  assert.equal((await a.sync.status()).signedIn, false);
});

test("connection probes support Nutstore names, bare ETags and nested-only cleanup", async t => {
  const { a, dav, credentials } = await setup(t);
  await a.sync.handle("sign-in", "POST", credentials);
  assert.equal((await a.sync.status()).signedIn, true);
  assert.deepEqual([...dav.directories], ["/dav/", "/dav/Notdown-checks/"]);
  assert.equal(dav.files.size, 0);
  const creates = dav.requests.filter(request => request.method === "MKCOL");
  assert.ok(creates.every(request => request.path.split("/").filter(Boolean).every(part => part.length <= 30)));
  const [cleanup] = dav.requests.filter(request => request.method === "DELETE");
  assert.match(cleanup.path, /^\/dav\/Notdown-checks\/nd-[a-f0-9]{24}\/$/);
  assert.ok(dav.requests.some(request => request.ifMatch && !request.ifMatch.startsWith('"')));
  dav.flags.bareEtag = false;
  dav.flags.idempotentMkcol = false;
  await a.sync.handle("sign-in", "POST", credentials);
  assert.equal(dav.files.size, 0);
});

test("idempotent MKCOL cannot reinitialize an existing notebook", async t => {
  const { connection, dav } = await setup(t);
  const client = createWebDavClient(connection(), async () => {});
  await client.createVault(randomUUID(), "Existing notebook");
  const before = Buffer.from(dav.files.get("/dav/Notdown/Test/head.json")!);
  await assert.rejects(client.createVault(randomUUID(), "Replacement"), /already exists/);
  assert.deepEqual(dav.files.get("/dav/Notdown/Test/head.json"), before);
});

test("sync HTTP errors preserve WebDAV status and useful messages without leaking credentials", async t => {
  const { a, dav, credentials } = await setup(t);
  const app = createApp({ vaultPath: a.vaultPath }), server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  t.after(async () => { app.locals.closeRNotebook(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/sync/sign-in`;
  for (const status of [400, 401, 429, 500]) {
    dav.flags.mkcolStatus = status;
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(credentials) });
    assert.equal(response.status, status);
    const body = await response.json();
    assert.match(body.error, /WebDAV/);
    assert.doesNotMatch(body.error, /Local file operation/);
    assert.equal(JSON.stringify(body).includes(credentials.password), false);
    if (status === 429) assert.ok(body.retryAt > Date.now());
    assert.equal((await a.sync.status()).signedIn, false);
  }
});

test("a lost successful commit response is replayed exactly after restart", async t => {
  const { a, b, dav, connect } = await setup(t); await connect();
  const page = await a.create({ body: "original operation" }); dav.flags.dropHeadResponse = true;
  await assert.rejects(a.sync.run(), /Cannot reach WebDAV/);
  const pending = (await a.syncStore.readState())!.pending; assert.ok(pending);
  await a.update(page.id, { body: "newer local input" }, (await a.get(page.id)).revision);
  await createVault(a.vaultPath).sync.run(); await b.sync.run(); assert.equal((await b.get(page.id)).body, "newer local input");
  const head = JSON.parse(dav.files.get("/dav/Notdown/Test/head.json")!.toString()); assert.equal(head.sequence, 2);
});

test("concurrent publication never replaces another device's committed head", async t => {
  const { connection, dav } = await setup(t);
  const left = createWebDavClient(connection(), async () => {}), right = createWebDavClient(connection(), async () => {});
  await left.createVault(randomUUID(), "Concurrent");
  const make = (source: string) => ({ id: randomUUID(), mutations: [{ item: { kind: "metadata" as const, key: "metadata:extra/note", value: { data: source } }, expectedVersion: 0 }] });
  const first = make("one"), second = make("two");
  const results = await Promise.allSettled([left.remote.push(first), right.remote.push(second)]);
  assert.equal(results.filter(result => result.status === "fulfilled" && result.value.accepted).length, 1);
  const failed = results.findIndex(result => result.status !== "fulfilled" || !result.value.accepted);
  const retried = await (failed ? right : left).remote.push(failed ? second : first);
  assert.equal(retried.accepted, false); assert.equal(retried.items.length, 1);
  assert.equal(JSON.parse(dav.files.get("/dav/Notdown/Test/head.json")!.toString()).sequence, 1);
});

test("rate limits persist a cooldown and revoked credentials do not auto-retry", async t => {
  const { a, dav, connect } = await setup(t); await connect();
  dav.flags.throttle = true; await assert.rejects(a.sync.run(), /requested a pause/);
  assert.ok((await a.sync.status()).nextSyncAt! > Date.now()); const before = dav.requests.length;
  await assert.rejects(createVault(a.vaultPath).sync.run(), /cooling down/); assert.equal(dav.requests.length, before);
  const config = (await a.syncStore.readConnection<WebDavConnection>())!; config.quota!.blockedUntil = undefined; await a.syncStore.writeConnection(config);
  dav.flags.throttle = false; dav.flags.unauthorized = true; await assert.rejects(a.sync.run(), /authentication/);
  assert.equal((await a.sync.status()).needsSignIn, true); const count = dav.requests.length;
  await assert.rejects(createVault(a.vaultPath).sync.run(), /Sign in again/); assert.equal(dav.requests.length, count);
});

test("local request budget survives client recreation and resets after the window", async t => {
  const { connection, dav } = await setup(t); const config = connection(); let time = 100000;
  const options = { now: () => time, requestLimit: 2 };
  await createWebDavClient(config, async () => {}, fetch, options).vaults();
  await createWebDavClient(config, async () => {}, fetch, options).vaults();
  const before = dav.requests.length;
  await assert.rejects(createWebDavClient(config, async () => {}, fetch, options).vaults(), /request budget/); assert.equal(dav.requests.length, before);
  time += 1800001; await createWebDavClient(config, async () => {}, fetch, options).vaults();
});

test("more than 750 resources use indexed pagination without directory enumeration", async t => {
  const { connection, dav } = await setup(t); const config = connection();
  const client = createWebDavClient(config, async () => {}, fetch, { requestLimit: 10000 });
  await client.createVault(randomUUID(), "Large notebook");
  for (let start = 0; start < 800; start += 100) await client.remote.push({ id: randomUUID(), mutations: Array.from({ length: 100 }, (_, i) => ({
    item: { key: `metadata:extra/item-${start + i}`, kind: "metadata", value: { data: start + i } }, expectedVersion: 0,
  })) });
  let cursor = 0, count = 0;
  for (;;) { const page = await client.remote.pull(cursor); cursor = page.cursor; count += page.items.length; if (!page.more) break; }
  assert.equal(count, 800); assert.equal(cursor, 800);
  assert.ok(dav.requests.filter(item => item.method === "PROPFIND").length < 10);
});

test("unrelated folders, deleted remote roots and corrupt attachments preserve local content", async t => {
  const { a, b, dav, connect, connection } = await setup(t);
  dav.directories.add("/dav/Existing/"); dav.files.set("/dav/Existing/user.txt", Buffer.from("keep"));
  const other = createWebDavClient({ ...connection(), folder: "Existing" }, async () => {});
  await assert.rejects(other.createVault(randomUUID(), "No overwrite"), /already exists without/);
  assert.equal(dav.files.get("/dav/Existing/user.txt")!.toString(), "keep");
  await connect(); const page = await a.create({ body: "safe local note" }); await a.sync.run(); await b.sync.run();
  const original = Buffer.from([1, 2, 3]), asset = await a.uploadAsset("check.png", "image/png", original.toString("base64")); await a.sync.run();
  const hash = hashBytes(original); dav.files.set(`/dav/Notdown/Test/objects/${hash.slice(0, 2)}/${hash}`, Buffer.from([3, 2, 1]));
  await assert.rejects(b.sync.run(), /checksum/); await assert.rejects(b.readAsset(asset.path));
  dav.files.delete("/dav/Notdown/Test/head.json"); await assert.rejects(b.sync.run(), /404/); assert.equal((await b.get(page.id)).body, "safe local note");
});

test("WebDAV endpoint and folder validation never permits URL escape", () => {
  for (const folder of ["../notes", "/root", "notes//data", "notes/%2e%2e", "notes\\other", "notes/."]) assert.throws(() => webDavAddress("https://dav.jianguoyun.com/dav/", folder));
  assert.throws(() => webDavAddress("https://user:pass@example.com/dav/", "notes"));
  assert.throws(() => webDavAddress("http://example.com/dav/", "notes"));
  assert.equal(webDavAddress("https://dav.jianguoyun.com/dav", "Notdown/中文").url, "https://dav.jianguoyun.com/dav/");
});
