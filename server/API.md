# Markdown vault API

The backend listens on `127.0.0.1:4318` by default. Set `PORT` and `VAULT_PATH` to change the port and vault location. Requests from browsers are limited to the configured local origins; `ALLOWED_ORIGINS` accepts a comma-separated list. Write requests require JSON. This local service is not an authenticated public sync server.

`createApp({ vaultPath, frontendDir?, allowedOrigins? })` returns an Express app. `createVault(vaultPath)` exposes the storage API. A built `dist/index.html` is served automatically when the entry point is started from the project root. The frontend development server should proxy `/api` and `/assets` to port 4318.

On the first launch only, when `VAULT_PATH` is unset and the default `vault` directory does not exist, the entry point creates five Chinese example pages. Existing default vaults, including empty ones, and all explicitly selected vault paths are left unseeded. Internal initialization can call `vault.create(input, {id})` for stable sample IDs; REST clients cannot supply IDs, and existing IDs or filenames are never replaced by creation.

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
};
```

Page files are UTF-8 Markdown in `vault/pages/<uuid>.md`. The YAML fields are `id`, `title`, `parent`, `icon`, `properties`, and `updated`. Other YAML fields and comments survive metadata updates. A metadata-only update preserves body bytes as decoded UTF-8, including CRLF and trailing blank lines. Unknown body syntax is left untouched. Files are re-read on every call, so edits made by an external editor become visible. Invalid YAML and duplicate page IDs produce 422 and block mutations instead of overwriting ambiguous data. Symlink pages are ignored.

## Routes

| Request                           | Body                                                    | Response                                                     |
| --------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------ |
| `GET /api/status`                 | —                                                       | `{status, vaultPath, storage:'markdown', sync:'local-only'}` |
| `GET /api/pages`                  | —                                                       | `Page[]`                                                     |
| `GET /api/pages/:id`              | —                                                       | `Page`                                                       |
| `POST /api/pages`                 | `{title?,parent?,icon?,properties?,body?}`              | 201 `Page`                                                   |
| `PUT /api/pages/:id`              | `{baseRevision,title?,parent?,icon?,properties?,body?}` | `Page`                                                       |
| `GET /api/conflicts`              | —                                                       | `Conflict[]`                                                 |
| `POST /api/conflicts/:id/resolve` | `{baseRevision,title?,parent?,icon?,properties?,body?}` | `Page`                                                       |
| `POST /api/assets`                | `{name,contentType,data}` (`data` is standard base64)   | 201 `{path,name,contentType}`                                |

`title` defaults to 未命名页面, `icon` to 📄, `parent` to null, and `body` to an empty string on creation. Properties are replaced when provided; omitted properties remain intact. Passing null as a parent makes the page a root page. Parent references must exist and cannot create cycles. IDs are immutable.

## Conflicts and history

Every update requires the revision returned by the read that the edit was based on. A mismatched revision returns HTTP 409:

```json
{ "error": "…", "conflictId": "uuid", "current": {}, "proposed": {} }
```

`current` and `proposed` are complete Page objects. The proposed source is saved as readable Markdown in `.history/conflicts/<conflictId>.md`, with a JSON sidecar recording its origin. The current page stays untouched. `GET /api/conflicts` returns `{id,conflictId,pageId,createdAt,baseRevision,currentRevision,current,proposed}`. The `current` object reflects the latest source, while `currentRevision` records the revision when the fork was created.

Resolve by explicitly posting a newly read `baseRevision` and the intended merged fields. Omitted fields default to the proposed page. A successful resolution archives both conflict files under `.history/conflicts/resolved`. A stale resolution creates another conflict and keeps the original unresolved. Historical page sources are preserved under `.history/<pageId>/<revision>.md`.

Writes use same-directory temporary files, file flush, rename, and an in-process mutation queue. The service compares the source again immediately before replacement. This is optimistic concurrency for one backend process, not a cross-device sync implementation or a filesystem lock against arbitrary external writers: an external program can still write in the narrow interval between the last check and rename. Run only one backend process per vault.

## Attachments and errors

Attachment names on disk are generated UUIDs. MIME types determine safe extensions; unrecognized types become `.bin`. HTML and SVG uploads cannot create browser-active `.html` or `.svg` paths. Files other than supported image/audio/video formats are served with attachment disposition and `nosniff`. The upload maximum is 20 MB; page body maximum is 10 MB. Returned paths such as `assets/<uuid>.png` can be used in Markdown as `![caption](assets/<uuid>.png)`.

Errors are JSON `{error:string,...details}` with 400 for invalid input, 403 for disallowed host/origin, 404 for absent resources, 409 for revision conflicts, 413 for oversized input, 415 for non-JSON writes, and 422 for ambiguous or malformed stored data.
