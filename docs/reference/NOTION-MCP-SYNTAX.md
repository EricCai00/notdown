<a id="notion-mcp-enhanced-markdown-支持2026-09-27"></a>

# Notion MCP syntax and implementation boundaries

**English** · [简体中文](NOTION-MCP-SYNTAX.zh-CN.md)

According to officialNotion MCP `fetch` Readings `notion://docs/enhanced-markdown-spec`and[Publicly available Enhanced Markdown documentation](https://developers.notion.com/guides/data-apis/enhanced-markdown)Two sources are merged: additional language for MCP will not shut down open documents that already have written code. This confirms local analysis, editing, and storage support, not REST Markdown endpoint acceptance certification.

The following syntax is enabled in both `notdown` and `notion-markdown` and follows the corresponding extension switches:

| Syntax | Local behavior and boundaries |
| --- | --- |
| `<tabs>` / `<tab icon="…">` | The first indented line of Tab is the title, followed by the text. Supports switching, renaming, addition, deletion and sorting. Activity Tab is local view state and is not written as an official property. New insertions use the official form. |
| `<embed src="…" color="…">Caption</embed>` | HTML The AnnexURL References, use of unificationPM `block.web_embed`and retained `notion_embed` The code.HTTP(S) or knowledge baseHTML The attachment can be found in the sandbox with the script disablediframe Preview. Do not automatically download remoteHTML。 |
| `<folder url="…">Title</folder>` | Editable reference to an existing folder; no folder is created at Notion. |
| `<database url="…" inline="true" icon="…" wiki="true">Title</database>` | Save database references and properties. `url="#page/<host-id>"` points to the local database entry page; `inline="true"` displays editable tables, otherwise opens the complete database. Record, field, and view definitions remain in the vault resource and are not written to the text. Remote URL and `data-source-url` remain referenced; no remote moves or creations are performed. |
| `<meeting-notes>` | The first line is the title; below it supports `<summary>`, `<notes>`, `<transcript>` partitions and nested blocks. Partitions can be edited locally, and transcript will not be discarded when saved; the official form does not provide local AI transcription replacement operations. The new insertion only has a title, and after entering the text, write it as notes. |
| `<column ratio="…">` | The official percentage column width supports dragging and saving. |
| `<col width="…">` | The original width value is saved, empty values are retained as automatic width. MCP has undefined units; existing local renderings will display unitless numbers in CSS pixels, which is a local display convention and not an assertion of Notion units. |
| `<mention-date … endTime="…"/>` | Save and edit start/end, startTime/endTime, timeZone. |
| `<mention-agent url="…">…</mention-agent>` | Agent reference, retains name, URL, and unknown properties; Agent is not executed. |
| `<synced_block>`None url | Local content snapshots can be parsed; Notion auto-creation blocks are not requested. |
| `<synced_block_reference … notice="…">` | Keep notice and display a non-editable prompt outside the text; Notion cloud synchronization is not implemented. |
| `<unknown url="…" alt="…"/>` | Preserve citations and alternative descriptions. Import recovery must still be independent of Block API evidence. |
| Callout/Tab of Notion Icon | Both the icon value and emoji can be saved, edited and transferred back and forth; without access to the Notion icon resource library, the path icon currently displays the original logo. |

Example:

```markdown
<tabs>
	<tab icon="icons/document_gray">
		First tab
		Content
	</tab>
</tabs>

<meeting-notes>
	Weekly meeting
	<notes>
		User notes
	</notes>
	<transcript>
		Original transcript
	</transcript>
</meeting-notes>
```

The text is also acceptedMCP of`` $`x^2`$ `` The report is published in the Official Gazette. `$x^2$`The code is supported by the inline code. `` `first<br>second` ``The code is written in the middle of the page. `<br>`The true multi-line code is not misinterpreted as this grammar. The tags inside the code fence retain the literal content.

The official Code grammar `mermaid` The default default is to use local Diagram previews for v1/v2, Notdown and official Notion dialects, and for embedded content such as Callout, lists. **Diagram** When extended, the restored graph is restored to an editable code; source code, fenced properties and unknown fields remain as before. sequence/flow is a graph writing language supported by other dialects, and is not supported by Mermaid to enter the official Notion dialect.

Reference support `[^https://example.com]`、`[^example.com]` and `[^{{1}}]`When there is a clear footnote definition in Notdown, it is still a priority to follow the existing footnote definition.`src="{{1}}"` and `file-upload://…` The original value is kept, but notMCP In the context aboveURL The map or upload of the resource analyzer is not considered as a locally accessible address.

The old Notdown `<tabs active="…"><tab title="…">…` and `<meeting-notes title="…" audio="…">…` encodings continue to be read and are not migrated in batches; these additional attributes have not become official syntax. Supplementary protocols such as `<web-embed>`, `<page-link>`, Button, and AI block are still limited to Notdown. The disabled `<html-embed>` will not be re-enabled due to this MCP support. Table merging still uses the existing Pandoc encoding and does not promote rowspan/colspan to the official syntax.

The verification is located in `tests/unit/notion-mcp-spec.test.ts` and `tests/e2e/notion-mcp-spec.spec.ts`, covering attribute editing, original text retention, undo, closing extensions, code fences, malformed boundaries and saving overloading.

<a id="notion-v2-的保存规则"></a>

## Notion v2 persistence rules

`syntax.notionVersion: "v2"`Use [ official Notion-flavored Markdown ](https://developers.notion.com/guides/data-apis/notion-flavored-markdown). The labels of v1 Enhanced Markdown and v2 are different; the existing version of the page is retained and the version is not automatically switched through editing.

New or edited ordinary titles, lists and references without sub-blocks, tasks, bold italics and strikethroughs, ordinary pictures, colorless formulas and tables that can be expressed without loss are given priority in outputting Markdown. Ordinary tables require complete first row headers, regular rows and columns, single-segment cells, and no column width, color, and other attributes; other tables retain the official table carrier. Bold italics and strikethroughs are first serialized with Markdown, and then verified with the same v2 inline parser; use official `<b>` / `<i>` / `<s>` when the same content and tags cannot be restored, including ambiguities such as edge blanks and interleaved tags.

`<u>`, `<span color="…">`, `<p>` / `<h1>` - `<h4>` / `<quote>` / `<li>`, toggle, callout, columns, mentions, audio and video and other exclusive objects with attributes or sub-blocks are still expressed according to official tags. Notdown extensions are still controlled by `variant` boundaries. The original text retention mechanism takes precedence over normalization: old unedited blocks, unknown fields, code fences, and unknown structures are not rewritten due to adjacent edits, and the user vault is not traversed or migrated.

Regression coverage: `tests/unit/notion-v2.test.ts` vs. `tests/e2e/mobile.spec.ts`.
