<a id="android-初版"></a>

# Early Android build

**English** · [简体中文](ANDROID.zh-CN.md)

Notdown Android is located in the same repository as the desktop version and uses the same npm dependencies, document model, ProseMirror / CodeMirror editing workspace, Markdown codec and vault core. Android native projects are managed by Capacitor; the project is not split into monorepo, nor is a set of editors or saving rules copied.

<a id="当前能力"></a>

## Current capabilities

- Connect to the cloud vault created on your computer and save an offline copy in the application private directory; after the connection is completed, create a blank page, edit the title and text, switch Page / Source, and search by title and content.
- Click-and-click formatting toolbar, block type selection, and image attachments; image previews use temporary display addresses, and relative attachment paths are still saved in the file.
- Automatically save during editing and keep window-independent recovery drafts. If the versions do not match, the original text and proposal will be retained and automatic retry will be stopped; the interface can save the draft as a new page.
- Import `.md`, `.markdown`, `.rmd`, `.qmd` files and keep the complete source code. Interpreter execution of R / Quarto requires desktop.
- Export the vault ZIP, including `pages/`, `metadata.json`, attachments, history and unknown files; ZIP recovery is completed on the computer and then synchronized to the mobile phone. The mobile phone does not create an independent vault through ZIP import.
- The Android return key first closes the input method, then closes the panel or returns to the page list; the bottom **Hide keyboard** can also close the keyboard and collect input to be saved before exiting to the background.
- Notebook options → Cloud sync provides experimental multi-device synchronization, reusing the desktop synchronization engine and conflict handling; for configuration and scope, see [ cloud synchronization instructions ](CLOUD-SYNC.md).

<a id="安装与使用"></a>

## Installation and usage

