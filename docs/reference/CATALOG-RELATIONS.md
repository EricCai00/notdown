# 对象、方言与扩展目录

2026-09-22。Block Explorer 的对象、Markdown variant、extension 现在可以两两双向跳转。详情使用带状态的 URL fragment，支持复制地址、刷新与浏览器前进／后退；搜索词、类别和所选方言在返回时恢复。Child structures 单列行、单元格、题注、列、列表分组、定义术语、脚注正文和引用定义，双向链接所属对象；Existing content 板块已移除；Inline raw source 纳入 Content objects，行内文件引入归入 File transclusion。Mention agent 与 Inline media 已移除。MMD metadata 已归入 YAML front matter 的独立编码；Database reference 对象已移除。未实现对象不因此获得插入入口。

Content objects 是产品语义；底层节点是编辑模型。三类列表项各自使用独立节点，Heading 的级别和折叠状态使用属性，所有表格编码共享结构化表格。字符类中的实体、转义和智能标点是文本规则，不额外生成节点；hard_break 保留显式换行语义。ProseMirror mark 是行内格式机制：strong 表示粗体，highlight 表示高亮并输出 HTML `<mark>`，两者不同。

不再把 doc、text、nested_block 或 syntax_block 等技术机制展示为产品对象：doc/text 维持文档和文本，nested_block 支持普通段落及标题的子块，syntax 载体承接尚未直接编辑的具体对象及原文。删除这些机制会损坏文档结构或恢复路径。它们不提供独立的产品插入入口。Inline raw source 已加入正式清单，File transclusion 共用块级和行内位置；Agent 提及、Inline media 和 Existing content 已移除。详见[来源与限制](../architecture/METADATA-AND-COMPATIBILITY.md)。

## 分类依据

扩展列表另外按当前 variant 的语法规范／官方文档与 Pandoc 默认状态分组；工作簿的来源分类继续作为独立筛选条件。编辑页设置与 Block Explorer 共用同一份依据，细节见[扩展依据与分组](./EXTENSION-PROVENANCE.md)。

来源为用户提供的 `markdown & notion.xlsx`，`extensions!A2:N117`（sheet 名是复数）。仓库中的 [只读快照](../data/extension-workbook.json) 保留 115 行、来源列、11 个方言列和原生注册列，附原始行号及采集日期。原工作簿没有被修改，运行应用不依赖用户桌面文件。

| 来源类别 | 数量 | 含义 |
| --- | ---: | --- |
| Pandoc manual | 89 | 表中“Pandoc 手册”条目，包括已实现、待实现及非 Markdown 项目 |
| Notdown product extensions | 14 | 表中“Notdown 产品扩展”；是 Notdown 的配置分组，不表示这些语法由 Notdown 发明 |
| Notdown Notion extensions | 12 | 表中“Notdown Notion 扩展”；Notion 编码及部分 Notdown 兼容路径 |

来源类别与内容对象的 block / metadata / inline / character 类别互相独立。旧的 `Extension.kind = block | syntax` 保留为实现字段，不再用来代替目录中的来源类别。扩展通过关联对象显示其用途，同一个扩展可以涉及块、行内及字符处理。

当前 103 个 Markdown 扩展均已注册并有本地执行路径；12 个 Outside Markdown scope 项始终排最后且不能启用。注册不表示 Pandoc 全部规则已复刻，具体能力见扩展详情及 [本地对象与服务](./LOCAL-OBJECTS.md)。当前默认状态始终来自现有 `enabled` / `supportsOption`；工作簿里的“开／可／—”及斜线组合单独标为 Workbook reference，不覆盖本地配置。

## 关系和能力

- Object ↔ Extension：从对象注册表的 adapter 自动生成编码关系；补充空行要求、属性、转义、编号等语法修饰关系。已接入修饰器标为 Syntax modifier。
- Object ↔ Variant：显示当前注册模型在默认配置、可选扩展开启时的路径，以及对应的直接编辑／源码编辑／原文保留等模式。无路径也明确显示，可用于查看后续缺口。
- Variant ↔ Extension：全部 115 个参考条目可以互相返回；每项明确标出默认启用、可选、不适用、待实现或非 Markdown 范围。列出某扩展不代表方言支持它。
- 外部文档在新标签页打开；对象详情可经编码扩展或方言链接追到官方文档。这里只描述本地注册路径，不宣称复制上游产品全部行为。

## notion_* 规范命名

按用户要求，12 个键已统一为 notion_columns、notion_callouts、notion_toggles、notion_tables、notion_pages、notion_mentions、notion_media、notion_databases、notion_synced、notion_toc、notion_nesting、notion_colors。

旧 notdown_* 键继续可读、可搜索；规范键与旧键并存时规范键优先。配置写回使用规范键，未知键保留，没有批量改写知识库。工作簿快照保留原始名称及状态，方言默认值不变。

名称表示语法分组，不等于官方认证：nesting 同时支持旧 :::nest；databases 只保留原始标签，没有数据库产品对象。Callout 的 alerts / notion_callouts 和 TOC 的 toc_directives / notion_toc 按编码分别控制。Synced block 的本地刷新和 CAS 发布不表示跨端同步。

## 参考链接

参考了工作簿的 `merged`、`markdown`、`extended`、`notion`、`variants`、`pandoc` 等 sheet。对象身份继续以原 80 项清单加上 Inline raw source，共 81 项为准，参考表中的语法归属不直接变成本地功能声明。

2026-09-21 核对并加入目录的主要官方来源：

- [Pandoc manual](https://pandoc.org/MANUAL.html)：扩展卡片尽量链接具体章节；`subscript` / `superscript` 等合并章节使用真实锚点。预设仍以项目已有 3.11 快照为准。
- [Notion enhanced Markdown](https://developers.notion.com/guides/data-apis/enhanced-markdown)：标签、引用和富文本属性的命名依据。
- [Typora Markdown reference](https://support.typora.io/Markdown-Reference/) 与 [Obsidian formatting syntax](https://obsidian.md/help/syntax)：产品语法参考。
- [MultiMarkdown 6 syntax](https://fletcher.github.io/MultiMarkdown-6/syntax/)：与工作簿的 v6 对齐，未擅自切换版本；表格、引文、元数据、transclusion 等直接链接章节。
- [CommonMark 0.31.2](https://spec.commonmark.org/0.31.2/)、[GFM specification](https://github.github.com/gfm/)、[PHP Markdown Extra](https://michelf.ca/projects/php-markdown/extra/)、[Original Markdown](https://daringfireball.net/projects/markdown/syntax)：对应方言的官方语法入口。

网页只作说明来源；不在应用启动时请求或加载这些网页，不向外发送笔记内容。

2026-09-22 后续：新增 `notion_underline`，与 `notion_colors` 分离；九个 Notion 功能适配由 `local_*` 改名为 `notion_*`，旧 ID 为兼容别名，正式名优先。`local_figure` 是通用图片题注适配，保留 Markdown 分类。详见 [分类审计](../audits/EXTENSION-CLASSIFICATION-AUDIT-2026-09-22.md)。
