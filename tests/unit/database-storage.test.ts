import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createVault, VaultError } from "../../server/vault.js";
import { prepareMarkdownImport } from "../../server/markdown-import.js";
import { createLegacyDatabase } from "./database-legacy-fixture.js";

async function fixture(t: test.TestContext) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-database-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const vault = createVault(root), snapshot = await createLegacyDatabase(root, vault, { title: "Tasks" });
  const source = await vault.databases.updateSource(snapshot.dataSources[0].id, { properties: [
    ...snapshot.dataSources[0].properties,
    { id: "status", key: "status", name: "Status", type: "select", options: [{ id: "todo", name: "Todo" }, { id: "done", name: "Done" }] },
    { id: "points", key: "points", name: "Points", type: "number" },
    { id: "checked", key: "checked", name: "Checked", type: "checkbox" },
  ] }, snapshot.dataSources[0].revision);
  return { root, vault, snapshot, source };
}
const status = (code: number) => (error: unknown) => error instanceof VaultError && error.status === code;

test("native databases have canonical root or nested pages and record children", async t => {
  const { root, vault, snapshot, source } = await fixture(t);
  assert.equal(snapshot.database.pageId, snapshot.database.id);
  assert.equal(snapshot.hostPage!.id, snapshot.database.id);
  assert.equal(snapshot.hostPage!.databaseId, snapshot.database.id);
  assert.equal(snapshot.hostPage!.parent, null);
  assert.equal(snapshot.hostPage!.icon, "table-2");
  assert.equal(source.ownerDatabaseId, snapshot.database.id);
  const parent = await vault.create({ title: "Project" });
  const nested = await vault.databases.create({ title: "Tasks inside project", parent: parent.id, parentRevision: parent.revision });
  assert.equal(nested.database.parent, parent.id);
  assert.equal(nested.hostPage!.parent, parent.id);
  const row = await vault.databases.createRecord(nested.dataSources[0].id, { title: "Task" }, nested.dataSources[0].revision);
  assert.equal(row.parent, nested.hostPage!.id);
  const renamed = await vault.update(nested.hostPage!.id, { title: "Renamed collection" }, nested.hostPage!.revision);
  assert.equal((await createVault(root).databases.get(nested.database.id)).database.title, "Renamed collection");
  assert.equal((await vault.databases.list()).find(database => database.id === nested.database.id)!.title, "Renamed collection");
  const trashed = await vault.update(renamed.id, { trashed: true }, renamed.revision);
  assert.equal((await vault.list()).some(page => page.id === row.id), false);
  assert.equal((await vault.databases.list()).some(database => database.id === nested.database.id), false);
  await vault.update(trashed.id, { trashed: false }, trashed.revision);
  assert.equal((await vault.databases.get(nested.database.id)).pages[0].id, row.id);
});

test("stale or trashed database parents cannot create orphan pages or resources", async t => {
  const { root, vault } = await fixture(t);
  const parent = await vault.create({ title: "Parent" });
  const changed = await vault.update(parent.id, { title: "Changed" }, parent.revision);
  const before = await fs.readFile(path.join(root, "metadata.json"), "utf8"), files = await fs.readdir(path.join(root, "pages"));
  await assert.rejects(vault.databases.create({ title: "Not created", parent: parent.id, parentRevision: parent.revision }), status(409));
  assert.equal(await fs.readFile(path.join(root, "metadata.json"), "utf8"), before);
  assert.deepEqual(await fs.readdir(path.join(root, "pages")), files);
  assert.equal((await fs.readdir(path.join(root, ".history", "database-conflicts"))).length, 1);
  await assert.rejects(vault.databases.create({ title: "Revision required", parent: parent.id }), status(400));
  const trashed = await vault.update(parent.id, { trashed: true }, changed.revision);
  await assert.rejects(vault.databases.create({ title: "Not created", parent: parent.id, parentRevision: trashed.revision }), status(422));
});

