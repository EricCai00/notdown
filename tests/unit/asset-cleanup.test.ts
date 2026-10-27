import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createVault } from "../../server/vault";

async function fixture(t: test.TestContext, refuseAssets = false) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-asset-cleanup-"));
  assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
  assert.ok(path.basename(root).startsWith("notdown-asset-cleanup-"));
  const bin = path.join(root, "test-bin"); await fs.mkdir(bin);
  const vault = createVault(root, { recycleFile: async file => {
    if (refuseAssets && file.includes(`${path.sep}assets${path.sep}`)) throw new Error("Attachment recycling refused");
    await fs.rename(file, path.join(bin, path.basename(file)));
  } });
  t.after(async () => { vault.closeHistory(); await fs.rm(root, { recursive: true, force: true }); });
  await vault.init();
  const upload = (name: string) => vault.uploadAsset(name + ".txt", "text/plain", Buffer.from(name).toString("base64"));
  const remove = async (id: string) => {
    const page = await vault.get(id), all = await vault.list({ includeTrashed: true });
    const selected = new Set([id]);
    for (let changed = true; changed;) { changed = false; for (const p of all) if (p.parent && selected.has(p.parent) && !selected.has(p.id)) { selected.add(p.id); changed = true; } }
    return vault.recycle(id, page.revision, Object.fromEntries(all.filter(p => selected.has(p.id)).map(p => [p.id, p.revision])));
  };
  return { root, bin, vault, upload, remove };
}

test("Trash retains attachments; permanent subtree deletion recycles only the last references with recoverable metadata", async t => {
  const { root, bin, vault, upload, remove } = await fixture(t);
  const only = await upload("only"), shared = await upload("shared"), unrelated = await upload("unrelated");
  const parent = await vault.create({ title: "Delete", body: `[only](${only.path})`, properties: { cover: shared.path } });
  const child = await vault.create({ title: "Child", parent: parent.id, body: `[again](${only.path})` });
  await vault.create({ title: "Survivor", properties: { cover: shared.path } });
  const metadataFile = path.join(root, "metadata.json"), metadata = JSON.parse(await fs.readFile(metadataFile, "utf8"));
  metadata.assets[only.path].unknown = { preserve: true }; metadata.custom = { keep: 42 };
  await fs.writeFile(metadataFile, JSON.stringify(metadata));
  const trash = await vault.update(parent.id, { trashed: true }, parent.revision);
  assert.equal((await vault.readAsset(only.path)).toString(), "only");
  const restored = await vault.update(parent.id, { trashed: false }, trash.revision);
  assert.equal((await vault.readAsset(only.path)).toString(), "only");
  await vault.update(parent.id, { trashed: true }, restored.revision);
  const result = await remove(parent.id);
  assert.deepEqual(result.recycled, [child.id, parent.id]);
  assert.deepEqual(result.deletedAssets, [only.path]); assert.deepEqual(result.warnings, []);
  await assert.rejects(fs.stat(path.join(root, only.path)), { code: "ENOENT" });
  assert.equal((await fs.readFile(path.join(bin, path.basename(only.path)))).toString(), "only");
  assert.equal((await vault.readAsset(shared.path)).toString(), "shared");
  assert.equal((await vault.readAsset(unrelated.path)).toString(), "unrelated");
  const after = JSON.parse(await fs.readFile(metadataFile, "utf8"));
  assert.equal(after.assets[only.path], undefined); assert.deepEqual(after.custom, { keep: 42 });
  const recovery = path.join(root, ".history/deleted-assets"), directory = path.join(recovery, (await fs.readdir(recovery))[0]);
  const manifest = (await fs.readdir(directory)).find(file => file.endsWith(".json"))!;
  const saved = JSON.parse(await fs.readFile(path.join(directory, manifest), "utf8"));
  assert.equal(saved.path, only.path); assert.deepEqual(saved.metadata.unknown, { preserve: true });
  assert.equal((await fs.readFile(path.join(directory, manifest.replace(/\.json$/, ".bin")))).toString(), "only");
});

