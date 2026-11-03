# 上游 Markdown 方言语料与 HTML 对照审计

[English](DIALECT-HTML-AUDIT-2026-09-23.md) · **简体中文**

日期：2026-09-23。范围：当前注册的 11 个上游方言，排除自定义 `notdown`。本次新增测试文档、可复现运行器和结果记录，没有修改解析器、编辑器或用户知识库。

**结果：生成 11 份 Markdown 文档，包含 2,179 个独立输入；其中 1,954 个取得逐例官方 HTML 对照。** 另有文档扩展开启、关闭和文件路径上下文配置。发现真实的解析/导出缺口，也有安全策略、页面包装、产品上下文造成的差异，不能把所有 HTML 不同都解释为不支持语法。

## 交付物与阅读方法

- [11 份文档入口、覆盖范围和复现命令](../fixtures/dialect-audit/README.zh-CN.md)。每个 `CASE` 都有稳定 ID。
- [语料清单与来源哈希](../fixtures/dialect-audit/cases.json)：原文偏移、行号、文档链接、开关、规范预期。
- [汇总快照](../data/dialect-audit-2026-09-23/summary.json)和[逐例差异索引](../data/dialect-audit-2026-09-23/differences.json)。缺少官方基线的条目 `comparison: null`，不是失败或通过。
- 本机 `.run/dialect-audit/results/index.html`：可按方言、配置、差异类型、用例 ID 搜索，同时展示 HTML 渲染结果和代码。官方就是 Pandoc 时合并列，缺少输出时隐藏该解析器。渲染在禁用脚本及外部资源的隔离 iframe 内进行；原始 HTML 代码原样保留。
- 同目录 `results.json` / `*.cases.json` 保存完整逐例 Markdown、Notdown、官方、Pandoc 输出；`*.html` 保存整篇输出。原文档缓存和来源清单位于 `.run/dialect-audit/sources/`，日志位于 `.run/logs/`。

**以独立用例为兼容性证据。** 拼成一篇的文档适合浏览和导入，但未闭合围栏、同名链接定义、只在文首有效的元数据会互相影响。运行器按 `cases.json` 的原始字符偏移取片段，分隔注释不送入逐例解析。测试验证源文件和片段哈希，不改写 Tab、代码围栏或尾随空格。

## 官方依据与参照实现

