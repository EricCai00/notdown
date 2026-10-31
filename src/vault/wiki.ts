import type { Page } from "../shared/types.js";
import { isWikiDatabase, type Database } from "../features/databases/database-model.js";

/** Membership follows the page tree; database contents and a recovered Home stay independent. */
export function reconcileWikiMembership(index: { pages: Record<string, Record<string, unknown>>; [key: string]: unknown }, pages: readonly Page[]) {
  const databases = Object.values((index.databases ?? {}) as Record<string, Database>);
  const ownedSources = (database: Database) => Array.isArray(database.ownedDataSourceIds) ? database.ownedDataSourceIds as string[] : database.dataSourceIds;
  const hosts = new Map(databases.map(database => [database.pageId ?? database.id, database]));
  const wikiSources = new Set(databases.filter(isWikiDatabase).flatMap(ownedSources));
  const byId = new Map(pages.map(page => [page.id, page]));
  const managedIds = new Set(Object.entries(index.pages).filter(([, entry]) => typeof entry.wikiMembership === "string").map(([id]) => id));
  for (const page of pages) {
    const entry = index.pages[page.id];
    if (!entry) continue;
    const managed = typeof entry.wikiMembership === "string" || !!page.dataSourceId && wikiSources.has(page.dataSourceId);
    if (page.dataSourceId && !managed) continue;
    let owner: Database | undefined;
    if (!hosts.has(page.id) && !databases.some(database => database.homePageId === page.id)) {
      const seen = new Set([page.id]); let parent = page.parent;
      while (parent && !seen.has(parent)) {
        seen.add(parent);
        const database = hosts.get(parent);
        if (database) { if (isWikiDatabase(database)) owner = database; break; }
        const ancestor = byId.get(parent);
        if (!ancestor || ancestor.dataSourceId && !wikiSources.has(ancestor.dataSourceId) && !managedIds.has(ancestor.id)) break;
        parent = ancestor.parent;
      }
    }
    if (owner && ownedSources(owner).length === 1) {
      entry.dataSourceId = ownedSources(owner)[0]; entry.wikiMembership = owner.id;
    } else if (managed) { delete entry.dataSourceId; delete entry.wikiMembership; }
  }
}
