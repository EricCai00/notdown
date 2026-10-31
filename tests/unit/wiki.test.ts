import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createVault, VaultError } from "../../server/vault.js";
import { databaseTree } from "../../src/features/databases/database-tree.js";
import { mobileVaultApi } from "../../src/mobile/vault-api.js";
import { prepareNotionImport } from "../../server/notion-import.js";
import { wikiFixture, wiki } from "./notion-wiki-fixture.js";

async function fixture(t: test.TestContext) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-native-wiki-"));
  t.after(async () => { assert.equal(path.dirname(root), path.resolve(os.tmpdir())); assert.ok(path.basename(root).startsWith("notdown-native-wiki-")); await fs.rm(root, { recursive: true, force: true }); });
  const vault = createVault(root); return { root, vault };
}
const status = (code: number) => (error: unknown) => error instanceof VaultError && error.status === code;

test("page/wiki/page conversion preserves Markdown bytes, identities, nested pages, database records and properties", async t => {
  const { root, vault } = await fixture(t);
  const home = await vault.create({ title: "Knowledge", body: "# Welcome\n\nExisting home.\n", properties: { future: { keep: true } } });
  const child = await vault.create({ title: "Guide", parent: home.id, body: "Guide body", properties: { custom: 3 } });
  const grandchild = await vault.create({ title: "Details", parent: child.id, body: "Nested body" });
  const database = await vault.databases.create({ title: "Projects", parent: home.id, parentRevision: (await vault.get(home.id)).revision });
  const record = await vault.databases.createRecord(database.dataSources[0].id, { title: "Task" }, database.dataSources[0].revision);
  const files = await fs.readdir(path.join(root, "pages")), bytes = await Promise.all(files.map(file => fs.readFile(path.join(root, "pages", file), "utf8")));
  const converted = await vault.databases.turnIntoWiki(home.id, (await vault.get(home.id)).revision);
  assert.equal(converted.database.kind, "wiki"); assert.equal(converted.hostPage!.wiki, true);
  assert.equal(converted.dataSources.length, 1); assert.equal(converted.views[0].name, "All pages");
  assert.deepEqual(new Set(converted.pages.map(page => page.id)), new Set([child.id, grandchild.id]));
  assert.equal((await vault.get(grandchild.id)).parent, child.id);
  assert.equal((await vault.get(database.hostPage!.id)).parent, home.id);
  assert.equal((await vault.get(record.id)).dataSourceId, database.dataSources[0].id);
  assert.deepEqual(await Promise.all(files.map(file => fs.readFile(path.join(root, "pages", file), "utf8"))), bytes);
  await assert.rejects(vault.update(child.id, { body: "Draft from before conversion" }, child.revision), status(409));
  assert.equal((await vault.get(child.id)).body, bytes[files.indexOf(`${child.id}.md`)]);
  assert.equal(databaseTree(await vault.list(), await vault.databases.list()).pages.find(page => page.id === grandchild.id)!.parent, child.id);
  const source = await vault.databases.updateSource(converted.dataSources[0].id, { properties: [...converted.dataSources[0].properties, { id: "topic", name: "Topic", key: "topic", type: "text" }] }, converted.dataSources[0].revision);
  await vault.databases.updateCell(source.id, child.id, { baseRevision: (await vault.get(child.id)).revision, schemaRevision: source.revision, propertyId: "topic", value: "Editing" });
  const created = await vault.create({ title: "New page", parent: home.id, body: "Added in wiki" });
  assert.equal(created.dataSourceId, source.id); assert.equal(created.wikiMember, true);
  const latest = await vault.databases.get(home.id);
  const restored = await vault.databases.undoWiki(home.id, { baseRevision: latest.database.revision, hostRevision: latest.hostPage!.revision });
  assert.equal(restored.databaseId, undefined); assert.equal(restored.wiki, undefined); assert.deepEqual(restored.properties.future, { keep: true });
  for (const id of [child.id, grandchild.id, created.id]) { assert.equal((await vault.get(id)).dataSourceId, undefined); assert.equal((await vault.get(id)).wikiMember, undefined); }
  assert.equal((await vault.get(child.id)).properties.topic, "Editing"); assert.equal((await vault.get(child.id)).properties.custom, 3);
  assert.equal((await vault.get(grandchild.id)).parent, child.id);
  assert.equal((await vault.get(record.id)).dataSourceId, database.dataSources[0].id);
  assert.deepEqual((await vault.databases.list()).map(item => item.id), [database.database.id]);
  const transactions = await fs.readdir(path.join(root, ".history/database-transactions"));
  const undo = (await Promise.all(transactions.map(file => fs.readFile(path.join(root, ".history/database-transactions", file), "utf8")))).map(text => JSON.parse(text)).find(item => item.operation === "undo-wiki");
  const archived = JSON.parse(undo.files.find((file: any) => file.path === `databases/${home.id}.json`).before);
  assert.ok(archived.dataSources.some((item: any) => item.id === source.id));
  assert.ok(archived.views.some((item: any) => item.id === latest.views[0].id));
});

