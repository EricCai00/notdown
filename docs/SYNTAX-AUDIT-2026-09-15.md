# 用户附加语法清单核对：62 条

> 本文保留改造前的审计结果；当前实现请看 [62 条支持矩阵](PRODUCT-SYNTAX.md)。以下“当前／未实现”均指这次改造之前。

2026-09-15，针对用户提交的 Typora、Obsidian、PHP Markdown Extra、MultiMarkdown 清单逐条检查。

## 结论与之前说明的纠正

**没有全部实现。** 上次接入的是九个可选择的预设和一部分核心规则；“方言已实现”的说法过于宽泛。43 个注册开关也不表示各方言的所有语法都已实现，其中 12 个是 Notdown 自有扩展，三种元数据开关仅识别并保留原文。

当前没有 Typora 或 Obsidian 专用预设。`markdown_mmd` 的默认配置来自 Pandoc 的同名 reader，并未调用 MultiMarkdown 自身解析器，也未完整实现 MultiMarkdown 产品语法。类似地，PHP Extra 预设只实现了一部分 PHP Extra 功能。

本次把全部 62 条样例交给主编辑器实际使用的 `parseNative`，检查语义节点和原文往返，并检查 schema、HTML 显示和页面导航代码。Typora／Obsidian 样例在 GFM、Pandoc Markdown、Notion 默认配置下核对；PHP Extra 和 MultiMarkdown 样例在对应预设下核对。具体源文与解析结果见 [机器核对记录](data/user-syntax-audit-2026-09-15.json)。**源码能够原样保存不等于语法得到支持；存在链接节点不等于能够正确导航。** 这不是 62 项浏览器视觉验收。

## 逐条结果

编号按用户清单顺序。表中“支持”仅指该样例的核心语义，仍受说明中的方言和开关约束。

### Typora 条目（1–18）

| # | 语法 | 当前状态 | 实际表现／原因 |
| --- | --- | --- | --- |
| 1 | 独立 `$$` 数学块 | 支持 | `tex_math_dollars`；GFM、Pandoc Markdown、MMD、Notion 等默认开，解析成 equation 并由 KaTeX 显示 |
| 2 | `[^fn1]` 和脚注定义 | 部分 | GFM、Pandoc、PHP Extra、MMD 可形成引用与说明块；没有统一数字编号、尾注汇集、返回链接。Notion 的同形引用是另一种 citation，不是这个脚注系统 |
| 3 | YAML front matter | 仅识别保留 | GFM／Pandoc 的正文开头形成 opaque_block；不提取为页面属性，也不应用 layout。Notion 不支持这个正文扩展；文件外层的知识库 YAML 是另一层 |
| 4 | `[toc]` | 未实现 | 显示普通文字。现有目录侧栏和 `<table_of_contents/>` 不等于支持这个写法 |
| 5 | `> [!NOTE]` alert | 未实现 | 显示含 `[!NOTE]` 的普通引用；`alerts` 尚未注册原生规则。Notdown `<callout>` 是不同语法 |
| 6 | `[link](#header-3)` | 部分 | 链接能解析，但页面标题没有按此规则生成 DOM ID，缺完整锚点跳转链路 |
| 7 | `:smile:` | 支持但默认值不同 | GFM／CommonMark X／旧 GitHub 默认开 `emoji`；Pandoc Markdown 默认关，可开。Notion 暂无该名称转换，Notion 自定义 Emoji 也未接入 |
| 8 | `$y=x^2$` | 支持 | `tex_math_dollars`，形成 inline_math；不是所有预设都默认开启 |
| 9 | `H~2~O` | 支持但默认值不同 | `subscript`；Pandoc Markdown、MMD、CommonMark X 默认开，GFM 默认关，Notion 不提供此开关 |
| 10 | `X^2^` | 支持但默认值不同 | 同上，对应 `superscript`；只说明有闭合符号的形式 |
| 11 | `==highlight==` | 未实现 | 普通文字；现有颜色／下划线标记没有对应的 `==` reader/writer |
| 12 | `iframe` 嵌入 | 未实现播放，显示层主动过滤 | 可以形成 HTML 块并保留源码，但 HTML allowlist 明确隐藏 iframe；缺独立的隔离嵌入视图，不是打开 `raw_html` 就会播放 |
| 13 | `sequence` 围栏图 | 未实现图形渲染 | 普通 code_block；没有 sequence 渲染器 |
| 14 | `flow` 围栏图 | 未实现图形渲染 | 普通 code_block；没有 flow 渲染器 |
| 15 | `mermaid` 围栏图 | 未实现图形渲染 | 普通 code_block；没有 Mermaid 渲染器，语言名得到保留不代表图形实现 |
| 16 | `###header` | 可通过现有规则表达 | `markdown*` 家族关闭 `space_in_atx_header` 可读成标题；Strict／PHP Extra／MMD 默认无需空格。Typora 的 Strict Mode 设置不是这里的 Markdown Strict 预设 |
| 17 | 编号项后两空格普通续行 | 部分／预设差异 | GFM／Pandoc 样例是同一项的段落续行；Notion 是自己的按行块规则，未实现 Typora 专用宽松模式 |
| 18 | 编号项后两空格子编号项 | 未实现 Typora 专用兼容 | 没有 Typora 两空格层级规则；当前 Markdown 基础规则把此样例读成同级项，不能据此宣称支持 Typora 子列表 |

