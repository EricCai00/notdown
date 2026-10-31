import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { createVault, VaultError } from "../../server/vault.js";
import { createVault as portableVault } from "../../src/vault/vault.js";
import { nodeVaultPlatform } from "../../server/vault-platform.js";
import { absent, itemRevision } from "../../src/sync/protocol.js";
import { synchronize } from "../../src/sync/engine.js";
import { TestSyncRemote } from "./sync-fixture.js";
import { createLegacyDatabase } from "./database-legacy-fixture.js";
import { prepareNotionImport } from "../../server/notion-import.js";
import { wikiFixture, wiki as notionWiki } from "./notion-wiki-fixture.js";
import { databaseTree } from "../../src/features/databases/database-tree.js";

const status = (code: number) => (error: unknown) => error instanceof VaultError && error.status === code;
async function fixture(t: test.TestContext) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-database-files-"));
  const vault = createVault(root);
  t.after(async () => { vault.closeHistory(); assert.equal(path.dirname(root), path.resolve(os.tmpdir())); assert.ok(path.basename(root).startsWith("notdown-database-files-")); await fs.rm(root, { recursive: true, force: true }); });
  return { root, vault, json: (id: string) => path.join(root, "databases", id + ".json"),
    read: async (id: string) => JSON.parse(await fs.readFile(path.join(root, "databases", id + ".json"), "utf8")) };
}

test("each database owns one JSON file without a Markdown placeholder or metadata resource cache", async t => {
  const { root, vault, read } = await fixture(t), database = await vault.databases.create({ title: "Projects" });
  const id = database.database.id, source = database.dataSources[0], view = database.views[0];
  assert.deepEqual(await fs.readdir(path.join(root, "pages")), []);
  const document = await read(id);
  assert.equal(document.version, 1); assert.equal(document.id, id); assert.equal(document.kind, "database");
  assert.deepEqual(document.dataSources.map((item: any) => item.id), [source.id]);
  assert.deepEqual(document.dataSources[0].pageIds, []);
  assert.deepEqual(document.views[0].dataSource, { databaseId: id, dataSourceId: source.id });
  for (const key of ["pageId", "dataSourceIds", "viewIds", "revision", "storage"]) assert.equal(document[key], undefined);
  const schema = await vault.databases.updateSource(source.id, { properties: [...source.properties, { id: "future", key: "future", name: "Future", type: "text" }] }, source.revision);
  const row = await vault.databases.createRecord(source.id, { title: "Task", properties: { future: "keep" } }, schema.revision);
  assert.deepEqual((await read(id)).dataSources[0].pageIds, [row.id]);
  const index = JSON.parse(await fs.readFile(path.join(root, "metadata.json"), "utf8"));
  assert.equal(index.pages[id], undefined); assert.equal(index.pages[row.id].dataSourceId, undefined);
  assert.equal(index.pages[row.id].properties.future, "keep");
  for (const key of ["databases", "dataSources", "views"]) assert.equal(Object.keys(index[key] ?? {}).length, 0);
  assert.equal((await createVault(root).get(row.id)).dataSourceId, source.id);
  assert.equal(database.hostPage!.databaseProxy, true);
  assert.equal((await vault.sourceFile(id)).path, path.join(root, "databases", id + ".json"));
  assert.equal(JSON.parse((await vault.sourceFile(id)).source).views[0].id, view.id);
  await assert.rejects(vault.update(id, { body: "Cannot become a Markdown surrogate" }, (await vault.get(id)).revision), status(422));
});

