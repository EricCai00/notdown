<a id="pandoc-与-notdown-扩展方言完整对照"></a>

# Pandoc extension switch matrix

**English** · [简体中文](PANDOC-EXTENSIONS-MATRIX.zh-CN.md)

> The following table is a snapshot of the workbook reference for 2026-09-20 and is not the current implementation status. Starting from 2026-09-22, 103 Markdown extensions have local execution paths, 12 and Outside Markdown scope items are not enabled; notdown_* has been standardized as notion_* and compatible aliases are retained. Please use Block Explorer for current status and bidirectional relationships; see [ Local Objects and Services ](LOCAL-OBJECTS.md) for execution boundaries.

For a comparison of 87 items × 11 dialects organized by content type (block, inline, metadata, application capabilities), see [ content capabilities and Notdown implementation table ](CONTENT-CAPABILITIES.md).

The date of verification:2026-09-20。Re-downloaded[The official manual](https://pandoc.org/MANUAL.html)The first is to run the Pandoc 3.11 on the home computer. `--list-extensions=<variant>`The results of eight languages and [There are photos.](../data/pandoc-3.11-extensions.json) Consistency. Pandoc is listed as 3.11; Notdown directly reads the current native registry `supportsOption` with `enabled`The same is true for other versions.

**Pandoc is a s Markdown `markdown`No, not at all. `commonmark_x`。** The latter isCommonMark Another one that expandedreader The extension is a built-in format switch, not a plug-in that needs to be installed individually.

91 `Extension:` sections → 88 different names in the title (including shared titles and cross-format repetition) → add `wikilinks_title_before_pipe` in the text, a total of **89 items**. Among them, **77 items** are accepted by at least one Markdown dialect, and **12 items** are not accepted by any Markdown dialects.

<a id="表格说明"></a>

## Table conventions

This table has a total of **115 items = 89 items Pandoc manual extension + 26 items Notdown other registered extensions**, covering Notdown connected **11 native dialects**. There are subset boundaries for native adaptation, which does not represent a complete replica of the corresponding product or Pandoc reader.

- **open**Accept and open by default.
- **Yes**The following is the list of the most commonly used methods of calculating the value of a currency.
- **—**：Not accepting the name switch; not without the corresponding basic grammar.
- Eight Pandoc dialects used in the same way **The first is the Pandoc/Notdown.** Double values. For example **On/—** The default Pandoc switch is on, and the original Notdown switch is not accessible.**—/Yes** The following is a list ofPandoc I'm not going to.Notdown The original can open its own expansion.
- **Typora、Obsidian、Notion** The three columns only represent the native configuration of Notdown, not the official capabilities of the corresponding external software or Pandoc reader.
- **Source**List of clearly marked barsPandoc Handbook of the yearNotdown Product expansion pipelineNotdown Notion The second category is notPandoc The name of the built-in extension.
- **Registered**Only indicate the existence of a term of the same name in the native register and do not guarantee its full meaning;**Not registered**It is not a problem.Markdown Lab CallingPandoc；**Not MD**The codex format is not accepted in all eight Pandoc Markdown formats.

P = `markdown`; S = `markdown_strict`; E = `markdown_phpextra`; M = `markdown_mmd`; GH = `markdown_github` (deprecated); C = `commonmark`; GFM = `gfm`; CX = `commonmark_x`; Notion = `notion-markdown`.

The native default value uses the empty override configuration `extensions: {}`, not counting the user settings saved on a certain page, nor the override value added by `defaultSyntax()` to create a new ordinary Markdown page. The switch of Pandoc is set through `+名称/-名称`; Notdown's own extension uses application configuration and cannot be passed to Pandoc.

The following quantity summary still uses the **89 item Pandoc manual extension and Pandoc itself** as the statistical scope:

| Dialect | On by default | Off by default, can be turned on | Not accepted |
| --- | ---: | ---: | ---: |
| `markdown` | 47 | 27 | 15 |
| `markdown_strict` | 3 | 71 | 15 |
| `markdown_phpextra` | 12 | 62 | 15 |
| `markdown_mmd` | 22 | 52 | 15 |
| `markdown_github` | 17 | 57 | 15 |
| `commonmark` | 1 | 29 | 59 |
| `gfm` | 12 | 18 | 59 |
| `commonmark_x` | 20 | 10 | 59 |

<a id="全部-115-项总表"></a>

## Complete table of 115 items

Each of the eight Pandoc dialects is **Pandoc / Notdown native** (P/N), and the latter three dialects are only listed in the native state. Pandoc data comes from CLI snapshots, and native data comes from [ configurations implementing ](../../src/markdown-engine/config.ts). For functional explanation and reading and writing directions, see [ Pandoc detailed description ](PANDOC-EXTENSIONS.md) and [ Notdown product syntax description ](PRODUCT-SYNTAX.md).

| Expand | Source | P（P/N） | S（P/N） | E（P/N） | M（P/N） | GH（P/N） | C（P/N） | GFM（P/N） | CX（P/N） | Typora | Obsidian | Notion | Native registration |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [abbreviations](https://pandoc.org/MANUAL.html#extension-abbreviations) | Pandoc manual | Yes/Can | Yes/Can | on/on | Yes/Can | Yes/Can | —/— | —/— | —/— | Yes | Yes | — | Registered |
| [alerts](https://pandoc.org/MANUAL.html#extension-alerts) | Pandoc manual | Yes/Can | Yes/Can | Yes/Can | Yes/Can | on/on | Yes/Can | on/on | on/on | open | open | — | Registered |
| [all_symbols_escapable](https://pandoc.org/MANUAL.html#extension-all_symbols_escapable) | Pandoc manual | on/on | Yes/Can | Yes/Can | on/on | on/on | —/— | —/— | —/— | Yes | — | — | Registered |
| [amuse](https://pandoc.org/MANUAL.html#extension-amuse) | Pandoc manual | —/— | —/— | —/— | —/— | —/— | —/— | —/— | —/— | — | — | — | Not MD |
| [angle_brackets_escapable](https://pandoc.org/MANUAL.html#extension-angle_brackets_escapable) | Pandoc manual | Yes/— | Yes/— | Yes/— | Yes/— | Yes/— | —/— | —/— | —/— | — | — | — | Not registered |
| [ascii_identifiers](https://pandoc.org/MANUAL.html#extension-ascii_identifiers) | Pandoc manual | Yes/— | Yes/— | Yes/— | Yes/— | Yes/— | Yes/— | Yes/— | Yes/— | — | — | — | Not registered |
| [attributes](https://pandoc.org/MANUAL.html#extension-attributes) | Pandoc manual | —/— | —/— | —/— | —/— | —/— | Yes/— | Yes/— | On/— | — | — | — | Not registered |
| [auto_identifiers](https://pandoc.org/MANUAL.html#extension-auto_identifiers) | Pandoc manual | on/on | Yes/Can | Yes/Can | on/on | on/on | —/— | —/— | —/— | open | open | — | Registered |
| [autolink_bare_uris](https://pandoc.org/MANUAL.html#extension-autolink_bare_uris) | Pandoc manual | Yes/Can | Yes/Can | Yes/Can | Yes/Can | on/on | Yes/Can | on/on | Yes/Can | open | open | — | Registered |
| [backtick_code_blocks](https://pandoc.org/MANUAL.html#extension-backtick_code_blocks) | Pandoc manual | on/on | Yes/Can | Yes/Can | on/on | on/on | —/— | —/— | —/— | open | — | — | Registered |
| [blank_before_blockquote](https://pandoc.org/MANUAL.html#extension-blank_before_blockquote) | Pandoc manual | on/on | Yes/Can | Yes/Can | Yes/Can | Yes/Can | —/— | —/— | —/— | Yes | — | — | Registered |
| [blank_before_header](https://pandoc.org/MANUAL.html#extension-blank_before_header) | Pandoc manual | on/on | Yes/Can | Yes/Can | Yes/Can | Yes/Can | —/— | —/— | —/— | Yes | — | — | Registered |
| [bracketed_spans](https://pandoc.org/MANUAL.html#extension-bracketed_spans) | Pandoc manual | On/— | Yes/— | Yes/— | Yes/— | Yes/— | Yes/— | Yes/— | On/— | — | — | — | Not registered |
| [citations](https://pandoc.org/MANUAL.html#typst-citations) | Pandoc manual | On/— | Yes/— | Yes/— | Yes/— | Yes/— | —/— | —/— | —/— | — | — | — | Not registered |
| [definition_lists](https://pandoc.org/MANUAL.html#extension-definition_lists) | Pandoc manual | on/on | Yes/Can | on/on | on/on | Yes/Can | Yes/Can | Yes/Can | on/on | Yes | Yes | — | Registered |
| [east_asian_line_breaks](https://pandoc.org/MANUAL.html#extension-east_asian_line_breaks) | Pandoc manual | Yes/— | Yes/— | Yes/— | Yes/— | Yes/— | Yes/— | Yes/— | Yes/— | — | — | — | Not registered |
| [element_citations](https://pandoc.org/MANUAL.html#extension-element_citations) | Pandoc manual | —/— | —/— | —/— | —/— | —/— | —/— | —/— | —/— | — | — | — | Not MD |
| [emoji](https://pandoc.org/MANUAL.html#extension-emoji) | Pandoc manual | Yes/Can | Yes/Can | Yes/Can | Yes/Can | on/on | Yes/Can | on/on | on/on | open | open | — | Registered |
| [empty_paragraphs](https://pandoc.org/MANUAL.html#extension-empty_paragraphs) | Pandoc manual | —/— | —/— | —/— | —/— | —/— | —/— | —/— | —/— | — | — | — | Not MD |
| [escaped_line_breaks](https://pandoc.org/MANUAL.html#extension-escaped_line_breaks) | Pandoc manual | on/on | Yes/Can | Yes/Can | Yes/Can | Yes/Can | —/— | —/— | —/— | open | — | — | Registered |
| [example_lists](https://pandoc.org/MANUAL.html#extension-example_lists) | Pandoc manual | On/— | Yes/— | Yes/— | Yes/— | Yes/— | —/— | —/— | —/— | — | — | — | Not registered |
| [fancy_lists](https://pandoc.org/MANUAL.html#org-fancy-lists) | Pandoc manual | On/— | Yes/— | Yes/— | Yes/— | Yes/— | Yes/— | Yes/— | On/— | — | — | — | Not registered |
| [fenced_code_attributes](https://pandoc.org/MANUAL.html#extension-fenced_code_attributes) | Pandoc manual | on/on | Yes/Can | Yes/Can | Yes/Can | Yes/Can | —/— | —/— | —/— | open | open | — | Registered |
| [fenced_code_blocks](https://pandoc.org/MANUAL.html#extension-fenced_code_blocks) | Pandoc manual | on/on | Yes/Can | on/on | Yes/Can | on/on | —/— | —/— | —/— | open | — | — | Registered |
| [fenced_divs](https://pandoc.org/MANUAL.html#extension-fenced_divs) | Pandoc manual | on/on | Yes/Can | Yes/Can | Yes/Can | Yes/Can | Yes/Can | Yes/Can | on/on | Yes | Yes | — | Registered |
| [footnotes](https://pandoc.org/MANUAL.html#extension-footnotes) | Pandoc manual | on/on | Yes/Can | on/on | on/on | on/on | Yes/Can | on/on | on/on | open | open | — | Registered |
| [four_space_rule](https://pandoc.org/MANUAL.html#extension-four_space_rule) | Pandoc manual | Yes/— | Yes/— | Yes/— | Yes/— | Yes/— | —/— | —/— | —/— | — | — | — | Not registered |
| [gfm_auto_identifiers](https://pandoc.org/MANUAL.html#extension-gfm_auto_identifiers) | Pandoc manual | Yes/— | Yes/— | Yes/— | Yes/— | On/— | Yes/— | On/— | On/— | — | — | — | Not registered |
| [grid_tables](https://pandoc.org/MANUAL.html#extension-grid_tables) | Pandoc manual | On/— | Yes/— | Yes/— | Yes/— | Yes/— | —/— | —/— | —/— | — | — | — | Not registered |
| [gutenberg](https://pandoc.org/MANUAL.html#extension-gutenberg) | Pandoc manual | Yes/— | Yes/— | Yes/— | Yes/— | Yes/— | —/— | —/— | —/— | — | — | — | Not registered |
| [hard_line_breaks](https://pandoc.org/MANUAL.html#extension-hard_line_breaks) | Pandoc manual | Yes/Can | Yes/Can | Yes/Can | Yes/Can | Yes/Can | Yes/Can | Yes/Can | Yes/Can | open | open | — | Registered |
| [header_attributes](https://pandoc.org/MANUAL.html#extension-header_attributes) | Pandoc manual | on/on | Yes/Can | on/on | Yes/Can | Yes/Can | —/— | —/— | —/— | open | open | — | Registered |
| [ignore_line_breaks](https://pandoc.org/MANUAL.html#extension-ignore_line_breaks) | Pandoc manual | Yes/Can | Yes/Can | Yes/Can | Yes/Can | Yes/Can | —/— | —/— | —/— | Yes | Yes | — | Registered |
| [implicit_figures](https://pandoc.org/MANUAL.html#extension-implicit_figures) | Pandoc manual | on/on | Yes/Can | Yes/Can | on/on | Yes/Can | Yes/Can | Yes/Can | Yes/Can | Yes | Yes | — | Registered |
| [implicit_header_references](https://pandoc.org/MANUAL.html#extension-implicit_header_references) | Pandoc manual | on/on | Yes/Can | Yes/Can | on/on | Yes/Can | Yes/Can | Yes/Can | on/on | Yes | Yes | — | Registered |
| [inline_code_attributes](https://pandoc.org/MANUAL.html#extension-inline_code_attributes) | Pandoc manual | On/— | Yes/— | Yes/— | Yes/— | Yes/— | —/— | —/— | —/— | — | — | — | Not registered |
| [inline_notes](https://pandoc.org/MANUAL.html#extension-inline_notes) | Pandoc manual | On/— | Yes/— | Yes/— | Yes/— | Yes/— | —/— | —/— | —/— | — | — | — | Not registered |
| [intraword_underscores](https://pandoc.org/MANUAL.html#extension-intraword_underscores) | Pandoc manual | on/on | Yes/Can | on/on | on/on | on/on | —/— | —/— | —/— | open | — | — | Registered |
| [latex_macros](https://pandoc.org/MANUAL.html#extension-latex_macros) | Pandoc manual | On/— | Yes/— | Yes/— | Yes/— | Yes/— | —/— | —/— | —/— | — | — | — | Not registered |
| [line_blocks](https://pandoc.org/MANUAL.html#extension-line_blocks) | Pandoc manual | on/on | Yes/Can | Yes/Can | Yes/Can | Yes/Can | —/Yes | —/Yes | —/Yes | Yes | Yes | — | Registered |
| [link_attributes](https://pandoc.org/MANUAL.html#extension-link_attributes) | Pandoc manual | on/on | Yes/Can | on/on | Yes/Can | Yes/Can | —/— | —/— | —/— | open | open | — | Registered |
| [lists_without_preceding_blankline](https://pandoc.org/MANUAL.html#extension-lists_without_preceding_blankline) | Pandoc manual | Yes/Can | Yes/Can | Yes/Can | Yes/Can | on/on | —/— | —/— | —/— | open | — | — | Registered |
| [literate_haskell](https://pandoc.org/MANUAL.html#extension-literate_haskell) | Pandoc manual | Yes/— | Yes/— | Yes/— | Yes/— | Yes/— | —/— | —/— | —/— | — | — | — | Not registered |
| [mark](https://pandoc.org/MANUAL.html#extension-mark) | Pandoc manual | Yes/— | Yes/— | Yes/— | Yes/— | Yes/— | —/— | —/— | —/— | — | — | — | Not registered |
| [markdown_attribute](https://pandoc.org/MANUAL.html#extension-markdown_attribute) | Pandoc manual | Yes/Can | Yes/Can | on/on | on/on | Yes/Can | —/— | —/— | —/— | Yes | Yes | — | Registered |
| [markdown_in_html_blocks](https://pandoc.org/MANUAL.html#extension-markdown_in_html_blocks) | Pandoc manual | On/— | Yes/— | Yes/— | Yes/— | Yes/— | —/— | —/— | —/— | — | — | — | Not registered |
| [mmd_header_identifiers](https://pandoc.org/MANUAL.html#extension-mmd_header_identifiers) | Pandoc manual | Yes/Can | Yes/Can | Yes/Can | on/on | Yes/Can | —/— | —/— | —/— | Yes | Yes | — | Registered |
| [mmd_link_attributes](https://pandoc.org/MANUAL.html#extension-mmd_link_attributes) | Pandoc manual | Yes/Can | Yes/Can | Yes/Can | on/on | Yes/Can | —/— | —/— | —/— | Yes | Yes | — | Registered |
| [mmd_title_block](https://pandoc.org/MANUAL.html#extension-mmd_title_block) | Pandoc manual | Yes/Can | Yes/Can | Yes/Can | on/on | Yes/Can | —/— | —/— | —/— | Yes | Yes | — | Registered |
| [multiline_tables](https://pandoc.org/MANUAL.html#extension-multiline_tables) | Pandoc manual | On/— | Yes/— | Yes/— | Yes/— | Yes/— | —/— | —/— | —/— | — | — | — | Not registered |
| [native_divs](https://pandoc.org/MANUAL.html#extension-native_divs) | Pandoc manual | On/— | Yes/— | Yes/— | Yes/— | Yes/— | —/— | —/— | —/— | — | — | — | Not registered |
| [native_numbering](https://pandoc.org/MANUAL.html#extension-native_numbering) | Pandoc manual | —/— | —/— | —/— | —/— | —/— | —/— | —/— | —/— | — | — | — | Not MD |
| [native_spans](https://pandoc.org/MANUAL.html#extension-native_spans) | Pandoc manual | On/— | Yes/— | Yes/— | Yes/— | Yes/— | —/— | —/— | —/— | — | — | — | Not registered |
| [ntb](https://pandoc.org/MANUAL.html#extension-ntb) | Pandoc manual | —/— | —/— | —/— | —/— | —/— | —/— | —/— | —/— | — | — | — | Not MD |
| [old_dashes](https://pandoc.org/MANUAL.html#extension-old_dashes) | Pandoc manual | Yes/— | Yes/— | Yes/— | Yes/— | Yes/— | —/— | —/— | —/— | — | — | — | Not registered |
| [pandoc_title_block](https://pandoc.org/MANUAL.html#extension-pandoc_title_block) | Pandoc manual | on/on | Yes/Can | Yes/Can | Yes/Can | Yes/Can | —/— | —/— | —/— | Yes | Yes | — | Registered |
| [pipe_tables](https://pandoc.org/MANUAL.html#extension-pipe_tables) | Pandoc manual | on/on | Yes/Can | on/on | on/on | on/on | Yes/Can | on/on | on/on | open | open | — | Registered |
| [raw_attribute](https://pandoc.org/MANUAL.html#extension-raw_attribute) | Pandoc manual | on/on | Yes/Can | Yes/Can | on/on | Yes/Can | Yes/Can | Yes/Can | on/on | Yes | Yes | — | Registered |
| [raw_html](https://pandoc.org/MANUAL.html#extension-raw_html) | Pandoc manual | on/on | on/on | on/on | on/on | on/on | on/on | on/on | on/on | open | open | — | Registered |
| [raw_markdown](https://pandoc.org/MANUAL.html#extension-raw_markdown) | Pandoc manual | —/— | —/— | —/— | —/— | —/— | —/— | —/— | —/— | — | — | — | Not MD |
| [raw_tex](https://pandoc.org/MANUAL.html#extension-raw_tex) | Pandoc manual | On/— | Yes/— | Yes/— | Yes/— | Yes/— | —/— | —/— | —/— | — | — | — | Not registered |
| [rebase_relative_paths](https://pandoc.org/MANUAL.html#extension-rebase_relative_paths) | Pandoc manual | Yes/— | Yes/— | Yes/— | Yes/— | Yes/— | Yes/— | Yes/— | Yes/— | — | — | — | Not registered |
| [short_subsuperscripts](https://pandoc.org/MANUAL.html#extension-short_subsuperscripts) | Pandoc manual | Yes/Can | Yes/Can | Yes/Can | on/on | Yes/Can | —/— | —/— | —/— | Yes | Yes | — | Registered |
| [shortcut_reference_links](https://pandoc.org/MANUAL.html#extension-shortcut_reference_links) | Pandoc manual | On/— | On/— | On/— | On/— | On/— | —/— | —/— | —/— | — | — | — | Not registered |
| [simple_tables](https://pandoc.org/MANUAL.html#extension-simple_tables) | Pandoc manual | On/— | Yes/— | Yes/— | Yes/— | Yes/— | —/— | —/— | —/— | — | — | — | Not registered |
| [smart](https://pandoc.org/MANUAL.html#extension-smart) | Pandoc manual | on/on | Yes/Can | Yes/Can | Yes/Can | Yes/Can | Yes/Can | Yes/Can | on/on | Yes | Yes | — | Registered |
| [smart_quotes](https://pandoc.org/MANUAL.html#extension-smart_quotes-org) | Pandoc manual | —/— | —/— | —/— | —/— | —/— | —/— | —/— | —/— | — | — | — | Not MD |
| [sourcepos](https://pandoc.org/MANUAL.html#extension-sourcepos) | Pandoc manual | —/— | —/— | —/— | —/— | —/— | Yes/— | Yes/— | Yes/— | — | — | — | Not registered |
| [space_in_atx_header](https://pandoc.org/MANUAL.html#extension-space_in_atx_header) | Pandoc manual | on/on | Yes/Can | Yes/Can | Yes/Can | on/on | —/— | —/— | —/— | Yes | — | — | Registered |
| [spaced_reference_links](https://pandoc.org/MANUAL.html#extension-spaced_reference_links) | Pandoc manual | Yes/— | On/— | On/— | On/— | Yes/— | —/— | —/— | —/— | — | — | — | Not registered |
| [special_strings](https://pandoc.org/MANUAL.html#extension-special_strings-org) | Pandoc manual | —/— | —/— | —/— | —/— | —/— | —/— | —/— | —/— | — | — | — | Not MD |
| [startnum](https://pandoc.org/MANUAL.html#extension-startnum) | Pandoc manual | on/on | Yes/Can | Yes/Can | Yes/Can | Yes/Can | —/— | —/— | —/— | open | — | — | Registered |
| [strikeout](https://pandoc.org/MANUAL.html#extension-strikeout) | Pandoc manual | on/on | Yes/Can | Yes/Can | Yes/Can | on/on | Yes/Can | on/on | on/on | open | open | open | Registered |
| [styles](https://pandoc.org/MANUAL.html#ext-styles) | Pandoc manual | —/— | —/— | —/— | —/— | —/— | —/— | —/— | —/— | — | — | — | Not MD |
| [subscript](https://pandoc.org/MANUAL.html#extension-superscript-subscript) | Pandoc manual | on/on | Yes/Can | Yes/Can | on/on | Yes/Can | Yes/Can | Yes/Can | on/on | open | Yes | — | Registered |
| [superscript](https://pandoc.org/MANUAL.html#extension-superscript-subscript) | Pandoc manual | on/on | Yes/Can | Yes/Can | on/on | Yes/Can | Yes/Can | Yes/Can | on/on | open | Yes | — | Registered |
| [table_attributes](https://pandoc.org/MANUAL.html#extension-table_attributes) | Pandoc manual | On/— | Yes/— | Yes/— | Yes/— | Yes/— | —/— | —/— | —/— | — | — | — | Not registered |
| [table_captions](https://pandoc.org/MANUAL.html#extension-table_captions) | Pandoc manual | On/— | Yes/— | Yes/— | Yes/— | Yes/— | —/— | —/— | —/— | — | — | — | Not registered |
| [tagging](https://pandoc.org/MANUAL.html#extension--tagging) | Pandoc manual | —/— | —/— | —/— | —/— | —/— | —/— | —/— | —/— | — | — | — | Not MD |
| [task_lists](https://pandoc.org/MANUAL.html#extension-task_lists) | Pandoc manual | on/on | Yes/Can | Yes/Can | Yes/Can | on/on | Yes/Can | on/on | on/on | open | open | open | Registered |
| [tex_math_dollars](https://pandoc.org/MANUAL.html#extension-tex_math_dollars) | Pandoc manual | on/on | Yes/Can | Yes/Can | on/on | Yes/Can | Yes/Can | on/on | on/on | open | open | open | Registered |
| [tex_math_double_backslash](https://pandoc.org/MANUAL.html#extension-tex_math_double_backslash) | Pandoc manual | Yes/Can | Yes/Can | Yes/Can | on/on | Yes/Can | —/— | —/— | —/— | Yes | Yes | — | Registered |
| [tex_math_gfm](https://pandoc.org/MANUAL.html#extension-tex_math_gfm) | Pandoc manual | —/— | —/— | —/— | —/— | —/— | Yes/— | On/— | Yes/— | — | — | — | Not registered |
| [tex_math_single_backslash](https://pandoc.org/MANUAL.html#extension-tex_math_single_backslash) | Pandoc manual | Yes/— | Yes/— | Yes/— | Yes/— | Yes/— | —/— | —/— | —/— | — | — | — | Not registered |
| [wikilinks_title_after_pipe](https://pandoc.org/MANUAL.html#extension-wikilinks_title_after_pipe) | Pandoc manual | Yes/Can | Yes/Can | Yes/Can | Yes/Can | Yes/Can | Yes/Can | Yes/Can | Yes/Can | Yes | open | — | Registered |
| [wikilinks_title_before_pipe](https://pandoc.org/MANUAL.html#extension-wikilinks_title_after_pipe) | Pandoc manual | Yes/— | Yes/— | Yes/— | Yes/— | Yes/— | Yes/— | Yes/— | Yes/— | — | — | — | Not registered |
| [xrefs_name](https://pandoc.org/MANUAL.html#extension-xrefs_name) | Pandoc manual | —/— | —/— | —/— | —/— | —/— | —/— | —/— | —/— | — | — | — | Not MD |
| [xrefs_number](https://pandoc.org/MANUAL.html#extension-xrefs_number) | Pandoc manual | —/— | —/— | —/— | —/— | —/— | —/— | —/— | —/— | — | — | — | Not MD |
| [yaml_metadata_block](https://pandoc.org/MANUAL.html#extension-yaml_metadata_block) | Pandoc manual | on/on | Yes/Can | Yes/Can | Yes/Can | Yes/Can | Yes/Can | on/on | on/on | open | open | — | Registered |
| `highlight` | **Notdown Product Extension** | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | open | open | — | Registered |
| `comments` | **Notdown Product Extension** | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | Yes | open | — | Registered |
| `toc_directives` | **Notdown Product Extension** | —/Yes | —/Yes | —/Yes | —/on | —/Yes | —/Yes | —/Yes | —/Yes | open | open | — | Registered |
| `diagrams` | **Notdown Product Extension** | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | open | open | — | Registered |
| `html_embed` | **Notdown Product Extension** | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | open | Yes | — | Registered |
| `mmd_tables` | **Notdown Product Extension** | —/Yes | —/Yes | —/Yes | —/on | —/Yes | —/Yes | —/Yes | —/Yes | Yes | Yes | — | Registered |
| `mmd_abbreviations` | **Notdown Product Extension** | —/Yes | —/Yes | —/Yes | —/on | —/Yes | —/Yes | —/Yes | —/Yes | Yes | Yes | — | Registered |
| `mmd_citations` | **Notdown Product Extension** | —/Yes | —/Yes | —/Yes | —/on | —/Yes | —/Yes | —/Yes | —/Yes | Yes | Yes | — | Registered |
| `critic_markup` | **Notdown Product Extension** | —/Yes | —/Yes | —/Yes | —/on | —/Yes | —/Yes | —/Yes | —/Yes | Yes | Yes | — | Registered |
| `transclusion` | **Notdown Product Extension** | —/Yes | —/Yes | —/Yes | —/on | —/Yes | —/Yes | —/Yes | —/Yes | Yes | open | — | Registered |
| `glossary` | **Notdown Product Extension** | —/Yes | —/Yes | —/Yes | —/on | —/Yes | —/Yes | —/Yes | —/Yes | Yes | Yes | — | Registered |
| `metadata_values` | **Notdown Product Extension** | —/Yes | —/Yes | —/Yes | —/on | —/Yes | —/Yes | —/Yes | —/Yes | open | open | — | Registered |
| `metadata_variables` | **Notdown Product Extension** | —/Yes | —/Yes | —/Yes | —/on | —/Yes | —/Yes | —/Yes | —/Yes | Yes | Yes | — | Registered |
| `typora_loose_lists` | **Notdown Product Extension** | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | open | Yes | — | Registered |
| `notdown_columns` | **Notdown Notion extension** | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | Yes | Yes | open | Registered |
| `notdown_callouts` | **Notdown Notion extension** | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | Yes | Yes | open | Registered |
| `notdown_toggles` | **Notdown Notion extension** | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | Yes | Yes | open | Registered |
| `notdown_tables` | **Notdown Notion extension** | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | Yes | Yes | open | Registered |
| `notdown_pages` | **Notdown Notion extension** | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | Yes | Yes | open | Registered |
| `notdown_mentions` | **Notdown Notion extension** | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | Yes | Yes | open | Registered |
| `notdown_media` | **Notdown Notion extension** | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | Yes | Yes | open | Registered |
| `notdown_databases` | **Notdown Notion extension** | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | Yes | Yes | open | Registered |
| `notdown_synced` | **Notdown Notion extension** | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | Yes | Yes | open | Registered |
| `notdown_toc` | **Notdown Notion extension** | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | Yes | Yes | open | Registered |
| `notdown_nesting` | **Notdown Notion extension** | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | Yes | Yes | open | Registered |
| `notdown_colors` | **Notdown Notion extension** | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | —/Yes | Yes | Yes | open | Registered |

<a id="notdown-的-70-项为何不是-70-个-pandoc-扩展"></a>

## Why Notdown's 70 items are not 70 Pandoc extensions

The current [ native registry ](../../src/markdown-engine/config.ts) has **70 items = 44 items Pandoc extensions with the same name + 26 items product/Notion extension**. 89 − 70 cannot be used to calculate missing items. Checking by name, among the available extensions for the 77 item Markdown, there is also the **33 item that does not have the native registered item** with the same name. This is a difference set at the registration level, not a full functional audit.

Unregistered 33 item:

`ascii_identifiers`、`gfm_auto_identifiers`、`literate_haskell`、`citations`、`fancy_lists`、`example_lists`、`table_captions`、`simple_tables`、`multiline_tables`、`grid_tables`、`table_attributes`、`inline_code_attributes`、`markdown_in_html_blocks`、`native_divs`、`native_spans`、`raw_tex`、`latex_macros`、`shortcut_reference_links`、`bracketed_spans`、`inline_notes`、`rebase_relative_paths`、`mark`、`attributes`、`old_dashes`、`angle_brackets_escapable`、`four_space_rule`、`spaced_reference_links`、`east_asian_line_breaks`、`tex_math_gfm`、`tex_math_single_backslash`、`gutenberg`、`sourcepos`、`wikilinks_title_before_pipe`。

Another 26 product/Notion extension:

`highlight`、`comments`、`toc_directives`、`diagrams`、`html_embed`、`mmd_tables`、`mmd_abbreviations`、`mmd_citations`、`critic_markup`、`transclusion`、`glossary`、`metadata_values`、`metadata_variables`、`typora_loose_lists`、`notdown_columns`、`notdown_callouts`、`notdown_toggles`、`notdown_tables`、`notdown_pages`、`notdown_mentions`、`notdown_media`、`notdown_databases`、`notdown_synced`、`notdown_toc`、`notdown_nesting`、`notdown_colors`。

For example, the native `highlight` and Pandoc's `mark` have overlapping purposes, but they are not switches with the same name and cannot be directly determined to be compatible based on this. Lab and native editors must also be counted separately: Lab has the ability to read Pandoc, and the native editor executes its own codec.

<a id="非-markdown-的-12-项"></a>

## 12 items unavailable to Markdown

These extensions can be used in the corresponding format; the non-Markdown encoding does not mean that Notdown can never provide the relevant input/output capabilities. See read-write direction and respective default values. [Full format description](PANDOC-EXTENSIONS.md)。

| Expand | Format and default value | Purpose/reason for exclusion |
| --- | --- | --- |
| [amuse](https://pandoc.org/MANUAL.html#extension-amuse) | Read `muse`; this format is enabled by default | The syntax convention of Text::Amuse for Emacs Muse belongs to Muse reader. Markdown is not parsed according to the block rules of Muse. |
| [element_citations](https://pandoc.org/MANUAL.html#extension-element_citations) | Write `jats` / `jats_archiving` / `jats_publishing` / `jats_articleauthoring`; default is off | Outputs bibliographic information using the structured citation elements of JATS; the CSL style does not control this output. It determines the target XML structure and does not add Markdown citation syntax. |
| [empty_paragraphs](https://pandoc.org/MANUAL.html#extension-empty_paragraphs) | Manual: read `docx` / `html`; write `docx` / `odt` / `opendocument` / `html` / `latex`; default off | Preserve or output real blank paragraphs. These formats have structures that can be expressed in blank paragraphs;Markdown The blank lines usually separate the block, and cannot be used to convert the switch into the same structure.CLI Other names/The following is a list of the countries of the world:`html4`、`html5`、`epub`、`epub2`、`epub3`、`beamer`The first is that the two-way function is not deduced. |
| [native_numbering](https://pandoc.org/MANUAL.html#extension-native_numbering) | Write `docx` / `odt` / `opendocument`; default is off | Use the native counting fields of office documents to number figures and tables; rely on the field mechanism of the output file format. |
| [ntb](https://pandoc.org/MANUAL.html#extension-ntb) | Write `context`; default off | ChooseConTeXt ofNatural Tables The program is a strategy for targeted spreadsheet generation. |
| [raw_markdown](https://pandoc.org/MANUAL.html#extension-raw_markdown) | Read `ipynb`; default off | Keep the original text of Markdown cell in the notebook as RawBlock and skip the usual Markdown parsing. It controls notebook import, and subsequent output must also be able to handle this raw content. |
| [smart_quotes](https://pandoc.org/MANUAL.html#extension-smart_quotes-org) | Read/write `org`; default off; `smart` includes its role | Separately controls Org smart quote conversion; Markdown uses its own `smart` switch and does not have this Org-specific segment name. |
| [special_strings](https://pandoc.org/MANUAL.html#extension-special_strings-org) | `org`Text conversion; enabled by default; `smart` contains its function | Control Org's processing of special strings such as dashes and ellipses, and work according to the rules of Org. |
| [styles](https://pandoc.org/MANUAL.html#ext-styles) | Read `docx`; default off | Keep DOCX style information as custom style attributes on Div, Span, and Table for subsequent conversion; not web page theme or Markdown highlight style switch. |
| [tagging](https://pandoc.org/MANUAL.html#extension--tagging) | Write `context`; default off | Produced for structural labellingPDF ofConTeXt The following is a list of the most common types of motorcycle engines used in the United States:Markdown The language of the label. |
| [xrefs_name](https://pandoc.org/MANUAL.html#extension-xrefs_name) | Write `odt` / `opendocument`; default off | Use the cross-reference field of the target document to display the name or title; office software is required to update the relevant fields. |
| [xrefs_number](https://pandoc.org/MANUAL.html#extension-xrefs_number) | Write `odt` / `opendocument`; default off | Display numbers using cross-reference fields; relies on numbering configuration and field updates. It controls the export field, not the Markdown double chain. |

Supplement: The same-named sections of `citations` in Typst, Org, and DOCX, and the same-named sections of `fancy_lists` in Org, constitute duplicate entries; the above table is merged by unique extension, and its Markdown status only looks at Markdown reader. Although `gutenberg` is accepted by the Markdown format, its actual function is plain text writer and cannot be used as text editing syntax; `sourcepos` is source location auxiliary information.

<a id="默认开关审计2026-09-20"></a>

## Default-switch audit (2026-09-20)

The conclusion:**The registered Pandoc switch follows the Pandoc 3.11 default, but the overall Notdown boot configuration is not exactly the same as Pandoc.** Re-enactment of CLI queries in eight languages, each with a comparison of blank coverage configurations `enabled()`，The whole thing280 A language of the tongue× The same name extended mix, default inconsistent with0。Both default values are also passed.

| scene | Whether to follow Pandoc | Check results |
| --- | --- | --- |
| Eight Pandoc dialects, native registered switches with the same name, no user override | Yes | Each of the five markdown series has 44 item, and the three CommonMark series have 20 items each, all consistent. |
| Pandoc is enabled by default, and there is no native registration item with the same name. | cannot be considered as having taken effect | markdown has 17 items, strict / phpextra / mmd / github each have 2 items, commonmark 0 items, gfm 2 items, commonmark_x 4 items; the corresponding switch does not take effect natively, and does not assert that all basic syntax is missing. |
| No one has been savedsyntax The commonMarkdown Page | Has extra coverage | Use commonmark, then open strikeout, pipe_tables, task_lists, wikilinks_title_after_pipe and notdown_nesting, notdown_columns, notdown_pages; the first four items are turned off by default in Pandoc commonmark, and the last three items belong to their own extensions |
| Native markdown_mmd | The items with the same name are the same, with additional default items. | toc_directives, mmd_tables, mmd_abbreviations, mmd_citations, critic_markup, transclusion, glossary, metadata_values, metadata_variables are enabled by default, a total of 9 own product extensions |
| Typora / Obsidian / Notion Markdown | Not applicable | It is a Notdown product/own dialect, and there is no corresponding Pandoc default preset. |
| Markdown Lab | Use native Pandoc default, with internal auxiliary overrides | User Uncovered UsagePandoc By default; threeCommonMark reader Automatically addedsourcepos，For location mapping |
| User saved configuration | User coverage priority | Saved syntax takes precedence over defaultSyntax; explicit true/false takes precedence over preset |
| Native switching dialect / Reset dialect defaults | Restore native dialect defaults | Remove user coverage of registered items but retain unregistered item configurations;mmd of9 The default product will still be enabled, not pure.Pandoc Repositioning |

Basis: [ native default value and switching rules ](../../src/markdown-engine/config.ts), [ page configuration fallback ](../../src/app/main.ts), [ native switching and reset ](../../src/markdown-engine/workspace.ts), [ Lab calling parameter ](../../server/pandoc.ts). This time I only checked and supplemented the documentation, and did not modify the default switches or user page configuration.
