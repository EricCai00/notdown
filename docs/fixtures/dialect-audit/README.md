<a id="官方方言测试文档"></a>

# Official Markdown dialect test corpus

**English** · [简体中文](README.zh-CN.md)

Check date: 2026-09-23. The scope is the eleven upstream dialects currently registered for Notdown , excluding custom `notdown` . This directory is not a vault and should not cover `vault/pages/` directly.

This directory already meets "one Markdown test document per dialect". For differences from the old Typora/Obsidian comparison document and Tests manual acceptance page, as well as the method of directly opening the test, see [ test document general entrance ](../README.md). This set is given priority for official syntax coverage; old samples are retained for display and editing interactive acceptance.

| Files | Basis and coverage |
| --- | --- |
| [commonmark.md](commonmark.md) | CommonMark 0.31.2 All 652 standard examples, plus basic combination use cases |
| [gfm.md](gfm.md) | GFM 0.29-gfm All 677 specification examples, extended boundaries; `doc-*` independent verification GitHub website documentation |
| [markdown_strict.md](markdown_strict.md) | John Gruber original document, Markdown.pl behavioral boundary |
| [markdown_phpextra.md](markdown_phpextra.md) | PHP Markdown Extra official grammatical categories and key boundaries |
| [markdown_mmd.md](markdown_mmd.md) | MultiMarkdown 6 Official syntax, citations, tables, preprocessing and metadata keys |
| [markdown.md](markdown.md) | Pandoc 3.11 Markdown, all reader expansion switches, extra boundaries |
| [commonmark_x.md](commonmark_x.md) | Pandoc 3.11 CommonMark X, reader all expansion switches |
| [markdown_github.md](markdown_github.md) | Pandoc 3.11 Deprecated GitHub reader; not the current GFM |
| [typora.md](typora.md) | Typora Markdown Reference, three chart fences, strict mode, preferences that need to be enabled |
| [obsidian.md](obsidian.md) | Obsidian basic/advanced syntax, internal links, blocks ID, embedding, all callout names and aliases |
| [notion-markdown.md](notion-markdown.md) | Notion Enhanced Markdown Official blocks, inline, mentions, all colors and formatting boundaries |

These documents are**Read-only, imported content collection**。`<!-- CASE … -->` The first is the separation of use cases; the real separate use cases are [cases.json](cases.json) of `start/end` The character deviation is extracted and the markings are not sent into case-by-case analysis.JavaScript UTF-16 The characters are not indexedUTF-8 Byte: It must be savedLF、Tab The following is a list of the official documents and the documents of the Ministry of Foreign Affairs of the Republic of Kazakhstan.SHA-256。

**The whole conversion cannot replace case-by-case testing.** The unclosed fence will swallow the subsequent sections, the metadata will only be valid at the beginning of the text, and the same reference definition will interact with each other. The operator will save the entire HTML and the case-by-case HTML at the same time; the single compatibility will be judged using case-by-case results. The full input, configuration, official links and original output of each case will be retained, without the actual output of Notdown being expected to overfill.

<a id="配置与判定"></a>

## Configuration and evaluation

- `default`: Corresponds to `syntax.variant`, `extensions: {}`.
- `documented`: Only enable extensions explicitly listed in this example. There are independent use cases for Typora's inline formulas, highlighting, superscripts and subscripts, alerts, and charts; turning them off by default cannot be regarded as unimplemented.
- `disabled`: The three Pandoc own dialects turn off the corresponding switches one by one and check the reverse boundary.
- `file-path`Using the actual input file and passing it to Notdown `sourcePath`The first is the search for the path.
- GFM ofspec withGitHub Docs Separation: standard use casescmark-gfm；`doc-*` The official GitHub REST rendering results are available. `github/docs` The warehouse as a reference to the context above. The unset external work rules, the non-existent SHA, the front-end map/3D/ mathematical components cannot be proven by REST HTML alone.
- `roundtripExact`It only shows that the unmodified original text can be restored, but does not prove that the content can still maintain semantics after being correctly parsed or edited.
- `domEqual`Is a conservative HTML tree comparison; does not delete ID, class, link targets, header labels, or code blanks. `textEqual` only assists positioning, not pass rate.

