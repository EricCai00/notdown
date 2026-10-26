import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createVault } from "../../server/vault";
import { createVault as portableVault } from "../../src/vault/vault";
import { nodeVaultPlatform } from "../../server/vault-platform";
import { synchronize, type SyncProgress } from "../../src/sync/engine";
import { createSyncService } from "../../src/sync/service";
import { absent, itemRevision, sameItem, type SyncItem } from "../../src/sync/protocol";
import { TestSyncRemote } from "./sync-fixture";
import { hashBytes } from "../../src/vault/crypto";

async function setup(t: test.TestContext) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-sync-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const a = createVault(path.join(directory, "desktop"));
  const b = portableVault(path.join(directory, "android"), { ...nodeVaultPlatform, id: "android-sync-contract" });
  const remote = new TestSyncRemote();
  const sync = (vault: typeof a) => synchronize(vault.syncStore, remote, "test-account/notebook");
  return { a, b, remote, sync, directory };
}

test("progress updates before the pull batch finishes and never completes a failed run", async t => {
  const { a, b, remote, sync } = await setup(t);
  await a.create({ title: "First resource", body: "one" });
  await a.create({ title: "Second resource", body: "two" });
  await sync(a);
  const snapshots: SyncProgress[] = [];
  // Exercise the adapter fallback separately from the batch recovery tests.
  const fallback = { ...b.syncStore, readItems: undefined, applyBatch: undefined };
  const apply = b.syncStore.apply;
  let attempts = 0;
  fallback.apply = async (...args) => {
    if (++attempts === 2) {
      assert.ok(snapshots.some(p => p.phase === "applying" && p.completed === 1 && p.downloaded === 1));
      throw new Error("Interrupted download");
    }
    return apply(...args);
  };
  await assert.rejects(synchronize(fallback, remote, "test-account/notebook", p => snapshots.push(p)), /Interrupted/);
  assert.ok(snapshots.some(p => p.phase === "reading" && p.total === undefined));
  assert.equal(snapshots.some(p => p.phase === "complete"), false);
  assert.equal(snapshots.at(-1)!.downloaded, 1);
  fallback.apply = apply;
  const retried: SyncProgress[] = [];
  const result = await synchronize(fallback, remote, "test-account/notebook", p => retried.push(p));
  assert.equal(retried[0].downloaded, 0);
  assert.equal(result.phase, "complete"); assert.equal(result.downloaded, 1);
  assert.equal((await b.list()).length, 2);
});

test("progress-only status never reads or waits for local vault files", async t => {
  const { a } = await setup(t);
  const unavailable = async (): Promise<never> => { throw new Error("Vault lock is busy"); };
  const service = createSyncService({ ...a.syncStore, readConnection: unavailable, readState: unavailable, conflicts: unavailable }, `${a.vaultPath}/progress-only`);
  assert.deepEqual(await service.handle("progress", "GET"), { running: false, progress: undefined, error: undefined });
});

test("a synced page write scans once within its lock and still rejects a later external edit", async t => {
  const { a, b, sync, directory } = await setup(t);
  const note = await a.create({ title: "Scan once", body: "base" }); await sync(a); await sync(b);
  const root = path.join(directory, "android"); let scans = 0;
  const instrumented = portableVault(root, { ...nodeVaultPlatform, id: "scan-count", fs: {
    ...nodeVaultPlatform.fs,
    async readdir(folder, options) { if (folder === path.join(root, "pages")) scans++; return nodeVaultPlatform.fs.readdir(folder, options); },
  } });
  const item = (await instrumented.syncStore.list()).find(item => item.key === `page:${note.id}`)!;
  const incoming = structuredClone(item); incoming.value!.source = "cloud edit";
  scans = 0;
  assert.equal(await instrumented.syncStore.apply(incoming, itemRevision(item)), true);
  assert.equal(scans, 1);
  await fs.writeFile(path.join(root, "pages", incoming.value!.file), "external edit");
  assert.equal(await instrumented.syncStore.apply(item, itemRevision(incoming)), false);
  assert.equal((await instrumented.get(note.id)).body, "external edit");
});

