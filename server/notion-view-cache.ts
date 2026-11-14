import { notionCachePath } from "./notion-desktop-cache.js";
import { notionViewName } from "./notion-view-names.js";

type Json = Record<string, any>;
export type CachedNotionView = { id: string; parentId: string; sourceId: string; type: string; name: string | null; version: number; format: Json; query: Json; pageOrder: string[] };
export type NotionViewCache = { views: CachedNotionView[]; warning?: string };
export type ReadNotionViewCache = (databaseId: string, viewIds: readonly string[], sourceIds: readonly string[]) => Promise<NotionViewCache>;
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const object = (value: unknown): value is Json => !!value && typeof value === "object" && !Array.isArray(value);
const same = (a: unknown, b: unknown) => typeof a === "string" && typeof b === "string" && a.replaceAll("-", "").toLowerCase() === b.replaceAll("-", "").toLowerCase();

/** Only API-listed views and API-readable sources, scoped by the owning live
 * database, account and workspace. Cached pointers never authorize new reads. */
export async function readNotionViewCache(databaseId: string, viewIds: readonly string[], sourceIds: readonly string[], file = notionCachePath()): Promise<NotionViewCache> {
  if (!file) return { views: [], warning: "Local Notion view recovery is unavailable on this host." };
  if (!uuid.test(databaseId) || viewIds.length > 10000 || sourceIds.length > 200 || [...viewIds, ...sourceIds].some(id => !uuid.test(id))) return { views: [], warning: "Local Notion view recovery exceeds its scope or size limit." };
  let db: import("node:sqlite").DatabaseSync | undefined;
  try {
    const { DatabaseSync } = await import("node:sqlite");
    db = new DatabaseSync(file, { readOnly: true, timeout: 1000 }); db.exec("BEGIN");
    const roots = db.prepare("SELECT meta_user_id,space_id,view_ids,collection_id FROM block WHERE id=? AND alive=1 AND type IN ('collection_view','collection_view_page')").all(databaseId);
    if (roots.length !== 1) return { views: [], warning: "Database is missing or ambiguous in the local Notion cache; API view definitions are retained." };
    const root = roots[0], declared = JSON.parse(String(root.view_ids || "[]"));
    if (!Array.isArray(declared)) return { views: [] };
    const query = db.prepare("SELECT id,type,name,version,format,query2,page_sort FROM collection_view WHERE id=? AND parent_id=? AND parent_table='block' AND meta_user_id=? AND space_id=? AND alive=1");
    const views: CachedNotionView[] = []; let bytes = 0;
    for (const id of new Set(viewIds)) {
      if (!declared.includes(id)) continue;
      const rows = query.all(id, databaseId, root.meta_user_id, root.space_id); if (rows.length !== 1) continue;
      const row = rows[0]; bytes += Buffer.byteLength(JSON.stringify(row)); if (bytes > 2 * 1024 * 1024) throw Error("size");
      const format = JSON.parse(String(row.format || "{}")), settings = JSON.parse(String(row.query2 || "{}")), pageOrder = JSON.parse(String(row.page_sort || "[]"));
      if (!object(format) || !object(settings) || !Array.isArray(pageOrder) || pageOrder.length > 10000 || pageOrder.some(id => typeof id !== "string" || !uuid.test(id)) || !Number.isSafeInteger(row.version) || Number(row.version) < 0 || row.name !== null && (typeof row.name !== "string" || row.name.length > 500)) continue;
      const pointer = format.collection_pointer;
      if (pointer && (!object(pointer) || pointer.table !== "collection" || pointer.spaceId && !same(pointer.spaceId, root.space_id))) continue;
      const sourceId = pointer?.id ?? root.collection_id;
      if (typeof sourceId !== "string" || !sourceIds.includes(sourceId)) continue;
      if (!["table", "board", "gallery", "list", "calendar", "timeline", "chart", "feed", "map"].includes(String(row.type))) continue;
      views.push({ id, parentId: databaseId, sourceId, type: String(row.type), name: row.name as string | null, version: Number(row.version), format, query: settings, pageOrder });
    }
    db.exec("COMMIT"); return { views };
  } catch { return { views: [], warning: "Local Notion view recovery could not be read. API view definitions are retained." }; }
  finally { db?.close(); }
}

/** Fill gaps, never replace conflicting public identities/types/settings. Keep
 * the original API object separately; this is a recoverable desktop snapshot. */
export function supplementNotionView(raw: Json, cached: CachedNotionView, databaseId: string, sourceIds: readonly string[]) {
  if (!same(raw.id, cached.id) || !same(databaseId, cached.parentId) || !sourceIds.includes(cached.sourceId) || raw.type && raw.type !== cached.type || raw.data_source_id && !same(raw.data_source_id, cached.sourceId) || raw.parent?.database_id && !same(raw.parent.database_id, databaseId)) return;
  const effective: Json = { ...raw, type: raw.type ?? cached.type, data_source_id: raw.data_source_id ?? cached.sourceId, parent: raw.parent ?? { type: "database_id", database_id: databaseId } };
  effective.name = notionViewName(effective, cached);
  effective.configuration = { type: effective.type, ...(object(raw.configuration) ? raw.configuration : {}) };
  const properties = cached.format[`${effective.type}_properties`];
  if (!Object.hasOwn(effective.configuration, "properties") && Array.isArray(properties)) effective.configuration.properties = properties.filter(entry => object(entry) && typeof entry.property === "string" && typeof entry.visible === "boolean").map(entry => ({ property_id: entry.property, visible: entry.visible, ...(typeof entry.width === "number" ? { width: entry.width } : {}) }));
  if (!Object.hasOwn(effective.configuration, "map_by") && effective.type === "map" && typeof cached.query.map_by === "string") effective.configuration.map_by = cached.query.map_by;
  const date = cached.query.calendar_by ?? cached.query.timeline_by;
  if (!Object.hasOwn(effective.configuration, "date_property_id") && ["calendar", "timeline"].includes(effective.type) && typeof date === "string") effective.configuration.date_property_id = date;
  const changed = JSON.stringify(effective) !== JSON.stringify(raw) || cached.pageOrder.length > 0;
  return changed ? { effective, evidence: cached } : undefined;
}
