import type { Page } from "../../shared/types";
import type { Database } from "./database-model";
import { isWikiDatabase } from "./database-model";

/** Sidebar-only ownership projection. Legacy resources are never migrated by a read. */
export function databaseTree(pages: readonly Page[], databases: readonly Database[]) {
  const entries = pages.map(page => ({ ...page }));
  const byId = new Map(entries.map(page => [page.id, page]));
  const virtualIds = new Set<string>();
  const owners = new Map<string, { id: string; database: Database }[]>();
  for (const database of databases) {
    const id = typeof database.pageId === "string" ? database.pageId : database.id;
    let host = byId.get(id);
    if (!host) {
      // An unrelated page with the same identity must never become a database entry.
      if (pages.some(page => page.id === database.id && page.databaseId !== database.id)) continue;
      host = { id, title: database.title, parent: typeof database.parent === "string" && byId.has(database.parent) ? database.parent : null, icon: database.icon ?? "table-2", properties: {}, body: "", revision: database.revision, updated: "", databaseId: database.id };
      byId.set(id, host); entries.push(host); virtualIds.add(id);
    } else if (host.databaseId !== database.id) continue;
    for (const sourceId of database.dataSourceIds) {
      const candidates = owners.get(sourceId) ?? [];
      candidates.push({ id, database }); owners.set(sourceId, candidates);
    }
  }
  for (const page of entries) {
    if (!page.dataSourceId || page.databaseId) continue;
    const candidates = owners.get(page.dataSourceId);
    const owner = candidates?.find(candidate => candidate.id === page.parent) ?? candidates?.[0];
    if (!owner || owner.id === page.id) continue;
    if (isWikiDatabase(owner.database)) continue;
    // Corrupt/external metadata must not create a recursive sidebar tree.
    const ancestors = new Set([page.id]);
    let ancestor: Page | undefined = byId.get(owner.id), cyclic = false;
    while (ancestor) {
      if (ancestors.has(ancestor.id)) { cyclic = true; break; }
      ancestors.add(ancestor.id); ancestor = ancestor.parent ? byId.get(ancestor.parent) : undefined;
    }
    if (!cyclic) page.parent = owner.id;
  }
  return { pages: entries, virtualIds };
}
