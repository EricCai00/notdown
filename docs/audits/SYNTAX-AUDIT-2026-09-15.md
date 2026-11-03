<a id="用户附加语法清单核对62-条"></a>

# Review of the 62 additional syntax requirements

**English** · [简体中文](SYNTAX-AUDIT-2026-09-15.zh-CN.md)

> This article retains the audit results before the transformation; for the current implementation, please see the [ 62 support matrix ](../reference/PRODUCT-SYNTAX.md). The following "current/unrealized" all refer to before this transformation.

2026-09-15, check the Typora, Obsidian, PHP Markdown Extra, MultiMarkdown lists submitted by the user one by one.

<a id="结论与之前说明的纠正"></a>

## Conclusions and corrections to earlier descriptions

**Not all implemented.** The last time I accessed it was nine selectable presets and a portion of the core rules; "dialects implemented" is too broad a statement. 43 registration switches do not mean that all grammars of each dialect have been implemented. 12 is Notdown's own extension, and the three metadata switches only recognize and retain the original text.

There are currently no dedicated presets for Typora or Obsidian. The default configuration of `markdown_mmd` comes from Pandoc's reader with the same name. It does not call MultiMarkdown's own parser, nor does it fully implement the MultiMarkdown product syntax. Similarly, the PHP Extra preset implements only a subset of PHP Extra functionality.

This time, all 62 samples are handed over to `parseNative`, which is actually used by the main editor, to check the semantic nodes and original text round-trips, and to check the schema, HTML display and page navigation codes. Typora/Obsidian samples are checked under the default configurations of GFM, Pandoc Markdown, and Notion; PHP Extra and MultiMarkdown samples are checked under the corresponding presets. For specific source text and analysis results, see [ machine verification record ](../data/user-syntax-audit-2026-09-15.json). Being able to save the **source code as it is does not mean that the syntax is supported; the existence of link nodes does not mean that it can be navigated correctly.** This is not a 62 item browser visual acceptance.

<a id="逐条结果"></a>

## Results by item

Numbering is in user list order. "Supported" in the table only refers to the core semantics of the sample and is still subject to the dialects and switches in the description.

<a id="typora-条目118"></a>

### Typora items (1–18)

| # | Syntax | Current status | Actual performance/reasons |
| --- | --- | --- | --- |
| 1 | Standalone `$$` math block | Supported | `tex_math_dollars`; GFM, Pandoc Markdown, MMD, Notion, etc. are turned on by default, parsed into equation and displayed by KaTeX |
| 2 | `[^fn1]`and footnote definition | Partial | GFM, Pandoc, PHP Extra, and MMD can form quotation and description blocks; there is no unified numbering, endnote collection, or return link. The isomorphic reference of Notion is another citation, not this footnote system |
| 3 | YAML front matter | Recognize only reserved | The beginning of the text of GFM/Pandoc forms opaque_block; it is not extracted as a page attribute and layout is not applied. Notion does not support this text extension; the vault YAML outside the file is another layer |
| 4 | `[toc]` | Not implemented | Display normal text. The existing directory sidebar and `<table_of_contents/>` do not support this writing method. |
| 5 | `> [!NOTE]` alert | Not implemented | Displays a normal reference with `[!NOTE]`; `alerts` has not yet registered a native rule. Notdown `<callout>` are different syntaxes |
| 6 | `[link](#header-3)` | Partial | The link can be parsed, but the page title is not generated DOM ID according to this rule, and the complete anchor point jump link is missing. |
| 7 | `:smile:` | Supported but different default values | GFM/CommonMark X/old GitHub is on by default, `emoji`; Pandoc Markdown is off by default and can be on. Notion does not have this name conversion yet, and Notion custom Emoji has not been connected either. |
| 8 | `$y=x^2$` | Supported | `tex_math_dollars`, producing inline_math; not enabled by default in every preset |
| 9 | `H~2~O` | Supported but different default values | `subscript`; Pandoc Markdown, MMD, and CommonMark X are on by default, GFM is off by default, and Notion does not provide this switch. |
| 10 | `X^2^` | Supported but different default values | Same as above, corresponding to `superscript`; only the form with closed symbols is explained. |
| 11 | `==highlight==` | Not implemented | Normal text; existing color/underline mark has no corresponding `==` reader/writer |
| 12 | `iframe`Embed | Playback is not implemented, and the display layer actively filters | HTML blocks can be formed and the source code is retained, but HTML allowlist explicitly hides iframe; it lacks an independent isolated embedded view, and `raw_html` will not be played when it is opened. |
| 13 | `sequence` fenced diagram | Graphics rendering not implemented | Normal code_block; no sequence renderer |
| 14 | `flow` fenced diagram | Graphics rendering not implemented | Normal code_block; no flow renderer |
| 15 | `mermaid` fenced diagram | Graphics rendering not implemented | Ordinary code_block; no Mermaid renderer, the language name is reserved and does not represent the graphics implementation |
| 16 | `###header` | Expressible through existing rules | `markdown*` family closure `space_in_atx_header` The title is legible;Strict／PHP Extra／MMD By default, no space is required.Typora ofStrict Mode The setting is not here.Markdown Strict Default |
| 17 | Ordinary line continuation with two spaces after the numbered item | Partial/default differences | The GFM/Pandoc sample is a paragraph continuation of the same item; Notion is its own line-by-line block rule and does not implement the Typora-specific relaxed mode. |
| 18 | Two spaces after the numbered item numbered item | Typora exclusive compatibility is not implemented | There is no Typora two-space level rule; the current Markdown base rule reads this example as a sibling and cannot claim to support the Typora sublist on this basis. |

