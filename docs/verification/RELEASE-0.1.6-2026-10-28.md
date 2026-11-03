<a id="windows-016-发布验证2026-10-28"></a>

# Windows 0.1.6 release validation (2026-10-28)

**English** · [简体中文](RELEASE-0.1.6-2026-10-28.zh-CN.md)

<a id="发布范围"></a>

## Release scope

According to the user's explicit selection, all currently unsubmitted source code, documents and tests are summarized, and the version is upgraded from 0.1.5 to 0.1.6. Main content:

- There are five layouts of database Table, List, Gallery, Board and Calendar, view/attribute floating layer and data source creation, access and relationship viewing.
- Notion Wiki, view and inline picture import supplement; custom v3 AI block restores prompt words and the complete supported output subtree from the matching desktop cache.
- The normalization of official Notion carriers is compatible with legacy source code retention, Mermaid preview, and ordered list number and date display.
- Sub-page entry settings and resumable batch writing, sidebar level and database sub-item settings, external reference check and page reading directory adjustment.
- Desktop Notion token encrypted save, system proxy bookmark reading and cover candidate, unified window title and native title bar color.

Instructions for use are maintained in `docs/features/` and `docs/reference/` respectively. Root README only synchronizes the user capability boundaries of the database layout and does not add item-by-item repair logs.

<a id="验证结果"></a>

## Verification results

| Check | result |
| --- | --- |
| `npm test -- --test-concurrency=1` | 1, 190 passed, 5 skipped, 0 failed |
| `npm run desktop:dist` | TypeScript, Vite, Electron main process and NSIS build through |
| Related Chrome regression | 115 different use cases all passed; including the rerun after correcting the positioning of the old pop-up window name |
| Desktop testing of actual packagers | 11 item passed, using temporary user configuration and temporary vault |
| Package content inspection | Version 0.1.6, including AI cache recovery and encrypted token storage, excluding mobile native dependencies |
| Chinese and English README | 110 / 108 lines, relative file links are valid |
| Native installation | NSIS Silent upgrade exit code 0, product version after installation 0.1.6.0 |
| Post-installation files and settings | exe and app.asar's SHA-256 are consistent with the test products; the vault selection setting hash remains unchanged. |

The Chrome use case is run through a stand-alone test service and a temporary vault, without connecting to the user's browser. Desktop testing uses `.run/desktop-release/win-unpacked/Notdown.exe` and independent temporary profile, covering system agents, vault isolation, encrypted token restart recovery, title bar, close save, tray and single instance recovery, exit save failure and conflict protection.

The first group of 26 items in the browser passed; the extension group passed the 84 item first. The sidebar use case timed out due to finding the old pop-up window name `Add a new view`, and the remaining 4 items were not run. After updating the test positioning to the current `New view`, all 6 items in the sidebar and tab page passed, of which 1 items are retests of the passed use cases. This correction only involves test positioning, and the installation program remains consistent with the source code that has passed desktop testing.

Back up the original 0.1.5 program to `.run/desktop-backups/` before installation. The update only replaces the program files, the user vault is not migrated or rewritten, and the vault selection configuration remains unchanged byte by byte.

<a id="保留边界"></a>

## preserve boundaries

- The complete action migration of ordinary Button has not yet been implemented: SQLite of the checked sample is only associated with ID and has no action definition; the type placeholder is not regarded as an executable button. [ AI / Button special records](NOTION-AI-BLOCK-RECOVERY-2026-10-28.md)
- AI automated verification uses controlled Block API/cached samples; the real cached `hi` and `Hi!` have been verified for conversion, but the entire chain import acceptance of real cloud token has not been completed. Notion models, running services and automatic updates are not migrated.
- This time is not a full browser, Android real machine or real cloud synchronization acceptance; the installation package has not yet been signed, and the existing synchronization, format and external service guarantees will not be expanded.

Detailed build, test, installation hash and backup paths are saved in `.run/logs/release-0.1.6-*` and do not enter Git; the installation package is `.run/desktop-release/Notdown-Setup-0.1.6-x64.exe`.
