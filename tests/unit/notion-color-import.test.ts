import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { supplementNotionColors } from "../../server/notion-color-import.js";
import { prepareNotionImport } from "../../server/notion-import.js";
import { createVault } from "../../server/vault.js";
import { parseNative } from "../../src/markdown-engine/codec.js";
import { inlineColors } from "../../src/document/notion-syntax.js";
import type { CachedNotionBlock } from "../../server/notion-desktop-cache.js";

const page = "c1000000-0000-4000-8000-000000000001", id = "c1000000-0000-4000-8000-000000000002";
const run = (text: string, color = "default", flags = {}) => ({ type: "text", text: { content: text, link: null }, plain_text: text, annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: false, color, ...flags } });
const block = (parts = [run("Words", "pink_background")]) => ({ object: "block", id, type: "paragraph", last_edited_time: "2026-10-27T07:04:00.000Z", paragraph: { rich_text: parts } });
const cached = (title: any = [["Words", [["h", "pink_background"], ["h", "red"]]]]): CachedNotionBlock => ({ id, type: "text", version: 131, lastEdited: Date.parse("2026-10-27T07:04:57.915Z"), properties: { title } });
const source = '<span color="red" future="keep">Words</span>';
const colors = (source: string, variant: "notdown" | "notion-markdown" = "notdown") => {
  const result: { text: string | undefined; color: string; bg_color: string }[] = [];
  parseNative(source, { version: 1, variant, notionVersion: "v2", extensions: {} }).descendants(node => { if (node.isText) result.push({ text: node.text, ...inlineColors(node.marks.find(mark => mark.type.name === "color")?.attrs || {}) }); });
  return result;
};

for (const variant of ["notdown", "notion-markdown"] as const) test(`${variant}: public API colors complement Markdown without changing other source blocks`, () => {
  const tail = '\r\n\r\n```xml\r\n<span color="red">Words</span>\r\n```\r\n\r\n<future>unknown</future>';
  const result = supplementNotionColors(source + tail, [block()], variant);
  assert.equal(result.restoredApi, 1); assert.equal(result.restoredCache, 0);
  assert.ok(result.source.endsWith(tail)); assert.ok(result.source.includes('future="keep"'));
  assert.ok(!result.source.includes("bg_color="));
  assert.deepEqual(colors(result.source.split("\r\n")[0], variant), [{ text: "Words", color: "red", bg_color: "pink" }]);
  const reverse = supplementNotionColors('<span color="yellow_bg">Words</span>', [block([run("Words", "blue")])], variant);
  assert.deepEqual(colors(reverse.source, variant), [{ text: "Words", color: "blue", bg_color: "yellow" }]);
  assert.equal(supplementNotionColors(result.source, [block()], variant).source, result.source);
});

test("run boundaries and non-color formatting are aligned by complete text, including surrogate pairs", () => {
  const source = '<span color="red"><b>A😀</b>BC</span>';
  const result = supplementNotionColors(source, [block([run("A😀", "yellow_background", { bold: true }), run("B", "yellow_background"), run("C", "yellow_background")])], "notdown");
  assert.ok(result.restoredApi > 0, JSON.stringify(result)); assert.ok(result.source.includes("**") || result.source.includes("<b>"));
  assert.equal(parseNative(result.source, { version: 1, variant: "notdown", notionVersion: "v2", extensions: {} }).textContent, "A😀BC");
  for (const segment of colors(result.source) as any[]) assert.equal(segment.bg_color, "yellow");
  const mismatch = supplementNotionColors(source, [block([run("A😀BC", "yellow_background")])], "notdown");
  assert.equal(mismatch.source, source); assert.match(mismatch.warnings.join(), /conflict/);
});

test("ambiguous complete blocks and source/style conflicts are never resolved by substring or position", () => {
  for (const [text, blocks] of [[source, [block(), { ...block(), id: page }]], [source + "\n\n" + source, [block()]], [source, [block([run("Words", "blue")])]]] as const) {
    const result = supplementNotionColors(text, blocks, "notdown");
    assert.equal(result.source, text); assert.equal(result.restoredApi, 0); assert.ok(result.warnings.length);
  }
  for (const text of ['<future>' + source + '</future>', '<columns><column>' + source + '</column><column>Other</column></columns>', '```xml\n' + source + '\n```', "Before " + source + " after"]) {
    assert.equal(supplementNotionColors(text, [block()], "notdown").source, text);
  }
  assert.equal(supplementNotionColors(source, [block([run("Words", "unsupported-color")])], "notdown").source, source);
});

test("verified cache recovers the missing channel when both public projections lost it", () => {
  for (const variant of ["notdown", "notion-markdown"] as const) {
    const result = supplementNotionColors(source, [block([run("Words", "red")])], variant, { blocks: [cached()] });
    assert.equal(result.restoredApi, 0); assert.equal(result.restoredCache, 1);
    assert.deepEqual(colors(result.source, variant), [{ text: "Words", color: "red", bg_color: "pink" }]);
    assert.deepEqual(result.evidence[0].cache.title, cached().properties.title);
  }
});

