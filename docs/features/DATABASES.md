<a id="本地数据库与-notion-数据库导入"></a>

# Local databases and Notion database import

**English** · [简体中文](DATABASES.zh-CN.md)

Databases organize ordinary Markdown pages: every record has its own `pages/<page-id>.md`. Table cells and the property editor above the page share the same page properties. Desktop and mobile share database views and resource storage; cross-device use requires experimental [foreground cloud sync](CLOUD-SYNC.md). Notion API import creates local copies and does not write back to Notion.

<a id="创建与编辑"></a>

## Creating and editing

If the front end has been updated and the old running back end does not have a database interface, ordinary pages can still be opened and saved; the sidebar and database entrance prompts to restart the back end. After updating the service, you can use **Check connection** to recheck. This compatibility is only for 404 of the database list interface; metadata corruption, permissions, and other service errors will still be reported.

1. sidebar **New database**, or in **Databases** Select from list **New database**, create the root database immediately, with the default name **New database**, there is no confirmation pop-up window. Application creates database JSON, own data source,**Name** fields and **Table** view; then click directly on the database title to modify the name, press Enter or leave the input box to save.
2. Header **Add property** or **Add a property** of the record panel add text, number, check, date, single choice, multi-select, status, URL, email or phone fields. The options of the new field can be filled in line by line; click on the existing header to open the attribute floating layer, and use **Edit property** to rename, color, drag or sort items one by one using the up and down buttons. You can also add or delete unused options. Option identity remains stable. The records panel displays fields by attribute name, and the table retains view column order.
3. Blue **New** or the new row entry at the bottom of the table creates a record. The open button next to the title expands the record panel on the right by default, and the table remains on the left; the title, attributes, and text can be edited in the panel. **Open as full page** Then enter the normal page, and continue to use the existing Page / Source / Split view for the text.
4. The database is automatically saved like the page, and changes are collected after a pause in continuous input, when leaving the cell or pressing Enter. Save the pending input before switching pages or databases; keep the draft and prevent switching when saving fails, only provide **Retry save** and **Discard draft and reload** at the error point, and no longer retain a separate database save menu.
5. The top tab switches the view, **New view** opens the layout selection panel, you can create Table, Board, Gallery, List or Calendar, and then select the name and data source. **Filter**, **Sort** and **View settings** provide filtering, sorting, view name and display column settings; the search icon expands the current table search. Hiding columns and filtering records does not delete properties or pages, and the title column is always retained. The current tab remembers the last selected view for each vault and database, and restores the selection when it is reopened or the browser returns.

The numeric `0` and the boolean `false` retain their types. Date save start, optional end and existing time zone information. Radio, status and multi-select saving options ID, display names in colored labels and edit via options panel. Imported values ​​such as associations, contacts, and files are displayed as read-only; resolvable associations can open the local page imported in this batch.

Click the icon to the left of the full database title to use the same Emoji/Lucide selector as on the normal page, you can search, enter custom symbols or select **Remove**。The modified synchronized updates of the page tree and the block entries to the database;Remove Save the empty icon value and display the default document icon that matches the normal page. There are currently no images uploading icon inputs. Database titles and icons are written to belong.JSON，Not to be confusedMarkdown；Old host page orWiki Home The documentationYAML／Pandoc The control value must still be modified in the source document.

The subdatabases, Child page and Link to page in the main text use the same single-line entry style, 16 px icon and underlined name, and separate cards are no longer given to the subdatabases. They still maintain the original reference type and navigation target respectively, and adjusting the display will not change the reference source code or parent relationship.

The record sidebar reuses the existing text editor without saving a new copy of the text. Save the pending text and attributes before closing the sidebar, opening the full page, or jumping; if a conflict occurs, keep the draft and prevent the jump, but you must still handle the conflict explicitly. You can explicitly select **Discard draft and reload** to abandon the draft of this tab and read the latest content. The conflicting archives will still be retained. The wide-screen table sits side by side with the record, the narrow-screen record panel overlays it from the right, and the wide table scrolls horizontally in its own area.

YAML / Pandoc overrides still take precedence over JSON: table and page property areas show valid values and mark document-controlled properties as read-only. Modifying the overlay value through source code or Metadata details will not cause the JSON default value to be modified but falsely reported that the effective value has changed.

