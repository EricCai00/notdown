import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createVault } from "../../server/vault.js";
import { createManagedVaultFolder, listManagedVaults, resolveVaultLocation, vaultFolder } from "../../server/vault-location.js";

test("named vault folders directly under the data directory stay independent", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-vault-locations-"));
  t.after(async () => { assert.equal(path.dirname(root), path.resolve(os.tmpdir())); assert.ok(path.basename(root).startsWith("notdown-vault-locations-")); await fs.rm(root, { recursive: true, force: true }); });
  const firstPath = await createManagedVaultFolder(root, "Work"), secondPath = await createManagedVaultFolder(root, "Personal 中文");
  assert.equal(firstPath, path.join(root, "Work"));
  const first = createVault(firstPath), second = createVault(secondPath);
  t.after(() => { first.closeHistory(); second.closeHistory(); });
  await first.create({ title: "Work only", body: "Private to first vault" }); await second.init();
  assert.equal((await first.list()).length, 1); assert.equal((await second.list()).length, 0);
  assert.deepEqual((await listManagedVaults(root)).map(item => item.name), ["Personal 中文", "Work"]);
  await assert.rejects(createManagedVaultFolder(root, "Work"), { code: "EEXIST" });
  for (const name of ["..", "../outside", "a/b", "a\\b", "CON", "a.", " ", "test:foo"]) assert.throws(() => vaultFolder(root, name));
  const location = resolveVaultLocation({ NOTDOWN_DATA_PATH: root, NOTDOWN_VAULT_NAME: "Work" }, root);
  assert.equal(location.vaultPath, firstPath);
  assert.equal(location.isDefault, false);
  assert.equal(resolveVaultLocation({ NOTDOWN_DATA_PATH: root, VAULT_PATH: secondPath }, root).vaultPath, secondPath);
});

test("a legacy repository vault is still opened without an implicit migration", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-legacy-location-"));
  t.after(async () => { assert.equal(path.dirname(root), path.resolve(os.tmpdir())); assert.ok(path.basename(root).startsWith("notdown-legacy-location-")); await fs.rm(root, { recursive: true, force: true }); });
  await fs.mkdir(path.join(root, "vault", "pages"), { recursive: true });
  assert.equal(resolveVaultLocation({}, root).vaultPath, path.join(root, "vault"));
  assert.equal(resolveVaultLocation({ NOTDOWN_DATA_PATH: path.join(root, "Data") }, root).vaultPath, path.join(root, "Data", "Default"));
  await assert.rejects(createManagedVaultFolder(path.join(root, "vault"), "Nested"), /already contains a vault/);
});
