import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import { prepareMarkdownImport } from "../../server/markdown-import.js";
import { createVault } from "../../server/vault.js";
import { createApp } from "../../server/app.js";

const file = (path: string, content: string) => ({ path, data: Buffer.from(content).toString("base64") });
async function temporary(t: { after(fn: () => Promise<void>): void }) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-import-"));
  t.after(async () => {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith("notdown-import-"));
    await fs.rm(directory, { recursive: true, force: true });
  });
  return directory;
}
test("folder imports preserve prose, fenced code, unknown YAML, attachments and original bytes", async t => {
  const root = await temporary(t);
  const vault = createVault(path.join(root, "vault"));
  const existing = await vault.create({ title: "Existing", body: "Do not change" });
  const raw = '---\r\ntitle: 自己的标题\r\ncustom: {value: 3}\r\n# kept comment\r\n---\r\nSee [child](sub/child.md "title") and ![photo](photo.png).\r\n\r\n```md\r\n[child](sub/child.md)\r\n```\r\n';
  const request = { name: "Notes", dialect: "gfm" as const, files: [file("index.md", raw), file("sub/child.md", "Child  \r\ntext\r\n"), file("photo.png", "image bytes")] };
  const plan = prepareMarkdownImport(request);
  assert.equal(plan.errors.length, 0);
  const parent = plan.pages.find(p => p.path === "index.md")!;
  const child = plan.pages.find(p => p.path === "sub/child.md")!;
  assert.ok(parent.source.includes(`[child](#page/${child.id} "title")`));
  assert.ok(parent.source.includes("```md\r\n[child](sub/child.md)\r\n```\r\n"));
  assert.ok(parent.source.includes("# kept comment"));
  const result = await vault.importBatch(plan);
  assert.equal(result.alreadyImported, false);
  assert.equal((await vault.get(parent.id)).title, "自己的标题");
  assert.equal((await vault.get(child.id)).body, "Child  \r\ntext\r\n");
  assert.equal((await vault.get(existing.id)).revision, existing.revision);
  const archive = path.join(vault.vaultPath, ".history/imports", plan.id);
  const manifest = JSON.parse(await fs.readFile(path.join(archive, "manifest.json"), "utf8"));
  const source = manifest.originals.find((f: any) => f.path === "index.md");
  assert.equal(await fs.readFile(path.join(archive, source.archive), "utf8"), raw);
  const saved = await vault.get(parent.id);
  await vault.update(parent.id, { body: "Edited after importing" }, saved.revision);
  const retry = await vault.importBatch(prepareMarkdownImport(request));
  assert.equal(retry.alreadyImported, true);
  assert.equal((await vault.get(parent.id)).body, "Edited after importing");
});
test("unsafe paths, ambiguous names and oversized imports are rejected; invalid YAML is reported", () => {
  for (const name of ["../outside.md", "/absolute.md", "a/../b.md", "C:/x.md", "a\\b.md", "a//b.md"])
    assert.throws(() => prepareMarkdownImport({ name: "Notes", dialect: "gfm", files: [file(name, "x")] }));
  assert.throws(() => prepareMarkdownImport({ name: "Notes", dialect: "gfm", files: [file("A.md", "x"), file("a.md", "y")] }));
  const result = prepareMarkdownImport({ name: "Notes", dialect: "gfm", files: [file("ok.md", "okay"), file("bad.md", "---\nx: [\n---\nbody"), file("open.md", "---\ntitle: unfinished")] });
  assert.equal(result.errors.length, 2);
  assert.ok(!result.pages.some(p => p.path === "bad.md"));
});
test("parsed link destinations are rebased without rewriting code, titles or reference text", () => {
  const body = '[doc][a]\n\n[a]: <dir/my%20file.md> "[literal](dir/my file.md)"\n\n`[x](dir/my%20file.md)`\n\n[image](img(a).png)\n\n[missing](../outside.md)\n';
  const plan = prepareMarkdownImport({ name: "Notes", dialect: "gfm", files: [file("a.md", body), file("dir/my file.md", "target"), file("img(a).png", "x")] });
  const source = plan.pages.find(p => p.path === "a.md")!.source;
  assert.ok(source.includes('[a]: <#page/'));
  assert.ok(source.includes('"[literal](dir/my file.md)"'));
  assert.ok(source.includes('`[x](dir/my%20file.md)`'));
  assert.ok(source.includes('[image](assets/'));
  assert.ok(source.includes('[missing](../outside.md)'));
  assert.equal(plan.warnings.length, 1);
});
test("large attachments respect the 20 MiB boundary without exhausting the parser stack", () => {
  const attachment = { path: "attachment.bin", data: Buffer.alloc(20 * 1024 * 1024 - 1).toString("base64") };
  const plan = prepareMarkdownImport({ name: "Large", dialect: "gfm", files: [file("a.md", "x"), attachment] });
  assert.equal(plan.assets[0].data.length, 20 * 1024 * 1024 - 1);
  assert.throws(() => prepareMarkdownImport({ name: "Large", dialect: "gfm", files: [file("a.md", "xx"), attachment] }), /exceeds 20 MB/);
  for (const data of ["YW=J", "YQ=", "====", "YWJj!!!!"])
    assert.throws(() => prepareMarkdownImport({ name: "Bad", dialect: "gfm", files: [{ path: "a.md", data }] }), /Invalid import file encoding/);
});
test("preview is read-only and committing invalid files requires explicit skip", async t => {
  const root = await temporary(t);
  const app = createApp({ vaultPath: path.join(root, "vault") });
  await app.locals.vault.init();
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  const port = (server.address() as import("node:net").AddressInfo).port;
  const post = (route: string, data: unknown) => fetch(`http://127.0.0.1:${port}/api/import/${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
  const preview = await post("preview", { name: "Notes", dialect: "gfm", files: [file("good.md", "Hello"), file("bad.md", "---\nx: [\n---\nx")] });
  assert.equal(preview.status, 200);
  const summary = await preview.json();
  assert.equal((await app.locals.vault.list()).length, 0);
  assert.equal((await post("commit", { id: summary.id })).status, 400);
  assert.equal((await post("commit", { id: summary.id, skipInvalid: true })).status, 200);
  assert.equal((await app.locals.vault.list()).length, 2);
  assert.equal((await post("commit", { id: "unknown" })).status, 410);
});
test("an interrupted import resumes without overwriting changed destination content", async t => {
  const root = await temporary(t);
  const vault = createVault(path.join(root, "vault")); await vault.init();
  const plan = prepareMarkdownImport({ name: "Notes", dialect: "gfm", files: [file("a.md", "first"), file("b.md", "second")] });
  // Simulate a crash after a complete first page was published.
  await fs.writeFile(path.join(vault.vaultPath, "pages", `${plan.pages[0].id}.md`), plan.pages[0].source);
  assert.equal((await vault.importBatch(plan)).alreadyImported, false);
  assert.equal((await vault.list()).length, 3);
  const other = prepareMarkdownImport({ name: "Other", dialect: "gfm", files: [file("c.md", "third")] });
  await fs.writeFile(path.join(vault.vaultPath, "pages", `${other.pages[0].id}.md`), other.pages[0].source + "Changed");
  await assert.rejects(vault.importBatch(other), /will not be overwritten/);
});
