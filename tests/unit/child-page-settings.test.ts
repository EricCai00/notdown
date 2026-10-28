import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createVault, VaultError } from "../../server/vault";
import { insertedChildPageIds } from "../../src/features/pages/child-page-entries";
import { planPageMove } from "../../src/features/pages/page-order";
import { prepareMarkdownImport } from "../../server/markdown-import";
import { mobileVaultApi } from "../../src/mobile/vault-api";

const syntax = { version: 1 as const, variant: "notdown" as const, extensions: {} };
async function fixture(t: test.TestContext) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-child-pages-"));
  const vault = createVault(root);
  t.after(async () => {
    vault.closeHistory();
    if (path.dirname(path.resolve(root)) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith("notdown-child-pages-")) throw new Error("Unsafe cleanup");
    await fs.rm(root, { recursive: true, force: true });
  });
  return { vault, root };
}
async function configure(vault: ReturnType<typeof createVault>, allowUninserted: boolean, autoInsert: boolean) {
  const state = await vault.childPageSettings.get();
  return vault.childPageSettings.configure({ settings: { allowUninserted, autoInsert }, baseRevision: state.revision });
}

test("defaults preserve hierarchy-only child pages; disabling allowance backfills all parents once", async t => {
  const { vault, root } = await fixture(t);
  const parent = await vault.create({ title: "Parent", body: "Original\r\n", syntax });
  const child = await vault.create({ title: "A & B", parent: parent.id, syntax });
  const grandchild = await vault.create({ title: "Grandchild", parent: child.id });
  const hidden = await vault.create({ title: "Trashed child", parent: parent.id, trashed: true });
  assert.deepEqual((await vault.childPageSettings.get()).settings, { allowUninserted: true, autoInsert: false });
  assert.equal((await vault.get(parent.id)).body, parent.body);
  const first = await configure(vault, false, false);
  assert.equal(first.inserted, 2); assert.equal(first.updatedPages, 2);
  const saved = await vault.get(parent.id);
  assert.ok(saved.body.startsWith(parent.body));
  assert.match(saved.body, /A &amp; B/);
  assert.deepEqual([...insertedChildPageIds(saved, await vault.list())], [child.id]);
  assert.ok(!saved.body.includes(hidden.id));
  assert.ok((await vault.get(child.id)).body.includes(grandchild.id));
  const second = await configure(vault, false, false);
  assert.equal(second.inserted, 0);
  assert.equal((await vault.get(parent.id)).revision, saved.revision);
  assert.equal((await createVault(root).childPageSettings.get()).settings.allowUninserted, false);
});

test("code, inline mentions and Link to page do not stand in for an owned child page block", async t => {
  const { vault } = await fixture(t);
  const parent = await vault.create({ title: "Native parent", syntax });
  const child = await vault.create({ title: "Child", parent: parent.id });
  const body = `\`\`\`xml\n<page url="#page/${child.id}">fake</page>\n\`\`\`\n\n<page-link url="#page/${child.id}">Reference</page-link>\n\n<mention-page url="#page/${child.id}">Mention</mention-page>\n`;
  await vault.update(parent.id, { body }, parent.revision);
  assert.equal((await configure(vault, false, false)).inserted, 1);
  const saved = await vault.get(parent.id);
  assert.ok(saved.body.startsWith(body));
  assert.equal(saved.body.split(`<page url="#page/${child.id}">`).length - 1, 2);
});

test("automatic insertion handles new pages, drag moves, duplicate and idempotent reorders", async t => {
  const { vault } = await fixture(t);
  const parent = await vault.create({ title: "Automatic parent", body: "Keep this", syntax });
  const existing = await vault.create({ title: "Existing", parent: parent.id });
  await configure(vault, true, true);
  assert.equal((await vault.get(parent.id)).body, "Keep this");
  const child = await vault.create({ title: "Automatic child", parent: parent.id });
  assert.ok(child.relatedPages?.some(page => page.id === parent.id));
  let saved = await vault.get(parent.id);
  assert.ok(saved.body.includes(child.id)); assert.ok(!saved.body.includes(existing.id));
  const moved = await vault.create({ title: "Moved" });
  const move = planPageMove(await vault.list(), moved.id, parent.id, "inside")!;
  await vault.move(moved.id, move, moved.revision);
  saved = await vault.get(parent.id);
  assert.ok(saved.body.includes(moved.id));
  const copied = await vault.duplicate(child.id, child.revision);
  assert.ok((await vault.get(parent.id)).body.includes(copied.id));
  const before = await vault.get(parent.id);
  const revision = (await vault.get(moved.id)).revision;
  await vault.update(moved.id, { title: "Renamed" }, revision);
  assert.equal((await vault.get(parent.id)).revision, before.revision);
});

