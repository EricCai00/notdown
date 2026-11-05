import type { Page } from "../../shared/types";
import type { DatabaseDataSource, DatabaseProperty } from "./database-model";

export function relationIds(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.flatMap(item => typeof item?.pageId === "string" ? [item.pageId] : []))] : [];
}

/** Inverse relations are a read projection; only Blocked by is persisted. */
export function dependencyValue(page: Page, field: DatabaseProperty, source: DatabaseDataSource, pages: Page[]): unknown {
  if (field.dependencyRole !== "blocking") return page.properties[field.key];
  const forward = source.properties.find(item => item.id === field.inversePropertyId && item.dependencyRole === "blockedBy");
  return forward ? pages.filter(item => item.dataSourceId === source.id && !item.trashed && relationIds(item.properties[forward.key]).includes(page.id)).map(item => ({ pageId: item.id, title: item.title })) : [];
}

export function projectDependencies(pages: Page[], source: DatabaseDataSource): Page[] {
  const inverse = source.properties.filter(field => field.dependencyRole === "blocking");
  if (!inverse.length) return pages;
  for (const page of pages) if (page.dataSourceId === source.id) projections.set(page, Object.fromEntries(inverse.map(field => [field.key, dependencyValue(page, field, source, pages)])));
  return pages;
}

const projections = new WeakMap<Page, Record<string, unknown>>();
export const projectedDependencyValue = (page: Page, field: DatabaseProperty) => field.dependencyRole === "blocking" ? projections.get(page)?.[field.key] ?? [] : page.properties[field.key];

export function hasDependencyCycle(pages: Page[], field: DatabaseProperty, pageId: string, value: unknown): boolean {
  const edges = new Map(pages.map(page => [page.id, relationIds(page.id === pageId ? value : page.properties[field.key])]));
  const visiting = new Set<string>(), visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    if ((edges.get(id) ?? []).some(visit)) return true;
    visiting.delete(id); visited.add(id); return false;
  };
  return [...edges.keys()].some(visit);
}
