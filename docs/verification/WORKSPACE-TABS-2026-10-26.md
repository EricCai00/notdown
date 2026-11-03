<a id="标签页与集成标题栏验证2026-10-26"></a>

# Tabs and integrated title-bar validation (2026-10-26)

**English** · [简体中文](WORKSPACE-TABS-2026-10-26.zh-CN.md)

Subsequent adjustments: The page list independent rolling has been removed, the current sidebar uses the full rolling, see[Writing and navigation](../features/WRITING-AND-NAVIGATION.md#common-operations)The following records preserve the original layout and the scope of verification at the time.

<a id="范围"></a>

## range

Adjust the Windows desktop and browser main interface according to the user-confirmed screenshot layout: top tab bar, fixed sidebar navigation, individually scrollable page list, and page breadcrumbs below. The independent system title and menu bar of the desktop are removed. The system minimize, maximize and close buttons are provided by Electron's native Window Controls Overlay; windows can be dragged in the blank space of the tab bar.

The browser retains its own address bar and browser tabs, and the same set of vault tabs is available within the app. Text editing tools and dialect selection remain.

- Tags can be used on pages, databases, and vault homepages; they support background opening, closing, returning to the homepage after closing, rearranging, keyboard selection, and desktop shortcuts.
- Close or switch leading edge with `save()` / `baseRevision` saving and conflict recovery; stop leaving during word grouping. Pause text interaction before restoring the target view to avoid new Source/Page selections being overwritten by the restoration step during fast switching.
- Only one writable editor is mounted per window. The tab order, current route, edit mode, and scroll position are saved in the window session isolated by the vault; there is no other hidden body DOM . The saved content is re-read after leaving the page, and the old undo stack does not have cross-tab persistence.
- The sidebar page area scrolls independently; drag to automatically scroll and wait for a short pause to prevent edge targets from being rolled away before letting go.

<a id="验证"></a>

## Validation

| Check | result |
| --- | --- |
| Full unit testing | 1, 051 passed, 5 skipped, 0 failed |
| Final browser build: tabs, page history, menus, sidebar layout and dragging | 32 passed |
| Final window scaling, current tabs remaining visible, and layout checks | 10 passed |
| Electron development and build: integrated title bar, shortcut keys, multi-library and shutdown protection | 5 passed |
| Windows 0.1.2 The same set of regressions for packaged applications | 5 passed |
| Browser and desktop production builds, NSIS packaging | success |

Label use case coverage: Page/Source text to be submitted, title rename, database title to be submitted, conflict prevention closure, missing pages, native browser forward/backward, restoration of editing view and scroll position, label dragging and middle-click closing, narrow screen and sidebar expansion. Electron checks that the native menu has been removed, the client area occupies the top of the window, the save behavior of Ctrl+T / Ctrl+W / Ctrl+Shift+T / Ctrl+1, and the same origin page `window.open` does not generate another writable window.

Use independent Chrome, temporary vault and independent Electron configuration without connecting to user browser. Browser and narrow screen screenshots have been manually reviewed and retained in `.run/logs/workspace-tabs-browser.png` and `.run/logs/workspace-tabs-narrow.png`. The log is `.run/logs/workspace-tabs-*.log` and does not enter Git.

This round did not re-implement the entire browser suite; see full number of projects not previously approved[0.1.1 verification record](MOBILE-DIALECT-AND-RELEASE-2026-10-26.md#full-browser-limit)The wheel cannot be passed through the direction as a whole quantity.

<a id="安装与边界"></a>

## Installation and borders

Windows / npm are updated to `0.1.2`, and the installation package is `.run/desktop-release/Notdown-Setup-0.1.2-x64.exe`. This round does not change the Android interface and the native version, Android remains `0.1.1`.

The machine has normally closed the old window and completed installation. The upgrade mode of the old 0.1.1 unloader returns the error code 2 twice; the old program directory is backed up to `.run/backups/notdown-installed-0.1.1-before-tabs` Afterwards, use `/KEEP_APP_DATA` Normal unloading and reinstalling, two-step exit code is 0 ⋅ After installation, the EXE version is `0.1.2.0`，`resources/app.asar` The SHA-256 is consistent with the packaging products tested.

The updated app has been reopened and the original recent vault list is still there. No vault is migrated or deleted; pending input from the old window is saved normally this round. The installer hash is saved in `.run/logs/workspace-tabs-installer-hash.json` .
