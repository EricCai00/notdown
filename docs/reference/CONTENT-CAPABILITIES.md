<a id="内容能力分类方言支持与-notdown-实现对照"></a>

# Content capabilities

**English** · [简体中文](CONTENT-CAPABILITIES.zh-CN.md)

> Subsequent revision: The user explicitly adopts a semantic model that is independent of the way Markdown is written. See [ Block Semantic Model Check ](../architecture/BLOCK-MODEL-REVIEW.md) for the latest revision table and the merging of existing blocks and standardized naming suggestions. The grammatical differences in this article do not mean that they must be split into different semantic types; for example, callout/alert can be unified, and footnote definitions and references can belong to the same footnote entity.

Check date: 2026-09-20. Based on the **87 item summary** submitted by the user, the original order and line number are retained, covering **11 dialects**. This table is organized by "content capability"; [ 115-item expansion switch table ](PANDOC-EXTENSIONS-MATRIX.md) is organized by "configuration name", the two are not one-to-one correspondence. The original seven columns and this result are saved in [ machine-readable audit data ](../data/content-capabilities-2026-09-20.json).

<a id="对原总结的评价与修订"></a>

## Reviewing and revising the original summary

This summary is suitable for a functional catalog of editors: covering text, inline, media, containers, metadata and collaboration at the same time. But it is not yet directly available as a unified AST schema or implementation checklist. It is recommended to split the original classification into **semantic categories, specific writing methods, dialect support, Notion API mapping, and Notdown implementation level**.

