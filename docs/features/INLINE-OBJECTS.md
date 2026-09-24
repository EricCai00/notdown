# 行内对象、题注与表格编辑

2026-09-24。本说明覆盖早期能力矩阵中关于这些对象尚无入口、没有 citeproc 或不能编辑题注的记录。

## 方言、扩展与类型

| 功能 | 方言与开关 | 归属与编码 |
| --- | --- | --- |
| URL 引文 | 官方 Notion 的 `notion_mentions`；Notdown 默认开 | 行内 `citation`，`[^URL]`，不是脚注 |
| MMD 引文 | MultiMarkdown 的 `mmd_citations`；Notdown 默认开 | 行内 `syntax_inline.citation`；`[#key]`、`[locator][#key]` 与行内书目；定义为内部结构，不增加产品 block |
| Pandoc 引文 | Pandoc Markdown 默认 `citations`，Legacy GitHub 的 Pandoc reader 可选；Notdown 默认开 | 行内 `[@key, locator]`；CSL 预览需要本地书目/样式文件及 Pandoc |
| MMD 缩写 | MultiMarkdown 的 `mmd_abbreviations`；Notdown 默认开 | `[>term]` 与 `[>term]: definition`，行内对象 |
| PHP 缩写 | PHP Extra 默认 `abbreviations`，Pandoc Markdown/Legacy GitHub reader 可选；Notdown 默认开 | 普通词与 `*[term]: definition`，行内 mark；定义保留在源码间隙/尾部 |
| 术语 | MultiMarkdown 的 `glossary`；Notdown 默认开 | `[?term]` 与定义，行内对象 |
| 元数据变量 | MultiMarkdown 的 `metadata_variables`；Notdown 默认开 | `[%name]`，读取正文 metadata；不改写页面 YAML |
| 增删替换修订 | MultiMarkdown 集成的 `critic_markup`；Notdown 默认开 | `{++new++}`、`{--old--}`、`{~~old~>new~~}`，行内 mark |
| 图片题注 | MMD/Pandoc 的 `implicit_figures`；Notdown 默认开；官方 Notion 媒体图片使用原生 Caption | 沿用 `![Caption](URL)`；保留 URL、title、未知属性，不恢复已移除的 local_figure 协议 |
| 表格交互 | 对应方言已有表格开关 | 一种 Table 对象；合并需要能保留几何信息的 grid/MMD 编码；官方 Notion 不新增跨度属性 |

MMD 专属开关在 CommonMark、GFM、CommonMark X、Original Markdown、Typora、Obsidian、PHP Extra、Pandoc Markdown 与官方 Notion 中不可强制开启。Pandoc `citations` 和 PHP `abbreviations` 只开放给上表对应 reader。Notdown 汇集这些已有扩展；显式关闭值仍优先，未知配置及原文保留，不迁移文件。

规范依据：[MultiMarkdown 6](https://fletcher.github.io/MultiMarkdown-6/syntax/index.html)、[PHP Markdown Extra](https://michelf.ca/projects/php-markdown/extra/#abbr)、[Pandoc citations](https://pandoc.org/MANUAL.html#citations)、[Notion Enhanced Markdown](https://developers.notion.com/guides/data-apis/enhanced-markdown)。CriticMarkup 是独立标注语法，本项目沿用 MMD 已集成的扩展，不宣称其他方言原生支持它。

## 操作

- `/` 提供 Citation、Abbreviation、Glossary、Metadata variable、Addition、Deletion、Substitution；菜单受方言和开关共同控制，Notdown 的 Citation 可选择三种编码。
- 新引用与定义在一次事务内插入并可一起撤销；也可选择已有定义。插入不能覆盖重复键。PHP 缩写保留词边界。
- 已有行内引用双击编辑源码；PHP 缩写双击编辑释义。MMD 书目的 Edit definition 编辑原定义，禁止无意改变键或扩展为多个块。未使用的定义仍保留并可编辑。
- 修订双击可接受或拒绝；替换保留原文。这是本地单项修订，不是多人审阅服务。
- Figure 的 Edit caption 修改题注；官方 Notion 独立图片双击属性编辑 Caption。复杂原始图片语法仍可用源码编辑。
- 表格支持 Shift-click 矩形选区、Select row / column / table、TSV 复制粘贴、清空选区、前后插入行列、删除选中行列、移动行列、合并选区及拆分。矩阵粘贴须尺寸匹配，单值可填充选区。跨合并单元格的移动和不能保留编码的合并不执行；Markdown 必需表头不移入正文。

## MMD citation 与 footnote

脚注显示上标，文末有独立脚注区。引文显示 `(1)`、`(locator, 2)`，书目区与编号独立于脚注。已解析的重复引用复用条目，每个条目提供正文各处的返回链接；行内书目也进入引用序列。`[Not cited][#key]` 保留书目条目，隐藏正文标记。

`Doe:2006` 和 `Doe2006` 是不同的键。未匹配引用保留源码并标记 unresolved，不猜测定义。未引用/重复定义不自动删除。编号、DOM 锚点与返回链接仅用于展示，不写入 Markdown。

Notdown 中 `[^https://example.com]` 默认是 Notion URL 引文；若正文已有同名脚注定义，则保留为脚注。关闭 URL 引文扩展时，无定义的 URL 标记保留为文字；代码中的标记始终保持原文。

## 验证与范围

单元测试：`tests/unit/inline-objects.test.ts`、`tests/unit/table-commands.test.ts`；浏览器测试：`tests/e2e/inline-objects.spec.ts`，使用临时知识库和独立 Chrome。

2026-09-24 本轮验证：相关单元测试 17 项通过；新增浏览器交互 7 项通过；构建通过。扩大浏览器回归最初 26/29 通过，两项测试选择器修正后已在上述 7 项中通过，余下一项 MMD metadata 建页返回 422。全量单测为 634 通过、6 失败、1 跳过，失败涉及 YAML/未知字段保留、导入恢复及链接处理；不宣称全仓库回归通过。本地日志见 `.run/logs/local-objects-targeted-current.log`、`local-objects-interactions.log`、`local-objects-build-final.log`、`local-objects-e2e-final.log` 与 `local-objects-unit-latest.log`。

跨端同步、云端数据库/自动化、关闭应用后的提醒另做。本轮不宣称完整上游语法兼容或内置文献库管理。正文仍通过原保存链路以 `baseRevision` 写入 Markdown，冲突不自动强制重试。
