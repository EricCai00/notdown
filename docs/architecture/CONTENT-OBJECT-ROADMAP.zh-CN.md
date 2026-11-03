# Notdown 对象统一与实现 Roadmap

[English](CONTENT-OBJECT-ROADMAP.md) · **简体中文**

2026-09-27 修订：HTML embed 与 Web embed 合并为 `block.web_embed`，同时承载内嵌 HTML、URL 与 Typora iframe 编码。当前目录 79 项（41 block、2 metadata、32 inline、4 character）；以下历史数量以本次修订为准。

2026-09-23 修订：Raw Source 不再是独立对象。`{=html}` 合并到 HTML block / Inline HTML，其他格式和 raw TeX 归入 Unsupported；全部保留原编码和可恢复源码。当前目录共 78 项（41 block、2 metadata、31 inline、4 character），下文旧数量与归类以此为准。

2026-09-22。原 80 项对象清单加上用户要求的 Inline raw source，共 81 项：43 个 block、2 个 metadata、32 个 inline、4 个 character。对象身份独立于 Markdown 写法和 ProseMirror 节点；单一 ProseMirror 文档与原有 codec 继续工作，Markdown 文件仍是正文真相。

## 当前交付

- 全表语义注册、统一菜单、对象／方言／扩展双向链接；三种列表项各用独立底层节点，Heading 共享节点。仅保留有归属的子结构栏，字符类为文本能力。
- Callout 和 TOC 合并并保留编码来源；管道、Notion、MMD、网格、简单、多行表格共用模型，提供行列和跨度编辑。
- Tabs、手工书签／链接预览、Breadcrumb、HTML embed、图片题注、Example list、Native span、Small caps、Raw TeX；定义列表项操作、cover、元数据字段及行内属性编辑。
- AI block / Meeting notes 使用 Settings 配置的 OpenAI-compatible 服务。Button 提供本地动作；提醒在应用打开时运行；Synced block 支持本地刷新与 CAS 发布，本地编辑暂停自动刷新。
- 103 个 Markdown 扩展有本地执行路径；12 个 Outside Markdown scope 项排最后且不可启用。notdown_* 规范为 notion_*，旧键兼容，新键优先，不批量迁移页面。
- MMD / YAML 共用产品身份但编码不同；Mention agent、Inline media、Database reference 对象和 Existing content 已移除，Inline raw source 保留。旧数据库和未知输入仍保留原文。

## 能力与边界

status 表示逐项描述的本地契约；stage 保留 roadmap 实施分组，不表示仍待实施。direct = 直接编辑，source = 源码编辑，reference = 引用载荷，text = 文本规则，preserved = 原文回退。实际可用性取决于方言与扩展开关，不能由可解析推断所有属性都有表单。

没有第二份持久化 AST，Page / CAS / MyBase 契约不变。新增模型调用及本地 citeproc API，未新增远端同步。真实模型由用户配置，测试使用模拟端点。Raw TeX 不在浏览器执行，书签元信息手工填写，citeproc 需本机 Pandoc。详细格式及边界见 [本地对象与服务](../reference/LOCAL-OBJECTS.zh-CN.md)。

## 逐项清单

