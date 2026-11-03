<a id="块类型方言与实现边界"></a>

# Block types, dialects and implementation limits

**English** · [简体中文](BLOCKS.zh-CN.md)

2026-09-15: This article describes **Notdown Editor's native implementation**Pandoc Lab uses the local Pandoc and is much more extensive.`src/document/editor-schema.ts`、`src/markdown-engine/config.ts`、`codec.ts`、`blocks.ts`● Existing 11 default, 70 extension; the number of extensions is not equal to the number of block types.

New capabilities and boundaries such as product prompt blocks, catalogs, charts, complex MMD tables, metadata, file embeddings, and citations are available in [ PRODUCT-SYNTAX.md ](PRODUCT-SYNTAX.md). The description of core block and Pandoc ownership is reserved below.

<a id="1-已经有哪些块"></a>

## 1. Available blocks

The original implementation already included Markdown basic blocks, not just Notion-specific blocks. This time five categories of Markdown blocks are added.

| Category | Implemented semantic blocks/functions | native switch or entry |
| --- | --- | --- |
| Markdown Basics | Paragraphs, 1 – 6 level headings, quotes, unordered/ordered lists, fenced/indented code blocks, separators | CommonMark/GFM basic rules; Notion has its own line breaking rules |
| List expansion | Task item | `task_lists` |
| Table | Unified editable pipeline, Notion, MMD tables; retain spans, groupings and captions | `pipe_tables`、`notdown_tables`、`mmd_tables` |
| Mathematics | Standalone formula, inline formula | `tex_math_dollars` |
| Added: HTML | Original HTML block, fragment with inline HTML | `raw_html` |
| Added: definition lists | A term and one or more definitions, which can contain multiple paragraphs | `definition_lists` |
| Added: footnotes | In-text citations, labeled footnote blocks | `footnotes` |
| New: Line blocks | Keep branch lines and leading spaces, support inline format | `line_blocks` |
| New: Div | Nestable Markdown container | `fenced_divs` |
| Notdown container | Columns, callouts, toggles and ordinary child blocks | `notdown_columns`、`notdown_callouts`、`notdown_toggles`、`notdown_nesting` |
| Page organization | Subpages, page references, table of contents | `notdown_pages`、`wikilinks_title_after_pipe`、`notdown_toc` |
| media | Pictures, audios, videos, files, PDF references | Image syntax/upload, `notdown_media`; not all media is embedded for playback |
| reference block | Database entry, synchronization block content and source | `notdown_databases`, `notdown_synced`; No database executor or cross-page synchronization |
| Original source preserved | Unknown or incomplete block, unknown Notion payload | Core competencies, no need to switch |

`bullet_list_item`, `numbered_list_item` and `task_list_item` are three independent objects and underlying nodes. `bullet_list` / `ordered_list` grouping, `column`, `table_row`, `table_cell`, `table_caption`, `definition_term`, `definition_description` and `line` are the internal structures of the content objects they belong to. They are single-column and linked to the parent object in the Child structures column. Links, emphasis, images, mentions, inline HTML, footnote references, etc. are inline content, and all schema nodes should not be counted as independent blocks.

<a id="2-这五类分别属于哪些-pandoc-方言"></a>

## 2. Which dialects do these five categories belong to? Pandoc

The following table comes from [ Pandoc 3.11 capability snapshot ](../data/pandoc-3.11-extensions.json), which is `pandoc --list-extensions=<variant>`. For a complete comparison of the 89 item manual extensions, see [ PANDOC-EXTENSIONS.md ](PANDOC-EXTENSIONS.md).

**open**= Accept and open by default;**close**= Accept but default to shut down;**—**= The reader does not accept the name switch.

