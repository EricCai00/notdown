import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createVault } from "../../src/vault/vault";
import { nodeVaultPlatform } from "../../server/vault-platform";
import { synchronize } from "../../src/sync/engine";
import { absent, itemRevision, type SyncItem } from "../../src/sync/protocol";
import { TestSyncRemote } from "./sync-fixture";

async function setup(t: test.TestContext) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-sync-batch-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const item = (title: string): SyncItem => {
    const id = randomUUID(); return { key: `page:${id}`, kind: "page", value: { file: `${id}.md`, source: `\uFEFF${title}\r\n\r\n\`\`\`unknown\r\nkeep\r\n\`\`\`\r\n`, metadata: { id, title, future: { keep: true } } } };
  };
  return { directory, item };
}
const original = (item: SyncItem) => ({ item, expectedRevision: itemRevision(absent(item)) });

test("200-page first download scans by batch and commits metadata twice", async t => {
  const { directory, item } = await setup(t); const root = path.join(directory, "target");
  let scans = 0, metadataWrites = 0;
  const vault = createVault(root, { ...nodeVaultPlatform, id: "batch-counts", fs: { ...nodeVaultPlatform.fs,
    async readdir(folder, options) { if (folder === path.join(root, "pages")) scans++; return nodeVaultPlatform.fs.readdir(folder, options); },
  }, async replaceFile(...args) { if (args[1] === path.join(root, "metadata.json")) metadataWrites++; return nodeVaultPlatform.replaceFile(...args); } });
  await vault.list(); scans = 0; metadataWrites = 0;
  const remote = new TestSyncRemote(), items = Array.from({ length: 200 }, (_, i) => item(`Page ${i}`));
  await remote.push({ id: randomUUID(), mutations: items.map(item => ({ item, expectedVersion: 0 })) });
  const result = await synchronize(vault.syncStore, remote, "batch-test");
  assert.equal(result.downloaded, 200); assert.ok(scans <= 5, `Expected batch scans, saw ${scans}`); assert.equal(metadataWrites, 2);
  const files = await vault.exportFiles();
  for (const entry of items) assert.equal(Buffer.from(files.find(file => file.path === `pages/${entry.value!.file}`)!.data).toString(), entry.value!.source);
  const metadata = JSON.parse(await fs.readFile(path.join(root, "metadata.json"), "utf8"));
  assert.deepEqual(metadata.pages[items[0].value!.metadata.id].future, { keep: true });
  assert.equal((await synchronize(vault.syncStore, remote, "batch-test")).uploaded, 0);
});

test("batch CAS preserves an edit made after the comparison scan and syncs independent pages", async t => {
  const { directory, item } = await setup(t); const vault = createVault(path.join(directory, "target"), nodeVaultPlatform);
  const left = item("Left"), right = item("Right"), remote = new TestSyncRemote();
  await remote.push({ id: randomUUID(), mutations: [left, right].map(item => ({ item, expectedVersion: 0 })) });
  const applyBatch = vault.syncStore.applyBatch;
  vault.syncStore.applyBatch = async entries => {
    await fs.writeFile(path.join(vault.vaultPath, "pages", left.value!.file), "external input");
    return applyBatch(entries);
  };
  const result = await synchronize(vault.syncStore, remote, "batch-race");
  assert.equal(result.conflicts, 1); assert.equal(result.downloaded, 1);
  assert.equal((await vault.get(left.value!.metadata.id)).body, "external input");
  assert.equal((await vault.get(right.value!.metadata.id)).body, right.value!.source);
  assert.equal((await vault.syncStore.conflicts())[0].remote.item.value!.source, left.value!.source);
});

test("batch recovery resumes partial writes and refuses external changes after interruption", async t => {
  const { directory, item } = await setup(t); const entries = [item("One"), item("Two"), item("Three")];
  for (const external of [false, true]) {
    const root = path.join(directory, String(external)); let replaced = 0;
    const vault = createVault(root, { ...nodeVaultPlatform, id: `batch-interrupted-${external}`, async replaceFile(...args) {
      if (args[1].includes(`${path.sep}pages${path.sep}`) && ++replaced === 2) throw new Error("Injected batch interruption");
      return nodeVaultPlatform.replaceFile(...args);
    } });
    await assert.rejects(vault.syncStore.applyBatch(entries.map(original)), /interruption/);
    const first = path.join(root, "pages", entries[0].value!.file);
    if (external) await fs.writeFile(first, "external edit after crash");
    const reopened = createVault(root, nodeVaultPlatform);
    if (external) {
      await assert.rejects(reopened.list(), /interrupted sync conflicts/);
      assert.equal(await fs.readFile(first, "utf8"), "external edit after crash");
      const pending = JSON.parse(await fs.readFile(path.join(root, ".history/sync/pending.json"), "utf8"));
      assert.equal(pending.snapshots.length, 3);
    } else {
      assert.equal((await reopened.list()).length, 3);
      for (const entry of entries) assert.equal((await reopened.get(entry.value!.metadata.id)).body, entry.value!.source);
    }
  }
});

