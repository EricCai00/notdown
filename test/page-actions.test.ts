import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createVault, VaultError } from "../server/vault.js";

async function fixture(t: test.TestContext) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-page-actions-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const vault = createVault(root);
  await vault.init();
  return { root, vault };
}

test("page actions preserve unknown YAML, exact body, and independent copy identity", async (t) => {
  const { root, vault } = await fixture(t);
  const body = "```custom\r\nunknown **source**\r\n```\r\n";
  const original = await vault.create({ title: "Original", body, properties: { unknown: [1, "x"] } });
  const file = path.join(root, "pages", `${original.id}.md`);
  await fs.writeFile(file, (await fs.readFile(file, "utf8")).replace("---\n", "---\ncustom: {nested: keep}\n"));
  const page = await vault.get(original.id);
  const favored = await vault.update(page.id, { favorite: true, title: "Renamed" }, page.revision);
  const copy = await vault.duplicate(page.id, favored.revision);
  assert.notEqual(copy.id, page.id);
  assert.equal(copy.title, "Renamed (copy)");
  assert.equal(copy.body, body);
  assert.deepEqual(copy.properties, page.properties);
  assert.equal(copy.favorite, false);
  assert.match(await fs.readFile(path.join(root, "pages", `${copy.id}.md`), "utf8"), /custom: \{ nested: keep \}/);
  assert.equal((await vault.get(page.id)).body, body);
  await assert.rejects(vault.update(page.id, { favorite: "yes" as any }, favored.revision), /boolean/);
});

test("trash hides descendants, preserves files, and restores the original tree", async (t) => {
  const { root, vault } = await fixture(t);
  const parent = await vault.create({ title: "Parent" });
  const child = await vault.create({ title: "Child", parent: parent.id, body: "child body" });
  await assert.rejects(vault.update(parent.id, { parent: child.id }, parent.revision), /cycles/);
  const trash = await vault.update(parent.id, { trashed: true }, parent.revision);
  assert.deepEqual(await vault.list(), []);
  assert.equal((await vault.list({ includeTrashed: true })).length, 2);
  assert.equal((await vault.get(child.id)).revision, child.revision);
  await fs.access(path.join(root, "pages", `${parent.id}.md`));
  await assert.rejects(vault.create({ title: "Invalid", parent: child.id }), /Restore/);
  await assert.rejects(vault.duplicate(child.id, child.revision), /Restore/);
  await vault.update(parent.id, { trashed: false }, trash.revision);
  assert.equal((await vault.list()).length, 2);
  assert.equal((await vault.get(child.id)).parent, parent.id);
});

test("stale menu updates keep both versions and never force retry", async (t) => {
  const { vault } = await fixture(t);
  const page = await vault.create({ title: "Original", body: "first" });
  const external = await vault.update(page.id, { body: "external edit" }, page.revision);
  await assert.rejects(vault.update(page.id, { trashed: true }, page.revision), (error: unknown) => error instanceof VaultError && error.status === 409);
  assert.equal((await vault.get(page.id)).revision, external.revision);
  const [conflict] = await vault.listConflicts();
  assert.equal(conflict.current.body, "external edit");
  assert.equal(conflict.proposed.trashed, true);
  assert.equal(conflict.proposed.body, "external edit");
  await vault.resolveConflict(conflict.conflictId, {}, external.revision);
  assert.equal((await vault.list()).length, 0);
});

test("recycle moves a trashed subtree through the system adapter and keeps history and unrelated files", async (t) => {
  const { root } = await fixture(t);
  const bin = path.join(root, "fake-bin");
  await fs.mkdir(bin);
  const recycled: string[] = [];
  const vault = createVault(root, { recycleFile: async (file) => {
    recycled.push(path.basename(file));
    await fs.rename(file, path.join(bin, path.basename(file)));
  } });
  const parent = await vault.create({ title: "Recycle parent", body: "parent", trashed: true });
  const child = await vault.create({ title: "Child", body: "child" });
  // Build the relationship before the parent is trashed, as a real UI would.
  const liveParent = await vault.update(parent.id, { trashed: false }, parent.revision);
  const nested = await vault.update(child.id, { parent: parent.id }, child.revision);
  const trash = await vault.update(parent.id, { trashed: true }, liveParent.revision);
  const other = await vault.create({ title: "Unrelated" });
  await fs.writeFile(path.join(root, "assets", "keep.txt"), "keep");
  const result = await vault.recycle(parent.id, trash.revision, { [parent.id]: trash.revision, [child.id]: nested.revision });
  assert.deepEqual(result.recycled, [child.id, parent.id]);
  assert.deepEqual(recycled, [`${child.id}.md`, `${parent.id}.md`]);
  assert.equal((await vault.list()).length, 1);
  assert.equal((await vault.get(other.id)).title, "Unrelated");
  assert.match(await fs.readFile(path.join(bin, `${child.id}.md`), "utf8"), /child/);
  assert.match(await fs.readFile(path.join(root, ".history", parent.id, `${trash.revision}.md`), "utf8"), /parent/);
  assert.equal(await fs.readFile(path.join(root, "assets", "keep.txt"), "utf8"), "keep");
});

test("recycle refuses active pages, stale child revisions, changed trees and unresolved conflicts", async (t) => {
  const { root } = await fixture(t);
  let calls = 0;
  const vault = createVault(root, { recycleFile: async () => { calls++; } });
  const parent = await vault.create({ title: "Parent" });
  await assert.rejects(vault.recycle(parent.id, parent.revision, { [parent.id]: parent.revision }), /Trash first/);
  const child = await vault.create({ title: "Child", parent: parent.id });
  const edited = await vault.update(child.id, { body: "External child edit" }, child.revision);
  const trash = await vault.update(parent.id, { trashed: true }, parent.revision);
  await assert.rejects(vault.recycle(parent.id, trash.revision, { [parent.id]: trash.revision }), /tree changed/);
  await assert.rejects(vault.recycle(parent.id, trash.revision, { [parent.id]: trash.revision, [child.id]: child.revision }), (error: unknown) => error instanceof VaultError && error.status === 409);
  assert.equal((await vault.get(child.id)).body, "External child edit");
  assert.equal((await vault.listConflicts()).length, 1);
  await assert.rejects(vault.recycle(parent.id, trash.revision, { [parent.id]: trash.revision, [child.id]: edited.revision }), /Resolve conflicts/);
  assert.equal(calls, 0);
});

test("system recycling failure leaves the file in Trash with a history snapshot", async (t) => {
  const { root } = await fixture(t);
  const vault = createVault(root, { recycleFile: async () => { throw new Error("Native operation refused"); } });
  const page = await vault.create({ title: "Keep", body: "recoverable", trashed: true });
  await assert.rejects(vault.recycle(page.id, page.revision, { [page.id]: page.revision }), /could not recycle/);
  assert.equal((await vault.get(page.id)).body, "recoverable");
  await fs.access(path.join(root, ".history", page.id, `${page.revision}.md`));
});
