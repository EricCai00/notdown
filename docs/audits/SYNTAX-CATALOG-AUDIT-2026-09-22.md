<a id="block-explorer-语法说明与对应关系核对"></a>

# Block Explorer syntax descriptions and mappings

**English** · [简体中文](SYNTAX-CATALOG-AUDIT-2026-09-22.zh-CN.md)

2026-09-22. Sources are the desktop `markdown & notion.xlsx`, with **70 markdown items and 84 extended items**, and the project's Pandoc 3.11 manual extension inventory of **89 items (77 for Markdown and 12 for other formats)**. This change adds 243 searchable descriptions; the original Excel file is unchanged.

<a id="已写入-explorer"></a>

## Included in Explorer

The detail pages of Content objects, Markdown variants and Extensions all have **Syntax guide**. Each entry contains the original syntax, Excel sheet/ line range or Pandoc extension, dialect, associated extension/content object, official source, and Correction / Implementation boundary when applicable. You can search for locations like `extended!A53:E53`. The original error example is retained, the correction is listed separately, and the table evidence is not silently rewritten.

Normal block syntax does not fake plugins; GitHub platform functionality and R Markdown runtime non-fake extensions have been implemented. Notion `<database>` points to Unsupported; `<empty-block/>` does not correspond to Pandoc `empty_paragraphs`. Pandoc's `sourcepos`, `gutenberg`, and relative path options specify their behavior and are not treated as new insertable blocks.

Completed the description association between Pandoc syntax and objects, including inline/block mathematics, inline code attributes, original TeX, table and title modification, etc. The **description association does not imply that the runtime adapter or insert command has fixed** , the latter's lack of which is described below.

<a id="表格中应更正或限定的关系"></a>

## Relationships in the table requiring correction or qualification

| source location | Check conclusion |
| --- | --- |
| `markdown!D20` | Empty lines are delimiting rules, not independent leaf blocks in CommonMark AST. Notdown's editable empty paragraph is an editor behavior. |
| `markdown!C31:G31` | The list syntax support relationship is basically correct, but the display semantics of the first item `3.` are different: Original ignores the starting number, and CommonMark/GFM retains it. The following `1.` and `8.` do not determine the display sequence. |
| `markdown!C54:G54` | Shortcut references are available in Markdown.pl, and this remark is reasonable; it cannot be judged that the original implementation does not support it just because there is no single column on the syntax page. |
| `markdown!C64:G64` | "Not supported" refers to GFM-specific filtering rules, not Original/CommonMark which does not recognize those HTML tags. Filtering involves both block and inline HTML. |
| `extended!A2:E2` | Footnotes contain inline references and block definitions, and should not be marked with just block. "Markdown Guide" is a tutorial website, not a dialect. |
| `extended!A3:E3` | MMD accepts this simple key-value example and optional `---` , but does not support the full YAML . Should correspond to `mmd_title_block` and cannot be equivalent to complete `yaml_metadata_block`. |
| `extended!A7:E7` | Correction to previous audit: Notion Enhanced Markdown clearly defines `:emoji_name:` custom expression, its colon syntax cannot be denied. The custom name is not equivalent to the general shortcode dictionary and does not belong to Notion mentions; the local computer has not yet been connected to the Notion workspace expression analysis. |
| `extended!A23:D23` | The chapter for PHP Extra is named Inline HTML , but the `<div>` examples should be associated with HTML block . |
| `extended!D36:D37` | In both examples, the reference key is `Doe:2006`, but the definition key is `Doe2006`. Only after unifying the key can the corresponding bibliography be parsed. |
| `extended!A62:D70` | The customization of the focal point is originalHTML；Team/Issue/PR/JIRA/SHA Automated links areGitHub The platform functions, notGFM Spec nakedURL Automated links.`@github/support` It's a team mention, not an individual user. JIRA also requires the warehouse to customize autolink configuration. |
| `extended!A72:D73` | The execution semantics of R Markdown/knitr do not belong to ordinary code fences/code segments; syntax preservation does not count as supporting R operations. |
| `extended!A77:D77` | `text {color="blue"}`Is a Notion block color attribute; inline text color should use `<span color="blue">…</span>`. |
| `extended!A78:E78` | The interactive semantics of collapsing titles belong to Notion. PHP Extra can receive custom properties, but will not produce toggle heading as a result. |
| `extended!D80:D82` | The official nesting example for Notion uses tab . The single-space indentation in the table can be used as a local loose input and cannot be regarded as an official indentation specification. |

