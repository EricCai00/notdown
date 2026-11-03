<a id="windows-桌面版与-markdown-文件夹导入"></a>

# Windows desktop and Markdown folder import

**English** · [简体中文](DESKTOP-AND-IMPORT.zh-CN.md)

The current scope is for local use: Windows x64 Electron installation package, vault selection and folder copy import. The editor continues to use a single ProseMirror document and its own Markdown codec; Electron reuses the existing Node service and `createVault` without introducing another set of text storage.

<a id="使用流程"></a>

## Usage

Desktop native controls follow the app's light theme, ensuring that the hover backgrounds of the minimize, maximize, and restore buttons are clearly visible under Windows's dark system theme.

The product titles of web page labels, application windows and vault welcome pages are unified as **Notdown** without appending slogan. The welcome page only retains the operation prompts required to create and open the vault.

After the desktop is started, the Notdown icon is displayed in the system tray. Clicking on the window **×** will first save the page and database pending input, and then hide the window, retaining the current vault, tags and local services; keep the window open if the save fails, the group word is not completed, or a conflict occurs. Click the tray icon or **Open Notdown** to restore existing windows. Minimized windows will be restored.

Normal startup only uses one application instance configured by the same user; restarting again will display the existing window without creating a new welcome window or starting the vault service repeatedly. Multiple vault windows can still be open on the same instance. To actually exit, use **Quit Notdown** in the tray menu or application menu: Exit after successfully saving all vaults, and retain all windows and drafts if one fails. All vault input is suspended during the exit check to avoid new edits to the window that was saved first. The welcome page can also be hidden in the tray; after selecting the vault, the welcome page for completed tasks will be automatically removed.

Tray residency does not increase the background cloud synchronization capability; cloud synchronization is still subject to the current functional scope of [ and ](CLOUD-SYNC.md).

Before updating, installing or replacing program files, use **Quit Notdown** to exit completely; closing the window itself will not exit the resident process.

The desktop version of **Web bookmark** automatically reads the system's HTTP/HTTPS proxy, PAC and bypass rules that are effective for the target URL, without having to repeatedly fill in the port in Notdown. The browser-based local service on Windows also reads the Windows system proxy; independent Node services on other systems still use direct connections. After adjusting the system proxy, you can click **Refresh bookmark** of the bookmark to try again. The request still verifies and fixes the target public network address, and re-verifies each jump; the browser login status is not shared, and the proxy cannot guarantee to pass website verification. Proxies configured with SOCKS only are not currently supported, the HTTP/mixed port provided by the proxy software should be used.

The bookmark image selects the Open Graph image, Twitter image, `image_src`, JSON-LD main image and `itemprop="image"` declared on the web page in sequence; invalid candidates will be skipped. The work details page of Bangumi also identifies the cover in the work information area, and does not randomly select the first picture from the ordinary text to avoid misuse of avatars or advertisements. The cover is cut according to the card area, and the vertical poster does not support the card. If you already have bookmarks, you can click **Refresh bookmark** to replace the cover; if the image cannot be loaded, the available text card will be retained. Automatic preview does not rewrite the page, and manual refresh still follows the bookmark saving rules of the current dialect.

In the browser version, you can click the name of the vault at the top of the sidebar, or **Workspace settings → Manage knowledge bases** to create, open and switch vaults. The new library is created in the data directory by name by default. You can also fill in the absolute path of a new or existing empty folder; to open an existing library, you need to fill in the root directory containing `pages/`. The path belongs to the computer running the local service, and the browser does not pop up the system directory selector. Known vaults appear in the list; unavailable directories are not automatically rebuilt.

Save pending edits to the current page and database before switching; stop switching if saving fails or conflicts. Check **Open in a new tab** to keep the current tab. Each library uses an independent URL (`/v/<标识>/`). Text requests, attachments, history and synchronization configurations are bound to this URL. Other tabs continue to use their respective libraries; the recorded URL can be reopened after the service is restarted. The root address continues to use the vault configured at startup. The latest directory is recorded in `.browser-vaults.json` of the data directory, `.env` is not overwritten, and the default library for next startup is not changed. Each library still only allows one service process to write.

