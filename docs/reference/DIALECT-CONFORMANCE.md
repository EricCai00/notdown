<a id="方言默认值与显式插件"></a>

# Dialect conformance

**English** · [简体中文](DIALECT-CONFORMANCE.zh-CN.md)

Check date: 2026-09-22. `src/markdown-engine/presets.ts` is the only source of default values. Just because **implements an object does not mean that all dialects natively support the encoding of the object.** supports registration, dialect default, user explicit activation and reference materials are four different things.

<a id="notdown-产品方言"></a>

## The Notdown product dialect

`syntax.variant: notdown` Use andNotion-flavored Markdown The sameparser andserializer；`bodyFormat` Keep it up `notion-markdown`The new dictionary identity is written in YAML `syntax` It inherits all of the default syntax of the original Notion default and opens the following 10 block expansions by default. `false` Preference is given to the default; reset the default to restore the dialect and retain the unknown configuration. Page editors, insert commands, Block Explorer and Markdown Lab use the same default values.

The preset isNotdown The product selection is not new.Notion The official language. The blocks implemented can be used directly; the native database operation;Notion Unrealized capabilities such as cloud workflow are not supported by switching default. The default options for existing and newly created pages remain unchanged, and users can access them from any of the following:Dialect ChooseNotdown，The user's knowledge base is not automatically copied in bulk.

<a id="逐方言依据"></a>

## Evidence by dialect