## Wiki

Wiki is a database container, in **Databases** shown in the list as **Wiki · Home and page views**. list **New wiki** Create root layer Wiki; text `/` Menu search **wiki**, select **Wiki**, Wiki will be created under the current page and the page entry will be inserted. Wiki is also available in the phone's Insert Block menu and database list.

The upper right corner of the normal page/sidebar page menu provides **Turn into wiki**. The conversion inherits the page ID, Markdown files, text, icons and parent positions; the original text becomes Home. Wiki has only one page data source, initially **All pages** Use List layout; Home uses the text editor, and the collection view can add Table, List, Gallery, Board and Calendar. Home does not display database filtering/grouping tools; the collection view does not provide new/accessed data sources, switching sources and displaying data source titles. Ordinary databases and database records do not provide page conversion to Wiki.

Directly and nested subpages are added to the page collection according to the original parent relationship; the subdatabase and its records remain independent and will not be flattened or treated as Wiki page records. Creating new subpages and moving pages/subtrees in and out of Wiki will update membership relationships; page properties and collection views share the original page data. Ordinary databases can link to the page source of Wiki; when there are external references, Undo will prevent the removal of the shared source and retain the existing database and references.

Wiki Home adopts the **Full width** layout by default. The title, navigation and text share the available content width; Home and the collection view share the cover, horizontal icon/title, breadcrumbs, content margins and capsule drop-down view entrance; only the content area and the right tools are changed when switching. Wiki Home does not provide a separate width switch. After Undo, the original width setting of the ordinary page is restored.

Open Wiki and enter by default **Home**。The menu is drawn in the view under the titleHome The same as in the view of the set, listHome、All have a vision andNew view，The current view is marked;New view inHome This means that you can create a collection view, which collects the original input before submitting, and retains it when deleted.Home。Home Right sideSearch SearchingWiki Page; collection view shows the selection, sorting, view settings andNew The tools.Home The source/split pattern and page attributes of the source/split pattern are opened from the top-right corner page menu. Independence retained when importedHome Subpages continue to carry the original text, with the outer layer showingWiki The container's cover, icon and title; the container's name and icon can be edited in the collection view, without merging or rewriting the atomic page.Wiki Home The menu of the page provided**Undo wiki**: Unlock the container, data source and view, restore Home to a normal page, and retain the text, page identity, subpage/subdatabase location and existing attribute values of each page. Field definition, view and conversion before and after metadata archive to `.history/database-transactions/`, there is currently no interface for automatically re-applying archives. The original link still points to the same page, and the text will not be rewritten in batches.

Notion imports Wiki using the same single data source boundary. Early import recovery out of independent **Home** The sub-page will continue to be retained, and will remain in its original position after Undo, without merging, deleting or overwriting the original page text. If the independent Home has been deleted or moved to the recycle bin, the independent file format Wiki will enter the effective collection view, and no empty Markdown stand-in will be created, nor will the deleted content be restored; the old format can still use the original real host page. After moving the currently open Wiki/database to the Recycle Bin, you can resume from Trash by leaving the collection view and updating the sidebar. If the source of the old Wiki has been shared by other databases, Undo will prompt and stop, preserving the existing resources. Notion's current user Owner filtering, Verification validation and notifications are not yet emulated locally.

pending is collected for editing before conversion; the page/database version is verified within the vault lock during conversion and Undo, and conflicts are archived on both sides without forcing retries. The conversion updates the database JSON and page metadata; existing page Markdown is not reserialized as a result of the conversion. The independent Home import Wiki restores a normal container page in Undo, and its original Home subpage retains the original text and location.

