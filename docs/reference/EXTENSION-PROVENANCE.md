<a id="扩展的方言依据与默认状态"></a>

# Extension provenance and defaults

**English** · [简体中文](EXTENSION-PROVENANCE.zh-CN.md)

2026-09-22 check. The expansion cards and dialect details of Extensions and Block Explorer on the edit page share `src/catalog/extension-provenance.ts`. This data only affects labeling and arrangement, and does not modify dialect defaults, switches, Markdown encoding, or page files.

<a id="顺序"></a>

## Order

1. **Specified syntax**The present language specification/official documentation clearly describes the grammar of the language, which is not the basis for the built-in rules of the analyzer. Required is before, Optional is after, and GFM Spec is before GFM Docs in the class.
2. **Built-in syntax**: Verified by the Basic Analyzer Processing, no corresponding extended switches, only read to display specification links and built-in status. The nine basic rules currently covered by CommonMark / GFM / CommonMark X include reverse-slip switching, code fencing, etc. HTML has an independent switch and is still in the first group.
3. **Others**: The remaining extensions of the list are sorted by source in the following categories: Pandoc extensions, Notdown Notion extensions, Notdown Markdown extensions; Pandoc is the default start-up status as a label only, no longer assigned as an alternative priority group.
4. **Outside Markdown scope**: Non-Markdown references in the directory, continue to the last row.

All sources of the articles use only the above three categories, which are independent of grammar. Notdown Notion extensions also contains the official NFM syntax adaptation and the official product/API based Notion function adaptation; the latter is defined by `src/catalog/extension-feature-origins.ts` The map is clearly not valid `local_*` The front end is classified as Markdown. The current nine local blocks are expanded with Notion functional counterparts, formally ID using notion_.*, old local_* For compatibility with the name; local_figure maintains a general Markdown classification, showing official links and local encoding hints; its local tag is not verified as the official NFM grammar, but is still in Others. Notdown Markdown extensions maintains other Markdown product grammar extensions. Classification represents the appropriate source, not the general functionality of images invented by Notion. Catalogue source filtering and extension of ID remain unchanged.

Empty groups are not displayed; they are still arranged according to the same rules after search and source filtering. Switch dialects to regroup, and modify the current check status without changing the specification ownership and sorting.

Built-in rules use the explicit set of CommonMark core rules and check against Pandoc flag snapshots and local base parsing paths, not marking all extensions missing flag as built-in. Dialect description of [ Pandoc ](https://pandoc.org/MANUAL.html#markdown-variants) clearly points out that the extensions of the CommonMark series are listed relative to the basic syntax. Taking backtick_code_blocks as an example, it is enabled by default and cannot be turned off through the extension switch. What is shown here is the basic syntax corresponding to the extension, not another set of plug-ins to be enabled. Typora and other products without Pandoc preset will not be classified into the built-in group.

Required represents the baseline syntax of the dialect. It does not mean that every article must use it, nor does it mean that Notdown locks this switch, nor does it mean full compatibility certification. Optional represents the upstream optional function; the setting items of Typora are additionally marked as Optional setting, and the setting position is visible by hovering. When a local switch contains multiple behaviors, use descriptions to limit specification coverage.

<a id="两套独立依据"></a>

## Two independent sets of evidence

- Syntax references come from official specs/documents, and tags link to the source. GFM uses [ 0.29-gfm Spec ](https://github.github.com/gfm/); Alerts, footnotes, Emoji and title anchors are based on [ GitHub Docs ](https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax), and the math and chart links correspond to the dedicated page.
- Typora's highlighting, superscript and subscript, inline mathematics and Alerts are optional according to [ Markdown Reference ](https://support.typora.io/Markdown-Reference/) label settings; charts are based on [ Diagrams's enabling conditions ](https://support.typora.io/Draw-Diagrams-With-Markdown/#precondition), and smart punctuation and line breaks are set according to the respective documents. The math switch controls both the displayed formula and the inline formula, and only the inline part is subject to this setting description.
- Other dialects are based on [ CommonMark ](https://spec.commonmark.org/0.31.2/), [ Original Markdown ](https://daringfireball.net/projects/markdown/syntax), [ PHP Extra ](https://michelf.ca/projects/php-markdown/extra/), [ MultiMarkdown 6 ](https://fletcher.github.io/MultiMarkdown-6/syntax/), [ Obsidian ](https://help.obsidian.md/syntax), [ Notion Enhanced Markdown ](https://developers.notion.com/guides/data-apis/enhanced-markdown) and [ Pandoc manual ](https://pandoc.org/MANUAL.html#markdown-variants). Legacy GitHub is a deprecated Pandoc reader and does not borrow the current GFM Spec identity.
- The Pandoc status adopts the existing [ Pandoc 3.11 snapshot ](../data/pandoc-3.11-extensions.json), which respectively displays default on, default off, no extension switch, and no dialect of the product. The lack of extended switches may be because the syntax is built in and cannot be interpreted as being off by default. The local defaults for Typora/Obsidian/Notion do not pretend to be the Pandoc default.
- `No documented syntax mapping` The current status of the switch is not supported by the current map, and the continuous upstream is not supported. Workbook source classification, local support status, and the current status of the switch remain separate. For example, MultiMarkdown's limited metadata is not supported. `---` The full YAML extension is the standard language for the code.

Verify that all 115 items are included in 11 dialects, GFM Spec/Docs, Typora optional settings, core syntax without Pandoc flag, legacy name compatibility, and browser dialect switching, override switches, source filtering, and round-trip navigation.
