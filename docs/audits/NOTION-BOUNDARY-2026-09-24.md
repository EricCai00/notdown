<a id="notion-官方语法边界核查"></a>

# Review of official Notion syntax boundaries

**English** · [简体中文](NOTION-BOUNDARY-2026-09-24.zh-CN.md)

2026-09-24. Based on [ Enhanced Markdown ](https://developers.notion.com/guides/data-apis/enhanced-markdown) and [ Working with markdown content ](https://developers.notion.com/guides/data-apis/working-with-markdown-content). This round is a comparison between official documents and local implementation, and Notion API is not called for server-side compatibility testing; unlisted syntax does not mean that the remote end is rejected, but it cannot be incorporated into the strict official dialect of this project accordingly.

<a id="修正"></a>

## Corrections

| Location | original behavior | Current limitations |
| --- | --- | --- |
| Inline image | Markdown-it Default image rule allows pictures in paragraphs; table of contents display supports it by default | Officially only media blocks are defined. Independent images are retained; the entire image tag within the rich text remains literal text and does not degenerate into a link. Directory marked as unavailable. |
| Autolink | The angle brackets URL/ mailbox is forwarded to the link by the default rule; the bare URL is not actually enabled, but the directory is uniformly displayed as supported. | Neither angle brackets nor bare URL are enabled; explicit true cannot bypass boundaries. |
| Internal link | Universal link adapter is easily understood as supporting all forms of internal linking | Common `[text](URL)` and official page mention are available. The syntax of the fragment URL is preserved, but does not mean there is an automatically generated target title ID . Wiki source code is not explained; `[[…]]` input shortcut keys to write official mention, does not mean that Wiki is a storage dialect. Local page addressing is an application capability. |
| Children of ordinary headings | Automatically changed to toggle heading | Titles without `toggle="true"` written along with sub-blocks retain the source code. Legal toggle heading continues to be supported. H5/H6 maps H4 according to official rules. |
| Ordered task list | accept and write`1. [x]` | The official task list only defines the unordered form. For existing ordered tasks, keep the source code and disable the corresponding input conversion. |
| Tilde fences | Common code branch accepted`~~~` | The official document only defines the backtick fence; the entire original text of the wavy line fence is retained, and the tags are not parsed internally. |
| Table th | Accepts HTML `th` and becomes`td` | Officially lists `td` and table-level header-row/header-column; the entire original text of the `th` table is retained. pipe table in the official complete example continues to be retained. |
| Picture title, span class | Image title is treated as a normal Markdown attribute; span class can produce small-caps/native-span semantics | The official image title and small-caps/native-span structures retain the source code, and serialization refuses to newly generate these structures. Ordinary color/underline span continues to be supported, and unknown fields will not be deleted. |
| Citation | Arbitrary `[^label]` as URL citation and does not respect the mentions switch | Just bring it.scheme ofURL Yescitation；The standard footnote is marked as text, and official footnote extensions are not allowed.`notion_mentions` control. |
| Extension switch | `gutenberg`Return early to bypass the official whitelist | Officially available switches are based on the official default whitelist; unsupported existing configurations are retained but have no behavior. |

Additional validation is written to prevent pasted or programmatically constructed inline images, unofficial styles, ordered tasks, and common title subblocks from bypassing source code parsing. If the verification fails, the current contents will be retained and an error will be reported, but they will not be silently converted into other structures.

When the editor inserts independent image source code, the text before and after is cut according to the media block without inserting inline; the image source code text is retained in the rich text of the table. Legal subimage blocks in lists, references, and containers can still be saved.

<a id="保留与限制"></a>

## Preservation and limitations

- Notdown and other Markdown dialects continue to use their own pictures, automatic links, Wiki, styles and other extensions; files will not be migrated in batches, and user vault will not be operated.
- Regression covers original text round-trips, CRLF, modifying adjacent blocks, nested containers, code fences, configuration force-on, and actual serialization. Unmodified source code reuse and new generation paths are checked separately.
- The database, agent mention and meeting notes whose complete encoding has not been verified are still known gaps, and the original text will continue to be retained; Notion workspace customization emoji has no resource resolution yet. There is no claim to be complete implementation of all official objects or remote roundtrips.
- Not all alternative spellings of common Markdown are outlawed. This round fixes clear structural semantic differences and undocumented capability statements; complete parsing of compliance still requires more upstream input corpus.

<a id="验证"></a>

## Validation

- `npm test`: 616 item, 615 is passed, 1 is skipped. Log: `.run/logs/notion-boundary-unit.log`.
- `npm run build -- --outDir .run/dist-notion-boundary`: Passed; Vite still prompts that part of chunk is larger. Log: `.run/logs/notion-boundary-build.log`.
- `npm run test:e2e -- tests/e2e/notion-boundary.spec.ts tests/e2e/block-catalog.spec.ts tests/e2e/markdown-blocks.spec.ts`The first round of exposure test product concurrent cleanup and image counting incorrectly contained ProseMirror auxiliary images. After correcting the selector, running the same three files as independent build, 4392 port, temporary vault and Chrome, the 14 item passed; the finally rebuilt boundary-specific 3 item also passed, including the actual loading of the image. The logs are `.run/logs/notion-boundary-e2e-isolated.log` and `.run/logs/notion-boundary-e2e-final.log` respectively. The entire browser test directory was not run.
