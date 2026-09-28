import { escape as e, type Page } from "../../shared/types";
import { refreshIcons } from "../../shared/icons";

export type PageAction = "favorite" | "link" | "duplicate" | "rename" | "move" | "trash";
let dismiss: (() => void) | undefined;

export function closePageContextMenu() { dismiss?.(); }

export function pageActionsHTML(page: Page, attribute = "data-page-action") {
  const items: [PageAction, string, string][] = [
    ["favorite", "star", page.favorite ? "Remove from Favorites" : "Add to Favorites"],
    ["link", "link-2", "Copy link"],
    ["duplicate", "files", "Duplicate"],
    ["rename", "pen-line", "Rename"],
    ["move", "folder-tree", "Move to"],
    ["trash", "trash-2", "Move to Trash"],
  ];
  return items.filter(([action]) => !(page.databaseId && action === "duplicate") && !(page.dataSourceId && action === "move"))
    .map(([action, icon, label]) => `${action === "link" || action === "trash" ? "<hr>" : ""}<button type="button" role="menuitem" ${attribute}="${action}" class="${action === "trash" ? "danger" : ""}"><i data-lucide="${icon}"></i><span>${label}</span></button>`).join("");
}

export function showPageContextMenu(page: Page, x: number, y: number, anchor: HTMLElement, act: (action: PageAction) => void) {
  closePageContextMenu();
  const menu = document.createElement("div");
  menu.className = "page-context-menu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", `Page actions for ${page.title}`);
  const date = new Date(page.updated);
  menu.innerHTML = `<div class="page-context-heading">Page<span>${e(page.title)}</span></div>${pageActionsHTML(page)}<hr><div class="page-context-footer">Last edited ${e(Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("en-US"))}<br>${page.body.replace(/\s/g, "").length.toLocaleString()} characters</div>`;
  document.body.append(menu);
  refreshIcons();
  menu.style.left = `${Math.max(8, Math.min(x, innerWidth - menu.offsetWidth - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(y, innerHeight - menu.offsetHeight - 8))}px`;
  const controller = new AbortController();
  const restoreFocus = () => (anchor.isConnected ? anchor : document.querySelector<HTMLElement>(`[data-page-menu="${page.id}"]`))?.focus();
  const options = { signal: controller.signal };
  dismiss = () => {
    controller.abort();
    menu.remove();
    dismiss = undefined;
  };
  menu.querySelector<HTMLButtonElement>("button")?.focus();
  menu.addEventListener("click", (event) => {
    const action = (event.target as Element).closest<HTMLElement>("[data-page-action]")?.dataset.pageAction as PageAction | undefined;
    if (!action) return;
    closePageContextMenu();
    restoreFocus();
    act(action);
  }, options);
  menu.addEventListener("keydown", (event) => {
    if (["Escape", "Tab"].includes(event.key)) {
      if (event.key === "Escape") event.preventDefault();
      closePageContextMenu();
      restoreFocus();
      event.stopPropagation();
    } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      const buttons = [...menu.querySelectorAll<HTMLButtonElement>("button")];
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next].focus();
    }
  }, options);
  document.addEventListener("pointerdown", (event) => {
    if (!menu.contains(event.target as Node)) closePageContextMenu();
  }, options);
  window.addEventListener("resize", closePageContextMenu, options);
  let settled = false;
  requestAnimationFrame(() => requestAnimationFrame(() => { settled = true; }));
  document.addEventListener("scroll", (event) => {
    if (settled && !menu.contains(event.target as Node)) closePageContextMenu();
  }, { ...options, capture: true });
}