Some contents that are easy to be misjudged but written correctly in the table are also retained: the inline link attribute of MMD v6 and `{=html}/{=latex}` raw source have official basis; MMD 6.5's `{{TOC:2}}` only takes the second level, and `{{TOC:2-3}}` takes the level range; `markdown!G62`'s `mailto:` belongs to GFM extended protocol autolink.

<a id="已复现的实现偏差与缺漏"></a>

## Reproduced implementation deviations and omissions

These are the existing issues identified by this audit. This modification of the description and associated data does not extend Markdown codec or modify the text storage.

| Project | Minimal reproduction and actual result | judge |
| --- | --- | --- |
| Math capability mapping | Turn off `tex_math_dollars` and turn on `tex_math_single_backslash`, `tex_math_gfm` or `tex_math_double_backslash`: the corresponding inline example generates `inline_math`, but `getContentCapabilities("inline.inline_math", config).available` is false. Correspondence issues also occur with single backslash/GFM block formulas. | **Mapping missing**. The double backslash block formula already has an adapter and cannot be judged missing together. |
| Shorthand superscript/subscript capability mapping | Turning off the paired `subscript/superscript` and turning on the single `short_subsuperscripts`: `x^2` produces superscript, but the content object capability appears unavailable. | **Mapping missing**. The independent abbreviation entry for superscript and subscript is not registered. |
| Pandoc `mark` Capability mapping | Close the product `highlight` and open `mark`: `==x==` produces highlight, but the object only registers the highlight/CriticMarkup entry. | **Mapping missing**. The syntax is not unimplemented. |
| Math insertion command | `commandEnabled(config, "equation")`Only `tex_math_dollars/display_math` is checked. | **Incomplete interaction gating**. The existence of other mathematical parsing entries does not mean that the menu can be created according to this encoding. |
| Custom HTML anchors | `renderRawHtml('<a name="custom-anchor-point"></a>')` I got it. `<a></a>`The ID was also cleared. | **Output semantics are not implemented**. The target anchor point in row 62 of the table is lost, but the source code is still saved. Cannot be used as a usable custom anchor. |
| GFM tagfilter | `renderRawHtml('<textarea>text</textarea>')`Read-only textarea is reserved; other tags may be discarded. GFM requires literal escaping of the specified label. | **Compatibility differences**. The local universal cleanup strategy is not an exact implementation of GFM tagfilter. |
| `literate_haskell` | `markdown+literate_haskell`Below, `\begin{code}…\end{code}` is Raw TeX locally, and `= A heading` is an ordinary paragraph; running Pandoc and 3.11 will get Haskell CodeBlock and first-level Heading respectively. | **Implementation is incomplete**. Bird-track has been resolved, and we cannot claim that the entire extension is fully compatible based on this. |
| `sourcepos` | Only block-level line ranges are recorded locally, and there is no intra-line character position mapping like Pandoc. | **partially implemented**, the existing description is qualified. |
| `markdown_in_html_blocks`, complex tables, TeX | The local implementation mainly implements the Div path; the table uses a restricted cell model; the formula depends on KaTeX, and the original TeX is not executed. | **Implementation boundaries**, full Pandoc compatibility cannot be inferred from switches of the same name. |

There are also runtimes that are clearly not implemented: GitHub team notification, Issue/PR/JIRA/SHA short reference resolution; R/knitr code execution; Notion database engine and Notion cloud synchronization; cross-device synchronization. Database labels are currently only reserved for Unsupported . The synchronization block has implemented local snapshot, refresh, and CAS publishing, so it cannot be generally said that the synchronization block has not been implemented at all.

