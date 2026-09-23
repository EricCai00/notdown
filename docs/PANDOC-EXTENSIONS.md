# Pandoc 扩展与 Markdown 方言完整对照

核对日期：2026-09-15。运行基准：本机 **Pandoc 3.11**。手册来源：[Pandoc User’s Guide](https://pandoc.org/MANUAL.html)。这是该日期的能力快照；升级 Pandoc 后需要重新核对。

## 1. 范围与结论

这里把用户所说的“插件”分成两层：

- **Extension（扩展）**：`markdown+footnotes-blank_before_header` 这样的格式开关。本文逐项收录手册正文提到的 **89 个不同扩展名**。
- **Filter / 自定义 reader、writer**：操作内部文档结构或增加输入、输出格式的程序。它们不能用 `+extension` 开关代替，见第 7 节。

89 项中，**77 项至少被一种 Markdown 方言接受，12 项在八种 Markdown 方言中都不可用**。77 项中又有 **15 项在所有方言的预设中都关闭**，但可以在支持它们的方言中手动开启。“默认不用”与“不能使用”是不同的集合。

这里的八种方言是 Pandoc 3.11 提供的全部 Markdown reader。`notion-markdown` 是 Notdown 自有方言，不属于 Pandoc 的格式注册表，其关系见第 6 节。

### 怎么读表

| 符号 | 含义 |
| --- | --- |
| **开** | 该方言接受这个扩展开关，且 Pandoc 默认开启 |
| **关** | 该方言接受这个扩展开关，但 Pandoc 默认关闭；可用 `+名称` 开启 |
| **—** | 该方言不接受这个名字的扩展开关；不能直接传入 `+名称` 或 `-名称` |

**“—”不等于没有这种语法。** 例如 CommonMark 本来就有反引号代码围栏，没有 `backtick_code_blocks` 开关；它的 `attributes` 又覆盖了另一族中多个属性开关的用途。下表描述的是 Pandoc 接受的开关及默认值，不是逐字节语法等价保证，也不是所有目标格式都能显示的保证。

“开/关”来自 `pandoc --list-extensions=<variant>`，是 Pandoc 原始预设，**不是当前 Lab 窗口的用户设置**。Lab 为同步滚动自动启用 CommonMark 系列的 `sourcepos`；因此表中的默认关闭与 Lab 的实际启用并不矛盾。

## 2. 方言、默认值与差异原因

| 表中简称 | variant ID | 解析器族 | 可用开关 | 默认开 | 预设目的 / 为什么 |
| --- | --- | --- | --- | --- | --- |
| P | `markdown` | M | 74 | 47 | Pandoc 自有 Markdown 预设；默认启用较多表格、脚注、公式、元信息等扩展。 |
| S | `markdown_strict` | M | 74 | 3 | 兼容原始 Markdown；大部分 Pandoc 额外语法默认关闭。 |
| E | `markdown_phpextra` | M | 74 | 12 | 采用 PHP Markdown Extra 的对应预设，如定义列表、脚注、管道表格等。 |
| MMD | `markdown_mmd` | M | 74 | 22 | 采用 MultiMarkdown 对应的标题块、标识符、链接属性等预设。 |
| 旧 GH | `markdown_github` | M | 74 | 17 | 历史 GitHub Markdown 预设，Pandoc 已弃用该格式；仍列出其真实能力供兼容旧配置。 |
| C | `commonmark` | C | 30 | 1 | CommonMark 基础规则；围栏代码等基础语法不另算扩展开关。 |
| GFM | `gfm` | C | 30 | 12 | 基于 CommonMark 的 GitHub Flavored Markdown 预设，加入任务、表格等规则。 |
| CX | `commonmark_x` | C | 30 | 20 | CommonMark 加多项 Pandoc 风格扩展；不是五种 markdown* reader 的别名。 |

### 为什么能开关的集合会相同，默认值却不同

Pandoc 的 [reader 注册表](https://github.com/jgm/pandoc/blob/3.11/src/Text/Pandoc/Readers.hs) 将五种 `markdown*` 方言交给同一个 `readMarkdown`，将 `commonmark`、`gfm`、`commonmark_x` 交给 `readCommonMark`。[扩展注册与默认预设源码](https://github.com/jgm/pandoc/blob/3.11/src/Text/Pandoc/Extensions.hs) 分别定义它们能接受的开关集合及默认值。

因此，**可用范围主要由解析器的实现决定，默认开关主要由方言的兼容预设决定**。`markdown_strict+footnotes` 可以运行，是因为它与 Pandoc Markdown 共用解析器；增加脚注后，文档就不能再被当作只用了原始 Markdown 语法。PHP Extra、MultiMarkdown、GFM 等名称也表示 Pandoc 的对应实现和预设，不能据此保证与其他软件所有版本完全一致。

后文“依据”列使用以下代码。它们说明当前实现中的差异，不推测作者当年选择默认值的个人动机。

| 依据 | 为什么在这些方言中可用 |
| --- | --- |
| **M** | 注册在 `readMarkdown` 一族的扩展集合中；五种 `markdown*` 都接受，CommonMark 一族不接受这个同名开关 |
| **C** | 注册在 `readCommonMark` 一族；三个 CommonMark reader 接受，五种 `markdown*` 不接受 |
| **MC** | 两族都实现并注册了该名字；具体解析边界仍可能不同 |
| **U** | 通用扩展。`east_asian_line_breaks` 被加入各格式的可用集合，并有解析后处理逻辑 |

两族交集是 27 项，M 族独有 47 项，C 族独有 3 项。C 的具体组合见 [CommonMark reader 源码](https://github.com/jgm/pandoc/blob/3.11/src/Text/Pandoc/Readers/CommonMark.hs)。

## 3. Markdown 可用扩展：77 项完整表

列顺序固定：**P = Pandoc、S = Strict、E = PHP Extra、MMD = MultiMarkdown、旧 GH = 旧 GitHub、C = CommonMark、GFM、CX = CommonMark X**。扩展名链接到手册对应小节；“功能与注意点”是结合源码与本项目行为的中文说明。

### 3.1 文字与换行

| 扩展 | P | S | E | MMD | 旧 GH | C | GFM | CX | 依据 | 功能与注意点 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [smart](https://pandoc.org/MANUAL.html#extension-smart) | 开 | 关 | 关 | 关 | 关 | 关 | 关 | 开 | MC | 智能引号、破折号和省略号。 读入时转换标点；写出 Markdown 时可能反向转为普通字符。 |
| [all_symbols_escapable](https://pandoc.org/MANUAL.html#extension-all_symbols_escapable) | 开 | 关 | 关 | 开 | 开 | — | — | — | M | 允许反斜杠转义更多非字母数字字符。 C 的转义集合由 CommonMark 基础规则决定，不接受该开关。 |
| [angle_brackets_escapable](https://pandoc.org/MANUAL.html#extension-angle_brackets_escapable) | 关 | 关 | 关 | 关 | 关 | — | — | — | M | 允许转义尖括号。 是兼容性细分开关；C 的尖括号转义属于基础规则。 |
| [escaped_line_breaks](https://pandoc.org/MANUAL.html#extension-escaped_line_breaks) | 开 | 关 | 关 | 关 | 关 | — | — | — | M | 行末反斜杠表示硬换行。 C 已内置此语法，不能用该名字关闭。 |
| [hard_line_breaks](https://pandoc.org/MANUAL.html#extension-hard_line_breaks) | 关 | 关 | 关 | 关 | 关 | 关 | 关 | 关 | MC | 段落中的每个换行都显示为硬换行。 是可选阅读方式；八种预设均不默认启用。 |
| [ignore_line_breaks](https://pandoc.org/MANUAL.html#extension-ignore_line_breaks) | 关 | 关 | 关 | 关 | 关 | — | — | — | M | 忽略段落内源码换行，不插入空格。 M 提供这一开关；与硬换行表达的目的不同。 |
| [east_asian_line_breaks](https://pandoc.org/MANUAL.html#extension-east_asian_line_breaks) | 关 | 关 | 关 | 关 | 关 | 关 | 关 | 关 | U | 按东亚文字规则处理折行，避免汉字间多出空格。 源码将它列为通用扩展，在解析后执行过滤步骤，不只属于某个 Markdown reader。 |
| [intraword_underscores](https://pandoc.org/MANUAL.html#extension-intraword_underscores) | 开 | 关 | 开 | 开 | 开 | — | — | — | M | 单词内部的下划线保持字面含义。 C 也有单词内下划线规则，但不是通过此开关实现。 |
| [old_dashes](https://pandoc.org/MANUAL.html#extension-old_dashes) | 关 | 关 | 关 | 关 | 关 | — | — | — | M | 恢复旧版 Pandoc 的短横线解释规则。 仅在 smart 启用时有意义；不是通常要默认开启的现代语法。 |
| [gutenberg](https://pandoc.org/MANUAL.html#extension-gutenberg) | 关 | 关 | 关 | 关 | 关 | — | — | — | M | 纯文本输出采用 Project Gutenberg 的强调和间距约定。 虽被 M 接受，实际用途是 plain writer；加在 Lab 的输入方言上不会改变 HTML 预览。 |

### 3.2 标题与定位

| 扩展 | P | S | E | MMD | 旧 GH | C | GFM | CX | 依据 | 功能与注意点 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [blank_before_header](https://pandoc.org/MANUAL.html#extension-blank_before_header) | 开 | 关 | 关 | 关 | 关 | — | — | — | M | 要求标题前有空行，文档开头除外。 M 的兼容预设决定默认开关；C 按自身段落中断规则识别标题。 |
| [space_in_atx_header](https://pandoc.org/MANUAL.html#extension-space_in_atx_header) | 开 | 关 | 关 | 关 | 开 | — | — | — | M | 要求 ATX 标题的井号与文字之间有空格。 C 基础语法已要求相应分隔，不提供同名可选开关。 |
| [auto_identifiers](https://pandoc.org/MANUAL.html#extension-auto_identifiers) | 开 | 关 | 关 | 开 | 开 | — | — | — | M | 自动为标题生成标识符。 C 的可选标题 ID 由 gfm_auto_identifiers 机制控制，不接受此同名旗标。 |
| [ascii_identifiers](https://pandoc.org/MANUAL.html#extension-ascii_identifiers) | 关 | 关 | 关 | 关 | 关 | 关 | 关 | 关 | MC | 自动标题 ID 只使用 ASCII 字符。 需同时有 ID 生成机制：M 通常配 auto_identifiers，C 配 gfm_auto_identifiers。 |
| [gfm_auto_identifiers](https://pandoc.org/MANUAL.html#extension-gfm_auto_identifiers) | 关 | 关 | 关 | 关 | 开 | 关 | 开 | 开 | MC | 采用 GitHub 风格的标题 ID 算法。 M 中用于改变自动 ID 算法；C 中也是启用自动标题 ID 的入口。 |
| [header_attributes](https://pandoc.org/MANUAL.html#extension-header_attributes) | 开 | 关 | 开 | 关 | 关 | — | — | — | M | 标题末尾附加 ID、class 等属性。 C 用 attributes 扩展覆盖这一用途；该名字本身不能传给 C。 |
| [mmd_header_identifiers](https://pandoc.org/MANUAL.html#extension-mmd_header_identifiers) | 关 | 关 | 关 | 开 | 关 | — | — | — | M | 使用 MultiMarkdown 风格的方括号标题 ID。 MMD 预设默认开启；其他 M 预设可选择采用同一兼容语法。 |
| [implicit_header_references](https://pandoc.org/MANUAL.html#extension-implicit_header_references) | 开 | 关 | 关 | 开 | 关 | 关 | 关 | 开 | MC | 把标题文字作为隐式引用链接目标。 解析器需建立标题引用表；开启后仍以显式链接定义为优先。 |
| [sourcepos](https://pandoc.org/MANUAL.html#extension-sourcepos) | — | — | — | — | — | 关 | 关 | 关 | C | 在 AST 中携带源码位置属性。 当前原生位置输出由 C reader 提供；M 无此接口。Lab 在 C 中自动启用它。 |

### 3.3 代码与块结构

| 扩展 | P | S | E | MMD | 旧 GH | C | GFM | CX | 依据 | 功能与注意点 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [blank_before_blockquote](https://pandoc.org/MANUAL.html#extension-blank_before_blockquote) | 开 | 关 | 关 | 关 | 关 | — | — | — | M | 要求引用块前有空行。 避免正文中的大于号误开引用；C 使用自己的块中断规则。 |
| [fenced_code_blocks](https://pandoc.org/MANUAL.html#extension-fenced_code_blocks) | 开 | 关 | 开 | 关 | 开 | — | — | — | M | 启用波浪线围栏代码块。 C 已内置波浪线及反引号围栏；列表缺席不表示它不支持代码围栏。 |
| [backtick_code_blocks](https://pandoc.org/MANUAL.html#extension-backtick_code_blocks) | 开 | 关 | 关 | 开 | 开 | — | — | — | M | 启用反引号围栏代码块。 C 已内置且不能通过此扩展关闭，手册明确说明了这一例外。 |
| [fenced_code_attributes](https://pandoc.org/MANUAL.html#extension-fenced_code_attributes) | 开 | 关 | 关 | 关 | 关 | — | — | — | M | 代码围栏可附加 ID、class、行号等属性。 C 由 attributes 提供相应用途；语言高亮还依赖输出格式及语言支持。 |
| [inline_code_attributes](https://pandoc.org/MANUAL.html#extension-inline_code_attributes) | 开 | 关 | 关 | 关 | 关 | — | — | — | M | 行内代码后附加属性。 C 由 attributes 提供相应用途。 |
| [line_blocks](https://pandoc.org/MANUAL.html#extension-line_blocks) | 开 | 关 | 关 | 关 | 关 | — | — | — | M | 逐行保留诗歌、地址等内容的行界和行首空格。 这是独立块语法，C 没有这一可选解析规则。 |
| [literate_haskell](https://pandoc.org/MANUAL.html#extension-literate_haskell) | 关 | 关 | 关 | 关 | 关 | — | — | — | M | 按 Literate Haskell 约定解释代码和文档。 专业输入/输出模式；别名 lhs，不是日常笔记的默认规则。 |
| [fenced_divs](https://pandoc.org/MANUAL.html#extension-fenced_divs) | 开 | 关 | 关 | 关 | 关 | 关 | 关 | 开 | MC | 用冒号围栏及属性构造 Div 容器。 两族都实现了它，但开围栏细节不同；C 不允许属性后再追加冒号。 |
| [bracketed_spans](https://pandoc.org/MANUAL.html#extension-bracketed_spans) | 开 | 关 | 关 | 关 | 关 | 关 | 关 | 开 | MC | 带属性的方括号文字构造 Span。 给行内内容携带结构属性，不等于允许执行任意 HTML。 |
| [attributes](https://pandoc.org/MANUAL.html#extension-attributes) | — | — | — | — | — | 关 | 关 | 开 | C | 为块或行内内容附加通用属性。 C 专用的统一属性机制；M 将相关用途拆成标题、代码、链接等多个开关。 |

### 3.4 列表

| 扩展 | P | S | E | MMD | 旧 GH | C | GFM | CX | 依据 | 功能与注意点 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [fancy_lists](https://pandoc.org/MANUAL.html#extension-fancy_lists) | 开 | 关 | 关 | 关 | 关 | 关 | 关 | 开 | MC | 有序列表接受字母、罗马数字等编号形式。 由各 reader 的扩展列表规则处理；Org 的同名选项只覆盖其中一部分。 |
| [startnum](https://pandoc.org/MANUAL.html#extension-startnum) | 开 | 关 | 关 | 关 | 关 | — | — | — | M | 保留有序列表的起始编号。 C 本身保留有序列表起始值，不需要此独立开关。 |
| [task_lists](https://pandoc.org/MANUAL.html#extension-task_lists) | 开 | 关 | 关 | 关 | 开 | 关 | 开 | 开 | MC | 识别任务项的方括号勾选标记。 解析任务状态；是否可点击修改是编辑器层能力，不由此开关保证。 |
| [definition_lists](https://pandoc.org/MANUAL.html#extension-definition_lists) | 开 | 关 | 开 | 开 | 关 | 关 | 关 | 开 | MC | 识别术语与释义组成的定义列表。 两族有相应规则；默认开启取决于方言预设。 |
| [example_lists](https://pandoc.org/MANUAL.html#extension-example_lists) | 开 | 关 | 关 | 关 | 关 | — | — | — | M | 带标签的例项在全文中连续编号。 需要 M 的例项编号/引用机制，C 无此可选规则。 |
| [lists_without_preceding_blankline](https://pandoc.org/MANUAL.html#extension-lists_without_preceding_blankline) | 关 | 关 | 关 | 关 | 开 | — | — | — | M | 允许没有前置空行的列表。 C 有自己的列表中断条件，尤其涉及有序列表起始值；不能把它当成完全相同的开关。 |
| [four_space_rule](https://pandoc.org/MANUAL.html#extension-four_space_rule) | 关 | 关 | 关 | 关 | 关 | — | — | — | M | 恢复旧版列表续段必须缩进四空格的规则。 兼容 Pandoc 2.0 及更早行为；八种预设均不默认启用。 |

### 3.5 表格

| 扩展 | P | S | E | MMD | 旧 GH | C | GFM | CX | 依据 | 功能与注意点 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [table_captions](https://pandoc.org/MANUAL.html#extension-table_captions) | 开 | 关 | 关 | 关 | 关 | — | — | — | M | 识别表格前后的题注。 题注属于独立表格语义；C 管道表格不因此获得同名开关。 |
| [simple_tables](https://pandoc.org/MANUAL.html#extension-simple_tables) | 开 | 关 | 关 | 关 | 关 | — | — | — | M | 用对齐文字和横线构造简单表格。 依赖列宽和横线的 M 表格解析器。 |
| [multiline_tables](https://pandoc.org/MANUAL.html#extension-multiline_tables) | 开 | 关 | 关 | 关 | 关 | — | — | — | M | 允许表头及单元格内容跨多行的表格。 是独立的 M 表格语法，不等于开启管道表格。 |
| [grid_tables](https://pandoc.org/MANUAL.html#extension-grid_tables) | 开 | 关 | 关 | 关 | 关 | — | — | — | M | 用字符边框表达网格表格。 M 提供对应解析规则；C 当前不提供此开关。 |
| [pipe_tables](https://pandoc.org/MANUAL.html#extension-pipe_tables) | 开 | 关 | 开 | 开 | 开 | 关 | 开 | 开 | MC | 竖线分隔的管道表格。 两族均实现；开启并不代表任意合并单元格或嵌套块都可表达。 |
| [table_attributes](https://pandoc.org/MANUAL.html#extension-table_attributes) | 开 | 关 | 关 | 关 | 关 | — | — | — | M | 在表格题注后附加表格属性。 属于 M 的表格/题注语法；不要直接等同于 C 通用 attributes 的语法。 |

### 3.6 元信息

| 扩展 | P | S | E | MMD | 旧 GH | C | GFM | CX | 依据 | 功能与注意点 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [pandoc_title_block](https://pandoc.org/MANUAL.html#extension-pandoc_title_block) | 开 | 关 | 关 | 关 | 关 | — | — | — | M | 识别百分号开头的标题、作者、日期元信息。 Pandoc 自有标题块预设；Lab 当前只显示正文，不输出元信息标题页。 |
| [yaml_metadata_block](https://pandoc.org/MANUAL.html#extension-yaml_metadata_block) | 开 | 关 | 关 | 关 | 关 | 关 | 开 | 开 | MC | 识别 YAML 元信息块。 两族可将其读入 AST meta；Lab 当前在输出 HTML 前清空 meta，不提供完整文档模板。 |
| [mmd_title_block](https://pandoc.org/MANUAL.html#extension-mmd_title_block) | 关 | 关 | 关 | 开 | 关 | — | — | — | M | 识别 MultiMarkdown 的键值标题块。 MMD 默认开启；其他已开启的 Pandoc/YAML 标题语法可能有优先级。 |

### 3.7 行内格式

| 扩展 | P | S | E | MMD | 旧 GH | C | GFM | CX | 依据 | 功能与注意点 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [strikeout](https://pandoc.org/MANUAL.html#extension-strikeout) | 开 | 关 | 关 | 关 | 开 | 关 | 开 | 开 | MC | 双波浪号删除线。 两族都有相应行内解析规则。 |
| [superscript](https://pandoc.org/MANUAL.html#extension-superscript-subscript) | 开 | 关 | 关 | 开 | 关 | 关 | 关 | 开 | MC | 上标语法。 两族可选；具体标记边界按相应 reader 解释。 |
| [subscript](https://pandoc.org/MANUAL.html#extension-superscript-subscript) | 开 | 关 | 关 | 开 | 关 | 关 | 关 | 开 | MC | 下标语法。 两族可选；与短式上下标开关区分。 |
| [short_subsuperscripts](https://pandoc.org/MANUAL.html#extension-short_subsuperscripts) | 关 | 关 | 关 | 开 | 关 | — | — | — | M | MultiMarkdown 式无需闭合符号的短上标/下标。 可独立启用简写，不要求同时打开 superscript/subscript；MMD 预设启用，C 未注册该规则。 |
| [mark](https://pandoc.org/MANUAL.html#extension-mark) | 关 | 关 | 关 | 关 | 关 | — | — | — | M | 双等号包围的高亮文字。 M 的可选语法；最终可见底色仍可能需要 HTML 样式配合。 |
| [emoji](https://pandoc.org/MANUAL.html#extension-emoji) | 关 | 关 | 关 | 关 | 开 | 关 | 开 | 开 | MC | 冒号包围的 emoji 名称转换。 两族通过名称映射识别；不是任意自定义 emoji 资源服务。 |

### 3.8 公式

| 扩展 | P | S | E | MMD | 旧 GH | C | GFM | CX | 依据 | 功能与注意点 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [tex_math_dollars](https://pandoc.org/MANUAL.html#extension-tex_math_dollars) | 开 | 关 | 关 | 开 | 关 | 关 | 开 | 开 | MC | 美元符号包围的行内和独立公式。 负责识别 TeX 公式；显示仍需 KaTeX、MathJax 或目标排版引擎。 |
| [tex_math_gfm](https://pandoc.org/MANUAL.html#extension-tex_math_gfm) | — | — | — | — | — | 关 | 开 | 关 | C | GitHub 特有的反引号公式及 math 围栏形式。 C reader 提供专门处理；不能因为 M 也支持美元公式就认为此开关可用。 |
| [tex_math_single_backslash](https://pandoc.org/MANUAL.html#extension-tex_math_single_backslash) | 关 | 关 | 关 | 关 | 关 | — | — | — | M | 单反斜杠加圆/方括号界定 TeX 公式。 与常规反斜杠转义存在竞争，所有 Markdown 预设默认关闭。 |
| [tex_math_double_backslash](https://pandoc.org/MANUAL.html#extension-tex_math_double_backslash) | 关 | 关 | 关 | 开 | 关 | — | — | — | M | 双反斜杠加圆/方括号界定 TeX 公式。 是另一套边界语法；MMD 默认开启。 |
| [latex_macros](https://pandoc.org/MANUAL.html#extension-latex_macros) | 开 | 关 | 关 | 关 | 关 | — | — | — | M | 识别并应用用于公式的 LaTeX 宏定义。 需要宏处理而非普通代码显示；作用受输出格式影响，不是完整 TeX 执行器。 |

### 3.9 原始内容

| 扩展 | P | S | E | MMD | 旧 GH | C | GFM | CX | 依据 | 功能与注意点 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [raw_html](https://pandoc.org/MANUAL.html#extension-raw_html) | 开 | 开 | 开 | 开 | 开 | 开 | 开 | 开 | MC | 保留或解释输入中的原始 HTML。 被接受的 HTML 是否显示取决于目标 writer；Lab 还会清理脚本和危险属性。 |
| [raw_tex](https://pandoc.org/MANUAL.html#extension-raw_tex) | 开 | 关 | 关 | 关 | 关 | — | — | — | M | 保留公式之外的原始 TeX 片段。 原始 TeX 通常只适合兼容 TeX 的输出；HTML 预览不能显示它并不等于开关无效。 |
| [markdown_in_html_blocks](https://pandoc.org/MANUAL.html#extension-markdown_in_html_blocks) | 开 | 关 | 关 | 关 | 关 | — | — | — | M | 在 HTML 块内部继续解析 Markdown。 C 的原始 HTML 块有不同边界规则；此兼容开关不向 C 开放。 |
| [markdown_attribute](https://pandoc.org/MANUAL.html#extension-markdown_attribute) | 关 | 关 | 开 | 开 | 关 | — | — | — | M | 只在有 markdown 属性的 HTML 容器内解析 Markdown。 配合 HTML 内 Markdown 规则；PHP Extra/MMD 预设采用此约定。 |
| [native_divs](https://pandoc.org/MANUAL.html#extension-native_divs) | 开 | 关 | 关 | 关 | 关 | — | — | — | M | HTML div 读成原生 Div 结构。 M 可借 HTML 结构构造 AST；C 可以用 fenced_divs 表达容器，机制不同。 |
| [native_spans](https://pandoc.org/MANUAL.html#extension-native_spans) | 开 | 关 | 关 | 关 | 关 | — | — | — | M | HTML span 读成原生 Span 结构。 M 可借 HTML 结构构造 AST；C 的 bracketed_spans 是另一条语法路径。 |
| [raw_attribute](https://pandoc.org/MANUAL.html#extension-raw_attribute) | 开 | 关 | 关 | 开 | 关 | 关 | 关 | 开 | MC | 显式指定代码样式内容属于哪种原始输出格式。 生成 RawBlock/RawInline；目标 writer 不匹配时通常不会输出。 |

### 3.10 链接与图片

| 扩展 | P | S | E | MMD | 旧 GH | C | GFM | CX | 依据 | 功能与注意点 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [shortcut_reference_links](https://pandoc.org/MANUAL.html#extension-shortcut_reference_links) | 开 | 开 | 开 | 开 | 开 | — | — | — | M | 只写引用标签即可形成引用式链接。 C 已有简写引用链接基础语法，不接受这个同名开关。 |
| [spaced_reference_links](https://pandoc.org/MANUAL.html#extension-spaced_reference_links) | 关 | 开 | 开 | 开 | 关 | — | — | — | M | 允许引用链接的两组方括号之间有空格。 属于旧式引用语法兼容选项；不能用于改写 C 的链接规则。 |
| [autolink_bare_uris](https://pandoc.org/MANUAL.html#extension-autolink_bare_uris) | 关 | 关 | 关 | 关 | 开 | 关 | 开 | 关 | MC | 裸露的绝对网址自动转成链接。 两族都有可选自动链接规则；与尖括号自动链接的基础语法区分。 |
| [link_attributes](https://pandoc.org/MANUAL.html#extension-link_attributes) | 开 | 关 | 开 | 关 | 关 | — | — | — | M | 链接或图片附加属性。 C 的 attributes 覆盖相应用途；输出效果由目标格式和属性决定。 |
| [mmd_link_attributes](https://pandoc.org/MANUAL.html#extension-mmd_link_attributes) | 关 | 关 | 关 | 开 | 关 | — | — | — | M | MultiMarkdown 引用式链接/图片的键值属性。 与 link_attributes 不是同一种语法；用于兼容 MMD 来源文件。 |
| [implicit_figures](https://pandoc.org/MANUAL.html#extension-implicit_figures) | 开 | 关 | 关 | 开 | 关 | 关 | 关 | 关 | MC | 只有一张图片的段落可识别为图及题注。 开启的是 Figure 语义，不是自动获取页面封面。 |
| [rebase_relative_paths](https://pandoc.org/MANUAL.html#extension-rebase_relative_paths) | 关 | 关 | 关 | 关 | 关 | 关 | 关 | 关 | MC | 以来源文件目录为依据改写相对链接/图片路径。 需要来源文件路径上下文；Lab 通过 stdin 传正文，当前不携带原文件目录。 |
| [wikilinks_title_after_pipe](https://pandoc.org/MANUAL.html#extension-wikilinks_title_after_pipe) | 关 | 关 | 关 | 关 | 关 | 关 | 关 | 关 | MC | 双链竖线右边是显示标题。 两族提供此双链约定；不自动接入 Notdown 页面 ID 解析或页面创建。 |
| [wikilinks_title_before_pipe](https://pandoc.org/MANUAL.html#extension-wikilinks_title_after_pipe) | 关 | 关 | 关 | 关 | 关 | 关 | 关 | 关 | MC | 双链竖线左边是显示标题。 与上一项的标题/目标顺序相反；在手册上一项正文中介绍，而非单独小节。 |

### 3.11 脚注与引文

| 扩展 | P | S | E | MMD | 旧 GH | C | GFM | CX | 依据 | 功能与注意点 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [footnotes](https://pandoc.org/MANUAL.html#extension-footnotes) | 开 | 关 | 开 | 开 | 开 | 关 | 开 | 开 | MC | 识别脚注引用及定义。 两族有脚注规则；可选不代表右侧编辑器已经提供脚注编辑 UI。 |
| [inline_notes](https://pandoc.org/MANUAL.html#extension-inline_notes) | 开 | 关 | 关 | 关 | 关 | — | — | — | M | 直接在正文中写行内脚注。 M 专用的脚注写法；C 的 footnotes 不等于支持这个开关。 |
| [citations](https://pandoc.org/MANUAL.html#extension-citations) | 开 | 关 | 关 | 关 | 关 | — | — | — | M | 把引用键及定位信息读成引文 AST。 识别引用与生成参考文献是两步；后者需 citeproc 和书目资料。C 当前无此扩展开关。 |
| [abbreviations](https://pandoc.org/MANUAL.html#extension-abbreviations) | 关 | 关 | 开 | 关 | 关 | — | — | — | M | 接受 PHP Markdown Extra 的缩写定义行。 重要限制：Pandoc AST 没有缩写节点，开启后定义会被略过，不是完整缩写/悬浮释义支持。 |
| [alerts](https://pandoc.org/MANUAL.html#extension-alerts) | 关 | 关 | 关 | 关 | 开 | 关 | 开 | 开 | MC | 识别 GitHub 风格的提示引用。 把约定的引用块变成提示语义；可见颜色、图标仍由渲染样式决定。 |

## 4. 八种 Markdown 方言都不可用：12 项

以下 12 项对 **P / S / E / MMD / 旧 GH / C / GFM / CX 全部为“—”**。它们服务于其他输入、输出格式；不是 Lab 的 Markdown 扩展列表漏接。这里的读/写方向按手册说明列出，避免把“某格式接受开关”误读成该格式的 reader 和 writer 都实现了它。

| 扩展 | 实际适用格式与方向 | 功能，以及为什么不属于 Markdown 方言 |
| --- | --- | --- |
| [amuse](https://pandoc.org/MANUAL.html#extension-amuse) | 读 `muse`；该格式默认开 | Text::Amuse 对 Emacs Muse 的语法约定，属于 Muse reader，Markdown 不按 Muse 的块规则解析。 |
| [element_citations](https://pandoc.org/MANUAL.html#extension-element_citations) | 写 `jats` / `jats_archiving` / `jats_publishing` / `jats_articleauthoring`；默认关 | 使用 JATS 的结构化引文元素输出书目资料；CSL 样式不控制这种输出。它决定目标 XML 结构，不增加 Markdown 引文语法。 |
| [empty_paragraphs](https://pandoc.org/MANUAL.html#extension-empty_paragraphs) | 手册：读 `docx` / `html`；写 `docx` / `odt` / `opendocument` / `html` / `latex`；默认关 | 保留或输出真正的空段落。这些格式有可表达空段落的结构；Markdown 空白行通常分隔块，不能用此开关变成相同结构。CLI 的别名/相关格式中还接受 `html4`、`html5`、`epub`、`epub2`、`epub3`、`beamer`，不由此推断双向功能。 |
| [native_numbering](https://pandoc.org/MANUAL.html#extension-native_numbering) | 写 `docx` / `odt` / `opendocument`；默认关 | 用办公文档的原生计数域为图、表编号；依赖输出文件格式的字段机制。 |
| [ntb](https://pandoc.org/MANUAL.html#extension-ntb) | 写 `context`；默认关 | 选择 ConTeXt 的 Natural Tables 排版方案，属于目标表格生成策略。 |
| [raw_markdown](https://pandoc.org/MANUAL.html#extension-raw_markdown) | 读 `ipynb`；默认关 | 把笔记本中的 Markdown 单元格原文保留为 RawBlock，跳过通常的 Markdown 解析。它控制笔记本导入，后续输出还须能处理这种原始内容。 |
| [smart_quotes](https://pandoc.org/MANUAL.html#extension-smart_quotes-org) | 读/写 `org`；默认关；`smart` 包含其作用 | 单独控制 Org 智能引号转换；Markdown 使用自己的 `smart` 开关，没有这个 Org 专用细分名称。 |
| [special_strings](https://pandoc.org/MANUAL.html#extension-special_strings-org) | `org` 的文字转换；默认开；`smart` 包含其作用 | 控制 Org 对破折号、省略号等特殊字符串的处理，依据 Org 规则工作。 |
| [styles](https://pandoc.org/MANUAL.html#ext-styles) | 读 `docx`；默认关 | 将 DOCX 样式信息保留为 Div、Span、Table 上的自定义样式属性，供后续转换使用；不是网页主题或 Markdown 高亮样式开关。 |
| [tagging](https://pandoc.org/MANUAL.html#extension--tagging) | 写 `context`；默认关 | 生成用于带结构标签 PDF 的 ConTeXt 标记，仍依赖后续排版引擎；不是 Markdown 标签语法。 |
| [xrefs_name](https://pandoc.org/MANUAL.html#extension-xrefs_name) | 写 `odt` / `opendocument`；默认关 | 用目标文档的交叉引用字段显示名称或题注；需要办公软件更新相关字段。 |
| [xrefs_number](https://pandoc.org/MANUAL.html#extension-xrefs_number) | 写 `odt` / `opendocument`；默认关 | 用交叉引用字段显示编号；依赖编号配置与字段更新。它控制导出字段，不是 Markdown 双链。 |

对 Notdown 的意义：若以后实现 DOCX、ODT、IPYNB、ConTeXt 等导入/导出，应在**对应输入或输出格式的选项**中提供这些功能，不能塞进 `markdown+...` 请求中。

### 同一扩展名在其他格式中的含义

下列小节已按名称合并进 77 项表，不能再次计数：

| 名称与手册小节 | 其他格式的用途 |
| --- | --- |
| [citations（Typst）](https://pandoc.org/MANUAL.html#typst-citations) | 控制 Typst 的原生引文读写；同名不意味着语法与 Markdown 的引用键完全相同。 |
| [citations（Org）](https://pandoc.org/MANUAL.html#org-citations) | 读写 Org 引文语法，而非把 Org 当作 Markdown 解析。 |
| [citations（DOCX）](https://pandoc.org/MANUAL.html#docx-citations) | 将 Zotero、Mendeley、EndNote 插入的引文读成 Pandoc 原生引文；关闭时将排版后的引文当作普通文字。这些工具的 Word 插件不是 Markdown 扩展开关。 |
| [fancy_lists（Org）](https://pandoc.org/MANUAL.html#org-fancy-lists) | Org 支持字母/阿拉伯数字列表标记；不能照搬 Markdown 实现中的罗马数字或自动编号占位符能力。 |

## 5. 所有方言默认都关闭，但可以启用：15 项

这些扩展属于前面的 77 项，不是新增的 15 项。各项具体功能与限制见第 3 节。

| 扩展 | 可手动开启的方言 |
| --- | --- |
| [angle_brackets_escapable](https://pandoc.org/MANUAL.html#extension-angle_brackets_escapable) | P、S、E、MMD、旧 GH |
| [ascii_identifiers](https://pandoc.org/MANUAL.html#extension-ascii_identifiers) | P、S、E、MMD、旧 GH、C、GFM、CX |
| [east_asian_line_breaks](https://pandoc.org/MANUAL.html#extension-east_asian_line_breaks) | P、S、E、MMD、旧 GH、C、GFM、CX |
| [four_space_rule](https://pandoc.org/MANUAL.html#extension-four_space_rule) | P、S、E、MMD、旧 GH |
| [gutenberg](https://pandoc.org/MANUAL.html#extension-gutenberg) | P、S、E、MMD、旧 GH |
| [hard_line_breaks](https://pandoc.org/MANUAL.html#extension-hard_line_breaks) | P、S、E、MMD、旧 GH、C、GFM、CX |
| [ignore_line_breaks](https://pandoc.org/MANUAL.html#extension-ignore_line_breaks) | P、S、E、MMD、旧 GH |
| [literate_haskell](https://pandoc.org/MANUAL.html#extension-literate_haskell) | P、S、E、MMD、旧 GH |
| [mark](https://pandoc.org/MANUAL.html#extension-mark) | P、S、E、MMD、旧 GH |
| [old_dashes](https://pandoc.org/MANUAL.html#extension-old_dashes) | P、S、E、MMD、旧 GH |
| [rebase_relative_paths](https://pandoc.org/MANUAL.html#extension-rebase_relative_paths) | P、S、E、MMD、旧 GH、C、GFM、CX |
| [sourcepos](https://pandoc.org/MANUAL.html#extension-sourcepos) | C、GFM、CX |
| [tex_math_single_backslash](https://pandoc.org/MANUAL.html#extension-tex_math_single_backslash) | P、S、E、MMD、旧 GH |
| [wikilinks_title_after_pipe](https://pandoc.org/MANUAL.html#extension-wikilinks_title_after_pipe) | P、S、E、MMD、旧 GH、C、GFM、CX |
| [wikilinks_title_before_pipe](https://pandoc.org/MANUAL.html#extension-wikilinks_title_after_pipe) | P、S、E、MMD、旧 GH、C、GFM、CX |

默认关闭可能源于兼容性、专业用途、需要其他功能配合或输出目标限制。判断是否要开启应看具体用途；“全接入”意味着完整提供可用项，**不意味着把互相竞争的解析规则全部开启**。

例如，`wikilinks_title_after_pipe` 与 `wikilinks_title_before_pipe` 对标题和目标的顺序有相反约定，实际配置应选择一种。`hard_line_breaks` 与 `ignore_line_breaks` 也表达不同的换行需求。

## 6. 在 Notdown / Markdown Lab 中如何理解“支持”

### 以 blank_before_header 为例

它是“要求空行”的开关。开启不是增加一种标题写法，而是收紧标题识别条件：

```markdown
上一段
# 紧接着的标题
```

用 `markdown` 预设时该扩展默认开，上面第二行不会按新的 ATX 标题处理；改成 `markdown-blank_before_header` 才允许它直接开始标题。在前面增加空行时，两种配置都能识别标题。CommonMark 的标题中断规则内置于 reader，因此应选择 `commonmark`，不能传入它不接受的 `commonmark-blank_before_header`。

### 四层能力不能混为一谈

```text
方言 reader 接受开关
        ↓
源码在相应上下文中产生 AST 语义
        ↓
writer 将该语义输出为目标格式
        ↓
页面样式、公式渲染与交互显示结果
```

Pandoc 的 AST 是文档的中间语义表示，包含块、行内内容和元信息。它不自动成为 Notdown 的持久化数据库，也不保证保留源文件的所有空白和语法写法。Lab 仍以左侧源码为真相，只把 AST 用于当前预览。

| 扩展/能力 | 当前 Lab 的实际边界 |
| --- | --- |
| `sourcepos` | 三个 CommonMark reader 中由同步系统自动启用，不作为用户开关；其余五种 reader 使用块位置估算。 |
| `gutenberg` | CLI 接受该名字，但效果属于纯文本 writer；当前“Markdown 输入 → HTML 输出”的预览中没有相应显示变化。 |
| `raw_tex` / `raw_attribute` | 目标格式不匹配的原始片段可能不输出；不等于方言开关未连接。HTML 还会经过应用清理。 |
| `citations` | 能识别引文结构，不代表已接通书目文件、CSL 样式和 `--citeproc`。当前 Lab 没有完整的参考文献生成流程。 |
| YAML / Pandoc / MMD 元信息 | reader 可以识别；当前 HTML 正文输出前清空 AST `meta`，没有完整文档模板或标题页。 |
| `rebase_relative_paths` | 需要来源文件目录上下文；当前 Lab 将源码经 stdin 传入，没有保留原文件目录。 |
| `abbreviations` | Pandoc 本身没有完整缩写 AST 支持；开启后会略过定义行，不产生完整悬浮释义。 |
| 属性、`mark`、`alerts` | AST/HTML 中存在语义与最终页面有专门颜色、图标、交互是两回事；还取决于渲染器和 CSS。 |
| 公式 | 扩展确定识别规则；能否显示具体公式还取决于本地公式渲染器支持范围。 |
| 任务列表、双链 | 可解析状态或链接，不自动获得可编辑复选框、Notdown 页面 ID 解析、反向链接或页面创建。 |

以上边界来自当前 [Lab 实现说明](MARKDOWN-LAB.md)、[Pandoc 预览服务](../server/pandoc.ts) 和 [Lab 代码](../src/markdown-lab/)，不应误写成 Pandoc 本身不支持。

### notion-markdown

当前 `notion-markdown` 走 Notdown 自有 codec，而不是 `pandoc -f notion-markdown`。因此，本文 **89 个 Pandoc 扩展名作为直接开关，对它全部“不适用”**；这不表示 Notion 方言没有标题、表格、公式、分栏或提示块。

要让两者融合，需要逐项建立“语法 → 内部语义 → 显示/编辑 → 可恢复原文”的适配关系。当前 Notion 方言整体启用，不能宣称这 89 个开关已映射到其 codec。具体保存与编辑兼容困难见 [Markdown Lab 架构与兼容边界](MARKDOWN-LAB.md#与-notdown-编辑器融合的困难)。

### notdown-bookmark

`notdown-bookmark` **不在 Pandoc 手册的扩展清单里**，也不是现有 Notdown 的封面块。它是为了验证插件启停、代码块载体与失败回退而加入的“书签卡片（示例）”，消费带同名语言标记的 JSON 代码块，只显示显式提供的标题、网址和描述，不抓取网页封面。

这是应用自己的 AST 显示插件，计数上不属于 89 项。它依赖当前方言能识别对应代码围栏；例如 Strict 默认关闭围栏时，不能仅凭启用卡片插件就识别该源码。详见 [块插件说明](MARKDOWN-LAB.md#块插件)。

## 7. 手册中的其他插件机制

手册没有一份“所有第三方插件都列在这里”的有限目录。以下是它描述的机制与相关示例；安装 Pandoc 不代表安装了所有外部程序。

| 机制 | 在哪些 Markdown variant 中可用 | 为什么，以及与当前 Lab 的关系 |
| --- | --- | --- |
| JSON filter：`--filter` / `-F` | 八种均可在解析后接入；具体过滤器可能要求特定 AST 节点或元信息 | 外部程序读取并输出 Pandoc JSON 文档，不依赖某个方言名字。Lab 尚未提供任意外部 filter 执行。 |
| Lua filter：`--lua-filter` / `-L` | 八种均可在解析后接入；实际效果依过滤器而定 | 在 Pandoc 的 Lua 环境中遍历和改变 AST；不是 `+lua` 扩展。Lab 尚无 Lua filter 管理。 |
| 内置引文处理器：`--citeproc` | 八种都可以进入该处理流程；必须已有引文节点和所需书目资料 | 这是 AST 引文排版步骤。当前三个 CommonMark reader 没有 `citations` 开关，不会只因加了 `--citeproc` 就识别 Pandoc 引文源码。 |
| 自定义 Lua reader：`-f path.lua` | 作为另一种输入 reader 使用，不与某个 Markdown reader 同时叠加 | 自定义程序决定如何读取源码，替换输入侧；不是在现有方言中打开一种语法。Lab 未开放。 |
| 自定义 Lua writer：`-t path.lua` | 可接收八种 reader 产生的 AST，但具体节点覆盖由 writer 决定 | 替换输出侧；可实现新格式，不保证自动支持每种块。Lab 当前固定输出 HTML。 |

JSON filter、Lua filter 和 citeproc 按命令行出现顺序运行；某个过滤器需要另一过滤器先产生的节点时，顺序会影响结果。参考手册的 [JSON filter](https://pandoc.org/MANUAL.html#option--filter)、[Lua filter](https://pandoc.org/MANUAL.html#option--lua-filter)、[citeproc](https://pandoc.org/MANUAL.html#option--citeproc) 与 [自定义 reader/writer](https://pandoc.org/MANUAL.html#custom-readers-and-writers)。

### 手册提到的开发库与示例名称

| 名称 | 实际身份 |
| --- | --- |
| `Text.Pandoc.JSON` / `toJSONFilter` | Haskell 的 filter 开发接口，不是一项 Markdown 语法。 |
| [pandocfilters](https://github.com/jgm/pandocfilters) | Python filter 开发库。 |
| [pandocfilters-php](https://github.com/vinai/pandocfilters-php) | PHP filter 开发库。 |
| [Pandoc::Filter](https://metacpan.org/pod/Pandoc::Filter) | Perl filter 开发库。 |
| [pandoc-filter-node](https://github.com/mvhenderson/pandoc-filter-node) | JavaScript filter 开发库。 |
| `caps.py`、`count-words.lua` | 演示 filter 命令的文件名；不是 Pandoc 承诺内置的插件包。 |
| `creole.lua`、`sample.lua`、`my_custom_markup_language.lua` | 自定义 reader/writer 的示例或占位文件名。 |
| LPeg | 可供 Lua 自定义 reader 使用的解析库；不是 Markdown 方言开关。 |

上述第三方链接是手册中的引用，不表示本项目安装、启用或审核了这些库。

## 8. 核对方法、覆盖与复现

### 覆盖口径

- 手册正文有 **91 个以 Extension 开头的小节**。去重后标题中出现 88 个扩展名；`superscript` / `subscript` 共用小节，`citations` / `fancy_lists` 则有跨格式重复小节。
- `wikilinks_title_before_pipe` 在 `wikilinks_title_after_pipe` 的正文中介绍，加上它总计 **89 个不同名称**。`lhs` 是 `literate_haskell` 的别名，不单独计数。
- 第 3 节 77 项加第 4 节 12 项，完整覆盖这 89 个名称。第 5 节只是默认关闭子集，第 7 节的开发机制不混入扩展计数。
- 本地 3.11 源码枚举还包含 **`epub_html_exts`**，但本次下载的手册正文没有提到它。因此不把它冒充为“手册中的第 90 项”。CLI 在 `html`、`html4`、`html5`、`epub`、`epub2`、`epub3` 接受这个名称，涉及 EPUB 扩展 HTML；八种 Markdown reader 均不接受。依据是 [3.11 扩展枚举](https://github.com/jgm/pandoc/blob/3.11/src/Text/Pandoc/Extensions.hs)。

### 可复现命令

以下是 PowerShell；仅读取程序能力，不操作知识库：

```powershell
pandoc --version
pandoc --list-input-formats

$markdownVariants = @(
  'markdown', 'markdown_strict', 'markdown_phpextra', 'markdown_mmd',
  'markdown_github', 'commonmark', 'gfm', 'commonmark_x'
)
foreach ($variantName in $markdownVariants) {
  Write-Output "### $variantName"
  pandoc "--list-extensions=$variantName"
}

# 其他格式示例：这里不会把 docx/odt 当作 Markdown 方言。
pandoc --list-extensions=docx
pandoc --list-extensions=odt
pandoc --list-extensions=org
```

输出中 `+` 表示默认开，`-` 表示默认关，缺少某个名字表示未注册该开关。改变输入解析用 `-f variant+extension`，改变输出功能用 `-t format+extension`；把输出端扩展加到输入端不保证有效。

与本文一起保存的 [机器可读快照](data/pandoc-3.11-extensions.json) 包含核对时间、手册 SHA-256、89 个手册名称及链接、八种方言的原始布尔默认值，以及 12 项非 Markdown 扩展接受它们的格式列表。格式注册列表本身不区分读写实现方向，所以第 4 节另外参考手册说明。

更新时应重新运行实际安装的 Pandoc，并核对在线手册是否已换版本；不能只改文档顶部的版本号。本文没有声称运行了全部扩展的显示、导出或往返测试。
