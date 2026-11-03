<a id="十一种原生方言已实现规则与兼容边界"></a>

# Native Markdown dialects

**English** · [简体中文](NATIVE-DIALECTS.zh-CN.md)

2026-09-25 Supplement: The current registry has 14 dialects (including Notdown, R Markdown, and Quarto that were added later). Quarto reuses the basic rules of Pandoc and adds executable blocks and inline expressions in four main languages; Notdown also includes these syntaxes. The historical comparison of the eleven early presets is retained below. The current execution capabilities are based on [ Quarto ](../features/QUARTO.md) and [ R Markdown ](../features/R-MARKDOWN.md).

2026-09-22 dialect boundary correction: each dialect's default value is independently defined according to the upstream specification, and only Pandoc's own default default follows the Pandoc 3.11 snapshot. Nine types of local objects have been changed to independent plug-ins that are turned off by default and turned on in the page syntax panel; old text will not be migrated or deleted. Default rule isolation, explicit enablement, and parsing/command/directory unified gating have been implemented; full upstream consistency or cross-end synchronization has not been claimed. For details, see [ Dialect Checking and Plug-in Description ](DIALECT-CONFORMANCE.md); if the historical description below conflicts with it, this revision shall prevail.

> 2026-09-22 Update: The current 103 Markdown extension has accessed the local path, the 12 Outside Markdown scope item is not enabled; the specification key is notion_*It is compatible with notdown_.*• Add new tables, in-line and service capabilities to [Object Roadmap](../architecture/CONTENT-OBJECT-ROADMAP.md) and [The specific boundaries](LOCAL-OBJECTS.md) For example, the following is a comparison of the dialects in which the default access is retained.

2026-09-15. All eleven presets are now selectable in the main editor; the six previously disabled presets have been plugged into actual reader/writer. They share ProseMirror editing documents, CodeMirror source code, three views, dragging, Slash and save processes, and do not call Pandoc for daily editing.

This is what is happening. **The core grammar of each dialect is adapted**，There is no complete replay.Pandoc of allreader Default extension and available name derived from within the project[Pandoc 3.11 short film](../data/pandoc-3.11-extensions.json)The actual implementation range is determined by the native registry. Full Pandoc controls continue to use Markdown Lab.

This round of new Typora, Obsidian, product expansion and 62 acceptance boundaries [PRODUCT-SYNTAX.md](PRODUCT-SYNTAX.md)。PHP Extra andMMD of the same namePandoc The switch still replaces the original snapshot, and the product add-on has an additional default value.

<a id="方言差异"></a>

## Dialect differences

The following is representative behavior under the default configuration; explicit extension switches can change the rules.

| Default | Key differences already plugged in | Example of current boundary |
| --- | --- | --- |
| Typora | Formulas, prompt blocks, tables of contents, charts, HTML embedding, highlighting, loose lists | Chart source code editing; incomplete Typora reproduction |
| Obsidian | Comments, double links, relative Markdown page links, prompt blocks, embedding | Does not contain plugin API or full vault behavior |
| Notion Markdown | Own line breaks and labels, columns, prompts, folds, mentions, tables | Standalone codec; product attachment rules do not apply to Notion |
| CommonMark | CommonMark basic block, two code fences, HTML | The complete CommonMark specification test set has not been run yet. |
| GFM | Table, strikethrough, task, naked link, footnote, Emoji, dollar formula, YAML opening block | The default value is taken according to the Pandoc snapshot, which is not equal to the entire behavior of the GitHub website; it has been connected to alerts |
| Pandoc Markdown (`markdown`) | Titles and references require blank lines before breaking paragraphs; two types of fences; definition lists, footnotes, line blocks, Div, smart punctuation, superscripts and subscripts | Still missing Pandoc simple/multi-row/grid table and citeproc |
| CommonMark X | CommonMark basic rules plus definition list, footnotes, Div, smart punctuation, superscript and subscript, Emoji | Support registered attributes; fancy lists and complete attribute combinations need to be completed |
| Markdown Strict | `#标题`Can become a title; fences are turned off by default; lists cannot directly interrupt paragraphs; limited backslash escaping; underlines within words can be emphasized | Not a complete replica of the original Markdown.pl; complex delimiters and reference boundaries still need to be completed |
| PHP Markdown Extra | The tilde fence is on by default, and the backtick fence is off by default; definition list, footnote, abbreviation description | The markdown attribute and title/link attribute have been connected; the fence attribute needs to be turned on |
| MultiMarkdown | The backtick fence is on by default, and the tilde fence is off by default; define lists, footnotes, superscripts and subscripts, and opening key-value titles. | Abbreviated superscripts and subscripts, logos, link attributes, and double backslash formulas have been accessed; BibTeX is incomplete citeproc |
| Old GitHub Markdown | Two types of fences, tables, strikethroughs, tasks, bare links, Emoji; lists can be followed by paragraphs | Pandoc This reader has been deprecated; alerts and automatic identification have been integrated, and the new GitHub document recommends GFM |

For example, `text` Next line is straight. `# Heading`Pandoc Markdown: default is still in the same paragraph and closed `blank_before_header` The following is a list of the topics covered in the article.Strict The default default for the default default is to not form a block of code; when a new block of code is created on a page, the default is to create a block of code.writer The language will use the acronyms that support the language.

<a id="本次新增-19-个开关"></a>

## 19 switches added in this change

