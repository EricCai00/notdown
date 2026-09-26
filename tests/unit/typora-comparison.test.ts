import { editorKind } from "../../src/document/node-identity";
import { isListItem } from "../../src/document/list-items";
import test from "node:test";
import assert from "node:assert/strict";
import { Fragment } from "prosemirror-model";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec.js";
import { editorSchema as schema } from "../../src/document/editor-schema.js";
import { renderRawHtml } from "../../src/markdown-engine/html.js";
import { type SyntaxConfig } from "../../src/markdown-engine/config.js";

const typora: SyntaxConfig = { version: 1, variant: "typora", extensions: {} };

test("Typora extra paragraph spacing follows source gaps without rewriting code or definitions", () => {
  for (const newline of ["\n", "\r\n", "\r"]) {
    const source = "first\n\nsecond\n\n \n\t\nthird\n\n```text\na\n\n\n\nb\n```\n\n[ref]: /target\n\nlast".replace(/\n/g, newline);
    const doc = parseNative(source, typora);
    assert.equal(doc.childCount, 6);
    assert.equal(doc.child(2).textContent, "");
    assert.equal(serializeNative(doc, typora), source);
    const changed = doc.copy(Fragment.fromArray([
      doc.firstChild!.copy(Fragment.from(schema.text("edited"))),
      ...Array.from({ length: doc.childCount - 1 }, (_, i) => doc.child(i + 1)),
    ]));
    assert.equal(serializeNative(changed, typora), source.replace("first", "edited"));
  }
});

test("Typora blank paragraphs can be filled, deleted, inserted and round-tripped", () => {
  for (const newline of ["\n", "\r\n", "\r"]) {
    const source = ['first', '', '', '', 'last'].join(newline);
    const doc = parseNative(source, typora);
    assert.equal(doc.childCount, 3);
    const edited = doc.copy(Fragment.fromArray([doc.child(0), doc.child(1).copy(Fragment.from(schema.text('filled'))), doc.child(2)]));
    const written = serializeNative(edited, typora);
    assert.equal(written, ['first', '', 'filled', '', 'last'].join(newline));
    assert.equal(parseNative(written, typora).childCount, 3);
    const deleted = doc.copy(Fragment.fromArray([doc.child(0), doc.child(2)]));
    assert.equal(serializeNative(deleted, typora), ['first', '', 'last'].join(newline));
    const inserted = doc.copy(Fragment.fromArray([doc.child(0), schema.nodes["block.paragraph"].create(), doc.child(1), doc.child(2)]));
    assert.equal(serializeNative(inserted, typora), ['first', '', '', '', '', '', 'last'].join(newline));
    assert.equal(parseNative(serializeNative(inserted, typora), typora).childCount, 4);
    const duplicated = doc.copy(Fragment.fromArray([doc.child(0), doc.child(1), doc.child(1), doc.child(2)]));
    assert.equal(serializeNative(duplicated, typora), serializeNative(inserted, typora));
    for (const body of ['\n\nfirst', 'first\n\n', 'first\n\n\n']) {
      const parsed = parseNative(body.replace(/\n/g, newline), typora);
      assert.equal(serializeNative(parsed, typora), body.replace(/\n/g, newline));
      assert.ok(parsed.childCount > 1);
    }
    const tail = parseNative(['first', '', ''].join(newline), typora);
    const leading = parseNative(['', '', 'first'].join(newline), typora);
    assert.equal(serializeNative(leading.copy(Fragment.from(leading.lastChild!)), typora), 'first');
    const filledTail = tail.copy(Fragment.fromArray([tail.child(0), tail.child(1).copy(Fragment.from(schema.text('tail')))]));
    assert.equal(serializeNative(filledTail, typora), ['first', '', 'tail'].join(newline));
    const adjacent = parseNative(['first', '## heading', '', 'last'].join(newline), typora);
    const changedLast = adjacent.copy(Fragment.fromArray([adjacent.child(0), adjacent.child(1), adjacent.child(2).copy(Fragment.from(schema.text('changed')))]));
    assert.equal(serializeNative(changedLast, typora), ['first', '## heading', '', 'changed'].join(newline));
  }
});

test("Obsidian displays soft breaks by default with strict opt-out", () => {
  const config: SyntaxConfig = { ...typora, variant: 'obsidian' };
  for (const source of ['first\nsecond', '- first\n  second', '> first\n> second']) {
    let breaks = 0;
    const doc = parseNative(source, config);
    doc.descendants(node => { if (editorKind(node) === 'hard_break') breaks++; });
    assert.equal(breaks, 1);
    assert.equal(serializeNative(doc, config), source);
    parseNative(source, { ...config, extensions: { hard_line_breaks: false } }).descendants(node => assert.notEqual(editorKind(node), 'hard_break'));
  }
});

