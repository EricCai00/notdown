import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { EditorState } from "prosemirror-state";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec";
import { validSyntax, enabled, commandEnabled } from "../../src/markdown-engine/config";
import { quartoCell } from "../../src/markdown-engine/quarto";
import { QuartoNotebook } from "../../server/quarto-notebook";
import { prepareMarkdownImport } from "../../server/markdown-import";
import { rMarkdownCapabilities } from "../../server/rmarkdown";

const config = { version: 1 as const, variant: "quarto" as const, extensions: {} };
const source = '---\ntitle: Quarto\nunknown: keep\n---\n\n```{python}\n#| label: py-values\n#| echo: false\nscores = [80, 90, 100]\nsum(scores) / len(scores)\n```\n\nMean: `{python}  sum(scores) / len(scores)  `.\n\n~~~{julia}\nsum([1, 2, 3])\n~~~\n\n```{ojs}\n//| echo: false\nviewof n = Inputs.range([1, 10], {value: 3})\nsquare = n * n\n```\n\n```{unknown-engine}\nopaque()\n```\n';

test("Quarto and Notdown preserve executable syntax and opaque options through edits", () => {
  assert.ok(validSyntax(config));
  assert.ok(enabled(config, "yaml_metadata_block"));
  assert.ok(commandEnabled(config, "quarto_python"));
  assert.equal(commandEnabled({ ...config, variant: "notion-markdown" }, "quarto_python"), false);
  for (const variant of ["quarto", "notdown"] as const) for (const newline of ["\n", "\r\n"]) {
    const cfg = { ...config, variant }, raw = source.replaceAll("\n", newline);
    const doc = parseNative(raw, cfg);
    assert.equal(serializeNative(doc, cfg), raw);
    const chunks: string[] = [];
    let inlinePosition = -1;
    doc.descendants((node, pos) => {
      if (node.type.name === "block.executable_chunk") chunks.push(node.attrs.language);
      if (node.type.name === "inline.executable_expression") inlinePosition = pos;
    });
    assert.deepEqual(chunks, ["python", "julia", "ojs"]);
    assert.ok(inlinePosition >= 0);
    const state = EditorState.create({ doc });
    const changed = state.apply(state.tr.insertText("2 * ", inlinePosition + 1));
    const saved = serializeNative(changed.doc, cfg);
    assert.equal(saved, raw.replace("`{python}  sum", "`{python}  2 * sum"));
    assert.equal(serializeNative(parseNative(saved, cfg), cfg), saved);
  }
});

test("ordinary fences, examples, unsupported engines and other dialects never become executable", () => {
  for (const variant of ["gfm", "rmarkdown", "notion-markdown", "markdown"] as const) {
    const doc = parseNative(source, { ...config, variant });
    doc.descendants(node => assert.ok(!node.type.name.includes("executable")));
  }
  const examples = '```python\n1\n```\n\n````markdown\n```{python}\n1\n```\n````\n\n`` `{python} x` ``';
  parseNative(examples, config).descendants(node => assert.ok(!node.type.name.includes("executable")));
});

test("Quarto option YAML does not consume comments or strings later in the program", () => {
  assert.deepEqual(quartoCell('#| label: calc\n#| error: true\nx = "#| untouched"\n#| ordinary comment', "python"), {
    options: { label: "calc", error: true }, code: 'x = "#| untouched"\n#| ordinary comment',
  });
  assert.equal(quartoCell("//| echo: false\nx = 2", "ojs").options.echo, false);
  assert.throws(() => quartoCell("#| x: [\n1", "julia"), /Invalid Quarto/);
  assert.throws(() => quartoCell("#| - list\n1", "python"), /mapping/);
});

test("Quarto API validates dialect and cell identity before starting a runtime", async () => {
  const notebook = new QuartoNotebook();
  await assert.rejects(notebook.execute({}), /Expected a Quarto/);
  await assert.rejects(notebook.execute({ session: randomUUID(), source, variant: "quarto", mode: "current", index: 100 }), /no longer exists/);
  await assert.rejects(notebook.execute({ session: randomUUID(), source, variant: "rmarkdown", mode: "current", index: 0 }), /Expected a Quarto/);
});

test("qmd imports select Quarto and retain the complete document", () => {
  const plan = prepareMarkdownImport({ name: "Quarto reports", dialect: "gfm", files: [{ path: "report.qmd", data: Buffer.from(source).toString("base64") }] });
  const page = plan.pages.find(page => page.path === "report.qmd")!;
  assert.equal((page.metadata.syntax as { variant: string }).variant, "quarto");
  assert.equal(page.source, source);
  assert.equal(plan.originals[0].data.toString(), source);
});

