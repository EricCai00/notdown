<a id="产品方言附加语法当前实现与-62-条验收清单"></a>

# Product syntax

**English** · [简体中文](PRODUCT-SYNTAX.zh-CN.md)

2026-09-22 dialect boundary correction: each dialect's default value is independently defined according to the upstream specification, and only Pandoc's own default default follows the Pandoc 3.11 snapshot. Nine types of local objects have been changed to independent plug-ins that are turned off by default and turned on in the page syntax panel; old text will not be migrated or deleted. Default rule isolation, explicit enablement, and parsing/command/directory unified gating have been implemented; full upstream consistency or cross-end synchronization has not been claimed. For details, see [ Dialect Checking and Plug-in Description ](DIALECT-CONFORMANCE.md); if the historical description below conflicts with it, this revision shall prevail.

2026-09-15。This is a new additionTypora、Obsidian Independent pre-set, total**11 default default, 70 registered extension**The article updates previously.[The gap audit](../audits/SYNTAX-AUDIT-2026-09-15.md)The code does not represent a complete or complete Pandoc reader reproduction.

<a id="使用与编辑方式"></a>

## Usage and editing

Added user screenshot reception: in the Typora sequence list `[ ]` / `[x]` Displays as text, with only an unordered task showing a check box; judges by the list of current items when embedded. Typora default closes `all_symbols_escapable`supporting the original Markdown pointers and `$ < > = ^ | ~` The transition, the reversal of the slope before the remaining points of the mark, is retained;`smart` By default, close and avoid automatically replacing the direct quotation in the screenshot with the quotation. Open these extensions to cover the default values. These are the rules that tighten according to the current user application test, not as a general guarantee for all versions of Typora.

2026-09-20 comparison correction: Typora turns on `hard_line_breaks` by default, retaining single line breaks in the edit view; it can be turned off to compare the behavior of merging spaces. This switch currently also affects HTML exports, Typora independent edit/export blank settings have not yet been implemented. According to actual user application measurements, the Typora ordered list only recognizes `1.`, and `1)` is retained as text; the right bracket rules of CommonMark/GFM remain unchanged. Ordinary, quoted, naked URL and angle bracket automatic links all provide link appearance. In the editing area, Ctrl/ ⌘ + click to open HTTP (S)/email link.

Select the corresponding dialect and enable the options noted in the table in the Extensions panel. Switching only reinterprets the same Markdown; the source file and YAML syntax are still saved via baseRevision. Ordinary text, titles, prompt blocks, and revision marks support page editing; starting from 2026-09-21, MMD tables share the structured table model. Cells and captions support direct editing, retaining spans, groups, and original multi-line content. Diagrams, metadata, HTML mix blocks and file embeddings are available for preview and "edit source" and can still be dragged and co-undone in their entirety. Inline comments, terminology, and embeddings are edited through source view. Pandoc is not called for daily input.

The default value of PHP Extra/MMD's Pandoc switch with the same name retains the 3.11 snapshot; product-specific capabilities are supplemented on this basis. Therefore, some functions in the list need to be turned on manually, and "not enabled by default" cannot be regarded as "not implemented". The following is marked line by line according to the actual registry.

<a id="62-条原始样例"></a>

## 62 original examples

Verify the semantic nodes/key output of the original sample, the original text round trip, and the retention of adjacent blocks after editing; external resources are also verified using real temporary files and browsers. Not every example contains valid resources or references.