test("database host transaction recovery includes resources and unknown metadata", async t => {
  const { root, vault } = await fixture(t);
  const metadataPath = path.join(root, "metadata.json");
  const index = JSON.parse(await fs.readFile(metadataPath, "utf8")); index.future = { untouched: [1, 2] };
  await fs.writeFile(metadataPath, JSON.stringify(index));
  const before = await fs.readFile(metadataPath, "utf8");
  const created = await createLegacyDatabase(root, vault, { title: "Interrupted database" });
  const after = await fs.readFile(metadataPath, "utf8"), id = created.hostPage!.id;
  // Simulate stopping after publishing the empty Markdown but before metadata.
  await fs.writeFile(metadataPath, before);
  const pending = path.join(root, ".history", `pending-${id}.json`);
  await fs.writeFile(pending, JSON.stringify({ file: `${id}.md`, previousSource: null, source: "", before, after }));
  const recovered = await createVault(root).databases.get(created.database.id);
  assert.equal(recovered.hostPage!.id, id);
  assert.equal(recovered.dataSources[0].ownerDatabaseId, id);
  assert.deepEqual(JSON.parse(await fs.readFile(metadataPath, "utf8")).future, { untouched: [1, 2] });
  await assert.rejects(fs.access(pending));
});

test("legacy unhosted databases are read without migration and can still add records", async t => {
  const { root, vault, snapshot, source } = await fixture(t);
  const metadataPath = path.join(root, "metadata.json"), index = JSON.parse(await fs.readFile(metadataPath, "utf8"));
  delete index.databases[snapshot.database.id].pageId;
  delete index.dataSources[source.id].ownerDatabaseId;
  delete index.pages[snapshot.database.id];
  await fs.rm(path.join(root, "pages", `${snapshot.database.id}.md`));
  await fs.writeFile(metadataPath, JSON.stringify(index));
  const before = await fs.readFile(metadataPath, "utf8");
  const legacy = await vault.databases.get(snapshot.database.id);
  assert.equal(legacy.hostPage, undefined); assert.equal(legacy.database.pageId, undefined);
  assert.equal(legacy.database.parent, null);
  assert.equal(await fs.readFile(metadataPath, "utf8"), before);
  const record = await vault.databases.createRecord(source.id, { title: "Legacy record" }, legacy.dataSources[0].revision);
  assert.equal(record.parent, null); assert.equal(record.dataSourceId, source.id);
  assert.equal((await vault.databases.get(snapshot.database.id)).hostPage, undefined);
});

test("page actions cannot accidentally change database membership or clone a host identity", async t => {
  const { vault, snapshot, source } = await fixture(t);
  const record = await vault.databases.createRecord(source.id, { title: "Record" }, source.revision);
  await assert.rejects(vault.update(record.id, { parent: null }, record.revision), status(422));
  const plain = await vault.create({ title: "Plain" });
  await assert.rejects(vault.update(plain.id, { parent: snapshot.hostPage!.id }, plain.revision), status(422));
  await assert.rejects(vault.create({ title: "Not a record", parent: snapshot.hostPage!.id }), status(422));
  await assert.rejects(vault.duplicate(snapshot.hostPage!.id, snapshot.hostPage!.revision), status(422));
  const duplicate = await vault.duplicate(record.id, record.revision);
  assert.equal(duplicate.parent, snapshot.hostPage!.id); assert.equal(duplicate.dataSourceId, source.id);
});

test("database icons use the host page as their authority and preserve Markdown and unknown fields", async t => {
  const { root, vault, snapshot } = await fixture(t);
  const original = await vault.update(snapshot.hostPage!.id, { body: "# Host body\n\nKeep this exact source.\n" }, snapshot.hostPage!.revision);
  const metadataPath = path.join(root, "metadata.json"), index = JSON.parse(await fs.readFile(metadataPath, "utf8"));
  index.future = { keep: true }; index.databases[snapshot.database.id].future = [1, 2]; index.pages[original.id].future = "page extension";
  await fs.writeFile(metadataPath, JSON.stringify(index));
  const current = await vault.databases.get(snapshot.database.id);
  const saved = await vault.databases.updateIcon(snapshot.database.id, { icon: "🧩", baseRevision: current.database.revision, hostRevision: current.hostPage!.revision });
  assert.equal(saved.database.icon, "🧩"); assert.equal(saved.hostPage!.icon, "🧩");
  assert.equal(saved.hostPage!.body, original.body);
  assert.equal((await vault.databases.list()).find(database => database.id === snapshot.database.id)!.icon, "🧩");
  const persisted = JSON.parse(await fs.readFile(metadataPath, "utf8"));
  assert.equal(persisted.pages[original.id].icon, "🧩");
  assert.equal(persisted.databases[snapshot.database.id].icon, undefined);
  assert.deepEqual(persisted.future, { keep: true }); assert.deepEqual(persisted.databases[snapshot.database.id].future, [1, 2]);
  assert.equal(persisted.pages[original.id].future, "page extension");
  const removed = await vault.databases.updateIcon(snapshot.database.id, { icon: "", baseRevision: saved.database.revision, hostRevision: saved.hostPage!.revision });
  assert.equal(removed.hostPage!.icon, ""); assert.equal(removed.database.icon, "");
  const direct = await vault.update(original.id, { icon: "lucide:table-2" }, removed.hostPage!.revision);
  assert.equal((await createVault(root).databases.get(snapshot.database.id)).database.icon, direct.icon);
});

