<a id="windows-019-发布验证2026-10-28"></a>

# Windows 0.1.9 release validation (2026-10-28)

**English** · [简体中文](RELEASE-0.1.9-2026-10-28.zh-CN.md)

<a id="范围"></a>

## range

Summarize all current uncommitted changes according to user requirements, and update the version from installed 0.1.8 to 0.1.9:

- Local Wiki database type, single data source constraints, Home/page collection view, page conversion and Undo, `/wiki` insertion and mobile portal.
- Wiki conversion retains Markdown, page identity, attribute values, and original nesting levels; subdatabases remain independent, and Undo pre-archive fields and view configurations.
- Notion Button explicit copy recovery supports the accumulation of multiple source pages and different selections in the same import pop-up window; repeated selections use newer snapshots, retain the loaded content upon read failure, and continue to limit the total size.
- Source, workspace, block identity and version checking continue to apply; only full and supported static insert actions are restored, cloud automation is not migrated.

For operating instructions, see [ Wiki ](../features/DATABASES.md#wiki) and [ Notion import ](../features/NOTION-IMPORT.md).

<a id="验证结果"></a>

## Verification results

| Check | result |
| --- | --- |
| Unit testing | 1, 203 passed, 5 skipped, 0 failed |
| Wiki, database and page operation browser return | 30 items passed |
| Multi-page copy recovery browser regression | 2 items passed |
| Mobile Wiki Chrome preview | 1 items passed |
| `npm run desktop:dist` | TypeScript, frontend, main process and NSIS build passed |
| Actual packager testing | 12 item passed, using temporary profile and temporary vault |
| Package content | Version 0.1.9, including Wiki/Undo and multi-page copy recovery; the main process is consistent with the build file, excluding user vault and Capacitor native directories |
| Native installation | NSIS Silent upgrade exit code 0, product version after installation 0.1.9.0 |
| Installation files and configuration | exe  app.asar  SHA-256 is consistent with the product tested;`vaults.json` Hash remains the same |

Desktop testing covers system agents, vault isolation, token encryption and restart recovery, explicit clipboard bridging, title bar and tabs, close save, tray, single instance and exit failure/conflict protection. The browser copy recovery test checks the results with the imported page and parent relationship to avoid reading the expired browser response body after application navigation.

Before installation, the original 0.1.8 program directory was completely backed up to `.run/desktop-backups/Notdown-0.1.8-before-0.1.9-2026-10-28T13-28-26Z/`. The upgrade only replaces program files and does not perform user vault migration. The installation package is `.run/desktop-release/Notdown-Setup-0.1.9-x64.exe`; the build, test, installation hashes and backup records are in `.run/logs/release-0.1.9-*`.

<a id="边界"></a>

## Boundaries

Notion The import is still one-way copying, and the import is still one-way copying.API The test uses a simulated response, but has not yet been completedWiki token The Internet is end-to-end receiving.Owner The current user is screeningVerification Workflows and notifications are not simulated locally; old sharedWiki The sourceUndo The phone is validated as a security stop.Chrome Preview, notAndroid The real machine is accepting.Windows The installation package is not yet signed and does not extend the existing synchronization with external service guarantee.
