<a id="行内对象右键菜单与分区源码验证2026-10-26"></a>

# Inline-object context menus and source-section validation (2026-10-26)

**English** · [简体中文](INLINE-CONTEXT-MENU-2026-10-26.zh-CN.md)

<a id="范围"></a>

## range

- Desktop semantic inline menu: type title, View source, Turn into, attribute/source code editing, link operation, date/formula editing, contact entry, footnote jump, revision acceptance/rejection, copy and delete.
- Text styles are separated from objects: bold, italics, color, underline, highlight, superscript and subscript, etc. do not trigger the object menu; the expressible style is retained when operating styled links/formulas.
- The source code of the source object is divided into Inline reference and Reference source, and each can be copied. Standard citation links and images display the original citation and the corresponding definition on this page; footnotes/MMD citations display the main text/definition, and missing sources are clearly indicated. The page displays the target information; the external bibliography only displays the configuration path and does not read the remote content.
- Record the object when the right button is pressed, and check the document and coordinates when opening the menu to avoid re-rendering after the formula gains focus, causing the right-click event to fall to the outer paragraph. Text changes close the menu, and source code editors reject old drafts.
- Keep the existing Markdown encoding, text saving, baseRevision and conflict handling. The test uses independent Chrome and temporary vault, and does not write to user vault; no real machine or desktop installation package acceptance is performed.

<a id="验证"></a>

## Validation

| Check | result | local log |
| --- | --- | --- |
| `npm test` | 1061 passed, 5 skipped, 0 failed | `.run/logs/inline-context-unit-final.log` |
| `npm run build`(Including TypeScript check) | Passed, retaining existing bundle size hint | `.run/logs/inline-context-build-final.log` |
| The positions of inline menus, inline objects, and block menus have returned, excluding the following double-click use cases for captions. | 22 passed | `.run/logs/inline-context-browser-verified.log` |
| Finally the return of inline menus and block source panels | 13 passed | `.run/logs/inline-context-source-final.log` |

There is overlap between the two browser runs, and 22 and 13 are not added as independent use case numbers. The final run includes 7 new menu use cases and 6 existing block source code use cases, covering two parts of source code and menu copy, read-only, original reference and multi-line definition, code fence exclusion, different reference definition from URL, style boundaries, adjacent object positioning, formula editing and conversion, undo/redo, save reload, page information, date editing, keyboard/narrow viewport and old draft rejection. Added 7 items to single test.

Viewed `test-results/inline-context-menu.png` and `test-results/inline-reference-source.png`, as well as block source code short content/long code/narrow viewport screenshots. The layout of the menu and partition source code panel is normal.

<a id="已知回归限制"></a>

## Known regression limits

`tests/e2e/inline-objects.spec.ts`The `official Notion image captions use the media label without enabling MMD figures` input box times out after waiting for the Caption input box to appear after double-clicking. A related regression that includes this use case is 21 passed and 1 failed, see `.run/logs/inline-context-browser-final.log`.

Replace the new `inlineContextMenu` with the empty ProseMirror plug-in through the diagnostic build, and then run the same caption use case with an independent port and a temporary vault. It still times out at the same Caption input box, see `.run/logs/inline-context-baseline-caption.log`; the diagnostic build log is `.run/logs/inline-context-baseline-build.log`. Therefore, the failure is not caused by this menu event processing, and the existing caption implementation has not been changed or the use case has been modified to bypass the failure. It does not run the full browser suite and does not claim to have passed all E2E.
