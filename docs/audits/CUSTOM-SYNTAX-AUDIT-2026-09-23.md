# Notdown 自定义正文语法审计与整改

当前状态见 [2026-10-27 审计](CUSTOM-SYNTAX-AUDIT-2026-10-27.md)：以下为历史审计，不能再把 Tabs、Bookmark、Link preview 等标签整体认定为自创。`bg_color` 已停用，并按用户授权迁移指定知识库。

2026-09-27 修订：`html-embed` 与 `notion_html_document` 已移除；HTML 上传统一为 `web-embed` 的 assets 文件引用，显式迁移提取旧正文。下表相关行仅为历史审计。

## 最新决定与已落实边界

2026-09-27 会议卡片修订：复用官方 title-first `<meeting-notes>` 与分区结构、日期和联系人提及；仅 Notdown 增加 `meeting-config` 块属性，补充语言、音频、摘要指令及菜单偏好。配置未知字段保留，官方方言不启用该属性；位置链接复用既有 Obsidian 块锚点，不新增链接协议。详见[会议笔记](../features/MEETING-NOTES.md)。

2026-09-27 同步块交互修订：新增仅 Notdown 生效的 `auto-sync`，复用官方同步块／引用标签，补足本地自动发布、刷新及副本复制行为；不新增标签，不迁移旧快照。实现移至 [synced-block-view.ts](../../src/blocks/synced-block-view.ts)，仍使用已捕获版本的 CAS，冲突暂停并保留双方内容。官方 variant 将补充属性按原文保留，不启用本地同步。详见[同步块说明](../features/SYNCED-BLOCKS.md)。

2026-09-27 后续修订：已核实官方 MCP Enhanced Markdown 完整规范并实现其明确语法；Tabs 不再整体列为私有，Meeting notes 的完整分区结构也已支持。表格 col width、date endTime 等同样属于官方边界。旧本地属性仍仅限 Notdown，MCP 支持不等于 REST 写入端点认证。详见[更新后的语法及边界](../reference/NOTION-MCP-SYNTAX.md)。下面的 2026-09-23 状态与旧验证数字保留为历史记录，由本次修订覆盖相冲突的结论。

2026-09-23，用户修订了原先“完全不允许自定义”的要求。Notdown 集合已有 Markdown 方言与 Notion。自定义正文语法仅用于补足官方 Enhanced Markdown 不支持的 Notion block、已有 block 的属性、inline 和 style，且只能在 `syntax.variant: notdown` 启用；`notion-markdown` 仅启用官方文档定义的语法，显式扩展开关也不能越过此边界。能用已有方言表达的内容复用该方言，不能另造重复协议。旧文件和未知字段必须可恢复保留，不批量迁移用户内容。

| 处理 | 内容 |
| --- | --- |
| 保留，仅 Notdown | Tabs、Bookmark、Link preview（含 inline）、Breadcrumb、Button、Meeting notes 补充属性、AI block、HTML document、Web embed，共九组开关。其他 variant 的旧配置、别名或显式 true 不能启用它们。 |
| 保留，仅 Notdown | column width-ratio（旧写法兼容）；日期 reminder/reminder-offset/date-format/time-format/time-zone 与 ISO start/end；折叠 open；synced 的本地 id/revision/hash/auto-refresh。官方 variant 遇到这些已知补充属性保留整个块原文，避免启用行为。 |
| 2026-09-27 页面块修正 | 官方 page 标签专用于 Child page；新增仅 Notdown 启用的 page-link 标签补足 Link to page。两者可以指向同一个子页，不能按 parent 推断类型。旧 role 仅作未知属性保留，新入口不写。官方 unknown 可在 Notdown 导入时依据 Block API 真实类型恢复，原始数据归档；官方方言保留占位。 |
| 删除重复协议 | local_figure 退出扩展注册与插入入口；Image block 示例使用 Pandoc 独立图片和 link_attributes 的 alt。旧 figure 原文仍可恢复，独立图片 alt 为空时不误判 implicit figure。 |
| 停止生成并停用 | :::nest/:::children/:::endnest、:::columns/:::column、::page；新内容用官方 Tab 嵌套、columns、page/mention-page。旧解析函数仅供旧源恢复，当前 variant 中只显示可恢复源码。 |
| 删除重复插件 | Lab notdown-bookmark；旧保存的 bookmark 插件配置无行为，围栏按普通代码展示，示例改为普通链接。 |
| 复用既有格式 | NFM 表格的合并单元格、对齐和题注不新造 XML 结构；Notdown 编辑后使用 Pandoc grid_tables，禁用该格式时拒绝有损保存。官方 variant 不开启合并/题注命令，遇到旧扩展结构保留原文。 |

官方日期仍可双击使用 start/end/startTime/timeZone 字段编辑；丰富日期面板及提醒仅在 Notdown 使用。官方折叠的展开/收起只改视图；列宽拖动、本地同步操作不出现在官方 variant。未知源码与未修改文件不批量转换，用户 vault 未改动。

