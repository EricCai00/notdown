import type { DatabaseResources, DatabaseProperty } from "../src/features/databases/database-model.js";
import { notionTableProperties } from "../src/features/databases/database-columns.js";
import { VaultError } from "./vault.js";
import { importNotionView } from "./notion-view-import.js";

type Json = Record<string, any>;
type Read = (endpoint: string, allowMissing?: boolean | "probe" | "optional", body?: Json) => Promise<Json>;
const plain = (value: unknown): string => Array.isArray(value) ? value.map(item => item?.plain_text ?? item?.text?.content ?? "").join("") : "";
const sameId = (a: string, b: string) => a.replace(/-/g, "").toLowerCase() === b.replace(/-/g, "").toLowerCase();

/** Database discovery is read-only. The caller supplies the bounded, archived transport. */
export function notionDatabaseImport(options: {
  read: Read;
  normalizeId: (value: unknown) => string;
  warn: (message: string) => void;
  enqueue: (id: string, parent: string | null, record?: Json) => void;
  enqueueDatabase: (id: string, parent: string, info: { title: string; icon: string }) => void;
  includeChildren?: boolean;
  onResource?: (title: string) => void;
}) {
  const { read, normalizeId, warn, enqueue } = options;
  const databases = new Map<string, Json>();
  const sources = new Map<string, Json>();
  const sourceByPage = new Map<string, string>();
  const records = new Map<string, Json>();
  const completedProperties = new Set<string>();
  const viewsByDatabase = new Map<string, Json[]>();
  const wikiIds = new Set<string>();
  const homeIds = new Set<string>();
  const sourceHosts = new Map<string, string>();
  const nestedSources = new Map<string, string>();
  const unavailableDatabases = new Set<string>();
  const activeDatabases = new Set<string>();
  const sourceIdsByDatabase = new Map<string, Set<string>>();

  async function importSource(sourceId: string, hostId: string, supplied?: Json, optional = false) {
    if (sources.has(sourceId)) return true;
    const source = supplied?.properties ? supplied : await read(`/data_sources/${sourceId}`, optional);
    if (source.object === "unavailable") { warn(`View data source ${sourceId} is unavailable; its view definition is archived without inventing local records.`); return false; }
    if (source.object !== "data_source" || typeof source.id !== "string" || !sameId(source.id, sourceId) || !source.properties || typeof source.properties !== "object" || Array.isArray(source.properties))
      throw new VaultError(502, "Notion did not return the requested data source schema.");
    sources.set(sourceId, source); sourceHosts.set(sourceId, hostId);
    const result = await paginate(cursor => read(`/data_sources/${sourceId}/query`, false, { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }));
    for (const record of result!) {
      if (record?.object === "data_source") {
        wikiIds.add(hostId);
        if (options.includeChildren === false) continue;
        const childSourceId = normalizeId(record.id);
        const detail = record.parent?.database_id ? record : await read(`/data_sources/${childSourceId}`);
        const childDatabaseId = normalizeId(detail.parent?.database_id);
        if (activeDatabases.has(childDatabaseId) || childSourceId === sourceId) throw new VaultError(422, "Notion returned a cyclic Wiki database membership.");
        const info = await database(childDatabaseId);
        if (info) {
          nestedSources.set(childDatabaseId, sourceId);
          options.enqueueDatabase(childDatabaseId, hostId, info);
        }
        continue;
      }
      if (record?.object !== "page") throw new VaultError(422, "A Notion data source query returned an unsupported record; no import was prepared.");
      const pageId = normalizeId(record.id);
      if (sourceByPage.has(pageId) && sourceByPage.get(pageId) !== sourceId) throw new VaultError(422, "Notion returned conflicting data source membership for a page.");
      sourceByPage.set(pageId, sourceId);
      if (!completedProperties.has(pageId)) records.set(pageId, record);
      enqueue(pageId, hostId, record);
    }
    return true;
  }

  async function paginate(load: (cursor?: string) => Promise<Json>, optional = false) {
    const all: Json[] = [], cursors = new Set<string>();
    let cursor: string | undefined;
    do {
      const response = await load(cursor);
      if (optional && response.object === "unavailable") return null;
      if (!Array.isArray(response.results) || typeof response.has_more !== "boolean")
        throw new VaultError(502, "Invalid Notion database/property pagination response.");
      if (response.request_status?.type === "incomplete")
        throw new VaultError(422, "Notion reported an incomplete database query. Select a smaller database; no partial import was prepared.");
      all.push(...response.results);
      if (!response.has_more) return all;
      if (typeof response.next_cursor !== "string" || !response.next_cursor || cursors.has(response.next_cursor))
        throw new VaultError(502, "Notion pagination did not advance; no incomplete import was prepared.");
      cursor = response.next_cursor;
      cursors.add(cursor);
    } while (true);
  }

  async function database(id: string, supplied?: Json): Promise<{ title: string; icon: string } | null> {
    if (unavailableDatabases.has(id)) return null;
    if (databases.has(id)) return { title: databases.get(id)!.localTitle, icon: databases.get(id)!.icon?.emoji || "database" };
    const raw = supplied ?? await read(`/databases/${id}`, true);
    if (raw.object === "unavailable") {
      unavailableDatabases.add(id);
      warn(`A child database ${id} is unavailable; its remote reference is retained and its records could not be imported.`);
      return null;
    }
    if (raw.object !== "database" || typeof raw.id !== "string" || !sameId(raw.id, id) || !Array.isArray(raw.data_sources))
      throw new VaultError(502, "Notion did not return the requested database and data sources.");
    const title = (plain(raw.title).trim() || "Untitled database").slice(0, 500);
    options.onResource?.(title);
    databases.set(id, { ...raw, localTitle: title });
    activeDatabases.add(id);
    const localSources = new Set<string>();
    sourceIdsByDatabase.set(id, localSources);
    if (raw.is_wiki === true) wikiIds.add(id);
    for (const sourceRef of raw.data_sources) {
      const sourceId = normalizeId(sourceRef.id);
      await importSource(sourceId, id, sourceRef.object === "data_source" ? sourceRef : undefined);
      localSources.add(sourceId);
    }
    const remoteViews = await paginate(cursor => read(`/views?${raw.notionSourceOnly ? "data_source_id" : "database_id"}=${encodeURIComponent(id)}&page_size=100${cursor ? `&start_cursor=${encodeURIComponent(cursor)}` : ""}`, "optional"), true);
    if (!remoteViews) warn(`Database ${title}: views are unavailable. A local table view is created.`);
    else {
      const full: Json[] = [];
      for (const item of remoteViews) {
        const viewId = normalizeId(item.id);
        const detail = await read(`/views/${viewId}`, "optional");
        if (detail.object !== "unavailable" && (detail.object !== "view" || typeof detail.id !== "string" || !sameId(detail.id, viewId))) throw new VaultError(502, "Notion returned a mismatched view.");
        const view = detail.object === "unavailable" ? item : detail;
        // Listing by source also returns views in other database containers.
        if (raw.notionSourceOnly && view.data_source_id && !sameId(view.data_source_id, id)) continue;
        full.push(view);
        if (view.data_source_id) {
          const sourceId = normalizeId(view.data_source_id);
          if (wikiIds.has(id) && !localSources.has(sourceId)) { warn(`Wiki ${title}: a linked view uses a different source; its definition is archived. A local wiki keeps one page source.`); continue; }
          if (!await importSource(sourceId, id, undefined, true)) continue;
          // Referenced sources are shared resources, never copies of their rows.
          localSources.add(sourceId);
        }
      }
      viewsByDatabase.set(id, full);
      if (full.some(view => !view.data_source_id)) warn(`Database ${title}: some views have no readable data source (including dashboard/Home views); their definitions are archived. Local tables show all records where view settings cannot be mapped.`);
    }
    activeDatabases.delete(id);
    return { title, icon: raw.icon?.type === "emoji" ? raw.icon.emoji : "database" };
  }

  async function dataSource(id: string, raw: Json) {
    if (raw.object !== "data_source" || typeof raw.id !== "string" || !sameId(raw.id, id))
      throw new VaultError(502, "Notion did not return the requested data source.");
    // A direct source import deliberately creates a local database wrapper for only this source.
    return database(id, { object: "database", id, title: raw.title, data_sources: [raw], notionSourceOnly: true });
  }

  async function pageProperties(pageId: string, page: Json): Promise<void> {
    if (!sourceByPage.has(pageId) || completedProperties.has(pageId)) return;
    options.onResource?.(Object.values<Json>(page.properties ?? {}).filter(property => property.type === "title").map(property => plain(property.title)).join("").trim().slice(0, 500) || "Untitled");
    const properties: Json = { ...page.properties };
    for (const [name, property] of Object.entries<Json>(properties)) {
      const type = property.type;
      const values = property[type];
      // Notion returns at most 25 inline references. Fetch complete paginated values
      // when the inline payload reaches that boundary or explicitly says has_more.
      if (!property.id || !(property.has_more === true || ["title", "rich_text", "people", "relation"].includes(type) && Array.isArray(values) && values.length >= 25 || type === "rollup" && ["incomplete", "unsupported"].includes(values?.type))) continue;
      const items = await paginate(cursor => read(`/pages/${pageId}/properties/${encodeURIComponent(decodePropertyId(property.id))}?page_size=100${cursor ? `&start_cursor=${encodeURIComponent(cursor)}` : ""}`));
      if (type === "rollup") {
        properties[name] = { ...property, notionPropertyItems: items, snapshotIncomplete: true };
        warn(`Page ${pageId}: rollup property ${name} is preserved with its paginated source items as a read-only snapshot; its aggregate is not calculated locally.`);
      } else properties[name] = { ...property, [type]: items!.flatMap(item => Array.isArray(item[type]) ? item[type] : item[type] == null ? [] : [item[type]]), has_more: false };
    }
    page.properties = properties;
    records.set(pageId, { ...page, properties });
    completedProperties.add(pageId);
  }

  async function completeProperties() {
    // A page reference can be traversed before its owning database is discovered.
    // Complete those record properties as well, after discovery has settled.
    for (const [id, record] of records) await pageProperties(id, record);
    return new Map([...records].map(([id, record]) => [id, Object.values<Json>(record.properties ?? {}).filter(property => property.type === "title").map(property => plain(property.title)).join("").trim().slice(0, 500)]));
  }

  function finish(localId: (id: string) => string, importedPages: Set<string>) {
    const resources: DatabaseResources = { databases: {}, dataSources: {}, views: {} };
    const fieldMaps = new Map<string, Map<string, DatabaseProperty>>();
    for (const [id, raw] of sources) {
      const fields: DatabaseProperty[] = [];
      const byName = new Map<string, DatabaseProperty>();
      for (const [name, property] of Object.entries<Json>(raw.properties)) {
        const remoteId = typeof property.id === "string" ? property.id : name;
        const type = fieldType(property.type);
        const field: DatabaseProperty = {
          id: localId(`field-${id}-${remoteId}`), name, key: type === "title" ? "title" : localId(`field-${id}-${remoteId}`), type,
          ...(Array.isArray(property[property.type]?.options) ? { options: property[property.type].options.map((option: Json) => ({ ...option, id: String(option.id), name: String(option.name) })) } : {}),
          ...(["formula", "rollup", "unknown", "people", "files", "relation"].includes(type) || ["created_time", "last_edited_time", "created_by", "last_edited_by", "unique_id"].includes(property.type) ? { readOnly: true } : {}),
          notion: property,
        };
        fields.push(field); byName.set(name, field);
      }
      fieldMaps.set(id, byName);
      const canonicalOwner = raw.parent?.database_id ? normalizeId(raw.parent.database_id) : undefined;
      resources.dataSources[localId(id)] = { id: localId(id), ownerDatabaseId: localId(canonicalOwner && databases.has(canonicalOwner) ? canonicalOwner : sourceHosts.get(id)!), title: (plain(raw.title).trim() || "Imported data source").slice(0, 500), properties: notionTableProperties(fields, [], id), revision: "", notion: raw };
    }
    for (const [id, raw] of databases) {
      const remoteSourceIds = [...sourceIdsByDatabase.get(id)!];
      const sourceIds = remoteSourceIds.map(localId);
      const viewIds: string[] = [];
      for (const remote of viewsByDatabase.get(id) ?? []) {
        if (!remote.data_source_id) continue;
        const remoteSourceId = normalizeId(remote.data_source_id), sourceId = localId(remoteSourceId);
        if (!sourceIds.includes(sourceId)) continue;
        const mapped = importNotionView(remote, resources.dataSources[sourceId].properties, remoteSourceId);
        const viewId = localId(`view-${id}-${normalizeId(remote.id)}`);
        if (viewIds.includes(viewId)) continue;
        for (const message of mapped.importWarnings) warn(`Database ${raw.localTitle}, view ${mapped.name}: ${message}`);
        resources.views[viewId] = { ...mapped, id: viewId, databaseId: localId(id), dataSourceId: sourceId, rowOrder: [...sourceByPage].filter(([pageId, source]) => importedPages.has(pageId) && source === remoteSourceId).map(([pageId]) => localId(pageId)), revision: "" };
        viewIds.push(viewId);
      }
      for (const sourceId of sourceIds) {
        if (viewIds.some(viewId => resources.views[viewId].dataSourceId === sourceId)) continue;
        const viewId = localId(`view-${id}-${sourceId}`);
        viewIds.push(viewId);
        // Keep the data source query's discovery order across local reloads.
        // This does not reproduce a remote Notion view's manual ordering.
        const rowOrder = [...sourceByPage].filter(([pageId, remoteSourceId]) => importedPages.has(pageId) && localId(remoteSourceId) === sourceId).map(([pageId]) => localId(pageId));
        const remoteSourceId = remoteSourceIds.find(id => localId(id) === sourceId)!;
        const fields = notionTableProperties(resources.dataSources[sourceId].properties, viewsByDatabase.get(id), remoteSourceId);
        resources.views[viewId] = { id: viewId, databaseId: localId(id), dataSourceId: sourceId, name: sourceIds.length > 1 ? resources.dataSources[sourceId].title : "All records", type: "table", propertyIds: fields.map(field => field.id), rowOrder, revision: "" };
      }
      resources.databases[localId(id)] = { id: localId(id), title: raw.localTitle, pageId: localId(id), dataSourceIds: sourceIds, viewIds, revision: "", notion: raw, notionViews: viewsByDatabase.get(id) ?? [], ...(wikiIds.has(id) ? { kind: "wiki" as const, notionWiki: true } : {}), ...(homeIds.has(id) ? { homePageId: localId(`home-${id}`) } : {}), ...(nestedSources.has(id) ? { notionWikiParentSourceId: localId(nestedSources.get(id)!) } : {}) };
    }
    const metadata = (pageId: string): Record<string, unknown> => {
      if (databases.has(pageId)) return { databaseId: localId(pageId), ...(wikiIds.has(pageId) ? { wiki: true } : {}) };
      const sourceId = sourceByPage.get(pageId);
      if (!sourceId) return {};
      const values: Record<string, unknown> = {};
      for (const [name, field] of fieldMaps.get(sourceId) ?? []) {
        const rawProperties = records.get(pageId)?.properties ?? {};
        const remoteId = (field.notion as Json)?.id;
        const property = remoteId ? Object.values<Json>(rawProperties).find(value => value.id === remoteId) : rawProperties[name];
        if (!property || property.type === "title") continue;
        values[field.key] = propertyValue(property, localId, importedPages, normalizeId);
      }
      const owner = sources.get(sourceId)?.parent?.database_id;
      return { dataSourceId: localId(sourceId), ...(owner && wikiIds.has(normalizeId(owner)) ? { wikiMembership: localId(normalizeId(owner)) } : {}), properties: values, notionProperties: records.get(pageId)?.properties ?? {} };
    };
    return { resources, metadata };
  }
  async function saveAttachments(save: (url: string, name?: string) => Promise<string>) {
    for (const [id, record] of records) {
      const properties = { ...record.properties };
      for (const [name, property] of Object.entries<Json>(properties)) {
        if (property.type !== "files" || !Array.isArray(property.files)) continue;
        const files: Json[] = [];
        for (const file of property.files) {
          const url = file[file.type]?.url;
          const local = typeof url === "string" ? await save(url, typeof file.name === "string" ? file.name : undefined) : url;
          files.push(local && local !== url ? { ...file, notionSourceUrl: url, [file.type]: { ...file[file.type], url: local } } : file);
        }
        properties[name] = { ...property, files };
      }
      records.set(id, { ...record, properties });
    }
  }
  return { database, dataSource, pageProperties, completeProperties, finish, saveAttachments,
    recordParent: (id: string, imported: Set<string>) => {
      const sourceId = sourceByPage.get(id); if (!sourceId) return undefined;
      const parent = records.get(id)?.parent;
      if (parent?.page_id) { const parentId = normalizeId(parent.page_id); if (imported.has(parentId)) return parentId; }
      const owner = sources.get(sourceId)?.parent?.database_id;
      return owner && imported.has(normalizeId(owner)) ? normalizeId(owner) : sourceHosts.get(sourceId);
    },
    rawDatabase: (id: string) => databases.get(id),
    hasHome: (id: string) => homeIds.has(id),
    markHome: (id: string) => { homeIds.add(id); },
    possibleWiki: (id: string) => wikiIds.has(id) || (databases.get(id)?.data_sources ?? []).some((ref: Json) => Object.values<Json>(sources.get(normalizeId(ref.id))?.properties ?? {}).some(field => field.type === "verification")),
  };
}

