<a id="button-验证记录"></a>

# Button validation record

**English** · [简体中文](BUTTON-VERIFICATION.zh-CN.md)

2026-09-22. Refer to [ Notion Buttons ](https://www.notion.com/help/buttons) and [ official button configuration interface ](https://www.notion.com/help/guides/automatically-generate-blocks-pages-with-buttons). For implementation scope, see [ Button local contract ](../reference/LOCAL-OBJECTS.md#button).

- `npm test`: 373 passed, 1 conditions were skipped, 0 failed; including 8 button actions, four-position insertion, original text/unknown fields, old format, entire set of undo and unclosed template boundary tests.
- `npm run build`: TypeScript and Vite pass.
- Chrome button special `tests/e2e/button.spec.ts`: 9/9 passed. Covers direct click and keyboard execution, Slash automatic configuration, name/icon/style, template preview, step copy/sort/delete, save and reopen, cancel configuration, confirm cancellation, independent undo, save before page jump, external refresh termination wait action, narrow screen and illegal templates.
- View desktop configuration, completion status and 390px narrow screen screenshots, corrected the overall selection background color and preview title/to-do display during configuration. The screenshots are located at `test-results/button-settings.png`, `button-finished.png`, and `button-mobile.png`.
- full amount `npm run test:e2e` Running: 120 passed, 9 failed, 26 failed. The button confirms the interrupted use case that was previously incorrectly waiting for the shutdown window to be refreshed externally, and the correction of the statement is passed; the sample page and the button together run the 37 item, and the other two dialect use cases run the run. There are still non-buttoned 5 instances that have failed: Typora / TOC 3; side-barrel drag conflict 1; Tabs 1; no full project browser return is declared.

The browser uses an independent temporary vault, an independent Chrome session, and a test port 45439/45440. The project `vault/` or MyBase master library is not written.
