import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { createVault, VaultError } from "../../src/vault/vault";
import { nodeVaultPlatform } from "../../server/vault-platform";
import { hashBytes } from "../../src/vault/crypto";
import { MobileAssetLoader } from "../../src/mobile/asset-loader";

async function fixture(t: test.TestContext, count = 30) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-navigation-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const entries = Array.from({ length: count }, (_, i) => {
    const id = randomUUID(), source = `Page ${i}\n`;
    return { id, source, metadata: { id, title: `Page ${i}`, file: `${id}.md`, sourceHash: hashBytes(source), futureField: { keep: true } } };
  });
  const desktop = createVault(root, nodeVaultPlatform);
  await desktop.restoreFiles([
    { path: "metadata.json", data: Buffer.from(JSON.stringify({ version: 1, pages: Object.fromEntries(entries.map(entry => [entry.id, entry.metadata])) })) },
    ...entries.map(entry => ({ path: `pages/${entry.id}.md`, data: Buffer.from(entry.source) })),
  ]);
  const reads: string[] = [];
  const traced = new Proxy(nodeVaultPlatform.fs, { get(target, name) {
    const value = Reflect.get(target, name);
    if (typeof value !== "function") return value;
    return (...args: unknown[]) => { if (name === "readFile") reads.push(args[0] as string); return Reflect.apply(value, target, args); };
  } });
  const mobile = createVault(root, { ...nodeVaultPlatform, fs: traced }, { privateReplica: true });
  return { root, entries, mobile, desktop, reads };
}

test("mobile reads only the requested Markdown and observes fresh source and metadata", async t => {
  const { root, entries, mobile, desktop, reads } = await fixture(t);
  const entry = entries[12];
  assert.deepEqual(await mobile.get(entry.id), await desktop.get(entry.id));
  assert.deepEqual(reads.filter(file => path.dirname(file) === path.join(root, "pages")), [path.join(root, "pages", `${entry.id}.md`)]);
  const first = await mobile.get(entry.id);
  await fs.writeFile(path.join(root, "pages", `${entry.id}.md`), "---\ntitle: Source override\ncustom: keep\n---\nNew external body\n");
  const metadataFile = path.join(root, "metadata.json"), metadata = JSON.parse(await fs.readFile(metadataFile, "utf8"));
  metadata.pages[entry.id].icon = "🌲"; metadata.pages[entry.id].properties = { fresh: true };
  await fs.writeFile(metadataFile, JSON.stringify(metadata));
  const fresh = await mobile.get(entry.id);
  assert.deepEqual(fresh, await desktop.get(entry.id)); assert.notEqual(fresh.revision, first.revision);
  assert.equal(fresh.title, "Source override"); assert.equal(fresh.icon, "🌲");
  await assert.rejects(mobile.update(entry.id, { body: "stale draft" }, first.revision), (error: unknown) => error instanceof VaultError && error.status === 409);
  assert.equal((await mobile.listConflicts())[0].proposed.body, "stale draft");
});

test("mobile lookup falls back for renamed files and refuses unsafe metadata paths", async t => {
  const { root, entries, mobile, desktop, reads } = await fixture(t, 2), entry = entries[0];
  await fs.rename(path.join(root, "pages", `${entry.id}.md`), path.join(root, "pages", "Renamed.md"));
  assert.deepEqual(await mobile.get(entry.id), await desktop.get(entry.id));
  const file = path.join(root, "metadata.json"), metadata = JSON.parse(await fs.readFile(file, "utf8"));
  metadata.pages[entry.id].file = "../../outside.md";
  await fs.writeFile(file, JSON.stringify(metadata)); reads.length = 0;
  assert.deepEqual(await mobile.get(entry.id), await desktop.get(entry.id));
  assert.equal(reads.some(file => file.endsWith("outside.md")), false);
  await assert.rejects(mobile.get(randomUUID()), (error: unknown) => error instanceof VaultError && error.status === 404);
});

test("ordinary mobile saves read the page and its ancestors without reading unrelated Markdown", async t => {
  const { root, entries, mobile, desktop, reads } = await fixture(t);
  const parent = entries[0], child = entries[1];
  const before = await desktop.get(child.id);
  await desktop.update(child.id, { parent: parent.id }, before.revision);
  const page = await mobile.get(child.id); reads.length = 0;
  const saved = await mobile.update(child.id, { title: "Edited child", body: "Saved before switching\n", syntax: null }, page.revision);
  assert.deepEqual(saved, await desktop.get(child.id));
  const markdown = reads.filter(file => path.dirname(file) === path.join(root, "pages"));
  assert.deepEqual([...new Set(markdown)].sort(), [path.join(root, "pages", `${parent.id}.md`), path.join(root, "pages", `${child.id}.md`)].sort());
  const metadata = JSON.parse(await fs.readFile(path.join(root, "metadata.json"), "utf8"));
  assert.deepEqual(metadata.pages[child.id].futureField, { keep: true });
  await fs.writeFile(path.join(root, "pages", `${parent.id}.md`), "---\ntrashed: true\n---\nParent in trash\n");
  await assert.rejects(mobile.update(child.id, { body: "must not save" }, saved.revision), /Restore the parent/);
  assert.equal((await mobile.get(child.id)).body, "Saved before switching\n");
});

