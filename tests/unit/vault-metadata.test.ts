import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { createVault, VaultError } from "../../server/vault.js";
import { prepareMarkdownImport } from "../../server/markdown-import.js";

async function fixture(t: test.TestContext) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-metadata-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const vault = createVault(root);
  return { root, vault, metadata: path.join(root, "metadata.json"), file: (id: string) => path.join(root, "pages", `${id}.md`) };
}

test("new files contain exactly their source and independent JSON entries survive reopen", async t => {
  const { root, vault, metadata, file } = await fixture(t);
  const body = "\uFEFF# Title\r\n\r\n```yaml\r\ntitle: code\r\n```\r\n";
  const a = await vault.create({ title: "A", body, properties: { tags: ["one"] } });
  const b = await vault.create({ title: "B", body: "B" });
  assert.equal(await fs.readFile(file(a.id), "utf8"), body);
  const index = JSON.parse(await fs.readFile(metadata, "utf8"));
  index.extra = { keep: true };
  index.pages[a.id].unknown = { nested: [1, 2] };
  await fs.writeFile(metadata, JSON.stringify(index));
  const latest = await vault.get(a.id);
  const changed = await vault.update(a.id, { favorite: true }, latest.revision);
  assert.equal(changed.body, body);
  assert.equal((await vault.get(b.id)).revision, b.revision);
  const reopened = await createVault(root).get(a.id);
  assert.equal(reopened.revision, changed.revision);
  const saved = JSON.parse(await fs.readFile(metadata, "utf8"));
  assert.deepEqual(saved.extra, index.extra);
  assert.deepEqual(saved.pages[a.id].unknown, index.pages[a.id].unknown);
  assert.equal(saved.pages[a.id].favorite, true);
  assert.equal((await vault.sourceFile(a.id)).source, reopened.body);
});

for (const [label, source] of [
  ["YAML", "---\r\ntitle: Document title\r\nproperties: { status: Published }\r\nauthor: Alice\r\n# keep\r\n...\r\n\r\nBody"],
  ["Pandoc", "% Document title\r\n% Alice\r\n% 2026\r\n\r\nBody"],
]) test(`${label} overrides JSON without contaminating its fallback values`, async t => {
  const { vault, file, metadata } = await fixture(t);
  const page = await vault.create({ title: "JSON title", properties: { status: "Draft", author: "Bob" }, body: source });
  assert.equal(page.title, "Document title");
  assert.equal(page.properties.author, "Alice");
  assert.equal(page.properties.status, label === "YAML" ? "Published" : "Draft");
  assert.equal(page.body, source);
  const edited = await vault.update(page.id, { ...page, title: "Edited document title", body: source.replace("Document title", "Edited document title") + "\nEdited", properties: { ...page.properties, tags: ["tag"] } }, page.revision);
  assert.equal(await fs.readFile(file(page.id), "utf8"), edited.body);
  const index = JSON.parse(await fs.readFile(metadata, "utf8"));
  assert.equal(index.pages[page.id].title, "JSON title");
  assert.equal(index.pages[page.id].properties.author, "Bob");
  const plain = await vault.update(page.id, { ...edited, body: "Body without overrides" }, edited.revision);
  assert.equal(plain.title, "JSON title");
  assert.equal(plain.properties.author, "Bob");
  assert.equal(plain.properties.status, "Draft");
  assert.deepEqual(plain.properties.tags, ["tag"]);
});

test("legacy YAML and plain external Markdown are read without migration", async t => {
  const { vault, file, metadata } = await fixture(t);
  await vault.init();
  const raw = "---\nid: legacy\ntitle: Old title\nicon: old\ncustom: [1, 2]\n---\n\nText\n";
  await fs.writeFile(file("legacy"), raw);
  await fs.writeFile(file("plain"), "Plain Markdown");
  const old = await vault.get("legacy");
  assert.equal(old.body, raw);
  assert.equal((await vault.get("plain")).title, "plain");
  await assert.rejects(fs.stat(metadata), { code: "ENOENT" });
  const saved = await vault.update(old.id, { favorite: true }, old.revision);
  assert.equal(saved.title, "Old title");
  assert.equal(await fs.readFile(file("legacy"), "utf8"), raw);
  const copy = await vault.duplicate(old.id, saved.revision);
  assert.notEqual(copy.id, old.id);
  assert.equal(copy.body, raw);
  assert.equal((await vault.get(copy.id)).id, copy.id);
});

test("external JSON edits cause CAS conflicts and preserve complete source and metadata", async t => {
  const { root, vault, metadata } = await fixture(t);
  const page = await vault.create({ title: "Original", body: "Original body" });
  const index = JSON.parse(await fs.readFile(metadata, "utf8"));
  index.pages[page.id].title = "External";
  await fs.writeFile(metadata, JSON.stringify(index));
  await assert.rejects(vault.update(page.id, { title: "Draft", body: "Draft body" }, page.revision), { status: 409 });
  const [conflict] = await createVault(root).listConflicts();
  assert.equal(conflict.current.title, "External");
  assert.equal(conflict.current.body, "Original body");
  assert.equal(conflict.proposed.title, "Draft");
  assert.equal(conflict.proposed.body, "Draft body");
  const snapshot = JSON.parse(await fs.readFile(path.join(root, ".history", page.id, `${conflict.currentRevision}.json`), "utf8"));
  assert.equal(snapshot.title, "External");
  const resolved = await vault.resolveConflict(conflict.id, {}, conflict.currentRevision);
  assert.equal(resolved.title, "Draft");
  assert.equal(resolved.body, "Draft body");
});

