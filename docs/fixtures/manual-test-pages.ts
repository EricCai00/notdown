import { editorKind } from "../../src/document/node-identity";
import { localObjectPlugins } from "../../src/markdown-engine/presets";
/** User-visible acceptance specimens. Pure builder: importing never opens a vault. */
import { dialects, enabled, extensions, usesNotionSyntax, type SyntaxConfig, type Dialect } from "../../src/markdown-engine/config";
import { contentObjects, resolveContentObject, resolveMarkObject } from "../../src/document/content-objects";
import { blockCatalog } from "../../src/catalog/block-catalog-data";
import { catalogExtensions } from "../../src/catalog/catalog-relations";
import { objectSamples } from "../../src/document/object-model";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec";

export type Resources = { image: string; audio: string; video: string; pdf: string; text: string; bibliography: string; target: string };
export type Specimen = { key: string; title: string; body: string; syntax: SyntaxConfig; objects: string[]; probes: string[]; childTarget?: string };
const xml = (s: string) => s.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
const config = (variant: Dialect, flags: string[] = [], off: string[] = []): SyntaxConfig => ({ version: 1, variant, extensions: Object.fromEntries([...flags.map(f => [f, true]), ...off.map(f => [f, false])]) });
const instruction = `这是一份可操作的验收样本，不是完整兼容性通过报告。每个用例下面是真实正文，只有“源码对照”位于代码块中。

检查顺序：页面显示 → 编辑文字或属性 → 撤销／重做 → 拖动独立块 → 切换 Source / Split / Page → 保存后刷新。确认相邻用例、未知属性和原文没有丢失。资源错误、扩展未开启和解析错误应分开记录。

验收记录：日期＝待填；显示＝待测；编辑＝待测；撤销＝待测；保存重开＝待测；问题与截图＝待填。

服务操作只有手动点击时才执行。音频是合成测试音，不是语音，不能用它判断转录准确率；模型响应、跨端同步和上游完整兼容性不属于自动检查结论。`;
function literal(source: string) { let fence = "````"; while (source.includes(fence)) fence += "`"; return fence + "markdown\n" + source + "\n" + fence; }
function section(id: string, title: string, source: string, expected: string, showSource = false) {
  return `## ${id} — ${title}\n\n预期与操作：${expected}\n\n${source}\n\n${showSource ? "源码对照（此围栏内不应触发语法）：\n\n" + literal(source) + "\n\n" : ""}记录：显示［ ］ 编辑［ ］ 撤销［ ］ 重开［ ］；备注：\n\n`;
}
function recognized(raw: string, syntax: SyntaxConfig) {
  const ids = new Set<string>(), doc = parseNative(raw, syntax); doc.check();
  doc.descendants((node, _pos, parent) => {
    const object = resolveContentObject(node, { parent: parent || undefined }); if (object) ids.add(object.id);
    node.marks.forEach(mark => { const o = resolveMarkObject(mark); if (o) ids.add(o.id); });
  });
  return ids;
}
function objectSources(r: Resources, syntax: SyntaxConfig): Record<string, string> {
  const sources = Object.fromEntries(blockCatalog.filter(o => o.sample).map(o => [o.id, o.sample!])) as Record<string,string>;
  Object.assign(sources, {
    "block.code_block": syntax.variant === "markdown_strict" ? "    const sample = '**literal**';\n    // A code line" : '```javascript\nconst sample = "**literal**";\n```',
    "block.callout": enabled(syntax, "alerts") && !usesNotionSyntax(syntax) ? '> [!NOTE]- Editable title\n> Fold, change this text, save and reopen.' : '<callout icon="💡" color="blue_bg" custom="keep">\nEditable callout\n</callout>',
    "block.table": usesNotionSyntax(syntax) ? '<table header-row="true">\n<tr><td>Name</td><td>Value</td></tr>\n<tr><td>Alpha</td><td>42</td></tr>\n</table>' : '| Name | Value |\n| :--- | ---: |\n| Alpha | **42** |',
    "block.table_of_contents": usesNotionSyntax(syntax) ? '<table_of_contents/>' : '[toc]',
    "block.image_block": `![Image caption](${r.image})`,
    "block.audio": `<audio src="${r.audio}">Synthetic tone: playback only</audio>`,
    "block.video": `<video src="${r.video}">Generated silent test video</video>`,
    "block.pdf": `<pdf src="${r.pdf}">Local one-page PDF</pdf>`,
    "block.file": `<file src="${r.text}">Download local sample text</file>`,
    "block.file_transclusion": `{{${r.text}}}`,
    "block.web_embed": '<iframe src="about:blank" title="Isolated blank frame"></iframe>',
    "block.link_to_page": `<page-link url="#page/${r.target}">Fixture target</page-link>`,
    "block.child_page": `<page url="#page/fixture-child-${syntax.variant}">Fixture child (ownership comes from page metadata)</page>`,
    "block.breadcrumb": `<breadcrumb path="${r.target}"/>`,
    "block.synced_block": `<synced_block_reference url="#page/${r.target}#block=acceptance-source">\nLocal snapshot: refresh manually\n</synced_block_reference>`,
    "block.meeting_notes": '<meeting-notes>\n\tMeeting title\n\t<notes>\n\t\tManual notes.\n\t</notes>\n</meeting-notes>',
    "block.example_list_item": '(@first-case) First example\n(@second-case) Second example\n\nReference: @second-case.',
    "block.raw_tex": '\\begin{center}\nRaw TeX source\n\\end{center}',
    "inline.code_span": 'Text with `**literal**` code.', "inline.emphasis": '*Italic text*', "inline.strong_emphasis": '**Bold text**',
    "inline.strikethrough": '~~Deleted text~~', "inline.link": '[External link](https://example.com)',
    "inline.image": `Inline ![sample](${r.image}) between words.`, "inline.autolink": '<https://example.com>',
    "inline.internal_link": `[[${r.target}|Fixture target]]`, "inline.emoji": 'Unicode 😀 and shortcode :smile:',
    "inline.inline_math": 'Inline $x^2+y^2$ formula.', "inline.subscript": 'H~2~O', "inline.superscript": 'x^2^',
    "inline.highlight": '==Highlighted text==', "inline.inline_comment": 'Before %%hidden note%% after.',
    "inline.footnote": 'Reference[^acceptance].\n\n[^acceptance]: Editable footnote body.',
    "inline.abbreviation": 'HTML\n\n*[HTML]: Hyper Text Markup Language',
    "inline.citation": '[#fixture]\n\n[#fixture]: Local citation definition.',
    "inline.deletion": '{--Deleted text--}', "inline.addition": '{++Added text++}', "inline.substitution": '{~~Old text~>New text~~}',
    "inline.glossary": '[?Term]\n\n[?Term]: Editable glossary definition.', "inline.metadata_variable": 'Read [%title] from body metadata.',
    "inline.underline": '<span underline="true">Underlined text</span>', "inline.small_caps": '[Small capitals]{.smallcaps data-extra="keep"}',
    "inline.native_span": '[Span text]{#sample-span .custom lang="en" data-extra="keep"}',
    "inline.mention_person": '<mention-user url="local:fixture-person">Example person</mention-user>',
    "inline.mention_page_or_data_source": '<mention-data-source url="https://example.com/data">Example data source</mention-data-source>',
    "inline.date_or_reminder": '<mention-date start="2030-01-01" end="2030-01-02">Example date range (no reminder scheduled)</mention-date>',
    "inline.text_color": '<span color="red">Red text</span>', "inline.background_color": '<span color="yellow_bg">Yellow background</span>',
    "character.line_break": 'First line  \nSecond line', "character.HTML_entity": '&amp; &lt; &#169;',
    "character.html_entity": '&amp; &lt; &#169;', "character.backslash_escape": '\\*literal stars\\* and \\# text',
    "character.smart_typography": '"Quotes" -- --- ...',
  });
  for (const key of Object.keys(sources)) sources[key] = sources[key].replaceAll("example.png", r.image);
  return sources;
}
function metadataPrefix(syntax: SyntaxConfig, r: Resources) {
  if (enabled(syntax, "mmd_title_block")) return `Title: Fixture metadata\nAuthor: Example author\nBase Header Level: 002\nComment: First line\n    second line: plain text\nBibliography: ${r.bibliography}\n\n`;
  if (enabled(syntax, "pandoc_title_block")) return '% Fixture metadata\n% Example author\n% 2026-09-22\n\n';
  if (enabled(syntax, "yaml_metadata_block")) return '---\ntitle: Fixture metadata\nnumber: 42\nflag: true\ncustom:\n  keep: yes\n---\n\n';
  return '';
}

