# Page block styling correction — 2026-09-22

This correction supersedes the earlier page-block approval below: the user identified icon occlusion, insufficient weight and insufficient icon/title spacing in that version.

- Source: `C:/Users/Eric/AppData/Local/Temp/codex-clipboard-9c96dccd-cd1a-4001-b714-08058068ab9a.png` (439 × 100).
- Rendered evidence: `test-results/page-link-style-row.png` (351 × 80), `test-results/page-link-style-desktop.png` (1440 × 1000), and `test-results/page-link-style-revised-comparison.png` (439 × 212, reference above implementation).
- Independent Chrome, deviceScaleFactor 1, temporary vault, unselected Child page and Link to page rows. The 16px body-text crop is enlarged 1.25× for comparison with the reference's approximately 20px text. Both images were opened together before review.
- Typography: changed weight 400 → 600; kept thin title-only underline. Existing Segoe UI/CJK font fallbacks remain. Labels match the reference fixture.
- Spacing: icon slot 18 → 20px and gap 8 → 10px, placing the title approximately 30px after the slot origin. Reduced vertical padding from 3px to 1px to match the reference row rhythm after normalization.
- Icons: page icons reduced from 18px to 16px. The arrow uses a transparent SVG canvas, shifted down/right; removed the opaque background in normal, hover and selected states. The 18px Lucide canvas contains an approximately 9px diagonal arrow stroke, so it remains legible without masking the bulb.
- Colors: existing inherited foreground and row hover/selection colors; no white square over the icon. Native Windows emoji artwork differs from the reference's platform artwork.
- Earlier P2 findings (occlusion, weight, spacing) corrected. The first revision's arrow was too small after accounting for Lucide's internal padding; its transparent canvas was enlarged and repositioned, then recaptured.
- Build passed. Focused page-reference Chrome regression passed; temporary browser checks also cover role distinction, icons, navigation to both pages, unchanged source through mode switches, title wrapping and no uncaught page errors.
- Full unit run: 380 passed, 1 skipped, 1 failed. The independently reproduced failure is `tests/unit/content-objects.test.ts:44`, missing `implementationRoles.link_mention` in the current workspace; neither that registry nor the schema was edited for this styling correction. Do not interpret visual approval as a clean full test suite.
- Scope remains these two page blocks. Full mobile-shell visual approval is excluded, as described in the previous report.

final result: passed

# Page block style verification — 2026-09-22 (superseded above)

Scope: existing editor Child page and Link to page blocks, using the user's screenshot. Earlier component reports below are retained.

- Source: `C:/Users/Eric/AppData/Local/Temp/codex-clipboard-79567207-92d9-4b05-b50a-97d9f607a8dc.png` (474 × 89).
- Implementation: `test-results/page-link-style-desktop.png` (1440 × 1000), `test-results/page-link-style-row.png` (379 × 71).
- Combined comparison: `test-results/page-link-style-comparison.png`, source above implementation. Chrome deviceScaleFactor 1; implementation crop enlarged approximately 1.25× to compare the app's 16px body typography with the reference's approximately 20px capture. This is a local component comparison, not a full-screen reconstruction.
- State: two unselected rows, actual saved notebook/lightbulb page icons, `New page` and `开发ideas` titles. Tests use an independent Chrome session and disposable vault.

## Findings and comparison history

- First comparison found a P2 icon overlap: global SVG sizing enlarged the reference arrow to 18px and masked the bulb. Explicit 12px CSS dimensions corrected it. The combined screenshot records the subsequent passing comparison.
- Typography: normal-weight inherited body text; both block titles have a thin underline, without underlining their icons. The app's font/color are retained rather than changing the entire editor to the reference capture's typography.
- Spacing: compact borderless rows with aligned icon/title columns; existing editor 4px block spacing retained. The reference has a slightly tighter vertical rhythm after density normalization, accepted to preserve document spacing conventions.
- Colors: existing editor text and hover/selection backgrounds retained; the arrow's background follows these states. Keyboard focus has a visible outline.
- Assets: saved emoji/Lucide page icons and library ArrowUpRight; platform emoji artwork differs from the reference. The screenshot's emoji are actual page metadata, not generated asset substitutes.
- Content/behavior: explicit `role=child` has no arrow; untyped and other page block references have the arrow. Inline mentions retain their existing presentation. Title wrapping is retained.