| Expand | `markdown` | `markdown_strict` | `markdown_phpextra` | `markdown_mmd` | `markdown_github` | `commonmark` | `gfm` | `commonmark_x` |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [`raw_html`](https://pandoc.org/MANUAL.html#extension-raw_html) | open | open | open | open | open | open | open | open |
| [`definition_lists`](https://pandoc.org/MANUAL.html#extension-definition_lists) | open | close | open | open | close | close | close | open |
| [`footnotes`](https://pandoc.org/MANUAL.html#extension-footnotes) | open | close | open | open | open | close | open | open |
| [`line_blocks`](https://pandoc.org/MANUAL.html#extension-line_blocks) | open | close | close | close | close | — | — | — |
| [`fenced_divs`](https://pandoc.org/MANUAL.html#extension-fenced_divs) | open | close | close | close | close | close | close | open |

Why: Five types of Pandoc `markdown*` SharedMarkdown reader，Three typesCommonMark Provided SharingCommonMark reader。Both tribes are registered.HTML、Defining lists, footnotes andfenced Div；`line_blocks` Only register in the previous family. By default, select different default switches, and do not open the button by default.reader The source code for the default value is based on the full extension of the control documentation.

<a id="notdown-当前的实际配置"></a>

### Notdown's actual current configuration

| native dialect | HTML | Definition lists | Footnotes | Line blocks | fenced Div |
| --- | --- | --- | --- | --- | --- |
| CommonMark | On by default | Can be turned on, default is off | Can be turned on, default is off | Can be turned on, default is off | Can be turned on, default is off |
| GFM (core syntax) | On by default | Can be turned on, default is off | On by default | Can be turned on, default is off | Can be turned on, default is off |
| Pandoc Markdown | On by default | On by default | On by default | On by default | On by default |
| CommonMark X | On by default | On by default | On by default | Can be turned on, default is off | On by default |
| Markdown Strict | On by default | Can be turned on, default is off | Can be turned on, default is off | Can be turned on, default is off | Can be turned on, default is off |
| PHP Markdown Extra | On by default | On by default | On by default | Can be turned on, default is off | Can be turned on, default is off |
| MultiMarkdown | On by default | On by default | On by default | Can be turned on, default is off | Can be turned on, default is off |
| Old GitHub Markdown | On by default | Can be turned on, default is off | On by default | Can be turned on, default is off | Can be turned on, default is off |
| Notion Markdown | These five independent switches have not been adapted yet; the label continues to be Notion codec | Tongzuo | Tongzuo | Tongzuo | Tongzuo |

Editor-in-Chief Eleven pre-set options are available, with core rules different [NATIVE-DIALECTS.md](NATIVE-DIALECTS.md)。**Notdown is provided to CommonMark/GFM/CommonMark X `line_blocks` It is a self-compact capability; this configuration cannot be transmitted to the original Pandoc with the same name as reader.** Other expansions with the same name also only implement the following rule, which has not been fully tested for consistency through Pandoc. The default is Pandoc 3.11 snapshot, which does not mean that all Markdown software with the same name has the same capabilities.

`raw_html` It doesn't turn on automatically. `<columns>` I'm going to wait.Notdown Meaning: Common`<table>`／`<details>` Can be previewed by HTML; enabled `notdown_tables`／`notdown_toggles` The Notion dialect itself has supported structured editing of both labels.

<a id="3-新增块怎么使用"></a>

## 3. Using the added blocks

Open "Extensions" on any non-Notion dialect page and enable the required rules; available blocks will appear in the Slash menu. Source code, double column, and page mode share the same Markdown. Switch expansion only changes the explanation and does not automatically rewrite the text.

<a id="html-块"></a>

### HTML blocks

```html
<div>
  <h2>Web results</h2>
  <p>这里显示为 HTML 段落。</p>
</div>
```

The page displays a preview. Click "Edit HTML" to modify the label source code, and the preview will be updated accordingly. Blocks can be dragged as a whole; HTML source fields use common undo/redo. HTML in code fence is still code.

The display andHTML Export using the sameHTML5 Analysis and white lists of elements/attributes; disk preserves the full text; supports common text, lists, tables, images and limited inline styles; does not execute scripts, events, tables, and universal style tables;iframe It needs to be opened separatelyhtml_embed And use a separate view, not an external view.class/id/data Attributes. In the mixed lineHTML The entire line content is currently being edited in the source view as a preview clip; not implementedHTML The internal arbitrary elements are edited by their appearance.

<a id="定义列表"></a>

### Definition lists

```markdown
Markdown
:   一种轻量标记语言。

    定义也可以有第二段。

AST
~   文档的结构表示。
```

Terms and definitions are editable. Use colon and four-space indentation to write back after editing; keep the original `:`/`~` and blanks if not modified. The entire list of definitions moves together as you drag.

<a id="脚注"></a>

### Footnotes

```markdown
这句话有说明[^note]。

[^note]: 脚注内容。

    这是脚注的第二段。
```

Labels are retained, reference links point to description blocks, and footnote content is directly editable. The description block is retained at the corresponding position in the source code to facilitate synchronous scrolling; the numerical numbers have not been uniformly generated in the order of reference, collected at the end of the page, return links have been added, and the diagnosis of undefined/duplicate references has not been implemented. `inline_notes` for `^[…]` is an alternative syntax, not yet implemented.

<a id="行块"></a>

### Line blocks

```markdown
| 第一行
|   有意缩进的第二行
| 第三行
```

Each `| ` corresponds to a line, and the space at the beginning of the line is retained in the display; indentation and continuation are merged into the previous line. Line breaks within ordinary paragraphs, hard line breaks with two spaces, and line blocks have different semantics. When opening a pipeline form, inputs with legal header-separated rows are prioritized as tables.

### fenced Div

```markdown
::: {#intro .note}
## 容器内的标题

普通 **Markdown** 段落。

::: {.inner}
嵌套内容。
:::
:::
```

At least three colons, properties are written in curly braces, or a single ordinary class name `::: note` can be used. Internally continue to parse the current Markdown configuration, support nesting and code fences; retain the source code when not closed. The original text of the attribute is saved and displayed as a container label, and the CSS, anchor or layout corresponding to the attribute is not yet executed. Overall dragging carries sub-content.

Internal modifications to new containers currently normalize the entire top-level compound block. Internal Markdown subdocuments are parsed independently; cross-container reference link definition sharing still needs to be improved. Container-specific shortcuts, property editor, precise scroll position for nested subblocks, and the full Pandoc combining syntax are not yet complete.

<a id="4-还缺哪些块或块级语法"></a>

## 4. Missing blocks and block syntax

Mainly Pandoc Markdown, the following is not an exhaustive list of all third-party Markdown ecosystems.

| Ability to be completed | Related extensions/mechanisms | Current situation and access direction |
| --- | --- | --- |
| Simple, multi-row, grid table | `simple_tables`、`multiline_tables`、`grid_tables` | There are already three form editing nodes missing.reader/writer；Common syntax, with the source code reserved |
| Complete table structure | `table_captions`, row/column spans, etc. | The MMD pipeline table has displayed captions, partitions and spans; it still lacks the complete Pandoc table structure and direct editing of merged cells. |
| Figure with caption | `implicit_figures` | Independent image and caption preview has been implemented; complete Figure editing and Pandoc AST conversion are still missing |
| common raw format block | `raw_tex`、`raw_attribute` | raw_attribute has been implemented; HTML is previewed after cleaning, and the code is retained in other formats. raw_tex and TeX execution is not implemented |
| Full title/metadata semantics | `pandoc_title_block`、`mmd_title_block`、`yaml_metadata_block` | Common writing patterns at the beginning of text have been recognized. metadata_values can display metadata and edit source code; it does not apply to page YAML. Complete syntax, structured metadata editing and field mapping are not yet complete |
| HTML → structure container | `native_divs`、`markdown_in_html_blocks`、`markdown_attribute` | HTML can already be previewed, and fenced Div already exists; the common packaging blocks of markdown_attribute have been implemented; native_divs and complete mixed parsing still need to be completed. |
| More ways to write numbered lists | `fancy_lists`, `example_lists`, etc. | There are already ordinary ordered lists and `startnum` switches; Roman letters, example numbers and references are not fully implemented; there is no need to create a new block for each number |
| Citation and generating references | `mmd_citations` / `citations` + citeproc | MMD Independent book numbering, defining editing and returning links;Pandoc Support for local libraries/CSL and installedPandoc ofciteproc Preview. Dialogues and entries see[Objects](../features/INLINE-OBJECTS.md) |
| Other ecological containers/charts | Markdown directives, admonition, Mermaid, etc. | alerts, Mermaid, and commonly used sequence/flow have been connected; general directives and the complete old chart engine have not been implemented |

<a id="与-pandoc-ast-的关系"></a>

### Relationship to the Pandoc AST

According to the data definition of [ pandoc-types, ](https://github.com/jgm/pandoc-types/blob/master/src/Text/Pandoc/Definition.hs) has corresponding semantics for basic paragraphs, titles, lists, quotes, codes, and separators. This time, `LineBlock`, `DefinitionList`, `Div` compatibility and HTML `RawBlock` are added. `Table` is still a smaller subset, `Figure` and `raw_attribute` have been carried in preview blocks that retain source code, and there is no complete AST mapping. There is currently no independent node for the compact layout differences between `Plain` and `Para`.

The footnotes in Pandoc are in the line `Note [Block]`The metadata is in the document. `Meta` In the middle; they are not all `Block` The list.Notdown Use the reference nodes+ Explanation of the block of footage edited by the footage, to be exported in the futurePandoc AST When it is necessary to synthesize it by referenceNote。There is no complete bi-directional right now.AST It's all right.

Subsequently, press "Semantic Node → Dialect reader/writer → Extension Switch → Edit Command → Original Text and Exception Boundary Test" to complete it one by one. The same semantics share nodes, and different syntaxes retain the source; unknown content can continue to be recovered.
