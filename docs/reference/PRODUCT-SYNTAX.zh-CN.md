# 产品方言附加语法：当前实现与 62 条验收清单

[English](PRODUCT-SYNTAX.md) · **简体中文**

2026-09-22 方言边界修正：各方言默认值按上游规范独立定义，仅 Pandoc 自身预设沿用 Pandoc 3.11 快照。九种本地对象改为默认关闭的独立插件，在页面语法面板开启；旧正文不迁移、不删除。已实现默认规则隔离、显式启用、解析／命令／目录统一门控；尚未宣称完整上游一致性或跨端同步。详见[方言核对与插件说明](DIALECT-CONFORMANCE.zh-CN.md)；下文历史说明如与之冲突，以此修订为准。

2026-09-15。本次新增 Typora、Obsidian 独立预设，共 **11 个原生预设、70 个注册扩展**。此文更新先前的[缺口审计](../audits/SYNTAX-AUDIT-2026-09-15.zh-CN.md)，不表示复刻所有产品或完整 Pandoc reader。

## 使用与编辑方式

补充用户截图验收：Typora 有序列表中的 `[ ]` / `[x]` 显示为文字，只有无序任务显示复选框；嵌套时按当前项所属列表判断。Typora 默认关闭 `all_symbols_escapable`，支持原始 Markdown 标点及 `$ < > = ^ | ~` 的转义，其余标点前的反斜杠保留；`smart` 默认关闭，避免把截图中的直引号自动替换为弯引号。显式开启这些扩展可覆盖默认值。这些是按当前用户应用实测收紧的规则，不作为所有 Typora 版本的通用保证。

2026-09-20 对照修正：Typora 预设默认开启 `hard_line_breaks`，保留编辑视图中的单换行；可关闭以对照合并空格的行为。此开关当前也影响 HTML 导出，尚未实现 Typora 独立的编辑／导出空白设置。按用户应用实测，Typora 有序列表仅识别 `1.`，`1)` 保留为文字；CommonMark/GFM 的右括号规则不变。普通、引用、裸网址及尖括号自动链接均提供链接外观，编辑区 Ctrl/⌘ + 点击打开 HTTP(S)／邮件链接。

选择对应方言，在“扩展”面板启用表中注明的选项。切换仅重新解释同一 Markdown；源文件和 YAML syntax 仍通过 baseRevision 保存。普通文本、标题、提示块、修订标记支持页面编辑；2026-09-21 起，MMD 表格共用结构化表格模型，单元格及题注支持直接编辑，保留跨度、分组与原有多行内容。图表、元数据、HTML 混合块和文件嵌入提供预览与“编辑源码”，仍可整体拖动和共同撤销。行内注释、术语与嵌入通过源码视图编辑。日常输入不调用 Pandoc。

PHP Extra/MMD 的 Pandoc 同名开关默认值保留 3.11 快照；产品专用能力在此基础上补充。因此列表中有些功能需要手动打开，不能把“未默认启用”当作“未实现”。下面逐行按实际注册表标注。

## 62 条原始样例

验证原始样例的语义节点／关键输出、原文往返、相邻块编辑后的保留；外部资源另用真实临时文件和浏览器验证。不是每条样例都含有效资源或引用。