test("separate vault instances serialize different-page JSON updates and stale same-page writes", async t => {
  const { root, vault } = await fixture(t);
  const a = await vault.create({ title: "A" }), b = await vault.create({ title: "B" });
  const other = createVault(root);
  await Promise.all([vault.update(a.id, { title: "A2" }, a.revision), other.update(b.id, { title: "B2" }, b.revision)]);
  assert.equal((await vault.get(a.id)).title, "A2");
  assert.equal((await vault.get(b.id)).title, "B2");
  const current = await vault.get(a.id);
  const results = await Promise.allSettled([vault.update(a.id, { body: "One" }, current.revision), other.update(a.id, { body: "Two" }, current.revision)]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal((await vault.listConflicts()).length, 1);
});

test("malformed JSON is never replaced, and YAML-like fenced code stays ordinary content", async t => {
  const { vault, metadata, file } = await fixture(t);
  const source = "```yaml\n---\ntitle: [broken\n---\n```";
  const page = await vault.create({ title: "Title", body: source });
  assert.equal(page.title, "Title");
  await fs.writeFile(metadata, "{broken");
  await assert.rejects(vault.update(page.id, { body: "replace" }, page.revision), { status: 422 });
  assert.equal(await fs.readFile(file(page.id), "utf8"), source);
  assert.equal(await fs.readFile(metadata, "utf8"), "{broken");
});

test("independent service processes do not lose each other's shared JSON entries", async t => {
  const { root, vault } = await fixture(t);
  const a = await vault.create({ title: "A" }), b = await vault.create({ title: "B" });
  const module = pathToFileURL(path.resolve("server/vault.ts")).href;
  const update = (page: typeof a) => promisify(execFile)(process.execPath, ["--import", "tsx", "--input-type=module", "-e",
    `import { createVault } from ${JSON.stringify(module)}; await createVault(${JSON.stringify(root)}).update(${JSON.stringify(page.id)}, {title: ${JSON.stringify(page.title + " updated")}}, ${JSON.stringify(page.revision)});`,
  ]);
  await Promise.all([update(a), update(b)]);
  assert.equal((await vault.get(a.id)).title, "A updated");
  assert.equal((await vault.get(b.id)).title, "B updated");
});

test("interrupted two-file saves recover only when neither half has external changes", async t => {
  const { root, vault, metadata, file } = await fixture(t);
  const page = await vault.create({ title: "Before", body: "Before body" });
  const before = await fs.readFile(metadata, "utf8");
  const index = JSON.parse(before);
  index.pages[page.id].title = "After";
  const after = JSON.stringify(index);
  const journal = path.join(root, ".history", `pending-${page.id}.json`);
  const pending = { file: `${page.id}.md`, previousSource: page.body, source: "After body", before, after };
  await fs.writeFile(journal, JSON.stringify(pending));
  await fs.writeFile(file(page.id), pending.source);
  assert.equal((await createVault(root).get(page.id)).title, "After");
  await assert.rejects(fs.stat(journal), { code: "ENOENT" });
  await fs.writeFile(journal, JSON.stringify(pending));
  await fs.writeFile(file(page.id), "External third version");
  await assert.rejects(vault.get(page.id), (error: unknown) => error instanceof VaultError && error.status === 503);
  assert.equal(await fs.readFile(file(page.id), "utf8"), "External third version");
  assert.equal(JSON.parse(await fs.readFile(journal, "utf8")).source, "After body");
});

test("folder import adds no application YAML and preserves the original metadata prefix", async t => {
  const { vault } = await fixture(t);
  const raw = "---\r\ntitle: Imported\r\n# comment\r\n---\r\n\r\nBody";
  const plan = prepareMarkdownImport({ name: "Folder", dialect: "gfm", files: [
    { path: "a.md", data: Buffer.from(raw).toString("base64") },
    { path: "b.md", data: Buffer.from("Plain").toString("base64") },
  ] });
  await vault.importBatch(plan);
  const a = plan.pages.find(page => page.path === "a.md")!;
  const b = plan.pages.find(page => page.path === "b.md")!;
  assert.equal((await vault.sourceFile(a.id)).source, raw);
  assert.equal((await vault.sourceFile(b.id)).source, "Plain");
});

test("full width is metadata-only, survives reopen, respects YAML and preserves stale drafts", async t => {
  const { root, vault, metadata, file } = await fixture(t);
  const body = "# Exact source\r\n\r\nKeep spacing.\r\n";
  const page = await vault.create({ title: "Width", body });
  const wide = await vault.update(page.id, { fullWidth: true }, page.revision);
  assert.equal(wide.fullWidth, true);
  assert.equal(await fs.readFile(file(page.id), "utf8"), body);
  assert.equal((await createVault(root).get(page.id)).fullWidth, true);
  assert.equal(JSON.parse(await fs.readFile(metadata, "utf8")).pages[page.id].fullWidth, true);
  assert.equal(wide.properties.fullWidth, undefined);
  await assert.rejects(vault.update(page.id, { fullWidth: false, body: "Stale draft" }, page.revision), (error: any) => error instanceof VaultError && error.status === 409);
  const narrow = await vault.update(page.id, { fullWidth: false }, wide.revision);
  assert.equal(narrow.fullWidth, false);
  const source = "---\nfullWidth: true\n---\n\nYAML width";
  const yaml = await vault.create({ title: "YAML width", body: source, fullWidth: false });
  assert.equal(yaml.fullWidth, true);
  const saved = await vault.update(yaml.id, { fullWidth: false }, yaml.revision);
  assert.equal(saved.fullWidth, true);
  assert.equal(saved.body, source);
  assert.equal(saved.properties.fullWidth, undefined);
  await assert.rejects(vault.update(narrow.id, { fullWidth: "yes" } as any, narrow.revision), (error: any) => error instanceof VaultError && error.status === 400);
});
