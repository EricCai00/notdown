# 十一种原生方言：已实现规则与兼容边界

[English](NATIVE-DIALECTS.md) · **简体中文**

2026-09-25 补充：当前注册表有 14 种方言（含后来新增的 Notdown、R Markdown、Quarto）。Quarto 复用 Pandoc 基础规则，增加四种主语言的可执行块及行内表达式；Notdown 同时包含这些语法。下面保留早期十一种预设的历史比较，当前执行能力以 [Quarto](../features/QUARTO.zh-CN.md) 和 [R Markdown](../features/R-MARKDOWN.zh-CN.md) 为准。

2026-09-22 方言边界修正：各方言默认值按上游规范独立定义，仅 Pandoc 自身预设沿用 Pandoc 3.11 快照。九种本地对象改为默认关闭的独立插件，在页面语法面板开启；旧正文不迁移、不删除。已实现默认规则隔离、显式启用、解析／命令／目录统一门控；尚未宣称完整上游一致性或跨端同步。详见[方言核对与插件说明](DIALECT-CONFORMANCE.zh-CN.md)；下文历史说明如与之冲突，以此修订为准。

> 2026-09-22 更新：当前 103 个 Markdown 扩展已接入本地路径，12 个 Outside Markdown scope 项不启用；规范键为 notion_*，兼容 notdown_*。新增表格、行内及服务能力以 [对象 Roadmap](../architecture/CONTENT-OBJECT-ROADMAP.zh-CN.md) 和 [具体边界](LOCAL-OBJECTS.zh-CN.md) 为准。下文保留预设接入时的方言比较。

2026-09-15。主编辑器现在可以选择全部十一个预设；此前禁用的六个预设已接入实际 reader/writer。它们共用 ProseMirror 编辑文档、CodeMirror 源码、三视图、拖动、Slash 和保存流程，日常编辑不调用 Pandoc。

这里实现的是 **各方言的核心语法适配**，没有完整复刻 Pandoc 的所有 reader 行为。默认扩展与可用名称取自项目内 [Pandoc 3.11 快照](../data/pandoc-3.11-extensions.json)，实际执行范围由原生注册表决定。完整 Pandoc 对照继续使用 Markdown Lab。

本轮新增的 Typora、Obsidian、产品扩展与 62 条验收边界见 [PRODUCT-SYNTAX.md](PRODUCT-SYNTAX.zh-CN.md)。PHP Extra 和 MMD 的同名 Pandoc 开关仍取原快照，产品附加项另设默认值。

## 方言差异

以下为默认配置下的代表性行为；显式扩展开关可以改变规则。

| 预设 | 已接入的主要差异 | 当前边界举例 |
| --- | --- | --- |
| Typora | 公式、提示块、目录、图表、HTML 嵌入、高亮、宽松列表 | 图表源码编辑；非完整 Typora 复刻 |
| Obsidian | 注释、双链、相对 Markdown 页面链接、提示块、嵌入 | 不包含插件 API 或完整 vault 行为 |
| Notion Markdown | 自有换行与标签、分栏、提示、折叠、提及、表格 | 独立 codec；产品附加规则不套用到 Notion |
| CommonMark | CommonMark 基础块、两种代码围栏、HTML | 尚未跑完整 CommonMark 规范测试集 |
| GFM | 表格、删除线、任务、裸链接、脚注、Emoji、美元公式、YAML 开头块 | 按 Pandoc 快照取默认值，不等于 GitHub 网站全部行为；已接入 alerts |
| Pandoc Markdown (`markdown`) | 标题和引用打断段落前要求空行；两种围栏；定义列表、脚注、行块、Div、智能标点、上下标 | 仍缺 Pandoc 简单／多行／网格表格和 citeproc |
| CommonMark X | CommonMark 基础规则加定义列表、脚注、Div、智能标点、上下标、Emoji | 支持已注册属性；fancy lists 与完整属性组合待补齐 |
| Markdown Strict | `#标题` 可成为标题；围栏默认关闭；列表不能直接打断段落；有限反斜杠转义；词内下划线可强调 | 不是完整原始 Markdown.pl 复刻；复杂定界符和引用边界仍需补齐 |
| PHP Markdown Extra | 波浪线围栏默认开、反引号围栏默认关；定义列表、脚注、缩写说明 | 已接入 markdown 属性及标题／链接属性；围栏属性需开启 |
| MultiMarkdown | 反引号围栏默认开、波浪线围栏默认关；定义列表、脚注、上下标、开头键值标题 | 已接入简写上下标、标识、链接属性、双反斜杠公式；BibTeX 非完整 citeproc |
| 旧 GitHub Markdown | 两种围栏、表格、删除线、任务、裸链接、Emoji；列表可紧接段落 | Pandoc 已弃用此 reader；已接入 alerts 与自动标识，新的 GitHub 文档推荐 GFM |

例如 `text` 下一行直接写 `# Heading`：Pandoc Markdown 默认仍在同一段落，关闭 `blank_before_header` 后成为段落加标题。Strict 中原样输入反引号围栏默认不会形成代码块；在页面中新建代码块时，writer 会使用该方言支持的缩进写法。

## 本次新增 19 个开关

