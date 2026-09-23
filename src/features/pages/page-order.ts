type OrderedPage = { id: string; parent: string | null; revision: string; sidebarOrder?: string };
export type PageDropPosition = "before" | "after" | "inside" | "root";
export type PageMoveInput = {
  parent: string | null;
  sidebarOrder: string;
  beforeId: string | null;
  afterId: string | null;
  baseRevisions: Record<string, string>;
};

// The ID suffix breaks ties deterministically without renumbering other files.
export function pageOrderKey(page: Pick<OrderedPage, "id" | "sidebarOrder">): string {
  return (page.sidebarOrder ?? "5") + [...page.id].map((char) => char.charCodeAt(0).toString().padStart(3, "0")).join("") + "5";
}
export function comparePageOrder(a: Pick<OrderedPage, "id" | "sidebarOrder">, b: Pick<OrderedPage, "id" | "sidebarOrder">): number {
  const left = pageOrderKey(a), right = pageOrderKey(b);
  return left < right ? -1 : left > right ? 1 : 0;
}
export function orderBetween(lower: string | null, upper: string | null): string {
  if (lower !== null && upper !== null && lower >= upper) throw new Error("Invalid page order boundaries");
  let prefix = "";
  for (let index = 0; index < 4096; index++) {
    const low = Number(lower?.[index] ?? "0"), high = Number(upper?.[index] ?? "9");
    if (high - low > 1) return prefix + Math.floor((low + high) / 2);
    prefix += low;
    if (low < high) upper = null;
  }
  throw new Error("Page order is too dense to insert here");
}

export function planPageMove(pages: readonly OrderedPage[], sourceId: string, targetId: string | null, position: PageDropPosition): PageMoveInput | null {
  const source = pages.find((page) => page.id === sourceId);
  const target = pages.find((page) => page.id === targetId);
  if (!source || (position !== "root" && !target)) throw new Error("Page not found");
  const descendants = new Set([sourceId]);
  for (let changed = true; changed;) {
    changed = false;
    for (const page of pages) if (page.parent && descendants.has(page.parent) && !descendants.has(page.id)) {
      descendants.add(page.id); changed = true;
    }
  }
  if (target && descendants.has(target.id)) throw new Error("A page cannot be moved into itself or its children");
  const parent = position === "root" ? null : position === "inside" ? target!.id : target!.parent;
  const original = pages.filter((page) => page.parent === parent).sort(comparePageOrder);
  const siblings = original.filter((page) => page.id !== sourceId);
  const index = position === "before" || position === "after"
    ? siblings.findIndex((page) => page.id === targetId) + (position === "after" ? 1 : 0)
    : siblings.length;
  if (index < 0) throw new Error("Destination page not found");
  const after = siblings[index - 1] ?? null, before = siblings[index] ?? null;
  const next = [...siblings]; next.splice(index, 0, source);
  if (parent === source.parent && next.every((page, i) => page.id === original[i]?.id)) return null;
  const references = [...siblings, ...pages.filter((page) => page.id === parent)];
  return {
    parent,
    sidebarOrder: orderBetween(after ? pageOrderKey(after) : null, before ? pageOrderKey(before) : null),
    beforeId: before?.id ?? null,
    afterId: after?.id ?? null,
    baseRevisions: Object.fromEntries(references.map((page) => [page.id, page.revision])),
  };
}
