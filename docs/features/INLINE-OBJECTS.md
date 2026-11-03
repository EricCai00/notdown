<a id="行内对象题注与表格编辑"></a>

# Inline objects, captions and table editing

**English** · [简体中文](INLINE-OBJECTS.zh-CN.md)

2026-09-24. This note covers records in the early capability matrix for objects that do not yet have access, do not have a citeproc, or cannot edit captions.

<a id="可视编辑器快捷输入2026-09-26"></a>

## Visual editor input shortcuts (2026-09-26)

Conversions when closing characters are fully entered; conversions such as superscripts and subscripts, revisions, and inline footnotes support immediate Backspace restoration. Codes, escapes, and extensions not enabled for the current dialect remain entered literally. Superscript and subscript follow the standard correspondence, and symbols are not interchanged.

| Type | input |
| --- | --- |
| Autolink | `<https://example.com>`、`<name@example.com>` |
| Inline HTML | Complete pairing tags, such as `<kbd>Enter</kbd>`; also supports `<br>`, `<wbr>`, `<img …>`, and continues to use existing security preview and source code editing |
| Internal link | `[[页面名]]`, you can also use the existing `@` / `+` search menu |
| Emoji | `:smile:`Wait until short codes are supported; `:sm` can still open the selection menu |
| Inline math | `$公式$` |
| Subscript | `~文字~`(without whitespace) |
| Superscript | `^文字^`(without whitespace) |
| Highlight | `==文字==`、`{==文字==}` |
| Inline comment | `%%`Open the comment input window; `{>>注释<<}` will be completely closed and then the comment of CriticMarkup will be hidden. |
| Inline footnote | `^[脚注正文]`, the text can have inline format, display numbers and footnotes at the bottom, and the inline syntax will still be used when saving. |
| Abbreviation | `[>HTML]`Reuse the current page definition; `[>(HTML) Hypertext Markup Language]` defines inline abbreviations |
| Citation | `[@key]`, `[#key]`, `[locator][#key]`, `[^https://example.com]`, analyzed according to the current dialect; the bibliography will not be automatically compiled |
| Deletion | `{--旧文--}` |
| Addition | `{++新文++}` |
| Substitution | `{~~旧文~>新文~~}` |

CriticMarkup waits until the last `}` before converting, retains the revision type and original text, and does not apply highlighting/strikethrough in advance. Abbreviation and citation parsing will read existing definitions on the current page. If original text objects such as HTML span different existing inline formats, the input text is temporarily retained to avoid losing the format; complex or incomplete syntax can continue to be edited through Source. The default closed backslash delimiter rule for formulas remains unchanged.

`==文字==`The highlight style is shared with `{==文字==}`; normal text selection will be used when double-clicking, and highlighting will be removed when clearing the format. The source difference between ordinary highlighting and CriticMarkup is still retained internally in order to preserve the original syntax and comply with the respective expansion switches. Full page undo/redo does not yet restore historical cursor position.

<a id="方言扩展与类型"></a>

## Dialects, extensions and types

The text color and background color can be set at the same time: text and background in the color menu each retain another item, and Default only clears the corresponding item; after saving, use the nested official `<span color="…">`, such as outer `red` and inner `yellow_bg`. Both Notdown (including pages not marked v2) and Notion Markdown v2 are supported. The custom text attribute `bg_color` has stopped explaining, and the literal source code is retained when encountered; this time, two designated vaults are backed up and migrated according to user authorization, and other libraries will not be automatically migrated.

| Function | Dialects and switches | Classification and encoding |
| --- | --- | --- |
| URL Citation | The official Notion `notion_mentions`The Notdown is defaulted. | Inline `citation` , `[^URL]` , not footnotes |
| MMD Citation | MultiMarkdown of `mmd_citations`; Notdown is on by default | In-line `syntax_inline.citation`; `[#key]`, `[locator][#key]` and in-line bibliography; defined as internal structure, no product block is added |
| Pandoc Citation | Pandoc Markdown by default `citations`，Legacy GitHub ofPandoc reader The following:Notdown On by default | Inline `[@key, locator]`; CSL preview requires local bibliography/style files and Pandoc |
| MMD abbreviation | MultiMarkdown of `mmd_abbreviations`; Notdown is on by default | `[>term]`with `[>term]: definition` , an inline object |
| PHP abbreviation | PHP Extra defaults to `abbreviations`, Pandoc Markdown/Legacy GitHub reader is optional; Notdown is enabled by default | Ordinary words and `*[term]: definition`, inline mark; the definition is kept in the gap / tail of the source code |
| Terminology | MultiMarkdown of `glossary`; Notdown is on by default | `[?term]`with definition, inline object |
| metadata variables | MultiMarkdown of `metadata_variables`; Notdown is on by default | `[%name]`, read the text metadata; do not rewrite the page YAML |
| Add, delete, replace revisions | MultiMarkdown integrated `critic_markup`; Notdown is enabled by default | `{++new++}`, `{--old--}`, `{~~old~>new~~}`, inline mark |
| Image captions | MMD/Pandoc's `implicit_figures`; Notdown is on by default; official Notion media pictures use native Caption | Inherit `![Caption](URL)`; retain URL, title, and unknown attributes, and do not restore the removed local_figure protocol. |
| Table interactions | The corresponding dialect already has a table switch | A Table object; merging requires grid/MMD encoding that can preserve geometric information; official Notion does not add a span attribute |