| # | Dialect/Grammar | rules | Default/Required settings | Show and edit instructions |
| --- | --- | --- | --- | --- |
| 1 | Typora：math block | `tex_math_dollars` | Available by default | Parsing, display and original text are retained; text can be edited directly |
| 2 | Typora：footnote | `footnotes` | Available by default | Parsing, display and original text are retained; text can be edited directly |
| 3 | Typora：YAML front matter | `yaml_metadata_block`、`metadata_values` | Available by default | Text metadata table; source code editing within the block; do not change the outer page YAML |
| 4 | Typora：table of contents | `toc_directives` | Available by default | Updated with title, click to jump |
| 5 | Typora：callout / GitHub style alert | `alerts` | Available by default | Parsing, display and original text are retained; text can be edited directly |
| 6 | Typora：internal link | `auto_identifiers` | Available by default | In-page anchor point; generated ID obtained from title |
| 7 | Typora：emoji | `emoji` | Available by default | Parsing, display and original text are retained; text can be edited directly |
| 8 | Typora：inline math | `tex_math_dollars` | Available by default | Parsing, display and original text are retained; text can be edited directly |
| 9 | Typora：subscript | `subscript` | Available by default | Parsing, display and original text are retained; text can be edited directly |
| 10 | Typora：superscript | `superscript` | Available by default | Parsing, display and original text are retained; text can be edited directly |
| 11 | Typora：highlight | `highlight` | Available by default | Parsing, display and original text are retained; text can be edited directly |
| 12 | Typora：embed content | `html_embed` | Available by default | HTTP (S) iframe is displayed in isolation; the remote end may prohibit embedding |
| 13 | Typora：sequence diagram | `diagrams` | Available by default | sequence commonly used arrow syntax to Mermaid; source code editing within the block |
| 14 | Typora：flowchart | `diagrams` | Available by default | flow common node/connection syntax converted to Mermaid; source code editing within the block |
| 15 | Typora：mermaid | `diagrams` | Available by default | Local Mermaid SVG; empty chart displayed with no content |
| 16 | Typora：without Strict Mode | `space_in_atx_header` | Off by default (in line with the sample) | This example requires space_in_atx_header to be turned off; Typora is turned off by default |
| 17 | Typora：without Strict Mode | `typora_loose_lists` | Available by default | Two-space continuation lines retain the same item |
| 18 | Typora：without Strict Mode | `typora_loose_lists` | Available by default | Two-empty grid list; nested list editable |
| 19 | Obsidian：block comment | `comments` | Available by default | Text hidden; source code view editing |
| 20 | Obsidian：inline comment | `comments` | Available by default | Text hidden; source code view editing |
| 21 | Obsidian：internal link (Wikilink) | `wikilinks_title_after_pipe` | Available by default | Link matches local page title/ID |
| 22 | Obsidian：internal link (Markdown) | `基础链接／本地页面路由` | Available by default | Relative .md links match local pages; do not open any disk files |
| 23 | PHP Markdown Extra：inline HTML | `raw_html` | Available by default | HTML preview; tags are edited in the HTML source field |
| 24 | PHP Markdown Extra：markdown Inside HTML Blocks | `raw_html`、`markdown_attribute` | Available by default | HTML InsideMarkdown Preview; editing the entire block |
| 25 | PHP Markdown Extra：special attributes | `header_attributes` | Available by default | Parsing, display and original text are retained; text can be edited directly |
| 26 | PHP Markdown Extra：special attributes | `header_attributes` | Available by default | Parsing, display and original text are retained; text can be edited directly |
| 27 | PHP Markdown Extra：special attributes | `header_attributes` | Available by default | Parsing, display and original text are retained; text can be edited directly |
| 28 | PHP Markdown Extra：special attributes | `link_attributes` | Available by default | Attributes are retained; class is prefixed, ID is scope isolated |
| 29 | PHP Markdown Extra：special attributes | `link_attributes` | Available by default | This is a reference definition. You need to add [text][ref] to see the link; it will not be displayed separately. |
| 30 | PHP Markdown Extra：fenced code block | `fenced_code_blocks`、`fenced_code_attributes` | Need to be turned on`fenced_code_attributes` | Parsing, display and original text are retained; text can be edited directly |
| 31 | PHP Markdown Extra：fenced code block | `fenced_code_blocks`、`fenced_code_attributes` | Need to be turned on`fenced_code_attributes` | Parsing, display and original text are retained; text can be edited directly |
| 32 | PHP Markdown Extra：definition list | `definition_lists` | Available by default | Parsing, display and original text are retained; text can be edited directly |
| 33 | PHP Markdown Extra：abbreviation | `abbreviations` | Available by default | This is an abbreviation definition. You need to use HTML in the text to display the prompt. |
| 34 | PHP Markdown Extra：ordered list | `startnum` | Need to be turned on`startnum` | Parsing, display and original text are retained; text can be edited directly |
| 35 | MultiMarkdown：abbreviation | `mmd_abbreviations` | Available by default | Abbreviation hint; defined in block source code editor |
| 36 | MultiMarkdown：citation | `mmd_citations` | Available by default | The original example Doe:2006 is inconsistent with the definition of Doe2006, and an undefined prompt is displayed. |
| 37 | MultiMarkdown：citation | `mmd_citations` | Available by default | The reference keys of the original example are inconsistent and need to be corrected to the same key. |
| 38 | MultiMarkdown：citation | `mmd_citations` | Available by default | Suppress text citations; still enter the literature list |
| 39 | MultiMarkdown：inline citation | `mmd_citations` | Available by default | Inline bibliographic information display |
| 40 | MultiMarkdown：BibTeX citation | `mmd_citations` | Available by default | Display the literature after setting bibliography: refs.bib and providing a real entry; unresolved keys are not fictitious |
| 41 | MultiMarkdown：deletion | `critic_markup` | Available by default | Parsing, display and original text are retained; text can be edited directly |
| 42 | MultiMarkdown：addition | `critic_markup` | Available by default | Parsing, display and original text are retained; text can be edited directly |
| 43 | MultiMarkdown：substitution | `critic_markup` | Available by default | New text is editable; old text remains in tags and tips |
| 44 | MultiMarkdown：highlighting | `critic_markup` | Available by default | Parsing, display and original text are retained; text can be edited directly |
| 45 | MultiMarkdown：comment | `critic_markup` | Available by default | Parsing, display and original text are retained; text can be edited directly |
| 46 | MultiMarkdown：cross-reference | `mmd_header_identifiers`、`implicit_header_references` | Available by default | Title ID with implicit linkage |
| 47 | MultiMarkdown：escaped newline | `escaped_line_breaks` | Need to be turned on`escaped_line_breaks` | Parsing, display and original text are retained; text can be edited directly |
| 48 | MultiMarkdown：file transluction | `transclusion` | Available by default | Read-only embedding in the vault; dependent files are checked every 4 seconds, and an error is displayed if missing |
| 49 | MultiMarkdown：wildcard extention | `transclusion` | Available by default | Prioritize .html, followed by .md, .txt; all extensions are not merged |
| 50 | MultiMarkdown：glossary | `glossary` | Available by default | Terminology tips, insider explanations and definitions |
| 51 | MultiMarkdown：image block | `implicit_figures` | Available by default | Independent image and caption preview; the original path is a placeholder address and the actual image is required |
| 52 | MultiMarkdown：link and image attribute | `mmd_link_attributes` | Available by default | Width, height and class attributes are retained/apply allowed display attributes |
| 53 | MultiMarkdown：link and image attribute | `mmd_link_attributes` | Available by default | Parsing, display and original text are retained; text can be edited directly |
| 54 | MultiMarkdown：math | `tex_math_double_backslash` | Available by default | Double backslash inline and block formulas; KaTeX displays |
| 55 | MultiMarkdown：superscript | `short_subsuperscripts` | Available by default | Consecutive letters/numbers are abbreviated superscripts |
| 56 | MultiMarkdown：subscript | `short_subsuperscripts` | Available by default | Consecutive letters/numbers are abbreviated subscripts |
| 57 | MultiMarkdown：metadata "variable" | `mmd_title_block`、`metadata_values`、`metadata_variables` | Available by default | Text metadata value replacement; modified metadata immediately refreshes the display |
| 58 | MultiMarkdown：raw source | `raw_attribute` | Available by default | HTML is displayed after cleaning; LaTeX and other non-HTML original formats display the source code, and TeX is not executed. |
| 59 | MultiMarkdown：smart typography | `smart` | Need to be turned on`smart` | Parsing, display and original text are retained; text can be edited directly |
| 60 | MultiMarkdown：table of contents | `toc_directives` | Available by default | Full table of contents |
| 61 | MultiMarkdown：table of contents | `toc_directives` | Available by default | N represents the title level, N-M represents the scope |
| 62 | MultiMarkdown：table | `mmd_tables` | Available by default | Unified structured tables; direct editing of cells/captions, retaining group headers, cross-row and cross-column content, partitions, and multi-row content; new controls for merging cells to be implemented |

