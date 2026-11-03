<a id="notdown-内容合集与插入菜单"></a>

# Notdown content superset and insertion menu

**English** · [简体中文](NOTDOWN-SUPERSET.zh-CN.md)

2026-09-25: Notdown adds Quarto's R/Python/Julia/OJS executable blocks, inline expressions, `#|`/`//|` options original text retention, and interactive execution isolated by window. The Quarto syntax is used, no new text protocol is added, and the file is still `.md`; the enable boundaries of other dialects remain unchanged. See [ Quarto Dialects and Multilingualism Notebook ](../features/QUARTO.md).

2026-09-23 Final Border: The Notdown set already has Markdown dialect and Notion. The default grammar is only used to complement the official Enhanced Markdown unsupported Notion block, already has block attributes, inline and style, and can only be used in `syntax.variant: notdown` enable;`notion-markdown` Only the official document definitions are enabled, and explicitly extended switches cannot cross this boundary. Content that is already expressed in the dictionary can be replicated in the dictionary, and no replication protocol can be created. Old files and unknown fields must be retrievable and not migrate user content in bulk. Nine groups of complement blocks are enabled by default; image headings are replaced with Pandoc, and the old instructions and the Lab barrier are no longer used as the activity grammar. [Rectification list](../audits/CUSTOM-SYNTAX-AUDIT-2026-09-23.md)。

2026-09-22. Notdown is the project's own Markdown dialect, reusing a single ProseMirror document with existing codec; not Notion, Siyuan or other upstream full fork.

<a id="已接通的内容"></a>

## Integrated content

Notdown preserves existing Notion text, lists, to-dos, quotes, dividers, folds, columns, Callout, page references, media, tables, TOCs, formulas, mentions, and limited color styles. The project's nine categories of Notion supplementary block extensions are still turned on by default.

In the same text, additionally enabled by default are footnotes, definition lists, line blocks, Div containers, Mermaid/sequence/flow figures, Markdown alerts, hidden comments, file embeddings, pipelines/MultiMarkdown/grid/simple/multiline tables, example lists with fancy lists, HTML, metadata, citations, glossaries, CriticMarkup, as well as superscripts and subscripts, highlighting, emoji, native span, inline comments and various mathematical delimiters. H5/H6 is retained in Notdown; the original `notion-markdown` default is still processed according to the upper limit of H4.

Markdown extensions can also appear within Notion containers. When the outer Callout is modified, folded or divided into columns, the sub-content is saved through the corresponding writer and is not reduced to plain text. XML style wrapping is placed outside Markdown tags such as superscripts and subscripts to prevent spaces in color attributes from destroying rereading. The unmodified text continues to reuse the original text and CRLF; the literal content in unknown XML, unknown attributes, unclosed containers and code fences is retained. Explicit expansion off values ​​take precedence, and files are not migrated when switching dialects.

<a id="语法冲突"></a>

## Syntax conflicts

This is a set of deterministic syntax, and mutually exclusive dialect rules cannot be applied to the same string of characters at the same time:

- The single newline and Tab sublevels of ordinary blocks follow Notion; the Markdown extension container is internally interpreted by its original reader and writer. Use a blank line to clearly separate multi-line content such as a definition list from the next block.
- `[^label]`The default in Notdown is footnote citation; the original Notion citation behavior remains in the `notion-markdown` default.
- Wiki links to `[[target|label]]` by default; reverse interpretation, smart punctuation, literate Haskell, etc. are not mixed in by default.
- Single backslash and double backslash parentheses/square bracket formulas are turned off by default to avoid occupying Markdown escape; `tex_math_single_backslash` and `tex_math_double_backslash` can be explicitly turned on, and the explicit settings are retained. USD formula is still on by default.
- Boundaries between Notion explicit labels and unknown XML take precedence, without global string replacement merging syntax. New full HTML documentation using HTML document chunks.
- This time is not all upstream conformance test certification, nor does it claim that all dialects’ space indentation, punctuation replacement and output control options can take effect at the same time. Existing dedicated presets continue to provide their original behavior.

<a id="-菜单"></a>

## `/` menu

The insertion menu is arranged according to `Notion basic`, `Notion advanced`, `Notion media`, `Notion embeds`, `Notion inline`, `Notion style`, `Markdown blocks` and `Markdown inline`. Empty groups are not displayed. Each item has a registered icon, mainly Lucide, and footnotes use independent `[1]` icons; the search covers names, aliases and categories. The up and down arrow keys move across groups, Enter selects, Esc cancels, the group title will not occupy the selection position. After closing the extension, the corresponding command disappears from the menu.

Added insertion entrances for bold, italics, underline, strikethrough, text color, background color, superscript and subscript, highlighting, emoji, inline formulas and H4 – H6. Style items insert editable sample text, and existing selections can still be modified using the floating format menu. The Notion classification in the menu is a content type classification and does not mean that the local implementation can call all Notion cloud functions.

The menus are classified according to functions: Tabs belongs to Notion advanced, HTML document and Web embed belong to Notion embeds. Footnote belongs to Markdown inline and uses an independent `[1]` icon; insert a reference at the cursor and append the editable definition to the end of the text without interrupting the paragraph. Inline note retains independent entry and dialog icons to represent the in-place storage syntax of `^[正文]`. The underlying footnote definition can still contain multiple blocks, you cannot just keep the reference and lose the definition.

Footnote definitions are uniformly presented in the `Footnotes` area at the end of the text, with only one dividing line; they are numbered and sorted according to the order of first citation in the text, and are numbered for repeated references. Unquoted definitions are retained at the end. Definitions There are no block handles, dragging, block menus or block insertion buttons, and the content can still be edited directly. The editor is rendered with source position anchors and comment areas in the same ProseMirror document, restoring the original positions defined before serialization; display sorting does not overwrite the original Markdown order or footnote identifiers. Source mode continues to display native footnote syntax.

The numbers in the footnote area are displayed as `1. 正文` and `2. 正文`, which are distinguished from the text superscript `[1]`. Multiple paragraphs and codes are aligned to the text column; the `↩` button at the end returns the corresponding reference, and repeated references provide independent entrances such as `↩` / `↩2`. The button can be used through the keyboard, and the cursor returns to the corresponding reference after returning; the button and display number are view decorations and are not written into Markdown or saved as editable text.

<a id="仍未完整覆盖的-notion-能力"></a>

## Notion capabilities not yet fully covered

| Ability | Current limitations |
| --- | --- |
| Database, associated views, dashboards, calendars, timelines, forms, charts | Database objects have not been implemented yet; existing database tags are retained as original text |
| Mentions of people and data sources | Local reference/original text compatibility, Notion workspace member resolution and collaboration notifications are not provided |
| Synced blocks | Local sources, snapshots, CAS releases; no Notion cloud or cross-end sync |
| Button | There is already a local action, which does not contain the complete Notion automation action. |
| AI, meeting minutes | Inherit configured services; not Notion AI service implementation |
| Page fonts, complete style system, collaborative comments, permissions | Not considered full support due to new format menu |
| External embedding and previewing | Inherit existing providers and sandbox restrictions, not guaranteed to be embeddable on every platform |

Notion's API itself is also not equal to its entire UI block. Check sources: [ Block API ](https://developers.notion.com/reference/block), [ Rich text ](https://developers.notion.com/reference/rich-text), [ Writing and editing ](https://www.notion.com/help/writing-and-editing-basics).

The text is still `vault/pages/*.md`, and the page attribute is still YAML; saving still takes `createVault`, `baseRevision` and the revertable conflict branch. The test uses a temporary vault and does not write to the user's `vault/` or MyBase main library.