test("desktop and portable vault converge with original Markdown, metadata, contacts and binary attachments", async t => {
  const { a, b, sync } = await setup(t);
  const source = '\uFEFF---\r\ntitle: 文档标题\r\n---\r\n\r\n```unknown\r\n<raw data="unchanged">\r\n```\r\n';
  const page = await a.create({ title: "JSON default", body: source });
  const metadataFile = path.join(a.vaultPath, "metadata.json");
  const metadata = JSON.parse(await fs.readFile(metadataFile, "utf8"));
  metadata.futureTopLevel = { nested: [1, "unknown"] }; metadata.pages[page.id].futurePage = { keep: true };
  await fs.writeFile(metadataFile, JSON.stringify(metadata));
  const person = await a.people.create({ name: "联系人", notes: "notes" });
  const asset = await a.uploadAsset("pixel.png", "image/png", Buffer.from([0, 255, 17, 10]).toString("base64"));
  await sync(a); await sync(b);
  assert.equal((await b.get(page.id)).body, source);
  assert.equal((await b.people.get(person.id)).name, "联系人");
  assert.deepEqual(await b.readAsset(asset.path), await a.readAsset(asset.path));
  const target = JSON.parse(await fs.readFile(path.join(b.vaultPath, "metadata.json"), "utf8"));
  assert.deepEqual(target.futureTopLevel, metadata.futureTopLevel); assert.deepEqual(target.pages[page.id].futurePage, { keep: true });
  assert.equal((await sync(b)).uploaded, 0); assert.equal((await sync(a)).downloaded, 0);
  const mobilePage = await b.get(page.id); await b.update(page.id, { body: source + "手机\r\n" }, mobilePage.revision);
  await sync(b); await sync(a); assert.equal((await a.get(page.id)).body, source + "手机\r\n");
});

test("editing different pages never overwrites unrelated metadata", async t => {
  const { a, b, sync } = await setup(t);
  const first = await a.create({ title: "One", body: "one" }), second = await a.create({ title: "Two", body: "two" });
  await sync(a); await sync(b);
  await a.update(first.id, { body: "desktop" }, (await a.get(first.id)).revision);
  await b.update(second.id, { body: "android", icon: "⭐" }, (await b.get(second.id)).revision);
  await sync(a); await sync(b); await sync(a);
  assert.equal((await a.get(second.id)).body, "android"); assert.equal((await b.get(first.id)).body, "desktop");
  assert.equal((await a.listConflicts()).length, 0); assert.equal((await b.listConflicts()).length, 0);
});

test("simultaneous edits reuse page conflict storage and existing resolution API", async t => {
  const { a, b, sync } = await setup(t);
  const page = await a.create({ title: "Note", body: "base" }); await sync(a); await sync(b);
  await a.update(page.id, { body: "desktop" }, (await a.get(page.id)).revision);
  await b.update(page.id, { body: "mobile" }, (await b.get(page.id)).revision);
  await sync(a); const result = await sync(b); assert.equal(result.conflicts, 1);
  const [conflict] = await b.listConflicts(); assert.ok(conflict.syncId);
  assert.equal(conflict.current.body, "mobile"); assert.equal(conflict.proposed.body, "desktop");
  const raw = await b.syncStore.getConflict(conflict.syncId!); assert.equal(raw!.base!.value!.source, "base");
  await sync(b); assert.equal((await b.listConflicts()).length, 1);
  await b.resolveConflict(conflict.id, { body: "desktop + mobile" }, (await b.get(page.id)).revision);
  await sync(b); await sync(a); assert.equal((await a.get(page.id)).body, "desktop + mobile");
  assert.equal((await b.listConflicts()).length, 0);
  assert.ok((await fs.readdir(path.join(b.vaultPath, ".history/conflicts/resolved"))).length);
});

test("offline edits and lost upload responses survive a fresh vault instance", async t => {
  const { a, b, sync, remote } = await setup(t);
  const page = await a.create({ body: "offline note" }); remote.offline = true;
  await assert.rejects(sync(a), /offline/); assert.equal((await a.get(page.id)).body, "offline note");
  remote.offline = false; remote.loseResponse = true; await assert.rejects(sync(a), /after commit/);
  assert.ok((await a.syncStore.readState())!.pending);
  const reopened = createVault(a.vaultPath);
  await synchronize(reopened.syncStore, remote, "test-account/notebook");
  assert.equal(remote.sequence, 1); assert.equal((await reopened.syncStore.readState())!.pending, undefined);
  await sync(b); assert.equal((await b.get(page.id)).body, "offline note");
});

