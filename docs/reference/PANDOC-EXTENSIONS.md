<a id="pandoc-扩展与-markdown-方言完整对照"></a>

# Pandoc extension reference

**English** · [简体中文](PANDOC-EXTENSIONS.zh-CN.md)

Check date: 2026-09-15. Running baseline: native **Pandoc 3.11**. Manual sources: [ Pandoc User ’ s Guide ](https://pandoc.org/MANUAL.html) . This is a snapshot of capabilities as of this date; will need to be rechecked after upgrading to Pandoc.

<a id="1-范围与结论"></a>

## 1. Scope and Conclusion

Here, the "plug-ins" referred to by users are divided into two levels:

- **The following is a list of the most common types of Extension (extension)**：`markdown+footnotes-blank_before_header` This format switches. This is the text of the individual collection manual. **89 is a different extension name**。
- **Filter / Self-definitionreader、writer**: operating internal document structures or adding input and output formats. They cannot be used `+extension` The switch is replaced by a new switch, see section 7.

Among the 89 items, the **77 item is accepted by at least one Markdown dialect, and the 12 item is not available in the eight Markdown dialects** . There are 77 items and **15 items.** is turned off by default in all dialects, but can be turned on manually in dialects that support them. "Not used by default" and "cannot be used" are different sets.

The eight dialects here are all Pandoc 3.11 has to offer Markdown reader . `notion-markdown` is the own dialect of Notdown and does not belong to the format registry of Pandoc. See Section 6 for its relationship.

<a id="怎么读表"></a>

### How to read the tables

| symbol | meaning |
| --- | --- |
| **open** | This dialect accepts this extension switch, and Pandoc is enabled by default |
| **close** | This dialect accepts this extension switch, but Pandoc is turned off by default; it can be turned on with `+名称` |
| **—** | The dialect does not accept the name's extension switch; it cannot be directly transmitted `+名称` or `-名称` |

**The word "symbol" is not the same as "symbol".** For example, CommonMark has a counter-code fence, and there is no code. `backtick_code_blocks` The switch; its `attributes` The following table describes the switches and default values accepted by Pandoc, which are neither guaranteed by word-for-word syntax nor guaranteed by all target formats.

Open/Shut-off from `pandoc --list-extensions=<variant>`The first is the Pandoc default.**Not the current user settings for the Lab window**• Lab is used to automatically enable the CommonMark series to be rolled in sync. `sourcepos`The default shutdown in the table is therefore not inconsistent with the actual activation of Lab.

<a id="2-方言默认值与差异原因"></a>

## 2. Dialects, Defaults and Reasons for Differences

| Abbreviation in the table | variant ID | parser family | Available switches | On by default | Defined purpose/why |
| --- | --- | --- | --- | --- | --- |
| P | `markdown` | M | 74 | 47 | Pandoc has its own Markdown default; more tables, footnotes, formulas, meta information and other extensions are enabled by default. |
| S | `markdown_strict` | M | 74 | 3 | Compatible with original Markdown; most Pandoc extra syntax is turned off by default. |
| E | `markdown_phpextra` | M | 74 | 12 | Use the corresponding presets of PHP Markdown Extra, such as definition lists, footnotes, pipeline tables, etc. |
| MMD | `markdown_mmd` | M | 74 | 22 | Use the presets for title blocks, identifiers, link attributes, etc. corresponding to MultiMarkdown. |
| Old GH | `markdown_github` | M | 74 | 17 | Historical GitHub Markdown preset, Pandoc This format has been deprecated; its true capabilities are still listed for compatibility with older configurations. |
| C | `commonmark` | C | 30 | 1 | CommonMark basic rules; basic syntax such as fence codes does not count as extension switches. |
| GFM | `gfm` | C | 30 | 12 | Based onCommonMark ofGitHub Flavored Markdown The first is to set up and add rules for tasks, tables, etc. |
| CX | `commonmark_x` | C | 30 | 20 | CommonMark plus several Pandoc style extensions; not an alias for the five markdown* reader styles. |

<a id="为什么能开关的集合会相同默认值却不同"></a>

### Why available switches can match while defaults differ

Pandoc's [ reader registry ](https://github.com/jgm/pandoc/blob/3.11/src/Text/Pandoc/Readers.hs) gives five `markdown*` dialects to the same `readMarkdown`, and `commonmark`, `gfm`, and `commonmark_x` to `readCommonMark`. [ extended registration and default default source code ](https://github.com/jgm/pandoc/blob/3.11/src/Text/Pandoc/Extensions.hs) respectively define the switch sets and default values ​​they can accept.

Therefore, the available range of **is primarily determined by the parser's implementation, and the default switch is primarily determined by the dialect's compatible presets for** . `markdown_strict+footnotes` works because it shares a parser with Pandoc Markdown; by adding footnotes, the document can no longer be treated as if it only uses the original Markdown syntax. Names such as PHP Extra, MultiMarkdown, GFM also indicate the corresponding implementation and default of Pandoc, and cannot be guaranteed to be completely consistent with all versions of other software.

The following code is used in the "Based on" column. They illustrate differences in the current implementation and do not speculate on the author's personal motivations for choosing the default values.

| Evidence | Why is it available in these dialects |
| --- | --- |
| **M** | Registered in the extension set of the `readMarkdown` family; all five types of `markdown*` are accepted, but the CommonMark family does not accept this switch with the same name. |
| **C** | Registered in the `readCommonMark` family; three CommonMark reader accepted, five `markdown*` not accepted |
| **MC** | Both families have implemented and registered this name; the specific resolution boundaries may still be different. |
| **U** | Universal extension. `east_asian_line_breaks` is added to the available set of each format, and has parsing and post-processing logic. |

The intersection of the two families is the 27 item, the M family has a unique 47 item, and the C family has a unique 3 item. For the specific combination of C, see [ CommonMark reader source code ](https://github.com/jgm/pandoc/blob/3.11/src/Text/Pandoc/Readers/CommonMark.hs).

<a id="3-markdown-可用扩展77-项完整表"></a>

## Available extensions for 3. Markdown: Complete list of 77 items

The column order is fixed: **P = Pandoc, S = Strict, E = PHP Extra, MMD = MultiMarkdown, old GH = old GitHub, C = CommonMark, GFM, CX = CommonMark X**. The extension links to the corresponding section of the manual; "Function and Notes" is a Chinese description that combines the source code and the behavior of this project.

<a id="31-文字与换行"></a>

### 3.1 text and line breaks

| Expand | P | S | E | MMD | Old GH | C | GFM | CX | Evidence | Functions and Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [smart](https://pandoc.org/MANUAL.html#extension-smart) | open | close | close | close | close | close | close | open | MC | Smart quotes, dashes and ellipses. Punctuation is converted when reading; it may be reversed to normal characters when writing Markdown. |
| [all_symbols_escapable](https://pandoc.org/MANUAL.html#extension-all_symbols_escapable) | open | close | close | open | open | — | — | — | M | Allow backslash escaping for more non-alphanumeric characters.  The escape set of C is determined by the CommonMark base rules, and this switch is not accepted. |
| [angle_brackets_escapable](https://pandoc.org/MANUAL.html#extension-angle_brackets_escapable) | close | close | close | close | close | — | — | — | M | Allow escaping angle brackets. It is a compatibility subdivision switch; the angle bracket escaping of C belongs to the basic rules. |
| [escaped_line_breaks](https://pandoc.org/MANUAL.html#extension-escaped_line_breaks) | open | close | close | close | close | — | — | — | M | A backslash at the end of a line indicates a hard line break.  C has this syntax built in and cannot be closed with this name. |
| [hard_line_breaks](https://pandoc.org/MANUAL.html#extension-hard_line_breaks) | close | close | close | close | close | close | close | close | MC | Every line break in a paragraph appears as a hard line break. is an optional reading method; none of the eight presets are enabled by default. |
| [ignore_line_breaks](https://pandoc.org/MANUAL.html#extension-ignore_line_breaks) | close | close | close | close | close | — | — | — | M | Ignore source code line breaks within paragraphs and do not insert spaces.  M provides this switch; it serves a different purpose than the hard newline expression. |
| [east_asian_line_breaks](https://pandoc.org/MANUAL.html#extension-east_asian_line_breaks) | close | close | close | close | close | close | close | close | U | Handle line breaks according to East Asian writing rules to avoid extra spaces between Chinese characters. The source code lists it as a universal extension, and performs a filtering step after parsing, so it does not only belong to a certain Markdown reader. |
| [intraword_underscores](https://pandoc.org/MANUAL.html#extension-intraword_underscores) | open | close | open | open | open | — | — | — | M | Underscores inside words maintain literal meaning.  C also has rules for underlining within words, but not via this switch. |
| [old_dashes](https://pandoc.org/MANUAL.html#extension-old_dashes) | close | close | close | close | close | — | — | — | M | Restore the dash interpretation rules of the old version of Pandoc. Only meaningful when smart is enabled; not typically enabled by default for modern syntax. |
| [gutenberg](https://pandoc.org/MANUAL.html#extension-gutenberg) | close | close | close | close | close | — | — | — | M | Plain text output uses Project Gutenberg's emphasis and spacing conventions. Although accepted by M, the actual use is plain writer; adding it to the input dialect of Lab will not change the HTML preview. |

<a id="32-标题与定位"></a>

### 3.2 title and positioning

| Expand | P | S | E | MMD | Old GH | C | GFM | CX | Evidence | Functions and Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [blank_before_header](https://pandoc.org/MANUAL.html#extension-blank_before_header) | open | close | close | close | close | — | — | — | M | A blank line is required before the title, except at the beginning of the document.  The compatible preset of M determines the default switch; C recognizes titles according to its own paragraph break rules. |
| [space_in_atx_header](https://pandoc.org/MANUAL.html#extension-space_in_atx_header) | open | close | close | close | open | — | — | — | M | Requires a space between the pound sign and the text in the ATX title.  The C basic syntax already requires corresponding separation and does not provide optional switches of the same name. |
| [auto_identifiers](https://pandoc.org/MANUAL.html#extension-auto_identifiers) | open | close | close | open | open | — | — | — | M | Automatically generate identifiers for headings.C Selected titlesID bygfm_auto_identifiers The mechanism controls and does not accept the flag of the same name. |
| [ascii_identifiers](https://pandoc.org/MANUAL.html#extension-ascii_identifiers) | close | close | close | close | close | close | close | close | MC | Autotitle ID uses only ASCII characters. A ID generation mechanism is required at the same time: M is usually paired with auto_identifiers, and C is paired with gfm_auto_identifiers. |
| [gfm_auto_identifiers](https://pandoc.org/MANUAL.html#extension-gfm_auto_identifiers) | close | close | close | close | open | close | open | open | MC | AdoptedGitHub Title of styleID The algorithm.M Automated changeID Algorithms;C Automatic headers are also enabled.ID The entrance. |
| [header_attributes](https://pandoc.org/MANUAL.html#extension-header_attributes) | open | close | open | close | close | — | — | — | M | Attributes such as ID and class are appended to the end of the title.  C covers this use with the attributes extension; the name itself cannot be passed to C. |
| [mmd_header_identifiers](https://pandoc.org/MANUAL.html#extension-mmd_header_identifiers) | close | close | close | open | close | — | — | — | M | Use MultiMarkdown style square bracket header ID .  The MMD preset is enabled by default; other M presets can optionally use the same compatible syntax. |
| [implicit_header_references](https://pandoc.org/MANUAL.html#extension-implicit_header_references) | open | close | close | open | close | close | close | open | MC | Treat the title text as an implicit reference link target. The parser needs to create a title reference table; after it is turned on, explicit link definitions still take precedence. |
| [sourcepos](https://pandoc.org/MANUAL.html#extension-sourcepos) | — | — | — | — | — | close | close | close | C | The source code location attribute is carried in AST. The current native position output is provided by C reader; M does not have this interface. Lab automatically enables it in C. |

<a id="33-代码与块结构"></a>

### 3.3 Code and Block Structure

| Expand | P | S | E | MMD | Old GH | C | GFM | CX | Evidence | Functions and Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [blank_before_blockquote](https://pandoc.org/MANUAL.html#extension-blank_before_blockquote) | open | close | close | close | close | — | — | — | M | A blank line is required before the quoted block. Avoid accidentally opening quotes with the greater than sign in the text; C uses its own block break rules. |
| [fenced_code_blocks](https://pandoc.org/MANUAL.html#extension-fenced_code_blocks) | open | close | open | close | open | — | — | — | M | Enables the tilde fence code block.  C has built-in tilde and backtick fences; its absence from the list does not mean that it does not support code fences. |
| [backtick_code_blocks](https://pandoc.org/MANUAL.html#extension-backtick_code_blocks) | open | close | close | open | open | — | — | — | M | Enable backtick fenced code blocks.  C is built in and cannot be turned off by this extension, the manual clearly states this exception. |
| [fenced_code_attributes](https://pandoc.org/MANUAL.html#extension-fenced_code_attributes) | open | close | close | close | close | — | — | — | M | Code fences can be attached with attributes such as ID, class, and line numbers.  C is provided with corresponding uses by attributes; language highlighting also depends on output format and language support. |
| [inline_code_attributes](https://pandoc.org/MANUAL.html#extension-inline_code_attributes) | open | close | close | close | close | — | — | — | M | Append attributes after inline code.  C is provided with the corresponding purpose by attributes. |
| [line_blocks](https://pandoc.org/MANUAL.html#extension-line_blocks) | open | close | close | close | close | — | — | — | M | Preserve line boundaries and leading spaces for poems, addresses, etc. on a line-by-line basis. This is a standalone block syntax, C does not have this optional parsing rule. |
| [literate_haskell](https://pandoc.org/MANUAL.html#extension-literate_haskell) | close | close | close | close | close | — | — | — | M | Interpret code and documentation according to Literate Haskell conventions. Professional input/output mode; alias lhs, not the default rule for daily notes. |
| [fenced_divs](https://pandoc.org/MANUAL.html#extension-fenced_divs) | open | close | close | close | close | close | close | open | MC | Construct the Div container with colon fences and attributes. Both families have implemented it, but the details of opening the fence are different; C does not allow appending a colon after the attribute. |
| [bracketed_spans](https://pandoc.org/MANUAL.html#extension-bracketed_spans) | open | close | close | close | close | close | close | open | MC | Square bracket literal construct Span with attributes. Carrying structural attributes to inline content does not mean allowing arbitrary HTML execution. |
| [attributes](https://pandoc.org/MANUAL.html#extension-attributes) | — | — | — | — | — | close | close | open | C | Attach common properties to block or inline content.  C is a dedicated unified attribute mechanism; M splits related uses into multiple switches such as titles, codes, links, etc. |

<a id="34-列表"></a>

### 3.4 list

| Expand | P | S | E | MMD | Old GH | C | GFM | CX | Evidence | Functions and Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [fancy_lists](https://pandoc.org/MANUAL.html#extension-fancy_lists) | open | close | close | close | close | close | close | open | MC | Ordered lists accept numbers such as letters and Roman numerals. Handled by the expansion list rules of each reader; only part of it is covered by the same-named option of Org. |
| [startnum](https://pandoc.org/MANUAL.html#extension-startnum) | open | close | close | close | close | — | — | — | M | Preserves the starting number of the ordered list.  C itself retains the ordered list starting value and does not require this independent switch. |
| [task_lists](https://pandoc.org/MANUAL.html#extension-task_lists) | open | close | close | close | open | close | open | open | MC | A square bracket check mark that identifies a task item. Parse the task status; whether it can be clicked to modify is the ability of the editor layer and is not guaranteed by this switch. |
| [definition_lists](https://pandoc.org/MANUAL.html#extension-definition_lists) | open | close | open | open | close | close | close | open | MC | Identify a list of definitions consisting of terms and definitions. There are corresponding rules for both ethnic groups; the default enabled depends on the dialect default. |
| [example_lists](https://pandoc.org/MANUAL.html#extension-example_lists) | open | close | close | close | close | — | — | — | M | Labeled examples are numbered consecutively throughout the text. The example numbering/reference mechanism of M is required, and C does not have this optional rule. |
| [lists_without_preceding_blankline](https://pandoc.org/MANUAL.html#extension-lists_without_preceding_blankline) | close | close | close | close | open | — | — | — | M | Lists without leading blank lines are allowed.  C has its own list break conditions, specifically involving the ordered list start value; it should not be treated as exactly the same switch. |
| [four_space_rule](https://pandoc.org/MANUAL.html#extension-four_space_rule) | close | close | close | close | close | — | — | — | M | Restore the old rule that continuation paragraphs in lists must be indented by four spaces. Compatible with Pandoc 2.0 and earlier behaviors; none of the eight presets are enabled by default. |

<a id="35-表格"></a>

### 3.5 form

| Expand | P | S | E | MMD | Old GH | C | GFM | CX | Evidence | Functions and Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [table_captions](https://pandoc.org/MANUAL.html#extension-table_captions) | open | close | close | close | close | — | — | — | M | Identify the captions before and after the table. The caption belongs to independent table semantics; the C pipeline table does not obtain the switch with the same name. |
| [simple_tables](https://pandoc.org/MANUAL.html#extension-simple_tables) | open | close | close | close | close | — | — | — | M | Construct a simple table with aligned text and horizontal lines. M table parser that relies on column widths and horizontal lines. |
| [multiline_tables](https://pandoc.org/MANUAL.html#extension-multiline_tables) | open | close | close | close | close | — | — | — | M | Tables that allow headers and cell contents to span multiple rows. It is an independent M table syntax and is not equivalent to opening the pipeline table. |
| [grid_tables](https://pandoc.org/MANUAL.html#extension-grid_tables) | open | close | close | close | close | — | — | — | M | Express grid tables with character borders.  M provides corresponding parsing rules; C currently does not provide this switch. |
| [pipe_tables](https://pandoc.org/MANUAL.html#extension-pipe_tables) | open | close | open | open | open | close | open | open | MC | Pipe table separated by vertical bars. Both families are implemented; turning it on does not mean that any merged cells or nested blocks can be expressed. |
| [table_attributes](https://pandoc.org/MANUAL.html#extension-table_attributes) | open | close | close | close | close | — | — | — | M | Append table attributes after the table caption. It belongs to the table/caption syntax of M; it should not be directly equated to the syntax of C and general attributes. |

<a id="36-元信息"></a>

### 3.6 meta information

| Expand | P | S | E | MMD | Old GH | C | GFM | CX | Evidence | Functions and Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [pandoc_title_block](https://pandoc.org/MANUAL.html#extension-pandoc_title_block) | open | close | close | close | close | — | — | — | M | Identify title, author, and date meta-information starting with a percent sign.  Pandoc has its own title block default; Lab currently only displays the main text and does not output meta information title page. |
| [yaml_metadata_block](https://pandoc.org/MANUAL.html#extension-yaml_metadata_block) | open | close | close | close | close | close | open | open | MC | IdentifyingYAML The original information block. Both families can read it.AST meta；Lab Currently outHTML The front is clear.meta，The documentation template is not complete. |
| [mmd_title_block](https://pandoc.org/MANUAL.html#extension-mmd_title_block) | close | close | close | open | close | — | — | — | M | Key-value header block identifying MultiMarkdown.  MMD is enabled by default; other enabled Pandoc/YAML header syntaxes may take precedence. |

<a id="37-行内格式"></a>

### 3.7 inline format

| Expand | P | S | E | MMD | Old GH | C | GFM | CX | Evidence | Functions and Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [strikeout](https://pandoc.org/MANUAL.html#extension-strikeout) | open | close | close | close | open | close | open | open | MC | Double tilde strikethrough. Both families have corresponding inline parsing rules. |
| [superscript](https://pandoc.org/MANUAL.html#extension-superscript-subscript) | open | close | close | open | close | close | close | open | MC | Superscript syntax. Two families are optional; the specific mark boundary is interpreted according to the corresponding reader. |
| [subscript](https://pandoc.org/MANUAL.html#extension-superscript-subscript) | open | close | close | open | close | close | close | open | MC | Subscript syntax. Two families are available; distinguished from short type upper and lower mark switches. |
| [short_subsuperscripts](https://pandoc.org/MANUAL.html#extension-short_subsuperscripts) | close | close | close | open | close | — | — | — | M | MultiMarkdown forms short superscript/subscript without closing symbols. The abbreviation can be enabled independently, and superscript/subscript is not required to be opened at the same time; MMD is enabled by default, and C does not register this rule. |
| [mark](https://pandoc.org/MANUAL.html#extension-mark) | close | close | close | close | close | — | — | — | M | Highlighted text surrounded by double equal signs.  Optional syntax for M; the final visible background may still require HTML style coordination. |
| [emoji](https://pandoc.org/MANUAL.html#extension-emoji) | close | close | close | close | open | close | open | open | MC | emoji name conversion surrounded by colons. Both families are identified through name mapping; not arbitrary custom emoji resource services. |

<a id="38-公式"></a>

### 3.8 formula

| Expand | P | S | E | MMD | Old GH | C | GFM | CX | Evidence | Functions and Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [tex_math_dollars](https://pandoc.org/MANUAL.html#extension-tex_math_dollars) | open | close | close | open | close | close | open | open | MC | Inline and standalone formulas surrounded by dollar signs. Responsible for identifying TeX formulas; display still requires KaTeX, MathJax, or the target layout engine. |
| [tex_math_gfm](https://pandoc.org/MANUAL.html#extension-tex_math_gfm) | — | — | — | — | — | close | open | close | C | GitHub's unique backtick formula and math fence form.  C reader provides specialized handling; just because M also supports dollar formulas does not mean that this switch is available. |
| [tex_math_single_backslash](https://pandoc.org/MANUAL.html#extension-tex_math_single_backslash) | close | close | close | close | close | — | — | — | M | A single backslash followed by round/square brackets delimits the TeX formula. There is competition with regular backslash escaping, which is turned off by default for all Markdown presets. |
| [tex_math_double_backslash](https://pandoc.org/MANUAL.html#extension-tex_math_double_backslash) | close | close | close | open | close | — | — | — | M | Double backslashes and round/square brackets delimit the TeX formula. Is another set of boundary syntax; MMD is enabled by default. |
| [latex_macros](https://pandoc.org/MANUAL.html#extension-latex_macros) | open | close | close | close | close | — | — | — | M | Identify and apply LaTeX macro definitions for formulas. Requires macro processing rather than ordinary code display; its function is affected by the output format and is not a complete TeX executor. |

<a id="39-原始内容"></a>

### 3.9 original content

| Expand | P | S | E | MMD | Old GH | C | GFM | CX | Evidence | Functions and Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [raw_html](https://pandoc.org/MANUAL.html#extension-raw_html) | open | open | open | open | open | open | open | open | MC | Preserve or interpret the original HTML in the input. Whether accepted HTML is displayed depends on the target writer; Lab also sanitizes scripts and dangerous attributes. |
| [raw_tex](https://pandoc.org/MANUAL.html#extension-raw_tex) | open | close | close | close | close | — | — | — | M | Keep the original TeX fragment outside the formula. Raw TeX is usually only suitable for TeX-compatible output; just because the HTML preview cannot show it does not mean that the switch is invalid. |
| [markdown_in_html_blocks](https://pandoc.org/MANUAL.html#extension-markdown_in_html_blocks) | open | close | close | close | close | — | — | — | M | inHTML The inside of the block continues to be analyzedMarkdown。 C The originalHTML The block has different boundary rules; this compatibility switch does not allow the block to be connected to the grid.C Open up. |
| [markdown_attribute](https://pandoc.org/MANUAL.html#extension-markdown_attribute) | close | close | open | open | close | — | — | — | M | It's just there.markdown The propertiesHTML In container analysisMarkdown。 CooperationHTML InsideMarkdown The rules;PHP Extra/MMD The agreement is intended to be adopted. |
| [native_divs](https://pandoc.org/MANUAL.html#extension-native_divs) | open | close | close | close | close | — | — | — | M | HTML div is read as a native Div structure.  M can use the HTML structure to construct AST; C can use fenced_divs to express containers, with different mechanisms. |
| [native_spans](https://pandoc.org/MANUAL.html#extension-native_spans) | open | close | close | close | close | — | — | — | M | HTML span is read as a native Span structure.  M can borrow the HTML structure to construct AST; C's bracketed_spans is another syntax path. |
| [raw_attribute](https://pandoc.org/MANUAL.html#extension-raw_attribute) | open | close | close | open | close | close | close | open | MC | Explicitly specify which raw output format the code style content belongs to. Generates RawBlock/RawInline; there is usually no output if the target writer does not match. |

<a id="310-链接与图片"></a>

### 3.10 links and pictures

| Expand | P | S | E | MMD | Old GH | C | GFM | CX | Evidence | Functions and Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [shortcut_reference_links](https://pandoc.org/MANUAL.html#extension-shortcut_reference_links) | open | open | open | open | open | — | — | — | M | Simply write the citation tag to form a citation link.  C already has abbreviated reference link basic syntax and does not accept this switch with the same name. |
| [spaced_reference_links](https://pandoc.org/MANUAL.html#extension-spaced_reference_links) | close | open | open | open | close | — | — | — | M | Spaces are allowed between the two sets of square brackets referencing links. An old-style reference syntax compatibility option; cannot be used to override the linking rules of C. |
| [autolink_bare_uris](https://pandoc.org/MANUAL.html#extension-autolink_bare_uris) | close | close | close | close | open | close | open | close | MC | Exposed absolute URLs are automatically converted into links. Both families have optional auto-linking rules; they differ from the basic syntax of angle bracket auto-linking. |
| [link_attributes](https://pandoc.org/MANUAL.html#extension-link_attributes) | open | close | open | close | close | — | — | — | M | Link or image attached attributes.  C's attributes cover the corresponding use; the output effect is determined by the target format and attributes. |
| [mmd_link_attributes](https://pandoc.org/MANUAL.html#extension-mmd_link_attributes) | close | close | close | open | close | — | — | — | M | MultiMarkdown The key-value attribute of the reference link/picture. Not the same syntax as link_attributes; used for compatibility with MMD source files. |
| [implicit_figures](https://pandoc.org/MANUAL.html#extension-implicit_figures) | open | close | close | open | close | close | close | close | MC | Paragraphs with only one picture can be recognized as pictures and captions. What is enabled is Figure semantics and does not automatically obtain the page cover. |
| [rebase_relative_paths](https://pandoc.org/MANUAL.html#extension-rebase_relative_paths) | close | close | close | close | close | close | close | close | MC | Rewrite the relative link/picture path based on the source file directory. The source file path context is required; Lab transmits the text through stdin, and currently does not carry the original file directory. |
| [wikilinks_title_after_pipe](https://pandoc.org/MANUAL.html#extension-wikilinks_title_after_pipe) | close | close | close | close | close | close | close | close | MC | The right side of the double chain vertical line is the display title. The two families provide this double-chain agreement; they do not automatically access Notdown page ID parsing or page creation. |
| [wikilinks_title_before_pipe](https://pandoc.org/MANUAL.html#extension-wikilinks_title_after_pipe) | close | close | close | close | close | close | close | close | MC | To the left of the double chain vertical line is the display title. Reverse the title/objective order of the previous item; introduced in the main body of the manual rather than as a separate section. |

<a id="311-脚注与引文"></a>

### 3.11 Footnotes and Citations

| Expand | P | S | E | MMD | Old GH | C | GFM | CX | Evidence | Functions and Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [footnotes](https://pandoc.org/MANUAL.html#extension-footnotes) | open | close | open | open | open | close | open | open | MC | Identify footnote references and definitions. Both families have footnote rules; optional does not mean that the editor on the right has provided footnote editing UI. |
| [inline_notes](https://pandoc.org/MANUAL.html#extension-inline_notes) | open | close | close | close | close | — | — | — | M | Write inline footnotes directly in the text.  M is a special footnote writing method; C and footnotes do not support this switch. |
| [citations](https://pandoc.org/MANUAL.html#extension-citations) | open | close | close | close | close | — | — | — | M | Read the citation key and location information as citation AST. Identifying citations and generating references are two steps; the latter requires citeproc and bibliographic information. C currently does not have this expansion switch. |
| [abbreviations](https://pandoc.org/MANUAL.html#extension-abbreviations) | close | close | open | close | close | — | — | — | M | Accepts the abbreviation definition line for PHP Markdown Extra. Important limitations: Pandoc AST does not have an abbreviation node, and the definition will be skipped when turned on. It does not support full abbreviation/suspended interpretation. |
| [alerts](https://pandoc.org/MANUAL.html#extension-alerts) | close | close | close | close | open | close | open | open | MC | Recognize GitHub style prompt quotes. Turn the agreed reference blocks into prompt semantics; visible colors and icons are still determined by the rendering style. |

<a id="4-八种-markdown-方言都不可用12-项"></a>

## 4. None of the eight Markdown dialects are available: 12 items

The following 12 items are paired **P / S / E / MMD / Old GH / C / GFM / CX all in lead**They serve other input/output formats; not Lab's Markdown extended list leakage. The read/write directions are listed here in the manual, to avoid misreading a particular format to the format of reader and writer.

| Expand | Practical applicable formats and directions | features, and why they are not part of the Markdown dialect |
| --- | --- | --- |
| [amuse](https://pandoc.org/MANUAL.html#extension-amuse) | Read `muse`; this format is enabled by default | The syntax convention of Text::Amuse for Emacs Muse belongs to Muse reader. Markdown is not parsed according to the block rules of Muse. |
| [element_citations](https://pandoc.org/MANUAL.html#extension-element_citations) | Write `jats` / `jats_archiving` / `jats_publishing` / `jats_articleauthoring`; default is off | Outputs bibliographic information using the structured citation elements of JATS; the CSL style does not control this output. It determines the target XML structure and does not add Markdown citation syntax. |
| [empty_paragraphs](https://pandoc.org/MANUAL.html#extension-empty_paragraphs) | Manual: read `docx` / `html`; write `docx` / `odt` / `opendocument` / `html` / `latex`; default off | Preserve or output real blank paragraphs. These formats have structures that can be expressed in blank paragraphs;Markdown The blank lines usually separate the block, and cannot be used to convert the switch into the same structure.CLI Other names/The following is a list of the countries of the world:`html4`、`html5`、`epub`、`epub2`、`epub3`、`beamer`The first is that the two-way function is not deduced. |
| [native_numbering](https://pandoc.org/MANUAL.html#extension-native_numbering) | Write `docx` / `odt` / `opendocument`; default is off | Use the native counting fields of office documents to number figures and tables; rely on the field mechanism of the output file format. |
| [ntb](https://pandoc.org/MANUAL.html#extension-ntb) | Write `context`; default off | ChooseConTeXt ofNatural Tables The program is a strategy for targeted spreadsheet generation. |
| [raw_markdown](https://pandoc.org/MANUAL.html#extension-raw_markdown) | Read `ipynb`; default off | Keep the original text of Markdown cell in the notebook as RawBlock and skip the usual Markdown parsing. It controls notebook import, and subsequent output must also be able to handle this raw content. |
| [smart_quotes](https://pandoc.org/MANUAL.html#extension-smart_quotes-org) | Read/write `org`; default off; `smart` includes its role | Separately controls Org smart quote conversion; Markdown uses its own `smart` switch and does not have this Org-specific segment name. |
| [special_strings](https://pandoc.org/MANUAL.html#extension-special_strings-org) | `org`Text conversion; enabled by default; `smart` contains its function | Control Org's processing of special strings such as dashes and ellipses, and work according to the rules of Org. |
| [styles](https://pandoc.org/MANUAL.html#ext-styles) | Read `docx`; default off | Keep DOCX style information as custom style attributes on Div, Span, and Table for subsequent conversion; not web page theme or Markdown highlight style switch. |
| [tagging](https://pandoc.org/MANUAL.html#extension--tagging) | Write `context`; default off | Produced for structural labellingPDF ofConTeXt The following is a list of the most common types of motorcycle engines used in the United States:Markdown The language of the label. |
| [xrefs_name](https://pandoc.org/MANUAL.html#extension-xrefs_name) | Write `odt` / `opendocument`; default off | Use the cross-reference field of the target document to display the name or title; office software is required to update the relevant fields. |
| [xrefs_number](https://pandoc.org/MANUAL.html#extension-xrefs_number) | Write `odt` / `opendocument`; default off | Display numbers using cross-reference fields; relies on numbering configuration and field updates. It controls the export field, not the Markdown double chain. |

Meaning for Notdown: If the import/export of DOCX, ODT, IPYNB, ConTeXt, etc. is implemented in the future, these functions should be provided in the **corresponding input or output format option** and cannot be stuffed into the `markdown+...` request.

<a id="同一扩展名在其他格式中的含义"></a>

### Meanings of the same extension name in other formats

The following sections have been merged by name into the 77 item table and cannot be counted again:

| Names and Manual Sections | Other format uses |
| --- | --- |
| [citations（Typst）](https://pandoc.org/MANUAL.html#typst-citations) | Controls native citation reading and writing of Typst; the same name does not mean that the syntax is exactly the same as the citation key of Markdown. |
| [citations（Org）](https://pandoc.org/MANUAL.html#org-citations) | Read and write Org citation syntax instead of parsing Org as Markdown. |
| [citations（DOCX）](https://pandoc.org/MANUAL.html#docx-citations) | Read the citations inserted in Zotero, Mendeley, and EndNote as Pandoc native citations; when closed, the typeset citations will be treated as ordinary text. The Word plugins for these tools are not Markdown extension switches. |
| [fancy_lists（Org）](https://pandoc.org/MANUAL.html#org-fancy-lists) | Org supports alphanumeric list markers; it does not copy the Roman numeral or autonumbering placeholder capabilities of the Markdown implementation. |

<a id="5-所有方言默认都关闭但可以启用15-项"></a>

## 5. All dialects are off by default, but can be enabled: 15 item

These extensions belong to the previous 77 items, not the new 15 items. See Section 3 for specific functions and limitations.

| Expand | Dialects that can be turned on manually |
| --- | --- |
| [angle_brackets_escapable](https://pandoc.org/MANUAL.html#extension-angle_brackets_escapable) | P, S, E, MMD, old GH |
| [ascii_identifiers](https://pandoc.org/MANUAL.html#extension-ascii_identifiers) | P, S, E, MMD, old GH, C, GFM, CX |
| [east_asian_line_breaks](https://pandoc.org/MANUAL.html#extension-east_asian_line_breaks) | P, S, E, MMD, old GH, C, GFM, CX |
| [four_space_rule](https://pandoc.org/MANUAL.html#extension-four_space_rule) | P, S, E, MMD, old GH |
| [gutenberg](https://pandoc.org/MANUAL.html#extension-gutenberg) | P, S, E, MMD, old GH |
| [hard_line_breaks](https://pandoc.org/MANUAL.html#extension-hard_line_breaks) | P, S, E, MMD, old GH, C, GFM, CX |
| [ignore_line_breaks](https://pandoc.org/MANUAL.html#extension-ignore_line_breaks) | P, S, E, MMD, old GH |
| [literate_haskell](https://pandoc.org/MANUAL.html#extension-literate_haskell) | P, S, E, MMD, old GH |
| [mark](https://pandoc.org/MANUAL.html#extension-mark) | P, S, E, MMD, old GH |
| [old_dashes](https://pandoc.org/MANUAL.html#extension-old_dashes) | P, S, E, MMD, old GH |
| [rebase_relative_paths](https://pandoc.org/MANUAL.html#extension-rebase_relative_paths) | P, S, E, MMD, old GH, C, GFM, CX |
| [sourcepos](https://pandoc.org/MANUAL.html#extension-sourcepos) | C、GFM、CX |
| [tex_math_single_backslash](https://pandoc.org/MANUAL.html#extension-tex_math_single_backslash) | P, S, E, MMD, old GH |
| [wikilinks_title_after_pipe](https://pandoc.org/MANUAL.html#extension-wikilinks_title_after_pipe) | P, S, E, MMD, old GH, C, GFM, CX |
| [wikilinks_title_before_pipe](https://pandoc.org/MANUAL.html#extension-wikilinks_title_after_pipe) | P, S, E, MMD, old GH, C, GFM, CX |

The default shutdown may be due to compatibility, professional use, the need for additional features, or output target restrictions. Determining whether to enable it or not should depend on the specific use; "full access" means fully providing available items, **does not mean opening all competing parsing rules**.

For example, `wikilinks_title_after_pipe` and `wikilinks_title_before_pipe` have opposite conventions on the order of titles and targets, and one should be chosen for the actual configuration. `hard_line_breaks` and `ignore_line_breaks` also express different line wrapping requirements.

<a id="6-在-notdown--markdown-lab-中如何理解支持"></a>

## 6. How to understand "support" in Notdown / Markdown Lab

<a id="以-blank_before_header-为例"></a>

### Example: blank_before_header

It's the "require blank lines" switch. Opening is not about adding a way to write a title, but tightening the conditions for title recognition:

```markdown
上一段
# 紧接着的标题
```

When preset with `markdown`, this extension is enabled by default, and the second line above will not be processed according to the new ATX title; changing it to `markdown-blank_before_header` allows it to start the title directly. Both configurations recognize headers when preceded by a blank line. CommonMark's header breaking rules are built into reader, so `commonmark` should be selected, you can't pass in `commonmark-blank_before_header` which it doesn't accept.

<a id="四层能力不能混为一谈"></a>

### Distinguishing four capability layers

```text
方言 reader 接受开关
        ↓
源码在相应上下文中产生 AST 语义
        ↓
writer 将该语义输出为目标格式
        ↓
页面样式、公式渲染与交互显示结果
```

Pandoc ofAST The middle semantics of a document are that it contains blocks, lines, and metadata.Notdown The database is permanently updated and does not guarantee that all the gaps and grammar will be retained.Lab The source code on the left is still true, and only the left is true.AST The first is the "Blood of the Dead".

| Extensions/Capabilities | actual boundary of current Lab |
| --- | --- |
| `sourcepos` | Three of them.CommonMark reader The synchronized system is automatically activated, not as a user switch; the other five arereader The first is the location of the block. |
| `gutenberg` | CLI accepts this name, but the effect is plain text writer; there is no corresponding display change in the current preview of "Markdown input → HTML output". |
| `raw_tex` / `raw_attribute` | Raw clips with mismatched target formats may not be output; the Not Equals dialect switch is not connected. HTML also goes through application cleanup. |
| `citations` | Being able to recognize the citation structure does not mean that the bibliographic file, CSL style and `--citeproc` have been connected. Currently Lab does not have a complete reference generation process. |
| YAML / Pandoc / MMD meta information | reader is recognizable; the current HTML is officially empty before AST is released. `meta`The documentation is not complete, and there is no full documentation template or title page. |
| `rebase_relative_paths` | The source file directory context is required; currently Lab passes the source code through stdin and does not retain the original file directory. |
| `abbreviations` | Pandoc itself does not support the complete abbreviation AST; when enabled, the definition line will be skipped and no complete floating explanation will be generated. |
| Properties, `mark`,`alerts` | The existence of semantics in AST/HTML and the final page having specialized colors, icons, and interactions are two different things; it also depends on the renderer and CSS. |
| formula | Expansion determines the recognition rules; whether specific formulas can be displayed also depends on the local formula renderer support range. |
| Task list, double chain | Resolvable status or link, does not automatically get editable checkboxes, Notdown page ID parsing, backlinks or page creation. |

The above boundaries come from the current [ Lab implementation description ](../features/MARKDOWN-LAB.md), [ Pandoc preview service ](../../server/pandoc.ts) and [ Lab code ](../../src/markdown-lab), and should not be mistakenly written as Pandoc itself is not supported.

### notion-markdown

Currently `notion-markdown` takes Notdown and has codec instead of `pandoc -f notion-markdown` . Therefore, this article treats the **89 Pandoc extensions as direct switches, making them all "not applicable" to**; this does not mean that the Notion dialect does not have headers, tables, formulas, columns, or prompt blocks.

To merge the two, it is necessary to establish a syntax → internal syntax → display/edit → adaptive relationship that can restore the original syntax. The current Notion dialect is fully enabled, and it cannot be claimed that this 89 switch has been mapped to its codec.[3] Difficulty keeping and editing [The Markdown Lab architecture and compatibility boundaries](../features/MARKDOWN-LAB.md#difficulties-integrating-with-the-notdown-editor)。

<a id="已移除的-lab-演示notdown-bookmark"></a>

### Removed Lab demo: notdown-bookmark

`notdown-bookmark`What was once the old Markdown Lab bookmark card demo: interpret JSON in the code fence as a card. This demo has been discontinued, is not a current Notdown text syntax, an official Notion syntax, or a Pandoc extension, and does not count towards the 89 entry in this article.

Current Lab is used to contrast the output of the renderer/dialogue with HTML. Old source code is resolved by the usual rules of the selected dictionary; when supporting code fences,`notdown-bookmark` It's just a barbed-wire message string that shows up as a block of code, and it doesn't create bookmarks or Unsupported blocks. `bookmark` Plugin configuration not executed. Details [Historical Exhibition of the Borders](../features/MARKDOWN-LAB.md#historical-bookmark-demo-disabled)。

<a id="7-手册中的其他插件机制"></a>

## 7. Other plugin mechanisms in the manual

The manual doesn't have a limited catalog of "all third-party plug-ins are listed here". Below is the mechanism it describes and related examples; installing Pandoc does not install all external programs.

| mechanism | Available in which Markdown variant | Why, and how it relates to the current Lab |
| --- | --- | --- |
| JSON filter：`--filter` / `-F` | All eight can be accessed after parsing; specific filters may require specific AST nodes or meta information | An external program reads and outputs Pandoc JSON documents, independent of a dialect name. Lab does not yet provide any external filter implementation. |
| Lua filter：`--lua-filter` / `-L` | All eight types can be accessed after parsing; the actual effect depends on the filter. | inPandoc ofLua Environmental transitions and changesAST；No`+lua` Lab is not yet managed by Lua filter. |
| Built-in citation processor:`--citeproc` | All eight types can enter this processing flow; the citation node and the required bibliographic information must be available | This is an AST citation-formatting step. The three current CommonMark readers have no `citations` switch; adding `--citeproc` alone does not make them recognize Pandoc citation source. |
| Custom Lua reader:`-f path.lua` | Used as another input reader, not superimposed with a certain Markdown reader at the same time | The custom program decides how to read the source code, replacing the input side; rather than opening a syntax in an existing dialect. Lab is not open. |
| Custom Lua writer:`-t path.lua` | 8 can be receivedreader The birthAST，But the specific nodes are covered bywriter Decided | Replacement of output side; new formats may be implemented, automatic support for every block is not guaranteed. Lab currently outputs HTML fixedly. |

JSON filter, Lua filter, and citeproc are run in the order they appear on the command line; when a filter requires nodes produced first by another filter, the order affects the results. Refer to the manual for [ JSON filter ](https://pandoc.org/MANUAL.html#option--filter), [ Lua filter ](https://pandoc.org/MANUAL.html#option--lua-filter), [ citeproc ](https://pandoc.org/MANUAL.html#option--citeproc) and [ to customize reader/writer ](https://pandoc.org/MANUAL.html#custom-readers-and-writers).

<a id="手册提到的开发库与示例名称"></a>

### Development libraries and example names mentioned in the manual

| Name | actual identity |
| --- | --- |
| `Text.Pandoc.JSON` / `toJSONFilter` | Haskell's filter development interface is not a Markdown syntax. |
| [pandocfilters](https://github.com/jgm/pandocfilters) | Python filter development library. |
| [pandocfilters-php](https://github.com/vinai/pandocfilters-php) | PHP filter development library. |
| [Pandoc::Filter](https://metacpan.org/pod/Pandoc::Filter) | Perl filter development library. |
| [pandoc-filter-node](https://github.com/mvhenderson/pandoc-filter-node) | JavaScript filter development library. |
| `caps.py`、`count-words.lua` | Filename that demonstrates the filter command; not the Pandoc committed built-in plugin package. |
| `creole.lua`、`sample.lua`、`my_custom_markup_language.lua` | Sample or placeholder filename for custom reader/writer. |
| LPeg | Parsing library available for Lua to customize reader for use; not a Markdown dialect switch. |

The above third-party links are references in the manual and do not mean that this project has installed, enabled or reviewed these libraries.

<a id="8-核对方法覆盖与复现"></a>

## 8. verification method, coverage and reproduction

<a id="覆盖口径"></a>

### Coverage criteria

- The manual text has **91 sections starting with Extension and** . After deduplication, 88 extensions appear in the title; `superscript` / `subscript` share sections, and `citations` / `fancy_lists` have repeated sections across formats.
- `wikilinks_title_before_pipe` In the `wikilinks_title_after_pipe` The first is the "Total" of the **89 different names**。`lhs` Yes `literate_haskell` The name of the country is not counted separately.
- No.3 Section77 The following is a list of articles related to4 Section12 The whole thing is covered by this.89 The name.5 The section is just the default to shut down the subset,7 The development mechanism of the section is not mixed with the extension count.
- The local 3.11 source enumeration also contains **`epub_html_exts`**, but the main text of the manual for this download does not mention it. So don't pass it off as "Item 90 in the manual". CLI accepts this name in `html`, `html4`, `html5`, `epub`, `epub2`, and `epub3`, involving EPUB extension HTML; eight types of Markdown reader are not accepted. The basis is [ 3.11 extended enumeration ](https://github.com/jgm/pandoc/blob/3.11/src/Text/Pandoc/Extensions.hs).

<a id="可复现命令"></a>

### Reproduction commands

The following is PowerShell; it only reads program capabilities and does not operate the vault:

```powershell
pandoc --version
pandoc --list-input-formats

$markdownVariants = @(
  'markdown', 'markdown_strict', 'markdown_phpextra', 'markdown_mmd',
  'markdown_github', 'commonmark', 'gfm', 'commonmark_x'
)
foreach ($variantName in $markdownVariants) {
  Write-Output "### $variantName"
  pandoc "--list-extensions=$variantName"
}

# 其他格式示例：这里不会把 docx/odt 当作 Markdown 方言。
pandoc --list-extensions=docx
pandoc --list-extensions=odt
pandoc --list-extensions=org
```

In the output, `+` indicates that the switch is on by default, and `-` indicates that it is off by default. The absence of a certain name indicates that the switch is not registered. Use `-f variant+extension` to change the input parsing, and use `-t format+extension` to change the output function; adding output extension to the input is not guaranteed to be effective.

The [ machine-readable snapshot ](../data/pandoc-3.11-extensions.json) saved with this article contains the check time, the manual SHA-256 and 89 manual names and links, the original Boolean defaults for the eight dialects, and a list of the formats in which the 12 items are accepted by non-Markdown extensions. The format registration list itself does not distinguish between reading and writing implementation directions, so please refer to the manual for additional instructions in section 4.

When updating, you should re-run the actual installed Pandoc and check whether the online manual has changed versions; you cannot just change the version number at the top of the document. This article does not claim to have run all extended display, export, or round-trip tests.
