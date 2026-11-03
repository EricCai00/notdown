<a id="date--reminder-交互验证"></a>

# Date / reminder interaction validation

**English** · [简体中文](DATE-VERIFICATION.zh-CN.md)

2026-09-22. This time, we use the date blank screenshot provided by the user, [ Notion date reminder description ](https://www.notion.com/en-gb/help/reminders) and [ @ mention guide ](https://www.notion.com/help/guides/reminders-and-mentions) as cross reference. Notdown uses its own ProseMirror node view and Markdown codec and does not access the Notion notification service.

<a id="实现与边界"></a>

## Realization and boundaries

- `/date`Insert in-line `@Mention a date…` empty state and open Today / Remind me menu; normal date shows relative date, reminder with clock icon and blue/red due date.
- Text `@` supports today, tomorrow, yesterday, today/tomorrow/yesterday, ISO date, English week, and `@remind tomorrow 9am` and other clear date and time combinations. Not a general-purpose natural language date parser; code blocks, inline code, and email addresses do not trigger date replacement.
- The date pop-up layer provides month turning, calendar day selection, start and end dates, time, reminder advance amount, date and time display format. Supports local time zone, UTC, and fixed offset; full IANA regional time zone catalog is not provided.
- The calendar supports arrow keys, Home/End, PageUp/PageDown, Enter, Escape and click outside to close. Valid field input immediately enters the document transaction; error dates/inversion intervals do not overwrite the last valid value.
- Use the original `<mention-date>` and CAS to save, retain the unknown attributes and import label text (displayed in the date prompt); the date label is generated based on `start`. Source code switching, undoing and refreshing all retain dates. The imported independent reminder time will not be changed to a relative reminder without authorization due to editing date.
- Local reminders follow the existing in-app scheduling, which is triggered when the app is opened and reissued when it is reopened; there are no emails, repeated reminders, or operating system background scheduling when the app is closed.

<a id="自动验证"></a>

## Automatic verification

- `tests/unit/date-mention.test.ts`: 5 items passed, covering local date, leap year, English/Chinese input, invalid date, code boundary, Markdown unknown attributes and code fence retention, reminder absolute time, damaged imported attributes.
- `npm run test:e2e -- tests/e2e/date.spec.ts tests/e2e/object-editing.spec.ts --output test-results/date-final-browser --reporter=list`:Build passed. Before the revision, all 11 items of elastic layer avoidance passed; after the revision, 9 items passed and 2 items failed. The failure was in the definition list and synchronization block test. 5 date interaction and 1 reminder deduplication tests all passed. Independent temporary vault, Chrome independent interfaceless instance, port 4344.
- Browser coverage: menu insertion, start and end dates, time/time zone/advance reminder save and refresh; source code switching; keyboard date selection and cancellation; narrow screen accessibility; empty state cancellation; import invalid date correction; input in the code maintains literal content; expiration reminders remove duplication across refreshes.
- Screenshot: `test-results/date-quick.png`, `test-results/date-calendar.png`. The date blank status, shortcut menu, date range, reminder settings and pop-up layout have been checked.

The logs for full workspace regression are located at `.run/date-unit-final.log` and `.run/date-e2e-full.log`. Latest unit tests pass on 413, fail on 2, skip on 1; fail on default extension for `tests/unit/notdown-dialect.test.ts` and Lab preview assertions. There were concurrent changes to the workspace's extended classification/dialect code during execution; full regression results are logged separately from the date-directed validations above, and failures outside of dates are not described as all passes.

The complete browser regression plan executes 216 items. After the task is continued, the original process has ended and there is no completion report; the log finally records that 171 items passed, 8 items failed, and the remaining 37 items are not completed. Therefore, this time we only confirm the date and the above-mentioned executed use cases, and do not declare that all browsers have been returned.
