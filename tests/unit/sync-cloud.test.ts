import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { createVault } from "../../server/vault";
import { createCloudClient, signInCloud, cloudAddress } from "../../src/sync/supabase";
import { hashBytes } from "../../src/vault/crypto";
import { createSyncCloudFixture, syncTestAccount, syncTestKey, syncUserA, syncUserB } from "./sync-cloud-fixture";

test("production Supabase SQL, account isolation, REST sync, attachments and replay", async t => {
  const cloud = await createSyncCloudFixture(); t.after(cloud.close);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-cloud-")); t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const a = createVault(path.join(directory, "a")), b = createVault(path.join(directory, "b"));
  const credentials = { url: cloud.url, key: syncTestKey, ...syncTestAccount };
  await a.sync.handle("sign-in", "POST", credentials); await b.sync.handle("sign-in", "POST", credentials);
  await a.sync.handle("connect", "POST", { name: "Test notebook" }); const status = await a.sync.status();
  assert.ok(status.vaultId); assert.equal(JSON.stringify(status).includes("access_token"), false);
  await b.sync.handle("connect", "POST", { vaultId: status.vaultId });
  const page = await a.create({ title: "Cloud note", body: "original\r\n" });
  const data = Buffer.alloc(1024 * 1024 + 37); for (let i = 0; i < data.length; i++) data[i] = i % 251;
  const asset = await a.uploadAsset("test.png", "image/png", data.toString("base64"));
  await a.sync.run(); await b.sync.run(); assert.equal((await b.get(page.id)).body, "original\r\n");
  assert.deepEqual(await b.readAsset(asset.path), data);
  assert.equal(cloud.blobs.size, 3); // Two immutable chunks and one completion manifest.

  await t.test("database revisions remain local while JSONB resources converge", async () => {
    const database = await a.databases.create({ title: "Cloud records" });
    const source = database.dataSources[0];
    const record = await a.databases.createRecord(source.id, { title: "Remote record" }, source.revision);
    await a.sync.run(); await b.sync.run();
    assert.equal((await b.databases.get(database.database.id)).pages[0].id, record.id);
    const current = await b.get(record.id);
    await b.update(record.id, { body: "Edited after JSONB roundtrip" }, current.revision, (await b.databases.getSource(source.id)).revision);
    await b.sync.run(); await a.sync.run();
    assert.equal((await a.get(record.id)).body, "Edited after JSONB roundtrip");
    const mobileSource = await b.databases.getSource(source.id);
    await b.databases.updateSource(source.id, { title: "Schema from mobile" }, mobileSource.revision);
    const mobileView = (await b.databases.get(database.database.id)).views[0];
    await b.databases.updateView(mobileView.id, { name: "Mobile view" }, mobileView.revision);
    await b.sync.run(); await a.sync.run();
    assert.equal((await a.databases.getSource(source.id)).title, "Schema from mobile");
    assert.equal((await a.databases.get(database.database.id)).views[0].name, "Mobile view");
    assert.equal((await a.syncStore.conflicts()).length, 0);
    assert.equal((await b.sync.run()).uploaded, 0); assert.equal((await a.sync.run()).uploaded, 0);
  });

  await t.test("another account cannot read or mutate the vault or its objects", async () => {
    const other = createVault(path.join(directory, "other"));
    await other.sync.handle("sign-in", "POST", { ...credentials, email: "second@example.invalid" });
    assert.deepEqual(await other.sync.handle("vaults", "GET"), []);
    await assert.rejects(other.sync.handle("connect", "POST", { vaultId: status.vaultId }), /not found/);
    await assert.rejects(cloud.asUser(syncUserB, "select public.nd_sync_pull($1,0,100)", [status.vaultId]), /unavailable/);
    const objects = await cloud.asUser(syncUserB, "select * from storage.objects"); assert.equal(objects.rows.length, 0);
    await assert.rejects(cloud.asUser(syncUserB, "insert into storage.objects values ('notdown-sync',$1)", [`${syncUserA}/${status.vaultId}/chunks/${"0".repeat(64)}`]), /row-level security/);
    await assert.rejects(cloud.asUser(syncUserA, "delete from notdown_sync.items"), /permission denied/);
  });
  await t.test("SQL checks CAS and persists exact idempotent responses", async () => {
    const request = [{ item: { key: "metadata:extra/test", kind: "metadata", value: { data: 1 } }, expectedVersion: 0 }];
    const operation = randomUUID(), params = [status.vaultId, operation, JSON.stringify(request)];
    const first = await cloud.asUser<{ result: any }>(syncUserA, "select public.nd_sync_push($1,$2,$3) as result", params);
    const repeated = await cloud.asUser<{ result: any }>(syncUserA, "select public.nd_sync_push($1,$2,$3) as result", params);
    assert.deepEqual(repeated.rows, first.rows);
    const rejected = await cloud.asUser<{ result: any }>(syncUserA, "select public.nd_sync_push($1,$2,$3) as result", [status.vaultId, randomUUID(), JSON.stringify(request)]);
    assert.equal(rejected.rows[0].result.accepted, false);
    request[0].item.value.data = 2;
    await assert.rejects(cloud.asUser(syncUserA, "select public.nd_sync_push($1,$2,$3)", [status.vaultId, operation, JSON.stringify(request)]), /reused/);
  });
  await t.test("chunk replay and token refresh use the same immutable bytes", async () => {
    const connection = await signInCloud(credentials); connection.vaultId = status.vaultId; connection.session.expires_at = 0;
    let refreshes = 0; const client = createCloudClient(connection, async () => { refreshes++; });
    const uploaded: number[][] = [], downloaded: number[][] = [];
    await client.remote.upload(hashBytes(data), data, (done, total) => uploaded.push([done, total])); assert.equal(refreshes, 1); assert.equal(cloud.blobs.size, 3);
    assert.deepEqual(Buffer.from(await client.remote.download(hashBytes(data), (done, total) => downloaded.push([done, total]))), data);
    assert.deepEqual(uploaded, [[0, data.length], [1024 * 1024, data.length], [data.length, data.length]]);
    assert.deepEqual(downloaded, uploaded);
  });
  await t.test("migration can be reapplied without resetting the notebook", async () => {
    await cloud.db.exec(cloud.schema);
    await a.sync.run(); assert.equal((await a.get(page.id)).body, "original\r\n");
  });
});

test("cloud configuration rejects private credentials and unsafe URLs", () => {
  assert.throws(() => cloudAddress("https://example.com", "sb_secret_do_not_use"), /publishable/);
  assert.throws(() => cloudAddress("http://example.com", syncTestKey), /HTTPS/);
  assert.throws(() => cloudAddress("https://user:pass@example.com", syncTestKey), /HTTPS/);
  assert.throws(() => cloudAddress("https://example.com/path", syncTestKey), /HTTPS/);
});
