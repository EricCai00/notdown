import { renderForm } from "./database-extra-layouts";
import { renderMap } from "./database-map";
import { renderDashboard } from "./database-dashboard";
import { setUIText, uiLanguage, t } from "../../shared/i18n";
import { escape as e, type Page } from "../../shared/types";
import { vaultAssetUrl } from "../../shared/vault-url";
import { pageIconElement } from "../../shared/page-icons";
import { pageCardPreview } from "../pages/page-card-preview";
import { defaultGalleryPreview } from "../pages/page-card-preview-model";
import { calendarDate, databaseGroups, fieldValue, shiftDay, valueText } from "./database-query";
import type { DatabaseDataSource, DatabaseLayout, DatabaseProperty, DatabaseView } from "./database-model";
import "./database-layouts.css";
import { renderTimeline } from "./database-timeline";
import { renderChart } from "./database-chart";
import { appendFeedContent, appendFeedHeader, appendFeedProperty } from "./database-feed";
import { calendarWindow, calendarSegments } from "./database-calendar-model";
import { timelineEdit } from "./database-timeline-model";

const layoutCleanup = new WeakMap<HTMLElement, () => void>();

export type LayoutActions = {
  dashboard?: {
    vaultKey: string;
    snapshot: import("./database-model").DatabaseSnapshot;
    prepare(): Promise<boolean>;
    save(layout: DatabaseLayout, baseRevision: string): Promise<DatabaseView>;
  };
  views?(): DatabaseView[];
  openView?(id: string): void;
  submit?(title: string, properties: Record<string, unknown>): Promise<void>;
  open(page: Page): void; add(properties?: Record<string, unknown>): void; settings(): void;
  move(page: Page, field: DatabaseProperty, value: unknown, placement?: { beforeId: string | null }): void;
  writable(page: Page, field: DatabaseProperty): boolean;
  month: string; navigate(day: string): void;
  configure?(layout: Partial<DatabaseLayout>): Promise<void>;
  dependencies?(): Promise<void>;
  dependencySettings?(patch: Pick<DatabaseDataSource, "dependencyAutoShift" | "dependencyDatePropertyId">): Promise<void>;
  calendar?(): Promise<void>;
  pages?(): Page[];
  reference?(page: Page, field: DatabaseProperty, value: unknown): void;
  createSuccessor?(page: Page, properties: Record<string, unknown>): Promise<void>;
  titleEditor?(page: Page): HTMLElement | undefined;
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
function preview(page: Page, view: DatabaseView): HTMLElement | undefined {
  const mode = view.layout?.preview ?? (view.type === "gallery" ? defaultGalleryPreview : "none");
  const box = pageCardPreview(page, mode, view.layout?.fitImage);
  box?.classList.add("database-card-preview");
  return box;
}
function card(page: Page, source: DatabaseDataSource, fields: DatabaseProperty[], view: DatabaseView, actions: LayoutActions) {
  const el = document.createElement("article"); el.className = "database-record-card"; el.dataset.pageId = page.id;
  const content = preview(page, view.type === "feed" ? { ...view, layout: { ...view.layout, preview: view.layout?.feedCover === false ? "none" : "cover" } } : view); if (content && (view.type !== "feed" || content.querySelector("img"))) el.append(content);
  if (view.type === "feed") appendFeedHeader(el, page);
  const open = button("", `Open ${page.title}`, () => actions.open(page), "database-card-title");
  const icon = pageIconElement(page.icon || "file-text"); if (icon && (view.layout?.showPageIcon ?? !["feed", "calendar"].includes(view.type))) open.append(icon);
  const name = document.createElement("span"); name.textContent = page.title; open.append(name); el.append(open);
  const properties = document.createElement("div"); properties.className = "database-card-properties";
  for (const field of fields.filter(field => field.type !== "title")) {
    const value = fieldValue(page, field); if (value == null || value === "" || (Array.isArray(value) && !value.length)) continue;
    const prop = document.createElement("span"); prop.className = "database-card-property"; prop.title = field.name; prop.classList.toggle("database-wrap-property", !!view.layout?.wrapContent || !!view.layout?.wrapPropertyIds?.includes(field.id));
    prop.dataset.propertyId = field.id; prop.dataset.propertyType = field.type;
    if (["feed", "calendar"].includes(view.type) && appendFeedProperty(prop, field, value, actions.pages?.() ?? [], actions.open)) { /* Readable dates and local references. */ }
    else if (["select", "status", "multi_select"].includes(field.type)) {
      for (const id of value == null || value === "" ? [] : Array.isArray(value) ? value : [value]) { const option = field.options?.find(option => option.id === id); const tag = document.createElement("span"); tag.className = "database-tag"; tag.dataset.color = option?.color ?? "gray"; tag.textContent = option?.name ?? String(id); prop.append(tag); }
    } else prop.textContent = field.type === "checkbox" ? value ? "☑" : "☐" : valueText(field, value);
    properties.append(prop);
  }
  el.append(properties);
  if (view.type === "feed") appendFeedContent(el, page, view);
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
export function disposeDatabaseLayout(host: HTMLElement) { layoutCleanup.get(host)?.(); layoutCleanup.delete(host); }
export function renderDatabaseLayout(host: HTMLElement, source: DatabaseDataSource, rows: Page[], fields: DatabaseProperty[], view: DatabaseView, actions: LayoutActions) {
  layoutCleanup.get(host)?.(); layoutCleanup.delete(host);
  host.replaceChildren(); host.className = `database-alternate-layout database-layout-${view.type}`; host.dataset.size = view.layout?.cardSize ?? "medium";
  if (view.type === "form") { renderForm(host, source, fields, view, actions); return; }
  if (view.type === "map") { layoutCleanup.set(host, renderMap(host, source, rows, view, actions)); return; }
  if (view.type === "dashboard") { layoutCleanup.set(host, renderDashboard(host, source, rows, view, actions)); return; }
  const groupField = source.properties.find(field => field.id === view.layout?.groupBy);
  if (view.type === "calendar") { calendar(host, source, rows, fields, view, actions); return; }
  if (view.type === "timeline") { renderTimeline(host, source, rows, fields, view, actions); return; }
  if (view.type === "chart") { layoutCleanup.set(host, renderChart(host, source, rows, view, actions)); return; }
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
  const weekly = view.layout?.calendarRange === "week", anchor = actions.month, weekStart = view.layout?.calendarWeekStart ?? 0;
  const date = new Date(anchor + "T12:00:00Z"), first = weekly ? anchor : anchor.slice(0, 7) + "-01";
  const { start, weeks } = calendarWindow(anchor,weekly,weekStart);
  const toolbar = document.createElement("div"); toolbar.className = "database-calendar-toolbar";
  const title = document.createElement("h2"); title.textContent = date.toLocaleDateString(uiLanguage(), { month: "long", year: "numeric", timeZone: "UTC" }); toolbar.append(title);
  const navigate = (direction: number) => { if (weekly) actions.navigate(shiftDay(anchor, 7 * direction)); else { const d = new Date(first + "T12:00:00Z"); d.setUTCMonth(d.getUTCMonth() + direction); actions.navigate(d.toISOString().slice(0, 10)); } };
  toolbar.append(button("‹", t("Previous period"), () => navigate(-1)), button(t("Today"), t("Today"), () => { const now = new Date(); actions.navigate(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`); }), button("›", t("Next period"), () => navigate(1))); host.append(toolbar);
  const grid = document.createElement("div"); grid.className = "database-calendar-grid";
  const weekdays = document.createElement("div"); weekdays.className = "database-calendar-weekdays";
  for (let index=0;index<7;index++) { const el = document.createElement("div"); el.className = "database-calendar-weekday"; el.textContent = new Date(shiftDay(start,index)+"T12:00:00Z").toLocaleDateString(uiLanguage(),{weekday:"short",timeZone:"UTC"}); weekdays.append(el); } grid.append(weekdays);
  const observers: ResizeObserver[] = []; layoutCleanup.set(host, () => observers.forEach(observer=>observer.disconnect()));
  for (let week=0;week<weeks;week++) {
    const weekDay=shiftDay(start,week*7), weekElement=document.createElement("div"); weekElement.className="database-calendar-week"; weekElement.dataset.week=weekDay;
    const cells: HTMLElement[]=[];
    for (let index = 0; index < 7; index++) {
      const day = shiftDay(weekDay, index), cell = document.createElement("section"); cell.className = "database-calendar-day"; cell.dataset.date = day; cell.classList.toggle("is-other-month", day.slice(0, 7) !== anchor.slice(0, 7));
      cell.classList.toggle("is-weekend", [0,6].includes(new Date(day+"T12:00:00Z").getUTCDay()));
      const now = new Date(); cell.classList.toggle("is-today", day === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`);
      const heading = document.createElement("header"), number=document.createElement("span"); number.textContent = day.endsWith("-01") ? new Date(day+"T12:00:00Z").toLocaleDateString(uiLanguage(),{month:"short",day:"numeric",timeZone:"UTC"}) : String(Number(day.slice(-2)));
      heading.append(button("+", `New page on ${day}`, () => actions.add({ [field.key]: { start: day, end: null } })),number); cell.append(heading); cells.push(cell); weekElement.append(cell);
    }
    const columnAt=(x:number)=>Math.max(0,Math.min(6,Math.floor((x-weekElement.getBoundingClientRect().left)/(weekElement.getBoundingClientRect().width/7))));
    const segments=calendarSegments(rows,field,weekDay), cards=segments.map(segment=>{
      const el=card(segment.page,source,fields,{...view,layout:{...view.layout,preview:"none"}},actions);
      el.classList.add("database-calendar-event"); el.dataset.segmentStart=shiftDay(weekDay,segment.start); el.dataset.segmentEnd=shiftDay(weekDay,segment.end); el.dataset.lane=String(segment.lane);
      el.style.width=`calc(${segment.end-segment.start+1} * (100% + 1px) - 8px)`; el.style.top=`${34+segment.lane*96}px`;
      el.classList.toggle("continues-before",segment.continuesBefore); el.classList.toggle("continues-after",segment.continuesAfter);
      if(segment.range.movable) {
        dragCard(el,segment.page,field,actions);
        el.addEventListener("dragstart",event=>{ const grabbed=shiftDay(weekDay,columnAt(event.clientX)); event.dataTransfer?.setData("application/x-notdown-calendar-offset",String(Math.round((Date.parse(grabbed)-Date.parse(segment.range.start))/86400000))); });
      }
      cells[segment.start].append(el); return {el,lane:segment.lane};
    });
    const measure=()=>{
      if (!weekElement.isConnected) { observer.disconnect(); return; }
      if (!weekElement.clientWidth) return;
      const heights:number[]=[]; for(const {el,lane} of cards) heights[lane]=Math.max(heights[lane]??0,el.getBoundingClientRect().height);
      const offsets:number[]=[]; let top=34; for(let lane=0;lane<heights.length;lane++) {offsets[lane]=top;top+=(heights[lane]??0)+5;}
      for(const {el,lane} of cards) el.style.top=`${offsets[lane]}px`; weekElement.style.minHeight=`${Math.max(115,top+5)}px`;
    };
    const observer=new ResizeObserver(measure); observers.push(observer); observer.observe(weekElement); for(const {el} of cards) observer.observe(el);
    const clearDrop=()=>cells.forEach(cell=>cell.classList.remove("is-drop-target"));
    weekElement.ondragover=event=>{if(event.dataTransfer?.types.includes("application/x-notdown-record")){event.preventDefault();clearDrop();cells[columnAt(event.clientX)].classList.add("is-drop-target");}};
    weekElement.ondragleave=event=>{if(!weekElement.contains(event.relatedTarget as Node))clearDrop();};
    weekElement.ondrop=event=>{
      event.preventDefault(); clearDrop(); const page=rows.find(page=>page.id===event.dataTransfer?.getData("application/x-notdown-record")); if(!page || !actions.writable(page,field))return;
      const value=fieldValue(page,field), range=calendarDate(value); if(!range?.movable)return;
      const grabbed=Number(event.dataTransfer?.getData("application/x-notdown-calendar-offset")||0), day=shiftDay(weekDay,columnAt(event.clientX)), delta=Math.round((Date.parse(day)-Date.parse(range.start))/86400000)-grabbed;
      const next=timelineEdit(value,delta,"move");if(next)actions.move(page,field,next);
    };
    grid.append(weekElement);
  }
  host.append(grid);
  const undated = rows.filter(page => !calendarDate(fieldValue(page, field)));
  if (undated.length) { const section = document.createElement("section"); section.className = "database-calendar-undated"; section.innerHTML = `<h3><span data-i18n="No date ·">No date ·</span> ${undated.length}</h3>`; for (const page of undated) section.append(card(page, source, fields, { ...view, layout: { ...view.layout, preview: "none" } }, actions)); host.append(section); }
}
