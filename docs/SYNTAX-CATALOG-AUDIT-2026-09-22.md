# Block Explorer 语法说明与对应关系核对

2026-09-22。来源为桌面 `markdown & notion.xlsx` 的 **markdown 70 条、extended 84 条**，以及项目的 Pandoc 3.11 手册扩展清单 **89 项（77 项 Markdown 范围、12 项其他格式）**。本次共补入 243 条可检索说明；Excel 原文件未改动。

## 已写入 Explorer

Content objects、Markdown variants、Extensions 的详情页都有 **Syntax guide**。每条含原始语法、Excel sheet/行范围或 Pandoc 扩展名、所属方言、相关扩展/内容对象、官方来源，以及适用时的 Correction / Implementation boundary。可以搜索 `extended!A53:E53` 等位置。原始错误示例保留，更正另列，不静默改写表格证据。

普通块语法不伪造插件；GitHub 平台功能和 R Markdown 运行时不伪造已实现扩展。Notion `<database>` 指向 Unsupported；`<empty-block/>` 不对应 Pandoc `empty_paragraphs`。Pandoc 的 `sourcepos`、`gutenberg`、相对路径选项写明其行为，不当作新的可插入块。

补全了 Pandoc 语法与对象的说明关联，包括行内/块数学、行内代码属性、原始 TeX、表格与标题修饰等。**说明关联不代表运行时适配器或插入命令已修好**，后者的缺漏见下文。

## 表格中应更正或限定的关系

| 来源位置 | 核对结论 |
| --- | --- |
| `markdown!D20` | 空行是分隔规则，不是 CommonMark AST 中独立的叶块。Notdown 的可编辑空段落是编辑器行为。 |
| `markdown!C31:G31` | 列表语法支持关系基本正确，但首项 `3.` 的显示语义不同：Original 忽略起始数字，CommonMark/GFM 保留。后面的 `1.`、`8.` 不决定显示序列。 |
| `markdown!C54:G54` | 快捷引用在 Markdown.pl 中可用，这个备注合理；不能从语法网页没有单列就判为原始实现不支持。 |
| `markdown!C64:G64` | “不支持”指 GFM 特有过滤规则，而非 Original/CommonMark 不识别那些 HTML 标签。过滤同时涉及块和行内 HTML。 |
| `extended!A2:E2` | 脚注含行内引用和块定义，不宜只标 block。“Markdown Guide”是教程网站，不是方言。 |
| `extended!A3:E3` | MMD 接受该简单键值例及可选 `---`，但不支持完整 YAML。应对应 `mmd_title_block`，不能等同完整 `yaml_metadata_block`。 |
| `extended!A7:E7` | 更正此前审计：Notion Enhanced Markdown 明确定义 `:emoji_name:` 自定义表情，不能否认它的冒号语法。自定义名称与通用 shortcode 字典不等价，不属于 Notion mentions；本地尚未接入 Notion 工作区表情解析。 |
| `extended!A23:D23` | PHP Extra 的章节名叫 Inline HTML，但 `<div>` 示例应关联 HTML block。 |
| `extended!D36:D37` | 两例引用键是 `Doe:2006`，定义键却是 `Doe2006`。统一键后才能解析到对应书目。 |
| `extended!A62:D70` | 自定义锚点是原始 HTML；团队/Issue/PR/JIRA/SHA 自动链接是 GitHub 平台功能，不是 GFM Spec 的裸 URL 自动链接。`@github/support` 是团队提及，不是单个用户。JIRA 还需仓库自定义 autolink 配置。 |
| `extended!A72:D73` | R Markdown/knitr 的执行语义不属于普通代码围栏/代码段；语法保留不能算作支持 R 运算。 |
| `extended!A77:D77` | `text {color="blue"}` 是 Notion 块颜色属性；行内文字色应使用 `<span color="blue">…</span>`。 |
| `extended!A78:E78` | 折叠标题的交互语义属于 Notion。PHP Extra 可接收自定义属性，但不会因此产生 toggle heading。 |
| `extended!D80:D82` | Notion 的官方嵌套示例使用 tab。表中单空格缩进可作为本地宽松输入，不能当作官方缩进规范。 |

一些容易被误判、但表格写得正确的内容也保留了：MMD v6 的行内链接属性和 `{=html}/{=latex}` raw source 都有官方依据；MMD 6.5 的 `{{TOC:2}}` 只取二级，`{{TOC:2-3}}` 取级别区间；`markdown!G62` 的 `mailto:` 属于 GFM extended protocol autolink。

## 已复现的实现偏差与缺漏

这些是此次审计发现的现有问题。本次修改说明与关联数据，没有扩写 Markdown codec 或修改正文存储。

