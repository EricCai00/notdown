<a id="windows-0111-发布验证"></a>

# Windows 0.1.11 release validation

**English** · [简体中文](RELEASE-0.1.11-2026-10-31.zh-CN.md)

Date: 2026-10-31. The scope is database entry unification, display conversion, breadcrumbs and native desktop upgrade.

<a id="行为与存储"></a>

## behavior and storage

- The editor uses `block.database` uniformly. The Inline, Full page, and linked-only databases all have `databases/<id>.json`; linked databases can have no own sources, and their views retain the explicit identity of external sources.
- `/database`, `/inline`, `/link` hit the same Database creation entry, you can choose the display method and new/link source. If the creation fails, the selection will be retained. If canceled, the resource will not be created.
- The block menu and database menu support bidirectional conversion. The text and cells of pending are saved first; the database ID, JSON, sources, records and views will not be rebuilt due to conversion. The official `inline` attribute in the parent page determines the display of this entry.
- Breadcrumbs navigate by actual parent page, database, and record levels. Inline uses the compact title, view label, and right-hand tool to provide Open as page; the link source shows arrows and Link.
- Keep the original host page and resources when receiving the old format synchronously to avoid identity conflicts caused by implicit migration during the download process. There are regressions for both batch and itemized receipts.

Operating boundaries with API[Database](../features/DATABASES.md#creation-locations-and-the-page-tree)and[Interface reference](../reference/API.md)The first is the "Migration of the Real User Knowledge".

<a id="验证结果"></a>

## Verification results

| Check | result |
| --- | --- |
| `npm test` | 1232 passes, 5 skips, 0 fails |
| TypeScript, production frontend and mobile frontend build | Pass |
| Database/Wiki browser regression | 50 items have all passed; 49 items have passed in the entire group run, and the old breadcrumb assertions have been updated and passed in individual reruns. |
| Mobile browser database/Wiki | 4 items passed, including old format synchronization, editing and reload |
| Package desktop programs | 13 items passed; independent profile, temporary vault |
| Package contents | Version 0.1.11, the main process is consistent with the build, and does not contain user vault or Capacitor native dependencies. |
| Post-installation verification | Product version0.1.11.0；exe、app.asar ofSHA-256 Consistent with the already-tested packaging process; knowledge base configuration hashes unchanged |

The desktop use case directly checks linked-only JSON, shared records, inline collected as page entry, breadcrumbs returned to the parent page, and JSON bytes before and after conversion are the same. The browser also covers block handle conversion, cells to be saved, source version conflicts, cancel creation, import of original text, and unknown attribute retention. Existing save failures and conflict protection use cases continue to pass.

The log is located at `.run/logs/`: `database-unify-full-unit.log`, `database-unify-all-browser.log`, `database-unify-breadcrumb-regression.log`, `database-unify-mobile.log`, `release-0.1.11-build.log`, `release-0.1.11-desktop.log`. UI check screenshots are `release-0.1.11-inline.png` and `release-0.1.11-linked-inline.png`; touch screen screenshots are saved in `test-results/mobile/`.

<a id="安装"></a>

## Installation

Installation package: `.run/desktop-release/Notdown-Setup-0.1.11-x64.exe`.

SHA-256：`82958ada6f76921c680c6db6665485735c551011b71dcb28f294f598de167b82`。

After the original 0.1.10 exits normally from the application menu, back it up to `.run/desktop-backups/Notdown-0.1.10.0-before-0.1.11-2026-10-31T13-52-58Z/` and check the core file hash. The NSIS silent upgrade exit code is 0, and the `vaults.json` hashes before and after installation are the same. Content verification and installation receipts are `.run/logs/release-0.1.11-artifact.json`, `release-0.1.11-install-before.json` and `release-0.1.11-install-after.json`.

Windows installation package is not signed. This time there is no expansion of the acceptance scope of Android real machines, actual hosted cloud services, or real Notion token imports.
