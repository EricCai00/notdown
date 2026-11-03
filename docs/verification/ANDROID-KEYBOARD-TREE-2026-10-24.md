<a id="android-键盘收起与页面层级2026-10-24"></a>

# Android keyboard dismissal and page hierarchy (2026-10-24)

**English** · [简体中文](ANDROID-KEYBOARD-TREE-2026-10-24.zh-CN.md)

Scope: Android return key, bottom keyboard retract button, and the order and hierarchical display of the phone's Pages list. Instructions for use are provided in the [ Android Guidelines ](../features/ANDROID.md).

<a id="改动"></a>

## Change

- The native return key checks the visibility of IME and gives priority to closing the input method; the front end collects the draft after the input is completed to avoid going directly to the page list.
- Add Hide keyboard at the bottom, clear the title, text or source code input focus, and call Android to natively close the input method. The button does not wait for the synchronization task to complete before responding.
- The ordinary page list reuses the `comparePageOrder` of the desktop, press `parent` to display the indentation, and the arrows expand/collapse independently; the search continues to match the text, and the folded state is restored after clearing.
- A read-only projection of the list that does not modify order, parent-child relationships, or Markdown. Missing parent pages, self-references and circular relationships retain navigable entries to avoid losing recoverable pages.

<a id="自动化"></a>

## Automation

- `npm test`: 1, 004 passed, 5 skipped, 0 failed; including new page tree sorting, folding and abnormal relationship tests.
- `npm run build`: TypeScript passes with desktop production build.
- Mobile terminal production construction and `playwright test -c tests/e2e/mobile.config.ts`: 13 items passed, covering Chinese text, source code and title saving after the keyboard is closed, three-layer order, folding, search and 320px toolbar.
- Finally, after completing the keyboard button icon, APK is rebuilt; the keyboard save and narrow-screen toolbar 2 items are rerun, and the button SVG is confirmed to be visible.
- Android `assembleDebug`、`testDebugUnitTest` The original HTTP test 3 and the file storage test 8 were both successful.
- The table is aimed at `page-tree.spec.ts`、`sidebar-layout.spec.ts`、`sidebar-drag.spec.ts` 9 return: The first round of 8 passes, and the use case fails to be pulled to the recycling station; the use case is run back through separately, recording an unstable result. The complete 682 desktop browser set is discontinued after launch, and the relevant use case is modified, which this record does not claim to be the complete browser set.

<a id="真机"></a>

## Real machine

The link isAndroid 16 Mobile phone coverage installed modulationAPK，Keeping the application data and existing notes. Users can unlock and allow the application to continue using the app.Notdown WebView Check it out:

- The search box on the page calls up the real input method, the system return key closes the input method, and the Pages panel remains open.
- The title input box activates the real input method. The button at the bottom closes the input method and clears the focus. The current page and title remain unchanged.
- In the text editing area, the system return key and the bottom button were used to successfully close the real input method, and the text remained unchanged.
- Page level screenshots and bottom button layout checks passed; toolbar buttons are all within the visible width.

The real machine operation only focuses on the existing input box and does not enter, delete or rewrite the text of the note. Chinese text saving is covered by the isolated browser test; this time, the test text was not entered during the candidate word combination process of the real Chinese input method, and it does not mean that all Android versions and input methods have been accepted.

APK: `.run/android-release/Notdown-Android-debug.apk`. Logs and real machine screenshots are located in `.run/logs/mobile-navigation-*` and `.run/logs/android-*.png`; browser screenshots are located in `test-results/mobile/`. These local products do not enter version control.
