<a id="元数据与表外格式的依据"></a>

# Metadata and formats outside the source workbook

**English** · [简体中文](METADATA-AND-COMPATIBILITY.zh-CN.md)

<a id="当前存储规则2026-09-24"></a>

# Current storage rules (2026-09-24)

Page application attributes are now uniformly stored in `vault/metadata.json`; the first YAML / Pandoc title block override the default value, and the complete source file is directly used as the text. The following legacy outer YAML and isolation rules are replaced by the [ Vault metadata contract ](../features/VAULT-METADATA.md).


2026-09-23 Revision: Raw Source is no longer a standalone object.`{=html}` The United StatesHTML block / Inline HTML，Other formats andraw TeX IncludedUnsupported；All of the original coding and recoverable source code are retained.78 The following is a list of articles related to41 block、2 metadata、31 inline、4 character），The following is a list of the oldest numbers and classifications.

2026-09-21. The object identity is separated from the encoding form; the official syntax basis is not equal to Notdown and has been connected to the corresponding service.

<a id="yaml-front-matter-与-multimarkdown-metadata"></a>

## YAML front matter and MultiMarkdown metadata

MMD metadata **is not the complete YAML**. Officially, the optional delimiter is used to improve YAML compatibility, rather than stating the use of the full YAML data model. According to content semantics, it is now classified as `metadata.yaml_front_matter` and is no longer a separate MultiMarkdown title block object; the `mmd_title_block` configuration key is still retained.

MMD encoding follows the following rules:

- It can only appear at the very beginning of the text document, and there cannot be a blank line in front of it; the first line can be optional `---`, the last line can be optional `---` or `...`, and the blank line ends the metadata.
- The key must start with ASCII letters or numbers, and the rest must be ASCII letters, numbers, spaces, hyphens, and underscores, and end with a colon.
- Keys are processed ignoring case and stripping spaces; `Base Header Level` and `baseheaderlevel` are the same key.
- The value is a plain text string and can be multiple lines. Continuation lines with colons must be indented; null values ​​are allowed. Numbers, booleans, list writing, and Markdown tags are not automatically converted to YAML types or rich text.
- MMD is enabled by default `mmd_title_block` Priority byMMD Processing its separator; other default openingsYAML Still in useYAML Resolve. Close the extension to retain the source code.

The encoding source is saved in the editing node `metadataForm`。Editors keep the source; documents and documentsCRLF The rules of the game remain the same.Notdown The outer layer of the fileYAML And in the realmetadata The data is stored in a different storage range, in the originalTitle/Icon The page will not automatically cover the page properties.YAML Continue to use the original fullnessYAML Treatment, not impositionMMD The limitations.

Sources: [MultiMarkdown metadata](https://fletcher.github.io/MultiMarkdown-6/syntax/metadata.html), [Pandoc YAML metadata](https://pandoc.org/MANUAL.html#extension-yaml_metadata_block).

## Database reference

A database is not currently implemented, so the `block.database_reference` registry and `database` dedicated node have been removed. Existing `<database>` tags are retained as Unsupported original text, and files are not rewritten in batches. `notdown_databases` is left as a legacy configuration compatibility key and the directory is labeled source preservation; it does not enable database objects or executors. The in-line database mentions belong to the existing Mention page or data source and are not included in this deletion.

<a id="2026-09-22-清理结果"></a>

## Cleanup results for 2026-09-22

Existing content section has been removed. The official list is item 81; the misspelled alias date ot reminder has been removed.

| Item | Current belonging and actual boundaries | Evidence |
| --- | --- | --- |
| Inline file transclusion | Supports inline positioning, but not another import semantic; now merged into File transclusion, retaining both block-level and inline vectors. The upstream finds and replaces the tokens in the source string directly before parsing Markdown, without requiring the beginning of the line or being on its own line. Notdown's local text preview still has permission path, loop and out-of-bounds restrictions and does not claim full upstream preprocessing semantics. | [MMD File Transclusion ](https://fletcher.github.io/MultiMarkdown-6/syntax/transclusion.html), [ official implementation of mark search](https://github.com/fletcher/MultiMarkdown-6/blob/master/src/transclude.c#L122-L139) |
| Raw Source | `{=html}`Classified as HTML block / Inline HTML; other formats are classified as Unsupported. Retain the original coding and support source code editing. HTML uses filtered preview and does not implement other target formats. | [Pandoc raw_attribute](https://pandoc.org/MANUAL.html#extension-raw_attribute) |
| Inline media | Object, node and local link to player rules have been removed. Ordinary audio and video Markdown links continue to retain tags and paths; the player uses the existing block-level media tags of Audio / Video. There is no basis for calling the original local convention of "only one link for the entire paragraph" an official inline type. | [Notion Media blocks](https://developers.notion.com/guides/data-apis/enhanced-markdown#media-blocks) |
| Mention agent | Product objects and mention parsing are removed according to user requirements; existing tags are retained as literal text or original HTML, and unmodified content retains the original text. Allows escaping angle brackets after editing text, reopens reserved tags and unknown attributes, and no longer generates Agent mention objects. | User decision; no Agent service provided |

The above cleanup did not rewrite the vault in batches. The old directory links back to Content objects; inline.file_transclusion links back to File transclusion.