| # | 方言／语法 | 规则 | 默认／需设置 | 显示与编辑说明 |
| --- | --- | --- | --- | --- |
| 1 | Typora：math block | `tex_math_dollars` | 默认可用 | 解析、显示与原文保留；文字可直接编辑 |
| 2 | Typora：footnote | `footnotes` | 默认可用 | 解析、显示与原文保留；文字可直接编辑 |
| 3 | Typora：YAML front matter | `yaml_metadata_block`、`metadata_values` | 默认可用 | 正文元数据表；块内源码编辑；不改外层页面 YAML |
| 4 | Typora：table of contents | `toc_directives` | 默认可用 | 随标题更新，可点击跳转 |
| 5 | Typora：callout / GitHub style alert | `alerts` | 默认可用 | 解析、显示与原文保留；文字可直接编辑 |
| 6 | Typora：internal link | `auto_identifiers` | 默认可用 | 页内锚点；生成 ID 由标题取得 |
| 7 | Typora：emoji | `emoji` | 默认可用 | 解析、显示与原文保留；文字可直接编辑 |
| 8 | Typora：inline math | `tex_math_dollars` | 默认可用 | 解析、显示与原文保留；文字可直接编辑 |
| 9 | Typora：subscript | `subscript` | 默认可用 | 解析、显示与原文保留；文字可直接编辑 |
| 10 | Typora：superscript | `superscript` | 默认可用 | 解析、显示与原文保留；文字可直接编辑 |
| 11 | Typora：highlight | `highlight` | 默认可用 | 解析、显示与原文保留；文字可直接编辑 |
| 12 | Typora：embed content | `html_embed` | 默认可用 | HTTP(S) iframe 隔离显示；远端可能禁止嵌入 |
| 13 | Typora：sequence diagram | `diagrams` | 默认可用 | sequence 常用箭头语法转 Mermaid；块内源码编辑 |
| 14 | Typora：flowchart | `diagrams` | 默认可用 | flow 常用节点／连线语法转 Mermaid；块内源码编辑 |
| 15 | Typora：mermaid | `diagrams` | 默认可用 | 本地 Mermaid SVG；无内容显示空图表 |
| 16 | Typora：without Strict Mode | `space_in_atx_header` | 默认关闭（符合样例） | 此例要求关闭 space_in_atx_header；Typora 默认关闭 |
| 17 | Typora：without Strict Mode | `typora_loose_lists` | 默认可用 | 两空格续行保留同一项 |
| 18 | Typora：without Strict Mode | `typora_loose_lists` | 默认可用 | 两空格子列表；嵌套列表可编辑 |
| 19 | Obsidian：block comment | `comments` | 默认可用 | 正文隐藏；源码视图编辑 |
| 20 | Obsidian：inline comment | `comments` | 默认可用 | 正文隐藏；源码视图编辑 |
| 21 | Obsidian：internal link (Wikilink) | `wikilinks_title_after_pipe` | 默认可用 | 链接匹配本地页面标题／ID |
| 22 | Obsidian：internal link (Markdown) | `基础链接／本地页面路由` | 默认可用 | 相对 .md 链接匹配本地页面；不打开任意磁盘文件 |
| 23 | PHP Markdown Extra：inline HTML | `raw_html` | 默认可用 | HTML 预览；标签在 HTML 源码字段编辑 |
| 24 | PHP Markdown Extra：markdown Inside HTML Blocks | `raw_html`、`markdown_attribute` | 默认可用 | HTML 内 Markdown 预览；整个块源码编辑 |
| 25 | PHP Markdown Extra：special attributes | `header_attributes` | 默认可用 | 解析、显示与原文保留；文字可直接编辑 |
| 26 | PHP Markdown Extra：special attributes | `header_attributes` | 默认可用 | 解析、显示与原文保留；文字可直接编辑 |
| 27 | PHP Markdown Extra：special attributes | `header_attributes` | 默认可用 | 解析、显示与原文保留；文字可直接编辑 |
| 28 | PHP Markdown Extra：special attributes | `link_attributes` | 默认可用 | 属性保留；class 加前缀，ID 作用域隔离 |
| 29 | PHP Markdown Extra：special attributes | `link_attributes` | 默认可用 | 这是引用定义，需加 [文本][ref] 才能看见链接；不单独显示 |
| 30 | PHP Markdown Extra：fenced code block | `fenced_code_blocks`、`fenced_code_attributes` | 需开启 `fenced_code_attributes` | 解析、显示与原文保留；文字可直接编辑 |
| 31 | PHP Markdown Extra：fenced code block | `fenced_code_blocks`、`fenced_code_attributes` | 需开启 `fenced_code_attributes` | 解析、显示与原文保留；文字可直接编辑 |
| 32 | PHP Markdown Extra：definition list | `definition_lists` | 默认可用 | 解析、显示与原文保留；文字可直接编辑 |
| 33 | PHP Markdown Extra：abbreviation | `abbreviations` | 默认可用 | 这是缩写定义，需在正文使用 HTML 才显示提示 |
| 34 | PHP Markdown Extra：ordered list | `startnum` | 需开启 `startnum` | 解析、显示与原文保留；文字可直接编辑 |
| 35 | MultiMarkdown：abbreviation | `mmd_abbreviations` | 默认可用 | 缩写提示；定义在块内源码编辑 |
| 36 | MultiMarkdown：citation | `mmd_citations` | 默认可用 | 原例 Doe:2006 与定义 Doe2006 不一致，显示未定义提示 |
| 37 | MultiMarkdown：citation | `mmd_citations` | 默认可用 | 原例引用键不一致，需修正为相同键 |
| 38 | MultiMarkdown：citation | `mmd_citations` | 默认可用 | 抑制正文引文文字；仍可进入文献清单 |
| 39 | MultiMarkdown：inline citation | `mmd_citations` | 默认可用 | 内联书目信息显示 |
| 40 | MultiMarkdown：BibTeX citation | `mmd_citations` | 默认可用 | 设置 bibliography: refs.bib 并提供真实条目后显示文献；未解析键不虚构 |
| 41 | MultiMarkdown：deletion | `critic_markup` | 默认可用 | 解析、显示与原文保留；文字可直接编辑 |
| 42 | MultiMarkdown：addition | `critic_markup` | 默认可用 | 解析、显示与原文保留；文字可直接编辑 |
| 43 | MultiMarkdown：substitution | `critic_markup` | 默认可用 | 新文字可编辑；旧文字保留在标记和提示中 |
| 44 | MultiMarkdown：highlighting | `critic_markup` | 默认可用 | 解析、显示与原文保留；文字可直接编辑 |
| 45 | MultiMarkdown：comment | `critic_markup` | 默认可用 | 解析、显示与原文保留；文字可直接编辑 |
| 46 | MultiMarkdown：cross-reference | `mmd_header_identifiers`、`implicit_header_references` | 默认可用 | 标题 ID 与隐式链接 |
| 47 | MultiMarkdown：escaped newline | `escaped_line_breaks` | 需开启 `escaped_line_breaks` | 解析、显示与原文保留；文字可直接编辑 |
| 48 | MultiMarkdown：file transluction | `transclusion` | 默认可用 | 知识库内只读嵌入；依赖文件每 4 秒检查，缺失显示错误 |
| 49 | MultiMarkdown：wildcard extention | `transclusion` | 默认可用 | 优先 .html，其次 .md、.txt；非合并所有扩展名 |
| 50 | MultiMarkdown：glossary | `glossary` | 默认可用 | 术语提示、行内解释及定义 |
| 51 | MultiMarkdown：image block | `implicit_figures` | 默认可用 | 独立图片与题注预览；原例路径为占位地址，需实际图片 |
| 52 | MultiMarkdown：link and image attribute | `mmd_link_attributes` | 默认可用 | 宽高与 class 属性保留／应用允许的显示属性 |
| 53 | MultiMarkdown：link and image attribute | `mmd_link_attributes` | 默认可用 | 解析、显示与原文保留；文字可直接编辑 |
| 54 | MultiMarkdown：math | `tex_math_double_backslash` | 默认可用 | 双反斜杠行内与块公式；KaTeX 显示 |
| 55 | MultiMarkdown：superscript | `short_subsuperscripts` | 默认可用 | 连续字母／数字为简写上标 |
| 56 | MultiMarkdown：subscript | `short_subsuperscripts` | 默认可用 | 连续字母／数字为简写下标 |
| 57 | MultiMarkdown：metadata "variable" | `mmd_title_block`、`metadata_values`、`metadata_variables` | 默认可用 | 正文元数据值替换；修改元数据立即刷新显示 |
| 58 | MultiMarkdown：raw source | `raw_attribute` | 默认可用 | HTML 清理后显示；LaTeX 等非 HTML 原始格式显示源码，不执行 TeX |
| 59 | MultiMarkdown：smart typography | `smart` | 需开启 `smart` | 解析、显示与原文保留；文字可直接编辑 |
| 60 | MultiMarkdown：table of contents | `toc_directives` | 默认可用 | 全篇目录 |
| 61 | MultiMarkdown：table of contents | `toc_directives` | 默认可用 | N 表示该标题级别，N-M 表示范围 |
| 62 | MultiMarkdown：table | `mmd_tables` | 默认可用 | 统一结构化表格；单元格/题注直接编辑，保留分组表头、跨行跨列、分区及多行内容；新增合并单元格的控件待实现 |

