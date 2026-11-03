<a id="手机字体样式与-notion-v2-markdown-保存2026-10-25"></a>

# Mobile text styles and Notion v2 Markdown persistence (2026-10-25)

**English** · [简体中文](MOBILE-FORMATTING-MARKDOWN-2026-10-25.zh-CN.md)

Scope: Slideshows for mobile phones, text and background coloring boards, and Notion v2 sequencing for mobile phones and desktops. [Android](../features/ANDROID.md) with [Reference format of Notion](../reference/NOTION-MCP-SYNTAX.md#notion-v2-persistence-rules)。

<a id="行为"></a>

## behavior

- The text of the mobile phone is allowed to be synthesized in italics, which solves the problem that when the system's Chinese font lacks italic fonts, the mark exists but the display is not tilted.
- The text color and background color provide nine colors and Default respectively; in Page, one color channel is canceled and another channel, other styles and unknown fields are retained. Selected text and subsequent input can be operated, the selection and focus are retained, and undo, redo, save and reload are supported.
- Notion v2 Prioritize writing Markdown for ordinary titles, lists, tasks, quotes, bold italics, strikethroughs, pictures, formulas and tables that can be expressed without loss. Style, image and table candidates are parsed and verified; attributes, sub-blocks, margin margins, ambiguities and unknown content retain official tags. Unedited blocks retain the original text and the vault is not migrated.
- The Source palette is used to insert the selected color syntax; clear existing colors to switch back to Page. v2 underscores are inserted into `<u>` and colors continue to use the official span carrier.

<a id="验证"></a>

## Validation

- First complete `npm test`: 1023 item, 1018 passed, 5 skipped, 0 failed. In the end, all 19 items of serialization and color were passed, and the pound sign at the end of the title, image caption escaping, table vertical bars and code marks, old fields and code fences were also covered. Subsequent complete reruns will stay at the exit stage of the R test process and be canceled, and will not be counted as passed.
- The latest desktop builds and orientations51 Back to the browser50 Passed; an old test still expected a separate image to be in the third paragraph, converted to a validated bi-sided paragraph.figure、The actual image uploaded and saved overloaded the file3 The project was completely overhauled. The previously unseen lights and rows failed to change in the final iteration. The complete desktop browser set was not running.
- The latest mobile build: independent Chrome / Pixel 7, all complete 31 items passed, including new Chinese italics, color selection/independent clearing, undo/redo, continuous input, 320px panel and v2 editing and saving Markdown.
- `npm run android:build`: TypeScript, Vite, `assembleDebug`, `testDebugUnitTest` passed; the HTML and 64 static JS/CSS files in the package were checked one by one to be consistent with SHA-256 of the tested mobile build. Checked narrow screen palette screenshot.
- All browser verification uses temporary storage and temporary WebDAV services; this round did not accept the real Android WebView/ input method, and did not cover the installation or modification of the user vault.

<a id="本地产物"></a>

## local produce

- APK: `.run/android-release/Notdown-Android-format-2026-10-25.apk`, 71, 253, 018 bytes.
- SHA-256：`89f1494ff549a5daa1eb49a6aeb1a3253dbc43ad74d39ba215092b161c6b0a4a`。
- Log: `.run/logs/mobile-format-*`, `.run/logs/notion-markdown-focused-unit.log`.
- Screenshot: `test-results/mobile-format-final/mobile-mobile-italic-displ-b27d2-sen-and-reset-independently/mobile-color-palette.png`.