export function buildManualPages(r: Resources): Specimen[] {
  const pages: Specimen[] = dialects.map((dialect, index) => {
    const syntax = config(dialect.id), sources = objectSources(r, syntax), objects: string[] = [], omitted: string[] = [];
    const prefix = metadataPrefix(syntax, r);
    let body = prefix + `# ${dialect.label} — 默认配置验收\n\n方言 ID：${dialect.id}。扩展覆盖值为空，使用该预设自身的默认值；不要在此页一次开启所有扩展。\n\n${instruction}\n\n`;
    const defaults = extensions.filter(e => enabled(syntax, e.id)).map(e => e.id);
    body += '当前默认启用的扩展：' + defaults.map(id => '`' + id + '`').join('、') + '。\n\n';
    for (const object of contentObjects) {
      if (object.category === 'metadata') {
        if (prefix && recognized(prefix, syntax).has(object.id)) objects.push(object.id); else omitted.push(object.name);
        continue;
      }
      const source = sources[object.id];
      if (source && (object.category === 'character' || object.id === 'inline.emoji' || recognized(source, syntax).has(object.id) || object.id === 'inline.autolink' && recognized(source, syntax).has('inline.link'))) {
        objects.push(object.id);
        body += section('D' + String(objects.length).padStart(2, '0'), object.name, source,
          `${object.id}。${object.note || '保持该对象的语义、层级与格式。'} 在此用例内修改后撤销，确认其他用例不变。`);
      } else omitted.push(object.name);
    }
    body += '## 默认配置的边界\n\n下列对象未在这组默认样例中形成对应对象；这不是“全部未实现”的结论。请到 Extensions 页面使用相应配置单独验收：\n\n' + omitted.join('、') + '。\n\n';
    body += section('R01', '代码保护与往返', '    <callout>must remain code</callout>\n    **not bold**\n    [toc]', '这些行始终作为代码显示；切换视图不应执行其中的标签。');
    return { key: `dialect-${dialect.id}`, title: `${String(index + 1).padStart(2, '0')} · ${dialect.label} — Tests`, body, syntax, objects, probes: defaults,
      childTarget: objects.includes('block.child_page') ? `fixture-child-${dialect.id}` : undefined };
  });
  const sources = objectSources(r, config('markdown'));
  const groups: { key: string; title: string; variant: Dialect; flags: string[]; off?: string[]; prefix?: string; cases: [string[], string, string][] }[] = [
    { key: 'blocks', title: 'Blocks, tables & lists', variant: 'markdown', flags: [], cases: [
      [['pipe_tables','table_captions','table_attributes'], '| A | B |\n|---|---|\n| 1 | 2 |\n\nTable: Caption {#table-id .sample}', '表格和题注可编辑；修改行列后保存，ID 与题注保留。'],
      [['grid_tables'], '+-------+-------+\n| Name  | Value |\n+=======+=======+\n| One   | Two   |\n+-------+-------+', '网格表格进入统一 Table，可合并／拆分单元格。'],
      [['simple_tables'], 'Name    Value\n------- -------\nOne     Two\n', '固定宽度简单表格进入 Table。'],
      [['multiline_tables'], '---------------\nName    Value\n------- -------\nOne     Two\n        Three\n---------------', '多行单元格保留两行内容。'],
      [['definition_lists'], 'Term\n:   First definition\n\nOther\n:   Second definition', '两组定义可分别移动，重开后次序不变。'],
      [['line_blocks'], '| First line\n| Second line\n|   Indented line', '保留行及缩进。'],
      [['fenced_divs'], '::: {.sample #container}\nEditable **children**\n:::', '容器子块可编辑，属性保留。'],
      [['native_divs','markdown_in_html_blocks'], '<div class="native" data-extra="keep">\n\n**Markdown children**\n\n</div>', 'Div 属性及编码保留，子内容作为 Markdown 编辑。'],
      [['markdown_attribute'], '<div markdown="1">\n**Markdown inside HTML**\n</div>', '有 markdown 属性的 HTML 容器解释 Markdown。'],
      [['fancy_lists'], 'a. Alpha\nb. Beta\n\n(iv) Roman four\n(v) Roman five', '保留字母／罗马数字和分隔符。'],
      [['example_lists'], sources['block.example_list_item'], '删除第一项后第二项与 @second-case 同步更新编号。'],
      [['task_lists'], '- [ ] Pending task\n- [x] Completed task', '复选框切换可撤销并保存。'],
    ] },
    { key: 'inline', title: 'Inline formatting, references & attributes', variant: 'markdown', flags: [], off: ['wikilinks_title_before_pipe'], cases: [
      [['strikeout','subscript','superscript','mark','highlight'], '~~strike~~ H~2~O x^2^ ==highlight== **bold**', '粗体、删除线、高亮、上下标各自独立。mark 与 highlight 都开启时，用开关逐项对照。'],
      [['short_subsuperscripts'], 'H~2 x^2', '单字符上下标的短写；关闭后与配对分隔符写法对照。'],
      [['bracketed_spans','attributes','native_spans'], '[Span]{#inline-id .sample data-extra="keep"} [Small]{.smallcaps}\n\n<span class="native">Native span</span>', 'Span 属性可编辑；Small caps 保留未知属性。'],
      [['inline_code_attributes'], '`code`{.language-js data-extra="keep"}', '代码及附加属性保存后仍存在。'],
      [['footnotes','inline_notes'], 'Footnote[^ext-note] and ^[an **inline note**].\n\n[^ext-note]: Editable note body.', '脚注引用、独立正文与行内注释可区分。'],
      [['abbreviations'], sources['inline.abbreviation'], '双击 HTML 修改展开文本，撤销／保存重开。'],
      [['emoji'], ':smile: :heart: 😀', '已知名称转 Emoji；Unicode 仍是普通文本。'],
      [['autolink_bare_uris'], 'https://example.com/path', '裸 URL 成为链接；关闭后对照。'],
      [['header_attributes','auto_identifiers','implicit_header_references'], '### Named heading {#named .sample}\n\n[Jump](#named) and [Named heading]', '显式锚点可跳转，标题引用按开启规则解析。'],
      [['link_attributes'], `[Local](#page/${r.target}){#link-id .sample}`, '链接地址与属性分别保留。'],
      [['implicit_figures'], `![Figure caption](${r.image})`, '独立图片按 figure 语义显示题注。'],
      [['shortcut_reference_links','spaced_reference_links'], '[fixture] and [label] [fixture]\n\n[fixture]: https://example.com "Reference title"', '快捷引用及有空格的引用可分别开关。'],
      [['wikilinks_title_after_pipe'], `[[${r.target}|Readable title]]`, '竖线之后是显示标题，目标是 Fixture 页。'],
    ] },
    { key: 'lexical', title: 'Whitespace, escaping & code boundaries', variant: 'markdown', flags: [], off: ['ignore_line_breaks','east_asian_line_breaks','hard_line_breaks','literate_haskell'], cases: [
      [['blank_before_header'], 'Paragraph directly before\n## Heading boundary', '开启时要求标题前有空行；关闭后对照。'],
      [['blank_before_blockquote'], 'Paragraph directly before\n> Quote boundary', '开启时要求引用前有空行。'],
      [['space_in_atx_header'], '#NoSpace', '开启时此行不应变成标题。'],
      [['lists_without_preceding_blankline'], 'Paragraph before list\n1. First item\n2. Second item', '无需空行的列表开关影响边界。'],
      [['startnum'], '7. Seven\n8. Eight', '起始编号是 7；关闭后对照。'],
      [['four_space_rule'], '- Parent\n  two-space continuation\n    four-space continuation', '对照两空格与四空格的列表续行归属。'],
      [['backtick_code_blocks','fenced_code_blocks','fenced_code_attributes'], '```{.javascript #fenced-code}\nconst value = "[toc]";\n```\n\n~~~text\n**literal**\n~~~', '两种围栏与代码属性分别保留，内部语法不执行。'],
      [['escaped_line_breaks'], 'First\\\nSecond', '末尾反斜杠生成显式换行。'],
      [['all_symbols_escapable','angle_brackets_escapable'], '\\<tag\\> \\= \\*literal\\*', '扩展转义与尖括号转义可分别对照。'],
      [['intraword_underscores'], 'alpha_beta_gamma', '词内下划线保留，不能错误变斜体。'],
      [['smart','old_dashes'], '"Quotes" -5 2-3 -- --- ... and `-- -5`', '智能标点仅影响正文；old_dashes 依赖 smart；代码不变。'],
    ] },
    { key: 'product', title: 'Typora / Obsidian product extensions', variant: 'typora', flags: [], cases: [
      [['alerts'], '> [!TIP]- Custom title\n> Collapsible body', 'Callout 标题、类型、折叠可编辑并持久化。'],
      [['toc_directives'], '[toc]\n\n### Directory target\n\n#### Child target', '新增或改名标题后目录更新，点击可跳转。'],
      [['diagrams'], '```mermaid\nflowchart LR\n A[Write] --> B[Save]\n```', '图表本地渲染；修改源码与撤销后恢复。'],
      [['comments'], 'Before %%hidden inline%% after.\n\n%%\nHidden block comment\n%%', '注释隐藏显示但保存原文。'],
      [['html_embed'], '<iframe src="about:blank" title="Blank isolated frame"></iframe>', '隔离 iframe，不依赖外部网站。'],
      [['raw_html'], '<div><strong>Sanitized HTML</strong><script>window.BAD=true</script></div>', '粗体可见，脚本不执行。'],
      [['transclusion'], `{{${r.text}}}`, '读取真实本地附件；路径错误应显示错误并保留源码。'],
      [['typora_loose_lists'], '- [ ] Parent\n  - [x] Nested task\n\n- Next item', 'Typora 两空格嵌套任务可操作。'],
    ] },
    { key: 'mmd', title: 'MultiMarkdown metadata & CriticMarkup', variant: 'markdown_mmd', flags: [], prefix: `Title: Fixture metadata\nAuthor: Example author\nBase Header Level: 002\nBibliography: ${r.bibliography}\nComment: First line\n    second line: text\n\n`, cases: [
      [['mmd_title_block','metadata_values','metadata_variables'], 'Title: [%title]; level: [%base headerlevel]', '页首 MMD 字段按纯文本处理；修改字段后变量更新，不覆盖页面属性。'],
      [['mmd_tables'], '| A | B | C |\n|---|---|---|\n| Wide || right |\n| ^^ || bottom |\n[Table caption][mmd-table]', '跨行跨列与独立题注保存后保留。'],
      [['mmd_abbreviations'], '[>HTML]\n\n[>HTML]: Hyper Text Markup Language', '缩写定义可编辑，引用提示更新。'],
      [['mmd_citations'], '[p. 12][#fixture]', '本地 bibliography 用 fixture 条目解析引用。'],
      [['critic_markup'], '{++addition++} {--deletion--} {~~before~>after~~} {==highlight==} {>>comment<<}', '五种 CriticMarkup 保留语义；替换原文可通过属性编辑。'],
      [['glossary'], sources['inline.glossary'], '术语引用可定位并显示定义。'],
      [['mmd_header_identifiers'], '### MMD heading [mmd-heading]\n\n[Jump](#mmd-heading)', '显式 MMD 标识保留并用于跳转。'],
      [['mmd_link_attributes'], `![Image](${r.image}) width="120" height="80"`, '按 MMD 属性语法检查尺寸及保存。'],
    ] },
    { key: 'math', title: 'Math, raw formats & citations', variant: 'markdown', flags: [], prefix: `---\ntitle: Fixture metadata\nbibliography: ${r.bibliography}\ncustom:\n  preserve: true\n---\n\n`, cases: [
      [['yaml_metadata_block'], 'Page title and body title are separate.', '页首正文 YAML 的未知字段、类型及多行内容不丢失。'],
      [['tex_math_dollars','latex_macros'], '\\newcommand{\\RR}{\\mathbb{R}}\n\nInline $\\RR$ and block:\n\n$$\nx^2+y^2=z^2\n$$', '宏作用于后续公式；只编辑公式值，定义保留。'],
      [['tex_math_single_backslash'], '\\(x+1\\)\n\n\\[\ny=2\n\\]', '单反斜杠数学保持原编码。'],
      [['tex_math_double_backslash'], '\\\\(x+1\\\\)\n\n\\\\[\ny=2\n\\\\]', '双反斜杠数学保持原编码；与单反斜杠开关分别测试。'],
      [['tex_math_gfm'], '$`x+1`$\n\n```math\ny=2\n```', 'GFM 数学行内和围栏都显示公式。'],
      [['raw_attribute'], '`\\alpha`{=latex}\n\n```{=openxml}\n<w:p>Raw source</w:p>\n```', '行内／块原始格式保留目标标签，不当作未知对象。'],
      [['raw_tex'], '\\textbf{outer \\emph{inner}}\n\n\\begin{center}\nRaw TeX\n\\end{center}', '嵌套参数和环境作为可编辑源码保留；浏览器不执行 TeX。'],
      [['citations'], 'Citation [@fixture, p. 12].', '本机 Pandoc citeproc 读取本地书目；失败时原始引用仍可编辑。'],
    ] },
    { key: 'notion', title: 'Notion encodings & source preservation', variant: 'notion-markdown', flags: [], cases: [
      [['notion_columns'], '<columns>\n<column>\nLeft\n</column>\n<column>\nRight\n</column>\n</columns>', '两列内容可直接编辑，宽度和子块不互换。'],
      [['notion_callouts'], '<callout icon="💡" color="blue_bg" custom="keep">\nEditable content\n</callout>', '与 alerts 共用 Callout，但开关按编码分开。'],
      [['notion_toggles'], '<details>\n<summary>Toggle title</summary>\n\tToggle child\n</details>', '官方 variant 的折叠仅改变视图；Notdown 才持久保存 open。'],
      [['notion_tables'], '<table header-row="true">\n<tr><td>A</td><td>B</td></tr>\n<tr><td>1</td><td>2</td></tr>\n</table>', '与其他表格共用模型，可增删行列；合并和题注需要 Notdown 的 Pandoc 表格编码。'],
      [['notion_pages'], `<page url="#page/${r.target}">Fixture target</page>\n\n<mention-page url="#page/${r.target}">Fixture inline reference</mention-page>`, '块引用与行内提及不同；点击后返回此页继续。'],
      [['notion_mentions'], sources['inline.mention_person'] + '\n\n' + sources['inline.date_or_reminder'], '提及载荷可编辑；没有自动安排提醒。'],
      [['notion_media'], ['block.audio','block.video','block.pdf','block.file'].map(k => sources[k]).join('\n\n'), '本地音视频、PDF 与文件均使用真实附件。'],
      [['notion_databases'], '<database url="https://www.notion.so/fixture-database" custom="keep">Database reference</database>', '引用及属性可保留；不创建本地数据库引擎，也不操作远端数据库。'],
      [['notion_synced'], sources['block.synced_block'], '官方 variant 保留引用和内容；本地 Refresh/Publish 仅在 Notdown 中可用。'],
      [['notion_toc'], '<table_of_contents/>', '目录跟随标题更新。'],
      [['notion_nesting'], 'Parent paragraph\n\tChild paragraph\n\t\tGrandchild\n\n## Toggle heading {toggle="true"}\n\tHeading child', '移动父级携带子树；折叠标题和普通标题共用结构。'],
      [['notion_colors'], '<span color="red">Red text</span> <span color="yellow_bg">Background</span>', '文本颜色与背景色。'],
      [['notion_underline'], '<span underline="true">Underline</span>', '下划线有独立开关，不依赖颜色。'],
    ] },
  ];
  for (const [index, group] of groups.entries()) {
    const flags = [...new Set([...group.flags, ...group.cases.flatMap(c => c[0]), ...(group.prefix ? ['metadata_values'] : [])])];
    const syntax = config(group.variant, flags, group.off);
    let body = (group.prefix || '') + `# Extensions — ${group.title}\n\n${instruction}\n\n本页显式开启：${flags.map(f => '`' + f + '`').join('、')}。每轮只切换一个目标开关，记录当前配置并恢复。多种写法共享对象时，关闭一个开关可能仍由其他编码规则识别，应同时查看源码。\n\n`;
    group.cases.forEach(([ids, sample, expected], i) => { body += section('E' + (i+1).toString().padStart(2,'0'), ids.join(' + '), sample, expected, true); });
    pages.push({ key: 'extensions-' + group.key, title: `${20+index} · Extensions — ${group.title}`, body, syntax, objects: [], probes: flags });
  }
  // Mutually exclusive readers and leading metadata must be tested separately.
  const isolated: [string, string, string, string, string[]][] = [
    ['symbol_replacements','Literal -> <- <-> => <=> <= >= != +/- ... (c) (r) (tm)','加载与源码编辑保留 ASCII。在正文新输入这些组合应变为 Unicode；立即退格撤回上一步。代码和链接内不替换，关闭开关后不替换。','notdown',[]],
    ['display_math','$\nx^2\n$','块公式独立开启；行内公式保持关闭。','typora',['tex_math_dollars']],
    ['hard_line_breaks','First\nSecond','换行成为显式换行。','typora',['ignore_line_breaks','east_asian_line_breaks']],
    ['ignore_line_breaks','First\nSecond','换行被忽略；和 hard_line_breaks 分开比较。','markdown',['hard_line_breaks','east_asian_line_breaks']],
    ['east_asian_line_breaks','中文第一行\n中文第二行','中日韩字符之间的软换行不引入空格。','markdown',['hard_line_breaks','ignore_line_breaks']],
    ['wikilinks_title_before_pipe',`[[Readable title|${r.target}]]`,'竖线前是标题，后是目标；另一种顺序关闭。','markdown',['wikilinks_title_after_pipe']],
    ['literate_haskell','> main = print 1\n> value = 2','鸟迹行作为 Haskell 代码，其他页的 > 仍测试引用。','markdown',[]],
    ['pandoc_title_block','% A title\n  continuation\n% Example author\n% 2026-09-22','页首标题、作者和日期分别可编辑。','markdown',[]],
  ];
  // Several small independent pages prevent one reader's rules masking another.
  for (const [flag, sample, expectation, variant, off] of isolated) {
    const syntax = config(variant as Dialect, [flag, 'metadata_values'], off);
    const body = (flag === 'pandoc_title_block' ? sample + '\n\n' : '') + `# Extension — ${flag}\n\n${instruction}\n\n${section('I01', flag, flag === 'pandoc_title_block' ? '元数据位于本页正文最开头。' : sample, expectation, flag !== 'pandoc_title_block')}`;
    pages.push({ key: 'extension-' + flag, title: `30 · Extension — ${flag}`, body, syntax, objects: [], probes: [flag] });
  }
  const remaining = ['ascii_identifiers','gfm_auto_identifiers','sourcepos','rebase_relative_paths','gutenberg'];
  const utilitySyntax = config('markdown', [...remaining, 'auto_identifiers']); utilitySyntax.sourcePath = 'chapters/fixture.md';
  pages.push({ key: 'extensions-tools', title: '31 · Extensions — Anchors, paths & export', syntax: utilitySyntax, objects: [], probes: remaining,
    body: `# Anchors, paths & export\n\n${instruction}\n\n` + section('U01','ascii_identifiers / gfm_auto_identifiers','### Café 中文 heading\n\n### Café 中文 heading','先仅开 ascii_identifiers，再仅开 gfm_auto_identifiers；观察锚点字符范围和重复标题编号。两个开关都开启时，GFM 优先。',true) + section('U02','sourcepos','Paragraph with **formatting**.','DOM 的 data-pos 是块级行范围，不是行内字符坐标。关闭后源码不应改变。') + section('U03','rebase_relative_paths','[Relative file](../assets/example.txt) and [absolute](https://example.com)','sourcePath=chapters/fixture.md；此相对目标故意不提供文件，只核对地址重定位。保存仍保留原始相对写法。',true) + section('U04','gutenberg','**Strong** and *emphasis*','选择 Plain text 导出，粗体变大写、斜体用下划线；Markdown 不被重写。',true) });
  const local = Object.entries(objectSamples).map(([key, source]) => [key, sources['block.'+key] || source] as const);
  pages.push({ key: 'objects-local', title: '32 · Objects — Local editing & services', syntax: config('notdown', Object.values(localObjectPlugins)), probes: [...new Set(Object.values(localObjectPlugins))], objects: local.map(([key]) => 'block.'+key),
    body: '# Local editing & services\n\n' + instruction + '\n\n这些是本地对象编码，不都属于 Notion 官方标签。按钮只插入样例文本；AI 和转录需要你主动点击。\n\n' + local.map(([key,sample],i) => section('L'+(i+1),key,sample,contentObjects.find(o => o.id === 'block.'+key)?.note || '',true)).join('\n') });
  pages.push({ key: 'outside', title: '99 · Outside Markdown scope — Reference only', syntax: config('commonmark'), probes: [], objects: [], body: '# Outside Markdown scope\n\n这些条目按工作簿分类列在最后，不提供虚假的启用或插入操作。\n\n' + catalogExtensions.filter(e => e.status === 'out-of-scope').map(e => `- **${e.id}** — ${e.description}`).join('\n') });
  pages.push({ key: "notion-v2", title: "33 · Notion Markdown v2", syntax: { ...config("notion-markdown"), notionVersion: "v2" }, probes: [], objects: ["block.mail", "block.custom_block", "block.external_object_instance"], body: '# Notion Markdown v2\n\n<mail from="writer@example.com" subject="Imported mail">Editable body</mail>\n\n<custom-block definition-id="11111111-1111-4111-8111-111111111111" />\n\n<external_object_instance integration="github">Repository reference</external_object_instance>\n' });
  const outsideIndex = pages.findIndex(page => page.key === "outside");
  pages.push(...pages.splice(outsideIndex, 1));
  return pages;
}

