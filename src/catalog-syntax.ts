import workbook from "../docs/data/workbook-syntax.json";
import type { Dialect } from "./markdown-engine/config";

/** Reference associations, never parser feature flags or evidence of implementation. */
export interface SyntaxGuide {
  id: string;
  title: string;
  source: string;
  locator: string;
  origin: string;
  variants: Dialect[];
  extensions: string[];
  objects: string[];
  note: string;
  correction?: string;
  limitation?: string;
  references: { label: string; url: string }[];
}
const cm = "https://spec.commonmark.org/0.31.2/";
const gfm = "https://github.github.com/gfm/";
const php = "https://michelf.ca/projects/php-markdown/extra/";
const mmd = "https://fletcher.github.io/MultiMarkdown-6/syntax/";
const notion = "https://developers.notion.com/guides/data-apis/enhanced-markdown";
const typora = "https://support.typora.io/Markdown-Reference/";
const github = "https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/autolinked-references-and-urls";
const reference = (url: string) => [{ label: "Official syntax reference", url }];
type Annotation = Pick<SyntaxGuide, "objects" | "extensions" | "note"> & Partial<Pick<SyntaxGuide, "correction" | "limitation" | "references" | "variants">>;
const annotations = new Map<string, Annotation>();
function rows(sheet: string, numbers: number[], objects: string[], extensions: string[], note: string, extra: Partial<Annotation> = {}) {
  for (const row of numbers) annotations.set(`${sheet}:${row}`, { objects, extensions, note, ...extra });
}
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const core = (numbers: number[], objects: string[], extensions: string[], note: string, extra: Partial<Annotation> = {}) => rows("markdown", numbers, objects, extensions, note, extra);
core(range(2, 5), ["block.divider"], [], "三个或以上同类 *、- 或 _；字符间可有空格。紧接文字的 --- 可能构成 Setext 标题，需结合上下文。");
core(range(6, 12), ["block.heading"], ["space_in_atx_header"], "ATX 标题为 1–6 个 #；CommonMark/GFM 要求后接空白或行尾。可选结尾 # 须以空白分隔。");
core([13, 14], ["block.heading"], [], "Setext 下划线 = 表示一级，- 表示二级标题。");
core([15], ["block.code_block"], [], "四空格缩进代码；不能直接打断普通段落，列表内缩进相对列表内容计算。");
core([16], ["block.code_block"], ["backtick_code_blocks"], "反引号围栏是 CommonMark/GFM 基础语法；Original 不含此语法。Pandoc Markdown 用对应开关。");
core([17], ["block.code_block"], ["fenced_code_blocks"], "波浪线围栏是 CommonMark/GFM 基础语法；Pandoc 的 fenced_code_blocks 指波浪线围栏。");
core([18], ["block.html_block"], ["raw_html"], "块 HTML 与行内 HTML 分类不同；本地预览会清理不安全 HTML，原文保留。");
core([19], ["block.paragraph"], [], "空行分隔段落。");
core([20], ["block.paragraph"], [], "空行参与块分隔，本身不是 CommonMark AST 的叶块。Notdown 的可编辑空段落是编辑器行为。", { correction: "D20 的 leaf block 分类应改为分隔规则；不是独立内容块。" });
core([21, 22], ["block.table"], ["pipe_tables"], "GFM 表格：表头、分隔行、数据行；冒号控制对齐。CommonMark/Original 核心不含表格。", { references: reference(gfm + "#tables-extension-") });
core([23, 24, 25], ["block.quote"], [], "引用允许嵌套；lazy continuation 仅延续段落，并非任意块都能省略 >。");
core([26, 27, 28, 34, 35, 36, 37], ["block.bullet_list_item"], [], "无序列表支持 *、+、-；续段和子块按内容列缩进。", { });
core([29, 30, 31], ["block.numbered_list_item"], ["startnum"], "顺序由首项编号决定，后续源编号不决定显示序列；Original Markdown 忽略起始数字。CommonMark/GFM 保留起始数字。", { });
core([32], ["block.numbered_list_item"], [], "右括号有序标记是 CommonMark/GFM 基础语法，Original 不支持。");
core([33], ["block.bullet_list_item", "block.numbered_list_item"], [], "混合列表按缩进嵌套，不需要 notion_nesting 插件。");
core([38], ["block.task_list_item"], ["task_lists"], "GFM 任务标记位于列表项首，空格表示未完成，x/X 表示完成。", { references: reference(gfm + "#task-list-items-extension-") });
core([39, 40], ["inline.code_span"], [], "反引号段数必须匹配；双反引号可包住单反引号。");
core([41, 42], ["inline.emphasis"], [], "单个 * 或 _ 表示强调；词内下划线规则因方言不同。");
core([43, 44], ["inline.strong_emphasis"], [], "两个 * 或 _ 表示加粗。");
core([45], ["inline.strikethrough"], ["strikeout"], "GFM 删除线扩展，不是 CommonMark 基础语法。", { references: reference(gfm + "#strikethrough-extension-") });
core([46, 47], ["inline.link"], [], "行内链接可附带标题；链接目标不等于已存在的资源。");
core(range(48, 53), ["inline.link"], [], "完整/折叠引用链接与定义配对；定义本身不显示为段落。引用定义不属于可见叶块。");
core([54], ["inline.link"], ["shortcut_reference_links"], "快捷引用需有匹配定义。CommonMark/GFM 内置；原始 Markdown.pl 接受此写法，但 Gruber 语法页未单列。");
core([55, 56], ["inline.image", "block.image_block"], [], "图片是行内语法；独立占一段时可映射图片块，题注语义另由 implicit_figures 决定。");
core([57, 58], ["inline.autolink"], [], "尖括号 URI/邮件自动链接属于基础语法，不依赖 autolink_bare_uris。");
core(range(59, 62), ["inline.autolink"], ["autolink_bare_uris"], "GFM 裸 www、URL、邮箱及 mailto:/xmpp: 协议自动链接；不同解析器接受边界可能不同。", { references: reference(gfm + "#autolinks-extension-") });
core([63], ["inline.inline_html"], ["raw_html"], "行内 HTML 标签，与 Markdown 删除线标记是两种编码。");
core([64], ["block.html_block", "inline.inline_html"], ["raw_html"], "GFM tagfilter 过滤指定 HTML 标签；属于 HTML 输出限制，不是新增可用 HTML 元素。", { correction: "NOT SUPPORTED 容易误导：Original/CommonMark 可解析这些原始 HTML；GFM 增加的是禁用标签过滤规则。D64 也不应只归 inline，块 HTML 同样受影响。", references: reference(gfm + "#disallowed-raw-html-extension-") });
core([65], ["character.line_break"], [], "行末两个或以上空格产生硬换行，不是独立块。");
core([66], ["character.line_break"], ["escaped_line_breaks"], "行末反斜杠硬换行：CommonMark/GFM 内置；Pandoc 使用 escaped_line_breaks 开关。");
core([67], ["character.line_break", "block.paragraph"], ["hard_line_breaks", "ignore_line_breaks"], "普通单换行是 soft break；hard_line_breaks / ignore_line_breaks 分别改变其显示与拼接方式，不是此语法的必需插件。");
core([68], ["block.paragraph"], [], "普通文本；不应为每个标点另建 block。");
core([69, 70], ["character.backslash_escape"], ["all_symbols_escapable", "angle_brackets_escapable"], "转义集合不同：Original 有限，CommonMark/GFM 支持 ASCII 标点。扩展对应的是规则修饰，不是独立内容块。");
core([71], ["character.html_entity"], [], "HTML 命名实体与数字字符引用。表中只举了命名实体；数字例：&#169;、&#xA9;。");

