import { lucidePageIcon, lucidePageIcons } from "../../shared/page-icons";
import { t, setUIAttribute } from "../../shared/i18n";
import type { DatabaseView } from "./database-model";
import { DatabasePopover, menuButton, menuIcon, menuInput } from "./database-popover";

const defaults = { table: "table-2", board: "columns-3", gallery: "layout-grid", list: "list", calendar: "calendar", timeline: "gantt-chart", chart: "chart-no-axes-combined", feed: "rss", dashboard: "layout-dashboard", form: "clipboard-list", map: "map-pin" };
export const databaseViewIconName = (view: Pick<DatabaseView, "type" | "icon">) => lucidePageIcon(view.icon) ? view.icon! : defaults[view.type] ?? "table-2";
export const databaseViewIcon = (view: Pick<DatabaseView, "type" | "icon">) => lucidePageIcon(databaseViewIconName(view))!;
export const databaseViewIconHTML = (view: Pick<DatabaseView, "type" | "icon">) => {
  const icon = menuIcon(databaseViewIcon(view)); icon.setAttribute("data-view-icon", databaseViewIconName(view)); return icon.outerHTML;
};

/** The complete installed symbol catalog, independent of page emoji and images. */
export function viewIconButton(pop: DatabasePopover, draft: DatabaseView, level = 1) {
  const button = menuButton("View icon", databaseViewIcon(draft), anchor => {
    const panel = pop.panel("View icon", anchor, level, 340, false), results = document.createElement("div");
    results.className = "database-view-icon-grid";
    let limit = 120, query = "";
    const choose = (icon: string) => {
      draft.icon = icon; pop.dirty = true; pop.trim(level);
      button.querySelector("svg")?.replaceWith(menuIcon(databaseViewIcon(draft)));
    };
    panel.append(menuButton("Use default icon", undefined, () => choose("")));
    const draw = () => {
      results.replaceChildren();
      const words = query.toLowerCase().split(/[\s-]+/).filter(Boolean);
      const entries = lucidePageIcons.filter(({ name }) => words.every(word => name.replaceAll("-", "").includes(word)));
      for (const { name, node } of entries.slice(0, limit)) {
        const choice = document.createElement("button"); choice.type = "button"; choice.title = name;
        choice.setAttribute("aria-label", name); choice.setAttribute("aria-pressed", String(databaseViewIconName(draft) === name));
        choice.append(menuIcon(node)); choice.onclick = () => choose(name); results.append(choice);
      }
      if (!entries.length) { const empty = document.createElement("p"); empty.textContent = t("No matching icons. Try another name."); results.append(empty); }
      if (entries.length > limit) results.append(menuButton("Show more", undefined, () => { limit += 120; draw(); }));
    };
    const search = menuInput("Search icons", "", value => { query = value; limit = 120; draw(); });
    setUIAttribute(search.querySelector("input")!, "placeholder", "Search Lucide icons…");
    panel.append(search, results); draw(); search.querySelector("input")!.focus();
  }, "", true);
  return button;
}
