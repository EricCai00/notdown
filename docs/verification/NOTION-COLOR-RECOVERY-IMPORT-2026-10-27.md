<a id="notion-导入双颜色补全2026-10-27"></a>

# Dual-color recovery during Notion import (2026-10-27)

**English** · [简体中文](NOTION-COLOR-RECOVERY-IMPORT-2026-10-27.zh-CN.md)

<a id="行为"></a>

## behavior

The Notion API import preview now first checks the complementary text color/background color of Markdown v2 and Block API in the same batch, and then fills the gap according to the user's desktop cache selection. Both Notdown and Notion Markdown use the existing nested `span color` to save dual colors, and do not write new custom attributes in the official mode. The preview warning explains the source of completion and the reason for skipping.

The cache options are updated to **Restore missing colors and Notdown reminders from this computer ' s Notion desktop cache** . When turned off, the cache is not read, and public API complementation is still enabled; when turned on, the original fixed path, read-only transactions, account/workspace isolation, and block/byte limits are reused. Reminder that custom properties are still only added for Notdown. Colors and dates share a page block scan and cache read; turning off descendant import will not import subpages due to style scans.

Only newly imported copies will be completed, old notes will not be automatically rewritten. The restored original and adopted cache tag is written to `color-recovery/<pageId>.json` , participating in the batch identity along with the original API archive; the same snapshot can be submitted repeatedly without overwriting local edits.

<a id="匹配与范围"></a>

## Matches and ranges

- The current automatic scope is plain text and known text mark for top-level paragraphs and headings. Full block text must be unique in both sources; block type, code, bold, italics, strikethrough, underline, and links must match.
- Modifications only occur within the exact source code range verified by the editor; text, all non-color formatting, and two colors per character are checked after reparsing. Code fences, unknown containers, atomic mentions, and other source code are not modified through global replacement.
- Nested ranges such as color conflicts in the same channel, repeated blocks, non-text objects, and tables/columns that cannot be positioned retain the original text and prompt. Caches that clearly exist but cannot be verified are not considered current cloud facts.
- The cache must match block ID, type, complete text, other inline formats, and editing time; sub-minute times are required to be exactly equal, and minute times can only be checked against the same minute. Unknown marks, contradictory marks, and duplicate identities are not inferred. Each interface does not constitute an atomic snapshot of the cloud.

<a id="验证"></a>

## Validation

- `npm test`: 1, 102 passed, 5 skipped, 0 failed.
- After final addition of identity/block type boundaries, `notion-color-import`, `notion-desktop-cache`, `notion-v2-import` directed 23 entries are passed. Covers public API complementation, cache filling, Unicode run scope, format conflicts, duplicate text, unknown annotations, old caches, time precision, source archiving, idempotence and local editing protection.
- Isolated frontend production build passes, contains TypeScript check. The new color helper function type declaration in the test caused a build failure. This has been corrected and the rebuild passed.
- Independent Chrome and temporary vault: `notion-v2-import.spec.ts` and `notion-import.spec.ts`, a total of 15 items passed. Both dialects verify exposure of API complementary colors when caching is turned off, gap filling when caching is on, select changes to invalidate previews, dual colors after submission and reopening, and existing Notion link and import conflict protection. Checked generating screenshots.
- The real archive and native read-only cache of user-specified Minor tests is again verified with the new completion module: expose API , restore 2 dual color ranges, cache fill 0 , warn 0 . No online import was initiated again using real token, and no user vault was modified.
- Desktop build, final type checking and repackaging passed. The installation package is `.run/desktop-release/Notdown-Setup-0.1.3-color-import-x64.exe` (205, 186, 920 bytes), including previous subpages, code-tag and dual-color editing repairs; it does not automatically replace the installation version that the user is running.

Not running the full browser suite. The real sample only verifies that the archive and cache can be aligned, and does not guarantee that snapshots from any period can be mixed. The relevant log is `.run/logs/notion-color-import-*.log`, the actual sample result is `.run/logs/notion-color-import-live.json`, and the browser product is located at `test-results/notion-color-import/`.
