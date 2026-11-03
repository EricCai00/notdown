# 内容能力分类、方言支持与 Notdown 实现对照

[English](CONTENT-CAPABILITIES.md) · **简体中文**

> 后续修订：用户明确采用与 Markdown 写法无关的语义模型。最新修订表及现有块的合并、规范命名建议见[块语义模型核对](../architecture/BLOCK-MODEL-REVIEW.zh-CN.md)。本文的语法差异不表示必须拆成不同语义类型；例如 callout/alert 可统一，脚注定义与引用可归属于同一个脚注实体。

核对日期：2026-09-20。以用户提交的 **87 项总结**为基础，保留原始顺序与行号，覆盖 **11 种方言**。本表按“内容能力”组织；[115 项扩展开关表](PANDOC-EXTENSIONS-MATRIX.zh-CN.md) 按“配置名称”组织，两者不是一一对应。原始七列和本次结果保存在 [机器可读审计数据](../data/content-capabilities-2026-09-20.json)。

## 对原总结的评价与修订

这份总结适合做编辑器的功能目录：同时覆盖正文、行内、媒体、容器、元数据和协作。但它尚不能直接作为统一 AST schema 或实现完成清单。建议把原来的分类拆为 **语义类别、具体写法、方言支持、Notion API 映射、Notdown 实现层级**。

