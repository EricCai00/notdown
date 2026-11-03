# Notdown 保留的自定义正文扩展

[English](NOTDOWN-EXTENSIONS.md) · **简体中文**

Notdown 优先使用已有 Markdown 方言与官方 Notion Markdown；只有对应能力无法完整表达时，才保留下列补充。依据：[Notion v1](https://developers.notion.com/guides/data-apis/enhanced-markdown)、[Notion v2](https://developers.notion.com/guides/data-apis/notion-flavored-markdown)、[已核实的 MCP 规范](NOTION-MCP-SYNTAX.zh-CN.md)。本地可编辑、可重开不等于 Notion 云端会接受或保留补充字段。

## 已采用官方替代的写法

| 旧本地表达 | 当前写入与保留内容 |
| --- | --- |
| `span bg_color` | 嵌套 `span color`，背景名带 `_bg`；保留两个颜色通道。 |
| `web-embed url/caption` | `<embed source="URL">题注</embed>`；保留 URL、题注及必要布局字段。 |
| `bookmark url/caption` | `<bookmark source="URL">题注</bookmark>`；保留 URL、题注及手工预览信息。 |
| `tabs active`、`tab title` | 官方 tabs/tab，标题写正文；保留顺序和内容，选中页签属于界面状态。 |
| `meeting-notes title/transcript` | 标题正文与官方 notes/transcript 分区；服务设置统一放现有 `meeting-config`。 |
| `column width-ratio` | 官方 `ratio` 百分比；保留有效列宽和未知属性。 |
| 整段 ISO 日期时间、旧时区别名 | 能精确表达时转成官方日期、时间、时区分列，不取整或猜测。 |
| 折叠/标题的 `open="true/false"` | 正文不再写展开状态，展开与收起属于界面状态。 |

Notdown 合集可读这些官方载体，无须把整页切为 v2。严格 `notion-markdown` 仍按所选版本处理。`span underline="true"` 是官方 v1，`u` 是官方 v2，都不是项目自创。

旧载体停止作为新建、编辑输出；历史及未知原文可恢复保留。本次仅按用户授权迁移 Default、Notion test 的可验证 Notdown 正文。代码、未知容器内的例子不转换；冲突属性和无效边界不猜测。

## 保留的块和行内载体

| 写法 | 内容 | 为什么官方语法不能完整替代 |
| --- | --- | --- |
| `<page-link url="…">标题</page-link>` | 非拥有关系的页面块 | 官方 page 表示子页面；普通链接能导航，但不能表示同一块类型和拥有关系语义。 |
| `<breadcrumb path="…"/>` | 可选页面 ID 路径；空值自动取祖先链 | 官方 Markdown 没有动态本地层级导航；固定链接不能随层级更新。 |
| `<button label="…" icon="…" variant="…" actions="JSON"/>` | 本地动作步骤；旧 action/target 可恢复 | 官方 Markdown 不能承载本地插入块、打开目标等动作协议。 |
| `<ai-block prompt="…" model="…" generate="…" using="…" context="…" search="…">正文</ai-block>` | 服务配置与参与生成的区域 | 官方 Markdown 没有本地 AI 服务及生成区域契约。 |
| `<mention-link url="…">标签</mention-link>` | 可创建的本地行内预览对象、自定义标签 | 官方 v2 link-preview 是只读标记，缺少本地预览的创建和标签契约；普通链接是另一种行内对象。 |

URL、名称和动作均是语法数据，不自动授权外部访问或执行。未知动作/字段不会作为任意脚本执行。

## 官方标签上的必要补充

| 位置 | 保留字段 | 官方格式的缺口 |
| --- | --- | --- |
| bookmark | `title/description/icon/image` | 手工填写、离线保存或抓取的卡片预览信息。来源与题注已用官方编码。 |
| link-preview | 本地卡片的 `title/description/image/caption` | 本地显示信息；不能把本地创建行为冒充为 Notion 只读标记的写入能力。 |
| embed | `title/width/height/align` | 附件名称、预览尺寸及对齐。 |
| 日期 | `reminder/reminder-offset/date-format/time-format` | 提醒与本地显示偏好。官方 date 的 time-zone、v1 timeZone 本来就是官方字段。 |
| 日期的精度/时区例外 | 旧 ISO `start/end`、旧 `time-zone` | 秒/毫秒、固定偏移或相互冲突的字段不能总是无损变为 HH:mm + IANA 时区；核验失败时保留原值，不取整。 |
| synced block/reference | `id/source-revision/snapshot-hash/auto-refresh/auto-sync` | 本地块定位、CAS 版本、快照与刷新策略；官方 URL 不提供本地同步协议。 |
| meeting-notes | `meeting-config` JSON | 本地转写/生成服务、音频附件、语言、提示词配置；旧 audio/language 合并到此配置。 |
| 代码题注 | fence 的 `caption` 属性 | 属性定界复用 Pandoc；caption 的本地显示语义不是官方 Notion 代码属性。 |

示例：官方载体只为确实缺失的信息附加属性。

```md
<bookmark source="https://example.com" title="手工标题" description="离线说明">题注</bookmark>

<embed source="assets/example.html" width="80%" height="400" align="center">说明</embed>
```

表格跨度、题注、对齐能用 Pandoc/MultiMarkdown 表达时复用已有语法，不另造 XML 表格协议。未知额外字段仍保留，不凭名称自动执行。

## 地址、版本与开关

`#page/<uuid>`、`person://<uuid>` 是本地地址约定，借用链接/提及载体，不是新的 Markdown 定界语法，也不冒充 Notion 的页面或 user:// 身份。

自定义行为仅限 `syntax.variant: notdown`，遵守相关扩展开关。其他方言的显式 true 不能越界开启本地协议；严格官方模式不赋予补充字段本地语义。未知原文、无效边界和冲突字段可恢复保留。

旧 `:::nest`、`:::columns`、`::page`、`html-embed`、独立 figure 属性载体与 Lab bookmark 围栏已停止生成。围栏、HTML、Pandoc 属性、CriticMarkup、Obsidian、Quarto、R Markdown 等已有语法不属于项目自创。

实现：[载体规范化](../../src/document/canonical-notion.ts)、[显式转换与一致性检查](../../src/document/canonical-source.ts)、[属性边界](../../src/document/notdown-boundary.ts)。迁移与历史结论见 [2026-10-27 审计](../audits/CUSTOM-SYNTAX-AUDIT-2026-10-27.zh-CN.md)。
