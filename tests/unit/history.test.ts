import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { once } from "node:events";
import { createVault } from "../../server/vault.js";
import { createGitHistory } from "../../server/git-history.js";
import { createApp } from "../../server/app.js";
import { readVaultZip, writeVaultZip } from "../../src/mobile/backup.js";

async function fixture(t: TestContext) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-history-")), vault = createVault(root);
  const git = createGitHistory(vault);
  t.after(async () => {
    vault.closeHistory(); await git.close();
    assert.equal(path.dirname(root), path.resolve(os.tmpdir())); assert.ok(path.basename(root).startsWith("notdown-history-"));
    await fs.rm(root, { recursive: true, force: true });
  });
  return { root, vault, git };
}
async function enable(git: ReturnType<typeof createGitHistory>) {
  const current = await git.status();
  return git.configure({ settings: { ...current.settings, gitEnabled: true }, baseRevision: current.revision });
}

test("frequent saves coalesce history; idle checkpoints retain the final version and no-op saves retain revisions", async t => {
  const { vault } = await fixture(t);
  let page = await vault.create({ title: "Notes", body: "Original" });
  page = await vault.update(page.id, { body: "First edit" }, page.revision);
  page = await vault.update(page.id, { body: "Final edit" }, page.revision);
  assert.equal((await vault.history.list(page.id)).length, 1);
  assert.equal((await vault.update(page.id, { body: page.body, title: page.title }, page.revision)).revision, page.revision);
  await vault.checkpointHistory();
  const entries = await vault.history.list(page.id);
  assert.equal(entries.length, 2);
  assert.ok((await Promise.all(entries.map(entry => vault.history.read(page.id, entry.id)))).some(record => record.source === "Final edit"));
  await vault.checkpointHistory(); assert.equal((await vault.history.list(page.id)).length, 2);
  await assert.rejects(vault.update(page.id, { body: "Stale draft" }, "0".repeat(64)), { status: 409 });
  assert.equal((await vault.get(page.id)).body, "Final edit");
  assert.equal((await vault.listConflicts()).length, 1);
});

test("retention only prunes owned automatic snapshots and preserves legacy, protected and externally modified versions", async t => {
  const { root, vault } = await fixture(t);
  let page = await vault.create({ title: "Notes", body: "Original" });
  const settings = await vault.history.getSettings();
  await vault.history.configure({ settings: { ...settings.settings, maxVersions: 2 }, baseRevision: settings.revision });
  page = await vault.update(page.id, { body: "One" }, page.revision); await vault.checkpointHistory();
  const externalRevision = (await vault.history.list(page.id)).find(entry => !entry.protected)!.id;
  const externalFile = path.join(root, ".history", page.id, `${externalRevision}.md`);
  await fs.writeFile(externalFile, "Externally edited history");
  page = await vault.update(page.id, { body: "Two" }, page.revision); await vault.checkpointHistory(true, "Important version");
  const protectedEntry = (await vault.history.list(page.id)).find(entry => entry.message === "Important version")!;
  assert.ok(protectedEntry.protected);
  const folder = path.join(root, ".history", page.id), legacyRevision = "a".repeat(64);
  await fs.writeFile(path.join(folder, `${legacyRevision}.md`), "Unknown legacy snapshot");
  for (const body of ["Three", "Four", "Five"]) {
    page = await vault.update(page.id, { body }, page.revision); await vault.checkpointHistory();
  }
  const entries = await vault.history.list(page.id);
  assert.ok(entries.some(entry => entry.id === legacyRevision));
  assert.ok(entries.some(entry => entry.id === protectedEntry.id));
  assert.ok(entries.filter(entry => !entry.protected).length <= 2);
  assert.equal(await fs.readFile(path.join(folder, `${legacyRevision}.md`), "utf8"), "Unknown legacy snapshot");
  assert.equal(await fs.readFile(externalFile, "utf8"), "Externally edited history");
  assert.ok(await fs.stat(externalFile.replace(/\.md$/, ".json")));
});