## 扩展接受范围与默认值

“开”=接受且默认开启，“关”=可开启，“—”=原生未接受该开关。Notion codec 独立，只提供已接入的原有 Notdown 开关及任务、删除线、美元公式。Typora/Obsidian 是 Notdown 产品预设，不是 Pandoc 的 reader 名。

| 扩展 | typora | obsidian | notion-markdown | commonmark | gfm | markdown | commonmark_x | markdown_strict | markdown_phpextra | markdown_mmd | markdown_github |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `alerts` | 开 | 开 | — | 关 | 开 | 关 | 开 | 关 | 关 | 关 | 开 |
| `highlight` | 开 | 开 | — | 关 | 关 | 关 | 关 | 关 | 关 | 关 | 关 |
| `comments` | 关 | 开 | — | 关 | 关 | 关 | 关 | 关 | 关 | 关 | 关 |
| `toc_directives` | 开 | 开 | — | 关 | 关 | 关 | 关 | 关 | 关 | 开 | 关 |
| `diagrams` | 开 | 开 | — | 关 | 关 | 关 | 关 | 关 | 关 | 关 | 关 |
| `html_embed` | 开 | 关 | — | 关 | 关 | 关 | 关 | 关 | 关 | 关 | 关 |
| `header_attributes` | 开 | 开 | — | — | — | 开 | — | 关 | 开 | 关 | 关 |
| `link_attributes` | 开 | 开 | — | — | — | 开 | — | 关 | 开 | 关 | 关 |
| `fenced_code_attributes` | 开 | 开 | — | — | — | 开 | — | 关 | 关 | 关 | 关 |
| `mmd_link_attributes` | 关 | 关 | — | — | — | 关 | — | 关 | 关 | 开 | 关 |
| `markdown_attribute` | 关 | 关 | — | — | — | 关 | — | 关 | 开 | 开 | 关 |
| `auto_identifiers` | 开 | 开 | — | — | — | 开 | — | 关 | 关 | 开 | 开 |
| `mmd_header_identifiers` | 关 | 关 | — | — | — | 关 | — | 关 | 关 | 开 | 关 |
| `implicit_header_references` | 关 | 关 | — | 关 | 关 | 开 | 开 | 关 | 关 | 开 | 关 |
| `short_subsuperscripts` | 关 | 关 | — | — | — | 关 | — | 关 | 关 | 开 | 关 |
| `tex_math_double_backslash` | 关 | 关 | — | — | — | 关 | — | 关 | 关 | 开 | 关 |
| `raw_attribute` | 关 | 关 | — | 关 | 关 | 开 | 开 | 关 | 关 | 开 | 关 |
| `implicit_figures` | 关 | 关 | — | 关 | 关 | 开 | 关 | 关 | 关 | 开 | 关 |
| `mmd_tables` | 关 | 关 | — | 关 | 关 | 关 | 关 | 关 | 关 | 开 | 关 |
| `mmd_abbreviations` | 关 | 关 | — | 关 | 关 | 关 | 关 | 关 | 关 | 开 | 关 |
| `mmd_citations` | 关 | 关 | — | 关 | 关 | 关 | 关 | 关 | 关 | 开 | 关 |
| `critic_markup` | 关 | 关 | — | 关 | 关 | 关 | 关 | 关 | 关 | 开 | 关 |
| `transclusion` | 关 | 开 | — | 关 | 关 | 关 | 关 | 关 | 关 | 开 | 关 |
| `glossary` | 关 | 关 | — | 关 | 关 | 关 | 关 | 关 | 关 | 开 | 关 |
| `metadata_values` | 开 | 开 | — | 关 | 关 | 关 | 关 | 关 | 关 | 开 | 关 |
| `metadata_variables` | 关 | 关 | — | 关 | 关 | 关 | 关 | 关 | 关 | 开 | 关 |
| `typora_loose_lists` | 开 | 关 | — | 关 | 关 | 关 | 关 | 关 | 关 | 关 | 关 |
| `blank_before_header` | 关 | — | — | — | — | 开 | — | 关 | 关 | 关 | 关 |
| `blank_before_blockquote` | 关 | — | — | — | — | 开 | — | 关 | 关 | 关 | 关 |
| `space_in_atx_header` | 关 | — | — | — | — | 开 | — | 关 | 关 | 关 | 开 |
| `lists_without_preceding_blankline` | 开 | — | — | — | — | 关 | — | 关 | 关 | 关 | 开 |
| `startnum` | 开 | — | — | — | — | 开 | — | 关 | 关 | 关 | 关 |
| `backtick_code_blocks` | 开 | — | — | — | — | 开 | — | 关 | 关 | 开 | 开 |
| `fenced_code_blocks` | 开 | — | — | — | — | 开 | — | 关 | 开 | 关 | 开 |
| `escaped_line_breaks` | 开 | — | — | — | — | 开 | — | 关 | 关 | 关 | 关 |
| `all_symbols_escapable` | 开 | — | — | — | — | 开 | — | 关 | 关 | 开 | 开 |
| `intraword_underscores` | 开 | — | — | — | — | 开 | — | 关 | 开 | 开 | 开 |
| `ignore_line_breaks` | 关 | 关 | — | — | — | 关 | — | 关 | 关 | 关 | 关 |
| `smart` | 开 | 关 | — | 关 | 关 | 开 | 开 | 关 | 关 | 关 | 关 |
| `subscript` | 开 | 关 | — | 关 | 关 | 开 | 开 | 关 | 关 | 开 | 关 |
| `superscript` | 开 | 关 | — | 关 | 关 | 开 | 开 | 关 | 关 | 开 | 关 |
| `abbreviations` | 关 | 关 | — | — | — | 关 | — | 关 | 开 | 关 | 关 |
| `emoji` | 开 | 开 | — | 关 | 开 | 关 | 开 | 关 | 关 | 关 | 开 |
| `yaml_metadata_block` | 开 | 开 | — | 关 | 开 | 开 | 开 | 关 | 关 | 关 | 关 |
| `pandoc_title_block` | 关 | 关 | — | — | — | 开 | — | 关 | 关 | 关 | 关 |
| `mmd_title_block` | 关 | 关 | — | — | — | 关 | — | 关 | 关 | 开 | 关 |
| `raw_html` | 开 | 开 | — | 开 | 开 | 开 | 开 | 开 | 开 | 开 | 开 |
| `definition_lists` | 关 | 关 | — | 关 | 关 | 开 | 开 | 关 | 开 | 开 | 关 |
| `footnotes` | 开 | 开 | — | 关 | 开 | 开 | 开 | 关 | 开 | 开 | 开 |
| `line_blocks` | 关 | 关 | — | 关 | 关 | 开 | 关 | 关 | 关 | 关 | 关 |
| `fenced_divs` | 关 | 关 | — | 关 | 关 | 开 | 开 | 关 | 关 | 关 | 关 |
| `pipe_tables` | 开 | 开 | — | 关 | 开 | 开 | 开 | 关 | 开 | 开 | 开 |
| `strikeout` | 开 | 开 | 开 | 关 | 开 | 开 | 开 | 关 | 关 | 关 | 开 |
| `task_lists` | 开 | 开 | 开 | 关 | 开 | 开 | 开 | 关 | 关 | 关 | 开 |
| `autolink_bare_uris` | 开 | 开 | — | 关 | 开 | 关 | 关 | 关 | 关 | 关 | 开 |
| `hard_line_breaks` | 开 | 开 | — | 关 | 关 | 关 | 关 | 关 | 关 | 关 | 关 |
| `tex_math_dollars` | 开 | 开 | 开 | 关 | 开 | 开 | 开 | 关 | 关 | 开 | 关 |
| `wikilinks_title_after_pipe` | 关 | 开 | — | 关 | 关 | 关 | 关 | 关 | 关 | 关 | 关 |
| `notdown_columns` | 关 | 关 | 开 | 关 | 关 | 关 | 关 | 关 | 关 | 关 | 关 |
| `notdown_callouts` | 关 | 关 | 开 | 关 | 关 | 关 | 关 | 关 | 关 | 关 | 关 |
| `notdown_toggles` | 关 | 关 | 开 | 关 | 关 | 关 | 关 | 关 | 关 | 关 | 关 |
| `notdown_tables` | 关 | 关 | 开 | 关 | 关 | 关 | 关 | 关 | 关 | 关 | 关 |
| `notdown_pages` | 关 | 关 | 开 | 关 | 关 | 关 | 关 | 关 | 关 | 关 | 关 |
| `notdown_mentions` | 关 | 关 | 开 | 关 | 关 | 关 | 关 | 关 | 关 | 关 | 关 |
| `notdown_media` | 关 | 关 | 开 | 关 | 关 | 关 | 关 | 关 | 关 | 关 | 关 |
| `notdown_databases` | 关 | 关 | 开 | 关 | 关 | 关 | 关 | 关 | 关 | 关 | 关 |
| `notdown_synced` | 关 | 关 | 开 | 关 | 关 | 关 | 关 | 关 | 关 | 关 | 关 |
| `notdown_toc` | 关 | 关 | 开 | 关 | 关 | 关 | 关 | 关 | 关 | 关 | 关 |
| `notdown_nesting` | 关 | 关 | 开 | 关 | 关 | 关 | 关 | 关 | 关 | 关 | 关 |
| `notdown_colors` | 关 | 关 | 开 | 关 | 关 | 关 | 关 | 关 | 关 | 关 | 关 |

