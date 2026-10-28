# Markdown vault API

## Browser knowledge base management

Browser service status includes `vaultManagement: true`. `GET /api/vaults` returns `{ dataPath, vaults: [{ name, path, url }] }`. `POST /api/vaults/open` takes `{ mode: "create", name, path? }` or `{ mode: "open", path }`, and returns `{ name, path, url }`. Paths are absolute paths on the local service computer; a custom create path must be new or empty, and existing vaults must contain a real `pages/` directory. Opening does not change the default vault or any other request's binding. Local-origin and JSON-write guards also protect these endpoints. Electron and Android do not expose them.

Each returned URL is `/v/<SHA-256 of canonical directory>/`. The same API and attachment paths are available beneath it (`/v/<id>/api/pages`, `/v/<id>/assets/...`). Unknown or unavailable identities return 404, never the default vault. Clients must keep all vault-specific requests under the tab's prefix, including previews, source downloads and attachments. Directory identity does not provide authentication; these remain local-only services. Opened directories are recorded in the data directory's `.browser-vaults.json` for restoration after restart.

## Local page history

`GET /api/history/settings` returns `{ settings, revision, available, version?, repository?, latest?, error?, localOnly: true }`. Settings are `{ intervalMinutes, idleSeconds, retentionDays, maxVersions, gitEnabled }`, defaulting to `{5,120,30,100,false}`. `PUT /api/history/settings` requires `{ settings, baseRevision }`. Conflicting configuration saves preserve both versions and return 409. Git runs only in the Node service; it is not exposed by the Android local transport.

`POST /api/history/checkpoint` accepts an optional nonempty `message` of up to 160 characters, requires enabled Git history, and returns `{ created, id }`. An unchanged projection returns `created:false`. This is a local checkpoint, not a remote push or full attachment backup.

`GET /api/pages/:id/history` lists `{ id, createdAt, kind:"snapshot"|"git", message, protected }`. `GET /api/pages/:id/history/:kind/:revision` returns the historical `{ source, metadata }`. `POST /api/pages/:id/history/:kind/:revision/restore` requires `{ baseRevision }`; it preserves the current version before restoring only this page through `createVault`. A stale page revision returns 409 without overwriting the current page. Current database membership and schema remain authoritative. Historical content is data and is never executed.

## Device sync

`GET /api/sync/status` returns connection status, last sync time and conflict count, without session tokens. `GET /api/sync/vaults` lists the signed-in account's cloud notebooks. `GET /api/sync/conflicts` returns the shared base, local and remote snapshots for review.

`GET /api/sync/progress` returns the current process's `{ running, progress?, error? }` without reading vault files or contacting the cloud. Progress includes upload/download/conflict counts, phase, optional batch and phase resource counts, current resource, optional attachment byte counts, and start/update timestamps. Phase totals describe the current step, not the whole notebook; they may be unknown. The last snapshot remains available after completion or failure and resets on the next run (or disconnect). Progress is observational and does not replace durable sync state.

`POST /api/sync/:action` supports `sign-in` (url, key, email, password), `connect` (vaultId, or name for a new notebook), `run`, `pause` (paused), `disconnect`, and `resolve` (id, choice, baseRevision, and a complete merged item for choice merged). Page conflicts also reuse `/api/conflicts/:id/resolve`. The Android local transport exposes the same operations. These routes control the local client; the cloud uses the authenticated RPCs in `server/sync/supabase.sql`. See [setup and boundaries](../features/CLOUD-SYNC.md).

For WebDAV, `sign-in` accepts `{ provider: "webdav", url, folder, email, password }`; `email` is the account identifier and `password` is its application password. It verifies actual conditional-write behavior in a temporary diagnostic folder before storing the connection. `vaults` returns the notebook in the configured remote folder, or an empty list when no index exists. `connect` creates a new folder or joins the listed notebook. Status additionally returns `provider`, `folder`, `nextSyncAt` and `needsSignIn`; it never returns the application password. WebDAV sync uses HTTPS and a direct conditional-write protocol, without Supabase RPCs. See [WebDAV setup](../features/WEBDAV-SYNC.md).

