import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { DatabaseSync } from "node:sqlite";
import { readNotionDesktopCache } from "../../server/notion-desktop-cache.js";
import { cachedNotionText, recoverCachedNotionBlock } from "../../server/notion-private-blocks.js";
import { prepareNotionImport } from "../../server/notion-import.js";
import { createVault } from "../../server/vault.js";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec.js";
import { editorKind } from "../../src/document/node-identity.js";
import { privateRoot, privateAi, privateOutput, privateButton, privateApi, privateSnapshot, privateFixture, privateSource } from "./notion-private-blocks-fixture.js";

const syntax = { variant: "notdown", version: 1, notionVersion: "v2", extensions: {} } as const;
test("unsupported AI child reads keep traversal and cache recovery available in both dialects", async () => {
  for (const variant of ["notdown", "notion-markdown"]) for (const useDesktopCache of [true, false]) {
    const calls: string[] = [], fixture = privateFixture();
    const plan = await prepareNotionImport({ token: "test-private-token", pageId: privateRoot, variant, useDesktopCache, includeChildren: true, downloadAssets: false }, {
      wait: async () => {}, readCache: async () => privateSnapshot(),
      fetch: async (input, init) => { calls.push(new URL(String(input)).pathname); return fixture(input, init); },
    });
    assert.equal(plan.pages.length, 1);
    assert.equal(calls.filter(path => path === `/v1/blocks/${privateAi}/children`).length, 1);
    assert.ok(plan.warnings.some(w => w.includes("Notion does not expose ai_block children")));
    assert.equal(plan.pages[0].source.includes('<ai-block prompt="hi"'), variant === "notdown" && useDesktopCache);
    assert.ok(plan.pages[0].source.includes(privateButton));
    assert.equal(plan.originals.find(item => item.path === `pages/${privateRoot}.md`)!.data.toString(), privateSource);
  }
});

test("unrelated child validation errors, oversized error bodies and failed pagination still reject without leaking upstream text", async () => {
  const token = "test-private-token", fixture = privateFixture();
  for (const message of [
    `Invalid request ${token} https://private.example/secret`,
    "Block type ai_block is not supported via the API for your bot type." + "x".repeat(17000),
    "not JSON",
  ]) {
    await assert.rejects(prepareNotionImport({ token, pageId: privateRoot, includeChildren: true }, {
      wait: async () => {},
      fetch: async (input, init) => new URL(String(input)).pathname === `/v1/blocks/${privateAi}/children`
        ? message === "not JSON" ? new Response(message, { status: 400 }) : Response.json({ code: "validation_error", message }, { status: 400 }) : fixture(input, init),
    }), (error: any) => {
      assert.match(error.message, /HTTP 400/);
      assert.ok(error.message.includes(`/blocks/${privateAi}/children`));
      assert.ok(!error.message.includes(token) && !error.message.includes("private.example") && !error.message.includes("Block type"));
      return true;
    });
  }
  await assert.rejects(prepareNotionImport({ token, pageId: privateRoot, includeChildren: true }, {
    wait: async () => {},
    fetch: async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname === `/v1/blocks/${privateRoot}/children`) return url.searchParams.has("start_cursor")
        ? Response.json({ code: "validation_error", message: "Block type ai_block is not supported via the API for your bot type." }, { status: 400 })
        : Response.json({ results: [], has_more: true, next_cursor: "next-page" });
      return fixture(input, init);
    },
  }), /HTTP 400 \(validation_error\)/);
});

test("real custom AI configuration restores prompt and owned output, preserving source boundaries", () => {
  const result = recoverCachedNotionBlock(privateApi(), privateSnapshot());
  assert.match(result.source!, /prompt="hi"/);
  const doc = parseNative(result.source!, syntax);
  assert.equal(editorKind(doc.firstChild!), "ai_block");
  assert.equal(doc.firstChild!.attrs.prompt, "hi");
  assert.equal(doc.firstChild!.textContent, "Hi!");
  assert.equal(serializeNative(doc, syntax), result.source);
  const empty = privateSnapshot(); empty.privateBlocks![0].content = [];
  assert.equal(parseNative(recoverCachedNotionBlock(privateApi(), empty).source!, syntax).firstChild!.textContent, "");
  empty.privateBlocks![0].format!.ai_block_configuration_menu.autofillInstructions = [['" </ai-block>\n<unknown url="https://example.com"/>']];
  const escaped = parseNative(recoverCachedNotionBlock(privateApi(), empty).source!, syntax);
  assert.equal(escaped.childCount, 1);
  assert.match(escaped.firstChild!.attrs.prompt, /<\/ai-block>/);
});

