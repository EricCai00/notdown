import { setUIText } from "../../shared/i18n";
import { createElement, FileText, Table2, List, Columns3, LayoutGrid, Calendar, ChevronDown, Check, Plus, Ellipsis } from "lucide";
import type { DatabaseSnapshot } from "./database-model";
import { DatabasePopover, menuButton } from "./database-popover";

const icons = { table: Table2, list: List, board: Columns3, gallery: LayoutGrid, calendar: Calendar };
/** Home and collection layouts use exactly the same view selector. */
export function mountWikiViewPicker(host: HTMLElement, snapshot: DatabaseSnapshot, selected: string, hooks: {
  select(id: string): Promise<unknown>;
  create(anchor: HTMLElement): Promise<unknown>;
  edit(id: string, anchor: HTMLElement): Promise<unknown>;
  report(error: unknown): void;
}) {
  const trigger = document.createElement("button"); trigger.type = "button"; trigger.className = "wiki-view-trigger";
  const current = snapshot.views.find(view => view.id === selected);
  trigger.append(createElement(selected === "home" ? FileText : icons[current?.type ?? "table"], { width: 17, height: 17 }), document.createTextNode(selected === "home" ? "Home" : current?.name ?? "All pages"), createElement(ChevronDown, { width: 14, height: 14 }));
  trigger.setAttribute("aria-label", `Wiki view: ${selected === "home" ? "Home" : current?.name ?? "All pages"}`);
  trigger.setAttribute("aria-haspopup", "menu"); trigger.setAttribute("aria-expanded", "false"); host.append(trigger);
  const linkLabel = () => { const label = document.createElement("small"); label.className = "database-view-link"; setUIText(label, "Link"); label.setAttribute("aria-hidden", "true"); return label; };
  if (current?.linked) trigger.insertBefore(linkLabel(), trigger.lastChild);
  let pop: DatabasePopover | undefined;
  const events = new AbortController();
  const act = (action: () => Promise<unknown>) => { pop?.destroy(); pop = undefined; void action().catch(hooks.report); };
  trigger.onclick = () => {
    if (trigger.getAttribute("aria-expanded") === "true") { pop?.destroy(); return; }
    pop = new DatabasePopover(trigger, "Wiki views"); pop.saveOnDismiss = false;
    const panel = pop.panel("Wiki views", trigger, 0, 330); panel.classList.add("wiki-view-menu"); panel.setAttribute("role", "menu");
    const entries = [{ id: "home", name: "Home", type: "home" }, ...snapshot.views];
    for (const entry of entries) {
      const row = document.createElement("div"); row.className = "wiki-view-menu-row";
      const button = menuButton(entry.name, entry.id === "home" ? FileText : icons[entry.type as keyof typeof icons], () => act(() => hooks.select(entry.id)), "", false, "database-popover-row", false);
      button.setAttribute("role", "menuitemradio"); button.setAttribute("aria-checked", String(entry.id === selected));
      if ("linked" in entry && entry.linked) button.append(linkLabel());
      if (entry.id === selected) button.append(createElement(Check, { width: 17, height: 17 }));
      const more = menuButton(`${entry.name} view options`, Ellipsis, () => act(() => hooks.edit(entry.id, trigger)), "", false, "wiki-view-more");
      row.append(button, more); panel.append(row);
    }
    const add = menuButton("New view", Plus, () => act(() => hooks.create(trigger))); add.classList.add("wiki-new-view"); panel.append(add);
    panel.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
  };
  document.addEventListener("keydown", event => { if (event.key === "Escape" && pop) trigger.focus(); }, { capture: true, signal: events.signal });
  return () => { pop?.destroy(); events.abort(); trigger.remove(); };
}
