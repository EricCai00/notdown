<a id="markdown-正文格式-v04方言配置与-notion-enhanced-markdown"></a>

# Markdown body format v0.4: dialect configuration and Notion Enhanced Markdown

**English** · [简体中文](FORMAT.zh-CN.md)

2026-10-27 official carrier convergence: Notdown newly created and edited Web embed/ bookmarks use official source and title text; Tabs titles are written as text, and event page tags are not written; meeting titles, notes, and transcriptions use official partitions, and audio/language are unified into existing meeting-config; effective old column widths are unified into ratio percentages, and dates and times that can be verified without loss are unified into official columns. Collapsed open is no longer written as text state. The unknown original text remains recoverable; this time the user explicitly authorized the migration of Default and Notion test, and other libraries will not be automatically migrated. For reserved items and reasons that cannot be expressed in official form, see [ Custom Extension Description ](reference/NOTDOWN-EXTENSIONS.md). This revision covers the conflicting historical writing below.

<a id="notion-markdown-版本"></a>

## Notion Markdown versions

New Notion API import explicit save `syntax.notionVersion: "v2"`, use the official [Notion-flavored Markdown](https://developers.notion.com/guides/data-apis/notion-flavored-markdown) ofCommonMark/GFM Official, unified container and inline label.API header The version withMarkdown ofv2 Parameters independent. Old unmarked files are not converted in bulk using the original reading method.

v2 is saved using the corresponding syntax of `source` media attributes, hyphenated sync block/directory labels, `mention` / `date`, Meeting notes partitions, etc.; retains unedited raw bytes and unknown attributes. Mail is an editable text, and Custom block is a clear reference node with external integration. Notdown's template buttons, breadcrumbs, and local synchronization of ID are still supplementary syntaxes, and official `notion-markdown` does not enable them due to switches. For import recovery, attachment saving and unimplemented cloud capabilities, see [ Notion Import ](features/NOTION-IMPORT.md). Historical Enhanced Markdown/MCP records below for compatibility with older files.

2026-09-27 table column width: Notdown's Markdown table support `: {tbl-colwidths="[30,70]"}`, using a table attribute container for Pandoc and an explicit relative column width array for Quarto, sourced from [Quarto Column Widths](https://quarto.org/docs/authoring/tables.html#column-widths). The length of the array must be equal to the number of logical columns, and each item must be a finite positive number; it is presented proportionally, normalized to a percentage after dragging and saved to the text. Only if Notdown's `table_attributes` This attribute is newly written when enabled; the official Notion table still uses the native `<col width>`. MMD's `[题注][ID]`, caption position, merged cells and unknown attributes are retained. When attributes are placed in independent rows, empty captions will not be created or the original captions will be overwritten. The original text of the unmodified content is retained; illegal, quantity mismatch and `auto`/Boolean values are currently only retained in the original text, and column width layout semantics are not given. The effective column width array is synchronized when adding, deleting, copying, moving columns, and dragging rows and columns; files are not migrated in batches, and other dialects such as pure MMD/GFM do not add this extended semantics.

2026-09-27 embedded entrance distinction revision (covering the description below "The independent HTML insertion entrance has been removed"): HTML embed New Use Official `<embed src="assets/…html">说明</embed>`, only select HTML files for uploading and replacement; use Web embed for new creation `<web-embed url="…"/>`, only accepts HTTP (S) URLs. Both share node types but retain their respective representations. Notdown can be HTML `<embed>` Supplementary to title/width/height/align; these attributes are only enabled in Notdown, official notion-markdown retains the original source code without giving layout semantics when encountering extended attributes. There is already a HTML attachment `<web-embed>` Do not migrate in batches and continue to write back to the original carrier. old inline body `<html-embed>` Not restored.

2026-09-27 embedded display revision: Notdown `<web-embed>` adds optional `caption`, `width`, `height`, `align`, and continues the existing XML attribute encoding; width is pixels or percentages, height is pixels, and align is left/center/right. The title `title` is used for the HTML file name, and the original file name is filled in when uploading. Attributes and unknown fields are retained, and existing pages will not be rewritten in batches. The description of the official `<embed>` is still written in the label body, and no new layout attributes are added; the adjustment of Typora and `<iframe>` only writes the native width/height. Interactive activation, menu, and full screen are all temporary view states. Markdown is not written and sandbox permissions are not changed.

2026-09-27 AI block: Notdown-specific `<ai-block>` follows the prompt/model attribute and adds optional generate, using, context, and search configurations. context and prompt mention reusing the existing mention-page/user/date syntax and saving it as XML escaped attribute text; unknown fields and old text are retained. Official notion-markdown is not enabled. See [ AI block contract ](features/AI-BLOCKS.md) for details.

2026-09-27 MCP specification revision: Official boundaries include public web pages and explicit syntax for `notion://docs/enhanced-markdown-spec`. Notdown / Notion Markdown simultaneously supports title first line Tabs, partition Meeting notes, HTML attachment `<embed>`, Folder/Database reference, Agent mention, table col width, date endTime, synchronization notice, as well as two types of dollar in-line formulas, code within br, compressed URL reference. The old "Agent/Database removed" and "Tabs local only" records below are replaced by this revision. [ complete syntax and implementation boundaries ](reference/NOTION-MCP-SYNTAX.md).

2026-09-27 embed file revision (overwrites old HTML embed instructions below): Cancel `<html-embed>` Labels and independent HTML are inserted into the entrance and used uniformly. `<web-embed url="…"/>`. Uploaded/drag-and-drop HTML passed `createVault.uploadAsset` save to `vault/assets/*.html`, the text only writes `assets/…html` Quoted, not inline code. Local attachment preview disables scripts and same-origin permissions; HTTP (S) preview maintains the remote sandbox policy. Typora `<iframe>` and official Notion `<embed>` Keep native encoding; customize `web-embed` Notdown only. Existing files can be executed explicitly `node --import tsx scripts/migrate-html-embeds.ts <vault-directory> --apply`: The old text is extracted to the attachment, and the page is `baseRevision` Update and save history, conflicts keep branches and don't force retries; skip code fences, indented code and unknown original HTML containers, stop on exception boundaries. Unknown attributes reserved, old `url` If the attributes conflict with the new attachment reference, they will be transferred. `data-html-embed-url`(Duplicate name added `-original`). No runtime compatibility is provided for old tags; old tags that have not been migrated are processed as ordinary unknown source code. HTML relative resources and Notion HTML file downloads are not yet implemented.

2026-09-27 page entrance correction: official `<page url="…">标题</page>` directly parsed as `block.child_page`; Notdown exclusive `<page-link url="…">标题</page-link>` parsed as `block.link_to_page`, there is no confusion even if both point to the same direct subpage. Parent-child relationships no longer determine block types, and parsing does not create or move resources.`<mention-page>` Keep mentions within the line. official `notion-markdown` Not enabled `page-link`, explicit switches cannot cross the boundary; the original `<unknown>` Reserved, URL guesses the destination page without its source block. old `role` The user file is not transferred in bulk, as an unknown attribute is reserved.Notdown Imported by pressBlock API The real type of recovery supportedunknown The whole block is raw.Markdown andJSON The documentary is also available for download.[Import instructions](features/NOTION-IMPORT.md)。

2026-09-26 inline footnote: When `inline_notes` is enabled, Pandoc `^[…]` is projected as a numbered reference and a single paragraph bottom comment in the page view, sharing numbering, preview and jump with `[^id]`; saving `^[…]` still restores the original position. Cross-line text and inline links are parsed; page editors refuse to expand into multiple paragraphs or blocks. `inlineNote` and the generated reference identifier are only used for resumable editor projections and are not written to the file; dialect boundaries and existing original text retention rules remain unchanged. See [ footnote ](features/FOOTNOTES.md) for details.

2026-09-26 image interaction: Use Markdown images and existing curly brace attribute carriers, and reuse `width` for width. Notdown supplements `align="left|center|right"` and `crop="x,y,w,h,ratio"` for picture blocks; the first four items are the normalized cropping rectangle relative to the original image, and the fifth item is the aspect ratio of the original image. Cropping only changes the rendering and does not create or overwrite attachments. Only `notdown` and `link_attributes` can write these layout properties through the toolbar when enabled. Other dialects do not activate the alignment/cropping supplementary semantics; `notion-markdown` does not add these syntaxes even if the extension is explicitly enabled. The original text, picture URL/title, unknown attributes and code fences are not modified; adjustments are saved through document transactions and existing CAS links, and are not migrated in batches. See [ picture control ](features/INLINE-OBJECTS.md#image-controls) for details.

2026-09-25 Quarto: Added `syntax.variant: quarto`; Notdown also recognizes Quarto's `{python}`, `{julia}`, `{ojs}` executable fences and `` `{language} expression` `` inline expressions, using `block.executable_chunk`/`inline.executable_expression` respectively. R shares the same executable blocks and inline expression nodes with these languages, continuing to use the existing R executor. The `#|` / `//|` options and unknown syntax are retained in the original text, and ordinary language fences do not operate. Python/Julia via Jupyter kernel , OJS use the isolated Observable reactive module; all results are window temporary state. `.md` is still saved, `.qmd` import is supported, old files are not migrated, and YAML is not injected into the text. See [ Quarto ](features/QUARTO.md) for dialect scope, dependencies, and unimplemented publishing features.

2026-09-25 R Markdown: `syntax.variant: rmarkdown` reuses Pandoc Markdown rules. knitr `{r ...}` and inline R are parsed into unified `block.executable_chunk`/`inline.executable_expression` types respectively. The original Markdown syntax and unknown options are retained, and both are highlighted by R. Inline expressions are editable `text*` content, and the original text attribute is only used to preserve unmodified delimiters and whitespace; serialization uses the current expression text. Explicit runs using native R/knitr/rmarkdown , Notebook output, and Knit read-only results are not written back to text or metadata ; returning to editing restores the original code. Importing `.Rmd` automatically selects this dialect. See [ R Markdown ](features/R-MARKDOWN.md) for details.

2026-09-24 stores revisions (covering the historical description of applying YAML below): complete `pages/*.md` is API body and source code mode content; common page attributes are centrally stored in `vault/metadata.json`. The old application YAML is moved to unified JSON through an explicit migration process. A complete backup is performed first and then the application header is removed; the following text remains the original bytes. The document's own YAML/Pandoc title block continues to override the JSON default, and YAML is no longer generated or hidden from the application. Version, history, conflict and interrupt recovery cover both Markdown and the corresponding metadata. See [ Vault metadata contract ](features/VAULT-METADATA.md) for details.

2026-09-24 references are unified: page mentions, Wiki and Markdown internal links are unified into Internal link; the menu distinguishes page links and location links. Preserve original encoding and explicit tags, position override title, Obsidian block/list item ID and anchor. The official Notion dialect still does not parse Wiki / ID blocks. See [ page and location link ](features/INTERNAL-REFERENCES.md) for details.

2026-09-24 inline object revision: Citation, Abbreviation, Glossary, Metadata variable and CriticMarkup addition, deletion and replacement provide dialect-controlled insertion entry, reuse the original code, and do not add new product block types. MMD exclusive syntax is only available in MultiMarkdown and Notdown; Pandoc citations and PHP abbreviations are restricted by their respective reader boundaries and explicit switches cannot be bypassed. Notdown default collection has been extended. MMD The bibliography and footnotes are numbered separately, and the original citation keys and unused definitions are retained; the original coding is used for captions and tables. See [ Local Object Contract ](features/INLINE-OBJECTS.md) for details.

2026-09-24 Obsidian default value description: `syntax.variant: obsidian` does not enable the Notion extension by default, but still provides supported optional extension switches, and explicit configuration and old aliases continue to take effect. Notdown-specific supplementary coding and existing dialect boundaries remain unchanged. The existing source code and configuration are retained, and user content will not be migrated.

2026-09-24 Notion Boundary Revision: Official `notion-markdown` Images are only parsed in standalone media paragraphs; image syntax in paragraphs, titles, list top rows, span and table rich text, and angle bracket/bare URL automatic links are not enabled. Ordinary `[text](URL)`(contains the fragment target) and `<mention-page>` Reserved; the source code of Wiki will not be interpreted and the title slug will not be generated. Ordinary title sub-blocks are no longer silently converted to toggle; ordered tasks, wavy line fences,`<th>`, pictures title and small-caps/native span retain the source code.`[^URL]` Only to identify the bandscheme ofURL I'm not going to quote`[^label]` Treat as reference URL; references follow `notion_mentions` switch. See details[This round of audit](audits/NOTION-BOUNDARY-2026-09-24.md)。

2026-09-23 Raw Source classification: When `raw_attribute` is turned on, block-level `{=html}` and bare HTML share the HTML block object and preview/source code editing, and the line corresponds to Inline HTML; other formats (including `latex`, `openxml`, MMD `*`) and existing raw TeX are classified into Unsupported, retaining the complete source code, format mark and original position, and not executing or converting the target format. An independent grammar carrier is retained internally to maintain the original encoding, and the unmodified text will not be migrated. `raw_html` and `raw_attribute` still control the corresponding syntax respectively; the boundaries of official `notion-markdown` remain unchanged.

2026-09-23 code block interaction: page code block provides language search/switching, copy and `Wrap code` Display switch. Line breaks only change the view, no line breaks are inserted, and Markdown is not changed. The code block of Notion Block API has caption, but the official Enhanced Markdown code fence only defines language and text, and does not define caption encoding.`syntax.variant: notdown` and enable existing `fenced_code_attributes` When , a single line of plain text caption reuses the Pandoc fence attribute, such as `` ```python {caption="说明"} ``;Other fence attributes and original text are retained.`notion-markdown` Do not rewrite or interpret this attribute. If you encounter a fence with caption, keep the source code that can be restored; the page menu prompts to switch to Notdown. Other Markdown dialects are only available in their `fenced_code_attributes` Edit when in effectcaption。localcaption It's not equal toNotion API The rich textcaption，The cloud-free back and forth commitment.

2026-09-23 footnote shows: The file syntax of `[^id]` and `[^id]: 正文` remains unchanged. The page displays the definitions in a concentrated area at the end of the text after a horizontal line. They are numbered in the order of first citation, and the reuse number is used for repeated references. The existing unreferenced definitions during import are retained; the original ID, the original position of the definition and the unknown content are not rewritten due to display sorting. `footnote_anchor` / `footnote_section` / `footnoteKey` only render information to the editor, restore before serialization, do not write to Markdown or YAML. The definition is editable, not as a draggable independent page block. Deleting the last reference during page editing simultaneously deletes its definition and can be undone; source code editing does not automatically clean up the definition. When inserting, fill in the text or reuse the existing definition, and the reference will be suspended to display the text. Footnotes support Markdown multi-block content enabled by the current dialect, and the menu does not provide product containers or nested footnotes; see [ footnote instructions for specification sources and test boundaries in ](features/FOOTNOTES.md).

2026-09-23 The final border (which covers the following historical information):Notdown The collection is already availableMarkdown Dialogues andNotion。Customized grammar for complementary official languages onlyEnhanced Markdown UnsupportedNotion block、Alreadyblock The properties ofinline andstyle，And it's only in`syntax.variant: notdown` enable;`notion-markdown` Only the syntax defined by the official documentation is enabled, explicit extension switches cannot cross this boundary. The dialect can be reused with content expressed in the existing dialect, but no duplicate protocols can be created. Old files and unknown fields must be retained recoverably and user content is not migrated in bulk. `local_figure` Removed, only the original text of the old custom instructions remains; the Lab dedicated fence has been deactivated. Date reminder/format, column width, folding open, and local synchronization parameters are supplementary attributes exclusive to Notdown and are not explained or newly written by official variant. Official dates use start/end/startTime/timeZone. Complex tables use existing Pandoc grid table. See details [Rectification list](audits/CUSTOM-SYNTAX-AUDIT-2026-09-23.md)。

2026-09-23 People: Local contacts use independent `people/<uuid>.yaml`; the text follows `<mention-user url="person://<uuid>">后备姓名</mention-user>`, and `person://` is the local identity of Notdown, which is not equivalent to Notion user's `user://`. The name change does not rewrite the text in batches, the editor displays the current name according to stable ID, and the backup name is retained when the offline export/contact file is missing; delete the setting `deleted: true`, and existing references and contact files can be restored. Contact updates, deletions, and restores are done via `createVault.people` using `baseRevision`, history and conflicts are saved in `.history/people/`, and unknown YAML fields and comments are retained. Code fences, unknown mention attributes, and existing external user references maintain the original rules; see [ People ](features/PEOPLE.md) for details.

2026-09-22 content collection revision:`syntax.variant: notdown` inNotion Structural border access projects already in placeMarkdown The content expanded.H5/H6 The following:`notion-markdown` unchanged.`[^label]` In Notdown, it is referenced as a footnote by default, and the mixed sub-blocks in the container are written back through their respective encodings; unknown attributes and the original text are retained. Default content expansion, syntax precedence, and service boundaries see [Notdown content collection](reference/NOTDOWN-SUPERSET.md). This article covers the historical explanation below that equates Notdown to the original Notion codec capability range.

2026-09-22 The page metadata shows:Properties Folding zones with icons and abstractionsYAML The properties and the original initials have been identifiedYAML / MultiMarkdown metadata、Pandoc title block，Click directly to open the high-light code editor. The source code submits the unique data boundary to the calendar and acts as a revocable transaction; the original node remains the same.ProseMirror The documentation, source code order and storage of the carrier remain unchanged.Pandoc title With the outer pagetitle Double-directional linking, editing page titles only change the first field of the block, retaining the author, date and font; inconsistent pages are already valid as non-emptyPandoc title The CommissionCAS Updated page title.YAML / MMD of the same nametitle、All of them.author The same fields are not matched.`icon`, an empty string means removal; continue writing on the cover `properties.cover`, no new text tag is added.

2026-09-23 cover gallery and location: Built-in Gallery chooses to use the stable `/page-covers/<文件名>` path, and uploading covers continues to use the `assets/` path of the current vault; external HTTP (S) image addresses are still available. Write page YAML to `properties.coverPosition` in the vertical position, which is a number from 0 to 100. The default position is centered according to 50; clear the old position when changing the cover. Both are page attributes and have nothing to do with the Markdown dialect of the body; the old cover address, unknown YAML field and body remain intact, and `baseRevision` is still used for saving.

2026-09-22 date interactive revision (2026-10-26 supplements the independent time field): continue to use `<mention-date start="YYYY-MM-DD" end="…"/>`; `<mention-date/>` is a clickable date empty state. When including time, use the original ISO date and time and UTC offset, or the official independent date/time field (v2 to `<date start="…" start-time="…" time-zone="IANA_TZ"/>`); edit to retain the original carrier. `reminder` follows the absolute ISO time of the local reminder; the local optional `reminder-offset` (the number of minutes ahead of start, if there is no time, the 09:00 of the day is used as the basis), `date-format` (relative/full/iso/us/eu), `time-format` (12/24) and `time-zone` (local, Z, fixed offset or IANA name). The `timeZone` of the independent date field follows the official time zone carrier and does not write a duplicate time zone attribute. Set the date/time/time zone change recalculation reminder after the offset. It will be parsed according to the time zone rules of the date. The local time skipped by daylight saving time will not be accepted. Select the first time for the repeat time. Imported stand-alone reminder times are retained as is until the user selects a relative reminder. The relative date display is dynamically calculated based on start, and Today is not written as the actual date; the original label text and unknown attributes are retained, and unedited dates are not migrated. The reminder and persistence format options are only enabled in Notdown; the official dialect format only takes effect in the view session and does not fully implement the date encoding or notification service of Notion.

2026-09-22 embedded revision: HTML documents continue to use `<html-embed>`, `&`, `<`, and `>` in the text are escaped as XML, and HTML containing code fences are still read as text; `<html-embed/>` represents an empty block to be input. Added local `<web-embed url="https://example.com" title="…"/>`, `<web-embed/>` represents the link to be filled in, is a `local_web_embed` extension, is only available in Notdown and is enabled by default. Both retain unknown attributes; HTML uploads and reads the file content and writes it into the body, without copying its relative path resources. HTML uses sandbox iframe with scripts disabled; Web only previews HTTP (S) URL, prohibiting same-origin permissions. Existing Typora `<iframe>` will retain the original carrier and unknown attributes and will not be converted into a new label. Edits are saved via a ProseMirror transaction with an existing CAS , without writing cached blocks to JSON .

2026-09-22 Button revision:`local_button` of local `<button>` Tag added `icon`、`variant` and XML escaped JSON `actions`; old `action/target` and unknown fields are retained, and the text will not be migrated in batches. Execution is prohibited if the template boundary is not closed, and text changes will still go through a single undoable transaction and page CAS. It is not the official automated coding of Notion, please see [Button local contract](reference/LOCAL-OBJECTS.md#button)。

2026-09-22 dialect boundary correction: Add `syntax.variant: notdown`, follow the syntax of Notion-flavored Markdown and `bodyFormat: notion-markdown`, and enable all ten types of Notdown block extensions by default; explicitly turning off the value still takes precedence. Upstream dialects still define defaults per their respective specifications, and these project blocks are turned off by default. `local_*` is only retained as a compatible key for existing configurations, and the interface is renamed Notdown blocks. Selecting a dialect or switch does not rewrite the text; old content, unknown fields, and unknown configurations are retained. For details, see [ dialect verification and expansion instructions ](reference/DIALECT-CONFORMANCE.md); if the historical explanation below conflicts with it, this revision shall prevail.

2026-09-21 metadata revision: MMD metadata and YAML front matter are classified into one product object, and each retains the encoding rules. MMD uses top-level ASCII keys and plain text values, keys ignore case/spaces, supports optional delimiters and multi-line values; does not follow full YAML conversion type. Text metadata does not cover page YAML . Database reference objects and special nodes have been removed, and existing labels have been retained in the original Unsupported text. For detailed rules and other extra-table formats, see [ Metadata and Compatible Format Description ](architecture/METADATA-AND-COMPATIBILITY.md).

2026-09-22 directory and configuration supplement: 12 and `notdown_*` keys have been changed to `notion_*`; the old keys are compatible with reading, and when the old and new coexist, the new keys take precedence, and the unknown keys are retained. After the configuration is edited, the standard key will be written, the vault will not be rewritten in batches, and the dialect default value will remain unchanged. Block Explorer's object/dialect/extension bidirectional link, 103 Markdown extensions have local execution paths, 12 Outside Markdown scope items come last. For details, see [ classification and naming instructions ](reference/CATALOG-RELATIONS.md).

2026-09-21 object layer supplement: Callout and Alert are shared `callout`, shared by three TOC writing methods `table_of_contents`. Encoding source remains in editor properties `syntaxForm`, TOC range is used `minLevel/maxLevel`;These are not new page YAML fields or independent persistent formats. The original code will be used when editing the original block, and the unmodified original text will remain unchanged.`alerts/notion_callouts` and `toc_directives/notion_toc` The newly created code is still controlled separately by the corresponding writing, without being replaced by a node merger.Callout In supportalerts of non-Notion Dialogues use prompts and other available situations use original labels. See complete object boundaries[Object Roadmap](architecture/CONTENT-OBJECT-ROADMAP.md)。

The new page uses [ Enhanced Markdown ](https://developers.notion.com/guides/data-apis/enhanced-markdown) by default, and the behavior also refers to [ Working with markdown content ](https://developers.notion.com/guides/data-apis/working-with-markdown-content). Notion format check date: 2026-09-12. This is the format of Notion Markdown API, which is different from the interface "Markdown & CSV" ZIP export. 2026-09-15 adds optional `syntax` configuration; the block syntax description below applies to the Notion dialect. For other native dialects and extensions, see [ Edit Core Design ](architecture/MARKDOWN-ENGINE.md).

The original objects of the Notion dialect use corresponding official labels; the newly added Tabs, AI block, etc. have local codes, and they cannot all be regarded as Notion official syntax. See [ local objects and services ](reference/LOCAL-OBJECTS.md). [ Old syntax ](reference/FORMAT-LEGACY.md) remains compatible with reading. CommonMark/GFM Use `:::nest` to represent the normal block hierarchy when hierarchy extensions are enabled. Among Notion, `[[...]]` can be entered as mentioned in the page, and `<mention-page>` can be used after modification; CommonMark/GFM can independently enable dual chains.

<a id="文件和迁移"></a>

## Files and migration

Web bookmarks continue to be used locally `<bookmark url="https://example.com" title="Title" description="Description" icon="https://example.com/favicon.ico" image="" caption=""/>` Code, empty as `<bookmark/>`。`icon` The following is a list of selected website iconsURL；Create/manually refresh the resulting headings, descriptions, icons and images by saving them with the same updates in the original, not as a backup backup.Markdown。The unknown attribute and unmodified original remain, and the identical label in the code fence does not explain the bookmark.`local_bookmark` Expanded switching control, not the official Notion Enhanced Markdown label.

The page is from UTF-8. `vault/pages/<uuid>.md`，YAML The following is a list of the most commonly used words in the English language:

```yaml
---
id: 550e8400-e29b-41d4-a716-446655440000
title: 示例页面
parent: null
icon: 📄
bodyFormat: notion-markdown
syntax:
  version: 1
  variant: notion-markdown
  extensions: {}
properties:
  status: 草稿
---
```

Notion specification definition body; page stable ID, unique parent page and MyBase attributes continue to be placed in YAML and are not mixed into the body. Meta information modification preserves unknown YAML fields and comments.

Sidebar actions use the optional Boolean fields `favorite` (Favorite) and `trashed` (Recycle Bin), both defaulting to false. The recycle bin only updates the metadata of the target page, and the original Markdown file is retained; the normal page list hides the page and its descendants. After the parent page is restored, the descendants are redisplayed, and the subpages that enter the recycle bin alone still need to be restored. The copy uses the new UUID, retains the body, syntax, attributes and unknown YAML fields, resets the collection/recycle bin status, and does not recursively copy subpages or rewrite page references in the body. All modifications still require `baseRevision`.

New page default `bodyFormat: notion-markdown`. No `syntax` of `markdown` The page uses CommonMark and other features need to be explicitly activated; single line breaks continue to belong to the same paragraph.**Opening source code or editing old pages is no longer automatically converted to Notion.** Simply switching views does not modify the text or meta information; the first actual edit will record the derived configuration.

`syntax.version: 1`Mark the configuration structure of this generation; `variant` selects the default rule, and the Boolean field of `extensions` overrides the default value. It is known that all eleven dialects have been connected to native parsing, and only Pandoc Markdown, CommonMark X and Legacy GitHub use the Pandoc 3.11 snapshot default value by default. `notion-markdown` corresponds to `bodyFormat: notion-markdown`, and other dialects correspond to `markdown`. The configuration change must carry the complete text and go through the same CAS; the text can remain unchanged verbatim. Unknown configuration fields and unknown/pending extension switches are reserved, the latter is not currently implemented. API can submit `syntax: null` to remove this field and restore the default configuration corresponding to `bodyFormat`, but the text must still be carried.

Switching dialects reinterprets the same bytes, possibly changing block boundaries; it does not automatically translate one syntax into another. History and conflict branches retain their own format, configuration, and text. Use the original text block to fallback when turning off the block expansion containing content; continue editing in the source view, and re-parse and restore after turning on the expansion. Compound blocks containing turned off features are now rolled back in their entirety to preserve recoverable content.

The optional string `sidebarOrder` saves the sidebar sibling order, and the value is a position key composed of decimal numbers (not a numerical value). Combined with stable ID to form a definite order when reading; stable ID ordering is used by default. Dragging only updates the `parent` and position keys of the moved page, and does not rewrite sibling pages or text in batches; when moving the entire subtree, the parent relationship and files of the descendants remain unchanged. Source or target region version changes will retain conflicting branches without forcing retries. Dragging to Trash is still only the application recycle bin and does not directly call the system recycle bin.

<a id="markdown-方言补充块"></a>

## Additional blocks for Markdown dialects

`alerts` Expand and retain the existing foundation of each dialect `> [!NOTE]` Support. follow closely `]` of `+`(expanded by default),`-`(collapsed by default) and peer custom titles belong to Obsidian callout syntax, only `obsidian` compatible with it `notdown` Collection dialects are accepted; other dialects are enabled even if explicitly enabled `alerts`, these writing methods will not be recognized as prompt blocks, and they will be processed as ordinary references and the original text will be retained. The default value of the dialect remains unchanged, and no independent plug-ins are added.

Notdown's **GitHub-style Alert** insert directly `> [!NOTE]`, the insert form is not displayed. The icon menu displays the icon, color and name of the type. You can change the type and enable or cancel Collapsible at any time; the title can be edited directly. The hollow arrow after the title means to collapse to the right and to expand when going down. Changing the type preserves the title, body, and collapsed state.`Callout` The entrance is still written `<callout>`, the two encodings share internal nodes but do not convert each other. Obsidian and Notdown support all 27 built-in keywords and aliases (ignoring case), other alerts-enabled dialects only recognize the five standard capitalization types. The five standard types of Notdown continue to use GitHub Octicons and color matching, and the new types use Obsidian official icons and light theme colors; Obsidian dialects all use Obsidian color matching. Custom titles are displayed as plain text, unknown types retain their original names and use Note appearance. internal `alertStyle` Derived from the dialect, no new body or YAML fields are introduced.

`raw_html`Display the preview of HTML and retain the original text of the label; `definition_lists`, `footnotes`, `line_blocks`, and `fenced_divs` enable definition lists, footnotes, line-by-line layout, and Markdown containers respectively. HTML is enabled by default in ten Markdown presets, and other rules take default values ​​according to dialects. For details, see the support matrix. HTML only executes allowed display rules; Div retains unknown attributes and displays allowed class, anchor points and restricted sizes. These five independent switches are not yet available in Notion codec.

The YAML, Pandoc, `%` title and MultiMarkdown key-value title blocks at the beginning of the text are identified according to the corresponding extensions, and the original text is retained; when metadata_values is enabled, preview, field and source code editing are provided, and MMD metadata_variables can take the value in the text. It is not interpreted as a page attribute and does not overwrite the vault YAML in the outer layer of the file. For additional syntax of Typora/Obsidian and products, see [ PRODUCT-SYNTAX.md ](reference/PRODUCT-SYNTAX.md). Pandoc three-field headers support line continuation; arbitrary position metadata and all upstream output control semantics are not in the local edit contract. Strict new/modified code blocks are written as indented code by default; PHP Extra supports backticks and tilde fences. When the original block is not modified, the original writing method is retained. After modification, only the semantics within the currently implemented syntax range are guaranteed; indented code cannot express language attributes.

For syntax examples, default values for each dialect of Pandoc, editing methods, and remaining gaps, see [ Block Types and Implementation Boundaries ](reference/BLOCKS.md). The following sections continue the description of Notion Enhanced Markdown.

<a id="块层级与换行"></a>

## Blocks, hierarchy and line breaks

The following indentation is for actual Tab ( U+0009 ), not four spaces:

```md
父块第一行<br>父块第二行
子块
孙块
另一个顶层块
<empty-block/>

- 列表父项
  - [ ] 子待办<br>同一任务的第二行
        普通文本子块

## 可折叠标题 {toggle="true"}

    标题的子块

> 引用第一行<br>同一引用的第二行
> 另一个引用块
```

During parsing, a single newline is still accepted to separate ordinary blocks. Blank lines are only used for source code typesetting and no additional empty blocks are generated. Edit writeback retains the existing top-level block spacing (including continuous blank lines, leading and trailing blanks, and CRLF). By default, at least one blank line is left at the boundary of new or rewritten blocks; original compact blocks that have not been modified are not rearranged in batches. When the composite container is rewritten internally, a blank line is left between sibling blocks, a single line break is still used between list items, and Tab is continued at the parent-child level; multiple whitespaces within the modified composite block may be normalized. Blank lines inside code fences maintain literal content. `<br>` corresponds to `Shift+Enter`; `<empty-block/>` retains an editable empty block and can also be used as an empty parent block. Normal Markdown does not have parent-child semantics for arbitrary text blocks, and the universal renderer will not directly restore this tree.

Each list item is edited independently, and the parent item is dragged to carry the subtree, and the subitems can be moved individually. The title uses H1 – H4 according to the official specifications, and H5/H6 is converted to H4; the title with sub-blocks uses `{toggle="true"}`. Code is fenced and internal Tab s, labels and old directives remain literal.

<a id="分栏页面和附件"></a>

## Columns, pages and attachments

```md
<columns>
	<column>
		左栏内容
	</column>
	<column>
		右栏内容
	</column>
</columns>
<page url="#page/页面ID">子页面名称</page>
相关内容见 <mention-page url="#page/页面ID">页面名称</mention-page>。
![图片说明](assets/picture.png)
<audio src="assets/recording.mp3">录音</audio>
<video src="assets/demo.mp4">演示</video>
<file src="assets/archive.zip">附件</file>
<pdf src="assets/paper.pdf">论文</pdf>
```

Inline is also supported when native Link preview extension is enabled `<mention-link url="https://github.com/owner/repo/issues/1">后备名称</mention-link>` and block level `<link-preview url="…"/>`. They belong to Notdown local encoding, real-time external content is not written to Markdown; see for details [Link Preview](features/LINK-PREVIEWS.md)。

The insert menu provides two columns, and the analysis accepts more than two columns and nested columns; the narrow screen is arranged vertically. The separator line between columns can be adjusted by dragging the mouse. Only two adjacent columns will be changed. Release and submit an undoable transaction. Esc Cancel, double-click to restore the same width of the group. After focusing on the separator line, fine-tune the left and right arrow keys. In wide screens, the column width changes proportionally with the container. In narrow screens, the width adjustment controls are hidden but the proportion is retained.

2026-09-27 column width revision: Notion official MCP `notion://docs/enhanced-markdown-spec`(via official `fetch` Get) is defined `<column ratio="50">`，`ratio` It is a percentage of the total width. When omitted, it defaults to equal width. All columns should be explicitly set when updating.[PublicREST The documentationColumns Examples](https://developers.notion.com/guides/data-apis/enhanced-markdown#columns) This attribute has not yet been displayed on that day; here we provide additional support based on the MCP specification and do not claim to have verified cloud writeback.

`notion-markdown` with `notdown` All use official `<column ratio="35">`. When adjusting the width, write all columns uniformly `ratio`, the sum is 100 (four decimal places for percentages, equivalent to six decimal places for proportions). Complete and valid values are displayed normalized to the sum; missing, non-numeric, non-finite or absent `(0,100)` When inside, the entire group is displayed with equal width, and the original value is retained until the user actively adjusts the width. Unknown attributes and uncorrected text are retained; HTML preview/export uses the same scale.

The old `<column width-ratio="0.35">` can only be read compatible with Notdown, the value range is `(0,1)`, and is no longer used to write new column widths; when actively adjusting the width, remove this set of old attributes and write `ratio`. When `ratio` exists in the same group, the official code will be used first and the two units will not be mixed. Unmodified files are not migrated; `notion-markdown` still saves old local attributes as recoverable source code.

`<page>`It is a block-level entry, and `<mention-page>` is an inline reference. `url` uses the existing `#page/<id>` navigation address to represent the local page, and external URL is retained as an external reference. Deleting an entry does not delete the page or overwrite the YAML parent-child relationship. The source code is not expanded when the cursor enters the page link.

Upload generates relative path to assets; audio and video display player, file and PDF provide links. Normal `[文字](URL)` is still a normal link.

<a id="提示折叠格式和公式"></a>

## Callouts, toggles, formatting and equations

`<callout>`Use 💡 when the default `icon` is used; explicit `icon=""` means no icon, which is maintained after editing and reopening. The icon content is saved and displayed as plain text and is not parsed into HTML. The first segment handle in the editor represents the entire Callout, and subsequent blocks remain independent operations.

```md
<callout icon="💡" color="blue_bg">
	提示内容，可以包含 **格式**。
</callout>
<details>
<summary>折叠标题</summary>
	子内容
</details>
<span color="red">重点</span>与<span underline="true">下划线</span>
整块底色 {color="yellow_bg"}
行内公式 $x^2$。
$$
x^2 + y^2 = z^2
$$
```

The prompt block and collapsed content are editable; the formula is rendered by local KaTeX, click to edit LaTeX. Colors only use canonical limited name mapping and do not enforce arbitrary CSS .

<a id="行内双颜色2026-10-27"></a>

### Inline text and background colors (2026-10-27)

The color of Notdown is written in a uniform way using Notion `span color`The common name is:`_bg` The background color is represented by the background color. The two colors use a nested label, without creating any background attributes:

```md
<span color="red"><span color="yellow_bg">红字黄底，可含 **粗体**</span></span>
<span color="blue_bg">仅背景色</span>
```

Colors use `gray / brown / orange / yellow / green / blue / purple / pink / red` and corresponding `_bg` names; no arbitrary CSS or hexadecimal values are implemented. Nested span inherits by channel, and the same channel specified in the inner layer covers the outer layer.

Notdown (including pages not marked v2) and Notion Markdown v2 can set two channels respectively. `Default text` removes only the text color, `Default background` removes only the background color, and `Clear formatting` clears both; the operation can be undone. Notion Markdown v1's menus are still handled according to the original single color capabilities.

The custom text attribute `bg_color` has removed semantic support and does not provide compatible parsing; span containing this attribute is retained according to the literal source code and does not give color semantics. The internal edit model still has a separate background channel field, which is not a body syntax. Does not change block color, table color, or page YAML.

This guarantees the display and saving of local nested tags, which is not equal to Notion. Remote round-trip guarantee: public Rich Text `annotations` only one `color` Enumeration fields, block colors belong to another layer. The text colors in the entire background and lines can be expressed separately; when the real Markdown write-back test is not completed, it is not guaranteed that both colors in the same line can be accepted and returned by Notion.

This time, the active content of Default and Notion test will be migrated according to the explicit authorization of the user. It will be fully backed up first, then converted according to the source code label boundary and written through `createVault.update` and `baseRevision`; code samples and existing imported archives will not be converted. Other vaults are not automatically migrated. See [ migration and current custom writing method audit ](audits/CUSTOM-SYNTAX-AUDIT-2026-10-27.md).

<a id="表格和目录"></a>

## Tables and tables of contents

The standard pipe form,Notion The table labels andMultiMarkdown The table uses the same structuredtable The knot.syntaxForm Only record the source code, corresponding topipe_tables、notdown_tables、mmd_tables The switch.MMD The headings, the groups,colspan/rowspan The key is to keep the lines, the units and thetable_caption In; directly edited and rewrittenMMD。Subject notes on the bottom position and explicit reference tags are retained; the original list in the multi-line unit format, block code retains structure, code insideEnter Write a normal line. Unmodified form continues to copy the original, disable extension does not delete the original. Currently support the unit form./The following is a list of articles related toTab Navigation, not yet added/The first is the separation of the merged unit and the exclusive control.

The bottom layer of the list is divided into bullet_list_item, numbered_list_item, and task_list_item. bullet_list/ordered_list is an internal arrangement structure, and task items can be located in any group; the ordered starting number still belongs to the group. Explicit type conversion changes nodes, dragging and indenting preserve node identity. Heading continues to share nodes, expressing differences in level/toggle attributes.

```md
<table fit-page-width="true" header-row="true" header-column="false">
	<colgroup>
		<col width="160"/>
		<col width="240"/>
	</colgroup>
	<tr>
		<td>名称</td>
		<td>内容<br>第二行</td>
	</tr>
</table>
<table_of_contents/>
```

Cells can edit text, inline formatting, and internal line breaks; Enter/Shift+Enter all generates line breaks and does not create independent paragraph blocks. Slash block insertion or block type conversion is not provided within the cell, and dragging is based on the entire table. Convert block boundaries to internal line breaks when pasting rich text; multi-block Markdown insertions remain as syntax text. Historical multi-segment cells remain readable and the content will not be deleted silently. Tab/Shift+Tab moves between cells, and a new row is added to the last cell Tab. Retain column width and header attributes;`td`、`tr`、`col` on `color` Displayed by cell, row, column priority, editing and HTML export are also preserved. The GFM pipeline table compatible with the official example is modified and written as a XML table. The table of contents is generated from the headings of the same text.

<a id="其他引用与边界"></a>

## Other references and limitations

```md
<database url="https://www.notion.so/database-id" inline="true" icon="📚">资料库</database>
<mention-user url="user://user-id">成员名称</mention-user>
<mention-date start="2026-09-12"/>
<synced_block_reference url="https://www.notion.so/block-id">
内容快照
</synced_block_reference>
<unknown url="https://www.notion.so/block-id" alt="bookmark"/>
```

Support user/page/database/data-source/date/agent mentions. The database block saves references and attributes of existing databases or data sources; local `url="#page/<host-id>"` parses the database through `databaseId` on the entry page, `inline="true"` displays editable tables, and non-inline references open the complete database. The main text still only saves references, the record text is still the page Markdown, and the fields, attribute values ​​and views are saved in the vault metadata.json; remote references do not perform cloud operations. `synced_block` and `synced_block_reference` save local content snapshots and sources, support ontologies without URL and referenced notice, and do not represent Notion cloud linkage.

Notdown locally synchronizes the above tags and `#page/PAGE_ID#block=BLOCK_ID` references; `id`, `source-revision`, `snapshot-hash`, `auto-refresh`, and `auto-sync` are supplementary attributes that are only effective for Notdown. The new copy reference is written as `auto-sync="true"`, and the old files are not migrated. Official `notion-markdown` encounters these properties and retains the entire block text. The source update must carry the captured version, the conflict is suspended and the content of both parties is retained; unopened pages retain the last snapshot. See [ Synchronized Block Functions and Boundaries ](features/SYNCED-BLOCKS.md).

Existing `<unknown>` references are retained and are not automatically inferred from names to bookmarks or other objects. Unknown tags, unclosed or illegal containers retain their original text and are not interpreted as executable HTML. For new local bookmark, link-preview, breadcrumb, meeting-notes and other codes, see [ local objects and services ](reference/LOCAL-OBJECTS.md); conference transcription can use compatible services configured with Settings. The `meeting-config` JSON attribute of the conference card is only enabled in Notdown and saves the language, audio, summary instructions and menu preferences of the current meeting; the official dialect maintains the session configuration and does not write custom attributes. For details, see [ meeting notes ](features/MEETING-NOTES.md). The local People address book has been accessed, but the collaboration members and custom emoji resource directories have not.

Enhanced Markdown retains the original text when not modified; retains the original text when the top-level subtree is not changed after editing, and the changed subtree is serialized according to specifications. The old format conversion normalizes indentation, fences, and separations, and the complete old version is saved in history. Lossless conversion to or from any external format or the entire Notion workspace is not promised.

<a id="共享解析与-ai"></a>

## Shared parsing and AI

The editor, source code, outline, reference map, and HTML export recognize the same `bodyFormat`. HTML export retains columns, prompts, links, colors, tables, and formulas; attachments remain relative paths.

MCP reads the page and returns `bodyFormat`; when writing the page, use the complete text and `baseRevision` when reading. When modifying the format, submit the converted text at the same time, retaining `<unknown>` and other unknown content. For MyBase property contracts see [ MYBASE.md ](reference/MYBASE.md).


2026-09-22 object cleaning: Inline raw source is a formal content object, encoded using Pandoc raw_attribute; File transclusion maps both block-level and inline carriers. The rules for transferring Inline media nodes and ordinary local links to players have been removed; `[录音](assets/voice.mp3)` maintains ordinary links, and the audio and video players use existing block-level media tags. The Existing content section has been removed and user files are not automatically migrated.
