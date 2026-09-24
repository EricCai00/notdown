import assert from "node:assert/strict";
import test from "node:test";
import { diffLines, diffHTML } from "../../src/features/pages/conflict-diff";

test("line diff isolates separated edits and tracks both line numbers", () => {
  assert.deepEqual(diffLines("a\nold\nb\nc\n", "a\nnew\nb\nextra\nc\n"), [
    { kind: "context", text: "a\n", oldLine: 1, newLine: 1 },
    { kind: "removed", text: "old\n", oldLine: 2, newLine: undefined },
    { kind: "added", text: "new\n", oldLine: undefined, newLine: 2 },
    { kind: "context", text: "b\n", oldLine: 3, newLine: 3 },
    { kind: "added", text: "extra\n", oldLine: undefined, newLine: 4 },
    { kind: "context", text: "c\n", oldLine: 4, newLine: 5 },
  ]);
});

test("diff preserves empty bodies, repeated lines, CRLF, fences and final newlines", () => {
  const samples = [
    "",
    "\n",
    "a",
    "a\n",
    "a\r\n",
    "a\nb\na\n",
    "b\na\nb\n",
    "```html\n<script>x</script>\n```\n",
  ];
  for (const before of samples)
    for (const after of samples) {
      const diff = diffLines(before, after);
      assert.equal(
        diff
          .filter((row) => row.kind !== "added")
          .map((row) => row.text)
          .join(""),
        before,
      );
      assert.equal(
        diff
          .filter((row) => row.kind !== "removed")
          .map((row) => row.text)
          .join(""),
        after,
      );
      assert.equal(
        diff
          .filter((row) => row.kind !== "added")
          .every((row, i) => row.oldLine === i + 1),
        true,
      );
      assert.equal(
        diff
          .filter((row) => row.kind !== "removed")
          .every((row, i) => row.newLine === i + 1),
        true,
      );
    }
  assert.equal(
    diffLines("a", "a\n").filter((row) => row.kind !== "context").length,
    2,
  );
});

test("long notes retain small diffs; unrelated notes remain lossless at the work limit", () => {
  const before = Array.from({ length: 4000 }, (_, i) => `line ${i}\n`).join("");
  const after = before
    .replace("line 20\n", "edited 20\n")
    .replace("line 3900\n", "edited 3900\n");
  assert.equal(
    diffLines(before, after).filter((row) => row.kind !== "context").length,
    4,
  );
  const unrelated = Array.from({ length: 4000 }, (_, i) => `other ${i}\n`).join(
    "",
  );
  const rows = diffLines(before, unrelated);
  assert.equal(
    rows
      .filter((row) => row.kind !== "added")
      .map((row) => row.text)
      .join(""),
    before,
  );
  assert.equal(
    rows
      .filter((row) => row.kind !== "removed")
      .map((row) => row.text)
      .join(""),
    unrelated,
  );
});

test("diff markup folds context, escapes source, and reports identical bodies", () => {
  const before = `${"same\n".repeat(12)}old\n${"same\n".repeat(12)}`;
  const html = diffHTML(
    before,
    before.replace("old\n", "<img src=x onerror=alert(1)>\n"),
  );
  assert.equal((html.match(/Show 10 unchanged lines/g) ?? []).length, 2);
  assert.ok(html.includes("&lt;img"));
  assert.ok(!html.includes("<img"));
  assert.ok(html.includes("−1 removed"));
  assert.ok(html.includes("+1 added"));
  assert.ok(diffHTML("", "").includes("No body changes"));
});
