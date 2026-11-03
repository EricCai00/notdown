<a id="notion-enhanced-markdown-导入验证2026-09-26"></a>

# Notion Enhanced Markdown import validation (2026-09-26)

**English** · [简体中文](NOTION-IMPORT-2026-09-26.zh-CN.md)

<a id="后续真实-pm-节点类型"></a>

## Follow-up: Real PM node type

Remove the display coverage of the icon/menu in accordance with parent archived Block API evidence with local parent and constructed with DocumentSession projection `block.child_page`Normal entry is maintained `block.link_to_page`• Displays a direct-reading type of real node, without writing official Markdown private properties.

- Unit test: 790 items, 785 passed, 5 skipped; new real node types, official source code retention, reparsing/undoing/redoing, ambiguity and code boundary checking.
- The build passes. Chrome import and node-specific 4 items passed, check the real node type, menu, mode switching, refresh, click target. During the first combined run, it was discovered that the test shared imported snapshot was contaminated, and the local editing of the test itself was restored and the rerun passed.
- A read-only verification was performed on the user's current CS page: the old running service did not return the evidence field; the new code was used to read the existing archive to obtain 26 child_page evidence, and the projection results were 26 `block.child_page` and 0 `block.link_to_page`. The user vault has not been written, Notion has not been called, and the user service has not been restarted. Restart the backend and refresh the page to load the new projection.
- Log: `.run/logs/notion-pm-identity-unit.log`, `notion-pm-identity-browser.log`, `notion-pm-identity-browser-recheck.log`.

Validation uses only temporary vault, simulated Notion API and standalone Chrome. There is no real token , no read/write to user Notion or user vault . The official interface document has been checked online: `GET /v1/pages/{page_id}/markdown`, version `2026-03-11`.

| Check | result |
| --- | --- |
| `npm test` | 787 item, 782 passed, 5 skipped, 0 failed |
| Final import unit/service project | `notion-import.test.ts`+ `markdown-import.test.ts`, 13 items passed |
| `npm run build` | Passed; Vite still prompts that part of chunk is greater than 500 kB |
| Finally built independently | `npm run build -- --outDir .run/notion-verification-dist`Pass |
| Final Chrome import project | 3 items passed: original text and hierarchical/duplicate import; preview invalid; failure to save prevents submission |
| Preview screenshot | Visually inspected; API text is scrollable, bottom action bar fixed in visible position |
| `npm run test:e2e`full amount | Failed and incomplete. Item 543 is planned, and it will be stopped automatically after recording the item 192; it will not be claimed that it has passed in full. |

Assertion/timeout failures such as block spacing, callout, dialect plug-in switch, list interaction, insert menu, extended source, etc. occurred during full operation. The root cause has not been fixed or proven this time. One block-source failure was the trace product ENOENT: the first special project mistakenly shared the full amount of outputDir, which may have interfered with the product; subsequent special projects all used independent outputDir, and all six separate block-source reruns passed. The full-volume results therefore cannot serve as a clean baseline control.

Logs are in `.run/logs/notion-import-unit.log`, `notion-import-focused-unit.log`, `notion-import-final-build.log`, `notion-import-browser-final.log` and `notion-import-e2e.log`. Screenshot is `test-results/notion-import-preview.png`. All processes have been stopped, leaving no test service running.

The block insertion modifications of the original `src/app/main.ts` in the current workspace have been retained and are not included in this import change.

The true online compatibility of Notion still needs to be verified using the pages shared by users to integration; the current test proves the reading, saving and interface processes constructed according to the official protocol.
