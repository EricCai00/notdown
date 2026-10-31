import { hashBytes } from "./crypto";
import { assertId, VaultError, type Page } from "./vault";
import type { VaultPlatform, StorageError } from "./platform";
import type { Database, DatabaseDataSource, DatabaseResources, DatabaseView } from "../features/databases/database-model";
import { isWikiDatabase } from "../features/databases/database-model";
import { canonical } from "../sync/protocol";

export type DatabaseIndex = { version: 1; pages: Record<string, Record<string, unknown>>; [key: string]: unknown };
export type DatabaseFileChange = { path: string; before: string | null; after: string | null };
export type DatabaseDocument = Record<string, unknown> & {
  version: 1; id: string; kind: "database" | "wiki"; title: string;
  dataSources: (Pick<DatabaseDataSource, "id" | "title" | "properties"> & Record<string, unknown> & { pageIds: string[] })[];
  views: (Record<string, unknown> & { id: string; dataSource: { databaseId: string; dataSourceId: string } })[];
};
const object = (value: unknown): value is Record<string, any> => !!value && typeof value === "object" && !Array.isArray(value);
const omit = (value: Record<string, unknown>, fields: string[]) => Object.fromEntries(Object.entries(value).filter(([key]) => !fields.includes(key)));
const token = (value: Record<string, unknown>) => hashBytes(JSON.stringify(omit(value, ["revision"])));
const displayFields = ["title", "icon", "parent", "fullWidth", "trashed", "favorite", "sidebarOrder", "updated"];
export function validateDatabaseDocument(value: unknown, id?: string): asserts value is DatabaseDocument {
  if (!object(value) || value.version !== 1 || !["database", "wiki"].includes(value.kind) || typeof value.title !== "string" || !value.title.trim() ||
      !Array.isArray(value.dataSources) || !Array.isArray(value.views)) throw new VaultError(422, "Invalid database JSON; original file preserved");
  assertId(value.id); if (id && value.id !== id) throw new VaultError(422, "Database filename and identity differ; original file preserved");
  if (value.parent != null) { assertId(value.parent); if (value.parent === value.id) throw new VaultError(422, "A database cannot be its own parent"); }
  if (value.homePageId != null) assertId(value.homePageId);
  for (const key of ["trashed", "favorite", "fullWidth"]) if (value[key] !== undefined && typeof value[key] !== "boolean") throw new VaultError(422, "Invalid database flag: " + key);
  if (value.properties !== undefined && !object(value.properties) || value.pageMetadata !== undefined && !object(value.pageMetadata) || value.icon !== undefined && (typeof value.icon !== "string" || value.icon.length > 100) || value.updated !== undefined && typeof value.updated !== "string") throw new VaultError(422, "Invalid database display metadata; original file preserved");
  const sources = new Set<string>(), views = new Set<string>(), pages = new Set<string>();
  for (const source of value.dataSources) {
    if (!object(source) || typeof source.title !== "string" || !Array.isArray(source.properties) || !Array.isArray(source.pageIds) || source.pageIds.length > 100_000) throw new VaultError(422, "Invalid owned data source");
    assertId(source.id); if (sources.has(source.id)) throw new VaultError(422, "Duplicate owned data source"); sources.add(source.id);
    for (const pageId of source.pageIds) { assertId(pageId); if (pageId === value.id || pageId === value.homePageId || pages.has(pageId)) throw new VaultError(422, "A Home or database cannot be its own record, and records must have one owner"); pages.add(pageId); }
  }
  for (const view of value.views) {
    if (!object(view) || typeof view.name !== "string" || typeof view.type !== "string" || !object(view.dataSource)) throw new VaultError(422, "A view requires an owned or linked data source reference");
    assertId(view.id); assertId(view.dataSource.databaseId); assertId(view.dataSource.dataSourceId);
    if (views.has(view.id)) throw new VaultError(422, "Duplicate view identity"); views.add(view.id);
    if (view.dataSource.databaseId === value.id && !sources.has(view.dataSource.dataSourceId)) throw new VaultError(422, "A local view refers to a missing owned source");
  }
  if (value.kind === "wiki" && (value.dataSources.length !== 1 || typeof value.homePageId !== "string")) throw new VaultError(422, "A wiki requires one owned source and a real Home page reference");
}

