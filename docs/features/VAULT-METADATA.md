<a id="vault-级元数据"></a>

# Vault metadata

**English** · [简体中文](VAULT-METADATA.zh-CN.md)

2026-09-24: This contract replaces the earlier storage rule of "apply YAML + hidden header per page".

`pages/*.md`Save the complete Markdown; API `body`, source code mode and source file endpoint corresponding to the same content. New and normal attribute saves do not generate application YAML. Old application headers are moved into unified JSON using the explicit migration process below; the document's own YAML/Pandoc title block are retained as override values. Contact `people/*.yaml` is not affected by this page storage adjustment.

The database is an independent resource and is saved one by one as `databases/<database-id>.json`, which contains its own data sources, member pages ID and views; ordinary databases do not have empty Markdown hosts. Wiki's `homePageId` Points to the real Markdown . The display information and member relationships of the database are managed by the associated files. The host/member field of page API is a compatible projection, and the common page attributes are still there. `metadata.json`. The old database format remains readable and migration must be performed explicitly; see the structure and commands[Individual database files](DATABASES.md#individual-database-files). The backup needs to contain the entire vault.

<a id="迁移旧应用-yaml"></a>

## Migrating legacy application YAML

```powershell
node --import tsx scripts/migrate-vault-metadata.ts ./vault
node --import tsx scripts/migrate-vault-metadata.ts ./vault --apply
```

The first one is only previewed, the second one is executed. The migration is completed through `createVault`, local process lock and page-by-page `baseRevision` verification: identify the old application header containing stable `id`, `title`, `parent`, `icon`, `properties` and `updated` or `bodyFormat`, move all its fields (including unknown fields) into the same `metadata.json`, and then delete only the first application header. The earliest files without `bodyFormat` are also supported. The body after the header is preserved byte-for-byte, including the document's own YAML / Pandoc header block.

Original Markdown (including YAML comments), original JSON and migration list are all backed up to `.history/migrations/yaml-to-json-<uuid>/` before any page is rewritten. Old header fields with the same name take precedence over previous JSON defaults, other fields in JSON are retained. The migration mark prevents YAML in the body from being deleted during repeated executions. After planning, page version changes will be aborted and retry will not be forced; two file transaction records support safe recovery, and unfinished batches can be re-planned for the remaining pages.

<a id="页面-uuid-迁移"></a>

## Page UUID migration

Page identities unified into standardsUUID。Create new/copy for useUUIDv4，Notion Used with folder importUUIDv5，Stably derived names contain batches and entries, so retries of the same snapshot remain idempotent and will not be overwritten by different replicas. Ordinary externalMarkdown Also derived when there is no explicit identityUUID；Alreadymetadata orYAML old inID Remain readable until explicitly migrated.

```powershell
node --import tsx scripts/migrate-page-ids.ts ./vault
node --import tsx scripts/migrate-page-ids.ts ./vault --apply
```

The entire library page is previewed `baseRevision`File name and metadata / Import list/ Conflicts record fingerprint; pre-application and post-backup checks, changes are stopped and no re-testing is required. `createVault` The following pages are linked to the following:JSON Identity and fatherhood, lyricsYAML ofid/parent、IdentifiableMarkdown／Wiki／List of page tags referenced and imported. Only source snippets that replace the reference target; code, unknown grammar in the tag, unknownmetadata The fields and unaltered text remain the same.metadata，Not fromUUID The source of the inference.

`.history/migrations/page-ids-<uuid>/manifest.json`Save the complete context and old/new ID mappings of all touched files. The original historical directory and original API archive will not be overwritten; they can be retrieved through mapping. `.history/page-id-migration.json` is a break recovery log, the next time the service reads it it only continues if each file still exactly matches the pre-migration or post-migration content, otherwise it retains the disk version and backup and stops. The old address is read through `pageIdMigration.previousIds` compatibility, and the returned page ID is always the migrated UUID; the old window submission still performs version verification, and the expired draft is retained as a conflict copy, and the new page is not overwritten. Copied pages will not inherit the old address alias.

