<a id="windows-0113inline-数据库来源菜单与-trash"></a>

# Windows 0.1.13: inline databases, source menus and Trash

**English** · [简体中文](RELEASE-0.1.13-2026-11-01.zh-CN.md)

Date: 2026-11-01. Adjust the interaction according to the Notion screenshot provided by the user, and continue to use the independent database JSON, Markdown page and CAS writing.

<a id="交付范围"></a>

## Delivery scope

- Inline displays only the current data source name; the container title continues to be used for stand-alone database pages and navigation. The data area of ​​the wide table expands to the content viewport and supports horizontal scrolling. The title, toolbar, and front and rear text maintain the original width of the page. Databases within columns retain the column width.
- Views that cannot be placed are classified into **n more ...**; the menu allows you to search all views, select a view, open the option of the view, and create a new view or data source. The show/hide state of the source title is consistent with the menu text.
- The database search is expanded in the toolbar and Escape is cleared and collapsed. Removed separate database save/reload/convert menu; autosave after input pause, retain draft and show restore action on failure. The Inline/Full page conversion entry remains in the database block menu of the parent page.
- The ellipsis in the source line uses a separate mini-menu: Copy ID , Move Ownership , Move to Trash , and Source Relationship Details. Move check source and two database versions, retain source ID, external view, Markdown source and hierarchy, reject circular ownership and parent position of document metadata control.
- When deleting the last view of a source in the current database, you can choose to delete only the view or move its own ordinary source and its pages into Trash at the same time. The database can be temporarily without views and then created from a retained source. Wiki and external Linked sources do not provide delete operations beyond ownership.
- The database continues to use page Trash; the data source also supports recoverable deletion, and both sidebar Trash and source management can be recovered. The source recycling status is derived from the page visibility in the database JSON, and does not overwrite Markdown in batches, nor cancel the original individual recycling status of the page.

For operation instructions, see [ database ](../features/DATABASES.md), and for the interface, see [ API ](../reference/API.md). There is no new text protocol or migration of real user vault this time.

<a id="验证"></a>

## Validation

| Check | result |
| --- | --- |
| Full unit testing | 1235 passed, 5 skipped, 0 failed |
| TypeScript, production front-end, mobile terminal construction | Pass |
| Database/Wiki Browser | Among the entire set of 56 items, 54 passed, and the old assertions of 2 items passed after being updated with the new interaction; in the end, all related 13 items passed |
| Final Inline/Source/Delete retest | 3 item passed, add source title show/hide persistence assertion, use the front-end build of the final desktop package |
| mobile browser | 4 item passed, covering Wiki, complete database, Inline and synchronous import reference |
| final packager | The 1 database integration use case is passed, covering JSON, Linked-only, parent block conversion, breadcrumbs, source management, and source recycling and recovery |
| Package contents | main bundle and HTML/JS/CSS in the package are consistent with the build files one by one; version 0.1.13; does not contain user vault or Capacitor native dependencies |

The core unit use case checks that the external view still references the original source after the move, the contents of CRLF and the unknown fence remain unchanged byte by byte, the nested page is hidden/restored with the source, and the individually recycled page remains in its original state; both selections of the final view verify the page identity and content. The source move checks the page version and the original file bytes by combining CAS, and the metadata submission does not rewrite the text.

Log in `.run/logs/`: `database-followup-final-unit.log`, `database-followup-all-browser.log`, `database-followup-final-browser.log`, `database-followup-title-final-browser.log`, `database-followup-mobile.log`, `release-0.1.13-build.log`, `release-0.1.13-desktop.log`. Viewed `database-followup-inline-wide-source.png` , `database-followup-overflow-views.png` , `database-followup-source-options.png` and `database-followup-last-view-choices.png` . The browser uses independent Chrome, temporary vault and isolated port; Electron use case uses independent configuration and temporary vault.

<a id="本机安装"></a>

## Native installation

The installation packages are `.run/desktop-release/Notdown-Setup-0.1.13-x64.exe`, SHA-256:`94ff340370eab1de31625b146b248d7bd35c009eacac3e00589658a6b924ca6e`. For version and package content verification, see `.run/logs/release-0.1.13-artifact.json`.

Exit the old program normally and back up the installation directory before upgrading silently. The final installation receipt is `.run/logs/release-0.1.13-install-before.json` and `release-0.1.13-install-after.json`: the installation exit code is 0, the product version is 0.1.13.0, exe/app.asar are consistent with the final verified packaging file, and the vault configuration file hash remains unchanged. The original 0.1.12 program backup is located in `.run/desktop-backups/` and the original path and hash remain in `release-0.1.13-first-install-before.json` .

The installation package is still unsigned; mobile browser verification does not represent Android real machine installation, and the scope of real cloud service acceptance is not expanded this time.