**Not being enabled by default does not mean it is not implemented.** currentTypora The first is the linear mathematics, the upper, lower, high brightness, thealerts、diagrams The following is a list of the most commonly used methods of calculating the value of a currency.GFM The first thing that I'm going to do is set up math, footnotes,emoji、alerts I'm going to wait.GitHub Docs Functional options are retained.PHP Extra The code properties and`startnum` Currently enabled by default; history `PRODUCT-SYNTAX.md` The old table still says "need to be opened", this time the current registry and Explorer status should prevail.

<a id="验证方法与范围"></a>

## Validation method and scope

`node --import tsx scripts/audit-catalog-syntax.ts`Run the default configuration and related switch configurations on the source code with the registered target dialect in the description, and call `doc.check()` to compare round-trip with the original text. The latest is the **1, 381 group configuration, no exceptions, no unedited source code round-trip differences to**; the complete machine output is ignored in `test-results/catalog-syntax-audit.json`. R Markdown has no local dialect and is not included in these configuration numbers.

This audit only proves that the structure is valid and the unedited original text is preserved, it does not automatically prove that the display, actual file resources, all edit paths, or complete semantics are correct; the above issues arise from additional semantic checks. Empty chart fences, placeholder URL, and examples with missing bibliography cannot be used to claim external functionality.

The directory test checks the coverage, effective association, error sample retention, and in-browser linking/retrieval/narrow screen display of all workbook entries and 89 manual identifiers; the browser uses an independent temporary vault and Chrome and does not connect to the user's browser.

The results of this verification:

- `npm run build`: Passed (executed by final `npm run test:e2e -- tests/e2e/block-catalog.spec.ts tests/e2e/catalog-syntax.spec.ts`).
- Chrome browser test in the above directory: 8/8 passed, desktop and 390px narrow screen screenshots have been checked.
- Catalog data and related special single test: 8/8 passed.
- last time `npm test`: In the 424 item, 422 passes, 1 fails, and 1 skips. failed as `tests/unit/notdown-union.test.ts` The Notion color is mixed with the Markdown markup and reopened after editing: written `~<span …>sub</span>~` subscript was not restored. This failure is in the codec/ serialization path that has not been changed this time, and is not a failure in the directory data coverage test; it has not been repaired this time. If there are other editor changes in the workspace at the same time, the result is based on this round of logs as a time snapshot, and the earlier invalid dialect assertion failure is not regarded as the current gap.

Logs that can be reviewed: `test-results/catalog-unit-final.log`, `test-results/catalog-e2e-final.log`. These are local validation artifacts and are not written to the user vault.

<a id="官方核对来源"></a>

## Official verification sources

- [CommonMark 0.31.2 ](https://spec.commonmark.org/0.31.2/) and [ GFM Spec ](https://github.github.com/gfm/): basic syntax, automatic linking, HTML filtering.
- [PHP Markdown Extra ](https://michelf.ca/projects/php-markdown/extra/): HTML, attributes, fences, definition lists, abbreviations.
- [MultiMarkdown 6 syntax ](https://fletcher.github.io/MultiMarkdown-6/syntax/): Metadata, citations, raw source, link attributes and table of contents.
- [Typora reference ](https://support.typora.io/Markdown-Reference/) and [ Strict Mode ](https://support.typora.io/Strict-Mode/): Product options and relaxed input.
- [Notion Enhanced Markdown ](https://developers.notion.com/guides/data-apis/enhanced-markdown): Color, folding title, expansion tag.
- [GitHub autolinked references ](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/autolinked-references-and-urls): Reference function in the warehouse context.
- [R Markdown code chunks ](https://rmarkdown.rstudio.com/lesson-3.html): Code execution and output.
- [Pandoc manual ](https://pandoc.org/MANUAL.html#pandocs-markdown) and [ Literate Haskell ](https://pandoc.org/MANUAL.html#extension-literate_haskell): extended semantics; the native version is 3.11.
