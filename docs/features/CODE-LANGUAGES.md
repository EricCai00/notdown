# 代码语言与高亮

语言菜单分为 **Notion（87 项）** 和 **Custom（17 项）**，两个分组分别按显示名排列。搜索按显示名、围栏 ID、别名统一匹配，保留分组标题并隐藏无匹配的分组。键盘方向键和 Enter 可跨分组选择。Mermaid 归入 Diagram，不出现在代码语言菜单。Makefile 已属于 Notion 分组，使用 Prism Makefile 高亮，不在 Custom 重复。

菜单与分词选择共用 [语言注册表](../../src/editor/code-languages.ts)。旧围栏不会因打开菜单、搜索或更新显示名而迁移；只有用户明确选择语言时才修改该块的标签。未知标签保留在 Current 分组。

Notion 导入时仅对语言注册表无法识别的非空围栏标签核对同批 Block API，以完整代码文本唯一匹配后恢复语言，修复已确认的 `shell` → `shen` 导出差异。已知语言、别名、空标签及 Mermaid 不触发核对，也不因其他未知标签触发的扫描而被改写，详见[Notion 导入](NOTION-IMPORT.md#内容支持与剩余边界)。普通 Markdown 中的 `shen` 仍保留为未知标签，不全局映射到 Shell。

代码语言和图注控件跟随编辑器的可编辑状态，包括 Callout、引用内的嵌套代码块。Source/Split 编辑同步到 Page 视图后恢复可用；只读预览中保持禁用。

## Custom 来源与名称

| 显示名 | 新建围栏 ID | 高亮来源 | 常用搜索／读取别名 |
| --- | --- | --- | --- |
| ActionScript | `actionscript` | Prism ActionScript | `as`、`as3` |
| AWK | `awk` | Prism AWK | `gawk` |
| Batch (CMD) | `batch` | Prism Batch，Windows 命令脚本 | `bat`、`cmd`、`dos`、`windows batch` |
| Django Template Language | `django` | Prism Django/Jinja2，含模板分词钩子 | `dtl`、`django-html` |
| Easy Programming Language | `epl` | 易语言的本地基础词法规则 | `易语言`、`eyuyan`、`e-language` |
| Excel Formula | `excel-formula` | Prism Excel Formula | `excel`、`xlsx`、`xls`、`Excel 公式` |
| GNU Octave | `octave` | 本地扩展 Prism MATLAB 规则 | `octave` |
| Jinja | `jinja` | Prism Django/Jinja2，含模板分词钩子 | `jinja2`、`j2`、`jinja-html` |
| Lean | `lean` | Shiki 的 Lean 4 TextMate 语法 | `lean4`、`lean 4` |
| Regular Expression | `regex` | Prism Regex | `regexp`、`regular-expression`、`正则` |
| sed | `sed` | language-sed TextMate 语法，经 Shiki 着色 | `gsed`、`gnu sed` |
| SPARQL | `sparql` | Prism SPARQL，复用 Turtle 依赖 | `rq` |
| SVG | `svg` | Prism Markup/XML；独立菜单项 | `scalable vector graphics` |
| Turtle | `turtle` | Prism Turtle | `ttl`、`rdf turtle` |
| Vimscript | `vimscript` | Prism Vim | `vim`、`viml`、`vim script` |
| Wenyan | `wenyan` | Shiki 的文言 TextMate 语法 | `wenyan-lang`、`wenyan lang`、`文言`、`文言文` |
| Wikitext | `wikitext` | Prism Wiki markup，MediaWiki 风格 | `wiki`、`mediawiki`、`wiki markup` |

来源：

- [Prism 语言组件](https://prismjs.com/#supported-languages)。Jinja 与 Django 在菜单中是独立选项，目前共用上游的混合模板语法；不把二者的语法视为完全相同。[Jinja 文档](https://jinja.palletsprojects.com/en/stable/)、[Django Template Language 文档](https://docs.djangoproject.com/en/stable/ref/templates/language/)。
- [Shiki 语言包](https://shiki.style/languages)提供 Lean 和 Wenyan 的现成 TextMate 语法；使用 [JavaScript 引擎同步 API](https://shiki.style/guide/sync-usage)，按需初始化对应语法，无运行时 CDN。[Lean 官方编辑器](https://github.com/leanprover/vscode-lean4)、[文言官方高亮项目](https://github.com/wenyan-lang/highlight)。文言官方项目也提供独立 Prism 组件。
- sed 复用 [language-sed](https://github.com/Alhadis/language-sed)，固定上游提交、转换为 JSON，并保留 ISC 许可证；详见[语法来源与转换](../../src/editor/grammars/README.md)。
- GNU Octave 的本地规则按官方[关键词](https://docs.octave.org/interpreter/Keywords.html)、[块注释](https://docs.octave.org/interpreter/Block-Comments.html)和[字符串](https://docs.octave.org/interpreter/Strings.html)说明补充 `#`／`%` 注释、成对独立行块注释、单双引号字符串、转置符、`endif`／`endfunction` 等关键字。属于词法高亮，不是完整 Octave 解析器。

## 脚本、模式与公式

菜单并不限于通用编程语言：[sed](https://www.gnu.org/software/sed/manual/html_node/sed-Programs.html) 是文本处理脚本语言；Regular Expression 是描述匹配规则的领域专用语言；Excel Formula 是电子表格公式语言，[LAMBDA](https://www.microsoft.com/en-us/research/blog/lambda-the-ultimatae-excel-worksheet-function/) 还支持自定义函数。三者均提供源码着色，不执行脚本、匹配或计算。

EPL 在这里指易语言（Easy Programming Language），不指同缩写的事件处理语言。规则支持复制出的文本源码中的点指令、单引号注释、直／弯双引号字符串、函数调用、常量、数字和运算符；不读取二进制 `.e` 工程、不解析支持库签名，也不做语义校验。Vimscript 采用现有 Prism Vim 规则，不承诺完整覆盖 Vim9。Regex 各引擎的扩展语法和 Excel 本地化函数名不保证完整覆盖。

## Wolfram Language

语言显示名使用 **Wolfram Language**；Mathematica 是使用该语言的产品名称，参见 [Wolfram 官方语言介绍](https://www.wolfram.com/language/)。该项仍属于 Notion 对应分组，移到 W 的字母位置，不在 Custom 中重复添加。现有 `mathematica` 围栏 ID 保持兼容，`wolfram`、`wolfram-language`、`wl`、`nb` 均可识别和搜索。

## 边界与正文保护

- 104 个选项中，ASCII Art 和 Plain Text 有意保持原色，其余 102 项连接到语法；不承诺每种语言所有版本、扩展、方言与语义的完整识别。
- Lean 以 Lean 4 为目标，不运行证明检查或语言服务器。Notion Formula 仅本地词法着色，不执行公式。
- 两个引擎输出原文偏移，ProseMirror Decoration 负责着色。模板钩子恢复占位内容后验证原文；SVG、模板和代码不会作为可执行 HTML 注入。
- 高亮异常、未知语言、超过 32,000 个 UTF-16 代码单元的块均保留可编辑纯文本。颜色采用 Notdown 本地色板，不宣称复刻 Notion 或各语言 IDE。
- Mermaid 原有围栏和 Diagram 路径保留；关闭 diagrams 扩展后原文仍可恢复，不重新添加为代码语言候选项。
