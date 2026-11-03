<a id="android-full-page--inline-数据库验证2026-10-25"></a>

# Android full-page / inline database validation (2026-10-25)

**English** · [简体中文](ANDROID-DATABASES-2026-10-25.zh-CN.md)

<a id="本次范围"></a>

## This scope

- mobile phonePages andNotebook Added menuDatabases / New database；Page trees reuse database hosts and records attributed to projections, and are compatible with older resources without host pages.
- Ordinary page Insert block can create Full page / Inline database; inline continues to follow the `notion_databases` capability boundaries of the current dialect and saves the existing official reference syntax.
- The shared database workspace supports titles, icons, table properties, records, new fields and views, search, filtering and sorting. The wide table scrolls independently horizontally; use OPEN on the mobile phone to enter the complete record page. The attributes and text share a page draft, and use Back to database to return.
- The mobile terminal's local status, database creation, field definition update and view creation interfaces are completed. Writing still passes through `createVault`; the page and the original version of the field enter the record recovery draft together.
- Database, inline input and record pages are saved before navigation, view switching, synchronization or backup. Conflicts prevent leaving and retaining drafts; the current database and its resources are only refreshed when there is no pending input after cloud synchronization is complete.

Use of entrance and border sights[Database Guide](../features/DATABASES.md#mobile-usage)and[Android guidelines](../features/ANDROID.md)。

<a id="自动化结果"></a>

## Automated results

| Validation | result | local log |
| --- | --- | --- |
| `npm test` | 1022 passes, 5 skips, 0 fails | `.run/logs/mobile-databases-all-unit.log` |
| `npm run build -- --outDir .run/mobile-databases-desktop-frontend` | TypeScript passes with desktop build | `.run/logs/mobile-databases-desktop-build.log` |
| `npm run mobile:build -- --outDir ../../.run/mobile-databases-frontend` | TypeScript and mobile phone build pass | `.run/logs/mobile-databases-build.log` |
| `npm run test:e2e -- tests/e2e/database-inline.spec.ts tests/e2e/database-hierarchy.spec.ts tests/e2e/databases.spec.ts` | 15 Passed, using isolated desktop frontend, port 4359 and temporary vault | `.run/logs/mobile-databases-desktop-e2e.log` |
| `npx playwright test -c tests/e2e/mobile.config.ts` | All 35 passed, using isolated mobile frontend and port 4357 | `.run/logs/mobile-databases-all-mobile-e2e.log` |
| `npm run android:build` | APK and Gradle JVM tests passed | `.run/logs/mobile-databases-android-build.log` |

The mobile browser tests four new features:full-page Create fields/Options/recording page editing and saving views;inline Edit, switch source, reload and complete table navigation; conflict and recovery of older versions of both windows;WebDAV The test is available from the computer.full-page / inline Database. Last host that was comparedMarkdown Bytes and unknown page and database fields are still maintained.schema The recovery of conflict is`tests/unit/mobile-databases.test.ts` Coverage.

The field type locator and the CodeMirror hidden view read assertion in the first round of new browser tests have been corrected. In the end, all 35 items passed when running on all mobile phones. The desktop scope is three database test files, which does not mean that the entire desktop browser suite has passed.

<a id="产物与视觉检查"></a>

## Product and visual inspection

- APK: `.run/android-release/Notdown-Android-debug.apk`; leave aside `Notdown-Android-databases-2026-10-25.apk` for this snapshot.
- Viewed screenshots: `test-results/mobile/mobile-mobile-full-page-da-c7e17-views-and-edit-record-pages/mobile-full-database.png` and `test-results/mobile/mobile-mobile-inline-datab-8809f--open-full-pages-and-reload/mobile-inline-database.png`. The complete database return button is arranged separately from the title; the toolbar and table do not stretch the mobile page.

<a id="验证边界"></a>

## Validation boundaries

There is no connected ADB device this time, it is not installed on the mobile phone, and there is no real Android WebView, soft keyboard or touch horizontal scrolling acceptance. Chrome Pixel 7 simulation and isolation WebDAV services and JVM tests cannot replace real machines or real cloud service acceptance; they do not expand production synchronization or background synchronization guarantees.