test("Trash references and active conflict drafts protect shared attachments", async t => {
  const { vault, upload, remove } = await fixture(t);
  const asset = await upload("protected");
  const deleted = await vault.create({ title: "Deleted", trashed: true, body: `[file](${asset.path})` });
  const trash = await vault.create({ title: "Other Trash", trashed: true, body: `[file](${asset.path})` });
  assert.deepEqual((await remove(deleted.id)).deletedAssets, []);
  const survivor = await vault.create({ title: "Conflict", body: "original" });
  await vault.update(survivor.id, { body: "current" }, survivor.revision);
  await assert.rejects(vault.update(survivor.id, { body: `[draft](${asset.path})` }, survivor.revision), { status: 409 });
  assert.deepEqual((await remove(trash.id)).deletedAssets, []);
  assert.equal((await vault.readAsset(asset.path)).toString(), "protected");
});

test("unparsed surviving source and symbolic links stop cleanup without touching outside files", async t => {
  const { root, vault, upload, remove } = await fixture(t);
  const asset = await upload("uncertain");
  const source = await vault.create({ title: "Unparsed", syntax: { version: 1, variant: "notdown", extensions: {} }, body: `<unknown-container file="${asset.path}">unparsed</unknown-container>` });
  const target = await vault.create({ title: "Candidate", trashed: true, body: `[file](${asset.path})` });
  const result = await remove(target.id);
  assert.deepEqual(result.deletedAssets, []); assert.equal(result.warnings.length, 1);
  assert.equal((await vault.readAsset(asset.path)).toString(), "uncertain");
  await vault.update(source.id, { body: "plain" }, source.revision);
  const outside = path.join(root, "outside"); await fs.mkdir(outside); await fs.writeFile(path.join(outside, "keep.txt"), "keep");
  await fs.symlink(outside, path.join(root, "assets/link"), "junction");
  const linked = await vault.create({ title: "Linked", trashed: true, body: "[file](assets/link/keep.txt)" });
  assert.equal((await remove(linked.id)).warnings.length, 1);
  assert.equal(await fs.readFile(path.join(outside, "keep.txt"), "utf8"), "keep");
});

test("surviving HTML attachment dependencies and global metadata retain otherwise unlinked attachments", async t => {
  const { root, vault, upload, remove } = await fixture(t);
  const image = await upload("dependent"), global = await upload("global");
  const html = await vault.uploadAsset("host.html", "text/html", Buffer.from(`<img src="${path.basename(image.path)}">`).toString("base64"));
  await vault.create({ title: "HTML", body: `[html](${html.path})` });
  const metadataFile = path.join(root, "metadata.json"), metadata = JSON.parse(await fs.readFile(metadataFile, "utf8"));
  metadata.custom = { icon: global.path }; await fs.writeFile(metadataFile, JSON.stringify(metadata));
  const target = await vault.create({ title: "Delete", trashed: true, body: `[image](${image.path}) [global](${global.path})` });
  const result = await remove(target.id);
  assert.deepEqual(result.deletedAssets, []); assert.deepEqual(result.warnings, []);
  assert.equal((await vault.readAsset(image.path)).toString(), "dependent");
  assert.equal((await vault.readAsset(global.path)).toString(), "global");
});

test("refused attachment recycling leaves its file and metadata recoverable after page deletion", async t => {
  const { root, vault, upload, remove } = await fixture(t, true);
  const asset = await upload("refused");
  const target = await vault.create({ title: "Delete", trashed: true, body: `[file](${asset.path})` });
  const result = await remove(target.id);
  assert.deepEqual(result.deletedAssets, []); assert.equal(result.warnings.length, 1);
  assert.equal((await vault.readAsset(asset.path)).toString(), "refused");
  assert.ok(JSON.parse(await fs.readFile(path.join(root, "metadata.json"), "utf8")).assets[asset.path]);
  await assert.rejects(vault.get(target.id), { status: 404 });
});
