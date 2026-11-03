<a id="windows-0112数据库布局与视图菜单"></a>

# Windows 0.1.12: database layouts and view menus

**English** · [简体中文](RELEASE-0.1.12-2026-11-01.zh-CN.md)

Date: 2026-11-01. Adjust the layout according to the Notion screenshot provided by the user and retain the existing database and page storage model.

<a id="交付范围"></a>

## Delivery scope

- Ordinary databases use compact title and capsule view columns, with views and tool buttons arranged left and right. Wiki Home/Collection shared page header continues to maintain its original position and size.
- View settings Use the settings panel on the right. Sub-panels such as Manage data sources, Source and layout are switched at the same position, Back returns to the previous layer, and Close closes the entire group; source management is grouped by Source/Linked, and a single line displays the name, number of views and detailed entry.
- Click the current view label or right-click any label to open an independent drop-down menu to rename, switch layouts, edit views, view sources, copy links, show/hide source titles, and copy/delete views. Right-clicking other views does not switch the current view.
- Copying retains filtering, sorting, fields, layout, sources, and unknown fields; deleting does not delete sources or Markdown and retains at least one view. Delete the two copies of revision of the verification view and database, and keep the conflict recovery record.
- Save the draft view before entering source management, and continue to use the just-saved version after returning. Canceling the new source form, going back or closing the panel will not accidentally create resources.

See [ database ](../features/DATABASES.md) for operation instructions, and see [ API ](../reference/API.md) for the interface to delete views. There are no new textual protocols or migration of actual user vaults.

<a id="验证"></a>

## Validation

| Check | result |
| --- | --- |
| Full unit testing | 1233 passed, 5 skipped, 0 failed |
| TypeScript, production front-end, mobile terminal construction | Pass |
| Database/Wiki Browser | 53 scenes completed the verification; the entire 49 group passed, and the rest passed after correcting the Wiki title size and isolating the tracking products. |
| Final layout retest | 3 item panel/menu, 3 item Wiki alignment all passed; including returning to continue modification after saving, conflicting drafts and narrow screen boundaries |
| mobile browser | 4 item passed, covering database creation, editing, synchronous import and Wiki |
| final packager | 1 item database integration use case passed, covering independent JSON, linked-only, transformation, breadcrumbs, new view menu copy and right source management |
| Package content check | main bundle and the front-end HTML/JS/CSS in the package are consistent with the build files one by one; version 0.1.12; does not contain user vault or Capacitor native dependencies |

Log in `.run/logs/`: `database-layout-unit.log`, `database-layout-actions-unit.log`, `database-layout-all-browser.log`, `database-layout-final-browser.log`, `database-layout-shell-browser.log`, `database-layout-mobile.log`, `release-0.1.12-build.log`, `release-0.1.12-desktop.log`. The last desktop test retains interaction and file assertions; Electron screenshot collection has timed out, visual inspection uses screenshots of isolated Chrome.

I've seen it. `.run/logs/database-layout-view-settings.png`、`database-layout-manage-sources.png` and `database-layout-view-dropdown.png`Finally, Wiki is saved with the panel screenshot. `test-results/browser-layout-shell/`The browser tests using independent Chrome, a temporary vault and a separate port, without connecting the user browser.

<a id="本机安装"></a>

## Native installation

The installation packages are `.run/desktop-release/Notdown-Setup-0.1.12-x64.exe`, SHA-256:`b4dd18a932419bb70c556f3774ccc4fc34a88edb11be7393a50b26df6b2e8da1`.

The original 0.1.11 program is backed up to full `.run/desktop-backups/`The backup path and core documents hash `.run/logs/release-0.1.12-install-before.json`■ Silent upgrade of the exit code, installed product versions 0.1.12.0 , exe/app.asar `release-0.1.12-install-after.json`The hash is consistent with the verified packaging of the product.

The installation package is still not signed; the acceptance scope of real managed cloud services, Notion token or Android real machines is not expanded this time.