test("HTML line breaks leave table cell text editable and preserve source", () => {
  const source = '| A |\n| --- |\n| **第一行**<br>第二行 |';
  for (const variant of ['typora', 'gfm'] as const) {
    const config = { ...typora, variant };
    const doc = parseNative(source, config);
    const paragraph = doc.firstChild!.lastChild!.firstChild!.firstChild!;
    assert.equal(paragraph.child(0).text, '第一行');
    assert.equal(editorKind(paragraph.child(0).marks[0]), 'strong');
    assert.equal(editorKind(paragraph.child(1)), 'hard_break');
    assert.equal(paragraph.child(2).text, '第二行');
    assert.equal(serializeNative(doc, config), source);
  }
});

test("Typora unresolved references preserve source without inventing targets", () => {
  const source = "[undefined reference][missing]\n\n[resolved][ok]\n\ntext[^absent]\n\ntext[^note]\n\n[^note]: body\n\n[ok]: https://example.com";
  const doc = parseNative(source, typora);
  assert.equal(doc.firstChild?.firstChild?.attrs.kind, "unresolved_reference");
  assert.equal(doc.firstChild?.firstChild?.attrs.label, "undefined reference");
  assert.equal(doc.firstChild?.firstChild?.attrs.target, "");
  assert.equal(editorKind(doc.child(1).firstChild?.marks[0]), "link");
  assert.equal(doc.child(2).textContent, "text[^absent]");
  assert.equal(editorKind(doc.child(3).lastChild), "footnote_reference");
  assert.equal(serializeNative(doc, typora), source);
  assert.equal(parseNative("[undefined reference][missing]", { ...typora, variant: "gfm" }).textContent, "[undefined reference][missing]");
});

test("textarea displays content and dimensions without actions; inline tags are not displayed", () => {
  const raw = '<textarea rows="5" cols="33" name="story" form="target" autofocus onfocus="alert(1)">A &amp; B &lt;b&gt;text&lt;/b&gt;</textarea>';
  const html = renderRawHtml(raw);
  assert.ok(html.includes('rows="5" cols="33"'));
  assert.ok(html.includes('A &amp; B &lt;b&gt;text&lt;/b&gt;'));
  assert.ok(!/onfocus|autofocus|form=|name=/.test(html));
  assert.equal(serializeNative(parseNative(raw, typora), typora), raw);
  for (const tag of ['xmp', 'noembed']) {
    const source = `<${tag}>PROBE</${tag}>`;
    const doc = parseNative(source, typora);
    assert.equal(editorKind(doc.firstChild), 'paragraph');
    assert.equal(editorKind(doc.firstChild?.firstChild), 'html_inline');
    assert.equal(doc.firstChild?.firstChild?.attrs.html, 'PROBE');
    assert.equal(serializeNative(doc, typora), source);
    assert.equal(renderRawHtml(source), 'PROBE');
  }
});

test("Typora escape range matches the supplied application screenshot and survives edits", () => {
  for (const char of `"%&',/:;?@`) {
    const source = `L \\${char} R`;
    const doc = parseNative(source, typora);
    assert.equal(doc.textContent, source, char);
    assert.equal(serializeNative(doc, typora), source);
    const edited = schema.nodes["doc"].create(null, [schema.nodes["block.paragraph"].create(null, schema.text(source + " edited"))]);
    assert.equal(parseNative(serializeNative(edited, typora), typora).textContent, source + " edited");
    assert.equal(parseNative(source, { ...typora, extensions: { all_symbols_escapable: true, smart: false } }).textContent, `L ${char} R`);
    assert.equal(parseNative(source, { ...typora, variant: "gfm" }).textContent, `L ${char} R`);
  }
  for (const char of "\\`*_{}[]()<>#+-.!$=^|~") {
    const source = `L \\${char} R`;
    assert.equal(parseNative(source, typora).textContent, `L ${char} R`, char);
  }
  const source = '```text\n\\% \\& \\$ \\~\n```';
  assert.equal(parseNative(source, typora).firstChild?.textContent, '\\% \\& \\$ \\~');
});

test("only Typora ordered items keep literal task markers, including mixed nesting", () => {
  for (const source of ['1. [ ] ordered\n2. [x] done', '- parent\n  1. [ ] ordered\n  2. [x] done']) {
    const doc = parseNative(source, typora);
    doc.descendants((n) => { if (isListItem(n)) assert.equal(n.attrs.checked, null); });
    assert.ok(doc.textContent.includes('[ ] ordered'));
    assert.equal(serializeNative(doc, typora), source);
  }
  const nested = parseNative('1. [ ] ordered\n   - [x] bullet task', typora);
  const checks: unknown[] = [];
  nested.descendants((n) => { if (isListItem(n)) checks.push(n.attrs.checked); });
  assert.deepEqual(checks, [null, true]);
  const gfm = parseNative('1. [ ] ordered\n2. [x] done', { ...typora, variant: "gfm" });
  assert.equal(gfm.firstChild?.firstChild?.attrs.checked, false);
  assert.equal(gfm.firstChild?.lastChild?.attrs.checked, true);
});

