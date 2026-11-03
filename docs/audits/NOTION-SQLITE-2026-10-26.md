<a id="notion-桌面-sqlite-与公开-api-对照2026-10-26"></a>

# Notion desktop SQLite and public API comparison (2026-10-26)

**English** · [简体中文](NOTION-SQLITE-2026-10-26.zh-CN.md)

<a id="2026-10-27-补充双颜色的实际恢复来源"></a>

## 2026-10-27 addendum: actual recovery sources for dual colors

For the user-specified Minor tests page, the local cache, the original API archive of three imports of the page, and the Markdown retrieved by the connector were checked. Only read-only investigation and verification of independent replicas, no modifications to Notion or the existing vault.

Found that the same text fragment can be cached `properties.title` There are two items in the same format array at the same time `h` tags, e.g. `pink_background` with `red`, another fragment is `yellow_background` with `blue`. This proves that the dual colors still exist in the local cache, and there is no need to guess the color based on the screenshot; it cannot be inferred from the fact that the public Rich Text has only one color field and only one item is saved internally.

A more direct discovery is that the public interface projections on this page are complementary: the archive Markdown v2 retains the red/blue text of the two paragraphs, and the same block of Block API retains the pink/yellow background corresponding to the rich-text range. Merging the two restores the two styles, and the results are consistent with the cache independently. It is a verification of a real sample at this time and is not a guarantee that all pages, colors or versions will complement each other.

The validation script requires unique full-block plain text matches and only processes confirmed text in the run range; no position guessing via global replacement or repeated phrases. After recovery, parse again, assert that the text and all non-color inline formats remain unchanged, and then check with the cached double tags. Independent Chrome checks the calculated text color and background color of the two restored sections, both of which are correct. The sample API block time is at minute granularity, and the cache is at millisecond granularity; the same minute and the same text cannot be used as proof that any future snapshots will be synchronized. When automatically accessing, it is still necessary to distinguish between different periods, repeated text, non-text objects and conflicting colors, and the old API and the new cache cannot be unconditionally spliced.