The official documentation's syntax categories are included in this set of use cases, but finite input does not exhaust infinite nesting, mistyping, combinations, or external service states. HTML cannot verify LaTeX/BibTeX output, MMD non-HTML metadata side effects, note link interactions, and cloud object permissions. For specific gaps, see [ audit report ](../../audits/DIALECT-HTML-AUDIT-2026-09-23.md). See [ UPSTREAM-LICENSE.md ](UPSTREAM-LICENSE.md) for canonical example licenses.

<a id="复现"></a>

## Reproduction

Execute in the root directory of the warehouse, and use `npm ci` for the first project installation. The test auxiliary tools are saved in the ignored directory `.run/` and will not add application dependencies.

```powershell
node scripts/dialect-audit/fetch-sources.mjs
node scripts/dialect-audit/setup-tools.mjs
Expand-Archive .run/dialect-audit/tools/php.zip .run/dialect-audit/tools/php -Force
Expand-Archive .run/dialect-audit/tools/markdown.zip .run/dialect-audit/tools/markdown -Force
npm --prefix .run/dialect-audit/tools install --package-lock-only --ignore-scripts --no-audit --no-fund
npm --prefix .run/dialect-audit/tools ci --ignore-scripts --no-audit --no-fund
node scripts/dialect-audit/build-corpus.mjs
npx tsx scripts/dialect-audit/run.ts
node scripts/dialect-audit/github-official.mjs
npx tsx scripts/dialect-audit/finalize.ts
```

needPandoc、MultiMarkdown、Perl andPython of`cmarkgfm` Package; recycled `.run/gfm-renderer` ofwheel。Other machines available for selectionPython of`-m pip install --target .run/gfm-renderer cmarkgfm==2025.10.22` Ready to tie. `AUDIT_PYTHON`、`CMARKGFM_PATH`、`PANDOC_PATH`、`MULTIMARKDOWN_PATH`、`MARKDOWN_PL_PATH`、`PERL_PATH`、`PHP_PATH`。PHP ZIP The official testSHA-256；PHP Markdown Extra Fixed2.0.0，CommonMark JS Fixed0.31.2，Markdown.pl Fixed1.0.1。

Re-crawling the document and generating corpus will change the source snapshot; if you only rerun the current corpus, skip `fetch-sources` / `build-corpus`. GitHub service results have content hash cache to avoid repeated quota consumption each time. If the direct connection to the Typora page in the source document capture fails, its official GitHub support site image will be used, and `retrievedFrom` will record the actual source; the online document will still be used as the semantic basis.

Product: `.run/dialect-audit/results/index.html` is a filterable rendering result that is compared with the HTML code. The official implementation is to merge Pandoc into one column; parsers without actual HTML output will not be displayed. Preview uses isolated iframe with unified base styling with scripts/external resources disabled, original HTML code remains unchanged. `*.official.html`, `*.notdown.html`, and `*.pandoc.html` are the entire conversion, and `*.cases.json`/`results.json` are complete evidence case by case. Compact statistics and differential indexing in version management are in `docs/data/dialect-audit-2026-09-23/`. The running log is written as `.run/logs/`.

`obsidian-official.mjs`This is an attempt to isolate the official application, not a necessary step for reproduction; this machine did not obtain official output twice, so the report is clearly marked as unverified. It only uses temporary profile and temporary vault, without enabling or modifying the user vault plug-in.

The original was also exported to the official Typora 0.9.58 menu. `typora.official.html`，Only as a complete comparison; no case-by-case or current version compatibility conclusions are available.→ Exported→ HTML (without styles)”，Save the dayHTML The resulting directory is then copied to the actual saved source file.`typora.application-saved.md`(Old applications automatically standardize the partial blank lines); enter the version, input hash `typora.official.meta.json`。`finalize.ts` The saved input for this purpose generates Notdown HTML again, compared to the official body, without mixing the previously modified source documentation.
