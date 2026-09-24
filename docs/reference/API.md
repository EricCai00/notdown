# Markdown vault API

## Local R Markdown execution

`GET /api/rmarkdown/capabilities` probes Rscript, knitr/rmarkdown and Pandoc and returns `{ available, version, help, error? }`. Set `NOTDOWN_RSCRIPT` server-side to select the executable; requests cannot choose an executable or command arguments.

`POST /api/rmarkdown/run` accepts only `{ source: string }` and returns `{ html, log }`. This explicitly executes trusted R Markdown with the local account's permissions, using a fresh R process and temporary working directory. It does not write vault content or revisions. Limits: 128,000 source characters, two concurrent runs, 60 seconds, 8 MB console output and 8 MB HTML. Disconnecting aborts execution; errors return 400 (input), 408 (timeout), 413 (output limit), 422 (R error), 429 (busy), or 503 (Rscript unavailable). HTML must be displayed in a sandboxed frame; the application blocks scripts and network resources. See [R Markdown](../features/R-MARKDOWN.md).

# 页面存储修订（2026-09-24）

页面 `body` 现为完整 Markdown 文件（包括用户或旧文件已有的 YAML / Pandoc title block），不再剥离或生成应用 YAML。通用 metadata 保存在 `vault/metadata.json`；返回的页面字段包含文档覆盖后的有效值。`baseRevision` 同时校验正文及该页 JSON metadata。详见 [Vault metadata](../features/VAULT-METADATA.md)。


The backend listens on `127.0.0.1:4318` by default. Set `PORT` and `VAULT_PATH` to change the port and vault location. Requests from browsers are limited to the configured local origins; `ALLOWED_ORIGINS` accepts a comma-separated list. Write requests require JSON. This local service is not an authenticated public sync server.

`createApp({ vaultPath, frontendDir?, allowedOrigins? })` returns an Express app. `createVault(vaultPath)` exposes the storage API. A built `dist/index.html` is served automatically when the entry point is started from the project root. The frontend development server should proxy `/api` and `/assets` to port 4318.

On the first launch only, when `VAULT_PATH` is unset and the default `vault` directory does not exist, the entry point creates five Chinese example pages. Existing default vaults, including empty ones, and all explicitly selected vault paths are left unseeded. Internal initialization can call `vault.create(input, {id})` for stable sample IDs; REST clients cannot supply IDs, and existing IDs or filenames are never replaced by creation.

## Markdown folder import

`POST /api/import/preview` accepts `{ name, dialect: "gfm" | "obsidian" | "notdown" | "rmarkdown", files: [{ path, data }] }`, where `path` is a relative POSIX path and `data` is base64. It returns `{ id, name, pages, attachments, files, errors, warnings }` without writing vault files. Limits: 500 files, 20 MiB total decoded bytes and 10 MiB per Markdown page. Preview snapshots expire after 30 minutes; at most three are held per service.

`POST /api/import/commit` accepts `{ id, skipInvalid?: true }` and returns `{ id, pageIds, alreadyImported }`. Invalid files require an explicit `skipInvalid`; expired or unknown previews return 410. Commits go through `createVault.importBatch`, create new identities and never overwrite existing differing content. Identical completed imports are idempotent. Originals and path mappings are archived under `.history/imports/`. Partial writes can be resumed with the same selection; there is no batch rollback or force-overwrite option. See [import and recovery boundaries](../features/DESKTOP-AND-IMPORT.md).

The desktop shell supplies `createApp({ accessToken, allowedOrigins: [] })`. Its local HTTP service requires `X-Notdown-Desktop` on every request, including static files; the isolated Electron session supplies the token. This does not add authentication to the standalone browser service or provide remote sync.

## Local People address book

