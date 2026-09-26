import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  getPandocCapabilities,
  getMarkdownLabCapabilities,
  renderPreview,
  PreviewError,
} from "../../server/pandoc.js";
import { renderBlockPlugin } from "../../src/markdown-lab/plugins.js";
import { mapScroll } from "../../src/markdown-lab/scroll.js";
import { variants } from "../../src/markdown-lab/model.js";
import { dialects } from "../../src/markdown-engine/config.js";
import { parseFragment } from "parse5";

test("Lab citeproc formats inline bibliography, locators and citations inside notes without changing source", async (t) => {
  if (!(await getPandocCapabilities()).available) return t.skip("Pandoc is not installed");
  const source = await fs.readFile(new URL("../../docs/fixtures/pandoc-citations.md", import.meta.url), "utf8");
  const input = { variant: "markdown", source };
  const result = await renderPreview(input);
  assert.equal(input.source, source);
  assert.deepEqual(result.notices, []);
  assert.match(result.html, /class="citation" data-cites="doe99"/);
  assert.match(result.html, /Doe 1999/);
  assert.match(result.html.replace(/<[^>]*>/g, ""), /Smith \(2004/);
  assert.match(result.html, /id="refs"/);
  assert.match(result.html, /id="ref-doe99"/);
  assert.match(result.html, /href="#ref-smith04"/);
  assert.match(result.html, /ii, A, D[–-]Z/);
  assert.match(result.html, /99 years later/);
  assert.match(result.html, /<em>passim<\/em>/);
  assert.match(result.html, /role="doc-endnotes"[\s\S]*Doe 1999/);
  assert.match(result.html, /<code>\[@doe99\]<\/code>/);
  const roots = parseFragment(result.html).childNodes as any[];
  const chapter = roots.find(node => node.tagName === "h1" && node.attrs.some((attr: any) => attr.name === "id" && attr.value === "new-chapter"));
  assert(chapter, "chapter headings remain top-level for citeproc position resets");
  assert(chapter.attrs.some((attr: any) => attr.name === "class" && attr.value.includes("reset-citation-positions")));
  const line = source.split("\n").findIndex(line => line.startsWith("# New chapter")) + 1;
  assert(chapter.attrs.some((attr: any) => attr.name === "data-source-line" && attr.value === String(line)));

  const disabled = await renderPreview({ ...input, extensions: { citations: false } });
  assert.doesNotMatch(disabled.html, /class="citation"|id="refs"/);
  assert.match(disabled.html, /\[@doe99\]/);
});

test("Lab reports missing citation data and ignores external resource metadata", async (t) => {
  if (!(await getPandocCapabilities()).available) return t.skip("Pandoc is not installed");
  const missing = await renderPreview({ variant: "markdown", source: "Unknown [@missing]." });
  assert(missing.notices?.some(notice => notice.includes("references")));
  const source = await fs.readFile(new URL("../../docs/fixtures/pandoc-citations.md", import.meta.url), "utf8");
  const external = source.replace("---\n", "---\nbibliography: missing.bib\ncsl: missing.csl\ncitation-abbreviations: missing.json\nfilters: [missing.lua]\ntemplate: missing.html\n");
  const result = await renderPreview({ variant: "markdown", source: external + "\nUnknown [@missing].\n" });
  assert.match(result.html, /Doe 1999/);
  assert(result.notices?.some(notice => notice.includes("does not load external bibliography, csl, citation-abbreviations")));
  assert(result.notices?.some(notice => notice.includes("missing") && !notice.includes("does not load external")));
});

test("Lab preserves nocite and bibliography controls", async (t) => {
  if (!(await getPandocCapabilities()).available) return t.skip("Pandoc is not installed");
  const source = await fs.readFile(new URL("../../docs/fixtures/pandoc-citations.md", import.meta.url), "utf8");
  const metadata = source.slice(0, source.indexOf("\n---\n") + 5);
  const result = await renderPreview({ variant: "markdown", source: metadata.replace("---\n", '---\nnocite: "@*"\n') + "\nNo citations in prose." });
  assert.match(result.html, /id="ref-doe99"/);
  assert.match(result.html, /id="ref-smith04"/);
  const suppressed = await renderPreview({ variant: "markdown", source: source.replace("---\n", "---\nsuppress-bibliography: true\n") });
  assert.match(suppressed.html, /Doe 1999/);
  assert.doesNotMatch(suppressed.html, /id="refs"/);
});

test("official direct parsers preserve their own syntax and reject Lab overrides", async (t) => {
 const capabilities=await getMarkdownLabCapabilities();
 assert.equal(capabilities.renderers?.['commonmark-js']?.available,true);
 for(const [variant,source,pattern] of [
  ['commonmark-js','# Official\n\n~plain~\n\n<script>literal</script>',/<p>~plain~<\/p>/],
  ['cmark-gfm','~deleted~\n\n- [x] done',/<del>deleted<\/del>/],
  ['php-markdown-extra','*[HTML]: Hypertext\n\nHTML\n\nTerm\n: Definition',/<abbr title="Hypertext">HTML<\/abbr>/],
 ] as const){
  await t.test(variant,async t=>{
   if(!capabilities.renderers?.[variant]?.available){t.skip('Optional runtime is not installed');return;}
   const result=await renderPreview({variant,source});
   assert.match(result.html,pattern);
   assert.doesNotMatch(result.html,/lab-source-block/);
   assert.equal(result.mapping,'proportional');
   if(variant==='commonmark-js')assert.match(result.html,/<script>literal<\/script>/);
   await assert.rejects(renderPreview({variant,source,extensions:{smart:true}}),/Direct renderers/);
   const controller=new AbortController();controller.abort();
   await assert.rejects(renderPreview({variant,source},controller.signal),/cancelled/);
  });
 }
});

test('missing optional official runtimes stay unavailable without silently using Pandoc',async()=>{
 const code="import {getMarkdownLabCapabilities,renderPreview} from './server/pandoc.ts'; const c=await getMarkdownLabCapabilities();let status;try{await renderPreview({variant:'php-markdown-extra',source:'# text'});}catch(e){status=e.status;}console.log(JSON.stringify({c:c.renderers['cmark-gfm'].available,p:c.renderers['php-markdown-extra'].available,status}));";
 const {stdout}=await promisify(execFile)(process.execPath,['--import','tsx','--input-type=module','-e',code],{env:{...process.env,MARKDOWN_PYTHON_PATH:path.join(os.tmpdir(),'missing-audit-python'),PHP_PATH:path.join(os.tmpdir(),'missing-audit-php')},windowsHide:true});
 assert.deepEqual(JSON.parse(stdout),{c:false,p:false,status:503});
});

test("Lab dialect names match the editor variants without a duplicate Pandoc CLI entry", () => {
  for (const variant of variants.filter((item) => item.engine === "pandoc" || item.engine === "notdown"))
    assert.equal(variant.label, dialects.find((dialect) => dialect.id === variant.id)?.label, variant.id);
  assert.equal(variants.some((variant) => String(variant.id) === "pandoc-cli"), false);
});

test("registry and capability lists cover every installed Pandoc Markdown reader", async (t) => {
  const capabilities = await getPandocCapabilities();
  if (!capabilities.available) {
    t.skip("Pandoc is not installed");
    return;
  }
  const run = (args: string[]) =>
    promisify(execFile)(process.env.PANDOC_PATH || "pandoc", args, {
      windowsHide: true,
    });
  const { stdout } = await run(["--list-input-formats"]);
  const installed = stdout
    .trim()
    .split(/\r?\n/)
    .filter((name) =>
      /^(?:markdown(?:_\w+)?|commonmark(?:_x)?|gfm)$/.test(name),
    );
  const registered = variants
    .filter((item) => item.engine === "pandoc")
    .map((item) => item.id);
  for (const id of installed)
    assert.ok(
      registered.includes(id as (typeof registered)[number]),
      `Missing registered reader: ${id}`,
    );
  assert.deepEqual(
    Object.keys(capabilities.extensions).sort(),
    installed.sort(),
  );
  for (const id of registered.filter((name) => installed.includes(name))) {
    const list = (await run([`--list-extensions=${id}`])).stdout
      .trim()
      .split(/\r?\n/);
    const expected = Object.fromEntries(
      list
        .filter((line) => line.slice(1) !== "sourcepos")
        .map((line) => [line.slice(1), line[0] === "+"]),
    );
    assert.deepEqual(
      capabilities.extensions[id],
      expected,
      `${id} extensions differ from Pandoc`,
    );
    assert.equal(
      capabilities.sourcePositions[id],
      list.some((line) => line.slice(1) === "sourcepos"),
    );
  }
});

test("libMultiMarkdown returns external HTML without Lab AST wrappers", async (t) => {
  const capabilities = await getMarkdownLabCapabilities();
  assert.equal(Object.hasOwn(capabilities.renderers ?? {}, "pandoc-cli"), false);
  const source = "# External **renderer**\n";
  const variant = "multimarkdown-cli";
  if (!capabilities.renderers?.[variant]?.available) {
    t.skip("libMultiMarkdown is not installed");
    return;
  }
  const result = await renderPreview({ source, variant });
  assert.equal(result.mapping, "proportional");
  assert.match(result.html, /<h1\b[^>]*>External <strong>renderer<\/strong><\/h1>/);
  assert.doesNotMatch(result.html, /lab-source-block|data-source-line/);
  assert.ok(result.blocks > 0);
  await assert.rejects(
    renderPreview({ source, variant, extensions: { smart: false } }),
    (error: unknown) => error instanceof PreviewError && error.status === 400,
  );
});

test("configured Markdown.pl executable receives source on stdin", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-markdown-pl-test-"));
  const script = path.join(directory, "Markdown.pl");
  try {
    await fs.writeFile(script, [
      "let source = '';",
      "process.stdin.setEncoding('utf8');",
      "process.stdin.on('data', chunk => source += chunk);",
      "process.stdin.on('end', () => process.stdout.write('<h1>' + source.replace(/^#\\s+/, '').trim() + '</h1>\\n'));",
    ].join("\n"));
    const code = [
      "import { getMarkdownLabCapabilities, renderPreview } from './server/pandoc.ts';",
      "const capabilities = await getMarkdownLabCapabilities();",
      "const result = await renderPreview({ source: '# Configured script', variant: 'markdown-pl' });",
      "console.log(JSON.stringify({ available: capabilities.renderers['markdown-pl'].available, html: result.html, mapping: result.mapping }));",
    ].join(" ");
    const { stdout } = await promisify(execFile)(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "-e", code],
      {
        cwd: process.cwd(),
        env: { ...process.env, MARKDOWN_PL_PATH: script, PERL_PATH: process.execPath },
        windowsHide: true,
      },
    );
    assert.deepEqual(JSON.parse(stdout), {
      available: true,
      html: "<h1>Configured script</h1>\n",
      mapping: "proportional",
    });
  } finally {
    await fs.unlink(script);
    await fs.rmdir(directory);
  }
});

