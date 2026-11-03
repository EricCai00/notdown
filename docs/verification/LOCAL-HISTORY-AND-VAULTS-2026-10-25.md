<a id="本地历史与多知识库验证2026-10-25"></a>

# Local history and multiple-vault validation (2026-10-25)

**English** · [简体中文](LOCAL-HISTORY-AND-VAULTS-2026-10-25.zh-CN.md)

Scope: timely preservation of the history sampling separation, the selectable Git history separately from each library, single-page preview/reset, name library directories, and data migration in-house.[vault metadata](../features/VAULT-METADATA.md#automatic-history-and-version-recovery)and[Running configuration](../architecture/DEVELOPMENT.md#selecting-a-vault)。

<a id="实现与边界"></a>

## Realization and boundaries

- Automatic storage is still in place `createVault` and `baseRevision` Counter-testing. Default 5 minute sampling of each page; stop adding 120 seconds after; no substantive changes are saved and do not change revision.
- Automatic snapshots retain 30 days by default, with a maximum of 100 per page. Only automatic versions managed by the new index and whose bytes still match are cleaned; old history, unknown files, external changes, conflicts, and protected versions are not cleaned.
- Local Git uses per-base `.notdown/git-history.git/` , logging body, page-split properties, additional top-level metadata and contact text; does not commit attachment bytes, service configuration, sync credentials, or old history. There is no remote and automatic upload. Git long-term versions are not deleted according to the automatic snapshot retention period.
- The page menu can view the local snapshot and the latest 100 Git submissions involving the page, preview the source code/attributes/text differences, and then restore the target page. Reject overwriting when external modifications occur after previewing, and retain the current content and restoration proposals. Protect the current version before restoring without rolling back other pages or the entire metadata.
- The saved text is retained when Git is missing, the managed configuration is modified, or the operation fails. Android continues to use shared automatic snapshots; the Android Git runtime is not added.
- The data directory directly contains the named library without adding the `vaults/` layer. The welcome page supports the creation and discovery of multiple libraries in the data directory, and still supports opening existing libraries in any location. The vault in the old warehouse will continue to be compatible with reading when the new path is not configured and will not be automatically migrated.

<a id="本机迁移结果"></a>

## Native migration results

The current library of this machine is `D:\ProgramData\Notdown\Default`; the data root directory also retains an independent `backups/`. The local `.env` configuration data root directory and `Default` name, and the latest directory on the desktop have been updated synchronously. Neither the data nor `.env` are tracked by the source code Git.

The original ZIP was created before the migration and was archived in stages. **7,289 A document**The size and SHA-256 match;**219 The page**revision (including recycling stations) has not been changed. Old historical files have not been deleted or converted in bulk.

Backup location: `D:\ProgramData\Notdown\backups\Default\before-local-git-20261025-101229.zip`. This is a native recovery copy, not a test fixture in the warehouse.

The current library has local Git enabled. The baseline contains 219 text, 219 page attributes, 1 top-level metadata and 1 contacts, a total of **440 text files**; confirm that there is no remote end, `git fsck --full` passes. After restarting, the 4317/4318 services all point to `Default`, and the status of Git is normal.

Local evidence is stored in `.run/logs/multivault-migration-2026-10-25.json`, `multivault-manifest-2026-10-25.json`, `multivault-pages-before-2026-10-25.json` and `git-history-live-verification-2026-10-25.json`; these logs do not enter source code version management.

<a id="自动验证"></a>

## Automatic verification

| Validation | result |
| --- | --- |
| `npm test` | 1, 041 items: 1, 036 pass, 5 skip, 0 fail/cancel |
| Final history and directory targeting unit/service tests | 11 entries pass; includes Windows retention ID not overwriting each other, configuration failover, CAS, unknown fields, retention policy, and ZIP exclusion temporary Git lock |
| `npm run build -- --outDir .run/history-final-frontend` | Passes, includes TypeScript check; retains existing bundle volume prompt |
| Isolate Chrome historical browser testing | 3 passes: Preview recovery, external modification conflicts, Git enabled and named checkpoints |
| `npm run test:desktop` | 4 passed: named library isolation, dual library draft/import, save before closing/reopening, conflict prevention closing |

The complete unit runs explicitly using `NOTDOWN_RSCRIPT=C:\Program Files\R\R-4.2.2\bin\x64\Rscript.exe` on the current machine, bypassing Windows's outer R launcher interference with test cancellation; no changes to the R runtime code or user configuration are made.

All `npm run test:e2e` failed: planned 685, and stopped after running to the result of 495. 437 passed, 30 skipped, and 28 failed were recorded. Among them, the newly added Git setting test used the 7 second assertion for the first time, and encountered a timeout in the initial baseline scan of the full set of shared temporary libraries; the repeated initialization scan has been removed and the waiting time for this operation has been relaxed. In the end, all 3 items passed in the isolated rerun. Other failures involve syntax directory counting, extension boundaries, editor insertion/drag, footnotes, Notion images, etc.; without reproducing the baseline in the workspace before this modification, it cannot be determined that all are caused by the existing changes, nor can it be claimed that the entire set of browsers has passed the regression. The log is `.run/logs/git-history-browser-full-2026-10-25.log`.

The directed test logs are `.run/logs/git-history-targeted-final-2026-10-25.log`, `git-history-browser-final-2026-10-25.log`, and `git-history-desktop-final-2026-10-25.log`. Manually viewed the history preview, Git settings and naming library welcome page screenshots. There is no redistribution of installation packages, installation of Android APK, or verification of cloud Git history synchronization.
