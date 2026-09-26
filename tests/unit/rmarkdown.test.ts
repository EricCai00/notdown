import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec";
import { enabled, validSyntax, type SyntaxConfig } from "../../src/markdown-engine/config";
import { editorSchema as schema } from "../../src/document/editor-schema";
import { executeRMarkdown, rMarkdownCapabilities } from "../../server/rmarkdown";
import { prepareMarkdownImport } from "../../server/markdown-import";
import { createApp } from "../../server/app";
import { isRChunkHeader } from "../../src/markdown-engine/rmarkdown";
import { EditorState, TextSelection } from "prosemirror-state";
import { codeHighlighting } from "../../src/editor/code-highlighting";

const config: SyntaxConfig = { version: 1, variant: "rmarkdown", extensions: {} };
const source = '---\ntitle: "R report"\nparams:\n  n: 3\nunknown: keep\n---\n\n```{r setup, include=FALSE}\nx <- params$n + 1\n```\n\nAnswer: `r x`.\n\n```{r table, echo=FALSE}\nknitr::kable(data.frame(value=x))\n```\n';

test("R Markdown has Pandoc defaults, editable R chunks and exact source preservation", () => {
  assert.ok(validSyntax(config));
  for (const flag of ["yaml_metadata_block", "fenced_code_attributes", "citations", "tex_math_dollars", "footnotes"]) assert.ok(enabled(config, flag), flag);
  for (const newline of ["\n", "\r\n"]) {
    const raw = source.replaceAll("\n", newline);
    const doc = parseNative(raw, config);
    assert.equal(serializeNative(doc, config), raw);
    const nodes: any[] = [];
    doc.forEach(node => nodes.push(node));
    const index = nodes.findIndex(node => node.type.name === "block.executable_chunk");
    assert.ok(index >= 0);
    assert.equal(nodes[index].attrs.header, "{r setup, include=FALSE}");
    nodes[index] = schema.nodes["block.executable_chunk"].create(nodes[index].attrs, schema.text("x <- params$n + 2"));
    const changed = serializeNative(doc.copy(schema.nodes["doc"].create(null, nodes).content), config);
    assert.match(changed, /\{r setup, include=FALSE\}/);
    assert.ok(changed.includes("unknown: keep"));
    assert.ok(changed.includes("Answer: `r x`."));
    assert.ok(changed.includes("{r table, echo=FALSE}"));
    const reparsed = parseNative(changed, config);
    assert.equal(serializeNative(reparsed, config), changed);
  }
});

test("R headers keep expression-valued and unknown options, fenced examples stay inert", () => {
  const raw = '```{r test, fig.dim=c(4, 3), eval=exists("x"), custom=list(a="}")}\n1 + 1\n```\n\n````markdown\n```{r}\nstop("example")\n```\n````\n';
  const doc = parseNative(raw, config);
  assert.equal(doc.firstChild?.type.name, "block.executable_chunk");
  assert.equal(doc.lastChild?.type.name, "block.code_block");
  assert.equal(serializeNative(doc, config), raw);
  for (const variant of ["gfm", "notion-markdown", "markdown"] as const)
    assert.notEqual(parseNative(raw, { ...config, variant }).firstChild?.type.name, "block.executable_chunk");
  assert.equal(parseNative('```{r}\n1\n```', { ...config, variant: "notdown" }).firstChild?.type.name, "block.executable_chunk");
  const unknown = parseNative('```{unknown-engine custom, value=list(a=1)}\noriginal\n```', config);
  assert.equal(unknown.firstChild?.attrs.params, "{unknown-engine custom, value=list(a=1)}");
});

