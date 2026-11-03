# 块的语义模型与 Notdown 实现对应

[English](BLOCK-MODEL-REVIEW.md) · **简体中文**

> 本文保留为 2026-09-20 的设计讨论快照。2026-09-21 用户新表已确定保留 Toggle heading、三类列表项、PDF 等分别可辨认的对象；最新边界、P0–P4 本地实现与服务执行范围以 [对象 Roadmap](CONTENT-OBJECT-ROADMAP.zh-CN.md) 和代码注册表为准。下文“建议合并”和旧节点数量不是当前实现状态。

核对日期：2026-09-20。依据用户修订表中 46 个 block 项和 2 个 metadata block 项，以及当前工作区源码。本文讨论内容本质，**不以 Markdown 写法、扩展开关名或 ProseMirror 节点名决定语义类型**。建议名称是设计建议，不表示代码已经迁移。

2026-09-21 实施更正：三类列表项现已按用户要求拆成三种底层节点；Heading 共用节点；Table 的 MMD 源码载体已移除，统一使用结构化表格及可编辑题注。Child structures 单列所属子结构，2026-09-22 已清理表外既有格式并移除 Existing content；Inline raw source 纳入正式清单，文件引入共享块级与行内位置。strong 是粗体，highlight 是高亮；mark 是 ProseMirror 的格式机制统称。下文关于 list_item 共用及 syntax:table 的描述仅为历史记录。

这版分类可以作为语义模型的基础。最需要调整的是：把内容类型、表现方式、资源与引用、实现状态分开。同一种内容可以有多个编码形式，也可以暂时由多个编辑器节点承载。

## 命名和合并原则

- 规范 ID 使用 `lower_snake_case`；显示名称用自然语言。所在字段已经表示 block 时，不必重复 `_block`。
- `level`、是否折叠、行内/块级展示、编号方式等放属性；语法来源和原文另存 codec/provenance 信息。
- 合并意味着共用语义类型，**不意味着删除差异字段**。例如 callout 的类型、标题、图标、颜色和折叠状态都应保留。
- 语义模型可以统一，而当前 ProseMirror 节点暂时分开；不必为了统一命名立即修改解析器、编辑器及序列化器。
- 资源模型与正文节点分别建模。`page` 是资源；正文里指向它的是 `page_reference`。数据库及其视图也采用这个区分。

## 对修订表逐项对应

状态：**结构化**＝有专用节点及内容/属性；**源码载体**＝通过原文、预览等承载，不能等同于完整结构化编辑；**引用**＝仅保存目标及展示信息；**未实现**＝无对应专用能力。不同方言的开启条件仍见已有扩展矩阵；本表不把“未默认开启”写成“未实现”。

`syntax:xxx` 是 `syntax_block.kind = xxx` 的缩写。下列顺序与用户修订表一致。