test("an edit during download is preserved as a conflict without forced retry", async t => {
  const { a, b, sync, remote } = await setup(t);
  const page = await a.create({ body: "base" }); await sync(a); await sync(b);
  await a.update(page.id, { body: "remote" }, (await a.get(page.id)).revision); await sync(a);
  const original = b.syncStore.apply; let raced = false;
  b.syncStore.apply = async (...args) => { if (!raced) { raced = true; await b.update(page.id, { body: "new typing" }, (await b.get(page.id)).revision); } return original(...args); };
  await sync(b); assert.equal((await b.get(page.id)).body, "new typing"); assert.equal((await b.listConflicts()).length, 1);
  assert.equal(remote.items.get(`page:${page.id}`)!.item.value!.source, "remote");
});

test("deletions propagate and delete-versus-edit preserves a reviewable conflict", async t => {
  const { a, b, sync } = await setup(t);
  const page = await a.create({ body: "base" }); await sync(a); await sync(b);
  await fs.unlink(path.join(a.vaultPath, "pages", `${page.id}.md`));
  await b.update(page.id, { body: "keep my mobile edit" }, (await b.get(page.id)).revision);
  await sync(a); await sync(b);
  const [conflict] = await b.syncStore.conflicts(); assert.equal(conflict.remote.item.value, null);
  assert.equal((await b.get(page.id)).body, "keep my mobile edit");
  await b.syncStore.resolve(conflict.id, "local", itemRevision(conflict.local));
  await sync(b); await sync(a); assert.equal((await a.get(page.id)).body, "keep my mobile edit");
  await fs.unlink(path.join(a.vaultPath, "pages", `${page.id}.md`)); await sync(a); await sync(b);
  await assert.rejects(b.get(page.id), /not found/i);
});

test("sync payloads reject path escapes and preserve unrelated files", async t => {
  const { b } = await setup(t);
  const item: SyncItem = { kind: "asset", key: "asset:assets/../../escape", value: null };
  await assert.rejects(b.syncStore.apply(item, itemRevision(absent(item))), /invalid relative/);
  const incoming: SyncItem = { kind: "page", key: "page:safe", value: { source: "bad", metadata: { id: "safe" }, file: "../escape.md" } };
  await assert.rejects(b.syncStore.apply(incoming, itemRevision(absent(incoming))), /Invalid synced page/);
});

test("cloud credentials, cursors and device identity are excluded from ZIP backup", async t => {
  const { a, sync } = await setup(t);
  await a.create({ body: "note" }); await sync(a);
  await a.syncStore.writeConnection({ refresh_token: "test-secret-never-export" });
  const files = await a.exportFiles();
  assert.equal(files.some(file => file.path.startsWith(".notdown/sync/")), false);
  assert.equal(files.some(file => Buffer.from(file.data).includes("test-secret-never-export")), false);
});

test("canonical transport fingerprints tolerate JSONB key reordering", () => {
  assert.ok(sameItem({ key: "page:a", kind: "page", value: { source: "x", metadata: { a: 1, z: 2 } } },
    { key: "page:a", kind: "page", value: { metadata: { z: 2, a: 1 }, source: "x" } }));
});

test("database definitions, views and record pages retain their identities across devices", async t => {
  const { a, b, sync } = await setup(t);
  const database = await a.databases.create({ title: "Reading" });
  const source = database.dataSources[0];
  const record = await a.databases.createRecord(source.id, { title: "First record" }, source.revision);
  await sync(a); await sync(b);
  const copy = await b.databases.get(database.database.id);
  assert.equal(copy.dataSources[0].id, source.id); assert.equal(copy.views[0].id, database.views[0].id);
  assert.equal(copy.pages[0].id, record.id);
  const page = await b.get(record.id);
  await b.update(record.id, { body: "Record edited on Android" }, page.revision, (await b.databases.getSource(source.id)).revision);
  await sync(b); await sync(a); assert.equal((await a.get(record.id)).body, "Record edited on Android");
});

