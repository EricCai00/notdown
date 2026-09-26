# 行内对象、题注与表格编辑

2026-09-24。本说明覆盖早期能力矩阵中关于这些对象尚无入口、没有 citeproc 或不能编辑题注的记录。

## 可视编辑器快捷输入（2026-09-26）

完整输入闭合符时转换；上下标、修订与行内脚注等转换支持立即 Backspace 还原。代码、转义符和当前方言未启用的扩展保持字面输入。上下标沿用标准对应，不互换符号。

| 类型 | 输入 |
| --- | --- |
| Autolink | `<https://example.com>`、`<name@example.com>` |
| Inline HTML | 完整配对标签，如 `<kbd>Enter</kbd>`；也支持 `<br>`、`<wbr>`、`<img …>`，沿用现有安全预览与源码编辑 |
| Internal link | `[[页面名]]`，也可用已有 `@` / `+` 搜索菜单 |
| Emoji | `:smile:` 等已支持短码；`:sm` 仍可打开选择菜单 |
| Inline math | `$公式$` |
| Subscript | `~文字~`（无空白） |
| Superscript | `^文字^`（无空白） |
| Highlight | `==文字==`、`{==文字==}` |
| Inline comment | `%%` 打开注释输入窗；`{>>注释<<}` 完整闭合后转为隐藏 CriticMarkup 注释 |
| Inline footnote | `^[脚注正文]`，正文可带行内格式，显示编号及底部脚注，保存仍为原位置行内语法 |
| Abbreviation | `[>HTML]` 复用当前页定义；`[>(HTML) Hypertext Markup Language]` 定义行内缩写 |
| Citation | `[@key]`、`[#key]`、`[locator][#key]`、`[^https://example.com]`，按当前方言解析；不会自动编造书目 |
| Deletion | `{--旧文--}` |
| Addition | `{++新文++}` |
| Substitution | `{~~旧文~>新文~~}` |

CriticMarkup 等到最后的 `}` 才转换，保留修订类型与原文，不提前套用高亮／删除线。缩写和引文解析会读取当前页已有定义。HTML 等原文对象若跨越不同的已有行内格式，暂保留输入文本以避免丢失格式；复杂或不完整语法可继续通过 Source 编辑。公式的反斜杠分隔符默认关闭规则不变。

`==文字==` 与 `{==文字==}` 共用高亮样式；双击均沿用普通文字选择，清除格式均移除高亮。内部仍保留普通高亮与 CriticMarkup 的来源区别，以便保存原有语法及遵守各自扩展开关。整页撤销／重做尚不恢复历史光标位置。

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
- 已有行内引用双击编辑源码；PHP 缩写双击编辑释义。MMD 书目的 Edit definition 编辑原定义，禁止无意改变键或扩展为多个块。原本未使用的定义仍保留并可编辑；页面编辑删除某个 citation 的最后一个引用时，同步删除对应的 ref 定义，撤销/重做同时恢复/删除引用与定义。
- 修订双击可接受或拒绝；替换修订并排显示带删除线的红色原文和绿色新增文字，不再使用黄色高亮。原文仅作展示，替换文字可直接编辑；双击替换文字可修改原文。保存仍保留 `{~~old~>new~~}` 两份内容。这是本地单项修订，不是多人审阅服务。
- Figure 的 Edit caption 修改题注；官方 Notion 独立图片双击属性编辑 Caption。复杂原始图片语法仍可用源码编辑。
- 表格支持 Shift-click 矩形选区、Select row / column / table、TSV 复制粘贴、清空选区、前后插入行列、删除选中行列、移动行列、合并选区及拆分。矩阵粘贴须尺寸匹配，单值可填充选区。跨合并单元格的移动和不能保留编码的合并不执行；Markdown 必需表头不移入正文。

## MMD citation 与 footnote

脚注显示上标，文末有独立脚注区。引文显示 `(1)`、`(locator, 2)`，书目区与编号独立于脚注。已解析的重复引用复用条目，每个条目提供正文各处的返回链接；行内书目也进入引用序列。`[Not cited][#key]` 保留书目条目，隐藏正文标记。

MMD 书目中没有可见正文引用的条目（含 Not cited）不显示返回箭头；同一条目仅为可见引用提供返回链接。行内文献描述支持 Edit definition，输入文献正文后保存回原行内引用，保留 locator、分隔符、格式和周围原文，可撤销；不新建独立定义。输入须仍为含空格的单行文献描述，拒绝方括号、反斜杠、末尾分号及定义键碰撞。编辑按钮在条目悬停或按钮键盘聚焦时显示；关闭面板和鼠标移开后不因鼠标焦点残留而常显。外部书目文件仍只读。

MMD 与 Notdown 的脚注采用无括号数字上标；脚注区和书目区各有横线，编号与正文缩进对齐，链接使用淡紫色下划线。书目编辑按钮在鼠标悬停或键盘焦点进入按钮时显示，触摸设备保持显示。本机 libMultiMarkdown 6.7.0 对重复脚注只为第一次引用生成 `fnref` 锚点，唯一返回箭头指向第一次引用；Notdown 保留每次引用各自的返回按钮，不复制此限制。以上均为视图样式，不改变 Markdown。