function decodePropertyId(value: string) { try { return decodeURIComponent(value); } catch { return value; } }
function fieldType(type: string): DatabaseProperty["type"] {
  if (type === "rich_text") return "text";
  if (type === "phone_number") return "phone";
  if (["created_time", "last_edited_time"].includes(type)) return "date";
  if (["created_by", "last_edited_by"].includes(type)) return "people";
  return ["title", "number", "checkbox", "date", "select", "multi_select", "status", "url", "email", "people", "relation", "files", "formula", "rollup"].includes(type) ? type as DatabaseProperty["type"] : "unknown";
}
function propertyValue(property: Json, localId: (id: string) => string, imported: Set<string>, normalizeId: (value: unknown) => string): unknown {
  const type = property.type, value = property[type];
  if (["title", "rich_text"].includes(type)) return plain(value);
  if (["select", "status"].includes(type)) return value?.id ?? null;
  if (type === "multi_select") return (value ?? []).map((option: Json) => option.id);
  if (type === "relation") return (value ?? []).map((reference: Json) => {
    const id = normalizeId(reference.id);
    return { notionPageId: id, ...(imported.has(id) ? { pageId: localId(id) } : { unresolved: true, url: `https://www.notion.so/${id.replace(/-/g, "")}` }) };
  });
  if (["created_time", "last_edited_time"].includes(type)) return value ? { start: value } : null;
  if (["created_by", "last_edited_by"].includes(type)) return value ? [value] : [];
  if (["formula", "rollup"].includes(type)) return { ...property, snapshot: true };
  if (["number", "checkbox", "date", "url", "email", "phone_number", "people", "files"].includes(type)) return value ?? null;
  return { ...property, snapshot: true };
}