| 项目 | 最小复现与实际结果 | 判断 |
| --- | --- | --- |
| 数学的能力映射 | 关闭 `tex_math_dollars`，单开 `tex_math_single_backslash`、`tex_math_gfm` 或 `tex_math_double_backslash`：相应行内样例生成 `inline_math`，但 `getContentCapabilities("inline.inline_math", config).available` 为 false。单反斜杠/GFM 块公式也出现对应问题。 | **映射缺漏**。双反斜杠块公式已有适配器，不能一起判缺失。 |
| 简写上下标的能力映射 | 关闭成对 `subscript/superscript`，单开 `short_subsuperscripts`：`x^2` 产生 superscript，但内容对象能力显示不可用。 | **映射缺漏**。上下标的独立简写入口未登记。 |
| Pandoc `mark` 的能力映射 | 关闭产品 `highlight`，单开 `mark`：`==x==` 产生 highlight，但对象只登记 highlight/CriticMarkup 入口。 | **映射缺漏**。语法不是未实现。 |
| 数学插入命令 | `commandEnabled(config, "equation")` 只检查 `tex_math_dollars/display_math`。 | **交互门控不完整**。有其他数学解析入口不代表菜单可以按该编码创建。 |
| HTML 自定义锚点 | `renderRawHtml('<a name="custom-anchor-point"></a>')` 得到 `<a></a>`，ID 同样被清理。 | **输出语义未实现**。表格第 62 行目标锚点丢失，源码仍保存。不能当作可用的自定义锚点。 |
| GFM tagfilter | `renderRawHtml('<textarea>text</textarea>')` 保留只读 textarea；其他标签可能被丢弃。GFM 要求对指定标签作字面转义。 | **兼容性差异**。本地通用清理策略不是 GFM tagfilter 的精确实现。 |
| `literate_haskell` | `markdown+literate_haskell` 下，`\begin{code}…\end{code}` 在本地是 Raw TeX，`= A heading` 是普通段落；实跑 Pandoc 3.11 分别得到 Haskell CodeBlock 和一级 Heading。 | **实现不完整**。Bird-track 已有解析，不能据此宣称整个扩展完整兼容。 |
| `sourcepos` | 本地只记录块级行范围，没有 Pandoc 那样的行内字符位置映射。 | **部分实现**，现有描述已限定。 |
| `markdown_in_html_blocks`、复杂表格、TeX | 本地主要实现 Div 路径；表格采用受限单元格模型；公式依赖 KaTeX，原始 TeX 不执行。 | **实现边界**，不能从同名开关推断完整 Pandoc 兼容。 |

另有明确未实现的运行时：GitHub 团队通知、Issue/PR/JIRA/SHA 短引用解析；R/knitr 代码执行；Notion 数据库引擎与 Notion 云同步；跨设备同步。数据库标签目前仅保留为 Unsupported。同步块已实现本地快照、刷新、CAS 发布，因此不能笼统说同步块全未实现。

**没有默认启用不等于未实现。** 当前 Typora 的行内数学、上下标、高亮、alerts、diagrams 等需打开对应选项；GFM 预设将数学、脚注、emoji、alerts 等 GitHub Docs 功能保留为可选。PHP Extra 的代码属性和 `startnum` 目前已经默认开启；历史 `PRODUCT-SYNTAX.md` 的旧表仍写“需开启”，本次应以当前注册表与 Explorer 状态为准。

## 验证方法与范围

`node --import tsx scripts/audit-catalog-syntax.ts` 对说明中具有已注册目标方言的源码运行默认配置及相关开关配置，调用 `doc.check()` 和原文往返比较。最新为 **1,381 组配置，无异常、无未编辑源码往返差异**；完整机器输出在忽略的 `test-results/catalog-syntax-audit.json`。R Markdown 无本地方言，不纳入这些配置数。

这个审计只证明结构有效和未编辑原文保留，不自动证明显示、实际文件资源、所有编辑路径或完整语义正确；上述问题来自额外的语义检查。空图表围栏、占位 URL、缺少 bibliography 的样例不能用于宣称外部功能通过。

目录测试核对全部工作簿条目和 89 个手册标识符的覆盖、有效关联、错误样例保留及浏览器内链接/检索/窄屏显示；浏览器使用独立临时知识库与 Chrome，不连接用户浏览器。

本次验证结果：

- `npm run build`：通过（由最终 `npm run test:e2e -- e2e/block-catalog.spec.ts e2e/catalog-syntax.spec.ts` 执行）。
- 上述目录 Chrome 浏览器测试：8/8 通过，已检查桌面和 390px 窄屏截图。
- 目录数据及关联专项单测：8/8 通过。
- 最后一次 `npm test`：424 项中 422 通过、1 失败、1 跳过。失败为 `test/notdown-union.test.ts` 的 Notion 颜色与 Markdown 标记混合编辑后重开：写出的 `~<span …>sub</span>~` 未恢复 subscript。该失败在本次未改动的 codec/序列化路径，不是目录数据覆盖测试失败；本次未修复。工作区同时有其他编辑器改动，结果以该轮日志为时间快照，不将早先已失效的方言断言失败当作当前缺口。

可复查日志：`test-results/catalog-unit-final.log`、`test-results/catalog-e2e-final.log`。这些是本地验证产物，不写入用户知识库。

## 官方核对来源

- [CommonMark 0.31.2](https://spec.commonmark.org/0.31.2/) 与 [GFM Spec](https://github.github.com/gfm/)：基础语法、自动链接、HTML 过滤。
- [PHP Markdown Extra](https://michelf.ca/projects/php-markdown/extra/)：HTML、属性、围栏、定义列表、缩写。
- [MultiMarkdown 6 syntax](https://fletcher.github.io/MultiMarkdown-6/syntax/)：元数据、引文、raw source、链接属性与目录。
- [Typora reference](https://support.typora.io/Markdown-Reference/) 与 [Strict Mode](https://support.typora.io/Strict-Mode/)：产品选项和宽松输入。
- [Notion Enhanced Markdown](https://developers.notion.com/guides/data-apis/enhanced-markdown)：颜色、折叠标题、扩展标签。
- [GitHub autolinked references](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/autolinked-references-and-urls)：仓库上下文中的引用功能。
- [R Markdown code chunks](https://rmarkdown.rstudio.com/lesson-3.html)：代码运行与输出。
- [Pandoc manual](https://pandoc.org/MANUAL.html#pandocs-markdown) 与 [Literate Haskell](https://pandoc.org/MANUAL.html#extension-literate_haskell)：扩展语义；本机对照版本为 3.11。
