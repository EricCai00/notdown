<a id="android-触屏块操作2026-10-25"></a>

# Android touch block operations (2026-10-25)

**English** · [简体中文](ANDROID-TOUCH-2026-10-25.zh-CN.md)

Scope: The operation entrance of the mobile editor, long-pressing and dragging when the keyboard is closed, native text selection when the keyboard is opened, and the related return of the desktop shared editor. Instructions for use are found in the [ Android guide ](../features/ANDROID.md).

<a id="行为"></a>

## behavior

- The mobile version assembles the shared editor through explicit touch mode and does not register the left block handle, mouse box selection, block drag and drop, floating selection format bar, table handle and slash automatic menu of the desktop.
- The keyboard for insert, format, picture, block operations, undo, redo and collapse is retained at the bottom, and each touch target is at least 44 × 44px; inserting new blocks is separated from converting the current block, and the operation panel retains the selection and rejects expired text.
- When the keyboard is retracted, hold down about 450ms to start block dragging, which displays independent preview, highlighted overlay and blue drop point line; when released, the drop point is recalculated, shared block movement transactions are reused, list items are retained, and undo and save reloading are supported.
- Scroll when dragging close to the edge of the scroll area; cancel dragging by sliding in advance, system canceling touch, second finger, text change, etc. System text selection is retained when the keyboard is open; the editor is not automatically focused after dragging.
- Android natively monitors the actual IME insets and synchronizes the visible status of the keyboard through the Capacitor window event, so dragging can be started even when the keyboard is closed but the text still has focus. Browser preview uses editing focus as a fallback judgment.
- Columns are only displayed vertically on mobile phones, and the original source code is not migrated; table row and column operations enter the bottom panel.

<a id="验证"></a>

## Validation

- `npm test`Final: 1013 entry, 1008 passed, 5 skipped, 0 failed. There was a temporary directory file opening error in the first round of database storage testing; the corresponding 25 directed tests and the final complete unit test all passed, and the storage code was not modified to bypass the error.
- The mobile TypeScript and Vite construction passed; the independent Chrome / Pixel 7 touch screen test passed all 20 items. Newly added coverage for insert/transform separation, copy/move/delete/undo, format selection and unformat, tables, columns, 320px touch areas, real browser touch events long press/drag/cancel, list items, IME state events and edge scrolling.
- Table `block-selection`、`block-menu-position`、`selection-menu`、`columns-resize`、`markdown-blocks` The 30 is not approved. The full 682 desktop browser cluster declaration is not approved.
- Finally, `npm run build` passed; the long-press and drag screenshot use case was rerun and passed, and the drag overlay, drop point line, and bottom operation panel screenshot were checked.
- Android `assembleDebug` and `testDebugUnitTest` passed, debugging APK has been regenerated.
- Tested using isolated browser storage with temporary WebDAV fixture; no user vault is connected or overwritten.

<a id="验收边界与产物"></a>

## Acceptance Boundaries and Products

There is currently no connected device to `adb devices`, so this round has not covered the installation and has not done the real Android WebView/Chinese input method feel acceptance. IME status event testing in the browser is not equivalent to real keyboard acceptance.

- APK: `.run/android-release/Notdown-Android-debug.apk`, and save a copy of the date `Notdown-Android-touch-2026-10-25.apk`.
- Log: `.run/logs/mobile-touch-*.log`; Interface screenshot: `.run/logs/mobile-touch-sheet.png`, `.run/logs/mobile-touch-drag.png`.
- Local logs and build products do not enter version control.

<a id="键盘工具栏补充"></a>

## Keyboard toolbar supplement

- The first-level column directly provides increase and decrease indent, move up/down, insert, font style, convert to, undo/redo, picture and more block operations. The buttons slide sideways, and the keyboard buttons are fixed on the right side.
- The font style enters the secondary column in the original position and returns to the left; the current selection, input focus and continuously set stored marks are retained, and the current style status is displayed. Transform and insert using the two-column panel below the toolbar.
- After switching Page / Source, the button immediately follows the visible editing area and does not rely on focusing again. Operations still use shared editing transactions and vault saving rules.
- Browser tests for isolated mobile builds: 26 passed; slow attachment fixture directed rerun after resuming reading 1 passed. Including font overlay and subsequent input, returning to the first level column, moving list items, increasing or decreasing indentation, undo/redo, converting grids, fixed keyboard buttons, horizontal touch scrolling and return of previous long press and drag.
- Desktop block selection, text styles, and Markdown block regression 22 items passed; font secondary columns and transition grid screenshots checked.
- Final `npm test`: 1021 item, 1016 passed, 5 skipped, 0 failed. Initial run in parallel with the build encountered out of memory and Pandoc timeouts; full rerun passed after reducing resource contention. Another low-concurrency run was stuck at the R test process exit stage and was canceled without counting it as a pass.
- This round uses independent `.run/mobile-toolbar-frontend`, `.run/mobile-toolbar-desktop` and `.run/logs/mobile-toolbar-*` to prevent build and test output from overwriting each other.
- Android `assembleDebug` / `testDebugUnitTest` The building is approved.APK For the`.run/android-release/Notdown-Android-toolbar-2026-10-25.apk`，71,253,213 Bytes; checked in-package entryHTML、The entranceJS、The editorJS withCSS ofSHA-256，The results of the study were consistent with the mobile model.
- APK SHA-256: `f190608a9332c6d5d1d6958785384b4c5e7ccad95b5bf323faa372b481c24064`. At the end of this round, `adb devices -l` has no devices, no coverage installations, or claims to complete real input method acceptance.
