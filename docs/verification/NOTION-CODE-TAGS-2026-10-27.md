<a id="notion-v2-行内代码兼容读取2026-10-27"></a>

# Notion v2 inline-code compatibility reading (2026-10-27)

**English** · [简体中文](NOTION-CODE-TAGS-2026-10-27.zh-CN.md)

<a id="原因与证据"></a>

## Reasons and evidence

Checked the local Markdown of the screenshot page and the original Markdown archived when importing, both contain `<code>rdkit.Chem.BRICS.BRICSDecompose</code>`. This representation comes from the API response at that time, without changing the backticks to labels by Notdown. This read-only inspection of the page and its archives did not modify the user vault.

The current [ official v2 format description ](https://developers.notion.com/guides/data-apis/notion-flavored-markdown) is based on CommonMark, backtick inline codes still apply; its list of allowed tags does not list `<code>`. Therefore, it cannot be claimed that v2 deprecates backticks, or that this tag is listed as documented official syntax.

<a id="修复与边界"></a>

## Repair and Borders

Only `syntax.variant: notdown` and `notionVersion: v2` are compatible with `<code>…</code>` without attributes and closed in the same line. They are mapped to existing code mark and displayed as inline code. Compatible with ordinary paragraphs, attribute paragraphs, titles, lists, Callout, columns and tables. The XML entities in the tag are decoded, and other Markdown , links and tags are used as literal codes; no new code objects are generated or protocols are written repeatedly.

Keep the original labels and bytes when not editing or only editing the adjacent text; use standard backticks to save after directly editing the code. Existing files can be read by reopening them and will not be migrated in batches. The official Notion Markdown mode does not enable this compatibility, and the original text of unknown properties, missing closures and unknown containers is still retained.

Source scanning skips the entire code-tag text to avoid unpaired backticks or tag examples interfering with outer closure recognition, and to avoid triggering additional reads of subpages, attachments, mentions, etc. Examples of tags within code fences and backticks remain code content.

<a id="验证"></a>

## Validation

- `npm test`: 1, 088 passed, 5 skipped, 0 failed.
- `npm run build -- --outDir .run/notion-code-tags-frontend`: Passed, contains TypeScript check.
- `tests/unit/notion-v2.test.ts`: Covers containers and tables, entities, nested styles, tags and unpaired backticks in code, original text preservation of adjacent edits, readback of backticks after editing, and the boundary between official mode and old versions.
- `tests/unit/notion-v2-import.test.ts`: After updating the simulated API text to include `<code>`, the 8 item passes, verifying that the import produces real code mark and the archive remains original.
- Standalone Chrome and temporary vault browser test: 17 item passed. The scope is `notion-v2-import`, `notion-boundary`, `notion-format`, `notion-child-presentation`, `notion-block-import`; verify that the existing page is displayed, code editing and saving are reopened, adjacent editing original text is retained, new import and previous multi-line Child page repairs. Checked the display of inline code in the screenshot.
- `npm run desktop:dist -- --config.artifactName=Notdown-Setup-0.1.3-code-tags-x64.exe`:Passed. The installation package is located at `.run/desktop-release/Notdown-Setup-0.1.3-code-tags-x64.exe` (205, 175, 281 bytes) and contains the previous multi-line Child page fix; the running installation version is not automatically replaced.

The first time the browser was tested, the last time it was tested was not to be performed again.[Multi-block verification records](NOTION-MULTILINE-BLOCKS-2026-10-26.md)The failure of the extension suite in the application is not considered to be resolved.token Request for renewalNotion。

The execution log is located at `.run/logs/notion-code-tags-*.log` and the browser product is located at `test-results/notion-code-tags/`.