| Default | First hand evidence | This revision |
| --- | --- | --- |
| CommonMark | [0.31.2 specification](https://spec.commonmark.org/0.31.2/) | Basic Markdown; tasks, tables, double links, columns and any level are no longer automatically enabled by default configuration. |
| GFM | [0.29-gfm specification](https://github.github.com/gfm/) | The following are the main features of the program:Pandoc The introductionYAML、The footprints.emoji、The formula, the alert and the additional point rules.HTML Preview also has safety filtering restrictions. |
| Typora | [Markdown Reference](https://support.typora.io/Markdown-Reference/)、[Diagrams](https://support.typora.io/Draw-Diagrams-With-Markdown/) | Highlighting, superscripts and subscripts, inline formulas, alarms, and charts are enabled on demand; block formulas are independently set to `display_math` and are retained by default. Remove the default Pandoc attribute. The original line wrapping and list compatibility behavior is retained. |
| Obsidian | [ dialect description of the official help warehouse ](https://github.com/obsidianmd/obsidian-help/blob/master/en/Editing%20and%20formatting/Obsidian%20Flavored%20Markdown.md), [ advanced syntax ](https://github.com/obsidianmd/obsidian-help/blob/master/en/Editing%20and%20formatting/Advanced%20formatting%20syntax.md), [ Callouts](https://github.com/obsidianmd/obsidian-help/blob/master/en/Editing%20and%20formatting/Callouts.md) | Native double linking, embedding, comments, highlighting, footnotes, formulas, Mermaid, callout; does not interpret TOC instructions, Pandoc attributes, `{{file}}` or sequence/flow fences by default. |
| Original Markdown | [Gruber syntax](https://daringfireball.net/projects/markdown/syntax) | The basic syntax is preserved; fences, tables, tasks, and custom blocks require explicit expansion. |
| PHP Markdown Extra | [official grammar](https://michelf.ca/projects/php-markdown/extra/) | Both code fences, code attributes, and ordered list start values are enabled as per the original product documentation; the old default values for Pandoc with the same name as reader cannot be used instead. |
| MultiMarkdown 6 | [official grammar](https://fletcher.github.io/MultiMarkdown-6/syntax/) | The following table lists tables, metadata, cross-references, formulas, references, and other data.CriticMarkup etc. to keep it officialRaw Source Format attributes, removed without the document's definitionHTML InsideMarkdown The rules of attributes.TOC Use`{{TOC}}` The series. |
| Pandoc Markdown | [Pandoc manual](https://pandoc.org/MANUAL.html#pandocs-markdown) | Extend the snapshot using the checked in Pandoc 3.11. |
| CommonMark X | [Pandoc variants](https://pandoc.org/MANUAL.html#markdown-variants) | Extended presets belonging to Pandoc use its snapshot and retain the CommonMark base rules. |
| Legacy GitHub Markdown | [Pandoc variants](https://pandoc.org/MANUAL.html#markdown-variants) | Explicitly refers to the deprecated Pandoc reader; not considered the current GFM specification. |
| Notion-flavored Markdown | [Enhanced Markdown](https://developers.notion.com/guides/data-apis/enhanced-markdown) | The switch of the official label is retained; locally added objects cannot be activated by default in the name of Notion. |

[GitHub Writing Help The additional website features described by ](https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax) can still be turned on, but no longer count towards the GFM specification defaults. GitHub/Typora alerts do not read Obsidian's custom titles and fold marks. Typora TOC editors continue to use `[toc]` and do not automatically write range instructions for MMD.

<a id="本地对象插件"></a>

## Local object plugins

The **Notdown blocks** group of the page syntax panel provides ten independent switches, which are turned off by default in eleven upstream dialects; the project's own Notdown preset can be turned on by default, and the upstream dialect cannot be modified accordingly:

| switch | object carrier |
| --- | --- |
| `notion_tabs` | tabs / tab |
| `notion_bookmark` | bookmark |
| `notion_link_preview` | link-preview |
| `notion_breadcrumb` | breadcrumb |
| `notion_button` | button |
| `notion_meeting_notes` | meeting-notes |
| `notion_ai_block` | ai-block |
| `notion_web_embed` | web-embed |
| `local_figure` | Independencecaption Local propertiesfigure |

This is a built-in, activateable parsing and editing extension, not a system for downloading and executing third-party code. The `local_*` history key is only reserved for compatibility with existing configurations; the interface displays names such as Tabs and Button without adding the Local prefix. These keys distinguish the project's own encoding from the upstream native syntax, and do not refer to different vault or sync scopes. Switches are still saved as `syntax.extensions` booleans, e.g. `notion_tabs: false` can be turned off in Notdown in Tabs . Normal Markdown images and native HTML figure do not require native figure extensions.

Parsing, inserting commands, capability catalogs, and samples all use the same switch. Enabling a parent container does not implicitly activate other local objects in it. When turned off, ordinary Markdown is processed into text or HTML according to the original dialect; Notion is retained as a block of original text. Turning on, off, resetting, or switching dialects does not rewrite the text; the next time you save explicitly, the configuration and text are submitted together through the existing CAS. Unknown configuration fields are retained with explicit overrides. User vault was not scanned, migrated, or written.

<a id="验证与边界"></a>

## Validation and limitations

For follow-up special verification of GFM, see [ 2026-09-24 record ](../audits/GFM-CONFORMANCE-2026-09-24.md): 677 official examples cover syntax, original text retention, valid schema and safe HTML export; 9 basic examples and the differences after superposition of extensions are clearly listed. This conclusion is specific to GFM and cannot be generalized to full compatibility with other dialects or GitHub website services.

<a id="误解析核对"></a>

### Checking incorrect parses

2026-09-22 supplementary check, covering all 12 presets:

| Grammar/entry | Check results and corrections |
| --- | --- |
| Notion / Notdown H5、H6 | It is officially converted to H4 and should not fall back to normal text. Source code parsing continues to maintain this behavior, typing `##### ` / `###### ` also directly generates H4; unedited source code retains the original series. The other ten dialects retain H5/H6, and the seven hash marks are all literals. |
| `1) Item` | CommonMark, GFM, Obsidian, and CommonMark X are natively supported; Pandoc Markdown is enabled by default and fancy lists is enabled. Original, PHP Extra, MultiMarkdown, Legacy GitHub and Typora retain text by default and are supported after fancy lists is enabled; Notion/Notdown retain text. Typing rules and nested lists use the same judgment. Based on: [ Original Markdown list ](https://daringfireball.net/projects/markdown/syntax#list), [ Pandoc fancy lists ](https://pandoc.org/MANUAL.html#extension-fancy_lists). |
| fancy lists | `Hello. world`, `abc) text`, `(a. text`, invalid or mixed-case Roman numerals do not generate a list; `A. Smith` maintains the text, uppercase single letters plus periods must have at least two spaces or Tab. Edit writeback to preserve necessary spacing. |
| Type code fence | Strict does not support backtick fences by default, and input rules no longer create code blocks in advance; it is available after `backtick_code_blocks` is explicitly turned on. The code block command can still create native code encoded with indentation. |
| abbreviated citation | When this is turned off for dialects that support `shortcut_reference_links`, both `[label]` and `![label]` stop generating references; full/collapsed references are still valid. CommonMark systems that do not support this switch default to ignoring this override value and retaining the basic rules. |
| Notion extended boundary | Non-Notion dialect-enabled span vectors no longer implicitly enable formula, strikethrough, or link previews in which they are turned off; text/HTML is returned in the original dialect. After Notion closes nesting, the independent `{toggle="true"}` title also falls back to the original text block. |
| self-closing block label | `<empty-block/> text`, `<table_of_contents/> text`, etc. will no longer discard subsequent text and retain it as paragraphs. Labels that legally occupy a line and inline `<br>`/mention are not affected. |

The regression also checks default switch and fence literals for tables, tasks, footnotes, definition lists, strikethrough, highlighting, subscripts, formulas, alerts, and Div; checks CRLF, adjacent block editing, and reparsing. The test only uses a stand-alone temporary vault and does not scan or migrate user texts.

The regression covers the default shutdown, independent activation, shutdown recovery, source code round-trip and adjacent editing of eleven upstream dialects × nine local objects; it also checks the syntax, fence literals and configuration persistence that should not be recognized between dialects. The old "all reader with the same name must match Pandoc" assertion remains only for true Pandoc presets.

The default rules and plug-in boundaries are corrected here, and the entire codec is not declared to pass all upstream conformance tests. HTML sanitization, full MMD preprocessing, full Obsidian embedding, and Notion API objects still have existing implementation limitations; local services, buttons, and snapshots are not equivalent to upstream cloud services or cross-end synchronization.
