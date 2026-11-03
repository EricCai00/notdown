<a id="附件库首版验证2026-10-23"></a>

# Initial attachment library validation (2026-10-23)

**English** · [简体中文](ATTACHMENTS-2026-10-23.zh-CN.md)

Scope: Accessory library for desktop/browser applications. The entrance is side-by-side with Attachments; page menu Page attachments and insert menu From attachments; usage and boundaries see[media and embedding](../features/MEDIA-AND-EMBEDS.md#attachment-library)。

<a id="实现范围"></a>

## Implementation scope

- Scan existing local attachments and subdirectories; filter and sort by name, path, type, preview, download, and copy paths.
- The original name, type, size and time of the uploaded file are registered in `metadata.json.assets`; other metadata, old file paths and pages are retained in revision.
- Extract citations from real dialect parse trees and valid page attributes, covering images, links, media, embeds, covers, icons, and database record file fields; code examples do not count citations.
- Identifies missing paths and references in Trash; click on normal page references to navigate. Reuse only adds text references and does not copy attachments.
- Uploading and sharing JSON updates go through the vault queue and local locks, and files, external versions and recovery proposals are retained when external modifications cause conflicts.

<a id="验证结果"></a>

## Verification results

- `npm test`: 947 passes, 5 skips, 0 fails. This number includes all unit/service tests in the current working directory, not just attachment tests.
- Attachment-specific testing 9 items: Covers metadata persistence, old file and subdirectory scanning, code exclusion, missing files, recycle bin, concurrent uploads, external metadata conflicts, directory link isolation and HTTP services.
- `npm run build -- --outDir .run/attachments-dist`: TypeScript check and Vite build pass.
- IndependenceChrome、Port4366、Temporary knowledge base:`attachments.spec.ts`、`media.spec.ts`、`sidebar-layout.spec.ts`、`embeds.spec.ts`，The whole thing22 The remaining browser test files were not run.
- Actual screenshots check the desktop double columns and 480 px narrow screen: the preview, operation buttons, reference information and scroll area are normal, and there is no horizontal overflow.
- Browser verification includes original file name re-opening and preservation, image decoding, reuse of the same attachment, File card semantics, ordinary Markdown link fallback, source code cursor position and unsaved input, and refresh recovery after the old background error.

The local logs are `.run/logs/attachments-unit-final.log`, `attachments-unit-safety.log`, `attachments-build-final.log`, and `attachments-e2e-verified.log`; the screenshot is located at `test-results/attachments-verified/`. The temporary vault is created and cleaned by the test server and is not used by user `vault/`.

<a id="notion-导入接入附件库"></a>

## Notion import access attachment library

Added on the same day: The Notion downloader passes the obtainable file name and type to `importBatch`, and registers `metadata.json.assets` when submitting. By default, pictures, audio and video, PDF, ordinary files, email attachments, database Files, covers and icons are imported into the same Attachments entry; the byte content still uses the original hash path to deduplicate. The same completed batch can be re-registered, and local page modifications and unknown metadata can be retained; re-registration will be stopped when files are lost or replaced, and files deleted by users will not be reconstructed.

- Full `npm test`: 955 passed, 5 skipped, 0 failed.
- Notion, database Files, attachments and Markdown import special items: 26 items passed, covering empty files, downloaded file names, signature parameter exclusions, old batch re-registration and original archive retention.
- `npm run build -- --outDir .run/notion-attachments-dist`:Passed.
- Isolate Chrome, port 4368: `notion-v2-import.spec.ts`, `notion-import.spec.ts`, `attachments.spec.ts`, a total of 12 items passed. Actually view the preview, original name and reference location screenshot of the imported attachment.
- Used simulated Notion API and temporary vault; no batch migration of user's existing vault was performed, and online import was not verified with real Notion token.

The log is located at `.run/logs/notion-attachments-*.log` and the screenshot is located at `test-results/notion-attachments/`. The original single attachment and batch size limits still apply, and the source will be retained and a warning will be issued if the download fails.

<a id="当前边界"></a>

## Current limitations

Citation statistics only cover saved pages and valid attributes, and do not include historical snapshots, unsaved drafts in other windows, or internal dependencies in attachments. Unknown source code will prompt that the check is incomplete; zero references does not mean that the file can be safely deleted. This version does not provide deletion, automatic cleaning, renaming, deduplication or mobile attachment library interfaces. The original name of an unregistered old file is displayed as Unrecorded.
