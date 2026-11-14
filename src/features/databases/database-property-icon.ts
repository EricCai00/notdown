import { createElement } from "lucide";
import { lucidePageIcon } from "../../shared/page-icons";
import type { DatabaseProperty } from "./database-model";

const defaults: Record<DatabaseProperty["type"], string> = {
  title: "type", text: "align-left", number: "hash", checkbox: "square-check", date: "calendar",
  select: "circle-chevron-down", multi_select: "list", status: "loader", url: "link", email: "mail", phone: "phone",
  place: "map-pin", people: "users", relation: "link", files: "file-text", formula: "function-square", rollup: "sigma", unknown: "align-left",
};
export const databasePropertyIconName = (field: Pick<DatabaseProperty, "type" | "icon">) => lucidePageIcon(field.icon) ? field.icon! : defaults[field.type];
export const databasePropertyIcon = (field: Pick<DatabaseProperty, "type" | "icon">) => lucidePageIcon(databasePropertyIconName(field))!;
export function databasePropertyIconHTML(field: Pick<DatabaseProperty, "type" | "icon">) {
  return createElement(databasePropertyIcon(field), { width: 18, height: 18, "stroke-width": 1.7, "aria-hidden": "true", class: "database-type-icon", "data-property-icon": databasePropertyIconName(field) }).outerHTML;
}
