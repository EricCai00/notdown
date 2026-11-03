<a id="附件原文件名与统一存储命名2026-10-26"></a>

# Original attachment names and consistent storage naming (2026-10-26)

**English** · [简体中文](ATTACHMENT-NAMES-2026-10-26.zh-CN.md)

<a id="范围"></a>

## range

- The File card reads the original file name registered in the attachment when there is no explicit name, and the original file name is also used for downloading; the explicitly set card name continues to be retained.
- HTML embed reads the original file name when there is no explicit title, and keeps the original name when downloading; it only updates the display, and does not modify the text or page revision.
- Upload, Markdown folder import and Notion download share `assets/<SHA-256>.<扩展名>`. Common MIME and extension standardization, reuse the same file with the same content and standardized extension.
- When reusing attachments, the existing name, registration time and unknown metadata are retained; this upload still returns the submitted name for insertion. The target of external changes will not be overwritten, and the bytes to be uploaded are saved in `.history/asset-conflicts/`.
- Notion supplements attachment metadata from Block API's file name, Notion signatures, and URL's temporary parameter changes do not block name matching. When excluding descendant pages, the block container of this page can still be scanned, and subpages will not be imported as a result. The HTML name can also come from the download response or URL.
- The original UUID, batch number, `notion-` and nested attachment path will continue to be read and will not be renamed in batches. Old attachments can be displayed when they are re-opened with their original names registered; names that have never been recorded or are inaccurately recorded cannot be inferred based on hashes and need to be re-imported to obtain them.
- Local attachment downloads no longer enter the editor's page link parsing logic. A new single file metadata reading interface is added, which does not scan the entire database page or download the attachment text.

<a id="验证"></a>

## Validation

- `npm test`: 1, 054 passed, 5 skipped, 0 failed. Including cross-entry path consistency, Office/HTML/JPEG/ unknown extensions, deduplication, metadata retention, external file conflicts and recovery of content to be uploaded, old paths and cross-border protection, Notion nested block names and signature URL matching.
- `npm run build`:Passed; there is an existing large bundle prompt.
- Final run of `npm run test:e2e -- tests/e2e/attachments.spec.ts tests/e2e/notion-v2-import.spec.ts tests/e2e/media.spec.ts`: 13/13 passes.
- In the Temporary Knowledge Base and IndependenceChrome The two languages examined in theFile/HTML Name, actual downloaded recommended file name, preserve and re-download non-transcript, and attachment library, media inserts andNotion Simulation import. The screenshot has been viewed.
- When expanding the browser check to 66: 62 passes, 4 fails. After individually reviewing the failed file: 10 passes, 3 fails; the import progress check passes individually, and the failure of the combined run involves repeating the assertion of the number of pages after the batch.
- The three items that still failed were `internal-reference.spec.ts`'s new example list label number, and `notion-image-block.spec.ts`'s two dialect picture caption save assertions; the last two items were actually saved as Markdown pictures, and the assertion still requires `<image>` labels. These numbers or image serialization implementations have not been modified this time.
- A full 710 browser check was started, but it was interrupted when the first batch failed to be located; it cannot be claimed that all browsers have passed.

The local logs are `.run/logs/asset-filenames-unit.log`, `asset-filenames-e2e-final.log`, `asset-filenames-e2e-regression.log` and `asset-filenames-e2e-followup.log`; the effect screenshot is `.run/logs/asset-filenames-preview.png`.

This time, simulated Notion API and temporary data are used, without using real token, modifying the user vault, batch migrating existing attachments, or updating installed applications.
