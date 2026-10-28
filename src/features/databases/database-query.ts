import type { Page } from "../../shared/types";
import type { DatabaseProperty, DatabaseDataSource, DatabaseView } from "./database-model";

export type ViewFilter = { propertyId: string; operator: string; value?: string };
export const groupable = (field: DatabaseProperty) => ["select", "status", "checkbox"].includes(field.type);
export const fieldValue = (page: Page, field: DatabaseProperty): unknown => field.type === "title" ? page.title : page.properties[field.key];
export function valueText(field: DatabaseProperty, value: unknown): string {
  if (value == null) return "";
  if (["select", "status"].includes(field.type)) return field.options?.find(option => option.id === value)?.name ?? String(value);
  if (field.type === "multi_select" && Array.isArray(value)) return value.map(id => field.options?.find(option => option.id === id)?.name ?? id).join(", ");
  if (field.type === "date" && typeof value === "object") return String((value as { start?: string }).start ?? "");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
export function filterOperators(field: DatabaseProperty): string[] {
  return ["contains", "does_not_contain", "equals", "not_equals", "is_empty", "is_not_empty", ...(["number", "date"].includes(field.type) ? ["greater_than", "less_than", "on_or_after", "on_or_before"] : [])];
}
export function validFilter(filter: unknown, fields: DatabaseProperty[]): boolean {
  if (!filter || typeof filter !== "object") return false;
  const f = filter as ViewFilter, field = fields.find(field => field.id === f.propertyId);
  if (!field || !filterOperators(field).includes(f.operator)) return false;
  if (["is_empty", "is_not_empty"].includes(f.operator)) return true;
  if (typeof f.value !== "string") return false;
  if (["contains", "does_not_contain"].includes(f.operator)) return true;
  if (field.type === "number") return !!f.value.trim() && Number.isFinite(Number(f.value));
  if (field.type === "date") return validDay(f.value);
  if (field.type === "checkbox") return ["true", "false"].includes(f.value);
  if (["select", "status", "multi_select"].includes(field.type)) return !!field.options?.some(option => option.id === f.value);
  return true;
}
function matches(page: Page, field: DatabaseProperty, filter: ViewFilter): boolean {
  const value = fieldValue(page, field), empty = value == null || value === "" || Array.isArray(value) && !value.length;
  const target = filter.value ?? "", text = valueText(field, value).toLocaleLowerCase(), wanted = target.toLocaleLowerCase();
  switch (filter.operator) {
    case "is_empty": return empty;
    case "is_not_empty": return !empty;
    case "contains": return text.includes(wanted);
    case "does_not_contain": return !text.includes(wanted);
  }
  if (empty) return filter.operator === "not_equals";
  const actual = field.type === "number" ? Number(value) : field.type === "date" ? text.slice(0, 10) : field.type === "checkbox" ? String(value) : ["select", "status"].includes(field.type) ? String(value) : text;
  const expected = field.type === "number" ? Number(target) : ["select", "status"].includes(field.type) ? target : wanted;
  const equal = field.type === "multi_select" && Array.isArray(value) ? value.includes(target) : actual === expected;
  switch (filter.operator) {
    case "equals": return equal;
    case "not_equals": return !equal;
    case "greater_than": return actual > expected;
    case "less_than": return actual < expected;
    case "on_or_after": return actual >= expected;
    case "on_or_before": return actual <= expected;
    default: return true;
  }
}
export function queryDatabase(pages: Page[], source: DatabaseDataSource, view: DatabaseView, search = ""): Page[] {
  const ranks = new Map((view.rowOrder ?? []).map((id, index) => [id, index]));
  const filters = (view.filters ?? []) as ViewFilter[];
  const query = search.trim().toLocaleLowerCase();
  const rows = pages.filter(page => page.dataSourceId === source.id && !page.trashed && (!query || source.properties.some(field => valueText(field, fieldValue(page, field)).toLocaleLowerCase().includes(query))) && (!filters.length || filters[view.filterMode === "or" ? "some" : "every"](filter => { const field = source.properties.find(field => field.id === filter.propertyId); return !field || matches(page, field, filter); })));
  rows.sort((a, b) => (ranks.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (ranks.get(b.id) ?? Number.MAX_SAFE_INTEGER));
  for (const sort of [...(view.sorts ?? [])].reverse() as { propertyId: string; direction: string }[]) {
    const field = source.properties.find(field => field.id === sort.propertyId); if (!field) continue;
    rows.sort((a, b) => {
      const av = fieldValue(a, field), bv = fieldValue(b, field);
      if (av == null || bv == null) return av == null ? bv == null ? 0 : 1 : -1;
      const order = field.type === "number" ? Number(av) - Number(bv) : field.type === "checkbox" ? Number(!!av) - Number(!!bv) : valueText(field, av).localeCompare(valueText(field, bv), undefined, { numeric: true });
      return sort.direction === "descending" ? -order : order;
    });
  }
  return rows;
}
export function databaseGroups(rows: Page[], field: DatabaseProperty, view: DatabaseView) {
  const keys = field.type === "checkbox" ? ["true", "false"] : (field.options ?? []).map(option => option.id);
  for (const page of rows) { const key = String(fieldValue(page, field) ?? ""); if (!keys.includes(key)) keys.push(key); }
  if (!keys.includes("")) keys.push("");
  const order = view.layout?.groupOrder ?? [];
  const original = [...keys];
  keys.sort((a, b) => { const rank = (id: string) => order.includes(id) ? order.indexOf(id) : order.length + original.indexOf(id); return rank(a) - rank(b); });
  return keys.map(key => ({ key, name: key === "" ? `No ${field.name}` : field.type === "checkbox" ? key === "true" ? "Checked" : "Unchecked" : field.options?.find(option => option.id === key)?.name ?? key, color: view.layout?.groupColors?.[key] ?? field.options?.find(option => option.id === key)?.color ?? "gray", pages: rows.filter(page => String(fieldValue(page, field) ?? "") === key) })).filter(group => !view.layout?.hiddenGroups?.includes(group.key) && (!view.layout?.hideEmptyGroups || group.pages.length));
}
export function validDay(day: string): boolean { return /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(day)) && new Date(day).toISOString().slice(0, 10) === day; }
export function shiftDay(day: string, days: number): string { const value = new Date(day + "T12:00:00Z"); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); }
export function calendarDate(value: unknown): { start: string; end: string; movable: boolean } | undefined {
  if (!value || typeof value !== "object") return;
  const date = value as { start?: string; end?: string; time_zone?: string };
  const start = date.start?.slice(0, 10) ?? "", end = date.end?.slice(0, 10) || start;
  if (!validDay(start) || !validDay(end) || end < start) return;
  return { start, end, movable: date.start === start && (!date.end || date.end === end) && !date.time_zone };
}
