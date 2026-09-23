# Pandoc 与 Notdown 扩展、方言完整对照

> 下表是 2026-09-20 的工作簿参考快照，不是当前实现状态。2026-09-22 起，103 个 Markdown 扩展具有本地执行路径，12 个 Outside Markdown scope 项不启用；notdown_* 已规范为 notion_* 并保留兼容别名。当前状态和双向关系请使用 Block Explorer；执行边界见 [本地对象与服务](LOCAL-OBJECTS.md)。

按内容类型（块、行内、元数据、应用能力）整理的 87 项 × 11 方言对照，见 [内容能力与 Notdown 实现表](CONTENT-CAPABILITIES.md)。

核对日期：2026-09-20。已重新下载 [官方手册](https://pandoc.org/MANUAL.html)，并逐一运行本机 Pandoc 3.11 的 `--list-extensions=<variant>`；八种方言结果与 [已有快照](data/pandoc-3.11-extensions.json) 一致。Pandoc 列以 3.11 为准；Notdown 列直接读取当前原生注册表的 `supportsOption` 与 `enabled`，不承诺其他版本相同。

**Pandoc’s Markdown 就是 `markdown`，不是 `commonmark_x`。** 后者是 CommonMark 加扩展的另一个 reader 预设。扩展是内置格式开关，不是需要逐个安装的插件。

91 个 `Extension:` 小节 → 标题中的 88 个不同名称（含共用标题和跨格式重复）→ 加正文中的 `wikilinks_title_before_pipe`，共 **89 项**。其中 **77 项**至少被一种 Markdown 方言接受，**12 项**不被任何 Markdown 方言接受。

## 表格说明

本表共 **115 项 = 89 项 Pandoc 手册扩展 + 26 项 Notdown 其他已注册扩展**，覆盖 Notdown 已接入的 **11 种原生方言**。原生适配存在子集边界，不代表完整复刻对应产品或 Pandoc reader。

- **开**：接受且默认开启。
- **可**：接受、默认关闭，可以开启。
- **—**：不接受该名称的开关；不等于没有相应基础语法。
- 八个 Pandoc 方言列统一使用 **Pandoc / Notdown 原生** 双值。例如 **开/—** 表示 Pandoc 默认开启、Notdown 原生未接入该开关；**—/可** 表示 Pandoc 不接受、Notdown 原生可开启自己的扩展。
- **Typora、Obsidian、Notion** 三列仅表示 Notdown 原生配置，不是对应外部软件的官方能力或 Pandoc reader。
- **来源**列明确标注“Pandoc 手册”“Notdown 产品扩展”“Notdown Notion 扩展”；后两类不是 Pandoc 内置扩展名。
- **已注册**只说明原生注册表存在同名项，不保证完整语义；**未注册**不妨碍 Markdown Lab 调用 Pandoc；**非 MD**表示八个 Pandoc Markdown 格式都不接受。

P=`markdown`；S=`markdown_strict`；E=`markdown_phpextra`；M=`markdown_mmd`；GH=`markdown_github`（已弃用）；C=`commonmark`；GFM=`gfm`；CX=`commonmark_x`；Notion=`notion-markdown`。

原生默认值使用空覆盖配置 `extensions: {}`，不计某个页面保存的用户设置，也不计 `defaultSyntax()` 为新建普通 Markdown 页面附加的覆盖值。Pandoc 的开关通过 `+名称/-名称` 设置；Notdown 自有扩展使用应用配置，不能传给 Pandoc。

下面的数量汇总仍以 **89 项 Pandoc 手册扩展、Pandoc 本身**为统计范围：

| 方言 | 默认开 | 默认关、可开启 | 不接受 |
| --- | ---: | ---: | ---: |
| `markdown` | 47 | 27 | 15 |
| `markdown_strict` | 3 | 71 | 15 |
| `markdown_phpextra` | 12 | 62 | 15 |
| `markdown_mmd` | 22 | 52 | 15 |
| `markdown_github` | 17 | 57 | 15 |
| `commonmark` | 1 | 29 | 59 |
| `gfm` | 12 | 18 | 59 |
| `commonmark_x` | 20 | 10 | 59 |

## 全部 115 项总表

八种 Pandoc 方言中的每格是 **Pandoc / Notdown 原生**（P/N），后三种方言只列原生状态。Pandoc 数据来自 CLI 快照，原生数据来自 [配置实现](../src/markdown-engine/config.ts)。功能解释和读写方向见 [Pandoc 详细说明](PANDOC-EXTENSIONS.md) 与 [Notdown 产品语法说明](PRODUCT-SYNTAX.md)。

| 扩展 | 来源 | P（P/N） | S（P/N） | E（P/N） | M（P/N） | GH（P/N） | C（P/N） | GFM（P/N） | CX（P/N） | Typora | Obsidian | Notion | 原生注册 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [abbreviations](https://pandoc.org/MANUAL.html#extension-abbreviations) | Pandoc 手册 | 可/可 | 可/可 | 开/开 | 可/可 | 可/可 | —/— | —/— | —/— | 可 | 可 | — | 已注册 |
| [alerts](https://pandoc.org/MANUAL.html#extension-alerts) | Pandoc 手册 | 可/可 | 可/可 | 可/可 | 可/可 | 开/开 | 可/可 | 开/开 | 开/开 | 开 | 开 | — | 已注册 |
| [all_symbols_escapable](https://pandoc.org/MANUAL.html#extension-all_symbols_escapable) | Pandoc 手册 | 开/开 | 可/可 | 可/可 | 开/开 | 开/开 | —/— | —/— | —/— | 可 | — | — | 已注册 |
| [amuse](https://pandoc.org/MANUAL.html#extension-amuse) | Pandoc 手册 | —/— | —/— | —/— | —/— | —/— | —/— | —/— | —/— | — | — | — | 非 MD |
| [angle_brackets_escapable](https://pandoc.org/MANUAL.html#extension-angle_brackets_escapable) | Pandoc 手册 | 可/— | 可/— | 可/— | 可/— | 可/— | —/— | —/— | —/— | — | — | — | 未注册 |
| [ascii_identifiers](https://pandoc.org/MANUAL.html#extension-ascii_identifiers) | Pandoc 手册 | 可/— | 可/— | 可/— | 可/— | 可/— | 可/— | 可/— | 可/— | — | — | — | 未注册 |
| [attributes](https://pandoc.org/MANUAL.html#extension-attributes) | Pandoc 手册 | —/— | —/— | —/— | —/— | —/— | 可/— | 可/— | 开/— | — | — | — | 未注册 |
| [auto_identifiers](https://pandoc.org/MANUAL.html#extension-auto_identifiers) | Pandoc 手册 | 开/开 | 可/可 | 可/可 | 开/开 | 开/开 | —/— | —/— | —/— | 开 | 开 | — | 已注册 |
| [autolink_bare_uris](https://pandoc.org/MANUAL.html#extension-autolink_bare_uris) | Pandoc 手册 | 可/可 | 可/可 | 可/可 | 可/可 | 开/开 | 可/可 | 开/开 | 可/可 | 开 | 开 | — | 已注册 |
| [backtick_code_blocks](https://pandoc.org/MANUAL.html#extension-backtick_code_blocks) | Pandoc 手册 | 开/开 | 可/可 | 可/可 | 开/开 | 开/开 | —/— | —/— | —/— | 开 | — | — | 已注册 |
| [blank_before_blockquote](https://pandoc.org/MANUAL.html#extension-blank_before_blockquote) | Pandoc 手册 | 开/开 | 可/可 | 可/可 | 可/可 | 可/可 | —/— | —/— | —/— | 可 | — | — | 已注册 |
| [blank_before_header](https://pandoc.org/MANUAL.html#extension-blank_before_header) | Pandoc 手册 | 开/开 | 可/可 | 可/可 | 可/可 | 可/可 | —/— | —/— | —/— | 可 | — | — | 已注册 |
| [bracketed_spans](https://pandoc.org/MANUAL.html#extension-bracketed_spans) | Pandoc 手册 | 开/— | 可/— | 可/— | 可/— | 可/— | 可/— | 可/— | 开/— | — | — | — | 未注册 |
| [citations](https://pandoc.org/MANUAL.html#typst-citations) | Pandoc 手册 | 开/— | 可/— | 可/— | 可/— | 可/— | —/— | —/— | —/— | — | — | — | 未注册 |
| [definition_lists](https://pandoc.org/MANUAL.html#extension-definition_lists) | Pandoc 手册 | 开/开 | 可/可 | 开/开 | 开/开 | 可/可 | 可/可 | 可/可 | 开/开 | 可 | 可 | — | 已注册 |
| [east_asian_line_breaks](https://pandoc.org/MANUAL.html#extension-east_asian_line_breaks) | Pandoc 手册 | 可/— | 可/— | 可/— | 可/— | 可/— | 可/— | 可/— | 可/— | — | — | — | 未注册 |
| [element_citations](https://pandoc.org/MANUAL.html#extension-element_citations) | Pandoc 手册 | —/— | —/— | —/— | —/— | —/— | —/— | —/— | —/— | — | — | — | 非 MD |
| [emoji](https://pandoc.org/MANUAL.html#extension-emoji) | Pandoc 手册 | 可/可 | 可/可 | 可/可 | 可/可 | 开/开 | 可/可 | 开/开 | 开/开 | 开 | 开 | — | 已注册 |
| [empty_paragraphs](https://pandoc.org/MANUAL.html#extension-empty_paragraphs) | Pandoc 手册 | —/— | —/— | —/— | —/— | —/— | —/— | —/— | —/— | — | — | — | 非 MD |
| [escaped_line_breaks](https://pandoc.org/MANUAL.html#extension-escaped_line_breaks) | Pandoc 手册 | 开/开 | 可/可 | 可/可 | 可/可 | 可/可 | —/— | —/— | —/— | 开 | — | — | 已注册 |
| [example_lists](https://pandoc.org/MANUAL.html#extension-example_lists) | Pandoc 手册 | 开/— | 可/— | 可/— | 可/— | 可/— | —/— | —/— | —/— | — | — | — | 未注册 |
| [fancy_lists](https://pandoc.org/MANUAL.html#org-fancy-lists) | Pandoc 手册 | 开/— | 可/— | 可/— | 可/— | 可/— | 可/— | 可/— | 开/— | — | — | — | 未注册 |
| [fenced_code_attributes](https://pandoc.org/MANUAL.html#extension-fenced_code_attributes) | Pandoc 手册 | 开/开 | 可/可 | 可/可 | 可/可 | 可/可 | —/— | —/— | —/— | 开 | 开 | — | 已注册 |
| [fenced_code_blocks](https://pandoc.org/MANUAL.html#extension-fenced_code_blocks) | Pandoc 手册 | 开/开 | 可/可 | 开/开 | 可/可 | 开/开 | —/— | —/— | —/— | 开 | — | — | 已注册 |
| [fenced_divs](https://pandoc.org/MANUAL.html#extension-fenced_divs) | Pandoc 手册 | 开/开 | 可/可 | 可/可 | 可/可 | 可/可 | 可/可 | 可/可 | 开/开 | 可 | 可 | — | 已注册 |
| [footnotes](https://pandoc.org/MANUAL.html#extension-footnotes) | Pandoc 手册 | 开/开 | 可/可 | 开/开 | 开/开 | 开/开 | 可/可 | 开/开 | 开/开 | 开 | 开 | — | 已注册 |
| [four_space_rule](https://pandoc.org/MANUAL.html#extension-four_space_rule) | Pandoc 手册 | 可/— | 可/— | 可/— | 可/— | 可/— | —/— | —/— | —/— | — | — | — | 未注册 |
| [gfm_auto_identifiers](https://pandoc.org/MANUAL.html#extension-gfm_auto_identifiers) | Pandoc 手册 | 可/— | 可/— | 可/— | 可/— | 开/— | 可/— | 开/— | 开/— | — | — | — | 未注册 |
| [grid_tables](https://pandoc.org/MANUAL.html#extension-grid_tables) | Pandoc 手册 | 开/— | 可/— | 可/— | 可/— | 可/— | —/— | —/— | —/— | — | — | — | 未注册 |
| [gutenberg](https://pandoc.org/MANUAL.html#extension-gutenberg) | Pandoc 手册 | 可/— | 可/— | 可/— | 可/— | 可/— | —/— | —/— | —/— | — | — | — | 未注册 |
| [hard_line_breaks](https://pandoc.org/MANUAL.html#extension-hard_line_breaks) | Pandoc 手册 | 可/可 | 可/可 | 可/可 | 可/可 | 可/可 | 可/可 | 可/可 | 可/可 | 开 | 开 | — | 已注册 |
| [header_attributes](https://pandoc.org/MANUAL.html#extension-header_attributes) | Pandoc 手册 | 开/开 | 可/可 | 开/开 | 可/可 | 可/可 | —/— | —/— | —/— | 开 | 开 | — | 已注册 |
| [ignore_line_breaks](https://pandoc.org/MANUAL.html#extension-ignore_line_breaks) | Pandoc 手册 | 可/可 | 可/可 | 可/可 | 可/可 | 可/可 | —/— | —/— | —/— | 可 | 可 | — | 已注册 |
| [implicit_figures](https://pandoc.org/MANUAL.html#extension-implicit_figures) | Pandoc 手册 | 开/开 | 可/可 | 可/可 | 开/开 | 可/可 | 可/可 | 可/可 | 可/可 | 可 | 可 | — | 已注册 |
| [implicit_header_references](https://pandoc.org/MANUAL.html#extension-implicit_header_references) | Pandoc 手册 | 开/开 | 可/可 | 可/可 | 开/开 | 可/可 | 可/可 | 可/可 | 开/开 | 可 | 可 | — | 已注册 |
| [inline_code_attributes](https://pandoc.org/MANUAL.html#extension-inline_code_attributes) | Pandoc 手册 | 开/— | 可/— | 可/— | 可/— | 可/— | —/— | —/— | —/— | — | — | — | 未注册 |
| [inline_notes](https://pandoc.org/MANUAL.html#extension-inline_notes) | Pandoc 手册 | 开/— | 可/— | 可/— | 可/— | 可/— | —/— | —/— | —/— | — | — | — | 未注册 |
| [intraword_underscores](https://pandoc.org/MANUAL.html#extension-intraword_underscores) | Pandoc 手册 | 开/开 | 可/可 | 开/开 | 开/开 | 开/开 | —/— | —/— | —/— | 开 | — | — | 已注册 |
| [latex_macros](https://pandoc.org/MANUAL.html#extension-latex_macros) | Pandoc 手册 | 开/— | 可/— | 可/— | 可/— | 可/— | —/— | —/— | —/— | — | — | — | 未注册 |
| [line_blocks](https://pandoc.org/MANUAL.html#extension-line_blocks) | Pandoc 手册 | 开/开 | 可/可 | 可/可 | 可/可 | 可/可 | —/可 | —/可 | —/可 | 可 | 可 | — | 已注册 |
| [link_attributes](https://pandoc.org/MANUAL.html#extension-link_attributes) | Pandoc 手册 | 开/开 | 可/可 | 开/开 | 可/可 | 可/可 | —/— | —/— | —/— | 开 | 开 | — | 已注册 |
| [lists_without_preceding_blankline](https://pandoc.org/MANUAL.html#extension-lists_without_preceding_blankline) | Pandoc 手册 | 可/可 | 可/可 | 可/可 | 可/可 | 开/开 | —/— | —/— | —/— | 开 | — | — | 已注册 |
| [literate_haskell](https://pandoc.org/MANUAL.html#extension-literate_haskell) | Pandoc 手册 | 可/— | 可/— | 可/— | 可/— | 可/— | —/— | —/— | —/— | — | — | — | 未注册 |
| [mark](https://pandoc.org/MANUAL.html#extension-mark) | Pandoc 手册 | 可/— | 可/— | 可/— | 可/— | 可/— | —/— | —/— | —/— | — | — | — | 未注册 |
| [markdown_attribute](https://pandoc.org/MANUAL.html#extension-markdown_attribute) | Pandoc 手册 | 可/可 | 可/可 | 开/开 | 开/开 | 可/可 | —/— | —/— | —/— | 可 | 可 | — | 已注册 |
| [markdown_in_html_blocks](https://pandoc.org/MANUAL.html#extension-markdown_in_html_blocks) | Pandoc 手册 | 开/— | 可/— | 可/— | 可/— | 可/— | —/— | —/— | —/— | — | — | — | 未注册 |
| [mmd_header_identifiers](https://pandoc.org/MANUAL.html#extension-mmd_header_identifiers) | Pandoc 手册 | 可/可 | 可/可 | 可/可 | 开/开 | 可/可 | —/— | —/— | —/— | 可 | 可 | — | 已注册 |
| [mmd_link_attributes](https://pandoc.org/MANUAL.html#extension-mmd_link_attributes) | Pandoc 手册 | 可/可 | 可/可 | 可/可 | 开/开 | 可/可 | —/— | —/— | —/— | 可 | 可 | — | 已注册 |
| [mmd_title_block](https://pandoc.org/MANUAL.html#extension-mmd_title_block) | Pandoc 手册 | 可/可 | 可/可 | 可/可 | 开/开 | 可/可 | —/— | —/— | —/— | 可 | 可 | — | 已注册 |
| [multiline_tables](https://pandoc.org/MANUAL.html#extension-multiline_tables) | Pandoc 手册 | 开/— | 可/— | 可/— | 可/— | 可/— | —/— | —/— | —/— | — | — | — | 未注册 |
| [native_divs](https://pandoc.org/MANUAL.html#extension-native_divs) | Pandoc 手册 | 开/— | 可/— | 可/— | 可/— | 可/— | —/— | —/— | —/— | — | — | — | 未注册 |
| [native_numbering](https://pandoc.org/MANUAL.html#extension-native_numbering) | Pandoc 手册 | —/— | —/— | —/— | —/— | —/— | —/— | —/— | —/— | — | — | — | 非 MD |
| [native_spans](https://pandoc.org/MANUAL.html#extension-native_spans) | Pandoc 手册 | 开/— | 可/— | 可/— | 可/— | 可/— | —/— | —/— | —/— | — | — | — | 未注册 |
| [ntb](https://pandoc.org/MANUAL.html#extension-ntb) | Pandoc 手册 | —/— | —/— | —/— | —/— | —/— | —/— | —/— | —/— | — | — | — | 非 MD |
| [old_dashes](https://pandoc.org/MANUAL.html#extension-old_dashes) | Pandoc 手册 | 可/— | 可/— | 可/— | 可/— | 可/— | —/— | —/— | —/— | — | — | — | 未注册 |
| [pandoc_title_block](https://pandoc.org/MANUAL.html#extension-pandoc_title_block) | Pandoc 手册 | 开/开 | 可/可 | 可/可 | 可/可 | 可/可 | —/— | —/— | —/— | 可 | 可 | — | 已注册 |
| [pipe_tables](https://pandoc.org/MANUAL.html#extension-pipe_tables) | Pandoc 手册 | 开/开 | 可/可 | 开/开 | 开/开 | 开/开 | 可/可 | 开/开 | 开/开 | 开 | 开 | — | 已注册 |
| [raw_attribute](https://pandoc.org/MANUAL.html#extension-raw_attribute) | Pandoc 手册 | 开/开 | 可/可 | 可/可 | 开/开 | 可/可 | 可/可 | 可/可 | 开/开 | 可 | 可 | — | 已注册 |
| [raw_html](https://pandoc.org/MANUAL.html#extension-raw_html) | Pandoc 手册 | 开/开 | 开/开 | 开/开 | 开/开 | 开/开 | 开/开 | 开/开 | 开/开 | 开 | 开 | — | 已注册 |
| [raw_markdown](https://pandoc.org/MANUAL.html#extension-raw_markdown) | Pandoc 手册 | —/— | —/— | —/— | —/— | —/— | —/— | —/— | —/— | — | — | — | 非 MD |
| [raw_tex](https://pandoc.org/MANUAL.html#extension-raw_tex) | Pandoc 手册 | 开/— | 可/— | 可/— | 可/— | 可/— | —/— | —/— | —/— | — | — | — | 未注册 |
| [rebase_relative_paths](https://pandoc.org/MANUAL.html#extension-rebase_relative_paths) | Pandoc 手册 | 可/— | 可/— | 可/— | 可/— | 可/— | 可/— | 可/— | 可/— | — | — | — | 未注册 |
| [short_subsuperscripts](https://pandoc.org/MANUAL.html#extension-short_subsuperscripts) | Pandoc 手册 | 可/可 | 可/可 | 可/可 | 开/开 | 可/可 | —/— | —/— | —/— | 可 | 可 | — | 已注册 |
| [shortcut_reference_links](https://pandoc.org/MANUAL.html#extension-shortcut_reference_links) | Pandoc 手册 | 开/— | 开/— | 开/— | 开/— | 开/— | —/— | —/— | —/— | — | — | — | 未注册 |
| [simple_tables](https://pandoc.org/MANUAL.html#extension-simple_tables) | Pandoc 手册 | 开/— | 可/— | 可/— | 可/— | 可/— | —/— | —/— | —/— | — | — | — | 未注册 |
| [smart](https://pandoc.org/MANUAL.html#extension-smart) | Pandoc 手册 | 开/开 | 可/可 | 可/可 | 可/可 | 可/可 | 可/可 | 可/可 | 开/开 | 可 | 可 | — | 已注册 |
| [smart_quotes](https://pandoc.org/MANUAL.html#extension-smart_quotes-org) | Pandoc 手册 | —/— | —/— | —/— | —/— | —/— | —/— | —/— | —/— | — | — | — | 非 MD |
| [sourcepos](https://pandoc.org/MANUAL.html#extension-sourcepos) | Pandoc 手册 | —/— | —/— | —/— | —/— | —/— | 可/— | 可/— | 可/— | — | — | — | 未注册 |
| [space_in_atx_header](https://pandoc.org/MANUAL.html#extension-space_in_atx_header) | Pandoc 手册 | 开/开 | 可/可 | 可/可 | 可/可 | 开/开 | —/— | —/— | —/— | 可 | — | — | 已注册 |
| [spaced_reference_links](https://pandoc.org/MANUAL.html#extension-spaced_reference_links) | Pandoc 手册 | 可/— | 开/— | 开/— | 开/— | 可/— | —/— | —/— | —/— | — | — | — | 未注册 |
| [special_strings](https://pandoc.org/MANUAL.html#extension-special_strings-org) | Pandoc 手册 | —/— | —/— | —/— | —/— | —/— | —/— | —/— | —/— | — | — | — | 非 MD |
| [startnum](https://pandoc.org/MANUAL.html#extension-startnum) | Pandoc 手册 | 开/开 | 可/可 | 可/可 | 可/可 | 可/可 | —/— | —/— | —/— | 开 | — | — | 已注册 |
| [strikeout](https://pandoc.org/MANUAL.html#extension-strikeout) | Pandoc 手册 | 开/开 | 可/可 | 可/可 | 可/可 | 开/开 | 可/可 | 开/开 | 开/开 | 开 | 开 | 开 | 已注册 |
| [styles](https://pandoc.org/MANUAL.html#ext-styles) | Pandoc 手册 | —/— | —/— | —/— | —/— | —/— | —/— | —/— | —/— | — | — | — | 非 MD |
| [subscript](https://pandoc.org/MANUAL.html#extension-superscript-subscript) | Pandoc 手册 | 开/开 | 可/可 | 可/可 | 开/开 | 可/可 | 可/可 | 可/可 | 开/开 | 开 | 可 | — | 已注册 |
| [superscript](https://pandoc.org/MANUAL.html#extension-superscript-subscript) | Pandoc 手册 | 开/开 | 可/可 | 可/可 | 开/开 | 可/可 | 可/可 | 可/可 | 开/开 | 开 | 可 | — | 已注册 |
| [table_attributes](https://pandoc.org/MANUAL.html#extension-table_attributes) | Pandoc 手册 | 开/— | 可/— | 可/— | 可/— | 可/— | —/— | —/— | —/— | — | — | — | 未注册 |
| [table_captions](https://pandoc.org/MANUAL.html#extension-table_captions) | Pandoc 手册 | 开/— | 可/— | 可/— | 可/— | 可/— | —/— | —/— | —/— | — | — | — | 未注册 |
| [tagging](https://pandoc.org/MANUAL.html#extension--tagging) | Pandoc 手册 | —/— | —/— | —/— | —/— | —/— | —/— | —/— | —/— | — | — | — | 非 MD |
| [task_lists](https://pandoc.org/MANUAL.html#extension-task_lists) | Pandoc 手册 | 开/开 | 可/可 | 可/可 | 可/可 | 开/开 | 可/可 | 开/开 | 开/开 | 开 | 开 | 开 | 已注册 |
| [tex_math_dollars](https://pandoc.org/MANUAL.html#extension-tex_math_dollars) | Pandoc 手册 | 开/开 | 可/可 | 可/可 | 开/开 | 可/可 | 可/可 | 开/开 | 开/开 | 开 | 开 | 开 | 已注册 |
| [tex_math_double_backslash](https://pandoc.org/MANUAL.html#extension-tex_math_double_backslash) | Pandoc 手册 | 可/可 | 可/可 | 可/可 | 开/开 | 可/可 | —/— | —/— | —/— | 可 | 可 | — | 已注册 |
| [tex_math_gfm](https://pandoc.org/MANUAL.html#extension-tex_math_gfm) | Pandoc 手册 | —/— | —/— | —/— | —/— | —/— | 可/— | 开/— | 可/— | — | — | — | 未注册 |
| [tex_math_single_backslash](https://pandoc.org/MANUAL.html#extension-tex_math_single_backslash) | Pandoc 手册 | 可/— | 可/— | 可/— | 可/— | 可/— | —/— | —/— | —/— | — | — | — | 未注册 |
| [wikilinks_title_after_pipe](https://pandoc.org/MANUAL.html#extension-wikilinks_title_after_pipe) | Pandoc 手册 | 可/可 | 可/可 | 可/可 | 可/可 | 可/可 | 可/可 | 可/可 | 可/可 | 可 | 开 | — | 已注册 |
| [wikilinks_title_before_pipe](https://pandoc.org/MANUAL.html#extension-wikilinks_title_after_pipe) | Pandoc 手册 | 可/— | 可/— | 可/— | 可/— | 可/— | 可/— | 可/— | 可/— | — | — | — | 未注册 |
| [xrefs_name](https://pandoc.org/MANUAL.html#extension-xrefs_name) | Pandoc 手册 | —/— | —/— | —/— | —/— | —/— | —/— | —/— | —/— | — | — | — | 非 MD |
| [xrefs_number](https://pandoc.org/MANUAL.html#extension-xrefs_number) | Pandoc 手册 | —/— | —/— | —/— | —/— | —/— | —/— | —/— | —/— | — | — | — | 非 MD |
| [yaml_metadata_block](https://pandoc.org/MANUAL.html#extension-yaml_metadata_block) | Pandoc 手册 | 开/开 | 可/可 | 可/可 | 可/可 | 可/可 | 可/可 | 开/开 | 开/开 | 开 | 开 | — | 已注册 |
| `highlight` | **Notdown 产品扩展** | —/可 | —/可 | —/可 | —/可 | —/可 | —/可 | —/可 | —/可 | 开 | 开 | — | 已注册 |
| `comments` | **Notdown 产品扩展** | —/可 | —/可 | —/可 | —/可 | —/可 | —/可 | —/可 | —/可 | 可 | 开 | — | 已注册 |
| `toc_directives` | **Notdown 产品扩展** | —/可 | —/可 | —/可 | —/开 | —/可 | —/可 | —/可 | —/可 | 开 | 开 | — | 已注册 |
| `diagrams` | **Notdown 产品扩展** | —/可 | —/可 | —/可 | —/可 | —/可 | —/可 | —/可 | —/可 | 开 | 开 | — | 已注册 |
| `html_embed` | **Notdown 产品扩展** | —/可 | —/可 | —/可 | —/可 | —/可 | —/可 | —/可 | —/可 | 开 | 可 | — | 已注册 |
| `mmd_tables` | **Notdown 产品扩展** | —/可 | —/可 | —/可 | —/开 | —/可 | —/可 | —/可 | —/可 | 可 | 可 | — | 已注册 |
| `mmd_abbreviations` | **Notdown 产品扩展** | —/可 | —/可 | —/可 | —/开 | —/可 | —/可 | —/可 | —/可 | 可 | 可 | — | 已注册 |
| `mmd_citations` | **Notdown 产品扩展** | —/可 | —/可 | —/可 | —/开 | —/可 | —/可 | —/可 | —/可 | 可 | 可 | — | 已注册 |
| `critic_markup` | **Notdown 产品扩展** | —/可 | —/可 | —/可 | —/开 | —/可 | —/可 | —/可 | —/可 | 可 | 可 | — | 已注册 |
| `transclusion` | **Notdown 产品扩展** | —/可 | —/可 | —/可 | —/开 | —/可 | —/可 | —/可 | —/可 | 可 | 开 | — | 已注册 |
| `glossary` | **Notdown 产品扩展** | —/可 | —/可 | —/可 | —/开 | —/可 | —/可 | —/可 | —/可 | 可 | 可 | — | 已注册 |
| `metadata_values` | **Notdown 产品扩展** | —/可 | —/可 | —/可 | —/开 | —/可 | —/可 | —/可 | —/可 | 开 | 开 | — | 已注册 |
| `metadata_variables` | **Notdown 产品扩展** | —/可 | —/可 | —/可 | —/开 | —/可 | —/可 | —/可 | —/可 | 可 | 可 | — | 已注册 |
| `typora_loose_lists` | **Notdown 产品扩展** | —/可 | —/可 | —/可 | —/可 | —/可 | —/可 | —/可 | —/可 | 开 | 可 | — | 已注册 |
| `notdown_columns` | **Notdown Notion 扩展** | —/可 | —/可 | —/可 | —/可 | —/可 | —/可 | —/可 | —/可 | 可 | 可 | 开 | 已注册 |
| `notdown_callouts` | **Notdown Notion 扩展** | —/可 | —/可 | —/可 | —/可 | —/可 | —/可 | —/可 | —/可 | 可 | 可 | 开 | 已注册 |
| `notdown_toggles` | **Notdown Notion 扩展** | —/可 | —/可 | —/可 | —/可 | —/可 | —/可 | —/可 | —/可 | 可 | 可 | 开 | 已注册 |
| `notdown_tables` | **Notdown Notion 扩展** | —/可 | —/可 | —/可 | —/可 | —/可 | —/可 | —/可 | —/可 | 可 | 可 | 开 | 已注册 |
| `notdown_pages` | **Notdown Notion 扩展** | —/可 | —/可 | —/可 | —/可 | —/可 | —/可 | —/可 | —/可 | 可 | 可 | 开 | 已注册 |
| `notdown_mentions` | **Notdown Notion 扩展** | —/可 | —/可 | —/可 | —/可 | —/可 | —/可 | —/可 | —/可 | 可 | 可 | 开 | 已注册 |
| `notdown_media` | **Notdown Notion 扩展** | —/可 | —/可 | —/可 | —/可 | —/可 | —/可 | —/可 | —/可 | 可 | 可 | 开 | 已注册 |
| `notdown_databases` | **Notdown Notion 扩展** | —/可 | —/可 | —/可 | —/可 | —/可 | —/可 | —/可 | —/可 | 可 | 可 | 开 | 已注册 |
| `notdown_synced` | **Notdown Notion 扩展** | —/可 | —/可 | —/可 | —/可 | —/可 | —/可 | —/可 | —/可 | 可 | 可 | 开 | 已注册 |
| `notdown_toc` | **Notdown Notion 扩展** | —/可 | —/可 | —/可 | —/可 | —/可 | —/可 | —/可 | —/可 | 可 | 可 | 开 | 已注册 |
| `notdown_nesting` | **Notdown Notion 扩展** | —/可 | —/可 | —/可 | —/可 | —/可 | —/可 | —/可 | —/可 | 可 | 可 | 开 | 已注册 |
| `notdown_colors` | **Notdown Notion 扩展** | —/可 | —/可 | —/可 | —/可 | —/可 | —/可 | —/可 | —/可 | 可 | 可 | 开 | 已注册 |

## Notdown 的 70 项为何不是 70 个 Pandoc 扩展

当前 [原生注册表](../src/markdown-engine/config.ts) 有 **70 项 = 44 项 Pandoc 同名扩展 + 26 项产品/Notion 扩展**。不能用 89 − 70 计算缺项。按名称核对，77 项 Markdown 可用扩展中，还有 **33 项没有原生同名注册项**。这是注册层面的差集，不是完整功能审计。

未注册的 33 项：

`ascii_identifiers`、`gfm_auto_identifiers`、`literate_haskell`、`citations`、`fancy_lists`、`example_lists`、`table_captions`、`simple_tables`、`multiline_tables`、`grid_tables`、`table_attributes`、`inline_code_attributes`、`markdown_in_html_blocks`、`native_divs`、`native_spans`、`raw_tex`、`latex_macros`、`shortcut_reference_links`、`bracketed_spans`、`inline_notes`、`rebase_relative_paths`、`mark`、`attributes`、`old_dashes`、`angle_brackets_escapable`、`four_space_rule`、`spaced_reference_links`、`east_asian_line_breaks`、`tex_math_gfm`、`tex_math_single_backslash`、`gutenberg`、`sourcepos`、`wikilinks_title_before_pipe`。

另 26 项产品/Notion 扩展：

`highlight`、`comments`、`toc_directives`、`diagrams`、`html_embed`、`mmd_tables`、`mmd_abbreviations`、`mmd_citations`、`critic_markup`、`transclusion`、`glossary`、`metadata_values`、`metadata_variables`、`typora_loose_lists`、`notdown_columns`、`notdown_callouts`、`notdown_toggles`、`notdown_tables`、`notdown_pages`、`notdown_mentions`、`notdown_media`、`notdown_databases`、`notdown_synced`、`notdown_toc`、`notdown_nesting`、`notdown_colors`。

例如原生的 `highlight` 与 Pandoc 的 `mark` 有用途重叠，但不是同名开关，不能直接据此认定兼容。Lab 和原生编辑器也必须分别统计：Lab 读取 Pandoc 能力，原生编辑器执行自有 codec。

## 非 Markdown 的 12 项

这些扩展可以在相应格式中使用；“非 Markdown”不表示 Notdown 永远不能提供相关导入/导出能力。读写方向和各自默认值见 [完整格式说明](PANDOC-EXTENSIONS.md)。

| 扩展 | 所属格式和默认值 | 用途/排除原因 |
| --- | --- | --- |
| [amuse](https://pandoc.org/MANUAL.html#extension-amuse) | 读 `muse`；该格式默认开 | Text::Amuse 对 Emacs Muse 的语法约定，属于 Muse reader，Markdown 不按 Muse 的块规则解析。 |
| [element_citations](https://pandoc.org/MANUAL.html#extension-element_citations) | 写 `jats` / `jats_archiving` / `jats_publishing` / `jats_articleauthoring`；默认关 | 使用 JATS 的结构化引文元素输出书目资料；CSL 样式不控制这种输出。它决定目标 XML 结构，不增加 Markdown 引文语法。 |
| [empty_paragraphs](https://pandoc.org/MANUAL.html#extension-empty_paragraphs) | 手册：读 `docx` / `html`；写 `docx` / `odt` / `opendocument` / `html` / `latex`；默认关 | 保留或输出真正的空段落。这些格式有可表达空段落的结构；Markdown 空白行通常分隔块，不能用此开关变成相同结构。CLI 的别名/相关格式中还接受 `html4`、`html5`、`epub`、`epub2`、`epub3`、`beamer`，不由此推断双向功能。 |
| [native_numbering](https://pandoc.org/MANUAL.html#extension-native_numbering) | 写 `docx` / `odt` / `opendocument`；默认关 | 用办公文档的原生计数域为图、表编号；依赖输出文件格式的字段机制。 |
| [ntb](https://pandoc.org/MANUAL.html#extension-ntb) | 写 `context`；默认关 | 选择 ConTeXt 的 Natural Tables 排版方案，属于目标表格生成策略。 |
| [raw_markdown](https://pandoc.org/MANUAL.html#extension-raw_markdown) | 读 `ipynb`；默认关 | 把笔记本中的 Markdown 单元格原文保留为 RawBlock，跳过通常的 Markdown 解析。它控制笔记本导入，后续输出还须能处理这种原始内容。 |
| [smart_quotes](https://pandoc.org/MANUAL.html#extension-smart_quotes-org) | 读/写 `org`；默认关；`smart` 包含其作用 | 单独控制 Org 智能引号转换；Markdown 使用自己的 `smart` 开关，没有这个 Org 专用细分名称。 |
| [special_strings](https://pandoc.org/MANUAL.html#extension-special_strings-org) | `org` 的文字转换；默认开；`smart` 包含其作用 | 控制 Org 对破折号、省略号等特殊字符串的处理，依据 Org 规则工作。 |
| [styles](https://pandoc.org/MANUAL.html#ext-styles) | 读 `docx`；默认关 | 将 DOCX 样式信息保留为 Div、Span、Table 上的自定义样式属性，供后续转换使用；不是网页主题或 Markdown 高亮样式开关。 |
| [tagging](https://pandoc.org/MANUAL.html#extension--tagging) | 写 `context`；默认关 | 生成用于带结构标签 PDF 的 ConTeXt 标记，仍依赖后续排版引擎；不是 Markdown 标签语法。 |
| [xrefs_name](https://pandoc.org/MANUAL.html#extension-xrefs_name) | 写 `odt` / `opendocument`；默认关 | 用目标文档的交叉引用字段显示名称或题注；需要办公软件更新相关字段。 |
| [xrefs_number](https://pandoc.org/MANUAL.html#extension-xrefs_number) | 写 `odt` / `opendocument`；默认关 | 用交叉引用字段显示编号；依赖编号配置与字段更新。它控制导出字段，不是 Markdown 双链。 |

补充：`citations` 在 Typst、Org、DOCX 中的同名小节，以及 `fancy_lists` 在 Org 中的同名小节，构成重复条目；上表按唯一扩展名合并，其 Markdown 状态只看 Markdown reader。`gutenberg` 虽被 Markdown 格式接受，实际作用属于纯文本 writer，不能当作正文编辑语法；`sourcepos` 是源位置辅助信息。

## 默认开关审计（2026-09-20）

结论：**已注册的 Pandoc 同名开关遵循 Pandoc 3.11 默认值，但 Notdown 整体启动配置并非完全等同于 Pandoc。** 重新执行八个方言的 CLI 查询，逐项比较空覆盖配置下的 `enabled()`，共 280 个“方言 × 同名扩展”组合，默认值不一致为 0。既有默认值测试也通过。

| 场景 | 是否遵循 Pandoc | 核对结果 |
| --- | --- | --- |
| 八种 Pandoc 方言，原生已注册的同名开关，无用户覆盖 | 是 | 五种 markdown 系列各 44 项，三个 CommonMark 系列各 20 项，全部一致 |
| Pandoc 默认开、原生没有同名注册项 | 不能视为已生效 | markdown 有 17 项，strict / phpextra / mmd / github 各 2 项，commonmark 0 项，gfm 2 项，commonmark_x 4 项；对应开关在原生不生效，不据此断言所有基础语法缺失 |
| 无已保存 syntax 的普通 Markdown 页面 | 有额外覆盖 | 使用 commonmark，再打开 strikeout、pipe_tables、task_lists、wikilinks_title_after_pipe 和 notdown_nesting、notdown_columns、notdown_pages；前四项在 Pandoc commonmark 中默认关闭，后三项属于自有扩展 |
| 原生 markdown_mmd | 同名项一致，另有额外默认项 | 默认开启 toc_directives、mmd_tables、mmd_abbreviations、mmd_citations、critic_markup、transclusion、glossary、metadata_values、metadata_variables，共 9 项自有产品扩展 |
| Typora / Obsidian / Notion Markdown | 不适用 | 是 Notdown 产品/自有方言，没有对应的 Pandoc 默认预设 |
| Markdown Lab | 使用本机 Pandoc 默认值，另有内部辅助覆盖 | 用户未覆盖的项使用 Pandoc 默认；三个 CommonMark reader 自动加 sourcepos，用于位置映射 |
| 用户保存的配置 | 用户覆盖优先 | 已保存 syntax 优先于 defaultSyntax；显式 true/false 优先于预设 |
| 原生切换方言 / Reset dialect defaults | 恢复原生方言预设 | 清除已注册项的用户覆盖，但保留未注册项配置；mmd 的 9 个产品默认项仍会开启，不是纯 Pandoc 重置 |

依据：[原生默认值与开关规则](../src/markdown-engine/config.ts)、[页面配置回退](../src/main.ts)、[原生切换与重置](../src/markdown-engine/workspace.ts)、[Lab 调用参数](../server/pandoc.ts)。本次只核对和补充文档，没有修改默认开关或用户页面配置。
