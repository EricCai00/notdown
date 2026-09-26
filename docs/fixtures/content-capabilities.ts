import { editorKind } from "../../src/document/node-identity";
/** Documentation audit only; never opens or writes a vault. */
import fs from "node:fs";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dialects, enabled, supportsOption, pandocDefaults, type SyntaxConfig } from "../../src/markdown-engine/config.ts";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec.ts";

const dataPath = "docs/data/content-capabilities-2026-09-20.json";
const originalRows: string[][] = process.argv[2]
  ? fs.readFileSync(process.argv[2], "utf8").split(/\r?\n/).slice(1).filter(l => l.trim()).map(l => l.split("\t"))
  : JSON.parse(fs.readFileSync(dataPath, "utf8")).originalRows;
assert.equal(originalRows.length, 87);

// id | normalized name | classification | Pandoc route | native route | Typora reference | Obsidian reference | Notion Enhanced reference | API mapping | scope / qualification
const inventory = `
1|分隔线 divider|叶块|base|base|有|有|有|divider|thematic break 是正文分隔，不是页面或数据库边界。
2|标题 heading|叶块；Notion 可切换容器|base|base|有|有|有|heading_1…heading_4|Markdown 通常 1–6 级；当前 Notion 为 1–4，Notdown Notion 将 5/6 收到 4。折叠标题另见 34。
3|代码块 code block|叶块|base|base|有|有|有|code|缩进代码与围栏分开看：CommonMark 围栏内置；markdown 系列围栏受 backtick_code_blocks/fenced_code_blocks 控制。无围栏时仍可用缩进代码；Notion 用围栏。
4|HTML 源码块|叶块/原始内容|raw_html|raw_html|有|有|占|embed 的 HTML 文件形态|Markdown 中的 raw HTML 不等于 Notion embed：Notion HTML block 是上传 HTML 文件后在隔离 iframe 中显示。原生十种 Markdown 预设提供清理后的源码预览，不执行任意脚本。
5|段落 paragraph|Markdown 叶块；Notion 可含子块|base|base|有|有|有|paragraph|CommonMark 的叶块允许行内内容但不允许子块；Notion 可附子块。Notdown 任意文本块层级由 notion_nesting 管理。
6|表格 table|复合结构|pipe_tables|pipe_tables/mmd_tables|有|有|有|table + table_row|这里只判断管道表格或 Notion table。简单/多行/网格表格不是同一语法；原生未完整实现。MMD 增强表格为预览与源码编辑。
7|引用 block quote|容器块|base|base|有|有|有|quote|Notion 多行 > 可成为多个块，块内换行用 br；不能直接套用 CommonMark 引用合并规则。
8|无序列表项|容器块|base|base|有|有|有|bulleted_list_item|列表 list 与列表项 list item 是不同节点；原表列的是 item，建议另加 list 层级。
9|有序列表项|容器块|base|base|有|有|有|numbered_list_item|编号起点与列表中断规则受方言影响；不等于 fancy/example lists。
10|任务列表项|容器块|task_lists|task_lists|有|有|有|to_do|原生保留 checked 并可编辑。Typora 预设只把无序列表中的任务标记变成复选框。
11|显式空块|编辑结构|none|empty|有|待|有|空 paragraph|empty line 不应当作 empty block 的同义词。普通 Markdown 空行通常是分隔；Notion 用 empty-block 标签；原生 Typora 将特定顶层空白映射成可编辑空段落。
12|块公式|叶块|tex_math_dollars/tex_math_single_backslash/tex_math_double_backslash|tex_math_dollars/tex_math_double_backslash|有|有|有|equation|各路线定界符不同。原生支持美元和已接入的双反斜杠形式，用 KaTeX 显示；不是完整 TeX 引擎。
13|独立图片/figure|图片段落；可提升为 Figure|figure|figure|有|有|有|image|图片语法本来属于 Markdown 行内。独占一行可显示为图片段落；Pandoc implicit_figures/MMD 才涉及题注图语义，不能把 image 与 Figure 完全等同。
14|图表 diagram|围栏内容的渲染能力|none|diagrams|有|有|有|code（如 mermaid）|原生十种 Markdown 可选 diagrams，Typora/Obsidian 默认开；Notion 原生目前只保留代码，不产生图表预览。非任意图表语言。
15|提示容器 callout/alert|容器块|alerts|alerts/notion_callouts|有|有|有|callout|GitHub/Obsidian 的 > [!TYPE] 与 Notion callout 标签不是同一种写法。表中表示相应用途的路线；原生十种预设可另外启用 Notion 标签容器。
16|目录 table of contents|生成块/渲染功能|toc|toc_directives/notion_toc|有|外|有|table_of_contents|Pandoc 通过输出选项 --toc，不是 Markdown parser 语法；Obsidian Outline 是界面能力，不能当作内嵌 TOC 语法。Notdown 可生成目录。
17|链接到页面|链接/引用入口|base|base|有|有|有|page mention；独立 link-to-page 块不强行映射|普通 Markdown 文件链接各方言都可表达；不因此拥有 Notion 子页面对象。独立入口、行内提及、wiki 链接应分别建模。
18|嵌入网页/文件转引|外部内容/容器|html|html_embed/transclusion|有|有|占|embed|iframe 网页、Obsidian ![[文件]]、MMD {{文件}} 是三条路线。Pandoc HTML 透传不负责文件转引；Notdown 转引服务仅接受 md/markdown/txt/html/tex/bib，不能由此推导支持 Obsidian 图片、音视频、PDF 转引。
19|子页面 child page|资源引用/页面关系|none|notion_pages|—|—|有|child_page；页面内容另用 Page API|原生 page 标签提供入口和本地导航，不把 Markdown 解析成真实云端页面创建；应用自身有本地页面树。
20|内联数据库|数据库资源/视图入口|none|notion_databases|—|外|有|child_database + database.is_inline|Notdown 只保留 database 标签及 inline 标记；没有数据库引擎。Obsidian Bases 是另一种产品能力，不宣称与 Notion 数据库等价。
21|整页数据库|数据库资源|none|notion_databases|—|外|有|Database 对象；child_database 是父页中的入口|full-page 是资源展示形态，不是单独 Markdown 叶块。Notdown 保留引用，不实现表数据、查询、关系或视图。
22|关联数据源视图|视图/引用|none|dbview|—|外|参|View/Data source API，非通用 rich text|Notion database 标签只能表明引用，不能完整描述 view 的过滤排序。原生只可保留数据库引用；不能计为已实现关联视图。
23|按钮 button|交互/自动化|none|none|—|外|占|unsupported（可含 block_type=button）|Notdown 未实现按钮动作。插件或 HTML 能做按钮，不代表该方言原生拥有可执行按钮语义。
24|面包屑 breadcrumb|导航/生成块|none|breadcrumb|—|外|占|breadcrumb|Notdown 顶栏有本地面包屑，但没有正文 breadcrumb 块；API 能读块与 Markdown API 能导出是两回事。
25|视频 video|媒体块|html|notion_media|有|有|有|video|原生需 notion_media 标签路线；Obsidian ![[video]] 媒体嵌入没有完整接入，不能因 transclusion 默认开就算视频默认可用。
26|音频 audio|媒体块|html|notion_media|有|有|有|audio|原生提供标签媒体预览；![[audio]] 不在当前文本转引文件白名单内。不是转录服务，也不保证 URL 有效。
27|附件 file|资源链接/媒体块|base|file|有|有|有|file|普通 Markdown 链接可指向文件，但不产生 Notion file 对象。Notdown 标签可保留附件 URL 与说明。
28|网页书签卡片|资源预览|none|none|—|—|占|bookmark|普通链接不是抓取标题/描述/封面的书签卡片；原生尚无该服务，Notion unknown 仅保留引用。
29|PDF 嵌入|媒体块|html|notion_media|待|有|有|pdf|Pandoc 只能借原始 HTML 输出表达嵌入；原生有 pdf 标签；![[file.pdf]] 不在当前文本转引白名单内，未完整实现 Obsidian PDF 嵌入，更不是 PDF 内容编辑器。
30|链接预览 link preview|站点服务/预览对象|none|none|—|外|占|link_preview|不要与普通链接、网页书签或鼠标悬停预览混为同一语义；原生没有 Notion unfurl 集成。
31|会议纪要 meeting notes|服务生成的复合块|none|none|—|外|有|meeting_notes（旧版 transcription）|当前 API 2026-03-11 起改名；Markdown API 有 meeting-notes 输出并可选择转录。Notdown 仅保留未知源码，没有转录或专用视图。
32|未知/不支持内容|兼容回退|none|preserve|待|待|占|unsupported|unknown/unsupported 不是可创作的普通语义块。原生回退保留源码或引用；不能据此算实现了未知功能。
33|折叠区 toggle|容器块|html|notion_toggles|有|外|有|toggle|HTML details 可借 raw_html 显示；原生结构化折叠使用 notion_toggles。Obsidian 折叠标题/列表或可折叠 callout 是相关但不同能力。
34|折叠标题|标题 + 子块/交互|none|toggleheading|待|外|有|heading_1…4 + is_toggleable|Notdown Notion 用 heading.toggle 与 nested_block，实现折叠；受 notion_nesting 管理。普通 Markdown 的标题折叠是编辑 UI，不是同一序列化结构。
35|标签页容器 tabs|容器块|none|none|—|外|待|tab（paragraph 子块表示每一页签）|当前 Block API 已有 tab；公开 Enhanced Markdown 指南未列专门格式，不臆造标签。Notdown 尚无 tabs 节点与视图。
36|同步块 synced block|引用/容器 + 同步服务|none|notion_synced|—|外|有|synced_block|原生保留内容快照、来源与引用；没有跨页自动同步，更没有跨端/Notion 云同步。
37|分栏 columns|容器块|none|notion_columns|—|外|有|column_list + column|原生提供列容器与显示；用标签保留。CSS 分栏或 Pandoc Div 排版不等于 Notion 分栏结构。
38|YAML front matter|文档元数据|yaml_metadata_block|yaml_metadata_block|有|有|—|不属于正文 Block API|MMD 原生 Title: 元信息不等于 YAML；Notdown markdown_mmd 可选 YAML 是 Pandoc/本地扩展。页面属性 YAML 与正文元数据需分开。
39|Pandoc 标题块|文档元数据|pandoc_title_block|pandoc_title_block|—|—|—|无直接对应|以 % 开头；原生只识别常见开头子集，保留源码；metadata_values 决定是否显示元数据预览。
40|块内隐藏注释|源码注释|html|comments/raw_html|有|有|—|非 discussion comment|HTML 注释与 Obsidian %% 多行注释不同。原生支持相应开关；不是多人批注系统。
41|定义列表|复合块|definition_lists|definition_lists|待|—|—|无原生定义列表类型|应包含 term 与 definition，definition 可含多个块，不宜统称单个叶块。
42|指定格式原始源码|原始内容块/行内|raw_attribute|raw_attribute|待|—|—|无通用对应|例如带 {=html} 的代码；不同于一般 HTML 块或任意文件转引。原生支持指定输出格式的预览/源码保留子集。
43|脚注定义|定义/复合块|footnotes|footnotes|有|有|—|无标准脚注定义对象|[^id]: 定义可含多个段落；与 63 的行内引用是一套语法的两端。Notion [^URL] 是引文，不是这个定义。
44|行块 line block|叶块（含多条行内序列）|line_blocks|line_blocks|—|—|—|无直接对应|用于诗歌等保留行序列。Notdown 本地 CommonMark 系列也可选，Pandoc 同名 reader 不接受该开关。
45|HTML 原生 Div 语义|容器块|native_divs|none|—|—|—|无直接对应|Pandoc 将 HTML div 变成 AST Div；Notdown 可预览 raw HTML，但未注册 native_divs，不算结构化 Div。fenced_divs 是另一写法，另见补充表。
46|原始 TeX|原始块或行内内容|raw_tex|none|—|—|—|无直接对应|与公式不同；Notdown 无 raw_tex 专用语义。原文或普通文字保留不等于执行 TeX 或目标格式透传。
47|示例编号列表|容器块 + 编号语义|example_lists|none|—|—|—|无直接对应|Pandoc (@) 编号与引用机制；原生尚未实现，不能用普通 ordered_list 代替完整功能。
48|行内代码 code span|行内标记|base|base|有|有|有|rich_text.annotations.code|API 字段叫 annotations（复数），不是独立 block 或独立 annotation 对象类型。
49|强调 emphasis|行内标记|base|base|有|有|有|rich_text.annotations.italic|字体效果对应样式；各方言的分隔符与嵌套边界仍可能不同。
50|加粗 strong emphasis|行内标记|base|base|有|有|有|rich_text.annotations.bold|属于行内样式，不是新的块类型。
51|删除线 strikethrough|行内标记|strikeout|strikeout|有|有|有|rich_text.annotations.strikethrough|与 CriticMarkup 删除修订分开；删除线不包含接受/拒绝修订语义。
52|链接 link|行内节点/标记|base|base|有|有|有|rich_text.text.link|普通链接不需要扩展开关；实际跳转需安全 URL 和可访问目标。
53|行内图片|行内节点|base|base|有|有|—|image 是块；rich_text 没有普通 image 类型|Notdown PM schema 的 image 是 inline；Notion codec 也能保留图片节点，但不保证任意行内图片布局可映射到 Notion API。
54|自动链接 autolink|行内规则|base|base|有|有|待|普通 rich_text 链接|尖括号 URL/邮箱是基础语法；裸 URL 是另一扩展 autolink_bare_uris，不能合并计数。原生 Notion 实测尖括号 URL 会生成 link 标记；这不推导为支持裸 URL。
55|行内 HTML|原始行内内容|raw_html|raw_html|有|有|—|没有通用 HTML rich_text 类型|Notion 的 span/mention 标签是约定语法，不代表任意 HTML。Notdown 普通 Markdown 路线提供清理后的预览。
56|文内/跨文档引用|链接 + 标识符规则|base|base|有|有|有|普通 link 或 page mention|[标题](#id) 基础链接与自动生成标题 ID、[标题] 隐式引用、[[双链]] 应分别统计；本行只保证链接表示，生成目标锚点另受扩展控制。
57|Emoji 名称|行内替换/资源解析|emoji|emoji|有|有|有|Unicode 文本；自定义 Emoji 需资源|Unicode Emoji 本身无需扩展。Notion 自定义 :name: 依赖资源目录；原生 Notion 目前保留源码，不提供同名 emoji 开关。
58|行内公式|行内原子节点|tex_math_dollars/tex_math_single_backslash/tex_math_double_backslash|tex_math_dollars/tex_math_double_backslash|设|有|有|rich_text.type=equation|Pandoc 各定界符分别开关；Notdown 美元/双反斜杠是已实现子集。
59|下标 subscript|行内标记|subscript|subscript/short_subsuperscripts|设|HTML|—|无独立下标 annotation|H~2~O、简写下标与 HTML sub 不应视为同一扩展开关。Notdown Obsidian 可选本地语法超出其官方基础语法。
60|上标 superscript|行内标记|superscript|superscript/short_subsuperscripts|设|HTML|—|无独立上标 annotation|x^2^、MMD 简写上标与 HTML sup 分别处理；原生各自依赖对应扩展。
61|高亮 highlight|行内标记|mark|highlight/critic_markup|设|有|参|背景色 annotation 是相关表达|==text==、{==text==}、背景色不是同一写法。Pandoc 用 mark；原生未注册 mark，但另有 highlight/CriticMarkup，不能认作完整同名实现。
62|行内源码注释|行内保留/修订注释|html|comments/critic_markup/raw_html|HTML|有|—|非 Comment API|%%...%%、HTML 注释、{>>...<<} 应拆成不同语法；本行汇总路线，非全部方言接受全部定界符。
63|脚注引用|行内引用节点|footnotes|footnotes|有|有|参|Notion [^URL] 是 citation，非普通脚注|不能因为 Notion 显示一个上标引用就标成完整 footnotes；原生 N 的普通脚注未适配。
64|缩写 abbreviation|定义 + 行内标记|abbreviations|abbreviations/mmd_abbreviations|待|—|—|无直接对应|PHP *[HTML]: 与 MMD [>HTML] 不同。Pandoc abbreviations 只略过定义，没有完整缩写节点；Notdown 可显示其支持的缩写释义。
65|引文 citation|行内引用 + 书目处理|citations|mmd_citations|—|外|有|Notion 引文序列化不等于 CSL 引文对象|Pandoc [@key]、MMD [#key]、Notion [^URL] 不同；原生只接 MMD 子集及 Notion URL 引文，没有完整 Pandoc citations/citeproc。
66|删除修订 deletion|CriticMarkup 行内修订|none|critic_markup|—|—|—|不是 strikethrough annotation 的完整等价物|{--text--}；原生有标记与显示，没有多人审阅或完整接受/拒绝工作流。
67|新增修订 addition|CriticMarkup 行内修订|none|critic_markup|—|—|—|无独立修订类型|{++text++}；不能混同普通插入文字操作。
68|替换修订 substitution|CriticMarkup 行内修订|none|critic_markup|—|—|—|无独立修订类型|{~~old~>new~~}；原生支持当前行内解析子集。
69|术语表 glossary|定义 + 行内引用 + 输出|none|glossary|—|—|—|无直接对应|MMD 术语引用是其扩展体系的一部分；原生实现术语定义/提示子集，不宣称完整排序和出版输出。
70|元数据变量|行内替换/模板|none|metadata_variables&metadata_values&mmd_title_block/metadata_variables&metadata_values&yaml_metadata_block/metadata_variables&metadata_values&pandoc_title_block|—|—|—|无直接对应|[%name] 需要元数据来源；原生依赖 metadata_variables、metadata_values 及相应标题块。表中按 MMD/YAML/Pandoc 标题块任一完整路线计算，不能只打开变量替换却没有元数据来源。
71|下划线 underline|行内样式/HTML 语义|html|notion_underline/raw_html|HTML|HTML|有|rich_text.annotations.underline|Pandoc 没有 underline 同名扩展开关。原生结构化下划线用 Notion span + notion_underline；HTML u/ins 属于 raw_html 预览路线。
72|小型大写 small caps|行内样式/语义|smallcaps|none|HTML|HTML|—|无 small_caps annotation|Pandoc 可由带 smallcaps 类的 span 表达，依赖相应属性/原生 span 处理；原生无专用 small_caps mark，CSS 外观不算完整语义。
73|提及用户|行内引用 + 用户服务|none|notion_mentions|—|外|有|rich_text.mention.user|原生保留用户 URL 和标签；不连接成员目录、不发送通知。
74|提及页面/数据源|行内引用|none|notion_mentions/notion_pages|—|参|有|mention.page/database；data_source 需按 API 版本核对|Notion Markdown 数据源标签与 REST rich_text 枚举不能凭名字推断一一对应。原生保留不同 mention kind，仅本地页面目标有导航。
75|日期/提醒|行内日期引用 + 服务|none|notion_mentions|—|外|有|rich_text.mention.date；提醒非简单同义项|修正 date ot reminder 为 date or reminder。原生保留日期属性，没有提醒调度或通知。
76|文字颜色|行内/块属性|html|notion_colors|HTML|HTML|有|annotations.color / block.color|原生有约定色名；Pandoc HTML/CSS 依赖输出格式，不能视为统一的 text_color 扩展开关。
77|背景颜色|行内/块属性|html|notion_colors|HTML|HTML|有|annotations.color 的 *_background|Enhanced Markdown 用 *_bg，REST API 用 *_background；Notdown 保存自己的约定标签，不代表完成 API 值转换。
78|换行 line break|行内规则/块边界|base|base|有|有|有|rich_text.text.content 内的换行|应拆 hard break、soft break、块边界；Notion 文本单换行可分块，br 才是块内换行。hard_line_breaks/ignore_line_breaks 决定部分 Markdown 行为。
79|字符引用 character reference|词法/行内解码|base|base|有|有|待|文本编码，不是独立 Block|如 &amp;、&#65;；不是链接引用或脚注引用。Notion 官方只明确部分标签转义，原生解码能力不等于官方格式承诺。
80|反斜杠转义|词法规则|base|base|有|有|有|序列化规则，非对象类型|各方言的可转义字符集合不同；代码内不按普通正文转义。all_symbols_escapable 等扩展调整边界。
81|智能标点|文本转换|smart|smart|设|—|—|没有独立 annotation|Typora 受偏好设置影响；原生 Typora 默认关闭 smart，Pandoc 预设按快照。不能用字体样式代替实际字符转换。
82|协作评论 comment|应用/讨论对象|none|none|—|外|外|Comment API，非正文 Block|与 40/62 源码注释完全不同；Notdown 未实现协作评论线程。
83|表情回应 reaction|应用/讨论对象|none|none|—|外|外|未确认公开统一 Reaction 写入 API|不要由 UI 有 reaction 推断 REST API 必有对应可写对象；Notdown 未实现。
84|建议编辑 suggest edits|协作审阅流程|none|none|—|外|外|未确认通用审阅对象映射|CriticMarkup 只能表达修改标记，不能自动获得权限、审阅和接受/拒绝流程；Notdown 未实现协作建议。
85|页面图标 icon|页面元数据|none|icon|—|外|外|Page.icon|Notdown 应用层已支持本地页图标，与正文方言无关；不把源码中 Emoji 算成页图标。
86|页面封面 cover|页面元数据|none|cover|—|外|外|Page.cover|Notdown 未见专用封面字段或显示 UI；可保留未知 YAML 数据不等于实现封面。
87|页面属性/数据库属性值|页面元数据/数据模型|none|properties|有|有|外|Page.properties；schema 属 Data source|Notdown 页面 YAML properties 可保留和编辑，但无完整 Notion 类型系统、公式、关系和数据库视图。与正文元数据块分开。
`.trim().split("\n").map(line => {
  const [id, name, category, pandoc, native, typora, obsidian, notion, api, note] = line.split("|");
  assert.equal(line.split("|").length, 10, line);
  return { id: Number(id), name, category, pandoc, native, typora, obsidian, notion, api, note };
});
assert.deepEqual(inventory.map(r => r.id), Array.from({ length: 87 }, (_, i) => i + 1));