<a id="扩展接受范围与默认值"></a>

## Accepted extensions and defaults

“Open the door=Accept and open by default, link to link=It's open, man.—”=The original didn't accept the switch.Notion codec Independence, only providing accessed originalsNotdown Switches and tasks, deleting lines, dollar formula.Typora/Obsidian YesNotdown Product pre-set, notPandoc ofreader The name.

| Expand | typora | obsidian | notion-markdown | commonmark | gfm | markdown | commonmark_x | markdown_strict | markdown_phpextra | markdown_mmd | markdown_github |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `alerts` | open | open | — | close | open | close | open | close | close | close | open |
| `highlight` | open | open | — | close | close | close | close | close | close | close | close |
| `comments` | close | open | — | close | close | close | close | close | close | close | close |
| `toc_directives` | open | open | — | close | close | close | close | close | close | open | close |
| `diagrams` | open | open | — | close | close | close | close | close | close | close | close |
| `html_embed` | open | close | — | close | close | close | close | close | close | close | close |
| `header_attributes` | open | open | — | — | — | open | — | close | open | close | close |
| `link_attributes` | open | open | — | — | — | open | — | close | open | close | close |
| `fenced_code_attributes` | open | open | — | — | — | open | — | close | close | close | close |
| `mmd_link_attributes` | close | close | — | — | — | close | — | close | close | open | close |
| `markdown_attribute` | close | close | — | — | — | close | — | close | open | open | close |
| `auto_identifiers` | open | open | — | — | — | open | — | close | close | open | open |
| `mmd_header_identifiers` | close | close | — | — | — | close | — | close | close | open | close |
| `implicit_header_references` | close | close | — | close | close | open | open | close | close | open | close |
| `short_subsuperscripts` | close | close | — | — | — | close | — | close | close | open | close |
| `tex_math_double_backslash` | close | close | — | — | — | close | — | close | close | open | close |
| `raw_attribute` | close | close | — | close | close | open | open | close | close | open | close |
| `implicit_figures` | close | close | — | close | close | open | close | close | close | open | close |
| `mmd_tables` | close | close | — | close | close | close | close | close | close | open | close |
| `mmd_abbreviations` | close | close | — | close | close | close | close | close | close | open | close |
| `mmd_citations` | close | close | — | close | close | close | close | close | close | open | close |
| `critic_markup` | close | close | — | close | close | close | close | close | close | open | close |
| `transclusion` | close | open | — | close | close | close | close | close | close | open | close |
| `glossary` | close | close | — | close | close | close | close | close | close | open | close |
| `metadata_values` | open | open | — | close | close | close | close | close | close | open | close |
| `metadata_variables` | close | close | — | close | close | close | close | close | close | open | close |
| `typora_loose_lists` | open | close | — | close | close | close | close | close | close | close | close |
| `blank_before_header` | close | — | — | — | — | open | — | close | close | close | close |
| `blank_before_blockquote` | close | — | — | — | — | open | — | close | close | close | close |
| `space_in_atx_header` | close | — | — | — | — | open | — | close | close | close | open |
| `lists_without_preceding_blankline` | open | — | — | — | — | close | — | close | close | close | open |
| `startnum` | open | — | — | — | — | open | — | close | close | close | close |
| `backtick_code_blocks` | open | — | — | — | — | open | — | close | close | open | open |
| `fenced_code_blocks` | open | — | — | — | — | open | — | close | open | close | open |
| `escaped_line_breaks` | open | — | — | — | — | open | — | close | close | close | close |
| `all_symbols_escapable` | open | — | — | — | — | open | — | close | close | open | open |
| `intraword_underscores` | open | — | — | — | — | open | — | close | open | open | open |
| `ignore_line_breaks` | close | close | — | — | — | close | — | close | close | close | close |
| `smart` | open | close | — | close | close | open | open | close | close | close | close |
| `subscript` | open | close | — | close | close | open | open | close | close | open | close |
| `superscript` | open | close | — | close | close | open | open | close | close | open | close |
| `abbreviations` | close | close | — | — | — | close | — | close | open | close | close |
| `emoji` | open | open | — | close | open | close | open | close | close | close | open |
| `yaml_metadata_block` | open | open | — | close | open | open | open | close | close | close | close |
| `pandoc_title_block` | close | close | — | — | — | open | — | close | close | close | close |
| `mmd_title_block` | close | close | — | — | — | close | — | close | close | open | close |
| `raw_html` | open | open | — | open | open | open | open | open | open | open | open |
| `definition_lists` | close | close | — | close | close | open | open | close | open | open | close |
| `footnotes` | open | open | — | close | open | open | open | close | open | open | open |
| `line_blocks` | close | close | — | close | close | open | close | close | close | close | close |
| `fenced_divs` | close | close | — | close | close | open | open | close | close | close | close |
| `pipe_tables` | open | open | — | close | open | open | open | close | open | open | open |
| `strikeout` | open | open | open | close | open | open | open | close | close | close | open |
| `task_lists` | open | open | open | close | open | open | open | close | close | close | open |
| `autolink_bare_uris` | open | open | — | close | open | close | close | close | close | close | open |
| `hard_line_breaks` | open | open | — | close | close | close | close | close | close | close | close |
| `tex_math_dollars` | open | open | open | close | open | open | open | close | close | open | close |
| `wikilinks_title_after_pipe` | close | open | — | close | close | close | close | close | close | close | close |
| `notdown_columns` | close | close | open | close | close | close | close | close | close | close | close |
| `notdown_callouts` | close | close | open | close | close | close | close | close | close | close | close |
| `notdown_toggles` | close | close | open | close | close | close | close | close | close | close | close |
| `notdown_tables` | close | close | open | close | close | close | close | close | close | close | close |
| `notdown_pages` | close | close | open | close | close | close | close | close | close | close | close |
| `notdown_mentions` | close | close | open | close | close | close | close | close | close | close | close |
| `notdown_media` | close | close | open | close | close | close | close | close | close | close | close |
| `notdown_databases` | close | close | open | close | close | close | close | close | close | close | close |
| `notdown_synced` | close | close | open | close | close | close | close | close | close | close | close |
| `notdown_toc` | close | close | open | close | close | close | close | close | close | close | close |
| `notdown_nesting` | close | close | open | close | close | close | close | close | close | close | close |
| `notdown_colors` | close | close | open | close | close | close | close | close | close | close | close |