export function auditManualPages(pages: Specimen[]) {
  const covered = new Set(pages.filter(p => !p.key.startsWith('dialect-')).flatMap(p => p.probes));
  const missing = extensions.filter(e => !covered.has(e.id)).map(e => e.id);
  if (missing.length) throw new Error('Missing extension specimens: ' + missing.join(', '));
  const objectIds = new Set(pages.flatMap(p => p.objects));
  const missingObjects = contentObjects.filter(o => !objectIds.has(o.id)).map(o => o.id);
  if (missingObjects.length) throw new Error('Missing object specimens: ' + missingObjects.join(', '));
  const results = pages.map(page => {
    const doc = parseNative(page.body, page.syntax); doc.check();
    if (serializeNative(doc, page.syntax) !== page.body) throw new Error('Source round trip failed: ' + page.key);
    // Round-tripping alone also passes when an opaque block swallowed the rest
    // of the page. Every acceptance case must survive as a top-level section.
    const headings = new Set<string>();
    doc.forEach(node => { if (editorKind(node) === 'heading' && node.attrs.level === 2) headings.add(node.textContent); });
    for (const [, title] of page.body.matchAll(/^## ([DEILRU]\d+ — .+)$/gm)) {
      if (!headings.has(title)) throw new Error('Missing acceptance section: ' + page.key + ': ' + title);
    }
    return { key: page.key, variant: page.syntax.variant, objects: page.objects.length, probes: page.probes, characters: page.body.length };
  });
  return { pages: results, extensions: covered.size, objects: objectIds.size, dialects: dialects.length };
}