test("all additional dialects render with their real extension switches and approximate source mapping", async (t) => {
  const capabilities = await getPandocCapabilities();
  if (!capabilities.available) {
    t.skip("Pandoc is not installed");
    return;
  }
  const source = "intro\n## Heading\n";
  for (const variant of [
    "markdown_mmd",
    "markdown_phpextra",
    "markdown_strict",
    "markdown_github",
  ] as const) {
    if (!capabilities.extensions[variant]) continue;
    const enabled = await renderPreview({
      source,
      variant,
      extensions: { blank_before_header: true },
    });
    assert.equal(enabled.mapping, "approximate", variant);
    assert.doesNotMatch(enabled.html, /<h2/);
    const disabled = await renderPreview({
      source,
      variant,
      extensions: { blank_before_header: false },
    });
    assert.match(disabled.html, /<h2[^>]*>Heading<\/h2>/);
    assert.match(disabled.html, /data-source-line="2"/);
  }
});

test("block plugins preserve malformed payloads, escape labels and reject active URLs", () => {
  assert.equal(
    renderBlockPlugin("notdown-bookmark", '{"title":', ["bookmark"]),
    undefined,
  );
  assert.equal(
    renderBlockPlugin(
      "notdown-bookmark",
      '{"title":"x","url":"javascript:alert(1)"}',
      ["bookmark"],
    ),
    undefined,
  );
  const source =
    '{"title":"<img onerror=alert(1)>","url":"https://example.com","unknown":"keep"}';
  assert.equal(renderBlockPlugin("notdown-bookmark", source, []), undefined);
  assert.equal(renderBlockPlugin("notdown-bookmark", source, ["bookmark"]), undefined);
});