1. Install and start Notdown. Select **Create new vault** on the first welcome page, select or create a new empty folder in the system directory selector.
2. There is already a Notdown repository using **Open existing vault**; the directory must contain `pages/`. The welcome page records the last ten directories. An error will be reported for invalid directories, and a replacement library will not be automatically created.
3. Click **Private pages** next to **+** or Vault page **New page** Start writing. Text writing `pages/*.md`, write general page attributes `metadata.json`;The databases are respectively stored in `databases/*.json`, Wiki Home retains the real Markdown . YAML/Pandoc title block in the document can override the default attributes of the page. For details, see[vault metadata](VAULT-METADATA.md). New desktop vaults will not be automatically populated with demo content; old databases will not be automatically migrated due to installation upgrades.
4. To bring in existing notes, click **Import → Import Markdown folder** in the sidebar, select GFM, Obsidian or Notdown as the default dialect, and then select the source directory. The same **Import** entry also provides **Import from Notion API** .
5. Preview pages, attachments, invalid files and link prompts. When there are invalid files, you must explicitly choose to skip them before you can submit readable files. The current page will be saved before clicking **Import copies**, and conflicts will prevent the import.

welcome page **Your Notdown vaults** Displays the unified data catalog and its existing vault. fill in **New vault name** click after **Create vault here**, a new "data directory/library name" will be created and the existing directory with the same name will not be reused. Library names cannot contain path separators or Windows reserved names; each library's body, attachments, configuration, synchronization identity, and history are independent of each other. See the data directory and environment variables[Selecting a vault](../architecture/DEVELOPMENT.md#selecting-a-vault)。

