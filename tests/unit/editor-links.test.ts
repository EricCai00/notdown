import assert from "node:assert/strict";
import test from "node:test";
import { EditorState, TextSelection } from "prosemirror-state";
import { editorSchema as s } from "../../src/document/editor-schema";
import { linkRangeAtSelection } from "../../src/editor/editor-links";

const link = s.marks.link.create({
  href: "https://example.com/old",
  title: "Title",
});
const doc = s.nodes.doc.create(
  null,
  s.nodes.paragraph.create(null, [
    s.text("before "),
    s.text("a ", [link]),
    s.text("bold", [link, s.marks.strong.create()]),
    s.text(" c", [link, s.marks.em.create()]),
    s.text(" after"),
  ]),
);
const stateAt = (from: number, to = from) =>
  EditorState.create({ doc, selection: TextSelection.create(doc, from, to) });

test("link range includes adjacent bold and italic spans", () => {
  const range = linkRangeAtSelection(stateAt(12));
  assert.ok(range);
  assert.equal(range.from, 8);
  assert.equal(range.to, 16);
  assert.ok(range.mark.eq(link));
  const changed = stateAt(12)
    .tr.removeMark(range.from, range.to, s.marks.link)
    .addMark(
      range.from,
      range.to,
      s.marks.link.create({ href: "https://example.com/new" }),
    );
  changed.doc.nodesBetween(range.from, range.to, (node) => {
    if (node.isText)
      assert.equal(
        node.marks.find((mark) => mark.type === s.marks.link)?.attrs.href,
        "https://example.com/new",
      );
  });
  assert.equal(changed.doc.textContent, doc.textContent);
  assert.equal(
    changed.doc
      .firstChild!.child(2)
      .marks.some((mark) => mark.type === s.marks.strong),
    true,
  );
});

test("link boundaries remain editable despite noninclusive link marks", () => {
  for (const pos of [8, 10, 14, 16]) {
    const range = linkRangeAtSelection(stateAt(pos));
    assert.ok(range, `Expected a link at ${pos}`);
    assert.deepEqual([range.from, range.to], [8, 16]);
  }
});

test("a selection inside one link resolves its entire label", () => {
  const range = linkRangeAtSelection(stateAt(15, 9));
  assert.ok(range);
  assert.deepEqual([range.from, range.to], [8, 16]);
});

test("ordinary text and selections crossing a link boundary have no single link", () => {
  for (const state of [stateAt(4), stateAt(19), stateAt(9, 17), stateAt(7, 10)])
    assert.equal(linkRangeAtSelection(state), null);
});

test("neighboring distinct links do not merge, including same href with different title", () => {
  const first = s.marks.link.create({
    href: "https://example.com",
    title: "one",
  });
  const second = s.marks.link.create({
    href: "https://example.com",
    title: "two",
  });
  const value = s.nodes.doc.create(
    null,
    s.nodes.paragraph.create(null, [
      s.text("left", [first]),
      s.text("right", [second]),
    ]),
  );
  const at = (from: number, to = from) =>
    EditorState.create({
      doc: value,
      selection: TextSelection.create(value, from, to),
    });
  const range = linkRangeAtSelection(at(5));
  assert.ok(range);
  assert.deepEqual(
    [range.from, range.to, range.mark.attrs.title],
    [5, 10, "two"],
  );
  assert.deepEqual(
    [linkRangeAtSelection(at(3))!.from, linkRangeAtSelection(at(3))!.to],
    [1, 5],
  );
  assert.equal(linkRangeAtSelection(at(2, 7)), null);
});

test("matching link marks in different paragraphs never form one range", () => {
  const value = s.nodes.doc.create(null, [
    s.nodes.paragraph.create(null, s.text("one", [link])),
    s.nodes.paragraph.create(null, s.text("two", [link])),
  ]);
  const state = EditorState.create({
    doc: value,
    selection: TextSelection.create(value, 2, 7),
  });
  assert.equal(linkRangeAtSelection(state), null);
});
