import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { prepareNotionImport, notionPageId } from "../../server/notion-import.js";
import { enrichNotionBlocks } from "../../server/notion-block-import.js";
import { notionAssets, readNotionAsset, notionAssetName, notionAssetIdentity } from "../../server/notion-assets.js";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec.js";
import { editorKind } from "../../src/document/node-identity.js";
import { findSyncedSource, syncedSource } from "../../src/blocks/synced-source.js";
import { createVault } from "../../server/vault.js";
import { v2Fixture, v2Root, v2Child, v2Folder, v2Id, v2Source, v2Asset } from "./notion-v2-fixture.js";

test("v2 imports recursive content, templates, folder descendants, local media and verified synced references", async t => {
  const calls: string[] = [];
  const input = { token: "test-token-not-stored", pageId: v2Root, variant: "notdown" };
  const plan = await prepareNotionImport(input, { fetch: v2Fixture(undefined, calls), readAsset: v2Asset, wait: async () => {} });
  const root = plan.pages.find(p => (p.metadata.notionImport as any).pageId === v2Root)!, child = plan.pages.find(p => (p.metadata.notionImport as any).pageId === v2Child)!;
  const folder = plan.pages.find(p => (p.metadata.notionImport as any).pageId === v2Folder)!;
  assert.equal(plan.pages.length, 4); assert.equal(plan.pages.find(p => (p.metadata.notionImport as any).pageId === v2Id(4))!.metadata.parent, folder.id);
  assert.equal((root.metadata.syntax as any).notionVersion, "v2");
  assert.ok(root.source.includes(`<mention url="#page/${child.id}">`));
  assert.ok(root.source.includes("Recovered nested content")); assert.ok(root.source.includes("button: configuration unavailable")); assert.ok(root.source.includes("Saved AI result"));
  assert.equal(plan.assets.length, 2); assert.ok(root.source.includes('source="assets/')); assert.ok(String(root.metadata.icon).startsWith("assets/")); assert.ok(String((root.metadata.properties as any).cover).startsWith("assets/"));
  assert.equal(plan.originals.find(file => file.path === `pages/${v2Root}.md`)!.data.toString(), v2Source);
  assert.ok(!JSON.stringify(plan).includes(input.token)); assert.ok(!calls.some(call => call.includes(v2Id(90))));
  const doc = parseNative(root.source, root.metadata.syntax as any); doc.check(); const kinds: string[] = []; let actions = "";
  doc.descendants(node => { kinds.push(editorKind(node)); if (editorKind(node) === "button") actions = node.attrs.actions; });
  const childEntries: any[] = [];
  doc.descendants(node => { if (node.type.name === "block.child_page") childEntries.push(node.attrs); });
  assert.equal(childEntries.length, 2);
  for (const entry of childEntries) {
    assert.equal(entry.target, child.id);
    assert.equal(entry.url, `#page/${child.id}`);
    assert.equal(entry.label, "Child page");
  }
  assert.equal(child.metadata.parent, root.id);
  let importedCode = false;
  doc.descendants(node => { if (node.text === "rdkit.Chem.BRICS.BRICSDecompose" && node.marks.some(mark => mark.type.name === "code")) importedCode = true; });
  assert.equal(importedCode, true);
  for (const kind of ["mail", "custom_block", "external_object_instance", "meeting_notes", "tabs", "button", "image_block"]) assert.ok(kinds.includes(kind), kind);
  assert.ok(JSON.parse(actions)[0].content.includes("Template content")); assert.equal(serializeNative(doc, root.metadata.syntax as any), root.source);
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-v2-")); t.after(async () => { assert.equal(path.dirname(temp), path.resolve(os.tmpdir())); assert.ok(path.basename(temp).startsWith("notdown-v2-")); await fs.rm(temp,{recursive:true,force:true}); });
  const vault = createVault(temp); await vault.importBatch(plan);
  const saved = await vault.get(root.id), savedChild = await vault.get(child.id); let reference = "";
  parseNative(savedChild.body, savedChild.syntax!).descendants(node => { if (editorKind(node) === "synced_block") reference = node.attrs.url; });
  const target = syncedSource(reference); assert.equal(target.pageId, saved.id); assert.equal(findSyncedSource(saved,target.blockId).node.textContent, "Shared content");
  for (const asset of plan.assets) assert.deepEqual(await fs.readFile(path.join(temp,"assets",asset.filename)),asset.data);
  const library = await vault.listAssets();
  assert.deepEqual(new Set(library.assets.map(asset => asset.name)), new Set(["photo.png", "report.pdf"]));
  for (const asset of library.assets) { assert.ok(asset.originalName); assert.ok(asset.addedAt); assert.ok(asset.references.some(ref => ref.pageId === root.id)); }
  assert.equal((await vault.importBatch(plan)).alreadyImported,true);
  // Re-importing the same completed snapshot can register older downloaded files
  // without replacing pages or erasing local changes and unrelated metadata.
  const edited = await vault.update(root.id, { title: "Locally renamed" }, saved.revision);
  const metadataFile = path.join(temp, "metadata.json"), metadata = JSON.parse(await fs.readFile(metadataFile, "utf8"));
  delete metadata.assets; metadata.keepExternal = { value: 1 }; await fs.writeFile(metadataFile, JSON.stringify(metadata));
  assert.equal((await vault.importBatch(plan)).alreadyImported, true);
  assert.equal((await vault.get(root.id)).revision, edited.revision);
  assert.equal((await vault.get(root.id)).title, "Locally renamed");
  assert.deepEqual(new Set((await vault.listAssets()).assets.map(asset => asset.name)), new Set(["photo.png", "report.pdf"]));
  assert.deepEqual(JSON.parse(await fs.readFile(metadataFile, "utf8")).keepExternal, { value: 1 });
  const deleted = plan.assets[0];
  const beforeMissing = JSON.parse(await fs.readFile(metadataFile, "utf8"));
  delete beforeMissing.assets[`assets/${deleted.filename}`];
  const missingMetadata = JSON.stringify(beforeMissing);
  await fs.writeFile(metadataFile, missingMetadata);
  await fs.unlink(path.join(temp, "assets", deleted.filename));
  await assert.rejects(vault.importBatch(plan), { status: 409 });
  assert.equal(await fs.readFile(metadataFile, "utf8"), missingMetadata);
  await assert.rejects(fs.stat(path.join(temp, "assets", deleted.filename)), { code: "ENOENT" });
  assert.equal((await vault.get(root.id)).revision, edited.revision);
});

