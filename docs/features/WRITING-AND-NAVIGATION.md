<a id="写作与导航"></a>

# Writing and navigation

**English** · [简体中文](WRITING-AND-NAVIGATION.zh-CN.md)

This guide covers everyday editing and page organization. Available features depend on the page's dialect and enabled extensions. See [supported content](../reference/NOTDOWN-SUPERSET.md) and the [format contract](../FORMAT.md) for syntax boundaries.

## Vault list

Sidebar page, favorite and database view titles stay on one line, with an ellipsis when space runs out. Hovering or focusing a row makes room for its action buttons without increasing the row height.

The vault **List** resolves database property storage keys through each page's own data source and shows the property names. Names appear as smaller, muted labels beside darker values. Select, Status and Multi-select show option names; dates, checkboxes and linked pages use readable values. Ordinary page properties retain their authored names. Hover a label or value to read its full text. Filtering also matches these displayed names and values. This is a read-only presentation and does not rename stored keys or edit pages.

## Vault gallery

The vault **Gallery** shows page icons beside titles and defaults to **First image**, falling back to the first body block when no image exists. The toolbar’s **Card preview** selector also offers **First block**, **Page preview**, **Page cover**, and **None**. **Page preview** displays consecutive body blocks from the beginning until the preview frame is filled; overflow is clipped without expanding the card or adding scrolling. The browser remembers this choice for the current vault and retains existing explicit choices. Images and video can appear as previews; active embeds and controls are disabled. Metadata title blocks are excluded, empty pages keep an empty preview, and source files remain unchanged.

<a id="界面语言"></a>

## Interface language

Under **Workspace settings → Workspace → Interface language**, choose **English** or **简体中文**. English is the initial language; choose Simplified Chinese explicitly when needed. The browser stores the choice locally for the same site. Desktop also saves it in `interface-language.json` in the application configuration directory, retaining it across vault windows and restarts. The preference does not sync with the vault.

Switching updates the main navigation, settings and marked interface controls immediately, without reloading. Open settings forms retain their input, and the document editor stays mounted. Page titles, bodies, code, property names and values, and data source and view names stay unchanged. Service diagnostics retain their original text. This covers the browser application and shared desktop workspace; the separate Android interface, desktop vault launcher and system tray menus are outside this localization scope.

The default typography is compact: page titles use 40px, body text 16px, and heading levels one through three use 30/24/20px. Menus and empty-state hints generally use 14px; image and media captions use 13px. Web bookmarks use 16px titles and 12px descriptions and URLs, including on narrow screens. Font sizes affect local presentation only and do not rewrite Markdown. Code, equations and mobile input retain their own layouts.

<a id="标签页与窗口"></a>

## Tabs and windows

The application menu updates its enabled commands when a tab transition finishes, including when the menu was opened during the transition. Commands continue to wait for pending saves before switching or closing a tab.

Desktop and browser versions share the top tab bar, left vault navigation and page breadcrumbs. The desktop main window integrates system window controls into the tab bar while retaining window dragging, minimize, maximize and close. It has no separate system title bar or File / Edit menu bar. The browser retains its own address bar and tabs; application tabs manage only the current vault.

The top Vault and Databases reuse the same breadcrumb layout with the page path; the icon is centered in the unified placeholder and maintains a fixed distance from the title. emoji, line icons and uploaded images in the page path follow the same alignment rules; the body Breadcrumb block also uses this set of icon layouts.

The only Notdown icon in the upper left corner of the top bar is the entrance to the application menu, which provides new pages/tabs, import, vault management, settings, sidebar display and navigation history. Supports arrow keys, Home/End, Enter and Escape, and can be closed by clicking outside; menu operations continue to use save and conflict protection. The sidebar title directly displays the current vault name, and the up and down double arrows on the right represent the vault switching entrance; click on the name to manage the vault, and the application icon or fixed "Notdown workspace" title will not be repeatedly displayed.