<a id="obsidian-条目1922"></a>

### Obsidian items (19–22)

| # | Syntax | Current status | Actual performance/reasons |
| --- | --- | --- | --- |
| 19 | Multi-line `%%` comments | Not implemented | Displayed as visible text, no comment blocks or hidden logic established |
| 20 | `%%comment%%` | Not implemented | Displayed as visible text, no comment markers created |
| 21 | `[[note title]]` | Partial | Notion can form page_link; other presets can open `wikilinks_title_after_pipe`. Not a complete Obsidian linking system, header/block positioning, embedding and file path rules are not complete |
| 22 | `[note title](note%20title.md)` | Partial | Ordinary link syntax can be parsed; there is no complete adaptation to parse this kind of file name link into a vault UUID page and navigate it |

<a id="php-markdown-extra-条目2334"></a>

### PHP Markdown Extra items (23–34)

| # | Syntax | Current status | Actual performance/reasons |
| --- | --- | --- | --- |
| 23 | after paragraph`<div>` | HTML preview supported | The example forms a paragraph and adds a HTML block; it is actually a block-level HTML, not an inline span. Internal label source code is processed through HTML display rules |
| 24 | `<div markdown="1">` | Mixed parsing not implemented | Forming the HTML block, internal `*true*` is not emphasized as Markdown. Missing `markdown_attribute` reader |
| 25 | Title `{#heading-id}` and link | Attributes and target binding not implemented | `{#heading-id}` remains in heading text; no corresponding anchor |
| 26 | heading `{.main}` | Not implemented | Attribute literals are reserved; no class semantics |
| 27 | heading `{lang=fr}` | Not implemented | Property literals are reserved; there is no generic property reader . Whether external software accepts this property set also depends on the specific version. |
| 28 | link / image `{#id .class}` | Attributes not implemented | Base links and images are recognized, but curly braces are used as trailing text |
| 29 | Reference the defined attribute | Not implemented | This example degenerates into a paragraph; it lacks parsing and association of attribute reference definitions. |
| 30 | `~~~ .html` | Partial | Code block established, `.html` remains in params; full fenced attributes class name/language semantics not provided |
| 31 | `~~~ {.html #example-1}` | Partial | The code block is established and the attribute string is retained, but code ID/class is not generated, nor is it guaranteed to be highlighted according to the language. |
| 32 | Definition lists with multiple definitions | Supported | `definition_lists`On by default; terms and multiple definition_description are established and can be edited |
| 33 | `*[HTML]: ...` | Support this abbreviation definition | `abbreviations`On by default. The definition itself does not display the text; `HTML` must appear in the subsequent text before the abbreviation description will appear. It is a normal result that no text can be seen when there is only this line. |
| 34 | continuous`3. / 4. / 5.` | Defect found and fixed | Originally merged into one item by mistake: Paragraph break restrictions also intercept sibling list boundaries. This repair and supplement of continuous project testing. It shows that starting from 3, `startnum` must be enabled; PHP Extra is defaulted to Pandoc and the snapshot is turned off by default. |

