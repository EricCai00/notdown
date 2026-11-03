import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createVault, VaultError } from "../../server/vault.js";

async function fixture(t: test.TestContext, fail = false) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-trash-source-"));
  const bin = path.join(root, "fake-bin"); await fs.mkdir(bin);
  const vault = createVault(root, { recycleFile: async file => {
    if (fail) throw new Error("System recycle failed");
    await fs.rename(file, path.join(bin, path.basename(file)));
  } });
  t.after(async () => {
    vault.closeHistory();
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith("notdown-trash-source-"));
    await fs.rm(root, { recursive: true, force: true });
  });
  const db = await vault.databases.create({ title: "Keep owner" }), source = db.dataSources[0];
  return { root, bin, vault, db, source };
}

test("recycling a trashed source preserves its owner, linked views and recovery material", async t => {
  const { root, bin, vault, db, source } = await fixture(t);
  const linked = await vault.databases.create({ title: "Linked", dataSourceId: source.id, sourceRevision: source.revision });
  const record = await vault.databases.createRecord(source.id, { title: "Record" }, source.revision);
  const row = await vault.update(record.id, { body: "Exact body\r\n" }, record.revision);
  const child = await vault.create({ title: "Child", parent: row.id });
  const keep = await vault.create({ title: "Keep active" });
  let owner = await vault.databases.get(db.database.id);
  owner = await vault.databases.trashSource(source.id, { baseRevision: source.revision, databaseRevision: owner.database.revision, trashed: true });
  const trashed = owner.dataSources.find(item => item.id === source.id)!;
  const result = await vault.databases.recycleSource(source.id, { baseRevision: trashed.revision, databaseRevision: owner.database.revision, baseRevisions: { [row.id]: row.revision, [child.id]: child.revision } });
  assert.deepEqual(result.recycled, [child.id, row.id]);
  assert.equal((await vault.get(keep.id)).title, keep.title);
  assert.equal((await vault.databases.get(db.database.id)).dataSources.length, 0);
  const foreign = await vault.databases.get(linked.database.id);
  assert.equal(foreign.views[0].dataSourceId, source.id);
  assert.equal(foreign.dataSources[0].unavailable, true);
  assert.ok(!(await vault.databases.listSources(true)).some(item => item.id === source.id));
  assert.equal(await fs.readFile(path.join(bin, row.id + ".md"), "utf8"), row.body);
  assert.ok((await fs.readdir(path.join(root, ".history", "database-transactions"))).length > 0);
  assert.ok((await fs.readdir(path.join(root, ".history", row.id))).length > 0);
  assert.equal((await createVault(root).databases.get(db.database.id)).dataSources.length, 0);
});

test("source recycling rejects active sources, stale pages and changed record membership before deletion", async t => {
  const { root, bin, vault, db, source } = await fixture(t);
  await assert.rejects(vault.databases.recycleSource(source.id, { baseRevision: source.revision, databaseRevision: db.database.revision, baseRevisions: {} }), /Trash before deleting/);
  const row = await vault.databases.createRecord(source.id, { title: "Record" }, source.revision);
  const owner = await vault.databases.trashSource(source.id, { baseRevision: source.revision, databaseRevision: (await vault.databases.get(db.database.id)).database.revision, trashed: true });
  const trashed = owner.dataSources[0];
  const input = { baseRevision: trashed.revision, databaseRevision: owner.database.revision, baseRevisions: { [row.id]: row.revision } };
  await assert.rejects(vault.databases.recycleSource(source.id, { ...input, baseRevisions: {} }), /pages changed/);
  await fs.writeFile(path.join(root, "pages", row.id + ".md"), "External edit");
  await assert.rejects(vault.databases.recycleSource(source.id, input), (error: unknown) => error instanceof VaultError && error.status === 409);
  assert.equal((await vault.get(row.id)).body, "External edit");
  assert.equal((await vault.listConflicts()).length, 1);
  assert.deepEqual(await fs.readdir(bin), []);
});

test("source recycling rejects stale resource revisions and retains its records on native failure", async t => {
  const { vault, db, source } = await fixture(t, true);
  const row = await vault.databases.createRecord(source.id, { title: "Record" }, source.revision);
  const owner = await vault.databases.trashSource(source.id, { baseRevision: source.revision, databaseRevision: (await vault.databases.get(db.database.id)).database.revision, trashed: true });
  const input = { baseRevision: owner.dataSources[0].revision, databaseRevision: owner.database.revision, baseRevisions: { [row.id]: row.revision } };
  await assert.rejects(vault.databases.recycleSource(source.id, { ...input, databaseRevision: "0".repeat(64) }), (error: unknown) => error instanceof VaultError && error.status === 409);
  await assert.rejects(vault.databases.recycleSource(source.id, input), /could not recycle/);
  assert.equal((await vault.get(row.id)).title, "Record");
  assert.equal((await vault.databases.listSources(true))[0].trashed, true);
});

test("empty trashed sources can be removed without deleting their active database", async t => {
  const { vault, db, source } = await fixture(t);
  const owner = await vault.databases.trashSource(source.id, { baseRevision: source.revision, databaseRevision: db.database.revision, trashed: true });
  const result = await vault.databases.recycleSource(source.id, { baseRevision: owner.dataSources[0].revision, databaseRevision: owner.database.revision, baseRevisions: {} });
  assert.deepEqual(result.recycled, []);
  assert.equal((await vault.databases.get(db.database.id)).views.length, 0);
  assert.equal((await vault.databases.list()).length, 1);
  assert.equal((await vault.databases.listSources(true)).length, 0);
});
