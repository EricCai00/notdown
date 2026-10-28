import path from "node:path";
import { dateTime } from "../src/features/dates/date-mention.js";
import { attributesXml } from "../src/document/notion-syntax.js";
import { notionSourceTags } from "../src/document/notion-v2.js";

type Json = Record<string, any>;
export type CachedNotionBlock = {
  id: string; type: string; version: number; lastEdited: number;
  properties: Json;
  format?: Json; content?: string[]; parentId?: string; parentTable?: string;
  crdtData?: string; crdtEncoding?: "text" | "base64"; crdtFormatVersion?: number;
};
export type NotionCacheSnapshot = { blocks: CachedNotionBlock[]; privateBlocks?: CachedNotionBlock[]; warning?: string };
export type ReadNotionCache = (pageId: string, blockIds: readonly string[]) => Promise<NotionCacheSnapshot>;
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

/** A fixed local path, never a client-supplied filesystem path. No account,
 * cookie, permission or unrelated page records are exported. */
export function notionCachePath(): string | undefined {
  return process.platform === "win32" && process.env.APPDATA
    ? path.join(process.env.APPDATA, "Notion", "notion.db") : undefined;
}

export async function readNotionDesktopCache(
  pageId: string, blockIds: readonly string[], databasePath = notionCachePath(),
): Promise<NotionCacheSnapshot> {
  if (!databasePath) return { blocks: [], warning: "Local Notion desktop cache is unavailable on this host." };
  if (!uuid.test(pageId) || blockIds.length > 10000 || blockIds.some(id => !uuid.test(id)))
    return { blocks: [], warning: "Local Notion cache request exceeds its scope or size limit." };
  // Dynamic loading permits API-only imports when the runtime lacks node:sqlite.
  let db: import("node:sqlite").DatabaseSync | undefined;
  try {
    const { DatabaseSync } = await import("node:sqlite");
    db = new DatabaseSync(databasePath, { readOnly: true, timeout: 1000 });
    db.exec("BEGIN");
    const roots = db.prepare("SELECT meta_user_id,space_id FROM block WHERE id=? AND alive=1").all(pageId);
    if (roots.length !== 1) return { blocks: [], warning: "Requested page is missing or ambiguous across accounts in the local Notion cache." };
    const root = roots[0];
    const query = db.prepare("SELECT id,type,version,last_edited_time,properties FROM block WHERE id=? AND meta_user_id=? AND space_id=? AND alive=1");
    const columns = new Set(db.prepare("PRAGMA table_info(block)").all().map(row => String(row.name)));
    const crdtColumns = columns.has("crdt_data") && columns.has("crdt_format_version") ? ",crdt_data,crdt_format_version" : "";
    const privateQuery = ["format", "content", "parent_id", "parent_table"].every(name => columns.has(name))
      ? db.prepare(`SELECT id,type,version,last_edited_time,properties,format,content,parent_id,parent_table${crdtColumns} FROM block WHERE id=? AND meta_user_id=? AND space_id=? AND alive=1`) : undefined;
    const blocks: CachedNotionBlock[] = [];
    const privateBlocks = new Map<string, CachedNotionBlock>();
    let bytes = 0;
    const readPrivate = (id: string, parent?: string, ancestors = new Set<string>()) => {
      if (!uuid.test(id) || ancestors.has(id) || ancestors.size >= 30 || privateBlocks.size >= 1000) return;
      const row = privateQuery?.get(id, root.meta_user_id, root.space_id);
      if (!row || parent && (row.parent_id !== parent || row.parent_table !== "block")) return;
      let properties: Json, format: Json, content: string[];
      try { properties = JSON.parse(String(row.properties || "{}")); format = JSON.parse(String(row.format || "{}")); content = JSON.parse(String(row.content || "[]")); }
      catch { return; }
      bytes += Buffer.byteLength(JSON.stringify([properties, format, content]));
      const crdt = typeof row.crdt_data === "string" ? row.crdt_data : row.crdt_data instanceof Uint8Array ? Buffer.from(row.crdt_data).toString("base64") : undefined;
      bytes += crdt ? Buffer.byteLength(crdt) : 0;
      if (bytes > 10 * 1024 * 1024) throw new Error("cache snapshot too large");
      if (!properties || typeof properties !== "object" || Array.isArray(properties) || !format || typeof format !== "object" || Array.isArray(format) || !Array.isArray(content) || content.some(id => typeof id !== "string" || !uuid.test(id)) || !Number.isFinite(Number(row.version)) || !Number.isFinite(Number(row.last_edited_time))) return;
      privateBlocks.set(id, { id, type: String(row.type), version: Number(row.version), lastEdited: Number(row.last_edited_time), properties, format, content, parentId: String(row.parent_id || ""), parentTable: String(row.parent_table || ""), ...(crdt ? { crdtData: crdt, crdtEncoding: typeof row.crdt_data === "string" ? "text" : "base64", crdtFormatVersion: Number(row.crdt_format_version) } : {}) });
      // Only owned content descendants, never linked pages, databases or other pointers.
      if (!["page", "collection_view", "collection_view_page", "transclusion_reference", "alias"].includes(String(row.type)))
        for (const child of content) readPrivate(child, id, new Set([...ancestors, id]));
    };
    for (const id of new Set(blockIds)) {
      const row = query.get(id, root.meta_user_id, root.space_id);
      if (!row) continue;
      const raw = String(row.properties || "{}");
      bytes += Buffer.byteLength(raw);
      if (bytes > 10 * 1024 * 1024) throw new Error("cache snapshot too large");
      const properties = JSON.parse(raw);
      if (!properties || Array.isArray(properties) || typeof properties !== "object") continue;
      blocks.push({ id: String(row.id), type: String(row.type), version: Number(row.version), lastEdited: Number(row.last_edited_time), properties });
      if (["ai_block", "button"].includes(String(row.type))) readPrivate(id);
    }
    db.exec("COMMIT");
    return { blocks, ...(privateBlocks.size ? { privateBlocks: [...privateBlocks.values()] } : {}) };
  } catch {
    // Do not expose local paths, SQL, cached text or runtime errors in the UI.
    return { blocks: [], warning: "Local Notion cache could not be read (missing, busy or unsupported schema). API import continues without it." };
  } finally { db?.close(); }
}