1. **leaf/container 是解析模型术语。** CommonMark 的 paragraph 是叶块，Notion paragraph 能包含子块；table、definition list、footnote definition 需要按实际模型说明内部结构。不能用一列替所有模型判定。参见 [CommonMark 分类](https://spec.commonmark.org/0.31.2/#blocks-and-inlines) 与 [Notion 子块规则](https://developers.notion.com/reference/block#block-types-that-support-child-blocks)。
2. **不要把 original/GFM/MMD 当作独占归属或发明来源。** 功能可存在于多个方言，写法和默认值也可能不同。图片本来就是 Markdown 行内语法，独立图片与带题注 Figure 另分；代码块不只有围栏。
3. **应拆的同义项：** empty line ≠ empty block；HTML block ≠ embed；callout ≠ 完全相同的 alert 语法；文件转引 ≠ iframe；脚注定义 ≠ 脚注引用；普通 autolink ≠ 裸 URL；cross-reference ≠ 只有一种链接语法。
4. **元数据与服务不能塞进正文 AST。** 页面图标、封面、属性属于页面模型；数据库视图、按钮、评论、reaction、提醒属于应用/服务能力。原文可恢复不代表功能已实现。
5. **Notion 名称按当前文档核对。** heading_4 和 tab 当前确实存在；折叠标题是 heading 的 is_toggleable；meeting_notes 在 2026-03-11 替代旧 transcription。rich_text 样式字段叫 annotations。HTML 文件 embed 与 Markdown raw HTML 仍需区分。参见 [Block API](https://developers.notion.com/reference/block)、[Rich text](https://developers.notion.com/reference/rich-text)。
6. **MMD 的 Title: 元信息不等于 YAML；CriticMarkup 的修订/注释/高亮是一组独立规则。** 参见 [MMD 元数据](https://fletcher.github.io/MultiMarkdown-6/syntax/metadata.html)、[CriticMarkup](https://fletcher.github.io/MultiMarkdown-6/syntax/critic.html)。

## 表格口径

每格统一写 **参考方言 / Notdown 原生**。八个 Pandoc 列指 Pandoc 3.11 对该方言的实现；Typora/Obsidian 指其公开产品文档；N 指公开 Notion Enhanced Markdown 格式，**不是 REST Block API 支持集合**。MMD 列是 Pandoc markdown_mmd，不冒充完整 MultiMarkdown 6；原生附加的 MMD 产品规则和 MMD 6 对应关系另见后文。Strict 是 Pandoc 的原始 Markdown 兼容预设，不宣称等同 Markdown.pl。

| 符号 | 所属侧 | 含义 |
| --- | --- | --- |
| 基 | 参考 | 解析器基础语法，不必有同名扩展开关 |
| 有 / 设 | 产品参考 | 官方文档有对应功能 / 需产品偏好设置，未把本地设置当厂商默认 |
| 开 / 可 | 两侧 | 扩展默认开启 / 可开启；多路线时有一条默认可用即记开，具体写法看逐项说明 |
| 内 | 原生 | parser 内置，不依赖同名用户开关 |
| HTML / 属性 / 输出 | 参考 | 借 HTML、属性语义或 writer 选项表达，不是独立基础语法 |
| 外 / 参 | 产品参考 | 应用或插件等外部层能力（不承诺存在已核验插件） / 仅相关表示，不能认定同一语义 |
| 占 | Notion 参考 | Markdown API 用 unknown 占位，不能直接还原相应功能 |
| — / 待 | 参考 | 无本表定义的专门语法路线 / 公开材料尚不足以确定，不强行判不支持 |
| 未 | 原生 | 没有目标功能的专用实现；显示成普通文本、HTML 或保留原文不算完成 |
| 保 | 原生 | 明确只保留原文/代码/未知引用，不实现目标语义 |
| 应用 | 原生 | 已有应用层能力，与正文方言无关 |
| * | 原生 | 子集、不同写法或语义/编辑边界；必须同时读逐项说明 |

P=markdown；S=markdown_strict；E=markdown_phpextra；M=markdown_mmd；GH=markdown_github（旧版）；C=commonmark；GFM=gfm（Pandoc 3.11）；CX=commonmark_x；T=Typora；O=Obsidian；N=notion-markdown。

原生默认值使用 extensions={}，不含用户覆盖、defaultSyntax 为旧页面附加的兼容配置。开关由 supportsOption/enabled 计算；同一开关可能跨多行能力，一个能力也可能需多个开关。**表格不是全语法 conformance 或完整 UI 验收报告。**

## 基础块与列表

| # | 内容能力 | P | S | E | M | GH | C | GFM | CX | T | O | N |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 分隔线 divider | 基/内 | 基/内 | 基/内 | 基/内 | 基/内 | 基/内 | 基/内 | 基/内 | 有/内 | 有/内 | 有/内 |
| 2 | 标题 heading | 基/内* | 基/内* | 基/内* | 基/内* | 基/内* | 基/内* | 基/内* | 基/内* | 有/内* | 有/内* | 有/内* |
| 3 | 代码块 code block | 基/内 | 基/内 | 基/内 | 基/内 | 基/内 | 基/内 | 基/内 | 基/内 | 有/内 | 有/内 | 有/内 |
| 4 | HTML 源码块 | 开/开* | 开/开* | 开/开* | 开/开* | 开/开* | 开/开* | 开/开* | 开/开* | 有/开* | 有/开* | 占/保 |
| 5 | 段落 paragraph | 基/内 | 基/内 | 基/内 | 基/内 | 基/内 | 基/内 | 基/内 | 基/内 | 有/内 | 有/内 | 有/内 |
| 6 | 表格 table | 开/开* | 可/可* | 开/开* | 开/开* | 开/开* | 可/可* | 开/开* | 开/开* | 有/开* | 有/开* | 有/开* |
| 7 | 引用 block quote | 基/内 | 基/内 | 基/内 | 基/内 | 基/内 | 基/内 | 基/内 | 基/内 | 有/内 | 有/内 | 有/内 |
| 8 | 无序列表项 | 基/内 | 基/内 | 基/内 | 基/内 | 基/内 | 基/内 | 基/内 | 基/内 | 有/内 | 有/内 | 有/内 |
| 9 | 有序列表项 | 基/内 | 基/内 | 基/内 | 基/内 | 基/内 | 基/内 | 基/内 | 基/内 | 有/内 | 有/内 | 有/内 |
| 10 | 任务列表项 | 开/开* | 可/可* | 可/可* | 可/可* | 开/开* | 可/可* | 开/开* | 开/开* | 有/开* | 有/开* | 有/开* |

## 媒体、容器、资源与服务

| # | 内容能力 | P | S | E | M | GH | C | GFM | CX | T | O | N |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 11 | 显式空块 | —/保 | —/保 | —/保 | —/保 | —/保 | —/保 | —/保 | —/保 | 有/内 | 待/保 | 有/内 |
| 12 | 块公式 | 开/开* | 可/可* | 可/可* | 开/开* | 可/可* | 可/可* | 开/开* | 开/开* | 有/开* | 有/开* | 有/开* |
| 13 | 独立图片/figure | 基+开/内+开* | 基+可/内+可* | 基+可/内+可* | 基+开/内+开* | 基+可/内+可* | 基+可/内+可* | 基+可/内+可* | 基+可/内+可* | 有/内+可* | 有/内+可* | 有/内* |
| 14 | 图表 diagram | —/可* | —/可* | —/可* | —/可* | —/可* | —/可* | —/可* | —/可* | 有/开* | 有/开* | 有/保 |
| 15 | 提示容器 callout/alert | 可/可* | 可/可* | 可/可* | 可/可* | 开/开* | 可/可* | 开/开* | 开/开* | 有/开* | 有/开* | 有/开* |
| 16 | 目录 table of contents | 输出/可 | 输出/可 | 输出/可 | 输出/开 | 输出/可 | 输出/可 | 输出/可 | 输出/可 | 有/开 | 外/开 | 有/开 |
| 17 | 链接到页面 | 基/内 | 基/内 | 基/内 | 基/内 | 基/内 | 基/内 | 基/内 | 基/内 | 有/内 | 有/内 | 有/开 |
| 18 | 嵌入网页/文件转引 | HTML/可* | HTML/可* | HTML/可* | HTML/开* | HTML/可* | HTML/可* | HTML/可* | HTML/可* | 有/开* | 有/开* | 占/保 |
| 19 | 子页面 child page | —/可* | —/可* | —/可* | —/可* | —/可* | —/可* | —/可* | —/可* | —/可* | —/可* | 有/开* |
| 20 | 内联数据库 | —/可* | —/可* | —/可* | —/可* | —/可* | —/可* | —/可* | —/可* | —/可* | 外/可* | 有/开* |
| 21 | 整页数据库 | —/可* | —/可* | —/可* | —/可* | —/可* | —/可* | —/可* | —/可* | —/可* | 外/可* | 有/开* |
| 22 | 关联数据源视图 | —/未 | —/未 | —/未 | —/未 | —/未 | —/未 | —/未 | —/未 | —/未 | 外/未 | 参/保 |
| 23 | 按钮 button | —/未 | —/未 | —/未 | —/未 | —/未 | —/未 | —/未 | —/未 | —/未 | 外/未 | 占/保 |
| 24 | 面包屑 breadcrumb | —/应用* | —/应用* | —/应用* | —/应用* | —/应用* | —/应用* | —/应用* | —/应用* | —/应用* | 外/应用* | 占/应用* |
| 25 | 视频 video | HTML/可* | HTML/可* | HTML/可* | HTML/可* | HTML/可* | HTML/可* | HTML/可* | HTML/可* | 有/可* | 有/可* | 有/开* |
| 26 | 音频 audio | HTML/可* | HTML/可* | HTML/可* | HTML/可* | HTML/可* | HTML/可* | HTML/可* | HTML/可* | 有/可* | 有/可* | 有/开* |
| 27 | 附件 file | 基/内+可* | 基/内+可* | 基/内+可* | 基/内+可* | 基/内+可* | 基/内+可* | 基/内+可* | 基/内+可* | 有/内+可* | 有/内+可* | 有/开* |
| 28 | 网页书签卡片 | —/未 | —/未 | —/未 | —/未 | —/未 | —/未 | —/未 | —/未 | —/未 | —/未 | 占/保 |
| 29 | PDF 嵌入 | HTML/可* | HTML/可* | HTML/可* | HTML/可* | HTML/可* | HTML/可* | HTML/可* | HTML/可* | 待/可* | 有/可* | 有/开* |
| 30 | 链接预览 link preview | —/未 | —/未 | —/未 | —/未 | —/未 | —/未 | —/未 | —/未 | —/未 | 外/未 | 占/保 |
| 31 | 会议纪要 meeting notes | —/未 | —/未 | —/未 | —/未 | —/未 | —/未 | —/未 | —/未 | —/未 | 外/未 | 有/保 |
| 32 | 未知/不支持内容 | —/保 | —/保 | —/保 | —/保 | —/保 | —/保 | —/保 | —/保 | 待/保 | 待/保 | 占/保 |
| 33 | 折叠区 toggle | HTML/可* | HTML/可* | HTML/可* | HTML/可* | HTML/可* | HTML/可* | HTML/可* | HTML/可* | 有/可* | 外/可* | 有/开* |
| 34 | 折叠标题 | —/未 | —/未 | —/未 | —/未 | —/未 | —/未 | —/未 | —/未 | 待/未 | 外/未 | 有/开* |
| 35 | 标签页容器 tabs | —/未 | —/未 | —/未 | —/未 | —/未 | —/未 | —/未 | —/未 | —/未 | 外/未 | 待/保 |
| 36 | 同步块 synced block | —/可* | —/可* | —/可* | —/可* | —/可* | —/可* | —/可* | —/可* | —/可* | 外/可* | 有/开* |
| 37 | 分栏 columns | —/可 | —/可 | —/可 | —/可 | —/可 | —/可 | —/可 | —/可 | —/可 | 外/可 | 有/开 |

## 元数据与扩展块

| # | 内容能力 | P | S | E | M | GH | C | GFM | CX | T | O | N |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 38 | YAML front matter | 开/开* | 可/可* | 可/可* | 可/可* | 可/可* | 可/可* | 开/开* | 开/开* | 有/开* | 有/开* | —/未 |
| 39 | Pandoc 标题块 | 开/开* | 可/可* | 可/可* | 可/可* | 可/可* | —/未 | —/未 | —/未 | —/可* | —/可* | —/未 |
| 40 | 块内隐藏注释 | HTML/开 | HTML/开 | HTML/开 | HTML/开 | HTML/开 | HTML/开 | HTML/开 | HTML/开 | 有/开 | 有/开 | —/未 |
| 41 | 定义列表 | 开/开 | 可/可 | 开/开 | 开/开 | 可/可 | 可/可 | 可/可 | 开/开 | 待/可 | —/可 | —/未 |
| 42 | 指定格式原始源码 | 开/开* | 可/可* | 可/可* | 开/开* | 可/可* | 可/可* | 可/可* | 开/开* | 待/可* | —/可* | —/未 |
| 43 | 脚注定义 | 开/开 | 可/可 | 开/开 | 开/开 | 开/开 | 可/可 | 开/开 | 开/开 | 有/开 | 有/开 | —/未 |
| 44 | 行块 line block | 开/开 | 可/可 | 可/可 | 可/可 | 可/可 | —/可 | —/可 | —/可 | —/可 | —/可 | —/未 |
| 45 | HTML 原生 Div 语义 | 开/未 | 可/未 | 可/未 | 可/未 | 可/未 | —/未 | —/未 | —/未 | —/未 | —/未 | —/未 |
| 46 | 原始 TeX | 开/未 | 可/未 | 可/未 | 可/未 | 可/未 | —/未 | —/未 | —/未 | —/未 | —/未 | —/未 |
| 47 | 示例编号列表 | 开/未 | 可/未 | 可/未 | 可/未 | 可/未 | —/未 | —/未 | —/未 | —/未 | —/未 | —/未 |

## 行内内容与文字规则

| # | 内容能力 | P | S | E | M | GH | C | GFM | CX | T | O | N |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 48 | 行内代码 code span | 基/内 | 基/内 | 基/内 | 基/内 | 基/内 | 基/内 | 基/内 | 基/内 | 有/内 | 有/内 | 有/内 |
| 49 | 强调 emphasis | 基/内 | 基/内 | 基/内 | 基/内 | 基/内 | 基/内 | 基/内 | 基/内 | 有/内 | 有/内 | 有/内 |
| 50 | 加粗 strong emphasis | 基/内 | 基/内 | 基/内 | 基/内 | 基/内 | 基/内 | 基/内 | 基/内 | 有/内 | 有/内 | 有/内 |
| 51 | 删除线 strikethrough | 开/开 | 可/可 | 可/可 | 可/可 | 开/开 | 可/可 | 开/开 | 开/开 | 有/开 | 有/开 | 有/开 |
| 52 | 链接 link | 基/内 | 基/内 | 基/内 | 基/内 | 基/内 | 基/内 | 基/内 | 基/内 | 有/内 | 有/内 | 有/内 |
| 53 | 行内图片 | 基/内* | 基/内* | 基/内* | 基/内* | 基/内* | 基/内* | 基/内* | 基/内* | 有/内* | 有/内* | —/内* |
| 54 | 自动链接 autolink | 基/内 | 基/内 | 基/内 | 基/内 | 基/内 | 基/内 | 基/内 | 基/内 | 有/内 | 有/内 | 待/内 |
| 55 | 行内 HTML | 开/开 | 开/开 | 开/开 | 开/开 | 开/开 | 开/开 | 开/开 | 开/开 | 有/开 | 有/开 | —/未 |
| 56 | 文内/跨文档引用 | 基/内* | 基/内* | 基/内* | 基/内* | 基/内* | 基/内* | 基/内* | 基/内* | 有/内* | 有/内* | 有/内* |
| 57 | Emoji 名称 | 可/可 | 可/可 | 可/可 | 可/可 | 开/开 | 可/可 | 开/开 | 开/开 | 有/开 | 有/开 | 有/保 |
| 58 | 行内公式 | 开/开 | 可/可 | 可/可 | 开/开 | 可/可 | 可/可 | 开/开 | 开/开 | 设/开 | 有/开 | 有/开 |
| 59 | 下标 subscript | 开/开* | 可/可* | 可/可* | 开/开* | 可/可* | 可/可* | 可/可* | 开/开* | 设/开* | HTML/可* | —/未 |
| 60 | 上标 superscript | 开/开* | 可/可* | 可/可* | 开/开* | 可/可* | 可/可* | 可/可* | 开/开* | 设/开* | HTML/可* | —/未 |
| 61 | 高亮 highlight | 可/可* | 可/可* | 可/可* | 可/开* | 可/可* | —/可* | —/可* | —/可* | 设/开* | 有/开* | 参/开* |
| 62 | 行内源码注释 | HTML/开 | HTML/开 | HTML/开 | HTML/开 | HTML/开 | HTML/开 | HTML/开 | HTML/开 | HTML/开 | 有/开 | —/未 |
| 63 | 脚注引用 | 开/开 | 可/可 | 开/开 | 开/开 | 开/开 | 可/可 | 开/开 | 开/开 | 有/开 | 有/开 | 参/未 |
| 64 | 缩写 abbreviation | 可/可* | 可/可* | 开/开* | 可/开* | 可/可* | —/可* | —/可* | —/可* | 待/可* | —/可* | —/未 |
| 65 | 引文 citation | 开/可* | 可/可* | 可/可* | 可/开* | 可/可* | —/可* | —/可* | —/可* | —/可* | 外/可* | 有/内* |
| 66 | 删除修订 deletion | —/可* | —/可* | —/可* | —/开* | —/可* | —/可* | —/可* | —/可* | —/可* | —/可* | —/未 |
| 67 | 新增修订 addition | —/可* | —/可* | —/可* | —/开* | —/可* | —/可* | —/可* | —/可* | —/可* | —/可* | —/未 |
| 68 | 替换修订 substitution | —/可* | —/可* | —/可* | —/开* | —/可* | —/可* | —/可* | —/可* | —/可* | —/可* | —/未 |
| 69 | 术语表 glossary | —/可* | —/可* | —/可* | —/开* | —/可* | —/可* | —/可* | —/可* | —/可* | —/可* | —/未 |
| 70 | 元数据变量 | —/可* | —/可* | —/可* | —/开* | —/可* | —/可* | —/可* | —/可* | —/可* | —/可* | —/未 |
| 71 | 下划线 underline | HTML/开* | HTML/开* | HTML/开* | HTML/开* | HTML/开* | HTML/开* | HTML/开* | HTML/开* | HTML/开* | HTML/开* | 有/开* |
| 72 | 小型大写 small caps | 属性/未 | 属性/未 | 属性/未 | 属性/未 | 属性/未 | 属性/未 | 属性/未 | 属性/未 | HTML/未 | HTML/未 | —/未 |
| 73 | 提及用户 | —/可* | —/可* | —/可* | —/可* | —/可* | —/可* | —/可* | —/可* | —/可* | 外/可* | 有/开* |
| 74 | 提及页面/数据源 | —/可* | —/可* | —/可* | —/可* | —/可* | —/可* | —/可* | —/可* | —/可* | 参/可* | 有/开* |
| 75 | 日期/提醒 | —/可* | —/可* | —/可* | —/可* | —/可* | —/可* | —/可* | —/可* | —/可* | 外/可* | 有/开* |
| 76 | 文字颜色 | HTML/可 | HTML/可 | HTML/可 | HTML/可 | HTML/可 | HTML/可 | HTML/可 | HTML/可 | HTML/可 | HTML/可 | 有/开 |
| 77 | 背景颜色 | HTML/可 | HTML/可 | HTML/可 | HTML/可 | HTML/可 | HTML/可 | HTML/可 | HTML/可 | HTML/可 | HTML/可 | 有/开 |
| 78 | 换行 line break | 基/内* | 基/内* | 基/内* | 基/内* | 基/内* | 基/内* | 基/内* | 基/内* | 有/内* | 有/内* | 有/内* |
| 79 | 字符引用 character reference | 基/内* | 基/内* | 基/内* | 基/内* | 基/内* | 基/内* | 基/内* | 基/内* | 有/内* | 有/内* | 待/内* |
| 80 | 反斜杠转义 | 基/内* | 基/内* | 基/内* | 基/内* | 基/内* | 基/内* | 基/内* | 基/内* | 有/内* | 有/内* | 有/内* |
| 81 | 智能标点 | 开/开* | 可/可* | 可/可* | 可/可* | 可/可* | 可/可* | 可/可* | 开/开* | 设/可* | —/可* | —/未 |

## 协作与页面元数据

| # | 内容能力 | P | S | E | M | GH | C | GFM | CX | T | O | N |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 82 | 协作评论 comment | —/未 | —/未 | —/未 | —/未 | —/未 | —/未 | —/未 | —/未 | —/未 | 外/未 | 外/未 |
| 83 | 表情回应 reaction | —/未 | —/未 | —/未 | —/未 | —/未 | —/未 | —/未 | —/未 | —/未 | 外/未 | 外/未 |
| 84 | 建议编辑 suggest edits | —/未 | —/未 | —/未 | —/未 | —/未 | —/未 | —/未 | —/未 | —/未 | 外/未 | 外/未 |
| 85 | 页面图标 icon | —/应用 | —/应用 | —/应用 | —/应用 | —/应用 | —/应用 | —/应用 | —/应用 | —/应用 | 外/应用 | 外/应用 |
| 86 | 页面封面 cover | —/未 | —/未 | —/未 | —/未 | —/未 | —/未 | —/未 | —/未 | —/未 | 外/未 | 外/未 |
| 87 | 页面属性/数据库属性值 | —/应用* | —/应用* | —/应用* | —/应用* | —/应用* | —/应用* | —/应用* | —/应用* | 有/应用* | 有/应用* | 外/应用* |

## 逐项分类、API 映射与实现边界

此表保留原始英文名，避免重命名后失去对应关系。API 列说明可映射对象，不表示 Notdown 已实现 Notion REST 连接或双向转换；原始 Notion 菜单分类保存在 JSON 中，未作为稳定语法标准。

| # | 原始 name → 本次名称 | 建议语义分类 | Notdown 路线（普通 Markdown；Notion） | Notion API / 资源映射 | 修订与边界 |
| --- | --- | --- | --- | --- | --- |
| 1 | divider → 分隔线 divider | 叶块 | base；base | divider | thematic break 是正文分隔，不是页面或数据库边界。 |
| 2 | heading → 标题 heading | 叶块；Notion 可切换容器 | base；base | heading_1…heading_4 | Markdown 通常 1–6 级；当前 Notion 为 1–4，Notdown Notion 将 5/6 收到 4。折叠标题另见 34。 |
| 3 | code block → 代码块 code block | 叶块 | base；base | code | 缩进代码与围栏分开看：CommonMark 围栏内置；markdown 系列围栏受 backtick_code_blocks/fenced_code_blocks 控制。无围栏时仍可用缩进代码；Notion 用围栏。 |
| 4 | HTML block → HTML 源码块 | 叶块/原始内容 | raw_html；preserve | embed 的 HTML 文件形态 | Markdown 中的 raw HTML 不等于 Notion embed：Notion HTML block 是上传 HTML 文件后在隔离 iframe 中显示。原生十种 Markdown 预设提供清理后的源码预览，不执行任意脚本。 |
| 5 | paragraph → 段落 paragraph | Markdown 叶块；Notion 可含子块 | base；base | paragraph | CommonMark 的叶块允许行内内容但不允许子块；Notion 可附子块。Notdown 任意文本块层级由 notdown_nesting 管理。 |
| 6 | table → 表格 table | 复合结构 | pipe_tables/mmd_tables；notdown_tables | table + table_row | 这里只判断管道表格或 Notion table。简单/多行/网格表格不是同一语法；原生未完整实现。MMD 增强表格为预览与源码编辑。 |
| 7 | quote → 引用 block quote | 容器块 | base；base | quote | Notion 多行 > 可成为多个块，块内换行用 br；不能直接套用 CommonMark 引用合并规则。 |
| 8 | bullet list item → 无序列表项 | 容器块 | base；base | bulleted_list_item | 列表 list 与列表项 list item 是不同节点；原表列的是 item，建议另加 list 层级。 |
| 9 | numbered list item → 有序列表项 | 容器块 | base；base | numbered_list_item | 编号起点与列表中断规则受方言影响；不等于 fancy/example lists。 |
| 10 | task list item → 任务列表项 | 容器块 | task_lists；task_lists | to_do | 原生保留 checked 并可编辑。Typora 预设只把无序列表中的任务标记变成复选框。 |
| 11 | empty block → 显式空块 | 编辑结构 | empty；base | 空 paragraph | empty line 不应当作 empty block 的同义词。普通 Markdown 空行通常是分隔；Notion 用 empty-block 标签；原生 Typora 将特定顶层空白映射成可编辑空段落。 |
| 12 | math block → 块公式 | 叶块 | tex_math_dollars/tex_math_double_backslash；tex_math_dollars | equation | 各路线定界符不同。原生支持美元和已接入的双反斜杠形式，用 KaTeX 显示；不是完整 TeX 引擎。 |
| 13 | image block → 独立图片/figure | 图片段落；可提升为 Figure | figure；base | image | 图片语法本来属于 Markdown 行内。独占一行可显示为图片段落；Pandoc implicit_figures/MMD 才涉及题注图语义，不能把 image 与 Figure 完全等同。 |
| 14 | diagram → 图表 diagram | 围栏内容的渲染能力 | diagrams；preserve | code（如 mermaid） | 原生十种 Markdown 可选 diagrams，Typora/Obsidian 默认开；Notion 原生目前只保留代码，不产生图表预览。非任意图表语言。 |
| 15 | callout → 提示容器 callout/alert | 容器块 | alerts/notdown_callouts；notdown_callouts | callout | GitHub/Obsidian 的 > [!TYPE] 与 Notion callout 标签不是同一种写法。表中表示相应用途的路线；原生十种预设可另外启用 Notion 标签容器。 |
| 16 | table of contents → 目录 table of contents | 生成块/渲染功能 | toc_directives/notdown_toc；notdown_toc | table_of_contents | Pandoc 通过输出选项 --toc，不是 Markdown parser 语法；Obsidian Outline 是界面能力，不能当作内嵌 TOC 语法。Notdown 可生成目录。 |
| 17 | link to page → 链接到页面 | 链接/引用入口 | base；notdown_pages | page mention；独立 link-to-page 块不强行映射 | 普通 Markdown 文件链接各方言都可表达；不因此拥有 Notion 子页面对象。独立入口、行内提及、wiki 链接应分别建模。 |
| 18 | embed → 嵌入网页/文件转引 | 外部内容/容器 | html_embed/transclusion；preserve | embed | iframe 网页、Obsidian ![[文件]]、MMD {{文件}} 是三条路线。Pandoc HTML 透传不负责文件转引；Notdown 转引服务仅接受 md/markdown/txt/html/tex/bib，不能由此推导支持 Obsidian 图片、音视频、PDF 转引。 |
| 19 | page → 子页面 child page | 资源引用/页面关系 | notdown_pages；notdown_pages | child_page；页面内容另用 Page API | 原生 page 标签提供入口和本地导航，不把 Markdown 解析成真实云端页面创建；应用自身有本地页面树。 |
| 20 | database - inline → 内联数据库 | 数据库资源/视图入口 | notdown_databases；notdown_databases | child_database + database.is_inline | Notdown 只保留 database 标签及 inline 标记；没有数据库引擎。Obsidian Bases 是另一种产品能力，不宣称与 Notion 数据库等价。 |
| 21 | database - full page → 整页数据库 | 数据库资源 | notdown_databases；notdown_databases | Database 对象；child_database 是父页中的入口 | full-page 是资源展示形态，不是单独 Markdown 叶块。Notdown 保留引用，不实现表数据、查询、关系或视图。 |
| 22 | linked view of data source → 关联数据源视图 | 视图/引用 | dbview；preserve | View/Data source API，非通用 rich text | Notion database 标签只能表明引用，不能完整描述 view 的过滤排序。原生只可保留数据库引用；不能计为已实现关联视图。 |
| 23 | button → 按钮 button | 交互/自动化 | none；preserve | unsupported（可含 block_type=button） | Notdown 未实现按钮动作。插件或 HTML 能做按钮，不代表该方言原生拥有可执行按钮语义。 |
| 24 | breadcrumb → 面包屑 breadcrumb | 导航/生成块 | breadcrumb；breadcrumb | breadcrumb | Notdown 顶栏有本地面包屑，但没有正文 breadcrumb 块；API 能读块与 Markdown API 能导出是两回事。 |
| 25 | video → 视频 video | 媒体块 | notdown_media；notdown_media | video | 原生需 notdown_media 标签路线；Obsidian ![[video]] 媒体嵌入没有完整接入，不能因 transclusion 默认开就算视频默认可用。 |
| 26 | audio → 音频 audio | 媒体块 | notdown_media；notdown_media | audio | 原生提供标签媒体预览；![[audio]] 不在当前文本转引文件白名单内。不是转录服务，也不保证 URL 有效。 |
| 27 | file → 附件 file | 资源链接/媒体块 | file；notdown_media | file | 普通 Markdown 链接可指向文件，但不产生 Notion file 对象。Notdown 标签可保留附件 URL 与说明。 |
| 28 | web bookmark → 网页书签卡片 | 资源预览 | none；preserve | bookmark | 普通链接不是抓取标题/描述/封面的书签卡片；原生尚无该服务，Notion unknown 仅保留引用。 |
| 29 | PDF → PDF 嵌入 | 媒体块 | notdown_media；notdown_media | pdf | Pandoc 只能借原始 HTML 输出表达嵌入；原生有 pdf 标签；![[file.pdf]] 不在当前文本转引白名单内，未完整实现 Obsidian PDF 嵌入，更不是 PDF 内容编辑器。 |
| 30 | link preview → 链接预览 link preview | 站点服务/预览对象 | none；preserve | link_preview | 不要与普通链接、网页书签或鼠标悬停预览混为同一语义；原生没有 Notion unfurl 集成。 |
| 31 | meeting notes → 会议纪要 meeting notes | 服务生成的复合块 | none；preserve | meeting_notes（旧版 transcription） | 当前 API 2026-03-11 起改名；Markdown API 有 meeting-notes 输出并可选择转录。Notdown 仅保留未知源码，没有转录或专用视图。 |
| 32 | unsupported → 未知/不支持内容 | 兼容回退 | preserve；preserve | unsupported | unknown/unsupported 不是可创作的普通语义块。原生回退保留源码或引用；不能据此算实现了未知功能。 |
| 33 | toggle → 折叠区 toggle | 容器块 | notdown_toggles；notdown_toggles | toggle | HTML details 可借 raw_html 显示；原生结构化折叠使用 notdown_toggles。Obsidian 折叠标题/列表或可折叠 callout 是相关但不同能力。 |
| 34 | toggle heading → 折叠标题 | 标题 + 子块/交互 | toggleheading；notdown_nesting | heading_1…4 + is_toggleable | Notdown Notion 用 heading.toggle 与 nested_block，实现折叠；受 notdown_nesting 管理。普通 Markdown 的标题折叠是编辑 UI，不是同一序列化结构。 |
| 35 | tabs → 标签页容器 tabs | 容器块 | none；preserve | tab（paragraph 子块表示每一页签） | 当前 Block API 已有 tab；公开 Enhanced Markdown 指南未列专门格式，不臆造标签。Notdown 尚无 tabs 节点与视图。 |
| 36 | synced block → 同步块 synced block | 引用/容器 + 同步服务 | notdown_synced；notdown_synced | synced_block | 原生保留内容快照、来源与引用；没有跨页自动同步，更没有跨端/Notion 云同步。 |
| 37 | columns → 分栏 columns | 容器块 | notdown_columns；notdown_columns | column_list + column | 原生提供列容器与显示；用标签保留。CSS 分栏或 Pandoc Div 排版不等于 Notion 分栏结构。 |
| 38 | YAML front matter → YAML front matter | 文档元数据 | yaml_metadata_block；none | 不属于正文 Block API | MMD 原生 Title: 元信息不等于 YAML；Notdown markdown_mmd 可选 YAML 是 Pandoc/本地扩展。页面属性 YAML 与正文元数据需分开。 |
| 39 | Pandoc title block → Pandoc 标题块 | 文档元数据 | pandoc_title_block；none | 无直接对应 | 以 % 开头；原生只识别常见开头子集，保留源码；metadata_values 决定是否显示元数据预览。 |
| 40 | block comment → 块内隐藏注释 | 源码注释 | comments/raw_html；none | 非 discussion comment | HTML 注释与 Obsidian %% 多行注释不同。原生支持相应开关；不是多人批注系统。 |
| 41 | definition list → 定义列表 | 复合块 | definition_lists；none | 无原生定义列表类型 | 应包含 term 与 definition，definition 可含多个块，不宜统称单个叶块。 |
| 42 | raw source → 指定格式原始源码 | 原始内容块/行内 | raw_attribute；none | 无通用对应 | 例如带 {=html} 的代码；不同于一般 HTML 块或任意文件转引。原生支持指定输出格式的预览/源码保留子集。 |
| 43 | footnote → 脚注定义 | 定义/复合块 | footnotes；none | 无标准脚注定义对象 | [^id]: 定义可含多个段落；与 63 的行内引用是一套语法的两端。Notion [^URL] 是引文，不是这个定义。 |
| 44 | line block → 行块 line block | 叶块（含多条行内序列） | line_blocks；none | 无直接对应 | 用于诗歌等保留行序列。Notdown 本地 CommonMark 系列也可选，Pandoc 同名 reader 不接受该开关。 |
| 45 | native div → HTML 原生 Div 语义 | 容器块 | none；none | 无直接对应 | Pandoc 将 HTML div 变成 AST Div；Notdown 可预览 raw HTML，但未注册 native_divs，不算结构化 Div。fenced_divs 是另一写法，另见补充表。 |
| 46 | raw TeX → 原始 TeX | 原始块或行内内容 | none；none | 无直接对应 | 与公式不同；Notdown 无 raw_tex 专用语义。原文或普通文字保留不等于执行 TeX 或目标格式透传。 |
| 47 | example list → 示例编号列表 | 容器块 + 编号语义 | none；none | 无直接对应 | Pandoc (@) 编号与引用机制；原生尚未实现，不能用普通 ordered_list 代替完整功能。 |
| 48 | code span → 行内代码 code span | 行内标记 | base；base | rich_text.annotations.code | API 字段叫 annotations（复数），不是独立 block 或独立 annotation 对象类型。 |
| 49 | emphasis → 强调 emphasis | 行内标记 | base；base | rich_text.annotations.italic | 字体效果对应样式；各方言的分隔符与嵌套边界仍可能不同。 |
| 50 | strong emphasis → 加粗 strong emphasis | 行内标记 | base；base | rich_text.annotations.bold | 属于行内样式，不是新的块类型。 |
| 51 | strikethrough → 删除线 strikethrough | 行内标记 | strikeout；strikeout | rich_text.annotations.strikethrough | 与 CriticMarkup 删除修订分开；删除线不包含接受/拒绝修订语义。 |
| 52 | link → 链接 link | 行内节点/标记 | base；base | rich_text.text.link | 普通链接不需要扩展开关；实际跳转需安全 URL 和可访问目标。 |
| 53 | image → 行内图片 | 行内节点 | base；base | image 是块；rich_text 没有普通 image 类型 | Notdown PM schema 的 image 是 inline；Notion codec 也能保留图片节点，但不保证任意行内图片布局可映射到 Notion API。 |
| 54 | autolink → 自动链接 autolink | 行内规则 | base；base | 普通 rich_text 链接 | 尖括号 URL/邮箱是基础语法；裸 URL 是另一扩展 autolink_bare_uris，不能合并计数。原生 Notion 实测尖括号 URL 会生成 link 标记；这不推导为支持裸 URL。 |
| 55 | inline HTML → 行内 HTML | 原始行内内容 | raw_html；none | 没有通用 HTML rich_text 类型 | Notion 的 span/mention 标签是约定语法，不代表任意 HTML。Notdown 普通 Markdown 路线提供清理后的预览。 |
| 56 | internal link → 文内/跨文档引用 | 链接 + 标识符规则 | base；base | 普通 link 或 page mention | `[title](#id)` 基础链接与自动生成标题 ID、[标题] 隐式引用、[[双链]] 应分别统计；本行只保证链接表示，生成目标锚点另受扩展控制。 |
| 57 | emoji → Emoji 名称 | 行内替换/资源解析 | emoji；preserve | Unicode 文本；自定义 Emoji 需资源 | Unicode Emoji 本身无需扩展。Notion 自定义 :name: 依赖资源目录；原生 Notion 目前保留源码，不提供同名 emoji 开关。 |
| 58 | inline math → 行内公式 | 行内原子节点 | tex_math_dollars/tex_math_double_backslash；tex_math_dollars | rich_text.type=equation | Pandoc 各定界符分别开关；Notdown 美元/双反斜杠是已实现子集。 |
| 59 | subscript → 下标 subscript | 行内标记 | subscript/short_subsuperscripts；none | 无独立下标 annotation | H~2~O、简写下标与 HTML sub 不应视为同一扩展开关。Notdown Obsidian 可选本地语法超出其官方基础语法。 |
| 60 | superscript → 上标 superscript | 行内标记 | superscript/short_subsuperscripts；none | 无独立上标 annotation | x^2^、MMD 简写上标与 HTML sup 分别处理；原生各自依赖对应扩展。 |
| 61 | highlight → 高亮 highlight | 行内标记 | highlight/critic_markup；notdown_colors | 背景色 annotation 是相关表达 | ==text==、{==text==}、背景色不是同一写法。Pandoc 用 mark；原生未注册 mark，但另有 highlight/CriticMarkup，不能认作完整同名实现。 |
| 62 | inline comment → 行内源码注释 | 行内保留/修订注释 | comments/critic_markup/raw_html；none | 非 Comment API | %%...%%、HTML 注释、{>>...<<} 应拆成不同语法；本行汇总路线，非全部方言接受全部定界符。 |
| 63 | footnote → 脚注引用 | 行内引用节点 | footnotes；none | Notion [^URL] 是 citation，非普通脚注 | 不能因为 Notion 显示一个上标引用就标成完整 footnotes；原生 N 的普通脚注未适配。 |
| 64 | abbreviation → 缩写 abbreviation | 定义 + 行内标记 | abbreviations/mmd_abbreviations；none | 无直接对应 | PHP *[HTML]: 与 MMD [>HTML] 不同。Pandoc abbreviations 只略过定义，没有完整缩写节点；Notdown 可显示其支持的缩写释义。 |
| 65 | citation → 引文 citation | 行内引用 + 书目处理 | mmd_citations；base | Notion 引文序列化不等于 CSL 引文对象 | Pandoc [@key]、MMD [#key]、Notion [^URL] 不同；原生只接 MMD 子集及 Notion URL 引文，没有完整 Pandoc citations/citeproc。 |
| 66 | deletion → 删除修订 deletion | CriticMarkup 行内修订 | critic_markup；none | 不是 strikethrough annotation 的完整等价物 | {--text--}；原生有标记与显示，没有多人审阅或完整接受/拒绝工作流。 |
| 67 | addition → 新增修订 addition | CriticMarkup 行内修订 | critic_markup；none | 无独立修订类型 | {++text++}；不能混同普通插入文字操作。 |
| 68 | substitution → 替换修订 substitution | CriticMarkup 行内修订 | critic_markup；none | 无独立修订类型 | {~~old~>new~~}；原生支持当前行内解析子集。 |
| 69 | glossary → 术语表 glossary | 定义 + 行内引用 + 输出 | glossary；none | 无直接对应 | MMD 术语引用是其扩展体系的一部分；原生实现术语定义/提示子集，不宣称完整排序和出版输出。 |
| 70 | metadata variable → 元数据变量 | 行内替换/模板 | metadata_variables&metadata_values&mmd_title_block/metadata_variables&metadata_values&yaml_metadata_block/metadata_variables&metadata_values&pandoc_title_block；none | 无直接对应 | [%name] 需要元数据来源；原生依赖 metadata_variables、metadata_values 及相应标题块。表中按 MMD/YAML/Pandoc 标题块任一完整路线计算，不能只打开变量替换却没有元数据来源。 |
| 71 | underline → 下划线 underline | 行内样式/HTML 语义 | notdown_colors/raw_html；notdown_colors | rich_text.annotations.underline | Pandoc 没有 underline 同名扩展开关。原生结构化下划线用 Notion span + notdown_colors；HTML u/ins 属于 raw_html 预览路线。 |
| 72 | small caps → 小型大写 small caps | 行内样式/语义 | none；none | 无 small_caps annotation | Pandoc 可由带 smallcaps 类的 span 表达，依赖相应属性/原生 span 处理；原生无专用 small_caps mark，CSS 外观不算完整语义。 |
| 73 | mention person → 提及用户 | 行内引用 + 用户服务 | notdown_mentions；notdown_mentions | rich_text.mention.user | 原生保留用户 URL 和标签；不连接成员目录、不发送通知。 |
| 74 | mention page or data source → 提及页面/数据源 | 行内引用 | notdown_mentions/notdown_pages；notdown_mentions/notdown_pages | mention.page/database；data_source 需按 API 版本核对 | Notion Markdown 数据源标签与 REST rich_text 枚举不能凭名字推断一一对应。原生保留不同 mention kind，仅本地页面目标有导航。 |
| 75 | date ot reminder → 日期/提醒 | 行内日期引用 + 服务 | notdown_mentions；notdown_mentions | rich_text.mention.date；提醒非简单同义项 | 修正 date ot reminder 为 date or reminder。原生保留日期属性，没有提醒调度或通知。 |
| 76 | text color → 文字颜色 | 行内/块属性 | notdown_colors；notdown_colors | annotations.color / block.color | 原生有约定色名；Pandoc HTML/CSS 依赖输出格式，不能视为统一的 text_color 扩展开关。 |
| 77 | background color → 背景颜色 | 行内/块属性 | notdown_colors；notdown_colors | annotations.color 的 *_background | Enhanced Markdown 用 *_bg，REST API 用 *_background；Notdown 保存自己的约定标签，不代表完成 API 值转换。 |
| 78 | line break → 换行 line break | 行内规则/块边界 | base；base | rich_text.text.content 内的换行 | 应拆 hard break、soft break、块边界；Notion 文本单换行可分块，br 才是块内换行。hard_line_breaks/ignore_line_breaks 决定部分 Markdown 行为。 |
| 79 | character reference → 字符引用 character reference | 词法/行内解码 | base；base | 文本编码，不是独立 Block | 如 &amp;、&#65;；不是链接引用或脚注引用。Notion 官方只明确部分标签转义，原生解码能力不等于官方格式承诺。 |
| 80 | backslash escape → 反斜杠转义 | 词法规则 | base；base | 序列化规则，非对象类型 | 各方言的可转义字符集合不同；代码内不按普通正文转义。all_symbols_escapable 等扩展调整边界。 |
| 81 | smart typography → 智能标点 | 文本转换 | smart；none | 没有独立 annotation | Typora 受偏好设置影响；原生 Typora 默认关闭 smart，Pandoc 预设按快照。不能用字体样式代替实际字符转换。 |
| 82 | comment → 协作评论 comment | 应用/讨论对象 | none；none | Comment API，非正文 Block | 与 40/62 源码注释完全不同；Notdown 未实现协作评论线程。 |
| 83 | reaction → 表情回应 reaction | 应用/讨论对象 | none；none | 未确认公开统一 Reaction 写入 API | 不要由 UI 有 reaction 推断 REST API 必有对应可写对象；Notdown 未实现。 |
| 84 | suggest edits → 建议编辑 suggest edits | 协作审阅流程 | none；none | 未确认通用审阅对象映射 | CriticMarkup 只能表达修改标记，不能自动获得权限、审阅和接受/拒绝流程；Notdown 未实现协作建议。 |
| 85 | icon → 页面图标 icon | 页面元数据 | icon；icon | Page.icon | Notdown 应用层已支持本地页图标，与正文方言无关；不把源码中 Emoji 算成页图标。 |
| 86 | cover → 页面封面 cover | 页面元数据 | cover；cover | Page.cover | Notdown 未见专用封面字段或显示 UI；可保留未知 YAML 数据不等于实现封面。 |
| 87 | page property (database) → 页面属性/数据库属性值 | 页面元数据/数据模型 | properties；properties | Page.properties；schema 属 Data source | Notdown 页面 YAML properties 可保留和编辑，但无完整 Notion 类型系统、公式、关系和数据库视图。与正文元数据块分开。 |

路线中的 / 表示不同写法的替代路线，& 表示需要同时开启；base=内置，none=未接入目标语义，preserve=回退，figure/empty 等是本文分类规则，**不是新增扩展 ID**。实际注册名称见 [config.ts](../../src/markdown-engine/config.ts)。

## MultiMarkdown 6 与 Pandoc markdown_mmd 的区别

用户原表中的“MultiMarkdown”应单独注明实现。以下是 [MMD 6 官方指南](https://fletcher.github.io/MultiMarkdown-6/)涵盖、但不能从 Pandoc markdown_mmd 名称推导的能力：

| 用户行号 | MMD 6 能力 | Notdown 路线 | 边界 |
| --- | --- | --- | --- |
| 18 | 文件转引 | transclusion | 本地预览与依赖解析子集 |
| 61、62、66–68 | CriticMarkup 高亮、注释、增删改 | critic_markup | 无完整审阅流程 |
| 64 | MMD 缩写定义/引用 | mmd_abbreviations | 与 PHP/Pandoc abbreviations 分开 |
| 65 | MMD 引文 | mmd_citations | 与 Pandoc citations/citeproc 分开 |
| 69 | Glossary | glossary | 术语显示子集 |
| 70 | 元数据变量 | metadata_variables + metadata_values + mmd_title_block | 需要有效元数据来源 |
| 16 | TOC 指令 | toc_directives | 与 Pandoc --toc 输出选项分开 |
| 6、13 | 增强表格与独立图片 | mmd_tables / implicit_figures | 预览、题注和源码编辑子集 |

## 建议补充的独立项目

87 项原表没有删行。为避免同一行藏多种语法，后续维护功能目录时建议增加下列子项；当前开关状态均已在 [扩展矩阵](PANDOC-EXTENSIONS-MATRIX.zh-CN.md) 中逐项列出：

| 原行 | 建议拆分/补项 | 关键区别 |
| --- | --- | --- |
| 3 | 缩进代码、反引号围栏、波浪线围栏 | 基础语法 vs 可配置方言扩展 |
| 6 | pipe/simple/multiline/grid/MMD tables、表题注 | 不同表格语法和可编辑范围 |
| 8、9 | list 容器与 list_item、definition term/definition | 结构层级不同 |
| 13、53 | 行内图片、独立图片段落、带题注 Figure | 不要按视觉大小推 AST 类型 |
| 15、18 | alerts/callout；iframe/文件转引 | 同用途，不同语法及执行层 |
| 38、39 | mmd_title_block | 键值元信息，不是 YAML front matter |
| 45 | fenced_divs、bracketed_spans、inline_code_attributes | 原生 fenced_divs 已接入，另外两项尚无同名注册 |
| 54、56 | 裸 URL、引用式链接定义、自动锚点、隐式标题引用、wiki 双链 | 原生基础链接可用不代表所有引用机制已实现 |
| 59–65 | HTML 上下标、Pandoc/MMD/Notion 引文、HTML/%%/Critic 注释 | 按实际定界符建子行 |
| 78 | 硬换行、软换行、块边界、换行忽略/强制换行 | 不同的文本语义 |
| 82–87 | 页面/块属性、协作对象、资源服务 | 独立于 parser 开关表 |

## 依据与验证范围

- 八种 Pandoc 方言：本机 3.11 CLI 已重新与 [默认值快照](../data/pandoc-3.11-extensions.json)逐项核对；功能解释参照 [Pandoc 手册](https://pandoc.org/MANUAL.html)。
- 基础结构：[CommonMark 0.31.2](https://spec.commonmark.org/0.31.2/)；原生实现不宣称完整规范通过。
- 产品参考：[Typora](https://support.typora.io/Markdown-Reference/)、[Obsidian 基础语法](https://obsidian.md/help/syntax)、[高级语法](https://obsidian.md/help/advanced-syntax)、[Callouts](https://obsidian.md/help/callouts)、[文件嵌入](https://obsidian.md/help/embeds)、[内部链接](https://obsidian.md/help/links)、[PHP Extra](https://michelf.ca/projects/php-markdown/extra/)。第三方插件能力记外，没用本地 Notdown 默认值反推产品默认。
- Notion：[Enhanced Markdown](https://developers.notion.com/guides/data-apis/enhanced-markdown)、[Markdown API 支持/占位范围](https://developers.notion.com/guides/data-apis/working-with-markdown-content#block-type-support)、[Block API](https://developers.notion.com/reference/block)、[Rich text](https://developers.notion.com/reference/rich-text)、[Page](https://developers.notion.com/reference/page)、[Database](https://developers.notion.com/reference/database)、[Views](https://developers.notion.com/guides/data-apis/working-with-views)。公开资料未定义的映射保留待核，不以名称猜测。
- Notdown：[config.ts](../../src/markdown-engine/config.ts)、[codec.ts](../../src/markdown-engine/codec.ts)、[products.ts](../../src/markdown-engine/products.ts)、[转引文件限制](../../server/syntax-files.ts)、[notion-markdown.ts](../../src/document/notion-markdown.ts)、[editor-schema.ts](../../src/document/editor-schema.ts)、[FORMAT.md](../FORMAT.zh-CN.md)、[PRODUCT-SYNTAX.md](PRODUCT-SYNTAX.zh-CN.md)。
- 验证：重新运行 5 组现有测试，共 101 项通过；生成器执行 12 个针对分类歧义的真实解析探针并核对原文往返，结果收入 JSON。覆盖折叠标题、空块、图片、引文/脚注区别、未知 tabs、图表代码、raw TeX 与 HTML Div 等；不代表 957 个单元格均做过完整交互验收。
- 本次仅文档核对，未更改功能、默认开关、页面内容或 MyBase。没有把“可保存原文”计成目标语义已实现。

重新生成：在仓库根目录运行 `node --import tsx docs/fixtures/content-capabilities.ts`。原始输入已收入 JSON，复现不依赖个人附件路径。
