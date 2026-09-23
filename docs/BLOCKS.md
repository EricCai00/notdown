# 块类型、方言与实现边界

2026-09-15。本文描述 **Notdown 主编辑器的原生实现**；Pandoc Lab 使用本机 Pandoc，范围更广。代码依据：`src/editor-schema.ts`、`src/markdown-engine/config.ts`、`codec.ts`、`blocks.ts`。现有 11 个预设、70 个扩展；扩展数量不等于块类型数量。

产品提示块、目录、图表、复杂 MMD 表格、元数据、文件嵌入、引文等新能力及边界见 [PRODUCT-SYNTAX.md](PRODUCT-SYNTAX.md)。以下保留核心块和 Pandoc 归属的说明。

## 1. 已经有哪些块

原来的实现已经包含 Markdown 基础块，并非只有 Notion 特有块。这次补入五类 Markdown 块。

| 类别 | 已实现的语义块／功能 | 原生开关或入口 |
| --- | --- | --- |
| Markdown 基础 | 段落、1–6 级标题、引用、无序／有序列表、围栏／缩进代码块、分隔线 | CommonMark/GFM 基础规则；Notion 有自己的换行规则 |
| 列表扩展 | 任务项 | `task_lists` |
| 表格 | 统一的可编辑管道、Notion、MMD 表格；保留跨度、分组与题注 | `pipe_tables`、`notdown_tables`、`mmd_tables` |
| 数学 | 独立公式、行内公式 | `tex_math_dollars` |
| 新增：HTML | 原始 HTML 块、含行内 HTML 的片段 | `raw_html` |
| 新增：定义列表 | 术语及一项或多项定义，定义可含多段内容 | `definition_lists` |
| 新增：脚注 | 文中引用、带标签的脚注说明块 | `footnotes` |
| 新增：行块 | 保留分行与行首空格，支持行内格式 | `line_blocks` |
| 新增：Div | 可嵌套的 Markdown 容器 | `fenced_divs` |
| Notdown 容器 | 分栏、提示、折叠、普通块子层级 | `notdown_columns`、`notdown_callouts`、`notdown_toggles`、`notdown_nesting` |
| 页面组织 | 子页面、页面引用、目录 | `notdown_pages`、`wikilinks_title_after_pipe`、`notdown_toc` |
| 媒体 | 图片、音频、视频、文件、PDF 引用 | 图片语法／上传、`notdown_media`；并非所有媒体都嵌入播放 |
| 引用型块 | 数据库入口、同步块内容与来源 | `notdown_databases`、`notdown_synced`；没有数据库执行器或跨页同步 |
| 原文保留 | 不认识或未完成的块、未知 Notion 载荷 | 核心能力，不需要开关 |

`bullet_list_item`、`numbered_list_item`、`task_list_item` 是三种独立的对象和底层节点。`bullet_list`/`ordered_list` 分组、`column`、`table_row`、`table_cell`、`table_caption`、`definition_term`、`definition_description` 和 `line` 是所属内容对象的内部结构，在 Child structures 栏单列并链接父对象。链接、强调、图片、提及、行内 HTML、脚注引用等属于行内内容，不应把所有 schema 节点都算作独立块。

## 2. 这五类分别属于哪些 Pandoc 方言

下表来自 [Pandoc 3.11 能力快照](data/pandoc-3.11-extensions.json)，即 `pandoc --list-extensions=<variant>`。完整 89 项手册扩展对照见 [PANDOC-EXTENSIONS.md](PANDOC-EXTENSIONS.md)。

**开**＝接受且默认开启；**关**＝接受但默认关闭；**—**＝该 reader 不接受这个名字的开关。