## Verification and limits

- `npm test`: 381 passed, 1 skipped; `npm run build` passed (existing large-bundle warning).
- Focused `npm run test:e2e -- tests/e2e/editor.spec.ts -g 'page mentions and child pages stay visual'`: passed.
- Temporary browser QA verified both target navigations, persisted source unchanged across mode switches, saved icons, arrow distinction and size, narrow-width long-title overflow, and no uncaught page errors.
- Mobile screenshot is not used as visual approval evidence: the existing sidebar overlays the document during viewport changes. Narrow-row overflow was checked separately; full mobile shell behavior is outside this style change.
- No remaining P0/P1/P2 findings in the requested page-block styling scope. Screenshot-density, native emoji and shared row spacing differences are accepted existing-product constraints.

final result: passed

# Breadcrumb visual verification — 2026-09-22

Scope: breadcrumb block only; existing editor and unrelated controls retained.

- Source: `C:/Users/Eric/AppData/Local/Temp/codex-clipboard-1969f2bd-ba8a-41dd-91ae-1f78414c0a9b.png` (1080 × 83).
- Implementation: `test-results/breadcrumb-row.png` (1080 × 83 crop), `test-results/breadcrumb-desktop.png` (1600 × 900), `test-results/breadcrumb-mobile.png` (390 × 844).
- Browser: independent Chrome, temporary vault, deviceScaleFactor 1. Desktop state: Systematic / On note apps / Playground; first link hovered. Reference and rendered crop inspected together.

## Findings

No remaining P0/P1/P2 issues in the breadcrumb scope.

- Typography: normal-weight inherited editor font; no link underline. The application keeps its 16px body text rather than adopting the reference capture's approximately 20px text size across this one block.
- Spacing: card border and padding removed; compact icon/title rows with slash separators. Desktop stays on one line; mobile wraps by breadcrumb item without horizontal overflow. The surrounding editor toolbar and following paragraph visible in the crop are existing app context, outside the supplied reference's scope.
- Colors: inherited text color, muted independent separators, light gray hover background and visible keyboard focus outline.
- Assets: actual saved page icons, rendered with the same emoji/Lucide mechanism used by page links. Native emoji appearance varies by platform; no screenshot-derived fake icons.
- Content: page titles and icons match the fixture. Empty paths derive ancestors and current page; explicit stored paths retain their order. Missing pages use a non-interactive label.

## Verification

- First visual comparison passed; no subsequent visual repair iteration was required.
- `npm test`: 357 passed, 1 Windows symlink-condition skip.
- TypeScript/Vite build passed into `.run/breadcrumb-dist` to avoid replacing another task's build.
- Two isolated Chrome browser tests passed: automatic hierarchy, page icons, navigation, current-page semantics, mobile overflow, missing references, source-view switch and unchanged Markdown.
- Server reports existing missing-asset requests during the test harness run; navigation and rendered breadcrumb icons passed. This does not constitute a claim that all application console output is clean.

## Follow-up polish

Native emoji glyphs differ from the screenshot's operating system. This is expected for user-selected page icons and is not replaced with a fixed image.

final result: passed

---

# Tabs visual verification — 2026-09-22

Scope: existing Tabs block, following the user's second screenshot. Previous breadcrumb review above is retained.

- Reference: `C:/Users/Eric/AppData/Local/Temp/codex-clipboard-d3aefd46-f0c5-4b6e-8b29-62e225e1f44a.png`, 994 × 290 pixels.
- Implementation: `test-results/tabs-desktop.png` (1440 × 1000), `test-results/tabs-detail.png` (724 × 320), `test-results/tabs-mobile.png` (390 × 844).
- Browser: independent Chrome with a temporary vault, CSS viewport equal to screenshot dimensions, deviceScaleFactor 1. No user vault or browser profile used.
- Desktop state: Tab 2 selected, its action menu open, three tabs and the reference's sample body text. Mobile state additionally includes a renamed tab, saved icon, and a fourth tab to check overflow.
- Comparison: source and final implementation crop opened together in the same tool result. Full desktop context and mobile capture also inspected. No density scaling applied; the app's existing 708px content width remains narrower than the reference's 880px card.

