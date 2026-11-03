<a id="侧栏精简与安卓直接选择方言2026-10-26"></a>

# Sidebar simplification and direct Android dialect selection (2026-10-26)

**English** · [简体中文](SIDEBAR-AND-MOBILE-DIALECT-2026-10-26.zh-CN.md)

<a id="范围"></a>

## range

- Search, Vault, Databases, and Attachments are displayed by default at the top; People, Graph, and Conflicts and versions can be turned on in the settings to retain the saved explicit shortcut entry preferences.
- Removed the duplicate New Page, New Database and Open vault buttons at the bottom of the sidebar; the original functions are retained in the page grouping plus sign, database home page and vault name/settings entry.
- The two imports are merged into Import source selection; the sidebar links of Block Explorer and Markdown Lab are respectively opened in Experimental features and closed by default.
- Collections, page trees, and bottom operations use the entire sidebar scroll area; drag-and-drop automatic scrolling uses the same container, and the text is independent.
- Import, Trash, together with the local status and settings, form the bottom operation area; when the page list is short, the whole group is at the bottom, and when the page list is long, at least 24px spacing should be maintained with the page tree. The icon is left aligned and no additional scrolling container is created in the bottom area.
- The sidebar title is changed to the current vault name, and the duplicate application icon and fixed workspace title are removed. Add grouping space between navigation, Favorites and Private pages; the only top bar icon opens the application menu of the File / View / History group, connecting existing tags, pages, import, settings and vault management commands.
- And I'm not going toNotebook Directly Select from the MenuPage dialect，Remove separate language settings andDone Steps; save, unknown fields, and conflict protection along the original link.

<a id="自动化验证"></a>

## Automated verification

| Check | result |
| --- | --- |
| Full unit testing | 1, 051 passed, 5 skipped, 0 failed |
| Browser building and sidebar, drag and drop, settings, tab return | 22 passed |
| vault title, application menu, keyboard/narrow screen, group spacing, label saving and conflict retest | 26 passed |
| Bottom operation area, short list alignment, long list spacing and drag and drop/setup retest | 17 passed |
| Merge import portal and set up targeted retest | 8 passed |
| Windows actual packaged product testing (temporary vault and independent configuration) | 5 passed |
| Actual desktop package orientation retest after bottom button correction | 1 passed |
| Full group retest of the actual desktop package after vault name and application menu correction | 5 passed |
| Mobile phone dialect switching and conflict orientation test | 2 passed |
| Android build and native JVM test tasks | Success; native reporting 11 items passed |

In an earlier extension browser regression, the contact test mistakenly regarded the import page "Page" as the edit view button; the test has been restricted to the editing toolbar and waits for the target page to load. Five contact use cases passed the retest. The contact slash entry use case still fails and can be reproduced on the unmodified baseline. It does not claim that the full browser test has passed.

<a id="本机更新"></a>

## Native update

Windows The uninstallation step of the old version of the installer reported an error and the exit code was 2. The original program and archive have been backed up to the local `.run/desktop-backups/before-sidebar-update-20261026/`, and then the existing installation directory is updated with the tested `win-unpacked` file; it has been verified that `Notdown.exe` and `resources/app.asar` in the installation directory are consistent with the test product SHA-256, and App is restarted. No vault or user configuration has been deleted.

After correcting the button grouping at the bottom, update the computer installation directory again. The program before the update is saved in `.run/desktop-backups/before-footer-actions-20261026/`, and check again that the above files are consistent with the latest test package.

The pre-update program with the corrected vault title and application menu is saved in `.run/desktop-backups/before-application-menu-20261026/`. The application menu is shared between the desktop and the browser; narrow screen, keyboard closing and external click, switching tabs after saving, conflict prevention closing and vault entry all have targeted coverage. The first single test of this round has an abnormal exit status of the external Pandoc process. The complete rerun is 1, 051 passed, 5 skipped, and 0 failed.

Android debugging APK has been updated to the currently connected mobile phone through `adb install -r`, the versions are 0.1.2, versionCode and 3, and MainActivity is started. The application data has not been uninstalled or cleared; successful installation and startup does not mean complete acceptance of real device input method, touch control or cloud synchronization. Mobile dialect screenshots are from isolated browser testing.

Local build, installation and test logs are located at `.run/logs/`. The installation package is an unsigned Windows development package and a native debugging signed APK package, which is not included in the source code submission.