test("inline R is a source-preserving expression, distinct from verbatim code and other dialects", () => {
  const raw = 'The answer is **`r  sprintf("%0.2f", 1 / 3)  `**; example `` `r x` ``; ordinary `round(x)`.';
  for (const variant of ["rmarkdown", "notdown"] as const) {
    const dialect = { ...config, variant };
    const doc = parseNative(raw, dialect);
    const expressions: any[] = [];
    doc.descendants(node => { if (node.type.name === "inline.executable_expression") expressions.push(node); });
    assert.equal(expressions.length, 1, variant);
    assert.equal(expressions[0].attrs.raw, '`r  sprintf("%0.2f", 1 / 3)  `');
    assert.ok(expressions[0].marks.some((mark: any) => mark.type.name === "strong"));
    // Editing adjacent prose must not normalize expression whitespace or execute it.
    const paragraph = doc.firstChild!;
    assert.equal(serializeNative(doc, dialect), raw);
    const nodes: any[] = [];
    paragraph.forEach(node => nodes.push(node));
    nodes[0] = schema.text("Updated: ");
    const edited = doc.copy(schema.nodes.doc.create(null, paragraph.copy(schema.nodes["block.paragraph"].create(null, nodes).content)).content);
    assert.match(serializeNative(edited, dialect), /`r  sprintf\("%0.2f", 1 \/ 3\)  `/);
  }
  for (const variant of ["gfm", "markdown", "notion-markdown"] as const) {
    parseNative(raw, { ...config, variant }).descendants(node => { assert.notEqual(node.type.name, "inline.executable_expression"); });
  }
  for (const literal of ['`r`', '`rust x`', '``r x``', '`r `', '```r\n1 + 1\n```']) {
    parseNative(literal, config).descendants(node => { assert.notEqual(node.type.name, "inline.executable_expression"); });
  }
  assert.equal(isRChunkHeader('{r, fig.dim=c(4, 3), unknown=list(a="}")}'), true);
  assert.equal(isRChunkHeader('{r\necho=FALSE}'), false);
  assert.equal(isRChunkHeader('{r, label=`x`}'), false);
});

test("inline R text edits preserve source delimiters, adjacent prose and live highlights", () => {
  const raw = 'Before `r  x + 1  ` after.\r\n\r\n```{r, custom=list(a=1)}\nx <- 41\n```'.replace(/(?<!\r)\n/g, "\r\n");
  const doc = parseNative(raw, config);
  let pos = -1;
  doc.descendants((node, position) => { if (node.type.name === "inline.executable_expression") pos = position; });
  const expression = doc.nodeAt(pos)!;
  assert.equal(expression.isAtom, false);
  assert.equal(expression.textContent, "x + 1  ");
  let state = EditorState.create({ doc, selection: TextSelection.create(doc, pos + 1), plugins: [codeHighlighting()] });
  state = state.apply(state.tr.insertText("2", pos + 5, pos + 6));
  assert.equal(state.doc.nodeAt(pos)!.textContent, "x + 2  ");
  const saved = serializeNative(state.doc, config);
  assert.equal(saved, raw.replace("x + 1", "x + 2"));
  assert.equal(parseNative(saved, config).nodeAt(pos)!.textContent, "x + 2  ");
  const decorations = state.plugins[0].props.decorations!.call(state.plugins[0], state) as any;
  assert.ok(decorations.find(pos, pos + expression.nodeSize).some((item: any) => item.type.attrs.class.includes("pm-code-number")));
});

test("real R: evaluation and visibility options have distinct effects", { timeout: 60_000 }, async t => {
  if (!(await rMarkdownCapabilities()).available) { t.skip("R is not installed"); return; }
  const result = await executeRMarkdown({ source: [
    '```{r setup, include=FALSE}', 'hidden_value <- 41', 'cat("hidden-output")', '```',
    '', 'Value: `r hidden_value + 1`.', '',
    '```{r skip, eval=FALSE}', 'stop("unevaluated-source")', '```', '',
    '```{r output, echo=FALSE}', 'cat("visible-output")', '```', '',
    '```{r quiet, results="hide", message=FALSE, warning=FALSE}',
    'cat("hidden-result")', 'message("hidden-message")', 'warning("hidden-warning")', '```', '',
    '```{r body, echo=TRUE}', '#| echo: false', 'cat("body-option-result")', '```', '',
    '```{r asis, echo=FALSE, results="asis"}', 'cat("**rich-result**")', '```',
  ].join('\n') });
  assert.match(result.html, /Value: 42/);
  assert.doesNotMatch(result.html, /hidden_value|hidden-output/);
  assert.match(result.html, /unevaluated-source/);
  assert.match(result.html, /<strong>rich-result<\/strong>/);
  assert.match(result.html, /visible-output/);
  assert.match(result.html, /body-option-result/);
  // Hidden results/messages/warnings occur only once, in echoed source.
  for (const marker of ["hidden-result", "hidden-message", "hidden-warning", "visible-output", "body-option-result"])
    assert.equal(result.html.split(marker).length - 1, 1, marker);
});

