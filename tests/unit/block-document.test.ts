import assert from "node:assert/strict";
import test from "node:test";
import {
  deleteBlock,
  duplicateBlock,
  editableBlock,
  insertBlock,
  replaceBlock,
  toggleTaskInBlock,
  mergeParagraphWithPrevious,
} from "../../src/document/block-document.js";
import { parseBlocks, renderMarkdown } from "../../src/document/markdown.js";

test("backspace merges only adjacent paragraphs without changing surrounding bytes", () => {
  const source =
    "# Heading\r\n\r\nFirst **part**\r\n\r\nsecond *part*\r\n\r\n```md\r\nTail\r\n```";
  assert.equal(
    mergeParagraphWithPrevious(source, 2),
    source.replace("**\r\n\r\nsecond", "**second"),
  );
  assert.equal(mergeParagraphWithPrevious(source, 1), undefined);
  assert.equal(
    mergeParagraphWithPrevious("First\n\n[ref]: /target\n\nSecond", 1),
    undefined,
  );
  assert.equal(mergeParagraphWithPrevious("- Item\n\nParagraph", 1), undefined);
  assert.equal(mergeParagraphWithPrevious("First", 0), undefined);
});

test("editing one block preserves other slices and the original CRLF boundaries", () => {
  const source =
    "\r\n# Heading\r\n\r\nOld *text*\r\n\r\n```md\r\n[[literal]]\r\n```\r\n\r\nLast";
  const blocks = parseBlocks(source);
  assert.equal(editableBlock(source, 1).content, "Old *text*");
  const result = replaceBlock(source, 1, "New **text**\nwith a second line\n");
  assert.equal(
    result,
    blocks[0].source +
      "New **text**\r\nwith a second line\r\n\r\n" +
      blocks
        .slice(2)
        .map((block) => block.source)
        .join(""),
  );
  assert.equal(replaceBlock(source, 1, "Old *text*\n"), source);
  assert.equal(
    replaceBlock(source, 3, "Edited final\n"),
    source.replace(/Last$/, "Edited final"),
  );
});

test("reference definitions and initial whitespace survive edits, deletion and duplication", () => {
  const definitions = '[target]: <https://example.com/a>\n  "A title"\n\n';
  const source =
    "\n\n" +
    definitions +
    "First\n\n[another]: /asset.png\n\nLast [link][target]";
  assert.equal(editableBlock(source, 0).content, "First");
  assert.equal(
    replaceBlock(source, 0, "Changed\n"),
    source.replace("First", "Changed"),
  );
  assert.equal(deleteBlock(source, 0), source.replace("First", ""));
  const duplicated = duplicateBlock(source, 0);
  assert.equal((duplicated.match(/\[target\]:/g) ?? []).length, 1);
  assert.equal((duplicated.match(/\[another\]:/g) ?? []).length, 1);
  assert.equal((duplicated.match(/First/g) ?? []).length, 2);
  const definitionsOnly = "\n" + definitions;
  assert.equal(deleteBlock(definitionsOnly, 0), definitionsOnly);
  assert.equal(
    replaceBlock(definitionsOnly, 0, "New paragraph"),
    definitionsOnly + "New paragraph",
  );
});

test("blocks containing fences, lists, tables and column extensions are edited atomically", () => {
  const fixtures = [
    "```md\n[ref]: this is code\n\n- literal\n```",
    "- First\n\n- Second\n  - Child",
    "| A | B |\n| - | - |\n| 1 | 2 |",
    ":::columns\nLeft\n:::column\n```md\n[ref]: literal\n```\n:::",
    ":::future\nunknown(value)\n:::",
  ];
  for (const fixture of fixtures) {
    const source = "# Before\n\n" + fixture + "\n\n# After";
    assert.equal(editableBlock(source, 1).content, fixture);
    assert.equal(replaceBlock(source, 1, fixture + "\n"), source);
    assert.equal(deleteBlock(source, 1), "# Before\n\n# After");
    assert.equal(
      replaceBlock(source, 0, "# Edited"),
      source.replace("# Before", "# Edited"),
    );
  }
});

test("insertions preserve original source and add only missing block separators", () => {
  assert.equal(insertBlock("", 0, "First\n"), "First");
  assert.equal(insertBlock("", 0, ""), "");
  assert.equal(insertBlock("\n\n", 0, "First"), "First\n\n");
  assert.equal(insertBlock("# A\n\nLast", 2, "After"), "# A\n\nLast\n\nAfter");
  assert.equal(
    insertBlock("# A\r\n\r\nLast", 1, "New\nline\n"),
    "# A\r\n\r\nNew\r\nline\r\n\r\nLast",
  );
  assert.equal(
    insertBlock("# A\nparagraph", 1, "Inserted"),
    "# A\n\nInserted\n\nparagraph",
  );
  assert.equal(insertBlock("\n# A\n\n", 0, "Inserted"), "Inserted\n\n# A\n\n");
});