When long term text history is required, this can be found at **Settings - History** Enables native Git; installed versions still require additional installation of Git to enable this optional feature. Normal saving does not depend on Git. page menu **Page history** Supports preview and recovery, please see the scope and limitations[History and Restoration](VAULT-METADATA.md#automatic-history-and-version-recovery)。

The import function is also available in browser mode. Click the name of the vault in the upper left corner of the desktop or **Workspace settings → Manage knowledge bases**, save the current page first, and then open the welcome window; the existing library remains an independent window, and the library and revision are not replaced in the original editor. The main window uses a tab bar merged with the system window buttons, and does not display the File / Edit menu; vault operations are still entered from the side bar. Pages and databases in the same vault can be opened in the in-app tab. For operations, see[Tabs and windows](WRITING-AND-NAVIGATION.md#tabs-and-windows). Each database has independent local services, session partitions and access tokens; local HTTP requests without tokens are rejected. The window is closed by restricting preload requests to the editor to receive and save input, and keep the window open on failure or conflict.

<a id="导入和恢复边界"></a>

## Import and recovery limitations

- Each batch can have a maximum of 500 files and a total of 20 MiB; a single Markdown can have a maximum of 10 MiB. Supports UTF-8 `.md` / `.markdown`, other files are copied as attachments; the interface excludes hidden files and hidden directories.
- The original directory is read-only. The imported root directory and subdirectories are converted into parent-child pages; each page gets a new stable import ID, and the page identity in the source file is not inherited. Valid existing `syntax` settings take precedence over the selected default dialect.
- Keep unknown YAML fields and comments; normalize `id`, `title`, `parent`, `icon`, `properties`, `bodyFormat`, `syntax` in the copy, clear old collection, delete, sort, update time status. All original fields and file bytes are preserved in the original archive.
- Only modify the target range of the parsed Markdown links, images and reference definitions; do not globally replace the text, code fences or unknown syntax. The standard relative page link is changed to `#page/<id>`, and the new attachment is changed to `assets/<带连字符的 UUID>.<扩展名>`. The same content is used for uploading and Notion downloading to determine the UUIDv5 naming; attachment query and anchor point are retained. Old attachments and original links will continue to be compatible and will not be migrated in batches. Page anchors and query parameters are not currently supported and will be prompted in the preview and omitted from the copy link.
- Wiki links and original HTML retain their original writing and require manual inspection; migration of Obsidian workspaces or Notion export packages will not be done automatically. Unparsed targets retain the original text and give a prompt. The original file name of the attachment is registered in the attachment library; common extensions are standardized, and other simple alphanumeric extensions are retained. `.bin` is used when unrecognizable. The same file can be reused with the same content and standard extension, and existing attachments will not be automatically migrated.
- The import preview is stored in memory only.30 Minutes of expiration, up to three sets per service; use of preview content snapshots when submitting, without re-reading the source directory in changes.
- Under the same import format version, the same name, dialect, relative path and content produce the same import batch. Submitting a completed batch again will not re-create or overwrite pages edited after importing; changes in source content will form a new imported copy and will not be treated as a synchronous update.
- Writing is performed serially via `createVault.importBatch`. The import only creates new files and does not update existing pages, so overwriting revision is not accepted; subsequent edits still use `baseRevision` and conflicting branches.
- `.history/imports/<批次 SHA-256>/manifest.json`Record the correspondence between the source path and the original `<编号>.source`, page ID, prompts and completion status. When restoring the original, just copy these bytes according to the manifest path; there is currently no dedicated recovery interface.
- To submit, archive the original document first, then write attachments and pages, and finally mark it as complete. It is not an atomic transaction for the entire batch; interruptions may leave imported parts behind. Re-select the same content to continue; existing and different content will prevent continuation and will not be forcibly overwritten. Single files are synchronously downloaded to disk as temporary files and released as hard links. The target file system is required to support hard links (Windows is recommended, NTFS is recommended); if it is not supported, it will fail explicitly and the recovery materials will be retained.

<a id="开发与验证"></a>

## Development and validation

```sh
npm ci
npm run desktop
npm run desktop:pack
npm run desktop:dist
npm run test:desktop
```

`desktop:build` Pass first `desktop:runtime` Check or download the Electron binary and build the front end to `desktop-dist/frontend/`, the main process, local service and preload are built to `desktop-dist/`. Desktop front-end products are browser-independent `dist/`, to avoid overwriting each other during development. The first source code startup requires an Internet connection; if a matching version already exists, it will not be downloaded again. The environment that requires a proxy can be configured for Node `HTTPS_PROXY` with `NODE_USE_ENV_PROXY=1`。`desktop:pack` Output unpacking application,`desktop:dist` Output NSIS installation packages, both located in `.run/desktop-release/`. Users whose installation package does not carry a warehouse `vault/`; Uninstalling does not delete the vault directory.

Desktop packaging excludes `node_modules/@capacitor/**`. Mobile-only native packages and generated Android build trees are not desktop runtime dependencies; including them can introduce paths that the Windows updater cannot rename while replacing an older installation.

`tests/unit/markdown-import.test.ts`Covers original text, YAML, links, duplicate imports, partial recovery and HTTP preview submissions. `tests/e2e/import-folder.spec.ts` uses standalone Chrome with a temporary vault. `tests/e2e/desktop.test.ts` uses the isolated Electron user configuration and temporary directory to verify the first library creation, shutdown and save, conflict prevention shutdown, recent directory and multi-library isolation; `NOTDOWN_PACKAGED_EXE` can be set to unpacked exe to verify the actual packaged product.

The current installation package is not signed, there is no automatic update; macOS/Linux installation package is not yet available.[Experimental functionality](CLOUD-SYNC.md)The Electron single-instance constraint cannot replace the cross-process file lock: the same library still allows only one service process, not writing to the same library with the same development service; the MCP independent process or another desktop configuration cannot be used simultaneously.
