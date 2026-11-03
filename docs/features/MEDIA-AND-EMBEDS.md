<a id="媒体与嵌入"></a>

# Media and embeds

**English** · [简体中文](MEDIA-AND-EMBEDS.zh-CN.md)

2026-10-27: creating or editing a Web embed now writes the official `<embed source="…">题注</embed>` form instead of generating a web-embed tag. Existing official src encoding for HTML embeds remains supported. Dimensions, alignment and other information absent from the official format use necessary supplementary attributes; see [custom extensions](../reference/NOTDOWN-EXTENSIONS.md). Older representations below are historical examples only.

Choose Image, Video, Audio, PDF, File, HTML embed or Web embed from the `/` menu. Available entries depend on the current Markdown dialect. Dialects without media blocks offer images and ordinary file links.

<a id="选择合适的内容类型"></a>

## Choosing a content type

| Type | Purpose and behavior |
| --- | --- |
| Image | Displays an image with an editable caption. Notdown can save dimensions, alignment and reversible cropping. |
| Video / Audio | Plays media files in a player; Video also recognizes supported YouTube URLs. |
| PDF | Previews local PDFs in the browser; available capabilities depend on the browser. |
| File | Displays a file card. Selecting an image, audio file or PDF does not automatically turn it into a player. |
| Web bookmark | Displays a web bookmark with its site icon, title, description and URL. |
| HTML embed | Uploads or accepts a dropped HTML file, saves it as a vault attachment, then previews it. |
| Web embed | Embeds a remote HTTP(S) page; the target website may prohibit embedding. |

New attachments from uploads, Markdown folder imports and Notion imports all use `vault/assets/<UUID>.<扩展名>`, with a hyphenated `8-4-4-4-12` UUID. UUIDv5 is derived from the content SHA-256 and normalized extension; identical content with the same extension reuses one file. The original filename is stored separately in attachment metadata. Existing hash, UUID and batch filenames remain readable without automatic renaming or bulk reference rewrites. File cards default to the original metadata filename, while explicit card names retain priority; downloads use the original filename. Cards show an icon, name and readable local file size. Remote files, unavailable sizes and static exports omit the size. Focus transfers before the system file picker opens and returns to the editor after cancellation or failure.

<a id="删除页面时清理附件"></a>

### Attachment cleanup when deleting pages

Moving a page to app Trash keeps its attachments so restored pages can still open them. After Delete in Trash removes a page and its descendants, cleanup considers only attachments those pages referenced that now have no remaining references; it does not sweep older unreferenced uploads. Other pages, including Trash, icons, covers, properties, conflict drafts, global metadata and parseable indirect HTML/SVG/CSS dependencies still protect attachments. Unreliable source parsing or dynamic dependencies block cleanup and show a warning instead of guessing that a file is unused.

Cleanup uses the same vault lock and rechecks page/conflict revisions and attachment bytes before deletion, without following symbolic links. Attachments go to the system recycle bin like pages, with no permanent-delete fallback. `.history/deleted-assets/` separately retains original bytes, paths and unknown metadata for manual recovery. Failures preserve recovery materials and report the problem. Recycling multiple page and attachment files is not atomic; interruption or partial failure may leave attachments for later handling, without forced retries or broader cleanup. Unsaved drafts in other windows are outside inspectable vault references, so recovery copies remain necessary.

<a id="附件库"></a>

## Attachment library

Open **Attachments** in the desktop/browser sidebar to browse local attachments in the current vault. Search by name or path, filter by file type, and sort by name, size or registration time. Select a file to preview images, audio/video, PDF or sandboxed HTML, download the original, copy its relative path, or view referring pages. Ordinary files provide downloads; media previews still depend on browser support.

