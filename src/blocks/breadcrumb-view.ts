import type { LinkedPage } from "../editor/editor-links";
import { pageIconElement } from "../shared/page-icons";

export interface BreadcrumbPage extends LinkedPage { parent?: string | null; trashed?: boolean; databaseId?: string }
/** Navigation always follows the containing page, never legacy saved path IDs. */
export function breadcrumbItems(pages: readonly BreadcrumbPage[], current?: BreadcrumbPage): BreadcrumbPage[] {
  const available = new Map(pages.filter(page => !page.trashed).map(page => [page.id, page]));
  if (current && !current.trashed) available.set(current.id, current);
  const result: BreadcrumbPage[] = [], seen = new Set<string>();
  let page = current;
  while (page && !page.trashed && !seen.has(page.id)) {
    seen.add(page.id); result.unshift(page);
    page = page.parent ? available.get(page.parent) : undefined;
  }
  return result;
}

export function renderBreadcrumb(pages: readonly BreadcrumbPage[], current?: BreadcrumbPage): HTMLElement {
  const nav = document.createElement("nav"); nav.className = "pm-breadcrumb"; nav.setAttribute("aria-label", "Breadcrumb");
  const items = breadcrumbItems(pages, current);
  if (!items.length) {
    const empty = document.createElement("span"); empty.className = "pm-breadcrumb-empty"; empty.textContent = "Breadcrumb";
    nav.append(empty); return nav;
  }
  const list = document.createElement("ol");
  items.forEach((page, index) => {
    const item = document.createElement("li");
    if (index) {
      const separator = document.createElement("span"); separator.className = "pm-breadcrumb-separator";
      separator.textContent = "/"; separator.setAttribute("aria-hidden", "true"); item.append(separator);
    }
    const link = document.createElement("a"); link.className = "pm-breadcrumb-page";
    link.title = page.title || "Untitled";
    link.href = page.databaseId ? "#database/" + encodeURIComponent(page.databaseId) : "#page/" + encodeURIComponent(page.id); link.draggable = false;
    if (page.id === current?.id) link.setAttribute("aria-current", "page");
    const label = document.createElement("span"); label.className = "pm-breadcrumb-title"; label.textContent = page.title || "Untitled";
    link.append(pageIconElement(page.icon), label); item.append(link); list.append(item);
  });
  nav.append(list); return nav;
}