test("Rmd folder import selects R Markdown and retains YAML and code bytes", () => {
  const plan = prepareMarkdownImport({ name: "R reports", dialect: "gfm", files: [{ path: "report.Rmd", data: Buffer.from(source).toString("base64") }] });
  const page = plan.pages.find(page => page.path === "report.Rmd")!;
  assert.ok(page);
  assert.equal((page.metadata.syntax as SyntaxConfig).variant, "rmarkdown");
  assert.equal(page.source, source);
  assert.equal(plan.originals[0].data.toString(), source);
});

test("R execution validates inputs before launching", async () => {
  await assert.rejects(executeRMarkdown({ source: "x", executable: "bad" }), /Expected R Markdown/);
  await assert.rejects(executeRMarkdown({ source: "x".repeat(128001) }), /maximum/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(executeRMarkdown({ source: "" }, controller.signal), /cancelled/);
});

test("real R: ordered chunks, inline R, params, options, tables, plots and Unicode", { timeout: 60_000 }, async t => {
  const capabilities = await rMarkdownCapabilities();
  if (!capabilities.available) { t.skip(capabilities.help); return; }
  const result = await executeRMarkdown({ source: source + '\n```{r skip, eval=FALSE}\nstop("must not run")\n```\n\n```{r plot, echo=FALSE, fig.width=3, fig.height=3}\nplot(1:3)\ncat("中文结果")\n```\n' });
  assert.match(result.html, /Answer: 4/);
  assert.match(result.html, /<table/);
  assert.match(result.html, /data:image\/png;base64,/);
  assert.match(result.html, /中文结果/);
  assert.doesNotMatch(result.html, /x &lt;- params/);
  await assert.rejects(executeRMarkdown({ source: '```{r}\nstop("execution-test-error")\n```' }), /execution-test-error/);
  const fresh = await executeRMarkdown({ source: 'Fresh: `r exists("x")`.' });
  assert.match(fresh.html, /Fresh: FALSE/);
});

test("real R cancellation terminates a running process and releases its slot", { timeout: 20_000 }, async t => {
  if (!(await rMarkdownCapabilities()).available) { t.skip("R is not installed"); return; }
  const controller = new AbortController();
  const execution = executeRMarkdown({ source: '```{r}\nSys.sleep(30)\n```' }, controller.signal);
  const timer = setTimeout(() => controller.abort(), 1200);
  try { await assert.rejects(execution, /cancelled/); }
  finally { clearTimeout(timer); }
  const result = await executeRMarkdown({ source: 'After cancellation: `r 6*7`.' });
  assert.match(result.html, /After cancellation: 42/);
});

test("R API rejects foreign origins and invalid requests without changing vault files", async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-r-api-"));
  const app = createApp({ vaultPath: directory });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    assert.equal(path.dirname(directory), os.tmpdir());
    await fs.rm(directory, { recursive: true, force: true });
  });
  const address = server.address() as { port: number };
  const url = `http://127.0.0.1:${address.port}/api/rmarkdown/run`;
  const hostile = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://example.com" }, body: JSON.stringify({ source }) });
  assert.equal(hostile.status, 403);
  const invalid = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source: 3 }) });
  assert.equal(invalid.status, 400);
  const notebook = await fetch(url.replace(/run$/, "notebook"), { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  assert.equal(notebook.status, 400, "Notebook route must exist in the running backend");
  assert.deepEqual(await fs.readdir(directory), []);
});
