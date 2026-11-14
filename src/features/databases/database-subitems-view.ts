import { setUIText, t } from "../../shared/i18n";
import type { Page } from "../../shared/types";
import type { DatabaseDataSource, DatabaseView } from "./database-model";
import { nestedSubitems, visibleSubitems, subitemFields, subitemValue, subitemParent, type SubitemRow } from "./database-subitems";
import "./database-subitems.css";

export function subitemSummary(page: Page, source: DatabaseDataSource, view: DatabaseView) {
  if (!visibleSubitems(source, view) || nestedSubitems(source, view) && view.layout?.subitemScope !== "parents") return;
  const parent = subitemParent(page), children = subitemValue(page, subitemFields(source)!.children);
  const count = Array.isArray(children) ? children.length : 0;
  if (!parent && !count) return;
  const span = document.createElement("span"); span.className = "database-subitem-summary";
  span.textContent = parent ? `↰ ${parent.title}` : `↳ ${count}`;
  span.title = parent ? `${t("Parent item")}: ${parent.title}` : `${t("Sub-items")}: ${count}`;
  return span;
}

export function subitemToggle(row: SubitemRow, toggle: () => void) {
  const button = document.createElement("button"); button.type = "button";
  button.className = "database-subitem-toggle"; button.classList.toggle("has-children", row.children > 0);
  button.classList.toggle("is-expanded", row.expanded);
  button.setAttribute("aria-label", `${t(row.expanded ? "Collapse sub-items" : "Expand sub-items")}: ${row.page.title}`);
  button.setAttribute("aria-expanded", String(row.expanded));
  button.innerHTML = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M4 2 L10 6 L4 10 Z"/></svg>';
  button.onpointerdown = event => event.stopPropagation();
  button.onclick = event => { event.stopPropagation(); toggle(); };
  return button;
}
export function newSubitemButton(title: string, add: () => void) {
  const button = document.createElement("button"); button.type = "button"; button.className = "database-new-subitem";
  button.setAttribute("aria-label", `${t("New sub-item")}: ${title}`);
  const plus = document.createElement("span"); plus.textContent = "+"; plus.setAttribute("aria-hidden", "true");
  const text = document.createElement("span"); setUIText(text,"New sub-item"); button.append(plus,text);
  button.onclick = event => { event.stopPropagation(); add(); }; return button;
}
