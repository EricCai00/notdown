import assert from "node:assert/strict";
import test from "node:test";
import {
  extractLinks,
  getOutline,
  htmlDocument,
  moveBlock,
  parseBlocks,
  renderMarkdown,
} from "../src/markdown.js";

test("blocks preserve every byte including CRLF, leading whitespace, code, lists and tables", () => {
  const source =
    "\r\n# Title\r\n\r\n```md\r\n# literal\r\n\r\n[[code]]\r\n```\r\n\r\n- First\r\n\r\n- Second\r\n  - Nested\r\n\r\n| A | B |\r\n| - | - |\r\n| 1 | 2 |\r\n\r\nLast";
  const blocks = parseBlocks(source);
  assert.equal(blocks.map((block) => block.source).join(""), source);
  assert.deepEqual(
    blocks.map((block) => block.type),
    ["heading", "fence", "bullet_list", "table", "paragraph"],
  );
  for (const block of blocks)
    assert.equal(source.slice(block.start, block.end), block.source);
  assert.equal(
    moveBlock(source, 1, 3),
    [blocks[0], blocks[2], blocks[3], blocks[1], blocks[4]]
      .map((block) => block.source)
      .join(""),
  );
  assert.equal(moveBlock(source, -1, 2), source);
  assert.equal(moveBlock(source, 2, 2), source);
  assert.equal(
    parseBlocks(" \r\n\r\n")
      .map((block) => block.source)
      .join(""),
    " \r\n\r\n",
  );
});

test("moving an unterminated last block adds only the missing boundary", () => {
  const source = "# A\n\nparagraph";
  const moved = moveBlock(source, 1, 0);
  assert.equal(moved, "paragraph\n\n# A\n\n");
  assert.deepEqual(
    parseBlocks(moved).map((block) => block.type),
    ["paragraph", "heading"],
  );
  assert.match(renderMarkdown(moved), /^<p>paragraph<\/p>\n<h1[^>]*>A<\/h1>/);
  assert.equal(moveBlock("# A\n\nparagraph\n", 1, 0), "paragraph\n\n# A\n\n");
  assert.equal(
    moveBlock("# A\r\n\r\nparagraph", 1, 0),
    "paragraph\r\n\r\n# A\r\n\r\n",
  );
  assert.equal(
    moveBlock("# A\nparagraph\n\n## Last", 2, 0),
    "## Last\n\n# A\nparagraph\n\n",
  );
  assert.equal(moveBlock(source, 1, 1), source);
});

test("wiki links are parsed only in prose and preserve labels safely", () => {
  const source =
    "[[one|First]] [[two]] [[one]] `[[inline]]` \\[[escaped]]\n\n```md\n[[fenced]]\n```\n\n    [[indented]]";
  assert.deepEqual(extractLinks(source), ["one", "two"]);
  const html = renderMarkdown("[[one|<img src=x onerror=alert(1)>]] [[中文]]", [
    { id: "abc", title: "one" },
  ]);
  assert.match(html, /href="#page\/abc"/);
  assert.match(html, /&lt;img/);
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /#page\/%E4%B8%AD%E6%96%87/);
  assert.deepEqual(
    extractLinks(
      "[Already a link [[nested]]](https://example.com) ![image [[alt]]](assets/a.png)",
    ),
    [],
  );
  assert.doesNotMatch(
    renderMarkdown("[Already a link [[nested]]](https://example.com)"),
    /class="wiki-link"/,
  );
});

test("child pages and two columns use block rules and keep fenced syntax literal", () => {
  const source =
    '::page{id="child"}\n\n:::columns\n# Left\n\n[[other]]\n:::column\n# Right\n\n```md\n:::column\n::page{id="fake"}\n```\n:::\n';
  const html = renderMarkdown(source, [{ id: "child", title: "<Child>" }]);
  assert.match(html, /class="child-page" href="#page\/child"/);
  assert.match(html, /&lt;Child&gt;/);
  assert.match(html, /class="note-columns"/);
  assert.equal((html.match(/class="child-page"/g) ?? []).length, 1);
  assert.equal(
    parseBlocks(source)
      .map((block) => block.source)
      .join(""),
    source,
  );
  assert.deepEqual(extractLinks(source), ["other"]);
  assert.deepEqual(
    getOutline(source).map((node) => [node.text, node.line]),
    [
      ["Left", 4],
      ["Right", 8],
    ],
  );
  assert.match(html, /id="heading-8"/);
});

