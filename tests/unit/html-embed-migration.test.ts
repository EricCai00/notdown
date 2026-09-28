import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createVault } from "../../server/vault.js";
import { findHtmlEmbeds, planHtmlEmbedMigration, migrateHtmlEmbeds } from "../../server/html-embed-migration.js";

async function fixture(t: test.TestContext) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-html-migration-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return { root, vault: createVault(root) };
}

test("HTML migration extracts assets, preserves surrounding bytes, attributes and recoverable history", async t => {
  const { root, vault } = await fixture(t);
  const html = '<h1>中文 & HTML</h1>\n<pre>```\n</html-embed></pre>\n';
  const escaped = html.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const prefix = '---\r\ntitle: Keep\r\ncustom: true\r\n---\r\n\r\n', suffix = '\r\n\r\nTail\r\n';
  const body = prefix + '<html-embed custom="keep" url="future">\n' + escaped + '\n</html-embed>' + suffix;
  const page = await vault.create({ body, syntax: { version: 1, variant: "notdown", extensions: {} } });
  const result = await migrateHtmlEmbeds(vault, await planHtmlEmbedMigration(vault));
  assert.deepEqual(result.migrated, [page.id]);
  assert.equal(await fs.readFile(path.join(root, result.assets[0]), "utf8"), html);
  const saved = await vault.get(page.id);
  assert.equal(saved.body, prefix + `<web-embed custom="keep" data-html-embed-url="future" url="${result.assets[0]}"/>` + suffix);
  assert.equal((await planHtmlEmbedMigration(vault)).length, 0);
  const history = await fs.readdir(path.join(root, ".history", page.id));
  assert.ok((await Promise.all(history.filter(file => file.endsWith('.md')).map(file => fs.readFile(path.join(root, ".history", page.id, file), "utf8")))).includes(body));
});

test("migration skips fences, indented code, raw HTML and metadata; malformed blocks stop", () => {
  const body = '---\nexample: |\n  <html-embed/>\n---\n\n```html\n<html-embed/>\n```\n\n    <html-embed/>\n\n<div>\n<html-embed/>\n</div>\n\n<html-embed/>\n';
  const found = findHtmlEmbeds(body);
  assert.equal(found.length, 1);
  assert.equal(found[0].start, body.lastIndexOf('<html-embed/>'));
  assert.throws(() => findHtmlEmbeds('<html-embed>\n&lt;p&gt;'), /Unclosed/);
  assert.throws(() => findHtmlEmbeds('<html-embed/> trailing'), /Ambiguous/);
});

test("stale migration never overwrites a newer page and keeps the proposed conversion in a conflict", async t => {
  const { vault } = await fixture(t);
  const page = await vault.create({ body: '<html-embed>&lt;p&gt;Old&lt;/p&gt;</html-embed>' });
  const plan = await planHtmlEmbedMigration(vault);
  await vault.update(page.id, { body: 'External edit' }, page.revision);
  await assert.rejects(migrateHtmlEmbeds(vault, plan), { status: 409 });
  assert.equal((await vault.get(page.id)).body, 'External edit');
  assert.equal((await vault.listConflicts()).length, 1);
});
