import type { Buffer } from "buffer";
import { hashBytes, randomUUID } from "./crypto.js";
import type { VaultPlatform, StorageError } from "./platform.js";
import { VaultError, assertId, type Page, type PageInput } from "./vault.js";
import { documentMetadata } from "../features/metadata/document-metadata.js";
import { trashedPageIds } from "../features/pages/page-hierarchy.js";
import { databasePropertyReadOnly, databasePropertyTypes, databaseViewTypes, type Database, type DatabaseDataSource, type DatabaseProperty, type DatabaseResources, type DatabaseSnapshot, type DatabaseView } from "../features/databases/database-model.js";
import { validFilter, groupable } from "../features/databases/database-query.js";
import { isWikiDatabase } from "../features/databases/database-model.js";
import { canonical } from "../sync/protocol.js";

type Index = { version: 1; pages: Record<string, Record<string, unknown>>; [key: string]: unknown };
type PresentationInput = { title?: string; icon?: string; baseRevision: string; hostRevision?: string };
type Host = {
  platform: VaultPlatform;
  root: string;
  serialize<T>(operation: () => Promise<T>): Promise<T>;
  scanPages(): Promise<Page[]>;
  readMetadata(): Promise<Index>;
  resourceFiles(): { path: string; source: string }[];
  readOptional(filename: string): Promise<string | null>;
  atomicWrite(filename: string, data: string, expected?: string | null): Promise<void>;
  safeDirectory(directory: string): Promise<void>;
  createRecord(input: PageInput, sourceId: string): Promise<Page>;
  createDatabasePage(input: PageInput, id: string, resources: DatabaseResources, expectedMetadata: string | null, parentRevision?: string): Promise<Page>;
  updateRecord(id: string, input: PageInput, revision: string): Promise<Page>;
  detachRecord(id: string, revision: string): Promise<Page>;
  conflictRecord(id: string, input: PageInput, revision: string): Promise<never>;
  convertWikiPage(id: string, revision: string, resources: DatabaseResources, expectedMetadata: string | null, wiki: boolean): Promise<Page>;
  convertDisplay(parent: Page, databaseId: string, inline: boolean, baseRevision: string): Promise<Page>;
};
const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const object = (value: unknown): value is Record<string, any> => !!value && typeof value === "object" && !Array.isArray(value);
const revision = (value: Record<string, unknown>) => {
  const { revision: _revision, ...rest } = value;
  return hashBytes(JSON.stringify(rest));
};
const stamped = <T extends { revision: string }>(value: T): T => ({ ...value, revision: revision(value) });
function base(value: unknown) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) throw new VaultError(400, "A valid baseRevision is required");
}
function label(value: unknown) {
  if (typeof value !== "string" || !value.trim() || value.length > 500) throw new VaultError(400, "A nonempty name of at most 500 characters is required");
}
function properties(value: unknown): asserts value is DatabaseProperty[] {
  if (!Array.isArray(value) || value.length > 200) throw new VaultError(400, "At most 200 database properties are supported");
  const ids = new Set<string>(), keys = new Set<string>();
  for (const field of value) {
    if (!object(field)) throw new VaultError(400, "Invalid database property");
    assertId(field.id); label(field.name);
    if (typeof field.key !== "string" || !field.key || field.key.length > 500 || ["__proto__", "prototype", "constructor"].includes(field.key) || ids.has(field.id) || keys.has(field.key) || !databasePropertyTypes.includes(field.type)) throw new VaultError(400, "Invalid or duplicate database field identity/type");
    if (field.type === "title" && field.key !== "title") throw new VaultError(400, "The title property must bind title");
    if (field.type !== "title" && field.key === "title") throw new VaultError(400, "The title key is reserved");
    if (field.readOnly !== undefined && typeof field.readOnly !== "boolean") throw new VaultError(400, "Invalid readOnly flag");
    if (field.options !== undefined) {
      if (!Array.isArray(field.options) || field.options.length > 1000) throw new VaultError(400, "Invalid field options");
      const seen = new Set();
      for (const option of field.options) {
        if (!object(option) || typeof option.id !== "string" || !option.id || seen.has(option.id)) throw new VaultError(400, "Invalid or duplicate option identity");
        label(option.name); seen.add(option.id);
      }
    }
    ids.add(field.id); keys.add(field.key);
  }
  if (value.filter(field => field.type === "title").length !== 1) throw new VaultError(400, "A data source must contain exactly one title property");
}
export function validateDatabaseValue(field: DatabaseProperty, value: unknown) {
  if (databasePropertyReadOnly(field)) throw new VaultError(422, "This property is a read-only imported snapshot");
  if (value === null && field.type !== "title") return;
  const invalid = () => { throw new VaultError(422, `Invalid value for ${field.name}`); };
  switch (field.type) {
    case "title": label(value); break;
    case "text": case "url": case "email": case "phone": if (typeof value !== "string") invalid(); break;
    case "number": if (typeof value !== "number" || !Number.isFinite(value)) invalid(); break;
    case "checkbox": if (typeof value !== "boolean") invalid(); break;
    case "select": case "status": if (typeof value !== "string" || !field.options?.some(option => option.id === value)) invalid(); break;
    case "multi_select": if (!Array.isArray(value) || value.some(id => typeof id !== "string" || !field.options?.some(option => option.id === id)) || new Set(value).size !== value.length) invalid(); break;
    case "date": {
      const date = (entry: unknown) => typeof entry === "string" && /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(entry) && Number.isFinite(Date.parse(entry));
      if (!object(value) || !date(value.start) || (value.end != null && !date(value.end)) || (value.time_zone != null && typeof value.time_zone !== "string")) invalid();
      break;
    }
    case "relation": case "people": case "files": if (!Array.isArray(value) || value.some(entry => !object(entry) || ![entry.id, entry.url, entry.pageId, entry.notionPageId].some(id => typeof id === "string"))) invalid(); break;
    default: invalid();
  }
}