| 扩展 | `markdown` | `markdown_strict` | `markdown_phpextra` | `markdown_mmd` | `markdown_github` | `commonmark` | `gfm` | `commonmark_x` |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [`raw_html`](https://pandoc.org/MANUAL.html#extension-raw_html) | 开 | 开 | 开 | 开 | 开 | 开 | 开 | 开 |
| [`definition_lists`](https://pandoc.org/MANUAL.html#extension-definition_lists) | 开 | 关 | 开 | 开 | 关 | 关 | 关 | 开 |
| [`footnotes`](https://pandoc.org/MANUAL.html#extension-footnotes) | 开 | 关 | 开 | 开 | 开 | 关 | 开 | 开 |
| [`line_blocks`](https://pandoc.org/MANUAL.html#extension-line_blocks) | 开 | 关 | 关 | 关 | 关 | — | — | — |
| [`fenced_divs`](https://pandoc.org/MANUAL.html#extension-fenced_divs) | 开 | 关 | 关 | 关 | 关 | 关 | 关 | 开 |

为什么：Pandoc 五种 `markdown*` 共用 Markdown reader，三种 CommonMark 预设共用 CommonMark reader。两族都注册了 HTML、定义列表、脚注和 fenced Div；`line_blocks` 只注册在前一族。预设选择不同默认开关，不能把“默认没开”理解成“无法开启”。reader 和默认值的源码依据见完整扩展对照文档。

### Notdown 当前的实际配置

| 原生方言 | HTML | 定义列表 | 脚注 | 行块 | fenced Div |
| --- | --- | --- | --- | --- | --- |
| CommonMark | 默认开 | 可开，默认关 | 可开，默认关 | 可开，默认关 | 可开，默认关 |
| GFM（核心语法） | 默认开 | 可开，默认关 | 默认开 | 可开，默认关 | 可开，默认关 |
| Pandoc Markdown | 默认开 | 默认开 | 默认开 | 默认开 | 默认开 |
| CommonMark X | 默认开 | 默认开 | 默认开 | 可开，默认关 | 默认开 |
| Markdown Strict | 默认开 | 可开，默认关 | 可开，默认关 | 可开，默认关 | 可开，默认关 |
| PHP Markdown Extra | 默认开 | 默认开 | 默认开 | 可开，默认关 | 可开，默认关 |
| MultiMarkdown | 默认开 | 默认开 | 默认开 | 可开，默认关 | 可开，默认关 |
| 旧 GitHub Markdown | 默认开 | 可开，默认关 | 默认开 | 可开，默认关 | 可开，默认关 |
| Notion Markdown | 尚未适配这五个独立开关；标签继续走 Notion codec | 同左 | 同左 | 同左 | 同左 |

主编辑器十一个预设均可选，核心规则差异见 [NATIVE-DIALECTS.md](NATIVE-DIALECTS.md)。**Notdown 给 CommonMark/GFM/CommonMark X 提供 `line_blocks` 是自有组合能力；该配置不能原样传给 Pandoc 同名 reader。** 其他同名扩展也只实现下节规则，未全面通过 Pandoc 一致性测试。默认值采用 Pandoc 3.11 快照，不代表所有同名 Markdown 软件都具有相同能力。

`raw_html` 不会自动启用 `<columns>` 等 Notdown 语义。普通 `<table>`／`<details>` 可以按 HTML 预览；启用 `notdown_tables`／`notdown_toggles` 后才按相应编辑块解释。Notion 方言本身已支持这两种标签的结构化编辑。

## 3. 新增块怎么使用

在任一非 Notion 方言页面打开「扩展」，启用所需规则；Slash 菜单会出现可用块。源码、双栏、页面模式共用同一份 Markdown。开关扩展只改变解释，不自动改写正文。

### HTML 块

```html
<div>
  <h2>Web results</h2>
  <p>这里显示为 HTML 段落。</p>
</div>
```

页面显示预览，点「编辑 HTML」修改标签源码，预览随之更新。块可整体拖动；HTML 源码字段使用共同撤销／重做。代码围栏中的 HTML 仍是代码。

显示与 HTML 导出使用相同 HTML5 解析和元素／属性白名单；磁盘保存完整原文。支持常见文本、列表、表格、图片及有限内联样式；不执行脚本、事件、表单、全局样式表；iframe 需单独开启 html_embed 并使用隔离视图，不应用外来 class/id/data 属性。混合行内 HTML 的整段行内内容目前作为一个预览片段，需在源码视图编辑；未实现 HTML 内部任意元素的所见即所得编辑。

### 定义列表

```markdown
Markdown
:   一种轻量标记语言。

    定义也可以有第二段。

AST
~   文档的结构表示。
```

术语与定义均可编辑。编辑后使用冒号及四空格缩进写回；未修改时保留原有 `:`／`~` 和空白。拖动时整个定义列表一起移动。

### 脚注

```markdown
这句话有说明[^note]。

[^note]: 脚注内容。

    这是脚注的第二段。
```

保留标签，引用链接指向说明块，脚注内容可直接编辑。说明块保留在源码对应位置，便于同步滚动；尚未按引用顺序统一生成数字编号、汇集到页尾、添加返回链接，也未实现未定义／重复引用的诊断。`inline_notes` 的 `^[…]` 是另一种语法，尚未实现。

### 行块

```markdown
| 第一行
|   有意缩进的第二行
| 第三行
```

每个 `| ` 对应一行，显示中保留行首空格；缩进续写并入上一行。普通段落内换行、两个空格的硬换行和行块是不同语义。开启管道表格时，有合法表头分隔行的输入优先识别为表格。

### fenced Div

```markdown
::: {#intro .note}
## 容器内的标题

普通 **Markdown** 段落。

::: {.inner}
嵌套内容。
:::
:::
```

至少三个冒号，属性写在花括号中，也可使用单个普通类名 `::: note`。内部继续解析当前 Markdown 配置，支持嵌套与代码围栏；未闭合时保留源码。属性原文保存并显示为容器标签，尚不执行属性对应的 CSS、锚点或布局。整体拖动携带子内容。

目前新容器的内部修改会规范化整个顶层复合块。内部 Markdown 子文档独立解析；跨容器的引用式链接定义共享仍需完善。容器专用快捷键、属性编辑器、嵌套子块精确滚动位置和全部 Pandoc 组合语法还未完成。

## 4. 还缺哪些块或块级语法

以 Pandoc Markdown 为主，以下不是所有第三方 Markdown 生态的穷举。

| 待完成能力 | 相关扩展／机制 | 当前情况与接入方向 |
| --- | --- | --- |
| 简单、多行、网格表格 | `simple_tables`、`multiline_tables`、`grid_tables` | 已有表格编辑节点，缺三种 reader/writer；应共用语义，分别保留源码写法 |
| 完整表格结构 | `table_captions`、行列跨度等 | MMD 管道表格已显示题注、分区与跨度；仍缺完整 Pandoc 表格结构及合并单元格直接编辑 |
| 带题注的 Figure | `implicit_figures` | 已实现独立图片与题注预览；仍缺完整 Figure 编辑和 Pandoc AST 转换 |
| 通用原始格式块 | `raw_tex`、`raw_attribute` | 已实现 raw_attribute；HTML 清理后预览，其他格式保留代码。raw_tex 与 TeX 执行未实现 |
| 完整标题／元数据语义 | `pandoc_title_block`、`mmd_title_block`、`yaml_metadata_block` | 已识别正文开头的常见写法，metadata_values 可显示元数据并编辑源码；不应用到页面 YAML。完整语法、结构化元数据编辑与字段映射未完成 |
| HTML → 结构容器 | `native_divs`、`markdown_in_html_blocks`、`markdown_attribute` | 已能预览 HTML，也已有 fenced Div；已实现 markdown_attribute 的常见包装块；native_divs 和完整混合解析仍待补齐 |
| 更多编号列表写法 | `fancy_lists`、`example_lists` 等 | 已有普通有序列表和 `startnum` 开关；罗马字母、示例编号与引用等未完整实现；无需每种编号新建一种块 |
| 引文和生成参考文献 | `citations` + citeproc | MMD 引用与固定格式 BibTeX 已实现；Pandoc citations/citeproc、CSL 样式待补齐 |
| 其他生态容器／图表 | Markdown directives、admonition、Mermaid 等 | 已接入 alerts、Mermaid、常用 sequence/flow；通用 directives 与完整旧图表引擎未实现 |

### 与 Pandoc AST 的关系

按 [pandoc-types 的数据定义](https://github.com/jgm/pandoc-types/blob/master/src/Text/Pandoc/Definition.hs)，基础段落、标题、列表、引用、代码、分隔线已有对应语义。此次加入 `LineBlock`、`DefinitionList`、`Div` 对应能力和 HTML `RawBlock`。`Table` 仍是较小子集，`Figure` 与 `raw_attribute` 已用保留源码的预览块承载，尚无完整 AST 映射。`Plain` 与 `Para` 的紧凑排版差异目前未建独立节点。

脚注在 Pandoc 中是行内 `Note [Block]`，元数据在文档 `Meta` 中；它们不都属于 `Block` 枚举。Notdown 使用“引用节点 + 说明块”编辑脚注，将来导出 Pandoc AST 时需要按引用合成 Note。现在没有完整双向 AST 适配。

后续按“语义节点 → 方言 reader/writer → 扩展开关 → 编辑命令 → 原文与异常边界测试”逐项补齐。相同语义共用节点，不同语法保留来源；未知内容继续可恢复。
