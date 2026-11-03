<a id="对象方言与扩展目录"></a>

# Content object, dialect and extension catalog

**English** · [简体中文](CATALOG-RELATIONS.zh-CN.md)

2026-09-22. The objects of Block Explorer, Markdown variant, and extension can now jump in both directions. Details Use stateful URL fragment with support for copying addresses, refreshing, and browser forward/backward; search terms, categories, and selected dialects are restored on return. Child structures single-column rows, cells, captions, columns, list groupings, definition terms, footnote text and reference definitions, bidirectional link objects; Existing content sections have been removed; Inline raw source has been incorporated into Content objects, and inline file introductions have been incorporated into File transclusion. Mention agent and Inline media have been removed. MMD metadata has been subsumed into a separate encoding of YAML front matter; the Database reference object has been removed. Unimplemented objects do not therefore gain access to insertion.

Content objects is product semantics; the underlying node is the edit model. Each of the three types of list items uses independent nodes, the level and folding state of Heading use attributes, and all table codes share a structured table. Entities, escapes, and smart punctuation in character classes are text rules and do not generate additional nodes; hard_break retains explicit line breaking semantics. ProseMirror mark is an inline formatting mechanism: strong means bold, highlight means highlighting and outputting HTML `<mark>`, they are different.

Technical mechanisms such as doc, text, nested_block or syntax_block are no longer presented as product objects: doc/text maintains documents and texts, nested_block supports sub-blocks of ordinary paragraphs and headings, and syntax carriers accept specific objects and original texts that have not yet been directly edited. Removing these mechanisms can damage the document structure or recovery path. They do not provide independent access for product insertion. Inline raw source has been added to the official list, File transclusion shares block-level and inline positions; mentions of Agent, Inline media and Existing content have been removed. See [ Sources and Limitations ](../architecture/METADATA-AND-COMPATIBILITY.md) for details.

<a id="分类依据"></a>

## Classification criteria

The expanded list is additionally grouped by the current syntax specification/official documentation of variant and the default status of Pandoc; the source classification of the workbook continues to serve as an independent filtering condition. The edit page settings share the same basis as Block Explorer. For details, see [ Extended Basis and Grouping ](EXTENSION-PROVENANCE.md).

The sources are `markdown & notion.xlsx` and `extensions!A2:N117` provided by the user (the name sheet is plural). The [ read-only snapshot ](../data/extension-workbook.json) in the warehouse retains the 115 row, source column, 11 dialect column and native registration column, with the original row number and collection date. The original workbook has not been modified, and running the application does not depend on the user's desktop files.

| Source Category | Count | meaning |
| --- | ---: | --- |
| Pandoc manual | 89 | "Pandoc manual" entries in the table, including implemented, to-be-implemented and non-Markdown projects |
| Notdown product extensions | 14 | "Notdown product extension" in the table; is a configuration grouping of Notdown and does not mean that these syntaxes were invented by Notdown |
| Notdown Notion extensions | 12 | "Notdown Notion extension" in the table; Notion encoding and some Notdown compatible paths |

The source category is independent of the block / metadata / inline / character category of the content object. The old `Extension.kind = block | syntax` is retained as an implementation field and is no longer used in place of the source category in the catalog. Extensions show their purpose through associated objects, and the same extension can involve block, inline, and character processing.

Currently, 103 Markdown extensions are registered and have local execution paths; 12 Outside Markdown scope items are always ranked last and cannot be enabled. Registration does not mean that all the rules of Pandoc have been reproduced. For specific capabilities, please see the extension details and [ Local Objects and Services ](LOCAL-OBJECTS.md). The current default state always comes from the existing `enabled` / `supportsOption`; the "on/can/-" and slash combination in the workbook are individually marked as Workbook reference and do not overwrite the local configuration.

<a id="关系和能力"></a>

## Relationships and capabilities

- Object ↔ Extension: Automatically generate coding relationships from adapter in the object registry; supplement grammatical modification relationships such as blank line requirements, attributes, escaping, and numbering. The connected modifier is marked Syntax modifier.
- Object ↔ Variant: Displays the path of the currently registered model in the default configuration, when optional extensions are turned on, and the corresponding direct editing/source code editing/original text retention and other modes. No paths are also clearly shown, which can be used to view subsequent gaps.
- Variant ↔ Extension: All 115 reference entries can return each other; each item is clearly marked as enabled by default, optional, not applicable, to be implemented, or non-Markdown scope. Listing an extension does not imply that the dialect supports it.
- External documentation opens in a new tab; object details can be traced to official documentation via encoding extensions or dialect links. This article only describes the local registration path and does not claim to copy all the behaviors of the upstream product.

<a id="notion_-规范命名"></a>

## Canonical notion_* names

According to user requirements, the 12 keys have been unified into notion_columns, notion_callouts, notion_toggles, notion_tables, notion_pages, notion_mentions, notion_media, notion_databases, notion_synced, notion_toc, notion_nesting, and notion_colors.

The old notdown_* key continues to be readable and searchable; when the canonical key and the old key coexist, the canonical key takes precedence. Configuration writeback uses canonical keys, unknown keys are retained, and there is no batch rewriting of the vault. Workbook snapshots retain the original name and status, and the dialect defaults remain unchanged.

The name represents a grammatical grouping, not equivalent to official certification:nesting Supporting the old:::nest；databases Only the original tags are retained, and there are no database product objects.Callout ofalerts / notion_callouts andTOC oftoc_directives / notion_toc The code is controlled by code.Synced block The local refresh andCAS The release does not indicate cross-end sync.

<a id="参考链接"></a>

## Reference links

Reference is made to `merged`, `markdown`, `extended`, `notion`, `variants`, `pandoc`, etc. sheet of the workbook. The object identity continues to be based on the original 80 item list plus Inline raw source, for a total of 81 items. The syntax attribution in the reference table does not directly become a local function declaration.

2026-09-21 checks and adds to the main official sources of the catalog:

- [Pandoc manual ](https://pandoc.org/MANUAL.html): Expansion cards try to link specific chapters; `subscript` / `superscript` and other merged chapters use real anchor points. The default is still based on the existing 3.11 snapshot of the project.
- [Notion enhanced Markdown ](https://developers.notion.com/guides/data-apis/enhanced-markdown): Naming basis for labels, references and rich text properties.
- [Typora Markdown reference ](https://support.typora.io/Markdown-Reference/) and [ Obsidian formatting syntax ](https://obsidian.md/help/syntax): Product syntax reference.
- [MultiMarkdown 6 syntax ](https://fletcher.github.io/MultiMarkdown-6/syntax/): Aligned with v6 of the workbook, without switching versions without authorization; tables, citations, metadata, transclusion, etc. are directly linked to chapters.
- [CommonMark 0.31.2 ](https://spec.commonmark.org/0.31.2/), [ GFM specification ](https://github.github.com/gfm/), [ PHP Markdown Extra ](https://michelf.ca/projects/php-markdown/extra/), [ Original Markdown ](https://daringfireball.net/projects/markdown/syntax): The official grammar entry corresponding to the dialect.

The web pages are only used to describe the source; these web pages are not requested or loaded when the application is started, and the note content is not sent out.

2026-09-22 follow-up: Add `notion_underline`, separated from `notion_colors`; nine Notion function adaptations are renamed from `local_*` to `notion_*`, the old ID is a compatible alias, and the official name takes precedence. `local_figure` is a general image caption adaptation, retaining the Markdown classification. For details, see [ Classification Audit ](../audits/EXTENSION-CLASSIFICATION-AUDIT-2026-09-22.md).
