# Database table and side peek — 2026-09-28

**English** · [简体中文](DATABASES-DESIGN-QA-2026-09-28.zh-CN.md)

final result: passed

Scope: Tables, view toolbars, type icons, colored options, check columns and record panels on the right in the two Notion database reference images provided by the user. The sidebar, text editor and local saving rules of Notdown are retained, and Notion accounts, permissions or comment services are not implemented.

The above results only apply to this database design and special interactive verification; it does not mean that all browser tests in the entire warehouse have passed.

<a id="截图与布局"></a>

## Screenshots and layout

The test uses independent headless Chrome, temporary vault and isolated front end to build `.run/database-frontend`, without connecting to the user's browser or real Notion account. The test data is created from `tests/e2e/database-fixture.ts` through existing API, and contains 15 page records and six columns: Name, In Markdown, Markdown Syntax, Class, Notion Syntax, AFFINE. Sample options are for visual and type testing and do not serve as an external product compatibility checklist.

Original reference source:

- Table: `C:/Users/Eric/AppData/Local/Temp/codex-clipboard-c8d7c744-69ca-42f7-b321-26428971714b.png`.
- Record on the right: `C:/Users/Eric/AppData/Local/Temp/codex-clipboard-f17afd9e-9f3b-4a60-8318-b3f7e21036f7.png`.

The two original images and the corresponding widescreen implementation screenshots are both 1919 × 975; the implementation uses `deviceScaleFactor: 1` and compares 1:1 pixels with the original image. normalization: none, does not scale, stretch, or reformat the image to hide differences. In addition, 900 × 975 and deviceScaleFactor 1 are used to verify the response layout. The reference image and the final implementation image were examined side by side in the same image review.

| evidence | viewport | Check content |
| --- | --- | --- |
| `test-results/databases-reference-table.png` | 1919 × 975 | Table title, view label, icon toolbar, blue New, type icon, three groups of colored options and check column. |
| `test-results/databases-reference-peek.png` | 1919 × 975 | The left table is side by side with the right record; the current row is highlighted, record title, attributes, text and close/complete page buttons. |
| `test-results/databases-select-menu.png` | 1919 × 975 | Options panel, colored options, check mark and clear operations. |
| `test-results/databases-reference-peek-narrow.png` | 900 × 975 | The right side of the narrow screen covers the panel; the title, attributes, text and closing operations are within the viewport. |
| `test-results/databases-reference-table-narrow.png` | 900 × 975 | Restore table after closing record; wide table scrolls in separate area. |

The final screenshot has font levels, spacing, colors, grid, text cropping, options panel and narrow screen borders checked. The widescreen header is approximately located at y = 251, and the 15 rows can be seen at the same time; the text on the right uses the existing Page / Source / Split mode. The menu and header use the project's existing Lucide icons, and there are no new bitmap assets.

| Fidelity inspection surface | Observation and Boundaries |
| --- | --- |
| font | Large bold database/record titles, heavier record names, regular cell text and gray field names form the same hierarchy; use existing fonts in the project, fonts and icon strokes do not claim to be consistent pixel by pixel. |
| layout and spacing | Compact view label, right toolbar, six-column table, selected row and vertically separated side peek; header y ≈ 251 to reference y ≈ 252. Notdown retains its own top bar and narrower application sidebar, so the content left border and column width are different from the original image. |
| Color | Available green, Not Available red, Sometime Available yellow, Same (Pasting) blue, Basic blocks brown, Media orange; blue New and checkbox, gray grid and light blue selected rows have been checked. |
| assets | Use existing Lucide icons, including field types, pages, toolbars, panel switches and final check icons; there is no use of CSS to build icons or copy the account avatar/cloud assistant illustration in the reference image. |
| copywriting | The six column names, Table, New, OPEN, Add a property, and corresponding entries retain semantics; the body and test attribute values use local examples. Unimplemented Share, Comments, Automation, and AI controls are not shown as available functionality. |

