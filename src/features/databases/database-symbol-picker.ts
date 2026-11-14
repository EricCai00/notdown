import { lucidePageIcons } from "../../shared/page-icons";
import { t, setUIAttribute } from "../../shared/i18n";
import type { IconNode } from "lucide";
import { DatabasePopover, menuButton, menuIcon, menuInput } from "./database-popover";

/** Views and properties share the complete installed symbol catalog. */
export function databaseSymbolButton(pop: DatabasePopover, options: { label: string; name(): string; icon(): IconNode; choose(icon: string): void }, level = 1) {
  const button = menuButton(options.label, options.icon(), anchor => {
    const panel = pop.panel(options.label, anchor, level, 340, false), results = document.createElement("div");
    results.className = "database-view-icon-grid";
    let limit = 120, query = "";
    const choose = (icon: string) => {
      options.choose(icon); pop.dirty = true; pop.trim(level);
      button.querySelector("svg")?.replaceWith(menuIcon(options.icon()));
    };
    panel.append(menuButton("Use default icon", undefined, () => choose("")));
    const draw = () => {
      results.replaceChildren();
      const words = query.toLowerCase().split(/[\s-]+/).filter(Boolean);
      const entries = lucidePageIcons.filter(({ name }) => words.every(word => name.replaceAll("-", "").includes(word)));
      for (const { name, node } of entries.slice(0, limit)) {
        const choice = document.createElement("button"); choice.type = "button"; choice.title = name;
        choice.setAttribute("aria-label", name); choice.setAttribute("aria-pressed", String(options.name() === name));
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