/** Invoked only through the vault lock; the host persists file resources or the legacy metadata format. */
export function createDatabases(host: Host) {
  const { fs, path } = host.platform;
  const metadataPath = path.join(host.root, "metadata.json");
  async function context() {
    const pages = await host.scanPages();
    const before = await host.readOptional(metadataPath);
    const index = await host.readMetadata();
    const resources: DatabaseResources = { databases: {}, dataSources: {}, views: {} };
    for (const key of ["databases", "dataSources", "views"] as const) {
      const entries = index[key] ?? {};
      if (!object(entries) || Object.values(entries).some(value => !object(value))) throw new VaultError(422, `Invalid ${key} metadata; original file preserved`);
      (resources as any)[key] = Object.fromEntries(Object.entries(entries).map(([id, value]) => [id, stamped(value as any)]));
    }
    return { pages, before, index, ...resources };
  }
  type Context = Awaited<ReturnType<typeof context>>;
  async function archive(kind: string, value: unknown) {
    const directory = path.join(host.root, ".history", kind);
    await host.safeDirectory(directory);
    const filename = path.join(directory, `${randomUUID()}.json`);
    await host.atomicWrite(filename, JSON.stringify(value, null, 2));
    return filename;
  }
  async function conflict(current: unknown, proposed: unknown, baseRevision: unknown): Promise<never> {
    const recoveryPath = await archive("database-conflicts", { createdAt: new Date().toISOString(), baseRevision, current, proposed });
    throw new VaultError(409, "Database changed. Both versions are preserved; review before retrying.", { current, proposed, recoveryPath });
  }
  async function save(ctx: Context) {
    const after = JSON.stringify({ ...ctx.index, databases: ctx.databases, dataSources: ctx.dataSources, views: ctx.views }, null, 2) + "\n";
    const recoveryPath = await archive("database-transactions", { before: ctx.before, after, beforeFiles: host.resourceFiles() });
    try { await host.atomicWrite(metadataPath, after, ctx.before); }
    catch (error) { throw new VaultError(409, "Metadata changed during save; both versions remain recoverable.", { recoveryPath, cause: String(error) }); }
  }
  function source(ctx: Context, id: string, allowUnavailable = false) {
    assertId(id); const found = ctx.dataSources[id];
    if (!found) throw new VaultError(404, "Data source not found");
    const unavailable = found.unavailable || !!found.ownerDatabaseId && !ctx.databases[found.ownerDatabaseId];
    if (unavailable && !allowUnavailable) throw new VaultError(422, "The linked data source is unavailable; restore its owning database");
    properties(found.properties);
    return unavailable ? { ...found, unavailable: true } : found;
  }
  function databaseHost(ctx: Context, database: Database): Page | undefined {
    return ctx.pages.find(page => page.id === database.pageId && page.databaseId === database.id)
      ?? ctx.pages.find(page => page.databaseId === database.id);
  }
  function presentedDatabase(ctx: Context, database: Database, hidden = trashedPageIds(ctx.pages)): Database {
    const page = databaseHost(ctx, database);
    if (page) return { ...database, title: page.title, icon: page.icon, pageId: page.id, parent: page.parent, trashed: hidden.has(page.id) };
    // Recycle keeps metadata for recovery. A previously hosted collection whose
    // Markdown is gone is not a legacy collection that never had a host.
    const wasHosted = typeof database.pageId === "string" ||
      Object.values(ctx.index.pages).some(entry => entry.databaseId === database.id);
    return { ...database, parent: null, ...(wasHosted ? { trashed: true } : {}) };
  }
  function owningDatabase(ctx: Context, dataSource: DatabaseDataSource): Database | undefined {
    const candidates = Object.values(ctx.databases).filter(database => database.dataSourceIds.includes(dataSource.id));
    if (dataSource.ownerDatabaseId) return ctx.databases[dataSource.ownerDatabaseId];
    return candidates.find(database => database.id === dataSource.ownerDatabaseId)
      ?? candidates.find(database => {
        const page = databaseHost(ctx, database);
        return page && ctx.pages.some(record => record.dataSourceId === dataSource.id && record.parent === page.id);
      })
      ?? candidates[0];
  }
  async function creationParent(ctx: Context, input: { parent?: string | null; parentRevision?: string }) {
    if (input.parent == null) return null;
    assertId(input.parent); base(input.parentRevision);
    const parent = ctx.pages.find(page => page.id === input.parent || page.legacyIds?.includes(input.parent!));
    if (!parent) throw new VaultError(404, "Parent page not found");
    if (parent.revision !== input.parentRevision) return conflict(parent, input, input.parentRevision);
    if (trashedPageIds(ctx.pages).has(parent.id)) throw new VaultError(422, "Restore the parent page before creating a database inside it");
    if (parent.databaseId && !isWikiDatabase(ctx.databases[parent.databaseId])) throw new VaultError(422, "Create databases inside a page or at the root");
    return parent.id;
  }
  function snapshot(ctx: Context, id: string): DatabaseSnapshot {
    assertId(id); const database = ctx.databases[id];
    if (!database) throw new VaultError(404, "Database not found");
    if (!Array.isArray(database.dataSourceIds) || !Array.isArray(database.viewIds)) throw new VaultError(422, "Invalid database references");
    if (isWikiDatabase(database) && database.dataSourceIds.filter(id => owningDatabase(ctx, source(ctx, id, true))?.id === database.id).length !== 1) throw new VaultError(422, "A wiki has exactly one owned data source; original metadata was preserved");
    const hidden = trashedPageIds(ctx.pages);
    const hostPage = databaseHost(ctx, database);
    return { database: presentedDatabase(ctx, database, hidden), ...(hostPage ? { hostPage } : {}), dataSources: database.dataSourceIds.map(id => source(ctx, id, true)), views: database.viewIds.map(id => ctx.views[id]).filter(Boolean), pages: ctx.pages.filter(page => page.dataSourceId && database.dataSourceIds.includes(page.dataSourceId) && !hidden.has(page.id)) };
  }
  function sourceOwner(ctx: Context, item: DatabaseDataSource) {
    const owner = owningDatabase(ctx, item);
    if (!owner || presentedDatabase(ctx, owner).trashed) throw new VaultError(422, "Restore the source database before linking its data source");
    return presentedDatabase(ctx, owner);
  }
  async function addSource(ctx: Context, database: Database, item: DatabaseDataSource) {
    const id = randomUUID(), hidden = trashedPageIds(ctx.pages);
    ctx.views[id] = stamped({ id, databaseId: database.id, dataSourceId: item.id, name: item.title, type: "table", rowOrder: ctx.pages.filter(page => page.dataSourceId === item.id && !hidden.has(page.id)).map(page => page.id), revision: "" });
    validateView(ctx.views[id], ctx);
    ctx.databases[database.id] = stamped({ ...ctx.databases[database.id], dataSourceIds: [...database.dataSourceIds, item.id], viewIds: [...database.viewIds, id] });
    await save(ctx); return snapshot(await context(), database.id);
  }
  function validateView(view: DatabaseView, ctx: Context, previous?: DatabaseView) {
    label(view.name);
    if (!databaseViewTypes.includes(view.type)) throw new VaultError(400, "Unsupported database view type");
    const fields = source(ctx, view.dataSourceId).properties;
    if (view.filterMode !== undefined && !["and", "or"].includes(view.filterMode)) throw new VaultError(400, "Invalid filter mode");
    if (view.layout !== undefined) {
      const layout = view.layout;
      if (!object(layout)) throw new VaultError(400, "Invalid view layout");
      if (layout.groupBy && !fields.some(field => field.id === layout.groupBy && groupable(field))) throw new VaultError(400, "Grouping requires a Select, Status or Checkbox property");
      if (layout.datePropertyId && !fields.some(field => field.id === layout.datePropertyId && field.type === "date")) throw new VaultError(400, "Calendar requires a Date property");
      for (const key of ["groupOrder", "hiddenGroups", "collapsedGroups"] as const) if (layout[key] !== undefined && (!Array.isArray(layout[key]) || layout[key]!.some(value => typeof value !== "string") || new Set(layout[key]).size !== layout[key]!.length)) throw new VaultError(400, "Invalid group list");
      for (const [key, values] of [["cardSize", ["small", "medium", "large"]], ["preview", ["none", "cover", "content"]], ["calendarRange", ["week", "month"]]] as const) if (layout[key] !== undefined && !values.includes(layout[key] as never)) throw new VaultError(400, "Invalid layout option");
      for (const key of ["fitImage", "hideEmptyGroups", "showDataSourceTitle", "showVerticalLines", "showPageIcon", "wrapContent", "showGroupCount"] as const) if (layout[key] !== undefined && typeof layout[key] !== "boolean") throw new VaultError(400, "Invalid layout flag");
    }
    if (view.layout?.groupColors !== undefined && (!object(view.layout.groupColors) || Object.values(view.layout.groupColors).some(color => typeof color !== "string" || !["default", "gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"].includes(color)))) throw new VaultError(400, "Invalid group colors");
    if (view.layout?.openPagesIn !== undefined && !["side", "center", "full"].includes(view.layout.openPagesIn)) throw new VaultError(400, "Invalid page opening mode");
    if (view.layout?.loadLimit !== undefined && ![0, 25, 50, 100].includes(view.layout.loadLimit)) throw new VaultError(400, "Invalid load limit");
    if (view.layout?.frozenPropertyId && !fields.some(field => field.id === view.layout!.frozenPropertyId)) throw new VaultError(400, "Invalid frozen property");
    if (view.layout?.wrapPropertyIds !== undefined && (!Array.isArray(view.layout.wrapPropertyIds) || view.layout.wrapPropertyIds.some(id => !fields.some(field => field.id === id)))) throw new VaultError(400, "Invalid wrapping properties");
    if (view.propertyIds !== undefined && (!Array.isArray(view.propertyIds) || new Set(view.propertyIds).size !== view.propertyIds.length || view.propertyIds.some(id => !fields.some(field => field.id === id)))) throw new VaultError(400, "Invalid visible property IDs");
    if (view.rowOrder !== undefined) {
      if (!Array.isArray(view.rowOrder) || view.rowOrder.length > 100_000 || new Set(view.rowOrder).size !== view.rowOrder.length) throw new VaultError(400, "Row order must contain unique page IDs");
      const members = new Set(ctx.pages.filter(page => page.dataSourceId === view.dataSourceId).map(page => page.id));
      const retained = new Set(previous?.rowOrder ?? []);
      for (const id of view.rowOrder) {
        assertId(id);
        // Removed/deleted records may leave old view references. Preserve those
        // references, but never admit a new reference to another collection.
        if (!members.has(id) && !retained.has(id)) throw new VaultError(400, "Row order can only add pages from this data source");
      }
    }
    if (view.filters !== undefined && !Array.isArray(view.filters) || view.sorts !== undefined && !Array.isArray(view.sorts)) throw new VaultError(400, "Invalid view filters or sorts");
    for (const filter of view.filters ?? []) if (!validFilter(filter, fields)) throw new VaultError(400, "Invalid filter value or operator");
    for (const sort of view.sorts ?? []) if (!object(sort) || !fields.some(field => field.id === sort.propertyId) || !["ascending", "descending"].includes(sort.direction)) throw new VaultError(400, "Invalid property sort");
  }
  async function updatePresentationLocked(id: string, input: PresentationInput) {
      assertId(id); base(input?.baseRevision);
      if (!object(input) || (!own(input, "title") && !own(input, "icon")) || Object.keys(input).some(key => !["title", "icon", "baseRevision", "hostRevision"].includes(key))) throw new VaultError(400, "Specify only a title, icon, and their revisions");
      const patch: Pick<PageInput, "title" | "icon"> = {};
      if (own(input, "title")) { label(input.title); patch.title = input.title; }
      if (own(input, "icon")) {
        if (typeof input.icon !== "string" || input.icon.length > 100) throw new VaultError(400, "Icon must be a string of at most 100 characters");
        patch.icon = input.icon;
      }
      const ctx = await context(), database = ctx.databases[id];
      if (!database) throw new VaultError(404, "Database not found");
      if (presentedDatabase(ctx, database).trashed) throw new VaultError(422, "Restore this database before editing it");
      const page = databaseHost(ctx, database);
      if (page) base(input.hostRevision);
      if (database.revision !== input.baseRevision) {
        if (page && page.revision !== input.hostRevision) return host.conflictRecord(page.id, patch, input.hostRevision!);
        return conflict(presentedDatabase(ctx, database), { ...presentedDatabase(ctx, database), ...patch }, input.baseRevision);
      }
      if (page) {
        if (page.revision !== input.hostRevision) return host.conflictRecord(page.id, patch, input.hostRevision!);
        const metadata = documentMetadata(page.body);
        if (metadata.form === "pandoc" && typeof metadata.values.title === "string" && !metadata.values.title.trim()) delete metadata.values.title;
        for (const key of Object.keys(patch)) if (own(metadata.values, key)) throw new VaultError(422, `This ${key} is defined in document metadata. Edit its YAML or Pandoc title block source.`, { source: "document", property: key });
        // The host is the only presentation authority. Its save changes metadata.json,
        // so never write the earlier resource context back over that page save.
        await host.updateRecord(page.id, patch, input.hostRevision!);
        return snapshot(await context(), id);
      }
      ctx.databases[id] = stamped({ ...database, ...patch });
      await save(ctx); return snapshot(await context(), id);
  }
  return {
    turnIntoWiki: (pageId: string, baseRevision: string) => host.serialize(async () => {
      base(baseRevision); const ctx = await context(), page = ctx.pages.find(page => page.id === pageId);
      if (!page) throw new VaultError(404, "Page not found");
      if (page.revision !== baseRevision) return host.conflictRecord(pageId, {}, baseRevision);
      if (page.databaseId || page.dataSourceId || trashedPageIds(ctx.pages).has(pageId)) throw new VaultError(422, "Only an active standalone page can be turned into a wiki");
      const sourceId = randomUUID(), viewId = randomUUID();
      ctx.dataSources[sourceId] = stamped({ id: sourceId, ownerDatabaseId: pageId, title: page.title, properties: [{ id: randomUUID(), name: "Name", key: "title", type: "title" }], revision: "" });
      ctx.views[viewId] = stamped({ id: viewId, databaseId: pageId, dataSourceId: sourceId, name: "All pages", type: "list", rowOrder: [], revision: "" });
      ctx.databases[pageId] = stamped({ id: pageId, pageId, kind: "wiki", title: page.title, dataSourceIds: [sourceId], viewIds: [viewId], revision: "" });
      await host.convertWikiPage(pageId, baseRevision, ctx, ctx.before, true);
      return snapshot(await context(), pageId);
    }),
    undoWiki: (id: string, input: { baseRevision: string; hostRevision: string }) => host.serialize(async () => {
      base(input?.baseRevision); base(input?.hostRevision);
      const ctx = await context(), current = snapshot(ctx, id), database = current.database;
      if (database.revision !== input.baseRevision) return conflict(database, input, input.baseRevision);
      if (!isWikiDatabase(database) || !current.hostPage) throw new VaultError(422, "Only a wiki can be undone");
      const owned = database.dataSourceIds.filter(sourceId => owningDatabase(ctx, source(ctx, sourceId, true))?.id === id);
      if (Object.values(ctx.databases).some(other => other.id !== id && other.dataSourceIds.some(sourceId => owned.includes(sourceId)))) throw new VaultError(422, "This wiki source is used by another database; preserve those linked views before undoing the wiki");
      delete ctx.databases[id];
      for (const sourceId of owned) delete ctx.dataSources[sourceId];
      for (const viewId of database.viewIds) delete ctx.views[viewId];
      return host.convertWikiPage(current.hostPage.id, input.hostRevision, ctx, ctx.before, false);
    }),
    list: () => host.serialize(async () => { const ctx = await context(), hidden = trashedPageIds(ctx.pages); return Object.values(ctx.databases).map(database => presentedDatabase(ctx, database, hidden)).filter(database => !database.trashed); }),
    get: (id: string) => host.serialize(async () => snapshot(await context(), id)),
    getSource: (id: string) => host.serialize(async () => source(await context(), id)),
    listSources: () => host.serialize(async () => {
      const ctx = await context(), hidden = trashedPageIds(ctx.pages);
      return Object.values(ctx.dataSources).flatMap(item => {
        const owner = owningDatabase(ctx, item);
        if (!owner) return [];
        const presented = presentedDatabase(ctx, owner, hidden);
        const databases = Object.values(ctx.databases).filter(database => database.dataSourceIds.includes(item.id))
          .map(database => presentedDatabase(ctx, database, hidden)).filter(database => !database.trashed)
          .map(database => ({ id: database.id, title: database.title, isOwner: database.id === owner.id,
            views: database.viewIds.map(id => ctx.views[id]).filter(view => view?.databaseId === database.id && view.dataSourceId === item.id)
              .map(view => ({ id: view.id, name: view.name, type: view.type })) }))
          .sort((a, b) => Number(b.isOwner) - Number(a.isOwner) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
        return presented.trashed ? [] : [{ id: item.id, title: item.title, revision: item.revision, ownerDatabaseId: owner.id, ownerTitle: presented.title, propertyCount: item.properties.length, recordCount: ctx.pages.filter(page => page.dataSourceId === item.id && !hidden.has(page.id)).length, databases }];
      }).sort((a, b) => a.ownerTitle.localeCompare(b.ownerTitle) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
    }),
    createSource: (databaseId: string, input: { title: string }, baseRevision: string) => host.serialize(async () => {
      base(baseRevision); label(input?.title);
      const ctx = await context(), database = snapshot(ctx, databaseId).database;
      if (database.revision !== baseRevision) return conflict(database, input, baseRevision);
      if (database.trashed) throw new VaultError(422, "Restore this database before adding a data source");
      if (isWikiDatabase(database)) throw new VaultError(422, "A wiki has exactly one data source");
      const id = randomUUID();
      const item = stamped({ id, ownerDatabaseId: databaseId, title: input.title, properties: [{ id: randomUUID(), name: "Name", key: "title", type: "title" }], revision: "" } as DatabaseDataSource);
      ctx.dataSources[id] = item;
      return addSource(ctx, database, item);
    }),
    linkSource: (databaseId: string, input: { dataSourceId: string; sourceRevision: string }, baseRevision: string) => host.serialize(async () => {
      base(baseRevision); base(input?.sourceRevision);
      const ctx = await context(), database = snapshot(ctx, databaseId).database, current = source(ctx, input.dataSourceId);
      if (database.revision !== baseRevision) return conflict(database, input, baseRevision);
      if (current.revision !== input.sourceRevision) return conflict(current, input, input.sourceRevision);
      if (database.trashed) throw new VaultError(422, "Restore this database before linking a data source");
      if (isWikiDatabase(database)) throw new VaultError(422, "A wiki has exactly one data source");
      const owner = sourceOwner(ctx, current);
      if (database.dataSourceIds.includes(current.id)) return snapshot(ctx, databaseId);
      // Pin an older source's existing effective owner before adding another container.
      if (!current.ownerDatabaseId) ctx.dataSources[current.id] = stamped({ ...current, ownerDatabaseId: owner.id });
      return addSource(ctx, database, current);
    }),
    updatePresentation: (id: string, input: PresentationInput) => host.serialize(() => updatePresentationLocked(id, input)),
    updateIcon: (id: string, input: { icon: string; baseRevision: string; hostRevision?: string }) => host.serialize(() => {
      if (typeof input?.icon !== "string") throw new VaultError(400, "An icon string is required");
      return updatePresentationLocked(id, input);
    }),
    display: (id: string, input: { inline: boolean; baseRevision: string; parentRevision: string }) => host.serialize(async () => {
      base(input?.baseRevision); base(input?.parentRevision);
      if (typeof input.inline !== "boolean") throw new VaultError(400, "Specify the database display mode");
      const ctx = await context(), current = snapshot(ctx, id);
      if (current.database.revision !== input.baseRevision) return conflict(current.database, input, input.baseRevision);
      if (current.database.trashed || isWikiDatabase(current.database)) throw new VaultError(422, "Only active ordinary databases can change display mode");
      const parent = ctx.pages.find(page => page.id === current.hostPage?.parent);
      if (!parent || parent.databaseId && !isWikiDatabase(ctx.databases[parent.databaseId])) throw new VaultError(422, "Move this database inside a page before displaying it inline");
      return host.convertDisplay(parent, id, input.inline, input.parentRevision);
    }),
    create: (input: { title: string; parent?: string | null; parentRevision?: string; kind?: "database" | "wiki"; dataSourceId?: string; sourceRevision?: string }) => host.serialize(async () => {
      label(input?.title);
      if (input.kind !== undefined && !["database", "wiki"].includes(input.kind)) throw new VaultError(400, "Unknown database kind");
      const wiki = input.kind === "wiki";
      const ctx = await context(), id = randomUUID(), sourceId = randomUUID(), viewId = randomUUID();
      const parent = await creationParent(ctx, input);
      let selected = sourceId;
      if (input.dataSourceId !== undefined) {
        if (wiki) throw new VaultError(422, "A Wiki requires its own page source");
        base(input.sourceRevision); const linked = source(ctx, input.dataSourceId);
        if (linked.revision !== input.sourceRevision) return conflict(linked, input, input.sourceRevision);
        const owner = sourceOwner(ctx, linked); selected = linked.id;
        if (!linked.ownerDatabaseId) ctx.dataSources[linked.id] = stamped({ ...linked, ownerDatabaseId: owner.id });
      } else ctx.dataSources[sourceId] = stamped({ id: sourceId, ownerDatabaseId: id, title: input.title, properties: [{ id: randomUUID(), name: "Name", key: "title", type: "title" }], revision: "" });
      ctx.views[viewId] = stamped({ id: viewId, databaseId: id, dataSourceId: selected, name: wiki ? "All pages" : "Table", type: wiki ? "list" : "table", rowOrder: ctx.pages.filter(page => page.dataSourceId === selected).map(page => page.id), revision: "" });
      ctx.databases[id] = stamped({ id, pageId: id, ...(wiki ? { kind: "wiki" as const } : {}), title: input.title, dataSourceIds: [selected], viewIds: [viewId], revision: "" });
      const page = await host.createDatabasePage({ title: input.title, icon: wiki ? "book-open" : "table-2", parent, body: "" }, id, { databases: ctx.databases, dataSources: ctx.dataSources, views: ctx.views }, ctx.before, input.parentRevision);
      ctx.pages.push(page); return snapshot(await context(), id);
    }),
    updateSource: (id: string, input: Partial<DatabaseDataSource>, baseRevision: string) => host.serialize(async () => {
      base(baseRevision); const ctx = await context(), current = source(ctx, id);
      const proposed = { ...current, ...input, id, revision: "" };
      if (own(input, "ownerDatabaseId") && input.ownerDatabaseId !== current.ownerDatabaseId) throw new VaultError(422, "The canonical database owner cannot be changed by a field edit");
      if (current.revision !== baseRevision) return conflict(current, proposed, baseRevision);
      label(proposed.title); properties(proposed.properties);
      proposed.properties = proposed.properties.map(field => {
        const previous = current.properties.find(previous => previous.id === field.id);
        return { ...previous, ...field, ...(field.options ? { options: field.options.map(option => ({ ...previous?.options?.find(prior => prior.id === option.id), ...option })) } : {}) };
      });
      for (const field of proposed.properties) {
        const previous = current.properties.find(item => item.id === field.id);
        if (previous && previous.key !== field.key) throw new VaultError(422, "A field key is stable; rename its display name instead");
        if (previous && previous.type !== field.type && ctx.pages.some(page => page.dataSourceId === id && (previous.type === "title" || page.properties[field.key] != null))) throw new VaultError(422, "Changing a populated field type requires an explicit conversion; existing values were preserved");
        if (previous?.options) {
          const removed = previous.options.filter(option => !field.options?.some(next => next.id === option.id)).map(option => option.id);
          if (removed.length && ctx.pages.some(page => page.dataSourceId === id && removed.some(option => page.properties[field.key] === option || Array.isArray(page.properties[field.key]) && (page.properties[field.key] as unknown[]).includes(option)))) throw new VaultError(422, "Options used by records cannot be removed; their values were preserved");
        }
      }
      const removed = current.properties.filter(field => !proposed.properties.some(next => next.id === field.id)).map(field => field.id);
      if (removed.length && Object.values(ctx.views).some(view => view.dataSourceId === id && [view.layout?.groupBy, view.layout?.datePropertyId, view.layout?.frozenPropertyId, ...(view.layout?.wrapPropertyIds ?? []), ...(view.propertyIds ?? []), ...(view.filters ?? []).map(item => object(item) ? item.propertyId : null), ...(view.sorts ?? []).map(item => object(item) ? item.propertyId : null)].some(fieldId => removed.includes(fieldId!)))) throw new VaultError(422, "Remove references from views before deleting a field");
      ctx.dataSources[id] = stamped(proposed);
      for (const view of Object.values(ctx.views)) if (view.dataSourceId === id) validateView(view, ctx, view);
      await save(ctx); return (await context()).dataSources[id];
    }),
    updateView: (id: string, input: Partial<DatabaseView>, baseRevision: string) => host.serialize(async () => {
      base(baseRevision); assertId(id); const ctx = await context(), current = ctx.views[id];
      if (!current) throw new VaultError(404, "View not found");
      const proposed = { ...current, ...input, id, databaseId: current.databaseId, dataSourceId: current.dataSourceId };
      if (current.revision !== baseRevision) return conflict(current, proposed, baseRevision);
      validateView(proposed, ctx, current); ctx.views[id] = stamped(proposed); await save(ctx); return (await context()).views[id];
    }),
    createView: (databaseId: string, input: Partial<DatabaseView>, baseRevision: string) => host.serialize(async () => {
      base(baseRevision); const ctx = await context(), database = snapshot(ctx, databaseId).database;
      if (database.trashed) throw new VaultError(422, "Restore this database before adding views");
      if (database.revision !== baseRevision) return conflict(database, input, baseRevision);
      const id = randomUUID(), dataSourceId = input.dataSourceId ?? database.dataSourceIds[0];
      if (!database.dataSourceIds.includes(dataSourceId)) throw new VaultError(400, "The view data source must belong to this database");
      const view = stamped({ rowOrder: [], ...input, id, databaseId, dataSourceId, name: input.name ?? "Table", type: input.type ?? "table", revision: "" } as DatabaseView);
      validateView(view, ctx); ctx.views[id] = view; ctx.databases[databaseId] = stamped({ ...ctx.databases[databaseId], viewIds: [...database.viewIds, id] });
      await save(ctx); return snapshot(await context(), databaseId);
    }),
    createRecord: (sourceId: string, input: { title?: string; properties?: Record<string, unknown> }, baseRevision: string) => host.serialize(async () => {
      base(baseRevision); const ctx = await context(), current = source(ctx, sourceId);
      if (current.revision !== baseRevision) return conflict(current, input, baseRevision);
      const values = input.properties ?? {};
      if (!object(values)) throw new VaultError(400, "properties must be an object");
      for (const [key, value] of Object.entries(values)) {
        const field = current.properties.find(field => field.key === key && field.type !== "title");
        if (!field) throw new VaultError(422, "Unknown database property");
        validateDatabaseValue(field, value);
      }
      const title = input.title ?? "Untitled"; label(title);
      const owner = owningDatabase(ctx, current), parent = owner ? databaseHost(ctx, owner) : undefined;
      if (owner && presentedDatabase(ctx, owner).trashed) throw new VaultError(422, "Restore this database before adding records");
      return host.createRecord({ title, properties: values, body: "", parent: parent?.id ?? null }, sourceId);
    }),
    updateCell: (sourceId: string, pageId: string, input: { baseRevision: string; schemaRevision: string; propertyId: string; value: unknown }) => host.serialize(async () => {
      base(input.baseRevision); base(input.schemaRevision); const ctx = await context(), current = source(ctx, sourceId);
      const page = ctx.pages.find(page => page.id === pageId && page.dataSourceId === sourceId);
      if (!page) throw new VaultError(404, "Database record not found");
      if (current.revision !== input.schemaRevision) return conflict({ schema: current, page }, input, input.schemaRevision);
      const field = current.properties.find(field => field.id === input.propertyId);
      if (!field) throw new VaultError(404, "Database property not found");
      validateDatabaseValue(field, input.value);
      const overlay = documentMetadata(page.body).values;
      if (field.type === "title" ? own(overlay, "title") : own(overlay, field.key) || object(overlay.properties) && own(overlay.properties, field.key)) throw new VaultError(422, "This value is defined in document metadata. Edit its YAML or Pandoc source.", { propertyId: field.id, source: "document" });
      const patch = field.type === "title" ? { title: input.value as string } : { properties: { ...page.properties, [field.key]: input.value } };
      return host.updateRecord(pageId, patch, input.baseRevision);
    }),
    removeRecord: (sourceId: string, pageId: string, baseRevision: string, schemaRevision: string) => host.serialize(async () => {
      base(baseRevision); base(schemaRevision); const ctx = await context(), current = source(ctx, sourceId);
      const page = ctx.pages.find(page => page.id === pageId && page.dataSourceId === sourceId);
      if (!page) throw new VaultError(404, "Database record not found");
      if (current.revision !== schemaRevision) return conflict({ schema: current, page }, { dataSourceId: null }, schemaRevision);
      if (page.revision !== baseRevision) return conflict(page, { ...page, dataSourceId: null }, baseRevision);
      const owner = owningDatabase(ctx, current);
      if (isWikiDatabase(owner)) return host.updateRecord(pageId, { parent: databaseHost(ctx, owner!)?.parent ?? null }, baseRevision);
      return host.detachRecord(pageId, baseRevision);
    }),
    async validatePageUpdateLocked(page: Page, input: PageInput, baseRevision: string, schemaRevision?: string) {
      // updateLocked supplies the page from its required recovery-aware scan,
      // including canonical identity resolution for legacy page aliases.
      if (!page.dataSourceId) return;
      const index = await host.readMetadata();
      if (!object(index.dataSources)) throw new VaultError(422, "Invalid dataSources metadata; original file preserved");
      const stored = index.dataSources[page.dataSourceId];
      if (!object(stored)) throw new VaultError(404, "Data source not found");
      properties(stored.properties);
      const current = stamped(stored as DatabaseDataSource);
      const changed = current.properties.filter(field => field.type === "title"
        ? input.title !== undefined && input.title !== page.title
        : input.properties !== undefined && JSON.stringify(input.properties[field.key]) !== JSON.stringify(page.properties[field.key]));
      if (!changed.length) return;
      base(schemaRevision);
      if (current.revision !== schemaRevision) return host.conflictRecord(page.id, input, baseRevision);
      const overlay = documentMetadata(input.body ?? page.body).values;
      for (const field of changed) {
        const value = field.type === "title" ? input.title : input.properties![field.key] ?? null;
        validateDatabaseValue(field, value);
        const overridden = field.type === "title" ? own(overlay, "title") : own(overlay, field.key) || object(overlay.properties) && own(overlay.properties, field.key);
        if (overridden && (input.body === undefined || input.body === page.body)) throw new VaultError(422, "Edit document metadata to change this property");
      }
    },
    // Called within importBatch's existing vault lock. Repeating a snapshot is idempotent.
    async importLocked(resources: DatabaseResources) {
      const ctx = await context();
      for (const key of ["databases", "dataSources", "views"] as const) {
        if (!object(resources[key])) throw new VaultError(400, "Invalid imported database resources");
        for (const [id, value] of Object.entries(resources[key])) {
          assertId(id);
          if (!object(value) || value.id !== id) throw new VaultError(400, "Imported database identity mismatch");
          const proposed = stamped({ ...value, revision: "" });
          const existing = ctx[key][id];
          if (existing) {
            const comparable = (item: Record<string, unknown>) => {
              const ignored = ["revision", ...(key === "views" ? ["sourceDatabaseId", "linked"] : []), ...(key === "databases" ? ["storage", "ownedDataSourceIds", "pageMetadata", "legacyPageMetadata", "icon", "parent", "properties", "updated", "trashed", "favorite", "fullWidth", "sidebarOrder"] : [])];
              const result = Object.fromEntries(Object.entries(item).filter(([field]) => !ignored.includes(field)));
              if (key === "databases") { result.kind ??= "database"; if (result.kind === "wiki" || result.notionWiki === true) result.homePageId ??= result.pageId ?? result.id; }
              return result;
            };
            if (canonical(comparable(existing)) !== canonical(comparable(proposed))) return conflict(existing, proposed, "import");
            continue;
          }
          (ctx[key] as Record<string, unknown>)[id] = proposed;
        }
      }
      for (const item of Object.values(resources.dataSources)) properties(item.properties);
      for (const item of Object.values(resources.views)) validateView(item, ctx);
      for (const id of Object.keys(resources.databases)) snapshot(ctx, id);
      await save(ctx);
    },
  };
}
