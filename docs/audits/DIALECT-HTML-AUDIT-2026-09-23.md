<a id="上游-markdown-方言语料与-html-对照审计"></a>

# Upstream Markdown dialect corpus and HTML comparison audit

**English** · [简体中文](DIALECT-HTML-AUDIT-2026-09-23.zh-CN.md)

Date: 2026-09-23. Scope: currently registered 11 upstream dialects, excluding custom `notdown` . This time, new test documents, reproducible runners and result records have been added, without modifying the parser, editor or user vault.

**Result: 11 Markdown documents were generated, including 2 and 179 independent inputs; among them, 1 and 954 obtained case-by-case official HTML comparisons.** There are also document extension opening, closing and file path context configuration. It was found that there are real parsing/export gaps, and there are also differences caused by security policies, page packaging, and product context. All HTML differences cannot be interpreted as unsupported syntax.

<a id="交付物与阅读方法"></a>

## Deliverables and how to read them

- [11 document entry, coverage and replication command ](../fixtures/dialect-audit/README.md). For every `CASE` there is a stable ID.
- [Corpus list and source hash ](../fixtures/dialect-audit/cases.json): original text offset, line number, document link, switch, specification expectation.
- [Summary snapshot ](../data/dialect-audit-2026-09-23/summary.json) and [ case-by-case difference index ](../data/dialect-audit-2026-09-23/differences.json) . Entries missing the official baseline for `comparison: null` are not fail or pass.
- Native `.run/dialect-audit/results/index.html`: Searchable by dialect, configuration, difference type, use case ID, showing both HTML rendering results and code. Officially, columns are merged when Pandoc is used, and the parser is hidden when output is missing. Rendering takes place within an isolated iframe with scripts and external resources disabled; the original HTML code remains intact.
- In the same directory, `results.json` / `*.cases.json` saves the complete output of Markdown, Notdown, official and Pandoc case by case; `*.html` saves the entire output. The original document cache and source manifest are located in `.run/dialect-audit/sources/`, and the logs are located in `.run/logs/`.

**Use independent use cases as evidence of compatibility.** Documents assembled into one piece are suitable for browsing and importing, but unclosed fences, link definitions with the same name, and metadata that are only valid at the beginning of the text will affect each other. Runner button `cases.json` The original character offset is taken as a fragment, and delimited comments are not sent to case-by-case parsing. The test verifies source file and fragment hashes and does not overwrite Tab , code fences, or trailing spaces.

<a id="官方依据与参照实现"></a>

## Official sources and reference implementations

