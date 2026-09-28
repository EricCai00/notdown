# 方言默认值与显式插件

核对日期：2026-09-22。`src/markdown-engine/presets.ts` 是默认值的唯一来源。**实现了某个对象，不表示所有方言都原生支持该对象的编码。** 支持注册、方言默认、用户显式开启与参考资料是四件不同的事。

## Notdown 产品方言

`syntax.variant: notdown` 使用与 Notion-flavored Markdown 相同的 parser 和 serializer；`bodyFormat` 保持 `notion-markdown`，新增方言身份写在 YAML 的 `syntax` 中。它继承原 Notion 预设的全部默认语法，并默认开启下列十类项目块扩展。显式 `false` 优先于预设默认值；重置恢复该方言默认并保留未知配置。页面编辑器、插入命令、Block Explorer 和 Markdown Lab 使用相同默认值。

该预设是 Notdown 自身的产品选择，不是新增的 Notion 官方方言。已实现的块可以直接使用；原生数据库操作、Notion 云端工作流等未实现能力不因切换预设而获得支持。现有页面与新建页的既有默认选择保持不变，用户可从 Dialect 选择 Notdown，不自动批量改写用户知识库。

## 逐方言依据

| 预设 | 一手依据 | 本次修正 |
| --- | --- | --- |
| CommonMark | [0.31.2 规范](https://spec.commonmark.org/0.31.2/) | 基础 Markdown；任务、表格、双链、分栏与任意层级不再因默认配置自动开启。 |
| GFM | [0.29-gfm 规范](https://github.github.com/gfm/) | 表格、任务、删除线、扩展自动链接；不从 Pandoc 引入 YAML、脚注、emoji、公式、告警和额外锚点规则。HTML 预览另受应用安全过滤限制。 |
| Typora | [Markdown Reference](https://support.typora.io/Markdown-Reference/)、[Diagrams](https://support.typora.io/Draw-Diagrams-With-Markdown/) | 高亮、上下标、行内公式、告警、图表按需开启；块公式独立为 `display_math`，默认保留。移除默认 Pandoc 属性。原有换行与列表兼容行为保留。 |
| Obsidian | 官方帮助仓库的 [方言说明](https://github.com/obsidianmd/obsidian-help/blob/master/en/Editing%20and%20formatting/Obsidian%20Flavored%20Markdown.md)、[高级语法](https://github.com/obsidianmd/obsidian-help/blob/master/en/Editing%20and%20formatting/Advanced%20formatting%20syntax.md)、[Callouts](https://github.com/obsidianmd/obsidian-help/blob/master/en/Editing%20and%20formatting/Callouts.md) | 原生双链、嵌入、注释、高亮、脚注、公式、Mermaid、callout；不默认解释 TOC 指令、Pandoc 属性、`{{file}}` 或 sequence/flow 围栏。 |
| Original Markdown | [Gruber syntax](https://daringfireball.net/projects/markdown/syntax) | 保留基础语法；围栏、表格、任务及自定义块需要显式扩展。 |
| PHP Markdown Extra | [官方语法](https://michelf.ca/projects/php-markdown/extra/) | 两种代码围栏、代码属性和有序列表起始值按原产品文档启用；不能使用 Pandoc 同名 reader 的旧默认值代替。 |
| MultiMarkdown 6 | [官方语法](https://fletcher.github.io/MultiMarkdown-6/syntax/) | 独立列出表格、元数据、交叉引用、公式、引用、CriticMarkup 等；保留其官方 Raw Source 格式属性，移除未经该文档定义的 HTML 内 Markdown 属性规则。原生 TOC 使用 `{{TOC}}` 系列。 |
| Pandoc Markdown | [Pandoc manual](https://pandoc.org/MANUAL.html#pandocs-markdown) | 使用已签入的 Pandoc 3.11 扩展快照。 |
| CommonMark X | [Pandoc variants](https://pandoc.org/MANUAL.html#markdown-variants) | 属于 Pandoc 的扩展预设，使用其快照，并保留 CommonMark 基础规则。 |
| Legacy GitHub Markdown | [Pandoc variants](https://pandoc.org/MANUAL.html#markdown-variants) | 明确指已弃用的 Pandoc reader；不当作当前 GFM 规范。 |
| Notion-flavored Markdown | [Enhanced Markdown](https://developers.notion.com/guides/data-apis/enhanced-markdown) | 官方标签的开关保留；本地新增对象不能借 Notion 名义默认激活。 |

[GitHub 写作帮助](https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax) 描述的网站附加功能仍可开启，但不再计入 GFM 规范默认值。GitHub/Typora 告警不读取 Obsidian 的自定义标题与折叠标记。Typora TOC 编辑继续使用 `[toc]`，不自动写入 MMD 的范围指令。

## 本地对象插件

页面语法面板的 **Notdown blocks** 分组提供十个独立开关，在十一种上游方言默认关闭；项目自有的 Notdown 预设可以默认开启，不能据此修改上游方言：

| 开关 | 对象载体 |
| --- | --- |
| `notion_tabs` | tabs / tab |
| `notion_bookmark` | bookmark |
| `notion_link_preview` | link-preview |
| `notion_breadcrumb` | breadcrumb |
| `notion_button` | button |
| `notion_meeting_notes` | meeting-notes |
| `notion_ai_block` | ai-block |
| `notion_web_embed` | web-embed |
| `local_figure` | 带独立 caption 属性的本地 figure |

这是内置、可激活的解析与编辑扩展，不是下载执行第三方代码的系统。`local_*` 历史键仅为已有配置兼容而保留；界面显示 Tabs、Button 等名称，不再加 Local 前缀。这些键区分项目自有编码与上游原生语法，不指不同 vault 或同步范围。开关仍保存为 `syntax.extensions` 布尔值，例如 `notion_tabs: false` 可在 Notdown 中关闭 Tabs。普通 Markdown 图片与原生 HTML figure 不需要本地 figure 扩展。

解析、插入命令、能力目录与样例均使用同一开关。启用父容器不会隐式激活其中其他本地对象。关闭时，普通 Markdown 按原方言处理成文本或 HTML；Notion 保留为原文块。开启、关闭、重置或切换方言均不改写正文；在下一次明确保存时，配置与正文通过既有 CAS 一起提交。未知配置字段与显式覆盖保留。没有扫描、迁移或写入用户 vault。

## 验证与边界

GFM 后续专项核查见 [2026-09-24 记录](../audits/GFM-CONFORMANCE-2026-09-24.md)：677 个官方示例覆盖语法、原文保留、有效 schema 和安全 HTML 导出；9 个基础示例与扩展叠加后的差异明确列出。此结论只针对 GFM，不能推广为其他方言或 GitHub 网站服务的完整兼容。

### 误解析核对

2026-09-22 补充核对，覆盖全部 12 个预设：

| 语法／入口 | 核对结果与修正 |
| --- | --- |
| Notion / Notdown H5、H6 | 官方明确转换为 H4，不应回退为普通文字。源码解析继续保持该行为，键入 `##### ` / `###### ` 也直接产生 H4；未编辑的源码保留原始级数。其他十个方言保留 H5/H6，七个井号均为文字。 |
| `1) Item` | CommonMark、GFM、Obsidian、CommonMark X 原生支持；Pandoc Markdown 默认启用 fancy lists。Original、PHP Extra、MultiMarkdown、Legacy GitHub、Typora 默认保留文字，启用 fancy lists 后才支持；Notion / Notdown 保留文字。键入规则和嵌套列表使用同一判断。依据：[Original Markdown 列表](https://daringfireball.net/projects/markdown/syntax#list)、[Pandoc fancy lists](https://pandoc.org/MANUAL.html#extension-fancy_lists)。 |
| fancy lists | `Hello. world`、`abc) text`、`(a. text`、无效或混合大小写罗马数字不生成列表；`A. Smith` 保持正文，大写单字母加点号须有至少两个空格或 Tab。编辑写回保留必要间隔。 |
| 键入代码围栏 | Strict 默认不支持反引号围栏，输入规则不再提前创建代码块；显式开启 `backtick_code_blocks` 后可用。代码块命令仍可创建以缩进编码的原生代码。 |
| 简写引用 | 支持 `shortcut_reference_links` 的方言关闭该项后，`[label]` 和 `![label]` 同时停止生成引用；完整／折叠引用仍有效。不支持该开关的 CommonMark 系预设忽略该覆盖值，保留基础规则。 |
| Notion 扩展边界 | 非 Notion 方言开启 span 载体不再隐式启用其中被关闭的公式、删除线或链接预览；按原方言退回文本／HTML。Notion 关闭 nesting 后，独立的 `{toggle="true"}` 标题也回退原文块。 |
| 自闭合块标签 | `<empty-block/> text`、`<table_of_contents/> text` 等不再丢弃后续文字，保留为段落。合法独占一行的标签和行内 `<br>`／mention 不受影响。 |

回归还检查表格、任务、脚注、定义列表、删除线、高亮、上下标、公式、告警和 Div 的默认开关与围栏字面量；检查 CRLF、相邻块编辑及重新解析。测试只使用独立临时知识库，不扫描或迁移用户正文。

回归覆盖十一种上游方言 × 九种本地对象的默认关闭、独立启用、关闭恢复、源码往返与相邻编辑；另检查方言间不应互认的语法、围栏字面量及配置持久化。旧的“所有同名 reader 必须匹配 Pandoc”断言只保留在真正的 Pandoc 预设。

这里修正默认规则和插件边界，不宣称整个 codec 通过全部上游一致性测试。HTML 消毒、完整 MMD 预处理、全部 Obsidian 嵌入和 Notion API 对象仍有既有实现限制；本地服务、按钮和快照也不等于上游云服务或跨端同步。
