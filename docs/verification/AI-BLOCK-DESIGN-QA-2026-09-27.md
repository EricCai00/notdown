# AI block design QA — 2026-09-27

**English** · [简体中文](AI-BLOCK-DESIGN-QA-2026-09-27.zh-CN.md)

final result: passed

## Follow-up: generated result and preset state

The user's follow-up attachments `codex-clipboard-a71e4dcf-0632-4ab0-96b8-96af768819e2.png`, `codex-clipboard-fc182874-7137-4694-a8a9-f737bf819155.png` and `codex-clipboard-03c594ee-acd2-423a-9561-2e7a3afb9c27.png` (same Temp directory as below) replace the earlier result toolbar and preset behavior. The generated result now fills the bordered card; Good response, Bad response, Settings and a blue Generate button sit at the top right. Feedback toggles are session-local and reset when body content changes. No provider feedback endpoint is claimed. Opening Settings preserves the editable result; Done restores it.

Page summary and Key points show a fixed centered description on a pale background and a disabled Current page only selector. Custom prompt/context/search values stay in the source and reappear when switching back to Custom output, but are excluded from preset requests. This supersedes the earlier behavior that appended custom instructions to presets.

Latest visual evidence: `test-results/ai-result-reference-width.png`, `test-results/ai-preset-reference-width.png`, and `test-results/ai-result-comparison.png`. Source result crop `(101,15,996,579)` is 895 × 564 pixels. Implementation is 895 × 566, at a 1440 × 1000 viewport, deviceScaleFactor 1 and a card-width-only harness adjustment. `test-results/ai-generated-narrow.png` checks the 390px viewport; controls remain above the content without overlapping the wrapped heading. The result fixture follows the supplied text for line-wrap comparison; page emoji and other account-specific content are not synthesized into generated output.

The source and implementation were inspected together. An initial result capture exposed inherited paragraph padding and wider body typography, adding excessive height. Scoped zero paragraph/heading padding and Segoe UI result typography brought the card within two pixels of the source height. Title/body hierarchy, card border, compact action group, blue button, neutral/pressed feedback, fixed preset box, muted page title and focus states pass. Remaining P3 differences are library icon outlines, platform text antialiasing and minor list indentation. Earlier generated-layout mismatch is resolved; final result remains passed.

Follow-up verification: `npm test` passed 835 tests with 5 skipped and no failures (`.run/logs/ai-result-unit.log`). Seven focused Chrome tests passed after the behavior change, covering preset isolation/restoration, result actions and feedback, busy controls, settings round-trip, result persistence, mobile layout, typed mentions, generated-body undo and delayed-result protection. Provider responses were mocked. Logs for the final build/browser rerun are `.run/logs/ai-result-verified-build.log` and `.run/logs/ai-result-verified-e2e.log`.

## Visual evidence

- Source: user attachments `C:/Users/Eric/AppData/Local/Temp/codex-clipboard-1423249e-fbaa-4013-bdcd-3a1ac0151dbe.png` (1021 × 569), `codex-clipboard-3d26d60f-17dc-440d-a15a-883a81143460.png` (930 × 576), `codex-clipboard-7ec2a867-c861-4ee2-983a-7bbd679621ad.png` (916 × 714), and `codex-clipboard-cf884f87-3118-4740-9bf5-1572310c4910.png` (886 × 690).
- Chrome viewport: 1440 × 1000 CSS pixels, deviceScaleFactor 1. The real page constrains the card to 708 CSS pixels. A comparison harness sets only the card width to 895 pixels, matching the source card; it does not alter product CSS.
- Source card crop: `(112, 16, 1007, 560)`, 895 × 544 pixels, no density scaling. Implementation: `test-results/ai-reference-width.png`, 895 × 543 pixels. Side-by-side comparison: `test-results/ai-comparison.png` (source left, implementation right).
- Open Generate menu: `test-results/ai-reference-menu.png` and `test-results/ai-generate-menu.png`; specified context: `test-results/ai-specified.png`; mention menu: `test-results/ai-mentions.png`. The context and mention captures intentionally use real local test fixtures rather than copied Notion account data.
- Narrow layout: 600 × 1000 CSS viewport, `test-results/ai-narrow.png`. Card and controls stay inside the viewport; labels wrap and context chips remain removable.

## Comparison and fixes

Initial captures exposed generic button CSS overriding the component's border, font and spacing. Component selectors were scoped more specifically. A second pass corrected heading, label and button sizes and the vertical rhythm: the final card is within one pixel of the reference height at equal width. ProseMirror was also reparsing contentDOM visibility mutations; ignoring only that view-owned attribute change fixes reopening without suppressing actual body edits.

The final full card and menu captures were opened alongside the source screenshots. All text, icons and controls are legible at this scale, so separate magnified crops are unnecessary.

| Required surface | Result |
| --- | --- |
| Fonts and typography | Arial/sans-serif; 20px title, 18px labels/selects/Done, 17px prompt. Computed styles checked in Chrome. Platform antialiasing and a slightly wider Done label are P3 differences. |
| Spacing and layout | Matching 48px selects, 190px prompt border box, 24px section gaps, rounded outline, inset title/Done row. Equal-width card heights 544px source / 543px implementation. |
| Colors and tokens | White surface, muted blue-gray outline, blue Done, gray selected menu row, blue focus ring, neutral chip background. |
| Asset quality | Existing Lucide library icons; no generated artwork required. Icon shapes differ slightly from Notion's proprietary icons (P3). Local pages/contacts do not impersonate the source account or reuse avatar photos. |
| Copy and content | Generate/Using/Done and the three preset labels follow the reference. Search names the real local search behavior; no fake Notion workspace search, guest status or Invite action. These are intentional product boundaries. |

No actionable P0/P1/P2 visual findings remain. P3: exact proprietary icon outlines and OS font rasterization differ. No user decision is required.

## Interaction verification

Latest focused Chrome run: 8/8 passed (`.run/logs/ai-complete-browser.log`): configure, persist/reload, remove context, current-page and specified retrieval, local title search, page/person/date chips, typed @ and keyboard choices, switch Page/Source with pending prompt input, service errors, Markdown list output, generated-body undo, delayed result protection, existing property and tab regressions. Browser page errors were checked in the keyboard/narrow-screen test: none. Service responses are mocked; no live paid provider call was made.

Unit/service suite: 828 passed, 5 skipped, 0 failed (`.run/logs/ai-unit.log`), including AI codec round-trip, unknown attribute/fence preservation and Notion dialect boundaries. Latest typecheck passed (`.run/logs/ai-latest-typecheck.log`); isolated Vite build passed (`.run/logs/ai-final-vite.log`); final `npm run build` passed (`.run/logs/ai-build-final.log`).

An expanded 10-test run passed 9 and failed the unrelated table-boundary test because it still expected the former `Merge right` control (`.run/logs/ai-verified.log`). Concurrent table/synced-block work also temporarily interrupted builds; those diagnostics were kept separately and no unrelated implementation was reverted.

## Completed checklist

- [x] Reference-aligned inline configuration, menus and context chips.
- [x] Real local retrieval and configured generation provider path.
- [x] Document transactions, pending-input persistence, undo and delayed-result protection.
- [x] Markdown source preservation and Notdown-only syntax boundary.
- [x] Desktop/narrow visual comparison and focused browser tests.
- [x] English/Chinese README and format/feature documentation updated.
