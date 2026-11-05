# Windows 0.1.15 release verification

**English** · [简体中文](RELEASE-0.1.15-2026-11-05.zh-CN.md)

Date 2026-11-05. This release commits the accumulated workspace changes, builds a Windows x64 installer, upgrades the local desktop installation and publishes a GitHub development preview.

## Changes

- Eleven database layouts, including Timeline, Chart, Feed, Dashboard, Form and Map. Timeline adds dependencies and local scheduling. Charts support multiple series, drill-down and image exports. Dashboard widgets combine local database views. Form submissions create local records, and Map displays configured locations.
- Database page icons and covers, Calendar ranges, table column resizing and row selection, view overflow controls and automatically saved settings with recoverable conflict drafts.
- Read-only mind maps and page previews, Gallery preview choices, readable Vault List properties, Wiki view menus and a shared top-bar page view switcher.
- Vault creation and opening forms, Windows folder browsing, saved creation locations, compact sidebar preferences and an owned-service stop command.

Feature details and individual limitations are maintained in [databases](../features/DATABASES.md), [writing and navigation](../features/WRITING-AND-NAVIGATION.md), [vaults](../features/VAULTS.md) and [development](../architecture/DEVELOPMENT.md).

## Verification

- `npm ci` completed. `npm test -- --test-concurrency=2` completed with **1288 passed, 5 skipped and 0 failed**.
- `npm run build` and `npm run desktop:dist` passed. The package audit compared **845** desktop build files with `app.asar` and checked the package version and runtime assets. User vaults and Capacitor packages were excluded by the audit.
- All **15 installed desktop tests passed** with temporary vaults and an isolated profile. Two earlier desktop assertions were updated for hidden-by-default Markdown controls and the current linked-source icon.
- The initial focused browser run had **50 passed and 3 failed**. The subsequent **14-test** fresh-vault run passed, covering Feed, database links, menus, Notion inline import and Vault List properties. Another **3 Timeline property tests passed**. Hover-dependent record-opening tests now hover the title first, and Feed/Timeline conflict tests create the external edit before triggering the local autosave.
- A further **51 focused browser tests passed**. A continuation run covering interrupted database specs had **19 passed and 3 failed**. After correcting the remaining hover-dependent test interactions, all **8 database record tests passed** in a fresh vault.
- Both README previews loaded the product icon and had no horizontal overflow. Documentation pairs, local links, anchors and language routing passed the documentation checker.

Local evidence is under `.run/logs/` with the `release-0.1.15-` prefix. The main logs are `unit.log`, `build.log`, `package.log`, `desktop-installed.log`, `browser-full.log`, `browser-focused.log`, `browser-fixes.log`, `timeline-properties.log`, `browser-accepted.log`, `browser-remaining.log` and `browser-databases.log`. Browser runs also retain JSON reports and failure traces.

## Open verification and dependency issues

The full **902-test** browser attempt stopped at the configured **10-failure** limit after **193 passed**, leaving **699 unrun**. Failures included bookmark property editing, legacy branding expectations, database navigation, menus, recycling and Timeline scheduling. Several database cases passed in fresh-vault reruns after test corrections. The complete browser suite remains unaccepted.

The combined focused run also exposed a narrow Vault List property-column failure after fixtures with very long page titles. The same property test passed in a fresh vault. This interaction remains unresolved.

`npm ci` reported **31 dependency vulnerabilities** across the full dependency tree. `npm audit --omit=dev` reported **14** in runtime dependencies, comprising **2 low, 6 moderate, 4 high and 2 critical**. These are advisory matches from npm audit. The detailed local report is `release-0.1.15-audit-runtime.json`.

The GitHub release is marked as a **development preview / prerelease**. The Windows installer is unsigned.

## Installer and local upgrade

The release assets are `Notdown-Setup-0.1.15-x64.exe` and `SHA256SUMS.txt`. The installer contains **206013752 bytes**. The local package audit receipt is `release-0.1.15-artifact.json`. [GitHub release](https://github.com/EricCai00/Notdown/releases/tag/v0.1.15)

The previous installation is backed up in `.run/desktop-backups/Notdown-0.1.14-before-0.1.15/`. The silent upgrade exited with code **0**, and the installed executable reports **0.1.15.0**. Its executable and `app.asar` hashes match the audited package. Vault-list, interface-language and default-location configuration hashes match the pre-install receipt. The receipts are `release-0.1.15-install-before.json` and `release-0.1.15-install-after.json`.
