import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "prosemirror-state";
import { parseNative, serializeNative } from "../src/markdown-engine/codec";
import { metadataSourceTransaction } from "../src/metadata-source";
import { pandocPageTitle, renamePandocPageSource } from "../src/pandoc-page-title";

for (const values of [true, false]) test(`metadata code editing retains comments, unknown YAML and body with fields ${values ? "enabled" : "disabled"}`, () => {
  const config = { version: 1 as const, variant: "markdown" as const, extensions: { metadata_values: values } };
  const parse = (raw: string) => parseNative(raw, config);
  const raw = '---\r\ntitle: "Original"\r\nunknown: [1, 2]\r\n# Keep me\r\n---';
  const source = raw + '\r\n\r\nBody\r\n\r\n```yaml\r\ntitle: Fenced\r\n```';
  const state = EditorState.create({ doc: parse(source) }), original = state.doc.firstChild!;
  const tr = metadataSourceTransaction(state, 0, original, raw.replace("Original", "Edited"), parse)!;
  assert.equal(serializeNative(state.apply(tr).doc, config), source.replace("Original", "Edited"));
  assert.equal(tr.getMeta("isolateHistory"), true);
  assert.equal(metadataSourceTransaction(state, 0, original, original.attrs.raw, parse), null);
});

test("metadata code save rejects malformed YAML, changed carrier boundaries and stale targets", () => {
  const config = { version: 1 as const, variant: "markdown" as const, extensions: { metadata_values: true } };
  const parse = (raw: string) => parseNative(raw, config);
  const state = EditorState.create({ doc: parse('---\ntitle: Original\n---\n\nBody') }), original = state.doc.firstChild!;
  for (const raw of ['---\ntitle: Missing end', '---\ntitle: Good\n---\n\nOutside text', '---\ntitle: [broken\n---', '% Changed carrier'])
    assert.throws(() => metadataSourceTransaction(state, 0, original, raw, parse));
  const changed = state.apply(metadataSourceTransaction(state, 0, original, '---\ntitle: Changed\n---', parse)!);
  assert.throws(() => metadataSourceTransaction(changed, 0, original, '---\ntitle: Stale\n---', parse), /changed/);
});

test("Pandoc page rename changes only its title and respects disabled syntax and fenced code", () => {
  const config = { version: 1 as const, variant: "markdown" as const, extensions: { metadata_values: false } };
  const source = "% Original\r\n  continuation\r\n%   Alice; Bob\r\n  Another author\r\n%  2026-09-22\r\n\r\nBody\r\n\r\n```\r\n% Literal\r\n```";
  const next = renamePandocPageSource(source, config, "Renamed");
  assert.equal(next, source.replace("Original\r\n  continuation", "Renamed"));
  assert.equal(pandocPageTitle(next, config), "Renamed");
  assert.equal(pandocPageTitle('```\n% Literal\n```', config), undefined);
  const disabled = { ...config, extensions: { pandoc_title_block: false } };
  assert.equal(renamePandocPageSource(source, disabled, "No rewrite"), source);
  assert.equal(renamePandocPageSource('%\n% Author\n\nBody', config, 'New title'), '% New title\n% Author\n\nBody');
});
