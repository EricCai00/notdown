import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createVault, VaultError } from "../../server/vault.js";
import { isPageUuid, stablePageUuid } from "../../src/vault/page-id.js";
import { migratePageReferences } from "../../src/vault/page-id-references.js";
import { prepareMarkdownImport } from "../../server/markdown-import.js";

async function fixture(t: { after(fn: () => Promise<void>): void }) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-page-ids-"));
  t.after(async () => { assert.equal(path.dirname(root), os.tmpdir()); await fs.rm(root, { recursive: true, force: true }); });
  const vault = createVault(root); await vault.init();
  const old = "import-" + "a".repeat(24) + "-root";
  const child = "notion-" + "b".repeat(24) + "-22222222-2222-4222-8222-222222222222";
  const source = `<page url="#page/${child}">Child</page>\r\n\r\n\`\`\`md\r\n[keep](#page/${child})\r\n\`\`\`\r\n`;
  const childSource = `---\nparent: ${old} # keep comment\ncustom: ${old}\n---\n[back](#page/${old}#section)\n`;
  await fs.writeFile(path.join(root, "pages", `${old}.md`), source);
  await fs.writeFile(path.join(root, "pages", `${child}.md`), childSource);
  await fs.writeFile(path.join(root, "metadata.json"), JSON.stringify({ version: 1, customRoot: ["keep"], pages: {
    [old]: { id: old, file: `${old}.md`, title: "Root", parent: null, bodyFormat: "notion-markdown", customEntry: { keep: true } },
    [child]: { id: child, file: `${child}.md`, title: "Child", parent: old, bodyFormat: "markdown", notionImport: { pageId: child.slice(32), future: true } },
  } }));
  const batch = "b".repeat(64), archive = path.join(root, ".history/imports", batch);
  await fs.mkdir(archive, { recursive: true });
  await fs.writeFile(path.join(archive, "manifest.json"), JSON.stringify({ id: batch, completed: true, pageIds: [old, child], originals: [], future: true }));
  return { root, vault, old, child, source, childSource, batch };
}

test("page UUID generation is deterministic, namespaced and used by every folder entry", async t => {
  assert.ok(isPageUuid(stablePageUuid("test")));
  assert.equal(stablePageUuid("test"), stablePageUuid("test"));
  assert.notEqual(stablePageUuid("test"), stablePageUuid("other"));
  const request = { name: "Notes", dialect: "gfm" as const, files: [{ path: "dir/a.md", data: Buffer.from("a").toString("base64") }] };
  const plan = prepareMarkdownImport(request);
  assert.ok(plan.pages.every(p => isPageUuid(p.id)));
  assert.deepEqual(plan.pages.map(p => p.id), prepareMarkdownImport(request).pages.map(p => p.id));
  const { vault } = await fixture(t);
  await assert.rejects(vault.create({ title: "Bad" }, { id: "arbitrary" }), /must be UUIDs/);
  assert.ok(isPageUuid((await vault.create({ title: "New" })).id));
});

test("UUID migration preserves source, unknown metadata, hierarchy, import retries, old links and stale drafts", async t => {
  const { root, vault, old, child, source, childSource, batch } = await fixture(t);
  const before = await vault.get(old);
  const result = await vault.migratePageIds(await vault.planPageIdMigration());
  assert.equal(result.migrated, 2);
  const parent = await vault.get(old), nested = await vault.get(child);
  assert.equal(parent.id, stablePageUuid(old));
  assert.equal(nested.id, stablePageUuid(child));
  assert.equal(nested.parent, parent.id);
  assert.equal(parent.body, source.replace(`url="#page/${child}"`, `url="#page/${nested.id}"`));
  assert.equal(nested.body, childSource.replace(`parent: ${old}`, `parent: "${parent.id}"`).replace(`#page/${old}`, `#page/${parent.id}`));
  const index = JSON.parse(await fs.readFile(path.join(root, "metadata.json"), "utf8"));
  assert.deepEqual(index.customRoot, ["keep"]);
  assert.deepEqual(index.pages[parent.id].customEntry, { keep: true });
  assert.equal(index.pages[nested.id].notionImport.batchId, "b".repeat(24));
  assert.ok(index.pages[nested.id].notionImport.future);
  assert.ok((await fs.readdir(path.join(root, "pages"))).every(f => isPageUuid(f.slice(0, -3))));
  const manifest = JSON.parse(await fs.readFile(path.join(result.backupPath!, "manifest.json"), "utf8"));
  assert.ok(manifest.completed);
  assert.ok(manifest.changes.some((c: any) => c.before === source));
  assert.equal(await fs.readFile(path.join(root, ".history", old, `${before.revision}.md`), "utf8"), source);
  assert.deepEqual((await vault.importBatch({ id: batch, name: "Retry", pages: [], assets: [], originals: [], warnings: [], errors: [] })).pageIds, [parent.id, nested.id]);
  assert.equal((await vault.migratePageIds(await vault.planPageIdMigration())).migrated, 0);
  await assert.rejects(vault.update(old, { body: "Unsaved old-window draft" }, before.revision), (e: unknown) => e instanceof VaultError && e.status === 409);
  const conflicts = await vault.listConflicts();
  assert.equal(conflicts[0].proposed.body, "Unsaved old-window draft");
  assert.equal(conflicts[0].pageId, parent.id);
  const copy = await vault.duplicate(parent.id, parent.revision);
  assert.ok(isPageUuid(copy.id));
  assert.equal(copy.legacyIds, undefined);
});