test("history settings use CAS, preserve unknown fields and reject malformed data", async t => {
  const { root, vault } = await fixture(t); await vault.init();
  const directory = path.join(root, ".notdown"); await fs.mkdir(directory);
  const file = path.join(directory, "history.json"); await fs.writeFile(file, JSON.stringify({ future: { keep: true } }));
  const initial = await vault.history.getSettings();
  await vault.history.configure({ settings: { ...initial.settings, maxVersions: 50 }, baseRevision: initial.revision });
  await assert.rejects(vault.history.configure({ settings: initial.settings, baseRevision: initial.revision }), { status: 409 });
  assert.deepEqual(JSON.parse(await fs.readFile(file, "utf8")).future, { keep: true });
  await fs.writeFile(file, "{broken"); await assert.rejects(vault.history.getSettings(), /preserved/);
  assert.equal(await fs.readFile(file, "utf8"), "{broken");
});

test("the first edit after reopening preserves the previous session even inside the coalescing interval", async t => {
  const { root, vault } = await fixture(t);
  let page = await vault.create({ title: "Reopen", body: "Original" });
  page = await vault.update(page.id, { body: "End of previous session" }, page.revision);
  const reopened = createVault(root); t.after(() => reopened.closeHistory());
  await reopened.update(page.id, { body: "New session edit" }, page.revision);
  const entries = await reopened.history.list(page.id);
  const sources = await Promise.all(entries.map(entry => reopened.history.read(page.id, entry.id)));
  assert.ok(sources.some(record => record.source === "End of previous session"));
});

test("checkpoint intervals and age retention follow the configured clock without removing the latest recovery point", async t => {
  const { vault } = await fixture(t);
  let clock = Date.now(); t.mock.method(Date, "now", () => clock);
  let page = await vault.create({ title: "Timed history", body: "Initial" });
  page = await vault.update(page.id, { body: "One" }, page.revision);
  page = await vault.update(page.id, { body: "Two" }, page.revision);
  assert.equal((await vault.history.list(page.id)).length, 1);
  clock += 6 * 60_000;
  page = await vault.update(page.id, { body: "Three" }, page.revision);
  assert.equal((await vault.history.list(page.id)).length, 2);
  clock += 31 * 86_400_000;
  await vault.checkpointHistory();
  const entries = await vault.history.list(page.id);
  assert.equal(entries.length, 1);
  assert.equal((await vault.history.read(page.id, entries[0].id)).source, "Three");
});

test("Git history is local, excludes credentials and binaries, restores one page with CAS and preserves unknown properties", { timeout: 60_000 }, async t => {
  const { root, vault, git } = await fixture(t);
  let first = await vault.create({ title: "First", body: "Original\r\n", properties: { value: 1 } });
  const other = await vault.create({ title: "Other", body: "Keep me" });
  const legacy = "---\nid: CON\ntitle: Legacy identity\n---\nLegacy source";
  await fs.writeFile(path.join(root, "pages", "legacy-name.md"), legacy);
  await fs.writeFile(path.join(root, "pages", "legacy-prefix.md"), "---\nid: page-CON\ntitle: Separate identity\n---\nSeparate source");
  await fs.mkdir(path.join(root, ".notdown"), { recursive: true });
  await fs.writeFile(path.join(root, ".notdown", "services.json"), '{"token":"NEVER_COMMIT_THIS_SECRET"}');
  await fs.writeFile(path.join(root, "assets", "sample.bin"), Buffer.from([0, 1, 2]));
  const file = path.join(root, "metadata.json"), index = JSON.parse(await fs.readFile(file, "utf8"));
  index.pages[first.id].future = { keep: "original" }; await fs.writeFile(file, JSON.stringify(index));
  first = await vault.get(first.id);
  const enabled = await enable(git); assert.ok(enabled.latest); assert.equal(enabled.localOnly, true);
  const original = (await git.list(first.id))[0];
  assert.equal((await git.read("CON", (await git.list("CON"))[0].id)).source, legacy);
  assert.match((await git.read("page-CON", (await git.list("page-CON"))[0].id)).source, /Separate source$/);
  const paths = (await promisify(execFile)("git", [`--git-dir=${enabled.repository}`, "ls-tree", "-r", "--name-only", "HEAD"])).stdout;
  assert.ok(paths.includes(`pages/${first.id}.md`)); assert.ok(!paths.includes("services.json")); assert.ok(!paths.includes("sample.bin")); assert.ok(!paths.includes(".history/"));
  assert.equal((await git.checkpoint("Nothing changed")).created, false);
  first = await vault.update(first.id, { body: "Newer", properties: { value: 2 } }, first.revision);
  await git.checkpoint("Named checkpoint");
  const record = await git.read(first.id, original.id);
  assert.equal(record.source, "Original\r\n"); assert.deepEqual(record.metadata.future, { keep: "original" });
  await assert.rejects(vault.restoreHistory(first.id, record, "0".repeat(64)), { status: 409 });
  assert.equal((await vault.get(first.id)).body, "Newer");
  first = await vault.restoreHistory(first.id, record, first.revision);
  assert.equal(first.body, "Original\r\n"); assert.equal(first.properties.value, 1);
  assert.equal((await vault.get(other.id)).revision, other.revision);
  assert.deepEqual(JSON.parse(await fs.readFile(file, "utf8")).pages[first.id].future, { keep: "original" });
  assert.ok((await vault.history.list(first.id)).some(entry => entry.message === "Before restore"));
});