| # | 用户名称 | 建议语义名称 / 归并 | 当前 Notdown 对应与边界 |
|---|---|---|---|
| 1 | divider | `divider` | 结构化：`horizontal_rule`；thematic break 可保留为别名。 |
| 2 | heading | `heading`，属性 `level` | 结构化：`heading`；层级不拆类型。 |
| 3 | code block | `code`，属性 `language` | 结构化：`code_block`；表示供阅读的代码文本。 |
| 4 | HTML block | `raw_content(format=html)` | `html_block` 与 `syntax:raw(format=html)` 属同一语义家族；保存 HTML，预览受到清理规则约束。不是独立网页环境。 |
| 5 | paragraph | `paragraph` | 结构化：`paragraph`；带块子内容时由 `nested_block` 包装。包装不是新的内容本质。 |
| 6 | table | `table` | 结构化 `table/table_row/table_cell`，以及源码载体 `syntax:table`；应统一语义，但复杂 MMD 表格当前不等同于原生表格编辑能力。 |
| 7 | quote | `quote` | 结构化：`blockquote`；保留引述语义，不因外观接近而并入 callout。 |
| 8 | bullet list item | `list_item`，标记 `bullet` | 结构化：`bullet_list > list_item`。 |
| 9 | numbered list item | `list_item`，标记 `ordered` | 结构化：`ordered_list > list_item`；起始编号在列表上。 |
| 10 | task list item | `list_item`，附加 `task_state` | 结构化：`list_item.checked`；任务状态与有序/无序可以正交，不必成为第三种互斥列表。 |
| 11 | empty block | 空的 `paragraph` | 已实现：Notion `<empty-block/>` 解析为空段落。无需独立类型；源文件分隔空行不因此变成内容对象。 |
| 12 | math block | `math`，`display=block` | 结构化：`equation`；可与行内 `inline_math` 共用数学内容模型。 |
| 13 | image block | `image`，`display=block` | `image` 目前是行内节点，由段落承载；带题注路径为源码载体 `syntax:figure`。存在图片能力，但无独立 `image_block` 节点。 |
| 14 | diagram | `diagram` | 源码载体：`syntax:diagram`，保存语言与代码；不是所有代码围栏都具有图示语义。 |
| 15 | table of contents | `table_of_contents` | 专用 `table_of_contents` 与源码载体 `syntax:toc`；应统一，保留标题层级范围等属性。 |
| 16 | link to page | `page_reference`，块级展示 | 引用：`child_page`；另有行内 `page_link`。可以共用目标模型。 |
| 17 | embed web contents | `embed`，来源为 URL | 源码载体：`syntax:embed`，iframe 预览；不是完整第三方服务集成。 |
| 18 | HTML embed | `embed`，来源为 HTML 文档 | 可与上一项合并，来源类型另记。当前 iframe URL 路径只覆盖部分需求；没有 Notion HTML 文件上传/导入专用链路。 |
| 19 | database - inline | `database_reference` / `database_view`，行内页面布局 | 当前只有引用节点 `database(inline=true)`；未实现数据库引擎或视图。完整语义应分资源和视图，不按展示位置分数据库类型。 |
| 20 | linked view of data source | `database_view`，带数据源引用 | 未实现。普通 `database` 链接不含筛选、排序、视图布局等语义，不能算等价实现。 |
| 21 | button | `button` | 未实现动作按钮模型。 |
| 22 | breadcrumb | `breadcrumb` | 无正文节点；应用页面导航中的面包屑不等于可插入的正文块。 |
| 23 | video | `video`，归属媒体家族 | 结构化属性：`media_block(type=video)`；有播放展示。 |
| 24 | audio | `audio`，归属媒体家族 | 结构化属性：`media_block(type=audio)`；有播放展示。 |
| 25 | file | `file`，归属附件家族 | 结构化属性：`media_block(type=file)`；主要是文件链接。 |
| 26 | web bookmark | `link`，`presentation=bookmark` | 无专用书签卡片模型；普通链接不等于含摘要、封面等的书签卡片。 |
| 27 | PDF | `file(media_type=application/pdf)` | `media_block(type=pdf)`；当前渲染是文件链接，不是完整 PDF 阅读器。可把 PDF 作为文件子类型与呈现选项。 |
| 28 | link preview | `link`，`presentation=preview` | 无专用外部预览/解析服务模型。可与书签共享链接及预览数据，保留 provider 和展示属性。 |
| 29 | unsupported | `unknown_content` | `unknown_block` 保存 URL/替代说明，`opaque_block` 保存原文。统一为回退家族，但必须区分“有原文”与“仅有占位引用”。 |
| 30 | callout | `callout` | 结构化：`callout` 与 `alert`；应合并语义。alert/admonition 可为别名或子类型，保留 kind/title/icon/color/collapsible 等。 |
| 31 | page | 资源 `page`；正文使用 `page_reference` | 应用已有 `Page` 资源与父子关系。编辑器 `child_page` 只是引用；资源归属与普通链接仍须区分。 |
| 32 | database - full page | 资源 `database`；正文使用引用/视图 | 当前 `database(inline=false)` 仅引用；可与第 19 项共用资源类型，不能据此声称完整数据库已实现。 |
| 33 | meeting notes | `meeting_notes` | 无专用功能；原文回退不表示已经实现会议记录/转录服务。 |
| 34 | toggle | `collapsible_section` | 结构化：`toggle_block`，第一段为摘要，其余为内容。表示通用可折叠区段。 |
| 35 | toggle heading | `heading` + 折叠及子内容属性 | `heading(toggle=true)`，子内容由 `nested_block` 承载；无需独立 heading 类型。与通用 toggle 共享折叠能力，但保留标题语义。 |
| 36 | tabs | `tab_group`，内部 `tab` | 未实现专用标签页结构；未知源码保留不是交互标签页支持。 |
| 37 | synced block | `synced_content`；当前状态为 snapshot | 当前 `synced_block` 是本地内容快照/引用信息，无跨实例实时同步。类型语义可保留，但实现状态必须标明。 |
| 38 | columns | `column_layout`，内部 `column` | 结构化：`columns > column`；布局与内部栏目不是别名关系。 |
| 39 | YAML front matter | `document_metadata` | 源码载体 `syntax:metadata` 等元数据处理；格式来源保留在编码层。不要把原文元数据节点与页面属性存储直接视为同一个对象。 |
| 40 | Pandoc title block | `document_metadata` | 同上；与 YAML、MMD 元数据共享语义容器，但字段类型、值及原文编码都要保留。 |
| 41 | file transclusion | `transclusion` | 源码载体 `syntax:transclusion`，解析文件内容引用；当前面向限定文本类型，不支持任意媒体文件转引。 |
| 42 | block comment | `content_comment`，块级范围 | 源码载体 `syntax:comment`；可与行内内容注释共享模型，不等于协作评论线程。 |
| 43 | definition list | `definition_list` | 结构化：`definition_list > definition_term/definition_description`；释义可有多个正文块，不应定义为无内部结构的 leaf。 |
| 44 | raw source | 若指原样交给输出格式：`raw_content` | `syntax:raw`。若指“供阅读的源码”，应归 `code`；若指无法解析但保留的源码，应归 `unknown_content`。建议删除 raw source 这个含糊的规范名。 |
| 45 | line block | `line_group` | 结构化：`line_block > line`；语义是保留有意义的逐行分组，不只是某个前缀写法。 |
| 46 | native div | `container` | 已有 `fenced_div` 结构化容器；不能因此算 `native_divs` 解析已实现。`syntax:html-markdown` 是另一条源码/预览路径。语义可统一，转换能力分别标注。 |
| 47 | raw TeX | `raw_content(format=tex)` | 显式 raw-format 路径可保留 TeX；没有独立裸 `raw_tex` 识别能力。不能与 `math` 无条件合并，TeX 可包含非数学指令。 |
| 48 | example list | `list_item` / `list`，编号模式 `example` | 无专用示例列表标签、连续编号和引用实现。可共用列表基础模型，但要增加标签/编号序列语义，不只是普通 ordered list 改名。 |