test("database icon edits require both resource and host revisions and preserve stale choices", async t => {
  const { root, vault, snapshot } = await fixture(t);
  await assert.rejects(vault.databases.updateIcon(snapshot.database.id, { icon: "🧩", baseRevision: snapshot.database.revision }), status(400));
  const changed = await vault.update(snapshot.hostPage!.id, { icon: "🗂️" }, snapshot.hostPage!.revision);
  await assert.rejects(vault.databases.updateIcon(snapshot.database.id, { icon: "🧩", baseRevision: snapshot.database.revision, hostRevision: snapshot.hostPage!.revision }), status(409));
  const conflict = (await vault.listConflicts())[0];
  assert.equal(conflict.current.icon, "🗂️"); assert.equal(conflict.proposed.icon, "🧩");
  await vault.databases.createView(snapshot.database.id, { name: "Other view" }, snapshot.database.revision);
  await assert.rejects(vault.databases.updateIcon(snapshot.database.id, { icon: "⭐", baseRevision: snapshot.database.revision, hostRevision: changed.revision }), status(409));
  assert.equal((await vault.get(changed.id)).icon, "🗂️");
  const files = await fs.readdir(path.join(root, ".history", "database-conflicts"));
  const resourceConflict = JSON.parse(await fs.readFile(path.join(root, ".history", "database-conflicts", files[0]), "utf8"));
  assert.equal(resourceConflict.proposed.icon, "⭐");
});

test("legacy database icons remain metadata-only and validate icon input", async t => {
  const { root, vault, snapshot } = await fixture(t);
  const metadataPath = path.join(root, "metadata.json"), index = JSON.parse(await fs.readFile(metadataPath, "utf8"));
  delete index.databases[snapshot.database.id].pageId; delete index.pages[snapshot.database.id];
  index.databases[snapshot.database.id].future = "retained";
  await fs.rm(path.join(root, "pages", `${snapshot.database.id}.md`));
  await fs.writeFile(metadataPath, JSON.stringify(index));
  const legacy = await vault.databases.get(snapshot.database.id), beforePages = await fs.readdir(path.join(root, "pages"));
  for (const icon of [null, "x".repeat(101), 42]) await assert.rejects(vault.databases.updateIcon(snapshot.database.id, { icon: icon as string, baseRevision: legacy.database.revision }), status(400));
  const saved = await vault.databases.updateIcon(snapshot.database.id, { icon: "lucide:database", baseRevision: legacy.database.revision });
  assert.equal(saved.hostPage, undefined); assert.equal(saved.database.icon, "lucide:database");
  assert.equal(saved.database.future, "retained");
  assert.deepEqual(await fs.readdir(path.join(root, "pages")), beforePages);
  await assert.rejects(vault.databases.updateIcon(snapshot.database.id, { icon: "⭐", baseRevision: legacy.database.revision }), status(409));
  assert.equal((await createVault(root).databases.list()).find(database => database.id === snapshot.database.id)!.icon, "lucide:database");
  assert.ok((await fs.readdir(path.join(root, ".history", "database-transactions"))).length > 0);
});

test("document icon overrides reject database picker changes without touching the source", async t => {
  const { root, vault, snapshot } = await fixture(t);
  const page = await vault.update(snapshot.hostPage!.id, { body: "---\nicon: 🌻\ncustom: keep\n---\nBody\n" }, snapshot.hostPage!.revision);
  const before = await fs.readFile(path.join(root, "metadata.json"), "utf8");
  const current = await vault.databases.get(snapshot.database.id);
  assert.equal(current.database.icon, "🌻");
  await assert.rejects(vault.databases.updateIcon(snapshot.database.id, { icon: "🧩", baseRevision: current.database.revision, hostRevision: page.revision }), status(422));
  assert.equal(await fs.readFile(path.join(root, "metadata.json"), "utf8"), before);
  assert.equal((await vault.get(page.id)).body, page.body);
});