function identity(start: unknown, time?: unknown, zone?: unknown): string | undefined {
  if (typeof start !== "string") return;
  if (/^\d{4}-\d\d-\d\d$/.test(start) && !time) return start;
  const raw = time && typeof time === "string" && typeof zone === "string"
    ? dateTime(start, time, zone) : start;
  if (!raw || !/T.*(?:Z|[+-]\d\d:\d\d)$/.test(raw)) return;
  const value = Date.parse(raw);
  return Number.isFinite(value) ? new Date(value).toISOString() : undefined;
}
function cachedKey(date: Json): string | undefined {
  const start = identity(date.start_date, date.start_time, date.time_zone);
  const end = date.end_date ? identity(date.end_date, date.end_time, date.time_zone) : "";
  return start && end !== undefined ? JSON.stringify([start, end]) : undefined;
}
function publicKey(date: Json): string | undefined {
  const start = identity(date.start), end = date.end ? identity(date.end) : "";
  return start && end !== undefined ? JSON.stringify([start, end]) : undefined;
}
function sourceKey(attrs: Json): string | undefined {
  return cachedKey({ start_date: attrs.start, start_time: attrs["start-time"], end_date: attrs.end, end_time: attrs["end-time"], time_zone: attrs["time-zone"] });
}
function cachedDates(properties: Json): Json[] {
  // Only real rich-text date annotations, not arbitrary objects containing a date.
  return (Array.isArray(properties.title) ? properties.title : []).flatMap((part: any) =>
    Array.isArray(part?.[1]) ? part[1].filter((mark: any) => Array.isArray(mark) && mark[0] === "d" && mark[1] && typeof mark[1] === "object").map((mark: any) => mark[1]) : []);
}

/** Convert known internal reminder shapes to the existing absolute-time carrier.
 * Calendar-day offsets use the reminder's wall time and IANA zone, across DST. */
export function cachedReminder(date: Json): string | undefined {
  const reminder = date.reminder;
  if (!reminder || typeof reminder !== "object" || !Number.isInteger(reminder.value) || reminder.value < 0 || reminder.value > 525600) return;
  const zone = date.time_zone || reminder.defaultTimeZone;
  if (typeof zone !== "string" || zone === "local") return;
  if (reminder.unit === "day" || reminder.unit === "week") {
    if (!/^\d{4}-\d\d-\d\d$/.test(date.start_date) || typeof reminder.time !== "string") return;
    const day = new Date(`${date.start_date}T12:00:00Z`);
    day.setUTCDate(day.getUTCDate() - reminder.value * (reminder.unit === "week" ? 7 : 1));
    const at = dateTime(day.toISOString().slice(0, 10), reminder.time, zone);
    return at ? new Date(at).toISOString() : undefined;
  }
  if (reminder.unit === "minute" || reminder.unit === "hour") {
    const start = dateTime(date.start_date, date.start_time, zone);
    if (!start) return;
    return new Date(Date.parse(start) - reminder.value * (reminder.unit === "hour" ? 60 : 1) * 60000).toISOString();
  }
}

