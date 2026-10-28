import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createVault, VaultError } from "../../server/vault.js";
import { mobileVaultApi } from "../../src/mobile/vault-api.js";

async function fixture(t: test.TestContext) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-sources-"));
  t.after(async () => { assert.equal(path.dirname(root), path.resolve(os.tmpdir())); assert.ok(path.basename(root).startsWith("notdown-sources-")); await fs.rm(root, { recursive: true, force: true }); });
  const vault = createVault(root);
  const target = await vault.databases.create({ title: "Dashboard" }), owner = await vault.databases.create({ title: "Projects" });
  return { root, vault, target, owner };
}
const status = (code: number) => (error: unknown) => error instanceof VaultError && error.status === code;

test("new data sources have independent schemas and records with an atomic default view", async t => {
  const { root, vault, target } = await fixture(t), before = await vault.list();
  const next = await vault.databases.createSource(target.database.id, { title: "Tasks" }, target.database.revision);
  assert.equal(next.dataSources.length, 2); assert.equal(next.views.length, 2);
  const source = next.dataSources[1], view = next.views[1];
  assert.equal(source.ownerDatabaseId, target.database.id); assert.equal(view.dataSourceId, source.id); assert.equal(view.type, "table");
  assert.notEqual(source.id, target.dataSources[0].id);
  assert.deepEqual((await vault.list()).map(page => page.id), before.map(page => page.id));
  const changed = await vault.databases.updateSource(source.id, { properties: [...source.properties, { id: "points", key: "points", name: "Points", type: "number" }] }, source.revision);
  const row = await vault.databases.createRecord(source.id, { title: "Task", properties: { points: 7 } }, changed.revision);
  assert.equal(row.parent, target.database.pageId); assert.equal(row.dataSourceId, source.id);
  assert.equal((await vault.databases.getSource(target.dataSources[0].id)).properties.length, 1);
  const reopened = await createVault(root).databases.get(target.database.id);
  assert.equal(reopened.pages[0].id, row.id); assert.equal(reopened.dataSources.length, 2);
});

test("linking shares schema and record identities, preserves ownership, and is idempotent", async t => {
  const { root, vault, target, owner } = await fixture(t), source = owner.dataSources[0];
  const row = await vault.databases.createRecord(source.id, { title: "Shared page" }, source.revision);
  const original = await vault.update(row.id, { body: "Original Markdown" }, row.revision);
  const pageFiles = await fs.readdir(path.join(root, "pages"));
  assert.equal((await vault.databases.listSources()).find(item => item.id === source.id)?.recordCount, 1);
  let linked = await vault.databases.linkSource(target.database.id, { dataSourceId: source.id, sourceRevision: source.revision }, target.database.revision);
  assert.equal(linked.pages[0].id, row.id); assert.equal(linked.pages[0].parent, owner.hostPage!.id);
  assert.deepEqual(await fs.readdir(path.join(root, "pages")), pageFiles);
  assert.equal((await vault.databases.getSource(source.id)).revision, source.revision);
  linked = await vault.databases.linkSource(target.database.id, { dataSourceId: source.id, sourceRevision: source.revision }, linked.database.revision);
  assert.equal(linked.dataSources.length, 2); assert.equal(linked.views.length, 2);
  const schema = await vault.databases.updateSource(source.id, { title: "Shared projects", properties: [...source.properties, { id: "notes", key: "notes", name: "Notes", type: "text" }] }, source.revision);
  await vault.databases.updateCell(source.id, row.id, { baseRevision: original.revision, schemaRevision: schema.revision, propertyId: "notes", value: "Shared edit" });
  for (const id of [target.database.id, owner.database.id]) {
    const snapshot = await vault.databases.get(id);
    assert.equal(snapshot.pages[0].properties.notes, "Shared edit");
    assert.equal(snapshot.pages[0].body, "Original Markdown");
    assert.equal(snapshot.dataSources.find(item => item.id === source.id)!.title, "Shared projects");
  }
  const created = await vault.databases.createRecord(source.id, { title: "Created from linked view" }, schema.revision);
  assert.equal(created.parent, owner.hostPage!.id);
});