test("database title editing shares host CAS and does not rewrite Markdown", async t => {
  const { root, vault, snapshot } = await fixture(t);
  const page = await vault.update(snapshot.hostPage!.id, { body: "# Actual content\n\nKeep **formatting**.\n" }, snapshot.hostPage!.revision);
  const current = await vault.databases.get(snapshot.database.id);
  const saved = await vault.databases.updatePresentation(snapshot.database.id, { title: "Renamed database", icon: "⭐", baseRevision: current.database.revision, hostRevision: page.revision });
  assert.equal(saved.database.title, "Renamed database"); assert.equal(saved.hostPage!.title, "Renamed database");
  assert.equal(saved.database.icon, "⭐"); assert.equal(saved.hostPage!.body, page.body);
  assert.equal(await fs.readFile(path.join(root, "pages", `${page.id}.md`), "utf8"), page.body);
  await assert.rejects(vault.databases.updatePresentation(snapshot.database.id, { title: "Stale name", baseRevision: current.database.revision, hostRevision: page.revision }), status(409));
  assert.equal((await vault.listConflicts())[0].proposed.title, "Stale name");
  for (const title of ["", " ", "x".repeat(501)]) await assert.rejects(vault.databases.updatePresentation(snapshot.database.id, { title, baseRevision: saved.database.revision, hostRevision: saved.hostPage!.revision }), status(400));
  await assert.rejects(vault.databases.updatePresentation(snapshot.database.id, { baseRevision: saved.database.revision, hostRevision: saved.hostPage!.revision }), status(400));
  await assert.rejects(vault.databases.updatePresentation(snapshot.database.id, { title: "Ignored field", parent: null, baseRevision: saved.database.revision, hostRevision: saved.hostPage!.revision } as any), status(400));
});

test("database title source overrides remain authoritative and legacy titles stay metadata-only", async t => {
  const { root, vault, snapshot } = await fixture(t);
  let page = snapshot.hostPage!;
  for (const body of ["---\ntitle: Source title\n---\nBody", "% Pandoc title\n\nBody"]) {
    page = await vault.update(page.id, { body }, page.revision);
    const current = await vault.databases.get(snapshot.database.id);
    await assert.rejects(vault.databases.updatePresentation(snapshot.database.id, { title: "Picker title", baseRevision: current.database.revision, hostRevision: page.revision }), status(422));
    assert.equal((await vault.get(page.id)).body, body);
  }
  const metadataPath = path.join(root, "metadata.json"), index = JSON.parse(await fs.readFile(metadataPath, "utf8"));
  delete index.databases[snapshot.database.id].pageId; delete index.pages[page.id];
  await fs.rm(path.join(root, "pages", `${page.id}.md`)); await fs.writeFile(metadataPath, JSON.stringify(index));
  const legacy = await vault.databases.get(snapshot.database.id);
  const renamed = await vault.databases.updatePresentation(snapshot.database.id, { title: "Legacy renamed", baseRevision: legacy.database.revision });
  assert.equal(renamed.database.title, "Legacy renamed"); assert.equal(renamed.hostPage, undefined);
  assert.deepEqual(await fs.readdir(path.join(root, "pages")), []);
});

test("database records remain Markdown pages with one property value and stable field identities", async t => {
  const { root, vault, snapshot, source } = await fixture(t);
  let page = await vault.databases.createRecord(source.id, { title: "One", properties: { points: 0, checked: false, status: "todo" } }, source.revision);
  assert.equal(page.dataSourceId, source.id);
  assert.equal(await fs.readFile(path.join(root, "pages", `${page.id}.md`), "utf8"), "");
  page = await vault.databases.updateCell(source.id, page.id, { baseRevision: page.revision, schemaRevision: source.revision, propertyId: "points", value: 4 });
  assert.equal((await vault.get(page.id)).properties.points, 4);
  const renamed = await vault.databases.updateSource(source.id, { properties: source.properties.map(field => field.id === "points" ? { ...field, name: "Effort" } : field) }, source.revision);
  assert.equal(renamed.properties.find(field => field.id === "points")!.key, "points");
  const reopened = await createVault(root).databases.get(snapshot.database.id);
  assert.equal(reopened.pages[0].properties.points, 4);
  assert.equal(reopened.pages[0].properties.checked, false);
  assert.equal(reopened.pages[0].body, "");
});

