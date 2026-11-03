# Windows 0.1.14 release verification

**English** · [简体中文](RELEASE-0.1.14-2026-11-03.zh-CN.md)

Date: 2026-11-03. Scope: commit the accumulated workspace changes, build a Windows x64 installer, update the local desktop installation and publish a GitHub development preview. Local logs retain the `release-0.1.14-` prefix from the run started on 2026-11-02.

## Changes

- English and Simplified Chinese workspace interfaces, with local language preferences preserved across desktop vaults and restarts. User page content and property values remain unchanged when the language changes. The desktop launcher, tray and separate Android interface remain outside this localization scope.
- A shared browser/desktop vault picker, explicit creation and opening forms, and a configurable parent folder for future vaults. Existing vaults retain their locations.
- Compact database List properties, view property visibility, recoverable data source title edits and Trash cleanup, with pending drafts and revision checks retained.
- Page icon alignment and editor click boundaries; application menu commands refresh after tab transitions. Footnote insertion again asks for text or an existing definition, with cancellation and page ownership checks.
- Bilingual repository documentation and a local documentation checker. Root READMEs link to GitHub installers.

See [writing and navigation](../features/WRITING-AND-NAVIGATION.md), [vaults](../features/VAULTS.md), [List view](../features/DATABASE-LIST.md), [databases](../features/DATABASES.md) and [footnotes](../features/FOOTNOTES.md).

## Verification scope

- All unit tests: **1242 passed, 5 skipped, 0 failed**, with test concurrency limited to two. The initial highly concurrent run encountered Windows process/file errors and a Pandoc timeout; the complete limited-concurrency rerun passed. After the final menu/footnote changes, the 22 related unit tests also passed.
- TypeScript and production build passed. Windows NSIS packaging passed. README previews loaded the icon and had no horizontal overflow in either language.
- Focused browser acceptance: **61 passed**, covering every changed browser spec plus AI interactions, using standalone Chrome, a temporary vault, an independent port and the desktop frontend build. Menu/footnote regression checks also passed before the final layout-only adjustment.
- Packaged desktop acceptance: **15 passed**. Final installed-artifact and layout checks are recorded in `.run/logs/release-0.1.14-publish-checks.log`.
- Documentation pairs, local links, heading anchors and language routing passed `npm run docs:check`.

The attempted full **820-test** browser run did not complete cleanly under concurrent resource pressure. Separate broader checks also exposed older syntax-provenance, unresolved-reference and slash-menu assertions that do not match current behavior. This record does **not** claim the complete browser suite passed; this release is published as a development preview. Android/device installation and real-cloud acceptance are outside this release scope.

Evidence is local under `.run/logs/`: `release-0.1.14-unit-serial.log`, `release-0.1.14-unit-fixes.log`, `release-0.1.14-browser-accepted.log`, `release-0.1.14-browser-fixes.log`, `release-0.1.14-desktop-final.log`, `release-0.1.14-package-publish.log`, `release-0.1.14-docs-final.log` and `release-0.1.14-publish-checks.log`. Screenshots include the bilingual README previews, vault picker, database List, language settings and footnote insertion dialog.

## Installer and local upgrade

The installer is `.run/desktop-release/Notdown-Setup-0.1.14-x64.exe`; `SHA256SUMS.txt` accompanies it in the [GitHub release](https://github.com/EricCai00/Notdown/releases/tag/v0.1.14). The Windows build remains unsigned and has no automatic updater.

The package audit compares the desktop build files with `app.asar`, checks version 0.1.14 and excludes user vaults and Capacitor native packages. Type declaration files omitted by the packager are not runtime assets. The final receipt and SHA-256 are in `.run/logs/release-0.1.14-artifact.json`.

The previous 0.1.13 installation is preserved in `.run/desktop-backups/Notdown-0.1.13-before-0.1.14/`. The silent upgrade must exit with code 0; the installed executable and `app.asar` must match the audited package and report 0.1.14.0. Vault-list, interface-language and default-location configuration hashes are checked against `release-0.1.14-install-before.json`; results are in `release-0.1.14-install-after.json`. The installer does not migrate user vaults.
