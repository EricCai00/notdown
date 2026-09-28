import test from "node:test";
import assert from "node:assert/strict";
import { parseNative } from "../../src/markdown-engine/codec";
import { removedChildPages } from "../../src/editor/child-page-deletion";

const parse = (source: string) => parseNative(source, { version: 1, variant: "notdown", extensions: {} });
const child = '<page url="#page/child">Child</page>';
const other = '<page url="#page/other">Other</page>';
const pages = [{ id: "child", title: "Child" }, { id: "other", title: "Other" }];

test("child removal deduplicates targets and includes nested entries", () => {
  const before = parse(`${child}\n\n${child}\n\n<callout>\n${other}\n</callout>`);
  assert.deepEqual(removedChildPages(before, parse("Tail"), pages), ["child", "other"]);
});

test("moving or relabeling child entries does not trash pages", () => {
  const before = parse(`${child}\n\n${other}`);
  assert.deepEqual(removedChildPages(before, parse(`${other}\n\n${child.replace(">Child<", ">Renamed<")}`), pages), []);
});

test("deleting page links, inline mentions, missing and external targets does not trash pages", () => {
  const before = parse('<page-link url="#page/child">Link</page-link>\n\n<mention-page url="#page/other">Other</mention-page>\n\n<page url="#page/missing">Missing</page>\n\n<page url="https://example.com">External</page>');
  assert.deepEqual(removedChildPages(before, parse("Tail"), pages), []);
});
