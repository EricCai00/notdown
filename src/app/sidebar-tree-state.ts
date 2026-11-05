export const sidebarTreeKey = "notdown-sidebar-tree";
export const sidebarTreeChanged = "notdown-sidebar-tree-changed";
export type SidebarTreePreferences = { databaseChildren: "pages" | "views"; expandDepth: number | "all" };

export function parseSidebarTreePreferences(raw: string | null): SidebarTreePreferences {
  let value: Partial<SidebarTreePreferences> = {};
  try { value = JSON.parse(raw ?? "{}") ?? {}; } catch { /* Use defaults for damaged preferences. */ }
  return {
    databaseChildren: value.databaseChildren === "pages" ? "pages" : "views",
    expandDepth: value.expandDepth === "all" ? "all" : typeof value.expandDepth === "number" && Number.isInteger(value.expandDepth) && value.expandDepth >= 0 && value.expandDepth <= 10 ? value.expandDepth : 0,
  };
}

export function readSidebarTreePreferences(): SidebarTreePreferences {
  try { return parseSidebarTreePreferences(localStorage.getItem(sidebarTreeKey)); }
  catch { return parseSidebarTreePreferences(null); }
}

/** Explicit choices survive rerenders, while untouched/new branches use the depth setting. */
export class SidebarTreeExpansion {
  private overrides = new Map<string, boolean>();
  isExpanded(id: string, depth: number, expandDepth: SidebarTreePreferences["expandDepth"]) {
    return this.overrides.get(id) ?? (expandDepth === "all" || depth < expandDepth);
  }
  set(id: string, expanded: boolean) { this.overrides.set(id, expanded); }
  reset() { this.overrides.clear(); }
  entries() { return [...this.overrides]; }
}