## Findings and comparison history

- Initial comparison flagged tab typography as a potential P2 mismatch. The strip now explicitly uses `15px / 22px system-ui, sans-serif`; a browser computed-style check confirmed both button and label fonts. The final capture was rechecked against the reference. The surrounding editable body retains the application's existing font and paragraph rhythm.
- Spacing/layout: one rounded outer boundary, a compact horizontal strip, adjacent add icon, selected pill, and a floating menu anchored below the selected label. Inner panel border removed. App-scale padding (18/22px) and 34px controls intentionally follow the current editor density rather than scaling the entire editor to the reference. Long labels truncate; excess tabs scroll inside the strip. Mobile menu stays within the viewport.
- Colors: neutral gray selection, muted plus icon, light boundary and shadow, visible keyboard focus. Border contrast is deliberately softer than the black wireframe outline in the reference. Delete uses the application's destructive-action color.
- Assets: existing Lucide library supplies actual plus, rename, smile, move, and delete icons. The design requires no raster assets. Saved user icon text uses the existing picker.
- Copy/content: Rename, Edit icon, and Delete retained. Existing left/right reordering is in the menu. Copy link is omitted because there is no implemented tab-specific navigation target; README documents this boundary. No inert menu items introduced.
- Final comparison found no remaining actionable P0/P1/P2 visual issues within this scope.

## Interaction verification

- `npm test`: 360 passed, 1 skipped.
- TypeScript/Vite build passed; latest keyboard changes also built into `.run/tabs-dist`.
- Related Chrome suite: 34 passed across tabs, object services, manual acceptance pages and shared callout icon picker.
- Latest Tabs-focused rerun: 2 passed, including undo/redo while focus stays in the tab strip.
- Covered pending body edits during tab switches; rename commit/cancel; icon persistence; unknown group/tab attributes; reordering; add/delete undo and redo; inactive-tab deletion; last-tab protection; reload; keyboard switching; menu dismissal; and mobile overflow.
- Tabs browser tests assert no uncaught page errors. The isolated build test server also logs missing-file requests, so this is not a claim that every network request is error-free.
- Earlier service test used the removed inner card edge to open tab properties; updated it to exercise the new Rename menu. The updated regression passed.

## Implementation checklist

- [x] Compact tab strip and menu integrated with existing editor.
- [x] All document changes use ProseMirror history and existing Markdown persistence.
- [x] Responsive/focus states verified in Chrome.
- [x] README records implemented behavior and link/drag-ordering boundaries.

final result: passed

# Web bookmark — Notion reference implementation (2026-09-22)

## Visual evidence and comparison

- Source: `C:/Users/Eric/AppData/Local/Temp/codex-clipboard-03adaacb-8e91-4a26-8bba-4c169a1f422c.png` (930 × 256), and `C:/Users/Eric/AppData/Local/Temp/codex-clipboard-931e4887-7a7d-495d-9530-4a34d31e2437.png` (935 × 203).
- Chrome captures: `test-results/bookmark-create.png` (1440 × 1000), `test-results/bookmark-card.png` (708 × 184 component crop), and `test-results/bookmark-mobile.png` (390 × 844). All are CSS pixels at deviceScaleFactor 1.
- Both source references and all three implementation captures were opened in the same comparison input. Compare the bookmark component, not the surrounding Notdown application chrome. The reference card is 880px wide; the implementation follows the existing editor's 708px content column. This intentional width difference changes line wrapping without scaling text or altering the application's page layout.
- States: empty block with creation popover (implementation also shows a typed URL), completed Bilibili card, narrow viewport with edit popover. The 378px popover, its blue primary button and focus ring, and the 184px completed card height match the reference geometry. On mobile the popover clamps to the viewport and the card adapts to the content column.