The MMD exclusive switch cannot be forcibly turned on in CommonMark, GFM, CommonMark X, Original Markdown, Typora, Obsidian, PHP Extra, Pandoc Markdown and official Notion. Pandoc `citations` and PHP `abbreviations` are only open to the corresponding reader in the above table. Notdown brings together these existing extensions; explicit closing values ​​still take precedence, unknown configurations and original text are retained, and files are not migrated.

Standard basis: [ MultiMarkdown 6 ](https://fletcher.github.io/MultiMarkdown-6/syntax/index.html), [ PHP Markdown Extra ](https://michelf.ca/projects/php-markdown/extra/#abbr), [ Pandoc citations ](https://pandoc.org/MANUAL.html#citations), [ Notion Enhanced Markdown ](https://developers.notion.com/guides/data-apis/enhanced-markdown). CriticMarkup is an independent annotation syntax. This project follows the integrated extensions of MMD and does not claim that other dialects natively support it.

<a id="操作"></a>

## Operations

<a id="日期与提醒显示"></a>

### Date and reminder display

Date displayed uniformly `@` prefix, including Notion imported stand-alone `startTime`、`endTime`、`timeZone` Fields and v2 `<date>`. Ordinary dates are gray and have no permanent background color; the relative format displays Yesterday / Today / Tomorrow, the days before and after 2 – 6 display Last / Next plus the day of the week, and the rest displays the complete date; if there is a clear format, priority is still given. The time uses the 12 hour system by default, and the time zone is retained in the hover details and date panels and is not directly spelled into the text. The relative date is calculated based on the current day of the declared time zone, retaining the original date, time, unknown attributes and source code.

Reserved when actually configuring the reminder `@`, the alarm clock is displayed after the text: the future is blue, the date is Today or the reminder time has arrived, and it turns red; ordinary past dates do not turn red because of this, and illegal reminder values do not display the effective reminder status. Basis [Notion Reminders](https://www.notion.com/help/reminders)。The official dates and local dates are shared with the lunar calendar.Notdown Independence date/time of importationIANA The time zone also opens a full menu: date range,Include time、Date format、Time format、Timezone andRemind；Reminders include the time of the event,5/10/15/30 One minute.1/2 Time and day/week advance. Editors retain the original independent field and unknown properties, without requiring conversion toISO Text sections; time zone supportIANA The name and the date of the target date are analyzed in the summer time.

Official dialects can edit their native date, independent time, and IANA time zone, but do not write native reminders/format extensions; date and time formats only affect the current node view session. Notion Enhanced Markdown Reminders cannot be inferred when reminder fields are not returned, and dates with times do not automatically become reminders; the import preview explicitly warns about this. Individual reminders that have been verified by the user or the original page settings can be compensated through the existing `reminder` / `reminder-offset`. Local notifications are still only checked when the application is running, which does not mean that Notion's reminder service has been restored.

<a id="桌面行内对象右键菜单2026-10-26"></a>

### Desktop inline-object context menus (2026-10-26)

Right-click on semantic objects such as links, page/location references, pictures, dates, contacts, inline formulas, inline codes, footnotes, citations, abbreviations and revisions to open independent menus. The object type is shown at the top, followed by View source, Turn into, and the operations available for that type. Bold, italic, color, underline, highlight, superscript and subscript are text styles and do not trigger this menu; links with styles are still processed as links.

View source is a read-only panel. Objects with sources are divided into Inline reference (inline citations) and Reference source (citation sources): links/pictures display the address and citation definition on this page, footnotes display the corresponding text, and citations display the corresponding literature definition; missing sources display clear prompts. Standard reference links/images display the original references and corresponding definitions according to the source location of the parser. Examples in code fences will not be regarded as definitions. The two parts can be copied separately without crawling the remote web page or rewriting the source.

Turn into provides plain text, inline code, and inline formulas when supported by the current dialect. Convert, remove links, and delete only work on the right-clicked object, retain expressible text styles, and can be undone. The menu provides Edit Link, Copy/Open Link, Edit Date/Formula, Open Contact, Jump to Footnote, Accept/Reject Revision and Property Editing by type. Edit source only accepts inline content; rejects old drafts if the document has changed since the editing panel was opened.

The menu supports the direction keys,Home/End、Escape；The light sign is semanticinline Internally availableShift+F10 Open the menu. Click External, scroll, modify the document or close the menu after switching the page. This entry is used for desktop mouse/keyboard; the touch screen of the mobile phone still follows the existing operating entry.

<a id="其他插入和编辑入口"></a>

### Other insertion and editing entry points

- `/`Provides Citation, Abbreviation, Glossary, Metadata variable, Addition, Deletion, Substitution; the menu is controlled by dialect and switch, and Notdown and Citation can select three codes.
- New references and definitions are inserted in one transaction and can be revoked together; existing definitions can also be selected. Insert cannot cover duplicate keys. PHP abbreviation preserves word boundaries.
- If there is an inline reference, double-click to edit the source code; for the PHP abbreviation, double-click to edit the definition. MMD Bibliographic Edit definition Edit the original definition and prohibit unintentional key changes or expansion into multiple blocks. Originally unused definitions are still retained and can be edited; when the last reference of a citation is deleted by page editing, the corresponding ref definition will be deleted simultaneously, and the undo/redo will simultaneously restore/delete the references and definitions.
- Double-click the revision to accept or reject it; the replacement revision displays the red original text with strikethrough and the new green text side by side, without using yellow highlighting. The original text is for display only, and the replacement text can be edited directly; double-click the replacement text to modify the original text. Save and still retain two copies of `{~~old~>new~~}`. This is a local single revision, not a multi-person review service.
- Modify the caption of Figure's Edit caption; double-click the official Notion independent picture to edit the properties of Caption. Complex original image syntax can still be edited from source code.
- The table supports Shift-click rectangular selection, Select row / column / table, TSV copy and paste, clear selection, insert rows and columns before and after, delete selected rows and columns, move rows and columns, merge selections and split. Matrix pasting must match the size, and a single value can fill the selection. Moves across merged cells and merges that cannot preserve coding are not performed; Markdown required headers are not moved into the text.

<a id="mmd-citation-与-footnote"></a>

## MMD citation and footnote

Footnotes appear in superscript, and there is a separate footnote area at the end of the text. The citation displays `(1)`, `(locator, 2)`, and the bibliographic area and number are independent of the footnote. Resolved duplicate citations reuse entries, each providing links back to various parts of the text; inline bibliographies also enter the citation sequence. `[Not cited][#key]` retains bibliographic entries and hides text markup.

MMD Entries with no visible text citations in the bibliography (including Not cited ) do not display return arrows; the same entry only provides return links for visible citations. Inline document description supports Edit definition. After entering the document text, it will be saved back to the original inline reference. locator, separators, formats and surrounding original text will be retained and can be undone; no new independent definition will be created. The input must still be a single-line document description containing spaces. Square brackets, backslashes, trailing semicolons, and definition key collisions are rejected. The edit button is displayed when the item is hovered or the button keyboard is focused; it does not remain visible after the panel is closed and the mouse is moved away due to the remaining mouse focus. External bibliographic files remain read-only.

The footnotes of MMD and Notdown are superscripted with numbers without brackets; the footnote area and the bibliography area each have horizontal lines, the numbers are aligned with the text indentation, and links are underlined in lavender. The bibliographic edit button displays on mouseover or keyboard focus on the button, and remains displayed on touch devices. Native libMultiMarkdown 6.7.0 generates `fnref` anchors for repeating footnotes only for the first reference, with the only return arrow pointing to the first reference; Notdown retains its own back button for each reference and does not replicate this limitation. The above are all view styles and do not change Markdown.

`Doe:2006`and `Doe2006` are different keys. Unmatched references retain the source code and are marked unresolved, without guessing the definition. Opening or importing a document does not automatically clean up unreferenced/duplicate definitions. When the page editor deletes the last reference of a citation, the local definition of the key and the original text are restored to the cache to avoid reappearing after saving; the definition is retained if there are duplicate references or `[Not cited][#key]`. Referenced examples in code do not count towards the number of references, and unreferenced definitions of other keys are not affected. The source code mode retains the explicit definition, and external BibTeX/CSL data is not rewritten. Numbers, DOM anchors and return links are for display only and are not written into Markdown.

In Notdown `[^https://example.com]` The default is the Notion URL quotation; if the same footnote definition is already in the original language, it is retained as a footnote. When the URL quotation is extended, the undefined URL tag is retained as a text; the tag in the code always remains original.

<a id="image-controls"></a>

<a id="图片工具栏2026-09-26"></a>

## Image toolbar (2026-09-26)

The independent picture and Figure share the picture view: the upper right corner toolbar is displayed when the mouse is hovering, the keyboard is focused, or the screen is touched, followed by Alignment, Caption, Crop, Expand, Download, More, excluding Comment. Drag the left and right handles to change the width; after focusing on the handle, the direction keys are adjusted to 10px, and the Shift+ direction keys are 40px. One drag is an undo operation, Escape or canceling the pointer operation restores the original size.

Caption The first is the use of a lightweight editing panel.Save SubmittedCancel/Escape Give up.Crop Using the original mobile rectangular and rectangular handles, supporting percentage values,Original/Square/16:9/4:3 The default isApply/Cancel；More In the middleReset crop The original image was restored.Expand Open and support scalable prototypesEscape It's closed.Download Use the resource link to download (whether the cross-source resource is downloaded is decided by the browser and remote response).More Provided byURL Change the graphics, copy the links, reset the original size, cut and delete the images; use reference images to change the linksSource，The word "report" is used to describe a person's identity.

Persistence continues to use the original image Markdown: the width reuses the existing `width` attributes; only Notdown activates the supplementary `align` and `crop` attributes. For details, see [ FORMAT ](../FORMAT.md). Official Notion and other dialects do not write supplementary layout attributes and do not pass off application functions as official Enhanced Markdown. The existing width properties of native dialects are still retained according to the original reader; layout controls are disabled in dialects that do not support writing. Inline mixed images remain displayed inline and are not forced to be converted into image blocks.

Cropping is a non-destructive display, and the attachment itself remains unchanged; HTML export retains cropping and alignment, and the existing layout is retained after canceling the caption. The source code has not been changed, URL, title, independent alt and unknown fields are reserved. If the target image changes after opening the control, the submission will reject the old draft and not overwrite the new node. The new tests are `tests/unit/image-layout.test.ts` and `tests/e2e/image-layout.spec.ts`, and the browser uses an isolated temporary vault.

<a id="表格就近控件2026-09-27"></a>

## Contextual table controls (2026-09-27)

The fifth round:Notdown In the middleMMD／The pipelinePandoc Form approved`tbl-colwidths` Save the relative column width after dragging and use it `: {tbl-colwidths="[30,70]"}` Table attribute row. Overrides the description of the "temporary layout only" of the Notdown Markdown table in the fourth round below; other dialects still maintain the original boundaries. Reading, editor rendering, serialization, save overloading and document undo reuse the same array, MMD caption and ID, span and other attributes are retained. Changes in the number and order of columns will synchronously adjust the valid array, and new columns will adopt the average weight of existing columns; non-compliant arrays will only retain the original text and will not be used as CSS values. close `table_attributes` Do not write the column width attribute afterwards.

The fifth round of verification: all `npm test` 853 passed, 5 skipped, the supplementary column width attribute directional test 4 passed; the construction and 12 table Chrome regression passed. New coverage has been added to preserve the original text without modification, untitled attribute rows, MMD captions and ID, unknown attributes, illegal/unmatched arrays, column order and number changes, grid round-trips, percentage rendering, dialect/switch boundaries, and save after dragging overloads. The logs are `.run/logs/tbl-colwidths-unit.log`, `.run/logs/tbl-colwidths-targeted.log`, and `.run/logs/tbl-colwidths-browser.log`; the test uses a temporary vault.

Round 4: The short line and blue outline on the right side of the cell only belong to the actual cursor/cell selection, and hovering over the unselected table only displays the row and column entries. The internal column boundary provides a 6px drag hotspot, and the cell menu only occupies a small segment in the center of the right edge, and the two do not preempt each other. Drag to preview adjacent column widths in real time, the total width remains unchanged, and the conventional minimum column width is 48px; release to submit, Escape/pointer cancellation/defocus/scroll cancellation. The border can be focused with the keyboard, the left and right keys can be used to adjust 10px, and Shift can be used to adjust 30px. Official Notion carrier synchronous writing `widths` with existing `<col width>`, retain colors and unknown attributes, reload after saving and support document undo. MMD/pipeline and other codes do not have a corresponding column width field. Only the layout of the current editing view is used, and the source code remains unchanged. The undo/redo of the temporary layout is retained until the next text modification, and is reset after refreshing or rebuilding the editing view. The Markdown protocol is not added and the table encoding is not converted. Repair `<table>` start inline `<colgroup>` Missed reading problem.

The fourth round of verification: `npm test` 850 passed, 5 skipped, 0 failed; the final build and 11 table Chrome test passed, and another 14 in-line object regression passed. New verification covers no short lines on hover, real cursor entry, multi-table isolation, native column width drag/cancel/undo/keyboard continuous adjustment/save reload, MMD merged cells and temporary layout source code remains unchanged. Drag hot areas to skip captions and merge inside cells across columns to avoid blocking content clicks. Log: `.run/logs/table-column-width-unit-resume.log`, `.run/logs/table-column-width-verified.log`; inline objects are logged in `.run/logs/table-column-width-final.log`. Screenshot: `test-results/table-column-width.png`. Not running the full browser suite.

Round 3: The cell entrance is still a short blue line of 2 × 8px, and is expanded when hovering/keyboard focus; the rectangular selection only displays one entrance in the middle of the entire right edge. The upper left corner of the selection and the current hovering cell are provided with short lines in the row and column respectively, and the same row/column is deduplicated. Supports cross-cell dragging and selection, retaining Shift-click. It is displayed when the plus sign on the bottom/right is close to it. Drag to display the number of columns × rows and the temporary table preview. Release once to submit and once to cancel; Escape, pointer cancellation, out of focus or scrolling cancel the preview. The preview is outside the main text, and Markdown is not written during the dragging process. After reduction, drag it back to restore the original content. Retain the existing codes, captions, unknown attributes and required headers, and retain the remaining merged areas when reducing the cross-border span; each drag can add up to 100 rows or columns. Handle drag sorting and column width dragging have not yet been implemented.

The third round of verification: Finally, `npm test` 844 passed, 5 skipped, and 0 failed; `npm run test:e2e -- tests/e2e/table-controls.spec.ts tests/e2e/inline-objects.spec.ts` construction passed, and 22 item Chrome use case passed. Covers span box selection and single centered entry, dual group column and column prompts, hover styles, dragging to increase and decrease columns, dragging back to restore, cancel, single-step undo, MMD save and reload, and the existing color/merge/caption menu. The single test also verifies that the span is shortened and unknown attributes are retained. The screenshots are `test-results/table-selection-ticks.png` and `test-results/table-drag-resize.png`; the final logs are `.run/logs/table-hover-resize-unit-final.log` and `.run/logs/table-hover-resize-final.log`. Not running the full browser suite.

Handle style correction: the row/column entry displays a short border line when it is stationary, and displays a six-point rounded corner capsule with a white background and a 1px dark gray border when hovering or focusing on the keyboard. The column handles are 26 × 18px and 3 × 2 lattice; the row handles are 18 × 26px and 2 × 3 lattice, and the center is pressed on the corresponding table border. Only the menu itself turns blue when it is open; the cell handle style remains independent.

In the second round, use the reference to complete the border dot matrix handle and the blue active state, the right edge handle of the cell and the complete selection outline. Menus at all levels include search, icons, and clear content; rows and columns provide copying, and cells/columns provide native column alignment access. The color submenu is divided into two groups: text and background, following the official `<table>` of `color` Properties (single channel, select a color), written individually to rows, columns or cells, leaving unknown fields. MMD and pipeline tables do not have native cell background syntax and are not forced to be converted to HTML; their color entries are disabled, and merging/splitting, captions, and column alignment continue to be carried by the original coding. Column alignment only enables verified pipe/MMD codes; copying a single row/column in a temporary spanless table does not copy required Markdown headers. After the structure command of the table with caption is completed, it returns to the cell and no longer enters the caption by mistake. Handles are used for selections and menus, and drag sorting is not yet available.

Second round of verification: `npm test` passes for 840, 5 skips, and 0 fails; the build passes; table controls and inline objects Chrome return 20 items pass. The new single test covers MMD alignment/copying and caption round-trip, clearing and undoing, official color and unknown attribute retention, format and span rejection boundaries; the browser covers cell color preservation overload, search, and MMD captioned table continuous merging/splitting. See `.run/logs/table-handles-all-unit.log` and `.run/logs/table-handles-final.log` for logs. Screenshots are `test-results/table-row-menu.png` and `test-results/table-cell-color-menu.png`; both use independent temporary vaults.

The table uses a light gray grid and a lightweight header. When hovering or editing, handles appear on the left side of the row and on the top of the column. Click to select the corresponding row and column and open the insert, move, and delete menus; the plus signs at the bottom and right add rows and columns at the end of the table. Table options in the upper right corner of the table stores row/column/entire table selection, merging, splitting and captions. The original bottom tiled command panel is removed, and the controls defining the list remain unchanged.

Shift-click rectangular selection, TSV clipboard and original commands continue to be reused. Multi-cell selections display the merge entrance, and merged cells display the split entrance; operations that cannot preserve coding or geometric structures cannot be performed, and the reason for disabling is provided. Alt+F10 opens the menu from the current cell, arrow keys, Home/End navigation, Escape/Tab returns to the text; click outside to close the menu. The control is located outside the main text DOM, follows scrolling and window size, closes the old menu when switching views or document changes, and does not write Markdown. The first version does not include dragging additions and subtractions, which have been completed in the third round. See the beginning of this section for details.

This round `npm test` Passed for 828, skipped for 5, and failed for 0; subsequent table and in-line object orientation single test 15 items passed. Final build and type checking passed; Chrome uses a temporary vault,`table-controls.spec.ts`、`inline-objects.spec.ts` with `block-spacing.spec.ts` A total of 21 items passed, covering hover target, append/delete rows and columns, multi-table isolation, keyboard menu, Shift-click, merge/split and undo, save reload, narrow viewport/scroll cropping, dialect restrictions and view switching. Custom Button/Tabs fixture for spacing tests uses Notdown instead, conforming to existing dialect boundaries. The log is located at `.run/logs/table-ui-unit.log`、`table-ui-targeted-unit.log`、`table-ui-final.log`(build) with `table-ui-browser-final.log`(Final browser verification); full browser testing not performed.

<a id="验证与范围"></a>

## Validation and scope

2026-09-25 citation deletion linkage: new `tests/unit/citation-cleanup.test.ts`, covering last reference deletion, duplicate/hidden references, code examples, entire paragraph deletion, original text recovery cache, existing orphan definitions, undo and redo; relevant single test 10 items passed.`npm run test:e2e -- tests/e2e/inline-objects.spec.ts` The build is successful, 11 items and Chrome tests pass, verify that MultiMarkdown/Notdown is saved and reloaded, and other bibliographies and footnotes are retained. In the first round of full-scale single testing, temporary file writing and module reading errors occurred; `npx tsx --test --test-concurrency=4 tests/unit/*.test.ts` Retest, in the 745 item, 741 passed, 4 was skipped, and 0 failed. The log is `.run/logs/citation-cleanup-unit-verified.log` and `.run/logs/citation-cleanup-browser.log`;The test uses a temporary vault and user vault is not written to it.

Unit testing: `tests/unit/inline-objects.test.ts`, `tests/unit/table-commands.test.ts`; browser testing: `tests/e2e/inline-objects.spec.ts`, `tests/e2e/substitution.spec.ts`, using temporary vault and independent Chrome. The replacement revision regression covers the old/new text styles of both dialects, format preservation, direct editing, attribute modification, source code and save overload, accept/reject and undo, as well as the preservation of the two copies of HTML after pasting.

2026-09-24 This round of verification: related unit test 17 passed; new browser interaction 7 passed; the build passed. The expanded browser returned to the original 26/29 and passed. The two test selectors have been corrected and passed in the above 7 items. The remaining MMD metadata page creation returned to 422. The full single test is 634 passed, 6 failed, and 1 skipped. Failure involves YAML/ unknown field retention, import recovery, and link processing; it is not declared that the entire warehouse regression has passed. See `.run/logs/local-objects-targeted-current.log`, `local-objects-interactions.log`, `local-objects-build-final.log`, `local-objects-e2e-final.log` and `local-objects-unit-latest.log` for local logs.

Cross-end synchronization, cloud database/automation, and reminder after closing the application are done separately. This round does not claim full upstream syntax compatibility or built-in library management. The text is still saved through the original link. `baseRevision` Writing to Markdown, conflicts do not automatically force a retry.
