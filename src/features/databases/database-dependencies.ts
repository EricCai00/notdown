import type { Page } from "../../shared/types";
import type { DatabaseDataSource, DatabaseProperty, DatabaseView } from "./database-model";

const decoded = (id: unknown): string => { if (typeof id !== "string") return ""; try { return decodeURIComponent(id); } catch { return id; } };
const sameId = (a: unknown, b: unknown) => !!a && !!b && decoded(a).replaceAll("-", "").toLowerCase() === decoded(b).replaceAll("-", "").toLowerCase();

/** Only an explicit same-source arrows_by binding identifies an imported graph.
 * Never infer scheduling semantics from a property's display name. */
export function timelineDependencyBinding(source: DatabaseDataSource, view: DatabaseView): { field: DatabaseProperty; imported: boolean } | undefined {
  if (view.dataSourceId !== source.id) return;
  const local = source.properties.find(field => field.type === "relation" && field.dependencyRole === "blockedBy");
  if (local) return { field: local, imported: false };
  const raw = view.notion as Record<string, any> | undefined, origin = source.notion as Record<string, any> | undefined;
  const id = raw?.configuration?.arrows_by?.property_id;
  if (typeof id === "string" && (!raw?.data_source_id || sameId(raw.data_source_id, origin?.id))) {
    const fields = source.properties.filter(field => field.type === "relation" && decoded((field.notion as any)?.id) === decoded(id));
    const field = fields.length === 1 ? fields[0] : undefined;
    if (field && sameId((field.notion as any)?.relation?.data_source_id, origin?.id)) return { field, imported: true };
  }
  return;
}

export function timelineDependencyEdges(source: DatabaseDataSource, view: DatabaseView, pages: Page[]): { from: string; to: string }[] {
  const binding = timelineDependencyBinding(source, view); if (!binding) return [];
  const records = pages.filter(page => page.dataSourceId === source.id && !page.trashed), ids = new Set(records.map(page => page.id));
  const edges = new Map<string, { from: string; to: string }>();
  for (const page of records) for (const id of relationIds(page.properties[binding.field.key])) {
    if (id === page.id || !ids.has(id)) continue;
    const edge = binding.imported ? { from: page.id, to: id } : { from: id, to: page.id };
    edges.set(`${edge.from}/${edge.to}`, edge);
  }
  return [...edges.values()];
}

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
