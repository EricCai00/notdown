import type { Page } from "../../shared/types";
import type { DatabaseDataSource, DatabaseProperty, DatabaseView } from "./database-model";
import { relationIds } from "./database-dependencies";

export function subitemFields(source: DatabaseDataSource) {
  const config = source.subitems;
  const parent = source.properties.find(field => field.id === config?.parentPropertyId && field.type === "relation");
  const children = source.properties.find(field => field.id === config?.childrenPropertyId && field.type === "relation");
  return parent && children ? { parent, children } : undefined;
}
export const visibleSubitems = (source: DatabaseDataSource, view: DatabaseView) => !!source.subitems?.enabled && !!subitemFields(source) && view.layout?.subitemDisplay !== "disabled";
export const nestedSubitems = (source: DatabaseDataSource, view: DatabaseView) => visibleSubitems(source, view) && (view.layout?.subitemDisplay ?? "nested") === "nested";

/** Scope is independent of search: a matching child does not become a parent because its parent failed a filter. */
export function includeSubitems(rows: Page[], pages: Page[], source: DatabaseDataSource, view: DatabaseView) {
  const pair = subitemFields(source), scope = view.layout?.subitemScope ?? "all";
  if (!visibleSubitems(source, view) || !pair || scope === "all") return rows;
  const ids = new Set(pages.filter(page => page.dataSourceId === source.id && !page.trashed).map(page => page.id));
  return rows.filter(page => {
    const parent = relationIds(page.properties[pair.parent.key])[0];
    const child = !!parent && parent !== page.id && ids.has(parent);
    return scope === "children" ? child : !child;
  });
}

/** Explicitly enabled by the user. Existing self-relation identities are reused, never names. */
export function enableSubitems(source: DatabaseDataSource, uuid: () => string): Pick<DatabaseDataSource, "properties" | "subitems"> {
  let pair = subitemFields(source);
  const decode = (value: unknown) => { try { return decodeURIComponent(String(value)); } catch { return String(value); } };
  if (!pair) for (const parent of source.properties) {
    const remote = parent.notion as any, relation = remote?.relation;
    if (parent.type !== "relation" || relation?.limit !== 1 || relation.type !== "dual_property" || relation.data_source_id !== (source.notion as any)?.id) continue;
    const children = source.properties.find(field => field.type === "relation" && decode((field.notion as any)?.id) === decode(relation.dual_property?.synced_property_id));
    if (children) { pair = { parent, children }; break; }
  }
  if (!pair) {
    const parentId = uuid(), childrenId = uuid();
    pair = { parent: { id: parentId, key: parentId, name: "Parent item", type: "relation" }, children: { id: childrenId, key: childrenId, name: "Sub-item", type: "relation" } };
  }
  const parent: DatabaseProperty = { ...pair.parent, localRelation: true, readOnly: false, subitemRole: "parent" };
  const children: DatabaseProperty = { ...pair.children, readOnly: true, subitemRole: "children", inversePropertyId: parent.id };
  const properties = source.properties.map(field => field.id === parent.id ? parent : field.id === children.id ? children : field);
  for (const field of [parent,children]) if (!properties.some(item=>item.id===field.id)) properties.push(field);
  return { properties, subitems: { ...source.subitems, enabled: true, parentPropertyId: parent.id, childrenPropertyId: children.id } };
}

export type SubitemRow = { page: Page; depth: number; parentId?: string; children: number; expanded: boolean };
/** Operates on the already filtered/sorted set. Missing parents stay visible as roots; cycles never hide records. */
export function subitemRows(pages: Page[], source: DatabaseDataSource, expanded: ReadonlySet<string>): SubitemRow[] {
  const pair = subitemFields(source), byId = new Map(pages.map(page => [page.id, page]));
  if (!pair) return pages.map(page => ({ page, depth: 0, children: 0, expanded: false }));
  const parentIds = new Map<string, string>(), children = new Map<string, Page[]>();
  for (const page of pages) {
    const parent = relationIds(page.properties[pair.parent.key])[0];
    if (parent && parent !== page.id && byId.has(parent)) { parentIds.set(page.id, parent); const list = children.get(parent) ?? []; list.push(page); children.set(parent, list); }
  }
  const rows: SubitemRow[] = [], visited = new Set<string>();
  const visit = (root: Page, rootDepth: number, visible: boolean) => {
    const stack = [{page:root, depth:rootDepth, visible}];
    while (stack.length) {
      const item = stack.pop()!; if (visited.has(item.page.id)) continue; visited.add(item.page.id);
      const descendants = children.get(item.page.id) ?? [], open = expanded.has(item.page.id);
      const allChildren = subitemValue(item.page, pair.children);
      if (item.visible) rows.push({ page:item.page, depth:item.depth, parentId:parentIds.get(item.page.id), children:Math.max(descendants.length, Array.isArray(allChildren) ? allChildren.length : 0), expanded:open });
      for (const child of [...descendants].reverse()) stack.push({page:child,depth:item.depth+1,visible:item.visible && open});
    }
  };
  for (const page of pages) if (!parentIds.has(page.id)) visit(page,0,true);
  for (const page of pages) if (!visited.has(page.id)) visit(page,0,true);
  return rows;
}

const projections = new WeakMap<Page, Record<string, unknown>>();
const parents = new WeakMap<Page, Page>();
export function projectSubitems(pages: Page[], source: DatabaseDataSource) {
  const pair = subitemFields(source); if (!pair) return;
  const byId = new Map(pages.filter(page => page.dataSourceId === source.id && !page.trashed).map(page => [page.id, page]));
  const children = new Map<string, {pageId:string;title:string}[]>();
  for (const page of pages) if (page.dataSourceId === source.id && !page.trashed) for (const id of relationIds(page.properties[pair.parent.key])) {
    const list = children.get(id) ?? []; list.push({pageId:page.id,title:page.title}); children.set(id,list);
  }
  for (const page of pages) {
    projections.set(page, { [pair.children.key]: children.get(page.id) ?? [] });
    const parent = byId.get(relationIds(page.properties[pair.parent.key])[0]);
    if (parent && parent.id !== page.id) parents.set(page, parent); else parents.delete(page);
  }
}
export const subitemValue = (page: Page, field: DatabaseProperty) => field.subitemRole === "children" ? projections.get(page)?.[field.key] ?? page.properties[field.key] : page.properties[field.key];
export const subitemParent = (page: Page) => parents.get(page);