test("page and schema conflicts preserve competing drafts without forced retry", async t => {
  const { root, vault, source } = await fixture(t);
  const page = await vault.databases.createRecord(source.id, { title: "Record" }, source.revision);
  const updated = await vault.databases.updateCell(source.id, page.id, { baseRevision: page.revision, schemaRevision: source.revision, propertyId: "points", value: 2 });
  await assert.rejects(vault.databases.updateCell(source.id, page.id, { baseRevision: page.revision, schemaRevision: source.revision, propertyId: "points", value: 3 }), status(409));
  const conflicts = await vault.listConflicts();
  assert.equal(conflicts[0].current.properties.points, 2);
  assert.equal(conflicts[0].proposed.properties.points, 3);
  await vault.databases.updateSource(source.id, { title: "Changed" }, source.revision);
  await assert.rejects(vault.databases.updateCell(source.id, page.id, { baseRevision: updated.revision, schemaRevision: source.revision, propertyId: "points", value: 9 }), status(409));
  const files = await fs.readdir(path.join(root, ".history", "database-conflicts"));
  const conflict = JSON.parse(await fs.readFile(path.join(root, ".history", "database-conflicts", files[0]), "utf8"));
  assert.equal(conflict.proposed.value, 9);
  assert.equal((await vault.get(page.id)).properties.points, 2);
});

test("generic page save requires schema revision for typed values and preserves full stale draft", async t => {
  const { vault, source } = await fixture(t);
  const page = await vault.databases.createRecord(source.id, { title: "Record" }, source.revision);
  await assert.rejects(vault.update(page.id, { properties: { points: 3 } }, page.revision), status(400));
  await assert.rejects(vault.update(page.id, { properties: { points: "three" } }, page.revision, source.revision), status(422));
  await vault.databases.updateSource(source.id, { title: "Renamed" }, source.revision);
  await assert.rejects(vault.update(page.id, { body: "My unsaved text", properties: { points: 3 } }, page.revision, source.revision), status(409));
  assert.equal((await vault.listConflicts())[0].proposed.body, "My unsaved text");
  assert.equal((await vault.get(page.id)).body, "");
});

test("legacy aliases retain schema validation after resolving the canonical page", async t => {
  const { root, vault, source } = await fixture(t);
  const page = await vault.databases.createRecord(source.id, { title: "Record" }, source.revision);
  const filename = path.join(root, "metadata.json"), metadata = JSON.parse(await fs.readFile(filename, "utf8"));
  metadata.pages[page.id].pageIdMigration = { version: 1, previousIds: ["legacy-database-record"] };
  await fs.writeFile(filename, JSON.stringify(metadata));
  const current = await vault.get("legacy-database-record");
  await assert.rejects(vault.update("legacy-database-record", { properties: { points: 7 } }, current.revision), status(400));
  const saved = await vault.update("legacy-database-record", { properties: { points: 7 } }, current.revision, source.revision);
  assert.equal(saved.id, page.id);
  assert.equal(saved.properties.points, 7);
});

test("YAML property and Pandoc title overrides cannot be silently edited through database cells", async t => {
  const { vault, source } = await fixture(t);
  let page = await vault.databases.createRecord(source.id, { title: "Record", properties: { points: 1 } }, source.revision);
  page = await vault.update(page.id, { body: "---\npoints: 12\n---\nBody" }, page.revision);
  assert.equal(page.properties.points, 12);
  await assert.rejects(vault.databases.updateCell(source.id, page.id, { baseRevision: page.revision, schemaRevision: source.revision, propertyId: "points", value: 9 }), status(422));
  page = await vault.update(page.id, { body: "% Source title\n\nBody" }, page.revision);
  await assert.rejects(vault.databases.updateCell(source.id, page.id, { baseRevision: page.revision, schemaRevision: source.revision, propertyId: source.properties[0].id, value: "Different" }), status(422));
});

