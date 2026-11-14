import { createElement, type IconNode } from "lucide";
import { lucidePageIcon } from "../../shared/page-icons";
import type { DatabaseProperty } from "./database-model";

const defaults: Record<DatabaseProperty["type"], string> = {
  title: "a-large-small", text: "align-left", number: "hash", checkbox: "square-check", date: "calendar",
  select: "circle-chevron-down", multi_select: "list", status: "loader", url: "link", email: "at-sign", phone: "phone",
  place: "map-pin", people: "users", relation: "arrow-up-right", files: "paperclip", formula: "sigma", rollup: "search", unknown: "align-left",
};
type Field = Pick<DatabaseProperty, "type" | "icon"> & { notion?: unknown };
const sourceType = (field: Field) => (field.notion as { type?: string } | undefined)?.type;
export const databasePropertyIconName = (field: Field) => lucidePageIcon(field.icon) ? field.icon! :
  ["created_time", "last_edited_time"].includes(sourceType(field) ?? "") ? "clock" :
  ["created_by", "last_edited_by"].includes(sourceType(field) ?? "") ? "circle-user-round" :
  sourceType(field) === "place" ? "map-pin" : defaults[field.type];
const people: IconNode = [
  ["circle", { cx: "8", cy: "7", r: "3", fill: "currentColor", stroke: "none" }],
  ["circle", { cx: "17", cy: "7", r: "3", fill: "currentColor", stroke: "none" }],
  ["path", { d: "M1 20v-3a7 7 0 0 1 14 0v3zM16 20v-3a9 9 0 0 0-1-4 6 6 0 0 1 8 4v3z", fill: "currentColor", stroke: "none" }],
];
export const databasePropertyIcon = (field: Field) => !lucidePageIcon(field.icon) && field.type === "people" && !["created_by", "last_edited_by"].includes(sourceType(field) ?? "") ? people : lucidePageIcon(databasePropertyIconName(field))!;
export function databasePropertyIconHTML(field: Field) {
  return createElement(databasePropertyIcon(field), { width: 18, height: 18, "stroke-width": 1.7, "aria-hidden": "true", class: "database-type-icon", "data-property-icon": databasePropertyIconName(field) }).outerHTML;
}

export function databasePropertyTypeLabel(field: Field) {
  const remote: Record<string, string> = { created_time: "Created time", last_edited_time: "Last edited time", created_by: "Created by", last_edited_by: "Last edited by", unique_id: "ID", place: "Place" };
  return remote[sourceType(field) ?? ""] ?? ({ people: "Person", files: "Files & media", multi_select: "Multi-select", url: "URL" } as Record<string, string>)[field.type] ?? field.type[0].toUpperCase() + field.type.slice(1);
}