/** No positional guessing: a date must occur exactly once in both page Markdown
 * and public block data, and agree with that exact cached block and edit minute.
 * Minute-granularity API timestamps can only verify an edit minute; if the API
 * supplies sub-minute precision it must match exactly. Ambiguities stay intact. */
export function supplementNotionDates(source: string, publicBlocks: readonly Json[], snapshot: NotionCacheSnapshot) {
  const tags = notionSourceTags(source).filter(tag => tag.tag === "date" && tag.selfClosing);
  const cache = new Map(snapshot.blocks.map(block => [block.id, block]));
  const candidates = new Map<string, { block: CachedNotionBlock; date: Json }[]>();
  const occurrences = new Map<string, number>();
  for (const block of publicBlocks) {
    const parts = block[block.type]?.rich_text;
    const dates: Json[] = Array.isArray(parts) ? parts.filter((p: Json) => p.type === "mention" && p.mention?.type === "date").map((p: Json) => p.mention.date) : [];
    for (const date of dates) { const key = publicKey(date); if (key) occurrences.set(key, (occurrences.get(key) || 0) + 1); }
    const cached = cache.get(block.id);
    const edited = Date.parse(block.last_edited_time);
    if (!cached || !Number.isFinite(edited) || !Number.isFinite(cached.lastEdited)) continue;
    if (edited % 60000 ? edited !== cached.lastEdited : Math.floor(edited / 60000) !== Math.floor(cached.lastEdited / 60000)) continue;
    const fromCache = cachedDates(cached.properties);
    if (!dates.length || dates.length !== fromCache.length || dates.some((date, i) => !publicKey(date) || publicKey(date) !== cachedKey(fromCache[i]))) continue;
    dates.forEach((date, i) => {
      const key = publicKey(date)!;
      if (!candidates.has(key)) candidates.set(key, []);
      candidates.get(key)!.push({ block: cached, date: fromCache[i] });
    });
  }
  const counts = new Map<string, number>();
  for (const tag of tags) { const key = sourceKey(tag.attrs); if (key) counts.set(key, (counts.get(key) || 0) + 1); }
  const evidence: { blockId: string; blockVersion: number; lastEdited: number; date: Json; applied: Record<string, string> }[] = [];
  let restored = 0, matched = 0;
  for (const tag of [...tags].reverse()) {
    const key = sourceKey(tag.attrs);
    if (!key || counts.get(key) !== 1 || occurrences.get(key) !== 1 || candidates.get(key)?.length !== 1) continue;
    const { block, date } = candidates.get(key)![0];
    const applied: Record<string, string> = {};
    const reminder = cachedReminder(date);
    if (date.reminder && !reminder) continue;
    if (reminder) {
      applied.reminder = reminder;
      const base = dateTime(date.start_date, date.start_time || "09:00", date.time_zone || date.reminder.defaultTimeZone);
      const offset = base ? (Date.parse(base) - Date.parse(reminder)) / 60000 : -1;
      if ([0, 5, 10, 15, 30, 60, 120, 1440, 2880, 10080].includes(offset)) applied["reminder-offset"] = String(offset);
    }
    const formats: Record<string, string> = { relative: "relative", LL: "full", "YYYY-MM-DD": "iso", "MM/DD/YYYY": "us", "DD/MM/YYYY": "eu" };
    if (formats[date.date_format]) applied["date-format"] = formats[date.date_format];
    // Do not replace an API/carrier value that already supplies these settings.
    if (Object.keys(applied).some(name => tag.attrs[name] !== undefined)) continue;
    matched++;
    if (reminder) restored++;
    if (!Object.keys(applied).length) continue;
    source = source.slice(0, tag.from) + `<date${attributesXml({ ...tag.attrs, ...applied })}/>` + source.slice(tag.to);
    evidence.push({ blockId: block.id, blockVersion: block.version, lastEdited: block.lastEdited, date, applied });
  }
  return { source, restored, matched, total: tags.length, evidence: evidence.reverse() };
}