## Local R Markdown execution

`GET /api/runtimes/settings` returns `{ settings, inherited, revision }`. Settings fields are `rscript`, `python`, `julia`, `pandoc`, `pythonKernel`, `juliaKernel`, `jupyterDataDir` (strings, at most 2,048 characters, no null/newline). Empty values inherit startup configuration or automatic discovery. `PUT /api/runtimes/settings` accepts `{ settings, baseRevision }`, persists through `createVault` to `.notdown/runtimes.json`, preserves unknown stored fields and resets existing R/Quarto notebook sessions. Stale revisions return 409 with a `conflictFile` containing both versions; no forced retry. `POST /api/runtimes/check` accepts `{ language: "r" | "python" | "julia", settings }` and returns `{ available, detail }`, probing unsaved settings in a temporary process (maximum two concurrent checks, 60 seconds). No page content is executed or saved by this check. All endpoints use the same local-origin/desktop-token restrictions as other settings APIs.

`POST /api/quarto/notebook` accepts `{ session: UUID, source, variant: "quarto" | "notdown", extensions?: Record<string, boolean>, mode: "current" | "above" | "inline", index }`. Indices follow document order among executable blocks or inline expressions, including legacy R nodes. `above` excludes the selected block. Returns `{ outputs: [{ index, html?, text?, error? }], sessionStarted? }`; a cell failure retains prior outputs and stops later cells unless its supported error option requests continuation. Source is limited to 128,000 characters, output to 8 MB and a request to 60 seconds. Python and Julia use separate Jupyter kernels; R uses knitr. Executable paths and kernel names come from saved runtime settings or startup environment configuration, never document source. OJS is executed by the browser sandbox; its server entries are placeholders. `DELETE /api/quarto/notebook/:session` releases that window's R/Python/Julia workers. Results never change vault revisions. See [Quarto](../features/QUARTO.md).

`GET /api/rmarkdown/capabilities` probes Rscript, knitr/rmarkdown and Pandoc and returns `{ available, version, help, error? }`. Select Rscript in runtime settings or with `NOTDOWN_RSCRIPT`; document execution requests cannot choose an executable or command arguments.

`POST /api/rmarkdown/run` accepts only `{ source: string }` and returns `{ html, log }`. This explicitly executes trusted R Markdown with the local account's permissions, using a fresh R process and temporary working directory. It does not write vault content or revisions. Limits: 128,000 source characters, two concurrent runs, 60 seconds, 8 MB console output and 8 MB HTML. Disconnecting aborts execution; errors return 400 (input), 408 (timeout), 413 (output limit), 422 (R error), 429 (busy), or 503 (Rscript unavailable). HTML must be displayed in a sandboxed frame; the application blocks scripts and network resources. See [R Markdown](../features/R-MARKDOWN.md).

# 页面存储修订（2026-09-24）

页面 `body` 现为完整 Markdown 文件（包括用户或旧文件已有的 YAML / Pandoc title block），不再剥离或生成应用 YAML。通用 metadata 保存在 `vault/metadata.json`；返回的页面字段包含文档覆盖后的有效值。`baseRevision` 同时校验正文及该页 JSON metadata。详见 [Vault metadata](../features/VAULT-METADATA.md)。


The backend listens on `127.0.0.1:4318` by default. Set `PORT` and `VAULT_PATH` to change the port and vault location. Requests from browsers are limited to the configured local origins; `ALLOWED_ORIGINS` accepts a comma-separated list. Write requests require JSON. This local service is not an authenticated public sync server.

`createApp({ vaultPath, frontendDir?, allowedOrigins? })` returns an Express app. `createVault(vaultPath)` exposes the storage API. A built `dist/index.html` is served automatically when the entry point is started from the project root. The frontend development server should proxy `/api` and `/assets` to port 4318.

On the first launch only, when `VAULT_PATH` is unset and the default `vault` directory does not exist, the entry point creates five Chinese example pages. Existing default vaults, including empty ones, and all explicitly selected vault paths are left unseeded. Internal initialization can call `vault.create(input, {id})` for stable sample IDs; REST clients cannot supply IDs, and existing IDs or filenames are never replaced by creation.