const ext = (numbers: number[], objects: string[], extensions: string[], note: string, extra: Partial<Annotation> = {}) => rows("extended", numbers, objects, extensions, note, extra);
ext([1], ["block.math_block"], ["display_math", "tex_math_dollars"], "双美元独立公式。Typora 的块公式由 display_math 控制；tex_math_dollars 同时涵盖行内与块公式。GFM Spec 本身不含数学。", { variants: ["typora", "obsidian", "notion-markdown", "markdown", "markdown_mmd", "gfm"] });
ext([2], ["inline.footnote"], ["footnotes"], "脚注包含行内引用和块状定义，不能只归 block；GitHub Docs 支持，但不属于 GFM Spec。", { variants: ["typora", "markdown_mmd", "markdown_phpextra", "obsidian", "gfm", "markdown"] });
ext([3], ["metadata.yaml_front_matter"], ["yaml_metadata_block", "mmd_title_block", "metadata_values"], "Typora/Pandoc 使用 YAML；MMD 接受这个简单键值样例和可选 ---，但不支持完整 YAML。页面属性与正文元数据分开。", { variants: ["typora", "markdown_mmd", "markdown"], correction: "MMD 对应 mmd_title_block，不应从该示例推断完整 yaml_metadata_block 支持。" });
ext([4], ["block.table_of_contents"], ["toc_directives"], "Typora 的 [toc] 指令；Pandoc --toc 是输出选项，不是同名 Markdown 扩展。");
ext([5], ["block.callout"], ["alerts"], "GitHub Docs / Typora / Obsidian 提示块；折叠 + / - 是产品变体，不能全部归 GitHub 规范。", { variants: ["typora", "gfm", "obsidian"] });
ext([6], ["inline.internal_link", "block.heading"], ["auto_identifiers", "gfm_auto_identifiers"], "(#header-3) 是基础链接；扩展控制目标标题 ID 的自动生成。", { variants: ["typora", "gfm"] });
ext([7], ["inline.emoji"], ["emoji"], ":smile: 可用于表情短码；原生 Unicode emoji 不需要插件。Notion Enhanced Markdown 另有 :emoji_name: 自定义表情语法。Markdown Guide 是教程，不是方言。", { variants: ["typora", "markdown", "gfm", "notion-markdown"], correction: "更正此前审计：不能否认 Notion 的冒号表情语法。其自定义表情名称与通用 shortcode 字典不等价，也不属于 notion_mentions。", limitation: "本地 emoji 开关处理通用短码，未接入 Notion 工作区自定义表情解析。", references: [...reference(typora + "#emoji-happy"), ...reference(notion + "#custom-emoji")] });
ext([8], ["inline.inline_math"], ["tex_math_dollars"], "美元行内数学；Typora 中是可选功能。", { variants: ["typora", "obsidian", "markdown", "markdown_mmd", "gfm"] });
ext([9], ["inline.subscript"], ["subscript"], "成对 ~ 的下标，与 MMD 简写 x~z 的 short_subsuperscripts 区分。", { variants: ["typora", "markdown_mmd", "markdown"] });
ext([10], ["inline.superscript"], ["superscript"], "成对 ^ 的上标，与 MMD 简写 X^2 区分。", { variants: ["typora", "markdown_mmd", "markdown"] });
ext([11], ["inline.highlight"], ["highlight", "mark"], "==高亮==；highlight 是产品开关，mark 是 Pandoc 开关，语法相似不表示默认值相同。", { variants: ["typora", "obsidian"] });
ext([12], ["block.embed_web_contents"], ["html_embed"], "iframe 属于网页嵌入；不是 notion_html_document HTML 文件块。远端可能拒绝嵌入。");
ext([13, 14, 15], ["block.diagram"], ["diagrams"], "图表代码围栏需要渲染器；空围栏仅展示标记形式，不是有效图表内容。sequence/flow 的兼容转换只覆盖常见语法。", { limitation: "空样例无法验证图形是否正确；Mermaid 渲染与 sequence/flow 兼容范围需分别验收。" });
annotations.get("extended:15")!.variants = ["typora", "obsidian"];
ext([16], ["block.heading"], ["space_in_atx_header"], "Typora 非严格标题写法，要求关闭 space_in_atx_header。", { references: reference("https://support.typora.io/Strict-Mode/") });
ext([17, 18], ["block.numbered_list_item"], ["typora_loose_lists"], "Typora 两空格续行/嵌套；不是 Notion 块嵌套。", { references: reference("https://support.typora.io/Strict-Mode/") });
ext([19], ["block.block_comment"], ["comments"], "Obsidian 的 %% 块注释，保留原文并隐藏显示。");
ext([20], ["inline.inline_comment"], ["comments"], "Obsidian 的 %% 行内注释；不同于 HTML 注释或 CriticMarkup。");
ext([21], ["inline.internal_link"], ["wikilinks_title_after_pipe"], "Obsidian [[目标|显示名]]；单参数省略显示名。");
ext([22], ["inline.internal_link", "inline.link"], [], "相对 .md 链接是基础 Markdown 链接；本地页面解析属于应用能力，无需 Wikilink 插件。");
ext([23], ["block.html_block"], ["raw_html"], "PHP Extra 官方章节名 Inline HTML 讨论了块 HTML 限制的放宽。", { correction: "示例里的 <div> 是块 HTML，不是行内节点；不要按章节名映射到 inline.inline_html。" });
ext([24], ["block.html_block"], ["markdown_attribute"], "markdown=\"1\" 让 HTML 容器中的内容按 Markdown 解析；与自动解析 HTML 容器的 markdown_in_html_blocks 区分。");
ext([25, 26, 27], ["block.heading"], ["header_attributes"], "PHP Extra 标题 ID、class 及键值属性；#id 可用基础锚点链接引用。");
ext([28, 29], ["inline.link", "inline.image"], ["link_attributes"], "链接/图片属性紧随目标括号或引用定义；定义行需有使用点才产生可见链接。");
ext([30, 31], ["block.code_block"], ["fenced_code_blocks", "fenced_code_attributes"], "波浪线围栏可带语言类或属性集合；Notdown 当前 PHP Extra 预设已默认启用两项。");
ext([32], ["block.definition_list_item"], ["definition_lists"], "术语后接冒号定义；一个术语允许多个定义。原例 tern 为 term 拼写笔误。");
ext([33], ["inline.abbreviation"], ["abbreviations"], "PHP Extra 缩写定义，需在正文出现 HTML 才产生缩写提示。");
ext([34], ["block.numbered_list_item"], ["startnum"], "PHP Extra 保留首项起始数字；Notdown 当前预设默认启用 startnum。");
ext([35], ["inline.abbreviation"], ["mmd_abbreviations"], "MMD 缩写引用/行内定义，与 PHP Extra 的 *[HTML]: 不同。");
ext([36, 37], ["inline.citation"], ["mmd_citations"], "MMD 引文与书目定义键必须一致。", { correction: "引用 #Doe:2006 与定义 #Doe2006 不一致。把定义改为 [#Doe:2006]: …，或统一去掉冒号；原样保留供对照。" });
ext([38, 39, 40], ["inline.citation"], ["mmd_citations"], "MMD 引文、抑制正文引用、行内书目与 BibTeX 引用。不是 Pandoc [@key] 的 citations 编码。", { limitation: "BibTeX 例缺少书目文件及真实键；[Not cited][#citekey] 也缺定义，不能据此验收书目排版。" });
ext([41], ["inline.deletion"], ["critic_markup"], "CriticMarkup 删除，保留审阅标记。");
ext([42], ["inline.addition"], ["critic_markup"], "CriticMarkup 增加。");
ext([43], ["inline.substitution"], ["critic_markup"], "CriticMarkup 替换，旧值和新值分开。");
ext([44], ["inline.highlight"], ["critic_markup"], "CriticMarkup 高亮；不同于 ==text== 产品高亮。");
ext([45], ["inline.inline_comment"], ["critic_markup"], "CriticMarkup 审阅评论；不同于 Obsidian 隐藏注释。");
ext([46], ["block.heading", "inline.internal_link"], ["mmd_header_identifiers", "implicit_header_references"], "MMD 标题标识符位于尾部 # 之前；隐式标题引用匹配该 ID。");
ext([47, 48], ["block.file_transclusion"], ["transclusion"], "MMD 文件展开，可位于段落中；.* 按输出扩展选择文件，不是把所有同名文件拼接。", { limitation: "本地实现只读知识库内文件；缺文件时保留源码并提示，未实现任意磁盘包含。" });
ext([49], ["inline.glossary"], ["glossary"], "MMD 术语引用、行内解释与定义。");
ext([50], ["block.image_block", "inline.image"], ["implicit_figures"], "独立图片可产生 figure/题注；不是 Markdown 图片语法变成了另一种标记。");
ext([51, 52], ["inline.link", "inline.image"], ["mmd_link_attributes"], "MMD key=value 属性；v6 也支持行内链接。Pandoc 同名扩展的手册重点是引用定义属性。");
ext([53], ["inline.inline_math", "block.math_block"], ["tex_math_double_backslash"], "每侧两个实际反斜杠的 \\(…\\) / \\[ … \\] 编码，不要与单反斜杠数学混淆。");
ext([54], ["inline.superscript"], ["short_subsuperscripts"], "MMD 简写上标连续读取字母数字，不需要结尾 ^。");
ext([55], ["inline.subscript"], ["short_subsuperscripts"], "MMD 简写下标连续读取字母数字，不需要结尾 ~。");
ext([56], ["metadata.yaml_front_matter", "inline.metadata_variable"], ["mmd_title_block", "metadata_values", "metadata_variables"], "MMD 顶部键值元数据由 [%foo] 引用；metadata_values 是 Notdown 展示层开关，不是 Pandoc 官方扩展。");
ext([57], ["inline.raw_source", "block.raw_source"], ["raw_attribute"], "MMD v6 确实支持 {=html}/{=latex} 原始输出标记，Pandoc 也有同名扩展；本地保留源码，不执行 TeX。");
ext([58], ["character.smart_typography"], ["smart"], "智能标点需要上下文；行首 --- 还可能是分隔线。Typora 可选设置不等于默认开启。", { variants: ["markdown_mmd", "markdown", "typora"] });
ext([59, 60], ["block.table_of_contents"], ["toc_directives"], "MMD {{TOC}}；6.5 起 :N 只取该级别、:N-M 取级别区间，不是最大深度 N。");
ext([61], ["block.table"], ["mmd_tables"], "MMD 分组表头、跨列、分区及题注；不能映射为只有 GFM pipe_tables 的能力。");
ext([62], ["inline.inline_html", "inline.internal_link"], ["raw_html"], "HTML 自定义锚点 + 普通片段链接；不是独立 GitHub 扩展。", { limitation: "已确认本地 HTML 清理器移除 a 的 name/id，故此例虽保留源码，却不能生成可跳转的 custom-anchor-point 目标。" });
ext(range(63, 70), ["inline.link"], [], "GitHub 站点语义，需要账号、仓库或集成配置，不属于 GFM Spec 的裸 URL 自动链接。", { correction: "应标记 GitHub Docs / 平台功能；不能映射为 emoji、notion_mentions 或 autolink_bare_uris。第 63 行 @github/support 是团队提及，不是单个用户。", limitation: "Notdown 未实现团队通知、Issue/PR/JIRA/SHA 短引用解析；原文按普通文本保留。", references: reference(github) });
ext([71], ["block.math_block"], ["tex_math_gfm"], "GitHub Docs 的 math 围栏；对应 Pandoc tex_math_gfm，可选于本地 GFM。");
ext([72, 73], ["block.code_block", "inline.code_span"], [], "R Markdown/knitr 的可执行代码块与行内 R 表达式。", { limitation: "Notdown 未注册 R Markdown 方言或 knitr 执行器；只显示/保留代码，不计算输出。", references: reference("https://rmarkdown.rstudio.com/lesson-3.html"), variants: [] });
ext([77], ["inline.text_color", "block.paragraph"], ["notion_colors"], "此处 Enhanced markdown 指 Notion Enhanced Markdown；段落尾属性是块颜色，行内颜色用 <span color=\"blue\">…</span>。", { correction: "text {color=\"blue\"} 不应笼统标成通用行内颜色语法；它是 Notion 块属性。" });
ext([78], ["block.toggle_heading"], ["notion_nesting"], "Notion 折叠标题；子块用 tab 缩进。本地已有插入、编辑、折叠持久化及子树移动。", { correction: "PHP Extra 可保存 toggle 属性，但不赋予折叠交互语义；应移除 PHP Extra 的等价折叠支持关系。" });
ext([80], ["block.callout"], ["notion_callouts"], "Notion callout 标签；官方子内容用 tab 缩进，表格里的单空格是本地宽松示例，不作为规范缩进范例。");
ext([81], ["block.paragraph"], [], "Notion 的显式空段落；不是 Pandoc empty_paragraphs 扩展。");
ext([82], ["block.columns"], ["notion_columns"], "Notion 多列容器及子列；官方层级用 tab 缩进，表格样例使用空格。");
ext([83], ["block.file"], ["notion_media"], "Notion 文件引用；URL 是占位符，需实际文件地址。");
ext([84], ["block.pdf"], ["notion_media"], "Notion PDF 引用；与基础链接不同。");
ext([85], ["block.link_to_page"], ["notion_pages"], "页面引用不自动建立本地父子页面归属关系。");
ext([86], ["block.unsupported"], ["notion_databases"], "数据库引用属于 Notion Enhanced Markdown。", { limitation: "本地没有数据库对象与查询引擎；仅作为 Unsupported 保留源码。已注册开关不表示数据库功能已实现。" });
ext([87], ["block.table_of_contents"], ["notion_toc"], "Notion 目录标签；与 [toc]/{{TOC}} 的 toc_directives 区分。");
ext([88], ["block.synced_block"], ["notion_synced"], "Notion 同步块及引用编码。", { limitation: "本地只支持快照、本地刷新与 CAS 发布；占位 URL 不可解析，不提供跨端同步或 Notion 云同步。" });