test("date import reports missing reminder configuration without inventing reminders or scanning code examples", async t => {
  for (const example of [false, true]) {
    const date = '<date start="2026-10-24" start-time="09:00" time-zone="America/Los_Angeles" />';
    const source = example ? '```xml\n' + date + '\n```' : date;
    const fixture = v2Fixture();
    const transport: typeof fetch = async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname === `/v1/pages/${v2Root}/markdown`) return Response.json({ object: "page_markdown", id: v2Root, markdown: source, truncated: false, unknown_block_ids: [] });
      return fixture(input, init);
    };
    const plan = await prepareNotionImport({ token: "test-token-example", pageId: v2Root, variant: "notdown", includeChildren: false, downloadAssets: false }, { fetch: transport, wait: async () => {} });
    assert.equal(plan.warnings.some(warning => warning.includes("reminder configuration")), !example);
    assert.equal(plan.pages[0].source, source);
    assert.ok(!plan.pages[0].source.includes("reminder="));
    if (!example) {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-reminder-import-"));
      t.after(() => fs.rm(root, { recursive: true, force: true }));
      const vault = createVault(root); t.after(() => vault.closeHistory());
      const imported = await vault.importBatch(plan), page = await vault.get(imported.pageIds[0]);
      const restored = await vault.update(page.id, { body: page.body.replace(" />", ' reminder="2026-10-24T16:00:00.000Z" reminder-offset="0" />') }, page.revision);
      assert.equal((await vault.importBatch(plan)).alreadyImported, true);
      assert.equal((await vault.get(page.id)).body, restored.body);
    }
  }
});

test("official v2 preserves local-only templates and unsupported configurations, with downloads optional", async () => {
  const plan = await prepareNotionImport({ token: "test-token-example", pageId: v2Root, variant: "notion-markdown", downloadAssets: false }, { fetch: v2Fixture(), wait: async () => {} });
  assert.equal(plan.assets.length,0); assert.ok(!plan.pages[0].source.includes("<button")); assert.ok(plan.pages[0].source.includes("Template content"));
  for (const page of plan.pages) { const doc = parseNative(page.source,page.metadata.syntax as any); doc.check(); assert.equal(serializeNative(doc,page.metadata.syntax as any),page.source); }
});

