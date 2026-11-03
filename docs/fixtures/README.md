<a id="markdown-测试文档入口"></a>

# Markdown test document guide

**English** · [简体中文](README.zh-CN.md)

2026-09-26 New [The Pandoc quotation test](pandoc-citations.md)：Included in the documentYAML The documentation data, combined references, complex locations, author citations and footnotes.Markdown Lab Choose**Pandoc Markdown** The author's year and list of references can be viewed directly.

2026-09-24 New [Example of R Markdown](rmarkdown.Rmd)Includes: YAML parameters, sequence code blocks, linear R, tables, graphics,`eval=FALSE` And the Chinese results.R Markdown Manual operation after dictionary; see configuration[R Markdown](../features/R-MARKDOWN.md)。It's not down here.2026-09-23 The history of theHTML I'm going to check the photos.

<a id="每个方言一份官方语法测试"></a>

## One document per dialect: official syntax tests

For "check Notdown's support for various language syntaxes against official documents", give priority to [ dialect-audit ](dialect-audit/README.md). The following **11 Markdown test documents** have been generated, excluding the custom Notdown dialect:

| Dialect | Markdown Documentation | Number of independent use cases |
| --- | --- | ---: |
| CommonMark | [commonmark.md](dialect-audit/commonmark.md) | 686 |
| GFM (with separately tagged GitHub Docs use case) | [gfm.md](dialect-audit/gfm.md) | 750 |
| Original Markdown | [markdown_strict.md](dialect-audit/markdown_strict.md) | 34 |
| PHP Markdown Extra | [markdown_phpextra.md](dialect-audit/markdown_phpextra.md) | 62 |
| MultiMarkdown | [markdown_mmd.md](dialect-audit/markdown_mmd.md) | 103 |
| Pandoc Markdown | [markdown.md](dialect-audit/markdown.md) | 121 |
| Pandoc CommonMark X | [commonmark_x.md](dialect-audit/commonmark_x.md) | 77 |
| Pandoc old GitHub Markdown | [markdown_github.md](dialect-audit/markdown_github.md) | 121 |
| Typora | [typora.md](dialect-audit/typora.md) | 70 |
| Obsidian | [obsidian.md](dialect-audit/obsidian.md) | 103 |
| Notion Enhanced Markdown | [notion-markdown.md](dialect-audit/notion-markdown.md) | 52 |

Total 2, 179 independent inputs. The official sources, input ranges, configurations, and specifications for each example are expected to be in [ cases.json ](dialect-audit/cases.json); these examples are not omitted just because Notdown is not yet recognized. The number of use cases does not equal the number of supported ones, nor does it mean that all syntax combinations have been exhausted.

<a id="与原有样本的区别"></a>

## Differences from the original samples

| sample | Evidence and purpose | Best suited for | limitations |
| --- | --- | --- | --- |
| `dialect-audit/*.md` | Official documentation, canonical examples, and dialect boundaries | Check whether grammar is missing, compare parsing and output case by case; the main materials for this requirement | Boundary use cases may affect each other, so it is not suitable to judge compatibility by just looking at the entire rendering. |
| [typora-comparison.md](typora-comparison.md)、[obsidian-comparison.md](obsidian-comparison.md) | Manual control samples previously organized according to user lists, with operating instructions, record columns and resources | Open the copy in the original app and Notdown to view, link, and edit saves visually | The coverage is narrower than this official corpus; Obsidian mainly focuses on the eight expansions in the original list |
| [manual-test-pages.ts ](manual-test-pages.ts) generated Tests acceptance page | Dialect configuration, object directory, and extension switches for the current application | Test the editing, dragging, undoing, view switching and saving and reopening of the Notion interface | The default dialect page will refer to the current parsing results to select identifiable objects and cannot independently prove the integrity of the upstream grammar. |

**Selective recommendations: Interactions with new official content as the main test set covering the grammar, retaining the old sample to be accepted.** The instructions for operation and resource preparation in the old sample are still useful, without the need to remove or cover them with new documents. See the specific composition of the Tests page.[Manual receipt](../verification/MANUAL-ACCEPTANCE-PAGES.md)。

<a id="如何打开测试"></a>

## Opening the tests

1. Use a copy; the original contains Tab for testing, trailing spaces, and specific newlines, and automatic formatting may alter the test input.
2. In the Notdown temporary vault, paste the text into the source code view, select the dialect corresponding to the file name, and use the default extension configuration first. Do not interpret all files in the Notion or Notdown dialect.
3. For general grammar, you can browse the entire article first. When checking accurately, copy the example separately according to the `CASE` number and input it into the temporary page; when it is necessary to maintain precise boundaries, `cases.json` and `start/end` shall prevail. Separating comments and documentation are not use case inputs.
4. **Unclosed enclosures, unclosed HTML/ notes, text prefix data and namesake references must be tested separately.** A normal Markdown file cannot provide a separate parsing environment for these use cases. The entire subsequent section is shown as code, not necessarily a subsequent grammar failure.
5. Use cases that need to enable extensions are set individually according to `extensions` in the list; Typora also needs to record the original application preferences. Pictures, imported files and note targets use supporting resources, and resource positioning failures are recorded separately.
6. Record "whether the content and level are correct" and "whether the editing and saving are correct". The appearance of Notdown's class Notion is different from the original application font and spacing, and should be distinguished from grammatical issues.

This directory provides files and generators and does not automatically install pages to the user vault. `rendered/` is the previous HTML control product, not another set of Markdown test sources.
