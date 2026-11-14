import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createVault } from "../../src/vault/vault";
import { nodeVaultPlatform } from "../../server/vault-platform";

async function fixture(t: test.TestContext) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-navigation-read-"));
  t.after(async () => {
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith("notdown-navigation-read-"));
    await fs.rm(root, { recursive: true, force: true });
  });
  const reads: string[] = [];
  const readFile: typeof nodeVaultPlatform.fs.readFile = (async (file: string, encoding?: "utf8") => {
    if (file.endsWith(".md")) reads.push(path.basename(file));
    return encoding ? nodeVaultPlatform.fs.readFile(file, encoding) : nodeVaultPlatform.fs.readFile(file);
  }) as typeof nodeVaultPlatform.fs.readFile;
  const vault = createVault(root, { ...nodeVaultPlatform, fs: { ...nodeVaultPlatform.fs, readFile } });
  const parent = await vault.create({ title: "Parent", body: "parent" });
  const child = await vault.create({ title: "Child", body: "AAAA", parent: parent.id });
  const other = await vault.create({ title: "Unrelated", body: "untouched" });
  reads.length = 0;
  return { root, vault, reads, parent, child, other, file: (id: string) => path.join(root, "pages", `${id}.md`) };
}

test("active navigation reads only the target and its ancestors, with fresh exact bytes and CAS protection", async t => {
  const { vault, child, parent, file, reads } = await fixture(t);
  assert.equal((await vault.get(child.id, { activeOnly: true })).body, "AAAA");
  assert.deepEqual(reads, [`${child.id}.md`, `${parent.id}.md`]);
  const stat = await fs.stat(file(child.id));
  await fs.writeFile(file(child.id), "BBBB");
  await fs.utimes(file(child.id), stat.atime, stat.mtime);
  const fresh = await vault.get(child.id, { activeOnly: true });
  assert.equal(fresh.body, "BBBB");
  assert.notEqual(fresh.revision, child.revision);
  await assert.rejects(vault.update(child.id, { body: "stale draft" }, child.revision), { status: 409 });
  assert.equal(await fs.readFile(file(child.id), "utf8"), "BBBB");
});

test("active reads honor ancestor YAML trash, external renames, missing files and legacy aliases", async t => {
  const { root, vault, parent, child, file } = await fixture(t);
  const parentSource = await fs.readFile(file(parent.id), "utf8");
  await fs.writeFile(file(parent.id), "---\ntrashed: true\n---\nparent");
  await assert.rejects(vault.get(child.id, { activeOnly: true }), { status: 404 });
  await fs.writeFile(file(parent.id), parentSource);
  await fs.rename(file(parent.id), path.join(root, "pages", "parent-renamed.md"));
  assert.equal((await vault.get(child.id, { activeOnly: true })).id, child.id);
  await fs.writeFile(path.join(root, "pages", "legacy.md"), "---\nid: old-id\ntitle: Legacy\n---\nlegacy");
  assert.equal((await vault.get("old-id", { activeOnly: true })).title, "Legacy");
  await fs.writeFile(path.join(root, "pages", "plain-alias.md"), "alias body");
  assert.ok((await vault.get("plain-alias", { activeOnly: true })).legacyIds?.includes("plain-alias"));
  await fs.unlink(file(child.id));
  await assert.rejects(vault.get(child.id, { activeOnly: true }), { status: 404 });
});

test("active database records use complete membership and inherited-trash validation", async t => {
  const { vault } = await fixture(t);
  const database = await vault.databases.create({ title: "Database" });
  const source = database.dataSources[0];
  const record = await vault.databases.createRecord(source.id, { title: "Record" }, source.revision);
  assert.equal((await vault.get(record.id, { activeOnly: true })).id, record.id);
  const host = await vault.get(database.database.id);
  await vault.update(host.id, { trashed: true }, host.revision);
  await assert.rejects(vault.get(record.id, { activeOnly: true }), { status: 404 });
});