test("batch validation rejects cycles and filename collisions without losing unrelated pages", async t => {
  const { directory, item } = await setup(t); const vault = createVault(path.join(directory, "target"), nodeVaultPlatform);
  const left = item("Left"), right = item("Right"), collision = item("Collision"), safe = item("Safe");
  left.value!.metadata.parent = right.value!.metadata.id; right.value!.metadata.parent = left.value!.metadata.id;
  collision.value!.file = left.value!.file;
  assert.deepEqual(await vault.syncStore.applyBatch([left, right, collision, safe].map(original)), [true, false, false, true]);
  assert.equal((await vault.list()).length, 2);
  assert.equal((await vault.get(left.value!.metadata.id)).body, left.value!.source);
});

test("a journaled native batch can resume after partial application without losing its originals", async t => {
  const { directory, item } = await setup(t), root = path.join(directory, "native");
  const entries = [item("One"), item("Two")]; let calls = 0, interrupt = true;
  const platform = { ...nodeVaultPlatform, id: "native-batch-contract", async replaceFiles(changes: { path: string; before: Buffer | null; after: Buffer }[]) {
    calls++;
    const journal = JSON.parse(await fs.readFile(path.join(root, ".history/sync/pending.json"), "utf8"));
    assert.equal(journal.snapshots.length, 2); assert.equal(journal.files.length, 3);
    for (const change of changes) {
      let current: Buffer | null = null; try { current = await fs.readFile(change.path); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      if (!(current === null ? change.before === null : change.before?.equals(current) || change.after.equals(current))) throw new Error("ESTALE");
    }
    for (let i = 0; i < changes.length; i++) {
      if (interrupt && i === 1) { interrupt = false; throw new Error("Injected native interruption"); }
      await fs.writeFile(changes[i].path, changes[i].after);
    }
  } };
  const vault = createVault(root, platform);
  await assert.rejects(vault.syncStore.applyBatch(entries.map(original)), /recovery record were preserved/);
  assert.equal(calls, 1);
  const reopened = createVault(root, platform);
  assert.equal((await reopened.list()).length, 2); assert.equal(calls, 2);
  assert.equal((await reopened.get(entries[0].value!.metadata.id)).body, entries[0].value!.source);
  const pending = await fs.readFile(path.join(root, ".history/sync/pending.json")).then(() => true, () => false);
  assert.equal(pending, false);
});

test("a concurrent external file after the batch journal is written stops recovery before overwriting", async t => {
  const { directory, item } = await setup(t), root = path.join(directory, "external");
  const entries = [item("One"), item("Two")]; let injected = false;
  const vault = createVault(root, { ...nodeVaultPlatform, id: "batch-journal-race", async replaceFile(...args) {
    await nodeVaultPlatform.replaceFile(...args);
    if (!injected && args[1] === path.join(root, ".history/sync/pending.json")) {
      injected = true; await fs.writeFile(path.join(root, "pages", entries[0].value!.file), "external after journal");
    }
  } });
  await assert.rejects(vault.syncStore.applyBatch(entries.map(original)), /interrupted sync conflicts/);
  assert.equal(await fs.readFile(path.join(root, "pages", entries[0].value!.file), "utf8"), "external after journal");
  await assert.rejects(fs.readFile(path.join(root, "pages", entries[1].value!.file)), { code: "ENOENT" });
  const pending = JSON.parse(await fs.readFile(path.join(root, ".history/sync/pending.json"), "utf8"));
  assert.equal(pending.snapshots[0].after.value.source, entries[0].value!.source);
});

test("batch limits include original sources when large pages are replaced by short text", async t => {
  const { directory } = await setup(t), vault = createVault(path.join(directory, "large"), nodeVaultPlatform);
  for (let i = 0; i < 3; i++) await vault.create({ title: `Large ${i}`, body: "original".repeat(384 * 1024) });
  const remote = new TestSyncRemote(); await synchronize(vault.syncStore, remote, "large-test");
  const changes = [...remote.items.values()].map(entry => ({ item: { ...entry.item, value: { ...entry.item.value, source: "short" } }, expectedVersion: entry.version }));
  await remote.push({ id: randomUUID(), mutations: changes });
  const batchSizes: number[] = [], applyBatch = vault.syncStore.applyBatch;
  vault.syncStore.applyBatch = entries => { batchSizes.push(entries.length); return applyBatch(entries); };
  assert.equal((await synchronize(vault.syncStore, remote, "large-test")).downloaded, 3);
  assert.deepEqual(batchSizes, [2]);
  assert.ok((await vault.list()).every(page => page.body === "short"));
});
