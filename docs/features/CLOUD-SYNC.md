<a id="多设备云同步实验性"></a>

# Cross-device cloud sync (experimental)

**English** · [简体中文](CLOUD-SYNC.zh-CN.md)

Notdown can connect desktop and Android local vaults to the same cloud notebook using Supabase or [Nutstore / WebDAV](WEBDAV-SYNC.md). Edits save to local Markdown first. Notes remain usable offline and sync when connected while the app is open. Supabase requires your own project; WebDAV uses your own storage account. There is currently no built-in public Notdown cloud service.

<a id="supabase-配置"></a>

## Supabase setup

1. Run the [sync service migration](../../server/sync/supabase.sql) in the Supabase project SQL Editor. It creates private sync tables, account-checked RPCs and the private `notdown-sync` attachment bucket. It can be run repeatedly without resetting existing notes.
2. Create your user in project Authentication and enable email/password login. Clients use the project URL and **publishable key**; older projects can also use an `anon` key. Do not use a secret key or `service_role` key.
3. On desktop, open **Workspace settings → Cloud sync**; on Android, open **Notebook options → Cloud sync**. Enter the project URL, public key and user credentials, then sign in.
4. On the first device, choose **Create a new cloud notebook**. On other devices, use the same account and select that notebook. Existing local content joins the cloud notebook; differing versions with the same identity are retained as conflicts.

Android requires sync setup on first launch and can only select a cloud notebook already created on a computer. The editor opens after the first successful download. Mobile does not create independent vaults or restore a new vault from ZIP, but supports subsequent offline editing of the connected copy.

Production projects use HTTPS; HTTP is permitted only for loopback addresses. Vaults, change records and attachments are isolated between accounts. Clients cannot bypass sync RPCs to change revision tables.

This version has no end-to-end encryption: bodies and attachments can be read in the cloud. Supabase login passwords are not saved to disk; only session tokens are retained. WebDAV retains the application password for later requests. Credentials live in the device's `.notdown/sync/connection.json`. The entire `.notdown/sync/` directory is device state and must not be copied to other devices. App ZIP exports exclude it and imports ignore it. Add devices through the app's cloud connection or a ZIP backup import.

<a id="使用与范围"></a>

## Usage and scope

- While the app is open, sync runs after edits, reconnection, returning to the foreground and periodic checks. You can also click **Sync now**. Local save status and the latest sync time are shown separately.
- The Cloud sync panel continuously shows the phase, current resource, downloaded/uploaded counts, conflicts and elapsed time. Reading cloud records, applying resources and transferring attachment chunks each have phase-specific progress bars. An indeterminate bar appears until a total is known; a phase percentage does not represent the whole vault. Long waits identify the pending step. Failures retain progress and errors, and a new sync starts fresh counters.
- **Pause sync** pauses synchronization on this device; local saves continue. **Disconnect** keeps both local and cloud notes; resolve outstanding sync conflicts first.
- If the login session cannot refresh, use **Sign in again** with the same account. The notebook connection, pending uploads and conflicts are retained.
- Page bodies, properties, databases, data sources, views, contacts and `assets/` attachments sync. Original Markdown, BOMs, line endings and unknown metadata fields are preserved.
- `.history/`, interpreter paths, runtime settings and other unlisted files do not sync. Unknown files remain in local storage and ZIP backups. Sync does not replace an independent backup.

<a id="冲突"></a>

## Conflicts

Sync retains the shared baseline, local version and cloud version. Different pages sync independently. Concurrent edits to the same resource stop its upload and preserve both sides. Sync does not use last-write-wins or refresh revisions to force a retry.

Body conflicts reuse `.history/conflicts/`, history snapshots, diff display and the desktop **Conflicts and versions** merge entry. Cloud sync also provides a shared desktop/Android conflict interface: choose **Keep this device**, **Use cloud version**, or edit the merged body and complete properties. Saving checks the local revision; uploading checks the cloud revision again. The shared baseline and both original versions remain in history.

Delete/edit conflicts and conflicts involving contacts, attachments or database resources are also resolved in Cloud sync. Deleted versions are explicitly marked deleted. Keeping the local version can restore it to the cloud. Permanent deletion propagates through tombstones; a long-offline device does not revive old content merely because a file is missing.

<a id="存储与恢复"></a>

## Storage and recovery

- [shared engine](../../src/sync/engine.ts) retrieves incremental changes using a cloud cursor and saves baselines per resource. JSON fingerprints use stable key sorting and tolerate JSONB key-order changes.
- Bodies remain in `pages/*.md` and shared page properties in `metadata.json`. Individual databases use `metadata:databaseFiles/<id>` to transfer the complete `databases/<id>.json`, including owned data sources, page membership and view references. There is no second synced copy of host pages or source/view definitions. Cross-database sources transfer references only; legacy formats keep their original resource items. All devices accessing a vault with individual database files must upgrade to the same supporting version.
- Writes use `createVault` locking, revision checks, recovery journals and atomic replacement. Concurrent structural edits in the same database file are treated as one resource and do not merge automatically; different databases still sync independently.
- Downloaded resources are compared and written in bounded batches. A batch shares a page scan, recovery records and one `metadata.json` update; Android uses one native call for files that support batch replacement. Scan results are reused only under the current write lock, and each resource still checks its original revision. Concurrent changes remain conflicts. After power loss or process exit, batch recovery records guide continuation without forcing external edits to be overwritten.
- Offline changes persist in canonical files. Before uploading, the complete operation and a unique operation ID are saved. If a request succeeds but its response is lost, replaying the same ID and content returns the original cloud result.
- The before/after contents of sync transactions are stored in `.history/sync/`. Recovery stops and preserves its materials if it encounters third-party external edits.
- Attachments transfer in 1 MiB chunks, verified, deduplicated and reused by SHA-256, with a manifest published on completion. Interrupted transfers can reuse uploaded chunks. The transfer limit is 64 MiB per attachment; application upload entry points retain their existing size limits.
- In one database transaction, the cloud checks revisions, updates resources and records changes and idempotent results. Row locks serialize writes within each notebook so a cursor cannot skip concurrent writes that have not committed.

<a id="当前限制"></a>

## Current limitations

- Multi-device sync is for personal accounts. There is no multi-user sharing, real-time collaboration or automatic three-way merge.
- Android uses a foreground TypeScript engine. Network activity is not guaranteed after the app closes or the system reclaims it; sync resumes on the next launch. WorkManager background transfers are not integrated.
- There is no end-to-end encryption, remote history recovery interface, remote garbage collection or provider migration wizard. Change history, tombstones and attachments are not currently cleaned up automatically.
- Local scans detect external edits, and the first sync transfers all resources. Changes save recovery records in bounded batches, while files are still replaced individually; an intermediate state does not mean the entire vault has synced. Path collisions or case-only renames stop sync and request resolution.
- Automation uses isolated Chrome, IndexedDB, temporary disk vaults and PostgreSQL/WASM. Hosted Supabase networking, real accounts, Android WebView and physical-device background behavior still require acceptance after deployment.

<a id="验证"></a>

## Validation

```powershell
npm ci
node --import tsx --test tests/unit/sync.test.ts tests/unit/sync-cloud.test.ts
npm run test:sync
```

`test:sync` builds isolated desktop and mobile frontends and uses a temporary test cloud to verify login, Android downloads, offline editing, conflicts, merge uploads and reloads. The test cloud executes the actual migration SQL; only Auth and attachment HTTP transport use test adapters. It is not a production server. Logs go in `.run/logs/`, and screenshots and traces in `test-results/sync/`.