test("stale cache, unknown annotations and changed text cannot supply colors", () => {
  const api = block([run("Words", "red")]);
  for (const bad of [
    { ...cached(), lastEdited: cached().lastEdited - 60000 },
    { ...cached(), type: "page" },
    cached([["Different", [["h", "pink_background"], ["h", "red"]]]]),
    cached([["Words", [["h", "pink_background"], ["unknown", "value"]]]]),
    cached([["Words", [["h", "pink_background"], ["h", "blue"], ["h", "red"]]]]),
  ]) {
    const result = supplementNotionColors(source, [api], "notdown", { blocks: [bad] });
    assert.equal(result.source, source); assert.equal(result.restoredCache, 0); assert.ok(result.warnings.length);
  }
  const precise = { ...api, last_edited_time: "2026-10-27T07:04:57.000Z" };
  assert.equal(supplementNotionColors(source, [precise], "notdown", { blocks: [cached()] }).source, source);
  const exact = { ...api, last_edited_time: new Date(cached().lastEdited).toISOString() };
  assert.equal(supplementNotionColors(source, [exact], "notdown", { blocks: [cached()] }).restoredCache, 1);
  assert.equal(supplementNotionColors(source, [api], "notdown", { blocks: [cached(), cached()] }).source, source);
  const duplicate = { ...api, id: page, paragraph: { rich_text: [{ type: "text", text: { content: "Words" } }] } };
  assert.equal(supplementNotionColors(source, [block(), duplicate], "notdown").source, source);
});

test("a verified but conflicting cache vetoes the whole block instead of mixing snapshots", () => {
  const result = supplementNotionColors(source, [block()], "notdown", { blocks: [cached([["Words", [["h", "yellow_background"], ["h", "red"]]]])] });
  assert.equal(result.source, source); assert.equal(result.restoredApi, 0); assert.match(result.warnings.join(), /conflict/);
});

test("headings can be supplemented but inline mentions and other non-text objects stay intact", () => {
  const input = "## " + source;
  const result = supplementNotionColors(input, [{ ...block(), type: "heading_2", heading_2: block().paragraph }], "notdown");
  assert.equal(result.restoredApi, 1); assert.ok(result.source.startsWith("## "));
  assert.equal(supplementNotionColors(source, [{ ...block(), type: "heading_2", heading_2: block().paragraph }], "notdown").source, source);
  assert.equal(supplementNotionColors(source, [{ ...block(), last_edited_time: "invalid" }], "notdown").source, source);
  const mention = '<span color="red"><mention url="user://one">Words</mention></span>';
  assert.equal(supplementNotionColors(mention, [block()], "notdown").source, mention);
});

const transport = (color = "pink_background"): typeof fetch => async value => {
  const url = new URL(String(value));
  if (url.pathname.endsWith("/markdown")) return Response.json({ object: "page_markdown", id: page, markdown: source, truncated: false, unknown_block_ids: [] });
  if (url.pathname.endsWith("/children")) return Response.json({ results: [block([run("Words", color)])], has_more: false, next_cursor: null });
  if (url.pathname === `/v1/pages/${page}`) return Response.json({ object: "page", id: page, properties: {} });
  throw Error(`Unexpected request ${url.pathname}`);
};
const input = { token: "test-notion-token-not-saved", pageId: page, variant: "notdown", includeChildren: false, downloadAssets: false, useDesktopCache: false };

test("preview recovers and archives new copies; commit and duplicate imports preserve local edits", async t => {
  const options = { fetch: transport(), wait: async () => {}, readCache: async () => { throw Error("must not read disabled cache"); } };
  const plan = await prepareNotionImport(input, options);
  assert.equal(plan.pages.length, 1);
  assert.ok(plan.warnings.some(w => w.includes("restored dual colors in 1")));
  assert.equal(plan.originals.find(file => file.path === `pages/${page}.md`)!.data.toString(), source);
  assert.equal(JSON.parse(plan.originals.find(file => file.path.startsWith("color-recovery/"))!.data.toString()).blocks[0].blockId, id);
  assert.equal((await prepareNotionImport(input, options)).id, plan.id);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-color-import-"));
  const vault = createVault(root);
  t.after(async () => { await vault.closeHistory(); assert.equal(path.dirname(root), path.resolve(os.tmpdir())); await fs.rm(root, { recursive: true, force: true }); });
  await vault.importBatch(plan);
  const saved = await vault.get(plan.pages[0].id);
  assert.deepEqual(colors(saved.body), [{ text: "Words", color: "red", bg_color: "pink" }]);
  const edited = await vault.update(saved.id, { body: "Local edit" }, saved.revision);
  assert.equal((await vault.importBatch(plan)).alreadyImported, true);
  assert.equal((await vault.get(saved.id)).revision, edited.revision);
});

test("cache recovery is opt-in, affects batch identity and also works in official v2 without custom attributes", async () => {
  let reads = 0;
  const options = { fetch: transport("red"), wait: async () => {}, readCache: async () => { reads++; return { blocks: [cached()] }; } };
  const plain = await prepareNotionImport(input, options); assert.equal(reads, 0);
  for (const variant of ["notdown", "notion-markdown"]) {
    const recovered = await prepareNotionImport({ ...input, variant, useDesktopCache: true }, options);
    assert.deepEqual(colors(recovered.pages[0].source, variant as any), [{ text: "Words", color: "red", bg_color: "pink" }]);
    assert.ok(!recovered.pages[0].source.includes("bg_color=")); assert.notEqual(recovered.id, plain.id);
    assert.ok(JSON.parse(recovered.originals.find(file => file.path.startsWith("color-recovery/"))!.data.toString()).blocks[0].cache);
  }
  assert.equal(reads, 2);
  const failed = await prepareNotionImport({ ...input, useDesktopCache: true }, { ...options, fetch: transport(), readCache: async () => { throw Error("private cache path"); } });
  assert.ok(failed.warnings.some(w => w.includes("supplement failed"))); assert.ok(!failed.warnings.join().includes("private cache path"));
  assert.equal(colors(failed.pages[0].source)[0].bg_color, "pink");
});