test("scroll mapping interpolates between unequal block heights in both directions", () => {
  const points = [
    { source: 0, preview: 0 },
    { source: 200, preview: 800 },
    { source: 600, preview: 1000 },
  ];
  assert.equal(mapScroll(points, 100, "source"), 400);
  assert.equal(mapScroll(points, 900, "preview"), 400);
  assert.equal(mapScroll(points, 9999, "source"), 1000);
  assert.equal(mapScroll(points, -10, "source"), 0);
  assert.equal(
    mapScroll(
      [
        { source: 0, preview: 0 },
        { source: 0, preview: 100 },
      ],
      0,
      "source",
    ),
    0,
  );
});

test("Notion preview preserves source positions, unknown blocks and optional code plugins", async () => {
  const source =
    '# 标题\n<columns>\n\t<column>\n\t\t左栏\n\t</column>\n\t<column>\n\t\t右栏\n\t</column>\n</columns>\n\n```notdown-bookmark\n{"title":"链接","url":"https://example.com"}\n```\n<future data-x="keep">原文</future>\n';
  const enabled = await renderPreview({
    source,
    variant: "notion-markdown",
    plugins: ["bookmark"],
  });
  assert.match(enabled.html, /note-columns/);
  assert.match(enabled.html, /data-source-line="1"/);
  assert.doesNotMatch(enabled.html, /lab-bookmark/);
  assert.match(enabled.html, /&lt;future/);
  const disabled = await renderPreview({ source, variant: "notion-markdown" });
  assert.doesNotMatch(disabled.html, /lab-bookmark/);
  assert.match(disabled.html, /notdown-bookmark/);
  assert.equal(enabled.mapping, "source");
});