The key area evidence directly quotes the complete screenshot above: the title/label/toolbar area of the table is about `(468,105)–(1780,252)` in the original image and about `(370,105)–(1789,252)` in the implementation; the colored cells and check columns are located below the respective table headers to y ≈ 943. The property area on the right is about `(1320,110)–(1807,445)` for reference and `(1296,111)–(1828,443)` for implementation; `databases-select-menu.png` displays the color, selection state and shadow of the option popup layer separately. What is recorded here is the observation area within the entire image, and no zoomed crop image is generated.

Fixed loop: the saved state of the first screenshot occupies a whole row, moving the table down about 24 px, and the regular state is now placed at the top; the error message still retains the complete visible area. The side-by-side layout under 900 px once squeezed the left toolbar, but now it is changed to cover the panel on the right, and the operations of the recording panel itself are no longer cropped. The field type of the test data has also been changed to three groups of select and one checkbox in the reference figure, and the saved `rowOrder` is used to avoid random page ID from affecting the order of the screenshot lines. In the last round, the widescreen sidebar title is moved up by about 40 px, and the sidebar fields are arranged by attribute names, with the order of table columns unchanged; at the same time, the problem of applying breadcrumbs from Databases to Vault after saving the sidebar is fixed.

Non-blocking differences: Retain the Notdown application sidebar and edit mode switching; this time there is no copying of the comment area, sharing permissions, Notion AI or other cloud entrances. The form and record panels provide truly editable local functions and do not replace interaction with static screenshots.

<a id="行为与数据保护"></a>

## Conduct and data protection

`tests/e2e/databases.spec.ts`All eight tests passed, covering:

- Create database, field and page records; number `0`, page attribute linkage, field rename and reopen.
- View label selection, saved filter/sort/display columns, search, filter and sort icon entry; filter results and quantity updated after modifying records.
- The record is opened while the cell is still focused and input is received; the full page is opened and returned via the browser, with the body and properties remaining saved.
- Continue editing the same cell while the first save is still being requested. Subsequent input is not lost and is readable upon reloading.
- Page version protection; cell conflicts retain disk content, conflict copies, and tab page drafts, and recovery drafts do not automatically replace revision.
- The document YAML property override appears read-only and the original body remains unchanged.
- Edit the title, text attributes, Markdown text, colored options and checkbox `false` in the record panel, save, close, reopen and update the left table; **Add a property** continue to fill in the new field and reopen the verification. After saving, the application breadcrumbs are still Databases.
- Record text conflicts to prevent closing, opening of full pages and sidebar navigation; reading the latest version after explicitly discarding the draft, and conflicting copies can still be restored.

The above page interacts and checks for browser exceptions at the same time; the reference data page does not have `pageerror`.

<a id="本次验证记录"></a>

## This verification record

- `npx vite build --outDir .run/database-frontend`: Pass, 20.36 seconds; log `.run/logs/database-design-build.log`. There are only existing bulk chunk hints.
- Independent port 4339, run `npx playwright test tests/e2e/databases.spec.ts --reporter=list --output test-results/database-design` in the above build directory: 8 passed, 23.5 seconds; log `.run/logs/database-design-e2e.log`. Contains final Lucide check icon and sidebar alignment corrections.
- Final `npm run build` : Pass, Vite builds 17.67 sec; log `.run/logs/database-final-build.log` .
- Final `npm test`: 869 passed, 5 skipped, 0 failed, total 874 items; log `.run/logs/database-final-unit.log`.
- Use of final production `dist` Database, Notion input and page navigation directed backwards: 23 passed , 51.7 seconds; log `.run/logs/database-final-regression.log`。
- The port also has an independent temporary knowledge base4359 Clean and verified15 Article reference records andPage Sidewall, no control panel abnormalities; check the script`.run/database-preview-check.ts`, screenshot `.run/logs/database-preview-table.png` with `.run/logs/database-preview-peek.png`。
- The full browser that started earlier was running using old front-end snapshots, and it was in the early days of the browser.612 of the heading434 The record is383 passed、21 failed、30 skipped；Diary`.run/logs/database-full-e2e.log`The operation is not complete and not completely green.
- Four of the non-database failures have been independently reproduced: one callout use case still looks for old tags, and three dialect default value assertion failures are detailed in `.run/logs/database-unrelated-review.log` . The remaining failures have not yet been fully classified, and they are not generally classified as existing problems.
- Database view test failures in old full runs have been fixed and all eight database specialties currently pass. This special result does not replace the incomplete browser verification.

