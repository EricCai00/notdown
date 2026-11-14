import { databaseSymbolButton } from "./database-symbol-picker";
import { lucidePageIcon } from "../../shared/page-icons";
import type { DatabaseView } from "./database-model";
import { DatabasePopover, menuIcon } from "./database-popover";

const defaults = { table: "table-2", board: "columns-3", gallery: "layout-grid", list: "list", calendar: "calendar", timeline: "gantt-chart", chart: "chart-no-axes-combined", feed: "rss", dashboard: "layout-dashboard", form: "clipboard-list", map: "map-pin" };
export const databaseViewIconName = (view: Pick<DatabaseView, "type" | "icon">) => lucidePageIcon(view.icon) ? view.icon! : defaults[view.type] ?? "table-2";
export const databaseViewIcon = (view: Pick<DatabaseView, "type" | "icon">) => lucidePageIcon(databaseViewIconName(view))!;
export const databaseViewIconHTML = (view: Pick<DatabaseView, "type" | "icon">) => {
  const icon = menuIcon(databaseViewIcon(view)); icon.setAttribute("data-view-icon", databaseViewIconName(view)); return icon.outerHTML;
};

/** Views and properties use the same symbol picker. */
export function viewIconButton(pop: DatabasePopover, draft: DatabaseView, level = 1) {
  return databaseSymbolButton(pop, { label: "View icon", name: () => databaseViewIconName(draft), icon: () => databaseViewIcon(draft), choose: icon => { draft.icon = icon; } }, level);
}
