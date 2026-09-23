# Notdown 内容合集与插入菜单

2026-09-23 最终边界：Notdown 集合已有 Markdown 方言与 Notion。自定义正文语法仅用于补足官方 Enhanced Markdown 不支持的 Notion block、已有 block 的属性、inline 和 style，且只能在 `syntax.variant: notdown` 启用；`notion-markdown` 仅启用官方文档定义的语法，显式扩展开关也不能越过此边界。能用已有方言表达的内容复用该方言，不能另造重复协议。旧文件和未知字段必须可恢复保留，不批量迁移用户内容。 九组补充块默认启用；图片题注复用 Pandoc，旧指令与 Lab 围栏不再作为活动语法。见 [整改清单](../audits/CUSTOM-SYNTAX-AUDIT-2026-09-23.md)。

2026-09-22。Notdown 是项目自己的 Markdown 方言，复用单一 ProseMirror 文档与现有 codec；不是 Notion、思源或其他上游的完整 fork。

## 已接通的内容

Notdown 保留现有 Notion 文本、列表、待办、引用、分隔线、折叠、分栏、Callout、页面引用、媒体、表格、目录、公式、提及及有限颜色样式。项目的九类 Notion 补充块扩展仍默认开启。

在同一正文中，额外默认启用脚注、定义列表、行块、Div 容器、Mermaid/sequence/flow 图、Markdown alerts、隐藏评论、文件嵌入、管道/MultiMarkdown/grid/simple/multiline 表格、例子列表与 fancy lists、HTML、元数据、引用文献、术语表、CriticMarkup，以及上下标、高亮、emoji、原生 span、行内注释与多种数学分隔符。H5/H6 在 Notdown 中保留；原 `notion-markdown` 预设仍按 H4 上限处理。

Markdown 扩展也可出现在 Notion 容器内。修改外层 Callout、折叠或分栏时，子内容通过对应写入器保存，不降为纯文本。XML 样式包装放在上下标等 Markdown 标记之外，避免颜色属性中的空格破坏重读。未修改正文继续复用原文和 CRLF；未知 XML、未知属性、未闭合容器和代码围栏中的字面内容保留。显式扩展关闭值优先，切换方言不迁移文件。

## 语法冲突

这是一套确定的合集语法，不能把互斥方言规则同时应用到同一串字符：

- 普通块的单换行和 Tab 子层级沿用 Notion；Markdown 扩展容器内部由其原有读写器解释。使用空行明确分隔定义列表等多行内容与下一块。
- `[^label]` 在 Notdown 默认是脚注引用；原 Notion 引用行为留在 `notion-markdown` 预设。
- Wiki 链接默认 `[[target|label]]`；反向解释、smart punctuation、literate Haskell 等不默认混入。
- Notion 显式标签与未知 XML 的边界优先，不用全局字符串替换合并语法。新的完整 HTML 文档使用 HTML document 块。
- 此次不是全部上游一致性测试认证，也不宣称所有方言的空格缩进、标点替换与输出控制选项能同时生效。现有专用预设继续提供其原有行为。

## `/` 菜单

插入菜单按 `Notion basic`、`Notion advanced`、`Notion media`、`Notion embeds`、`Notion inline`、`Notion style`、`Markdown blocks`、`Markdown inline` 排列，空组不显示。每项都有注册的图标，以 Lucide 为主，脚注使用独立的 `[1]` 图标；搜索覆盖名称、别名和分类。上下方向键跨组移动，Enter 选择，Esc 取消，组标题不会占用选择位置。关闭扩展后，相应命令从菜单消失。

补充粗体、斜体、下划线、删除线、文字色、背景色、上下标、高亮、emoji、行内公式与 H4–H6 的插入入口。样式项插入可编辑示例文字，已有选区仍使用浮动格式菜单修改。菜单中的 Notion 分类是内容类型分类，不表示本地实现可调用所有 Notion 云功能。

菜单依据功能分类：Tabs 属于 Notion advanced，HTML document 与 Web embed 属于 Notion embeds。Footnote 属于 Markdown inline，使用独立的 `[1]` 图标；在光标处插入引用，将可编辑定义追加到文末，不打断所在段落。Inline note 保留独立入口和对话框图标，表示 `^[正文]` 这种就地存储的语法。底层脚注定义仍可包含多个块，不能仅保留引用而丢掉定义。

脚注定义统一呈现在文末 `Footnotes` 区域，仅一条分隔线；按正文首次引用顺序编号与排序，重复引用复用编号，未引用定义保留在末尾。定义没有块手柄、拖拽、块菜单或块插入按钮，内容仍可直接编辑。编辑器用同一 ProseMirror 文档中的源位置锚点与注释区呈现，序列化前恢复定义的原始位置；显示排序不重写原 Markdown 顺序或脚注标识符。源码模式继续展示原生脚注语法。

脚注区的编号显示为 `1. 正文`、`2. 正文`，与正文上标 `[1]` 区分。多段落和代码对齐到正文列；末尾的 `↩` 按钮返回相应引用，重复引用提供 `↩` / `↩2` 等独立入口。按钮可通过键盘使用，返回后光标回到对应引用旁；按钮和展示编号均为视图装饰，不写进 Markdown，也不作为可编辑正文保存。

## 仍未完整覆盖的 Notion 能力

| 能力 | 当前边界 |
| --- | --- |
| 数据库、关联视图、看板、日历、时间线、表单、图表 | 尚未实现数据库对象；已有数据库标签按原文保留 |
| 人员与数据源提及 | 本地引用/原文兼容，不提供 Notion 工作区成员解析与协作通知 |
| 同步块 | 本地来源、快照、CAS 发布；没有 Notion 云端或跨端同步 |
| Button | 已有本地动作，不包含完整 Notion 自动化动作 |
| AI、会议记录 | 沿用已配置服务；不是 Notion AI 服务实现 |
| 页面字体、完整样式系统、协作评论、权限 | 不因新增格式菜单而视为完整支持 |
| 外部嵌入与预览 | 沿用现有提供方和 sandbox 限制，不保证每个平台均能嵌入 |

Notion 的 API 本身也不等于其全部 UI 块。核对来源：[Block API](https://developers.notion.com/reference/block)、[Rich text](https://developers.notion.com/reference/rich-text)、[写作与编辑](https://www.notion.com/help/writing-and-editing-basics)。

正文仍是 `vault/pages/*.md`，页面属性仍为 YAML；保存仍走 `createVault`、`baseRevision` 和可恢复冲突分支。测试使用临时知识库，不写用户 `vault/` 或 MyBase 主库。
