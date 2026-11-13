import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createVault } from "../../server/vault";
import { createVault as portableVault } from "../../src/vault/vault";
import { nodeVaultPlatform } from "../../server/vault-platform";
import { createWebDavFixture, davCredentials } from "./webdav-fixture";
import { createWebDavClient } from "../../src/sync/webdav";
import { webDavFolders } from "../../src/sync/webdav-discovery";
import type { CloudNotebook } from "../../src/sync/service";
import { createSyncCloudFixture, syncTestAccount, syncTestKey } from "./sync-cloud-fixture";

test("DAV discovery reads direct child folders and rejects external and nested URLs", () => {
  const xml = `<d:multistatus xmlns:d="DAV:">${["/dav/Notdown/", "/dav/Notdown/One%20vault/", "/dav/Notdown/Two%26three/", "/dav/Notdown/nested/deep/", "https://elsewhere.invalid/dav/Notdown/Other/", "/dav/Notdown/escape%2Fchild/"].map(href => `<d:response><d:href>${href}</d:href><d:resourcetype><d:collection/></d:resourcetype></d:response>`).join("")}</d:multistatus>`;
  assert.deepEqual(webDavFolders(xml, new URL("https://example.invalid/dav/Notdown/")), ["One vault", "Two&three"]);
  assert.throws(() => webDavFolders('<!DOCTYPE x SYSTEM "file:///secret">', new URL("https://example.invalid/")), /Unsupported/);
});

test("authenticated notebook switching isolates files and reuses credentials without resetting sync state", async t => {
  const dav = await createWebDavFixture(); t.after(dav.close);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-notebook-switch-"));
  const first = createVault(path.join(root, "first")), second = createVault(path.join(root, "second")), desktop = createVault(path.join(root, "desktop"));
  t.after(async () => { for (const vault of [first, second, desktop]) vault.closeHistory(); await fs.rm(root, { recursive: true, force: true }); });
  const credentials = { provider: "webdav", url: dav.url, folder: "Notdown/First", ...davCredentials };
  await first.sync.handle("sign-in", "POST", credentials);
  await first.sync.handle("connect", "POST", { name: "First notebook" });
  const one = await first.create({ title: "First only", body: "First source\n" }); await first.sync.run();
  await desktop.sync.handle("sign-in", "POST", { ...credentials, folder: "Notdown/Second" });
  await desktop.sync.handle("connect", "POST", { name: "Second notebook" });
  const two = await desktop.create({ title: "Second only", body: "Second source\n" }); await desktop.sync.run();
  const choices = await first.sync.handle("notebooks", "GET") as CloudNotebook[];
  assert.equal(choices.length, 2);
  const target = choices.find(item => item.name === "Second notebook")!;
  const before = await first.syncStore.readState();
  await first.sync.connectReplica(second.syncStore, target); await second.sync.run();
  assert.deepEqual((await second.list()).map(page => page.id), [two.id]);
  assert.deepEqual((await first.list()).map(page => page.id), [one.id]);
  assert.deepEqual(await first.syncStore.readState(), before);
  const firstChoice = choices.find(item => item.name === "First notebook")!;
  await second.sync.connectReplica(first.syncStore, firstChoice);
  assert.deepEqual(await first.syncStore.readState(), before);
  await assert.rejects(first.sync.connectReplica(second.syncStore, firstChoice), /another cloud notebook/);
  await assert.rejects(first.sync.connectReplica(second.syncStore, { ...target, id: randomUUID() }), /identity changed/);
  assert.deepEqual((await second.list()).map(page => page.id), [two.id]);
  assert.ok(dav.requests.filter(request => request.method === "PROPFIND").length);
});

test("Supabase switching uses the current account session and preserves separate notebook states", async t => {
  const cloud = await createSyncCloudFixture(); t.after(cloud.close);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-cloud-switch-"));
  const first = createVault(path.join(root, "first")), second = createVault(path.join(root, "second")), desktop = createVault(path.join(root, "desktop"));
  t.after(async () => { for (const vault of [first, second, desktop]) vault.closeHistory(); await fs.rm(root, { recursive: true, force: true }); });
  const credentials = { url: cloud.url, key: syncTestKey, ...syncTestAccount };
  await first.sync.handle("sign-in", "POST", credentials); await first.sync.handle("connect", "POST", { name: "First" });
  const one = await first.create({ title: "One", body: "One\n" }); await first.sync.run();
  await desktop.sync.handle("sign-in", "POST", credentials); await desktop.sync.handle("connect", "POST", { name: "Second" });
  const two = await desktop.create({ title: "Two", body: "Two\n" }); await desktop.sync.run();
  const choices = await first.sync.handle("notebooks", "GET") as CloudNotebook[];
  assert.equal(choices.length, 2); assert.equal(JSON.stringify(choices).includes("access_token"), false);
  await first.sync.connectReplica(second.syncStore, choices.find(item => item.name === "Second")!); await second.sync.run();
  assert.deepEqual((await second.list()).map(page => page.id), [two.id]);
  assert.deepEqual((await first.list()).map(page => page.id), [one.id]);
  await assert.rejects(first.sync.connectReplica(second.syncStore, { id: randomUUID(), name: "Unknown" }), /not found/);
});

