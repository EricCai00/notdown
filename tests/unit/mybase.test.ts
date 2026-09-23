import assert from "node:assert/strict";
import test from "node:test";
import { toMyBase } from "../../src/integrations/mybase.js";

const id = "550e8400-e29b-41d4-a716-446655440000";

test("exports metadata using stable local identity and the existing name datatype", () => {
  assert.equal(
    toMyBase({ id, title: "阅读笔记", body: "Must stay in Markdown" }),
    [
      "name^prop%String",
      "note URI^lprop%Url",
      "",
      `[Note ${id}]^lind%document`,
      '    name: "阅读笔记"',
      `    note URI: <note:${id}>`,
      "",
    ].join("\n"),
  );
  assert.match(
    toMyBase({ id, title: "A new title" }),
    new RegExp(`\\[Note ${id}\\]\\^lind%document`),
  );
  const other = "550e8400-e29b-41d4-a716-446655440001";
  assert.notEqual(
    toMyBase({ id, title: "Same" }),
    toMyBase({ id: other, title: "Same" }),
  );
});

test("quotes text without allowing new MBN records through any Python line separator", () => {
  const attack =
    '"\\\nInjected^ind\r\n\tfield: value\u0085Other^ind\u2028Third^ind\u2029';
  const output = toMyBase({
    id,
    title: attack,
    properties: { caption: attack },
  });
  const encoded =
    '"\\"\\\\\\nInjected^ind\\r\\n\\tfield: value\\u0085Other^ind\\u2028Third^ind\\u2029"';
  assert.ok(output.includes(`    name: ${encoded}\n`));
  assert.ok(
    output.includes(`    note property caption (String): ${encoded}\n`),
  );
  assert.equal(
    output.split("\n").filter((line) => line.startsWith("[Note ")).length,
    1,
  );
  assert.doesNotMatch(output, /[\r\u0085\u2028\u2029]/u);
});

test("escapes declaration punctuation and preserves repeated values with explicit datatypes", () => {
  const output = toMyBase({
    id,
    title: "Metadata",
    properties: {
      "a:b^c%d@e[f]": "literal",
      active: true,
      labels: ["a", "b"],
      score: 2024,
      tiny: 1e-7,
      large: 1e21,
      empty: [],
    },
  });
  assert.ok(
    output.includes(
      "note property a\\:b\\^c\\%d\\@e\\[f\\] (String)^lprop%String",
    ),
  );
  assert.ok(output.includes('    note property active (String): "true"'));
  assert.ok(
    output.includes(
      '    note property labels (String): "a"\n    note property labels (String): "b"',
    ),
  );
  assert.ok(output.includes("note property score (Quantity)^lprop%Quantity"));
  assert.ok(output.includes("    note property score (Quantity): 2024"));
  assert.ok(output.includes("    note property tiny (Quantity): 0.0000001"));
  assert.ok(
    output.includes(
      "    note property large (Quantity): 1000000000000000000000",
    ),
  );
  assert.ok(!output.includes("note property empty"));
});

test("rejects identities, property names, and values that cannot be represented safely", () => {
  assert.throws(
    () => toMyBase({ id: `${id}\nInjected^ind`, title: "Bad" }),
    /UUID/,
  );
  for (const key of ["", " space ", "two\nrecords", "two\u2028records"]) {
    assert.throws(
      () => toMyBase({ id, title: "Bad", properties: { [key]: "x" } }),
      /Property names/,
    );
  }
  for (const value of [
    null,
    undefined,
    { item: "Q1" },
    ["a", 1],
    [null],
    Number.NaN,
    Infinity,
  ]) {
    assert.throws(() => toMyBase({ id, title: "Bad", properties: { value } }));
  }
  assert.throws(
    () =>
      toMyBase({ id, title: "Bad", properties: { Status: "a", status: "b" } }),
    /Ambiguous/,
  );
});