There are a total of 70 entries in the registry, including 12 entries and Notdown own block extensions. The panel only provides checkboxes for names accepted by the current dialect and natively plugged in.

| rules | Actual effect |
| --- | --- |
| `blank_before_header` | Controls whether the ATX title can directly interrupt the previous paragraph; does not prevent continuous titles |
| `blank_before_blockquote` | Controls whether a reference can directly interrupt the previous paragraph |
| `space_in_atx_header` | Controls whether a space must be left after `#` |
| `lists_without_preceding_blankline` | Controls whether lists can follow paragraphs; retains the old GitHub defined mark segmentation behavior |
| `startnum` | Control whether to use the starting number in the ordered list source code |
| `backtick_code_blocks` / `fenced_code_blocks` | Control the backtick/tilde code fences of the `markdown*` family respectively; the fences of the CommonMark family belong to the basic rules |
| `escaped_line_breaks` | Controls whether backslash plus newline is a hard newline |
| `all_symbols_escapable` | Controls the set of symbols that can be escaped by backslash |
| `intraword_underscores` | Controls whether the underline within a word maintains its literal meaning; covers common single/double underline forms |
| `ignore_line_breaks` | Soft line breaks no longer insert spaces; hard line breaks remain |
| `smart` | Smart quotation marks, dashes, ellipses, etc., based on markdown-it typography; details are not guaranteed to be equivalent to Pandoc item by item |
| `subscript` / `superscript` | `H~2~O`, `x^2^`, real inline markup, can be edited and written back with the text |
| `abbreviations` | `*[HTML]: Hypertext Markup Language`and text HTML, display the abbreviation description and retain the original text of the definition |
| `emoji` | `:smile:`The other names display Unicode Emoji; `:)` shortcut replacement is not enabled and Notion custom resources are not involved. |
| `yaml_metadata_block` | The first is the identification of the original letter `---` surrounded by `---` or `...` The end of the common YAML mapping |
| `pandoc_title_block` | Identify up to three lines at the beginning of the text `% 标题` / `% 作者` /`% 日期` |
| `mmd_title_block` | Identify key value lines such as `Title: ...` at the beginning of the text and indented continuation lines |

The last three items identify and retain the original text; when `metadata_values` is enabled, the metadata preview is displayed and the source code can be edited. When it is not enabled, the original text block is displayed and does not become an ordinary paragraph, nor does it modify the YAML attribute of the vault page. Does not provide full Pandoc Meta semantics, multi-line headers, or arbitrary metadata parsing.

`markdown*`The five presets are adapted using the Markdown family basic rules, and CommonMark, GFM, and CommonMark X use the CommonMark family rules. The switch acceptance range is the same as the snapshot, but the local additionally allows the last three reader to use `line_blocks`; this own combination cannot be directly passed to Pandoc with the same name as reader.

<a id="保存配置和未实现项"></a>

## Saving, configuration and unimplemented items

- Switching dialects and extensions only reinterprets the same source code and does not automatically convert the text. The configuration is saved with the body via the existing `baseRevision`, unknown fields are retained.
- Unmodified top-level blocks and their intervals retain the original text; modified blocks are written back according to the current dialect, and blank lines are retained between blocks. Internal modifications to nested containers may normalize the entire container.
- New/modified code blocks are first written as currently available fences; Strict writes indented code by default, and PHP Extra writes wavy line fences by default. Indented code cannot express language attributes. The original unmodified code remains the original text.
- In-page editors may write Emoji names as actual characters and smart punctuation as display characters; there is no commitment to retaining every original delimiter inside the modified block. The abbreviation definition is still saved by the original text interval, and no definition editing form is provided.
- Unimplemented extensions are itemized below the panel and show configuration status; even if configured as `true` , they are clearly marked "Not Executed". Unknown and pending override values ​​are retained and restoring defaults does not delete them.
- Five of the snapshots `markdown*` reader They have.30 The name of the person who is not registered as a native, threeCommonMark reader They have.10 One. This contains default closed projects, the number of which is not equal to the missing block type.Markdown reader Accepted Extension[Manual of extending matrix](PANDOC-EXTENSIONS.md)。

Major syntax not yet implemented: Pandoc simple/multiline/grid table, full attribute combination, fancy/example lists, inline notes, raw TeX, full citations/citeproc, and several citation and dialect details. A current subset of image captions, raw_attribute, markdown_attribute, MMD citations, and complex tables is available in the Product Support Matrix. The editing document is still incomplete Pandoc JSON AST; source code highlighting is universal and parsing is still on the main thread.

<a id="验证依据"></a>

## Validation evidence

- `tests/unit/native-dialects.test.ts`Override default values, real switches, parsing differences, write-back of code blocks and special text, superscripts and subscripts/abbreviations/metadata retention, and differences between Div families.
- The same test included the machine.Pandoc of6 × 10 Modular controls; not installedPandoc When the control is simply skipped, the main program does not rely on it. The block structure of the selected sample is not representative of the overall syntax consistency.Div WhenNotdown The original back to backPandoc The following is a list of characters that first appeared in the soap opera EastEnders in 2012, by order of first appearance.
- `tests/e2e/native-dialects.spec.ts`Using the temporary vault and independent Chrome, verify the expansion, reset, page editing, original blank line, save reload and switch back to the original dialect of the six new presets one by one; intercept Pandoc API and assert that there is no call.
- See [ VERIFICATION.md ](../verification/VERIFICATION.md) for complete execution results.