## Markdown folder import

`POST /api/import/preview` accepts `{ name, dialect: "gfm" | "obsidian" | "notdown" | "rmarkdown" | "quarto", files: [{ path, data }] }`, where `path` is a relative POSIX path and `data` is base64. It returns `{ id, name, pages, attachments, files, errors, warnings }` without writing vault files. Limits: 500 files, 20 MiB total decoded bytes and 10 MiB per Markdown page. Preview snapshots expire after 30 minutes; at most three are held per service.

`POST /api/import/commit` accepts `{ id, skipInvalid?: true }` and returns `{ id, pageIds, alreadyImported }`. Invalid files require an explicit `skipInvalid`; expired or unknown previews return 410. Commits go through `createVault.importBatch`, create new identities and never overwrite existing differing content. Identical completed imports are idempotent. Originals and path mappings are archived under `.history/imports/`. Partial writes can be resumed with the same selection; there is no batch rollback or force-overwrite option. See [import and recovery boundaries](../features/DESKTOP-AND-IMPORT.md).

`POST /api/notion/import/preview` accepts optional boolean `useDesktopCache` (omitted means false; the import dialog explicitly defaults it to true). In the `notdown` variant, verified inline reminder/date-format attributes can be supplemented from the service host's fixed Windows Notion SQLite cache path. Clients cannot choose a database path. Missing, ambiguous, stale or unsupported cache records retain API output with warnings. Applied evidence is archived and included in batch identity; no existing vault pages are updated. This is not a SQLite-only importer. See [Notion import](../features/NOTION-IMPORT.md).

`POST /api/notion/import/preview` and `POST /api/import/commit` also accept `Accept: application/x-ndjson` for live progress. Request bodies remain JSON. The response sends newline-delimited `{type:"progress", phase, completed, total?, currentTitle?}` events, followed by `{type:"result", result}` or `{type:"error", error}`. Preview phases are `reading`, `restoring`, `attachments`, and `finalizing`; `completed` counts pages read, and `total` is omitted because descendants are discovered during traversal. Commit phases are `importing` and `finalizing`; counts refer to pages persisted or already present in the identical completed batch, and `total` is known. Finalization may continue after every page is written. After streaming headers are sent, failures use an error event; early validation failures may still return ordinary JSON with an HTTP error status. Disconnecting a preview cancels reading; disconnecting a commit does not roll back writes. Callers without this Accept header retain the JSON response format.

Progress events may also include `step` (a readable operation, pagination page, response wait/receive state, or rate-limit retry), `requestCount` (Notion API attempts, including retries), and `discovered` (unique page/container identities queued so far, not a final total). The UI times the current step and time since the last event locally; timer ticks do not imply upstream progress. Step messages omit authorization headers, raw pagination cursors and signed attachment URLs.

The desktop shell supplies `createApp({ accessToken, allowedOrigins: [] })`. Its local HTTP service requires `X-Notdown-Desktop` on every request, including static files; the isolated Electron session supplies the token. This does not add authentication to the standalone browser service or provide remote sync.

## Local People address book

`createVault(...).people` owns contact persistence. `GET /api/people` lists active contacts; `?includeDeleted=true` includes recoverable deletions. `GET /api/people/:id` reads one contact, including a deleted one. `POST /api/people` creates a contact with a required nonempty `name` and optional `email`, `phone`, `organization`, `notes`. `PUT /api/people/:id` updates those fields and requires `baseRevision`; `{ deleted: true, baseRevision }` deletes and `{ deleted: false, baseRevision }` restores. Responses include stable `id`, timestamps, `deleted` and a content-hash `revision`.

Contacts are YAML files in `people/`, not page JSON or workspace accounts. A stale revision returns 409 with `current`, `proposed`, and `conflictId`; both complete YAML sources remain in `.history/people/conflicts/`. Unknown existing YAML fields and comments survive edits. Mention encoding and recovery boundaries: [People](../features/PEOPLE.md).

Contacts may also carry optional `notionUserId`, a canonical Notion UUID. Create/update accepts this field (an empty string clears it). Matching uses the ID, never the name/email. Named complete user objects returned during import create local contacts once; partial users do not, and later imports never overwrite or restore existing contacts.