注册表共有 70 项，含 12 项 Notdown 自有块扩展。面板仅为当前方言接受且原生已接入的名称提供复选框。

| 规则 | 实际作用 |
| --- | --- |
| `blank_before_header` | 控制 ATX 标题能否直接打断前一段落；不阻止连续标题 |
| `blank_before_blockquote` | 控制引用能否直接打断前一段落 |
| `space_in_atx_header` | 控制 `#` 后是否必须留空格 |
| `lists_without_preceding_blankline` | 控制列表能否紧接段落；保留旧 GitHub 的定义标记断段行为 |
| `startnum` | 控制是否采用有序列表源码中的起始编号 |
| `backtick_code_blocks` / `fenced_code_blocks` | 分别控制 `markdown*` 家族的反引号／波浪线代码围栏；CommonMark 家族的围栏属于基础规则 |
| `escaped_line_breaks` | 控制反斜杠加换行是否为硬换行 |
| `all_symbols_escapable` | 控制反斜杠可转义的符号集合 |
| `intraword_underscores` | 控制词内下划线是否保持字面含义；覆盖常见单／双下划线形式 |
| `ignore_line_breaks` | 软换行不再插入空格；硬换行仍保留 |
| `smart` | 智能引号、破折号、省略号等，基于 markdown-it typography；细节不保证逐项等同 Pandoc |
| `subscript` / `superscript` | `H~2~O`、`x^2^`，真实行内标记，可随文本编辑并写回 |
| `abbreviations` | `*[HTML]: Hypertext Markup Language` 和正文 HTML，显示缩写说明并保留定义原文 |
| `emoji` | `:smile:` 等名称显示 Unicode Emoji；不启用 `:)` 快捷替换，不涉及 Notion 自定义资源 |
| `yaml_metadata_block` | 识别正文开头以 `---` 包围、以 `---` 或 `...` 结束的常见 YAML 映射 |
| `pandoc_title_block` | 识别正文开头最多三行 `% 标题`／`% 作者`／`% 日期` |
| `mmd_title_block` | 识别正文开头的 `Title: ...` 等键值行与缩进续行 |

后三项识别并保留原文；启用 `metadata_values` 时显示元数据预览并可编辑源码，未启用时显示原文块，不变成普通段落，也不会修改知识库页面的 YAML 属性。不提供完整 Pandoc Meta 语义、多行标题或任意位置元数据解析。

`markdown*` 五个预设使用 Markdown 家族基础规则适配，CommonMark、GFM、CommonMark X 使用 CommonMark 家族规则。开关接受范围同快照，但本地额外允许后三种 reader 使用 `line_blocks`；这项自有组合不能直接传给 Pandoc 同名 reader。

## 保存、配置和未实现项

- 切换方言、开关扩展只重新解释同一源码，不自动转换正文。配置与正文通过现有 `baseRevision` 一起保存，未知字段保留。
- 未改顶层块及其间隔保留原文；修改块按当前方言写回，块间保留空行。嵌套容器的内部修改可能规范化整个容器。
- 新增／修改代码块优先写为当前可用围栏；Strict 默认写缩进代码，PHP Extra 默认写波浪线围栏。缩进代码无法表达语言属性。原有未修改代码保持原文。
- 页内编辑可能把 Emoji 名称写成实际字符，智能标点写成显示字符；不承诺保留修改块内部每个原始定界符。缩写定义仍由原文间隔保存，不提供定义编辑表单。
- 未实现的扩展在面板下方逐项列出，并显示配置状态；即使配置为 `true`，也明确标记“未执行”。未知和待实现的覆盖值会保留，恢复默认不会删除它们。
- 快照中五个 `markdown*` reader 各有 30 个尚未原生注册的名称，三个 CommonMark reader 各有 10 个。这包含默认关闭的项目，数量不等于缺失块种类。完整来源、含没有任何 Markdown reader 接受的扩展见 [手册扩展矩阵](PANDOC-EXTENSIONS.zh-CN.md)。

尚未实现的主要语法：Pandoc 简单／多行／网格表格、完整属性组合、fancy/example lists、inline notes、原始 TeX、完整 citations/citeproc，以及若干引用与方言细节。图片题注、raw_attribute、markdown_attribute、MMD 引文和复杂表格的当前子集见产品支持矩阵。编辑文档仍非完整 Pandoc JSON AST；源码高亮通用，解析仍在主线程。

## 验证依据

- `tests/unit/native-dialects.test.ts` 覆盖默认值、真实开关、解析区别、代码块与特殊文字写回、上下标／缩写／元数据保留、Div 两族差异。
- 同一测试包含本机 Pandoc 的 6 × 10 组块结构对照；没有安装 Pandoc 时只跳过该对照项，主程序不依赖它。对照验证选定样例的块结构，不代表全语法一致性。关闭 Div 时，Notdown 的原文回退块按 Pandoc 的文字块类别投影比较。
- `tests/e2e/native-dialects.spec.ts` 使用临时知识库和独立 Chrome，逐个验证六个新增预设的扩展、重置、页面编辑、原文空行、保存重载和切换回原方言；拦截 Pandoc API 并断言无调用。
- 完整执行结果见 [VERIFICATION.md](../verification/VERIFICATION.zh-CN.md)。