Available sequence: complementary information of Markdown + Block API in the same batch → local cache with verifiable content and version in the same account/workspace → manual verification of HTML export or browser rendering results. Officially, [ HTML can be exported to ](https://www.notion.com/help/export-your-content), but this page has not been exported for verification. There is no guarantee that the two colors will be retained when exporting HTML.

Research scripts and private evidence only contain `.run/`: `inspect-notion-color-recovery.mjs`, `recover-minor-test-colors.ts`, and `render-color-recovery.mjs`, and the output is `.run/logs/notion-dual-color-recovery-audit.json` and `.run/logs/notion-color-recovery-proof.json`. Recovery copies, HTML previews and screenshots are in `.run/color-recovery/` and are not written to the vault as user pages. This investigation first completed the feasibility verification of the actual sample; later on the same day, [ was connected and officially imported into preview ](../verification/NOTION-COLOR-RECOVERY-IMPORT-2026-10-27.md). The current scope and boundaries are based on this record and functional documents.

<a id="范围与方法"></a>

## Scope and method

To this machine `%APPDATA%/Notion/notion.db` Use Node `node:sqlite` of `readOnly: true`, read within a transaction. All blocks only count type, field name and CRDT presence; actual attribute values are limited to user-provided Test / Blocks pages and their `content` Descendants. No authentication record values, cookie, tokens were read, and no Notion or existing vault was modified. The statistics include cache lines in the history, deletion, and account dimensions, and do not represent the total amount of the current workspace.

This is a snapshot of 27 , 936 a block cache line, 44 internal types, 22 and 936 line bands. `crdt_data`The Blocks page is down. `content` The only block of 90 that contains roots and subpages, missing the reference to 0. This figure only proves that the old-fashioned content record of the path is complete, without covering database query results, attachment bytes, synchronized references and other pointers.

A total of 115 date objects are seen in the active block attributes: 96 date, 18 daterange, 1 datetime; 10 declares the relative format, and the remaining 105 does not declare the format, and only the target datetime has a reminder. Currently, the actual value of the local reminder only covers `day/value:0/time:09:00`; the automated testing of other advance amounts and DST does not mean that all reminder forms of the real client have been accepted.

Local survey output is at `.run/notion-cache-audit.json` , `.run/notion-cache-details.json` , and `.run/notion-cache-shapes.json` , private content snapshots are not submitted. The initial date specific script is `.run/read-notion-reminder-cache.mjs`.

<a id="字段差异"></a>

## Field differences

| data | SQLite actual measurement | Current public interface comparison | Conclusion |
| --- | --- | --- | --- |
| In-line dates/reminders | `properties.title`The `d` annotation contains `reminder`, `date_format`, time zone and time | The original Block date only has `start/end/time_zone`; the original v2 and `<date>` lack reminders and formats. | Verifiable reminder and known date format supplements have been inserted; it is not a guess based on time. |
| Ordinary text, 1-4 level titles, lists, to-dos, quotes, folds, formulas | `properties`, `content`, color, etc. | Block API / v2 already provide most of the semantics; currently API supports`heading_4` | It cannot be regarded as the unique ability of cache; cache can be used as an offline conversion source |
| simple form | `table_block_column_order`, `table_block_column_format`, column title | The Block API table does not contain specific column widths, but the original v2 on this page already has`<col width="239.666…"/>` | Column width cannot be generalized and cannot be obtained by all API |
| Columns | `column_ratio` | Block API `width_ratio`, v2 `column ratio` already exist | No additional private agreement required |
| Images, audio/video and embeds | `block_width/height`, `block_full_width/page_width`, `block_aspect_ratio`, `block_alignment`, `image_edit_metadata`, `original_source`, etc. | Block API mainly provides files and captions; the v2 video on this page does not have these size settings. | Additional display information exists; these fields are not automatically converted to local styles this time. Not all blocks have all fields |
| Page display | `page_full_width`、`page_small_text`、`page_cover_position`、`block_locked`、`page_floating_table_of_contents` | Page API does not provide the same complete client display configuration; the icon and cover itself are public fields | Supplementary appearance can be studied; locks and permissions are not directly transplanted into Notdown security rules |
| button | this page`format.automation_id` | Block API is `unsupported` + `block_type: button`, v2 is unknown | The real action needs to be associated with workflow; the ID associated with this page is not found in `workflow` or general `records`, and cannot be restored to an executable action. |
| AI block | This page is `ai_block_configuration_menu: {type: custom, version: 3}`; other caches also have `ai_prompt_key` and `ai_last_edited` field names. | The original import only has unknown/unsupported and does not expose the complete configuration | There are additional configuration clues; there is no complete prompt word based on this, and there is no transferable model credentials or running capabilities. |
| form | `form_layout_pointer` | Form block content may still be unsupported; View API already supports form configuration | The pointer is not the layout ontology; the associated record must be parsed, and the form cannot be declared restored based on the existence of the field. |
| meeting minutes | `transcription_state/history`, default title, notes/summary/transcript ID, model and template field names | Currently API `meeting_notes` and v2 can provide generated content | The running status, history and internal related information are richer; the text is not entirely unobtainable from API |
| Sync block, alias | `transclusion_reference_pointer`, `alias_pointer` , source block ID | Sync block source ID is public; v2 alias may only be given to unknown | The pointer can assist positioning. When the source block is missing/out of range, it cannot be regarded as the complete text. |
| External object, Drive, Figma | External properties, URIs, integration IDs, etc. | Some are unsupported, Markdown capabilities vary depending on the type | Only snapshots and references are cached locally, and the complete content or authorization capabilities of external services are not included. |
| Databases and Views | `collection.schema`, `collection_view.format/query2/page_sort`, including column display, freezing, grouping, gallery, timeline, chart, etc. | Currently View API has exposed `filter/sorts/configuration` and multiple layouts | It can no longer be said that views cannot be read using public API. Whether internal details are missing must be checked item by item. The fact that the existing Notdown does not reproduce all views does not mean that API is missing. |
| Comments, permissions, users, etc. | Single table, discussions and several labels | There is a public Comment / User interface, but the capabilities and sharing scope are limited | Do not mistake "The current importer is not called" as "API is not supported"; permissions and accounts are not imported |
| Edit internal information | `version`, `crdt_data`, copy source, millisecond editing time, etc. | Public API does not have complete CRDT operational status and client version vectors | It is valuable for recovery and diagnosis, but it is not block content that can be directly appended to the text. |

44 class internal block: text, bulleted_list, to_do, sub_header, page, numbered_list, image, sub_sub_header, code, table_row, header, quote, divider, column, header_4, embed, column_list, table, toggle, alias, link_to_page, equation, collection_view, bookmark, collection_view_page, table_of_contents, file, callout, video, transcription, external_object_instance, transclusion_container, tab, pdf, audio, ai_block, button, breadcrumb, transclusion_reference , figma, drive, copy_indicator, personal_home_page, form. The above classification is based on the field shape and the actual value of the selected page, and does not claim to complete the full restoration of each object.

<a id="多久缓存一次"></a>

## Cache update frequency

Fixed N minutes cannot be given. Notion official technical description: The offline page subscribes to the page version update push, and pulls the changes after receiving it; when reconnecting to the Internet, compare the client `lastDownloadedTimestamp` and the server update time to make up for it. The coverage and retention time of the normal SQLite cache is originally that of best effort. [ official storage and synchronization instructions](https://www.notion.com/blog/how-we-made-notion-available-offline)

The local `offline_page` is currently the 0 row, and the Blocks page is not marked as a complete offline page. `offline_download_metadata.last_executed_at` records the task execution time; `meta_last_access_timestamp` is the access time; `last_edited_time` is the editing time; the database file modification time cannot be regarded as proof that a certain page download is completed or the cloud is latest. This time, no source pages were manually modified to measure latency, and real-time caching is not promised.

It is recommended to open the required source page on the Notion desktop and wait for synchronization. When reliable offline content is required, it can be set in Notion **Available offline** and wait for the download to complete. Official current description: Subpages need to be downloaded separately, and the database will only automatically include the 50 row before the first view; the paid plan will automatically download recently visited and favorite pages. It cannot be inferred that the entire workspace is complete from "This page is cached".[Official offline instructions](https://www.notion.com/help/use-pages-offline)

<a id="能否只用-sqlite-导入"></a>

## Can imports rely on SQLite alone?

Local snapshot import of cached pages is possible: Select root page and account → Traverse and verify reference graph → Convert known internal blocks to existing Markdown dialect → Missing/unknown preserved sources and original records → Preview → Create copy via `createVault.importBatch`. Reminders and partial appearances will be more complete than pure public API, and the core text can be independent of token or the Internet. This is a technical feasibility conclusion. This delivery is a API + SQLite date supplement, and the SQLite-only import entrance has not yet been provided.

The SQLite file cannot be exported as a full workspace: the machine does not guarantee complete offline pages; database records are determined by queries rather than looking at `content` alone; attachment records are mostly URL instead of file bytes; the associated objects of workflow/form/AI may not be downloaded; there are additional dependencies on synchronization, alias and external integration. 22 and 936 rows of CRDT data cannot be declared lossless just after discarding useless fields. It must be confirmed that the materialized state of `properties/content` is consistent with CRDT and unknown data is retained. The table structure belongs to the client's internal implementation and may change during upgrades.

Therefore, public API is currently preferred to obtain accessible pages and complete pagination, and SQLite is used to supplement missing fields. Standalone SQLite importers must explicitly display missing blocks, missing database record ranges, remote attachments, and cache times, not silently skip, and not execute buttons or automation in the source.

<a id="本次接入与验证"></a>

## Integration and validation in this change

The implementation is located in `server/notion-desktop-cache.ts`, `server/notion-import.ts` and the import dialog. The server only accepts `useDesktopCache` Boolean selections; fixed Windows paths, does not accept any local path parameters; SQLite read-only transactions, account/workspace restrictions, block number and byte limit. Only API read blocks are used to check the date list and single page uniqueness; API compares the editing minutes when the time is minute granularity, and requires exact equality when returning sub-minute precision. Each time Preview re-reads the cache for pages that need to be replenished, the Notdown side polling cache is not retained. The original date object actually used is archived with the block version, participates in importing identities, and does not modify existing user pages.

Actual measurement reminder: 2026-10-24 09:00 America/Los_Angeles, internal `reminder={unit:day,value:0,time:09:00,defaultTimeZone:America/Los_Angeles}`, converted to `2026-10-24T16:00:00.000Z`. The real cache field reading has been verified; the new snapshot of the online public API has not been re-pulled with token, and the automated access verification uses simulated API and temporary SQLite, which cannot be said to have completed the end-to-end acceptance of the real cloud.

The unit covers read-only and account isolation, real structure conversion, old cache, duplicate dates, unknown settings, DST, original text boundaries, archiving, idempotent identity, official syntax and closing supplements; the browser covers preview selection, reminder menu after saving/reopening.

- All units run serially `npx tsx --test --test-concurrency=1 tests/unit/*.test.ts`: 1, 088 items, 1, 083 passed, 5 skipped, 0 failed. Log `.run/logs/notion-cache-unit-serial.log`. Default concurrency `npm test` first encountered the assertion of the old reminder copywriting, and after correcting the copywriting, it encountered Node `UNKNOWN` source file reading and temporary vault writing errors in two rounds respectively; no relevant page-order/sync implementation was changed to avoid it, and the test concurrency was reduced and all passed.
- After the editing time accuracy was supplemented and verified, the newly added 5 directional single test passed again: `.run/logs/notion-cache-targeted-final.log`.
- Actual native SQLite read and old API archive reject supplementary verification: `.run/logs/notion-cache-live-read.json`; only the new cache field is read, the old interface snapshot of 10 month 23 is not mixed with the 10 month 26 cache, and the local modified date is not overwritten.
- Production `npm run build`, desktop build and final type check passed. When running in the installation package, confirm Electron 44.4.5 / Node 24.21.0 / SQLite 3.53.4 and log `.run/logs/notion-cache-electron-runtime.json`.
- Chrome date and meeting date 13 item passed; v2 imported 4 item re-inspection passed (`.run/logs/notion-cache-browser.log`, `.run/logs/notion-cache-browser-final.log`). The first round of new duplicate preview tests missed filling in the token that had been cleared according to the existing security behavior, which has been corrected; the old import use case in the same round timed out while waiting for the title and passed the independent re-inspection. Not running the full browser suite.
- Finally, the above 17 items were combined and re-run, and all assertions passed. The isolation service is stalled during the exit phase; after checking the exclusive port 4341, PID and `node --import tsx tests/e2e/server.ts` commands, only the temporary service is ended, and runner then exits with 0 and reports 17 passed. The user Notdown/Notion process is not stopped. Log `.run/logs/notion-cache-browser-complete.log`.
- Installation package `.run/notion-cache-release/Notdown-Setup-0.1.3-x64.exe`, the existing installation on this machine is not automatically replaced; you need to install the new package and re-preview and import it. The cache is only used in this preview and does not automatically repair existing user content in batches.

<a id="对照来源"></a>

## Comparison sources

- [Block API ](https://developers.notion.com/reference/block): Supported block fields, unsupported, tables and media.
- [Rich text ](https://developers.notion.com/reference/rich-text): Publication date mention.
- [View API ](https://developers.notion.com/reference/view) and [ Working with views ](https://developers.notion.com/guides/data-apis/working-with-views): Existing view capabilities to avoid following the outdated conclusion of "no views are open".
- For the original public evidence of API and Enhanced Markdown, see[Previous reminder to verify](../verification/ATTACHMENT-UUID-CLEANUP-2026-10-26.md#notion-reminder-evidence-and-boundaries)。