test("wiki source membership follows moved subtrees and ordinary database ownership stays separate", async t => {
  const { vault } = await fixture(t), wiki = await vault.databases.create({ title: "Wiki", kind: "wiki" });
  const outside = await vault.create({ title: "Outside", body: "" });
  const child = await vault.create({ title: "Guide", parent: wiki.hostPage!.id });
  const nested = await vault.create({ title: "Nested", parent: child.id });
  await vault.update(child.id, { parent: outside.id }, child.revision);
  assert.equal((await vault.get(child.id)).dataSourceId, undefined); assert.equal((await vault.get(nested.id)).dataSourceId, undefined);
  await vault.update(child.id, { parent: wiki.hostPage!.id }, (await vault.get(child.id)).revision);
  assert.equal((await vault.get(nested.id)).dataSourceId, wiki.dataSources[0].id);
  const row = await vault.databases.createRecord(wiki.dataSources[0].id, {}, wiki.dataSources[0].revision);
  assert.equal(row.wikiMember, true);
  await vault.databases.removeRecord(wiki.dataSources[0].id, child.id, (await vault.get(child.id)).revision, wiki.dataSources[0].revision);
  assert.equal((await vault.get(child.id)).parent, null); assert.equal((await vault.get(nested.id)).dataSourceId, undefined);
});

test("external Markdown children join a converted wiki without altering their YAML or unrelated metadata", async t => {
  const { root, vault } = await fixture(t), home = await vault.create({ title: "External home" });
  const externalId = randomUUID(), unrelatedId = randomUUID();
  const body = `---\nparent: ${home.id}\nfuture: preserve\n---\n# External child\n\nBody.\n`;
  await fs.writeFile(path.join(root, "pages", `${externalId}.md`), body);
  await fs.writeFile(path.join(root, "pages", `${unrelatedId}.md`), "Unrelated Markdown\n");
  const converted = await vault.databases.turnIntoWiki(home.id, home.revision);
  assert.ok(converted.pages.some(page => page.id === externalId));
  assert.equal((await vault.get(externalId)).properties.future, "preserve");
  const index = JSON.parse(await fs.readFile(path.join(root, "metadata.json"), "utf8")); assert.equal(index.pages[unrelatedId], undefined);
  await vault.databases.undoWiki(home.id, { baseRevision: converted.database.revision, hostRevision: converted.hostPage!.revision });
  assert.equal((await vault.get(externalId)).dataSourceId, undefined);
  assert.equal(await fs.readFile(path.join(root, "pages", `${externalId}.md`), "utf8"), body);
});

test("single source is enforced by the core and stale conversions preserve conflict proposals", async t => {
  const { vault, root } = await fixture(t), wiki = await vault.databases.create({ title: "Wiki", kind: "wiki" }), ordinary = await vault.databases.create({ title: "Database" });
  await assert.rejects(vault.databases.createSource(wiki.database.id, { title: "Extra" }, wiki.database.revision), status(422));
  await assert.rejects(vault.databases.linkSource(wiki.database.id, { dataSourceId: ordinary.dataSources[0].id, sourceRevision: ordinary.dataSources[0].revision }, wiki.database.revision), status(422));
  await assert.rejects(vault.databases.turnIntoWiki(ordinary.hostPage!.id, ordinary.hostPage!.revision), status(422));
  const page = await vault.create({ title: "Page" }); await vault.update(page.id, { body: "Newer body" }, page.revision);
  await assert.rejects(vault.databases.turnIntoWiki(page.id, page.revision), status(409));
  const child = await vault.create({ title: "Existing child", parent: wiki.hostPage!.id });
  const changed = await vault.update(wiki.hostPage!.id, { body: "Changed Home" }, wiki.hostPage!.revision);
  await assert.rejects(vault.databases.undoWiki(wiki.database.id, { baseRevision: wiki.database.revision, hostRevision: wiki.hostPage!.revision }), status(409));
  assert.equal((await vault.get(child.id)).dataSourceId, wiki.dataSources[0].id);
  const before = await fs.readFile(path.join(root, "metadata.json"), "utf8");
  await vault.databases.list(); await vault.databases.get(wiki.database.id);
  assert.equal(await fs.readFile(path.join(root, "metadata.json"), "utf8"), before);
  assert.equal((await vault.get(changed.id)).body, "Changed Home");
});

test("mobile transport and imported wiki Undo preserve recovered Home and child databases", async t => {
  const { vault } = await fixture(t), api = mobileVaultApi(() => vault);
  const page = await vault.create({ title: "Mobile" });
  const converted = await api(`/pages/${page.id}/wiki`, { method: "POST", body: JSON.stringify({ baseRevision: page.revision }) }) as any;
  await api(`/databases/${page.id}/undo-wiki`, { method: "POST", body: JSON.stringify({ baseRevision: converted.database.revision, hostRevision: converted.hostPage.revision }) });
  const plan = await prepareNotionImport({ token: "fixture-test-token", pageId: wiki }, { wait: async () => {}, fetch: wikiFixture() });
  await vault.importBatch(plan);
  const imported = (await vault.databases.list()).find(database => database.notionWiki)!, snapshot = await vault.databases.get(imported.id);
  const home = await vault.get(imported.homePageId as string);
  await vault.databases.undoWiki(imported.id, { baseRevision: snapshot.database.revision, hostRevision: snapshot.hostPage!.revision });
  assert.equal((await vault.get(home.id)).body, home.body); assert.equal((await vault.get(home.id)).parent, imported.pageId);
  assert.ok((await vault.databases.list()).some(database => database.parent === imported.pageId));
  for (const page of snapshot.pages) assert.equal((await vault.get(page.id)).dataSourceId, undefined);
});