<a id="multimarkdown-条目3562"></a>

### MultiMarkdown items (35–62)

| # | Syntax | Current status | Actual performance/reasons |
| --- | --- | --- | --- |
| 35 | `[>MMD]`, `[>(MD) Markdown]` abbreviation | Not implemented | Some forms are read as ordinary reference links; PHP Extra `*[HTML]` Plugins cannot implement this set of syntax |
| 36 | `[locator][#Doe:2006]` | Citations not implemented | MMD citation analysis, literature data and typesetting are missing; the sample reference key `Doe:2006` and the definition key `Doe2006` are also inconsistent |
| 37 | `[][#Doe:2006]` | Citations not implemented | Same as above, including sample key inconsistencies |
| 38 | `[Not cited][#citekey]` | Citations not implemented | There is no semantics of “incorporating references but not citing them in the text” |
| 39 | Complete inline bibliography entry | Citations not implemented | Not parsed as a citation / bibliography entry |
| 40 | BibTeX citation three forms | Not implemented | Not connected to BibTeX query and citation writer |
| 41 | CriticMarkup Delete | Not implemented | `{--text--}` is plain text, without revision semantics |
| 42 | CriticMarkup added | Not implemented | `{++text++}` is plain text |
| 43 | CriticMarkup replacement | Not implemented; internal syntax is misinterpreted | `{~~text~>text~~}`Part of it is recognized by the subscript plug-in; the source code is retained when unchanged, but there is no guarantee that the internal meaning of the unknown syntax will be maintained after editing. |
| 44 | CriticMarkup Highlight | Not implemented | `{==text==}` has no highlight / revision semantics |
| 45 | CriticMarkup comments | Not implemented | `{>>text<<}` has no comment semantics |
| 46 | `[header-id]` heading cross-reference | Not implemented | Tags in titles remain text, implicit references are not established |
| 47 | Backslash line breaks at line end | Existing rule, off by default in MMD | `escaped_line_breaks`Can be turned on; Pandoc `markdown_mmd` is off by default, so the example retains backslashes and displays soft line breaks |
| 48 | `{{file.txt}}` | Not implemented | No file expansion processing, dependent indexing and refresh links |
| 49 | `{{file.*}}` | Not implemented | No wildcard file expansion or target-format selection |
| 50 | glossary three forms | Not implemented | Some tags are treated as ordinary links and no glossary semantics are generated |
| 51 | independent pictures | Partial | Generates paragraph (image), which is not a complete Figure/caption block; `/path/to/img.jpg` is a placeholder resource address. Successful parsing does not mean that the image actually exists. |
| 52 | Reference link/image attribute | Not implemented | Attributed reference definition is not recognized and the accompanying body reference cannot be resolved as expected |
| 53 | Inline link properties | Not implemented | The sample is reduced to text and lacks the MMD link attribute syntax. |
| 54 | double backslash math | Not implemented | `tex_math_double_backslash`Not registered; the dollar formula plugin does not recognize this delimiter |
| 55 | `100m^2` unclosed superscript | Not implemented | Existing `superscript` only supports paired symbols; missing`short_subsuperscripts` |
| 56 | `x~z` unclosed subscript | Not implemented | Same as above |
| 57 | metadata variables`[%foo]` | Replacement not implemented | The beginning of `foo: foo-test` is only retained as a metadata source code block, and the text variables are not evaluated. |
| 58 | Row/Fence raw format | Raw format semantics not implemented | `{=html}`is the trailing text, `{=latex}` is the ordinary code params; without `raw_attribute`, the original text will not be injected according to the specified output format. |
| 59 | Smart punctuation | Existing rule, off by default in MMD | `smart` can be opened; currently reused markdown-it, the details are not complete MMD or Pandoc typography |
| 60 | `{{TOC}}` | This writing method is not implemented | Ordinary text; existing directory capabilities cannot be substituted for acceptance of syntax implementations |
| 61 | `{{TOC:2}}`/range | Not implemented | TOC directive and level parameters not parsed |
| 62 | Tables with grouped headers, column spans, sections and captions | Partial basic table support; this composite example is unsupported | Only the middle ordinary pipeline table is recognized; the grouped rows, second half and caption become text, lacking the cross-column/partition/Caption semantics and writer |

