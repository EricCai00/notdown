import type { Database, DatabaseDataSource, DatabaseProperty, DatabaseView } from "./database-model";

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const propertyId = (value: string) => { try { return decodeURIComponent(value); } catch { return value; } };
const sameSource = (left: string, right: string) => left.replace(/-/g, "").toLowerCase() === right.replace(/-/g, "").toLowerCase();

/** Use the first available table for this source; all fields remain accessible locally. */
export function notionTableProperties(fields: DatabaseProperty[], views: unknown, sourceId: string): DatabaseProperty[] {
  const fallback = [...fields.filter(field => field.type === "title"), ...fields.filter(field => field.type !== "title")];
  if (!Array.isArray(views)) return fallback;
  for (const view of views) {
    if (!object(view) || view.type !== "table" || typeof view.data_source_id !== "string" || !sameSource(view.data_source_id, sourceId)
      || !object(view.configuration) || view.configuration.type !== "table" || !Array.isArray(view.configuration.properties)) continue;
    const ordered: DatabaseProperty[] = [];
    for (const entry of view.configuration.properties) {
      if (!object(entry) || typeof entry.property_id !== "string") continue;
      const id = propertyId(entry.property_id);
      const field = fields.find(field => object(field.notion) && typeof field.notion.id === "string" && propertyId(field.notion.id) === id)
        ?? fields.find(field => field.name === entry.property_id);
      if (field && !ordered.includes(field)) ordered.push(field);
    }
    if (!ordered.length) continue;
    // Notion may omit the title/default columns from a partial configuration.
    const title = fields.find(field => field.type === "title");
    if (title && !ordered.includes(title)) ordered.unshift(title);
    return [...ordered, ...fallback.filter(field => !ordered.includes(field))];
  }
  return fallback;
}

export function databaseViewProperties(source: DatabaseDataSource, view: DatabaseView | undefined, database: Database): DatabaseProperty[] {
  let fields = view?.propertyIds ? view.propertyIds.map(id => source.properties.find(field => field.id === id)).filter((field): field is DatabaseProperty => !!field) : [...source.properties];
  // Early imports stored the schema object's iteration order as the default view.
  // Project only that untouched default; never rewrite metadata while reading it.
  if (object(source.notion) && typeof source.notion.id === "string" && source.properties[0]?.type !== "title"
    && fields.length === source.properties.length && fields.every((field, index) => field.id === source.properties[index].id)) {
    fields = notionTableProperties(fields, database.notionViews, source.notion.id);
  }
  if (!fields.some(field => field.type === "title")) {
    const title = source.properties.find(field => field.type === "title");
    if (title) fields.unshift(title);
  }
  return fields;
}