test("malformed, nested, and excess columns safely preserve literal source", () => {
  const cases = [
    ":::columns\nleft\n:::column\nright",
    ":::columns\nleft\n:::column\nright\n:::column\nthird\n:::",
    ":::columns\n:::columns\nleft\n:::column\nright\n:::\n:::column\nouter\n:::",
  ];
  for (const source of cases) {
    const html = renderMarkdown(source);
    assert.match(html, /class="unknown-extension"/);
    assert.doesNotMatch(html, /class="note-columns"/);
    assert.equal(
      parseBlocks(source)
        .map((block) => block.source)
        .join(""),
      source,
    );
  }
  assert.equal(
    parseBlocks(":::future\nunknown()\n:::")
      .map((block) => block.source)
      .join(""),
    ":::future\nunknown()\n:::",
  );
});

test("headings and nested lists form a shared outline", () => {
  const outline = getOutline(
    "# Main\n\n- **First**\n  - Child\n- Second\n\n## Detail\n\n1. Item\n\n# Next",
  );
  assert.deepEqual(
    outline.map((node) => node.text),
    ["Main", "Next"],
  );
  assert.deepEqual(
    outline[0].children.map((node) => node.text),
    ["First", "Second", "Detail"],
  );
  assert.equal(outline[0].children[0].children[0].text, "Child");
  assert.equal(outline[0].children[2].children[0].text, "Item");
});

test("raw HTML and unsafe URL schemes never become executable HTML", () => {
  const source =
    '<script>alert(1)</script>\n\n[bad](javascript:alert(1))\n\n![bad](javascript:alert(1))\n\n[[javascript:alert(1)|<svg onload=alert(1)>]]\n\n::page{id="javascript:alert(1)"}';
  const html = htmlDocument("</title><script>bad()</script>", source);
  assert.doesNotMatch(html, /<script|<svg|href="javascript:|src="javascript:/i);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /#page\/javascript%3Aalert/);
});

test("task checkboxes render only at real list-item starts, never prose or code", () => {
  const source =
    "# Tasks\n\n- [ ] Pending\n- [x] **Done**\n  - [X] Nested\n- \\[x] Escaped\n- `[x]` Code item\n\n[ ] Ordinary paragraph\n\n```md\n- [x] Fenced\n```";
  const html = renderMarkdown(source);
  assert.equal((html.match(/class="task-checkbox"/g) ?? []).length, 3);
  assert.equal((html.match(/disabled checked/g) ?? []).length, 2);
  assert.match(html, /disabled aria-label="未完成"> Pending/);
  assert.match(html, /<strong>Done<\/strong>/);
  assert.match(html, /\[x\] Escaped/);
  assert.match(html, /<code>\[x\]<\/code> Code item/);
  assert.match(html, /<p>\[ \] Ordinary paragraph<\/p>/);
  assert.match(html, /<code class="language-md">- \[x\] Fenced/);
  assert.deepEqual(
    getOutline(source)[0]
      .children.slice(0, 2)
      .map((node) => node.text),
    ["Pending", "Done"],
  );
  assert.equal(getOutline(source)[0].children[1].children[0].text, "Nested");
  assert.match(
    htmlDocument("Tasks", source),
    /class="task-checkbox" type="checkbox" disabled/,
  );
  assert.equal(
    parseBlocks(source)
      .map((block) => block.source)
      .join(""),
    source,
  );
});

test("local ordinary media links render media; remote/file links remain links", () => {
  assert.match(
    renderMarkdown("[Recording](assets/voice.mp3)"),
    /<audio controls/,
  );
  assert.match(renderMarkdown("[Video](assets/demo.mp4)"), /<video controls/);
  assert.doesNotMatch(
    renderMarkdown("[Remote](https://example.com/demo.mp4)"),
    /<video/,
  );
  assert.match(
    renderMarkdown("[File](assets/spec.pdf)"),
    /href="assets\/spec.pdf"/,
  );
  assert.match(
    renderMarkdown("![Alt](assets/photo.png)"),
    /<img src="assets\/photo.png" alt="Alt"/,
  );
});
