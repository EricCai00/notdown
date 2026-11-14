import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createVault } from "../../server/vault.js";
import { prepareNotionImport } from "../../server/notion-import.js";
import { statusDatabase, statusFixture } from "./notion-status-fixture.js";

test("imported Status remains distinct from Select; property icons persist with CAS and preserve records and source metadata", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-property-icons-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const plan = await prepareNotionImport({ token: "test-only-status-token", pageId: statusDatabase }, { fetch: statusFixture(), wait: async () => {} });
  const vault = createVault(root); await vault.importBatch(plan);
  const id = Object.keys(plan.databaseResources!.databases)[0], initial = await vault.databases.get(id), source = initial.dataSources[0];
  const status = source.properties.find(field => field.name === "Status")!, select = source.properties.find(field => field.name === "Class")!;
  assert.equal(status.type, "status"); assert.equal(select.type, "select");
  const fields = source.properties.map(field => field.id === status.id ? { ...field, icon: "plane", future: { retain: true } } : field);
  const saved = await vault.databases.updateSource(source.id, { properties: fields }, source.revision);
  assert.deepEqual(saved.properties.find(field => field.id === status.id), { ...status, icon: "plane", future: { retain: true } });
  const reloaded = await createVault(root).databases.get(id);
  assert.deepEqual(reloaded.pages, initial.pages);
  assert.deepEqual(reloaded.dataSources[0].properties, fields);
  for (const icon of [7, "x".repeat(101)]) await assert.rejects(vault.databases.updateSource(source.id, { properties: fields.map(field => ({ ...field, icon })) as any }, saved.revision), /Property icon/);
  await assert.rejects(vault.databases.updateSource(source.id, { properties: fields.map(field => ({ ...field, icon: "star" })) }, source.revision), /changed/);
  assert.equal((await vault.databases.get(id)).dataSources[0].properties.find(field => field.id === status.id)?.icon, "plane");
  const restored = await vault.databases.updateSource(source.id, { properties: fields.map(field => field.id === status.id ? { ...field, icon: "" } : field) }, saved.revision);
  assert.equal(restored.properties.find(field => field.id === status.id)?.icon, "");
});