1. **leaf/container is the term for analytic models.** CommonMark is a sheet of paragraph and Notion paragraph can contain sub-blocks; table, definition list, footnote definition must describe the internal structure of the actual model. [Classification of CommonMark](https://spec.commonmark.org/0.31.2/#blocks-and-inlines) with [Notion sub-block rules](https://developers.notion.com/reference/block#block-types-that-support-child-blocks)。
2. **Do not use original/GFM/MMD as an exclusive attribution or invention source.** Functions can exist in multiple languages, and the spelling and default values may vary. Images are originally in the Markdown language, with separate images and headings separated by Figure; the code block is not just a fence.
3. **The synonyms to be dismantled:** empty line ≠ empty block ; HTML block ≠ embed ; callout ≠ exactly the same alert syntax; file redirects ≠ iframe ; footnotes define ≠ footnotes reference; common autolink ≠ naked URL; cross-reference ≠ There is only one linking syntax.
4. **The data and services cannot be embedded in the original AST.** Page icons, covers, properties belong to the page model; database views, buttons, comments, reaction, reminders belong to the application/service capability.
5. **The name of the Notion is verified in the current documentation.** heading_4 andtab The current one does exist; the folding headline isheading ofis_toggleable；meeting_notes in2026-03-11 Replacing the oldtranscription。rich_text The style field is calledannotations。HTML Documentsembed withMarkdown raw HTML The first is the "Band of the Dead".[Block API](https://developers.notion.com/reference/block)、[Rich text](https://developers.notion.com/reference/rich-text)。
6. **MMD ofTitle: The original information is not equal toYAML；CriticMarkup The amendment/Notes/Highlight is a set of independent rules.** See you [MMD data is not available](https://fletcher.github.io/MultiMarkdown-6/syntax/metadata.html)、[CriticMarkup](https://fletcher.github.io/MultiMarkdown-6/syntax/critic.html)。

<a id="表格口径"></a>

## Table conventions

Each letter is written in the same order **Reference dialect / Notdown native**。Eight of them.Pandoc The fingersPandoc 3.11 The language is not a language.Typora/Obsidian The product documentation is publicly available;N The point is publicNotion Enhanced Markdown The format**Not supported by REST Block API**。MMD The list isPandoc markdown_mmd，It's not perfect.MultiMarkdown 6；Added originalMMD Product rules andMMD 6 The following is a list of the most common types of cancer:Strict YesPandoc The originalMarkdown Compatibility with default, not claiming equalityMarkdown.pl。

| symbol | Belonging side | meaning |
| --- | --- | --- |
| base | Reference | Basic syntax of the parser, no extension switch with the same name is required |
| Have / set | product reference | The official documentation has corresponding functions/requires product preference settings, and does not treat local settings as manufacturer defaults. |
| open/can | both sides | The extension is enabled by default / can be enabled; when there are multiple routes, one is available by default and is opened. Please refer to the item-by-item instructions for the specific writing method. |
| within | Native | parser is built-in and does not rely on user switches with the same name. |
| HTML/Properties/Output | Reference | Expressed by HTML, attribute semantics or writer options, not an independent basic syntax |
| external / ginseng | product reference | External layer capabilities such as applications or plug-ins (no commitment to the existence of verified plug-ins) / Only related representations, the same semantics cannot be recognized |
| Placeholder | Notion reference | Markdown API uses unknown as a placeholder and cannot directly restore the corresponding function. |
| —/wait | Reference | There is no special grammar route defined in this table / the public materials are not enough to determine, so it is not supported if it is not forced. |
| Not yet | Native | There is no dedicated implementation of the target function; displaying it as normal text, HTML or retaining the original text does not count as completion. |
| protect | Native | Explicitly only retain the original text/code/unknown references and do not achieve the target semantics |
| Application | Native | It already has application layer capabilities and has nothing to do with the text dialect. |
| * | Native | Subsets, different spellings, or semantic/editing boundaries; itemized descriptions must be read simultaneously |

P = markdown; S = markdown_strict; E = markdown_phpextra; M = markdown_mmd; GH = markdown_github (old version); C = commonmark; GFM = gfm (Pandoc 3.11); CX = commonmark_x; T = Typora; O = Obsidian; N = notion-markdown.

The default default is extensions ={}, which does not include user coverage. defaultSyntax is a compatibility configuration added to old pages. The switch is calculated by supportsOption/enabled; the same switch may cross multiple rows, and one capacity may require multiple switches.**The form is not a full-length conformance or full UI acceptance report.**

<a id="基础块与列表"></a>

## Basic blocks and lists

| # | content capabilities | P | S | E | M | GH | C | GFM | CX | T | O | N |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | divider | base/inside | base/inside | base/inside | base/inside | base/inside | base/inside | base/inside | base/inside | Have / within | Have / within | Have / within |
| 2 | heading | base/inner* | base/inner* | base/inner* | base/inner* | base/inner* | base/inner* | base/inner* | base/inner* | Have/within* | Have/within* | Have/within* |
| 3 | code block code block | base/inside | base/inside | base/inside | base/inside | base/inside | base/inside | base/inside | base/inside | Have / within | Have / within | Have / within |
| 4 | HTML source block | on/on* | on/on* | on/on* | on/on* | on/on* | on/on* | on/on* | on/on* | Yes/on* | Yes/on* | Occupy/Guarantee |
| 5 | paragraph | base/inside | base/inside | base/inside | base/inside | base/inside | base/inside | base/inside | base/inside | Have / within | Have / within | Have / within |
| 6 | Table table | on/on* | Yes/Can* | on/on* | on/on* | on/on* | Yes/Can* | on/on* | on/on* | Yes/on* | Yes/on* | Yes/on* |
| 7 | block quote | base/inside | base/inside | base/inside | base/inside | base/inside | base/inside | base/inside | base/inside | Have / within | Have / within | Have / within |
| 8 | Unordered list item | base/inside | base/inside | base/inside | base/inside | base/inside | base/inside | base/inside | base/inside | Have / within | Have / within | Have / within |
| 9 | Ordered list item | base/inside | base/inside | base/inside | base/inside | base/inside | base/inside | base/inside | base/inside | Have / within | Have / within | Have / within |
| 10 | Task list item | on/on* | Yes/Can* | Yes/Can* | Yes/Can* | on/on* | Yes/Can* | on/on* | on/on* | Yes/on* | Yes/on* | Yes/on* |

<a id="媒体容器资源与服务"></a>

## Media, containers, resources and services

| # | content capabilities | P | S | E | M | GH | C | GFM | CX | T | O | N |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 11 | explicit empty block | —/guaranteed | —/guaranteed | —/guaranteed | —/guaranteed | —/guaranteed | —/guaranteed | —/guaranteed | —/guaranteed | Have / within | Wait/Guarantee | Have / within |
| 12 | Block equation | on/on* | Yes/Can* | Yes/Can* | on/on* | Yes/Can* | Yes/Can* | on/on* | on/on* | Yes/on* | Yes/on* | Yes/on* |
| 13 | Standalone image / figure | base+open/inside+open* | base+can/nei+can* | base+can/nei+can* | base+open/inside+open* | base+can/nei+can* | base+can/nei+can* | base+can/nei+can* | base+can/nei+can* | Yes / within + can * | Yes / within + can * | Have/within* |
| 14 | diagram | —/Yes* | —/Yes* | —/Yes* | —/Yes* | —/Yes* | —/Yes* | —/Yes* | —/Yes* | Yes/on* | Yes/on* | Yes/guaranteed |
| 15 | prompt container callout/alert | Yes/Can* | Yes/Can* | Yes/Can* | Yes/Can* | on/on* | Yes/Can* | on/on* | on/on* | Yes/on* | Yes/on* | Yes/on* |
| 16 | Table of Contents table of contents | output/can | output/can | output/can | output/on | output/can | output/can | output/can | output/can | Yes/on | outside/open | Yes/on |
| 17 | link to page | base/inside | base/inside | base/inside | base/inside | base/inside | base/inside | base/inside | base/inside | Have / within | Have / within | Yes/on |
| 18 | Embed webpage/document referrals | HTML/Yes* | HTML/Yes* | HTML/Yes* | HTML/On* | HTML/Yes* | HTML/Yes* | HTML/Yes* | HTML/Yes* | Yes/on* | Yes/on* | Occupy/Guarantee |
| 19 | child page | —/Yes* | —/Yes* | —/Yes* | —/Yes* | —/Yes* | —/Yes* | —/Yes* | —/Yes* | —/Yes* | —/Yes* | Yes/on* |
| 20 | Inline database | —/Yes* | —/Yes* | —/Yes* | —/Yes* | —/Yes* | —/Yes* | —/Yes* | —/Yes* | —/Yes* | External/Yes* | Yes/on* |
| 21 | full page database | —/Yes* | —/Yes* | —/Yes* | —/Yes* | —/Yes* | —/Yes* | —/Yes* | —/Yes* | —/Yes* | External/Yes* | Yes/on* |
| 22 | Related data source view | —/not | —/not | —/not | —/not | —/not | —/not | —/not | —/not | —/not | outside/not yet | Participate/Insure |
| 23 | button | —/not | —/not | —/not | —/not | —/not | —/not | —/not | —/not | —/not | outside/not yet | Occupy/Guarantee |
| 24 | breadcrumb | —/application* | —/application* | —/application* | —/application* | —/application* | —/application* | —/application* | —/application* | —/application* | External/Application* | Account/Application* |
| 25 | video | HTML/Yes* | HTML/Yes* | HTML/Yes* | HTML/Yes* | HTML/Yes* | HTML/Yes* | HTML/Yes* | HTML/Yes* | Yes/can* | Yes/can* | Yes/on* |
| 26 | Audio audio | HTML/Yes* | HTML/Yes* | HTML/Yes* | HTML/Yes* | HTML/Yes* | HTML/Yes* | HTML/Yes* | HTML/Yes* | Yes/can* | Yes/can* | Yes/on* |
| 27 | file attachment | base/inside+can* | base/inside+can* | base/inside+can* | base/inside+can* | base/inside+can* | base/inside+can* | base/inside+can* | base/inside+can* | Yes / within + can * | Yes / within + can * | Yes/on* |
| 28 | Web bookmark card | —/not | —/not | —/not | —/not | —/not | —/not | —/not | —/not | —/not | —/not | Occupy/Guarantee |
| 29 | PDF embed | HTML/Yes* | HTML/Yes* | HTML/Yes* | HTML/Yes* | HTML/Yes* | HTML/Yes* | HTML/Yes* | HTML/Yes* | Wait/Can* | Yes/can* | Yes/on* |
| 30 | link preview | —/not | —/not | —/not | —/not | —/not | —/not | —/not | —/not | —/not | outside/not yet | Occupy/Guarantee |
| 31 | Meeting minutes meeting notes | —/not | —/not | —/not | —/not | —/not | —/not | —/not | —/not | —/not | outside/not yet | Yes/guaranteed |
| 32 | Unknown/unsupported content | —/guaranteed | —/guaranteed | —/guaranteed | —/guaranteed | —/guaranteed | —/guaranteed | —/guaranteed | —/guaranteed | Wait/Guarantee | Wait/Guarantee | Occupy/Guarantee |
| 33 | toggle | HTML/Yes* | HTML/Yes* | HTML/Yes* | HTML/Yes* | HTML/Yes* | HTML/Yes* | HTML/Yes* | HTML/Yes* | Yes/can* | External/Yes* | Yes/on* |
| 34 | Collapse title | —/not | —/not | —/not | —/not | —/not | —/not | —/not | —/not | To be / not yet | outside/not yet | Yes/on* |
| 35 | tabs container | —/not | —/not | —/not | —/not | —/not | —/not | —/not | —/not | —/not | outside/not yet | Wait/Guarantee |
| 36 | synced block | —/Yes* | —/Yes* | —/Yes* | —/Yes* | —/Yes* | —/Yes* | —/Yes* | —/Yes* | —/Yes* | External/Yes* | Yes/on* |
| 37 | columns | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | External/Yes | Yes/on |

<a id="元数据与扩展块"></a>

## Metadata and extension blocks

| # | content capabilities | P | S | E | M | GH | C | GFM | CX | T | O | N |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 38 | YAML front matter | on/on* | Yes/Can* | Yes/Can* | Yes/Can* | Yes/Can* | Yes/Can* | on/on* | on/on* | Yes/on* | Yes/on* | —/not |
| 39 | Pandoc title block | on/on* | Yes/Can* | Yes/Can* | Yes/Can* | Yes/Can* | —/not | —/not | —/not | —/Yes* | —/Yes* | —/not |
| 40 | Hide comments within blocks | HTML/On | HTML/On | HTML/On | HTML/On | HTML/On | HTML/On | HTML/On | HTML/On | Yes/on | Yes/on | —/not |
| 41 | Definition lists | on/on | Yes/Can | on/on | on/on | Yes/Can | Yes/Can | Yes/Can | on/on | Wait/can | —/Yes | —/not |
| 42 | Specify the original source code in the format | on/on* | Yes/Can* | Yes/Can* | on/on* | Yes/Can* | Yes/Can* | Yes/Can* | on/on* | Wait/Can* | —/Yes* | —/not |
| 43 | Footnote definition | on/on | Yes/Can | on/on | on/on | on/on | Yes/Can | on/on | on/on | Yes/on | Yes/on | —/not |
| 44 | line block | on/on | Yes/Can | Yes/Can | Yes/Can | Yes/Can | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | —/not |
| 45 | Native HTML Div semantics | Open/Not | Yes/No | Yes/No | Yes/No | Yes/No | —/not | —/not | —/not | —/not | —/not | —/not |
| 46 | Raw TeX | Open/Not | Yes/No | Yes/No | Yes/No | Yes/No | —/not | —/not | —/not | —/not | —/not | —/not |
| 47 | Example number list | Open/Not | Yes/No | Yes/No | Yes/No | Yes/No | —/not | —/not | —/not | —/not | —/not | —/not |

<a id="行内内容与文字规则"></a>

## Inline content and text rules

| # | content capabilities | P | S | E | M | GH | C | GFM | CX | T | O | N |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 48 | code span | base/inside | base/inside | base/inside | base/inside | base/inside | base/inside | base/inside | base/inside | Have / within | Have / within | Have / within |
| 49 | emphasis | base/inside | base/inside | base/inside | base/inside | base/inside | base/inside | base/inside | base/inside | Have / within | Have / within | Have / within |
| 50 | Bold strong emphasis | base/inside | base/inside | base/inside | base/inside | base/inside | base/inside | base/inside | base/inside | Have / within | Have / within | Have / within |
| 51 | strikethrough | on/on | Yes/Can | Yes/Can | Yes/Can | on/on | Yes/Can | on/on | on/on | Yes/on | Yes/on | Yes/on |
| 52 | link | base/inside | base/inside | base/inside | base/inside | base/inside | base/inside | base/inside | base/inside | Have / within | Have / within | Have / within |
| 53 | Insider pictures | base/inner* | base/inner* | base/inner* | base/inner* | base/inner* | base/inner* | base/inner* | base/inner* | Have/within* | Have/within* | —/内* |
| 54 | autolink | base/inside | base/inside | base/inside | base/inside | base/inside | base/inside | base/inside | base/inside | Have / within | Have / within | Waiting/inside |
| 55 | Inside HTML | on/on | on/on | on/on | on/on | on/on | on/on | on/on | on/on | Yes/on | Yes/on | —/not |
| 56 | In-text/cross-document citations | base/inner* | base/inner* | base/inner* | base/inner* | base/inner* | base/inner* | base/inner* | base/inner* | Have/within* | Have/within* | Have/within* |
| 57 | Emoji name | Yes/Can | Yes/Can | Yes/Can | Yes/Can | on/on | Yes/Can | on/on | on/on | Yes/on | Yes/on | Yes/guaranteed |
| 58 | inline formula | on/on | Yes/Can | Yes/Can | on/on | Yes/Can | Yes/Can | on/on | on/on | set/on | Yes/on | Yes/on |
| 59 | subscript | on/on* | Yes/Can* | Yes/Can* | on/on* | Yes/Can* | Yes/Can* | Yes/Can* | on/on* | Set/On* | HTML/Yes* | —/not |
| 60 | superscript | on/on* | Yes/Can* | Yes/Can* | on/on* | Yes/Can* | Yes/Can* | Yes/Can* | on/on* | Set/On* | HTML/Yes* | —/not |
| 61 | highlight | Yes/Can* | Yes/Can* | Yes/Can* | Yes/Open* | Yes/Can* | —/Yes* | —/Yes* | —/Yes* | Set/On* | Yes/on* | Participate/Open* |
| 62 | Inline source code comments | HTML/On | HTML/On | HTML/On | HTML/On | HTML/On | HTML/On | HTML/On | HTML/On | HTML/On | Yes/on | —/not |
| 63 | Footnote citation | on/on | Yes/Can | on/on | on/on | on/on | Yes/Can | on/on | on/on | Yes/on | Yes/on | Participate/Not |
| 64 | abbreviation | Yes/Can* | Yes/Can* | on/on* | Yes/Open* | Yes/Can* | —/Yes* | —/Yes* | —/Yes* | Wait/Can* | —/Yes* | —/not |
| 65 | citation | Open/can* | Yes/Can* | Yes/Can* | Yes/Open* | Yes/Can* | —/Yes* | —/Yes* | —/Yes* | —/Yes* | External/Yes* | Have/within* |
| 66 | deletion revision | —/Yes* | —/Yes* | —/Yes* | —/open* | —/Yes* | —/Yes* | —/Yes* | —/Yes* | —/Yes* | —/Yes* | —/not |
| 67 | addition revision | —/Yes* | —/Yes* | —/Yes* | —/open* | —/Yes* | —/Yes* | —/Yes* | —/Yes* | —/Yes* | —/Yes* | —/not |
| 68 | substitution revision | —/Yes* | —/Yes* | —/Yes* | —/open* | —/Yes* | —/Yes* | —/Yes* | —/Yes* | —/Yes* | —/Yes* | —/not |
| 69 | glossary | —/Yes* | —/Yes* | —/Yes* | —/open* | —/Yes* | —/Yes* | —/Yes* | —/Yes* | —/Yes* | —/Yes* | —/not |
| 70 | metadata variables | —/Yes* | —/Yes* | —/Yes* | —/open* | —/Yes* | —/Yes* | —/Yes* | —/Yes* | —/Yes* | —/Yes* | —/not |
| 71 | underline | HTML/On* | HTML/On* | HTML/On* | HTML/On* | HTML/On* | HTML/On* | HTML/On* | HTML/On* | HTML/On* | HTML/On* | Yes/on* |
| 72 | small caps small caps | Attribute/not | Attribute/not | Attribute/not | Attribute/not | Attribute/not | Attribute/not | Attribute/not | Attribute/not | HTML/Not implemented | HTML/Not implemented | —/not |
| 73 | Mention user | —/Yes* | —/Yes* | —/Yes* | —/Yes* | —/Yes* | —/Yes* | —/Yes* | —/Yes* | —/Yes* | External/Yes* | Yes/on* |
| 74 | Mention page/data source | —/Yes* | —/Yes* | —/Yes* | —/Yes* | —/Yes* | —/Yes* | —/Yes* | —/Yes* | —/Yes* | Participate/Can* | Yes/on* |
| 75 | Date/Reminder | —/Yes* | —/Yes* | —/Yes* | —/Yes* | —/Yes* | —/Yes* | —/Yes* | —/Yes* | —/Yes* | External/Yes* | Yes/on* |
| 76 | text color | HTML/Yes | HTML/Yes | HTML/Yes | HTML/Yes | HTML/Yes | HTML/Yes | HTML/Yes | HTML/Yes | HTML/Yes | HTML/Yes | Yes/on |
| 77 | background color | HTML/Yes | HTML/Yes | HTML/Yes | HTML/Yes | HTML/Yes | HTML/Yes | HTML/Yes | HTML/Yes | HTML/Yes | HTML/Yes | Yes/on |
| 78 | line break | base/inner* | base/inner* | base/inner* | base/inner* | base/inner* | base/inner* | base/inner* | base/inner* | Have/within* | Have/within* | Have/within* |
| 79 | Character reference character reference | base/inner* | base/inner* | base/inner* | base/inner* | base/inner* | base/inner* | base/inner* | base/inner* | Have/within* | Have/within* | Waiting/inside* |
| 80 | backslash escaping | base/inner* | base/inner* | base/inner* | base/inner* | base/inner* | base/inner* | base/inner* | base/inner* | Have/within* | Have/within* | Have/within* |
| 81 | Smart punctuation | on/on* | Yes/Can* | Yes/Can* | Yes/Can* | Yes/Can* | Yes/Can* | Yes/Can* | on/on* | Set/can* | —/Yes* | —/not |

<a id="协作与页面元数据"></a>

## Collaboration and page metadata

| # | content capabilities | P | S | E | M | GH | C | GFM | CX | T | O | N |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 82 | collaborative comment | —/not | —/not | —/not | —/not | —/not | —/not | —/not | —/not | —/not | outside/not yet | outside/not yet |
| 83 | reaction | —/not | —/not | —/not | —/not | —/not | —/not | —/not | —/not | —/not | outside/not yet | outside/not yet |
| 84 | Suggested edit suggest edits | —/not | —/not | —/not | —/not | —/not | —/not | —/not | —/not | —/not | outside/not yet | outside/not yet |
| 85 | page icon | —/application | —/application | —/application | —/application | —/application | —/application | —/application | —/application | —/application | External/Application | External/Application |
| 86 | page cover | —/not | —/not | —/not | —/not | —/not | —/not | —/not | —/not | —/not | outside/not yet | outside/not yet |
| 87 | Page attribute/database attribute value | —/application* | —/application* | —/application* | —/application* | —/application* | —/application* | —/application* | —/application* | Yes/Application* | Yes/Application* | External/Application* |

<a id="逐项分类api-映射与实现边界"></a>

## Itemized classification, API mapping and implementation boundaries

This table retains the original English name to avoid losing the correspondence after renaming. The API column illustrates mappable objects and does not mean that Notdown has implemented Notion REST connection or bidirectional conversion; the original Notion menu classification is saved in JSON and is not used as a stable syntax standard.

| # | Original name → this time name | Suggested semantic classification | Notdown route (normal Markdown; Notion) | Notion API/Resource Mapping | revisions and boundaries |
| --- | --- | --- | --- | --- | --- |
| 1 | divider → dividing line divider | leaf pieces | base；base | divider | thematic break is a text delimiter, not a page or database boundary. |
| 2 | heading → title heading | Leaf block; Notion can toggle container behavior | base；base | heading_1…heading_4 | Markdown is usually 1 – 6 level; currently Notion is 1 – 4 , Notdown Notion will receive 5/6 to 4 . Folding headers See also 34. |
| 3 | code block → code block code block | leaf pieces | base；base | code | Look at the indentation code and fence separately: CommonMark fence is built-in; markdown series fence is controlled by backtick_code_blocks/fenced_code_blocks. Indented code can still be used without fences; Notion uses fences. |
| 4 | HTML block → HTML source code block | leaf block/original content | raw_html；preserve | embed ofHTML Form of document | Markdown In the middleraw HTML It's not equal toNotion embed：Notion HTML block It's uploadedHTML The document is isolatediframe The first 10 species are shown.Markdown Pre-set to provide a preview of the source code after clearance, without performing any script. |
| 5 | paragraph → paragraph | Markdown leaf block; Notion can contain sub-blocks | base；base | paragraph | The leaf block of CommonMark allows inline content but not subblocks; Notion can have subblocks. Notdown Arbitrary text block levels are managed by notdown_nesting. |
| 6 | table → table | composite structure | pipe_tables/mmd_tables；notdown_tables | table + table_row | Only pipeline tables or Notion table are judged here. Simple/multi-row/grid tables are not the same syntax; not fully implemented natively. MMD enhanced form for preview and source code editing. |
| 7 | quote → reference block quote | container block | base；base | quote | Notion multi-line > can become multiple blocks, and br is used for line breaks within blocks; CommonMark reference merging rules cannot be directly applied. |
| 8 | bullet list item → unordered list items | container block | base；base | bulleted_list_item | The list list and the list item list item are different nodes; the original list lists item, and it is recommended to add a list level. |
| 9 | numbered list item → ordered list item | container block | base；base | numbered_list_item | Numbering start and list break rules are dialect-affected; not equal to fancy/example lists . |
| 10 | task list item → task list item | container block | task_lists；task_lists | to_do | checked is retained natively and can be edited. Typora defaults to only turning task marks in the unordered list into check boxes. |
| 11 | empty block → explicit empty block | Edit structure | empty；base | Empty paragraph | empty line should not be used as a synonym for empty block. Normal Markdown empty lines are usually delimiters; Notion uses empty-block tags; native Typora maps specific top-level whitespace into editable empty paragraphs. |
| 12 | math block → block equation | leaf pieces | tex_math_dollars/tex_math_double_backslash；tex_math_dollars | equation | Each route delimiter is different. Native support for dollars and the inserted double backslash form, displayed with KaTeX; not a full TeX engine. |
| 13 | image block → standalone image/figure | Picture paragraph; can be upgraded to Figure | figure；base | image | Image syntax originally belongs in the Markdown line. An exclusive line can be displayed as a picture paragraph; Pandoc implicit_figures/MMD only involves the semantics of caption pictures, and image and Figure cannot be completely equated. |
| 14 | diagram → diagram | Rendering capabilities of fence content | diagrams；preserve | code (like mermaid ) | There are ten types of native Markdown, diagrams is optional, and Typora/Obsidian is enabled by default; Notion native only retains codes and does not generate chart previews. Not an arbitrary diagramming language. |
| 15 | callout → prompt container callout/alert | container block | alerts/notdown_callouts；notdown_callouts | callout | GitHub/Obsidian's > [! TYPE ] and Notion callout tags are not written in the same way. The table represents routes for corresponding uses; the native ten presets can additionally enable Notion tag containers. |
| 16 | table of contents → table of contents | Generate block/render function | toc_directives/notdown_toc；notdown_toc | table_of_contents | Pandoc passes the output option -- toc, not Markdown parser syntax; Obsidian Outline is an interface capability and cannot be used as embedded TOC syntax. Notdown can generate directories. |
| 17 | link to page → link to page | Link/reference entry | base；notdown_pages | page mention; independent link-to-page blocks are not forced to map | Ordinary Markdown file links are expressible in all dialects; they do not therefore have Notion subpage objects. Independent entries, inline mentions, and wiki links should be modeled separately. |
| 18 | embed → Embed webpage/file reference | External content/container | html_embed/transclusion；preserve | embed | iframe webpage, Obsidian ![[file]], MMD {{file}} are three routes. Pandoc HTML transparent transmission is not responsible for file redirection; the Notdown referral service only accepts md/markdown/txt/html/tex/bib, and it cannot be deduced that it supports Obsidian pictures, audio and video, and PDF referrals. |
| 19 | page → child page | Resource reference/page relationship | notdown_pages；notdown_pages | child_page; use another Page API for page content | The native page tag provides entry and local navigation, and does not parse Markdown into real cloud page creation; the application itself has a local page tree. |
| 20 | database - inline → Inline database | Database resource/view entry | notdown_databases；notdown_databases | child_database + database.is_inline | Notdown only retains database tags and inline tags; there is no database engine. Obsidian Bases is another product capability and does not claim to be equivalent to the Notion database. |
| 21 | database - full page → full page database | Database resources | notdown_databases；notdown_databases | Database object; child_database is the entry in the parent page | full-page is a resource display form, not a separate Markdown leaf block. Notdown retains references and does not implement table data, queries, relationships, or views. |
| 22 | linked view of data source → Associated data source view | View/Reference | dbview；preserve | View/Data source API, non-universal rich text | The Notion database label can only indicate the reference and cannot fully describe the filtering and sorting of view. Only database references can be retained natively; they cannot be counted as implemented related views. |
| 23 | button → button button | Interaction/Automation | none；preserve | unsupported (can contain block_type = button) | Notdown does not implement button action. Just because a plug-in or HTML can make buttons does not mean that the dialect has native executable button semantics. |
| 24 | breadcrumb → Breadcrumbs breadcrumb | Navigation/generator block | breadcrumb；breadcrumb | breadcrumb | The top column of Notdown has local breadcrumbs, but there is no text block of breadcrumb; API can read blocks and Markdown API can export are two different things. |
| 25 | video → video | media block | notdown_media；notdown_media | video | The native requires notdown_media label route; Obsidian![[video]] Media embedding is not fully accessed, so it cannot be used even if transclusion is turned on by default, even if the video is available by default. |
| 26 | audio → audio | media block | notdown_media；notdown_media | audio | Natively provides tag media preview; ![[ audio ]] is not in the current text quotation file whitelist. It is not a transcription service and URL is not guaranteed to be valid. |
| 27 | file → file attachment | Resource Links/Media Blocks | file；notdown_media | file | Ordinary Markdown links can point to files but do not produce Notion file objects. The Notdown tag can retain the attached URL and description. |
| 28 | web bookmark → Web Bookmark Card | Resource preview | none；preserve | bookmark | Ordinary links are not bookmark cards that capture title/description/cover; there is no such service natively, and Notion unknown only retains references. |
| 29 | PDF → PDF embed | media block | notdown_media；notdown_media | pdf | Pandoc can only use the original HTML output to express embedding; it has pdf tags natively; ![[ file.pdf ]] is not in the current text quotation whitelist, Obsidian PDF embedding is not fully implemented, and it is not a PDF content editor. |
| 30 | link preview → link preview link preview | Site Services/Preview Objects | none；preserve | link_preview | Not to be confused with regular links, web page bookmarks, or mouseover previews; no Notion unfurl integration natively. |
| 31 | meeting notes → Meeting Minutes meeting notes | Service-generated composite block | none；preserve | meeting_notes (old version transcription) | The current API will be renamed from 2026-03-11; Markdown API will have meeting-notes output and can be transcribed. Notdown only preserves unknown source code, no transcriptions or private views. |
| 32 | unsupported → unknown/unsupported content | Compatible fallback | preserve；preserve | unsupported | unknown/unsupported is not an ordinary semantic block that can be authored. Native fallback retains source code or references; it cannot be regarded as implementing unknown functions. |
| 33 | toggle → folding area toggle | container block | notdown_toggles；notdown_toggles | toggle | HTML details can be displayed by raw_html; native structured folding uses notdown_toggles. Obsidian Collapsed Title/List or Collapsible callout are related but different capabilities. |
| 34 | toggle heading → Collapse title | title + subblock/interaction | toggleheading；notdown_nesting | heading_1…4 + is_toggleable | Notdown Notion uses heading.toggle and nested_block to achieve folding; it is managed by notdown_nesting. The title folding of ordinary Markdown is the editing of UI, which is not the same serialization structure. |
| 35 | tabs → tabs container | container block | none；preserve | tab (paragraph sub-block represents each page tab) | Currently Block API already has tab; the public Enhanced Markdown guide does not list a special format and does not make up labels. Notdown does not yet have tabs nodes and views. |
| 36 | synced block → synchronized block synced block | Reference/container + sync service | notdown_synced；notdown_synced | synced_block | Content snapshots, sources and references are retained natively; there is no cross-page automatic synchronization, nor cross-end/Notion cloud synchronization. |
| 37 | columns → Column columns | container block | notdown_columns；notdown_columns | column_list + column | Column containers and displays are provided natively; retained with labels. CSS column or Pandoc Div layout is not equal to Notion column structure. |
| 38 | YAML front matter → YAML front matter | Document metadata | yaml_metadata_block；none | Outside the body Block API | MMD native Title: meta information is not equal to YAML; Notdown markdown_mmd optional YAML is a native extension of Pandoc/. Page attribute YAML and body metadata need to be separated. |
| 39 | Pandoc title block → Pandoc title block | Document metadata | pandoc_title_block；none | No direct correspondence | Starting with %; natively only recognizes common starting subsets and retains the source code; metadata_values determines whether to display metadata preview. |
| 40 | block comment → Hide comments inside the block | Source code comments | comments/raw_html；none | Not discussion comment | HTML comments are not the same as Obsidian %% multi-line comments. Natively supports corresponding switches; it is not a multi-person annotation system. |
| 41 | definition list → definition list | compound block | definition_lists；none | No natively defined list type | It should contain term and definition. definition can contain multiple blocks and should not be collectively referred to as a single leaf block. |
| 42 | raw source → Specify the original source code in the format | Original content block/inline | raw_attribute；none | No universal correspondence | For example, code with {= html }; different from normal HTML blocks or arbitrary file references. Native support for preview/source-preserving subset of specified output formats. |
| 43 | footnote → footnote definition | Definition / compound block | footnotes；none | No standard footnote definition object | [^ id ]: A definition can contain multiple paragraphs; the inline reference to 63 is the opposite end of a set of syntax. Notion [^ URL ] is a citation, not a definition. |
| 44 | line block → line block line block | Leaf block (containing multiple inline sequences) | line_blocks；none | No direct correspondence | Used for poetry etc. to preserve line sequences. Notdown local CommonMark series is also optional, Pandoc with the same name reader does not accept this switch. |
| 45 | native div → HTML native Div semantics | container block | none；none | No direct correspondence | Pandoc turns HTML div into AST Div; Notdown can preview raw HTML, but native_divs is not registered and is not counted as structured Div. fenced_divs is another way to write it, see also the supplementary table. |
| 46 | raw TeX → raw TeX | Original block or inline content | none；none | No direct correspondence | Unlike formulas; Notdown has no raw_tex-specific semantics. Retaining the original text or ordinary text does not mean performing TeX or target format transparent transmission. |
| 47 | example list → Example number list | Container blocks + numbering semantics | none；none | No direct correspondence | Pandoc (@) numbering and reference mechanism; the native one has not yet been implemented, and ordinary ordered_list cannot be used to replace the complete function. |
| 48 | code span → inline code code span | inline markup | base；base | rich_text.annotations.code | The API field is called annotations (plural) and is not an independent block or independent annotation object type. |
| 49 | emphasis → emphasize emphasis | inline markup | base；base | rich_text.annotations.italic | Font effects correspond to styles; delimiters and nesting boundaries may still differ between dialects. |
| 50 | strong emphasis → bold strong emphasis | inline markup | base；base | rich_text.annotations.bold | It is an inline style, not a new block type. |
| 51 | strikethrough → strikethrough strikethrough | inline markup | strikeout；strikeout | rich_text.annotations.strikethrough | Separate from CriticMarkup delete revision; strikethrough does not contain accept/reject revision semantics. |
| 52 | link → link | Inline nodes/markers | base；base | rich_text.text.link | Ordinary links do not require extension switches; actual jumps require safe URL and accessible targets. |
| 53 | image → inline image | Inline node | base；base | image is a block; rich_text has no normal image type | Notdown PM schema ofimage Yesinline；Notion codec It also preserves image nodes, but does not guarantee that any linear layout of the image can be mapped to the image.Notion API。 |
| 54 | autolink → automatically link autolink | Inline rule | base；base | Normal rich_text link | The angle bracketed URL/ mailbox is the base syntax; the bare URL is another extension of autolink_bare_uris and cannot be combined into a count. Native Notion measured angle brackets URL will generate link markup; this does not corollary to support bare URL. |
| 55 | inline HTML → inline HTML | original inline content | raw_html；none | There is no generic HTML rich_text type | Notion ofspan/mention Labels are agreed upon terms, not arbitraryHTML。Notdown It's normal.Markdown The route provides a preview of the cleanup. |
| 56 | internal link → In-text/cross-document citations | link + identifier rules | base；base | Normal link or page mention | `[title](#id)` basic link and automatically generated title ID, [title] implicit reference, [[double link]] should be counted separately; this line only guarantees link representation, and the generation of target anchors is subject to extension control. |
| 57 | emoji → Emoji name | Inline replacement/resource parsing | emoji；preserve | Unicode text; custom Emoji requires resources | Unicode Emoji itself requires no extensions. Notion customization: name: depends on the resource directory; native Notion currently retains the source code and does not provide a emoji switch with the same name. |
| 58 | inline math → inline formula | Inline atomic node | tex_math_dollars/tex_math_double_backslash；tex_math_dollars | rich_text.type=equation | Pandoc switches each delimiter separately; Notdown dollar/double backslash is an implemented subset. |
| 59 | subscript → subscript | inline markup | subscript/short_subsuperscripts；none | No independent subscript annotation | H~2~O should not be considered the same extension switch as HTML sub. Notdown Obsidian can select local language beyond its official base grammar. |
| 60 | superscript → superscript superscript | inline markup | superscript/short_subsuperscripts；none | No independent superscript annotation | x ^ 2 ^, MMD abbreviation superscript and HTML sup are processed separately; natively each depends on the corresponding extension. |
| 61 | highlight → Highlight highlight | inline markup | highlight/critic_markup；notdown_colors | The background color annotation is a related expression | == text ==, {== text ==}, the background color is not written in the same way. Pandoc uses mark; mark is not registered natively, but there is also highlight/CriticMarkup, which cannot be regarded as a complete implementation of the same name. |
| 62 | inline comment → Inline source code comments | Inline preservation / revision annotation | comments/critic_markup/raw_html；none | Not Comment API | %%...%%, HTML comments, {>>...<<} should be split into different syntaxes; this line summarizes the route, not all dialects accept all delimiters. |
| 63 | footnote → footnote reference | Inline reference node | footnotes；none | Notion [^ URL ] is citation, not an ordinary footnote | Just because Notion displays a superscript reference does not make it full footnotes; the normal footnotes of native N are not adapted. |
| 64 | abbreviation → abbreviation abbreviation | Definition + inline markup | abbreviations/mmd_abbreviations；none | No direct correspondence | PHP *[ HTML ]: Different from MMD [> HTML ]. Pandoc abbreviations only skips definitions and does not have complete abbreviation nodes; Notdown can display its supported abbreviation explanations. |
| 65 | citation → citation citation | Inline citation + bibliographic processing | mmd_citations；base | Notion citation serialization is not equal to CSL citation object | Pandoc [@ key ], MMD [# key ], Notion [^ URL ] are different; natively only accepts a subset of MMD and Notion URL citations, but does not have complete Pandoc citations/citeproc. |
| 66 | deletion → delete revision deletion | CriticMarkup inline revisions | critic_markup；none | Not a complete equivalent of strikethrough annotation | {-- text-- }; Native tagging and display, no multi-person review or full accept/reject workflow. |
| 67 | addition → Add revision addition | CriticMarkup inline revisions | critic_markup；none | No independent revision type | {++ text++}; cannot be confused with ordinary text insertion operations. |
| 68 | substitution → replace revision substitution | CriticMarkup inline revisions | critic_markup；none | No independent revision type | { ~~old ~> new~~ }; Native support for the current inline parsing subset. |
| 69 | glossary → Glossary glossary | definition + inline reference + output | glossary；none | No direct correspondence | MMD term citations are part of its extended architecture; natively implements a subset of term definitions/prompts and does not claim full sorting and publication output. |
| 70 | metadata variable → metadata variable | Inline replacement/template | metadata_variables&metadata_values&mmd_title_block/metadata_variables&metadata_values&yaml_metadata_block/metadata_variables&metadata_values&pandoc_title_block；none | No direct correspondence | [% name ] requires metadata source; natively relies on metadata_variables, metadata_values and corresponding title blocks. The table is calculated based on any complete route of the MMD/YAML/Pandoc title block. You cannot just turn on variable substitution without metadata sources. |
| 71 | underline → underline underline | Inline styles/HTML semantics | notdown_colors/raw_html；notdown_colors | rich_text.annotations.underline | Pandoc does not have an extension switch with the same name as underline. Native structured underlining uses Notion span + notdown_colors; HTML u/ins belongs to the raw_html preview route. |
| 72 | small caps → small caps small caps | Inline style/semantics | none；none | None small_caps annotation | Pandoc Can be carriedsmallcaps Classspan Expression, depending on the attributes/The originalspan Processed; not exclusivesmall_caps mark，CSS The first is that the world is not a perfect place. |
| 73 | mention person → Mention user | Inline quotes + user services | notdown_mentions；notdown_mentions | rich_text.mention.user | User URL and tags are retained natively; no member directory is connected and notifications are not sent. |
| 74 | mention page or data source → mention page/data source | Inline quotes | notdown_mentions/notdown_pages；notdown_mentions/notdown_pages | mention.page/database; data_source needs to be checked against the API version | The one-to-one correspondence between the Notion Markdown data source tag and the REST rich_text enumeration cannot be inferred from the name. Native retention is different from mention kind, only the local page target has navigation. |
| 75 | date ot reminder → Date/Reminder | Inline date reference + service | notdown_mentions；notdown_mentions | rich_text.mention.date; Reminder of non-simple synonyms | Correct date ot reminder to date or reminder. Date attributes are retained natively, with no reminder scheduling or notifications. |
| 76 | text color → text color | Inline/block attributes | notdown_colors；notdown_colors | annotations.color / block.color | The native color name is agreed upon; Pandoc HTML/CSS depends on the output format and cannot be regarded as a unified text_color extension switch. |
| 77 | background color → background color | Inline/block attributes | notdown_colors；notdown_colors | annotations.color of*_background | Enhanced Markdown uses *_bg, REST API uses *_background; Notdown saves its own tag convention, without claiming complete API value conversion. |
| 78 | line break → line feed line break | Inline rules/block boundaries | base；base | Line breaks within rich_text.text.content | hard break, soft break, and block boundaries should be split; Notion text can be divided into blocks with single line breaks, and br can be divided into blocks with line breaks. hard_line_breaks/ignore_line_breaks determines some Markdown behavior. |
| 79 | character reference → character reference character reference | Lexical/inline decoding | base；base | Text encoding, not standalone Block | For example, & amp;, &# 65;; are not link references or footnote references. Notion officially only clarifies some tag escapes, and the native decoding capability is not equal to the official format commitment. |
| 80 | backslash escape → backslash escape | Lexical rules | base；base | Serialization rules, non-object types | Each dialect has a different set of escapable characters; the code is not escaped as normal text. all_symbols_escapable and other extended adjustment boundaries. |
| 81 | smart typography → Intelligent punctuation | text conversion | smart；none | No independent annotation | Typora is affected by preference settings; native Typora turns off smart by default, and Pandoc defaults to snapshot. Font styles cannot be used in place of actual character conversions. |
| 82 | comment → Collaborative Comment comment | Application / discussion object | none；none | Comment API, non-text Block | Completely different from 40/62 source code comments; Notdown does not implement collaborative comment threads. |
| 83 | reaction → Expression response reaction | Application / discussion object | none；none | Unconfirmed public unified Reaction written to API | Don't be fooled byUI Yes, I did.reaction The ConclusionREST API There will be corresponding objects to be written;Notdown It's not happening. |
| 84 | suggest edits → Suggest editing suggest edits | Collaborative review process | none；none | Universal review object mapping not confirmed | CriticMarkup can only express modification marks and cannot automatically obtain permissions, review and accept/reject processes; Notdown does not implement collaborative suggestions. |
| 85 | icon → page icon | Page metadata | icon；icon | Page.icon | The Notdown application layer already supports local page icons, regardless of the text dialect; Emoji in the source code is not counted as a page icon. |
| 86 | cover → page cover cover | Page metadata | cover；cover | Page.cover | Notdown No dedicated cover field is seen or UI is displayed; unknown YAML data can be retained and does not equal the implementation of the cover. |
| 87 | page property (database) → page attribute/database attribute value | Page metadata/data model | properties；properties | Page.properties; schema belongs to Data source | Notdown page YAML properties can be preserved and edited, but does not have the full Notion type system, formulas, relationships, and database views. Separate from the body metadata block. |

The / in the route indicates alternative routes written in different ways, and & indicates that they need to be opened at the same time; base = built-in, none = not connected to the target semantics, preserve = fallback, figure/empty, etc. are the classification rules of this article, and **is not a new extension ID**. The actual registered name is [ config.ts ](../../src/markdown-engine/config.ts).

<a id="multimarkdown-6-与-pandoc-markdown_mmd-的区别"></a>

## Differences between MultiMarkdown 6 and Pandoc markdown_mmd

"MultiMarkdown" in the user's original table should be separately noted for implementation. The following are [ MMD 6 Official Guidelines Capabilities covered by ](https://fletcher.github.io/MultiMarkdown-6/) that cannot be deduced from the Pandoc markdown_mmd name:

| User line number | MMD 6 Capabilities | Notdown route | Boundaries |
| --- | --- | --- | --- |
| 18 | File referral | transclusion | Local preview and dependency resolution subset |
| 61、62、66–68 | CriticMarkup Highlighting, annotation, addition, deletion and modification | critic_markup | No complete review process |
| 64 | MMD abbreviation definition/reference | mmd_abbreviations | Separate from PHP/Pandoc abbreviations |
| 65 | MMD Citation | mmd_citations | Separate from Pandoc citations/citeproc |
| 69 | Glossary | glossary | term display subset |
| 70 | metadata variables | metadata_variables + metadata_values + mmd_title_block | A valid metadata source is required |
| 16 | TOC command | toc_directives | Separate from Pandoc -- toc output options |
| 6、13 | Enhanced tables and independent images | mmd_tables / implicit_figures | Preview, captions, and source code editing subsets |

<a id="建议补充的独立项目"></a>

## Suggested additional independent items

There are no rows deleted from the original table of 87 items. In order to avoid hiding multiple syntaxes in the same line, it is recommended to add the following sub-items when maintaining the function directory in the future; the current switch status has been listed item by item in the [ expansion matrix ](PANDOC-EXTENSIONS-MATRIX.md):

| original line | Suggest splitting/replenishing items | Key differences |
| --- | --- | --- |
| 3 | Indent code, backtick fence, tilde fence | Basic syntax vs configurable dialect extension |
| 6 | pipe/simple/multiline/grid/MMD tables, table caption | Different table syntax and editable range |
| 8、9 | list container and list_item, definition term/definition | Different structural levels |
| 13、53 | Inline images, independent image paragraphs, with captions Figure | Don't push AST types by visual size |
| 15、18 | alerts/callout; iframe/ file reference | Same purpose, different syntax and execution layer |
| 38、39 | mmd_title_block | Key value meta information, not YAML front matter |
| 45 | fenced_divs、bracketed_spans、inline_code_attributes | Native fenced_divs has been connected, and the other two items have not been registered with the same name. |
| 54、56 | Naked URL, reference link definition, automatic anchor point, implicit title reference, wiki double link | The availability of native basic links does not mean that all reference mechanisms have been implemented |
| 59–65 | HTML superscript and subscript, Pandoc/MMD/Notion citation, HTML/%%/Critic comment | Create subrows based on actual delimiter |
| 78 | Hard line breaks, soft line breaks, block boundaries, line breaks ignore/force line breaks | Different textual semantics |
| 82–87 | Page/block properties, collaboration objects, resource services | Independent of parser switch table |

<a id="依据与验证范围"></a>

## Evidence and validation scope

- Eight Pandoc dialects: native 3.11 CLI has been rechecked with [ default value snapshot ](../data/pandoc-3.11-extensions.json) item by item; for functional explanation, please refer to [ Pandoc manual ](https://pandoc.org/MANUAL.html).
- Basic structure: [ CommonMark 0.31.2 ](https://spec.commonmark.org/0.31.2/); the native implementation does not claim to have passed the complete specification.
- Product reference: [ Typora ](https://support.typora.io/Markdown-Reference/), [ Obsidian basic syntax ](https://obsidian.md/help/syntax), [ advanced syntax ](https://obsidian.md/help/advanced-syntax), [ Callouts ](https://obsidian.md/help/callouts), [ file embedding ](https://obsidian.md/help/embeds), [ internal link ](https://obsidian.md/help/links), [ PHP Extra ](https://michelf.ca/projects/php-markdown/extra/). In addition to third-party plug-in capabilities, the local Notdown default value is not used to infer the product default.
- Notion: [ Enhanced Markdown ](https://developers.notion.com/guides/data-apis/enhanced-markdown), [ Markdown API support/occupancy range ](https://developers.notion.com/guides/data-apis/working-with-markdown-content#block-type-support), [ Block API ](https://developers.notion.com/reference/block), [ Rich text ](https://developers.notion.com/reference/rich-text), [ Page ](https://developers.notion.com/reference/page), [ Database ](https://developers.notion.com/reference/database), [ Views ](https://developers.notion.com/guides/data-apis/working-with-views). Mappings that are not defined in public data are reserved for review and will not be guessed by name.
- Notdown: [ config.ts ](../../src/markdown-engine/config.ts), [ codec.ts ](../../src/markdown-engine/codec.ts), [ products.ts ](../../src/markdown-engine/products.ts), [ quotation file restrictions ](../../server/syntax-files.ts), [ notion-markdown.ts ](../../src/document/notion-markdown.ts), [ editor-schema.ts ](../../src/document/editor-schema.ts), [ FORMAT.md ](../FORMAT.md), [ PRODUCT-SYNTAX.md ](PRODUCT-SYNTAX.md).
- Verification: Re-run the existing tests of the 5 group, and a total of 101 items passed; the generator executes 12 real parsing probes for classification ambiguity and checks the original text round trip, and the results are included in JSON. Covers folded titles, empty blocks, pictures, citation/footnote differences, unknown tabs, chart codes, raw TeX and HTML Div, etc.; it does not mean that all 957 cells have undergone complete interactive acceptance.
- This time it is only a document review, and no changes have been made to the functions, default switches, page content or MyBase. "Savable original text" is not counted as achieved target semantics.

Rebuild: Run `node --import tsx docs/fixtures/content-capabilities.ts` in the repository root directory. The original input has been included in JSON, and the reproduction does not depend on the personal attachment path.
