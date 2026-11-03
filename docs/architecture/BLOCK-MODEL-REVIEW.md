<a id="块的语义模型与-notdown-实现对应"></a>

# Block semantics and their Notdown implementation

**English** · [简体中文](BLOCK-MODEL-REVIEW.zh-CN.md)

> This article remains a snapshot of the design discussion for 2026-09-20. The new 2026-09-21 user table has been determined to retain Toggle heading, three types of list items, PDF and other separately identifiable objects; the latest boundary, P0 – P4 local implementation and service execution scope are subject to the [ object Roadmap ](CONTENT-OBJECT-ROADMAP.md) and the code registry. The "recommended merges" and number of old nodes below are not current implementation status.

Check date: 2026-09-20. Based on the 46 block items and 2 metadata block items in the user revision table, as well as the current workspace source code. This article discusses the essence of the content,**The semantic type is not determined by the Markdown writing method, extended switch name or ProseMirror node name.**. Suggested names are design suggestions and do not indicate that the code has been migrated.

2026-09-21 Correction: Three categories of list items have been broken down into three sub-nodes at the user's request;Heading Shared nodes;Table ofMMD The source code carrier has been removed, unified using structured tables and editable query notes.Child structures The sub-structure belonging to the single class,2026-09-22 Both formats have been cleared and removed from the tableExisting content；Inline raw source The document is included in the official list, and the document is introduced to the shared block level and inline location.strong It's a rough one.highlight and bright,mark YesProseMirror The format mechanism is called the "System of Formatting".list_item Common use andsyntax:table The description is historical.

This version of the taxonomy can serve as the basis for semantic models. What needs to be adjusted most is: separating content types, presentation methods, resources from references, and implementation status. The same content can have multiple encoding forms, and can also be temporarily hosted by multiple editor nodes.

<a id="命名和合并原则"></a>

## Naming and consolidation principles

- Specification ID uses `lower_snake_case`; the display name is in natural language. When the field already represents block, there is no need to repeat `_block`.
- `level`, whether to fold, inline/block-level display, numbering method and other attributes; the syntax source and original text are saved as codec/provenance information.
- Merging means sharing semantic types, **does not mean removing the difference field** . For example, the type, title, icon, color, and collapsed state of callout should be preserved.
- The semantic model can be unified while the current ProseMirror node is temporarily separated; there is no need to immediately modify the parser, editor, and serializer for unified naming.
- Resource models and text nodes are modeled separately. `page` is the resource; the reference to it in the text is `page_reference`. Databases and their views also use this distinction.

<a id="对修订表逐项对应"></a>

## Mapping the revised table item by item

Status: **structured** = has dedicated nodes and content/attributes; **source code carrier** = carried through original text, preview, etc., cannot be equivalent to complete structured editing; **reference** = only saves target and display information; **not implemented** = no corresponding dedicated capabilities. There are still existing expansion matrices for the opening conditions of different dialects; this table does not write "not enabled by default" as "not implemented".

`syntax:xxx`Is the abbreviation of `syntax_block.kind = xxx`. The following sequence is consistent with the user revision table.