### Obsidian 条目（19–22）

| # | 语法 | 当前状态 | 实际表现／原因 |
| --- | --- | --- | --- |
| 19 | 多行 `%%` 注释 | 未实现 | 作为可见文字显示，未建立注释块或隐藏逻辑 |
| 20 | `%%comment%%` | 未实现 | 作为可见文字显示，未建立注释标记 |
| 21 | `[[note title]]` | 部分 | Notion 可形成 page_link；其他预设可开 `wikilinks_title_after_pipe`。不是完整 Obsidian 链接系统，标题／块定位、嵌入及文件路径规则未齐 |
| 22 | `[note title](note%20title.md)` | 部分 | 普通链接语法能解析；没有把这种文件名链接解析为知识库 UUID 页面并导航的完整适配 |

### PHP Markdown Extra 条目（23–34）

| # | 语法 | 当前状态 | 实际表现／原因 |
| --- | --- | --- | --- |
| 23 | 段落后 `<div>` | 支持 HTML 预览 | 样例形成段落加 HTML 块；实际是块级 HTML，不是行内 span。内部标签源码通过 HTML 显示规则处理 |
| 24 | `<div markdown="1">` | 未实现混合解析 | 形成 HTML 块，内部 `*true*` 不作为 Markdown 强调。缺 `markdown_attribute` reader |
| 25 | 标题 `{#heading-id}` 与链接 | 未实现属性和目标绑定 | `{#heading-id}` 留在标题文字里；没有对应锚点 |
| 26 | 标题 `{.main}` | 未实现 | 属性文字保留；没有 class 语义 |
| 27 | 标题 `{lang=fr}` | 未实现 | 属性文字保留；没有通用属性 reader。外部软件是否接受该属性集合还取决于具体版本 |
| 28 | 链接／图片 `{#id .class}` | 未实现属性 | 基础链接和图片可识别，但花括号作为尾随文字 |
| 29 | 引用定义后的属性 | 未实现 | 该样例退化为段落；缺带属性引用定义的解析及关联 |
| 30 | `~~~ .html` | 部分 | 代码块成立，`.html` 留在 params；未提供完整 fenced attributes 的类名／语言语义 |
| 31 | `~~~ {.html #example-1}` | 部分 | 代码块成立，属性串保留，但不生成 code ID／class，也不保证按其中语言高亮 |
| 32 | 定义列表与多个定义 | 支持 | `definition_lists` 默认开；术语及多个 definition_description 成立，可编辑 |
| 33 | `*[HTML]: ...` | 支持这种缩写定义 | `abbreviations` 默认开。定义本身不显示正文；需在后续正文出现 `HTML`，才会出现缩写说明。只有这行时看不到文字是正常结果 |
| 34 | 连续 `3. / 4. / 5.` | 发现缺陷，已修正 | 原先被错误合并为一项：段落打断限制也拦截了同级列表边界。本次修复并补连续项目测试。显示从 3 开始还须启用 `startnum`；PHP Extra 预设按 Pandoc 快照默认关 |