test("preview rejects unknown dialects, extensions, executable plugins and oversize input", async () => {
  for (const input of [
    { source: "text", variant: "../reader.lua" },
    { source: "text", variant: "pandoc-cli" },
    { source: "text", variant: "notion-markdown", extensions: { smart: true } },
    { source: "text", variant: "gfm", plugins: ["../../filter.lua"] },
    { source: "text", variant: "gfm", filters: ["filter.lua"] },
    { source: "text", variant: "markdown-pl", executable: "../../renderer.pl" },
    { source: "a".repeat(128_001), variant: "gfm" },
  ])
    await assert.rejects(
      renderPreview(input),
      (error: unknown) => error instanceof PreviewError && error.status === 400,
    );
});

test("actual Pandoc reads dialect extensions, supplies source positions and renders nested plugins", async (t) => {
  const capabilities = await getPandocCapabilities();
  if (!capabilities.available) {
    t.skip("Pandoc is not installed");
    return;
  }
  assert.match(capabilities.version, /pandoc/i);
  assert.equal(typeof capabilities.extensions.gfm?.pipe_tables, "boolean");
  const source =
    '# Heading\n\n~~removed~~\n\n> ```notdown-bookmark\n> {"title":"Nested card","url":"https://example.com"}\n> ```\n\n````md\n```notdown-bookmark\n{"title":"literal","url":"https://example.com"}\n```\n````\n';
  const input = { source, variant: "gfm", plugins: ["bookmark"] };
  const result = await renderPreview(input);
  assert.equal(result.mapping, "source");
  assert.match(result.html, /data-source-line="3"/);
  assert.match(result.html, /<del>/);
  assert.equal((result.html.match(/class="lab-bookmark"/g) || []).length, 0);
  assert.match(result.html, /literal/);
  const disabled = await renderPreview({
    ...input,
    extensions: { strikeout: false },
  });
  assert.doesNotMatch(disabled.html, /<del>/);
  assert.match(disabled.html.replace(/<[^>]*>/g, ""), /~~removed~~/);
  assert.equal(input.source, source);
  await assert.rejects(
    renderPreview({
      source: "text",
      variant: "gfm",
      extensions: { "--lua-filter=evil": true },
    }),
    PreviewError,
  );
  const canceled = new AbortController();
  canceled.abort();
  await assert.rejects(renderPreview(input, canceled.signal), /cancelled/);
});

test("Pandoc Markdown preview identifies approximate mapping and keeps YAML out of execution options", async (t) => {
  const capabilities = await getPandocCapabilities();
  if (!capabilities.available) {
    t.skip("Pandoc is not installed");
    return;
  }
  const result = await renderPreview({
    variant: "markdown",
    source:
      "---\ntitle: Metadata title\nfilters: [missing.lua]\n---\n\n# Actual heading\n\nTerm\n: Definition\n\nFootnote.[^a]\n\n[^a]: Contents\n",
  });
  assert.equal(result.mapping, "approximate");
  assert.match(result.html, /data-source-line="6"/);
  assert.match(result.html, /<dl>/);
  assert.doesNotMatch(result.html, /Metadata title/);
  assert.ok(result.warnings.length);
});