const pandocVariants = Object.keys(pandocDefaults);
for (const v of pandocVariants) {
  const actual = Object.fromEntries(execFileSync("pandoc", ["--list-extensions=" + v], { encoding: "utf8" }).trim().split(/\r?\n/).map(l => [l.slice(1), l[0] === "+"]));
  assert.deepEqual(actual, pandocDefaults[v], "Pandoc snapshot differs: " + v);
}

function config(variant: string): SyntaxConfig { return { version: 1, variant: variant as SyntaxConfig["variant"], extensions: {} }; }
function routeState(route: string, variant: string, native: boolean): string {
  const c = config(variant);
  const supported = (name: string) => native ? supportsOption(c, name) : Object.hasOwn(pandocDefaults[variant] || {}, name);
  const on = (name: string) => native ? enabled(c, name) : pandocDefaults[variant]?.[name] === true;
  const paths = route.split("/").map(x => x.split("&"));
  if (paths.some(path => path.every(n => supported(n) && on(n)))) return "开";
  return paths.some(path => path.every(supported)) ? "可" : native ? "未" : "—";
}
function reference(row: typeof inventory[number], variant: string): string {
  if (variant === "typora") return row.typora;
  if (variant === "obsidian") return row.obsidian;
  if (variant === "notion-markdown") return row.notion;
  if (row.pandoc === "base") return "基";
  if (row.pandoc === "none") return "—";
  if (row.pandoc === "html") return "HTML";
  if (row.pandoc === "toc") return "输出";
  if (row.pandoc === "figure") return "基+" + routeState("implicit_figures", variant, false);
  if (row.pandoc === "smallcaps") return "属性";
  return routeState(row.pandoc, variant, false);
}
const notionRoutes: Record<number, string> = {
  1: "base", 2: "base", 3: "base", 4: "preserve", 5: "base", 6: "notion_tables", 7: "base", 8: "base", 9: "base", 10: "task_lists",
  11: "base", 12: "tex_math_dollars", 13: "base", 14: "preserve", 15: "notion_callouts", 16: "notion_toc", 17: "notion_pages", 18: "preserve",
  19: "notion_pages", 20: "notion_databases", 21: "notion_databases", 22: "preserve", 23: "preserve", 24: "breadcrumb", 25: "notion_media", 26: "notion_media",
  27: "notion_media", 28: "preserve", 29: "notion_media", 30: "preserve", 31: "preserve", 32: "preserve", 33: "notion_toggles", 34: "notion_nesting",
  35: "preserve", 36: "notion_synced", 37: "notion_columns", 38: "none", 39: "none", 40: "none", 41: "none", 42: "none", 43: "none", 44: "none", 45: "none", 46: "none", 47: "none",
  48: "base", 49: "base", 50: "base", 51: "strikeout", 52: "base", 53: "base", 54: "base", 55: "none", 56: "base", 57: "preserve", 58: "tex_math_dollars",
  59: "none", 60: "none", 61: "notion_colors", 62: "none", 63: "none", 64: "none", 65: "base", 66: "none", 67: "none", 68: "none", 69: "none", 70: "none",
  71: "notion_underline", 72: "none", 73: "notion_mentions", 74: "notion_mentions/notion_pages", 75: "notion_mentions", 76: "notion_colors", 77: "notion_colors",
  78: "base", 79: "base", 80: "base", 81: "none", 82: "none", 83: "none", 84: "none", 85: "icon", 86: "cover", 87: "properties"
};
const subsetRows = new Set([2,4,6,10,12,13,14,15,18,19,20,21,24,25,26,27,29,33,34,36,38,39,42,53,56,59,60,61,64,65,66,67,68,69,70,71,73,74,75,78,79,80,81,87]);
function nativeState(row: typeof inventory[number], variant: string): string {
  const route = variant === "notion-markdown" ? notionRoutes[row.id] : row.native;
  let state: string;
  if (route === "base") state = "内";
  else if (route === "none") state = "未";
  else if (route === "preserve") state = "保";
  else if (route === "icon") state = "应用";
  else if (route === "properties") state = "应用";
  else if (route === "cover") state = "未";
  else if (route === "empty") state = variant === "typora" ? "内" : "保";
  else if (route === "file") state = "内+" + routeState("notion_media", variant, true);
  else if (route === "figure") state = "内+" + routeState("implicit_figures", variant, true).replace("未", "—");
  else if (route === "dbview") state = "未";
  else if (route === "breadcrumb") state = "应用";
  else if (route === "toggleheading") state = "未";
  else state = routeState(route, variant, true);
  if (subsetRows.has(row.id) && !["未", "保"].includes(state)) state += "*";
  return state;
}
const rows = inventory.map(row => ({ ...row, original: originalRows[row.id - 1], support: Object.fromEntries(dialects.map(v => [v.id, { reference: reference(row, v.id), native: nativeState(row, v.id) }])) }));
const probeCases: [string, string, string, string, string?][] = [
  ["notion-markdown", "toggle_heading", '# Heading {toggle="true"}\n\tBody', "nested_block"],
  ["notion-markdown", "tabs_preserved", "<tab>\n\tTab one\n</tab>", "opaque_block"],
  ["notion-markdown", "url_citation", "See [^https://example.com].", "citation"],
  ["notion-markdown", "not_ordinary_footnotes", "A[^a]\n\n[^a]: Note", "citation", "footnote"],
  ["notion-markdown", "angle_autolink", "<https://example.com>", "text"],
  ["notion-markdown", "inline_image", "Text ![alt](https://example.com/a.png) tail", "image"],
  ["notion-markdown", "diagram_is_code", "```mermaid\ngraph TD\nA-->B\n```", "code_block", "syntax_block"],
  ["notion-markdown", "explicit_empty", "<empty-block/>", "paragraph"],
  ["notion-markdown", "heading_4", "#### Four", "heading"],
  ["markdown", "html_not_native_div", '<div class="note">\n\nText\n\n</div>', "html_block", "fenced_div"],
  ["markdown", "raw_tex_is_text", "\\begin{center}\ntext\n\\end{center}", "paragraph", "syntax_block"],
  ["typora", "editable_blank", "Before\n\n\n\nAfter", "paragraph"],
];
const probes = probeCases.map(([variant, name, source, expected, absent]) => {
  const c = config(variant), doc = parseNative(source, c), types: string[] = [], marks: string[] = [];
  doc.descendants(n => { types.push(editorKind(n)); marks.push(...n.marks.map(m => editorKind(m))); });
  assert(types.includes(expected), `${name}: missing ${expected}`);
  if (absent) assert(!types.includes(absent) && !marks.includes(absent), `${name}: unexpected ${absent}`);
  if (name === "angle_autolink") assert(marks.includes("link"));
  if (name === "heading_4") assert.equal(doc.firstChild?.attrs.level, 4);
  if (name === "toggle_heading") assert.equal(doc.firstChild?.firstChild?.attrs.toggle, true);
  if (name === "editable_blank") assert(doc.content.content.some(n => editorKind(n) === "paragraph" && n.content.size === 0));
  assert.equal(serializeNative(doc, c), source, `${name}: source changed`);
  return { variant, name, source, types, marks, roundtrip: true };
});
const output = { capturedAt: "2026-09-20", scope: "87 user inventory items; 11 dialects; native switches are empty-override presets, not user configuration", originalColumns: ["category", "name", "alias", "markdown variant", "Notion UI category", "Enhanced markdown", "Notion API"], originalRows, rows, probes };
fs.writeFileSync(dataPath, JSON.stringify(output, null, 2) + "\n");