### MultiMarkdown 条目（35–62）

| # | 语法 | 当前状态 | 实际表现／原因 |
| --- | --- | --- | --- |
| 35 | `[>MMD]`、`[>(MD) Markdown]` 缩写 | 未实现 | 某些形式会被读成普通引用链接；PHP Extra 的 `*[HTML]` 插件不能实现这套语法 |
| 36 | `[locator][#Doe:2006]` | 未实现引文 | 缺 MMD citation 解析、文献数据与排版；样例引用键 `Doe:2006` 与定义键 `Doe2006` 也不一致 |
| 37 | `[][#Doe:2006]` | 未实现引文 | 同上，包括样例键不一致问题 |
| 38 | `[Not cited][#citekey]` | 未实现引文 | 没有“纳入参考文献但不在正文引用”的语义 |
| 39 | 行内完整文献 | 未实现引文 | 未解析为引文／文献条目 |
| 40 | BibTeX citation 三种形式 | 未实现 | 未接入 BibTeX 查询和 citation writer |
| 41 | CriticMarkup 删除 | 未实现 | `{--text--}` 是普通文字，不具有修订语义 |
| 42 | CriticMarkup 添加 | 未实现 | `{++text++}` 是普通文字 |
| 43 | CriticMarkup 替换 | 未实现且会误解释内部语法 | `{~~text~>text~~}` 的一部分被下标插件识别；未改时源码保留，但不能保证编辑后保持未知语法的内部含义 |
| 44 | CriticMarkup 高亮 | 未实现 | `{==text==}` 不具有高亮／修订语义 |
| 45 | CriticMarkup 评论 | 未实现 | `{>>text<<}` 不具有评论语义 |
| 46 | `[header-id]` 标题交叉引用 | 未实现 | 标题里的标记保持文字，隐式引用未建立 |
| 47 | 行末反斜杠换行 | 已有规则，MMD 默认关 | `escaped_line_breaks` 可开；Pandoc `markdown_mmd` 默认关，因此样例保留反斜杠并显示软换行 |
| 48 | `{{file.txt}}` | 未实现 | 没有文件展开处理、依赖索引和刷新链路 |
| 49 | `{{file.*}}` | 未实现 | 没有通配文件展开及目标格式选择 |
| 50 | glossary 三种形式 | 未实现 | 部分标记被当作普通链接，未产生术语表语义 |
| 51 | 独立图片 | 部分 | 产生 paragraph(image)，不是完整 Figure／题注块；`/path/to/img.jpg` 是占位资源地址，解析成功不表示该图片实际存在 |
| 52 | 引用链接／图片属性 | 未实现 | 带属性的引用定义未识别，连带正文引用不能按预期解析 |
| 53 | 行内链接属性 | 未实现 | 样例退化为文字，缺 MMD 链接属性语法 |
| 54 | 双反斜杠数学 | 未实现 | `tex_math_double_backslash` 未注册；美元公式插件不识别这种定界符 |
| 55 | `100m^2` 无闭合上标 | 未实现 | 已有 `superscript` 只支持成对符号；缺 `short_subsuperscripts` |
| 56 | `x~z` 无闭合下标 | 未实现 | 同上 |
| 57 | 元数据变量 `[%foo]` | 未实现替换 | 开头 `foo: foo-test` 仅保留为元数据源码块，正文变量不求值 |
| 58 | 行内／围栏 raw format | 未实现原始格式语义 | `{=html}` 是尾随文字，`{=latex}` 是普通 code params；缺 `raw_attribute`，不会按指定输出格式注入原文 |
| 59 | 智能标点 | 已有规则，MMD 默认关 | 可开 `smart`；目前复用 markdown-it，细节不是完整 MMD 或 Pandoc typography |
| 60 | `{{TOC}}` | 未实现此写法 | 普通文字；不能用现有目录能力替代语法实现的验收 |
| 61 | `{{TOC:2}}`／范围 | 未实现 | 未解析目录指令及层级参数 |
| 62 | 分组表头、跨列、分区、题注表格 | 部分基础表格，不支持该复合样例 | 只识别中间普通管道表格；分组行、后半段和题注成为文字，缺跨列／分区／Caption 语义与 writer |