<a id="为什么没有四种不同情况"></a>

## Why an item is absent: four different cases

1. **The development scope is not complete.** The first is the "City of the Dead".HTML In the middleMarkdown We need to respondreader/writer；The framework cannot be done, nor can it replace compatibility completeness with the number of switches that already exist.
2. **The semantics exist, but the specified writing method is not connected.** There is already a directory and callout block, which does not mean it is supported. `[toc]`、`{{TOC}}`、`[!NOTE]`;Similarly, the PHP Extra abbreviation and the MMD abbreviation cannot share a superficially similar rule.
3. **Processing other than parsing is required.** Charts require renderer; file expansion requires file reading and dependency refreshing; citations require document parsing and formatting; attributes require semantic saving, editing, writing back, and actual display. Simply converting to AST or registering an extension does not automatically gain these capabilities.
4. **Definitely a default value/implementation flaw.** Emoji, smart, backslash line breaks, etc. have rules but are off by default by specific defaults; it is an error if consecutive lists are merged and cannot be interpreted as normal dialect differences. iframe is an element explicitly filtered by the display layer, and "retaining HTML" cannot be promoted as "supporting arbitrary embedding".

Another problem: the existing "not yet implemented" panel only compares to the Pandoc snapshot, so **is not the full ecological gap list of** . It does not automatically list all additional features for Typora/Obsidian/MultiMarkdown products. In the future, an independent grammar capability list should be established to record parsing, display, editing, writeback, default value and original text retention status respectively, and then map the presets to capabilities.

<a id="后续实现应怎样验收"></a>

## Acceptance criteria for later implementations

Prioritize the existing semantically acceptable writing methods (alerts, table of contents, highlighting, comments, abbreviation superscript and subscript), then add anchor points/attributes, HTML hybrid parsing; implement corresponding modules for charts, cross-file expansion, citations, and complex tables respectively. Each item requires positive and negative examples of user samples, expansion switches, reopening after editing, and display verification.

Unknown syntax also needs to be avoided from being disassembled and misread by other plug-ins. The CriticMarkup replacement example is the current gap. **original text retention, partial recognition, and complete functions must be reported separately for**. This time, the above missing functions were not implemented in batches; what was completed was item-by-item verification and continuous list defect repair.

<a id="外部规范核对来源"></a>

## External specification sources

- Typora's directory, mathematics, HTML, etc. are additional syntax for the product, see [ Typora Markdown Reference ](https://support.typora.io/Markdown-Reference/) for details; charts also require corresponding rendering capabilities, see [ Typora diagrams ](https://support.typora.io/Draw-Diagrams-With-Markdown/).
- The comments of Obsidian and callout are specific syntax, see [ basic syntax ](https://obsidian.md/help/syntax) and [ Callouts ](https://obsidian.md/help/callouts).
- PHP Extra properties, HTML mixed analysis, definitions list and abbreviations [Official explanation](https://michelf.ca/projects/php-markdown/extra/)。
- For MMD citations, CriticMarkup, abbreviations, etc., see [ MultiMarkdown syntax description ](https://fletcher.github.io/MultiMarkdown-4/syntax); for cross-file expansion, see [ File Transclusion ](https://fletcher.github.io/MultiMarkdown-6/syntax/transclusion.html). These are versioned syntax information and do not mean that Notdown has passed its compatibility testing.
- Pandoc reader and extensions see [ Pandoc manual ](https://pandoc.org/MANUAL.html#pandocs-markdown). Notdown uses its default snapshot and specifically implements its own native codec. Complete compatibility cannot be deduced from the default name.
