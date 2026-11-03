<a id="桌面版与-markdown-导入验证2026-09-23"></a>

# Desktop and Markdown import validation (2026-09-23)

**English** · [简体中文](DESKTOP-IMPORT-2026-09-23.zh-CN.md)

This time the scope is Windows desktop startup, vault selection, writing and folder copy and import. Tested using only temporary repository, standalone Chrome and isolated Electron user configurations, no user browsers connected or writes to user `vault/` / MyBase .

<a id="已通过"></a>

## Passed

| Check | result |
| --- | --- |
| `npm test` | 592 items: 591 passed, 1 skipped, 0 failed |
| `npm run build` / `npm run desktop:build` | TypeScript and Vite are successfully built; Vite still prompts that the existing large chunk |
| Import service test | 6 items passed: raw bytes and YAML, code preservation, links and attachments, invalid input, preview and explicit skip, idempotence and interrupt recovery, 20 MiB boundaries |
| Chrome import interaction | 1 items passed: preview, save current page, import, edit import page, repeated import in the same directory, source file unchanged; final use of independent`desktop-dist/frontend/` |
| Source code Electron | 3 items passed: multi-library isolation and import, first creation and recent directory and closing and saving, conflict prevention and closing and retaining two copies of the content |
| Final package Electron | Similarly, the 3 item passes, starts `win-unpacked/Notdown.exe` directly, and asserts that `userData` is located in the test temporary directory |
| Windows NSIS build | Generates `.run/desktop-release/Notdown-Setup-0.1.0-x64.exe`, unsigned |

The packaged application passed the run test; no installation wizard was executed or shortcuts were created in the user Windows configuration. Installer signing, SmartScreen trust, and automatic updates are outside the scope of what is currently implemented.

<a id="本次发现和修复"></a>

## This discovery and repair

- The import browser test originally entered the old page before hash navigation was complete. Add target title and text waiting, and check that the target page has been persisted before repeating the import.
- oldbase64 The standard of proof is20 MiB Triggered on the attachmentV8 The new version of the game is called the "Scream" and is designed to test the maximum and maximum.
- Screenshots of hidden Electron windows may time out; feature regressions no longer rely on this screenshot. The welcome page and import preview have been additionally screenshot checked.
- The desktop front-end uses an independent build directory to avoid affecting desktop packaging when other browser builds in the workspace replace the public `dist/`.

<a id="完整浏览器回归"></a>

## Full browser returns

Run `npm run test:e2e -- --output test-results/desktop-browser-regression --reporter=list`, eventually **290 passed, 20 failed, 28 did not run**, it took about 28 minutes. This run used the public `dist/`, and there were other builds in the workspace during the period, and the `dist/index.html` that appeared did not exist for the time being; therefore, it was not a stable and isolated release acceptance round, and it cannot be claimed to have passed in full.

20 item failures involve block spacing (3), Callout icons (1), dialect expansion switches (3), editor lists and subpages (2), expanded source copy (2), imports (1), inline style navigation (3), Typora acceptance samples (1), Notion formats (2), page icons (1 ), page history navigation (1). The navigation wait for imported use cases has been fixed, and the special project finally passed; the page icon was changed to an independent build directory and passed the retest. The remaining failed and unrun items have not been fixed or retested one by one in this task. Their root causes cannot be determined based on this run alone, and other parallel work has not been modified to make the assertion pass.

The conclusion of this desktop and import process comes from the independent operation of the above table; the return of the complete editor still requires subsequent processing. The page icon independent retest log is `.run/logs/desktop-isolated-recheck.log`.

<a id="日志"></a>

## Log

The execution log is retained in local `.run/logs/`: `desktop-all-unit-final.log`, `desktop-build-final.log`, `desktop-import-unit-final.log`, `desktop-import-final.log`, `desktop-native-final.log`, `desktop-packaged-final.log`, `desktop-package-final.log`. See also `desktop-e2e-all.log` for full browser regression; special pass does not mean pass for all old use cases of the entire editor.