test("recursive recovery terminates cycles and retains inaccessible references", async () => {
  const warnings: string[] = [], id = v2Id(9), source = `<unknown url="https://notion.so/${id}"/>`;
  const restored = await enrichNotionBlocks(source,{ version:"v2", local:true, normalizeId:notionPageId, readBlock:async id=>({object:"block",id,type:"toggle",toggle:{},has_children:true}), readMarkdown:async()=>source, readChildren:async()=>[{id}], pageTitle:async()=>"", warn:message=>warnings.push(message) });
  assert.ok(restored.includes("<unknown") && restored.includes(id)); assert.ok(warnings.some(w=>w.includes("cyclic")));
});

test("attachment edits protect code and labels, deduplicate bytes and retain failed remote URLs", async () => {
  const calls: string[] = [], warnings: string[] = []; let bytes=0;
  const media = notionAssets({signal:new AbortController().signal, remaining:()=>1000-bytes, reserve:n=>{bytes+=n}, warn:w=>warnings.push(w), read:async url=>{ calls.push(url); if(url.includes("missing")) throw new Error("unavailable"); return {data:Buffer.from("same"),contentType:"image/png"}; }});
  const source = '![One](https://example.com/a.png)\n\n<image source="https://example.com/b.png">Two</image>\n\n<file source="https://example.com/missing.bin"/>\n\n```md\n![Code](https://example.com/code.png)\n```\n<future>![Example](https://example.com/unknown.png)</future>\n<mention url="user://one">![Label](https://example.com/label.png)</mention>';
  const saved = await media.rewrite(source); assert.equal(calls.length,3); assert.equal(media.assets.length,1); assert.equal(bytes,4); assert.ok(saved.includes("missing.bin")); assert.ok(saved.includes("![Code](https://example.com/code.png)")); assert.equal(warnings.length,1);
  for (const url of ["http://127.0.0.1/a.png","http://169.254.169.254/latest","https://user:password@example.com/a.png","file:///tmp/a.png"]) await assert.rejects(readNotionAsset(url,AbortSignal.timeout(1000),1000));
});

test("download filenames use headers or safe URL basenames, excluding signed query strings", () => {
  assert.equal(notionAssetName("https://host.test/download?secret=token", "attachment; filename*=UTF-8''%E6%8A%A5%E5%91%8A.pdf"), "报告.pdf");
  assert.equal(notionAssetName("https://host.test/path", 'attachment; filename="../../report.pdf"'), "report.pdf");
  assert.equal(notionAssetName("https://host.test/folder/My%20file.docx?signature=secret"), "My file.docx");
  assert.equal(notionAssetName("https://host.test/download?filename=secret.pdf"), undefined);
  assert.equal(notionAssetName("https://host.test/report.pdf", "attachment; filename*=UTF-8''%ZZ"), "report.pdf");
  const signed = "https://prod-files-secure.s3.us-west-2.amazonaws.com/workspace/file.xlsx?X-Amz-Signature=";
  assert.equal(notionAssetIdentity(signed + "one"), notionAssetIdentity(signed + "two"));
  assert.notEqual(notionAssetIdentity("https://host.test/download?id=one"), notionAssetIdentity("https://host.test/download?id=two"));
});

test("Notion file names come from nested Block API data even without importing child pages; HTML retains its response filename", async t => {
  const base = v2Fixture(), fileURL = "https://prod-files-secure.s3.us-west-2.amazonaws.com/workspace/file/download?X-Amz-Signature=private";
  const source = `<file source="${fileURL}"/>\n\n<embed source="https://files.example.test/a.html"/>\n\n\`\`\`xml\n<file source="https://files.example.test/code.xlsx"/>\n\`\`\``;
  const calls: string[] = [];
  const plan = await prepareNotionImport({ token: "test-token-example", pageId: v2Root, includeChildren: false }, {
    wait: async () => {},
    fetch: async (input, init) => {
      const url = String(input); calls.push(url);
      if (url.includes(`/pages/${v2Root}/markdown`)) return Response.json({ object: "page_markdown", id: v2Root, markdown: source, truncated: false, unknown_block_ids: [] });
      if (url.includes(`/blocks/${v2Root}/children`)) return Response.json({ results: [
        { id: v2Id(71), type: "column", has_children: true, column: {} },
        { id: v2Child, type: "child_page", has_children: true, child_page: { title: "Excluded" } },
      ], has_more: false });
      if (url.includes(`/blocks/${v2Id(71)}/children`)) return Response.json({ results: [{ id: v2Id(72), type: "file", has_children: false, file: { type: "external", external: { url: fileURL.replace("private", "refreshed") }, name: "markdown & notion.xlsx", caption: [] } }], has_more: false });
      return base(input, init);
    },
    readAsset: async url => {
      assert.ok(!url.includes("code.xlsx"));
      if (url === fileURL) return { data: Buffer.from("spreadsheet"), contentType: "application/octet-stream", name: "download.bin" };
      if (url.endsWith("a.html")) return { data: Buffer.from("<h1>HTML</h1>"), contentType: "text/html", name: "a.html" };
      return { data: Buffer.from("image"), contentType: "image/png" };
    },
  });
  assert.equal(plan.pages.length, 1);
  assert.ok(!calls.some(url => url.includes(`/blocks/${v2Child}/children`) || url.includes(`/pages/${v2Child}`)));
  assert.equal(plan.assets.find(asset => asset.name === "markdown & notion.xlsx")?.filename.endsWith(".xlsx"), true);
  assert.equal(plan.assets.find(asset => asset.name === "a.html")?.filename.endsWith(".html"), true);
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-filenames-"));
  t.after(async () => { assert.equal(path.dirname(temp), path.resolve(os.tmpdir())); assert.ok(path.basename(temp).startsWith("notdown-filenames-")); await fs.rm(temp, { recursive: true, force: true }); });
  const vault = createVault(temp); await vault.importBatch(plan);
  assert.ok((await vault.listAssets()).assets.some(asset => asset.name === "markdown & notion.xlsx"));
  assert.equal(plan.originals.find(file => file.path === `pages/${v2Root}.md`)!.data.toString(), source);
});