`createVault(...).people` owns contact persistence. `GET /api/people` lists active contacts; `?includeDeleted=true` includes recoverable deletions. `GET /api/people/:id` reads one contact, including a deleted one. `POST /api/people` creates a contact with a required nonempty `name` and optional `email`, `phone`, `organization`, `notes`. `PUT /api/people/:id` updates those fields and requires `baseRevision`; `{ deleted: true, baseRevision }` deletes and `{ deleted: false, baseRevision }` restores. Responses include stable `id`, timestamps, `deleted` and a content-hash `revision`.

Contacts are YAML files in `people/`, not page JSON or workspace accounts. A stale revision returns 409 with `current`, `proposed`, and `conflictId`; both complete YAML sources remain in `.history/people/conflicts/`. Unknown existing YAML fields and comments survive edits. Mention encoding and recovery boundaries: [People](../features/PEOPLE.md).

## Page format

```ts
type Page = {
  id: string;
  title: string;
  parent: string | null;
  icon: string;
  properties: Record<string, unknown>;
  body: string; // Exact Markdown body, without frontmatter
  revision: string; // SHA-256 of the complete source file
  updated: string; // ISO timestamp
  favorite?: boolean; // Sidebar Favorites; absent means false
  trashed?: boolean; // Soft deletion; absent means false
};
```

Page files are UTF-8 Markdown in `vault/pages/<uuid>.md`. The YAML fields are `id`, `title`, `parent`, `icon`, `properties`, and `updated`. Other YAML fields and comments survive metadata updates. A metadata-only update preserves body bytes as decoded UTF-8, including CRLF and trailing blank lines. Unknown body syntax is left untouched. Files are re-read on every call, so edits made by an external editor become visible. Invalid YAML and duplicate page IDs produce 422 and block mutations instead of overwriting ambiguous data. Symlink pages are ignored.

## Routes

Source-file actions resolve the existing filename from the page ID (including renamed `.md` files); clients cannot supply filesystem paths. `GET /api/pages/:id/source-file` returns `{path}` with the absolute path. `GET /api/pages/:id/source` serves the complete file as inline UTF-8 plain text, with `no-store`, `nosniff`, and a sandbox CSP. `POST /api/pages/:id/source-file/open` accepts only `{}` and opens the file with the local default application, returning `{opened:true}` or 503 if the OS launcher fails. These endpoints do not write the page; the UI saves through the existing revision-checked update before opening.

Markdown Lab uses `GET /api/markdown/capabilities` to report installed Pandoc readers and the availability of the direct `multimarkdown-cli` and `markdown-pl` renderers. Pandoc reader variants use the local Pandoc executable through a JSON AST and HTML writer; there is no separate `pandoc-cli` variant. `POST /api/markdown/preview` accepts `{source, variant, extensions?, plugins?}` and returns `{html, engine, blocks, mapping, warnings}`. Direct renderers accept no Lab extensions or plugins and return their program's HTML stdout; `mapping` is `proportional` because those tools do not report source positions. The browser displays the raw HTML as text or sanitizes it for the page preview. Requests cannot select executable paths or arguments; server startup environment variables configure trusted installations. Neither endpoint writes to the vault.

| Request                           | Body                                                    | Response                                                     |
| --------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------ |
| `GET /api/status`                 | —                                                       | `{status, vaultPath, storage:'markdown', sync:'local-only'}` |
| `GET /api/pages`                  | —                                                       | `Page[]`                                                     |
| `GET /api/pages?includeTrashed=true` | — | All pages, including trashed parents and their descendants |
| `POST /api/pages/:id/duplicate` | `{baseRevision}` | 201 `Page`; new ID, same parent, exact body and unknown YAML preserved; no recursive child copy |
| `POST /api/pages/:id/recycle` | `{baseRevision,baseRevisions:{[pageId]:revision}}` | `{recycled:string[]}`; move a trashed page and descendants to Windows Recycle Bin |
| `POST /api/pages/:id/move` | `{baseRevision,parent,sidebarOrder,beforeId,afterId,baseRevisions}` | `Page`; set parent and sibling position after validating source, parent and destination sibling revisions |
| `GET /api/pages/:id`              | —                                                       | `Page`                                                       |
| `POST /api/pages`                 | `{title?,parent?,icon?,properties?,body?}`              | 201 `Page`                                                   |
| `PUT /api/pages/:id`              | `{baseRevision,title?,parent?,icon?,properties?,body?}` | `Page`                                                       |
| `GET /api/conflicts`              | —                                                       | `Conflict[]`                                                 |
| `POST /api/conflicts/:id/resolve` | `{baseRevision,title?,parent?,icon?,properties?,body?}` | `Page`                                                       |
| `POST /api/assets`                | `{name,contentType,data}` (`data` is standard base64)   | 201 `{path,name,contentType}`                                |