test("removing hierarchy YAML falls back and validates the underlying metadata parent", async t => {
  const { entries, mobile, desktop } = await fixture(t, 3);
  let child = await desktop.get(entries[2].id);
  child = await desktop.update(child.id, { parent: entries[0].id }, child.revision);
  child = await desktop.update(child.id, { body: `---\nparent: ${entries[1].id}\n---\nOverride\n` }, child.revision);
  const saved = await mobile.update(child.id, { body: "Removed YAML\n" }, child.revision);
  assert.equal(saved.parent, entries[0].id); assert.deepEqual(saved, await desktop.get(child.id));
});

test("a target changed during the accelerated save keeps both versions and the original history", async t => {
  const { root, entries, mobile } = await fixture(t, 2), entry = entries[0];
  const before = await mobile.get(entry.id), targetFile = path.join(root, "pages", `${entry.id}.md`);
  let changed = false;
  const platform = { ...nodeVaultPlatform,
    async replaceFile(temporary: string, destination: string, expected: import("buffer").Buffer | null) {
      await nodeVaultPlatform.replaceFile(temporary, destination, expected);
      if (!changed && destination === path.join(root, ".history", entry.id, `${before.revision}.md`)) {
        changed = true; await fs.writeFile(targetFile, "External edit during save\n");
      }
    },
  };
  const racing = createVault(root, platform, { privateReplica: true });
  await assert.rejects(racing.update(entry.id, { body: "Mobile proposal\n" }, before.revision), (error: unknown) => error instanceof VaultError && error.status === 409);
  assert.equal(await fs.readFile(targetFile, "utf8"), "External edit during save\n");
  assert.equal(await fs.readFile(path.join(root, ".history", entry.id, `${before.revision}.md`), "utf8"), before.body);
  const conflicts = await racing.listConflicts();
  assert.equal(conflicts[0].current.body, "External edit during save\n");
  assert.equal(conflicts[0].proposed.body, "Mobile proposal\n");
});

test("mobile direct reads finish interrupted Markdown and metadata saves before opening", async t => {
  const { root, entries, mobile, desktop } = await fixture(t, 1), entry = entries[0];
  const before = await fs.readFile(path.join(root, "metadata.json"), "utf8"), metadata = JSON.parse(before);
  metadata.pages[entry.id].title = "Recovered title";
  const source = "Recovered source\n", after = JSON.stringify(metadata);
  await fs.writeFile(path.join(root, ".history", `pending-${entry.id}.json`), JSON.stringify({
    file: `${entry.id}.md`, previousSource: entry.source, source, before, after,
  }));
  const recovered = await mobile.get(entry.id);
  assert.equal(recovered.body, source); assert.equal(recovered.title, "Recovered title");
  assert.deepEqual(recovered, await desktop.get(entry.id));
});

test("attachment loading deduplicates display requests, limits concurrency and drops old vault results", async () => {
  const gates: (() => void)[] = [], seen: string[] = [], ready: string[] = [];
  let active = 0, maximum = 0;
  const loader = new MobileAssetLoader(async key => {
    seen.push(key); active++; maximum = Math.max(maximum, active);
    await new Promise<void>(resolve => gates.push(resolve)); active--; return new Uint8Array([1, 2, 3]);
  }, key => ready.push(key));
  assert.equal(loader.resolve("/assets/a.png"), "/assets/a.png");
  const first = loader.load("assets/a.png"), duplicate = loader.load("/assets/a.png");
  assert.equal(first, duplicate);
  const pending = [first, ...Array.from({ length: 7 }, (_, i) => loader.load(`assets/${i}.png`))];
  assert.equal(seen.length, 4); assert.equal(maximum, 4);
  loader.clear(); gates.splice(0).forEach(resolve => resolve());
  await Promise.all(pending); assert.deepEqual(ready, []); assert.equal(seen.length, 4);
  const latest = loader.load("assets/a.png"); gates.splice(0).forEach(resolve => resolve()); await latest;
  assert.deepEqual(ready, ["assets/a.png"]); assert.match(loader.resolve("assets/a.png"), /^blob:/);
  loader.clear();
});

test("missing attachments can be retried without blocking other displays", async () => {
  let attempts = 0;
  const loader = new MobileAssetLoader(async () => { if (++attempts === 1) throw new Error("Missing asset"); return new Uint8Array([1]); }, () => {});
  await assert.rejects(loader.load("assets/missing.png"), /Missing asset/);
  await loader.load("assets/missing.png"); assert.match(loader.resolve("/assets/missing.png"), /^blob:/);
  loader.clear();
});
