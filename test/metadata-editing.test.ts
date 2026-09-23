import test from "node:test";
import assert from "node:assert/strict";
import { editMetadata } from "../src/markdown-engine/metadata-editing";
import { metadataValues } from "../src/markdown-engine/products";
import { parseNative, serializeNative } from "../src/markdown-engine/codec";
import { pageReminders } from "../src/reminders";
import type { Page } from "../src/types";

test("metadata field editing retains YAML unknown values, MMD key spelling and Pandoc continuation fields", () => {
  const yaml = editMetadata('---\ntitle: Old\nunknown: [1, 2]\n# retained\n...', "yaml", "title", "New");
  assert.deepEqual(metadataValues(yaml, "yaml").unknown, [1, 2]); assert.match(yaml, /# retained/); assert.match(yaml, /\.\.\.$/);
  const mmd = editMetadata("Base Header Level: 2\nAuthor: A\n    B\nOther: Keep", "mmd", "author", "C\nD");
  assert.equal(mmd, "Base Header Level: 2\nAuthor: C\n    D\nOther: Keep");
  const source = "% Long title\n  continuation\n% One; Two\n% 2026";
  const c = { version: 1 as const, variant: "markdown" as const, extensions: { metadata_values: true } };
  const doc = parseNative(source, c); assert.equal(serializeNative(doc, c), source);
  assert.deepEqual(metadataValues(doc.firstChild!.attrs.raw, "pandoc"), { title: "Long title\ncontinuation", author: "One; Two", date: "2026" });
  assert.equal(metadataValues(editMetadata(source, "pandoc", "author", "New"), "pandoc").title, "Long title\ncontinuation");
});
test("date reminders require explicit valid reminder time and retain the source", () => {
  const page = { id: "page", title: "Reminder", revision: "1", bodyFormat: "notion-markdown", syntax: { version: 1, variant: "notdown", extensions: {} }, body: '<mention-date start="2026-09-22" reminder="2026-09-22T12:00:00+08:00">Lunch</mention-date>\n\n<mention-date start="2026-09-22"/>', properties: {} } as Page;
  const reminders = pageReminders(page); assert.equal(reminders.length, 1); assert.equal(reminders[0].text, "Lunch"); assert.equal(reminders[0].at, Date.parse("2026-09-22T04:00:00Z"));
  assert.equal(pageReminders({ ...page, body: page.body.replace("2026-09-22T12:00:00+08:00", "tomorrow") }).length, 0);
});
