/** A trashed parent hides its descendants without rewriting their files. */
export function trashedPageIds(pages: readonly { id: string; parent: string | null; trashed?: boolean }[]): Set<string> {
  const hidden = new Set(pages.filter((page) => page.trashed).map((page) => page.id));
  let changed = true;
  while (changed) {
    changed = false;
    for (const page of pages) {
      if (page.parent && hidden.has(page.parent) && !hidden.has(page.id)) {
        hidden.add(page.id);
        changed = true;
      }
    }
  }
  return hidden;
}
