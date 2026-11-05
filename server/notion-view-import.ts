import type { DatabaseProperty, DatabaseView } from "../src/features/databases/database-model.js";
import { notionTableProperties } from "../src/features/databases/database-columns.js";
import { databaseViewTypes, type DatabaseLayout, type DatabaseViewType } from "../src/features/databases/database-model.js";
import { groupable } from "../src/features/databases/database-query.js";

type Json = Record<string, any>;
const decoded = (id: string) => { try { return decodeURIComponent(id); } catch { return id; } };

/** Translate only semantics the local views can actually execute. Keep every remote setting. */
export function importNotionView(raw: Json, fields: DatabaseProperty[], sourceId: string): Pick<DatabaseView, "name" | "type" | "propertyIds" | "filters" | "sorts" | "layout"> & { notion: Json; importWarnings: string[] } {
  const warnings: string[] = [];
  const fieldFor = (id: unknown) => typeof id === "string" ? fields.find(field => decoded(String((field.notion as Json)?.id)) === decoded(id)) ?? fields.find(field => field.name === id) : undefined;
  const ordered = notionTableProperties(fields, [raw], sourceId);
  const columns = raw.configuration?.properties;
  const hidden = new Set((Array.isArray(columns) ? columns : []).filter((entry: Json) => entry?.visible === false).map((entry: Json) => fieldFor(entry.property_id)?.id));
  const filters: NonNullable<DatabaseView["filters"]> = [];
  function filter(value: Json): boolean {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    if (Array.isArray(value.and) && Object.keys(value).every(key => key === "and")) return value.and.every(filter);
    const field = fieldFor(value.property), type = (field?.notion as Json)?.type;
    const condition = value[type];
    if (!field || !["title", "rich_text"].includes(type) || !condition || Object.keys(condition).length !== 1 || typeof condition.contains !== "string") return false;
    filters.push({ propertyId: field.id, operator: "contains", value: condition.contains }); return true;
  }
  const conditions = [raw.filter, ...Object.entries<Json>(raw.quick_filters ?? {}).filter(([, value]) => value && Object.keys(value).length).map(([property, value]) => ({ ...value, property }))].filter(Boolean);
  if (!conditions.every(filter)) { filters.length = 0; warnings.push("Notion filters could not be applied. No imported filter is active; configure local filters to restrict records."); }
  const sorts: NonNullable<DatabaseView["sorts"]> = [];
  for (const sort of Array.isArray(raw.sorts) ? raw.sorts : raw.sorts ? [null] : []) {
    if (!sort || typeof sort !== "object") { sorts.length = 0; warnings.push("Notion sorting could not be applied; source query order is used."); break; }
    const field = fieldFor(sort.property);
    if (!field || !["ascending", "descending"].includes(sort.direction) || !["title", "text", "number", "checkbox"].includes(field.type)) {
      sorts.length = 0; warnings.push("Notion sorting could not be applied; source query order is used."); break;
    }
    sorts.push({ propertyId: field.id, direction: sort.direction });
  }
  const type: DatabaseViewType = databaseViewTypes.filter(type => !["dashboard", "form", "map"].includes(type)).includes(raw.type) ? raw.type : "table";
  if (type !== raw.type) warnings.push(`The Notion ${raw.type || "unknown"} layout is displayed as a local table.`);
  const config = raw.configuration ?? {}, layout: DatabaseLayout = {};
  const group = fieldFor(config.group_by?.property_id);
  if (["board", "list", "gallery", "feed", "timeline"].includes(type) && group && groupable(group) && config.group_by?.group_by !== "group") {
    layout.groupBy = group.id; layout.hideEmptyGroups = config.group_by.hide_empty_groups === true;
    warnings.push("Notion group order is archived; local groups use the data source option order.");
  } else if (config.group_by) warnings.push("The source grouping is archived. Choose a supported local grouping property in View settings.");
  if (config.sub_group_by) warnings.push("Notion sub-groups are archived but not displayed locally.");
  const date = fieldFor(config.date_property_id); if (date?.type === "date") layout.datePropertyId = date.id;
  if (["month", "week"].includes(config.view_range)) layout.calendarRange = config.view_range;
  if (["small", "medium", "large"].includes(config.cover_size)) layout.cardSize = config.cover_size;
  if (config.cover?.type === "page_cover") layout.preview = "cover";
  else if (["page_content", "page_content_first"].includes(config.cover?.type)) layout.preview = "content";
  else if (config.cover?.type === "none") layout.preview = "none";
  else if (config.cover) warnings.push("The card preview source is archived. Choose page cover or content locally.");
  layout.fitImage = config.cover_aspect === "contain";
  if (["calendar", "timeline"].includes(type) && !layout.datePropertyId) warnings.push("Choose a local Date property in View settings to display this date view.");
  if (type === "board" && !layout.groupBy && !config.group_by) warnings.push("Choose a supported local grouping property in View settings to display this board.");
  if (type === "calendar" && config.show_weekends === false) warnings.push("The local calendar includes weekends.");
  if (config.subtasks && config.subtasks.display_mode !== "disabled") warnings.push("Notion sub-item display and filtering are archived; records are shown without that hierarchy.");
  if (type === "chart") warnings.push("Notion chart settings are archived. Configure local chart grouping, measure and style before using its results.");
  if (type === "timeline") warnings.push("Notion timeline scale, separate end-date properties and dependencies are archived; configure the local date range property and scale.");
  if (type === "feed") warnings.push("Notion comments, reactions and view counts are not available in the local feed.");
  const configured = Array.isArray(columns) ? columns.map((entry: Json) => fieldFor(entry?.property_id)).filter((field: DatabaseProperty | undefined): field is DatabaseProperty => !!field) : [];
  const displayFields = [...new Map([...configured, ...ordered].map(field => [field.id, field])).values()];
  return { name: String(raw.name || "Imported view").slice(0, 500), type, layout, propertyIds: displayFields.filter(field => field.type === "title" || !hidden.has(field.id)).map(field => field.id), filters, sorts, notion: raw, importWarnings: warnings };
}
