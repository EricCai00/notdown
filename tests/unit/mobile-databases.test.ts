import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { createVault } from "../../src/vault/vault";
import { nodeVaultPlatform } from "../../server/vault-platform";
import { mobileVaultApi } from "../../src/mobile/vault-api";
import { MobileDraftSession } from "../../src/mobile/draft-session";
import { ApiError, type Page } from "../../src/shared/types";
import type { DatabaseSnapshot, DatabaseDataSource } from "../../src/features/databases/database-model";

async function fixture(t: test.TestContext) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-mobile-databases-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const vault = createVault(root, nodeVaultPlatform), api = mobileVaultApi(() => vault);
  const request = <T>(url: string, method = "GET", input?: unknown) => api(url, { method, ...(input ? { body: JSON.stringify(input) } : {}) }) as Promise<T>;
  return { vault, request };
}

test("mobile database API creates nested hosts, schemas, records and views with CAS", async t => {
  const { vault, request } = await fixture(t);
  assert.deepEqual(await request("/status"), { vaultPath: vault.vaultPath });
  const parent = await vault.create({ title: "Parent", body: "Before\n" });
  const database = await request<DatabaseSnapshot>("/databases", "POST", { title: "Mobile tasks", parent: parent.id, parentRevision: parent.revision });
  assert.equal(database.hostPage!.parent, parent.id);
  const original = database.dataSources[0], id = randomUUID();
  const source = await request<DatabaseDataSource>(`/data-sources/${original.id}`, "PUT", { baseRevision: original.revision, properties: [...original.properties, { id, key: id, name: "Count", type: "number" }] });
  const row = await request<Page>(`/data-sources/${source.id}/records`, "POST", { title: "Record", baseRevision: source.revision });
  const saved = await request<Page>(`/data-sources/${source.id}/records/${row.id}`, "PUT", { propertyId: id, value: 0, baseRevision: row.revision, schemaRevision: source.revision });
  assert.equal(saved.properties[id], 0);
  await assert.rejects(request(`/data-sources/${source.id}/records/${row.id}`, "PUT", { propertyId: id, value: 9, baseRevision: row.revision, schemaRevision: source.revision }), (error: unknown) => error instanceof ApiError && error.status === 409);
  const view = await request<DatabaseSnapshot>(`/databases/${database.database.id}/views`, "POST", { baseRevision: database.database.revision, name: "Second table", type: "table", dataSourceId: source.id });
  assert.equal(view.views.length, 2);
  await assert.rejects(request(`/data-sources/${source.id}`, "PUT", { baseRevision: original.revision, properties: original.properties }), (error: unknown) => error instanceof ApiError && error.status === 409);
  assert.equal((await vault.get(parent.id)).body, "Before\n");
  assert.equal((await vault.get(row.id)).properties[id], 0);
});

test("mobile record drafts retain properties and the original schema revision across recovery", async t => {
  const { vault } = await fixture(t);
  const snapshot = await vault.databases.create({ title: "Drafts" }), source = snapshot.dataSources[0], id = randomUUID();
  const schema = await vault.databases.updateSource(source.id, { properties: [...source.properties, { id, key: id, name: "Note", type: "text" }] }, source.revision);
  const row = await vault.databases.createRecord(source.id, { title: "Record" }, schema.revision);
  const entries = new Map<string, string>();
  const storage = { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => { entries.set(key, value); }, removeItem: (key: string) => { entries.delete(key); } };
  const write = (id: string, input: any, revision: string, schemaRevision?: string) => vault.update(id, input, revision, schemaRevision);
  const draft = new MobileDraftSession(row, "record", storage, write, undefined, schema.revision);
  draft.change({ ...row, body: "Pending body\n", properties: { [id]: "Pending property" } });
  const newerSchema = await vault.databases.updateSource(source.id, { properties: schema.properties.map(field => ({ ...field, name: field.id === id ? "Renamed" : field.name })) }, schema.revision);
  const recovered = new MobileDraftSession(await vault.get(row.id), "record", storage, write, undefined, newerSchema.revision);
  assert.equal(recovered.draft.properties[id], "Pending property");
  assert.equal(await recovered.save(), false);
  assert.equal((await vault.get(row.id)).body, "");
  assert.match(entries.get("record")!, /Pending property/);
  const conflicts = await vault.listConflicts();
  assert.equal(conflicts[0].proposed.body, "Pending body\n");
});