`Doe:2006` 和 `Doe2006` 是不同的键。未匹配引用保留源码并标记 unresolved，不猜测定义。打开或导入文档不会自动清理未引用/重复定义。页面编辑删除某个 citation 的最后一个引用时，删除该键的本地定义及原文恢复缓存，避免保存后重新出现；仍有重复引用或 `[Not cited][#key]` 时保留定义。代码中的引用示例不计入引用数量，其他键的未引用定义不受影响。源码模式保留显式定义，外部 BibTeX/CSL 数据不改写。编号、DOM 锚点与返回链接仅用于展示，不写入 Markdown。

Notdown 中 `[^https://example.com]` 默认是 Notion URL 引文；若正文已有同名脚注定义，则保留为脚注。关闭 URL 引文扩展时，无定义的 URL 标记保留为文字；代码中的标记始终保持原文。

<a id="image-controls"></a>

## 图片工具栏（2026-09-26）

独立图片和 Figure 共用图片视图：鼠标悬停、键盘聚焦或触屏时显示右上角工具栏，依次为 Alignment、Caption、Crop、Expand、Download、More，不含 Comment。左右手柄拖动改变宽度；聚焦手柄后方向键以 10px 调整，Shift+方向键为 40px。一次拖动为一次撤销操作，Escape 或取消指针操作恢复原尺寸。

Caption 沿用轻量编辑面板，Save 提交、Cancel/Escape 放弃。Crop 使用原图上的可移动矩形及四角手柄，支持百分比数值、Original/Square/16:9/4:3 预设、Apply/Cancel；More 中 Reset crop 恢复完整原图。Expand 打开可缩放原图并支持 Escape 关闭。Download 使用资源链接下载（跨源资源是否下载由浏览器与远端响应决定）。More 提供按 URL 换图、复制链接、原始尺寸、重置裁剪和删除；引用式图片换链接需使用 Source，不静默改写引用定义。

持久化继续使用原图片 Markdown：宽度复用既有 `width` 属性；仅 Notdown 激活补充 `align` 和 `crop` 属性，格式详见 [FORMAT](../FORMAT.md)。官方 Notion 与其他方言不写补充布局属性，不把应用功能冒充为官方 Enhanced Markdown。原生方言既有宽度属性仍按原 reader 保留；布局控件在不支持写入的方言禁用。行内混排图片保持行内显示，不强制转为图片块。

裁剪是非破坏性显示，附件本身不变；HTML 导出保留裁剪和对齐，取消题注后仍保留已有布局。未改源码、URL、title、独立 alt 和未知字段保留。打开控件后如果目标图片发生变化，提交会拒绝旧草稿，不覆盖新节点。新增测试为 `tests/unit/image-layout.test.ts` 和 `tests/e2e/image-layout.spec.ts`，浏览器使用隔离临时知识库。

## 验证与范围

2026-09-25 引文删除联动：新增 `tests/unit/citation-cleanup.test.ts`，覆盖末次引用删除、重复/隐藏引用、代码示例、整段删除、原文恢复缓存、已有孤立定义、撤销与重做；相关单测 10 项通过。`npm run test:e2e -- tests/e2e/inline-objects.spec.ts` 构建成功、11 项 Chrome 测试通过，验证 MultiMarkdown/Notdown 保存重载、其他书目与脚注保留。首轮全量单测出现临时文件写入及模块读取错误；以 `npx tsx --test --test-concurrency=4 tests/unit/*.test.ts` 复验，745 项中 741 通过、4 跳过、0 失败。日志为 `.run/logs/citation-cleanup-unit-verified.log` 和 `.run/logs/citation-cleanup-browser.log`；测试使用临时知识库，未写入用户 vault。

单元测试：`tests/unit/inline-objects.test.ts`、`tests/unit/table-commands.test.ts`；浏览器测试：`tests/e2e/inline-objects.spec.ts`、`tests/e2e/substitution.spec.ts`，使用临时知识库和独立 Chrome。替换修订回归覆盖两种方言的旧／新文字样式、格式保留、直接编辑、属性修改、源码与保存重载、接受／拒绝和撤销，以及 HTML 粘贴后两份内容的保留。

2026-09-24 本轮验证：相关单元测试 17 项通过；新增浏览器交互 7 项通过；构建通过。扩大浏览器回归最初 26/29 通过，两项测试选择器修正后已在上述 7 项中通过，余下一项 MMD metadata 建页返回 422。全量单测为 634 通过、6 失败、1 跳过，失败涉及 YAML/未知字段保留、导入恢复及链接处理；不宣称全仓库回归通过。本地日志见 `.run/logs/local-objects-targeted-current.log`、`local-objects-interactions.log`、`local-objects-build-final.log`、`local-objects-e2e-final.log` 与 `local-objects-unit-latest.log`。

跨端同步、云端数据库/自动化、关闭应用后的提醒另做。本轮不宣称完整上游语法兼容或内置文献库管理。正文仍通过原保存链路以 `baseRevision` 写入 Markdown，冲突不自动强制重试。
