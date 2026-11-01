import { Check, Ellipsis, Plus, Table2, Columns3, LayoutGrid, List, Calendar } from "lucide";
import { DatabasePopover, menuButton, menuInput, menuSection, menuIcon } from "./database-popover";
import type { DatabaseView } from "./database-model";
const icons = { table: Table2, board: Columns3, gallery: LayoutGrid, list: List, calendar: Calendar };

export function installViewOverflow(host: HTMLElement, hooks: { views: DatabaseView[]; selected?: string; select(id: string): void; edit(id: string, anchor: HTMLElement): void; create(): void; createSource?: () => void }) {
  const list = host.querySelector<HTMLElement>(".database-view-tabs")!, tabs = [...list.querySelectorAll<HTMLElement>("[data-db-tab]")];
  if (!tabs.length) return () => {};
  const more = document.createElement("button"); more.type = "button"; more.className = "database-more-views"; more.setAttribute("aria-label", "More database views"); list.insertBefore(more, list.querySelector("[data-db-new-view]"));
  let pop: DatabasePopover | undefined, frame = 0;
  const measure = () => {
    frame = 0; more.hidden = true; tabs.forEach(tab => tab.hidden = false);
    const available = list.clientWidth - 40, gap = 6, widths = tabs.map(tab => tab.getBoundingClientRect().width + gap);
    if (widths.reduce((a,b) => a+b, 0) <= available) return;
    let used = 0, visible = 0;
    tabs.forEach((tab, index) => { if (used + widths[index] <= available - 82 || visible === 0) { used += widths[index]; visible++; } else tab.hidden = true; });
    more.textContent = `${tabs.length - visible} more…`; more.hidden = false;
  };
  more.onclick = () => {
    if (pop && more.getAttribute("aria-expanded") === "true") { pop.destroy(); pop = undefined; return; }
    pop = new DatabasePopover(more, "Database views", { replace: true }); pop.saveOnDismiss = false;
    const panel = pop.panel("Database views", more, 0, 290); panel.classList.add("database-overflow-menu");
    const rows = document.createElement("div");
    const draw = (query = "") => {
      rows.replaceChildren();
      for (const view of hooks.views.filter(view => view.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()))) {
        const row = document.createElement("div"); row.className = "database-overflow-row";
        const choose = menuButton(view.name, icons[view.type] ?? Table2, () => { pop?.destroy(); pop = undefined; hooks.select(view.id); }); choose.setAttribute("role", "menuitemradio"); choose.setAttribute("aria-checked", String(view.id === hooks.selected));
        if (view.id === hooks.selected) choose.append(menuIcon(Check));
        const options = menuButton(`${view.name} view options`, Ellipsis, () => { pop?.destroy(); pop = undefined; hooks.edit(view.id, more); }); options.className = "database-source-details-button"; row.append(choose, options); rows.append(row);
      }
    };
    const search = menuInput("Search for a view", "", draw); search.querySelector("input")!.placeholder = "Search for a view…"; panel.append(search, rows); draw();
    const actions = menuSection(panel); actions.append(menuButton("New view", Plus, () => { pop?.destroy(); pop = undefined; hooks.create(); }));
    if (hooks.createSource) actions.append(menuButton("New data source", Plus, () => { pop?.destroy(); pop = undefined; hooks.createSource!(); }));
    search.querySelector("input")!.focus();
  };
  const observer = new ResizeObserver(() => { if (!frame) frame = requestAnimationFrame(measure); }); observer.observe(list); measure();
  return () => { observer.disconnect(); cancelAnimationFrame(frame); pop?.destroy(); };
}
