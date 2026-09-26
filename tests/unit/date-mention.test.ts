import { editorKind } from "../../src/document/node-identity";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  civilDate,
  dateKey,
  dateLabel,
  dateSuggestions,
  dateTime,
  updateDateAttributes,
} from "../../src/features/dates/date-mention";
import {
  parseNotionMarkdown,
  serializeNotionMarkdown,
} from "../../src/document/notion-markdown";
import { EditorState, TextSelection } from "prosemirror-state";
import { dateInputMatch } from "../../src/features/dates/date-input";
import { pageReminders } from "../../src/features/dates/reminders";
import type { Page } from "../../src/shared/types";

test("civil dates, leap years and relative labels use the local calendar", () => {
  assert.equal(civilDate("2026-02-29"), null);
  assert.equal(civilDate("2026-13-01"), null);
  assert.equal(dateKey(civilDate("2024-02-29")!), "2024-02-29");
  const now = new Date(2026, 8, 22, 0, 15);
  assert.equal(dateLabel({ start: "2026-09-22" }, now), "Today");
  assert.equal(dateLabel({ start: "2026-09-21" }, now), "Yesterday");
  assert.equal(
    dateLabel({ start: "2026-09-23T13:05:00+08:00" }, now),
    "Tomorrow 1:05 PM",
  );
  assert.equal(
    dateLabel({ start: "2026-09-22", end: "2026-09-23", "date-format": "iso" }),
    "2026-09-22 → 2026-09-23",
  );
  assert.equal(dateTime("2026-02-30", "09:00"), null);
  assert.equal(dateTime("2026-09-22", "25:00"), null);
  assert.equal(
    dateTime("2026-09-22", "09:30", "+08:00"),
    "2026-09-22T09:30:00+08:00",
  );
});
test("date suggestions resolve English, Chinese, ISO dates and reminders without guessing arbitrary text", () => {
  const now = new Date(2026, 8, 22, 23, 30);
  assert.equal(dateSuggestions("", now)[0].attrs.start, "2026-09-22");
  assert.match(dateSuggestions("", now)[1].attrs.reminder, /^2026-09-23T09:00/);
  assert.equal(dateSuggestions("明天", now)[0].attrs.start, "2026-09-23");
  assert.equal(
    dateSuggestions("next monday", now)[0].attrs.start,
    "2026-09-28",
  );
  assert.match(
    dateSuggestions("remind tomorrow 9am", now)[0].attrs.reminder,
    /^2026-09-23T09:00/,
  );
  assert.match(
    dateSuggestions("2026-12-31 23:45", now)[0].attrs.start,
    /^2026-12-31T23:45/,
  );
  for (const query of ["someone", "2026-02-30", "tomorrow 13pm", "today 9:70"])
    assert.deepEqual(dateSuggestions(query, now), []);
});
test("editing a date retains unknown attributes, surrounding code and labels through the codec", () => {
  const raw =
    'Before <mention-date start="2026-09-22" custom="keep">Original label</mention-date> after\n\n```xml\n<mention-date start="untouched"/>\n```';
  const doc = parseNotionMarkdown(raw);
  let pos = 0;
  doc.descendants((node, at) => {
    if (editorKind(node) === "mention") pos = at;
  });
  const node = doc.nodeAt(pos)!;
  const attrs = updateDateAttributes(node.attrs.nfmAttrs, {
    start: "2026-09-23T09:00:00+08:00",
    "reminder-offset": "30",
    "date-format": "iso",
  });
  const tr = EditorState.create({ doc }).tr.setNodeMarkup(pos, undefined, {
    ...node.attrs,
    nfmAttrs: attrs,
  });
  const output = serializeNotionMarkdown(tr.doc);
  assert.match(output, /custom="keep"/);
  assert.match(output, />Original label<\/mention-date>/);
  assert.match(output, /```xml\n<mention-date start="untouched"\/>\n```/);
  assert.equal(attrs.reminder, "2026-09-23T00:30:00.000Z");
  const reminders = pageReminders({
    id: "date-test",
    title: "Date",
    revision: "1",
    body: output,
    bodyFormat: "notion-markdown",
    syntax: { version: 1, variant: "notdown", extensions: {} },
    properties: {},
  } as Page);
  assert.equal(reminders.length, 1);
  assert.equal(reminders[0].at, Date.parse(attrs.reminder));
  const cleared = updateDateAttributes(attrs, {
    reminder: "",
    "reminder-offset": "",
  });
  assert.equal(cleared.reminder, undefined);
  assert.equal(cleared.custom, "keep");
  const custom = updateDateAttributes(
    { start: "2026-09-22", reminder: "2026-09-22T09:00:00Z", unknown: "yes" },
    { start: "2026-09-25" },
  );
  assert.equal(custom.reminder, "2026-09-22T09:00:00Z");
});

test("@ matching respects code, emails, inline atoms and disabled contexts", () => {
  for (const [source, query] of [
    ["@today", "today"],
    ["Before @remind tomorrow 9am", "remind tomorrow 9am"],
    ["test@example.com", null],
    ["[[Meeting @today", null],
    ["+Meeting @today", null],
    ["`@today`", null],
    ["```text\n@today\n```", null],
    ['<mention-date start="2026-09-22"/> @明天', "明天"],
  ] as const) {
    const doc = parseNotionMarkdown(source);
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, doc.content.size - 1),
    });
    assert.equal(dateInputMatch(state)?.query ?? null, query, source);
  }
});

test("malformed imported reminder attributes stay recoverable when unrelated formatting changes", () => {
  const original = {
    start: "invalid",
    "reminder-offset": "15",
    reminder: "old-value",
    unknown: "keep",
  };
  assert.deepEqual(updateDateAttributes(original, { "date-format": "iso" }), {
    ...original,
    "date-format": "iso",
  });
});
