import type { Page } from "../shared/types";
import { comparePageOrder } from "../features/pages/page-order";

/** Read-only navigation: missing parents and cycles must not hide recoverable pages. */
export function mobilePageTree(pages: readonly Page[], collapsed: ReadonlySet<string>) {
  const byId = new Map(pages.map(page => [page.id, page]));
  const children = new Map<string | null, Page[]>();
  for (const page of pages) {
    const parent = page.parent && byId.has(page.parent) && page.parent !== page.id ? page.parent : null;
    const siblings = children.get(parent) ?? [];
    siblings.push(page); children.set(parent, siblings);
  }
  for (const siblings of children.values()) siblings.sort(comparePageOrder);
  const visited = new Set<string>();
  const rows: { page: Page; depth: number; hasChildren: boolean }[] = [];
  const visit = (root: Page) => {
    const stack = [{ page: root, depth: 0, hidden: false }];
    while (stack.length) {
      const { page, depth, hidden } = stack.pop()!;
      if (visited.has(page.id)) continue;
      visited.add(page.id);
      const descendants = children.get(page.id) ?? [];
      if (!hidden) rows.push({ page, depth, hasChildren: descendants.some(child => !visited.has(child.id)) });
      for (const child of [...descendants].reverse()) stack.push({ page: child, depth: depth + 1, hidden: hidden || collapsed.has(page.id) });
    }
  };
  for (const root of children.get(null) ?? []) visit(root);
  for (const page of [...pages].sort(comparePageOrder)) if (!visited.has(page.id)) visit(page);
  return rows;
}
