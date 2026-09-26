import test from "node:test";
import assert from "node:assert/strict";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec";
import { type SyntaxConfig, commandEnabled } from "../../src/markdown-engine/config";
import { withExecutionLanguage } from "../../src/editor/executable-language";
import { rExpressionSource } from "../../src/document/r-expression";
import { quartoCell } from "../../src/markdown-engine/quarto";
import { insertMenuItems } from "../../src/editor/insert-menu";
import { editorSchema } from "../../src/document/editor-schema";

const config: SyntaxConfig = { version: 1, variant: "notdown", extensions: {} };

test("R and Quarto share two canonical objects without changing original source", () => {
  const source = '```{r old, unknown=list(x=1)}\nx <- 1\n```\n\n```{python}\nx = 1\n```\n\n`r  x  ` and `{python} x`';
  const doc = parseNative(source, config);
  const types: string[] = [];
  doc.descendants(node => { if (node.attrs.language) types.push(node.type.name); });
  assert.deepEqual(types, ["block.executable_chunk", "block.executable_chunk", "inline.executable_expression", "inline.executable_expression"]);
  assert.equal(editorSchema.nodes["block.r_chunk"], undefined);
  assert.equal(editorSchema.nodes["inline.r_expression"], undefined);
  assert.equal(serializeNative(doc, config), source);
});

test("switching an opaque R header never inserts old options into the program", () => {
  const node = parseNative('```{r old, unknown=list(x="}")}\n#| echo: false\nx <- 1\n```', config).firstChild!;
  const next = withExecutionLanguage(node, "python");
  assert.equal(next.attrs.header, "{python}");
  assert.equal(next.content, node.content);
  assert.equal(quartoCell(next.textContent, "python").options.echo, false);
  assert.equal(withExecutionLanguage(node, "r"), node);
});

test("language switching preserves every option comment and string literally", () => {
  const node = parseNative('```{python}\n#| label: example\n#| echo: false\nx = "#| keep"\n#| ordinary body comment\n```', config).firstChild!;
  const ojs = withExecutionLanguage(node, "ojs");
  assert.equal(ojs.content, node.content);
  assert.equal(withExecutionLanguage(ojs, "python").textContent, node.textContent);
});

test("inline switching preserves text and marks and replaces the language delimiter", () => {
  const doc = parseNative('Before **`r  x + 1  `** after.', config);
  const node = doc.firstChild!.child(1);
  const python = withExecutionLanguage(node, "python");
  assert.equal(rExpressionSource(python), '`{python} x + 1  `');
  assert.deepEqual(python.marks, node.marks);
  assert.equal(rExpressionSource(withExecutionLanguage(python, "r")), '`r x + 1  `');
  const edited = node.type.create(node.attrs, editorSchema.text("x + 2"), node.marks);
  assert.equal(rExpressionSource(edited), '`r  x + 2`');
});

test("insert menus expose one chunk and one inline entry within dialect boundaries", () => {
  for (const variant of ["rmarkdown", "quarto", "notdown"] as const) {
    const dialect = { ...config, variant };
    const entries = insertMenuItems(dialect).map(row => row[0]);
    assert.ok(entries.includes("executable_chunk"));
    assert.ok(entries.includes("executable_inline"));
    for (const old of ["r_chunk", "r_inline", "quarto_r", "quarto_python", "quarto_julia", "quarto_ojs"]) assert.ok(!entries.includes(old));
    assert.equal(commandEnabled(dialect, "quarto_python"), variant !== "rmarkdown");
  }
  for (const variant of ["gfm", "notion-markdown"] as const)
    assert.ok(!insertMenuItems({ ...config, variant }).some(row => row[0].startsWith("executable_")));
});