## 为什么没有：四种不同情况

1. **开发范围未完成。** 属性、引用、简写上下标、HTML 中的 Markdown 等需要对应 reader/writer；目前没有写完。不是框架做不到，也不能用已有开关数量代替兼容性完成度。
2. **语义存在，但指定写法没有接入。** 已有目录和 callout 块，不代表支持 `[toc]`、`{{TOC}}`、`[!NOTE]`；同样，PHP Extra 缩写与 MMD 缩写不能共用一个表面相似的规则。
3. **需要解析之外的处理。** 图表需要 renderer；文件展开需要文件读取与依赖刷新；引文需要文献解析和排版；属性需要语义保存、编辑、写回及实际显示。仅转成 AST 或注册扩展名不会自动获得这些能力。
4. **确有默认值／实现缺陷。** Emoji、smart、反斜杠换行等有规则但特定预设默认关；连续列表被合并则是错误，不能解释成正常方言差异。iframe 是显示层明确过滤的元素，不能把“保留 HTML”宣传成“支持任意嵌入”。

另一个问题是：现有“尚未实现”面板只与 Pandoc 快照比较，因此 **不是完整生态缺口清单**。它不会自动列出 Typora／Obsidian／MultiMarkdown 产品的所有附加功能。后续应建立独立的语法能力清单，分别记录解析、显示、编辑、写回、默认值和原文保留状态，再将预设映射到能力。

## 后续实现应怎样验收

优先补已有语义可承接的写法（alerts、目录、高亮、注释、简写上下标），随后补锚点／属性、HTML 混合解析；图表、跨文件展开、引文、复杂表格分别实现相应模块。每项都需要用户样例的正反例、扩展开关、编辑后重开和显示验证。

未知语法也需要避免被其他插件拆开误读，CriticMarkup 替换样例就是当前缺口。**原文保留、局部识别、完整功能必须分开报告**。本次没有把上述缺失功能批量实现；完成的是逐项核对，以及连续列表缺陷修复。

## 外部规范核对来源

- Typora 的目录、数学、HTML 等是产品附加语法，详见 [Typora Markdown Reference](https://support.typora.io/Markdown-Reference/)；图表还需要相应渲染能力，见 [Typora diagrams](https://support.typora.io/Draw-Diagrams-With-Markdown/)。
- Obsidian 的注释和 callout 是具体语法，见 [基本语法](https://obsidian.md/help/syntax)与 [Callouts](https://obsidian.md/help/callouts)。
- PHP Extra 的属性、HTML 混合解析、定义列表与缩写见 [官方说明](https://michelf.ca/projects/php-markdown/extra/)。
- MMD 引文、CriticMarkup、缩写等见 [MultiMarkdown 语法说明](https://fletcher.github.io/MultiMarkdown-4/syntax)；跨文件展开见 [File Transclusion](https://fletcher.github.io/MultiMarkdown-6/syntax/transclusion.html)。这些为版本化语法资料，不代表 Notdown 已通过其兼容测试。
- Pandoc reader 与扩展见 [Pandoc 手册](https://pandoc.org/MANUAL.html#pandocs-markdown)。Notdown 采用其预设快照，具体执行的是自有原生 codec，不能由预设名字推导完整兼容性。