| # | Username | Suggest semantic names/merges | The current Notdown corresponds to the boundary |
|---|---|---|---|
| 1 | divider | `divider` | Structured: `horizontal_rule`; thematic break may be retained as an alias. |
| 2 | heading | `heading`, attributes `level` | Structural: `heading`; hierarchy does not split types. |
| 3 | code block | `code`, attributes `language` | Structured: `code_block`; represents code text for human reading. |
| 4 | HTML block | `raw_content(format=html)` | `html_block`Belongs to the same semantic family as `syntax:raw(format=html)`; when saving HTML, the preview is subject to cleaning rules. It is not an independent web environment. |
| 5 | paragraph | `paragraph` | Structured: `paragraph`; wrapped by `nested_block` with block sub-content. Packaging is not the new content essence. |
| 6 | table | `table` | Structured `table/table_row/table_cell`, and source code carrier `syntax:table`; the semantics should be unified, but complex MMD tables are currently not equivalent to native table editing capabilities. |
| 7 | quote | `quote` | Structured: `blockquote`; retains quotation semantics and is not merged into callout due to similar appearance. |
| 8 | bullet list item | `list_item`, mark `bullet` | Structured: `bullet_list > list_item`. |
| 9 | numbered list item | `list_item`, mark `ordered` | Structured: `ordered_list > list_item`; the starting number is on the list. |
| 10 | task list item | `list_item`, additional `task_state` | Structured: `list_item.checked`; task status and ordered/unordered can be orthogonal and do not have to become the third mutually exclusive list. |
| 11 | empty block | empty `paragraph` | Implemented: Notion `<empty-block/>` resolves to an empty paragraph. No separate types are required; the source file delimited by blank lines does not therefore become a content object. |
| 12 | math block | `math`，`display=block` | Structured: `equation`; can share mathematical content models with inline `inline_math`. |
| 13 | image block | `image`，`display=block` | `image`Currently it is an inline node, carried by a paragraph; the path with caption is the source code carrier `syntax:figure`. Image capabilities exist, but there is no independent `image_block` node. |
| 14 | diagram | `diagram` | Source code carrier: `syntax:diagram`, saves language and code; not all code fences have graphical semantics. |
| 15 | table of contents | `table_of_contents` | Special `table_of_contents` and source code carrier `syntax:toc` should be unified and retain attributes such as title level range. |
| 16 | link to page | `page_reference`, block-level presentation | Quote: `child_page`; also inline `page_link`. Target models can be shared. |
| 17 | embed web contents | `embed`, sourced from a URL | Source code carrier: `syntax:embed`, iframe preview; not a complete third-party service integration. |
| 18 | HTML embed | `embed`, sourced from an HTML document | Can be combined with the previous item, the source type is recorded separately. The current iframe URL path only covers part of the requirements; there is no dedicated link for Notion HTML file upload/import. |
| 19 | database - inline | `database_reference`/`database_view`, inline page layout | Currently only node `database(inline=true)` is referenced; no database engine or view is implemented. The complete semantics should be divided into resources and views, not database types according to placement. |
| 20 | linked view of data source | `database_view`, with a data source reference | Not implemented. Ordinary `database` links do not contain semantics such as filtering, sorting, and view layout, and cannot be considered equivalent implementations. |
| 21 | button | `button` | The action button model is not implemented. |
| 22 | breadcrumb | `breadcrumb` | No body node; breadcrumbs in app page navigation are not equivalent to insertable body blocks. |
| 23 | video | `video`, in the media family | Structural attributes: `media_block(type=video)`; with playback display. |
| 24 | audio | `audio`, in the media family | Structural attributes: `media_block(type=audio)`; with playback display. |
| 25 | file | `file`, in the attachment family | Structural attributes: `media_block(type=file)`; mainly file links. |
| 26 | web bookmark | `link`，`presentation=bookmark` | There is no dedicated bookmark card model; ordinary links are not equivalent to bookmark cards containing abstracts, covers, etc. |
| 27 | PDF | `file(media_type=application/pdf)` | `media_block(type=pdf)`;The current rendering is a file link, not a full PDF reader. PDF is available as a file subtype and rendering option. |
| 28 | link preview | `link`，`presentation=preview` | No dedicated external preview/parse service model. Links and preview data can be shared with bookmarks, provider and display attributes preserved. |
| 29 | unsupported | `unknown_content` | `unknown_block`Save URL/ to replace the description, and `opaque_block` to save the original text. Unified into a fallback family, but a distinction must be made between "with original text" and "only placeholder references". |
| 30 | callout | `callout` | Structured: `callout` and `alert`; semantics should be merged. alert/admonition can be an alias or subtype, kind/title/icon/color/collapsible is reserved, etc. |
| 31 | page | Resource `page`; used in the text`page_reference` | The application already has a `Page` resource and a parent-child relationship. Editor `child_page` is just a reference; resource ownership and ordinary links must still be distinguished. |
| 32 | database - full page | Resource `database`; body uses reference/view | Currently `database(inline=false)` is a reference only; the resource type can be shared with item 19 and cannot be used to claim that the full database is implemented. |
| 33 | meeting notes | `meeting_notes` | There is no dedicated function; the original text rollback does not mean that the meeting recording/transcription service has been implemented. |
| 34 | toggle | `collapsible_section` | Structured: `toggle_block`, the first paragraph is the summary, and the rest is the content. Represents a universal collapsible section. |
| 35 | toggle heading | `heading`+ Collapse and sub-content attributes | `heading(toggle=true)`, the sub-content is carried by `nested_block`; no independent heading type is required. Shares folding capabilities with generic toggle but retains title semantics. |
| 36 | tabs | `tab_group`, internal `tab` | Private tab structure is not implemented; unknown source code retention is not supported by interactive tabs. |
| 37 | synced block | `synced_content`; currently a snapshot | The current `synced_block` is local content snapshot/reference information, without cross-instance real-time synchronization. Type semantics may be preserved, but implementation status must be noted. |
| 38 | columns | `column_layout`, internal `column` | Structural: `columns > column`; layout and internal columns are not alias relationships. |
| 39 | YAML front matter | `document_metadata` | Source code carrier `syntax:metadata` and other metadata are processed; the format source is retained at the encoding layer. Do not treat the original metadata node and page attribute storage directly as the same object. |
| 40 | Pandoc title block | `document_metadata` | Same as above; it shares the semantic container with YAML and MMD metadata, but the field type, value and original encoding must be retained. |
| 41 | file transclusion | `transclusion` | Source code carrier `syntax:transclusion`, parses file content references; currently it is for limited text types and does not support arbitrary media file references. |
| 42 | block comment | `content_comment`, block-level scope | Source code carrier `syntax:comment`; can share models with inline content comments, not equal to collaborative comment threads. |
| 43 | definition list | `definition_list` | Structured: `definition_list > definition_term/definition_description`; paraphrasing can have multiple text blocks and should not be defined as leaf without internal structure. |
| 44 | raw source | If you want to pass it to the output format as is:`raw_content` | `syntax:raw`. If it refers to "source code for reading", it should be classified as `code`; if it refers to source code that cannot be parsed but is retained, it should be classified as `unknown_content`. It is recommended to delete the ambiguous canonical name raw source. |
| 45 | line block | `line_group` | Structured: `line_block > line`; the semantics are to retain meaningful line-by-line groupings, not just a certain prefix writing method. |
| 46 | native div | `container` | There is a structured container for `fenced_div`; this does not mean that `native_divs` parsing has been implemented. `syntax:html-markdown` is another source/preview path. The semantics can be unified, and the conversion capabilities are marked separately. |
| 47 | raw TeX | `raw_content(format=tex)` | The obvious raw-format path can be retained for TeX; no independent nudity `raw_tex` The ability to identify. `math` Unconditionally, TeX can contain non-mathematical instructions. |
| 48 | example list | `list_item`/`list`, numbering mode`example` | No dedicated example list labels, sequential numbering, and reference implementations. The list base model can be shared, but label/number sequence semantics need to be added, not just ordinary ordered list renaming. |