Target Android 8.0 / API 26 and above. The current product is development and debugging APK, using native debug signatures; there is no official release signature, app store release, or automatic updates yet. For build commands and output locations, see[Development Guide](../architecture/DEVELOPMENT.md#android-development)。

When opening for the first time, you must configure **Cloud sync**, use the same Supabase project or WebDAV account and remote directory as the computer, and then select the cloud vault created by the computer. The phone does not provide the option to create a cloud vault or an independent local vault; it is stuck on the settings page when it has not been configured or the first download fails, and the return key and closing settings cannot be bypassed. If there is no vault in the WebDAV directory, create it on your computer first and synchronize it.

After the first synchronization is completed, enter the editor. Subsequent openings can directly use the local copy. You can still edit when the network is disconnected. After the network is connected, it will be synchronized in the foreground. Disconnecting synchronization will return to the connection settings, and the local files will be retained, but they cannot continue to be edited as an independent library. Already installed old libraries will not be automatically deleted or merged; clearing mobile application data requires the user to explicitly choose, and no deletion records will be sent to the cloud.

During the first download, Cloud sync displays the progress bar, resource name, processed quantity and time taken at the current stage; the attachment displays the transferred size. The activity bar is displayed when the total amount of the stage is unknown, and the waiting time is still displayed when the waiting time is long. Failure to synchronize will display an error and retain the completed count, and can be retried via **Sync now**.

Downloaded common resources are compared and written in batches, shared pages are scanned and attributes are updated centrally. Android uses native batch file replacement to reduce cross-language calls; each file retains the original byte verification, and continues according to the recovery log after the batch is interrupted. Attachments, large resources and conflicts still use the corresponding checksum processing path.

Open the page list at the top left; save automatically. Edit operations are concentrated at the bottom of the screen.**+ / Insert block**、**Aa / Text formatting**、**Turn into**I'm going to have to get rid of it, re-create it, take pictures,**… / Block actions**The toolbar can be slid horizontally, with the keyboard button fixed on the right side; each button has at least a 44px touch area.

Ordinary pages and database records can be accessed through the upper right corner **Notebook options** center point **Page dialect** The current value of Select Dialect no longer jumps to a separate settings page. The selector uses the same 14 dialects and four groups of sequences as the computer side, with R Markdown and Quarto remaining at the end. Collect and save pending input before switching; stop switching when saving fails or conflicts. Switch to reinterpret the source code of the current page, restore the default extension of the selected dialect, retain unknown settings and text, and do not migrate other pages. If YAML has been declared `syntax` or `bodyFormat`, update these existing covered fields at the same time, retain other fields, comments and line break formats; YAML will not be added automatically if there are no these fields. Importing Markdown gives priority to the valid dialect declared in the file, otherwise press `.Rmd`、`.qmd` or plain Markdown using the default dialect. Changes are saved through the same version verification and draft recovery link; the mobile terminal still does not provide R, Python, Julia or Pandoc execution services. Database list and full database views do not display page dialect entries.

Click the text to position the cursor; when the keyboard is open, press and hold or double-click to use system text selection. When the keyboard is retracted, press and hold the block text for about half a second to start dragging. The block preview and blue drop point line will be displayed. Let go and move before or after the target block; it will automatically scroll when it is close to the upper and lower edges of the text scrolling area. Keep the keyboard closed after dragging, and use Undo at the bottom to restore. Swiping has started before pressing and holding, a second finger is added, the system cancels the touch, or the drag is canceled when external changes occur in the text; buttons, links, input boxes, etc. retain their own interactions.

The mobile version does not enable the desktop left block handle, box selection, text selection floating format bar or `/` automatic menu. Click **Aa** to switch the current toolbar to the font style secondary column, and return to the previous level on the far left; bold, italics, underline, strikethrough, inline codes and colors can be continuously applied to the selected text or subsequent input, keeping the keyboard and selection. The current style displays the selected state on the button.

**Text color** and **Background color** Open the palettes separately, each with nine colors and **Default**。inPage SelectedDefault Can be removed the corresponding colour;Notdown The text color in the page is removed to retain the background color, the background color is removed to retain the text color, and other styles and unknown attributes are retained. When the font lacks a slanted font, synthetic slanting is allowed to display slanted characters such as Chinese.Source The middle-color panel is used to insert selected color syntax, removing already cutting colorsPage The operation.

Clicking **+** or **Turn into** will hide the keyboard and display two columns of block type selections below the toolbar. **+** Insert a new block below the current block, use it directly when the current block is a blank text block; **Turn into** Convert the current block. The right keyboard button closes the panel and returns to input; closing the panel does not modify the content. The selection is retained before the panel is opened; if the text changes while the panel is open, the old operations will not be applied to the new text.

**Block actions** Displays the current block type and content summary, providing inserting the next line, moving up/down on the same layer, indenting/unindenting, copying, and deleting; inapplicable operations are disabled. Cross-block text selections do not perform single-block operations. Add/delete rows and columns within table cells through the same panel; the table can be scrolled horizontally. The desktop columns are arranged vertically on the mobile phone. The handles for dragging the columns and pictures to adjust the width are not displayed, and the original column and width data are retained.

Source code mode displays the complete file, formatting and insertion still apply to the source code selection, and the single block operation button is disabled. **Import Markdown** Add a page to the currently connected vault; no independent database creation or vault switching entrance is provided. Mobile terminal interactive reference [ Notion official mobile editing instructions ](https://www.notion.com/help/writing-and-editing-basics#on-mobile), the implementation still reuses Notdown's own editor and save logic.

The page list follows the page order saved on the computer and is arranged indented by the parent-child level; click the arrow on the left side of the page to expand or collapse sub-pages, and click the title to open the page. When searching, the results will be displayed based on title and text matching. After clearing the search, the hierarchy and folded state will be restored. List display does not overwrite page order or parent-child relationships; order adjustments are still made on the computer.

When switching pages, the target page is read from the local file, the text is displayed first, and the images and other local media are loaded later; the unchanged page list reuses the existing content. When saving the title and text of ordinary notes, only the current page and necessary parent pages are read. The input to be saved is still collected before cutting the page, and the original version is verified, and the history and conflicts are retained. A full scan is retained when it comes to page levels, recycle bins, databases or old file identity searches; changes in the cloud are still downloaded and refreshed synchronously by the frontend.

Back up the entire vault through **Notebook options → Export notebook ZIP** in the upper right corner. For Android, use the system save file dialog box to select the ZIP location; for browser preview, use the browser download. After decompression, ZIP can be opened on the desktop as a normal Notdown vault. Restore the old ZIP to the computer vault, and then connect to the mobile phone through cloud synchronization.

App private files will be deleted when uninstalling or clearing app data. A backup should be exported before uninstalling. Neither the interface nor the native project applies for permission to access the entire shared storage. The upper limit of a single page is 10 MB, the upper limit of a single picture is 20 MB, and the upper limit of ZIP is 128 MB, 10, and 000 files after decompression. Backup rejects path traversal, duplicate paths, and overlapping files and directories, and does not overwrite existing vaults.

<a id="已知边界"></a>

## Known limitations

- Cloud synchronization needs to configure Supabase or [ WebDAV ](WEBDAV-SYNC.md) and run during application opening; WebDAV and Android use native network requests. There is no background sync after the app is closed, multi-person collaboration, direct editing of external SAF folders or multi-folder synchronization.
- The mobile phone supports editing of tables, attributes and records of full-page and inline databases, and can create new databases, fields and views, and use filtering, sorting and search. For operation details, see[Database Guide](DATABASES.md#mobile-usage). The map, Notion import wizard, system recycle bin and some desktop block operation entrances have not been covered yet.
- Complex content that can be retained by shared codec can still be opened and edited through source code; citation processing, external transcription, AI settings and Python / R / Pandoc execution that rely on desktop services do not provide mobile running services. Remote attachments or web pages still require a network.
- The browser preview uses independent IndexedDB file storage, and Android uses native private files. Their data are not interoperable; when the native plug-in fails, it will not be returned to the browser storage and pretend to be saved successfully.
- Chrome touch screen simulation and JVM file testing cannot replace Android WebView, real Chinese input method, system file selector, process recycling and low memory device acceptance.

<a id="代码边界"></a>

## Code responsibilities

| Location | Responsibilities |
| --- | --- |
| `src/vault/` | Shared `createVault`, Markdown / metadata save, version and conflict, database and contact storage, recovery and backup |
| `server/vault.ts`、`server/vault-platform.ts` | Node entry assembly, OS path, process lock, atomic file replacement and system recycle bin |
| `src/mobile/` | Mobile interface, draft session, native and browser storage adaptation, ZIP interaction |
| `android/` | Android build, restricted native file plug-in, system file export and life cycle |
| `src/shared/asset-display.ts` | Attachment address resolution for display only, does not override Markdown or node attributes |

The body truth remains `pages/*.md`; `metadata.json` retains unknown fields, and documents YAML/Pandoc title block continue to overwrite the default values. Node and mobile use the same SHA-256 revision and UUIDv5 identity rules. File adaptation only provides system capabilities such as path, reading and writing, locking and submission; business writing is unified through `createVault`.

The mobile terminal coordinates writing through native file locks, and temporary files are replaced atomically after they are written and synchronized; the interruption recovery of Markdown and metadata uses the same transaction log. Browser preview uses Web Locks and IndexedDB transactions. Both retain `baseRevision` verification and do not automatically refresh versions and force retries after conflicts.

The boundaries of this construction, automation and equipment verification can be found in [ 2026-10-23 verification record ](../verification/ANDROID-2026-10-23.md).