test("stale, mismatched, partial and unsupported private data never creates guessed controls", () => {
  for (const change of [
    (s: ReturnType<typeof privateSnapshot>) => { s.privateBlocks![0].lastEdited -= 60000; },
    (s: ReturnType<typeof privateSnapshot>) => { s.privateBlocks![0].type = "button"; },
    (s: ReturnType<typeof privateSnapshot>) => { s.privateBlocks!.splice(1, 1); },
    (s: ReturnType<typeof privateSnapshot>) => { s.privateBlocks![1].parentId = privateButton; },
    (s: ReturnType<typeof privateSnapshot>) => { s.privateBlocks![1].type = "future"; },
    (s: ReturnType<typeof privateSnapshot>) => { s.privateBlocks![1].content = [privateAi]; },
    (s: ReturnType<typeof privateSnapshot>) => { s.privateBlocks![0].format!.ai_block_configuration_menu.context = "unknown"; },
    (s: ReturnType<typeof privateSnapshot>) => { s.privateBlocks![0].format!.ai_block_configuration_menu.autofillInstructions = [["mention", [["p", privateRoot]]]]; },
  ]) { const snapshot = privateSnapshot(); change(snapshot); assert.equal(recoverCachedNotionBlock(privateApi(), snapshot).source, undefined); }
  assert.equal(recoverCachedNotionBlock({ ...privateApi(), last_edited_time: "2026-10-28T10:18:28.331Z" }, privateSnapshot()).source, undefined);
  assert.equal(recoverCachedNotionBlock({ ...privateApi(), archived: true }, privateSnapshot()).source, undefined);
  const button = recoverCachedNotionBlock(privateApi(privateButton), privateSnapshot());
  assert.equal(button.source, undefined); assert.match(button.warnings.join(), /no verified action/);
  assert.equal(cachedNotionText([["unknown", [["future"]]]]), undefined);
  assert.match(cachedNotionText([["code", [["b"], ["c"]]]])!, /<b>` code `<\/b>/);
});

test("SQLite reads only account-scoped owned AI descendants and remains byte-identical", async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-private-cache-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, "notion.db"), db = new DatabaseSync(file);
  db.exec("CREATE TABLE block(id TEXT,meta_user_id TEXT,space_id TEXT,alive INTEGER,type TEXT,version REAL,last_edited_time REAL,properties TEXT,format TEXT,content TEXT,parent_id TEXT,parent_table TEXT)");
  const insert = db.prepare("INSERT INTO block VALUES(?,?,?,?,?,?,?,?,?,?,?,?)");
  insert.run(privateRoot, "owner", "space", 1, "page", 1, 0, "{}", "{}", "[]", "", "block");
  for (const block of privateSnapshot().privateBlocks!) insert.run(block.id, "owner", "space", 1, block.type, block.version, block.lastEdited, JSON.stringify(block.properties), JSON.stringify(block.format), JSON.stringify(block.content), block.parentId!, block.parentTable!);
  insert.run(privateOutput, "other", "space", 1, "text", 1, 0, '{"secret":"unrelated"}', "{}", "[]", privateAi, "block");
  db.exec("ALTER TABLE block ADD COLUMN crdt_data; ALTER TABLE block ADD COLUMN crdt_format_version REAL");
  db.prepare("UPDATE block SET crdt_data=?,crdt_format_version=1 WHERE id=? AND meta_user_id='owner'").run("undecoded source CRDT", privateAi);
  db.prepare("UPDATE block SET crdt_data=?,crdt_format_version=1 WHERE id=? AND meta_user_id='owner'").run(Buffer.from([1, 2, 3]), privateOutput);
  db.close(); const before = await fs.readFile(file);
  const snapshot = await readNotionDesktopCache(privateRoot, [privateAi], file);
  assert.equal(snapshot.privateBlocks!.length, 2);
  assert.equal(JSON.stringify(snapshot).includes("unrelated"), false);
  assert.equal(snapshot.privateBlocks![0].crdtData, "undecoded source CRDT");
  assert.equal(snapshot.privateBlocks![0].crdtEncoding, "text");
  assert.equal(snapshot.privateBlocks![1].crdtData, "AQID");
  assert.equal(snapshot.privateBlocks![1].crdtEncoding, "base64");
  assert.match(recoverCachedNotionBlock(privateApi(), snapshot).source!, /Hi!/);
  assert.deepEqual(await fs.readFile(file), before);
});

test("API integration is opt-in, dialect-gated, archived and idempotent without replacing local edits", async t => {
  let reads = 0;
  const options = { fetch: privateFixture(), wait: async () => {}, readCache: async () => { reads++; return privateSnapshot(); } };
  const input = { token: "test-private-token", pageId: privateRoot, variant: "notdown", useDesktopCache: true, includeChildren: false, downloadAssets: false };
  const plan = await prepareNotionImport(input, options);
  assert.match(plan.pages[0].source, /<ai-block prompt="hi"/);
  assert.ok(plan.pages[0].source.includes(privateButton));
  assert.equal(plan.pages[0].source.split("Hi!").length, 2);
  assert.ok(plan.originals.some(item => item.path === `private-blocks/${privateAi}.json`));
  assert.equal(plan.originals.find(item => item.path === `pages/${privateRoot}.md`)!.data.toString(), privateSource);
  assert.equal(JSON.stringify(plan).includes(input.token), false);
  const before = reads;
  for (const request of [{ ...input, useDesktopCache: false }, { ...input, variant: "notion-markdown" }]) assert.ok(!(await prepareNotionImport(request, options)).pages[0].source.includes("<ai-block"));
  assert.equal(reads, before);
  const failed = await prepareNotionImport(input, { ...options, readCache: async () => { throw Error("private error"); } });
  assert.ok(!failed.pages[0].source.includes("<ai-block"));
  assert.ok(!failed.warnings.join().includes("private error"));
  const next = privateSnapshot(); next.privateBlocks![0].format!.ai_block_configuration_menu.autofillInstructions = [["Changed prompt"]];
  assert.notEqual(plan.id, (await prepareNotionImport(input, { ...options, readCache: async () => next })).id);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-private-import-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const vault = createVault(directory); await vault.importBatch(plan);
  const page = await vault.get(plan.pages[0].id);
  await vault.update(page.id, { body: "Local edit" }, page.revision);
  assert.equal((await vault.importBatch(await prepareNotionImport(input, options))).alreadyImported, true);
  assert.equal((await vault.get(page.id)).body, "Local edit");
});