test("foreign views save a link and shared records modify only their owning database file", async t => {
  const { root, vault, json, read } = await fixture(t), owner = await vault.databases.create({ title: "Owner" }), target = await vault.databases.create({ title: "Dashboard" });
  const source = owner.dataSources[0], linked = await vault.databases.linkSource(target.database.id, { dataSourceId: source.id, sourceRevision: source.revision }, target.database.revision);
  const document = await read(target.database.id), foreign = document.views.find((view: any) => view.dataSource.databaseId === owner.database.id);
  assert.deepEqual(document.dataSources.map((item: any) => item.id), [target.dataSources[0].id]);
  assert.deepEqual(foreign.dataSource, { databaseId: owner.database.id, dataSourceId: source.id });
  assert.equal(linked.views.find(view => view.id === foreign.id)!.linked, true);
  const targetBytes = await fs.readFile(json(target.database.id), "utf8");
  const row = await vault.databases.createRecord(source.id, { title: "Shared" }, source.revision);
  await vault.update(row.id, { body: "# Shared body\n" }, row.revision);
  assert.equal(await fs.readFile(json(target.database.id), "utf8"), targetBytes);
  assert.equal((await vault.databases.get(target.database.id)).pages[0].id, row.id);
  assert.deepEqual((await read(owner.database.id)).dataSources[0].pageIds, [row.id]);
  assert.deepEqual(await fs.readdir(path.join(root, "pages")), [row.id + ".md"]);
  await fs.rename(json(owner.database.id), path.join(root, "owner.saved.json"));
  const missing = await vault.databases.get(target.database.id);
  assert.equal(missing.dataSources.find(item => item.id === source.id)!.unavailable, true);
  await assert.rejects(vault.databases.createRecord(source.id, { title: "No reparenting" }, source.revision), status(422));
  assert.equal(await fs.readFile(json(target.database.id), "utf8"), targetBytes);
  const tree = databaseTree(await vault.list(), await vault.databases.list());
  assert.notEqual(tree.pages.find(page => page.id === row.id)!.parent, target.database.id);
  await fs.rename(path.join(root, "owner.saved.json"), json(owner.database.id));
  assert.equal((await vault.databases.get(target.database.id)).pages[0].body, "# Shared body\n");
});

test("canonical JSON membership overrides stale inverse metadata and conflicting owners preserve files", async t => {
  const { root, vault, json, read } = await fixture(t), database = await vault.databases.create({ title: "Owner" });
  const row = await vault.databases.createRecord(database.dataSources[0].id, { title: "Record" }, database.dataSources[0].revision);
  const indexFile = path.join(root, "metadata.json"), index = JSON.parse(await fs.readFile(indexFile, "utf8"));
  index.pages[row.id].dataSourceId = database.dataSources[0].id;
  await fs.writeFile(indexFile, JSON.stringify(index));
  const document = await read(database.database.id); document.dataSources[0].pageIds = [];
  await fs.writeFile(json(database.database.id), JSON.stringify(document));
  assert.equal((await vault.get(row.id)).dataSourceId, undefined);
  await assert.rejects(vault.update(row.id, { body: "Stale member draft" }, row.revision), status(409));
  const second = await vault.databases.create({ title: "Second owner" });
  const firstDoc = await read(database.database.id), secondDoc = await read(second.database.id);
  firstDoc.dataSources[0].pageIds = [row.id]; secondDoc.dataSources[0].pageIds = [row.id];
  const firstBytes = JSON.stringify(firstDoc), secondBytes = JSON.stringify(secondDoc);
  await fs.writeFile(json(database.database.id), firstBytes); await fs.writeFile(json(second.database.id), secondBytes);
  await assert.rejects(vault.list(), status(422));
  assert.equal(await fs.readFile(json(database.database.id), "utf8"), firstBytes);
  assert.equal(await fs.readFile(json(second.database.id), "utf8"), secondBytes);
});

test("unknown JSON fields survive schema and view edits while unrelated page saves preserve original bytes", async t => {
  const { vault, json, read } = await fixture(t), database = await vault.databases.create({ title: "Extensions" });
  const document = await read(database.database.id);
  document.future = { keep: [1, 2] }; document.dataSources[0].future = { source: true };
  document.views[0].future = "view"; document.views[0].dataSource.future = "reference";
  const original = JSON.stringify(document); await fs.writeFile(json(database.database.id), original);
  const page = await vault.create({ title: "Unrelated" }); await vault.update(page.id, { body: "Text" }, page.revision);
  assert.equal(await fs.readFile(json(database.database.id), "utf8"), original);
  const source = await vault.databases.getSource(database.dataSources[0].id);
  await vault.databases.updateSource(source.id, { title: "Renamed source" }, source.revision);
  const current = await vault.databases.get(database.database.id);
  await vault.databases.updateView(current.views[0].id, { name: "Renamed view" }, current.views[0].revision);
  const saved = await read(database.database.id);
  assert.deepEqual(saved.future, document.future); assert.deepEqual(saved.dataSources[0].future, document.dataSources[0].future);
  assert.equal(saved.views[0].future, "view"); assert.equal(saved.views[0].dataSource.future, "reference");
});

