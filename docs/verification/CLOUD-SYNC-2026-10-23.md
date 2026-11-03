<a id="多设备云同步验证2026-10-23"></a>

# Multi-device cloud sync validation (2026-10-23)

**English** · [简体中文](CLOUD-SYNC-2026-10-23.zh-CN.md)

Scope: Desktop Node vault, mobile shared vault core, Android touch screen interface, Supabase synchronization SQL and transmission protocol. For product entry and deployment steps, see [ cloud synchronization instructions ](../features/CLOUD-SYNC.md). This time, deployable code and configuration steps are delivered according to the user's choice. No real Supabase project is created or connected.

<a id="已验证"></a>

## Verified

| Check | result | local evidence |
| --- | --- | --- |
| `npm ci` | Complete | `.run/logs/sync-install.log` |
| `npm test` | 966 item, 961 passed, 5 skipped, 0 failed | `.run/logs/sync-release-unit.log` |
| Synchronous dedicated unit/service testing | 21 items passed and are included in the full results | `.run/logs/sync-targeted-final.log` |
| `npm run test:sync` | Desktop and mobile terminal isolation construction passed; cross-end browser process 1 items passed | `.run/logs/sync-release-browser.log` |
| Desktop saving and conflict directed regression | 33 entry passes; using `npm run test:e2e -- ...` and standalone build/port | `.run/logs/sync-desktop-regression.log` |
| Functions have returned to the mobile terminal | 7 items passed | `.run/logs/sync-mobile-regression.log` |
| `npm run android:build` | The build was successful; the native file test results showed no failures in 5 items (unchanged tasks were reused by Gradle) | `.run/logs/sync-release-android.log` |
| Interface verification | Viewed actual browser screenshots: desktop settings, mobile phone conflict comparison and settings; mobile panel has no horizontal overflow | `test-results/sync/` |

The cross-end process uses independent Chrome and Pixel 7 touch screen configuration: create a cloud vault on the desktop, log in to the same account on the mobile phone and download, edit when the mobile phone is disconnected, concurrently modify the desktop, conflict when the mobile phone restores the network, view the common baseline and red-green differences, upload after merging, download on the desktop, and retain the content when reloading on the mobile phone. Logging in again will retain the original vault association.

Special tests cover original Markdown/BOM/CRLF, unknown attributes, database and view identities, JSONB key sorting, contacts and binary attachments, concurrent modifications to different pages, same page conflict reuse, offline and lost response recovery, new input during download, delete pair editing, path crossing interception, credential exclusion backup, local transaction interruption recovery, external modification protection, replacement of old conflicts by new versions, and original byte preservation of compact resource history and replaced attachments.

Cloud SQL is actually executed in PostgreSQL/WASM; the test confirms account isolation, RPC version verification, idempotent result replay, prohibition of bypassing RPC table writing, attachment RLS, block reuse, refresh session and migration repeated execution. The Auth and attachment HTTP services under test are adapters and are not equivalent to verifying the full service behavior of hosted Supabase.

<a id="交付"></a>

## Delivery

- Cloud migration: [ server/sync/supabase.sql ](../../server/sync/supabase.sql).
- Configuration steps: [ docs/features/CLOUD-SYNC.md ](../features/CLOUD-SYNC.md).
- Android debug APK: `.run/android-release/Notdown-Android-sync-debug.apk`, copied from the final built standard debug APK, individually named for easy identification.
- The table is normally `npm run dev` or `npm run desktop` Starting withWorkspace settings ConfigurationCloud sync；The phone isNotebook options → Cloud sync。

<a id="未覆盖与边界"></a>

## Uncovered and Bordered

No real cloud projects have been deployed, no real Android devices/WebView, app store distribution, device background networking or multi-account collaboration have been verified. The entire desktop browser suite is not running this time; the above 41 items are targeted coverage of the synchronization process and affected functionality. Currently only experimental front-end sync is committed, with no WorkManager background transfer or end-to-end encryption.

An early move build output was to `src/mobile/.run/sync-mobile-frontend/`; subsequent scripts have been corrected to `.run/sync-mobile-frontend/` under the repository root. Deletion of the early temporary directory is blocked by the tool approval policy, and the ignored directory is retained and does not participate in the final build, test service, or source code submission.