Optional boolean field `fullWidth` of the page holds the width preference for normal pages, which defaults to narrow; it is not a database property. Width modification is also verified by `createVault` and `baseRevision` and does not rewrite the text. The Boolean value of the same name in the document YAML takes precedence over the default value of JSON. The default full width of Wiki Home is determined by the container layout, and conversion to Undo does not change the width preference of the original page.

<a id="json-结构"></a>

## JSON structure

Each vault uses one `metadata.json`：

```json
{
  "version": 1,
  "pages": {
    "550e8400-e29b-41d4-a716-446655440000": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "file": "550e8400-e29b-41d4-a716-446655440000.md",
      "title": "示例页面",
      "parent": null,
      "icon": "📄",
      "bodyFormat": "markdown",
      "properties": { "status": "草稿" }
    }
  }
}
```

`syntax`, collection, recycle bin, sorting and update time are also saved in the corresponding records. Unknown top-level and page fields are reserved. Application Maintenance `sourceHash` assists in identifying unique external file renames whose content has not changed; at the same time, the rename and text cannot reliably match the old identity. If JSON is lost, only the attributes saved in it cannot be recovered, so backups and copies of the vault should include both JSON and Markdown.

The top-level `externalEntities` registry stores Notion names, URLs, available user data, import batches and explicit local bindings by provider, kind and original ID. Reference locations and availability are derived from current Markdown/properties and local objects. Later imports change resolution without rewriting old note bodies. `createVault.externalEntities` owns registry writes and uses CAS, preserving unknown fields and conflict proposals. See [External references](NOTION-IMPORT.md#external-references-and-users) and the [API](../reference/API.md#external-entity-library).

New uploaded attachments using top layer `assets` Map of the registry: key is stable `assets/…` Relative path, value containing the original file name `name`、`contentType`The number of bytes `size` and registration time `addedAt`The file bytes are still preserved `assets/`Reference relationships are calculated from the page's original and valid properties, not written in the second original. Browsing already has attachments does not migrate or supplement registration information; no original file names recorded cannot infer recovery. Uploading only adds attachment records, without changing the existing pages revision . Share JSON using the original value check to write; while modifying the resulting failures, new files and proposed metadata retain the original attachment path and `.history/asset-conflicts/`The system does not cover external modifications, does not automatically require retesting.[Attachment library](MEDIA-AND-EMBEDS.md#attachment-library)。

<a id="覆盖规则"></a>

## Override rules

The reading order is file name/application default value → JSON page record → beginning of text YAML or Pandoc title block. YAML supports the beginning of `---` and the end of `---` or `...`; Pandoc supports title, author, date and indented continuation lines. The calculation is covered in the storage layer and does not rely on the rendering dialect switch; the dialect still determines how the text is interpreted. Metadata within code fences will not be read, and MMD coverage rules will not be added.

The known page fields in YAML cover the corresponding JSON fields;`properties` Priority to attribute key merger, attribute of the same document, undeclaredJSON The attribute is still valid.YAML Other fields andPandoc of`author` / `date` Access to the valid page property. Retrieved after removing the coverage from the documentJSON Default; save the full page draft does not overwrite the unmodified document cover asJSON The default value.JSON Stable pages managedID It is not in the correct language.`id` Changes; YAML ID read compatibility when old files are not registered.

Write JSON in the page property interface. Fields covered by the document are still subject to the document, and the corresponding fields in Metadata details or source code should be edited. Recognized YAML / Pandoc titles can also be edited via the page title. After the old application header is migrated, fields such as parent, collection, and recycle bin are managed by JSON; fields explicitly declared by the document itself still take precedence.

Ordinary external Markdown no longer needs to be applied to YAML : unregistered files use filename headers and stable derivation of ID , and register JSON after actual editing. Import the folder and write the application attributes to JSON, retaining the original metadata; the link will still be relocated according to the original parsing rules, and the original file will continue to be archived.

<a id="版本冲突与恢复"></a>

## Revisions, conflicts and recovery

The `baseRevision` of the page contains both the complete Markdown and the valid JSON metadata of the page. The order of the JSON object keys does not affect the version; modifying other pages will not invalidate the version of this page. Changes to the data source will affect the member page version. Historical snapshots save `.md` and `.json` in pairs, and conflicts also retain their respective texts and attributes. Database JSON is saved through independent resource version and file original value verification. Expired versions do not force retries.

<a id="自动历史与版本恢复"></a>

### Automatic history and version recovery

Autosave continues to write the text and JSON in time; history no longer accumulates one by one. The default automatic snapshot interval for each page is 5 minute, and a final checkpoint will be added after 120 seconds of stopping editing on the page; continuing to write on other pages will not delay its checkpoint. The final state of the last session will also be retained until the first edit after reopening. Only actual content or attribute changes generate history; differences only in `updated` do not count as new historical content. Ordinary pages that have no substantial changes are saved and retain the original revision and update time, and version conflicts are still checked before deduplication.

Newly generated automatic snapshots retain 30 days by default, a maximum of 100 per page, and at least the latest recovery point. Indexes in `.history/checkpoints/<page-id>.json`; cleanup is performed when a new checkpoint is generated, and only automatic snapshots in the index that were generated by the application and whose bytes still match are processed. Old history, unknown files, recovery copies of external changes, and protected versions are retained. Checkpoints required for conflict, migration, delete, and restore operations are not subject to normal automatic history cleanup. The historical settings are located in `.notdown/history.json` of this library, using independent revision verification, and unknown fields are retained.

The page menu of the desktop/browser **Page history** lists local snapshots and available Git versions. You can preview the complete Markdown, attributes and text differences, and then use **Restore this version** to restore. Restoring past `createVault` requires `baseRevision` of the current page; external modifications during preview will reject the restore and keep the proposal. Protect the current version before recovery, only update the text and attributes of the target page, and do not roll back other pages or the entire `metadata.json`. Database records are verified against the current schema and maintain the current collection identity; invalid structures such as the old parent page not existing will prevent recovery. The history of the original page ID before migration continues to be read through the existing alias.

<a id="可选本地-git-历史"></a>

### Optional local Git history

in **Settings - History** Activated **Local Git history**Node / Windows Desktop environment requires running Git; Android does not rely on Git to continue using shared automatic snapshots. Git functions are default-shutdown. First enable the current text baseline to record, then stop editing and shut down the normal service generating checkpoints at the set interval. A manual checkpoint can also be named. Git has historically been exempt from the 30 days/100 limitations for automatic snapshots.

Each vault uses `.notdown/git-history.git/` independently and has nothing to do with the Notdown source code warehouse. It does not configure the remote end and does not execute pull or push. Submissions are independently recoverable text projections: `pages/<page-id>.md` , `page-metadata/<page-id>.json` , `vault-metadata.json` (additional top-level metadata), and `people/*.yaml` . Page attributes are recorded separately by page, and the text content is still the `pages/*.md` of the vault and will not be moved to the Git object library or cache.

Attachment bytes, service configuration, sync credentials, temporary transactions, and existing `.history/` do not enter Git commits; Git history is not a full vault backup. A full backup still needs to contain attachments, metadata and required history. ZIP export preserves the Git object library but excludes running lock files. If the Git operation fails, an error will be displayed and the saved notes will be retained; you can disable Git and continue editing. When the Git configuration, directory and tags managed by the application are modified, the Git operation is stopped and the original files are retained; the warehouse hooks is not executed or the user's Git configuration is not read. Forcing a process to end does not guarantee that the last checkpoint has been completed and that the body-saved transaction protection continues to work independently.

The service reads and writes of the same vault are serialized and the service is coordinated with MCP using a local process lock. Write the `.history/pending-<id>.json` recovery record before saving the two files, and use atomic replacement for the single file. After an interruption, the save is only completed when the text and JSON still accurately match the old or new value of the transaction; if there are third-party changes, the disk version and recovery record are stopped and retained for manual merging without forcing overwriting. Any external editor does not respect application locks; this is not a cross-end synchronization or distributed transaction guarantee.
