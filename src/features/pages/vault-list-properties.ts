import type { Page } from "../../shared/types";
import type { DatabaseDataSource, DatabaseProperty } from "../databases/database-model";
import { valueText } from "../databases/database-query";

export interface VaultListProperty { key: string; name: string; value: string }

function readableValue(value: unknown): string {
  if (value == null) return "—";
  if (Array.isArray(value)) return value.map(readableValue).join(", ") || "—";
  if (typeof value === "object") {
    const item = value as Record<string, unknown>;
    if (typeof item.name === "string") return item.name;
    if (typeof item.title === "string") return item.title;
    if (typeof item.start === "string") return [item.start, item.end].filter(Boolean).join(" → ");
    return JSON.stringify(value);
  }
  return String(value) || "—";
}

function propertyValue(field: DatabaseProperty | undefined, value: unknown, pages: ReadonlyMap<string, Page>): string {
  if (field?.type === "checkbox") return value == null ? "—" : value ? "☑" : "☐";
  if (field && ["select", "multi_select", "status"].includes(field.type)) return valueText(field, value) || "—";
  if (field?.type === "relation" && Array.isArray(value)) return value.map(item => {
    const record = item && typeof item === "object" ? item : {};
    return pages.get(record.pageId)?.title ?? record.title ?? record.url ?? readableValue(item);
  }).join(", ") || "—";
  if (field && ["formula", "rollup"].includes(field.type) && value && typeof value === "object") {
    const snapshot = value as Record<string, any>;
    const result = snapshot[field.type];
    if (result && typeof result.type === "string" && Object.hasOwn(result, result.type)) return readableValue(result[result.type]);
  }
  return readableValue(value);
}

/** Resolve storage keys only against this page's own source. Never infer names
 * from UUIDs, prefixes, or another source, and never rewrite stored properties. */
export function vaultListProperties(page: Page, source: DatabaseDataSource | undefined, pages: ReadonlyMap<string, Page>): VaultListProperty[] {
  const fields = new Map(source && source.id === page.dataSourceId ? source.properties.map(field => [field.key, field]) : []);
  return Object.entries(page.properties ?? {}).map(([key, value]) => {
    const field = fields.get(key);
    return { key, name: field?.name ?? key, value: propertyValue(field, value, pages) };
  });
}
