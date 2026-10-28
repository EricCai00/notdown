# Markdown 正文格式 v0.4：方言配置与 Notion Enhanced Markdown

2026-10-27 官方载体收敛：Notdown 新建和编辑的 Web embed/书签使用官方 source 与题注正文；Tabs 标题写正文，活动页签不写入；会议标题、笔记、转录使用官方分区，音频/语言统一放现有 meeting-config；有效旧列宽统一为 ratio 百分比，能无损核验的日期时间统一为官方分列。折叠 open 不再作为正文状态写入。未知原文保持可恢复；本次用户明确授权迁移 Default 与 Notion test，其他库不自动迁移。保留项目及无法用官方形式表达的原因见[自定义扩展说明](reference/NOTDOWN-EXTENSIONS.md)，本修订覆盖下文相冲突的历史写法。

## Notion Markdown 版本

新 Notion API 导入显式保存 `syntax.notionVersion: "v2"`，使用官方 [Notion-flavored Markdown](https://developers.notion.com/guides/data-apis/notion-flavored-markdown) 的 CommonMark/GFM 正文、统一容器与行内标签。API header 的版本与 Markdown 的 v2 参数独立。未标记的旧文件沿用原有读取方式，不批量转换。

v2 保存时使用 `source` 媒体属性、连字符的同步块/目录标签、`mention`/`date`、Meeting notes 分区等对应语法；保留未编辑的原始字节及未知属性。Mail 是可编辑正文，Custom block 与外部集成是明确的引用节点。Notdown 的模板按钮、面包屑、本地同步 ID 仍属于补充语法，官方 `notion-markdown` 不因开关而启用它们。导入恢复、附件保存与未实现的云端能力见[Notion 导入](features/NOTION-IMPORT.md)。下文历史 Enhanced Markdown / MCP 记录用于兼容旧文件。

2026-09-27 表格列宽：Notdown 的 Markdown 表格支持 `: {tbl-colwidths="[30,70]"}`，使用 Pandoc 的表格属性容器与 Quarto 的显式相对列宽数组，来源为 [Quarto Column Widths](https://quarto.org/docs/authoring/tables.html#column-widths)。数组长度须等于逻辑列数，每项须为有限正数；按比例呈现，拖动后归一化为百分比并保存到正文。仅当 Notdown 的 `table_attributes` 启用时新写该属性；官方 Notion 表格仍使用原生 `<col width>`。MMD 的 `[题注][ID]`、题注位置、合并单元格及未知属性保留，属性独立成行时不会创建空题注或覆盖原题注。未改内容原文保留；非法、数量不匹配及 `auto`／布尔值目前仅原文保留，不赋予列宽布局语义。增删、复制、移动列和拖动行列数量时同步有效列宽数组；不批量迁移文件，纯 MMD／GFM 等其他方言不新增该扩展语义。

2026-09-27 嵌入入口区分修订（覆盖下文“独立 HTML 插入入口已移除”的说明）：HTML embed 新建使用官方 `<embed src="assets/…html">说明</embed>`，上传与替换只选择 HTML 文件；Web embed 新建使用 `<web-embed url="…"/>`，只接受 HTTP(S) 网址。二者共享节点类型但保留各自表示。Notdown 可为 HTML `<embed>` 补充 title/width/height/align；这些属性仅在 Notdown 启用，官方 notion-markdown 遇到扩展属性时保留原始源码而不赋予布局语义。已有 HTML 附件 `<web-embed>` 不批量迁移，继续按原载体写回。旧内联正文 `<html-embed>` 不恢复。

2026-09-27 嵌入展示修订：Notdown `<web-embed>` 增加可选 `caption`、`width`、`height`、`align`，沿用现有 XML 属性编码；width 为像素或百分比，height 为像素，align 为 left/center/right。标题 `title` 用于 HTML 文件名，上传时填入原始文件名。属性与未知字段保留，不批量改写已有页面。官方 `<embed>` 的说明仍写入标签正文，不新增布局属性；Typora `<iframe>` 的调整仅写原生 width/height。交互激活、菜单、全屏均为临时视图状态，不写入 Markdown，也不更改沙箱权限。

2026-09-27 AI block：Notdown 专用 `<ai-block>` 沿用 prompt/model 属性，增加可选 generate、using、context、search 配置。context 与 prompt 内提及复用已有 mention-page/user/date 语法，作为 XML 转义的属性文本保存；未知字段与旧正文保留。官方 notion-markdown 不启用。详见 [AI block 契约](features/AI-BLOCKS.md)。

2026-09-27 MCP 规范修订：官方边界包含公开网页与 `notion://docs/enhanced-markdown-spec` 的明确语法。Notdown / Notion Markdown 同时支持标题首行式 Tabs、分区 Meeting notes、HTML 附件 `<embed>`、Folder/Database 引用、Agent 提及、表格 col width、日期 endTime、同步 notice，以及两种 dollar 行内公式、代码内 br、压缩 URL 引用。下文旧的“Agent/Database 已移除”及“Tabs 仅本地”记录由本次修订替代。[完整语法与实现边界](reference/NOTION-MCP-SYNTAX.md)。

2026-09-27 嵌入文件修订（覆盖下文旧 HTML 嵌入说明）：取消 `<html-embed>` 标签及独立 HTML 插入入口，统一使用 `<web-embed url="…"/>`。上传／拖放的 HTML 通过 `createVault.uploadAsset` 保存到 `vault/assets/*.html`，正文只写 `assets/…html` 引用，不内联代码。本地附件预览禁用脚本与同源权限；HTTP(S) 预览维持远端沙箱策略。Typora `<iframe>` 和官方 Notion `<embed>` 保留原生编码；自定义 `web-embed` 仅限 Notdown。已有文件可显式执行 `node --import tsx scripts/migrate-html-embeds.ts <vault-directory> --apply`：旧正文提取到附件，页面按 `baseRevision` 更新并保存历史，冲突保留分支且不强制重试；跳过代码围栏、缩进代码和未知原始 HTML 容器，异常边界停止。未知属性保留，旧 `url` 属性若与新附件引用冲突则转存 `data-html-embed-url`（重名追加 `-original`）。不提供旧标签运行时兼容；未迁移的旧标签按普通未知源码处理。HTML 相对资源与 Notion HTML 文件下载尚未实现。

2026-09-27 页面入口修正：官方 `<page url="…">标题</page>` 直接解析为 `block.child_page`；Notdown 专用 `<page-link url="…">标题</page-link>` 解析为 `block.link_to_page`，即使两者指向同一个直接子页也不会混淆。父子关系不再决定块类型，解析不创建或移动资源。`<mention-page>` 保持行内提及。官方 `notion-markdown` 不启用 `page-link`，显式开关也不能越界；原有 `<unknown>` 保留，不用其源块 URL 猜测目标页。旧 `role` 仅作为未知属性保留，不批量迁移用户文件。Notdown 导入可按 Block API 的真实类型恢复支持的 unknown 块，完整原始 Markdown 和 JSON 同时归档，详见[导入说明](features/NOTION-IMPORT.md)。

2026-09-26 行内脚注：启用 `inline_notes` 时，Pandoc `^[…]` 在页面视图投影为编号引用和单段底部注释，与 `[^id]` 共用编号、预览和跳转；保存仍还原原位置的 `^[…]`。跨行正文与行内链接可解析；页面编辑拒绝扩展为多个段落或块。`inlineNote` 与生成的引用标识仅用于可恢复的编辑器投影，不写入文件；方言边界和已有原文保留规则不变。详见[脚注说明](features/FOOTNOTES.md)。

2026-09-26 图片交互：沿用 Markdown 图片及已有花括号属性载体，宽度复用 `width`。Notdown 为图片块补充 `align="left|center|right"` 和 `crop="x,y,w,h,ratio"`；前四项是相对原图的归一化裁剪矩形，第五项是原图宽高比。裁剪只改变呈现，不生成或覆盖附件。仅 `notdown` 且 `link_attributes` 开启时可通过工具栏写这些布局属性，其他方言不激活对齐／裁剪补充语义；`notion-markdown` 即使显式开启扩展也不新增这些语法。未修改原文、图片 URL/title、未知属性和代码围栏保留；调整通过文档事务和既有 CAS 链路保存，不批量迁移。详见[图片控件](features/INLINE-OBJECTS.md#image-controls)。

2026-09-25 Quarto：新增 `syntax.variant: quarto`；Notdown 同时识别 Quarto 的 `{python}`、`{julia}`、`{ojs}` 可执行围栏和 `` `{language} expression` `` 行内表达式，分别使用 `block.executable_chunk` / `inline.executable_expression`。R 与这些语言共用同一种可执行块和行内表达式节点，继续使用已有 R 执行器。`#|` / `//|` 选项及未知语法原文保留，普通语言围栏不运行。Python/Julia 经 Jupyter kernel，OJS 使用隔离的 Observable 响应式模块；所有结果为窗口临时状态。仍保存 `.md`，支持 `.qmd` 导入，不迁移旧文件、不向正文注入应用 YAML。方言范围、依赖和未实现的发布功能见 [Quarto](features/QUARTO.md)。

2026-09-25 R Markdown：`syntax.variant: rmarkdown` 复用 Pandoc Markdown 规则，knitr `{r ...}` 与行内 R 分别解析为统一的 `block.executable_chunk` / `inline.executable_expression` 类型，原 Markdown 语法和未知选项保留，两者均有 R 高亮。行内表达式为可编辑 `text*` 内容，原文属性只用于保留未修改的分隔符和空白；序列化使用当前表达式文本。显式运行使用本机 R/knitr/rmarkdown，Notebook 输出和 Knit 只读结果均不写回正文或 metadata；返回编辑恢复原始代码。导入 `.Rmd` 自动选择该方言。详见 [R Markdown](features/R-MARKDOWN.md)。

2026-09-24 存储修订（覆盖下文应用 YAML 的历史说明）：完整 `pages/*.md` 是 API body 与源码模式内容；通用页面属性集中保存在 `vault/metadata.json`。旧应用 YAML 通过显式迁移流程移入统一 JSON，先完整备份再移除应用头部；后面的正文保持原字节。文档自己的 YAML / Pandoc title block 继续覆盖 JSON 默认值，不再生成或隐藏应用 YAML。版本、历史、冲突和中断恢复同时覆盖 Markdown 与对应 metadata。详见 [Vault metadata 契约](features/VAULT-METADATA.md)。

2026-09-24 引用统一：页面提及、Wiki 和 Markdown 内链统一为 Internal link；菜单区分页面链接与位置链接。保留原有编码与显式标签，位置覆盖标题、Obsidian 块／列表项 ID 和锚点。官方 Notion 方言仍不解析 Wiki／块 ID。详见[页面与位置链接](features/INTERNAL-REFERENCES.md)。

2026-09-24 行内对象修订：Citation、Abbreviation、Glossary、Metadata variable 和 CriticMarkup 增删替换提供按方言控制的插入入口，复用原编码，不新增产品块类型。MMD 专属语法仅在 MultiMarkdown 与 Notdown 可用；Pandoc citations、PHP abbreviations 受各自 reader 边界限制，显式开关不能绕过。Notdown 默认汇集已有扩展。MMD 书目与脚注分别编号，原引用键和未使用定义保留；题注与表格交互沿用原编码。详见[本地对象契约](features/INLINE-OBJECTS.md)。

2026-09-24 Obsidian 默认值说明：`syntax.variant: obsidian` 默认不开启 Notion 扩展，但仍提供支持的可选扩展开关，显式配置及旧版别名继续生效。Notdown 专用补充编码和已有方言边界不变。已有源码和配置保留，不迁移用户内容。

2026-09-24 Notion 边界修订：官方 `notion-markdown` 的图片只在独立媒体段落解析；段落、标题、列表首行、span 和表格富文本中的图片语法，以及尖括号／裸 URL 自动链接均不启用。普通 `[text](URL)`（包含片段目标）和 `<mention-page>` 保留；不解释 Wiki 源码，不生成标题 slug。普通标题带子块不再静默转 toggle；有序任务、波浪线围栏、`<th>`、图片 title 和 small-caps/native span 保留源码。`[^URL]` 仅识别带 scheme 的 URL 引用，不把 `[^label]` 当作引用 URL；引用遵循 `notion_mentions` 开关。详见[本轮审计](audits/NOTION-BOUNDARY-2026-09-24.md)。

2026-09-23 Raw Source 归类：`raw_attribute` 开启时，块级 `{=html}` 与裸 HTML 共用 HTML block 对象和预览／源码编辑，行内对应 Inline HTML；其他格式（含 `latex`、`openxml`、MMD `*`）及已有 raw TeX 归入 Unsupported，保留完整源码、格式标记及原有位置，不执行或转换目标格式。内部保留独立语法载体以维持原编码，未修改正文不迁移。`raw_html` 与 `raw_attribute` 仍各自控制相应语法；官方 `notion-markdown` 的边界不变。

2026-09-23 代码块交互：页面代码块提供语言搜索/切换、复制和 `Wrap code` 显示开关。换行只改变视图，不插入换行符、不改变 Markdown。Notion Block API 的代码块有 caption，但官方 Enhanced Markdown 的代码围栏只定义语言与正文，未定义 caption 编码。`syntax.variant: notdown` 且启用既有 `fenced_code_attributes` 时，单行纯文本 caption 复用 Pandoc 围栏属性，如 `` ```python {caption="说明"} ``；其他围栏属性和原文保留。`notion-markdown` 不新写或解释该属性，遇到带 caption 的围栏保留可恢复源码；页面菜单提示切换到 Notdown。其他 Markdown 方言仅在其 `fenced_code_attributes` 生效时可编辑 caption。本地 caption 不等同于 Notion API 的富文本 caption，无云端往返承诺。

2026-09-23 脚注展示：`[^id]` 与 `[^id]: 正文` 的文件语法不变。页面将定义集中显示在一条横线后的文末区域，按首次引用顺序编号，重复引用复用编号，导入时已有的未引用定义保留在后；原 ID、定义原位置和未知内容不因显示排序而改写。`footnote_anchor` / `footnote_section` / `footnoteKey` 仅为编辑器呈现信息，序列化前还原，不写入 Markdown 或 YAML。定义可编辑，不作为可拖拽的独立页面块。页面编辑中删除最后一个引用同步删除其定义并可撤销；源码编辑不自动清理定义。插入时填写正文或复用已有定义，引用悬浮显示正文。脚注支持按当前方言启用的 Markdown 多块内容，菜单不提供产品容器或嵌套脚注；规范来源和测试边界见[脚注说明](features/FOOTNOTES.md)。

2026-09-23 最终边界（覆盖下文历史说明）：Notdown 集合已有 Markdown 方言与 Notion。自定义正文语法仅用于补足官方 Enhanced Markdown 不支持的 Notion block、已有 block 的属性、inline 和 style，且只能在 `syntax.variant: notdown` 启用；`notion-markdown` 仅启用官方文档定义的语法，显式扩展开关也不能越过此边界。能用已有方言表达的内容复用该方言，不能另造重复协议。旧文件和未知字段必须可恢复保留，不批量迁移用户内容。 `local_figure` 已移除，旧自定义指令仅原文保留；Lab 专用围栏已停用。日期提醒/格式、列宽、折叠 open、本地同步参数属于 Notdown 专用补充属性，官方 variant 不解释、不新写。官方日期使用 start/end/startTime/timeZone。复杂表格使用已有 Pandoc grid table。详见 [整改清单](./audits/CUSTOM-SYNTAX-AUDIT-2026-09-23.md)。

2026-09-23 People：本地联系人使用独立 `people/<uuid>.yaml`；正文沿用 `<mention-user url="person://<uuid>">后备姓名</mention-user>`，`person://` 是 Notdown 本地身份，不等同于 Notion 用户的 `user://`。改名不批量改写正文，编辑器按稳定 ID 显示当前姓名，离线导出／联系人文件缺失时保留后备姓名；删除设置 `deleted: true`，已有引用与联系人文件可恢复。联系人更新、删除、恢复经 `createVault.people` 使用 `baseRevision`，历史与冲突保存在 `.history/people/`，未知 YAML 字段和注释保留。代码围栏、未知提及属性和已有外部用户引用保持原规则；详见 [People](./features/PEOPLE.md)。

2026-09-22 内容合集修订：`syntax.variant: notdown` 在 Notion 结构边界上接入项目现有 Markdown 内容扩展，H5/H6 保留；`notion-markdown` 不变。`[^label]` 在 Notdown 默认作为脚注引用，容器内混合子块通过各自编码写回；未知属性与未改原文保留。默认内容扩展、语法优先级和服务边界见 [Notdown 内容合集](./reference/NOTDOWN-SUPERSET.md)。本条覆盖下文将 Notdown 等同于原 Notion codec 能力范围的历史说明。

2026-09-22 页面元数据展示：Properties 折叠区以图标和摘要呈现页面 YAML 属性及正文开头已识别的 YAML / MultiMarkdown metadata、Pandoc title block，点击直接打开带高亮的代码编辑器。源码提交校验单一元数据边界并作为一次可撤销事务；原节点继续属于同一个 ProseMirror 文档，源码顺序和保存载体不变。Pandoc title 与外层页面 title 双向联动，编辑页面标题只改标题块第一字段，保留作者、日期及正文；已有不一致页面以非空有效 Pandoc title 为准通过 CAS 更新页面标题。YAML / MMD 的同名 title、所有 author 等字段不合并。页面图标写既有 `icon`，空字符串表示移除；封面继续写 `properties.cover`，不新增正文标签。

2026-09-23 封面图库与位置：内置 Gallery 选择使用稳定的 `/page-covers/<文件名>` 路径，上传封面继续使用当前知识库的 `assets/` 路径；外部 HTTP(S) 图片地址仍可用。纵向位置写页面 YAML 的 `properties.coverPosition`，为 0–100 的数字，缺省按 50 居中；更换封面时清除旧位置。两者均是页面属性，与正文 Markdown 方言无关；旧封面地址、未知 YAML 字段和正文保持原样，保存仍使用 `baseRevision`。

2026-09-22 日期交互修订（2026-10-26 补充独立时间字段）：继续使用 `<mention-date start="YYYY-MM-DD" end="…"/>`；`<mention-date/>` 是可点击的日期空态。包含时间时沿用原有 ISO 日期时间及 UTC 偏移，或官方独立日期／时间字段（v2 为 `<date start="…" start-time="…" time-zone="IANA_TZ"/>`）；编辑保留原载体。`reminder` 沿用本地提醒的绝对 ISO 时间；本地可选 `reminder-offset`（相对 start 提前的分钟数，无时间时以当日 09:00 为基准）、`date-format`（relative/full/iso/us/eu）、`time-format`（12/24）和 `time-zone`（local、Z、固定偏移或 IANA 名称）。独立日期字段的 `timeZone` 沿用官方时区载体，不另写重复时区属性。设置偏移后日期／时间／时区变更重新计算提醒，按该日期的时区规则解析，不接受夏令时跳过的当地时间；重复时间选择第一次。导入的独立 reminder 时间在用户未选择相对提醒前原样保留。相对日期显示根据 start 动态计算，不把 Today 写成日期真相；原标签文字和未知属性保留，未编辑日期不迁移。提醒和持久化格式选项只在 Notdown 启用；官方方言的格式仅在视图会话生效，并非完整实现 Notion 的日期编码或通知服务。

2026-09-22 嵌入修订：HTML 文档继续使用 `<html-embed>`，正文中的 `&`、`<`、`>` 按 XML 转义，包含代码围栏的 HTML 仍按文本读取；`<html-embed/>` 表示待输入的空块。新增本地 `<web-embed url="https://example.com" title="…"/>`，`<web-embed/>` 表示待填写链接，属于 `local_web_embed` 扩展，仅在 Notdown 可用并默认开启。两者均保留未知属性；HTML 上传读取文件内容写入正文，不复制其相对路径资源。HTML 使用禁用脚本的 sandbox iframe；Web 仅预览 HTTP(S) URL，禁止同源权限。已有 Typora `<iframe>` 沿用原载体和未知属性，不转换成新标签。编辑通过 ProseMirror 事务与现有 CAS 保存，不写缓存块 JSON。

2026-09-22 Button 修订：`local_button` 的本地 `<button>` 标签新增 `icon`、`variant` 和 XML 转义的 JSON `actions`；旧 `action/target` 及未知字段保留，不批量迁移正文。未闭合模板边界禁止执行，正文变更仍走单次可撤销事务和页面 CAS。它不是 Notion 官方自动化编码，详见 [Button 本地契约](./reference/LOCAL-OBJECTS.md#button)。

2026-09-22 方言边界修正：新增 `syntax.variant: notdown`，沿用 Notion-flavored Markdown 的语法与 `bodyFormat: notion-markdown`，默认开启全部十类 Notdown 块扩展；显式关闭值仍优先。上游方言仍按各自规范定义默认值，这些项目块默认关闭。`local_*` 仅保留为已有配置的兼容键，界面改称 Notdown blocks。选择方言或开关不会改写正文；旧内容、未知字段和未知配置均保留。详见[方言核对与扩展说明](./reference/DIALECT-CONFORMANCE.md)；下文历史说明如与之冲突，以此修订为准。

2026-09-21 元数据修订：MMD metadata 与 YAML front matter 归为一个产品对象，各自保留编码规则。MMD 使用顶格 ASCII 键和纯文本值，键忽略大小写/空格，支持可选分隔符及多行值；不按完整 YAML 转换类型。正文 metadata 不覆盖页面 YAML。Database reference 对象及专用节点已移除，已有标签归入 Unsupported 原文保留。详细规则与其余表外格式依据见[元数据与兼容格式说明](./architecture/METADATA-AND-COMPATIBILITY.md)。

2026-09-22 目录与配置补充：12 个 `notdown_*` 键统一改为 `notion_*`；旧键兼容读取，新旧并存时新键优先，未知键保留。配置经编辑会写规范键，不批量改写知识库，方言默认值不变。Block Explorer 的对象／方言／扩展双向链接，103 个 Markdown 扩展有本地执行路径，12 个 Outside Markdown scope 项排在最后。详见 [分类与命名说明](./reference/CATALOG-RELATIONS.md)。

2026-09-21 对象层补充：Callout 与 Alert 共用 `callout`，三种 TOC 写法共用 `table_of_contents`。编码来源保留在编辑器属性 `syntaxForm`，TOC 范围使用 `minLevel/maxLevel`；这些不是新页面 YAML 字段或独立持久格式。编辑原块沿用原编码，未修改原文保持不变。`alerts/notion_callouts` 和 `toc_directives/notion_toc` 仍分别控制相应写法，不因节点合并互相替代。新建 Callout 在支持 alerts 的非 Notion 方言使用提示语法，其他可用情况使用原有标签。完整对象边界见 [对象 Roadmap](./architecture/CONTENT-OBJECT-ROADMAP.md)。

新页面默认采用 [Enhanced Markdown](https://developers.notion.com/guides/data-apis/enhanced-markdown)，行为同时参考 [Working with markdown content](https://developers.notion.com/guides/data-apis/working-with-markdown-content)。Notion 格式核对日期：2026-09-12。这是 Notion Markdown API 的格式，与界面「Markdown & CSV」ZIP 导出不同。2026-09-15 增加可选 `syntax` 配置；下文块语法描述适用于 Notion 方言，其他原生方言与扩展见 [编辑核心设计](./architecture/MARKDOWN-ENGINE.md)。

Notion 方言原有对象使用对应官方标签；新增 Tabs、AI block 等另有本地编码，不能全部视为 Notion 官方语法，见 [本地对象与服务](./reference/LOCAL-OBJECTS.md)。[旧语法](./reference/FORMAT-LEGACY.md) 保留兼容读取。CommonMark/GFM 启用层级扩展时使用 `:::nest` 表示普通块层级。Notion 中 `[[...]]` 可输入页面提及，修改后使用 `<mention-page>`；CommonMark/GFM 可独立启用双链。

## 文件和迁移

网页书签继续使用本地 `<bookmark url="https://example.com" title="Title" description="Description" icon="https://example.com/favicon.ico" image="" caption=""/>` 编码，空态为 `<bookmark/>`。`icon` 是可选的网站图标 URL；创建／手动刷新所得标题、描述、图标与图片通过同一次正文更新保存，不作为后台缓存替代 Markdown。未知属性与未修改原文仍保留，代码围栏中的同名标签不解释为书签。该块受 `local_bookmark` 扩展开关控制，并非 Notion 官方 Enhanced Markdown 标签。

页面是 UTF-8 的 `vault/pages/<uuid>.md`，YAML 后为正文：

```yaml
---
id: 550e8400-e29b-41d4-a716-446655440000
title: 示例页面
parent: null
icon: 📄
bodyFormat: notion-markdown
syntax:
  version: 1
  variant: notion-markdown
  extensions: {}
properties:
  status: 草稿
---
```

Notion 规范定义正文；页面稳定 ID、唯一父页和 MyBase 属性继续放在 YAML，不混入正文。元信息修改保留未知 YAML 字段和注释。

侧栏操作使用可选布尔字段 `favorite`（收藏）和 `trashed`（回收站），缺省均为 false。回收站只更新目标页面元数据，原 Markdown 文件保留；正常页面列表隐藏该页及其后代，恢复父页后后代重新显示，单独进入回收站的子页仍需恢复。副本使用新 UUID，保留正文、语法、属性及未知 YAML 字段，重置收藏／回收站状态，不递归复制子页或重写正文中的页面引用。所有修改仍需 `baseRevision`。

新页面默认 `bodyFormat: notion-markdown`。没有 `syntax` 的 `markdown` 页面使用 CommonMark，其他特性需显式激活；单换行继续属于同一段落。**打开源码或编辑旧页不再自动转换为 Notion。** 单纯切换视图不修改正文或元信息；首次实际编辑会记录推导出的配置。

`syntax.version: 1` 标记本代配置结构；`variant` 选择默认规则，`extensions` 的布尔字段覆盖默认值。已知十一种方言均已接入原生解析，仅 Pandoc Markdown、CommonMark X 与 Legacy GitHub 预设采用 Pandoc 3.11 快照默认值。`notion-markdown` 对应 `bodyFormat: notion-markdown`，其他方言对应 `markdown`。变更配置必须携带完整正文并经过同一次 CAS；正文可以保持逐字不变。未知配置字段和未知／待实现扩展开关保留，后者目前不执行。API 可提交 `syntax: null` 移除此字段，恢复 `bodyFormat` 对应的默认配置，仍须携带正文。

切换方言是重新解释相同字节，可能改变块边界；不会自动把一套语法翻译成另一套。历史与冲突分支保留各自格式、配置和正文。关闭包含内容的块扩展时使用原文块回退；在源码视图继续编辑，开启扩展后重新解析恢复。含被关闭特性的复合块目前整体回退，以保留可恢复内容。

可选字符串 `sidebarOrder` 保存侧栏同级顺序，值为十进制数字组成的位置键（不是数值）。读取时结合稳定 ID 形成确定顺序；缺省使用稳定 ID 排序。拖拽只更新被移动页面的 `parent` 与位置键，不批量改写同级页面或正文；移动整棵子树时后代的父关系与文件保持原样。来源或目标区域版本变化会保留冲突分支，不强制重试。拖到 Trash 仍只是应用回收站，不直接调用系统回收站。

## Markdown 方言补充块

`alerts` 扩展保留各方言已有的基础 `> [!NOTE]` 支持。紧跟 `]` 的 `+`（默认展开）、`-`（默认收起）以及同行自定义标题属于 Obsidian callout 语法，仅 `obsidian` 与兼容它的 `notdown` 集合方言接受；其他方言即使显式启用 `alerts`，也不将这些写法识别为提示块，按普通引用处理并保留原文。方言默认值不变，不新增独立插件。

Notdown 的 **GitHub-style Alert** 直接插入 `> [!NOTE]`，不显示插入表单。图标菜单展示类型的图标、颜色和名称，可随时更改类型并启用或取消 Collapsible；标题直接编辑，标题后的空心箭头向右表示收起、向下表示展开。更改类型保留标题、正文及折叠状态。`Callout` 入口仍写 `<callout>`，两种编码共用内部节点但不互相转换。Obsidian 和 Notdown 支持全部 27 个内置关键词及别名（忽略大小写），其他启用 alerts 的方言仅识别五种标准大写类型。Notdown 五种标准类型沿用 GitHub Octicons 与配色，新增类型使用 Obsidian 官方图标及浅色主题配色；Obsidian 方言全部采用 Obsidian 配色。自定义标题按纯文本显示，未知类型保留原名称并使用 Note 外观。内部 `alertStyle` 由方言派生，不引入新的正文或 YAML 字段。

`raw_html` 显示 HTML 预览并保留标签原文；`definition_lists`、`footnotes`、`line_blocks`、`fenced_divs` 分别启用定义列表、脚注、逐行排版和 Markdown 容器。HTML 在十种 Markdown 预设默认开启，其他规则按方言取默认值，详见支持矩阵。HTML 只执行允许的显示规则；Div 保留未知属性，显示允许的 class、锚点及受限尺寸。Notion codec 尚未提供这五个独立开关。

正文开头的 YAML、Pandoc `%` 标题和 MultiMarkdown 键值标题块按相应扩展识别，原文保留；启用 metadata_values 时提供预览、字段和源码编辑，MMD metadata_variables 可在正文取值。不解释为页面属性，不改写文件外层的知识库 YAML。Typora／Obsidian 及产品附加语法见 [PRODUCT-SYNTAX.md](./reference/PRODUCT-SYNTAX.md)。Pandoc 三字段标题支持续行；任意位置元数据和全部上游输出控制语义不在本地编辑契约中。Strict 新增／修改代码块默认写成缩进代码；PHP Extra 支持反引号及波浪线围栏。原有块未修改时保留原写法，修改后只保证当前已实现语法范围内的语义；缩进代码不能表达语言属性。

语法示例、Pandoc 各方言的默认值、编辑方式与剩余缺口见 [块类型与实现边界](./reference/BLOCKS.md)。以下章节继续描述 Notion Enhanced Markdown。

## 块、层级与换行

以下缩进为实际 Tab（U+0009），不是四个空格：

```md
父块第一行<br>父块第二行
子块
孙块
另一个顶层块
<empty-block/>

- 列表父项
  - [ ] 子待办<br>同一任务的第二行
        普通文本子块

## 可折叠标题 {toggle="true"}

    标题的子块

> 引用第一行<br>同一引用的第二行
> 另一个引用块
```

解析时仍接受单个换行分隔普通块，空白行只用于源码排版，不产生额外空块。编辑写回保留已有顶层块间隔（含连续空行、首尾空白及 CRLF），新增或重写块的边界默认至少留一个空行；未修改的原有紧凑块不批量重排。复合容器内部重写时也在同级块间留一个空行，列表项之间仍用单个换行，父子层级继续使用 Tab；修改过的复合块内部多重空白可能规范化。代码围栏内部空行保持字面内容。`<br>` 对应 `Shift+Enter`；`<empty-block/>` 保留可编辑空块，也能作为空父块。普通 Markdown 没有任意文本块的父子语义，通用渲染器不会直接还原这个树。

每个列表项独立编辑，父项拖动携带子树，子项可单独移动。标题按官方规范使用 H1–H4，H5/H6 转为 H4；带子块的标题使用 `{toggle="true"}`。代码采用围栏，内部 Tab、标签和旧指令保持字面含义。

## 分栏、页面和附件

```md
<columns>
	<column>
		左栏内容
	</column>
	<column>
		右栏内容
	</column>
</columns>
<page url="#page/页面ID">子页面名称</page>
相关内容见 <mention-page url="#page/页面ID">页面名称</mention-page>。
![图片说明](assets/picture.png)
<audio src="assets/recording.mp3">录音</audio>
<video src="assets/demo.mp4">演示</video>
<file src="assets/archive.zip">附件</file>
<pdf src="assets/paper.pdf">论文</pdf>
```

启用本地 Link preview 扩展时还支持行内 `<mention-link url="https://github.com/owner/repo/issues/1">后备名称</mention-link>` 和块级 `<link-preview url="…"/>`。它们属于 Notdown 本地编码，实时外部内容不写入 Markdown；详见 [Link Preview](./features/LINK-PREVIEWS.md)。

插入菜单提供两栏，解析接受两栏以上及嵌套分栏；窄屏纵向排列。列间分隔线可用鼠标拖动调宽，只改变相邻两列，松开后提交一次可撤销事务；Esc 取消，双击恢复该组等宽，聚焦分隔线后左右方向键微调。宽屏列宽随容器按比例变化，窄屏隐藏调宽控件但保留比例。

2026-09-27 列宽修订：Notion 官方 MCP 的 `notion://docs/enhanced-markdown-spec`（通过官方 `fetch` 获取）已定义 `<column ratio="50">`，`ratio` 是占总宽的百分比，省略时默认等宽，更新时应显式设置所有列。[公开 REST 文档的 Columns 示例](https://developers.notion.com/guides/data-apis/enhanced-markdown#columns) 当日仍未展示该属性；此处依据 MCP 规范补充支持，不宣称已验证云端写回。

`notion-markdown` 与 `notdown` 均使用官方 `<column ratio="35">`。调宽时统一写所有列的 `ratio`，总和为 100（百分数四位小数，等价于比例六位小数精度）。完整有效的数值按总和归一化显示；缺失、非数字、非有限值或不在 `(0,100)` 内时，整组按等宽显示，原值仍保留，直到用户主动调宽。未知属性和未改正文保留；HTML 预览／导出使用同一比例。

旧 `<column width-ratio="0.35">` 仅在 Notdown 兼容读取，取值范围 `(0,1)`，不再用于新写列宽；主动调宽时移除该组旧属性并写 `ratio`。同组存在 `ratio` 时优先使用官方编码，不混用两种单位。未修改文件不迁移；`notion-markdown` 仍将旧本地属性作为可恢复源码保存。

`<page>` 为块级入口，`<mention-page>` 为行内引用。`url` 使用已有 `#page/<id>` 导航地址表示本地页，外部 URL 保留为外部引用。删除入口不会删除页面或改写 YAML 父子关系。光标进入页面链接时不展开源码。

上传生成 assets 相对路径；音视频显示播放器，文件和 PDF 提供链接。普通 `[文字](URL)` 仍是普通链接。

## 提示、折叠、格式和公式

`<callout>` 缺省 `icon` 时使用 💡；显式 `icon=""` 表示无图标，编辑和重新打开后保持。图标内容按纯文本保存和显示，不解析为 HTML。编辑器中的首段手柄代表整个 Callout，后续块保留独立操作。

```md
<callout icon="💡" color="blue_bg">
	提示内容，可以包含 **格式**。
</callout>
<details>
<summary>折叠标题</summary>
	子内容
</details>
<span color="red">重点</span>与<span underline="true">下划线</span>
整块底色 {color="yellow_bg"}
行内公式 $x^2$。
$$
x^2 + y^2 = z^2
$$
```

提示块和折叠内容可编辑；公式由本地 KaTeX 渲染，点击编辑 LaTeX。颜色仅使用规范的有限名称映射，不执行任意 CSS。

### 行内双颜色（2026-10-27）

Notdown 的颜色写入统一使用 Notion 的 `span color`：普通名称表示文字色，`_bg` 后缀表示背景色。双颜色使用嵌套标签，不另造背景属性：

```md
<span color="red"><span color="yellow_bg">红字黄底，可含 **粗体**</span></span>
<span color="blue_bg">仅背景色</span>
```

颜色使用 `gray / brown / orange / yellow / green / blue / purple / pink / red` 及对应 `_bg` 名称；不执行任意 CSS 或十六进制值。嵌套 span 按通道继承，内层指定的同通道覆盖外层。

Notdown（包括未标记 v2 的页面）及 Notion Markdown v2 可分别设置两个通道。`Default text` 仅移除文字色，`Default background` 仅移除背景色，`Clear formatting` 同时清除两者；操作可撤销。Notion Markdown v1 的菜单仍按原有单颜色能力处理。

自定义正文属性 `bg_color` 已移除语义支持，不提供兼容解析；含该属性的 span 按字面源码保留，不赋予颜色语义。内部编辑模型仍有独立背景通道字段，这不是正文语法。不更改块颜色、表格颜色或页面 YAML。

这里保证本地嵌套标签的显示和保存，不等于 Notion 远端往返保证：公开 Rich Text 的 `annotations` 只有一个 `color` 枚举字段，块颜色则属于另一层。整块背景配行内文字色可分别表达；没有完成真实 Markdown 写回测试时，不承诺同一行内范围的双颜色都能被 Notion 接受和返还。

本次按用户明确授权迁移 Default 与 Notion test 的活动正文，先完整备份，再按源码标签边界转换并通过 `createVault.update`、`baseRevision` 写入；代码示例和已有导入归档不转换。其他知识库不自动迁移。见[迁移与当前自定义写法审计](audits/CUSTOM-SYNTAX-AUDIT-2026-10-27.md)。

## 表格和目录

普通管道表格、Notion 表格标签与 MultiMarkdown 表格使用同一个结构化 table 节点。syntaxForm 只记录编码来源，对应 pipe_tables、notdown_tables、mmd_tables 开关。MMD 的表头、分组、colspan/rowspan 和题注保存在行、单元格及 table_caption 中；直接编辑后写回 MMD。题注上下位置和显式引用标签保留；原有多行单元格中的列表、代码块保留结构，代码内 Enter 写普通换行。未修改表格继续复用原文，禁用扩展不删除原文。当前支持单元格/题注编辑与 Tab 导航，尚无新增/拆分合并单元格的专用控件。

列表底层分为 bullet_list_item、numbered_list_item、task_list_item。bullet_list/ordered_list 是内部排列结构，任务项可位于任一分组；有序起始编号仍属于分组。显式类型转换可改变节点，拖动与缩进保留节点身份。Heading 继续共享节点，以 level/toggle 属性表达差异。

```md
<table fit-page-width="true" header-row="true" header-column="false">
	<colgroup>
		<col width="160"/>
		<col width="240"/>
	</colgroup>
	<tr>
		<td>名称</td>
		<td>内容<br>第二行</td>
	</tr>
</table>
<table_of_contents/>
```

单元格可编辑文字、行内格式和内部换行；Enter/Shift+Enter 均产生换行，不创建独立段落块。单元格内不提供 Slash 块插入或块类型转换，拖动以整张表格为单位。粘贴富文本时将块边界转换为内部换行；多块 Markdown 插入则保留为语法文字。历史多段单元格保留可读，不静默删除内容。Tab/Shift+Tab 在单元格间移动，末格 Tab 新增一行。保留列宽及表头属性；`td`、`tr`、`col` 上的 `color` 按单元格、行、列的优先级显示，编辑和 HTML 导出也保留。兼容官方示例的 GFM 管道表格，修改后写为 XML 表格。目录由同一正文的标题生成。

## 其他引用与边界

```md
<database url="https://www.notion.so/database-id" inline="true" icon="📚">资料库</database>
<mention-user url="user://user-id">成员名称</mention-user>
<mention-date start="2026-09-12"/>
<synced_block_reference url="https://www.notion.so/block-id">
内容快照
</synced_block_reference>
<unknown url="https://www.notion.so/block-id" alt="bookmark"/>
```

支持 user/page/database/data-source/date/agent 提及。数据库块保存现有数据库或数据源的引用及属性；本地 `url="#page/<host-id>"` 通过入口页的 `databaseId` 解析数据库，`inline="true"` 展示可编辑表格，非 inline 引用打开完整数据库。正文仍只保存引用，记录正文仍是页面 Markdown，字段、属性值和视图保存在知识库 metadata.json；远端引用不执行云端操作。`synced_block` 与 `synced_block_reference` 保存本地内容快照和来源，支持无 URL 的本体与引用的 notice，不代表 Notion 云端联动。

Notdown 本地同步复用上述标签及 `#page/PAGE_ID#block=BLOCK_ID` 引用；`id`、`source-revision`、`snapshot-hash`、`auto-refresh`、`auto-sync` 是仅 Notdown 生效的补充属性。新复制引用写 `auto-sync="true"`，旧文件不迁移。官方 `notion-markdown` 遇到这些属性保留整个块原文。来源更新必须携带已捕获版本，冲突暂停并保留双方内容；未打开页保留上次快照。见[同步块功能与边界](features/SYNCED-BLOCKS.md)。

既有 `<unknown>` 引用仍保留，不根据名称自动推断成书签或其他对象。未知标签、未闭合或非法容器保留原文，不解释为可执行 HTML。新的本地 bookmark、link-preview、breadcrumb、meeting-notes 等编码见 [本地对象与服务](./reference/LOCAL-OBJECTS.md)；会议转录可使用 Settings 配置的兼容服务。会议卡片的 `meeting-config` JSON 属性仅在 Notdown 启用，保存语言、音频、摘要指令及当前会议的菜单偏好；官方方言保持会话配置，不写自定义属性，详见[会议笔记](features/MEETING-NOTES.md)。本地 People 通讯录已接入，协作成员及自定义 emoji 资源目录未接入。

Enhanced Markdown 未修改时保留原文；编辑后未改动顶层子树保留原文，变更子树按规范序列化。旧格式转换会规范化缩进、围栏和分隔，完整旧版本保存在历史中。不承诺任意外部格式或整个 Notion 工作区无损互转。

## 共享解析与 AI

编辑器、源码、大纲、引用图、HTML 导出识别同一个 `bodyFormat`。HTML 导出保留分栏、提示、链接、颜色、表格和公式；附件仍为相对路径。

MCP 读页返回 `bodyFormat`；写页使用完整正文及读取时的 `baseRevision`。修改格式时同时提交转换后的正文，保留 `<unknown>` 与其他未知内容。MyBase 属性契约见 [MYBASE.md](./reference/MYBASE.md)。


2026-09-22 对象清理：Inline raw source 是正式内容对象，使用 Pandoc raw_attribute 编码；File transclusion 同时映射块级与行内载体。Inline media 节点及普通本地链接转播放器的规则已移除；`[录音](assets/voice.mp3)` 保持普通链接，音视频播放器使用已有块级媒体标签。Existing content 板块已移除，没有自动迁移用户文件。