| 身份证号 | 名称与别名 | 现有载体 / 编辑能力 | 状态 / 阶段 | 边界 |
| --- | --- | --- | --- | --- |
| 块段落 | 段落；文本;空块 | 段落（直接） | 实施/P0 | 空段落是内容；间距不是。孩子们使用嵌套适配器。 |
| 块标题 | 标题;标题;标题 1; 标签 2; 标签 3; 标签 4; 标签 5; 标签 6 | 标题（直接） | 实施/P0 |  |
| 块.toggle_heading | 切换标题；可折叠标题 | header.toggle（直接；notion_nesting） | 已实施/P2 | 在 Notion 预设中插入切换标题；编辑共享标题和子项、持续折叠、移动子树并撤消。 |
| 块分隔符 | 分频器；主题休息；水平规则 | 水平规则（直接） | 实施/P0 |  |
| 块引用 | 报价；块报价；块引用 | 块引用（直接） | 实施/P0 |  |
| 块标注 | 标注；警报;警报；警报和标注；警告;笔记;警告 | callout.alert（直接；警报）； callout.notion（直接；notion_callouts） | 实施/P1 | 一个节点；保留种类、标题、图标、颜色、折叠和源编码。 |
| 块.行_块 | 线路阻塞；线路组；线块 | line_block（直接；line_blocks） | 实施/P0 |  |
| 块表 | 桌子；简单的桌子；多Markdown表 | table.pipe（直接；pipe_tables）； table.notion（直接；notion_tables）； table.mmd（直接；mmd_tables）； table.grid（直接；grid_tables）； table.simple（直接；simple_tables）； table.multiline（直接；multiline_tables） | 已实施/P2 | 管道、概念、MMD、网格、简单和多行表的一种模型。编辑单元格/标题、添加/删除行/列、合并/拆分单元格。 Span 命令需要启用可以保留几何图形的编码。 |
| 块.code_块 | 代码块；代码;逐字块 | 代码块（直接） | 实施/P0 |  |
| 框图 | 图表；美人鱼;顺序;流程图 | syntax.diagram（来源；图表） | 已实施/P2 | Mermaid、序列图和流程图具有本地预览和源编辑器。渲染错误使可编辑源完好无损。 |
| 块.math_块 | 数学块；分块方程；方程 | 方程（直接；tex_math_dollars）；方程（直接；tex_math_double_backslash） | 实施/P0 |  |
| 块.html_块 | HTML 块；原始 HTML | html_block（来源；raw_html）； Syntax.raw.html（来源；raw_attribute）；语法.html-markdown（来源；markdown_attribute） | 已实施/P2 | 净化的 HTML 预览和源代码编辑器； HTML 嵌入仍然是一个单独的文档对象。 |
| 块.raw_tex | 原始 TeX；生乳胶 | Syntax.raw.tex（源；raw_attribute）； Syntax.raw.tex（来源；raw_tex） | 已实施/P3 | 裸露的 TeX 环境和命令、显式的原始 TeX 栅栏、源代码编辑和 Markdown 往返。 TeX 不由浏览器执行。 |
| 块.native_div | 原生div； div 容器； Div 容器；围栏分区；围栏_div | fenced_div (direct; fenced_divs); fenced_div (direct; native_divs) | 已实施/P3 | Fenced 和原生 HTML Div 共享可编辑的子元素和属性表单；保留原始编码和未知属性。 |
| 块.image_block | 图像块；图像;数字;图像和标题 | image_block（直接）；段落.图像（直接）； syntax.figure（来源；implicit_figures） | 已实施/P2 | 可编辑的图像 URL、替代文本、标题和单独的说明文字。 |
| 块视频 | 视频；媒体视频 | media_block.video（参考；notion_media） | 已实施/P2 | 本地播放和可编辑附件 URL/标题；撤消和 Markdown 持久化。 |
| 块音频 | 音频；媒体音频 | media_block.audio（参考；notion_media） | 已实施/P2 | 本地播放和可编辑附件 URL/标题；撤消和 Markdown 持久化。 |
| 区块.pdf | PDF； PDF文件 | media_block.pdf（参考；notion_media） | 已实施/P2 | 可编辑的 PDF 附件 URL/标题、用于本地文件的嵌入式浏览器 PDF 查看器和打开 PDF 后备链接。 |
| 块文件 | 文件；附件 | media_block.file（参考；notion_media） | 已实施/P2 | 可编辑的附件 URL 和标题以及下载链接；二进制内容保留在附件中。 |
| block.file_transclusion | 文件嵌入；文件包含；嵌入文件；内联文件嵌入 | 语法.嵌入（来源；嵌入）； syntax_inline.transclusion（来源；嵌入） | 已实施/P2 | 可编辑的块/内联包含引用和递归本地预览，以及文件更改刷新和循环/路径/大小检查。包含的源仍然是一个单独的文件。 |
| 块.web_embed | 嵌入内容；网页嵌入； HTML 嵌入； HTML 文档嵌入；内嵌框架 | web_embed / html_embed（直接）；语法.embed（来源） | 已实施/P2 | 一个 PM 节点保留 URL，保存 HTML 和 Typora iframe 编码。 HTML 脚本被禁用；远程预览取决于目标的嵌入策略。 |
| 块.link_preview | 链接预览 | link_preview（直接） | 已实施/P3 | 可编辑的 URL、标题、描述和图像元数据。本地卡片内容与页面一起保留。 |
| 块.web_书签 | 网络书签；书签 | web_bookmark（直接） | 已实施/P3 | 可编辑的 URL、标题、描述和图像元数据。本地卡片内容与页面一起保留。 |
| 块.bullet_list_item | 项目符号列表项；无序列表项；项目符号列表 | Bullet_list_item（直接） | 实施/P0 |  |
| 块.numbered_list_item | 编号列表项；有序列表项；编号列表 | numbered_list_item（直接） | 实施/P0 |  |
| 块.task_list_item | 任务列表项；待办事项列表项；待办事项清单；待办事项；复选框 | task_list_item（直接；task_lists） | 实施/P0 | 任务状态和有序/项目符号标记是独立的；方言限制仍然适用。 |
| 块切换 | 切换；折叠部分；切换列表项；切换列表 | toggle_block（直接；notion_toggles） | 实施/P0 |  |
| 块.definition_list_item | 定义列表项；定义列表；定义列表 | 定义列表（直接；定义列表） | 已实施/P2 | 编辑术语和正文；通过撤消功能独立添加、删除和移动术语/定义组。 |
| 块.example_list_item | 示例列表项；示例列表 | example_list_item（直接；example_lists） | 已实施/P3 | 具有源保留解析和序列化的本机可编辑结构。 |
| 块内容表 | 目录；目录；目录指令 | table_of_contents.notion（直接；notion_toc）； table_of_contents.directive（直接；toc_directives） | 实施/P1 | 一个生成的目录，具有特定于源的编码和标题范围。 |
| 块.块_评论 | 屏蔽评论；隐藏评论；隐藏评论 | syntax.comment（来源；评论） | 已实施/P2 | 可编辑的 Markdown 源注释，保留在磁盘上并从渲染输出中省略。 |
| 块.link_to_page | 链接到页面；页面参考 | child_page（参考；notion_pages） | 已实施/P2 | Notdown-only 页面链接标签；可以定位直接子页面而不成为子页面块。不改变所有权。 |
| 块.child_page | 子页面；页面 | child_page（参考；notion_pages） | 已实施/P2 | 官方页面标签。创建同时也会创建页面资源；解析现有源永远不会移动资源。标签标识并非源自父元数据。 |
| 块面包屑 | 面包屑 | 面包屑（直接） | 已实施/P3 | 可编辑的有序页面引用，其标题是从本地页面列表解析的。 |
| 块列 | 专栏；栏目列表；两列 | 列（直接；notion_columns） | 实施/P0 |  |
| 块选项卡 | 选项卡；选项卡组 | 选项卡（直接） | 已实施/P3 | 可编辑的选项卡标题和正文、活动选项卡选择、添加、删除和重新排序选项卡；所有更改都是不可撤销的。 |
| 块.synced_block | 同步块；同步块快照 | synced_block（直接；notion_synced） | 已实施/P4 | 本地源块 ID 和快照、显式刷新/发布、在本地编辑时暂停的可选实时刷新。发布使用捕获的源版本并保留 CAS 冲突。没有跨设备同步。 |
| 块按钮 | 按钮 | 按钮（直接） | 已实施/P4 | 直接执行、内联名称/图标/样式设置和有序操作：在四个位置插入 Markdown 块、显示确认、打开页面/URL。原子局部更改和每次运行一次撤消；保留遗留动作。不支持数据库/云操作。 |
| 块.会议笔记 | 会议记录；转录 | 会议记录（直接） | 已实施/P4 | 可编辑的会议记录和音频路径； Transcribe 使用配置的 OpenAI 兼容服务并存储可编辑的转录内容。 |
| 区块.ai_block | 人工智能块 | ai_block（直接） | 已实施/P4 | 可编辑提示和结果；生成调用配置的 OpenAI 兼容服务。延迟的结果永远不会取代并发编辑。 |
| 块不支持 | 不支持；未知;未知块；保留来源；不透明块 | opaque_block（保留）； opaque_block.database（保留；notion_databases）；未知块（参考） | 实施/P0 | 未知来源可以通过属性进行编辑；仅供参考的占位符具有单独的 URL/描述字段。保留未更改的原始内容。 |
| 元数据.yaml_front_matter | YAML 前面的内容；图标;覆盖;页面属性；页面属性； MultiMarkdown 标题栏； MMD元数据 | page.yaml（直接）；语法.metadata.yaml（源；yaml_metadata_block +metadata_values）； opaque_block.metadata.yaml（保留；yaml_metadata_block）； Syntax.metadata.mmd（源；mmd_title_block +metadata_values）； opaque_block.metadata.mmd（保留；mmd_title_block） | 已实施/P2 | 页面属性包括封面字段。正文 YAML/MMD 具有字段和源编辑器，并且永远不会覆盖页面 YAML。 MMD 仍然是受限的纯文本元数据，而不是完整的 YAML。 |
| 元数据.pandoc_title_block | Pandoc 标题栏 | Syntax.metadata.pandoc（源；pandoc_title_block +metadata_values）； opaque_block.metadata.pandoc（保留；pandoc_title_block） | 已实施/P2 | 标题、作者和日期字段、续行和源代码编辑保留 Pandoc 标题块编码，与页面 YAML 分开。 |
| 内联.code_span | 代码跨度；逐字;内联代码 | mark.code（直接） | 实施/P0 |  |
| 行内强调 | 强调；斜体；嗯 | mark.em（直接） | 实施/P0 |  |
| 内联.strong_emphasis | 强烈强调；大胆的;强 | 马克·强（直接） | 实施/P0 |  |
| 内联删除线 | 删除线；三振；罢工 | mark.strike（直接；三振） | 实施/P0 |  |
| 内联链接 | 链接 | 标记.链接（直接） | 实施/P0 |  |
| 内联图像 | 图像；内联图像 | 图像（直接） | 已实施/P2 | 内联图像具有可通过双击属性编辑的 URL、替代文本和标题。 |
| 内联自动链接 | 自动链接；自动链接 | 标记.链接（文本） | 实施/P0 | 分享链接标记；原始拼写是来源出处，而不是单独的节点。 |
| 内联.inline_html | 内联 HTML； html_内联 | html_inline（来源；raw_html） | 已实施/P2 | 双击编辑一个HTML片段作为源；预览保持清洁。 |
| 内联.internal_link | 内部链接；页面链接；页面提及；位置链接；维基链接 | page_link（参考；notion_pages 或 wikilinks_title_after_pipe）；标记.链接（直接） | 已实施/P2 | 统一的页面和位置参考；标题、现有黑曜石块/列表项 ID 和锚点。保留原始语法和显式显示标签；引用并不建立所有权。 |
| 内联表情符号 | 表情符号 | 文本（文本）；文本（文本；表情符号） | 已实施/P2 | Unicode 文本和启用的简码扩展；遵循正常的文本插入、选择、移动和撤消。 |
| 内联.inline_math | 内联数学；内联方程 | inline_math（直接；tex_math_dollars） | 实施/P0 |  |
| 内联下标 | 下标 | mark.subscript（直接；下标） | 实施/P0 |  |
| 内联上标 | 上标 | mark.superscript（直接；上标） | 实施/P0 |  |
| 内联突出显示 | 亮点 | mark.highlight（直接；突出显示）； mark.critic.highlight（直接；critic_markup） | 实施/P0 |  |
| inline.inline_comment | 内嵌评论； CriticMarkup 评论 | syntax_inline.comment（来源；注释）； mark.critic.comment（直接；critic_markup） | 已实施/P2 | 评论仍然与可见文本不同；可以通过属性编辑内联源，并且 CriticMarkup 文本保持可编辑状态。 |
| 行内脚注 | 脚注；脚注；脚注参考 | footnote_reference（参考；脚注）； inline_note（直接；inline_notes） | 已实施/P2 | 可编辑的参考文献、定义正文和内联注释；指出了缺少的定义。引用属性更改标识符。 |
| 内联缩写 | 缩写；缩写词 | mark.abbreviation（直接；缩写）； syntax_inline.abbreviation（来源；mmd_abbreviations） | 已实施/P2 | 可编辑的 MMD 缩写源和 PHP 缩写文本/扩展。双击属性可更新文档的缩写定义。 |
| 内联引用 | 引文 | 引文（参考；notion_mentions）；语法_内联.引用（来源；mmd_引用）；语法_内联.引用（来源；引用） | 已实施/P2 | 可编辑的引文来源、MMD 参考书目查找和带有本地参考书目/样式文件的 Pandoc CSL citeproc 预览。 CSL 处理需要安装 Pandoc 可执行文件。 |
| 内联删除 | 删除； Critic标记删除 | mark.critic.deletion（直接；critic_markup） | 实施/P0 |  |
| 内联加法 | 添加；评论家标记添加 | mark.critic.addition（直接；critic_markup） | 实施/P0 |  |
| 内联替换 | 替换；评论家标记替换 | mark.critic.substitution（直接；critic_markup） | 已实施/P2 | 替换文本是内联编辑的；双击修订属性可编辑保留的原始文本。这两个值都保留为 CriticMarkup。 |
| 内联词汇表 | 词汇表 | syntax_inline.glossary（来源；术语表） | 已实施/P2 | 内联术语表源和定义是可编辑的；引用根据文档定义进行解析。 |
| 内联.metadata_variable | 元数据变量；变量 | syntax_inline.variable（源；metadata_variables） | 已实施/P2 | 可编辑的变量名称和正文元数据中的实时查找；它不会覆盖页面 YAML。 |
| 内联.下划线 | 下划线 | mark.underline（直接；notion_underline） | 实施/P0 |  |
| 内联.small_caps | 小号大写字母 | mark.small_caps（直接；bracketed_spans）； mark.small_caps（直接；native_spans）； mark.small_caps（直接；属性） | 已实施/P3 | 具有源保留解析和序列化的本机可编辑结构。 |
| 内联.native_span | 原生跨度 | mark.native_span（直接；bracketed_spans）； mark.native_span（直接；native_spans）； mark.native_span（直接；属性） | 已实施/P3 | 具有源保留解析和序列化的本机可编辑结构。 |
| 内联.mention_person | 提及人物；提及用户 | 提及.用户（参考；notion_mentions） | 已实施/P4 | 可编辑的人员参考 URL 和显示标签。此本地对象不会验证成员身份或连接外部目录。 |
| inline.mention_page_or_data_source | 提及数据来源；提及数据库 | 提及.数据库（参考；notion_mentions）；提及.数据源（参考；notion_mentions） | 已实施/P2 | 数据库/数据源引用保持不同；页面提及属于 inline.internal_link。保留历史对象 ID 是为了实现目录兼容性。 |
| 内联日期或提醒 | 日期或提醒；日期提及 | 提及.日期（参考；notion_mentions） | 已实施/P4 | 可编辑的日期范围和明确的提醒时间戳。本地提醒会在应用程序打开时运行，并在重新打开时及时提醒；桌面通知需要浏览器权限。 |
| 内联文本颜色 | 文字颜色；颜色 | mark.color（直接；notion_colors） | 实施/P0 |  |
| 内联.background_color | 背景颜色；背景 | mark.color.background（直接；notion_colors） | 实施/P0 |  |
| 字符.line_break | 断线；硬打破；硬中断 | 硬中断（直接） | 实施/P0 |  |
| 字符.html_entity | HTML 实体；实体 | 文本（文本） | 实施/P0 |  |
| 字符.反斜杠_转义 | 反斜杠转义；逃脱 | 文本（文本） | 实施/P0 |  |
| 字符.smart_typography | 智能排版；智能标点符号 | 文本（文本；智能） | 已实施/P2 | 方言控制的智能标点、传统破折号规则和普通文本编辑；文本处理功能，而不是单独的节点。 |

## 验证与维护

注册表来源：src/document/content-objects.ts。测试覆盖对象数量与分类、上下文识别、真实示例、Callout 原编码和撤销、TOC 层级与导出、扩展开关、CRLF、未知内容及代码围栏边界。浏览器验证全表与别名、折叠持久化、正文输入收取、目录实时更新、统一菜单及临时知识库保存。完整验收运行 npm test、npm run build、npm run test:e2e。

更新注册表后运行 node --import tsx docs/fixtures/content-object-roadmap.ts 重新生成本文件。旧 BLOCK-MODEL-REVIEW / CONTENT-CAPABILITIES 保留为历史讨论与方言快照；对象边界以本清单为准。