test("database file CAS detects external edits made while preparing a schema transaction", async t => {
  const { root, json } = await fixture(t); let armed = false, external = "";
  const vault = portableVault(root, { ...nodeVaultPlatform, id: "database-file-race", async replaceFile(...args) {
    if (armed && args[1].includes(path.sep + "database-transactions" + path.sep)) {
      armed = false;
      const files = await fs.readdir(path.join(root, "databases")), file = path.join(root, "databases", files[0]);
      const document = JSON.parse(await fs.readFile(file, "utf8")); document.future = "External edit";
      external = JSON.stringify(document); await fs.writeFile(file, external);
    }
    return nodeVaultPlatform.replaceFile(...args);
  } });
  t.after(() => vault.closeHistory());
  const database = await vault.databases.create({ title: "Race" }); armed = true;
  await assert.rejects(vault.databases.updateSource(database.dataSources[0].id, { title: "Proposed schema name" }, database.dataSources[0].revision), status(409));
  assert.equal(await fs.readFile(json(database.database.id), "utf8"), external);
  const conflicts = await fs.readdir(path.join(root, ".history"));
  const recovery = JSON.parse(await fs.readFile(path.join(root, ".history", conflicts.find(name => name.startsWith("page-batch-conflict-"))!), "utf8"));
  assert.ok(recovery.files.some((file: any) => file.path.startsWith("databases/") && file.after.includes("Proposed schema name") && file.current === external));
});

test("interrupted page and database membership batches recover together or stop on an external edit", async t => {
  const { root } = await fixture(t);
  for (const changed of [false, true]) {
    const folder = path.join(root, String(changed)); let armed = false;
    const vault = portableVault(folder, { ...nodeVaultPlatform, id: "database-interruption-" + changed, async replaceFile(...args) {
      if (armed && args[1].includes(path.sep + "databases" + path.sep)) { armed = false; throw new Error("Injected database interruption"); }
      return nodeVaultPlatform.replaceFile(...args);
    } });
    t.after(() => vault.closeHistory());
    const database = await vault.databases.create({ title: "Recovery" }); armed = true;
    await assert.rejects(vault.databases.createRecord(database.dataSources[0].id, { title: "Recoverable row" }, database.dataSources[0].revision), /interruption/);
    const file = path.join(folder, "databases", database.database.id + ".json");
    if (changed) { const doc = JSON.parse(await fs.readFile(file, "utf8")); doc.future = "External"; await fs.writeFile(file, JSON.stringify(doc)); }
    const reopened = createVault(folder);
    if (changed) { await assert.rejects(reopened.list(), status(503)); assert.equal(JSON.parse(await fs.readFile(file, "utf8")).future, "External"); }
    else { const recovered = await reopened.databases.get(database.database.id); assert.equal(recovered.pages.length, 1); assert.equal(recovered.pages[0].dataSourceId, database.dataSources[0].id); }
  }
});

test("database presentation conflicts can be reviewed and resolved without creating Markdown", async t => {
  const { root, vault, read } = await fixture(t), database = await vault.databases.create({ title: "Presentation" });
  const edited = await vault.update(database.database.id, { icon: "🌿", properties: { note: "Newer metadata" } }, database.hostPage!.revision);
  await assert.rejects(vault.databases.updateIcon(database.database.id, { icon: "🧭", baseRevision: database.database.revision, hostRevision: database.hostPage!.revision }), status(409));
  const conflict = (await vault.listConflicts()).find(item => item.pageId === database.database.id)!;
  assert.equal(conflict.current.icon, "🌿"); assert.equal(conflict.proposed.icon, "🧭");
  const resolved = await vault.resolveConflict(conflict.id, { icon: "🧭" }, edited.revision);
  assert.equal(resolved.icon, "🧭"); assert.equal(resolved.properties.note, "Newer metadata");
  assert.equal((await read(database.database.id)).icon, "🧭");
  await assert.rejects(fs.access(path.join(root, "pages", database.database.id + ".md")));
});

