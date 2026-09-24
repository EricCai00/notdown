import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createVault } from "../../server/vault.js";

async function fixture(t: test.TestContext) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-yaml-migration-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const vault = createVault(root);
  await vault.init();
  return { root, vault, file: (id: string) => path.join(root, "pages", `${id}.md`) };
}
const header = (id: string) => `---\r\nid: ${id}\r\ntitle: Legacy ${id}\r\nparent: null\r\nicon: file-text\r\nproperties: { status: Draft, nested: { keep: true } }\r\nbodyFormat: markdown\r\nsyntax: { version: 1, variant: markdown, extensions: {} }\r\nunknown: { keep: [1, 2] }\r\n# Keep original comment in backup\r\nupdated: 2026-09-24T00:00:00Z\r\n---\r\n`;

test("migration moves all application headers into one JSON and preserves exact bodies and complete backups", async t => {
  const { root, vault, file } = await fixture(t);
  const bodies = {
    a: "---\r\ntitle: Document override\r\nauthor: Alice\r\n---\r\n\r\nBody\r\n",
    b: "% Pandoc title\r\n% Bob\r\n% 2026\r\n\r\n```yaml\r\nid: code\r\n```\r\n",
  };
  for (const [id, body] of Object.entries(bodies)) await fs.writeFile(file(id), header(id) + body);
  const untouched = "---\ntitle: User YAML\nauthor: User\n---\nText";
  await fs.writeFile(file("user"), untouched);
  const jsonPath = path.join(root, "metadata.json");
  const before = JSON.stringify({ version: 1, customRoot: ["keep"], pages: { a: { id: "a", file: "a.md", title: "Stale fallback", customEntry: true } } });
  await fs.writeFile(jsonPath, before);
  const plan = await vault.planLegacyMetadataMigration();
  assert.equal(plan.pages.length, 2);
  assert.equal(await fs.readFile(file("a"), "utf8"), header("a") + bodies.a);
  const result = await vault.migrateLegacyMetadata(plan);
  assert.equal(result.migrated, 2);
  const saved = JSON.parse(await fs.readFile(jsonPath, "utf8"));
  assert.deepEqual(saved.customRoot, ["keep"]);
  assert.equal(saved.pages.a.customEntry, true);
  for (const [id, body] of Object.entries(bodies)) {
    assert.equal(await fs.readFile(file(id), "utf8"), body);
    assert.equal(saved.pages[id].title, `Legacy ${id}`);
    assert.deepEqual(saved.pages[id].properties, { status: "Draft", nested: { keep: true } });
    assert.deepEqual(saved.pages[id].unknown, { keep: [1, 2] });
    assert.equal(await fs.readFile(path.join(result.backupPath!, `${id}.md`), "utf8"), header(id) + body);
  }
  assert.equal(await fs.readFile(path.join(result.backupPath!, "metadata.before.json"), "utf8"), before);
  assert.equal(JSON.parse(await fs.readFile(path.join(result.backupPath!, "manifest.json"), "utf8")).completed, true);
  assert.equal((await vault.get("a")).title, "Document override");
  assert.equal((await vault.get("b")).title, "Pandoc title");
  assert.equal(await fs.readFile(file("user"), "utf8"), untouched);
  assert.equal((await vault.planLegacyMetadataMigration()).pages.length, 0);
  assert.deepEqual(await vault.migrateLegacyMetadata({ pages: [] }), { migrated: 0, backupPath: null });
});

test("stale migration plans stop without touching other pages or metadata", async t => {
  const { root, vault, file } = await fixture(t);
  for (const id of ["a", "b"]) await fs.writeFile(file(id), header(id) + "Body");
  const plan = await vault.planLegacyMetadataMigration();
  await fs.appendFile(file("b"), "External edit");
  await assert.rejects(vault.migrateLegacyMetadata(plan), { status: 409 });
  assert.equal(await fs.readFile(file("a"), "utf8"), header("a") + "Body");
  assert.equal(await fs.readFile(file("b"), "utf8"), header("b") + "BodyExternal edit");
  await assert.rejects(fs.stat(path.join(root, "metadata.json")), { code: "ENOENT" });
});

test("the one-time marker prevents stripping a document's own application-shaped YAML on a second run", async t => {
  const { vault, file } = await fixture(t);
  const body = header("a") + "Original body";
  await fs.writeFile(file("a"), header("a") + body);
  await vault.migrateLegacyMetadata(await vault.planLegacyMetadataMigration());
  assert.equal(await fs.readFile(file("a"), "utf8"), body);
  assert.equal((await vault.planLegacyMetadataMigration()).pages.length, 0);
});

test("old application headers without bodyFormat migrate with the legacy Markdown default", async t => {
  const { vault, file } = await fixture(t);
  const old = header("old").replace("bodyFormat: markdown\r\n", "").replace("syntax: { version: 1, variant: markdown, extensions: {} }\r\n", "");
  await fs.writeFile(file("old"), old + "Body\r\n");
  assert.equal((await vault.migrateLegacyMetadata(await vault.planLegacyMetadataMigration())).migrated, 1);
  assert.equal(await fs.readFile(file("old"), "utf8"), "Body\r\n");
  assert.equal((await vault.get("old")).bodyFormat, "markdown");
});
