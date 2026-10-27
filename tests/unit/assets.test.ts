import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { once } from "node:events";
import { createVault } from "../../server/vault";
import { createApp } from "../../server/app";
import { localAssetPath } from "../../src/features/assets/asset-model";
import { pageAssetReferences } from "../../src/features/assets/asset-references";
import { defaultSyntax } from "../../src/markdown-engine/config";
import { createVault as createPortableVault } from "../../src/vault/vault";
import { nodeVaultPlatform } from "../../server/vault-platform";
import { prepareMarkdownImport } from "../../server/markdown-import";
import { notionAssets } from "../../server/notion-assets";
import { isPageUuid } from "../../src/vault/page-id";

async function fixture(t: { after(fn: () => Promise<void>): void }) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-assets-"));
  assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
  assert.ok(path.basename(root).startsWith("notdown-assets-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const vault = createVault(root); await vault.init(); return { root, vault };
}

test("uploads retain original names across reopen, preserve metadata and leave page revisions unchanged", async t => {
  const { root, vault } = await fixture(t);
  const page = await vault.create({ title: "Keep", body: "Unchanged body\r\n" });
  const metadataPath = path.join(root, "metadata.json");
  const metadata = JSON.parse(await fs.readFile(metadataPath, "utf8"));
  metadata.external = { keep: "unknown" }; metadata.assets = { "assets/old.txt": { name: "old.txt", unknown: 42 } };
  await fs.writeFile(metadataPath, JSON.stringify(metadata));
  const payload = Buffer.alloc(2 * 1024 * 1024, 67);
  const upload = await vault.uploadAsset("../报告 <draft>.pdf", "application/pdf", payload.toString("base64"));
  assert.equal(upload.name, "报告 <draft>.pdf");
  const reopened = createVault(root), library = await reopened.listAssets();
  const asset = library.assets.find(asset => asset.path === upload.path)!;
  assert.equal(asset.name, upload.name); assert.equal(asset.originalName, upload.name);
  assert.equal(asset.kind, "pdf"); assert.equal(asset.size, payload.length); assert.ok(asset.addedAt);
  assert.deepEqual(await reopened.readAsset(upload.path), payload);
  assert.equal((await reopened.get(page.id)).revision, page.revision);
  const after = JSON.parse(await fs.readFile(metadataPath, "utf8"));
  assert.deepEqual(after.external, { keep: "unknown" }); assert.equal(after.assets["assets/old.txt"].unknown, 42);
  assert.equal(after.assets[upload.path].name, upload.name);
});

test("upload, folder and Notion use the same content path, deduplicate and preserve the first record", async t => {
  const { root, vault } = await fixture(t);
  for (const [name, mime] of [["markdown & notion.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"], ["a.html", "text/html"], ["photo.jpeg", "image/jpeg"], ["data.custom", "application/octet-stream"]]) {
    const data = Buffer.from(`content of ${name}`);
    const uploaded = await vault.uploadAsset(name, mime, data.toString("base64"));
    assert.ok(isPageUuid(path.basename(uploaded.path, path.extname(uploaded.path))));
    const folder = prepareMarkdownImport({ name: "Folder", dialect: "gfm", files: [{ path: "note.md", data: Buffer.from(`[file](<${name}>)`).toString("base64") }, { path: name, data: data.toString("base64") }] });
    const media = notionAssets({ signal: new AbortController().signal, remaining: () => 10000, reserve: () => {}, warn: () => assert.fail("Unexpected download failure"), read: async () => ({ data, contentType: mime, name }) });
    assert.equal(await media.save("https://example.test/download"), uploaded.path);
    assert.equal(`assets/${folder.assets[0].filename}`, uploaded.path);
    await vault.importBatch(folder);
    const metadataPath = path.join(root, "metadata.json"), before = JSON.parse(await fs.readFile(metadataPath, "utf8"));
    before.assets[uploaded.path].custom = { keep: true }; await fs.writeFile(metadataPath, JSON.stringify(before));
    const again = await vault.uploadAsset(`copy-${name}`, mime, data.toString("base64"));
    assert.equal(again.path, uploaded.path); assert.equal(again.name, `copy-${name}`);
    assert.deepEqual(JSON.parse(await fs.readFile(metadataPath, "utf8")).assets[uploaded.path], before.assets[uploaded.path]);
    assert.deepEqual(await vault.assetInfo(uploaded.path), { path: uploaded.path, name, size: data.length });
    await fs.writeFile(path.join(root, uploaded.path), "externally changed");
    await assert.rejects(vault.uploadAsset(name, mime, data.toString("base64")), { status: 409 });
    assert.equal(await fs.readFile(path.join(root, uploaded.path), "utf8"), "externally changed");
    const conflicts = path.join(root, ".history", "asset-conflicts");
    const proposals = await Promise.all((await fs.readdir(conflicts)).map(async file => JSON.parse(await fs.readFile(path.join(conflicts, file), "utf8"))));
    assert.equal(proposals.find(proposal => proposal.path === uploaded.path).data, data.toString("base64"));
  }
  assert.equal((await fs.readdir(path.join(root, "assets"))).length, 4);
});

test("attachment info supports legacy paths, rejects traversal and never changes page revisions", async t => {
  const { root, vault } = await fixture(t);
  const page = await vault.create({ title: "Keep", body: "Unchanged" });
  await fs.mkdir(path.join(root, "assets", "legacy"));
  await fs.writeFile(path.join(root, "assets", "legacy", "file.txt"), "old");
  assert.deepEqual(await vault.assetInfo("assets/legacy/file.txt"), { path: "assets/legacy/file.txt", name: null, size: 3 });
  await assert.rejects(vault.assetInfo("assets/../metadata.json"), { status: 400 });
  const external = path.join(root, "outside"); await fs.mkdir(external); await fs.writeFile(path.join(external, "file.txt"), "secret");
  await fs.symlink(external, path.join(root, "assets", "junction"), "junction");
  await assert.rejects(vault.assetInfo("assets/junction/file.txt"), { status: 422 });
  assert.equal((await vault.get(page.id)).revision, page.revision);
});

test("reference index covers body, metadata, missing files and Trash, without counting example code", async t => {
  const { root, vault } = await fixture(t);
  const upload = await vault.uploadAsset("Diagram.png", "image/png", Buffer.from("image").toString("base64"));
  const page = await vault.create({ title: "References", icon: upload.path,
    properties: { cover: upload.path, Files: [{ name: "diagram", url: upload.path }] },
    syntax: { version: 1, variant: "notdown", extensions: {} },
    body: `![image](${upload.path})\n\n[file](/${upload.path})\n\n<audio src="assets/missing.wav"></audio>\n\n\`assets/example.png\`\n\n\`\`\`md\n![example](assets/code-only.png)\n\`\`\`\n`,
  });
  let library = await vault.listAssets();
  const asset = library.assets.find(asset => asset.path === upload.path)!;
  assert.equal(asset.references.length, 1);
  assert.deepEqual(new Set(asset.references[0].locations), new Set(["Body", "Page icon", "Page cover", "Property: Files"]));
  assert.equal(asset.references[0].trashed, false);
  assert.equal(library.assets.find(asset => asset.path === "assets/missing.wav")?.missing, true);
  assert.equal(library.assets.some(asset => /example|code-only/.test(asset.path)), false);
  await vault.update(page.id, { trashed: true }, page.revision);
  library = await vault.listAssets();
  assert.equal(library.assets.find(asset => asset.path === upload.path)!.references[0].trashed, true);
  assert.equal(await fs.readFile(path.join(root, upload.path), "utf8"), "image");
});

test("disk scans include legacy and nested attachments without rewriting the vault", async t => {
  const { root, vault } = await fixture(t);
  await fs.mkdir(path.join(root, "assets", "old files"));
  await fs.writeFile(path.join(root, "assets", "old files", "图 1.png"), "pixels");
  await fs.writeFile(path.join(root, "assets", ".private"), "not listed");
  const page = await vault.create({ title: "Nested", body: "![diagram](../assets/old%20files/%E5%9B%BE%201.png)" });
  const before = await fs.readFile(path.join(root, "metadata.json"), "utf8");
  const asset = (await vault.listAssets()).assets[0];
  assert.equal(asset.path, "assets/old files/图 1.png"); assert.equal(asset.size, 6);
  assert.equal(asset.originalName, null); assert.equal(asset.references[0].pageId, page.id);
  assert.equal(await fs.readFile(path.join(root, "metadata.json"), "utf8"), before);
});

test("reference extraction follows dialect links, reference images and HTML, excluding remote and disabled syntax", () => {
  const page = { id: "page", title: "Test", parent: null, icon: "", properties: {}, revision: "1", updated: "", syntax: defaultSyntax("markdown"),
    body: '![reference][pic]\n\n[pic]: assets/ref.png\n\n<img src="assets/html.png">\n\n![remote](https://example.test/assets/remote.png)\n\n`![code](assets/inline.png)`' };
  const result = pageAssetReferences(page);
  assert.ok(result.references.has("assets/ref.png"));
  assert.ok(result.references.has("assets/html.png"));
  assert.equal(result.references.has("assets/remote.png"), false);
  assert.equal(result.references.has("assets/inline.png"), false);
});

test("asset paths reject traversal and external URLs", () => {
  assert.equal(localAssetPath("/assets/a%20b.png#preview"), "assets/a b.png");
  for (const value of ["https://example.test/assets/a.png", "assets/../metadata.json", "assets/%2e%2e/metadata.json", "assets/a%5Cb", "assets/a%00b", "assets//a", "../../assets/a"]) assert.equal(localAssetPath(value), undefined);
});

test("concurrent uploads keep both records and invalid asset metadata is never overwritten", async t => {
  const { root, vault } = await fixture(t);
  const other = createVault(root);
  const uploads = await Promise.all([vault.uploadAsset("one.txt", "text/plain", "b25l"), other.uploadAsset("two.txt", "text/plain", "dHdv")]);
  const library = await vault.listAssets();
  assert.deepEqual(new Set(library.assets.map(asset => asset.name)), new Set(["one.txt", "two.txt"]));
  const file = path.join(root, "metadata.json"), before = JSON.parse(await fs.readFile(file, "utf8"));
  before.assets = ["unknown external format"]; const invalid = JSON.stringify(before); await fs.writeFile(file, invalid);
  await assert.rejects(vault.uploadAsset("three.txt", "text/plain", "dGhyZWU="), { status: 422 });
  assert.equal(await fs.readFile(file, "utf8"), invalid);
  assert.equal((await fs.readdir(path.join(root, "assets"))).length, uploads.length);
});

test("metadata interference preserves the external version, uploaded bytes and recovery proposal", async t => {
  const { root, vault } = await fixture(t);
  const page = await vault.create({ title: "Preserved", body: "source" });
  const file = path.join(root, "metadata.json");
  let inject = true;
  const competing = createPortableVault(root, { ...nodeVaultPlatform, async replaceFile(temporary, destination, expected) {
    await nodeVaultPlatform.replaceFile(temporary, destination, expected);
    if (inject && path.dirname(destination) === path.join(root, "assets")) {
      inject = false;
      const external = JSON.parse(await fs.readFile(file, "utf8")); external.external = "concurrent writer";
      await fs.writeFile(file, JSON.stringify(external));
    }
  } });
  await assert.rejects(competing.uploadAsset("Retained.txt", "text/plain", "cmV0YWluZWQ="), { status: 409 });
  const external = JSON.parse(await fs.readFile(file, "utf8"));
  assert.equal(external.external, "concurrent writer"); assert.equal(external.assets, undefined);
  assert.ok(external.pages[page.id]);
  const recovery = path.join(root, ".history", "asset-conflicts"), records = await fs.readdir(recovery);
  assert.equal(records.length, 1);
  const proposal = JSON.parse(await fs.readFile(path.join(recovery, records[0]), "utf8"));
  assert.equal(JSON.parse(proposal.proposed).assets[proposal.path].name, "Retained.txt");
  assert.equal(await fs.readFile(path.join(root, proposal.path), "utf8"), "retained");
});

test("junctions are not followed when listing or serving nested attachments", async t => {
  const { root, vault } = await fixture(t);
  const target = path.join(root, "outside-assets"), link = path.join(root, "assets", "external");
  await fs.mkdir(target); await fs.writeFile(path.join(target, "secret.txt"), "private");
  await fs.symlink(target, link, "junction");
  assert.equal((await vault.listAssets()).assets.length, 0);
  const app = createApp({ vaultPath: root }), server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  const address = server.address(); assert.ok(address && typeof address !== "string");
  assert.equal((await fetch(`http://127.0.0.1:${address.port}/assets/external/secret.txt`)).status, 404);
});

test("API lists attachments and serves nested local files with existing HTML sandbox", async t => {
  const { root } = await fixture(t);
  await fs.mkdir(path.join(root, "assets", "nested"));
  await fs.writeFile(path.join(root, "assets", "nested", "page.html"), "<h1>Nested</h1>");
  const app = createApp({ vaultPath: root }), server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const response = await fetch(base + "/api/assets"); assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal((await response.json()).assets[0].path, "assets/nested/page.html");
  const html = await fetch(base + "/assets/nested/page.html");
  assert.equal(html.status, 200); assert.match(html.headers.get("content-security-policy")!, /sandbox/);
  assert.equal(await html.text(), "<h1>Nested</h1>");
  assert.equal((await fetch(base + "/assets/%2e%2e%2fmetadata.json")).status, 404);
});
