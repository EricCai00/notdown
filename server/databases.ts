import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { VaultError, assertId, type Page, type PageInput } from "./vault.js";
import { documentMetadata } from "../src/features/metadata/document-metadata.js";
import { trashedPageIds } from "../src/features/pages/page-hierarchy.js";
import { databasePropertyReadOnly, databasePropertyTypes, type Database, type DatabaseDataSource, type DatabaseProperty, type DatabaseResources, type DatabaseSnapshot, type DatabaseView } from "../src/features/databases/database-model.js";

type Index = { version: 1; pages: Record<string, Record<string, unknown>>; [key: string]: unknown };
type PresentationInput = { title?: string; icon?: string; baseRevision: string; hostRevision?: string };
type Host = {
  root: string;
  serialize<T>(operation: () => Promise<T>): Promise<T>;
  scanPages(): Promise<Page[]>;
  readMetadata(): Promise<Index>;
  readOptional(filename: string): Promise<string | null>;
  atomicWrite(filename: string, data: string, expected?: string | null): Promise<void>;
  safeDirectory(directory: string): Promise<void>;
  createRecord(input: PageInput, sourceId: string): Promise<Page>;
  createDatabasePage(input: PageInput, id: string, resources: DatabaseResources, expectedMetadata: string | null, parentRevision?: string): Promise<Page>;
  updateRecord(id: string, input: PageInput, revision: string): Promise<Page>;
  detachRecord(id: string, revision: string): Promise<Page>;
  conflictRecord(id: string, input: PageInput, revision: string): Promise<never>;
};
const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const object = (value: unknown): value is Record<string, any> => !!value && typeof value === "object" && !Array.isArray(value);
const revision = (value: Record<string, unknown>) => {
  const { revision: _revision, ...rest } = value;
  return createHash("sha256").update(JSON.stringify(rest)).digest("hex");
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

/** Invoked only through the vault lock; canonical resources live in metadata.json. */
export function createDatabases(host: Host) {
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
    const recoveryPath = await archive("database-transactions", { before: ctx.before, after });
    try { await host.atomicWrite(metadataPath, after, ctx.before); }
    catch (error) { throw new VaultError(409, "Metadata changed during save; both versions remain recoverable.", { recoveryPath, cause: String(error) }); }
  }
  function source(ctx: Context, id: string) {
    assertId(id); const found = ctx.dataSources[id];
    if (!found) throw new VaultError(404, "Data source not found");
    properties(found.properties);
    return found;
  }
  function databaseHost(ctx: Context, database: Database): Page | undefined {
    return ctx.pages.find(page => page.id === database.pageId && page.databaseId === database.id)
      ?? ctx.pages.find(page => page.databaseId === database.id);
  }
  function presentedDatabase(ctx: Context, database: Database, hidden = trashedPageIds(ctx.pages)): Database {
    const page = databaseHost(ctx, database);
    return page ? { ...database, title: page.title, icon: page.icon, pageId: page.id, parent: page.parent, trashed: hidden.has(page.id) } : { ...database, parent: null };
  }
  function owningDatabase(ctx: Context, dataSource: DatabaseDataSource): Database | undefined {
    const candidates = Object.values(ctx.databases).filter(database => database.dataSourceIds.includes(dataSource.id));
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
    if (parent.databaseId) throw new VaultError(422, "Create databases inside a page or at the root");
    return parent.id;
  }
  function snapshot(ctx: Context, id: string): DatabaseSnapshot {
    assertId(id); const database = ctx.databases[id];
    if (!database) throw new VaultError(404, "Database not found");
    if (!Array.isArray(database.dataSourceIds) || !Array.isArray(database.viewIds)) throw new VaultError(422, "Invalid database references");
    const hidden = trashedPageIds(ctx.pages);
    const hostPage = databaseHost(ctx, database);
    return { database: presentedDatabase(ctx, database, hidden), ...(hostPage ? { hostPage } : {}), dataSources: database.dataSourceIds.map(id => source(ctx, id)), views: database.viewIds.map(id => ctx.views[id]).filter(Boolean), pages: ctx.pages.filter(page => page.dataSourceId && database.dataSourceIds.includes(page.dataSourceId) && !hidden.has(page.id)) };
  }
  function validateView(view: DatabaseView, ctx: Context, previous?: DatabaseView) {
    label(view.name);
    if (view.type !== "table") throw new VaultError(400, "Only table views are currently supported");
    const fields = source(ctx, view.dataSourceId).properties;
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
    for (const filter of view.filters ?? []) if (!object(filter) || !fields.some(field => field.id === filter.propertyId) || filter.operator !== "contains" || typeof filter.value !== "string") throw new VaultError(400, "Only contains filters on existing properties are supported");
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
      if (database.revision !== input.baseRevision) return conflict(presentedDatabase(ctx, database), { ...presentedDatabase(ctx, database), ...patch }, input.baseRevision);
      const page = databaseHost(ctx, database);
      if (page) {
        base(input.hostRevision);
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
      await save(ctx); return snapshot(ctx, id);
  }
  return {
    list: () => host.serialize(async () => { const ctx = await context(), hidden = trashedPageIds(ctx.pages); return Object.values(ctx.databases).map(database => presentedDatabase(ctx, database, hidden)).filter(database => !database.trashed); }),
    get: (id: string) => host.serialize(async () => snapshot(await context(), id)),
    getSource: (id: string) => host.serialize(async () => source(await context(), id)),
    updatePresentation: (id: string, input: PresentationInput) => host.serialize(() => updatePresentationLocked(id, input)),
    updateIcon: (id: string, input: { icon: string; baseRevision: string; hostRevision?: string }) => host.serialize(() => {
      if (typeof input?.icon !== "string") throw new VaultError(400, "An icon string is required");
      return updatePresentationLocked(id, input);
    }),
    create: (input: { title: string; parent?: string | null; parentRevision?: string }) => host.serialize(async () => {
      label(input?.title);
      const ctx = await context(), id = randomUUID(), sourceId = randomUUID(), viewId = randomUUID();
      const parent = await creationParent(ctx, input);
      ctx.dataSources[sourceId] = stamped({ id: sourceId, ownerDatabaseId: id, title: input.title, properties: [{ id: randomUUID(), name: "Name", key: "title", type: "title" }], revision: "" });
      ctx.views[viewId] = stamped({ id: viewId, databaseId: id, dataSourceId: sourceId, name: "Table", type: "table", rowOrder: [], revision: "" });
      ctx.databases[id] = stamped({ id, pageId: id, title: input.title, dataSourceIds: [sourceId], viewIds: [viewId], revision: "" });
      const page = await host.createDatabasePage({ title: input.title, icon: "table-2", parent, body: "" }, id, { databases: ctx.databases, dataSources: ctx.dataSources, views: ctx.views }, ctx.before, input.parentRevision);
      ctx.pages.push(page); return snapshot(ctx, id);
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
      if (removed.length && Object.values(ctx.views).some(view => view.dataSourceId === id && [...(view.propertyIds ?? []), ...(view.filters ?? []).map(item => object(item) ? item.propertyId : null), ...(view.sorts ?? []).map(item => object(item) ? item.propertyId : null)].some(fieldId => removed.includes(fieldId)))) throw new VaultError(422, "Remove references from views before deleting a field");
      ctx.dataSources[id] = stamped(proposed); await save(ctx); return ctx.dataSources[id];
    }),
    updateView: (id: string, input: Partial<DatabaseView>, baseRevision: string) => host.serialize(async () => {
      base(baseRevision); assertId(id); const ctx = await context(), current = ctx.views[id];
      if (!current) throw new VaultError(404, "View not found");
      const proposed = { ...current, ...input, id, databaseId: current.databaseId, dataSourceId: current.dataSourceId };
      if (current.revision !== baseRevision) return conflict(current, proposed, baseRevision);
      validateView(proposed, ctx, current); ctx.views[id] = stamped(proposed); await save(ctx); return ctx.views[id];
    }),
    createView: (databaseId: string, input: Partial<DatabaseView>, baseRevision: string) => host.serialize(async () => {
      base(baseRevision); const ctx = await context(), database = snapshot(ctx, databaseId).database;
      if (database.revision !== baseRevision) return conflict(database, input, baseRevision);
      const id = randomUUID(), dataSourceId = input.dataSourceId ?? database.dataSourceIds[0];
      if (!database.dataSourceIds.includes(dataSourceId)) throw new VaultError(400, "The view data source must belong to this database");
      const view = stamped({ rowOrder: [], ...input, id, databaseId, dataSourceId, name: input.name ?? "Table", type: input.type ?? "table", revision: "" } as DatabaseView);
      validateView(view, ctx); ctx.views[id] = view; ctx.databases[databaseId] = stamped({ ...ctx.databases[databaseId], viewIds: [...database.viewIds, id] });
      await save(ctx); return snapshot(ctx, databaseId);
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
      if (parent && trashedPageIds(ctx.pages).has(parent.id)) throw new VaultError(422, "Restore this database before adding records");
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
          if (ctx[key][id] && ctx[key][id].revision !== proposed.revision) return conflict(ctx[key][id], proposed, "import");
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