test("a database file added during a read/write operation is preserved instead of treated as a removal", async t => {
  const { root, json, read } = await fixture(t); let armed = false, reads = 0, external: any;
  const vault = portableVault(root, { ...nodeVaultPlatform, id: "database-inventory-race", fs: { ...nodeVaultPlatform.fs, async readdir(folder, options) {
    if (armed && folder === path.join(root, "databases") && ++reads === 2) { armed = false; await fs.writeFile(json(external.id), JSON.stringify(external)); }
    return nodeVaultPlatform.fs.readdir(folder, options);
  } } });
  t.after(() => vault.closeHistory());
  const database = await vault.databases.create({ title: "Existing" }); external = await read(database.database.id);
  external.id = randomUUID(); external.title = "Externally added";
  external.dataSources[0].id = randomUUID(); external.views[0].id = randomUUID();
  external.views[0].dataSource = { databaseId: external.id, dataSourceId: external.dataSources[0].id };
  armed = true;
  await assert.rejects(vault.create({ title: "Attempt during external change" }), status(409));
  assert.equal((await vault.databases.get(external.id)).database.title, "Externally added");
  assert.equal((await read(database.database.id)).title, "Existing");
});

test("database and wiki recycling removes both JSON and real Home and can restore their identities", async t => {
  const { root, json } = await fixture(t), recycle = path.join(root, "test-recycle"); await fs.mkdir(recycle);
  const vault = createVault(root, { recycleFile: file => fs.rename(file, path.join(recycle, path.basename(file))) });
  t.after(() => vault.closeHistory());
  for (const kind of ["database", "wiki"] as const) {
    const database = await vault.databases.create({ title: kind, kind }), source = database.dataSources[0];
    const row = await vault.databases.createRecord(source.id, { title: "Child" }, source.revision);
    const host = await vault.get(database.database.id), trashed = await vault.update(host.id, { trashed: true }, host.revision);
    await vault.recycle(host.id, trashed.revision, { [host.id]: trashed.revision, [row.id]: row.revision });
    await assert.rejects(fs.access(json(host.id))); await assert.rejects(vault.databases.get(host.id), status(404));
    assert.ok(!(await vault.list({ includeTrashed: true })).some(page => page.id === host.id));
    await fs.rename(path.join(recycle, host.id + ".json"), json(host.id));
    for (const id of [...(kind === "wiki" ? [host.id] : []), row.id]) await fs.rename(path.join(recycle, id + ".md"), path.join(root, "pages", id + ".md"));
    await vault.update(host.id, { trashed: false }, (await vault.get(host.id)).revision);
    assert.equal((await vault.databases.get(host.id)).pages[0].id, row.id);
  }
});

test("legacy migration is explicit, stale previews abort, and source ownership and unknown fields survive", async t => {
  const { root, vault, read, json } = await fixture(t), legacy = await createLegacyDatabase(root, vault, { title: "Legacy" });
  const source = legacy.dataSources[0], row = await vault.databases.createRecord(source.id, { title: "Existing row" }, source.revision);
  const file = path.join(root, "metadata.json"), index = JSON.parse(await fs.readFile(file, "utf8"));
  index.future = { keep: true }; index.databases[legacy.database.id].future = "database";
  index.dataSources[source.id].future = "source"; delete index.dataSources[source.id].ownerDatabaseId;
  index.pages[legacy.database.id].future = "original host";
  await fs.writeFile(file, JSON.stringify(index));
  const before = await fs.readFile(file, "utf8"); await vault.databases.list();
  assert.equal(await fs.readFile(file, "utf8"), before); await assert.rejects(fs.access(json(legacy.database.id)));
  const stale = await vault.databaseStorage.plan();
  const currentRow = await vault.get(row.id); await vault.update(row.id, { body: "Newer text" }, currentRow.revision);
  await assert.rejects(vault.databaseStorage.migrate(stale.baseRevision), status(409));
  assert.ok((await fs.readdir(path.join(root, "pages"))).includes(legacy.database.id + ".md"));
  const result = await vault.databaseStorage.migrate((await vault.databaseStorage.plan()).baseRevision);
  assert.equal(result.migrated, 1);
  const document = await read(legacy.database.id);
  assert.equal(document.future, "database"); assert.equal(document.legacyPageMetadata.future, "original host");
  assert.equal(document.dataSources[0].future, "source"); assert.deepEqual(document.dataSources[0].pageIds, [row.id]);
  await assert.rejects(fs.access(path.join(root, "pages", legacy.database.id + ".md")));
  const saved = JSON.parse(await fs.readFile(file, "utf8")); assert.deepEqual(saved.future, index.future);
  assert.equal(saved.dataSources[source.id], undefined); assert.equal(saved.pages[row.id].dataSourceId, undefined);
  assert.equal((await vault.get(row.id)).body, "Newer text");
  const recovery = JSON.parse(await fs.readFile(result.recoveryPath!, "utf8"));
  assert.ok(recovery.files.some((file: any) => file.path === "metadata.json" && file.before.includes("original host")));
  assert.equal((await vault.databaseStorage.migrate((await vault.databaseStorage.plan()).baseRevision)).migrated, 0);
  await fs.rename(json(legacy.database.id), path.join(root, "removed-database.json"));
  assert.deepEqual(await vault.databases.list(), []);
});