test("source management rejects stale revisions and trashed owners without partial resources", async t => {
  const { root, vault, target, owner } = await fixture(t), source = owner.dataSources[0];
  const changed = await vault.databases.createSource(target.database.id, { title: "New" }, target.database.revision);
  const metadata = path.join(root, "metadata.json"), before = await fs.readFile(metadata, "utf8");
  await assert.rejects(vault.databases.createSource(target.database.id, { title: "Stale" }, target.database.revision), status(409));
  await assert.rejects(vault.databases.linkSource(target.database.id, { dataSourceId: source.id, sourceRevision: source.revision }, target.database.revision), status(409));
  assert.equal(await fs.readFile(metadata, "utf8"), before);
  const updated = await vault.databases.updateSource(source.id, { title: "Renamed" }, source.revision);
  await assert.rejects(vault.databases.linkSource(target.database.id, { dataSourceId: source.id, sourceRevision: source.revision }, changed.database.revision), status(409));
  await vault.update(owner.hostPage!.id, { trashed: true }, owner.hostPage!.revision);
  assert.ok(!(await vault.databases.listSources()).some(item => item.id === source.id));
  await assert.rejects(vault.databases.linkSource(target.database.id, { dataSourceId: source.id, sourceRevision: updated.revision }, changed.database.revision), status(422));
  await vault.update(target.hostPage!.id, { trashed: true }, target.hostPage!.revision);
  await assert.rejects(vault.databases.createSource(target.database.id, { title: "Trash" }, changed.database.revision), status(422));
  assert.equal((await vault.databases.get(target.database.id)).dataSources.length, 2);
});

test("legacy source ownership stays stable through linking and the mobile transport uses the same core", async t => {
  const { root, vault, target, owner } = await fixture(t), source = owner.dataSources[0];
  const file = path.join(root, "metadata.json"), metadata = JSON.parse(await fs.readFile(file, "utf8"));
  delete metadata.dataSources[source.id].ownerDatabaseId;
  metadata.dataSources[source.id].future = { retain: true }; metadata.future = "keep";
  await fs.writeFile(file, JSON.stringify(metadata));
  const api = mobileVaultApi(() => vault), current = await vault.databases.getSource(source.id);
  assert.equal((await api("/data-sources", { method: "GET" }) as any[]).length, 2);
  const linked = await api("/databases/" + target.database.id + "/data-sources/link", { method: "POST", body: JSON.stringify({ dataSourceId: source.id, sourceRevision: current.revision, baseRevision: target.database.revision }) }) as any;
  assert.equal(linked.dataSources[1].ownerDatabaseId, owner.database.id);
  const row = await vault.databases.createRecord(source.id, { title: "Owned record" }, linked.dataSources[1].revision);
  assert.equal(row.parent, owner.hostPage!.id);
  await api("/databases/" + target.database.id + "/data-sources", { method: "POST", body: JSON.stringify({ title: "Mobile source", baseRevision: linked.database.revision }) });
  const saved = JSON.parse(await fs.readFile(file, "utf8"));
  assert.equal(saved.future, "keep"); assert.deepEqual(saved.dataSources[source.id].future, { retain: true });
});

test("source catalog exposes original ownership and per-database views without rewriting metadata", async t => {
  const { root, vault, target, owner } = await fixture(t), source = owner.dataSources[0];
  await vault.databases.createSource(owner.database.id, { title: "Another collection" }, owner.database.revision);
  const linked = await vault.databases.linkSource(target.database.id, { dataSourceId: source.id, sourceRevision: source.revision }, target.database.revision);
  await vault.update(owner.hostPage!.id, { title: "Renamed projects" }, owner.hostPage!.revision);
  const file = path.join(root, "metadata.json"), before = await fs.readFile(file, "utf8");
  const summary = (await vault.databases.listSources()).find(item => item.id === source.id)!;
  assert.equal(summary.ownerTitle, "Renamed projects");
  assert.deepEqual(summary.databases, [
    { id: owner.database.id, title: "Renamed projects", isOwner: true, views: [{ id: owner.views[0].id, name: "Table", type: "table" }] },
    { id: target.database.id, title: "Dashboard", isOwner: false, views: [{ id: linked.views[1].id, name: source.title, type: "table" }] },
  ]);
  assert.equal(await fs.readFile(file, "utf8"), before);
  await vault.update(target.hostPage!.id, { trashed: true }, target.hostPage!.revision);
  assert.deepEqual((await vault.databases.listSources()).find(item => item.id === source.id)!.databases.map(item => item.id), [owner.database.id]);
});