test("schema changes keep unknown metadata and reject destructive type/key/option edits", async t => {
  const { root, vault, source } = await fixture(t);
  await vault.databases.createRecord(source.id, { title: "Record", properties: { points: 4, status: "todo" } }, source.revision);
  const filename = path.join(root, "metadata.json"), metadata = JSON.parse(await fs.readFile(filename, "utf8"));
  metadata.future = { retained: true }; metadata.dataSources[source.id].future = "keep";
  await fs.writeFile(filename, JSON.stringify(metadata));
  const fresh = await vault.databases.getSource(source.id);
  const edit = (id: string, patch: object) => fresh.properties.map(field => field.id === id ? { ...field, ...patch } : field);
  await assert.rejects(vault.databases.updateSource(source.id, { properties: edit("points", { type: "text" }) }, fresh.revision), status(422));
  await assert.rejects(vault.databases.updateSource(source.id, { properties: edit("points", { key: "new" }) }, fresh.revision), status(422));
  await assert.rejects(vault.databases.updateSource(source.id, { properties: edit("status", { options: [] }) }, fresh.revision), status(422));
  await vault.databases.updateSource(source.id, { title: "New" }, fresh.revision);
  const after = JSON.parse(await fs.readFile(filename, "utf8"));
  assert.deepEqual(after.future, { retained: true });
  assert.equal(after.dataSources[source.id].future, "keep");
});

test("views share records, validate filtering and detach preserves the page", async t => {
  const { vault, snapshot, source } = await fixture(t);
  const page = await vault.databases.createRecord(source.id, { title: "Record", properties: { points: 4 } }, source.revision);
  const second = await vault.databases.createView(snapshot.database.id, { name: "Effort", dataSourceId: source.id, type: "table", sorts: [{ propertyId: "points", direction: "descending" }] }, snapshot.database.revision);
  assert.equal(second.views.length, 2); assert.equal(second.pages.length, 1);
  await assert.rejects(vault.databases.updateView(second.views[0].id, { filters: [{ propertyId: "points", operator: "unsupported", value: "4" }] }, second.views[0].revision), status(400));
  const detached = await vault.databases.removeRecord(source.id, page.id, page.revision, source.revision);
  assert.equal(detached.dataSourceId, undefined); assert.equal(detached.properties.points, 4);
  assert.equal(detached.parent, null);
  assert.equal((await vault.databases.get(snapshot.database.id)).pages.length, 0);
  assert.equal((await vault.get(page.id)).title, "Record");
});

test("view row order persists with CAS and rejects new foreign or duplicate references", async t => {
  const { root, vault, snapshot, source } = await fixture(t);
  const first = await vault.databases.createRecord(source.id, { title: "First" }, source.revision);
  const second = await vault.databases.createRecord(source.id, { title: "Second" }, source.revision);
  const original = snapshot.views[0];
  assert.deepEqual(original.rowOrder, []);
  const ordered = await vault.databases.updateView(original.id, { rowOrder: [second.id, first.id] }, original.revision);
  assert.deepEqual((await createVault(root).databases.get(snapshot.database.id)).views[0].rowOrder, [second.id, first.id]);
  await assert.rejects(vault.databases.updateView(original.id, { rowOrder: [first.id] }, original.revision), status(409));
  await assert.rejects(vault.databases.updateView(original.id, { rowOrder: [first.id, first.id] }, ordered.revision), status(400));
  const unrelated = await vault.create({ title: "Outside" });
  await assert.rejects(vault.databases.updateView(original.id, { rowOrder: [unrelated.id] }, ordered.revision), status(400));
  await vault.update(second.id, { trashed: true }, second.revision);
  const retained = await vault.databases.updateView(original.id, { name: "With trash" }, ordered.revision);
  assert.deepEqual(retained.rowOrder, [second.id, first.id]);
  await vault.databases.removeRecord(source.id, first.id, first.revision, source.revision);
  const afterRemoval = await vault.databases.updateView(original.id, { name: "Removed record" }, retained.revision);
  assert.deepEqual(afterRemoval.rowOrder, [second.id, first.id]);
});

test("imported readonly properties cannot be changed by cell or page writes", async t => {
  const { vault, source } = await fixture(t);
  const withFormula = await vault.databases.updateSource(source.id, { properties: [...source.properties, { id: "formula", name: "Total", key: "total", type: "formula", readOnly: true }] }, source.revision);
  const page = await vault.databases.createRecord(source.id, { title: "Record" }, withFormula.revision);
  await assert.rejects(vault.databases.updateCell(source.id, page.id, { baseRevision: page.revision, schemaRevision: withFormula.revision, propertyId: "formula", value: 42 }), status(422));
  await assert.rejects(vault.update(page.id, { properties: { total: 42 } }, page.revision, withFormula.revision), status(422));
});