/** File resources are normalized only in memory; metadata.json never caches their definitions. */
export function createDatabaseFiles(host: { root: string; platform: VaultPlatform; readOptional(file: string): Promise<string | null> }) {
  const { fs, path } = host.platform, folder = path.join(host.root, "databases");
  let baseline = new Map<string, { source: string; document: DatabaseDocument }>();
  let inventoryRead = false;
  let current = new Map<string, { source: string; document: DatabaseDocument }>();
  let forced = new Set<string>();
  let pageIdChanges = new Map<string, string>();
  const file = (id: string) => { assertId(id); return path.join(folder, `${id}.json`); };
  async function documents() {
    const found = new Map<string, { source: string; document: DatabaseDocument }>();
    let entries;
    try {
      const stat = await fs.lstat(folder); if (!stat.isDirectory() || stat.isSymbolicLink()) throw new VaultError(422, "databases/ must be a real directory");
      entries = await fs.readdir(folder, { withFileTypes: true });
    } catch (error) { if ((error as StorageError).code === "ENOENT") return found; throw error; }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.name.endsWith(".json")) continue;
      if (!entry.isFile() || entry.isSymbolicLink()) throw new VaultError(422, "Database files cannot be symbolic links or directories");
      const id = entry.name.slice(0, -5); assertId(id);
      const source = (await host.readOptional(file(id)))!;
      let document: unknown; try { document = JSON.parse(source); } catch { throw new VaultError(422, `Invalid database JSON: ${entry.name}; original file preserved`); }
      validateDatabaseDocument(document, id); found.set(id, { source, document });
    }
    return found;
  }
  function project(index: DatabaseIndex) {
    for (const group of ["databases", "dataSources", "views"]) if (index[group] !== undefined && !object(index[group])) throw new VaultError(422, "Invalid legacy database resources; original metadata preserved");
    const resources = Object.fromEntries(["databases", "dataSources", "views"].map(group => [group, { ...(index[group] as object ?? {}) }])) as unknown as DatabaseResources;
    for (const [id, { document }] of current) {
      if (resources.databases[id]) throw new VaultError(422, "A database has both legacy and file definitions; migrate or resolve the duplicate before editing");
      const sources = document.dataSources.map(source => source.id), refs = document.views.map(view => view.dataSource.dataSourceId);
      resources.databases[id] = { ...omit(document, ["version", "dataSources", "views"]), id, title: document.title, pageId: id, storage: "file", ownedDataSourceIds: sources, dataSourceIds: [...new Set([...sources, ...refs])], viewIds: document.views.map(view => view.id), revision: "" } as Database;
      for (const source of document.dataSources) {
        if (resources.dataSources[source.id]) throw new VaultError(422, "A data source has more than one definition or owner");
        resources.dataSources[source.id] = { ...omit(source, ["pageIds", "revision"]), ownerDatabaseId: id, revision: "" } as DatabaseDataSource;
      }
      for (const view of document.views) {
        if (resources.views[view.id]) throw new VaultError(422, "Duplicate database view identity");
        resources.views[view.id] = { ...omit(view, ["dataSource", "revision"]), id: view.id, name: String(view.name), type: view.type as DatabaseView["type"], databaseId: id, dataSourceId: view.dataSource.dataSourceId, sourceDatabaseId: view.dataSource.databaseId, linked: view.dataSource.databaseId !== id, revision: "" } as DatabaseView;
      }
    }
    Object.assign(index, resources);
    // Remove old inverse caches for file-owned sources, then derive them from pageIds.
    const sourceIds = new Set([...current.values()].flatMap(value => value.document.dataSources.map(source => source.id)));
    for (const entry of Object.values(index.pages)) if (sourceIds.has(entry.dataSourceId as string)) { delete entry.dataSourceId; delete entry.wikiMembership; }
    const membership = new Set<string>();
    const containers = new Set([...Object.keys(resources.databases), ...[...current.values()].flatMap(({ document }) => typeof document.homePageId === "string" ? [document.homePageId] : [])]);
    for (const [id, { document }] of current) {
      const wiki = document.kind === "wiki", home = typeof document.homePageId === "string" ? document.homePageId : undefined;
      const entry = { ...(document.pageMetadata as object ?? {}), ...(index.pages[id] ?? {}), id } as Record<string, unknown>;
      for (const key of displayFields) if (document[key] !== undefined) entry[key] = document[key];
      entry.databaseId = id;
      if (wiki) entry.wiki = true;
      entry.properties = { ...(entry.properties as object ?? {}), ...(document.properties as object ?? {}) };
      if (wiki && home === id) { entry.wiki = true; entry.file ??= `${id}.md`; }
      else { entry.__databaseFile = id; delete entry.file; delete entry.sourceHash; }
      index.pages[id] = entry;
      for (const source of document.dataSources) for (const pageId of source.pageIds) {
        if (containers.has(pageId)) throw new VaultError(422, "A database or its Home cannot be a data source record");
        if (membership.has(pageId)) throw new VaultError(422, "A page is owned by more than one data source"); membership.add(pageId);
        const member = index.pages[pageId] ?? { id: pageId, file: `${pageId}.md` };
        member.dataSourceId = source.id; if (wiki) member.wikiMembership = id; index.pages[pageId] = member;
      }
    }
    for (const { document } of current.values()) for (const view of document.views) {
      const ref = view.dataSource, source = resources.dataSources[ref.dataSourceId];
      if (source && source.ownerDatabaseId && source.ownerDatabaseId !== ref.databaseId) throw new VaultError(422, "A linked view points to a different source owner");
      if (!source) resources.dataSources[ref.dataSourceId] = { id: ref.dataSourceId, ownerDatabaseId: ref.databaseId, title: "Unavailable linked source", properties: [{ id: "title", key: "title", name: "Name", type: "title" }], unavailable: true, revision: "" };
    }
    return index;
  }
  function owner(index: DatabaseIndex, sourceId: string): string | undefined {
    const sources = index.dataSources as Record<string, DatabaseDataSource>, databases = index.databases as Record<string, Database>;
    const source = sources[sourceId]; if (typeof source?.ownerDatabaseId === "string") return source.ownerDatabaseId;
    const candidates = Object.values(databases).filter(db => db.dataSourceIds.includes(sourceId));
    const parents = new Set(Object.values(index.pages).filter(page => page.dataSourceId === sourceId).map(page => page.parent));
    return candidates.find(db => parents.has(db.pageId ?? db.id))?.id ?? candidates[0]?.id;
  }
  function portableMetadata(id: string, metadata: Record<string, unknown>) {
    const result = { ...metadata }; delete result.__databaseFile;
    for (const { document } of current.values()) {
      if (document.dataSources.some(source => source.id === result.dataSourceId)) { delete result.dataSourceId; delete result.wikiMembership; }
      if (document.kind === "wiki" && document.homePageId === id && document.id === id) {
        for (const key of [...displayFields, "databaseId", "wiki"]) delete result[key];
        result.properties = omit(result.properties as Record<string, unknown> ?? {}, ["cover", "coverPosition"]);
      }
    }
    return result;
  }
  async function plan(index: DatabaseIndex, before: string | null): Promise<DatabaseFileChange[]> {
    const raw: DatabaseIndex = before === null ? { version: 1, pages: {} } : JSON.parse(before) as DatabaseIndex;
    const databases = (index.databases ?? {}) as Record<string, Database>, sources = (index.dataSources ?? {}) as Record<string, DatabaseDataSource>, views = (index.views ?? {}) as Record<string, DatabaseView>;
    const legacy = (raw.databases ?? {}) as Record<string, Database>;
    const managed = new Set([...baseline.keys(), ...forced, ...Object.keys(databases).filter(id => !legacy[id])]);
    const sourceIds = new Set([...baseline.values()].flatMap(value => value.document.dataSources.map(source => source.id)));
    const viewIds = new Set([...baseline.values()].flatMap(value => value.document.views.map(view => view.id)));
    const files: DatabaseFileChange[] = [];
    for (const id of managed) {
      const database = databases[id], existing = baseline.get(id);
      if (!database) { if (existing) files.push({ path: `databases/${id}.json`, before: existing.source, after: null }); continue; }
      const root: Record<string, unknown> = { ...existing?.document, ...omit(database, ["revision", "storage", "pageId", "ownedDataSourceIds", "dataSourceIds", "viewIds", "dataSources", "views"]) };
      const entry = index.pages[id];
      if (entry?.databaseId === id) {
        for (const key of displayFields) if (entry[key] !== undefined) root[key] = entry[key];
        root.properties = isWikiDatabase(database) && (database.homePageId ?? id) === id ? { ...omit(root.properties as Record<string, unknown> ?? {}, ["cover", "coverPosition"]), ...Object.fromEntries(Object.entries(entry.properties as object ?? {}).filter(([key]) => ["cover", "coverPosition"].includes(key))) } : { ...(entry.properties as object ?? {}) };
        if (!isWikiDatabase(database) || (database.homePageId ?? id) !== id) root.pageMetadata = omit(entry, [...displayFields, "id", "file", "sourceHash", "databaseId", "wiki", "__databaseFile", "properties"]);
      }
      const owned = Object.values(sources).filter(source => !source.unavailable && owner(index, source.id) === id);
      const ownedSources = owned.map(source => {
        sourceIds.add(source.id);
        const previous = (existing?.document.dataSources.find(item => item.id === source.id)?.pageIds ?? []).map(id => pageIdChanges.get(id) ?? id);
        // Keep the stable order and recoverable references to files that are currently absent.
        const retained = previous.filter(id => !index.pages[id] || index.pages[id].dataSourceId === source.id);
        const members = Object.entries(index.pages).filter(([, page]) => page.dataSourceId === source.id).map(([id]) => id);
        return { ...omit(source, ["ownerDatabaseId", "revision", "unavailable"]), id: source.id, pageIds: [...new Set([...retained, ...members])] };
      });
      const localViews = database.viewIds.map(viewId => {
        const view = views[viewId]; if (!view || view.databaseId !== id) throw new VaultError(422, "Database refers to a missing or foreign view"); viewIds.add(viewId);
        const sourceOwner = owner(index, view.dataSourceId) ?? view.sourceDatabaseId;
        if (typeof sourceOwner !== "string") throw new VaultError(422, "A view requires an explicit data source owner");
        const previous = existing?.document.views.find(item => item.id === viewId)?.dataSource;
        return { ...omit(view, ["revision", "databaseId", "dataSourceId", "sourceDatabaseId", "linked"]), dataSource: { ...previous, databaseId: sourceOwner, dataSourceId: view.dataSourceId } };
      });
      const document = { ...root, version: 1, id, kind: isWikiDatabase(database) ? "wiki" : "database", ...(isWikiDatabase(database) ? { homePageId: database.homePageId ?? database.pageId ?? id } : {}), dataSources: ownedSources, views: localViews };
      validateDatabaseDocument(document, id);
      const after = JSON.stringify(document, null, 2) + "\n";
      if (!existing || canonical(JSON.parse(after)) !== canonical(existing.document)) files.push({ path: `databases/${id}.json`, before: existing?.source ?? null, after });
      // New imported ordinary databases may carry the old empty host. Archive it with the same transaction.
      if (!existing && (!isWikiDatabase(database) || document.homePageId !== id) && entry?.databaseId === id && typeof entry.file === "string") {
        const source = await host.readOptional(path.join(host.root, "pages", `${id}.md`));
        if (source !== null) {
          if (source !== "") throw new VaultError(422, "A legacy database host contains Markdown. Choose a reviewed Home/page mapping before migrating; its source was preserved.");
          files.push({ path: `pages/${id}.md`, before: source, after: null });
        }
      }
    }
    const metadata = { ...index, pages: {} } as DatabaseIndex;
    for (const [id, entry] of Object.entries(index.pages)) {
      if (managed.has(id) && databases[id] && (!isWikiDatabase(databases[id]) || (databases[id].homePageId ?? id) !== id)) continue;
      const portable = { ...entry }; delete portable.__databaseFile;
      if (sourceIds.has(portable.dataSourceId as string)) { delete portable.dataSourceId; delete portable.wikiMembership; }
      if (managed.has(id) && databases[id] && isWikiDatabase(databases[id])) {
        for (const key of [...displayFields, "databaseId", "wiki"]) delete portable[key];
        portable.properties = omit(portable.properties as Record<string, unknown> ?? {}, ["cover", "coverPosition"]);
      }
      metadata.pages[id] = portable;
    }
    for (const [group, managedIds] of [["databases", managed], ["dataSources", sourceIds], ["views", viewIds]] as const) {
      const values = Object.fromEntries(Object.entries(index[group] as object ?? {}).filter(([id, item]) => !managedIds.has(id) && !(object(item) && item.unavailable)));
      if (Object.keys(values).length || Object.prototype.hasOwnProperty.call(raw, group)) metadata[group] = values; else delete metadata[group];
    }
    const after = JSON.stringify(metadata, null, 2) + "\n";
    if (after !== before) files.push({ path: "metadata.json", before, after });
    return files;
  }
  return {
    folder, file, plan, portableMetadata,
    snapshots() { return [...baseline].map(([id, value]) => ({ path: "databases/" + id + ".json", source: value.source })); },
    begin() { baseline = new Map(); current = new Map(); inventoryRead = false; forced.clear(); pageIdChanges.clear(); },
    remapPageIds(ids: Map<string, string>) { pageIdChanges = ids; },
    force(ids: string[]) { for (const id of ids) forced.add(id); },
    async read(raw: DatabaseIndex) {
      const found = await documents();
      if (inventoryRead && (found.size !== baseline.size || [...found.keys()].some(id => !baseline.has(id)))) throw new VaultError(409, "The database file inventory changed during this operation; original files were preserved. Reopen before retrying.");
      current = found;
      if (!inventoryRead) { baseline = new Map(current); inventoryRead = true; }
      return project(structuredClone(raw));
    },
    async accept() { current = await documents(); baseline = new Map(current); inventoryRead = true; forced.clear(); pageIdChanges.clear(); },
    async listDocuments() { return [...(await documents()).values()].map(value => value.document); },
    document(id: string) { return current.get(id)?.document; },
    proxies(index: DatabaseIndex, actualIds: Set<string>) {
      return [...current.values()].flatMap(({ document }) => {
        if (actualIds.has(document.id)) return [];
        const database = (index.databases as Record<string, Database>)[document.id];
        const metadata = { ...(index.pages[document.id] ?? {}), id: document.id, __databaseFile: document.id };
        const page: Page = { id: document.id, title: database.title, parent: typeof database.parent === "string" ? database.parent : null, icon: database.icon ?? "table-2", properties: database.properties as Record<string, unknown> ?? {}, body: "", bodyFormat: "notion-markdown", databaseId: document.id, databaseProxy: true, ...(isWikiDatabase(database) ? { wiki: true } : {}), revision: token(database), updated: typeof database.updated === "string" ? database.updated : "", ...(database.fullWidth === undefined ? {} : { fullWidth: database.fullWidth as boolean }), ...(database.trashed === undefined ? {} : { trashed: database.trashed }), ...(database.favorite === undefined ? {} : { favorite: database.favorite as boolean }), ...(database.sidebarOrder === undefined ? {} : { sidebarOrder: database.sidebarOrder as string }) };
        return [{ page, metadata, source: "", filePath: file(document.id) }];
      });
    },
  };
}
