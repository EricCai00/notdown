# Android active sync continuation — 2026-11-07

**English** · [简体中文](ANDROID-ACTIVE-SYNC-2026-11-07.zh-CN.md)

## Scope

Android 0.1.4, version code 5, on one physical Android 17 / API 37 phone. The APK targets API 36 and supports API 26 or later; this record does not establish acceptance for every supported Android version or manufacturer.

The acceptance application used the separate ID `app.notdown.mobile.syncacceptance`, an independent private replica and 240 synthetic pages. The final run used an existing HTTPS WebDAV account with an isolated temporary notebook under `Notdown-checks/accept-*`. The source connection was read without modifying it; production vault contents were not used as fixtures. Notifications were allowed and the app's battery policy was unrestricted.

## Physical-device results

| Check | Observed result |
| --- | --- |
| Download after Home | Started while visible, returned to Home before completion, then downloaded all 120 pages |
| Subsequent screen-off download | Started while visible, turned the screen off before completion, then downloaded another 120 pages |
| Quiet interval | No ADB polling for 45 seconds during the screen-off transfer; the screen remained off at verification |
| Content integrity | All 240 Markdown byte hashes matched their downloaded sources; every expected body was present |
| Recovery state | Zero conflicts, no pending outbox, cloud cursor completed to 240 |
| Execution cleanup | Foreground service and CPU wake lock released after completion |
| No new background run | Cloud request count and last-sync timestamp unchanged for a further 65 seconds |
| Final-run cleanup | Temporary cloud notebook identity verified before deletion; acceptance app private data and temporary local replica removed |

Reports are local artifacts under `.run/logs/`. The harness is [android-sync-device.ts](../../tests/e2e/android-sync-device.ts); setup and optional real-provider acceptance are described in the [development guide](../architecture/DEVELOPMENT.md#android-development).

## Implementation and validation

A native lease wraps the existing shared `synchronize` run. Writes retain `createVault`, revision checks and recoverable conflicts with `baseRevision`. Native activity pause/resume state gates new runs before and after editor saves; WebView visibility alone is insufficient on devices that report a visible document with the screen off. This never cancels the current run.

Only `GET` and `HEAD` enable stale-connection recovery. Mutation transport retries remain disabled. No periodic background job, alarm, boot restart or `WorkManager` integration was added. The service releases resources on completion or failure, with a 90-minute safety limit and Android's own service timeout.

Automated checks passed: 1300 Node unit/service tests (5 skipped), 45 mobile browser tests, 13 native JVM tests, TypeScript/application build, Android APK build and bilingual documentation checks. Native tests cover stale-read recovery, no mutation replay, and cancellation followed by another request.

This acceptance covers an already-started page sync on one configured device. Force-stop, task removal, process reclamation, exhausted service quotas, network loss and manufacturer restrictions can still interrupt work. Large attachments, prolonged battery-saver modes, roaming and other manufacturers require separate device acceptance. Existing cursor, journal and durable-outbox recovery remain in place.
