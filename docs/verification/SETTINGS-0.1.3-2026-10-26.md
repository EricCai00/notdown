<a id="设置界面与桌面-013-验证2026-10-26"></a>

# Settings interface and desktop 0.1.3 validation (2026-10-26)

**English** · [简体中文](SETTINGS-0.1.3-2026-10-26.zh-CN.md)

<a id="范围"></a>

## range

- Set up groups by Workspace, Appearance, Editing, Sync & history, Connections, Advanced, focus on the group title after navigation and positioning; all forms remain mounted, and unsubmitted input is retained between group jumps.
- Unify cards, labels, input boxes, drop-down boxes, switches, buttons and status prompts; fix the title and bottom Done, and scroll the content independently; use horizontal category navigation for narrow windows.
- The three display switches of the Markdown control: view switching, dialect selection, and expansion are turned on by default. When all are hidden, the entire row is collapsed, and the menu and shortcut keys can still switch views.
- After rebuilding the page menu, the icons are refreshed uniformly, covering the view switching entrance of toolbar, menu, shortcut keys and label recovery.
- Desktop version upgraded to 0.1.3. Installation packages and local products do not enter Git.

<a id="自动与视觉验证"></a>

## Automatic and visual verification

| Validation | result |
| --- | --- |
| `npm test` | 1051 passed, 5 skipped, 0 failed |
| `npm run build` | TypeScript and Vite passed |
| Specify range`npm run test:e2e -- …` | 24 passed, 0 failed |
| `npm run desktop:dist` | Generate Windows x64 NSIS installation package, product version 0.1.3.0 |
| `NOTDOWN_PACKAGED_EXE`Desktop test pointing to unpacker | 9 passed, 0 failed |
| 1440px and 390px screenshot inspection | There is no overlap in category titles, forms, switches and fixed action bars, and there is no horizontal overflow in narrow screen forms. |
| `git diff --check` | Pass |

Browser verification range: `settings-layout`, `markdown-controls`, `vault-settings`, `code-input-mode`, `emoji-picker`, `runtime-settings`, `history`, `application-menu`. Covers unsubmitted form retention, preference persistence, WebDAV field switching, shutdown mode, save of interpreter and history settings, and conflict branches.

Desktop testing uses an independent temporary vault and user configuration, covering setting windows, tags, imports, multi-library isolation, close save, tray recovery, single instance, exit failure and conflict protection. The user vault was not used as test data.

We did not re-run all browser projects this time. The above results do not mean that the complete browser suite is fully green, nor does it expand the scope of cloud synchronization or real machine verification. The installation package is still not signed. Logs and screenshots are saved in `.run/logs/settings-design-*` and `.run/logs/settings-*.png` of the local machine and do not enter Git.
