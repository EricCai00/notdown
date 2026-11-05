import { databaseViewIcon } from "./database-view-icon";
import { setUIAttribute } from "../../shared/i18n";
import { Check, Ellipsis, Plus, Table2, Columns3, LayoutGrid, List, Calendar } from "lucide";
import { ChartNoAxesCombined, GanttChart, Rss } from "lucide";
import { DatabasePopover, menuButton, menuInput, menuSection, menuIcon } from "./database-popover";
import type { DatabaseView } from "./database-model";


export function installViewOverflow(host: HTMLElement, hooks: { views: DatabaseView[]; selected?: string; select(id: string): void; edit(id: string, anchor: HTMLElement): void; create(): void; createSource?: () => void }) {
  const list = host.querySelector<HTMLElement>(".database-view-tabs")!, tabs = [...list.querySelectorAll<HTMLElement>("[data-db-tab]")];
  if (!tabs.length) return () => {};
  const more = document.createElement("button"); more.type = "button"; more.className = "database-more-views"; setUIAttribute(more, "aria-label", "More database views"); list.insertBefore(more, list.querySelector("[data-db-new-view]"));
  let pop: DatabasePopover | undefined, frame = 0;
  const measure = () => {
    frame = 0; more.hidden = true; tabs.forEach(tab => tab.hidden = false);
    const gap = parseFloat(getComputedStyle(list).columnGap) || 0;
    const controls = [...list.children].filter((item): item is HTMLElement => item instanceof HTMLElement && item !== more && !tabs.includes(item) && !item.hidden);
    const available = list.clientWidth - controls.reduce((sum, item) => sum + item.getBoundingClientRect().width + gap, 0);
    const widths = tabs.map(tab => tab.getBoundingClientRect().width + gap);
    if (widths.reduce((a,b) => a+b, 0) - gap <= available) return;
    more.textContent = `${tabs.length - 1} more…`; more.hidden = false;
    const budget = available - more.getBoundingClientRect().width - gap;
    // Reserve the current view before fitting other tabs; retain their saved DOM order.
    const selected = Math.max(0, tabs.findIndex(tab => tab.dataset.dbTab === hooks.selected));
    let used = widths[selected], visible = 1;
    tabs.forEach((tab, index) => {
      if (index === selected) return;
      tab.hidden = used + widths[index] - gap > budget;
      if (!tab.hidden) { used += widths[index]; visible++; }
    });
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
        const choose = menuButton(view.name, databaseViewIcon(view), () => { pop?.destroy(); pop = undefined; hooks.select(view.id); }, "", false, "database-popover-row", false); choose.setAttribute("role", "menuitemradio"); choose.setAttribute("aria-checked", String(view.id === hooks.selected));
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