test("missing Git and a changed managed Git configuration fail without changing saved notes", async t => {
  const { root, vault, git } = await fixture(t);
  const page = await vault.create({ title: "Safe", body: "Saved text" });
  const missing = createGitHistory(vault, path.join(root, "no-git-executable"));
  const initial = await vault.history.getSettings();
  await assert.rejects(missing.configure({ settings: { ...initial.settings, gitEnabled: true }, baseRevision: initial.revision }), { status: 503 });
  assert.equal((await vault.history.getSettings()).settings.gitEnabled, false);
  const state = await enable(git);
  const originalConfig = await fs.readFile(path.join(state.repository!, "config"), "utf8");
  await fs.appendFile(path.join(state.repository!, "config"), "\n[include]\n path = untrusted\n");
  await assert.rejects(git.checkpoint(), /configuration changed/);
  assert.deepEqual(await git.list(page.id), []);
  assert.match((await git.status()).error!, /configuration changed/);
  assert.equal((await vault.get(page.id)).body, "Saved text");
  await fs.writeFile(path.join(state.repository!, "config"), originalConfig);
  assert.equal((await git.checkpoint()).created, false);
  assert.equal((await git.status()).error, undefined);
});

test("history HTTP routes preview and restore with explicit revisions", { timeout: 60_000 }, async t => {
  const { root, vault } = await fixture(t);
  let page = await vault.create({ title: "HTTP note", body: "Before" });
  page = await vault.update(page.id, { body: "After" }, page.revision);
  const app = createApp({ vaultPath: root }), server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(async () => { app.locals.closeRNotebook(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  const { port } = server.address() as { port: number }, base = `http://127.0.0.1:${port}/api/pages/${page.id}/history`;
  const entries = await fetch(base).then(r => r.json()); assert.equal(entries.length, 1);
  const endpoint = `${base}/snapshot/${entries[0].id}`;
  assert.equal((await fetch(endpoint).then(r => r.json())).source, "Before");
  const send = (body: unknown) => fetch(`${endpoint}/restore`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  assert.equal((await send({})).status, 400);
  assert.equal((await send({ baseRevision: page.revision })).status, 200);
  assert.equal((await vault.get(page.id)).body, "Before");
});

test("portable ZIP recovery discards Git lock files and retains its repository and page bytes", () => {
  const text = (path: string, source: string) => ({ path, data: new TextEncoder().encode(source) });
  const files = readVaultZip(writeVaultZip([
    text("pages/note.md", "Keep original bytes\r\n"), text(".notdown/git-history.lock", "stale process"),
    text(".notdown/git-history.git/index.lock", "stale index"), text(".notdown/git-history.git/HEAD", "ref: refs/heads/history\n"),
  ]));
  assert.deepEqual(files.map(file => file.path).sort(), [".notdown/git-history.git/HEAD", "pages/note.md"]);
  assert.equal(new TextDecoder().decode(files.find(file => file.path === "pages/note.md")!.data), "Keep original bytes\r\n");
});