| 方言 | 官方文档 | 本次 HTML 权威来源 |
| --- | --- | --- |
| CommonMark | [0.31.2 spec](https://spec.commonmark.org/0.31.2/) | 官方 commonmark.js 0.31.2；全部 652 个公布例子及其预期 |
| GFM | [0.29-gfm spec](https://github.github.com/gfm/)；[GitHub 写作 Docs](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting) | 677 个 spec 例子用官方 cmark-gfm C 实现，经 cmarkgfm 2025.10.22 Python 绑定调用；28 个 `doc-*` 用例使用[官方 REST Markdown API](https://docs.github.com/en/rest/markdown/markdown?apiVersion=2022-11-28) |
| markdown_strict | [John Gruber Syntax](https://daringfireball.net/projects/markdown/syntax) | 原作者 Markdown.pl 1.0.1 / Perl；旧实现的 quirks 与文档规则分开判断 |
| markdown_phpextra | [PHP Markdown Extra](https://michelf.ca/projects/php-markdown/extra/) | 官方 michelf/php-markdown 2.0.0 Extra / PHP 8.4.26 |
| markdown_mmd | [MultiMarkdown 6 Syntax](https://fletcher.github.io/MultiMarkdown-6/syntax/) | 官方 MultiMarkdown 6.7.0；使用实际输入文件及本地 include 文件 |
| markdown / commonmark_x / markdown_github | [Pandoc manual](https://pandoc.org/MANUAL.html)，固定 [3.11 原文](https://github.com/jgm/pandoc/blob/3.11/MANUAL.txt) | Pandoc 3.11 各自同名 reader；`markdown_github` 已弃用，不能等同当前 GFM |
| typora | [Markdown Reference](https://support.typora.io/Markdown-Reference/)、[图表](https://support.typora.io/Draw-Diagrams-With-Markdown/)、[Strict Mode](https://support.typora.io/Strict-Mode/) | 官方 Typora 0.9.58 原生无样式 HTML 整篇导出；旧版本，不作为当前文档的逐例权威基线 |
| obsidian | 官方 [基础语法](https://help.obsidian.md/syntax)、[高级语法](https://help.obsidian.md/advanced-syntax)、[内链](https://help.obsidian.md/links)、[嵌入](https://help.obsidian.md/embeds)、[callouts](https://help.obsidian.md/callouts) | 安装的 1.13.7 已尝试临时 profile/vault + 官方 MarkdownRenderer，两次 90 秒均未返回 HTML，记为不可用 |
| notion-markdown | [Enhanced Markdown](https://developers.notion.com/guides/data-apis/enhanced-markdown)、[Markdown API 使用](https://developers.notion.com/guides/data-apis/working-with-markdown-content) | 官方公开接口是页面 Markdown 读写，没有等价的 Markdown→HTML 接口；本次仅按官方文档检查 Notdown 输出 |

另用 Pandoc 渲染其支持的 8 个 reader；它没有 typora、obsidian、notion-markdown 同名 reader，不拿其他 reader 冒充。引用、元数据、HTML 属性等实现差异以方言自己的官方实现为优先，Pandoc 只是辅助比较；三个 Pandoc 自有方言则以 Pandoc 为权威。

GitHub API 使用 `mode: gfm` 和公开 `github/docs` 上下文，只发送合成语料；28 个用例及整篇请求均返回 200。仓库 mention、issue、SHA 和外部工单链接依赖上下文；REST 返回的数学/图表组件占位 HTML 不等于 GitHub 前端已完成渲染。GFM spec 的五项扩展与 GitHub Docs 的脚注、告警、数学、图表、折叠、颜色、引用等分别保留。

CommonMark 当前实现与 652 项 spec 预期的规范化 DOM 全部相同；cmark-gfm 与 GFM 发布的 677 项预期有 **30 项不同**，见汇总 `specChecks`。包括代码语言包装、tagfilter、嵌套强调、数字实体及部分链接/HTML 边界。报告同时记录 `officialVsSpec`，不把当前实现与公布规范混成一个来源。cmark-gfm 启用 raw HTML 和其默认扩展；清理策略另外判断。

在线文档是语义依据。缓存 Typora 直连失败时使用其官方支持站 GitHub 镜像；镜像与在线更新时间不同，实际 `retrievedFrom` 已记录，不宣称是同一字节快照。Obsidian 文档缓存来自其官方帮助仓库。完整来源 URL、时间、SHA-256 在语料清单内。

## 测试范围与统计

Notdown 调用实际自有路径 `parseNative(source, {version: 1, variant, extensions}) → renderNotionMarkdown(source, [], {document})`，另检查 `serializeNative`。没有使用 Markdown Lab 的外部转换作为 Notdown 输出。**测量的是静态 HTML 导出，不是实时 ProseMirror 视图的最终 DOM 或点击行为。**

`default` 不额外启用开关；`documented` 逐例打开文档要求的可选扩展；三个 Pandoc 方言还逐项跑 `disabled`，并用 `file-path` 测试真实文件的路径上下文。构建语料时对 Pandoc `--list-extensions` 全部输出做覆盖检查，不能遗漏后续新增开关而默默通过。

| 方言 | 独立输入 | 默认有官方对照 | DOM 相同 | 文本相同 | 文档扩展 / 关闭 / 路径配置 |
| --- | ---: | ---: | ---: | ---: | --- |
| commonmark | 686 | 686 | 255 | 684 | 0 / 0 / 0 |
| gfm | 750 | 750 | 257 | 723 | 11 / 0 / 0 |
| markdown_strict | 34 | 34 | 8 | 28 | 0 / 0 / 0 |
| markdown_phpextra | 62 | 62 | 12 | 54 | 0 / 0 / 0 |
| markdown_mmd | 103 | 103 | 11 | 43 | 0 / 0 / 0 |
| markdown | 121 | 121 | 34 | 99 | 74 / 74 / 1 |
| commonmark_x | 77 | 77 | 23 | 61 | 30 / 30 / 1 |
| markdown_github | 121 | 121 | 47 | 107 | 74 / 74 / 1 |
| typora | 70 | 0 | 0 | 0 | 12 / 0 / 0 |
| obsidian | 103 | 0 | 0 | 0 | 0 / 0 / 0 |
| notion-markdown | 52 | 0 | 0 | 0 | 0 / 0 / 0 |

DOM 比较只消除属性顺序、等价实体编码与排版空白，保留 ID/class、URL、表头、列表包装、标记层级以及 pre/code 空白。`textEqual` 是折叠空白后的文本诊断，会忽略链接目标、结构和部分标签含义，不能作为通过率。DOM 相同也不证明交互可用。

全部输入/配置没有出现 Notdown 异常，未编辑的序列化均保持原文；这只证明**原文可恢复**，不证明成功解析，也不证明结构化编辑后的正确性。逐例原始证据均保留。实际运行的引擎文件哈希前后一致；执行的是带用户现有未提交修改的工作区，`environment.json` 记录 HEAD、dirty 状态及引擎哈希，不能用 HEAD 单独代表本次代码。

## 已确认的差异

以下 ID 可直接粘贴到 HTML 对照页搜索。建议先处理内容/目标丢失和结构错误，再处理平台包装差异。

| 优先级 | 方言 / 用例 | 官方与 Notdown 的实际差别 |
| --- | --- | --- |
| 高 | MMD `mmd-image-figure`；Pandoc `pandoc-implicit_figures` | 部分独立图片导出 `<img>` 丢失 `src`，caption 的 Markdown 也仍为字面量。普通行内图片及其他方言不能据此一概判为失败 |
| 高 | `list-nesting`（Original / PHP Extra / MMD） | 官方生成嵌套列表；Notdown 把 `outer - middle 1. inner` 合并到段落，丢失列表层级 |
| 高 | GFM `doc-collapse` | 官方 `<details>` 包住标题和正文；Notdown 提前关闭 details，后续内容跑到折叠容器外 |
| 高 | PHP Extra `extra-fence-length` | Extra 要求结束围栏数量匹配；官方保留更长围栏为代码内容，Notdown 提前结束 |
| 中 | GFM `gfm-example-491` / `gfm-example-493` | `~there~` 官方删除线，Notdown 字面量；三波浪包围的文字官方为字面量，Notdown 局部误作删除线 |
| 中 | GFM `autolink-boundary` | `abcwww.example.com` 被错误自动链接；带 `&amp;` 的裸 URL 出现 href 实体处理/边界不同 |
| 中 | GFM `table-align` 等 | 官方使用 `<thead>/<th>`；Notdown 以加粗背景样式的 `<td>` 代替，表头语义和可访问性不同 |
| 中 | PHP Extra 定义列表、`extra-abbreviation` | 多个连续术语未形成多个 dt；空缩写定义没有生成 abbr，定义原文反而显示出来 |
| 中 | PHP Extra `markdown="block"` 表格容器用例 | 官方 Markdown 子列表保留在单元格内；Notdown 列表脱离 table 容器 |
| 中 | Pandoc `pandoc-fancy_lists` | a)、iv.、A.、自动编号等不同列表被合并，起始值与编号类型丢失 |
| 中 | commonmark_x 属性、隐式标题链接 | 属性被保留为可见 `{...}` 原文；默认开启的隐式标题引用部分未解析；task list 默认边界也与 reader 不同 |
| 中 | GFM `doc-math-dollar`，documented 配置 | `$` 包裹反引号的公式与普通 dollar math 同时启用时，反引号进入 KaTeX 内容，存在语法优先级问题 |
| 中 | MMD 缩写、citation、table reference | 缩写首次展开和自动匹配不同；引文使用 key 标签/定义列表代替官方编号参考文献；表引用有未解析和 ID 归一化不同 |
| 中 | MMD metadata / transclusion | Base Header Level 不生效；未知变量显示 `Undefined: missing`，官方保留变量；官方读取 include 文件，Notdown 静态导出仅输出 include 名称占位，不展开代码围栏/通配 include |
| 边界 | CommonMark `cm-606` / `cm-632` | 两个反斜杠/畸形 HTML 边界被 Notdown 包为 opaque pre，与官方普通文本段落不同 |
| 边界 | Original `reference-links`、超六级标题 | 旧 Markdown.pl 对 shortcut 引用/标题边界与现代解析器不同，应先确定兼容目标，不能盲目复刻旧实现 quirks |

有些差异不能直接列为解析缺陷：

- Notdown 的 `md-` ID 命名空间、编辑器 class/data 属性、列表内 p 包装会产生很多 DOM 不同；标签结构、链接目标仍需单独核对。
- GFM tagfilter 让禁用标签成为可见文本；Notdown sanitizer 删除 script/style 等内容。这是安全/导出策略差别，不应以恢复脚本执行作为修复。
- Pandoc 非 HTML raw_tex / raw_attribute 在 HTML 输出中省略；Notdown 用 opaque 块保留原文。元数据也可能显示为 dl/pre，属于输出策略差别。
- 静态脚注导出使用原标签、定义顺序，缺少官方数值编号和回链。这不等于实时编辑器脚注功能也相同。
- GitHub Mermaid、GeoJSON、STL 的官方 REST 输出是后续渲染所需的结构；Notdown 静态输出保留源码。数学的 KaTeX HTML 与 GitHub math-renderer 包装不同本身不是失败。
- GitHub 颜色预览、mention、工单和提交链接属于网站环境能力。REST 标题也不自动提供整个网站的 anchor 注入，因此没有仅凭 REST 就判定标题锚点失败。

## 无逐例官方 HTML 的三个方言

这些仍已生成全套文档、Notdown 逐例和整篇 HTML；**没有伪造官方基线或通过率**。

- **Typora**：70 个输入覆盖官方 Markdown Reference、YAML、脚注、TOC、数学、上下标、高亮、emoji、告警、HTML 媒体、三类图表及严格模式边界；12 项有文档开关配置。默认关闭的行内公式/高亮/上下标不能判成不支持。应用原生导出补验状态见本节末尾。
- **Obsidian**：103 个输入覆盖属性、内链/块链接、各类嵌入、表格转义、注释、公式、脚注、任务和全部官方 callout 类型/别名。文档层面发现 `obs-block-links` 的块 ID 仍出现在可见正文、`obs-embed-note` 静态输出为 `!` 加普通页面链接，尚未展开笔记。`obs-comments` 行内注释输出可见编辑图标。fold callout 能生成 details/open 结构，但没有官方 DOM 或交互验收，不能标为兼容完成。
- **Notion Enhanced Markdown**：52 个输入包含官方块类型、Tab 层级、XML table、列、同步块、所有颜色、五类对象 mention、日期、citation 和负向边界。当前官方文档明确列出 `<mention-agent>`，Notdown 却导出转义字面量，是可从文档直接确认的缺口；其他 mention 和多种结构已有 HTML 输出，但对象权限/同步内容不是静态转换能验证的。官方 complete example 自己含 pipe table，而表格格式章节主述 XML table，两个都保留，不自行删除文档不一致。`<tabs>`、`<web-bookmark>` 负向用例保持 opaque，没有越界启用 notdown 自定义协议。

Notion API 若通过创建页面再导出 HTML，需要云端写入和额外导出路径，且不等价于公开官方解析器。本次没有修改任何云端页面，也没有把第三方 Notion 渲染库叫作官方。

Typora 补验：从 `C:\Program Files\Typora\Typora.exe` 启动，文件版本确认 **0.9.58**，通过“文件 → 导出 → HTML (without styles)”生成 `.run/dialect-audit/results/typora.official.html`。应用在代码块空行自动补入空格；哈希检查发现后已恢复原测试文件，另保留 `typora.application-saved.md`，并对这份实际保存的输入重新生成 `typora.application-saved.notdown.html`，提取官方 body 后比较，DOM 和文本均不同。现有偏好未修改，但未逐项记录。此旧版本不能验证当前文档的新功能，且语料中的围栏边界影响后续内容，所以只保留整篇证据，不从中推导逐例通过率。版本、输入/输出哈希和比较状态记录于汇总 `info.typoraWhole`。

## Excel 两个 sheet 的核对

读取 `C:\Users\Eric\Desktop\markdown & notion.xlsx` 的 `markdown`（71 行）与 `extended`（89 行），未改写原工作簿。基础分类大多可用，但工作表不能代替可执行例子及官方细节。下列为确认需要修订或补充条件的项目，不宣称逐单元格全部通过。

| Sheet / 单元格 | 问题及建议 |
| --- | --- |
| markdown C54 | shortcut `[text]` 的 “INCLUDED IN PERL CODE” 对本次 Markdown.pl 1.0.1 不成立；与文档中的 collapsed `[text][]` 分开 |
| markdown F64 | “NOT SUPPORTED” 容易被理解为 CommonMark 不支持这些 raw HTML 标签；应写 GFM tagfilter 限制不适用，而非 raw HTML 不支持 |
| markdown C31/F31/G31 | 编号列表虽同样书写，起始语义不同：Original 实现从 1 开始，CommonMark/GFM 保留 3 等起始值 |
| markdown D20 | 空行不是会生成 HTML 的 leaf block；它承担块分隔作用 |
| extended D36/D37 | citation 使用 `#Doe:2006`，定义却写 `#Doe2006`，标识不匹配，应统一 |
| extended E3 | MMD metadata 不等于完整 YAML front matter；允许边界符不意味着支持完整 YAML 类型/结构 |
| extended Typora 第 5、8–11、13–15 行 | 加上相关版本、偏好开关或图表渲染条件，避免表达成无条件默认支持 |
| extended D13–D15 | 只有空围栏只能说明语法载体，不能验证 diagram parser；应加入合法图表正文 |
| extended E7 | Notion `:emoji_name:` 包括 workspace custom emoji，不能笼统等同公共 `:smile:` 别名表 |
| extended D40 | BibTeX 的用途和所需 metadata/LaTeX 输出上下文需要注明，HTML 结果不能证明 BibTeX 工作流 |
| extended E78 | PHP Extra 支持某些属性写法不等于支持 Notion toggle 的块语义 |
| extended D80/D82/D88 | 示例使用空格层级；Notion 官方 Enhanced Markdown 要求 Tab，应换为真正 Tab |
| extended 第 62–71 行 | 应明确是 GitHub Docs/网站处理层扩展，不能全部归入 GFM spec；工单、SHA 等还有仓库上下文条件 |
| extended 第 72/73 行 | R Markdown 不在当前注册的 11 个上游预设范围；没有额外创建一个假定已实现的方言 |

## 验证与剩余边界

- `npm test`：497 项，496 通过、1 跳过、0 失败。新增两项检查对照归一化不会抹掉语义差异，以及语料哈希/全部预设/扩展开关覆盖。
- `npm run build`：成功；保留现有 Vite 大 chunk 警告。
- HTML 对照页以独立 headless Chrome 验证搜索、方言/配置筛选、无官方基线数量和分页，无页面脚本错误；截图保存在 `.run/dialect-audit/results/viewer.png`。
- 本次未改编辑器交互，所以未运行编辑交互 e2e；没有连接用户 Chrome 或用户知识库做测试。

本套覆盖官方语法类别、两套规范的全部公布例子和 Pandoc 当前 reader 的全部扩展开关，但有限语料不能穷尽所有嵌套、错误输入、组合和平台状态。还需补齐三种产品方言的官方逐例渲染、媒体/笔记/云对象交互、MMD/Pandoc 非 HTML 目标和编辑后语义验证，才能进一步宣称完整兼容。本次先保留可复查差异基线，尚未修复上表问题。
