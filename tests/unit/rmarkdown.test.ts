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
    const index = nodes.findIndex(node => node.attrs.rChunk);
    assert.ok(index >= 0);
    assert.equal(nodes[index].attrs.params, "{r setup, include=FALSE}");
    nodes[index] = schema.nodes.code_block.create(nodes[index].attrs, schema.text("x <- params$n + 2"));
    const changed = serializeNative(doc.copy(schema.nodes.doc.create(null, nodes).content), config);
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
  assert.equal(doc.firstChild?.attrs.rChunk, true);
  assert.equal(doc.lastChild?.attrs.rChunk, false);
  assert.equal(serializeNative(doc, config), raw);
  for (const variant of ["gfm", "notion-markdown", "markdown"] as const)
    assert.notEqual(parseNative(raw, { ...config, variant }).firstChild?.attrs.rChunk, true);
  assert.equal(parseNative('```{r}\n1\n```', { ...config, variant: "notdown" }).firstChild?.attrs.rChunk, true);
  const unknown = parseNative('```{unknown-engine custom, value=list(a=1)}\noriginal\n```', config);
  assert.equal(unknown.firstChild?.attrs.params, "{unknown-engine custom, value=list(a=1)}");
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
  assert.deepEqual(await fs.readdir(directory), []);
});
