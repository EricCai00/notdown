import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createVault, VaultError } from "../../server/vault.js";
import { databaseDisplaySource } from "../../src/features/databases/database-display.js";
import type { SyntaxConfig } from "../../src/markdown-engine/config.js";
const syntax: SyntaxConfig = { version: 1, variant: "notdown", extensions: {} };
const status = (code: number) => (error: unknown) => error instanceof VaultError && error.status === code;
async function fixture(t: test.TestContext) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-database-display-")), vault = createVault(root);
  t.after(async () => { vault.closeHistory(); assert.equal(path.dirname(root), path.resolve(os.tmpdir())); await fs.rm(root, { recursive: true, force: true }); });
  const parent = await vault.create({ title: "Parent", syntax, body: "Before\r\n" });
  return { root, vault, parent, file: (id: string) => path.join(root, "databases", id + ".json") };
}
test("linked-only databases own a JSON document and share records without an empty source or Markdown host", async t => {
  const { root, vault, parent, file } = await fixture(t), owner = await vault.databases.create({ title: "Owner" }), source = owner.dataSources[0];
  const row = await vault.databases.createRecord(source.id, { title: "Shared" }, source.revision);
  const linked = await vault.databases.create({ title: "Linked", parent: parent.id, parentRevision: parent.revision, dataSourceId: source.id, sourceRevision: source.revision });
  const document = JSON.parse(await fs.readFile(file(linked.database.id), "utf8"));
  assert.deepEqual(document.dataSources, []); assert.equal(document.views[0].dataSource.databaseId, owner.database.id);
  assert.equal(linked.views[0].linked, true); assert.equal(linked.pages[0].id, row.id);
  await assert.rejects(fs.access(path.join(root, "pages", linked.database.id + ".md")));
  const created = await vault.databases.createRecord(source.id, { title: "Added from link" }, source.revision);
  assert.equal(created.parent, owner.database.id);
  const added = await vault.databases.createSource(linked.database.id, { title: "Own source later" }, linked.database.revision);
  assert.equal(added.dataSources.length, 2); assert.equal(JSON.parse(await fs.readFile(file(linked.database.id), "utf8")).dataSources.length, 1);
});
test("stale linked creation leaves all canonical files intact", async t => {
  const { root, vault, parent } = await fixture(t), owner = await vault.databases.create({ title: "Owner" }), source = owner.dataSources[0];
  await vault.databases.updateSource(source.id, { title: "Changed" }, source.revision);
  const files = await fs.readdir(path.join(root, "databases")), metadata = await fs.readFile(path.join(root, "metadata.json"), "utf8");
  await assert.rejects(vault.databases.create({ title: "Stale link", parent: parent.id, parentRevision: parent.revision, dataSourceId: source.id, sourceRevision: source.revision }), status(409));
  assert.deepEqual(await fs.readdir(path.join(root, "databases")), files); assert.equal(await fs.readFile(path.join(root, "metadata.json"), "utf8"), metadata);
});
test("display conversion changes only the parent entry and retains database JSON, identity, rows and views", async t => {
  const { root, vault, parent, file } = await fixture(t), database = await vault.databases.create({ title: "Child", parent: parent.id, parentRevision: parent.revision });
  const id = database.database.id, row = await vault.databases.createRecord(database.dataSources[0].id, { title: "Row" }, database.dataSources[0].revision);
  const body = `Before\r\n\r\n<database url="#page/${id}" inline="false" future="keep">Child</database>\r\n\r\n\`\`\`unknown\r\n<database url="#page/${id}" inline="false">Literal</database>\r\n\`\`\`\r\n`;
  const prepared = await vault.update(parent.id, { body }, parent.revision), bytes = await fs.readFile(file(id), "utf8");
  const inline = await vault.databases.display(id, { inline: true, baseRevision: database.database.revision, parentRevision: prepared.revision });
  assert.equal(inline.body, body.replace('inline="false" future=', 'inline="true" future='));
  assert.equal(await fs.readFile(file(id), "utf8"), bytes);
  const full = await vault.databases.display(id, { inline: false, baseRevision: database.database.revision, parentRevision: inline.revision });
  assert.equal(full.body, body); assert.equal((await vault.get(row.id)).parent, id);
  assert.equal((await vault.databases.get(id)).views[0].id, database.views[0].id);
  await assert.rejects(fs.access(path.join(root, "pages", id + ".md")));
});
test("stale parent conversion preserves both versions without forcing a retry", async t => {
  const { vault, parent } = await fixture(t), database = await vault.databases.create({ title: "Child", parent: parent.id, parentRevision: parent.revision });
  const changed = await vault.update(parent.id, { body: "External words\n" }, parent.revision);
  await assert.rejects(vault.databases.display(database.database.id, { inline: true, baseRevision: database.database.revision, parentRevision: parent.revision }), status(409));
  assert.equal((await vault.get(parent.id)).body, changed.body);
  assert.ok((await vault.listConflicts()).some(conflict => conflict.proposed.body.includes('<database') && conflict.current.body === changed.body));
});
test("nested database entries preserve other blocks and ambiguous references are not guessed", () => {
  const body = '<columns>\n\t<column>\n\t\tLeft\n\t</column>\n\t<column>\n\t\t<database url="#page/child" inline="false" future="keep">Child</database>\n\t</column>\n</columns>\n';
  const converted = databaseDisplaySource({ body, syntax }, "child", true);
  assert.equal(converted, body.replace('inline="false"', 'inline="true"'));
  assert.throws(() => databaseDisplaySource({ body: body + '\n<database url="#page/child" inline="false"/>\n', syntax }, "child", true), /several entries/);
});
test("conversion supports standalone page links and rejects unsupported formats or unfinished fences", () => {
  assert.match(databaseDisplaySource({ body: '[Child](#database/child)\n', syntax }, "child", true), /<database.*inline="true"/);
  assert.throws(() => databaseDisplaySource({ body: "Text", syntax: { version: 1, variant: "gfm", extensions: {} } }, "child", true), /format/);
  assert.throws(() => databaseDisplaySource({ body: "```\nunfinished", syntax }, "child", true), /unfinished/);
});