See [ local database ](../features/DATABASES.md) for functionality and unimplemented boundaries, and [ API ](../reference/API.md#local-databases) for interfaces.

<a id="同日追加创建入口与页面树"></a>

## Added on the same day: Creating portals and page trees

Added root and nested database creation, same UUID host page, record host parent relationship, and database entry in the sidebar tree. `/database` only displays the implemented **Database - Full page** and **Database - Inline**; Inline uses existing official references and is embedded in the actual database workspace.

Supplementary screenshots: `test-results/database-creation-menu.png` is the real slash menu; `test-results/database-nested-hierarchy.png` is the page under 1440 × 1000 → Database → Record level, and the record is only displayed once. Standalone Chrome and temporary vault rules remain unchanged.

The first integration run of this round resulted in 27 passed and 3 failed. One failure was that the test mistakenly treated the official `</database>` end tag as an unconsumed `/database` command, which has been corrected. The other two practical problems were that the saved state of the embedded table obscured the New button, and the navigation was lost when clicking the sidebar too early during the restoration of the default database. The former is corrected by inline state layout, and the latter is corrected by disabling shell interaction before startup is complete; there is no bypass with force click or relaxed startup assertion.

Validation after this production build:

- `npm run build`: Passed, Vite 19.06 seconds; `.run/logs/database-hierarchy-final-build.log`.
- Final `npm test`: 883 passed, 5 skipped, 0 failed, total 888 items; `.run/logs/database-hierarchy-final-unit.log`.
- Directed browser regression: 36 passed, 2.2 minutes; `.run/logs/database-hierarchy-final-e2e.log`. Contains hierarchy 5 items, embedded database 2 items, database table/record panel 8 items, Notion import 5 items, official MCP syntax 2 items, page navigation 10 items and sidebar dragging 4 items.

Subsequent bounds checking also found that: the long database tree scrolled during dragging, which may have caused the Block Explorer native link to move under the mouse, and the browser initiated the native link dragging and interrupted the page dragging. This is an actual product issue, not a simple test fluctuation. Page dragging gestures now block native `dragstart` when starting, normal standalone link dragging is unaffected; while all pages are preserved for descendant loop detection, the records themselves remain undragable.

The final revised `npm run build` passed, Vite 18.21 seconds, log `.run/logs/database-tree-drag-fix-build.log`; level 5 item plus sidebar drag 4 item to verify again, **9 passed, 21.1 seconds**, log `.run/logs/database-tree-drag-fixed.log`. These 9 items belong to the repeated coverage of the aforementioned 36 items and do not add up to 45 independent tests. The latest build has no pending levels for this round or the drag failed.

The hierarchical test checks that the root database appears only once, nested databases and record depths, host page identities, new records in the sidebar, collection of unsaved text, and the relationship between two slashes after creation and refresh. Browser testing of the old unhosted database uses the read-only API response fixture, verifying that dummy entries and record projections do not issue write requests; read retention of the actual old metadata is verified by the storage unit test. Embedded tests cover creating records, switching source code/opening the complete database after modifying cells, preventing jumps due to conflicts, and maintaining original references.

This round does not re-run the full browser suite that is known to have failed; the above 36 item pass does not change the previous record of the earlier incomplete full run.

<a id="同日修复旧后端缺失数据库接口导致启动失败"></a>

## Fixed on the same day: The old backend was missing the database interface, causing startup failure.

The real thing `4317` The front end is on the way. `4318` The old Node service: the state interface is 200 and the database list is 404. `Unable to open the vault / API endpoint not found`。Rebooted and reused the actual back endtsx watch；The original knowledge base path maintains the original value without executing the migration or re-generation of the example.status、pages、databases The three interfaces are200。

The front end now only provides old service compatibility for 404 of the database list: ordinary pages can be read, edited and saved, and the sidebar and database routing provide update prompts and Check connection; 422 and other storage errors will still be displayed and will not be disguised as an empty database. Server status added `capabilities.databases: 1`.

Verification: `npm test` is 883 passed, 5 skipped, and 0 failed; `npm run test:e2e --` specifies three files: old service compatibility, database hierarchy, and page navigation. The build passes and 18 browser tests pass. New tests cover saving ordinary pages under the old interface, direct database routing and service upgrade recovery, and not swallowing real storage errors. Log `.run/logs/database-server-compat-unit.log`, `.run/logs/database-server-compat.log`; the tests all use the temporary vault, and the actual service only performs read-only interface checking.

<a id="同日追加图标统一引用入口与直接创建"></a>

## Added on the same day: icons, unified reference entry and direct creation

This round is implemented according to the user's additional requirements: the complete database title icon reuses the Emoji / Lucide selector; sub-databases, sub-pages and page links use the same reference row layout; side columns, database lists and two slash insertions directly create **New database** without popping up the naming confirmation window first. The complete database title can be modified directly; the name or icon can be modified after opening the complete database as quoted above the embedded table.

The icon reference is user attachment `C:/Users/Eric/AppData/Local/Temp/codex-clipboard-6ae2bb13-1333-4f65-ad57-e748f7bf0de0.png`. This round reuses the existing project selector and does not claim to completely copy the Notion elastic layer: it provides Emoji, Lucide search, custom symbols and Remove, without Upload; Remove saves an empty icon and displays a common document icon.

Screenshots `test-results/database-icon-lucide-picker.png` and `test-results/database-page-reference-styles.png` checked at original 1440 × 1000 dimensions, not scaled. The former verifies the position of the selector next to the title, search results, and sidebar icons; the latter verifies the icons, underlined text, and hierarchy of subdatabases, subpages, and page links. The browser also measured that the icons of the three entrances are all 16 × 16 px, and the links padding, min-height, display and align-items are consistent.

Verify using the final production `dist`, port 4419, standalone Chrome and the automatically created and cleaned temporary vault, without using the user browser or user vault:

- `npm run build`Pass, Vite 28.20 seconds; `.run/logs/database-icons-build.log`.
- `npm test`: 891 passed, 5 skipped, 0 failed, total 896 items; `.run/logs/database-icons-final-unit.log`.
- The initial nine-file directed operation is 33 passed, 3 failed, 3.2 minutes; `.run/logs/database-icons-final-e2e.log`. The three failures are all test positioning problems: the database link does not have a page-specific `data-page-id`; the other two global **Page** button positioning conflicts with legal records of the same name.
- After modifying the position, all three files involved are retrieved, 6 passed and 26.5 seconds;`.run/logs/database-icons-recheck-e2e.log`The current 36 use cases have a number of different non-repeat 3 items passed through the results; this round does not have a full-range browser suite running again.

This round covers icon selection, removal, refresh persistence, page tree synchronization, inline and linked icons after real navigation returns, original Markdown and unknown attribute retention, old revision icon conflict archiving, and no-confirmation creation and subsequent renaming. Also returns database editing, inline drafts, legacy service compatibility, Notion import, subpage/link primitive semantics, two MCP dialects, and page navigation. Icon conflicts will not overwrite the new outer text.

Screenshot review reveals that the subdatabase reference is still being increased by the common block surface rule by 8 px outer spacing. Non-embedded database references are now excluded, retaining the surface spacing of embedded tables; `database-page-reference-styles.png` is regenerated and checked, and the three entries are arranged equidistantly. Test the assertion that adding three text labels with consecutive line spacing of no more than 1 px, while maintaining icon and navigation validation.

After this spacing correction, `npm run build` passed again (Vite, 23.79 seconds, `.run/logs/database-icons-final-build.log`); icon, Notion subpage, Notion block import and general block spacing four-file retest **9 passed, 22.8 seconds** (`.run/logs/database-icons-spacing-e2e.log`). Among them, 6 items are the aforementioned repeated coverage, and 3 items are supplementary block spacing use cases; a total of 39 different directional use cases in this round have passing results, and repeated runs will not be added.
