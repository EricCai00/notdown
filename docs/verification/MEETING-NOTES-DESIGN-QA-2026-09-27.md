# Meeting notes design QA — 2026-09-27

**English** · [简体中文](MEETING-NOTES-DESIGN-QA-2026-09-27.zh-CN.md)

final result: passed

Scope: Conference cards and menus in 8 Notion Meeting notes screenshots provided by users; access the current Notdown editor and do not copy peripheral Playground pages, photos or Notion exclusive services.

<a id="视觉对照"></a>

## visual contrast

Use independenceChrome The table with the temporary knowledge library.viewport 1440 × 1000、deviceScaleFactor 1；The empty card is extra880 CSS px Broad-screen, with reference charts1 In the middle880 px Card area alignment.600 × 900。Reference diagrams and implementation shots are opened in the same visual comparison input; language menus are corrected and compared again.

The evidence is located at `test-results/meeting-empty.png`, `meeting-language.png`, `meeting-instructions.png`, `meeting-narrow.png`. The run log is located at `.run/logs/meeting-*.log`. These are local verification products and do not belong to user vault.

| inspection surface | result |
| --- | --- |
| Fonts and levels | 28 px title, gray relative date, 17 px menu, lighter placeholder and description text; reuse project font and Lucide icon. |
| layout and spacing | Rounded stroke, title divider, Notes capsule on the left, settings and blue main button on the right, empty text and instructions/agreement instructions at the bottom. Narrow screen bottom bar wraps, no horizontal overflow. |
| Color | Neutral stroke, white background, gray placeholder, blue main operation and date selection state, menu has independent border and soft shadow. |
| Pictures and Icons | Meeting cards do not contain bitmap assets; use the existing icon library and do not copy the photo below the reference page into the note block. |
| copywriting | Use the real Notdown service boundary; the placeholder is AI can summarize, do not pretend to be Notion AI, and do not promise automatic execution or real-time recording. |

Fix the loop: In the first screenshot, it was found that the editor's general placeholder overlaps with the conference placeholder (P2). The general placeholder has been suppressed within the limited range of the conference body. Subsequent screenshots of the same width confirm that there is no overlap. The language submenu covers the parent menu (P2) on the right edge of the screen. It has been flipped to the left according to the available space. After repairing, take a screenshot again to confirm that the parent menu and language list are readable.

Remaining P3: The character/settings/pen icons follow the existing Lucide variant, with a small pixel difference in the title row and empty state height; does not block the current product implementation. Advanced date range, reminder, real-time recording, Notion exclusive demonstration/feedback, cross-page Move to are not included in this implementation, please see the functional documentation.

<a id="功能与保存"></a>

## Function and save

- `npm test`：841 passed、5 skipped、0 failed。
- `npm run build`: Passed; final menu fix passed `npm run typecheck` again with independent directory Vite build.
- `npm run test:e2e -- ...`: Covers conferences, services, official containers, object editing and block attributes, totaling 17 passed and 1 failed. The failure is when `object-editing.spec.ts`'s form use case times out waiting for the `Merge right` button and does not involve the meeting card; it is not counted as a pass for the entire set of browser tests.
- Final conference project: 5 passed. Verification date, language, default and custom instructions are saved and reopened, unknown attributes are retained, upload/agree/transcription/summary, original notes are retained, delayed response recovery, official dialect does not write extensions, narrow screen and stable label links.
- The return of services/official containers outside the project has also been passed; the user browser or user vault is not connected.

For the boundary between source code and implementation, see [ Meeting notes ](../features/MEETING-NOTES.md).

<a id="同日修正复用-mention-日历"></a>

## Same day fix: reuse mention calendar

Previously, the conference calendar was independently implemented without reusing the existing date component. This implementation and exclusive style have been deleted. The conference title is directly bound to `DateMentionView` and uses the same `date.css`. This section replaces the above unrealized boundaries about date ranges and reminders: Notdown meeting dates support existing ranges, times, formats, time zones, and local reminders; the official dialect only opens start/end dates and does not write extended attributes.

- Visual evidence: `test-results/inline-shared-calendar.png` and `test-results/meeting-shared-calendar.png` , the controls and styles of both panels are identical; the automation simultaneously compares the full panel HTML and checks the positioning within the 420 px viewport.
- Interaction regression: meeting date, meeting notes, text date, official MCP container totaling 15 passed and 0 failed. Overrides save-reopen, unknown properties with other date retention, undo/redo, undo after clear, re-add, view switching and official dialect restrictions. Log: `.run/logs/meeting-date-final-e2e.log`.
- Unit and service tests: 846 passed, 5 skipped, 0 failed, log: `.run/logs/meeting-date-unit.log`.
- Finally `npm run build` passed, only the existing large volume chunk prompts, log: `.run/logs/meeting-date-production-build.log`.
- After closing the panel, restore the editor focus and undo access to the existing unified history; do not describe multiple setting changes as an overall undo.
