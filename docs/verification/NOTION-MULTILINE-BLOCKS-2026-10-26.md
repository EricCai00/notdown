<a id="notion-v2-多行子页面与引用块2026-10-26"></a>

# Notion v2 multiline child pages and reference blocks (2026-10-26)

**English** · [简体中文](NOTION-MULTILINE-BLOCKS-2026-10-26.zh-CN.md)

<a id="原因与范围"></a>

## Reason and scope

`<page>`Originally fell back to the old reader, which only accepted same-line closed or self-closing forms. Notion v2's multi-line Child page is therefore left unblocked, and subpages in columns are also affected. Checked and found that the old readers of `<folder>` and `<database>` also explicitly rejected header text with line breaks.

v2 now directly reads the complete tag range of these three blocks, preserving their type, target URL, unknown attributes and the data-source, inline, wiki, icon fields of the database. The title is parsed as rich text and a readable name is obtained; the original unedited text is saved by the existing source code retention mechanism. Reading does not create, reset or migrate page ownership; importing still confirms the true parent-child relationship by Block API.

Imported files with `syntax.notionVersion: "v2"` can be restored to display by reopening them without re-importing or rewriting the vault file. This change does not modify the user vault or running installations.

<a id="官方规范核对"></a>

## Official specification check

Source: [ Notion-flavored Markdown format ](https://developers.notion.com/guides/data-apis/notion-flavored-markdown). This is a format description for `markdown_version: "v2"`, with examples of single-line labels and examples of multi-line containers. You cannot assume that the interface always returns a single row, nor can you claim that each type of block always returns multiple rows.

<a id="验证"></a>

## Validation

- `npm test`: 1, 087 pass, 5 skip, 0 fail.
- `npm run build -- --outDir .run/notion-child-pages-frontend`: Passed, contains TypeScript check.
- `tests/unit/notion-v2.test.ts`: The two dialects respectively cover 30's multi-line text of block tags, nesting within columns, saving as is, and adjacent text editing; Child page also covers CRLF, formatted Chinese titles, code examples, unknown containers, missing closures, and closed expansions.
- `tests/unit/notion-v2-import.test.ts`: Simulate v2 API to return to multiple lines of Child page in the top level and columns, check local targets, tags, page ownership and source code after saving.
- `tests/e2e/notion-v2-import.spec.ts`: 6 item passed; use independent Chrome and temporary vault to verify that newly imported and existing v2 files are displayed, adjacent edited, saved and reopened, jumped and revision is not changed due to reading. Checked the generated column screenshot.
- Extended browser regression (Notion, internal references and subpage deletion, excluding v2 tests that have been completed separately): 35 passed, 6 failed. Failure details: Example number insertion does not appear as expected label; the picture caption use case in two dialects still asserts the old XML output, and is actually saved as a v2 supported Markdown picture; the total number of pages of the import progress use case is expected to be 52, and the actual 49 is; the two old MCP use cases are expecting the source name to be displayed in the unimported database, and actually display `Unknown database`. These behaviors or assertions were not modified this time, and a full pre-fix baseline retest was not performed, so the extended regression cannot be called fully green.
- `npm run desktop:dist -- --config.artifactName=Notdown-Setup-0.1.3-child-pages-x64.exe`:Passed. Repair installation package located at `.run/desktop-release/Notdown-Setup-0.1.3-child-pages-x64.exe` (205, 173, 131 bytes); running applications are not automatically installed or closed.

This time, the real Notion token is not used to request the online page; the automation covers the official syntax and simulated API. It verifies multi-line parsing issues and does not imply that all remote block configurations or interactions have been fully reproduced.

The execution log is located at `.run/logs/notion-child-pages-*.log`, and the browser products are located at `test-results/notion-child-pages/` and `test-results/notion-child-pages-regressions/`.