## 建议优先合并的内容

| 合并组 | 保留的差异 |
|---|---|
| callout / alert / admonition | 提示类型、标题、图标、颜色、折叠；来源语法不决定类型。 |
| heading / toggle heading | level、collapsible、collapsed、children；折叠不是新标题种类。 |
| paragraph / empty block | 空内容也是合法段落；原文空行仍属于排版/编码信息。 |
| bullet / numbered / task list item | 列表标记、起始编号、任务状态；任务不是编号方式。 |
| YAML / Pandoc title / MMD metadata | 属性值、字段类型及来源编码；名称不要绑定序列化格式。 |
| database inline / full page | 数据库资源身份、视图身份、显示位置、归属关系分别保存。 |
| web embed / HTML document embed | 都是嵌入外部文档；URL/文件来源、媒体类型及运行权限分别记录。 |
| 原生 table / MMD table；两种 TOC | 内容语义相同；结构化编辑和源码预览的实现等级不同。 |
| block/inline image；block/inline math | 内容数据共享，display 单独记录。 |

媒体建议采用共同的附件数据结构，但保留 image/audio/video 等可辨认子类型。共用 `src` 并不足以把所有媒体强行变成同一种无差别内容。类似地，书签和预览可共享链接对象，而页面引用还需要内部资源身份。

## 不建议因相似外观而直接合并

1. **raw HTML 与 HTML embed**：前者是文档中的原始内容片段，后者是嵌入独立文档。区别是内容归属和运行方式，不是标签写法。可以同属 HTML 能力家族，不能丢掉这个区别。
2. **code 与 diagram**：一个展示代码，一个表达图示。可共享源码字段，但须保留渲染意图；同理 raw TeX 不等于数学公式。
3. **quote 与 callout**：引述与提示具有不同语义，样式接近不等于同类。
4. **transclusion 与 synced content**：可以共用内容引用基础结构，但引用范围、读写方向、刷新和同步策略不同。Notdown 的 synced snapshot 尤其不能宣称是 live sync。
5. **page 与 page reference**：前者拥有正文、属性与身份，后者指向资源。child page 的归属关系也不能用一个普通链接默默替代。
6. **内容注释与协作评论**：前者是文档内容/标注，后者还涉及作者、线程、时间及状态。可以共享锚点，不等于共享完整实体。