**实现边界**：官方已列出 Meeting notes 标签，但完整结构未核实，因此官方 variant 当前按原文保留；Notdown 的本地转录仍依赖配置服务。九组补充编码不是 Notion Markdown API 的互通格式。现有方言 codec 的全部上游一致性未因此宣称完成，既有功能缺口仍见 DIALECT-CONFORMANCE.md。

验证：`npm test` 共 447 项，446 通过、1 项跳过；`npm run build -- --outDir .run/dist-syntax-boundary` 通过。独立临时知识库、headless Chrome 回归覆盖官方/补充格式隔离、旧源码恢复、日期/提醒、列宽、书签、按钮、Tabs、HTML/Web embed、同步 CAS、表格、目录和 Lab。扩展回归中的旧 variant/bodyFormat 组合与过时的目录断言已修正；最终补测 29 项全部通过，其余相关用例已在前轮通过。测试日志在 `.run/syntax-boundary-tests-final.log`、`.run/syntax-boundary-e2e-final.log`、`.run/syntax-boundary-followup.log`；这不代表执行了整个浏览器测试目录或通过全部上游一致性测试。

以下为修订决定之前的审计记录，描述的是发现问题时的状态，以本节为准。

2026-09-23。用户目标是现有 Markdown 方言与官方 Notion Markdown 的合集，当前阶段不设计自己的正文语法。**当前实现尚未满足该目标。**此前九个 local_* ID 改为 notion_* 只是改配置名称，没有解决正文编码问题。

本轮检查预设、解析与序列化、插入菜单、属性编辑器和 Markdown Lab。仅凭文档未列某个属性，不断言其绝不可能存在；但项目自行采用、没有具体上游依据的契约不能作为已核实语法纳入合集。本轮没有读取或修改用户 vault，也没有移除现有运行时能力。

## 自定义或尚无上游编码依据的九组载体

共同实现：[object-model.ts](../../src/document/object-model.ts)、[object-codec.ts](../../src/document/object-codec.ts)、[presets.ts](../../src/markdown-engine/presets.ts)。全部在 Notdown 默认开启，新建后会写入下列编码，不能称为仅兼容旧文件。

| 扩展 | 当前载体 | 核对结果 |
| --- | --- | --- |
| local_figure | `<figure src="…" alt="…" caption="…"/>` | 本地格式，不等于标准 HTML figure/img/figcaption；可采用 Pandoc 图片及 link_attributes。 |
| notion_tabs | `<tabs active="…"><tab title="…" icon="…">…` | Notion Tab API 的存在不能证明这组标签与属性；所查 Markdown 文档未核实此契约。 |
| notion_bookmark | `<bookmark url="…" title="…" description="…" icon="…" image="…" caption="…"/>` | 官方 Markdown 支持表将 Bookmark 列为 unknown，本地卡片标签不是该输出。 |
| notion_link_preview | `<link-preview …/>`、`<mention-link …>…</mention-link>` | 官方 Markdown 的 Link preview 列为 unknown；API mention.link_preview JSON 不是这些标签的依据。模型另有 link-mention 名称，不应按名字推断标准。 |
| notion_breadcrumb | `<breadcrumb path="…"/>` | 官方 Markdown 的 Breadcrumb 列为 unknown。 |
| notion_button | `<button label="…" icon="…" variant="…" actions="JSON"/>`，旧 action/target | 本地动作协议；HTML button 元素或 Notion 产品按钮文档均不能证明这些动作字段及行为。 |
| notion_ai_block | `<ai-block prompt="…" model="…">…</ai-block>` | 本地生成服务及容器契约，未核实为官方 Markdown。 |
| notion_html_document | `<html-embed>转义的 HTML 文档</html-embed>` | 本地文档容器；Notion HTML Block API 使用 HTML 上传文件关联 embed，不能据此定义标签。 |
| notion_web_embed | `<web-embed url="…" title="…"/>` | 本地 URL 容器；已有 Typora/raw HTML iframe 是另一路有依据的编码。 |