<a id="明确边界"></a>

## Explicit limitations

- 62 is the specific grammar acceptance range this time, not the full grammar consistency guarantee for Typora, Obsidian, PHP Extra and MMD. Not yet connected to the Obsidian plug-ins API, Dataview, full vault links/media parsing, or CSS themes.
- sequence/flow adapts to common nodes, messages and connections, and is not equal to the complete js-sequence-diagrams/flowchart.js engine; unsupported statements will display errors or fall back to the source code. Mermaid loads for first use and may still be slow on complex graphs; there are no large document performance benchmarks, Worker or true incremental parsing yet.
- Citation supports MMD definitions, inline entries, locators and BibTeX files in the vault. Currently, fixed formats such as author/year/title are used; there is no citeproc, any CSL style, and the complete BibTeX macro language. The keys must be the same. The metadata does not override any MMD output control instructions.
- transclusion only reads files/pages in the vault; rejects out-of-bounds paths, out-of-bounds symbolic links, loops and deep nesting. Single file 256 KB, expands about 512 KB, up to 8 levels. Embedding is a read-only projection, and the embedded file is not written back.
- The attribute retains the complete original value, but only applies the allowed ID, class, lang, title, width and height. ID/class is prefixed, any CSS, events and global styles are not executed. iframe is individually enabled and isolated, and there is no guarantee that the target website will allow embedding.
- HTML static export retains code for charts, iframe retains links, and file embedding retains paths; external resources will not be secretly read during export. The browser interactive preview is richer. Original TeX blocks remain code; math formulas go to KaTeX.
- The full set of Pandoc simple/multi-row/grid tables, fancy/example lists, inline_notes, raw_tex, native_divs, full citations/citeproc and Pandoc JSON AST bidirectional conversions are still not implemented. Unregistered switches are placed in a single column on the panel and are not executed.

<a id="参考与代码"></a>

## References and code

Compares the [ Pandoc 3.11 Markdown reader ](https://github.com/jgm/pandoc/blob/3.11/src/Text/Pandoc/Readers/Markdown.hs) rules for referenceKey , attributes , header , superscript/subscript , and short_subsuperscripts , and the [ Extensions default value ](https://github.com/jgm/pandoc/blob/3.11/src/Text/Pandoc/Extensions.hs) . Take the rules and implement them in TypeScript, without copying Haskell reader or running it as a key-by-key editing kernel.

Complex tables use [ markdown-it-multimd-table ](https://github.com/redbug312/markdown-it-multimd-table) and charts use local [ Mermaid ](https://mermaid.js.org/config/usage). The directory level range is [ MultiMarkdown official directory description ](https://fletcher.github.io/MultiMarkdown-6/syntax/toc.html); a single N is limited to this level. Product rules are in src/markdown-engine/products.ts; preview is in product-view.ts, and file parsing is in server/syntax-files.ts.

Acceptance documents: tests/unit/product-syntax.test.ts, tests/unit/syntax-files.test.ts, tests/e2e/product-syntax.spec.ts. For complete running results, see [ verification record ](../verification/VERIFICATION.md).
