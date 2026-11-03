<a id="浏览器知识库管理设置与侧栏验证2026-10-25"></a>

# Browser vault management, settings and sidebar validation (2026-10-25)

**English** · [简体中文](BROWSER-VAULTS-AND-SETTINGS-2026-10-25.zh-CN.md)

Scope: Browser rebuild/open/switch vault, attribution of vault for each tag page, setting rolling and closing windows, and display preferences for side-by-side entries.[vault management](../features/DESKTOP-AND-IMPORT.md#usage)and[Writing and navigation](../features/WRITING-AND-NAVIGATION.md#pages-and-links)。

<a id="实现与边界"></a>

## Realization and boundaries

- The top of the sidebar displays the current library name and opens the management window; the same entrance is provided in the settings. You can create a new one by name in the data directory, or fill in the absolute path to create or open it; the browser does not have a system directory selector.
- Save page and database input before switching; failure or conflict prevents switching. You can select the current tab page or a new tab page, and the default library of the root address remains unchanged. The new library is empty and no presentation notes will be added.
- `/v/<目录身份>/`Bind independent `createApp`, API, attachments, source file downloads, previews and local drafts to maintain vault ownership. It is known that directory records can be restored after restarting; invalid identities, invalid directories and replaced directories return errors, do not return to the default library, and do not automatically rebuild old directories.
- The settings and vault management windows have fixed titles and close buttons, and the text scrolls separately; settings support Esc and click mask closure. Sidebar can show/hide the seven main entrances one by one and restore them all. Preferences will be retained after the browser is refreshed.
- The desktop version continues to use the native welcome window; Android does not expose the local vault management interface. There are no changes to cross-process writing or cloud synchronization guarantees this time.

<a id="验证结果"></a>

## Verification results

- `npm test`: 1043 item, 1038 passed, 5 skipped, 0 failed.
- `npm run build`: Passed, front-end isolation is built in `.run/browser-vault-frontend/`; there is still a bundle size prompt.
- `tests/unit/browser-vaults.test.ts`: 2 items passed, covering directory identity reuse, cross-database read-write/attachment isolation, old revision conflicts, Origin restrictions, service restart, unknown/moved directory rejection, non-empty directories and ordinary Markdown folder protection. The startup configuration test also passed.
- Independent Chrome directional regression: `vault-settings.spec.ts`, `attachments.spec.ts`, `branding.spec.ts`, `history.spec.ts`, `sidebar-layout.spec.ts`, `source-file.spec.ts`, a total of 21 items passed. Among them, there are new 5 items covering fixed titles, three ways to exit settings, sidebar preferences, creating a library in a new tab after saving, conflict prevention switching, and opening existing libraries in the current tab through settings.
- The full browser suite has been tried, and it was found that assertions such as the number of Block Explorer entries, Notion image encoding, and container source code failed; the extension operation was stopped after completing this related directional regression, and the entire set was not declared passed. The assertions of these other functions were not modified in this work.
- The reboot of the original knowledge base path along the back end of the host;Vite Address verification of management ability, library exclusiveAPI The check is read-only and does not include test notes or test libraries.

The local log is located at `.run/logs/browser-vault-*.log`; the screenshots are `settings-fixed-header.png`, `browser-vault-manager.png` and `browser-vault-isolation.png`. The test uses a temporary vault and a standalone browser, without connecting to the user's browser.