<a id="建议优先合并的内容"></a>

## Recommended consolidation priorities

| Merge group | retained differences |
|---|---|
| callout / alert / admonition | Prompt type, title, icon, color, fold; source syntax does not determine type. |
| heading / toggle heading | level, collapsible, collapsed, children; folding is not a new title type. |
| paragraph / empty block | Empty content is also a legal paragraph; empty lines in the original text are still typesetting/encoding information. |
| bullet / numbered / task list item | List mark, starting number, task status; tasks are not numbered. |
| YAML / Pandoc title / MMD metadata | Attribute value, field type and source encoding; do not bind the name to the serialization format. |
| database inline / full page | Database resource identity, view identity, display position, and ownership relationship are saved separately. |
| web embed / HTML document embed | They are all embedded in external documents; URL/ file sources, media types and run permissions are recorded separately. |
| Native table / MMD table; two kinds of TOC | The content semantics are the same; the implementation levels of structured editing and source code preview are different. |
| block/inline image；block/inline math | Content data sharing, display recorded separately. |

The media recommends adopting a common attachment data structure but retaining identifiable subtypes such as image/audio/video. Sharing `src` is not enough to force all media into the same undifferentiated content. Similarly, bookmarks and previews can share link objects, while page references also require internal resource identities.

<a id="不建议因相似外观而直接合并"></a>

## Similar appearance alone does not justify consolidation

1. **raw HTML and HTML embed**: The former is the original content fragment in the document, and the latter is embedded in an independent document. The difference is the content ownership and operation method, not the way the tags are written. They can both belong to the HTML ability family, but this difference cannot be lost.
2. **code and diagram**: One display code and one expression diagram. Source code fields can be shared, but the rendering intent must be preserved; similarly, raw TeX is not equal to a mathematical formula.
3. **quote and callout**: Quotes and prompts have different semantics, and the styles are close but not the same.
4. **transclusion and synced content**：Shared content can refer to infrastructure, but the scope of reference, reading direction, refresh and sync strategies are different.Notdown ofsynced snapshot It is not possible to claim thatlive sync。
5. **page and page reference**: The former has text, attributes and identity, and the latter points to resources. The ownership relationship of child page cannot be silently replaced by an ordinary link.
6. **Content annotations and collaborative comments**: The former is the document content/annotation, and the latter also involves the author, thread, time and status. Anchors can be shared, which does not mean sharing complete entities.