## External entity library

`createVault(...).externalEntities` owns the persistent `metadata.json.externalEntities` map. Records use `notion:<kind>:<source ID>` keys, where kind is `page`, `user`, `database`, `data-source` or `block`. Import observations retain labels, source URLs, available raw user data, batch IDs and unknown existing fields. Live reference locations and candidate availability are derived from parsed Markdown, properties and current local objects; reading does not modify a note.

| Request | Body | Response |
| --- | --- | --- |
| `GET /api/external-entities` | — | `{revision,entities,warnings}` |
| `PUT /api/external-entities/binding` | `{key,localId:string|null,baseRevision}` | Updated library |

Entities expose `{provider,kind,id,key,label?,url?,data?,status,localId?,candidates,references,importIds}`. Status is `resolved`, `unresolved` or `ambiguous`; references contain `{pageId,location}` for current remote references in saved content. Page candidates exclude Trash and descendants, users exclude deleted contacts. Data sources resolve to a unique imported database host. Unmapped block anchors remain unresolved. Manual binding supports users to contacts, pages to pages, and databases to database hosts; null restores automatic matching. Explicit unavailable bindings remain unresolved rather than silently choosing another copy.

Binding requires the current library revision (including current candidate availability). Stale saves return 409 and preserve current/proposed metadata under `.history/external-entity-conflicts/`; file writes use byte-level CAS and preserve unknown fields. No forced retry or note rewrite occurs. External records are individual resources in the existing sync protocol. The same read/binding routes are implemented by the offline mobile transport.

## Page format

```ts
type Page = {
  id: string;
  title: string;
  parent: string | null;
  icon: string;
  properties: Record<string, unknown>;
  body: string; // Complete Markdown file, including document metadata
  revision: string; // Revision of complete Markdown and this page's JSON metadata
  updated: string; // ISO timestamp
  favorite?: boolean; // Sidebar Favorites; absent means false
  trashed?: boolean; // Soft deletion; absent means false
  dataSourceId?: string; // Database record membership, separate from parent
  databaseId?: string; // Native or imported database host page
};
```

Page files are UTF-8 Markdown in `vault/pages/<uuid>.md`; application metadata is stored in `metadata.json`. Existing YAML/Pandoc metadata remains in the complete body and overrides JSON defaults on reads. Unknown fields and comments survive metadata updates. A metadata-only update preserves body bytes as decoded UTF-8, including CRLF and trailing blank lines. Unknown body syntax is left untouched. Files are re-read on every call, so edits made by an external editor become visible. Invalid YAML and duplicate page IDs produce 422 and block mutations instead of overwriting ambiguous data. Symlink pages are ignored.

## Routes

Source-file actions resolve the existing filename from the page ID (including renamed `.md` files); clients cannot supply filesystem paths. `GET /api/pages/:id/source-file` returns `{path}` with the absolute path. `GET /api/pages/:id/source` serves the complete file as inline UTF-8 plain text, with `no-store`, `nosniff`, and a sandbox CSP. `POST /api/pages/:id/source-file/open` accepts only `{}` and opens the file with the local default application, returning `{opened:true}` or 503 if the OS launcher fails. These endpoints do not write the page; the UI saves through the existing revision-checked update before opening.

Markdown Lab uses `GET /api/markdown/capabilities` to report installed Pandoc readers and the availability of the direct `multimarkdown-cli` and `markdown-pl` renderers. Pandoc reader variants use the local Pandoc executable through a JSON AST and HTML writer; there is no separate `pandoc-cli` variant. `POST /api/markdown/preview` accepts `{source, variant, extensions?, plugins?}` and returns `{html, engine, blocks, mapping, warnings}`. Direct renderers accept no Lab extensions or plugins and return their program's HTML stdout; `mapping` is `proportional` because those tools do not report source positions. The browser displays the raw HTML as text or sanitizes it for the page preview. Requests cannot select executable paths or arguments; server startup environment variables configure trusted installations. Neither endpoint writes to the vault.

