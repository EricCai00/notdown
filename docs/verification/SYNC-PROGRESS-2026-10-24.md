<a id="手机同步进度与重复扫描优化验证2026-10-24"></a>

# Mobile sync progress and repeated-scan optimization validation (2026-10-24)

**English** · [简体中文](SYNC-PROGRESS-2026-10-24.zh-CN.md)

<a id="范围"></a>

## range

Cloud sync displays the preparation, reading cloud records, item-by-item download and write, local scanning, uploading and completion stages; provides the current batch/resource, stage progress bar, attachment block size, cumulative upload/download/conflict number and time consumption. Use the activity bar when the total amount is unknown. If there is no progress update for more than 15 seconds, you will be prompted to wait. Failure preserves progress and refreshes the connection state to provide a retry button.

Progress polling reads in-process snapshots, does not scan the vault or add cloud requests, and does not replace persistent synchronization cursors. Ordinary page write transactions are reduced from four full database scans to one; scans are only reused within the same serial write lock and are not cached across resources.

<a id="验证"></a>

## Validation

| Check | result | Log |
| --- | --- | --- |
| `npm test` | 1000 items: 995 passed, 5 skipped; covering item-by-item progress, failure retry, progress interface without file reading, single scan and external editing rejection | `.run/logs/sync-progress-unit-final.log` |
| Supabase block progress project | 7 items passed, including upload and download block sizes | `.run/logs/sync-progress-cloud-final.log` |
| `npm run test:mobile` | 11 items passed; including delayed attachments, 49% progress, waiting prompts, failed retries and reopening the panel | `.run/logs/sync-progress-mobile-final.log` |
| `npm run test:sync` | Supabase / WebDAV two cross-end synchronization, offline editing and conflict postback passed | `.run/logs/sync-progress-sync.log` |
| `npm run test:e2e -- tests/e2e/conflict-diff.spec.ts` | The final desktop TypeScript / Vite build and differential merge check passed; the full desktop browser test was not run | `.run/logs/sync-progress-desktop.log` |
| Android build | After the final mobile build, `cap sync android` and Gradle were successfully built; the 8 native check was UP-TO-DATE, and the results were no failures. | `.run/logs/sync-progress-android-final.log` |
| Mobile phone coverage installation | `adb install -r`Success, the installed APK hash is consistent with the product; the application starts successfully | `.run/logs/sync-progress-install.log` |

Browser screenshot `test-results/mobile/mobile-first-sync-shows-li-b0a5f-retains-failure-and-retries/mobile-first-sync-progress.png` checked, progress and long resource names are readable on narrow screens.

<a id="真机观察与交付边界"></a>

## Real machine observation and delivery boundaries

At the time of the check, the phone already had the 150 page, the cursor was 100, 100 baselines had been saved persistently, and the first synchronization had not yet been completed; WebDAV recorded 25 requests, and there was no cooling record. Repeatedly scanning the entire library page by page in the code will increase the overhead of native file bridging; there is no time-consuming comparison before and after the real machine, no specific speedup multiple is reported, and other network or device reasons are not ruled out based on this.

Confirm again after overwriting the update: the 150 page, 100 baseline, cursor 100 and existing enabled connections are preserved. App data is not cleared. It has not been verified that the real cloud database synchronization is completed after the update; after opening Cloud sync, you can use **Sync now** to continue.

- Installation package: `.run/android-release/Notdown-Android-sync-progress-2026-10-24.apk`.
- SHA-256：`04610C25CF036538637A6F76D6313E3FFE846F959C8D947272258C94B2210F41`。
