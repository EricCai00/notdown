<a id="页面与位置链接"></a>

# Page and location links

**English** · [简体中文](INTERNAL-REFERENCES.zh-CN.md)

Notion page mentions, Obsidian Wiki links, and Typora/ordinary Markdown internal links share the `InternalReference` semantic model, and Block Explorer is unified into `inline.internal_link`. Page and location are the two target scopes for this object; database/data source mentions remain independent and do not imply page or database ownership.

`/`The menu provides two entrances:

- **Page link (page link)**: Quote the complete page, including `[[Example]]` and `<mention-page>`。
- **Location link (location link)**: Select the title of the current page or other pages, existing block ID or anchor point, including `[[Example#Details]]`、`[[Example#Overview#Details]]`、`[[Example#^item]]` and `[详情](Example.md#details)`。

The inserter allows display text to be filled in. Explicit Wiki aliases and normal Markdown link text remain unchanged; automatic page labels appear with the title of the parsed page. Markdown is still the original text. The unmodified original text, unknown attributes and original writing methods are retained, and existing files are not converted in batches. Ordinary links continue to use rich text mark, and Wiki/mention use inline reference nodes; both share classification, target resolution, navigation and backlinks.

<a id="输入时补全"></a>

## Completion while typing

Visual text input `[[`, `+页面名` real-time search page; `@页面名` provides page candidates in the existing contact/date menu. Press ↑/↓ to select, Enter/Tab or click to insert, Escape to cancel and keep the input. The page with the same name is distinguished by the parent position and the short ID. After selecting, the stable page ID is written, and the target with the same name is not guessed. Recycle bin pages and their descendants are not candidates.

`[[`The menu lists existing pages first, and `+` is created first; you can select the current page, other pages, or the top level of the vault as the creation location. Create and call the existing page API/createVault without switching the current editing page. When editing, cancellation, view switching, or page navigation occurs before asynchronous return, the old position will no longer be inserted; the successfully created page will remain in the sidebar. Failure does not clear the input or force a retry. Undo reference insertion does not delete the created page.

When Wiki is enabled, Wiki encoding will be used. When the official page mentions that it is available, `<mention-page>` will be used. Other dialects use ordinary Markdown internal links. The existing `[[目标|别名]]` and location source code are not intercepted by the real-time page menu; `+` + space is still an unordered list. Menus are not triggered during input of escape, code, link and IME combinations. `(@` continues to be handled by the example reference menu. This does not extend the full library title/block search, nor does it add new text protocols.

<a id="位置与方言"></a>

## Locations and dialects

- Wiki title references are positioned by title text with an optional parent title chain; Markdown fragment preferentially matches dialect-generated titles ID or explicit anchors.
- Obsidian/Notdown accept ` ^block-id` at the end of a paragraph, ` ^item-id` at the end of a list item, and a standalone `^block-id` separated by a blank line after a structured block. Code fences, inline code, and escaped content are not treated as blocks ID.
- The "specific line" of the Obsidian document is the list item with block ID, not an arbitrary source code line number. No `#L42` private protocols have been added, and there is no support for referencing table cells, referencing blocks, or internal fragments of callout.
- The location selector lists existing targets; not None yetID blocks are automatically writtenID。unknown or duplicate blockID Does not automatically select targets.
- HTML's `id` and `<a name>` use the `md-` namespace in the security projection, retaining the original anchor identity; script, event handler, and application action attributes are still removed.
- Official `notion-markdown` does not interpret Wiki or Obsidian blocks of ID source code. Enter shortcut keys to convert official page mentions or ordinary links; model unification will not cross dialect boundaries.

Cross-page jumps follow the conflict process between page saving and CAS. URL retains the target fragment and supports refresh and historical navigation. Backlinks and relationship diagrams are combined according to the parsed page, and the title/block fragment is not integrated into the page identity. Pages with duplicate names and unidentified pages remain unresolved; there is no implementation of full Obsidian file paths, alias indexing, automatic rename repair, or full-base `[[##`/`[[^^` autocompletion.

Source: [ Obsidian Internal links ](https://obsidian.md/help/links), [ Typora Links ](https://support.typora.io/Links/), [ Notion Enhanced Markdown ](https://developers.notion.com/guides/data-apis/enhanced-markdown).