| Request                           | Body                                                    | Response                                                     |
| --------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------ |
| `GET /api/status`                 | —                                                       | `{status, vaultPath, storage:'markdown', sync:'local-only'}` |
| `GET /api/pages`                  | —                                                       | `Page[]`                                                     |
| `GET /api/pages?includeTrashed=true` | — | All pages, including trashed parents and their descendants |
| `POST /api/pages/:id/duplicate` | `{baseRevision}` | 201 `Page`; new ID, same parent, exact body and unknown YAML preserved; no recursive child copy |
| `POST /api/pages/:id/recycle` | `{baseRevision,baseRevisions:{[pageId]:revision}}` | `{recycled:string[],deletedAssets:string[],warnings:string[]}`; recycle a trashed subtree and attachments losing their last reference |
| `POST /api/pages/:id/move` | `{baseRevision,parent,sidebarOrder,beforeId,afterId,baseRevisions}` | `Page`; set parent and sibling position after validating source, parent and destination sibling revisions |
| `GET /api/pages/:id`              | —                                                       | `Page`                                                       |
| `POST /api/pages`                 | `{title?,parent?,icon?,properties?,body?}`              | 201 `Page`                                                   |
| `PUT /api/pages/:id`              | `{baseRevision,schemaRevision?,title?,parent?,icon?,properties?,body?}` | `Page`                                                       |
| `GET /api/conflicts`              | —                                                       | `Conflict[]`                                                 |
| `POST /api/conflicts/:id/resolve` | `{baseRevision,schemaRevision?,title?,parent?,icon?,properties?,body?}` | `Page`                                                       |
| `POST /api/assets`                | `{name,contentType,data}` (`data` is standard base64)   | 201 `{path,name,contentType}`                                |
| `GET /api/assets/info?path=assets/...` | — | `{path,name,size}`; one file only, nullable original name/size, no page/reference scan |
| `GET /api/assets`                 | —                                                    | `{assets,warnings}`; local files and referenced missing paths |

Attachment entries contain `path`, `name`, `originalName` (null for unregistered legacy files), `contentType`, `kind`, `size` (nullable), `addedAt`, `modifiedAt`, `missing`, and `references`. Each reference identifies a saved page with `pageId`, `title`, `trashed` and `locations`. Current Markdown, page properties, covers, icons and database record file properties are inspected; history and unsaved drafts are not counted. Warnings identify sources that could not be fully inspected. Zero references does not establish that a file is safe to delete.

Uploads retain the original name and resource metadata in `metadata.json.assets`, keyed by the stable relative path. Metadata writes compare the previous file contents and preserve a recovery proposal on conflict. Existing files are listed without being renamed or registered automatically. Local asset serving supports nested directories and rejects symbolic links and traversal.

`title` defaults to Untitled page, `icon` to 📄, `parent` to null, and `body` to an empty string on creation. Properties are replaced when provided; omitted properties remain intact. Passing null as a parent makes the page a root page. Parent references must exist and cannot create cycles. IDs are immutable.

`PUT /api/pages/:id` also accepts boolean `favorite` and `trashed`, with the same required `baseRevision` and conflict preservation. Normal listing excludes trashed pages and descendants of trashed ancestors; `GET /api/pages/:id` still allows recovery reads. Trash preserves the original Markdown file, hierarchy, and children without rewriting child files. Restore with `trashed:false`; restore ancestors first. Creating or moving under a trashed ancestor is rejected. Duplication copies one page, preserves existing references and attachments, and resets favorite/trash flags. A stale duplication revision returns a conflict instead of silently copying a different revision.

`GET /api/status` includes `capabilities: {pageActions:1,sidebarDrag:1,databases:1,systemRecycleBin:boolean}`. The frontend checks page capabilities before page mutations and Trash reads so an older running server cannot silently ignore new metadata fields and report success. It also checks returned metadata against the requested change. A 404 from the database-list endpoint is treated as an older backend: ordinary pages stay available and database entrypoints explain how to restart and recheck the server. Other database errors remain visible.