Behavior Reference [ Notion Wiki Official Description ](https://www.notion.com/help/wikis-and-verified-pages): Notion provides page conversion to Wiki and Undo Wiki. The defaults are Home, All pages, and Pages I own; the official has not clearly stated the complete destination of custom attributes and view configuration after Undo. The above retention/archiving rules are an explicit contract of Notdown, and the local does not forge the corresponding Pages I own of the account.

database from applicationTrash After deleting again, the databaseJSON、Wiki of realityHome and the selected subpages enter the system recycle bin, and the recovery materials are retained in the history. A deleted container no longer generates sidebar entries or appears in database and data source lists; data source views that reference it remainLink，And it shows that the source is unavailable and its records are not taken over. The host page metadata retained by the old format is only used for recovery, and the missing host will not be mistaken for a database that has never had a host.

<a id="数据源管理"></a>

## Data source management

The complete database and text-embedded database use **View settings → Manage data sources**, and can also be opened from **Source → Manage data sources**. Source management replaces the current content in the settings panel on the right, **Back** returns to the previous level, **Close** closes the entire group of panels. A database can contain multiple data sources, one of which is selected for each view.

The panel lists the sources owned by this database in **Source** and the sources of external access in **Linked**. Each source has one line, showing the name, the number of views currently in the database, and the **···** details entry. Details retain the original database, other databases using it, and their respective views; view links open the exact database and views. Hover the source name to see ownership and view names.

View the data source of the full vault: sidebar **Databases → Data sources**. Each data source in the list only occupies one row, and the name, original database and usage location/view are displayed in columns. You can search by data source, database or view name. **Browse all data sources** of the current database menu can also view the same list. The list is a read-only relational projection, no records are copied or metadata is written back, and the database in the recycle bin does not appear as an actively used location.

When the complete database contains multiple data sources, they are arranged by default as **database title → current data source title → view label**; when switching views, the second-level title changes with its data source. The complete page of a single data source only displays the database title by default; the embedded database only displays the title of the current data source by default. **Layout → Show data source titles** overrides the default display of data source titles, explicit selections are saved. The view label's hover tip shows the data source it belongs to.

The current data source title displayed in the complete database and embedded database can be directly clicked to edit and is no longer used as a drop-down menu entry. Automatically save after input, Enter or leave the input box to save immediately; Escape abandon the name that has not been submitted. The modification only updates the data source name, while the database container name, view name and text reference remain the original values; renaming the Linked location will also update the same source. The title is read-only when the source is unavailable. If saving fails or version conflicts, the name draft will be retained. Explicit retries will still use the original version, and modifications in other windows will not be automatically overwritten. Data source management is entered from **View settings → Manage data sources**.

Semantic reference for source grouping and shared data, independent views [ Notion Data source management instructions ](https://www.notion.com/help/data-sources-and-linked-databases); database/data source header hierarchy reference user-provided Notion interface.

- **Source → Add data source** Create an independent collection of fields and records in the current database, and add a Table view with the same name; no new database host page will be created. Click **Create data source** Resources will not be created until saved, returning to the upper level or closing the panel.
- **Link existing data source** Data sources in this vault can be searched by the name of the data source or the database to which they belong. Add a local Table view after access; fields and records continue to be shared, and edits will take effect in other databases that reference the same data source. Filtering, sorting, and layout of views are saved independently.
- Access will not copy Markdown, move records, or change the owner of the data source; records newly created from the access location will still be returned to the original database host page. Connected sources will not reappear in the candidate list, and the source database in the recycle bin will not be listed as accessible objects.
- **Source / Linked** List the current sources and their affiliations. Click the source name to switch to its view. New/Insert will save the current cell draft before checking the database version; Insert also checks the version of the selected source. Conflicts preserve input and display reasons, and do not automatically overwrite changes in other windows.

The source is OK **···** Open an independent small menu and provide **Copy data source ID**、**Move to**、**Move to Trash**, you can also view source relationships. Own common data sources can be moved to other common databases: the source and page ID remain unchanged, the record root page is changed to the target database, and existing views continue to reference the same source; the view in the original database becomes Linked. Verify the versions of the source, original and target databases before moving, reject circular ownership and record parent positions controlled by document metadata. Linked entries cannot replace the original database to move or delete sources; Wiki page sources continue to follow Wiki conversion boundaries.

Database deletion inherits Trash of the page. The data source **Move to Trash** is also reversibly deleted: fields, view references and Markdown remain in their original positions, the source and its pages are temporarily hidden, and external references show the source in Trash; they are available again after restoration. The sidebar **Trash** lists the recovered data sources and the number of pages, **Restore** restores the entire source; **Trashed data sources** of the management panel also provides a recovery entrance. Sources entering Trash alone will not be automatically restored by restoring their databases.

**Trash → Empty Trash** Also cleans up recycled data sources and their records and subpages, retaining active databases and other sources. Deletion of the source definition has historical recovery material, and the external Linked view retains the reference and shows the source as unavailable. Clean up the verification source, the associated database and all recorded versions; it will stop when it encounters a conflict or system recycling failure, and will not automatically overwrite or retry.

For data source management regression, see `tests/unit/database-sources.test.ts`, `tests/unit/database-source-lifecycle.test.ts` and corresponding browser use cases, covering ownership, version conflicts, original text retention, recycling and recovery.

<a id="多种布局"></a>

## Layouts

**+ New view** Provides an icon grid similar to Notion, switching labels does not copy records. Table preserves cell editing; List is a compact record list ([Layout and attribute display](DATABASE-LIST.md)); Gallery uses the card grid; Board groups by the Select, Status or Checkbox attribute; Calendar displays the month or week by the date attribute.

Set the name, layout and data source of the new view in the same floating layer. Click **Done** to create; click outside or press Escape to cancel creation. **View settings** of the existing view uses the right panel, the sub-settings are switched in the same position, and the property options continue to use the cascading menu anchored to the portal. Click **Done** or outside the menu to save changes. When saving fails, the input will be retained and the reason will be displayed. You can also explicitly select **Discard menu changes** to abandon this menu draft; changes in other windows will not be forced to be overwritten with the latest version number.

Click the current view label or right-click any label to open **View options** below the label: **Rename**, **Display as**, **Edit view**, **Source**, **Copy link to view**, show/hide data source title, **Duplicate view** and **Delete view**. Right-clicking on other tabs will not switch the current view. Copying retains the original source, field selection, filtering, sorting, and layout, and only creates a new view.

When deleting the last view of a source in the current database, **Delete view only**, or **Delete view and data source** will be selected first. The former retains the source and all pages, allowing the database to temporarily have no views, and then use New view to restore the display; the latter moves its own ordinary sources and their pages into Trash. Linked/Wiki does not provide the option to delete the original source. Deletion simultaneously verifies the view and database versions, and deletion along with the source also verifies the source version; conflicts are retained and recovery records are not forced to be retried. There is no way to fix the views to the sidebar one by one. The sidebar still displays the view according to the existing Database children settings.

When there is insufficient space in the toolbar, the views that cannot fit are retracted into **n more ...**. The menu lists all views, the current selection and their respective operation entries. The view name can be searched and New view/New data source is provided. The search record is also expanded at the original position of the toolbar, and Escape is closed and cleared without occupying another line.

- **Layout** You can set the data source title, page icon, table vertical bar, all content line wrapping, and Side peek / Center peek / Full page opening method.**Load limit** Control the first batch to display 25, 50, 100 or all records,**Load more** Continue to display; do not change the number of underlying records.
- **Property visibility**、**Filter**、**Sort**、**Group** Open submenus respectively;**Copy link to view** Copy the specified view entry,**Source** Shows the data source used,**Edit properties** Open the field list. Existing views are not rebound across data sources.
- The header menu provides field renaming, empty field type change, filtering/sorting/grouping by this field, freezing the current column, hiding, single column line wrapping, and left and right insertion of fields. Fields containing record values ​​cannot be changed directly; date/group fields referenced by views cannot be changed to incompatible types. Freeze, hide, and wrap settings belong to the current view.
- Table, List, Gallery, Board share group settings. The new view inherits the current record order, and the display fields can then be independently filtered, sorted, and set.
- The grouping table repeatedly displays column headers and **New page** for each group. When adding records within the group, the grouping attributes will be filled in. The group header arrow collapses/expands and remains to the current view; **···** next to the header provides Edit groups, show record count, hide group and color settings. Option group color correction updates the option label simultaneously; empty/checked group colors are saved in the view. Hidden groups can be redisplayed in the **Group** submenu.
- The group menu **Move to Trash** The number of records within the scope of this screening will be shown and confirmed, and then transferred to the recoverable recycling station; the number of first-time uploads is not limited. Each entry is written in a single version of the page, and if the conflict is in the middle, the number is stopped and the number is clearly reported as completed, without the obligation to cover the remaining pages.

- The card title opens the existing record panel, where the original page text and properties can be edited. The phone continues to open the complete record page.
- **View settings → Layout** switch layout;**Property visibility** Controls the displayed fields. Gallery / Board optional card size, page cover, text preview and image adaptation. The text preview is currently a text summary, and the file attribute images and complete rich text preview have not yet been accessed.
- **Group by** Select the grouping field to hide empty groups, hide specified groups, and use the up and down buttons to arrange groups. Board Dragging across columns will save the corresponding attributes; manual sorting of cards in the same column is not yet provided. Values ​​controlled by YAML/Pandoc or read-only fields cannot be overridden by dragging.
- When creating a new Board / Calendar without selecting the corresponding field, the Status / Date attribute will be added. When the old view lacks fields, the setting entry is displayed and the data is not modified during reading.
- Calendar provides Today, forward and backward navigation, month/week switching, dateless list, and new records by date. All-day dates support dragging and maintaining the original range length; records with time/time zone are displayed according to their date part, and rescheduling is completed through record attributes. Time zone switching is not currently provided.
- Multiple filtering and sorting will be retained intact; **All conditions / Any condition** corresponds to AND / OR. The option condition saves the stable option ID, numbers are compared numerically, and dates are compared using the date part. Hiding the record will not delete the original page.
- All views inherit page and field version verification, draft recovery, and conflict archiving. Shared implementation for desktop and mobile phones; the touch terminal is reorganized/rescheduled by recording attributes, and native HTML drag is mainly used for mouse operations.

<a id="手机使用"></a>

## Mobile usage

Mobile phone **Pages → Databases** opens the database list, **New database** creates a new root-level database; the database in the page tree opens the complete form, which can be expanded to enter the record. At the bottom of the normal page, **Insert block → Database** select Inline/Full page, and create a new or link an existing data source. When the current dialect does not support database reference syntax, only Full page can be selected. Inline remains in the text, **Open as page** on the right opens the complete form, and the database block menu **Turn into page** in the parent page becomes the page entry.

Mobile tables support editing titles, fields, basic attribute values, adding new records, creating new views, filtering, sorting and searching; wide tables can slide horizontally in their own areas. Click the recorded **OPEN** to enter the complete page. After editing the properties and text, use **Back to database** to return; use the complete record page on mobile phones. Save pending input before switching pages, views, or entering the database, retaining the original draft and preventing navigation in the event of a conflict. After the computer is imported, the full-page and inline databases synchronized to the mobile phone via the cloud use the same entrance; the Notion import wizard is still used on the computer.

When a record is edited directly on a mobile phone, the page and field versions are saved in the recovery draft; reopening the draft will not automatically overwrite it with the new field version. Properties controlled by Formulas, Totals, Associations, Contacts, Files and Documents metadata continue to adhere to the read-only boundaries described below.

<a id="创建位置与页面树"></a>

## Creation locations and the page tree

The database can be located at the root level of the vault or as a child of an ordinary page. The sidebar uses the same page tree to display the database and records: click the database to open the table, and its records will be displayed by default after expansion; click the record to open the ordinary page. Records will not be displayed repeatedly as root pages at the same time. **Workspace settings → Appearance → Sidebar → Database children** can be changed to **Views**. After expansion, the saved view is displayed. Click to open the corresponding view; the record is still retained in the database. The directory tree is collapsed by default, and **Default expanded levels** (0 – 10 layers or all) can be set in the same place.

In the body, `/database`, `/inline` and `/link` all lead to the same **Database** entry. The creation panel accepts a name, Inline / Full page, and **New data source** or **Link existing data source**. Resources are created only on submission; cancelling does not write a database. Pending body input is saved first. Linking an existing source also checks its revision; failures preserve the creation draft.

Both displays create the same `databases/<id>.json` under the current page. After Full page is created, the database is opened, and the parent page saves the official `<database inline="false">` reference; dialects that do not support this syntax use ordinary Markdown links. Inline uses `<database inline="true">` to embed the same database workspace: compact editable title, view labels, tools and tables on the right, and **Open as page** on the right to open the complete page. The current view of the external source shows arrows and Link markers; the records still belong to the original source and no definitions or records are copied. The Linked-only database allows `dataSources: []`, only views that reference external sources, and later own sources can be added.

The editor has only one `block.database` node; inline/full page are the display attributes of the entrance, and the link relationship belongs to the data source reference of the view in JSON. **of the block handle or page entry ···→ Turn into inline database** expands the entry into an inline view; **Turn into page** of the inline block menu in the parent page collapses it into the page entry. Full databases no longer provide duplicate conversion menus, conversions are done on the target block of the parent page. The conversion first saves the text and cells to be processed, retains the database ID, sources, views and records, and does not rebuild JSON. When the root database does not have a parent page, it cannot be converted to inline; the reason will be explained when the parent page dialect is not supported, there is a version conflict, or there are multiple entries in the same database. Multiple entries need to be converted from the menu of the target block.

The top breadcrumbs of the database navigate according to the actual parent page level; the recorded breadcrumbs can return to the corresponding database, and the root level database is still available. **All databases** returns the list. The title and icon are written to the corresponding JSON; the explicit display text that has been quoted continues to retain the original text.

The newly created database has an independent JSON and does not create a blank Markdown. The database and the pages share access to the sidebar, which keeps the database files in name and parent location; the new records are `parent` References to the database ID to which the data source belongs. API provides a compatibility entry with ID for existing navigation and is used to `databaseProxy: true` Signed NoMarkdown The normal page creation/mobility cannot be bypassed by the data source registration directly into the database, nor can the database records be converted to other parent levels through the normal page mobile interface.

The host page follows the page movement and recycling bin rules; when the host page is recycled, its records are hidden along with the hierarchy, and are redisplayed after restoration. Sidebar movement entries and dragging of records are disabled; the database host page does not provide a normal page copy entry that would produce an incomplete copy of the resource.

The old format database continues to use the original host page or virtual entry, and reading and expanding will not rewrite the disk. New records in the old database that did not have a host page in the early days still retain the original `parent: null`, and are displayed according to the data source ownership in the tree; only explicit migration will switch to independent JSON. Newly imported databases directly use independent files.

The embedded database only shows the current data source title, the container name continues to belong to the full database. The main text and toolbar maintain the original width of the page; when the table column overflows the main text width, only the data area expands to the available page width and scrolls horizontally internally, without modifying the page Full width setting. Databases within columns remain scrollable within the column.

View capsules, toolbars, option cells, and cards for embedded databases use the database's own control styles; the button default styles for universal content blocks do not override them. Both development services and production builds are returned through independent temporary vaults. For testing, see `tests/e2e/database-inline-styles.spec.ts`.

<a id="独立数据库文件"></a>

## Individual database files

Database storage upgraded to `databases/<database-id>.json`, Database and Markdown Page are resources of the same level. File save database display information, own data sources (fields and `pageIds`) and view; view's `dataSource` Specify at the same time `databaseId` with `dataSourceId`, Link is displayed when cross-library, only the owning library is referenced, and definitions or pages are not copied. Ordinary databases do not create empty Markdown; Wiki `homePageId` Points to the actual text page. Page properties are still saved in `metadata.json`, the database host/member field of page API is a compatible projection.

The old database format remains readable; resources in the old format received synchronously also retain their host page and resource format, and are not implicitly migrated due to the download order. The migration must be performed explicitly and verify the preview version, retaining ID, unknown fields, and recovery records. The migrated old definition exits active reading and deleting JSON will not rebuild the database from the old definition. Joint writes to members, pages, and database files still require vault locks, CAS, and recoverable transactions.

```json
{
  "version": 1,
  "id": "projects",
  "kind": "database",
  "title": "Projects",
  "parent": null,
  "dataSources": [
    { "id": "tasks", "title": "Tasks", "properties": [{ "id": "name", "key": "title", "name": "Name", "type": "title" }], "pageIds": [] }
  ],
  "views": [
    { "id": "table", "name": "Table", "type": "table", "dataSource": { "databaseId": "projects", "dataSourceId": "tasks" } },
    { "id": "linked", "name": "External", "type": "list", "dataSource": { "databaseId": "another-database", "dataSourceId": "external-source" } }
  ]
}
```

Example omits real UUID . Own sources are only defined in the owning library; external sources only appear as view references.`pageIds` is the only enduring truth about membership, page API `dataSourceId`／`wikiMember` It is projected when reading, not `metadata.json` Cache another relationship.`revision`、`linked`、`ownedDataSourceIds` The API field is not written back to the file. Import host source information and unknown fields remain optional `pageMetadata`;Migrate and keep intact `legacyPageMetadata`. The unknown attributes of ordinary pages are still recorded in the original JSON page.

```powershell
node --import tsx scripts/migrate-database-files.ts <vault-path>
node --import tsx scripts/migrate-database-files.ts <vault-path> --apply
```

The first preview, the second preview version, and the HTTP provide the same two-step interface. `.history/database-migration-<uuid>.json`The original host was removed after being archived. `pages/`。The common host of the database, which is not empty, is different.ID The old host, discrete/missing source ownership and version changes will be suspended and the original file will be retained, with a clear mapping required, and cannot be relied upon forcing retrieval coverage. The old knowledge base will not automatically migrate when opened.

<a id="旧格式存储契约"></a>

## Legacy storage contract

`metadata.json`The following top-level records are added in addition to the existing `pages`, and the unknown top-level and object fields continue to be retained:

| area | Content |
| --- | --- |
| `pages[pageId]` | `dataSourceId`Specify the data source to which the record belongs, `properties` saves the attribute value; the database host page contains `databaseId`, and `parent` saves the page tree position. |
| `dataSources[sourceId]` | Data source name, field definitions and revision; `ownerDatabaseId` of the new data source specifies its database host. Each field has stable `id`, property key `key`, display name `name` and `type`; the option is also stable ID. |
| `databases[databaseId]` | Database name, host page `pageId`, `dataSourceIds`, `viewIds` and revision. |
| `views[viewId]` | The database and data source, table layout, visible fields, filtering, sorting and revision. |

The title field is directly bound to the page title; ordinary attributes are only saved in `properties` of the page. The data source ownership and page parent relationship are recorded separately, and a page has at most one `dataSourceId`; database records with a host are hosted by the host page. Different views refer to the same set of records, and the text is not copied.

The Wiki container records `kind: "wiki"`; the `notionWiki: true` imported earlier continues to be recognized. The host page records `wiki: true`; the `wikiMembership` tag of the member page can be recalculated with the data source attribution of the page tree, and `parent` always retains the true level. Fields and views continue to use existing resource formats, text entries reuse official `<database wiki="true">`, and other dialects use ordinary links.

The body does not save the database record JSON, nor does it add a custom body protocol. Existing `<database>` reference syntax decoupled from resource definition; database goes into collection view when opened from sidebar or page reference. The backup should copy the entire vault, including `databases/`, Markdown, and `metadata.json`.

<a id="保存与冲突"></a>

## Saving and conflicts

All changes pass `createVault`'s local lock and version verification. Field definitions, databases and views have independent revision; cells submit page `baseRevision` and field definition `schemaRevision` at the same time. The old window cannot write values ​​edited based on the old field type directly to the new schema, nor can it overwrite newer text.

The page content still uses the paired Markdown / JSON history and conflict records. Database resource conflicts save the current and planned-to-write versions in `.history/database-conflicts/`; resource updates save the original database files and planned-to-write resources in `.history/database-transactions/`, and joint writing uses recoverable file batches. ZIP and Git checkpoints contain separate database files. Recoverable evidence is provided here, and there is currently no database history rollback interface.

The form draft is stored in the session of the current tab in the vault and database, retaining the original page and field versions; restoring the draft will not automatically change to the new revision and force a retry. **Discard draft and reload** when saving fails. Explicitly discard the draft of this tab page and re-read the disk data; Retry save continue to verify the original version and do not automatically adopt new versions from other windows.

<a id="notion-导入"></a>

## Notion import

In the sidebar **Import → Import from Notion API** enter page, database or data source URL / ID, preview and import a copy. Database fields and records will be converted to the above-mentioned local model; the body continues to use Enhanced Markdown, and the original JSON, Markdown and view configuration are retained in the import archive. For specific permissions, paging, repeated submissions and security boundaries, see [ Notion and import ](NOTION-IMPORT.md).

| Notion data | current behavior |
| --- | --- |
| Basic properties and options | Convert to local field definitions and editable values, retaining source configuration. Rich text properties are displayed as text, and the original rich text is retained. |
| Relation | The second pass parses the imported targets of the same batch; unimported or unauthorized targets retain their source references and unresolved status, and are not merged by title. |
| People / Files | The source structure is retained and the current interface is read-only; local contacts or downloaded files are not automatically merged. |
| Formula / Rollup / Unknown attribute | Preserve definitions and import-time results as read-only snapshots; no local calculation engine. |
| Remote views | Attempt to read and retain original configuration, create local views as supported types, restore visible fields, supported grouping attributes, date fields, and card preview configuration; other layouts are downgraded to tables. Remote conditions, status groups, subgroups, and configurations that have not yet been mapped retain their original definitions and prompts. Currently filtered import still only does text that can be mapped exactly contains / AND , sorting only maps supported underlying types; local settings provide more conditions. |

If the field object order is directly saved as the default column order in the early import, the archived view will be used to correct the display when reopened; if there is no available view, the title column will be placed first. This is a compatible display when reading, and the vault files are not modified in batches. Existing custom column sequences or display column sets will be retained. Saving view settings, filtering, or sorting does not reset the current column order.

<a id="当前边界"></a>

## Current limitations

- Provide Table, List, Gallery, Board, Calendar. Timeline, Chart, Feed, Dashboard, Form, Map and formula/summary calculations are not implemented yet.
- The database can be restored through Trash or sent to the system recycle bin; the interface currently does not provide field deletion/copying, type conversion of filled-in fields, adding or removing existing pages from the collection, and moving records between databases.
- View settings support multiple sorting and flat All / Any filter combinations, providing Contains, Equals, NULL, and Number/Date comparisons. Nested conditional groups, column widths, and manual card sorting are not supported yet.
- There are no editable selectors for associations, contacts, and files; formula snapshots are not recalculated with local edits, and the interface always labels the imported results.
- Notion permissions, comments, automation and workspace accounts are not restored; the attachment URL may be expired and the import cannot be considered a complete offline attachment backup.
- Large database performance, Android real machine database interaction and complete migration of real Notion accounts still need further verification.

The browser returns to `tests/e2e/databases.spec.ts`, using independent Chrome and temporary vault, covering creation and editing, page attribute linkage, field renaming, pending input and browser return, continued input during saving, conflict and draft recovery, document overlay, saved view, filter refresh after editing, right record editing and narrow screen layout. All eight tests under the 2026-09-28 isolation build passed. For screenshots and scope, see [ Design and Interactive Verification ](../verification/DATABASES-DESIGN-QA-2026-09-28.md).

Creation and hierarchical regression in `tests/e2e/database-hierarchy.spec.ts`, inline editing and navigation are protected in `tests/e2e/database-inline.spec.ts`. Root level/nested hosting, record ownership, two slash creations, reloading, old library read-only projection, inline drafts and conflicts are all covered; together with existing databases, imports, MCP syntax, page navigation and sidebar dragging, 36 directed browser tests are passed. After the last dragging boundary correction, all 9 retests of levels and dragging passed.

The icon and reference portal is back in `tests/e2e/database-icons.spec.ts`, covering Emoji/Lucide/Remove, persistence, original text retention, conflicts and navigation; creating use cases has been changed to verifying direct generation **New database**, then edit the title. The latest nine-file directional operation has a total of 36 different use cases: 33 passed for the first time, 3 all passed after the test positioning was corrected; 3 has already passed the retest use case. See the above verification record for details, which does not mean that the entire browser suite has passed.

Subsequently, the extra outer spacing referenced by the sub-database was corrected, and all 9 items in the four files passed the retest, including the equidistant arrangement assertion and the 3 item to supplement the general block spacing use case; a total of 39 different directional use cases had passing results.