test("unknown literal extensions retain reference-looking lines in their editable body", () => {
  const literal =
    ":::columns\nLeft\n:::column\n\n[looks-like-reference]: /literal-value";
  const source = "# Before\n\n" + literal;
  assert.equal(editableBlock(source, 1).content, literal);
  assert.equal(replaceBlock(source, 1, literal + "\n"), source);
  assert.equal(deleteBlock(source, 1), "# Before\n\n");
  assert.equal(
    replaceBlock(source, 1, "Replacement"),
    "# Before\n\nReplacement",
  );
});

test("deleting the only block, first block and final block leaves valid Markdown", () => {
  assert.equal(deleteBlock("Only", 0), "");
  assert.equal(deleteBlock("# A\n\nFinal", 1), "# A\n\n");
  assert.equal(deleteBlock("# A\n\nFinal", 0), "Final");
  assert.equal(deleteBlock("\n\n# A\n\nFinal", 0), "\n\nFinal");
  assert.equal(deleteBlock(" \r\n\r\n", 0), "");
  assert.equal(
    replaceBlock("# A\nparagraph\n\n# C", 0, "Plain"),
    "Plain\n\nparagraph\n\n# C",
  );
  assert.match(
    renderMarkdown(duplicateBlock("# A\n\nFinal", 1)),
    /<p>Final<\/p>\n<p>Final<\/p>/,
  );
});

test("invalid operations fail explicitly without silently editing a different block", () => {
  for (const index of [-1, 2, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => editableBlock("One", index), RangeError);
    assert.throws(() => replaceBlock("One", index, "Changed"), RangeError);
    assert.throws(() => deleteBlock("One", index), RangeError);
    assert.throws(() => duplicateBlock("One", index), RangeError);
    assert.throws(() => insertBlock("One", index, "New"), RangeError);
  }
  assert.throws(() => deleteBlock("", 0), RangeError);
  assert.throws(() => insertBlock("", 1, "New"), RangeError);
});

test("task toggles follow real nested task order and change exactly one character", () => {
  const source =
    "# Before\r\n\r\n- [ ] First\r\n  - [X] Nested\r\n- \\[x] Escaped\r\n- `[ ]` Inline\r\n- [x] Final\r\n\r\n```md\r\n- [ ] Literal\r\n```";
  const first = toggleTaskInBlock(source, 1, 0);
  assert.equal(first, source.replace("- [ ] First", "- [x] First"));
  assert.equal(toggleTaskInBlock(first, 1, 0), source);
  assert.equal(
    toggleTaskInBlock(source, 1, 1),
    source.replace("- [X] Nested", "- [ ] Nested"),
  );
  assert.equal(
    toggleTaskInBlock(source, 1, 2),
    source.replace("- [x] Final", "- [ ] Final"),
  );
  assert.throws(() => toggleTaskInBlock(source, 1, 3), RangeError);
  assert.throws(() => toggleTaskInBlock(source, 2, 0), RangeError);
  assert.throws(() => toggleTaskInBlock(source, 1, -1), RangeError);
});

test("task toggles respect blockquotes and the two-column renderer's traversal", () => {
  const quote =
    "> - [ ] Quote\n>   - [x] Child\n>\n> ```md\n> - [ ] Code\n> ```";
  assert.equal(
    toggleTaskInBlock(quote, 0, 1),
    quote.replace("- [x] Child", "- [ ] Child"),
  );
  const source =
    "# Before\n\n:::columns\n> - [ ] Left\n\n```md\n- [ ] Code\n```\n:::column\n2. [X] Right\n   - [ ] Nested\n:::\n\n# After";
  assert.equal(
    (renderMarkdown(source).match(/class="task-checkbox"/g) ?? []).length,
    3,
  );
  assert.equal(
    toggleTaskInBlock(source, 1, 0),
    source.replace("- [ ] Left", "- [x] Left"),
  );
  assert.equal(
    toggleTaskInBlock(source, 1, 1),
    source.replace("2. [X] Right", "2. [ ] Right"),
  );
  assert.equal(
    toggleTaskInBlock(source, 1, 2),
    source.replace("- [ ] Nested", "- [x] Nested"),
  );
  assert.throws(() => toggleTaskInBlock(source, 1, 3), RangeError);
  const malformed = ":::columns\n- [ ] Unknown\n:::column\nUnclosed";
  assert.throws(() => toggleTaskInBlock(malformed, 0, 0), RangeError);
});