const sources = {
  CM: "https://spec.commonmark.org/0.31.2/", P: "https://pandoc.org/MANUAL.html", T: "https://support.typora.io/Markdown-Reference/",
  O: "https://obsidian.md/help/obsidian-flavored-markdown", M: "https://fletcher.github.io/MultiMarkdown-6/", E: "https://michelf.ca/projects/php-markdown/extra/",
  N: "https://developers.notion.com/guides/data-apis/enhanced-markdown", NB: "https://developers.notion.com/reference/block", NR: "https://developers.notion.com/reference/rich-text",
};
const esc = (x: string) => x.replace(/\|/g, "&#124;").replace(/\n/g, "<br>");
let md = `# 内容能力分类、方言支持与 Notdown 实现对照\n\n核对日期：2026-09-20。以用户提交的 **87 项总结**为基础，保留原始顺序与行号，覆盖 **11 种方言**。本表按“内容能力”组织；[115 项扩展开关表](PANDOC-EXTENSIONS-MATRIX.md) 按“配置名称”组织，两者不是一一对应。原始七列和本次结果保存在 [机器可读审计数据](data/content-capabilities-2026-09-20.json)。\n\n## 对原总结的评价与修订\n\n这份总结适合做编辑器的功能目录：同时覆盖正文、行内、媒体、容器、元数据和协作。但它尚不能直接作为统一 AST schema 或实现完成清单。建议把原来的分类拆为 **语义类别、具体写法、方言支持、Notion API 映射、Notdown 实现层级**。\n\n1. **leaf/container 是解析模型术语。** CommonMark 的 paragraph 是叶块，Notion paragraph 能包含子块；table、definition list、footnote definition 需要按实际模型说明内部结构。不能用一列替所有模型判定。参见 [CommonMark 分类](${sources.CM}#blocks-and-inlines) 与 [Notion 子块规则](${sources.NB}#block-types-that-support-child-blocks)。\n2. **不要把 original/GFM/MMD 当作独占归属或发明来源。** 功能可存在于多个方言，写法和默认值也可能不同。图片本来就是 Markdown 行内语法，独立图片与带题注 Figure 另分；代码块不只有围栏。\n3. **应拆的同义项：** empty line ≠ empty block；HTML block ≠ embed；callout ≠ 完全相同的 alert 语法；文件转引 ≠ iframe；脚注定义 ≠ 脚注引用；普通 autolink ≠ 裸 URL；cross-reference ≠ 只有一种链接语法。\n4. **元数据与服务不能塞进正文 AST。** 页面图标、封面、属性属于页面模型；数据库视图、按钮、评论、reaction、提醒属于应用/服务能力。原文可恢复不代表功能已实现。\n5. **Notion 名称按当前文档核对。** heading_4 和 tab 当前确实存在；折叠标题是 heading 的 is_toggleable；meeting_notes 在 2026-03-11 替代旧 transcription。rich_text 样式字段叫 annotations。HTML 文件 embed 与 Markdown raw HTML 仍需区分。参见 [Block API](${sources.NB})、[Rich text](${sources.NR})。\n6. **MMD 的 Title: 元信息不等于 YAML；CriticMarkup 的修订/注释/高亮是一组独立规则。** 参见 [MMD 元数据](https://fletcher.github.io/MultiMarkdown-6/syntax/metadata.html)、[CriticMarkup](https://fletcher.github.io/MultiMarkdown-6/syntax/critic.html)。\n\n## 表格口径\n\n每格统一写 **参考方言 / Notdown 原生**。八个 Pandoc 列指 Pandoc 3.11 对该方言的实现；Typora/Obsidian 指其公开产品文档；N 指公开 Notion Enhanced Markdown 格式，**不是 REST Block API 支持集合**。MMD 列是 Pandoc markdown_mmd，不冒充完整 MultiMarkdown 6；原生附加的 MMD 产品规则和 MMD 6 对应关系另见后文。Strict 是 Pandoc 的原始 Markdown 兼容预设，不宣称等同 Markdown.pl。\n\n| 符号 | 所属侧 | 含义 |\n| --- | --- | --- |\n| 基 | 参考 | 解析器基础语法，不必有同名扩展开关 |\n| 有 / 设 | 产品参考 | 官方文档有对应功能 / 需产品偏好设置，未把本地设置当厂商默认 |\n| 开 / 可 | 两侧 | 扩展默认开启 / 可开启；多路线时有一条默认可用即记开，具体写法看逐项说明 |\n| 内 | 原生 | parser 内置，不依赖同名用户开关 |\n| HTML / 属性 / 输出 | 参考 | 借 HTML、属性语义或 writer 选项表达，不是独立基础语法 |\n| 外 / 参 | 产品参考 | 应用或插件等外部层能力（不承诺存在已核验插件） / 仅相关表示，不能认定同一语义 |\n| 占 | Notion 参考 | Markdown API 用 unknown 占位，不能直接还原相应功能 |\n| — / 待 | 参考 | 无本表定义的专门语法路线 / 公开材料尚不足以确定，不强行判不支持 |\n| 未 | 原生 | 没有目标功能的专用实现；显示成普通文本、HTML 或保留原文不算完成 |\n| 保 | 原生 | 明确只保留原文/代码/未知引用，不实现目标语义 |\n| 应用 | 原生 | 已有应用层能力，与正文方言无关 |\n| * | 原生 | 子集、不同写法或语义/编辑边界；必须同时读逐项说明 |\n\nP=markdown；S=markdown_strict；E=markdown_phpextra；M=markdown_mmd；GH=markdown_github（旧版）；C=commonmark；GFM=gfm（Pandoc 3.11）；CX=commonmark_x；T=Typora；O=Obsidian；N=notion-markdown。\n\n原生默认值使用 extensions={}，不含用户覆盖、defaultSyntax 为旧页面附加的兼容配置。开关由 supportsOption/enabled 计算；同一开关可能跨多行能力，一个能力也可能需多个开关。**表格不是全语法 conformance 或完整 UI 验收报告。**\n\n`;
const order = [...pandocVariants, "typora", "obsidian", "notion-markdown"];
const labels = ["P", "S", "E", "M", "GH", "C", "GFM", "CX", "T", "O", "N"];
const groups: [string, number, number][] = [["基础块与列表",1,10],["媒体、容器、资源与服务",11,37],["元数据与扩展块",38,47],["行内内容与文字规则",48,81],["协作与页面元数据",82,87]];
for (const [title, from, to] of groups) {
  md += `## ${title}\n\n| # | 内容能力 | ${labels.join(" | ")} |\n| ${Array(labels.length+2).fill("---").join(" | ")} |\n`;
  for (const row of rows.filter(r=>r.id>=from&&r.id<=to)) md += `| ${row.id} | ${row.name} | ${order.map(v=>row.support[v].reference+"/"+row.support[v].native).join(" | ")} |\n`;
  md += "\n";
}
md += "## 逐项分类、API 映射与实现边界\n\n此表保留原始英文名，避免重命名后失去对应关系。API 列说明可映射对象，不表示 Notdown 已实现 Notion REST 连接或双向转换；原始 Notion 菜单分类保存在 JSON 中，未作为稳定语法标准。\n\n| # | 原始 name → 本次名称 | 建议语义分类 | Notdown 路线（普通 Markdown；Notion） | Notion API / 资源映射 | 修订与边界 |\n| --- | --- | --- | --- | --- | --- |\n";
for (const r of rows) md += `| ${r.id} | ${esc(r.original[1])} → ${r.name} | ${r.category} | ${esc(r.native)}；${esc(notionRoutes[r.id])} | ${r.api} | ${r.note} |\n`;
md += `\n路线中的 / 表示不同写法的替代路线，& 表示需要同时开启；base=内置，none=未接入目标语义，preserve=回退，figure/empty 等是本文分类规则，**不是新增扩展 ID**。实际注册名称见 [config.ts](../../src/markdown-engine/config.ts)。\n\n## MultiMarkdown 6 与 Pandoc markdown_mmd 的区别\n\n用户原表中的“MultiMarkdown”应单独注明实现。以下是 [MMD 6 官方指南](${sources.M})涵盖、但不能从 Pandoc markdown_mmd 名称推导的能力：\n\n| 用户行号 | MMD 6 能力 | Notdown 路线 | 边界 |\n| --- | --- | --- | --- |\n| 18 | 文件转引 | transclusion | 本地预览与依赖解析子集 |\n| 61、62、66–68 | CriticMarkup 高亮、注释、增删改 | critic_markup | 无完整审阅流程 |\n| 64 | MMD 缩写定义/引用 | mmd_abbreviations | 与 PHP/Pandoc abbreviations 分开 |\n| 65 | MMD 引文 | mmd_citations | 与 Pandoc citations/citeproc 分开 |\n| 69 | Glossary | glossary | 术语显示子集 |\n| 70 | 元数据变量 | metadata_variables + metadata_values + mmd_title_block | 需要有效元数据来源 |\n| 16 | TOC 指令 | toc_directives | 与 Pandoc --toc 输出选项分开 |\n| 6、13 | 增强表格与独立图片 | mmd_tables / implicit_figures | 预览、题注和源码编辑子集 |\n\n## 建议补充的独立项目\n\n87 项原表没有删行。为避免同一行藏多种语法，后续维护功能目录时建议增加下列子项；当前开关状态均已在 [扩展矩阵](PANDOC-EXTENSIONS-MATRIX.md) 中逐项列出：\n\n| 原行 | 建议拆分/补项 | 关键区别 |\n| --- | --- | --- |\n| 3 | 缩进代码、反引号围栏、波浪线围栏 | 基础语法 vs 可配置方言扩展 |\n| 6 | pipe/simple/multiline/grid/MMD tables、表题注 | 不同表格语法和可编辑范围 |\n| 8、9 | list 容器与 list_item、definition term/definition | 结构层级不同 |\n| 13、53 | 行内图片、独立图片段落、带题注 Figure | 不要按视觉大小推 AST 类型 |\n| 15、18 | alerts/callout；iframe/文件转引 | 同用途，不同语法及执行层 |\n| 38、39 | mmd_title_block | 键值元信息，不是 YAML front matter |\n| 45 | fenced_divs、bracketed_spans、inline_code_attributes | 原生 fenced_divs 已接入，另外两项尚无同名注册 |\n| 54、56 | 裸 URL、引用式链接定义、自动锚点、隐式标题引用、wiki 双链 | 原生基础链接可用不代表所有引用机制已实现 |\n| 59–65 | HTML 上下标、Pandoc/MMD/Notion 引文、HTML/%%/Critic 注释 | 按实际定界符建子行 |\n| 78 | 硬换行、软换行、块边界、换行忽略/强制换行 | 不同的文本语义 |\n| 82–87 | 页面/块属性、协作对象、资源服务 | 独立于 parser 开关表 |\n\n## 依据与验证范围\n\n- 八种 Pandoc 方言：本机 3.11 CLI 已重新与 [默认值快照](data/pandoc-3.11-extensions.json)逐项核对；功能解释参照 [Pandoc 手册](${sources.P})。\n- 基础结构：[CommonMark 0.31.2](${sources.CM})；原生实现不宣称完整规范通过。\n- 产品参考：[Typora](${sources.T})、[Obsidian 基础语法](https://obsidian.md/help/syntax)、[高级语法](https://obsidian.md/help/advanced-syntax)、[Callouts](https://obsidian.md/help/callouts)、[文件嵌入](https://obsidian.md/help/embeds)、[内部链接](https://obsidian.md/help/links)、[PHP Extra](${sources.E})。第三方插件能力记外，没用本地 Notdown 默认值反推产品默认。\n- Notion：[Enhanced Markdown](${sources.N})、[Markdown API 支持/占位范围](https://developers.notion.com/guides/data-apis/working-with-markdown-content#block-type-support)、[Block API](${sources.NB})、[Rich text](${sources.NR})、[Page](https://developers.notion.com/reference/page)、[Database](https://developers.notion.com/reference/database)、[Views](https://developers.notion.com/guides/data-apis/working-with-views)。公开资料未定义的映射保留待核，不以名称猜测。\n- Notdown：[config.ts](../../src/markdown-engine/config.ts)、[codec.ts](../../src/markdown-engine/codec.ts)、[products.ts](../../src/markdown-engine/products.ts)、[转引文件限制](../../server/syntax-files.ts)、[notion-markdown.ts](../../src/document/notion-markdown.ts)、[editor-schema.ts](../../src/document/editor-schema.ts)、[FORMAT.md](../FORMAT.md)、[PRODUCT-SYNTAX.md](PRODUCT-SYNTAX.md)。\n- 验证：重新运行 5 组现有测试，共 101 项通过；生成器执行 12 个针对分类歧义的真实解析探针并核对原文往返，结果收入 JSON。覆盖折叠标题、空块、图片、引文/脚注区别、未知 tabs、图表代码、raw TeX 与 HTML Div 等；不代表 957 个单元格均做过完整交互验收。\n- 本次仅文档核对，未更改功能、默认开关、页面内容或 MyBase。没有把“可保存原文”计成目标语义已实现。\n\n重新生成：在仓库根目录运行 \`node --import tsx docs/fixtures/content-capabilities.ts\`。原始输入已收入 JSON，复现不依赖个人附件路径。\n`;
fs.writeFileSync("docs/reference/CONTENT-CAPABILITIES.md", md);
console.log(`Generated ${rows.length} rows × ${order.length} dialects; original 87 rows retained; 8 live Pandoc snapshots verified.`);