System recycling requires a revision map covering the exact current subtree, a trashed root, and no unresolved conflicts in that subtree. Each file gets a history snapshot and a revision recheck. Children are recycled first; OS errors stop processing, return 503 with completed IDs, and leave remaining files in Trash. After successful page recycling, only attachment candidates referenced by that subtree are checked. Surviving pages including Trash, conflict proposals, non-page metadata and static HTML/SVG/CSS dependencies protect their files. Uncertain sources or changed revisions stop cleanup and return warnings. Unrelated pre-existing orphans are not swept. Recycled attachments retain byte and metadata recovery copies in `.history/deleted-assets/`; shared attachments and histories remain. The operation is not atomic across multiple files. Windows shell `IFileOperation` uses [RECYCLEONDELETE](https://learn.microsoft.com/en-us/windows/win32/api/shobjidl_core/nf-shobjidl_core-ifileoperation-setoperationflags); no permanent-delete fallback is provided. Restoring files in Windows puts their original Markdown back in `pages/`, retaining the application's Trash flag until Restore is clicked. Browser tests inject a private temporary recycle adapter; native recycling and restoration are verified separately.

## Local databases

`createVault(...).databases` stores database, data-source and view resources in the corresponding `metadata.json` top-level maps. Records remain normal Markdown pages. A `DatabaseSnapshot` is `{ database, hostPage?, dataSources, views, pages }`; `pages` excludes trashed records and descendants of trashed ancestors. `hostPage` is absent for legacy databases without a host. Resource reads include content-hash revisions and use `Cache-Control: no-store`.

| Request | Body | Response |
| --- | --- | --- |
| `GET /api/databases` | — | `Database[]` |
| `POST /api/databases` | `{title,parent?:string|null,parentRevision?:string,kind?:"database"\|"wiki"}` | 201 `DatabaseSnapshot`; creates a Markdown host page, one data source and title property; Wiki starts with Home and an All pages list |
| `POST /api/pages/:id/wiki` | `{baseRevision}` | `DatabaseSnapshot`; converts an active standalone page without rewriting Markdown or page identities |
| `POST /api/databases/:id/undo-wiki` | `{baseRevision,hostRevision}` | `Page`; restores the host to an ordinary page, preserves the tree and property values, archives removed Wiki resources |
| `GET /api/databases/:id` | — | `DatabaseSnapshot` |
| `PUT /api/databases/:id` | `{title?,icon?,baseRevision,hostRevision?}` | Updated `DatabaseSnapshot`; requires at least one of title/icon |
| `PUT /api/databases/:id/icon` | `{icon,baseRevision,hostRevision?}` | Updated `DatabaseSnapshot`; icon-only alias |
| `GET /api/data-sources/:id` | — | `DatabaseDataSource` |
| `PUT /api/data-sources/:id` | `{baseRevision,title?,properties?}` | Updated `DatabaseDataSource` |
| `POST /api/databases/:id/views` | `{baseRevision,name?,dataSourceId?,type?:"table",propertyIds?,filters?,sorts?,rowOrder?}` | 201 updated `DatabaseSnapshot`; revision belongs to the database |
| `PUT /api/database-views/:id` | `{baseRevision,name?,type?:"table",propertyIds?,filters?,sorts?,rowOrder?}` | Updated `DatabaseView`; source/database identity stays unchanged |
| `POST /api/data-sources/:id/records` | `{baseRevision,title?,properties?}` | 201 `Page`; revision belongs to the data source |
| `PUT /api/data-sources/:id/records/:pageId` | `{baseRevision,schemaRevision,propertyId,value}` | Updated `Page`; checks both page and data-source revisions |
| `POST /api/data-sources/:id/records/:pageId/remove` | `{baseRevision,schemaRevision}` | Updated `Page` detached from its data source; Markdown and properties preserved |

`Database` has `{id,title,icon?,pageId?,dataSourceIds,viewIds,revision}`. New native databases use the same UUID for `id`, `pageId` and their host page; the host page has `databaseId:id`, the default `table-2` icon and an empty Markdown body. Hosted database titles, icons and parent locations are presented from the host page, and list reads exclude effectively trashed hosts. `DatabaseDataSource` has `{id,title,properties,ownerDatabaseId?,revision}`; new native sources bind an immutable canonical owner.

Title/icon updates require the database `baseRevision`; hosted databases also require the captured `hostRevision`. A title is a nonblank string of at most 500 characters; an icon is a string of at most 100 characters, with `""` removing the custom icon. The UI renders the shared document icon as the empty-value fallback. Hosted updates go through the normal page journal and preserve exact Markdown and unknown metadata; stale host revisions create normal page conflicts, while stale resource revisions use database conflict archives. Document-controlled title/icon values return 422 with `source:"document"`. Hostless legacy databases update only their resource fields, without creating host files. Updates accept only title, icon and the two revision fields.

Omitting `parent` or passing null creates a root database. A non-null parent requires its current `parentRevision`; stale parents fail with 409 before creating an orphan. The parent must be an active ordinary page, not a database host. Database records are created with `parent` equal to their source's canonical host. Ordinary page creation/movement directly into a database host, generic reparenting of database records, and generic duplication of a database host return 422; use database record operations for membership. Existing imported host identities are retained. Legacy databases without hosts remain readable and do not acquire files during reads; their new records retain `parent:null`, with hierarchy projected only in the UI.

Each property has `{id,name,key,type,options?,readOnly?}`; options have stable `{id,name,color?}` identities. Exactly one `title` field binds `key:"title"`; other fields bind keys in `Page.properties`. Field keys cannot be renamed. Populated type conversions and deletion of options still in use are rejected, and fields referenced by saved views cannot be removed. Unknown stored resource, field and option fields are retained.

Editable primitive types are `text`, `number`, `checkbox`, `date`, `select`, `multi_select`, `status`, `url`, `email` and `phone`, plus the page title. Date values are `{start,end?,time_zone?}`; select/status values are option IDs and multi-select values are unique option-ID arrays. Non-title values may be null. `formula`, `rollup`, `unknown` and explicitly `readOnly` fields reject edits. Imported relations, people and files are currently read-only snapshots. Document-controlled values reject cell updates with 422; edit the complete document source instead.

`DatabaseView` has `{id,databaseId,dataSourceId,name,type:"table",propertyIds?,filters?,sorts?,rowOrder?,revision}`. `rowOrder` is a unique ordered array of page IDs from that view's data source; duplicate and foreign IDs are rejected. Current table rendering supports filters `{propertyId,operator:"contains",value}` and sorts `{propertyId,direction:"ascending"|"descending"}`. The UI edits one filter and one sort; remote Notion view definitions are preserved separately and are not applied as local view configuration.

Generic `PUT /api/pages/:id` and conflict resolution also require the data source's `schemaRevision` when changing a database record's title or schema-bound properties. Clients must preserve the schema revision captured when editing began; a stale schema produces a recoverable conflict, not an automatic retry. Body-only edits retain the usual page revision requirement. Data-source membership cannot be changed through arbitrary page metadata patches.

Resource revision conflicts return 409 with `current`, `proposed` and `recoveryPath`, retaining both versions under `.history/database-conflicts/`. Resource writes preserve before/after metadata in `.history/database-transactions/` and atomically replace the metadata file. Page conflicts use the existing page conflict API. Database resource conflict archives are not returned by `GET /api/conflicts`, and no resource-conflict resolution endpoint exists yet. See [database behavior and boundaries](../features/DATABASES.md).

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

New uploads, Markdown folder imports and Notion downloads use `assets/<UUID>.<extension>`, using hyphenated UUIDv5 identities derived from a separate attachment identity prefix, the content SHA-256 and normalized extension. Page UUID identities are unchanged. Identical bytes with the same normalized extension reuse one new-format file after verifying its bytes; an externally changed target returns a conflict instead of being overwritten. Existing metadata and unknown fields are preserved, and the upload response retains the submitted original name for insertion. Existing hash, UUID, batch and `notion-` paths remain readable without migration. Recognized MIME types supply the extension; otherwise a simple alphanumeric original extension is retained, falling back to `.bin`. HTML is served with a script-free sandbox; other unsupported formats use attachment disposition and `nosniff`. The upload maximum is 20 MB; page body maximum is 10 MB.

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