## 明确边界

- 62 条是本次具体语法验收范围，不是 Typora、Obsidian、PHP Extra、MMD 全语法一致性保证。尚未接入 Obsidian 插件 API、Dataview、完整 vault 链接／媒体解析或 CSS 主题。
- sequence/flow 适配常用节点、消息和连线，不等于完整 js-sequence-diagrams/flowchart.js 引擎；不支持的语句显示错误或回退源码。Mermaid 首次使用才加载，复杂图仍可能较慢；尚无大文档性能基准、Worker 或真正增量解析。
- 引文支持 MMD 定义、内联条目、定位符与知识库内 BibTeX 文件，当前使用作者／年份／标题等固定格式；没有 citeproc、任意 CSL 风格、完整 BibTeX 宏语言。键必须相同。元数据没有覆盖任意 MMD 输出控制指令。
- transclusion 只读取知识库内文件／页面；拒绝越界路径、符号链接越界、循环与过深嵌套，单文件 256 KB、展开约 512 KB、最多 8 层。嵌入是只读投影，不反向写入被嵌入文件。
- 属性保存完整原值，但只应用允许的 ID、class、lang、title、宽高。ID/class 带前缀，任意 CSS、事件与全局样式不执行。iframe 单独启用且隔离，不能保证目标网站允许嵌入。
- HTML 静态导出为图表保留代码、iframe 保留链接、文件嵌入保留路径；不会在导出时偷偷读取外部资源。浏览器交互预览更丰富。原始 TeX 块保留代码；数学公式走 KaTeX。
- 全套 Pandoc 简单／多行／网格表格、fancy/example lists、inline_notes、raw_tex、native_divs、完整 citations/citeproc 和 Pandoc JSON AST 双向转换仍未实现。未注册开关在面板单列，不执行。

## 参考与代码

对照 [Pandoc 3.11 Markdown reader](https://github.com/jgm/pandoc/blob/3.11/src/Text/Pandoc/Readers/Markdown.hs) 的 referenceKey、attributes、header、superscript/subscript 和 short_subsuperscripts 规则，以及 [Extensions 默认值](https://github.com/jgm/pandoc/blob/3.11/src/Text/Pandoc/Extensions.hs)。借鉴规则并在 TypeScript 中实现，没有复制 Haskell reader 或运行它作为逐键编辑内核。

复杂表格使用 [markdown-it-multimd-table](https://github.com/redbug312/markdown-it-multimd-table)，图表使用本地 [Mermaid](https://mermaid.js.org/config/usage)。目录级别范围按 [MultiMarkdown 官方目录说明](https://fletcher.github.io/MultiMarkdown-6/syntax/toc.html)；单个 N 限制为该级别。产品规则在 src/markdown-engine/products.ts；预览在 product-view.ts，文件解析在 server/syntax-files.ts。

验收文件：tests/unit/product-syntax.test.ts、tests/unit/syntax-files.test.ts、tests/e2e/product-syntax.spec.ts。完整运行结果见 [验证记录](../verification/VERIFICATION.zh-CN.md)。
