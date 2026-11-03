<a id="日期与提醒显示修正2026-10-26"></a>

# Date and reminder display corrections (2026-10-26)

**English** · [简体中文](DATE-PRESENTATION-2026-10-26.zh-CN.md)

<a id="范围与依据"></a>

## Scope and basis

Corrected the date display of the text and meeting title: unified `@`, relative date, 12/24 hour format, static without background color, ordinary date gray, alarm at the end of reminder. The official independent date and time fields no longer fall back to the general gray background text; the time zone is placed in the details. Date comparisons use the current day of the declared time zone, covering midnight, New Year's Eve, and daylight saving time.

The screenshot of Notion provided by the user shows `@Last Friday` with `@Last Saturday 9:00 AM` in red. The normal date gray and the expiration reminder red use the text color of the screenshot. According to [ Notion official reminder instructions ](https://www.notion.com/help/reminders), future reminders are blue, Today or expired reminders turn red; ordinary dates do not turn red because of the past. The relative format of the week label covers 2 – 6 days before and after, and the rest fall back to the complete date; this boundary is the current implementation rule, and all Notion boundaries have not been measured on a daily basis.

<a id="数据与能力边界"></a>

## Data and capability boundaries

- Notion Enhanced Markdown returns the specific date, independent time and time zone, and does not treat the displayed text such as `Today` as the actual date. The actual page read with time and date did not return the reminder field; the reminder cannot be inferred based on time.
- Official dialects do not activate local reminders or write format extensions. The initial round will make the independent time field read-only; the following patch has enabled native date, time and time zone editing, and made the format only effective in the official node view session. Edited to retain unknown attributes and original date vector.
- When the original text is not edited, the bytes remain unchanged; user files are not migrated in batches, and the real vault is not modified.
- The local reminder service still relies on the application to run; the cloud reminder service of Notion will not be restored this time.

<a id="验证"></a>

## Validation

- `npm test`: 1, 076 items, 1, 071 pass, 5 skip, 0 fail.
- `npm run test:e2e -- tests/e2e/date.spec.ts tests/e2e/meeting-date.spec.ts tests/e2e/meeting-notes.spec.ts tests/e2e/notion-v2-import.spec.ts tests/e2e/inline-context-menu.spec.ts`: Type check, production build, and 26 Chrome tests passed. An independent temporary vault is used, without user browser connection; the full browser suite is not implemented.
- Added v2 date, `@`, independent time and time zone covering two dialects, source code original text retention, date editing and saving overloading, as well as the color and alarm sequence of normal/future reminder/Today reminder/expired reminder.
- Finally, the reminder value verification is added, and the ISO time threshold of the local reminder service is used to prevent unknown values such as `5` that can be loosely parsed by JavaScript from being mistakenly displayed as valid reminders; the date and dialect boundary single test 12 items are passed, and the log is `.run/logs/date-presentation-boundary.log`.
- Viewed browser screenshot: `test-results/browser/date-Notion-date-presentat-fcc1c-while-plain-dates-stay-gray/date-reminder-states.png`; the imported date screenshot is located at the same level corresponding to `imported-dates.png`.
- Logs: `.run/logs/date-presentation-unit.log`, `.run/logs/date-presentation-browser.log`; desktop builds are logged in `.run/logs/date-presentation-desktop-final.log`.

The desktop installation package is output to `.run/date-presentation-release/` separately and does not overwrite the original `.run/desktop-release/` product; the currently running installed application is not closed or replaced.

<a id="补修原提醒恢复与完整菜单"></a>

## Fix: Original reminder restored with full menu

The user further stated that this entry was originally reminder . Read-only view the original page of Notion, confirm the date is 2026-10-24 09:00, Timezone is PDT, Remind is **On day of event**; the remote content is not modified. Add `reminder="2026-10-24T16:00:00.000Z"` and `reminder-offset="0"` to the local import record confirmed by the user. Write through `createVault.update` and `baseRevision` when reading, retain unknown attributes and all other text; save `.run/date-reminder-repair/Blocks-before.md` before modification, and have a historical snapshot of the vault. Log `.run/logs/date-reminder-repair.log` only records revision and reminder time, without text. Confirm that the reminder field has been read after reloading the currently saved window. This is a recovery of verified records, not a "when available" batch extrapolation.

Notdown dates no longer limit the menu because they contain `startTime` / `endTime` / `timeZone`. Complete the 10 minutes ago and 2 hours ago options, and the date range, Include time, Date format, Time format, Timezone, and Remind are all operable. IANA time zone parses daylight saving time by target date, rejecting non-existent local times; date, time and time zone modifications recalculate relative reminders. Independent date fields are still saved as independent fields. The official dialect can also edit the native time/time zone. The display format only takes effect in the node session and does not write local extensions.

The import preview explicitly warns the real date label that Markdown API does not provide reminder configuration; date examples in code fences do not trigger warnings and do not automatically create reminders.

Follow-up fix validation:

- Full `npm test`: 1, 078 items, 1, 073 passed, 5 skipped, 0 failed, log `.run/logs/imported-reminder-unit.log`.
- Type checking and production build pass. 28 items related to Chrome returned to the first round, 27 passed, and the 1 item test selector failed because it matched the End date input and switch at the same time; after switching to the textbox role, the complete date file 10 items passed the retest, and the remaining 18 items passed the first round. Log `.run/logs/imported-reminder-browser.log` and `.run/logs/imported-reminder-browser-final.log`; not running the full browser suite.
- The browser covers independent field setting reminders, time/IANA time zone modification, cross daylight saving time reminder recalculation, range/time switch, removal reminder, save reload, unknown attribute retention, and the official format is not included in the disk. Viewed screenshot `test-results/browser/date-Notion-date-presentat-9bd1a-eminders-in-their-IANA-zone/complete-imported-date-menu.png`.
- The patched desktop installation package is output to `.run/reminder-editor-release/` and the build log is `.run/logs/imported-reminder-desktop.log`; the running installation version program has not been replaced, and the complete menu needs to be updated to the installation version to take effect.
