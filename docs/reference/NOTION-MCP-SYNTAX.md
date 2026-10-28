# Notion MCP Enhanced Markdown 支持（2026-09-27）

依据为通过官方 Notion MCP `fetch` 读取的 `notion://docs/enhanced-markdown-spec`，以及[公开 Enhanced Markdown 文档](https://developers.notion.com/guides/data-apis/enhanced-markdown)。两份来源取并集：MCP 的额外语法不会关闭公开文档已有写法。这里确认的是本地解析、编辑、保存支持，不是 REST Markdown 写入端点逐项接受性认证。

以下语法在 `notdown` 和 `notion-markdown` 都启用，并遵循对应扩展开关：

| 语法 | 本地行为与边界 |
| --- | --- |
| `<tabs>` / `<tab icon="…">` | Tab 的第一行缩进内容为标题，之后为正文。支持切换、重命名、增删和排序。活动 Tab 是本地视图状态，不写为官方属性。新插入使用官方形式。 |
| `<embed src="…" color="…">Caption</embed>` | HTML 附件的 URL 引用，使用统一 PM `block.web_embed`，保留 `notion_embed` 编码；HTTP(S) 或知识库 HTML 附件可在禁用脚本的沙箱 iframe 预览。不会自动下载远端 HTML。 |
| `<folder url="…">Title</folder>` | 可编辑的现有文件夹引用；不在 Notion 创建文件夹。 |
| `<database url="…" inline="true" icon="…" wiki="true">Title</database>` | 保存数据库引用及属性。`url="#page/<host-id>"` 指向本地数据库入口页；`inline="true"` 展示可编辑表格，否则打开完整数据库。记录、字段和视图定义仍保存在知识库资源中，不写入正文。远端 URL 及 `data-source-url` 保持引用；不执行远端移动或创建。 |
| `<meeting-notes>` | 第一行是标题；其下支持 `<summary>`、`<notes>`、`<transcript>` 分区及嵌套块。分区可本地编辑，保存不会丢弃 transcript；官方形式不提供本地 AI 转录替换操作。新插入仅有标题，输入正文后写为 notes。 |
| `<column ratio="…">` | 官方百分比列宽，已支持拖动与保存。 |
| `<col width="…">` | 保存原始宽度值，空值保留为自动宽度。MCP 未定义单位；现有本地呈现将无单位数字按 CSS 像素显示，这属于本地显示约定，不是对 Notion 单位的断言。 |
| `<mention-date … endTime="…"/>` | 保存与编辑 start/end、startTime/endTime、timeZone。 |
| `<mention-agent url="…">…</mention-agent>` | Agent 引用，保留名称、URL 和未知属性；不执行 Agent。 |
| `<synced_block>` 无 url | 可解析本地内容快照；不请求 Notion 自动创建块。 |
| `<synced_block_reference … notice="…">` | 保留 notice，并在正文外显示不可编辑提示；不实现 Notion 云端同步。 |
| `<unknown url="…" alt="…"/>` | 保留引用和替代说明。导入恢复仍须独立 Block API 证据。 |
| Callout / Tab 的 Notion Icon | 图标值与 emoji 均可保存、编辑并往返；没有接入 Notion 图标资源库，路径型图标当前显示原始标识。 |

示例：

```markdown
<tabs>
	<tab icon="icons/document_gray">
		First tab
		Content
	</tab>
</tabs>

<meeting-notes>
	Weekly meeting
	<notes>
		User notes
	</notes>
	<transcript>
		Original transcript
	</transcript>
</meeting-notes>
```

富文本同时接受 MCP 的 `` $`x^2`$ `` 与公开文档的 `$x^2$`，编辑后保留各自分隔符。行内代码支持 `` `first<br>second` ``，保存时把代码内部换行写为 `<br>`；真实多行反引号代码不会被误判成此语法。代码围栏内的标签保持字面内容。

官方 Code 语法中的 `mermaid` 围栏默认使用本地 Diagram 预览，适用于 v1/v2、Notdown 与官方 Notion 方言，以及 Callout、列表等嵌套内容。关闭 **Diagram** 扩展时保留可编辑代码，重新开启恢复图表；源码、围栏属性和未知字段继续原样保留。sequence/flow 是其他方言支持的图表写法，不随 Mermaid 支持进入官方 Notion 方言。

引用支持 `[^https://example.com]`、`[^example.com]` 和 `[^{{1}}]`。Notdown 中有显式脚注定义时，仍优先遵循已有脚注定义。`src="{{1}}"` 和 `file-upload://…` 保留原值，但没有 MCP 上下文中的 URL 映射或上传资源解析器时不会被当成可访问的本地地址。

旧 Notdown `<tabs active="…"><tab title="…">…`、`<meeting-notes title="…" audio="…">…` 编码继续读取且不批量迁移；这些额外属性没有因此成为官方语法。`<web-embed>`、`<page-link>`、Button、AI block 等补充协议仍仅限 Notdown。已停用的 `<html-embed>` 不会因本次 MCP 支持重新启用。表格合并仍使用已有 Pandoc 编码，不把 rowspan/colspan 提升为官方语法。

验证位于 `tests/unit/notion-mcp-spec.test.ts` 与 `tests/e2e/notion-mcp-spec.spec.ts`，覆盖属性编辑、原文保留、撤销、关闭扩展、代码围栏、畸形边界及保存重载。

## Notion v2 的保存规则

`syntax.notionVersion: "v2"` 使用[官方 Notion-flavored Markdown](https://developers.notion.com/guides/data-apis/notion-flavored-markdown)。v1 Enhanced Markdown 与 v2 的标签有所不同；保留页面已有版本，不通过编辑自动切换版本。

新建或编辑的普通标题、无子块的列表与引用、任务、粗斜体和删除线、普通图片、无颜色公式及可无损表达的表格优先输出 Markdown。普通表格需要完整首行表头、规则行列、单段单元格，无列宽、颜色和其他属性；其他表格保留官方表格载体。粗斜体与删除线先用 Markdown 序列化，再用同一 v2 行内解析器校验；不能恢复相同内容和标记时使用官方 `<b>` / `<i>` / `<s>`，包括边缘空白和标记交错的歧义情况。

`<u>`、`<span color="…">`、带属性或子块的 `<p>` / `<h1>`–`<h4>` / `<quote>` / `<li>`、toggle、callout、分栏、提及、音视频及其他专属对象仍按官方标签表达。Notdown 扩展仍受 `variant` 边界控制。原文保留机制优先于规范化：未编辑的旧块、未知字段、代码围栏及未知结构不因相邻编辑而改写，不遍历或迁移用户知识库。

回归覆盖：`tests/unit/notion-v2.test.ts` 与 `tests/e2e/mobile.spec.ts`。
