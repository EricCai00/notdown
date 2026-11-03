<a id="同步批量落盘优化2026-10-24"></a>

# Sync batch-write optimization (2026-10-24)

**English** · [简体中文](SYNC-BATCH-2026-10-24.zh-CN.md)

<a id="改动"></a>

## Change

The first download and subsequent incremental changes continue to use the existing cloud protocol. Maximum 100 resources per batch; engine limits memory/recovery burden to 8 MiB for text and older versions, retaining itemized paths for larger single resources. The local versions of ordinary pages, properties and contacts are read in batches, and resources matching the original versions are submitted centrally; attachments retain the original block verification path.

The same batch shares a page scan within the write lock, and `metadata.json` is written once. A recovery log retains the original before and after versions of each resource; each file is still compared and replaced according to the original bytes, and recovery accepts the original bytes or completed bytes. Concurrent modifications, file name occupation, and page cycle relationships will still stop related writing and retain conflicts, and force retry without refreshing the version.

Android adds bounded native `replaceMany` storage operation: single call up to 128 files, total 32 MiB raw bytes; fsync and atomic replacement one by one after all preflights. The recovery log has been persisted before the call and can be replayed if the process is interrupted; records that contain deletions or exceed native boundaries continue to use the original recovery path. Common file API continues to be compatible with the original single resource adapter.

<a id="本机性能对照"></a>

## Native performance comparison

Reproduction: `node --import tsx tests/unit/sync-batch-benchmark.ts`. Both paths use the same shared core, memory test cloud and independent temporary disk library. The data is 200 page, 3, 433, 690 byte text. The old path disables the new batch adaptation interface, corresponding to the per-resource implementation that reduced single write scans in the previous version.

| Project | per resource path | batch path |
| --- | ---: | ---: |
| Total time spent | 75,924 ms | 3,128 ms |
| Full database scan | 401 | 5 |
| file reading | 41,607 | 424 |
| `metadata.json`replace | 200 | 2 |
| Traced file system calls | 93,693 | 2,616 |

Log: `.run/logs/sync-batch-benchmark.log`. This is an observation from the desktop Node file adapter, not network speed, real Android first download timing, or production performance commitment; native bridge latency is not simulated. During execution, the machine is still running other checks, and the time taken is only used as a comparison. The number of structural operations is also limited by the test.

<a id="验证"></a>

## Validation

- The full unit check ends with 1007 entries, 1002 passed, 5 skipped, 0 failed: `.run/logs/sync-batch-unit-final.log` .
- Batch-related coverage: 200 page attribute submission twice, byte retention, concurrent modification after download comparison, batch exit halfway through writing, external editing when recovery occurs, file name collision, cyclic relationship, native adaptation replay, and batch size limit when old large pages are shortened.
- Supabase/WebDAV cross-end browser synchronization, offline editing and conflict postback pass: `.run/logs/sync-batch-browser-sync.log`; this command completes the construction of desktop TypeScript and Vite at the same time.
- The final 13 item for the complete return of the mobile terminal passed: `.run/logs/sync-batch-mobile-confirm.log`. The first synchronization use case includes delayed attachments, disconnection and retry after two pages are placed in batches. The first time it passed 10 and failed 1, the dual-window use case was automatically refreshed by the front desk and updated the old version in advance; after passing the independent review, the use case was explicitly kept offline to create an old draft, and was finally confirmed to be passed completely.
- TypeScript Final check passed: `.run/logs/sync-batch-typecheck-final.log`.
- Android Gradle was built successfully, 11 item JVM unit check has no failure, including 3 item newly added native batch preflight, replay and path protection check: `.run/logs/sync-batch-android.log`, `.run/logs/sync-batch-android-final.log`.

A transclusion read error occurred during the initial full unit run; this individual review and subsequent full checks passed without modifications to the implementation.

<a id="安装与范围"></a>

## Installation and scope

Installed and started with `adb install -r` override, the installation hash of APK is consistent with the product: `.run/logs/sync-batch-install.log` . Before and after overwriting, confirm that the 219 page, 271 synchronization baselines, and cursor 274 are retained; no application data is cleared. The real first synchronization has been completed before, so there is no reset of the mobile phone library to measure the first download time of the new version.

- Installation package: `.run/android-release/Notdown-Android-batch-sync-2026-10-24.apk`.
- SHA-256：`B12B24A9B5830EF40331EE2B25BBF4AC1800400212346B21D056BC35F37F25D2`。