test("migration rejects stale plans and UUID collisions before changing canonical files", async t => {
  const { vault, old, root } = await fixture(t);
  const plan = await vault.planPageIdMigration(), original = await vault.get(old);
  await vault.update(old, { body: "Changed" }, original.revision);
  await assert.rejects(vault.migratePageIds(plan), /changed after/);
  assert.equal((await vault.get(old)).id, old);
  await vault.create({ title: "Collision" }, { id: stablePageUuid(old) });
  await assert.rejects(vault.migratePageIds(await vault.planPageIdMigration()), /collide/);
  assert.ok((await fs.readdir(path.join(root, "pages"))).includes(`${old}.md`));
});

test("existing conflict proposals remain readable and preserve both bodies after migration", async t => {
  const { vault, old, child } = await fixture(t);
  const original = await vault.get(old);
  await vault.update(old, { body: "Current body" }, original.revision);
  await assert.rejects(vault.update(old, { body: `<page url="#page/${child}">Draft</page>` }, original.revision));
  const [before] = await vault.listConflicts();
  await vault.migratePageIds(await vault.planPageIdMigration());
  const [after] = await vault.listConflicts();
  assert.equal(after.conflictId, before.conflictId);
  assert.equal(after.pageId, stablePageUuid(old));
  assert.equal(after.proposed.id, stablePageUuid(old));
  assert.equal(after.proposed.body, `<page url="#page/${stablePageUuid(child)}">Draft</page>`);
  assert.equal(after.current.body, "Current body");
});

test("interrupted ID transactions recover only exact before/after states", async t => {
  const { vault, root, old } = await fixture(t);
  const result = await vault.migratePageIds(await vault.planPageIdMigration());
  const journal = JSON.parse(await fs.readFile(path.join(result.backupPath!, "manifest.json"), "utf8"));
  const removed = journal.changes.find((c: any) => c.file === `pages/${old}.md`);
  await fs.writeFile(path.join(root, removed.file), removed.before);
  await fs.writeFile(path.join(root, ".history/page-id-migration.json"), JSON.stringify(journal));
  assert.ok((await createVault(root).list()).every(p => isPageUuid(p.id)));
  await assert.rejects(fs.access(path.join(root, removed.file)));
  const created = journal.changes.find((c: any) => c.before === null);
  await fs.writeFile(path.join(root, created.file), "External edit");
  await fs.writeFile(path.join(root, ".history/page-id-migration.json"), JSON.stringify(journal));
  await assert.rejects(createVault(root).list(), /conflicts with an external edit/);
  assert.equal(await fs.readFile(path.join(root, created.file), "utf8"), "External edit");
});

test("reference migration changes destinations while preserving literal code and unknown syntax", () => {
  const target = stablePageUuid("old"), ids = new Map([["old", target]]);
  const body = '[old](#page/old#anchor "old")\n\n[ref][x]\n\n[x]: old.md "old"\n\n[[old|Label]]\n\n`[old](#page/old)`\n\n```md\n<page url="#page/old">keep</page>\n```\n\n<future url="#page/old"/>\n';
  const migrated = migratePageReferences({ body, syntax: { version: 1, variant: "notdown", extensions: {} } }, ids);
  assert.equal(migrated, body.replace('](#page/old#', `](#page/${target}#`).replace('[x]: old.md', `[x]: ${target}.md`).replace('[[old|', `[[${target}|`));
  const nfm = '## Toggle {toggle="true"}\n\t```xml\n<page url="#page/old">literal</page>\n\t```\n\t<page url="#page/old">Real</page>\n';
  assert.equal(migratePageReferences({ body: nfm, bodyFormat: "notion-markdown" }, ids), nfm.replace('url="#page/old">Real', `url="#page/${target}">Real`));
  assert.equal(migratePageReferences({ body: 'Literal [[old]]', bodyFormat: 'notion-markdown' }, ids), 'Literal [[old]]');
});