test("Notion image, audio, video, PDF, Office, empty file and mail attachments enter the library", async t => {
  const source = [
    '<image source="https://files.example.test/photo.png"/>',
    '<audio source="https://files.example.test/recording.mp3"/>',
    '<video source="https://files.example.test/video.mp4"/>',
    '<pdf source="https://files.example.test/report.pdf"/>',
    '<file source="https://files.example.test/download?signature=private"/>',
    '<file source="https://files.example.test/empty.txt"/>',
    '<mail attachments="https://files.example.test/archive.zip">Mail</mail>',
  ].join("\n\n");
  const base = v2Fixture();
  const plan = await prepareNotionImport({ token: "test-token-example", pageId: v2Root, includeChildren: false }, {
    wait: async () => {},
    fetch: async (input, init) => {
      const response = await base(input, init);
      if (String(input).includes(`/pages/${v2Root}/markdown`)) return Response.json({ object: "page_markdown", id: v2Root, markdown: source, truncated: false, unknown_block_ids: [] });
      return response;
    },
    readAsset: async (url, signal, max) => {
      if (url.endsWith(".mp3")) return { data: Buffer.from("audio"), contentType: "audio/mpeg" };
      if (url.endsWith(".mp4")) return { data: Buffer.from("video"), contentType: "video/mp4" };
      if (url.endsWith(".zip")) return { data: Buffer.from("zip"), contentType: "application/zip" };
      if (url.endsWith("empty.txt")) return { data: Buffer.alloc(0), contentType: "text/plain" };
      if (url.includes("download?")) return { data: Buffer.from("document"), contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", name: "Project notes.docx" };
      return v2Asset(url, signal, max);
    },
  });
  assert.equal(plan.assets.length, 7);
  const root = plan.pages.find(page => (page.metadata.notionImport as any).pageId === v2Root)!;
  assert.ok(!root.source.includes("https://files.example.test/"));
  assert.ok(!JSON.stringify(plan.assets.map(({ data, ...metadata }) => metadata)).includes("signature"));
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-notion-assets-"));
  t.after(async () => { assert.equal(path.dirname(temp), path.resolve(os.tmpdir())); assert.ok(path.basename(temp).startsWith("notdown-notion-assets-")); await fs.rm(temp, { recursive: true, force: true }); });
  const vault = createVault(temp); await vault.importBatch(plan);
  const library = await createVault(temp).listAssets();
  assert.equal(library.assets.length, 7);
  assert.deepEqual(new Set(library.assets.map(asset => asset.kind)), new Set(["image", "audio", "video", "pdf", "file"]));
  assert.equal(library.assets.find(asset => asset.name === "empty.txt")!.size, 0);
  assert.ok(library.assets.some(asset => asset.name === "Project notes.docx"));
  for (const asset of library.assets) { assert.ok(!asset.missing); assert.ok(asset.references.some(ref => ref.pageId === root.id), asset.name); }
  const before = await fs.readFile(path.join(temp, "metadata.json"), "utf8");
  await vault.importBatch(plan);
  assert.equal(await fs.readFile(path.join(temp, "metadata.json"), "utf8"), before);
});