## Findings and iteration history

- Initial P2: the global SVG rule reduced the bookmark icon from its intended 25px to 18px. Added explicit component icon dimensions. Recaptured and compared: the empty-state outline now matches the visual reference's weight and size.
- Initial image fallback: the test supplied an unavailable favicon URL. A live metadata request to the public Bilibili page returned its actual CDN icon URL; updated the fixture. The final capture displays the website's real icon, with a tested outline-icon fallback when images fail.
- Typography: uses the existing app sans-serif stack, 18px empty-state text, 20px/26px semibold title, 16px description/URL, and 14px helper text. Reference hierarchy and readable line spacing preserved. Narrow screens use 18px titles and 14px detail text.
- Spacing/layout: 60px empty row, 12px card corners, thin dark outline, 30px horizontal card inset and compact content spacing. Description clamps at two lines and long URLs truncate. Popover is centered below its bookmark and remains on screen.
- Colors/tokens: neutral pale empty surface, white card, dark text/outline, muted helper text, blue primary button and visible blue focus ring. Hover actions use existing app surfaces.
- Assets: actual remote favicon; Lucide Bookmark/Pencil/RefreshCw icons. No generated or approximated brand artwork. Cover image occupies the right portion only when the webpage supplies it.
- Copy/content: Add a web bookmark, Create bookmark and Create a visual bookmark from a link match the source. Update, loading, validation and retry messages extend the working flow. User-selected links supply actual content.
- Focused comparison: the card-only capture exposes typography, icon, inset, border and wrapping directly; the full creation screenshot makes the popover and anchor visible without browser chrome.
- Final comparison: no actionable P0/P1/P2 visual differences in the requested bookmark scope. Existing editor width and mobile typography are intentional product adaptations.

## Interaction verification

- Creation via slash and URL paste; input focus and Enter submit; invalid protocols; Escape and outside-click cancellation; pending-request cancellation; failed metadata fallback; broken images; whole-card external link; edit/refresh/properties; one-step creation undo/redo; Markdown reload and unknown attribute preservation; mobile popover bounds.
- Delayed metadata cannot replace a removed or externally changed bookmark. Refreshing existing saved cards does not run automatically on page load.
- Bookmark browser tests assert no uncaught page errors. Separate full-suite server logs can contain missing static-file requests; this is not a claim that all network requests succeed.
- Unit tests cover metadata entity decoding, source/unknown-field preservation across Notdown/GFM, code-fence boundaries, URL validation, private-address rejection and bounded redirects. Build and final browser results are recorded in `.run/logs/.run-bookmark-*.log`.

## Implementation checklist

- [x] Empty state, anchored popover and visual card integrated into the existing editor.
- [x] Metadata saved through existing Markdown/CAS flow and ProseMirror history.
- [x] Responsive, keyboard, cancellation, failure and stale-response behavior exercised in isolated Chrome.
- [x] README, format and API docs describe implemented behavior and public-HTML limitations.

final result: passed

## Bookmark final verification results

- Latest `npm test`: 409 passed, 1 skipped, 0 failed (`.run/logs/.run-bookmark-final-unit.log`).
- Latest TypeScript/Vite build: passed (`.run/logs/.run-bookmark-verified-build.log`).
- Final isolated Chrome run for bookmarks, block properties and link previews: 11 passed, including opening the real link target in a new tab (`.run/logs/.run-bookmark-verified-e2e.log`).
- A broader run was interrupted after 102 cases. Its column-resize failures passed on a newer isolated build, along with bookmark and preview checks (16 passed in `.run/logs/.run-bookmark-confirm.log`).
- The remaining broad regression files completed with 114 passed / 3 failed (`.run/logs/.run-bookmark-remaining.log`). Outstanding failures outside the bookmark implementation: Notdown defaults test expects 9 extension checkboxes but the workspace now has 10; page-navigation history expects Back to be disabled; sidebar-drag conflict toast is displaced by an existing reminder toast. These are reported, not counted as passing.
- Design QA result above is scoped to the requested bookmark component, not a claim of an entirely passing repository regression suite.