`title` defaults to Untitled page, `icon` to 📄, `parent` to null, and `body` to an empty string on creation. Properties are replaced when provided; omitted properties remain intact. Passing null as a parent makes the page a root page. Parent references must exist and cannot create cycles. IDs are immutable.

`PUT /api/pages/:id` also accepts boolean `favorite` and `trashed`, with the same required `baseRevision` and conflict preservation. Normal listing excludes trashed pages and descendants of trashed ancestors; `GET /api/pages/:id` still allows recovery reads. Trash preserves the original Markdown file, hierarchy, and children without rewriting child files. Restore with `trashed:false`; restore ancestors first. Creating or moving under a trashed ancestor is rejected. Duplication copies one page, preserves existing references and attachments, and resets favorite/trash flags. A stale duplication revision returns a conflict instead of silently copying a different revision.

`GET /api/status` includes `capabilities: {pageActions:1,sidebarDrag:1,systemRecycleBin:boolean}`. The frontend checks this before page mutations and Trash reads so an older running server cannot silently ignore new metadata fields and report success. It also checks returned metadata against the requested change.

System recycling requires a revision map covering the exact current subtree, a trashed root, and no unresolved conflicts in that subtree. Each file gets a history snapshot and a revision recheck. Children are recycled first; OS errors stop processing, return 503 with completed IDs, and leave remaining files in Trash. Shared attachments and histories are retained. Windows shell `IFileOperation` uses [RECYCLEONDELETE](https://learn.microsoft.com/en-us/windows/win32/api/shobjidl_core/nf-shobjidl_core-ifileoperation-setoperationflags); no permanent-delete fallback is provided. Restoring files in Windows puts their original Markdown back in `pages/`, retaining the application's Trash flag until Restore is clicked. Browser tests inject a private temporary recycle adapter; native recycling and restoration are verified separately.

## Conflicts and history

Every update requires the revision returned by the read that the edit was based on. A mismatched revision returns HTTP 409:

```json
{ "error": "…", "conflictId": "uuid", "current": {}, "proposed": {} }
```

`current` and `proposed` are complete Page objects. The proposed source is saved as readable Markdown in `.history/conflicts/<conflictId>.md`, with a JSON sidecar recording its origin. The current page stays untouched. `GET /api/conflicts` returns `{id,conflictId,pageId,createdAt,baseRevision,currentRevision,current,proposed}`. The `current` object reflects the latest source, while `currentRevision` records the revision when the fork was created.

Resolve by explicitly posting a newly read `baseRevision` and the intended merged fields. Omitted fields default to the proposed page. A successful resolution archives both conflict files under `.history/conflicts/resolved`. A stale resolution creates another conflict and keeps the original unresolved. Historical page sources are preserved under `.history/<pageId>/<revision>.md`.

Writes use same-directory temporary files, file flush, rename, and an in-process mutation queue. The service compares the source again immediately before replacement. This is optimistic concurrency for one backend process, not a cross-device sync implementation or a filesystem lock against arbitrary external writers: an external program can still write in the narrow interval between the last check and rename. Run only one backend process per vault.

## Attachments and errors

PDF attachments are served inline with `nosniff` and a restrictive CSP for the browser PDF viewer, with a download/open-link fallback.

Attachment names on disk are generated UUIDs. MIME types determine safe extensions; unrecognized types become `.bin`. HTML and SVG uploads cannot create browser-active `.html` or `.svg` paths. Files other than supported image/audio/video/PDF formats are served with attachment disposition and `nosniff`. The upload maximum is 20 MB; page body maximum is 10 MB. Returned paths such as `assets/<uuid>.png` can be used in Markdown as `![caption](assets/<uuid>.png)`.

Errors are JSON `{error:string,...details}` with 400 for invalid input, 403 for disallowed host/origin, 404 for absent resources, 409 for revision conflicts, 413 for oversized input, 415 for non-JSON writes, and 422 for ambiguous or malformed stored data.

## Local object services

Link previews use fixed GitHub and Microsoft Graph API hosts; they do not fetch arbitrary user URLs. Read results are transient and never update page bodies or revisions.

| Request | Body | Result |
| --- | --- | --- |
| `GET /api/link-previews/settings` | — | `{github:boolean, onedrive:boolean}`; never returns tokens |
| `PUT /api/link-previews/settings` | `{provider:"github"\|"onedrive", token?, disconnect?}` | Token presence; omitted/blank token keeps the existing value, `disconnect:true` removes it and clears preview caches |
| `POST /api/link-previews/resolve` | `{url}` | Provider-specific title, status, metadata, code or thumbnail; 60-second in-memory cache |
| `POST /api/link-previews/viewer` | `{url}` | Short-lived Microsoft document viewer URL for OneDrive for Business / SharePoint, requested only when opening the viewer |

Credentials are local plaintext in `.notdown/link-connections.json` and must be excluded from shared vault backups. Requests are bounded by fixed hosts, rejected redirects, 15-second timeout, 2 MB responses and four concurrent provider operations. Authentication errors do not include upstream response bodies. No OAuth sign-in, automatic token renewal, multi-account support or external source writes are implemented. See [Link Preview](../features/LINK-PREVIEWS.md).

| Request | Body | Result |
| --- | --- | --- |
| `GET /api/services/settings` | — | `{endpoint, model, transcriptionModel, hasKey}`; never returns the API key |
| `PUT /api/services/settings` | `{endpoint, model, transcriptionModel, apiKey?, clearKey?}` | Public settings; blank/omitted key keeps the existing key |
| `POST /api/services/generate` | `{prompt, context?, model?}` | `{text}` from the configured compatible `/chat/completions` endpoint |
| `POST /api/services/transcribe` | `{path, language?}` | `{text}` from `/audio/transcriptions`; path must identify a local audio attachment |
| `POST /api/syntax/citations` | `{path, citations, style?}` | Formatted citation HTML and bibliography using local BibTeX/CSL and sandboxed Pandoc |

Service settings live in `<vault>/.notdown/services.json`; this is a local plaintext secret file, separate from page Markdown. These calls do not save a page. The editor incorporates a result only if the block is unchanged, then normal page CAS applies. At most two external requests run concurrently, with a 120-second timeout and 2 MB response bound. Transcription accepts at most 25 MB; uploads remain limited to 20 MB. Endpoint configuration accepts HTTPS or loopback HTTP without credentials/query/fragment. Provider errors do not echo credentials or the provider response body.

Synced-block refresh reads the source page with the existing page API; publish uses its captured `baseRevision` and the normal conflict path. Reminder scheduling is browser-local while the app is open. Neither mechanism introduces cross-device synchronization.
## Web bookmark metadata

`POST /api/bookmarks/resolve` accepts `{ "url": "https://example.com" }` and returns `{ title, description, icon, image }`. It reads public HTTP(S) HTML with a 10-second deadline, 2 MB response limit and at most four redirects; it does not write a page. Private/reserved IP destinations, credentials in URLs and nonstandard ports are rejected. The client persists metadata through the existing page CAS update. Unavailable metadata returns an error and the editor retains a usable URL-only bookmark.