test("two devices adding attachments do not conflict through shared metadata", async t => {
  const { a, b, sync } = await setup(t); await sync(a); await sync(b);
  const left = await a.uploadAsset("Left.png", "image/png", Buffer.from([1, 2]).toString("base64"));
  const right = await b.uploadAsset("Right.png", "image/png", Buffer.from([3, 4]).toString("base64"));
  await sync(a); await sync(b); await sync(a);
  assert.deepEqual(await a.readAsset(right.path), Buffer.from([3, 4])); assert.deepEqual(await b.readAsset(left.path), Buffer.from([1, 2]));
  assert.equal((await a.syncStore.conflicts()).length, 0); assert.equal((await b.syncStore.conflicts()).length, 0);
});

test("interrupted local sync transaction resumes without discarding a third-party edit", async t => {
  const { a, remote, sync, directory } = await setup(t);
  const page = await a.create({ body: "incoming original" }); await sync(a);
  for (const external of [false, true]) {
    const root = path.join(directory, external ? "interrupted-external" : "interrupted"); let failed = false;
    const interrupted = portableVault(root, { ...nodeVaultPlatform, id: `interrupted-${external}`, replaceFile: async (...args) => {
      if (!failed && args[1] === path.join(root, "metadata.json")) { failed = true; throw new Error("Injected process interruption"); }
      return nodeVaultPlatform.replaceFile(...args);
    } });
    await assert.rejects(synchronize(interrupted.syncStore, remote, "test-account/notebook"), /interruption/);
    const filename = path.join(root, "pages", `${page.id}.md`);
    if (external) await fs.writeFile(filename, "external changes while app was closed");
    const reopened = createVault(root);
    if (external) {
      await assert.rejects(reopened.list(), /interrupted sync conflicts/);
      assert.equal(await fs.readFile(filename, "utf8"), "external changes while app was closed");
      assert.ok(await fs.readFile(path.join(root, ".history/sync/pending.json"), "utf8"));
    } else {
      assert.equal((await reopened.get(page.id)).body, "incoming original");
      await synchronize(reopened.syncStore, remote, "test-account/notebook"); assert.equal((await reopened.listConflicts()).length, 0);
    }
  }
});

test("new remote generations supersede the review entry while retaining history", async t => {
  const { a, b, sync, remote } = await setup(t); remote.pageSize = 1;
  const page = await a.create({ body: "base" }); await sync(a); await sync(b);
  await b.update(page.id, { body: "local" }, (await b.get(page.id)).revision);
  await a.update(page.id, { body: "remote one" }, (await a.get(page.id)).revision); await sync(a); await sync(b);
  const older = (await b.syncStore.conflicts())[0];
  await a.update(page.id, { body: "remote two" }, (await a.get(page.id)).revision); await sync(a); await sync(b);
  assert.equal((await b.listConflicts()).length, 1); assert.equal((await b.listConflicts())[0].proposed.body, "remote two");
  await assert.rejects(b.syncStore.resolve(older.id, "local", itemRevision(older.local)), /newer remote/);
  const newer = (await b.syncStore.conflicts())[0]; await b.syncStore.resolve(newer.id, "local", itemRevision(newer.local));
  await sync(b); await sync(a); assert.equal((await a.get(page.id)).body, "local"); assert.equal((await b.listConflicts()).length, 0);
});

test("completed history stores resource snapshots and preserves replaced attachment bytes", async t => {
  const { a, b, sync } = await setup(t);
  await a.create({ body: "Some Markdown" });
  const before = Buffer.from([1, 2, 3]);
  const asset = await a.uploadAsset("history.png", "image/png", before.toString("base64"));
  await sync(a); await sync(b);
  await fs.writeFile(path.join(a.vaultPath, asset.path), Buffer.from([4, 5, 6])); await sync(a); await sync(b);
  assert.deepEqual(await fs.readFile(path.join(b.vaultPath, ".history/sync/blobs", hashBytes(before))), before);
  const directory = path.join(b.vaultPath, ".history/sync");
  for (const filename of (await fs.readdir(directory)).filter(file => file.endsWith(".json"))) {
    const record = JSON.parse(await fs.readFile(path.join(directory, filename), "utf8"));
    assert.ok(record.snapshot || record.snapshots?.length); assert.equal(record.files.some((file: any) => "before" in file || "after" in file), false);
  }
});