The window of the desk **×** After successful saving, the hidden system tray, windows and tags continue to remain. Reboot or click Tray Restore a window that already exists; truly exit the Tray or App menu **Quit Notdown**See also[Residence and exit at the table](DESKTOP-AND-IMPORT.md#usage)。

- Click **+ / New tab** at the top to open a new vault homepage tab, and then select a page or database. **Open in new tab** is also available in the page menu.
- **Ctrl/ - Click here to see**Or**The mouse key**Click the sidebar page, database or link to the original page, open the label in the background; add Shift to the new label. Click the label switch, click × or close the key; drag the adjustment sequence.
- Collect and save the pending input and database edits of Page / Source before switching or closing the current tab. The input method will still keep the original tags and drafts when grouping words, saving fails, or conflicts occur, and will not automatically overwrite the new version. The background tag does not retain another writable editor; the latest saved content is read when switching back.
- The tab order, current tab, each tab's edit view, and scroll position are saved in the current window session and can be restored after a refresh. Different vaults and windows are saved separately. Undo inherits the current mounted editor, and reopening the page you left does not promise to retain the old undo stack.
- In the tab bar, you can use the left and right arrow keys, Home / End to move the focus, Enter / Space to switch, and Delete to close the focused tab. The desktop also supports **Ctrl/ ⌘+ T** new tab, **Ctrl/ ⌘+ W** close, **Ctrl/ ⌘+ Shift+T** restore the recently closed tab, **Ctrl+Tab / Ctrl+Shift+Tab** cycle switching, **Ctrl/ ⌘+ 1 – 9** Select tags; the browser retains its own shortcuts for these keys.

<a id="页面宽度"></a>

## page width

Upper right corner of the normal page **Page options（…）→ View → Full width** The narrow and full-width layout can be switched, set to save by page, and kept after refreshment. Pre-switching collection and saving for processing input, preserving the current editor's revocation history; only updating page metadata, not adding to Markdown's YAML application. Wiki Home is default full width, without displaying separate switches; other pages in Wiki are set along their normal page settings. The narrow screen still retains the required margin for both the text and block handle.

<a id="三种编辑视图"></a>

## Three editing views

| view | Suitable operations |
| --- | --- |
| Page | Edit page text directly, using blocks, tables and media controls. |
| Source | Edit the complete Markdown file, including the document's own YAML or Pandoc title block. |
| Split | View source code and pages side by side, using block-level position mapping for navigation and scrolling. |

Three views share draft and undo history. Pending input is collected before switching views, pages, or performing a save; Source/Page projection and reading outlines are updated after a brief pause in input. Continuous input will be combined into an undo step, and new lines and independent edits will be a new step. Character-by-character scrolling correspondence is not guaranteed for complex or reflowed content.

The **view button in the top bar**, beside the save status, shows the current view's icon and name. Open it to choose Page, Outline, Mind map, Markdown source, or Source and page (Split); the current choice has a check mark. The button is also available on Wiki Home, and hides on vault and database collection screens. On narrow screens it collapses to an icon. Enter/Space opens the menu, arrow keys move between choices, and Escape closes it and restores focus.

In the desktop and browser versions, **Workspace settings → Editing → Markdown controls** independently controls the editor's **View switcher** (Source / Split / Page), **Dialect selector**, and **Extensions button**. All three are hidden by default; existing saved choices are retained. Changes take effect immediately and are saved locally without modifying pages or Markdown files. When all three are off, the control row collapses unless notebook execution actions are available. The top bar view button remains available; **Page options（…）→ View** and `Ctrl/⌘+E` also continue to work. Split's synchronized scrolling switch follows the editor view switcher setting.

Source and Split use a wider editing area, and the source code supports syntax highlighting and folding of titles, codes, references, lists, and tables. Click the arrow next to the line number to expand/collapse; `Ctrl+Shift+[` / `Ctrl+Shift+]` operates the current position, `Ctrl+Alt+[` / `Ctrl+Alt+]` operates all. Folding only affects the current editor and does not rewrite Markdown; some custom dialect structures do not yet have dedicated highlighting and folding rules.

<a id="常用操作"></a>

## Common operations

The top of the sidebar displays **Search, Vault, Databases, Attachments and** by default. **Workspace settings → Sidebar** can open People, Graph, Conflicts and versions, or hide other shortcut entries; **Restore default shortcuts** restores the above four items, and **Show all shortcuts** displays all ordinary shortcut entries. Preferences are saved in the current browser/desktop repository session configuration.

In **Workspace settings → Appearance → Sidebar → Page tree**, **Database children** defaults to **Views**, which lists saved views and opens the selected view directly. Choose **Pages** to list database records instead; an explicitly saved choice is preserved. This setting only changes the sidebar presentation, records will still be accessible in the database. **Default expanded levels** Default **0 — Collapsed**, only the root layer is displayed; **1** also displays the first layer sub-items, optional 0 – 10 layer or **All levels**. Modifications take effect immediately and are saved locally; manual expansion/collapse is retained in the current session, and the default number of layers is re-applied after refreshing. Manual selection will also be reset when the default number of layers is modified.

The bottom of the side of the skull remains united **Import**、**Trash** and **Workspace settings**Newly created pages used **Private pages** next to **+** or Vault page **New page**• Use of newly created databases **Databases → New database**• Manage the vault by clicking the vault name in the upper left corner, or **Workspace settings → Manage knowledge bases**。

Import, Trash, experimental tool entrance, local status and settings are concentrated at the bottom of the sidebar. When there are few pages, they are placed below, leaving a gap with the page list. When the content exceeds the height of the window, the entire sidebar scrolls, and there is still a gap between the bottom operation and the page tree; scrolling the sidebar does not drive the main text.

Keep the grouping space between navigation, Favorites, Private pages and the bottom operation area; keep the pages and parent-child hierarchy within the group compact.

Long page and database view names in the sidebar wrap to show the full title, including in Favorites. Icons, expand arrows and row actions stay aligned with the first line. Drag the sidebar's right edge to adjust its width.

**Block Explorer** with **Markdown Lab** The side door is closed by default for experimental use. **Workspace settings → Experimental features** The link is displayed after the separate opening; the switch is kept in-house and does not modify the content of the vault. The experimental tool page is still accessible via the original URL link.

| Operations | Entry point |
| --- | --- |
| search page | `Ctrl+P`;`Ctrl+K` can also be used outside the text editor. |
| Switch Page / Source | `Ctrl+E`。 |
| Save now | `Ctrl+S`。 |
| Insert content | Enter `/` for the text, or click `+` next to the block. |
| Move or manage blocks | Drag or click the six-point handle. |
| Adjust list level | `Tab` / `Shift+Tab`。 |
| Insert or edit link | **Link** after selected text, or `Ctrl/⌘+K` in the text. |
| View the Markdown of the block | Six-dot handle menu → **View source**. |

In the recent access and matching results of the search pop-up window, emoji, line icons and uploaded images use the same fixed icon placeholder, keeping the same spacing with the title; the text area occupies the remaining width alone.

The six-dot handles next to the divider and `+` are centered vertically on the line; hover above and below the line to reveal them, and move toward the handles to drag or open the block menu. Controls with nested dividers follow their indentation. Files, pictures and page entries in columns can also be hovered to display the handle. The control belongs to the block of the column where the pointer is located. The menu can be opened after moving to the handle.

The Insert command starts with blank text, a blank table cell, or an empty input box. Inline formatting applies to selected text or text entered next; wrap the selection in Source and place the cursor inside the syntax. Commands such as inline formulas and executable expressions that must be filled in first open input boxes.

Clicking on the bottom blank space in the text editing area will create an empty text block. If there is an empty tail block, focus directly. Repeated clicks will not accumulate empty blocks. **Child page**, Backlinks titles, lists and surrounding white space outside the main text will not trigger text insertion; sub-page folding, expansion and navigation will not rewrite the main text. When selecting a block, you can use the scroll wheel to continue expanding the selection; drag and drop the prompt line to indicate the target level. Arbitrary nesting and cross-page dragging are not yet complete.

Press `→` once at the end of an inline format to exit the format, or `←` to return; the starting boundary is in the opposite direction. No need to insert spaces first. The formatting that ends together is exited together, the outer formatting that still spans that position continues to take effect, and the arrow keys with modifier keys retain the usual navigation behavior.

**View source** The selected blocks and their subcontents can be copied only by reading Markdown; blocks that have been edited or embedded may use standardized coding. **Open source file** The full file can be viewed on the new label, the default Markdown application can be opened to the system, or the absolute path can be copied. Save before opening, conflict prevents opening; copy path does not require saving, and the system opens the local file link required.

Notion v2 pages prioritize Markdown when editing or re-creating normal content: headings `#`List of the `-` / `1.`Mission `- [ ]`The quote `>`It's rough. `**`The slope `*`- Delete the line `~~`The picture `![]()`The formula `$$` The following table lists the properties of the sub-block, the margin gap or the unusableMarkdown Reserved when declared intactNotion Official tag; the bottom line and the color would have required corresponding tagging. Unmodified blocks continue to retain the original, no bulk conversion of existing documents. See details.[Reference format of Notion](../reference/NOTION-MCP-SYNTAX.md#notion-v2-persistence-rules)。

<a id="方言选择"></a>

## Selecting a dialect

**Dialect** The drop box is grouped in the following order, and Block Explorer uses the same order:

- Applications：Notdown → Notion-flavored Markdown → Obsidian → Typora。
- Markdown：Pandoc Markdown → CommonMark X → GitHub-flavored Markdown → CommonMark → Original Markdown。
- Compatibility：PHP Markdown Extra → MultiMarkdown → Legacy GitHub Markdown。
- Scientific writing：R Markdown → Quarto。

Android can be found in the upper right corner **Notebook options** center point **Page dialect** The current value selection dialect of the file is no longer open on the separate settings page. Save before switching to process input, save failure or conflict, and stop switching. The file is declared in YAML. `syntax` or `bodyFormat` When explicit switching updates existing fields of coverage, it preserves unknown fields with comments, format changes and follow-up text; without these fields, it does not automatically add the application YAML.

<a id="输入与格式"></a>

## Input and formatting

- Slash menu maintains text focus, follows input lines, supports filtering, keyboard selection, and Escape closing.
- Supported shortcut input changes with the dialect, including titles, lists, quotes, separators, formulas, inline formatting, footnotes and revisions; converted inline input can be restored with Backspace immediately after closing. See [ inline object ](INLINE-OBJECTS.md) for details.
- In dialects that support formulas, entering `$$` followed by Enter creates a formula block; the closing dollar sign of `$公式$` triggers an inline formula. Codes, escaping, and unqualified input retain literal content. Notdown turns off backslash bracket formulas by default to avoid conflicts with Markdown escapes.
- Workspace settings → Editing → **Code block input** You can choose the third backtick to create a code block, or enter the language first and then Enter; the explicitly selected language is used for subsequent new blocks without a specified language. Existing content remains in its own language. See the [ coding language ](CODE-LANGUAGES.md) for complete grouping, highlighting and borders.
- Workspace settings → Reading experience → **Numbered list display** Switch between Markdown numeric level and Notion numeric/letter/Roman level, only changing the local display, not rewriting the source file or export number; explicit list tags retain their own rules.
- When emoji is turned on, enter `:sm` at the beginning of the line or after a blank space to search for expressions, and use the arrow keys and Enter/Tab to select; category browsing and recent use are also available. Inserts Unicode characters without adding new Markdown aliases. This menu is not opened in code, linking, escaping and Source.
- Notdown enables automatic substitution of [ symbols for ](SYMBOL-REPLACEMENTS.md) by default, and can be turned off in the extended settings. When the example list is enabled, `(@` searches for existing named examples; duplicate labels retain the same number, and anonymous examples cannot be referenced by name.

**Extensions** The panel can be searched by name, ID and description. Search only filters lists, switching switches to change settings; switching dictionaries reinterpret current source code, and do not automatically migrate vaults. Official Notion Markdown does not enable Notdown's proprietary syntax by opening the extension manually.

<a id="内容控件"></a>

## Content controls

**Toggle heading** Keep the title level and the title spacing, with the arrow only folding its subcontent. Open blank headings provide additional content input; direct input after clicking, prompting the text not to be written.Markdown。The end of the titleEnter：When opening, the subcontent is entered, and when picking up, the equivalent paragraph is created below the sub-block; when switching from the middle of the title, the second half becomes the correct one. When picking up, the spotlight in the subcontent returns to the title, avoiding the input of hidden text.Notdown The official website of the European UnionNotion Markdown The current editor is the only one that works in the current editor, and does not write additional attributes.

Notion **Callout** is used to highlight the prompt content, and supports the replacement of icons and nested blocks; uses a light thin border in the default color or text color, and retains the background when the background color is specified. It is a different insertion entry from **GitHub-style Alert** and follows the respective Markdown encoding; the type, folding and custom headers available for Alert depend on the dialect.

| Content | Instructions for use |
| --- | --- |
| Tables, citations, abbreviations, glossary terms and revisions | [Inline objects and tables ](INLINE-OBJECTS.md): rectangular selection, TSV paste, row and column operations, size and layout saving boundaries. |
| Footnotes | [Footnote Guide ](FOOTNOTES.md): Insertion, preview, definition editing and return to text; inline footnotes retain their own syntax. |
| Pictures, audio and video, PDF, files and embedding | [Media and Embedding ](MEDIA-AND-EMBEDS.md). |
| Local synced blocks | [Synchronization block ](SYNCED-BLOCKS.md): copy editing, refresh, conflict and desynchronization; does not connect to Notion cloud. |
| code execution | [Quarto ](QUARTO.md) and [ R Markdown ](R-MARKDOWN.md): Explicit execution, the results are not written into notes. |
| AI and meeting notes | [AI block ](AI-BLOCKS.md) and [ meeting notes ](MEETING-NOTES.md): Configuring services, contexts and transliteration scopes. |

Formulas, captions, links, and inline objects typically use a small editing panel; Save/Apply/Done commits, Cancel or Escape discards. The page remains scrollable and edits to expired targets will not overwrite new content. Use modal windows for a wide range of settings and confirmation operations.

The HTML block displays the `</>` button when hovered or focused, which expands the source code editor with highlighting and real-time preview, and shares undo records; Escape collapses. Other unsupported raw formats retain editable source code and do not provide target format conversion. Div groups retain their own properties and encoding, and sub-blocks can still operate independently.

After enabling comments, `%%` or the slash menu can open the comment input panel, `Ctrl/⌘+Enter` submits, and Escape cancels; enter `%%` at the beginning of the paragraph and then press Enter for empty input to change to block comments. Comments and CriticMarkup comments are hidden in Page, and existing content can be edited in Source.

<a id="页面与链接"></a>

## Pages and links

**Workspace settings → Sidebar** The code can be displayed or hidden separately, including Search, Vault, Databases, Attachments, People, Graph, and Conflicts and versions; it is set to be saved in the current browser and is effective immediately.**Show all shortcuts** All entries are restored. Hidden entries will not delete content or disable functionality, search for the Ctrl/ shortcut, and K will remain available, and vault management and settings will remain intact.

The setting window is classified by **Workspace, Appearance, Editing, Sync & history, Connections, Advanced**, and the left navigation is positioned to the corresponding group; the narrow window is changed to the top horizontal navigation. Each group uses unified forms, switches, buttons and status prompts, and retains unsubmitted form input during navigation. The title bar and bottom **Done** are fixed, and the content area scrolls independently. You can exit by clicking the close button, pressing Esc, or clicking on the mask outside the window; when a subpanel such as the drop-down selector is opened, Esc may close the subpanel first. Switch preferences are saved instantly; configurations with Save buttons need to be submitted by clicking the corresponding button.

The sidebar supports parent-child pages, sorting, favorites, search and Trash. Icons, covers and attributes can be set on the page; the **Child page** list at the bottom is generated according to the actual level. emoji, line icons and uploaded images are centered in the fixed icon column, and the starting point of the title is aligned with the arrow on the right; long titles are truncated and displayed in a narrow window. When there are less than or equal to five subpages, they are expanded by default and when there are more, they are collapsed by default. Manual selection is retained in the current session.

The **Properties** entry below the page title appears when you hover anywhere along its row or focus it with the keyboard. It stays visible while the panel is open and is always shown on touch screens. A compact row separates the title and body; its space is reserved so revealing the entry does not shift the body. **Page options（…）→ Page properties** also opens the panel.

Sidebar **Trash → Empty Trash** can clean all recycled pages, subpages and data sources at once. After confirmation, the page file and attachments that lost their last reference are moved to the Windows system recycle bin, the data source definition retains historical recovery materials, and the shared attachments are retained. The button is unavailable when Trash is empty or the server does not support the system recycle bin. Repeat submissions cannot be made during cleaning; if a version conflict or system error occurs, the remaining entries will be stopped and refreshed, and completed files can still be recovered from the system recycle bin or history.

**Workspace settings → Editing → Child pages** The first is the "Blood of the World".**Allow child pages without a block in the parent page** By default, it opens; when closed, it automatically fills in the subpage entries at the end of each parent page, and then fills in the missing entries when saved in the original.**Automatically insert child page blocks** By default, shut down; after opening, create a new subpage, drag it into the parent page or pass it through **Move to** Automatically add input when changing parent page. When prohibited from missing input, this switch is displayed as open and unclosed; after being allowed again, restore the previous auto-insert option.

On the sidebar or at the bottom of the page **Child page** Select the right sub-page in the list **Insert into parent page**The user can add subpages to the parent page, but not add them again when they are already entered. Root pages and database records do not show this operation. Notdown and Notion Markdown use official `<page>` Block; other languages use separate Markdown page links, without switching dialects. Batch-shaped skip Trash, database records and database host pages, along the sidebar sequence, retaining existing source code and recording history; code examples, inline references and Notdown's Link to page are not counted as Child page blocks. If the original unclosed code fence/container prevents the input from being independent content, the original will be retained and reported errors; it can be re-operated after correction. Batch pages and settings are used for recovery transactions, and when external version conflicts occur, the content is retained on both sides and not automatically covered.

Enter `[[`, `+页面名`, or `@页面名` to search and reference local pages; when creating a new one, you can select a parent location. The Link panel after selecting text also supports pasting URLs, search and edit links; inserting page titles when there is no selection. In Page/Split, left-click to directly open the text link, web page and email links are opened in a new tab, and internal links navigate to the corresponding page or location. See the [ page and location link ](INTERNAL-REFERENCES.md) for complete rules.

Child page, Link to page and inline pages have different mentioned uses. The block type is determined according to the actual syntax and is not inferred according to whether the page is a subpage: official `<page>` represents Child page, Notdown's `<page-link>` represents Link to page, and `<mention-page>` remains inline. Parsing the body does not create or move pages.

inPage Deleted fromChild page The blocks are first confirmed and then moved to the corresponding local pages and later generations.Trash。Multiple deletion only appears once, showing the first page name and total number of different subpages; retaining the correct block when deleted, failed or conflict.Source The editor will not delete the page. The editor will only restore the text, and the page will need to be deleted from the page.Trash I'm going to get back to normal.

Pending input is saved before page switching; external refresh will not directly replace unsaved text. Large vaults and long articles may still load slowly, and the system's Chinese input method, touch control, accessibility, and large documents still need further verification. There is no dedicated rollback interface for historical snapshots, and the uncommitted draft after the window is closed is not a complete recovery mechanism.

<a id="阅读与关系图"></a>

## Reading and the page graph

The vault provides Gallery, attribute list, Tree and Graph; a single page provides outline, mind map, foldable title and reading list. Tree expands the first three layers by default. Click the branch arrow or focus on the row and press Enter/Space to expand; click the title to open the page. The expanded state is retained within the session and reset after reloading.

### Mind map

Open **Page options → Mind map** to view a read-only map of the current Markdown draft. The page title is the root, and all curved branches extend to the right in document order. H1/H2 use large pale-blue topics, H3 uses smaller pale-green topics, and H4–H6 use compact gray outlines. Body topics have no enclosing box, only a connecting baseline. Nodes wrap within a compact width and show up to three lines; click a topic to read its complete text in the preview below the canvas.

- **Headings only** is the default: ordinary headings form sections by level, while body content stays hidden. Toggle headings remain visible but are placed according to actual block nesting; their level controls styling, without creating a section around subsequent siblings. For example, sibling toggle headings H1, H2 and H3 following an ordinary H4 appear side by side under that H4. A page without headings shows its top-level content. Empty pages still show the central topic.
- A toggle heading contains only its explicit child content, including any genuinely nested toggle headings. It neither changes the enclosing ordinary heading section nor collects later siblings. Outside blocks stay in the ordinary section, or at the page/container root when there is none. This follows the [Notion container boundaries](https://developers.notion.com/guides/data-apis/notion-flavored-markdown).
- Click the outlined **number** on a branch to reveal its immediate children, or the small circular **−** to collapse it. The number counts all currently hidden descendant nodes, including nested content; fully expanded topics show only the minus sign. A partially expanded heading reveals its remaining content on the next click. Controls also work with Tab and Enter/Space.
- Opening a parent also opens its quote, callout, columns, tabs and other container children, recursively through nested containers. Their content appears immediately, and their type uses a small muted badge distinct from authored text. An ordinary toggle's summary appears beside its type badge, like a tab title, instead of being repeated as a child topic; its count includes only its child content. Containers can still be collapsed individually; reopening their parent opens them again. The default **Headings only** view continues to hide body content, while a page without headings shows its top-level content with containers open.
- Paragraphs, nested lists and tasks become child topics. Task completion is displayed without changing it. Blocks whose content is not rendered on the canvas use the same muted type badges as Tabs. Code and table badges retain language/dimension summaries; diagrams, equations, breadcrumbs, explicit empty paragraphs and unsupported blocks use type labels instead of source markup or import diagnostics. Local page and database references show the available target title, with a type badge when the title is unavailable. Media badges distinguish Image, Audio, Video, PDF, File, Web embed, HTML embed, Web bookmark and Link preview, retaining available captions or titles. A File block remains File even when its attachment is a PDF.
- Selecting a topic opens a preview headed by its block type, using the same rendering as Page: inline formatting, lists, tables, code, equations, images and containers retain their presentation. Containers include their actual child content; the central topic previews the page body. Preserved source and import diagnostics remain available in the original block preview. Media loads only when its content is previewed. Preview content is read-only; toggle disclosure and Tab selection affect only the preview, and code execution and editing actions remain disabled.
- **Expand all**, **Collapse all**, and **Headings only** reset the map's expansion. Drag the background or use scrollbars/touch scrolling to pan; use **+ / −** and **Fit map** to zoom. With the canvas focused, `+`, `-`, and `0` control zoom and fit; arrow keys scroll.

Expansion and zoom are local to the mounted view and reset when it is reopened. The map uses the page's active Markdown dialect and captures pending editor input before switching views. Map interactions do not modify Markdown, saved folding attributes, or page revisions. It is a reading view; node editing, dragging to reorganize content, and export are not provided.

The branch disclosure and hidden-descendant counts take their interaction reference from [MindManager's branch guidance](https://blog.mindmanager.com/5-tricks-for-simplifying-complex-mindmanager-maps-2/).

### Reading table of contents

The reading table of contents on the right only includes title blocks in the document, including folded titles and titles nested in columns, quotes, or conference text; internal titles of components such as meeting card names do not participate in the table of contents. Hide the table of contents when there is no text title.

**Pin table of contents (hover to expand when off)** is off by default under **Workspace settings → Appearance → Reading experience**. The outline expands on hover or keyboard focus. Enable pinning to keep it expanded; an existing saved choice is retained.

### Page graph

In Graph, the solid arrow points from the reference page to the target page, and the dotted line points from the parent page to the child page. Page links and parent-child relationships are presented separately.

| Operations | method |
| --- | --- |
| Moving nodes | Drag the node and the adjacent nodes will adjust according to the layout. |
| Panning and zooming | Drag the background and scroll wheel to zoom; you can also use the arrow keys and `+` / `-` after focusing on the canvas. |
| View associations | Hover the node dot; hovering just the title will not highlight the connection. |
| open page | Click on the node, or Tab to focus the node after Enter . |
| Adaptation and settings | **Fit graph** or `0` The house is in the ground.**Graph settings** The key is to adjust the force, the label and the arrow. |

Reducing dynamic effects mode will directly stabilize the layout. Currently Graph contains existing pages, page links and hierarchies; there is no attachment/missing target node, color grouping, layout saving and complete Obsidian filtering capabilities.

<a id="知识库选择界面"></a>

### Vault picker

Click the name of the vault in the sidebar to open the management panel. The current vault name and full path are displayed at the top, and the current item in the list is marked in blue; it can be switched to open in a new tab. Forms for creating a new vault and opening an existing directory are provided below, and are automatically arranged vertically in narrow screens. Current edits will still be saved before switching, and switching will stop when conflicts are saved. The desktop splash page and web admin panel use a consistent warm white background, blue accent color, and thin border cards.