test("real Python: persistent variables, rich output, inline values, errors and separate windows", { timeout: 90_000 }, async t => {
  if (!process.env.NOTDOWN_PYTHON) { t.skip("Set NOTDOWN_PYTHON to Python with jupyter_client and ipykernel"); return; }
  const notebook = new QuartoNotebook(); t.after(() => notebook.close());
  const request = { session: randomUUID(), source, variant: "quarto", mode: "current", index: 0 };
  const first = await notebook.execute(request);
  assert.match(first.outputs[0].html || "", /90/);
  const inline = await notebook.execute({ ...request, mode: "inline" });
  assert.equal(inline.outputs[0].text, "90.0");
  const other = await notebook.execute({ ...request, session: randomUUID(), mode: "inline" });
  assert.match(other.outputs[0].error || "", /scores.*not defined/);
  const rich = await notebook.execute({ ...request, source: '```{python}\nfrom IPython.display import display, HTML\ndisplay(HTML("<table><tr><td>hello</td></tr></table>"))\n```' });
  assert.match(rich.outputs[0].html || "", /<table>/);
  const unicode = await notebook.execute({ ...request, source: '```{python}\nprint("中文 π")\n```' });
  assert.match(unicode.outputs[0].html || "", /中文 π/);
  const plot = await notebook.execute({ ...request, source: '```{python}\nimport matplotlib.pyplot as plt\nplt.plot([1, 2, 3])\nplt.show()\n```' });
  assert.match(plot.outputs[0].html || "", /data:image\/png;base64/);
  const cancelled = new AbortController();
  const pending = notebook.execute({ ...request, source: '```{python}\nimport time\ntime.sleep(30)\n```' }, cancelled.signal);
  const timer = setTimeout(() => cancelled.abort(), 1200);
  try { await assert.rejects(pending, /stopped|cancelled/); } finally { clearTimeout(timer); }
  const fresh = await notebook.execute({ ...request, mode: "inline" });
  assert.match(fresh.outputs[0].error || "", /scores.*not defined/);
});

test("real Julia: IJulia blocks and inline expressions share session state", { timeout: 90_000 }, async t => {
  if (!process.env.NOTDOWN_TEST_JULIA) { t.skip("Set NOTDOWN_TEST_JULIA with a configured IJulia kernel"); return; }
  const notebook = new QuartoNotebook(); t.after(() => notebook.close());
  const request = { session: randomUUID(), source: '```{julia}\nx = 41\nx + 1\n```\n\n`{julia} x + 2`', variant: "quarto", mode: "current", index: 0 };
  assert.match((await notebook.execute(request)).outputs[0].html || "", /42/);
  assert.equal((await notebook.execute({ ...request, mode: "inline" })).outputs[0].text, "43");
});

test("mixed R/Python cells preserve indices, isolate language variables and stop above on error", { timeout: 90_000 }, async t => {
  if (!process.env.NOTDOWN_PYTHON || !(await rMarkdownCapabilities()).available) { t.skip("R and Python are required"); return; }
  const notebook = new QuartoNotebook(); t.after(() => notebook.close());
  const request = { session: randomUUID(), variant: "notdown", source: '```{r}\nx <- 10\n```\n\n```{python}\nx = 20\n```\n\n```{python}\nraise ValueError("stop here")\n```\n\n```{python}\nx = 99\n```\n\n`{r} x` / `{python} x`', mode: "above", index: 3 };
  const result = await notebook.execute(request);
  assert.deepEqual(result.outputs.map(output => output.index), [0, 1, 2]);
  assert.match(result.outputs[2].error || "", /stop here/);
  assert.equal((await notebook.execute({ ...request, mode: "inline", index: 0 })).outputs[0].text, "[1] 10");
  assert.equal((await notebook.execute({ ...request, mode: "inline", index: 1 })).outputs[0].text, "20");
  const continued = await notebook.execute({ ...request, source: request.source.replace('raise ValueError', '#| error: true\nraise ValueError') + '\n\n```{python}\nx\n```', index: 4 });
  assert.deepEqual(continued.outputs.map(output => output.index), [0, 1, 2, 3]);
  assert.equal((await notebook.execute({ ...request, mode: "inline", index: 1 })).outputs[0].text, "99");
});
