<a id="windows-0110-发布验证"></a>

# Windows 0.1.10 release validation

**English** · [简体中文](RELEASE-0.1.10-2026-10-31.zh-CN.md)

Date: 2026-10-31. Submit GitHub according to user requirements and upgrade the local desktop version from 0.1.9 to 0.1.10.

<a id="范围"></a>

## range

- Each new/newly imported database is saved independently as `databases/<id>.json`, including its own source, member page ID and view; external sources are referenced by Link, and no definition or text is copied.
- Markdown pages and Wiki Home continue to use the original files; compatible API fields of database members are projected by the corresponding JSON. Migration, federated CAS, interruption recovery, recycle bin, ZIP, Git checkpoints and file-level synchronization follow the same storage contract.
- Fixed the remaining database entries after deletion; Wiki Home and the collection view share the full-width cover, title, icon and drop-down view entries. Full width preferences are provided on the normal page, and the block handles in the columns can be accessed independently.
- The old database is compatible with the upgraded installation and does not automatically migrate user vaults.[Database documents](../features/DATABASES.md#individual-database-files)。

<a id="验证"></a>

## Validation

| Check | result |
| --- | --- |
| `npm test` | 1225 passes, 5 skips, 0 fails |
| Database/Wiki/Recycle Bin Browser Returns | 21 item passed, see [ storage verification](DATABASE-FILES-2026-10-31.md) |
| Handle, Full width and Wiki browser supplement returns | 7 items passed |
| `npm run desktop:dist` | TypeScript, front-end, main process, NSIS installation package is built through |
| actual packager | 13 desktop tests passed, using standalone profile and temporary vault |
| Package content | Version 0.1.10; the main process is consistent with the build file; does not include user vault and Capacitor native dependencies |
| Native installation | NSIS Silent upgrade exit code 0, product version after installation 0.1.10.0 |
| Installation files and configuration | exe  app.asar  SHA-256 is consistent with the tested packaging process;`vaults.json` Hash remains the same |

New packaging use cases directly verify independenceJSON、Members, cross-references,Link The markings.Wiki Home of realityMarkdown Save and switch views. The rest of the desktop test covers the system proxy, multi-book isolation,token Encryption, explicit clipboard bridges, title tags, tag pages, closed storage, trays, single instances and exit failure/conflict protection.

Installation package: `.run/desktop-release/Notdown-Setup-0.1.10-x64.exe`. SHA-256: `04f647046cb590a7d8b76f25a7543510ac62ed1e6d0add34d9fb2d81639dabc5`.

The local build, unit, browser and desktop test logs are `.run/logs/release-0.1.10-build.log`, `release-0.1.10-unit.log`, `release-0.1.10-browser.log` and `release-0.1.10-desktop.log` respectively; the packaged content verification record is `release-0.1.10-artifact.json`.

The full pre-installation 0.1.9 program backup is at `.run/desktop-backups/Notdown-0.1.9.0-before-0.1.10-2026-10-31T12-17-00Z/` and the backup hash of the core program files has been verified. The records before and after installation are `.run/logs/release-0.1.10-install-before.json` and `release-0.1.10-install-after.json`. The upgrade only replaces program files and does not perform actual user vault migration.

<a id="边界"></a>

## Boundaries

The Windows installation package is still unsigned; there is no automatic update or expanded acceptance of real Notion token, hosted cloud services, or real Android machines. The database history retains recovery materials, and there is currently no automatic rollback interface. Using independent database files on multiple terminals requires each terminal to support the same format version.