## 用户表外的现有实现如何归位

以下内容不是建议全部增加为顶层 block 类型，而是确保现有实现没有在合并时丢失。

| 现有节点/载体 | 建议归位 |
|---|---|
| `footnote` + 行内 `footnote_reference` | 可以是一个脚注实体：`id + body`，正文存引用。不是因为定义/引用语法不同就拆成两个内容种类，但两者在模型中承担的角色不能丢失。修订表仅列行内 footnote，需补充脚注正文存放位置。 |
| `syntax:definition` | 缩写、文献、术语定义表；归文档的 reference definitions / annotations。不是正文中的 definition list。 |
| `syntax:figure` | 有题注的图示内容。当前只有图片路径，可建模为 `image.caption`；若未来允许图、表等组合并独立编号，再引入通用 `figure` 容器。alt 与 caption 不应混为一个字段。 |
| `nested_block` | 段落/标题挂载子块的编辑器适配结构；无需成为用户语义类型。 |
| `bullet_list` / `ordered_list` | 列表分组实体 `list`，保存编号/分组语义；不是新的 list item 类型。 |
| `table_row` / `table_cell` | 表格内部结构。 |
| `definition_term` / `definition_description` | 术语与释义内部结构。 |
| `line` | `line_group` 内部结构。 |
| `column` | `column_layout` 内部结构。 |
| `syntax_block` | 扩展内容的实现载体；应按 kind 映射到语义类型，不把“extension block”作为内容本质。 |
| `opaque_block` / `unknown_block` | 回退表示；分别保留 raw 或 reference，注明可恢复程度。 |
| `doc` | 文档根；不是一种可插入块。 |

## leaf / container 建议换一种记录方式

不要仅用一个布尔值表达所有“包含”。至少分成：

| 维度 | 例子 |
|---|---|
| 行内内容 `inline_content` | paragraph、heading、表格单元格中的文字。 |
| 通用子块 `block_children` | quote、callout、toggle、带子内容的 paragraph。 |
| 专用内部结构 `structured_children` | table 的行/单元格、columns 的 column、definition list 的术语/释义、tabs 的 tab。 |
| 外部资源/内容引用 `reference` | page reference、database view、transclusion。 |

这些维度可以同时存在。`table` 有内部结构不意味着可任意嵌入所有块；`database` 指向有记录的资源不意味着正文引用节点是内容容器。ProseMirror 的 `atom/isLeaf` 描述编辑器存储和交互，不能直接拿来决定本模型中的内容本质。

## 源码依据与覆盖范围

- [编辑器 schema](../../src/document/editor-schema.ts)：35 个 `isBlock` 节点（含文档根），即 34 个非根块形节点；其中包含表格行/单元格等内部结构，不代表 34 个独立用户语义类型。
- [块目录及标签](../../src/catalog/block-catalog-data.ts)：列出节点名称，以及 11 个 `syntax_block.kind`；目录名称是当前实现标签。
- [产品扩展解析](../../src/markdown-engine/products.ts)：diagram、raw、table、embed、html-markdown、figure、comment、toc、transclusion、metadata、definition 共 11 个载体种类均已在本文归位。
- [Notion Markdown 适配](../../src/document/notion-markdown.ts)：空段落、嵌套、媒体、页面/数据库引用和同步快照等映射。
- [页面资源](../../src/shared/types.ts)、[Notion 节点视图](../../src/editor/notion-nodeviews.ts)、[扩展节点视图](../../src/markdown-engine/product-view.ts)、[HTML 清理](../../src/markdown-engine/html.ts)、[转引文件解析](../../server/syntax-files.ts)：资源和显示/解析能力的实际边界。

34 个非根块形节点的反向覆盖：paragraph、syntax_block、alert、nested_block、heading、blockquote、horizontal_rule、code_block、bullet_list、ordered_list、list_item、columns、column、child_page、opaque_block、html_block、definition_list、definition_term、definition_description、footnote、line_block、line、fenced_div、callout、toggle_block、synced_block、database、table_of_contents、unknown_block、media_block、equation、table、table_row、table_cell。

本文只作模型核对和命名建议，没有修改 schema、解析行为、默认扩展开关或用户内容。此前[方言能力对照](../reference/CONTENT-CAPABILITIES.zh-CN.md)按旧版表记录的具体语法差异，不应理解为本语义模型必须拆出独立类型。