test("strict saves restore missing entries and plain Markdown uses native standalone links", async t => {
  const { vault } = await fixture(t);
  const parent = await vault.create({ title: "Plain", body: "Plain paragraph", bodyFormat: "markdown" });
  await configure(vault, false, false);
  const child = await vault.create({ title: "[A]", parent: parent.id });
  const saved = await vault.get(parent.id);
  assert.ok(saved.body.includes(`(\x23page/${child.id})`));
  assert.ok(!saved.body.includes("<page"));
  const changed = await vault.update(parent.id, { body: "Edited source" }, saved.revision);
  assert.ok(changed.body.startsWith("Edited source"));
  assert.deepEqual([...insertedChildPageIds(changed, await vault.list())], [child.id]);
});

test("unfinished source aborts backfill before changing any page or settings", async t => {
  const { vault } = await fixture(t);
  const good = await vault.create({ title: "A good parent", body: "Keep good", syntax });
  await vault.create({ title: "Child good", parent: good.id });
  const bad = await vault.create({ title: "Z unfinished parent", body: "```xml\nUnfinished", syntax });
  await vault.create({ title: "Child bad", parent: bad.id });
  await assert.rejects(configure(vault, false, false), /unfinished code fence/);
  assert.equal((await vault.get(good.id)).revision, good.revision);
  assert.equal((await vault.get(bad.id)).revision, bad.revision);
  assert.equal((await vault.childPageSettings.get()).settings.allowUninserted, true);
});

test("manual insertion is idempotent and stale parent revisions preserve a conflict", async t => {
  const { vault } = await fixture(t);
  const parent = await vault.create({ title: "Manual parent", syntax, body: "Original" });
  const child = await vault.create({ title: "Manual child", parent: parent.id });
  const inserted = await vault.insertChildPage(child.id, { baseRevision: child.revision, parentRevision: parent.revision });
  const repeated = await vault.insertChildPage(child.id, { baseRevision: child.revision, parentRevision: inserted.revision });
  assert.equal(repeated.revision, inserted.revision);
  await assert.rejects(vault.insertChildPage(child.id, { baseRevision: child.revision, parentRevision: parent.revision }), error =>
    error instanceof VaultError && error.status === 409 && !!error.details.conflictId);
  assert.equal((await vault.get(parent.id)).revision, inserted.revision);
});

test("settings preserve unknown fields and reject a stale settings revision", async t => {
  const { vault, root } = await fixture(t);
  await vault.create({ title: "Page" });
  const filename = path.join(root, "metadata.json"), index = JSON.parse(await fs.readFile(filename, "utf8"));
  index.future = { keep: true }; index.childPageSettings = { allowUninserted: true, autoInsert: false, unknown: "keep" };
  await fs.writeFile(filename, JSON.stringify(index));
  const old = await vault.childPageSettings.get();
  await configure(vault, true, true);
  await assert.rejects(vault.childPageSettings.configure({ settings: old.settings, baseRevision: old.revision }), /Both versions are preserved/);
  const saved = JSON.parse(await fs.readFile(filename, "utf8"));
  assert.deepEqual(saved.future, { keep: true }); assert.equal(saved.childPageSettings.unknown, "keep");
});

test("interrupted page batches recover together and stop on an external edit", async t => {
  const { vault, root } = await fixture(t);
  const parent = await vault.create({ title: "Recovery", body: "Before" });
  const filename = path.join(root, "pages", `${parent.id}.md`), journal = path.join(root, ".history", "page-batch-0000.json");
  await fs.writeFile(journal, JSON.stringify({ version: 1, files: [{ path: `pages/${parent.id}.md`, before: "Before", after: "After" }] }));
  assert.equal((await vault.get(parent.id)).body, "After");
  await fs.writeFile(journal, JSON.stringify({ version: 1, files: [{ path: `pages/${parent.id}.md`, before: "After", after: "Proposed" }] }));
  await fs.writeFile(filename, "External edit");
  await assert.rejects(vault.get(parent.id), /Both versions are preserved/);
  assert.equal(await fs.readFile(filename, "utf8"), "External edit");
});

test("required entries apply to imports and the mobile local API shares the vault settings", async t => {
  const { vault } = await fixture(t);
  const transport = mobileVaultApi(() => vault);
  const initial = await transport("/child-pages/settings", {}) as any;
  await transport("/child-pages/settings", { method: "PUT", body: JSON.stringify({
    settings: { allowUninserted: false, autoInsert: false }, baseRevision: initial.revision,
  }) });
  const plan = prepareMarkdownImport({ name: "Import", dialect: "notdown", files: [
    { path: "Parent.md", data: Buffer.from("Parent body").toString("base64") },
    { path: "Parent/Child.md", data: Buffer.from("Child body").toString("base64") },
  ] });
  assert.equal(plan.errors.length, 0);
  await vault.importBatch(plan);
  const all = await vault.list(), child = all.find(page => page.title === "Child")!;
  assert.ok(child.parent);
  assert.ok((await vault.get(child.parent)).body.includes(child.id));
  const record = await vault.databases.create({ title: "Database" });
  const resources = await vault.databases.get(record.database.id);
  const source = resources.dataSources[0];
  // A database record continues to live in its data source rather than getting a page block.
  const created = await vault.databases.createRecord(source.id, { title: "Record" }, source.revision);
  assert.ok(!(await vault.get(record.hostPage!.id)).body.includes(created.id));
});