const origins: Record<string, { variant?: Dialect; url: string }> = {
  Typora: { variant: "typora", url: typora },
  Obsidian: { variant: "obsidian", url: "https://help.obsidian.md/syntax" },
  "PHP Markdown Extra": { variant: "markdown_phpextra", url: php },
  MultiMarkdown: { variant: "markdown_mmd", url: mmd },
  "GFM with extensions": { variant: "gfm", url: github },
  "Enhanced markdown": { variant: "notion-markdown", url: notion },
  "R Markdown": { url: "https://rmarkdown.rstudio.com/lesson-3.html" },
};
const isSample = (value: string) => !!value && !["SUPPORTED", "NOT SUPPORTED", "INCLUDED IN PERL CODE"].includes(value);
export const workbookSyntax: SyntaxGuide[] = Object.entries(workbook.sheets).flatMap(([sheet, data]) =>
  data.flatMap(rawCells => {
    const cells: Record<string, string> = Object.fromEntries(Object.entries(rawCells).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
    const row = Number(Object.keys(cells)[0].replace(/\D/g, ""));
    if (sheet === "markdown" && row === 1) return [];
    const a = annotations.get(`${sheet}:${row}`);
    if (!a) throw new Error(`Missing workbook syntax annotation: ${sheet}:${row}`);
    const origin = sheet === "markdown" ? "Original / CommonMark / GFM" : cells[`A${row}`];
    const source = sheet === "extended" ? cells[`D${row}`] : ["C", "F", "G"].map(col => cells[`${col}${row}`]).find(isSample) ?? "\n\n";
    const variants: Dialect[] = sheet === "markdown"
      ? ([['C', 'markdown_strict'], ['F', 'commonmark'], ['G', 'gfm']] as const).filter(([col]) => cells[`${col}${row}`] !== "NOT SUPPORTED").map(([, id]) => id)
      : origins[origin].variant ? [origins[origin].variant!] : [];
    return [{
      id: `workbook-${sheet}-${row}`, title: sheet === "markdown" ? cells[`E${row}`] || cells[`B${row}`] : cells[`C${row}`],
      source, locator: `${sheet}!A${row}:${sheet === "markdown" ? 'G' : 'E'}${row}`, origin,
      variants, references: reference(sheet === "markdown" ? cm : origins[origin].url), ...a,
    }];
  }));

export const workbookCaptured = workbook.captured;