| Dialect | Official documentation | Authoritative HTML source for this audit |
| --- | --- | --- |
| CommonMark | [0.31.2 spec](https://spec.commonmark.org/0.31.2/) | Official commonmark.js 0.31.2; all 652 published examples and their expectations |
| GFM | [0.29-gfm spec ](https://github.github.com/gfm/); [ GitHub writing Docs](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting) | 677 spec examples are implemented using official cmark-gfm C and are called via cmarkgfm 2025.10.22 Python binding; 28 `doc-*` use cases use [ official REST Markdown API](https://docs.github.com/en/rest/markdown/markdown?apiVersion=2022-11-28) |
| markdown_strict | [John Gruber Syntax](https://daringfireball.net/projects/markdown/syntax) | Original author Markdown.pl 1.0.1 / Perl; the old implementation of quirks is judged separately from the document rules. |
| markdown_phpextra | [PHP Markdown Extra](https://michelf.ca/projects/php-markdown/extra/) | Official michelf/php-markdown 2.0.0 Extra / PHP 8.4.26 |
| markdown_mmd | [MultiMarkdown 6 Syntax](https://fletcher.github.io/MultiMarkdown-6/syntax/) | Official MultiMarkdown 6.7.0; uses actual input files and local include files |
| markdown / commonmark_x / markdown_github | [Pandoc manual ](https://pandoc.org/MANUAL.html), fixed [ 3.11 original text](https://github.com/jgm/pandoc/blob/3.11/MANUAL.txt) | Pandoc 3.11 each has the same name as reader; `markdown_github` has been deprecated and cannot be equivalent to the current GFM |
| typora | [Markdown Reference ](https://support.typora.io/Markdown-Reference/), [ chart ](https://support.typora.io/Draw-Diagrams-With-Markdown/), [ Strict Mode](https://support.typora.io/Strict-Mode/) | Official Typora 0.9.58 Native unstyled HTML exports the entire article; old version, not used as the case-by-case authoritative baseline of the current document |
| obsidian | Official [ basic syntax ](https://help.obsidian.md/syntax), [ advanced syntax ](https://help.obsidian.md/advanced-syntax), [ internal link ](https://help.obsidian.md/links), [ embedded ](https://help.obsidian.md/embeds), [ callouts](https://help.obsidian.md/callouts) | installed1.13.7 Tried temporaryprofile/vault + officialMarkdownRenderer，twice90 No seconds returnedHTML，Mark as unavailable |
| notion-markdown | [Enhanced Markdown ](https://developers.notion.com/guides/data-apis/enhanced-markdown), [ Markdown API use](https://developers.notion.com/guides/data-apis/working-with-markdown-content) | The official public interface is page Markdown read and write, there is no equivalent Markdown → HTML interface; this time we only check the Notdown output according to the official document |

Other usesPandoc The support of the8 areader；It doesn't.typora、obsidian、notion-markdown The same namereader，No otherreader I'm not going to say anything about it.HTML The official implementation of differences in attributes and dialects is prioritized.Pandoc Pandoc The language itself isPandoc For authority.

GitHub API uses `mode: gfm` and public `github/docs` context, and only sends synthetic corpus; 28 use cases and the entire request return 200. Warehouse mention, issue, SHA and external work order links depend on the context; the math/chart component placeholder returned by REST HTML is not equal to GitHub and the front end has completed rendering. The five extensions of GFM spec are retained separately from the footnotes, warnings, mathematics, charts, folds, colors, references, etc. of GitHub Docs.

The current implementation of CommonMark is all the same as the expected normalization of 652 item spec; DOM is expected to have the same cmark-gfm and GFM released 677 items. **30 items are different**, see summary `specChecks`. Includes code language wrapping, tagfilter, nested emphasis, numeric entities and partial link/HTML boundaries. The report records simultaneously `officialVsSpec`, do not mix current implementations with published specifications into one source. cmark-gfm enables raw HTML and its default extensions; the cleanup strategy is determined separately.

Online documentation is a semantic basis. When the direct connection of cached Typora fails, its official support station GitHub image is used; the image and online update time are different, the actual `retrievedFrom` has been recorded, and is not claimed to be the same byte snapshot. Obsidian documentation cache comes from its official help repository. The complete source URL, time, SHA-256 are in the corpus list.

<a id="测试范围与统计"></a>

## Test scope and statistics

Notdown calls the actual own path `parseNative(source, {version: 1, variant, extensions}) → renderNotionMarkdown(source, [], {document})`, check separately `serializeNative`. There is no external conversion using Markdown Lab as Notdown output.**The measurement is static.HTML Export, not real timeProseMirror The final visionDOM Or click the action.**

`default`No additional switches are enabled; `documented` opens the optional extensions required by the document one by one; the three Pandoc dialects also run `disabled` one by one, and use `file-path` to test the path context of the real file. When constructing the corpus, perform a coverage check on all outputs of Pandoc and `--list-extensions`, and do not ignore subsequent new switches and pass them silently.

| Dialect | Independent input | Official comparison available by default | Identical DOM | Text is the same | Document extension / close / path configuration |
| --- | ---: | ---: | ---: | ---: | --- |
| commonmark | 686 | 686 | 255 | 684 | 0 / 0 / 0 |
| gfm | 750 | 750 | 257 | 723 | 11 / 0 / 0 |
| markdown_strict | 34 | 34 | 8 | 28 | 0 / 0 / 0 |
| markdown_phpextra | 62 | 62 | 12 | 54 | 0 / 0 / 0 |
| markdown_mmd | 103 | 103 | 11 | 43 | 0 / 0 / 0 |
| markdown | 121 | 121 | 34 | 99 | 74 / 74 / 1 |
| commonmark_x | 77 | 77 | 23 | 61 | 30 / 30 / 1 |
| markdown_github | 121 | 121 | 47 | 107 | 74 / 74 / 1 |
| typora | 70 | 0 | 0 | 0 | 12 / 0 / 0 |
| obsidian | 103 | 0 | 0 | 0 | 0 / 0 / 0 |
| notion-markdown | 52 | 0 | 0 | 0 | 0 / 0 / 0 |

DOM comparison only eliminates attribute order, equivalent entity coding and typesetting blanks, leaving ID/class, URL, table headers, list packaging, tag levels and pre/code blanks. `textEqual` is a text diagnosis after folding blanks. It ignores link targets, structures and partial label meanings, and cannot be used as a pass rate. DOM is the same and does not prove that interaction is available.

There are no Notdown exceptions in all input/configuration, and the unedited serialization maintains the original text; this only proves that the original text of **can be restored to**, but does not prove successful parsing, nor does it prove the correctness after structured editing. Original evidence is retained on a case-by-case basis. The hash of the actually running engine file is consistent; the workspace with the user's existing uncommitted modifications is executed. `environment.json` records the status of HEAD and dirty and the engine hash. HEAD cannot be used to represent this code alone.

<a id="已确认的差异"></a>

## Confirmed differences

The following ID can be directly pasted into the HTML comparison page for search. It is recommended to address missing content/targets and structural errors first, before handling platform packaging differences.

| priority | Dialect/Use Case | The actual difference between the official and Notdown |
| --- | --- | --- |
| High | MMD `mmd-image-figure`；Pandoc `pandoc-implicit_figures` | Part of the independent images are exported `<img>` Lost `src`，caption ofMarkdown The wording of the text is still the same. |
| High | `list-nesting`（Original / PHP Extra / MMD） | Officially generate nested lists; Notdown merges `outer - middle 1. inner` into paragraphs, losing the list level |
| High | GFM `doc-collapse` | Official `<details>` wraps the title and text; Notdown closes details early, and subsequent content runs outside the folding container. |
| High | PHP Extra `extra-fence-length` | Extra requires the number of ending fences to match; the official reserves longer fences as code content, Notdown ends early |
| Medium | GFM `gfm-example-491` / `gfm-example-493` | `~there~`Official strikethrough, Notdown is a literal value; text surrounded by three waves is officially a literal value, Notdown is mistakenly used as a strikethrough locally |
| Medium | GFM `autolink-boundary` | `abcwww.example.com` Automatically linked by error; with `&amp;` Bare URL appears href entity handling/boundary is different |
| Medium | GFM `table-align` etc. | Officially uses `<thead>/<th>`; Notdown is replaced by `<td>` with a bold background style. The header semantics and accessibility are different. |
| Medium | PHP Extra definition list,`extra-abbreviation` | Multiple consecutive terms did not form multiple dt; the empty abbreviation definition did not generate abbr, and the original definition text was displayed instead. |
| Medium | PHP Extra `markdown="block"` Table container use case | The official Markdown sublist remains within the cell; the Notdown list is detached from the table container |
| Medium | Pandoc `pandoc-fancy_lists` | Different lists such as a), iv., A., and automatic numbering are merged, and the starting value and numbering type are lost. |
| Medium | commonmark_x attribute, implicit title link | Properties are left visible `{...}` original text; implicit header references that are enabled by default are partially unresolved; task list default boundaries are also different from reader |
| Medium | GFM `doc-math-dollar`, documented configuration | `$`When the formula wrapped in backticks is enabled at the same time as ordinary dollar math, the backticks enter the content of KaTeX, and there is a syntax priority issue. |
| Medium | MMD abbreviation, citation, table reference | Abbreviation first expansion and automatic matching are different; citations use key label/definition list instead of official numbered references; table citations are unresolved and ID normalization is different |
| Medium | MMD metadata / transclusion | Base Header Level does not take effect; unknown variables display `Undefined: missing`, and the official variables are reserved; the official reads the include file, and the static export of Notdown only outputs the include name placeholder, and does not expand the code fence/wildcard include |
| Boundaries | CommonMark `cm-606` / `cm-632` | Two backslash/malformed HTML boundaries are wrapped by Notdown as opaque pre , unlike official normal text paragraphs |
| Boundaries | Original `reference-links`, Level 6 super title | The old Markdown.pl to shortcut reference/title boundary is different from modern parsers. The compatibility target should be determined first and the old implementation of quirks cannot be blindly copied. |

Some differences cannot be directly listed as parsing defects:

- Notdown's `md-` ID namespace, editor class/data attributes, and p packaging in the list will produce many DOM differences; the tag structure and link target still need to be checked separately.
- GFM tagfilter makes the disabled label visible text; Notdown sanitizer deletes script/style and other contents. This is a security/export policy difference and should not be fixed by resuming script execution.
- Pandoc non-HTML raw_tex/raw_attribute are omitted from HTML output; Notdown is preserved with opaque blocks. Metadata may also appear as dl/pre, which is an output policy difference.
- The static footnote export uses the original label and definition sequence, and lacks official numerical numbers and back links. This is not the same as the Live Editor footnote functionality.
- GitHub Mermaid、GeoJSON、STL officialREST The output is the structure needed for subsequent rendering;Notdown Static output retains source code. mathematicalKaTeX HTML withGitHub math-renderer Packaging differently is not a failure in itself.
- GitHub color preview, mention, work orders and submission links belong to the website environment capabilities. REST headers also don't automatically provide anchor injection for the entire site, so there's no reason to fail a header anchor based on REST alone.

<a id="无逐例官方-html-的三个方言"></a>

## Three dialects without official HTML for individual examples

These have still produced the full set of documentation, case by case for Notdown and the entirety of HTML; **has not faked official baselines or pass rates for**.

- **Typora**: 70 input covers official Markdown Reference, YAML, footnotes, TOC, mathematics, superscript and subscript, highlighting, emoji, alarm, HTML media, three types of charts and strict mode boundaries; 12 items have document switch configuration. Inline formulas/highlighting/superscripts and subscripts that are turned off by default cannot be judged as not supported. See the end of this section for the native export verification status of the application.
- **Obsidian**: 103 inputs cover attributes, internal/block links, various embeds, table escapes, comments, formulas, footnotes, tasks and all official callout types/aliases. Document level discovery `obs-block-links` The block ID still appears in the visible body,`obs-embed-note` The static output is `!` Add a normal page link, but the note has not been expanded.`obs-comments` Inline comment output is visible with an edit icon. fold callout can generate the details/open structure, but there is no official DOM or interactive acceptance and cannot be marked as compatible.
- **Notion Enhanced Markdown**: 52 input contains official block type, Tab level, XML table, column, sync block, all colors, five types of objects mention, date, citation and negative bounds. The current official documentation clearly lists `<mention-agent>`, Notdown exports escape literals, which is a gap that can be directly confirmed from the documentation; other mention and various structures have been output by HTML, but the object permissions/synchronization content cannot be verified by static conversion. The official complete example itself contains pipe table, and the tabular format chapter describes XML table. Both are retained, and the documents will not be deleted automatically if they are inconsistent.`<tabs>`、`<web-bookmark>` The negative use case remains opaque and does not enable the notdown custom protocol out of bounds.

If Notion API is exported by creating a page and then exporting HTML, cloud writing and additional export paths are required, and it is not equivalent to making the official parser public. This time, no cloud pages have been modified, and the third-party Notion rendering library has not been called official.

Typora supplementary test: from `C:\Program Files\Typora\Typora.exe` Start, file version confirmation **0.9.58**, generated through "File → Export → HTML (without styles)" `.run/dialect-audit/results/typora.official.html`. The application automatically fills in spaces in empty lines of code blocks; after the hash check is found, the original test file has been restored and retained. `typora.application-saved.md`, and regenerate this actual saved input `typora.application-saved.notdown.html`, after extracting official body and comparing, DOM and text are different. Existing preferences are not modified but not itemized. This old version cannot verify the new features of the current document, and the fence boundaries in the corpus affect subsequent content, so only the entire evidence is retained and the case-by-case pass rate is not derived from it. Versions, input/output hashes, and comparison status are logged in the rollup `info.typoraWhole`。

<a id="excel-两个-sheet-的核对"></a>

## Checking the two Excel sheets

read `C:\Users\Eric\Desktop\markdown & notion.xlsx` of `markdown`(line 71) with `extended`(89 line), the original workbook is not overwritten. Basic classifications are mostly available, but worksheets are not a substitute for executable examples and official details. The following items are confirmed to require revision or supplementary conditions, and we do not claim that they have all been passed cell by cell.

| Sheet/cell | Questions and suggestions |
| --- | --- |
| markdown C54 | shortcut `[text]` The INCLUDED IN PERL CODE code is not valid for this Markdown.pl 1.0.1; the collapsed in the document is not valid for this code. `[text][]` Separate |
| markdown F64 | "NOT SUPPORTED" is easily understood to mean CommonMark does not support these raw HTML tags; it should be written GFM tagfilter restrictions do not apply, not raw HTML not supported |
| markdown C31/F31/G31 | Although the numbered list is written in the same way, the starting semantics are different: Original starts from 1, and CommonMark/GFM retains starting values such as 3. |
| markdown D20 | Empty lines are not generatedHTML ofleaf block；It assumes the role of block separation |
| extended D36/D37 | citation uses `#Doe:2006`, but the definition is written as `#Doe2006`. The identifiers do not match and should be unified. |
| extended E3 | MMD metadata is not equal to full YAML front matter; allowing boundary characters does not mean supporting full YAML types/structures |
| extended Typora lines 5, 8 – 11, 13 – 15 | Add relevant versions, preference switches or chart rendering conditions to avoid expressing unconditional default support. |
| extended D13–D15 | Only empty fences can only illustrate the syntax carrier and cannot verify diagram parser; legal chart text should be added |
| extended E7 | Notion `:emoji_name:` includes workspace custom emoji and cannot be generally equated with the public `:smile:` alias table |
| extended D40 | The purpose of BibTeX and the required metadata/LaTeX output context need to be noted, the HTML results do not prove the BibTeX workflow |
| extended E78 | PHP Extra supports certain attribute writing methods, which is not equivalent to supporting the block semantics of Notion toggle. |
| extended D80/D82/D88 | The example uses a white space hierarchy; Notion official Enhanced Markdown requires Tab and should be replaced with real Tab |
| extended lines 62 – 71 | It should be clear that it is an extension of the GitHub Docs/ website processing layer and cannot all be classified into GFM spec; work orders, SHA, etc. also have warehouse context conditions. |
| extended rows 72/73 | R Markdown is outside the scope of the currently registered 11 upstream presets; no additional dialect has been created assuming that it has been implemented |

<a id="验证与剩余边界"></a>

## Validation and remaining limitations

- `npm test`: 497 item, 496 passed, 1 skipped, 0 failed. Two new checks have been added: normalization does not erase semantic differences, and corpus hash/all presets/extended switch overrides.
- `npm run build`:Success; retain existing Vite large chunk warning.
- HTML control page with independent headless Chrome verification search, dialect/configuration filtering, no official baseline number and paging, no page script errors; screenshots are saved in `.run/dialect-audit/results/viewer.png`.
- The editor interaction has not been changed this time, so the editing interaction e2e has not been run; user Chrome or user vault has not been connected for testing.

This set covers the official grammar categories, all published examples of the two sets of specifications, and all extended switches of Pandoc and current reader, but the limited corpus cannot exhaust all nesting, incorrect input, combinations, and platform status. Official case-by-case rendering, media/note/cloud object interaction, MMD/Pandoc non-HTML targets and post-edit semantic verification of the three product dialects need to be completed to further claim complete compatibility. This time, we will keep the difference baseline that can be reviewed, and the problems in the table above have not yet been fixed.