test("nonempty legacy hosts are preserved until their Home/page mapping is reviewed", async t => {
  const { root, vault, json } = await fixture(t), database = await createLegacyDatabase(root, vault, { title: "Content" });
  await vault.update(database.hostPage!.id, { body: "# Keep Markdown\n" }, database.hostPage!.revision);
  const plan = await vault.databaseStorage.plan(); assert.equal(plan.blocked.length, 1);
  await assert.rejects(vault.databaseStorage.migrate(plan.baseRevision), status(422));
  await assert.rejects(fs.access(json(database.database.id)));
  assert.equal(await fs.readFile(path.join(root, "pages", database.database.id + ".md"), "utf8"), "# Keep Markdown\n");
});

test("migration keeps foreign ownership and a real Wiki Home without changing Markdown", async t => {
  const { root, vault, read } = await fixture(t), owner = await createLegacyDatabase(root, vault, { title: "Legacy owner" }), target = await createLegacyDatabase(root, vault, { title: "Legacy link" });
  const source = owner.dataSources[0], row = await vault.databases.createRecord(source.id, { title: "Owned" }, source.revision);
  await vault.databases.linkSource(target.database.id, { dataSourceId: source.id, sourceRevision: source.revision }, target.database.revision);
  const wiki = await createLegacyDatabase(root, vault, { title: "Legacy wiki", kind: "wiki" });
  const home = await vault.update(wiki.hostPage!.id, { body: "# Preserve Home\r\n" }, wiki.hostPage!.revision);
  const child = await vault.create({ title: "Wiki child", parent: home.id, body: "Child text" });
  const result = await vault.databaseStorage.migrate((await vault.databaseStorage.plan()).baseRevision);
  assert.equal(result.migrated, 3);
  const linked = await read(target.database.id), converted = await read(wiki.database.id);
  assert.equal(linked.dataSources.length, 1); assert.equal(linked.views[1].dataSource.databaseId, owner.database.id);
  assert.equal((await vault.get(row.id)).parent, owner.database.id);
  assert.equal(converted.homePageId, home.id); assert.equal(converted.dataSources.length, 1);
  assert.deepEqual(converted.dataSources[0].pageIds, [child.id]);
  assert.equal(await fs.readFile(path.join(root, "pages", home.id + ".md"), "utf8"), "# Preserve Home\r\n");
});

test("malformed files and colliding identities are rejected without overwriting originals", async t => {
  const { root, vault, json, read } = await fixture(t), database = await vault.databases.create({ title: "Validate" });
  const document = await read(database.database.id), file = json(database.database.id);
  for (const source of ["{broken", JSON.stringify({ ...document, id: randomUUID() }), JSON.stringify({ ...document, dataSources: [{ ...document.dataSources[0], pageIds: [database.database.id] }] })]) {
    await fs.writeFile(file, source); await assert.rejects(vault.list());
    assert.equal(await fs.readFile(file, "utf8"), source);
  }
  await fs.writeFile(file, JSON.stringify(document));
  const collision = path.join(root, "pages", database.database.id + ".md"); await fs.writeFile(collision, "Unexpected Markdown");
  await assert.rejects(vault.list(), status(422)); assert.equal(await fs.readFile(collision, "utf8"), "Unexpected Markdown");
});