test("loose Typora nesting preserves parent tasks, child tasks and disabled task markers", () => {
  const source =
    "- [ ] unchecked\n- [x] checked lowercase\n- [X] checked uppercase\n- [ ] parent task\n  - [x] child task\n  - [ ] another child\n\n1. [ ] ordered task\n2. [x] ordered completed task";
  const doc = parseNative(source, typora);
  const checks: unknown[] = [];
  doc.descendants((node) => {
    if (isListItem(node)) checks.push(node.attrs.checked);
  });
  assert.deepEqual(checks, [
    false,
    true,
    true,
    false,
    true,
    false,
    null,
    null,
  ]);
  assert.equal(serializeNative(doc, typora), source);
  const disabled = { ...typora, extensions: { task_lists: false } };
  parseNative(source, disabled).descendants((node) => {
    if (isListItem(node)) assert.equal(node.attrs.checked, null);
  });
  const changed = doc.copy(
    doc.content.append(
      Fragment.from(
        schema.nodes["block.paragraph"].create(null, schema.text("Neighbor")),
      ),
    ),
  );
  assert.ok(serializeNative(changed, typora).includes(source));
});

test("HTML probes follow the display policy without losing source", () => {
  for (const tag of [
    "script",
    "style",
    "textarea",
    "title",
    "xmp",
    "noembed",
    "noframes",
  ]) {
    const source = `<${tag}>PROBE</${tag}>`;
    assert.equal(
      renderRawHtml(source),
      ["script", "style"].includes(tag) ? "" :
      tag === "textarea" ? '<textarea readonly aria-label="HTML text area preview">PROBE</textarea>' : "PROBE",
    );
    assert.equal(serializeNative(parseNative(source, typora), typora), source);
  }
});

test("Typora links survive projection and unrelated edits, including angle autolinks", () => {
  const source =
    '<https://example.com/>\n\n<address@example.com>\n\nwww.commonmark.com\n\nhttp://example.com\n\naddress@example.com\n\nmailto:address@example.com\n\n[inline](https://example.com/inline "title")\n\n[reference][ref]\n\n[ref]: https://example.com/ref "ref title"';
  const doc = parseNative(source, typora);
  const links: string[] = [];
  doc.descendants((node) => {
    assert.notEqual(editorKind(node), "opaque_block");
    node.marks.forEach((mark) => {
      if (editorKind(mark) === "link") links.push(mark.attrs.href);
    });
  });
  assert.deepEqual(links, [
    "https://example.com/",
    "mailto:address@example.com",
    "http://www.commonmark.com",
    "http://example.com",
    "mailto:address@example.com",
    "mailto:address@example.com",
    "https://example.com/inline",
    "https://example.com/ref",
  ]);
  assert.equal(serializeNative(doc, typora), source);
  const changed = doc.copy(
    doc.content.append(
      Fragment.from(
        schema.nodes["block.paragraph"].create(null, schema.text("Neighbor")),
      ),
    ),
  );
  const written = serializeNative(changed, typora);
  for (const block of source.split("\n\n")) assert.ok(written.includes(block));
  const unknown = parseNative("<unknown-probe>keep</unknown-probe>", {
    ...typora,
    extensions: { raw_html: false },
  });
  assert.equal(editorKind(unknown.firstChild), "opaque_block");
  assert.equal(
    editorKind(parseNative("`<https://example.com/>`", typora).firstChild?.firstChild
      ?.marks[0]),
    "code",
  );
  const disabled = { ...typora, extensions: { autolink_bare_uris: false } };
  assert.equal(
    editorKind(parseNative("<https://example.com/>", disabled).firstChild?.firstChild
      ?.marks[0]),
    "link",
  );
  assert.equal(
    parseNative("https://example.com/", disabled).firstChild?.firstChild?.marks
      .length,
    0,
  );
  const mixed = "<unknown-probe>keep <https://example.com/>";
  const raw = parseNative(mixed, {
    ...typora,
    extensions: { raw_html: false },
  });
  assert.equal(editorKind(raw.firstChild), "opaque_block");
  assert.equal(serializeNative(raw, typora), mixed);
});

test("Typora restricts ordered markers, including nested lists; GFM retains parentheses", () => {
  for (const source of [
    "1) first\n2) second\n3) third",
    "- parent\n  1) child\n  2) child",
    "> 1) quoted\n> 2) quoted",
  ]) {
    const doc = parseNative(source, typora);
    doc.descendants((n) => assert.notEqual(editorKind(n), "ordered_list"));
    assert.equal(serializeNative(doc, typora), source);
  }
  assert.equal(
    editorKind(parseNative("1. first\n2. second", typora).firstChild),
    "ordered_list",
  );
  assert.equal(
    editorKind(parseNative("1) first\n2) second", { ...typora, variant: "gfm" }).firstChild),
    "ordered_list",
  );
});

test("Typora preserves visual line breaks with an explicit opt-out and intact source", () => {
  for (const source of [
    "first\nsecond",
    "* first\n  second",
    "* first\nsecond",
  ]) {
    const doc = parseNative(source, typora);
    let breaks = 0;
    doc.descendants((n) => {
      if (editorKind(n) === "hard_break") breaks++;
    });
    assert.equal(breaks, 1);
    assert.equal(serializeNative(doc, typora), source);
    parseNative(source, {
      ...typora,
      extensions: { hard_line_breaks: false },
    }).descendants((n) => assert.notEqual(editorKind(n), "hard_break"));
  }
});