- **Upload files** accepts multiple files and uploads them individually, with a 15 MB limit per file. Files completed before a failure remain saved. Original filenames, types, byte counts and registration times are stored in `metadata.json`, under the `assets` field; bodies continue to reference stable `assets/…` paths.
- The page menu's **Page attachments** starts with **This page only** selected; clear it to browse the entire vault. Pending input is captured and saved before the library opens; save conflicts preserve the draft.
- Use **From attachments** in the insertion menu to reuse files, or choose **Insert into page** in attachment details. **Insert as** offers images, audio/video, PDF or File / link according to the current dialect. Explicit File choices retain file-card semantics; dialects without media blocks use ordinary Markdown file links. Insertion adds a reference without copying the file.
- Reference counts read saved bodies, page icons, covers and properties, including database-record file properties and Trash pages. Examples in fenced or inline code do not count as references. Normal pages can be opened; recycled pages are marked Trash.
- Scans include existing attachments and subdirectories without migrating old files. Unregistered original names fall back to the actual filename and show **Not recorded**. Missing locally referenced files show **Missing**, with insertion and download unavailable.
- Successfully downloaded Notion media, files, email attachments, database Files, covers and icons enter the same library, with available names, types and provenance recorded. Identical content is deduplicated. Failed downloads appear in the import preview and retain remote links. See [Notion import](NOTION-IMPORT.md#attachments-and-databases) for scope and size limits.

Reference counts exclude historical snapshots, unsaved drafts in other windows and dependencies inside HTML attachments. Unparseable bodies produce a notice. “0 pages” means no current page reference was found and is not a basis for deletion. This version supports browsing, uploading and reuse, with no attachment deletion, bulk deduplication of existing files, renaming or automatic cleanup. Mobile has no attachment-library interface yet.

<a id="图片"></a>

## Images

Standalone images show a toolbar on hover or keyboard focus for alignment, captions, cropping, expansion, download and more actions. Side handles support dragging or keyboard resizing. Cropping changes the displayed region without overwriting the original and can be reset or undone. See the [image toolbar](INLINE-OBJECTS.md#image-controls) for operations and dialect constraints.

New uploads have no caption by default and do not show the filename below the image. Use **Edit caption** in the toolbar to add one. Explicit captions in existing Markdown remain visible; filenames or extensions do not automatically hide them.

Standalone Markdown image lines in Notdown and Notion Markdown use `block.image_block`, including images with empty captions and imported nested images. Existing imports parse as blocks when reopened without rewriting Markdown. Images within Notdown text remain `inline.image`; inline image syntax in official Notion Markdown is retained as literal source.

Layout editing requires dialect support for the relevant attributes. Notdown saves layout in existing image attributes. Official Notion Markdown keeps documented caption and link syntax without writing Notdown layout extensions. Unknown attributes and unmodified source remain preserved.

<a id="音视频"></a>

## Audio and video

Local and directly linked audio/video use browser players, showing only the player by default with captions added when needed. Playback depends on the media format and browser support.

YouTube watch, short, Shorts, live and embed URLs in Video blocks use the YouTube iframe player while preserving the original Markdown URL. Remote playback follows browser/system network and proxy settings, outside the local Node service's proxy environment. Video availability and site embedding restrictions still apply.

<a id="html-附件"></a>

## HTML attachments

Use **HTML embed** to upload or drop an HTML file. The body references `assets/…html` rather than embedding the entire HTML. Previews use the original metadata filename for their title and download name, retaining explicit titles. They provide fullscreen/more buttons and an **Interact** overlay. The menu offers file replacement, download, conversion to File, captions and alignment. Interact enables interaction with the sandboxed preview; local HTML scripts remain disabled.

- Notdown uses `<embed src="assets/…html">说明</embed>` and can save supported title, width, height and align attributes.
- Official `notion-markdown` enables only official embed syntax and captions, without Notdown layout extensions.
- Existing HTML attachment `web-embed` references retain their encoding; Typora retains native iframe syntax and dimensions.
- Relative dependencies of HTML files are not imported alongside them. Notion import downloads identifiable HTML attachments themselves, without their relative dependencies.

Uploads validate the returned attachment path before updating the block. If an older backend returns `.bin`, the draft is preserved and a restart is requested. Preview requires inline HTML responses rather than attachment downloads. See the [running guide](../architecture/DEVELOPMENT.md#windows-background-startup-and-restart) for restart steps.

The legacy inline-body `html-embed` tag is retired. When migration is needed, use the explicit process in the [format contract](../FORMAT.md), which preserves history and conflicts through vault revision checks. Old files are not rewritten in bulk automatically.

<a id="网页书签"></a>

## Web bookmarks

Enter an HTTP(S) URL through **Web bookmark**, or paste a URL and choose **Bookmark**. Cards have a thin light-gray border and show the site icon, title, up to two description lines and a muted URL, with an optional preview image on the right. Click to open the original page; hover or keyboard focus exposes refresh, URL editing and properties.

URL-only bookmarks, including Notion imports, fetch page information on demand when opened without rewriting the body. Retrieved titles, descriptions and images are saved only on creation or manual **Refresh bookmark**. Unreachable sites or missing information retain the domain, URL and fallback icon. Image failures do not prevent opening the link.

<a id="网页嵌入"></a>

## Embedded web pages

Enter an HTTP(S) URL through **Web embed**. Notdown saves `<web-embed url="…"/>` and uses a dedicated URL replacement flow. It shares the underlying node with HTML attachments, while its entry point and file operations have separate purposes.

Embedded pages support direct interaction. The floating toolbar offers alignment, captions, opening and more actions; side handles resize the embed. The menu offers URL replacement, fullscreen, opening the page and copying the original link. Centered embeds remain centered after mouse/keyboard resizing and reload. Existing anchors enable block links.

Web embeds do not offer HTML file replacement. Remote authentication, downloads and embedding restrictions are controlled by the site and browser. The menu has no Notion comments, suggested changes, AI actions or cross-page movement.

<a id="导出与离线使用"></a>

## Export and offline use

Single-page HTML exports retain relative attachment references without packaging the whole vault. Handle the associated attachments when sharing an export.

Notion API import downloads accessible images and files to the local attachment library by default. Failed downloads or disabled attachment downloading retain remote URLs, whose signed links may expire. This is not a complete offline Notion backup. See [Notion import](NOTION-IMPORT.md) for scope.