test("interrupted Notion imports resume file databases without recreating Markdown hosts", async t => {
  const { root } = await fixture(t); let interrupted = false;
  const vault = portableVault(root, { ...nodeVaultPlatform, id: "database-import-resume", async replaceFile(...args) {
    if (!interrupted && args[1] === path.join(root, "metadata.json") && (await fs.readFile(args[0], "utf8")).includes('"externalEntities"')) {
      interrupted = true; throw new Error("Injected import finalization interruption");
    }
    return nodeVaultPlatform.replaceFile(...args);
  } });
  t.after(() => vault.closeHistory());
  const plan = await prepareNotionImport({ token: "fixture-test-token", pageId: notionWiki }, { wait: async () => {}, fetch: wikiFixture() });
  await assert.rejects(vault.importBatch(plan), status(500)); assert.ok(interrupted);
  const filesBefore = await fs.readdir(path.join(root, "databases")); assert.ok(filesBefore.length > 0);
  const result = await vault.importBatch(plan); assert.equal(result.alreadyImported, false);
  for (const database of await vault.databases.list()) {
    const host = await vault.get(database.id); if (host.databaseProxy) await assert.rejects(fs.access(path.join(root, "pages", database.id + ".md")));
  }
  assert.equal((await vault.importBatch(plan)).alreadyImported, true);
});

test("backups and Git capture include database files and retain the actual Wiki Home", async t => {
  const { root, vault, read } = await fixture(t), database = await vault.databases.create({ title: "Only JSON" });
  const home = await vault.databases.create({ title: "Wiki", kind: "wiki" });
  await vault.update(home.hostPage!.id, { body: "# Actual Home\n" }, home.hostPage!.revision);
  const files = await vault.exportFiles(), capture = await vault.captureHistory();
  assert.equal(capture.databases.length, 2); assert.ok(!capture.pages.some(page => page.id === database.database.id));
  assert.equal(capture.pages.find(page => page.id === home.database.id)!.source, "# Actual Home\n");
  const restored = createVault(path.join(root, "restored")); t.after(() => restored.closeHistory());
  await restored.restoreFiles(files);
  assert.deepEqual(JSON.parse((await restored.sourceFile(database.database.id)).source), await read(database.database.id));
  assert.equal((await restored.get(home.database.id)).body, "# Actual Home\n");
});

test("removing a Wiki cover updates its database document and preserves Home properties", async t => {
  const { root, vault, read } = await fixture(t), wiki = await vault.databases.create({ title: "Cover", kind: "wiki" });
  const covered = await vault.update(wiki.hostPage!.id, { properties: { cover: "/page-covers/woodcuts_9.jpg", coverPosition: 35, future: "Keep" } }, wiki.hostPage!.revision);
  const cleared = await vault.update(covered.id, { properties: { future: "Keep" } }, covered.revision);
  assert.equal(cleared.properties.cover, undefined); assert.equal(cleared.properties.coverPosition, undefined);
  const reopened = await createVault(root).get(cleared.id);
  assert.equal(reopened.properties.cover, undefined); assert.equal(reopened.properties.future, "Keep");
  assert.equal((await read(cleared.id)).properties.cover, undefined);
});

test("a distinct legacy host identity blocks migration instead of leaving duplicate containers", async t => {
  const { root, vault, json } = await fixture(t), legacy = await createLegacyDatabase(root, vault, { title: "Distinct host" });
  const hostId = randomUUID(), file = path.join(root, "metadata.json"), index = JSON.parse(await fs.readFile(file, "utf8"));
  index.databases[legacy.database.id].pageId = hostId;
  index.pages[hostId] = { ...index.pages[legacy.database.id], id: hostId, file: hostId + ".md" }; delete index.pages[legacy.database.id];
  await fs.rename(path.join(root, "pages", legacy.database.id + ".md"), path.join(root, "pages", hostId + ".md"));
  const original = JSON.stringify(index); await fs.writeFile(file, original);
  const plan = await vault.databaseStorage.plan(); assert.match(plan.blocked[0], /distinct legacy host/);
  await assert.rejects(vault.databaseStorage.migrate(plan.baseRevision), status(422));
  assert.equal(await fs.readFile(file, "utf8"), original); await assert.rejects(fs.access(json(legacy.database.id)));
});

