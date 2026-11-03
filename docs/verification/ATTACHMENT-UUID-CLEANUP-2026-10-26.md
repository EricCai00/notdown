<a id="附件-uuid页面删除清理与提醒导入核查2026-10-26"></a>

# Attachment UUIDs, page-deletion cleanup and reminder import review (2026-10-26)

**English** · [简体中文](ATTACHMENT-UUID-CLEANUP-2026-10-26.zh-CN.md)

<a id="实现范围"></a>

## Implementation scope

- New uploads, Markdown folder imports, and Notion downloads share `assets/<UUIDv5>.<扩展名>` , formatted as hyphenated `8-4-4-4-12` . UUID is determined by the attachment-specific identity prefix, content SHA-256 and canonical extension, and continues to be deduplicated across portals. Shared UUID calculation function reconstruction does not change the existing page UUID.
- The original file name, unknown metadata, target byte verification and conflict recovery are retained; old hashes, UUID, batches, `notion-` and nested paths continue to be read without automatically renaming or rewriting old text. Format identity updated for Markdown imports to avoid misusing completed tags from old named batches for new attachment paths.
- Moving the application Trash does not clean the attachments, and restoring the page does not destroy the original reference. Thoroughly Delete After a page and subtree that is already in Trash, only the attachments referenced by these pages are checked; other pages (including Trash), icons, covers, properties, conflict drafts and non-page global metadata still protect the file. Irrelevant existing orphan uploads will not be cleared.
- HTML/SVG/CSS static dependencies are recursively protected by relative paths. Dynamic scripts, sources and dependencies that cannot be reliably resolved, symbolic links, or concurrent version changes prevent cleanup and prompts.
- Before recycling, save the original bytes and unknown registration information of the attachment to `.history/deleted-assets/`, recheck the page/conflict version and attachment bytes, and then use the same system recycle bin adapter as the page. After success, use metadata CAS to remove the corresponding asset entry without overwriting other fields. Return to `deletedAssets` and `warnings`, and the interface displays the cleaning quantity or retention reason.
- Multi-file recycling is not an atomic transaction; interruptions in page or attachment operations may leave uncleaned attachments. Other unsaved window drafts cannot be included in correlation analysis, and recovery copies are retained; there is no permanent deletion rollback or forced retry.

<a id="notion-reminder-证据与边界"></a>

## Notion reminder Evidence and Boundaries

Verify the original Block API archives of the actual imported batches: original reminder `mention.date` It's just start/end/time_zone and it's not a code.`annotations.color` For the `default`，`plain_text` YesISO Time is the time.href For thenull；Full ofJSON Not foundreminder/alert/notification Fields. Local results are drawn`.run/logs/notion-reminder-evidence.json`The first is the "Foreign" and the second is the "Foreign".

The date object that exposes API and the official SDK type also only have these date fields. See [ date attribute ](https://developers.notion.com/reference/page-property-values#date), [ official SDK common.ts ](https://github.com/makenotion/notion-sdk-js/blob/main/src/api-endpoints/common.ts). Alerts cannot be inferred based on time or client red alone.

The need to distinguish publicly integrated API from client internal data. Historically, unofficial clients [notion-py](https://github.com/jamalex/notion-py/blob/master/notion/collection.py) of `NotionDate.from_notion` Read the internal date objects clearly `reminder`This indicates that there is a path to recovery of internal data, and does not prove that the current version of the private interface is still available directly; this time no private interface is called, login credentials are read or accessed as imported.

The current import dialog box directly prompts to remind you that the configuration is missing before previewing; the date after the unknown block is restored also triggers a preview warning, but the code example does not trigger it. The imported date menu can restore local reminders according to the original page settings; repeatedly submitting the same snapshot will not overwrite the repaired local reminders. All dates with time are not automatically converted to reminder.

<a id="后续实测当前客户端本地缓存可读取提醒"></a>

### Follow-up actual measurement: The current client’s local cache can read the reminder

2026-10-26 opens the local Notion's `notion.db` (Node SQLite `readOnly: true`) read-only at the user's request, reading the direct child block of the specified page in the same transaction snapshot, without reading Cookies, login credentials, or modifying the database. The ordinary date object does not have reminder, and the target datetime object still has an explicit `reminder: { unit: "day", value: 0, time: "09:00", defaultTimeZone: "America/Los_Angeles" }`, whose start_date is 2026-10-24 and start_time is 09:00.

The corresponding text block is `402e9d4d-a1d7-806a-99b4-f89e6f2799e2`, the cached version is 117, and the last_edited_time is `2026-10-26T15:53:59.832Z`; the field is located at `properties.title.4.1.0.1.reminder`. The partial export `.run/notion-reminder-field.json` contains the source page/block identity, cached version and extraction time; the repeatable read-only extraction script is `.run/read-notion-reminder-cache.mjs`. There is no export of the entire database or extraneous page text.

This test proves that the current native client cache can still provide the real reminder and is no longer just a clue to the historical unofficial client. It does not prove that public API provides this field, nor does it prove that the cache is completely consistent with the cloud at this time; this time, the cloud data has not been retrieved, the private HTTP interface has not been called, the local vault or Notion page has not been modified, and automatic import has not yet been connected. Subsequent supplementary imports need to verify cache freshness, original page/original block identity and date position, and local modifications cannot be overwritten simply by the same date.

<a id="后续接入"></a>

### subsequent access

On the same day, the API + SQLite date has been supplemented, and the original evidence is recorded separately from the "not yet connected" time point above. For the current import process, cache update method and other block field investigation, see [ Notion SQLite Audit ](../audits/NOTION-SQLITE-2026-10-26.md), and for user operations, see [ Notion Import ](../features/NOTION-IMPORT.md). Existing local pages are not automatically overwritten.

<a id="验证"></a>

## Validation

- Full `npm test`: 1, 083 items, 1, 078 passed, 5 skipped, 0 failed. Log `.run/logs/asset-uuid-cleanup-unit.log`.
- Type checking, production build and desktop build pass. The directional asset/page/import single test 25 item and the new clean boundary single test 5 item passed.
- Chrome related regression covers 29: After the first round of newly added test grammar errors were corrected, 28 was run again, with 1 already having an attachment filtered as the only add-on sharing attachment. After being renamed to a name-curated filter, the attachment file 7 was reviewed and the remaining 22 items were passed in the previous round. After the completion of all the test cases, the isolation test service is out of stagnation, and the test service is only terminated after verifying the process identity, and runner normally leaves and reports 7 passed logs. `.run/logs/asset-uuid-cleanup-browser.log`、`.run/logs/asset-uuid-cleanup-browser-final.log`、`.run/logs/asset-uuid-cleanup-attachments-final.log`. Not running the full browser suite.
- Tests use a temporary repository, standalone Chrome, and a dedicated recycle bin alias, covering exclusive/shared attachments, Trash and recovery, subtrees, unknown attributes and byte recovery, conflict drafts, HTML dependencies, global metadata, symbolic links, and recovery failures. There was no deletion test with user files, and no real system recycle bin acceptance was run.
- Desktop installation package: `.run/attachment-uuid-release/Notdown-Setup-0.1.3-x64.exe`. Log `.run/logs/asset-uuid-cleanup-desktop.log`. The currently installed program has not been replaced, and the new naming and automatic cleaning will take effect after installation.
