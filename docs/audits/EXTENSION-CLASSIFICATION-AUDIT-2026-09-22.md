<a id="扩展分类复核"></a>

# Extension classification review

**English** · [简体中文](EXTENSION-CLASSIFICATION-AUDIT-2026-09-22.zh-CN.md)

2026-09-23 subsequent constraints: Users explicitly accept only existing dialects and official Notion Markdown syntax. The classification and renaming of this article by functional source does not mean that the coding is recognized. Supplementary verification found that there is another official meeting-notes label basis, and Bookmark/Embed/Link preview/Breadcrumb's Markdown output uses unknown. The current actual custom encoding and attribute list can be found in [ Custom Syntax Audit ](CUSTOM-SYNTAX-AUDIT-2026-09-23.md). Use this report to distinguish sources and encodings.

<a id="后续修正图片归属扩展改名与下划线拆分"></a>

## Follow-up corrections: image classification, extension renaming and separating underline syntax

This section replaces the conclusions of "all ten belong to Notion" and "keep the old extension ID" in the first round of audit below.

- **Image with caption**: Notion supports captions, but this is also a general capability, e.g. [Pandoc implicit_figures](https://pandoc.org/MANUAL.html#extension-implicit_figures). current `<figure>` It is a local universal encoding. Just because Notion has similar functions is not enough to classify it as Notion.`local_figure` Change back to Notdown Markdown extensions without changing the name.
- The remaining nine function adaptations have been changed to `notion_tabs`, `notion_bookmark`, `notion_link_preview`, `notion_breadcrumb`, `notion_button`, `notion_meeting_notes`, `notion_ai_block`, `notion_html_document`, and `notion_web_embed`. They express the project's adaptation of confirmed Notion functionality and do not claim that the functionality is unique to Notion, or that local tags equal the official format.
- The nine old `local_*` ID are retained as compatible aliases. Configuration reading and existing links are available, and the official name is used to save the new configuration; the official name takes precedence when the old and new configurations conflict. Unknown configurations are retained and user pages are not rewritten in batches.
- **Color and underlining**: The merger is a local historical design, and the color and underline attributes are officially defined respectively. now `notion_colors` Only manages block color, text color and background color, new `notion_underline` Independently manage underscores. Both items are enabled by default in Notion / Notdown, and other dialects need to be enabled; in the old configuration, only turning off the color will no longer implicitly turn off the underline. If you need to turn off both, you must turn them off separately. Disabled syntax still retains the complete original text according to the original policy; when the same source block is mixed with disabled tags, the source code may be returned as a whole.
- The current total number of **127**: Pandoc **89**, Notion **22** (13 syntax adaptation + 9 function adaptation), other Markdown **16**.

This round of verification: 37 directed unit tests passed, and the final alias relationship addition passed another 5 test. The browser selected 23 related/surrounding use cases, and 22 passed; the old ID navigation, color and underline independent switches, and the new use cases that used the official ID after saving all passed. The full unit test snapshot is that 431 passed, 1 failed, and 1 was skipped; the failure was that `footnote_anchor` lacked the content manifest relationship, and the browser failure was that the definition item could not be found after inserting the footnote. None of them involve this round of extension identifiers or style switches, and the footnote implementation has not been modified. Log: `test-results/notion-rename-unit.log`, `test-results/notion-rename-focused.log`, `test-results/notion-rename-e2e.log`.

The first round of audit records are retained below. The quantity and picture attribution are subject to this section.

2026-09-22 ⋅ Review Block Explorer All current 126 items: Pandoc 89 ⋅ Notion function/grammar adapted to 22 ⋅ other Markdown product grammar 15 ⋅ Modified to 89 / 12 / 25 ⋅ The original classification is only recognized `notion_` The first is that the first is that the first is that the second is that the second is that the second is that the second is that the third is that the third is that the third is that the third is that the third is that the third is that the third is that the third is that the third. `local_*` IncludedMarkdown Class:

<a id="已修正的十项"></a>

## Ten corrected items

These entries are classified under Notdown Notion extensions and retain the original extension ID, default values, and file encoding. The classification indicates the source of function adaptation, and does not mean that Notion invented the function, nor does it mean that the local encoding is the official NFM syntax.

| Expand | Official functional basis | local encoding |
| --- | --- | --- |
| `notion_meeting_notes` | [Meeting notes](https://developers.notion.com/reference/block#meeting-notes) | `<meeting-notes>` |
| `notion_link_preview` | [Link Preview ](https://developers.notion.com/reference/block#link-preview), including inline link mention | `<link-preview>` / `<link-mention>` |
| `notion_bookmark` | [Bookmark](https://developers.notion.com/reference/block#bookmark) | `<bookmark>` |
| `notion_breadcrumb` | [Breadcrumb](https://developers.notion.com/reference/block#breadcrumb) | `<breadcrumb>` |
| `notion_button` | [Buttons](https://www.notion.com/help/buttons) | `<button>` |
| `notion_ai_block` | [Custom AI blocks](https://www.notion.com/help/guides/organize-your-everyday-life-with-notion-ai) | `<ai-block>` |
| `notion_html_document` | [HTML blocks](https://developers.notion.com/reference/block#html-blocks) | `<html-embed>` |
| `notion_web_embed` | [Embed](https://developers.notion.com/reference/block#embed) | `<web-embed>` |
| `local_figure` | [Images and captions](https://developers.notion.com/guides/data-apis/enhanced-markdown#media-blocks) | `<figure>`, with alt text and captions kept separate |
| `notion_tabs` | [Tab](https://developers.notion.com/reference/block#tab) | `<tabs>` / `<tab>` |

Official list nowTab containers andHTML They're embedded in files.Notion The functional correspondence.Tab officialAPI The structure is different from the local structure;HTML Embedded files with localHTML Source containers are different. It is not possible to directly declare code compatibility based on similar functions.

These ten items continue in **Others** of the dialect list: This grouping means "local dialect adaptation has no official grammatical basis" and is a separate dimension from the Notion source classification. Source categories, official links, and encoding boundaries are displayed in the extension and corresponding block details at the same time; the extension tags shared by the edit page are also revised simultaneously.

<a id="其余-116-项的分类"></a>

## Classification of the remaining 116 items

- **Pandoc 89**: Keep the identity of the Pandoc manual list in the project, with a total of 77 Markdown range entries and 12 Outside Markdown scope entries.`alerts`、`emoji`、`mmd_*`、`wikilinks_*` If it has the Pandoc logo, it will not be moved because it is also used by GitHub, MultiMarkdown, Obsidian or Notion; the grammatical basis of the product will be shown separately. "Pandoc classification" cannot be read as "only Pandoc supported".
- **Existing Notion 12**：`notion_columns`、`notion_callouts`、`notion_toggles`、`notion_tables`、`notion_pages`、`notion_mentions`、`notion_media`、`notion_databases`、`notion_synced`、`notion_toc`、`notion_nesting`、`notion_colors` Continue to be classified according to the official Enhanced Markdown syntax.`notion_databases` Still only retain the original text and do not pretend to be an editable database;`notion_nesting` The history of local containers has also been distinguished in the description.
- **Other Markdown 15**：`highlight`、`comments`、`toc_directives`、`diagrams`、`html_embed`、`mmd_tables`、`mmd_abbreviations`、`mmd_citations`、`critic_markup`、`transclusion`、`glossary`、`metadata_values`、`metadata_variables`、`typora_loose_lists`、`display_math`. They represent Typora, Obsidian, MultiMarkdown, etc. syntax and local adaptation.`html_embed` YesMarkdown In the InteriorHTML The first is the`notion_html_document` The document containers are different;`implicit_figures`, normal pictures and `local_figure` Nor merge.

<a id="另两处依据修正"></a>

## Two other evidence-based corrections

1. [Notion Enhanced Markdown ofCode 节](https://developers.notion.com/guides/data-apis/enhanced-markdown#code)Explicitly describe the Mermaid fence. Already added `diagrams` The Notion dialect is based on, and limited to cover only Mermaid, without changing its generic Markdown source classification or switch state.
2. The last audit concluded incorrectly for `extended!A7:E7`. [ Official Custom emoji ](https://developers.notion.com/guides/data-apis/enhanced-markdown#custom-emoji) does define `:emoji_name:`. Corrected syntax description and original report: Notion custom expressions are not the same parsing mechanism as the general shortcode dictionary, nor do they belong to `notion_mentions`. Customized emoticon analysis is not connected locally to the workspace.

<a id="实现边界"></a>

## Implementation boundaries

This round of modifications to classification, citations and descriptions does not replace codec or change the user text. The existence of Notion side functions does not mean that the local implementation has its full capabilities: the local meeting block uses the optional transcription service, the AI block uses the configured provider, and the buttons only run existing local actions; they do not have Notion cloud services and database automation. Notion's link preview can only be read in general Block API and cannot be created using this interface; this does not affect the local creation of your own preview block.

Categorical data uses explicit source mapping. Regression checks cover source filtering, old ID deep links, block/extended official references, coexistence of Notion sources with Others groupings, and unchanged default values.

Verification result:`npm test` Passed for 424, skipped for 1, failed for 0; the final directory data orientation test 14 passed;`npm run build -- --outDir .run/catalog-origin-dist` Passed by.Chrome Directories in the Independent Temporary Knowledge Library/The following is a list of the topics covered:/The source group12 A browser instance is used by the first round.11 A single pass; new use cases are modified and run again separately after the reference link selector is passed).`test-results/catalog-origin-*.log`, the user vault is not operated.