test("legacy sync downloads retain hosts and resources without an implicit file migration", async t => {
  const { root, vault, json } = await fixture(t);
  const legacy = await createLegacyDatabase(root, vault, { title: "Legacy shared database" });
  const source = legacy.dataSources[0];
  const row = await vault.databases.createRecord(source.id, { title: "Legacy record" }, source.revision);
  await vault.update(row.id, { body: "Original legacy record\r\n" }, row.revision);
  const file = path.join(root, "metadata.json"), index = JSON.parse(await fs.readFile(file, "utf8"));
  index.databases[legacy.database.id].futureDatabase = { keep: true };
  await fs.writeFile(file, JSON.stringify(index));
  for (const batching of [true, false]) {
    const remote = new TestSyncRemote(), peerRoot = path.join(root, `peer-${batching}`), peer = createVault(peerRoot);
    t.after(() => peer.closeHistory());
    const account = `legacy-sync-${batching}`;
    await remote.push({ id: randomUUID(), mutations: (await vault.syncStore.list()).map(item => ({ item, expectedVersion: 0 })) });
    const store = batching ? peer.syncStore : { ...peer.syncStore, applyBatch: undefined, readItems: undefined };
    await synchronize(store, remote, account);
    const received = await peer.databases.get(legacy.database.id);
    assert.equal(received.pages[0].id, row.id);
    assert.equal(received.pages[0].body, "Original legacy record\r\n");
    assert.equal(await fs.readFile(path.join(peerRoot, "pages", legacy.database.id + ".md"), "utf8"), "");
    await assert.rejects(fs.access(path.join(peerRoot, "databases", legacy.database.id + ".json")));
    const metadata = JSON.parse(await fs.readFile(path.join(peerRoot, "metadata.json"), "utf8"));
    assert.deepEqual(metadata.databases[legacy.database.id].futureDatabase, { keep: true });
    const record = await peer.get(row.id);
    await peer.update(row.id, { body: "Edited after download" }, record.revision);
    assert.equal((await peer.databases.get(legacy.database.id)).pages[0].body, "Edited after download");
    assert.equal((await synchronize(store, remote, account)).conflicts, 0);
  }
  await assert.rejects(fs.access(json(legacy.database.id)));
});

test("file-level sync carries owned membership and linked views without resource or page duplicates", async t => {
  const { root, vault } = await fixture(t), owner = await vault.databases.create({ title: "Owner" }), target = await vault.databases.create({ title: "Linked" });
  const source = owner.dataSources[0], row = await vault.databases.createRecord(source.id, { title: "Synced row" }, source.revision);
  await vault.databases.linkSource(target.database.id, { dataSourceId: source.id, sourceRevision: source.revision }, target.database.revision);
  const items = await vault.syncStore.list();
  assert.equal(items.filter(item => item.key.startsWith("metadata:databaseFiles/")).length, 2);
  assert.ok(!items.some(item => /^metadata:(databases|dataSources|views)\//.test(item.key)));
  assert.ok(!items.some(item => item.key === "page:" + owner.database.id));
  const remote = new TestSyncRemote(), peer = createVault(path.join(root, "peer")); t.after(() => peer.closeHistory());
  await synchronize(vault.syncStore, remote, "file-sync"); await synchronize(peer.syncStore, remote, "file-sync");
  assert.equal((await peer.databases.get(target.database.id)).pages[0].id, row.id);
  const received = await peer.get(row.id); await peer.update(row.id, { body: "Edited on peer" }, received.revision);
  await synchronize(peer.syncStore, remote, "file-sync"); await synchronize(vault.syncStore, remote, "file-sync");
  assert.equal((await vault.get(row.id)).body, "Edited on peer");
  assert.equal((await peer.databases.get(target.database.id)).views.filter(view => view.linked).length, 1);
  const localSchema = await vault.databases.getSource(source.id), peerSchema = await peer.databases.getSource(source.id);
  await vault.databases.updateSource(source.id, { title: "Local schema" }, localSchema.revision);
  await peer.databases.updateSource(source.id, { title: "Peer schema" }, peerSchema.revision);
  await synchronize(vault.syncStore, remote, "file-sync");
  assert.equal((await synchronize(peer.syncStore, remote, "file-sync")).conflicts, 1);
  const conflict = (await peer.syncStore.conflicts())[0];
  assert.equal(conflict.key, "metadata:databaseFiles/" + owner.database.id);
  assert.equal(conflict.remote.item.value!.data.dataSources[0].title, "Local schema");
  assert.equal((await peer.databases.getSource(source.id)).title, "Peer schema");
  const corrupt = { kind: "metadata" as const, key: "metadata:databaseFiles/" + randomUUID(), value: { data: { version: 1 } } };
  await assert.rejects(peer.syncStore.apply(corrupt, itemRevision(absent(corrupt))), status(422));
});
