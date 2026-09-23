# 扩展分类复核

2026-09-23 后续约束：用户明确当前只接受既有方言和官方 Notion Markdown 语法。本文按功能来源分类及改名不代表编码被认可。补充核实发现官方另有 meeting-notes 标签依据，同时 Bookmark/Embed/Link preview/Breadcrumb 的 Markdown 输出使用 unknown。当前实际自定义编码及属性清单见 [自定义语法审计](./CUSTOM-SYNTAX-AUDIT-2026-09-23.md)，以该报告区分来源与编码。

## 后续修正：图片归属、扩展改名与下划线拆分

本节取代下方首轮审计中“十个都归 Notion”及“保持旧扩展 ID”的结论。

- **Image with caption**：Notion 支持题注，但这也是通用能力，例如 [Pandoc implicit_figures](https://pandoc.org/MANUAL.html#extension-implicit_figures)。当前 `<figure>` 是本地通用编码，仅凭 Notion 有类似功能不足以将其归属 Notion。`local_figure` 改回 Notdown Markdown extensions，不改名。
- 其余九个功能适配已改为 `notion_tabs`、`notion_bookmark`、`notion_link_preview`、`notion_breadcrumb`、`notion_button`、`notion_meeting_notes`、`notion_ai_block`、`notion_html_document`、`notion_web_embed`。它们表达项目对已确认 Notion 功能的适配，不宣称功能由 Notion 独创，或本地标签等于官方格式。
- 九个旧 `local_*` ID 保留为兼容别名。配置读取及已有链接可用，保存新配置使用正式名；新旧冲突时正式名优先。未知配置保留，不批量改写用户页面。
- **颜色与下划线**：合并是本地历史设计，官方分别定义 color 和 underline 属性。现在 `notion_colors` 只管理块颜色、文字色和背景色，新增 `notion_underline` 独立管理下划线。两项在 Notion / Notdown 默认开启，其他方言需启用；旧配置中仅关闭颜色不再隐式关闭下划线，如需两者都关闭要分别关闭。禁用语法仍按原有策略保留完整原文；同一源块混有禁用标记时可能整体退回源码。
- 当前总数 **127**：Pandoc **89**、Notion **22**（13 个语法适配 + 9 个功能适配）、其他 Markdown **16**。

本轮验证：37 项定向单元测试通过，最后的别名关系补充另经 5 项测试通过。浏览器选择了 23 个相关/周边用例，22 个通过；旧 ID 导航、颜色和下划线独立开关、保存后使用正式 ID 的新用例均通过。全量单元测试快照为 431 通过、1 失败、1 跳过；失败为 `footnote_anchor` 缺少内容清单关系，浏览器失败为脚注插入后找不到定义项，均不涉及本轮扩展标识或样式开关，未修改脚注实现。日志：`test-results/notion-rename-unit.log`、`test-results/notion-rename-focused.log`、`test-results/notion-rename-e2e.log`。

以下保留首轮审计记录，数量与图片归属以本节为准。

2026-09-22。复核 Block Explorer 当前全部 126 项：Pandoc 89、Notion 功能/语法适配 22、其他 Markdown 产品语法 15。修正前为 89 / 12 / 25。原来的分类只识别 `notion_` 前缀，错误地将所有 `local_*` 项归入 Markdown 类。

## 已修正的十项

这些条目归入 Notdown Notion extensions，保留原扩展 ID、默认值及文件编码。分类表示功能适配来源，不表示 Notion 发明了该功能，也不表示本地编码是官方 NFM 语法。

| 扩展 | 官方功能依据 | 本地编码 |
| --- | --- | --- |
| `notion_meeting_notes` | [Meeting notes](https://developers.notion.com/reference/block#meeting-notes) | `<meeting-notes>` |
| `notion_link_preview` | [Link Preview](https://developers.notion.com/reference/block#link-preview)，含行内 link mention | `<link-preview>` / `<link-mention>` |
| `notion_bookmark` | [Bookmark](https://developers.notion.com/reference/block#bookmark) | `<bookmark>` |
| `notion_breadcrumb` | [Breadcrumb](https://developers.notion.com/reference/block#breadcrumb) | `<breadcrumb>` |
| `notion_button` | [Buttons](https://www.notion.com/help/buttons) | `<button>` |
| `notion_ai_block` | [Custom AI blocks](https://www.notion.com/help/guides/organize-your-everyday-life-with-notion-ai) | `<ai-block>` |
| `notion_html_document` | [HTML blocks](https://developers.notion.com/reference/block#html-blocks) | `<html-embed>` |
| `notion_web_embed` | [Embed](https://developers.notion.com/reference/block#embed) | `<web-embed>` |
| `local_figure` | [图片及题注](https://developers.notion.com/guides/data-apis/enhanced-markdown#media-blocks) | `<figure>`，alt 与 caption 分开 |
| `notion_tabs` | [Tab](https://developers.notion.com/reference/block#tab) | `<tabs>` / `<tab>` |

官方现已列出 Tab 容器和 HTML 文件嵌入。它们也有 Notion 功能对应。Tab 的官方 API 结构与本地结构不同；HTML 文件嵌入与本地 HTML 源码容器不同。不能据功能相似直接宣称编码兼容。

这十项继续在方言列表的 **Others** 中：此分组表示“本地方言适配未有官方语法依据”，与 Notion 来源分类是独立维度。源分类、官方链接、编码边界同时显示在扩展及对应块详情中；编辑页共用的扩展标签也同步修正。

## 其余 116 项的分类

- **Pandoc 89**：保持项目中 Pandoc 手册清单的标识，共 77 个 Markdown 范围条目和 12 个 Outside Markdown scope 条目。`alerts`、`emoji`、`mmd_*`、`wikilinks_*` 等拥有 Pandoc 标识，不因也被 GitHub、MultiMarkdown、Obsidian 或 Notion 使用而搬走；产品的语法依据另行展示。不能把“Pandoc 分类”读成“只有 Pandoc 支持”。
- **既有 Notion 12**：`notion_columns`、`notion_callouts`、`notion_toggles`、`notion_tables`、`notion_pages`、`notion_mentions`、`notion_media`、`notion_databases`、`notion_synced`、`notion_toc`、`notion_nesting`、`notion_colors` 继续按官方 Enhanced Markdown 语法归类。`notion_databases` 仍只保留原文，不冒充可编辑数据库；`notion_nesting` 的历史本地容器也已在说明中区分。
- **其他 Markdown 15**：`highlight`、`comments`、`toc_directives`、`diagrams`、`html_embed`、`mmd_tables`、`mmd_abbreviations`、`mmd_citations`、`critic_markup`、`transclusion`、`glossary`、`metadata_values`、`metadata_variables`、`typora_loose_lists`、`display_math`。它们表示 Typora、Obsidian、MultiMarkdown 等语法及本地适配。`html_embed` 是 Markdown 内的 HTML 嵌入适配，与 `notion_html_document` 的文档容器不同；`implicit_figures`、普通图片和 `local_figure` 也不合并。

## 另两处依据修正

1. [Notion Enhanced Markdown 的 Code 节](https://developers.notion.com/guides/data-apis/enhanced-markdown#code)明确描述 Mermaid 围栏。已补入 `diagrams` 的 Notion 方言依据，并限定只覆盖 Mermaid，不改变其通用 Markdown 来源分类或开关状态。
2. 上次审计对 `extended!A7:E7` 的结论错误。[官方 Custom emoji](https://developers.notion.com/guides/data-apis/enhanced-markdown#custom-emoji)确实定义 `:emoji_name:`。已更正语法说明和原报告：Notion 自定义表情与通用 shortcode 字典不是同一套解析机制，也不属于 `notion_mentions`。本地未接入工作区自定义表情解析。

## 实现边界

此轮修改分类、引用和说明，没有替换 codec 或变更用户正文。Notion 侧功能存在，不等于本地实现拥有其全部能力：本地会议块使用可选转录服务，AI 块使用配置的提供方，按钮只运行已有本地动作；它们不具有 Notion 云端服务及数据库自动化。Notion 的 link preview 在通用 Block API 中只能读取，不能用该接口创建；这不影响本地创建自己的预览块。

分类数据使用显式来源映射。回归检查覆盖来源过滤、旧 ID 深链接、块/扩展官方引用、Notion 来源与 Others 分组并存，以及默认值不变。

验证结果：`npm test` 为 424 通过、1 跳过、0 失败；最终目录数据定向测试 14 通过；`npm run build -- --outDir .run/catalog-origin-dist` 通过。Chrome 独立临时知识库中的目录/语法说明/来源分组共 12 个浏览器用例通过（首轮 11 个通过；新增用例修正引用链接选择器后单独复跑通过）。日志为 `test-results/catalog-origin-*.log`，未操作用户知识库。