直接依据：[Working with markdown content 的支持表](https://developers.notion.com/guides/data-apis/working-with-markdown-content#block-type-support)明确将 Bookmark、Embed、Link preview、Breadcrumb 列为 `<unknown url="…" alt="…"/>`。仅 [Block API](https://developers.notion.com/reference/block)有对应功能不够。unknown 适用于有真实 Notion 块 URL 的导入内容，不允许为本地对象伪造远端 URL，也不能以空占位符替换已有正文。

## Meeting notes 是混合情况

官方[支持表](https://developers.notion.com/guides/data-apis/working-with-markdown-content#supported-block-types)明确列出 **`<meeting-notes>`**，不能把标签名本身判为自定义。此前仅看 Enhanced Markdown 格式参考漏掉了这个依据。

当前 notion_meeting_notes 另外约定 title/audio/language/transcript 属性、任意 block 子内容及本地转录服务；完整字段和子结构尚未核实为官方 Markdown。需要官方样例或授权 API 往返语料确认，不能把 API JSON 直接搬成 XML 属性。

## 官方标签中附加的项目属性

| 位置 | 本地扩充 | 活动写入位置 |
| --- | --- | --- |
| column | width-ratio | [column-widths.ts](../../src/blocks/column-widths.ts) 的 columnWidthTransaction 拖宽后写正文；API width_ratio 不证明 NFM 使用 width-ratio。 |
| mention-date | reminder、reminder-offset、date-format、time-format、time-zone | [date-mention.ts](../../src/features/dates/date-mention.ts)、[date-view.ts](../../src/features/dates/date-view.ts)、[object-properties.ts](../../src/editor/object-properties.ts) 会新生成字段；时间写入 start 的 ISO 日期时间与官方 start/startTime/timeZone 契约也需核对。 |
| synced_block / reference | id、auto-refresh、source-revision、snapshot-hash 及本地块定位地址 | [object-views.ts](../../src/editor/object-views.ts)、[synced-source.ts](../../src/blocks/synced-source.ts) 将本地同步身份、CAS、快照控制信息写正文；官方 synced 标签不证明本地协议。 |
| 折叠内容/标题 | open="true/false" | [notion-nodeviews.ts](../../src/editor/notion-nodeviews.ts) 点击折叠会写 nfmAttrs，再进入正文；HTML details 的布尔 open 与该字符串协议、标题尾属性不是一回事。 |

以上没有各自独立的 local_* 开关，所以只检查扩展前缀会漏掉。官方参考：[Enhanced markdown format](https://developers.notion.com/guides/data-apis/enhanced-markdown)。表格 col width、align 等在其他编码可能合法，但映射到 NFM 的完整支持另待核实，不将合法 HTML 属性直接当作官方 NFM 属性。

## 旧自定义指令仍有写入器

- `:::nest` / `:::children` / `:::endnest`：[codec.ts](../../src/markdown-engine/codec.ts) 的 writeBlock 及 [editor-markdown.ts](../../src/document/editor-markdown.ts)。新建普通父子块，CommonMark + notion_nesting 仍生成这些指令；Notdown 已生成官方 Tab 缩进，不能混为一谈。
- `:::columns` / `:::column` / `:::`：editor-markdown 的 columns 分支及旧解析器。形似 fenced Div 不表示上游定义了分栏语义；现代路径能使用官方 columns 标签，但历史写入器仍存在。
- `::page{id="…"}`：editor-markdown 的 child_page 分支、[markdown.ts](../../src/document/markdown.ts) 的旧读取规则。应改走已有 page/mention-page 或相应方言链接编码。

旧文件原文保留、围栏内字面文本和未知语法恢复应继续保留；不允许新生成不等于允许删除用户已有内容。

## Markdown Lab 也有独立自定义插件

`notdown-bookmark` 围栏内 JSON 被解释为书签卡片，见 [model.ts](../../src/markdown-lab/model.ts)、[plugins.ts](../../src/markdown-lab/plugins.ts)。[main.ts](../../src/markdown-lab/main.ts) 初始 draft 默认 plugins 为 bookmark，示例也带该围栏。代码围栏本身是标准语法，但该专用渲染协议由项目定义，独立于原生编辑器的十个对象开关。

## 不应误判的项目

- 官方 NFM 的 callout/details/columns/media/mentions/colors/underline、unknown，以及有依据的 Pandoc/MMD/Typora/Obsidian 语法应保留。实现偏差与自定义语法是两类问题。
- sourceFingerprint、syntaxForm、PM 节点、DOM data-*、CSS 类、拖拽 MIME 等不写入正文的内部结构不算新 Markdown 语法；审查重点是持久输出。
- YAML 语法已有依据，页面 id/title 等应用字段与未知用户属性仍按现有约束保留。
- `#page/<uuid>` 与 `person://<uuid>` 是本地地址/身份协议，不是新标签定界语法；仍需说明跨应用不可解析的边界，不能冒充 Notion 工作区身份。

## 验证与整改边界

临时内存探针：将十个对象样例解析后清除顶层原文复用字段，再构造新文档序列化。结果保存在 `test-results/custom-syntax-audit.json`，十项全部默认启用且可以重新生成载体；Meeting notes 按上述官方标签/未核实契约区分。另复现 CommonMark 新父子块写 nest 指令，而 Notdown 写 Tab 缩进。没有操作用户文件。

本轮完成排查及规范约束更新，**运行时尚未完成去自定义格式整改**。整改顺序：停止默认与新增路径生成无据编码；能用标准语法表达的对象共用既有写入器；无法完整表达的能力标为缺口，不补造协议；视图状态和本地服务状态不得未经依据继续混入正文；旧文件保留可恢复内容，迁移逐类验证信息完整性，避免全局替换。验证需覆盖新建、编辑、保存、重开、禁用和代码围栏，普通源码 roundtrip 不能替代上游兼容性验证。