test("incomplete import retry preserves local metadata edits and can resume unregistered Markdown", async t => {
  const { root, vault } = await fixture(t);
  const plan = prepareMarkdownImport({ name: "Retry", dialect: "gfm", files: [{ path: "record.md", data: Buffer.from("Body").toString("base64") }] });
  await vault.importBatch(plan);
  const manifestPath = path.join(root, ".history", "imports", plan.id, "manifest.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  await fs.writeFile(manifestPath, JSON.stringify({ ...manifest, completed: false }));
  const page = await vault.get(plan.pages[0].id);
  await vault.update(page.id, { properties: { note: "Local property edit" } }, page.revision);
  await assert.rejects(vault.importBatch(plan), status(409));
  assert.equal((await vault.get(page.id)).properties.note, "Local property edit");
  const orphanPlan = prepareMarkdownImport({ name: "Orphan", dialect: "gfm", files: [{ path: "orphan.md", data: Buffer.from("Untouched source").toString("base64") }] });
  const orphan = orphanPlan.pages[orphanPlan.pages.length - 1];
  await fs.writeFile(path.join(root, "pages", `${orphan.id}.md`), orphan.source);
  await vault.importBatch(orphanPlan);
  assert.equal((await vault.get(orphan.id)).body, "Untouched source");
});

test("recycled database hosts never reappear as legacy collections and restore keeps resources", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-recycled-database-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const recycle = path.join(root, "test-recycle"); await fs.mkdir(recycle);
  const vault = createVault(root, { recycleFile: file => fs.rename(file, path.join(recycle, path.basename(file))) });
  for (const kind of ["database", "wiki"] as const) {
    const created = await createLegacyDatabase(root, vault, { title: "Same deleted collection", kind });
    const host = created.hostPage!, source = created.dataSources[0];
    const row = await vault.databases.createRecord(source.id, { title: "Retained row" }, source.revision);
    const trashed = await vault.update(host.id, { trashed: true }, host.revision);
    const before = await fs.readFile(path.join(root, "metadata.json"), "utf8");
    await vault.recycle(host.id, trashed.revision, { [host.id]: trashed.revision, [row.id]: row.revision });
    const reopened = createVault(root);
    assert.ok(!(await reopened.databases.list()).some(db => db.id === created.database.id));
    assert.ok(!(await reopened.databases.listSources()).some(item => item.id === source.id));
    assert.equal((await reopened.databases.get(created.database.id)).database.trashed, true);
    await assert.rejects(reopened.databases.createRecord(source.id, { title: "Must not orphan" }, source.revision), status(422));
    assert.equal(await fs.readFile(path.join(root, "metadata.json"), "utf8"), before);
    // System Recycle Bin restoration plus the normal Trash restore reactivates the same resource identities.
    for (const id of [host.id, row.id]) await fs.rename(path.join(recycle, `${id}.md`), path.join(root, "pages", `${id}.md`));
    const restored = await reopened.get(host.id);
    await reopened.update(host.id, { trashed: false }, restored.revision);
    assert.ok((await reopened.databases.list()).some(db => db.id === created.database.id));
    assert.equal((await reopened.databases.get(created.database.id)).pages[0].id, row.id);
  }
});

test("a missing implicit host with retained page metadata is not a genuinely unhosted legacy database", async t => {
  const { root, vault, snapshot } = await fixture(t);
  const metadata = path.join(root, "metadata.json"), index = JSON.parse(await fs.readFile(metadata, "utf8"));
  delete index.databases[snapshot.database.id].pageId;
  await fs.writeFile(metadata, JSON.stringify(index));
  await fs.rename(path.join(root, "pages", `${snapshot.hostPage!.id}.md`), path.join(root, "retained-host.md"));
  const before = await fs.readFile(metadata, "utf8");
  assert.ok(!(await vault.databases.list()).some(db => db.id === snapshot.database.id));
  assert.equal((await vault.databases.get(snapshot.database.id)).database.trashed, true);
  assert.equal(await fs.readFile(metadata, "utf8"), before);
});
