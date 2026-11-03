# 原生 Markdown 编辑核心

[English](MARKDOWN-ENGINE.md) · **简体中文**

2026-09-15，第一阶段已接入主应用。

## 选择：原生实时编辑，借鉴 Pandoc 的分层

保留 CodeMirror 的源码编辑能力和现有 ProseMirror 的块交互，实现方言/扩展注册表、统一文档会话及可保留原文的 codec。Pandoc 保留为独立 Lab 的兼容性对照工具，后续可以承担导入导出与差异测试。

[Pandoc 的 reader → AST → writer](https://pandoc.org/MANUAL.html#description) 分层值得采用；它的语义 AST 本身不承担光标、输入法、拖动历史或原文排版保留。这里使用自有 ProseMirror schema 表示编辑文档，不把它冒充 Pandoc JSON AST。文件真相继续是 Markdown，AST 只在内存中。

```text
Markdown 文件 + YAML syntax
          ↕ createVault / baseRevision / 冲突分支
DocumentSession：源码草稿 + 配置 + 语义文档 + 共同撤销
          ↙                               ↘
CodeMirror                             ProseMirror
源码 / 行号 / 通用高亮                 页面 / 块 / 拖动 / Slash
          ↘ 原生 reader         writer ↙
       保留 source slice、位置、指纹的文档节点
```

## 当前可用范围

| 原生预设 | 默认能力 | 边界 |
| --- | --- | --- |
| `notion-markdown` | 现有 Notion codec、任务、删除线、公式及 Notdown 块扩展 | Notion 自有换行/标签规则；数据库与同步块仅保留内容和引用 |
| `commonmark` | markdown-it CommonMark 基础规则，含清理后的 HTML 预览 | 不宣称通过完整 CommonMark conformance suite；任意 HTML 元素需在源码中编辑 |
| `gfm` | 基础规则加表格、删除线、任务、裸链接和脚注 | 核心语法实现，不宣称与 GitHub/Pandoc 逐项完全一致；脚注默认值参照 Pandoc 3.11 |

`markdown`、`commonmark_x`、`markdown_strict`、`markdown_phpextra`、`markdown_mmd`、`markdown_github` 也已接入原生 reader/writer，选择器全部可用。各预设差异、新增规则及部分兼容边界见 [NATIVE-DIALECTS.md](../reference/NATIVE-DIALECTS.zh-CN.md)。完整 Pandoc reader 与扩展依然可以在 Lab 使用；不能将 Lab 的扩展列表视为原生编辑器已实现清单。

新增 Typora、Obsidian 预设。产品预设与 PHP/MMD 新增的 27 个开关及编辑模式见 [PRODUCT-SYNTAX.md](../reference/PRODUCT-SYNTAX.zh-CN.md)。下列是原有规则分组。

注册表目前有 **70 个内置扩展**：

- Markdown 规则：`raw_html`、`definition_lists`、`footnotes`、`line_blocks`、`fenced_divs`、`pipe_tables`、`strikeout`、`task_lists`、`autolink_bare_uris`、`hard_line_breaks`、`tex_math_dollars`、`wikilinks_title_after_pipe`。
- 块能力：`notdown_columns`、`notdown_callouts`、`notdown_toggles`、`notdown_tables`、`notdown_pages`、`notdown_mentions`、`notdown_media`、`notdown_databases`、`notdown_synced`、`notdown_toc`、`notdown_nesting`、`notdown_colors`。
- 方言基础规则（新增 19 项）：`blank_before_header`、`blank_before_blockquote`、`space_in_atx_header`、`lists_without_preceding_blankline`、`startnum`、`backtick_code_blocks`、`fenced_code_blocks`、`escaped_line_breaks`、`all_symbols_escapable`、`intraword_underscores`、`ignore_line_breaks`、`smart`、`subscript`、`superscript`、`abbreviations`、`emoji`、`yaml_metadata_block`、`pandoc_title_block`、`mmd_title_block`。

Notion 的换行规则固定，暂不提供 `hard_line_breaks`、裸链接、管道表格和 wiki 语法开关；HTML、定义列表、脚注、行块和 fenced Div 五项及本次新增 19 项也尚未适配到 Notion codec。相应配置值保留但不执行。其他十种预设按 reader 能力矩阵提供开关，也可以启用 Notdown 标签容器。标签容器内部沿用 Notion codec 的语法，外部段落沿用所选 Markdown reader。`notdown_colors` 是 `notion_colors` 的旧别名。颜色现由 `notion_colors` 管理，下划线独立使用 `notion_underline`；关闭颜色不再关闭下划线。未知块的原文回退属于核心保留能力。

注册表中的开关都有实际 parser/writer 支撑，但未完整复刻 Pandoc。MMD 引文、属性、自动标识和产品专用块已接入，详见 [产品能力与 62 条矩阵](../reference/PRODUCT-SYNTAX.zh-CN.md)；citeproc、grid tables 与完整属性组合仍未实现，面板单列这些名称与配置状态。未知和待实现配置保留但不执行。新增块的语法、Pandoc 能力矩阵与限制见 [BLOCKS.md](../reference/BLOCKS.zh-CN.md)；例如本地 `commonmark+line_blocks` 可用，但 Pandoc 的该 reader 不接受这个开关。增加扩展必须同时明确解析规则、停用行为、序列化、输入命令、嵌套冲突与往返测试，不能只添加复选框。独立第三方包的安装和生命周期接口尚未实现。

## 文档会话与原文保留

- 三种视图仅改变布局，保留两边的编辑器实例。两个方向共用 `DocumentSession` 的历史；源码和结构化编辑不会各自拥有互不相干的撤销栈。
- 源码输入立即更新草稿，70 ms 防抖更新页面。等待投影时暂时禁止页面编辑，避免旧树覆盖新源码；输入组合结束后再投影，切换视图/保存前收取 pending 输入。
- 页面输入走 ProseMirror 事务；写回时复用未改节点的原文，仅重写修改过的顶层块。不可变节点指纹用 WeakMap 缓存。最小文本差异更新 CodeMirror，文档差异更新 ProseMirror。
- 十种 Markdown 预设保留原始间隔、引用定义、CRLF 和未知语法。复合块内部修改仍可能规范化整个复合块；尚未实现完整 CST（包含每个分隔符与空白的语法树）。
- 配置改动保留正文原字节并进入共同历史；重置预设只清除已知开关覆盖，未知字段保留。关闭扩展后按剩余语法重新解释，无法解释的标签容器显示为原文块；定义列表等语法可能成为普通段落，但配置切换本身不改写源码。
- 同步滚动按顶层块的源码位置与页面 DOM 高度分段插值，并在编辑、配置、尺寸和图片加载变化后重建位置表；目前不是每个嵌套子块的精确映射。
- 历史上限 80 个快照，并按源码 UTF-16 大小估算限制为 8 MiB；AST、字符串共享和浏览器内存开销不包含在这个估值中。光标通过编辑器的变更映射保留，未实现完整跨视图选区历史。

## 文件与代码

| 文件 | 职责 |
| --- | --- |
| `src/markdown-engine/config.ts` | 版本化预设、扩展默认值、可用命令 |
| `src/markdown-engine/codec.ts` | 原生 reader/writer，复用 Notion codec、Markdown tokens 和原文信息 |
| `src/markdown-engine/dialects.ts` | 两族 reader 的基础规则差异、行内插件、元数据识别和代码块写法 |
| `src/markdown-engine/session.ts` | 共同草稿、配置与撤销历史 |
| `src/markdown-engine/workspace.ts` | CodeMirror/ProseMirror 连接、三视图、滚动与输入收取 |
| `server/vault.ts` | 配置和正文的原子版本检查、冲突保留 |

页面 YAML 契约见 [FORMAT.md](../FORMAT.zh-CN.md)。没有 `syntax` 的旧 Markdown 页面推导兼容开关；不会批量迁移用户文件。仍使用现有 `createVault`，没有增加第二份块 JSON 存储。

## 性能与下一阶段

本机 Node 初步测量，3 次预热、12 次采样取中位数；内容重复包含标题、段落、链接和列表。10,058 字符的解析约 11–13 ms，单块修改和序列化约 0.6–0.9 ms；120,038 字符解析约 142–160 ms，修改和序列化约 7–10 ms。原始记录 `.run/native-benchmark.json`。这不是浏览器端到端输入延迟测量，不包含布局、绘制、磁盘保存和全部扩展组合。

当前源码解析仍为主线程上的全量解析；70 ms 防抖不等于增量解析。下一阶段顺序：

1. 将源码解析移入 Worker，使用文档版本丢弃过时结果，保留同步保存草稿的能力；测量真实浏览器输入到绘制延迟。
2. 增加带原文位置的块级语法索引和安全重解析边界。引用定义、脚注、列表缩进和未闭合围栏可能影响远处内容，不能简单按空行切割再缓存。
3. 以 Pandoc 实际输出构造差异样例，逐项实现 reader/extension；保留默认值矩阵与能力矩阵，明确“默认开启”和“实际支持”的区别。
4. 增加语义文档 ↔ Pandoc JSON 的适配层。标准段落、列表、表格可映射；Notion 子页面、同步引用、数据库和未知块需要带类型、属性与原始载荷的扩展表示。无法无损映射的内容必须显式保留，不能静默丢弃。
5. 补齐扩展感知的源码高亮、子块滚动位置、完整选区历史与更细的复合块原文保留。

保留两边原有编辑器减少了光标、拖动、输入法和 CAS 的重写风险；方言兼容性是持续实现与测试的工程工作，不能仅靠复用 Pandoc 的术语获得。