test("a disconnected mobile replica retains its owner and sync cursor across restart", async t => {
  const dav = await createWebDavFixture(); t.after(dav.close);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-replica-owner-"));
  const desktop = createVault(path.join(root, "desktop"));
  const replicaPath = path.join(root, "mobile");
  const mobile = portableVault(replicaPath, nodeVaultPlatform, { privateReplica: true });
  t.after(async () => { desktop.closeHistory(); mobile.closeHistory(); await fs.rm(root, { recursive: true, force: true }); });
  const credentials = { provider: "webdav", url: dav.url, folder: "Notdown/First", ...davCredentials };
  await desktop.sync.handle("sign-in", "POST", credentials);
  await desktop.sync.handle("connect", "POST", { name: "First" });
  const page = await desktop.create({ title: "First only", body: "Keep first source\n" }); await desktop.sync.run();
  const first = (await desktop.sync.handle("notebooks", "GET") as CloudNotebook[])[0];
  await desktop.sync.connectReplica(mobile.syncStore, first); await mobile.sync.run();
  const state = await mobile.syncStore.readState();
  await mobile.sync.handle("disconnect", "POST");
  assert.deepEqual(await mobile.syncStore.readState(), state);
  const restarted = portableVault(replicaPath, nodeVaultPlatform, { privateReplica: true });
  t.after(() => restarted.closeHistory());
  await desktop.sync.handle("disconnect", "POST");
  await desktop.sync.handle("sign-in", "POST", { ...credentials, folder: "Notdown/Second" });
  await desktop.sync.handle("connect", "POST", { name: "Second" });
  const second = (await desktop.sync.handle("notebooks", "GET") as CloudNotebook[]).find(item => item.name === "Second")!;
  await assert.rejects(desktop.sync.connectReplica(restarted.syncStore, second), /another cloud notebook/);
  await restarted.sync.handle("sign-in", "POST", { ...credentials, folder: second.folder });
  await assert.rejects(restarted.sync.handle("connect", "POST", { vaultId: second.id }), /another cloud notebook/);
  assert.equal((await restarted.get(page.id)).body, page.body);
  assert.deepEqual(await restarted.syncStore.readState(), state);
  const otherCloud = createWebDavClient({ provider: "webdav", url: dav.url, folder: second.folder!, username: davCredentials.email,
    password: davCredentials.password, enabled: true }, async () => {});
  assert.deepEqual((await otherCloud.remote.pull(0)).items, []);
  await restarted.sync.handle("disconnect", "POST");
  await restarted.sync.handle("sign-in", "POST", credentials);
  await restarted.sync.handle("connect", "POST", { vaultId: first.id });
  assert.deepEqual(await restarted.syncStore.readState(), state);
  await restarted.sync.run();
  assert.equal((await restarted.list()).length, 1);
});

test("replica selection refuses unbound attachments without uploading or deleting them", async t => {
  const dav = await createWebDavFixture(); t.after(dav.close);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-unbound-replica-"));
  const desktop = createVault(path.join(root, "desktop")), mobile = portableVault(path.join(root, "mobile"), nodeVaultPlatform, { privateReplica: true });
  t.after(async () => { desktop.closeHistory(); mobile.closeHistory(); await fs.rm(root, { recursive: true, force: true }); });
  await desktop.sync.handle("sign-in", "POST", { provider: "webdav", url: dav.url, folder: "Notdown/Cloud", ...davCredentials });
  await desktop.sync.handle("connect", "POST", { name: "Cloud" });
  const notebook = (await desktop.sync.handle("notebooks", "GET") as CloudNotebook[])[0];
  await fs.mkdir(path.join(root, "mobile", "assets"), { recursive: true });
  const file = path.join(root, "mobile", "assets", "unbound.bin"), bytes = Buffer.from([0, 255, 128]);
  await fs.writeFile(file, bytes);
  await assert.rejects(desktop.sync.connectReplica(mobile.syncStore, notebook), /unbound notes/);
  assert.deepEqual(await fs.readFile(file), bytes);
  assert.equal((await mobile.sync.status()).signedIn, false);
  assert.deepEqual(await mobile.syncStore.readState(), null);
});

test("replica ownership survives disconnect before the first download creates sync state", async t => {
  const cloud = await createSyncCloudFixture(); t.after(cloud.close);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-replica-first-download-"));
  const desktop = createVault(path.join(root, "desktop"));
  const mobile = portableVault(path.join(root, "mobile"), nodeVaultPlatform, { privateReplica: true });
  t.after(async () => { desktop.closeHistory(); mobile.closeHistory(); await fs.rm(root, { recursive: true, force: true }); });
  const credentials = { url: cloud.url, key: syncTestKey, ...syncTestAccount };
  await desktop.sync.handle("sign-in", "POST", credentials);
  const first = await desktop.sync.handle("connect", "POST", { name: "First" }) as { vaultId: string };
  await desktop.sync.handle("disconnect", "POST");
  const second = await desktop.sync.handle("sign-in", "POST", credentials)
    .then(() => desktop.sync.handle("connect", "POST", { name: "Second" })) as { vaultId: string };
  await mobile.sync.handle("sign-in", "POST", credentials);
  await mobile.sync.handle("connect", "POST", { vaultId: first.vaultId });
  assert.equal(await mobile.syncStore.readState(), null);
  await mobile.sync.handle("disconnect", "POST");
  await mobile.sync.handle("sign-in", "POST", credentials);
  await assert.rejects(mobile.sync.handle("connect", "POST", { vaultId: second.vaultId }), /another cloud notebook/);
  assert.equal(await mobile.syncStore.readState(), null);
  await mobile.sync.handle("connect", "POST", { vaultId: first.vaultId }); await mobile.sync.run();
  assert.equal((await mobile.sync.status()).vaultId, first.vaultId);
});
