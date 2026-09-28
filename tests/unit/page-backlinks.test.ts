import test from "node:test";
import assert from "node:assert/strict";
import { PageBacklinks } from "../../src/features/pages/page-backlinks";
import { extractLinks } from "../../src/document/document-format";
import type { Page } from "../../src/shared/types";

function page(id: string, title: string, body = ""): Page {
  return { id, title, body, parent: null, icon: "", properties: {}, revision: "r1", updated: "",
    syntax: { version: 1, variant: "notdown", extensions: {} } };
}

test("backlinks reuse unchanged source across fresh snapshots and invalidate unsaved body or dialect edits", () => {
  let parses = 0;
  const cache = new PageBacklinks((...args) => { parses++; return extractLinks(...args); });
  const target = page("target", "Target");
  const source = page("source", "Source", "[[Target]]");
  const pages = [target, source];
  assert.deepEqual(cache.incoming(pages, target).map(p => p.id), [source.id]);
  assert.equal(parses, 1);
  assert.deepEqual(cache.incoming(structuredClone(pages), target).map(p => p.id), [source.id]);
  assert.equal(parses, 1);
  source.body = "No link"; // Same revision, as with an unsaved window draft.
  assert.deepEqual(cache.incoming(pages, target), []);
  assert.equal(parses, 2);
  source.body = "[[Target]]";
  cache.incoming(pages, target);
  source.syntax = { version: 1, variant: "commonmark", extensions: {} };
  assert.deepEqual(cache.incoming(pages, target), []);
  assert.equal(parses, 4);
});

test("backlinks re-resolve title changes, duplicate names, removed pages and legacy aliases", () => {
  const cache = new PageBacklinks();
  const target = page("target", "Target");
  const source = page("source", "Source", "[[Target]]");
  const pages = [target, source];
  assert.equal(cache.incoming(pages, target).length, 1);
  target.title = "Renamed";
  assert.deepEqual(cache.incoming(pages, target), []);
  target.title = "Target";
  const duplicate = page("duplicate", "Target");
  assert.deepEqual(cache.incoming([...pages, duplicate], target), []);
  assert.equal(cache.incoming(pages, target).length, 1);
  assert.deepEqual(cache.incoming([target], target), []);
  source.body = "[Legacy](#page/old-id)";
  assert.deepEqual(cache.incoming(pages, target), []);
  target.legacyIds = ["old-id"];
  assert.equal(cache.incoming(pages, target).length, 1);
  target.legacyIds = [];
  assert.deepEqual(cache.incoming(pages, target), []);
});
