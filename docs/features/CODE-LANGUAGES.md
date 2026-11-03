<a id="代码语言与高亮"></a>

# Code languages and highlighting

**English** · [简体中文](CODE-LANGUAGES.zh-CN.md)

The language menu is divided into **Notion (87 item)** and **Custom (17 item)**. The two groups are arranged according to the display name. The search matches uniformly by display name, fence ID, and alias, retains the group title and hides unmatched groups. Keyboard arrow keys and Enter can be selected across groups. Mermaid is subsumed under Diagram and does not appear in the code language menu. Makefile already belongs to the Notion group and is highlighted using Prism Makefile, which is not repeated in Custom.

The menu and word segmentation selection share the [ language registry ](../../src/editor/code-languages.ts). Old fences are not migrated by opening a menu, searching, or updating the display name; the block's label is only modified when the user explicitly selects a language. Unknown tags remain in the Current grouping.

When Notion is imported, only the non-empty fence tags that are not recognized by the language registry are checked against the same batch of Block API, and the language is restored after unique matching of the complete code text, and the confirmed `shell` → `shen` Export differences. Known languages, aliases, empty tags and Mermaid do not trigger verification and will not be overwritten by scanning triggered by other unknown tags. For details, see[Notion import](NOTION-IMPORT.md#content-support-and-remaining-limitations). in normal Markdown `shen` Remains as unknown label, not globally mapped to Shell .

Code language and legend controls follow the editable state of the editor, including Callout , nested code blocks within references. Source/Split editing is back available after syncing to Page view; remains disabled in read-only preview.

<a id="custom-来源与名称"></a>

## Custom sources and names

| Display name | Create a new fence ID | Highlighting source | Common search / reader aliases |
| --- | --- | --- | --- |
| ActionScript | `actionscript` | Prism ActionScript | `as`、`as3` |
| AWK | `awk` | Prism AWK | `gawk` |
| Batch (CMD) | `batch` | Prism Batch, Windows command script | `bat`、`cmd`、`dos`、`windows batch` |
| Django Template Language | `django` | Prism Django/Jinja2, including template word segmentation hook | `dtl`、`django-html` |
| Easy Programming Language | `epl` | Local basic lexical rules for E language | `易语言`、`eyuyan`、`e-language` |
| Excel Formula | `excel-formula` | Prism Excel Formula | `excel`、`xlsx`、`xls`、`Excel 公式` |
| GNU Octave | `octave` | Local extension Prism MATLAB rules | `octave` |
| Jinja | `jinja` | Prism Django/Jinja2, including template word segmentation hook | `jinja2`、`j2`、`jinja-html` |
| Lean | `lean` | Shiki ofLean 4 TextMate Syntax | `lean4`、`lean 4` |
| Regular Expression | `regex` | Prism Regex | `regexp`、`regular-expression`、`正则` |
| sed | `sed` | language-sed TextMate syntax, colored by Shiki | `gsed`、`gnu sed` |
| SPARQL | `sparql` | Prism SPARQL, reuse Turtle dependencies | `rq` |
| SVG | `svg` | Prism Markup/XML; independent menu item | `scalable vector graphics` |
| Turtle | `turtle` | Prism Turtle | `ttl`、`rdf turtle` |
| Vimscript | `vimscript` | Prism Vim | `vim`、`viml`、`vim script` |
| Wenyan | `wenyan` | Shiki classical ChineseTextMate Syntax | `wenyan-lang`、`wenyan lang`、`文言`、`文言文` |
| Wikitext | `wikitext` | Prism Wiki markup, MediaWiki style | `wiki`、`mediawiki`、`wiki markup` |

Source:

- [Prism language component ](https://prismjs.com/#supported-languages). Jinja and Django are independent options in the menu and currently share the upstream hybrid template syntax; their syntax is not considered identical. [ Jinja document ](https://jinja.palletsprojects.com/en/stable/), [ Django Template Language document ](https://docs.djangoproject.com/en/stable/ref/templates/language/).
- [Shiki language pack](https://shiki.style/languages)ProvidedLean andWenyan The resultsTextMate The language of the language[JavaScript engine synchronization API](https://shiki.style/guide/sync-usage), corresponding syntax for on-demand initialization, no runtime CDN.[Lean official editor](https://github.com/leanprover/vscode-lean4)、[Classical Chinese Official Highlight Project](https://github.com/wenyan-lang/highlight). The official Wenyan project also provides independent Prism components.
- sed reuses [ language-sed ](https://github.com/Alhadis/language-sed), fixes the upstream submission and conversion to JSON, and retains the ISC license; see [ syntax source and conversion ](../../src/editor/grammars/README.md) for details.
- The local rules of GNU Octave follow the official [ keywords ](https://docs.octave.org/interpreter/Keywords.html), [ block comments ](https://docs.octave.org/interpreter/Block-Comments.html) and [ string ](https://docs.octave.org/interpreter/Strings.html) descriptions, supplemented by `#`/`%` comments, paired independent line block comments, single and double quotation mark strings, transpose characters, `endif`/`endfunction` and other keywords. It is lexical highlighting, not a complete Octave parser.

<a id="脚本模式与公式"></a>

## Scripts, patterns and formulas

The menu is not limited to general programming languages: [ sed ](https://www.gnu.org/software/sed/manual/html_node/sed-Programs.html) is a text processing script language; Regular Expression is a domain-specific language for describing matching rules; Excel Formula is a spreadsheet formula language, [ LAMBDA ](https://www.microsoft.com/en-us/research/blog/lambda-the-ultimatae-excel-worksheet-function/) also supports custom functions. All three provide source code shading and do not perform scripting, matching or calculations.

EPL here refers to Easy Language (Easy Programming Language), not the event processing language with the same abbreviation. The rules support dot instructions, single quote comments, straight/curved double quote strings, function calls, constants, numbers and operators in the copied text source code; the binary `.e` project is not read, the support library signature is not parsed, and semantic verification is not performed. Vimscript adopts existing Prism Vim rules and does not promise to fully cover Vim9. The extended syntax of each Regex engine and Excel localized function names are not guaranteed to be fully covered.

## Wolfram Language

The language display name uses **Wolfram Language**; Mathematica is the product name using this language, see [ Wolfram official language introduction ](https://www.wolfram.com/language/). This item still belongs to the corresponding group of Notion, moved to the letter position of W, and will not be added repeatedly in Custom. The existing `mathematica` fence ID remains compatible, and `wolfram`, `wolfram-language`, `wl`, and `nb` can all be recognized and searched.

<a id="边界与正文保护"></a>

## Boundaries and body preservation

- Of the 104 options, ASCII Art and Plain Text are intentionally left untouched, with the remaining 102 items connected to the syntax; complete recognition of all versions, extensions, dialects, and semantics of each language is not promised.
- Lean targets Lean 4 and does not run proof checks or language servers. Notion Formula only local lexical coloring, no formula execution.
- Both engines output text offsets, and ProseMirror Decoration is responsible for coloring. The template hook verifies the original text after restoring the placeholder content; SVG, template and code will not be injected as executable HTML.
- Highlighted exceptions, unknown languages, and blocks with more than 32 and 000 UTF-16 code units remain editable plain text. The color adopts the Notdown local color palette and does not claim to be a replica of Notion or IDE in each language.
- Mermaid The fence isNotdown and officialNotion The languagev1/v2，Including import page)Diagram The first is the preview, which is supported by the same nested blocks.**Edit source** The source code can be edited, and the source code will be retained and errors will be displayed when rendering errors occur. After turning off the diagrams extension, the normal code block is displayed, and reopening can restore the diagram; the original text will not be rewritten or a new text protocol will be added due to the display preview. The official Notion dialect only supports Mermaid and does not additionally enable sequence/flow fencing.