<a id="用户表外的现有实现如何归位"></a>

## Classifying existing implementations absent from the user's table

The following is not a recommendation to add all to the top-level block type, but to ensure that existing implementations are not lost in the merge.

| Existing nodes/carriers | Recommended to return |
|---|---|
| `footnote` + inline `footnote_reference` | Can be a footnote entity: `id + body`, the text stores the reference. It is not necessary to split it into two content types just because the definition/reference syntax is different, but the roles they play in the model cannot be lost. The revised table only contains footnote in the column row, and the footnote text storage location needs to be added. |
| `syntax:definition` | Glossary of abbreviations, documentation, terminology; classified as reference definitions / annotations of the document. Not definition list as in the text. |
| `syntax:figure` | Illustrated content with captions. Currently, there is only the image path, which can be modeled as `image.caption`; if combinations of figures, tables, etc. are allowed to be combined and independently numbered in the future, the general `figure` container will be introduced. alt and caption should not be mixed into one field. |
| `nested_block` | Editor adaptation structure for paragraph/heading mounting subblocks; no need to be a user semantic type. |
| `bullet_list` / `ordered_list` | List grouping entity `list` , holds numbering/grouping semantics; not new list item type. |
| `table_row` / `table_cell` | Table internal structure. |
| `definition_term` / `definition_description` | Internal structure of terms and definitions. |
| `line` | `line_group` internal structure. |
| `column` | `column_layout` internal structure. |
| `syntax_block` | The implementation carrier of extended content; it should be mapped to semantic types according to kind, and "extension block" should not be regarded as the essence of the content. |
| `opaque_block` / `unknown_block` | Rollback representation; keep raw or reference respectively to indicate the degree of recovery. |
| `doc` | Document root; not an insertable block. |

<a id="leaf--container-建议换一种记录方式"></a>

## A different way to record leaf / container relationships

Don't express all "contains" in just one boolean value. At least divided into:

| Dimensions | Example |
|---|---|
| inline content `inline_content` | paragraph, heading, text in table cells. |
| generic child blocks `block_children` | quote, callout, toggle, paragraph with sub-content. |
| dedicated internal structure `structured_children` | table of rows/cell,columns ofcolumn、definition list terminology/Interpretation,tabs oftab。 |
| external resource/content references `reference` | page reference、database view、transclusion。 |

These dimensions can exist simultaneously. The internal structure of `table` does not mean that all blocks can be embedded arbitrarily; the fact that `database` points to a recorded resource does not mean that the text reference node is a content container. ProseMirror's `atom/isLeaf` describes editor storage and interaction and cannot be directly used to determine the nature of the content in this model.

<a id="源码依据与覆盖范围"></a>

## Source evidence and coverage

- [Editor schema ](../../src/document/editor-schema.ts): 35 `isBlock` nodes (including document root), that is, 34 non-root block nodes; which contain internal structures such as table rows/cells, and do not represent 34 independent user semantic types.
- [Block directory and label ](../../src/catalog/block-catalog-data.ts): Lists node names, and 11 `syntax_block.kind`; directory name is the current implementation label.
- [Product expansion analysis ](../../src/markdown-engine/products.ts): diagram, raw, table, embed, html-markdown, figure, comment, toc, transclusion, metadata, definition, a total of 11 carrier types have been returned to this article.
- [Notion Markdown adapts to ](../../src/document/notion-markdown.ts): mappings such as empty paragraphs, nesting, media, page/database references and synchronization snapshots.
- [Page resources ](../../src/shared/types.ts), [ Notion node view ](../../src/editor/notion-nodeviews.ts), [ extended node view ](../../src/markdown-engine/product-view.ts), [ HTML cleanup ](../../src/markdown-engine/html.ts), [ reference file parsing ](../../server/syntax-files.ts): the actual boundaries of resources and display/parsing capabilities.

Reverse coverage of 34 non-root block nodes: paragraph , syntax_block , alert , nested_block , heading , blockquote , horizontal_rule , code_block , bullet_list , ordered_list , list_item , columns , column , child_page , opaque_block , html_block , definition_list , definition_term , definition_description , footnote, line_block, line, fenced_div, callout, toggle_block, synced_block, database, table_of_contents, unknown_block, media_block, equation, table, table_row, table_cell.

This article only provides model verification and naming suggestions, and does not modify schema, parsing behavior, default extension switches or user content. The previous specific syntax differences between [ dialect capabilities and ](../reference/CONTENT-CAPABILITIES.md) recorded in the old version table should not be understood to mean that this semantic model must separate independent types.
