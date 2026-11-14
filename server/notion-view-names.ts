import { notionCachePath } from "./notion-desktop-cache.js";

type Json = Record<string, any>;
export type CachedNotionViewName = { id: string; type: string; name: string | null; parentId: string; version: number };
export type NotionViewNameSnapshot = { views: CachedNotionViewName[]; warning?: string };
export type ReadNotionViewNames = (databaseId: string, viewIds: readonly string[]) => Promise<NotionViewNameSnapshot>;
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const sameId = (a: unknown, b: unknown) => typeof a === "string" && typeof b === "string" && a.replace(/-/g, "").toLowerCase() === b.replace(/-/g, "").toLowerCase();
const labels = new Map(Object.entries({ table: "Table", board: "Board", gallery: "Gallery", list: "List", calendar: "Calendar", timeline: "Timeline", chart: "Chart", feed: "Feed", map: "Map", form: "Form", dashboard: "Dashboard" }));

/** Empty names are Notion's layout labels. A literal Untitled stays a custom name
 * unless the exact cached view confirms that its stored name is empty. */
export function notionViewName(raw: Json, cached?: CachedNotionViewName): string {
  const name = typeof raw.name === "string" ? raw.name : "";
  const unnamed = name === "Untitled" && cached && sameId(cached.id, raw.id) && cached.type === raw.type &&
    sameId(cached.parentId, raw.parent?.database_id) && (cached.name === null || !cached.name.trim());
  return (name.trim() && !unnamed ? name : labels.get(raw.type) ?? "Table").slice(0, 500);
}

/** Read only API-discovered view IDs under their owning database/account/space.
 * View cache rows have no edit timestamp: this is supplemental snapshot evidence,
 * never a claim that the desktop cache is synchronized with the API. */
export async function readNotionViewNames(databaseId: string, viewIds: readonly string[], databasePath = notionCachePath()): Promise<NotionViewNameSnapshot> {
  if (!databasePath) return { views: [], warning: "Local Notion desktop cache is unavailable on this host; ambiguous Untitled view names are retained." };
  if (!uuid.test(databaseId) || viewIds.length > 10000 || viewIds.some(id => !uuid.test(id)))
    return { views: [], warning: "Local Notion view-name request exceeds its scope or size limit." };
  let db: import("node:sqlite").DatabaseSync | undefined;
  try {
    const { DatabaseSync } = await import("node:sqlite");
    db = new DatabaseSync(databasePath, { readOnly: true, timeout: 1000 });
    db.exec("BEGIN");
    const roots = db.prepare("SELECT meta_user_id,space_id FROM block WHERE id=? AND alive=1 AND type IN ('collection_view','collection_view_page')").all(databaseId);
    if (roots.length !== 1) return { views: [], warning: "Database is missing or ambiguous across accounts in the local Notion cache; ambiguous Untitled view names are retained." };
    const root = roots[0], views: CachedNotionViewName[] = [];
    const query = db.prepare("SELECT id,type,name,version FROM collection_view WHERE id=? AND parent_id=? AND parent_table='block' AND meta_user_id=? AND space_id=? AND alive=1");
    for (const id of new Set(viewIds)) {
      const rows = query.all(id, databaseId, root.meta_user_id, root.space_id);
      if (rows.length !== 1) continue;
      const row = rows[0];
      if (typeof row.type !== "string" || row.name !== null && (typeof row.name !== "string" || row.name.length > 500) || !Number.isSafeInteger(row.version) || Number(row.version) < 0) continue;
      views.push({ id, type: row.type, name: row.name as string | null, parentId: databaseId, version: Number(row.version) });
    }
    db.exec("COMMIT");
    return { views };
  } catch {
    return { views: [], warning: "Local Notion view names could not be read (missing, busy or unsupported schema). API names are retained." };
  } finally { db?.close(); }
}
