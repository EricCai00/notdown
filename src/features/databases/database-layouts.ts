import { setUIText } from "../../shared/i18n";
import { escape as e, type Page } from "../../shared/types";
import { vaultAssetUrl } from "../../shared/vault-url";
import { pageIconElement } from "../../shared/page-icons";
import { calendarDate, databaseGroups, fieldValue, shiftDay, valueText } from "./database-query";
import type { DatabaseDataSource, DatabaseProperty, DatabaseView } from "./database-model";
import "./database-layouts.css";

export type LayoutActions = {
  open(page: Page): void; add(properties?: Record<string, unknown>): void; settings(): void;
  move(page: Page, field: DatabaseProperty, value: unknown): void;
  writable(page: Page, field: DatabaseProperty): boolean;
  month: string; navigate(day: string): void;
  groupMenu(field: DatabaseProperty, key: string, anchor: HTMLElement): void;
  collapseGroup(key: string): void;
};
export type DatabaseGroup = ReturnType<typeof databaseGroups>[number];
export function groupHeading(group: DatabaseGroup, field: DatabaseProperty, view: DatabaseView, actions: Pick<LayoutActions, "add" | "groupMenu" | "collapseGroup">) {
  const header = document.createElement("header"); header.className = "database-group-heading";
  const collapsed = view.layout?.collapsedGroups?.includes(group.key) ?? false;
  const toggle = button(collapsed ? "▸" : "▾", `${collapsed ? "Expand" : "Collapse"} group ${group.name}`, () => actions.collapseGroup(group.key), "database-group-toggle"); toggle.setAttribute("aria-expanded", String(!collapsed)); header.append(toggle);
  const label = document.createElement("span"); label.className = "database-tag"; label.dataset.color = group.color; label.textContent = group.name; header.append(label);
  if (view.layout?.showGroupCount !== false) { const count = document.createElement("span"); count.className = "database-group-count"; count.textContent = String(group.pages.length); header.append(count); }
  const more = button("···", `Group options: ${group.name}`, () => actions.groupMenu(field, group.key, more), "database-group-more"); more.setAttribute("aria-haspopup", "dialog"); header.append(more);
  header.append(button("+", `Add page to ${group.name}`, () => actions.add({ [field.key]: group.key === "" ? null : field.type === "checkbox" ? group.key === "true" : group.key }), "database-group-more"));
  return header;
}
function button(text: string, label: string, action: () => void, className = "") {
  const el = document.createElement("button"); el.type = "button"; el.className = className; el.textContent = text; el.setAttribute("aria-label", label); el.onclick = action; return el;
}
function safeImage(value: unknown): string | undefined {
  if (typeof value !== "string") return;
  if (/^(https?:\/\/|\/?assets\/|\.\.?\/assets\/|\/page-covers\/)/i.test(value)) return vaultAssetUrl(value);
}
function preview(page: Page, view: DatabaseView): HTMLElement | undefined {
  const mode = view.layout?.preview ?? (view.type === "gallery" ? "cover" : "none");
  if (mode === "none") return;
  const box = document.createElement("div"); box.className = "database-card-preview";
  const image = mode === "cover" ? safeImage(page.properties.cover) : undefined;
  if (image) { const img = document.createElement("img"); img.src = image; img.alt = ""; img.loading = "lazy"; img.style.objectFit = view.layout?.fitImage ? "contain" : "cover"; img.onerror = () => img.remove(); box.append(img); }
  else if (mode === "content") { box.classList.add("is-content"); box.textContent = page.body.slice(0, 700).replace(/^---[\s\S]*?\n---\s*/, "").replace(/[#*_>`]/g, ""); }
  return box;
}
function card(page: Page, source: DatabaseDataSource, fields: DatabaseProperty[], view: DatabaseView, actions: LayoutActions) {
  const el = document.createElement("article"); el.className = "database-record-card"; el.dataset.pageId = page.id;
  const content = preview(page, view); if (content) el.append(content);
  const open = button("", `Open ${page.title}`, () => actions.open(page), "database-card-title");
  const icon = pageIconElement(page.icon || "file-text"); if (icon && view.layout?.showPageIcon !== false) open.append(icon);
  const name = document.createElement("span"); name.textContent = page.title; open.append(name); el.append(open);
  const properties = document.createElement("div"); properties.className = "database-card-properties";
  for (const field of fields.filter(field => field.type !== "title")) {
    const value = fieldValue(page, field); if (value == null || value === "" || (Array.isArray(value) && !value.length)) continue;
    const prop = document.createElement("span"); prop.className = "database-card-property"; prop.title = field.name; prop.classList.toggle("database-wrap-property", !!view.layout?.wrapContent || !!view.layout?.wrapPropertyIds?.includes(field.id));
    if (["select", "status", "multi_select"].includes(field.type)) {
      for (const id of value == null || value === "" ? [] : Array.isArray(value) ? value : [value]) { const option = field.options?.find(option => option.id === id); const tag = document.createElement("span"); tag.className = "database-tag"; tag.dataset.color = option?.color ?? "gray"; tag.textContent = option?.name ?? String(id); prop.append(tag); }
    } else prop.textContent = field.type === "checkbox" ? value ? "☑" : "☐" : valueText(field, value);
    properties.append(prop);
  }
  el.append(properties);
  if (view.type === "list") el.addEventListener("click", event => { if (!(event.target as Element).closest("button, a, input")) actions.open(page); });
  el.addEventListener("dblclick", event => { if (!(event.target as Element).closest("button")) actions.open(page); });
  return el;
}
function dragCard(el: HTMLElement, page: Page, field: DatabaseProperty, actions: LayoutActions) {
  if (!actions.writable(page, field)) return;
  el.draggable = true;
  el.addEventListener("dragstart", event => { event.dataTransfer?.setData("application/x-notdown-record", page.id); if (event.dataTransfer) event.dataTransfer.effectAllowed = "move"; el.classList.add("is-dragging"); });
  el.addEventListener("dragend", () => el.classList.remove("is-dragging"));
}
function dropZone(el: HTMLElement, pages: Page[], field: DatabaseProperty, value: (page: Page) => unknown, actions: LayoutActions) {
  el.addEventListener("dragover", event => { if (event.dataTransfer?.types.includes("application/x-notdown-record")) { event.preventDefault(); el.classList.add("is-drop-target"); } });
  el.addEventListener("dragleave", () => el.classList.remove("is-drop-target"));
  el.addEventListener("drop", event => { event.preventDefault(); el.classList.remove("is-drop-target"); const page = pages.find(page => page.id === event.dataTransfer?.getData("application/x-notdown-record")); if (page && actions.writable(page, field)) actions.move(page, field, value(page)); });
}
export function renderDatabaseLayout(host: HTMLElement, source: DatabaseDataSource, rows: Page[], fields: DatabaseProperty[], view: DatabaseView, actions: LayoutActions) {
  host.replaceChildren(); host.className = `database-alternate-layout database-layout-${view.type}`; host.dataset.size = view.layout?.cardSize ?? "medium";
  const groupField = source.properties.find(field => field.id === view.layout?.groupBy);
  if (view.type === "calendar") { calendar(host, source, rows, fields, view, actions); return; }
  if (view.type === "board" && !groupField) {
    host.append(button("Choose a grouping property", "Choose a grouping property", actions.settings, "database-layout-setup")); return;
  }
  const groups = groupField ? databaseGroups(rows, groupField, view) : [{ key: "", name: "", color: "gray", pages: rows }];
  for (const group of groups) {
    const section = document.createElement("section"); section.className = "database-card-group"; section.dataset.group = group.key;
    if (groupField) { section.append(groupHeading(group, groupField, view, actions)); if (view.layout?.collapsedGroups?.includes(group.key)) { host.append(section); continue; } }
    const cards = document.createElement("div"); cards.className = "database-cards";
    for (const page of group.pages) { const el = card(page, source, fields, view, actions); if (view.type === "board" && groupField) dragCard(el, page, groupField, actions); cards.append(el); }
    section.append(cards);
    const initial = groupField ? { [groupField.key]: group.key === "" ? null : groupField.type === "checkbox" ? group.key === "true" : group.key } : {};
    section.append(button("+ New page", groupField ? `New page in ${group.name}` : "New page", () => actions.add(initial), "database-layout-add"));
    if (view.type === "board" && groupField) dropZone(section, rows, groupField, () => initial[groupField.key], actions);
    host.append(section);
  }
  if (!rows.length) { const hint = document.createElement("p"); hint.className = "database-layout-hint"; setUIText(hint, "No pages match this view."); host.append(hint); }
}
function calendar(host: HTMLElement, source: DatabaseDataSource, rows: Page[], fields: DatabaseProperty[], view: DatabaseView, actions: LayoutActions) {
  const field = source.properties.find(field => field.id === view.layout?.datePropertyId && field.type === "date");
  if (!field) { host.append(button("Choose a date property", "Choose a date property", actions.settings, "database-layout-setup")); return; }
  const weekly = view.layout?.calendarRange === "week", anchor = actions.month;
  const date = new Date(anchor + "T12:00:00Z"), first = weekly ? anchor : anchor.slice(0, 7) + "-01";
  const weekday = new Date(first + "T12:00:00Z").getUTCDay(), start = shiftDay(first, -weekday);
  const toolbar = document.createElement("div"); toolbar.className = "database-calendar-toolbar";
  const title = document.createElement("h2"); title.textContent = date.toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" }); toolbar.append(title);
  const navigate = (direction: number) => { if (weekly) actions.navigate(shiftDay(anchor, 7 * direction)); else { const d = new Date(first + "T12:00:00Z"); d.setUTCMonth(d.getUTCMonth() + direction); actions.navigate(d.toISOString().slice(0, 10)); } };
  toolbar.append(button("Today", "Today", () => { const now = new Date(); actions.navigate(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`); }), button("‹", "Previous period", () => navigate(-1)), button("›", "Next period", () => navigate(1))); host.append(toolbar);
  const grid = document.createElement("div"); grid.className = "database-calendar-grid";
  for (const label of ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]) { const el = document.createElement("div"); el.className = "database-calendar-weekday"; el.textContent = label; grid.append(el); }
  for (let index = 0; index < (weekly ? 7 : 42); index++) {
    const day = shiftDay(start, index), cell = document.createElement("section"); cell.className = "database-calendar-day"; cell.dataset.date = day; cell.classList.toggle("is-other-month", day.slice(0, 7) !== anchor.slice(0, 7));
    const now = new Date(); cell.classList.toggle("is-today", day === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`);
    const heading = document.createElement("header"); heading.innerHTML = `<span>${Number(day.slice(-2))}</span>`; heading.append(button("+", `New page on ${day}`, () => actions.add({ [field.key]: { start: day, end: null } }))); cell.append(heading);
    for (const page of rows) { const range = calendarDate(fieldValue(page, field)); if (!range || day < range.start || day > range.end) continue; const el = card(page, source, fields, { ...view, layout: { ...view.layout, preview: "none" } }, actions); if (range.movable) dragCard(el, page, field, actions); cell.append(el); }
    dropZone(cell, rows.filter(page => calendarDate(fieldValue(page, field))?.movable), field, page => { const value = fieldValue(page, field) as { start: string; end?: string }; const range = calendarDate(value)!; const days = Math.round((Date.parse(day) - Date.parse(range.start)) / 86400000); return { ...value, start: day, ...(value.end ? { end: shiftDay(value.end, days) } : {}) }; }, actions);
    grid.append(cell);
  }
  host.append(grid);
  const undated = rows.filter(page => !calendarDate(fieldValue(page, field)));
  if (undated.length) { const section = document.createElement("section"); section.className = "database-calendar-undated"; section.innerHTML = `<h3><span data-i18n="No date ·">No date ·</span> ${undated.length}</h3>`; for (const page of undated) section.append(card(page, source, fields, { ...view, layout: { ...view.layout, preview: "none" } }, actions)); host.append(section); }
}
