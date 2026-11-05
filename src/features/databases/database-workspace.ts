import { databaseViewIconHTML } from "./database-view-icon";
import { installTableSelection } from "./database-table-selection";
import { installDatabaseTableResize } from "./database-table-resize";
import { setUIText, setUIAttribute } from "../../shared/i18n";
import { mountWikiViewPicker } from "./wiki-view-picker";
import { createDatabaseView } from "./database-create-view";
import { openTabMenu } from "./database-tab-menu";
import { installInlineDatabaseLayout } from "./database-inline-layout";
import { installViewOverflow } from "./database-view-overflow";
import { isPageCoverPath, openPageCoverPicker } from "../pages/page-cover-picker";
import { renderDatabasePageCover } from "./database-page-cover";
import "../pages/page-cover-picker.css";
import { vaultAssetUrl } from "../../shared/vault-url";
import { api, escape as e, type Page } from "../../shared/types";
import { documentMetadata } from "../metadata/document-metadata";
import { databaseViewProperties } from "./database-columns";
import { databaseSourceView } from "./database-reference";
import { openSourceMenu } from "./database-source-menu";
import { renderSourceCatalog } from "./database-source-catalog";
import type { DatabaseSourceSummary } from "./database-model";
import { Database as DatabaseIcon, Maximize2, ArrowUpRight, MapPin } from "lucide";
import { ChartNoAxesCombined, GanttChart, Rss } from "lucide";
import { databasePropertyReadOnly, type Database, type DatabaseLayout, type DatabaseDataSource, type DatabaseProperty, type DatabasePropertyType, type DatabaseSnapshot, type DatabaseView } from "./database-model";
import { isWikiDatabase } from "./database-model";
import { createElement, Columns3, LayoutGrid, List, Table2, Plus, ChevronDown, Type, CircleChevronDown, AlignLeft, SquareCheck, Hash, Calendar, Link, Users, FileText, PanelRight, ListFilter, ArrowDownUp, Search, SlidersHorizontal, Ellipsis, Smile, Image, X, Check, type IconNode } from "lucide";
import { DatabasePeek } from "./database-peek";
import { openCalloutIconPicker } from "../../blocks/callout-icon-picker";
import { pageIconElement } from "../../shared/page-icons";
import "./databases.css";
import "./database-page-header.css";
import { queryDatabase, groupable, databaseGroups, fieldValue } from "./database-query";
import { renderDatabaseLayout, disposeDatabaseLayout, groupHeading } from "./database-layouts";
import { openViewMenu, openPropertyMenu, openGroupMenu } from "./database-menus";
import { DatabasePopover } from "./database-popover";
import { referencePicker } from "./database-reference-picker";
import { dependencyValue, relationIds } from "./database-dependencies";
import { scheduleDependencies, type RecordChange } from "./database-scheduling";
import { placeInput } from "./database-place-editor";
import { placeText } from "./database-place";

import { externalEntitiesChanged, externalLibrary, resolveExternal } from "../references/external-client";
import { requestPeople } from "../people/people-client";

type Pending = { pageId: string; propertyId: string; value: unknown; baseRevision: string; schemaRevision: string; sourceId: string };
type PresentationDraft = { baseRevision: string; hostRevision?: string; title?: string; icon?: string; cover?: string; coverPosition?: number | null };
type SourceTitleDraft = { sourceId: string; baseRevision: string; title: string; failed?: boolean };
type Hooks = { inline?: boolean; vaultKey: string; initialSourceUrl?: string; initialViewId?: string; viewChanged?: () => void; interactionMode?: "desktop" | "touch"; openPage: (id: string) => Promise<unknown>; openDatabase: (id?: string) => Promise<unknown>; changed: (page: Page) => void; createDatabase?: () => Promise<unknown>; createWiki?: () => Promise<unknown> };
const editableTypes: DatabasePropertyType[] = ["text", "number", "checkbox", "date", "select", "multi_select", "status", "url", "email", "phone", "place", "people", "relation"];
const typeLabels: Record<string, string> = { text: "Text", number: "Number", checkbox: "Checkbox", date: "Date", select: "Select", multi_select: "Multi-select", status: "Status", url: "URL", email: "Email", phone: "Phone", place: "Place", people: "People", relation: "Relation" };
const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const glyph = (node: IconNode, className = "") => createElement(node, { width: 18, height: 18, "stroke-width": 1.7, "aria-hidden": "true", class: className }).outerHTML;
function linkedDatabaseIcon(icon = "table-2") {
  const mark = document.createElement("span"); mark.className = "database-linked-icon";
  mark.setAttribute("role", "img");
  setUIAttribute(mark, "aria-label", "Linked data source"); setUIAttribute(mark, "title", "Linked data source");
  mark.append(pageIconElement(icon), createElement(ArrowUpRight, { class: "database-linked-heading", viewBox: "4 4 16 16", "aria-hidden": "true", focusable: "false" }));
  return mark;
}
const typeIcon = (type: string) => glyph(({ title: Type, text: AlignLeft, number: Hash, checkbox: SquareCheck, date: Calendar, select: CircleChevronDown, multi_select: CircleChevronDown, status: CircleChevronDown, url: Link, relation: Link, people: Users, files: FileText, place: MapPin } as Record<string, IconNode>)[type] ?? AlignLeft, "database-type-icon");
const optionColors = ["gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"];
let closeOptions: (() => void) | undefined;
function optionTag(option: { name: string; color?: string }) { return `<span class="database-tag" data-color="${optionColors.includes(option.color ?? "") ? option.color : "gray"}">${e(option.name)}</span>`; }

export function documentOverrides(page: Page, field: DatabaseProperty): boolean {
  const values = documentMetadata(page.body).values;
  if (field.type === "title") return own(values, "title");
  return !!(values.properties && typeof values.properties === "object" && own(values.properties as object, field.key)) || own(values, field.key);
}

function displayValue(field: DatabaseProperty, value: unknown): string {
  if (value === null || value === undefined) return "";
  if (field.type === "place") return placeText(value);
  if (["select", "status"].includes(field.type)) return field.options?.find(option => option.id === value)?.name ?? String(value);
  if (field.type === "multi_select" && Array.isArray(value)) return value.map(item => field.options?.find(option => option.id === item)?.name ?? String(item)).join(", ");
  if (field.type === "date" && typeof value === "object") {
    const date = value as { start?: string; end?: string };
    return `${date.start ?? ""}${date.end ? " → " + date.end : ""}`;
  }
  if (["formula", "rollup"].includes(field.type) && typeof value === "object") {
    const snapshot = value as Record<string, any>;
    const result = snapshot[field.type] ?? snapshot;
    const scalar = result[result.type];
    if (scalar == null) return "No imported result";
    if (typeof scalar !== "object") return String(scalar);
    if (result.type === "date") return displayValue({ ...field, type: "date" }, scalar);
    if (Array.isArray(scalar)) return `${scalar.length} imported values`;
    return "Imported result";
  }
  if (["people", "files", "relation"].includes(field.type) && Array.isArray(value)) return value.map(item => item?.name ?? item?.title ?? (field.type === "relation" ? item?.unresolved ? "Unavailable page" : "Linked page" : "Unnamed item")).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function propertyInput(field: DatabaseProperty, page: Page, value: unknown, commit: (value: unknown) => void, wrap = false, pages?: Page[], optionHost?: HTMLElement): HTMLElement {
  const label = `${field.name}: ${page.title}`;
  const wrapper = document.createElement("div");
  wrapper.className = "database-cell";
  if (["people", "relation"].includes(field.type)) { wrapper.dataset.externalProperty = field.id; wrapper.dataset.externalPage = page.id; }
  const override = documentOverrides(page, field);
  if (!override && !databasePropertyReadOnly(field) && (field.type === "people" && !field.notion || field.localRelation && pages)) return referencePicker(field, page, value, commit, pages, optionHost);
  const readOnly = databasePropertyReadOnly(field) || ["people", "files", "relation"].includes(field.type) || override;
  if (readOnly) {
    wrapper.classList.add("database-cell-readonly");
    wrapper.textContent = displayValue(field, value) || "—";
    if (["relation", "people"].includes(field.type) && Array.isArray(value) && value.length) {
      wrapper.replaceChildren();
      for (const reference of value) {
        const entity = field.type === "people" ? resolveExternal(`user://${reference?.id}`)
          : reference?.notionPageId ? resolveExternal(`https://www.notion.so/${reference.notionPageId}`)
          : externalLibrary().entities.find(entity => entity.kind === "page" && entity.localId === reference?.pageId);
        const localId = entity?.status === "resolved" ? entity.localId : !reference?.notionPageId && field.type === "relation" ? reference?.pageId : undefined;
        if (localId && field.type === "relation") {
          const link = document.createElement("a"); link.href = `#page/${encodeURIComponent(localId)}`; link.textContent = entity?.label || reference.title || "Open linked page";
          wrapper.append(link, document.createTextNode(" "));
        } else if (localId) {
          const person = document.createElement("button"); person.type = "button"; person.className = "database-tag"; person.textContent = `@${entity?.label || reference.name}`;
          person.onclick = () => requestPeople({ selectedId: localId }); wrapper.append(person, document.createTextNode(" "));
        } else {
          const unknown = document.createElement("span"); unknown.className = "database-tag external-unresolved"; unknown.setAttribute("aria-disabled", "true"); unknown.textContent = field.type === "people" ? "@Unknown user" : "Unknown page";
          wrapper.append(unknown, document.createTextNode(" "));
        }
      }
    }
    wrapper.setAttribute("aria-label", label);
    const reason = override ? "Defined in document metadata — edit in source" : ["formula", "rollup"].includes(field.type) ? "Imported result — does not recalculate locally" : "Preserved value — editing is not available";
    wrapper.title = reason;
    const note = document.createElement("small"); note.textContent = reason; wrapper.append(note);
    return wrapper;
  }
  if (field.type === "place") return placeInput(value, label, commit, optionHost);
  if (["select", "multi_select", "status"].includes(field.type)) {
    const control = document.createElement("button"); control.type = "button"; control.className = "database-select-control";
    control.setAttribute("aria-label", label); control.setAttribute("aria-haspopup", "listbox"); control.setAttribute("aria-expanded", "false");
    let selected = new Set<string>(Array.isArray(value) ? value : typeof value === "string" ? [value] : []);
    const draw = () => { control.innerHTML = [...selected].map(id => optionTag(field.options?.find(option => option.id === id) ?? { name: id })).join("") || `<span class="database-empty-value" data-i18n="Empty">Empty</span>`; };
    draw();
    control.addEventListener("click", () => {
      closeOptions?.();
      const popover = document.createElement("div"); popover.className = "database-option-popover";
      popover.setAttribute("role", "listbox"); popover.setAttribute("aria-label", field.name);
      if (field.type === "multi_select") popover.setAttribute("aria-multiselectable", "true");
      const rect = control.getBoundingClientRect();
      Object.assign(popover.style, { position: "fixed", left: `${Math.max(8, Math.min(rect.left, window.innerWidth - 270))}px`, top: `${Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - 300))}px`, width: `${Math.max(240, Math.min(rect.width, 360))}px` });
      const dismiss = () => { popover.remove(); control.setAttribute("aria-expanded", "false"); document.removeEventListener("pointerdown", outside, true); if (closeOptions === dismiss) closeOptions = undefined; };
      closeOptions = dismiss;
      const outside = (event: PointerEvent) => { if (!popover.contains(event.target as Node) && !control.contains(event.target as Node)) dismiss(); };
      for (const option of [{ id: "", name: "Clear", color: "gray" }, ...(field.options ?? [])]) {
        const button = document.createElement("button"); button.type = "button"; button.className = "database-option";
        button.setAttribute("role", "option"); button.setAttribute("aria-selected", String(selected.has(option.id))); button.innerHTML = option.id ? optionTag(option) : "Clear";
        button.addEventListener("click", () => {
          if (!option.id) selected.clear();
          else if (field.type === "multi_select") { if (selected.has(option.id)) selected.delete(option.id); else selected.add(option.id); }
          else selected = new Set([option.id]);
          commit(field.type === "multi_select" ? [...selected] : [...selected][0] ?? null); draw();
          wrapper.dispatchEvent(new Event("change", { bubbles: true }));
          if (field.type !== "multi_select" || !option.id) { dismiss(); control.focus(); }
          else popover.querySelectorAll<HTMLButtonElement>("button").forEach(item => item.setAttribute("aria-selected", String(selected.has(item.dataset.optionId!))));
        });
        button.dataset.optionId = option.id; popover.append(button);
      }
      popover.addEventListener("keydown", event => {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); dismiss(); control.focus(); }
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault(); const options = [...popover.querySelectorAll<HTMLButtonElement>("button")], index = options.indexOf(document.activeElement as HTMLButtonElement);
          options[event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length]?.focus();
        }
      });
      (optionHost ?? document.body).append(popover); control.setAttribute("aria-expanded", "true"); popover.querySelector<HTMLButtonElement>("button[aria-selected=true],button")?.focus(); document.addEventListener("pointerdown", outside, true);
    });
    wrapper.append(control); return wrapper;
  }
  if (field.type === "date") {
    const date = value && typeof value === "object" ? value as { start?: string; end?: string } : { start: typeof value === "string" ? value : "" };
    const start = document.createElement("input"), end = document.createElement("input");
    start.value = date.start ?? ""; end.value = date.end ?? "";
    start.placeholder = "YYYY-MM-DD"; end.placeholder = "End date (optional)";
    start.setAttribute("aria-label", label); end.setAttribute("aria-label", `End ${label}`);
    const update = () => commit(start.value.trim() ? { ...date, start: start.value.trim(), end: end.value.trim() || null } : null);
    start.addEventListener("input", update); end.addEventListener("input", update);
    wrapper.append(start, end); return wrapper;
  }
  if (wrap && ["title", "text"].includes(field.type)) {
    const input = document.createElement("textarea"); input.rows = 1; input.setAttribute("aria-label", label); input.value = value == null ? "" : String(value);
    const resize = () => { input.style.height = "auto"; input.style.height = `${Math.max(30, input.scrollHeight)}px`; };
    input.addEventListener("input", () => { resize(); commit(input.value); }); wrapper.append(input); requestAnimationFrame(resize); return wrapper;
  }
  const input = document.createElement("input"); input.setAttribute("aria-label", label);
  if (field.type === "checkbox") { input.type = "checkbox"; input.checked = value === true; }
  else { input.type = field.type === "number" ? "number" : "text"; input.value = value == null ? "" : String(value); if (field.type === "number") input.step = "any"; }
  input.addEventListener("input", () => commit(field.type === "checkbox" ? input.checked : field.type === "number" ? input.value === "" ? null : Number(input.value) : input.value));
  wrapper.append(input);
  if (field.type === "checkbox") { wrapper.classList.add("database-checkbox-cell"); const check = createElement(Check, { class: "database-checkbox-check", width: 14, height: 14, "stroke-width": 2.5, "aria-hidden": "true" }); wrapper.append(check); }
  return wrapper;
}

function formDialog(title: string, content: string, submit: (form: FormData) => Promise<void>) {
  if (document.querySelector(".database-dialog")) return;
  const dialog = document.createElement("dialog"); dialog.className = "database-dialog"; dialog.setAttribute("aria-label", title);
  dialog.innerHTML = `<form><header><h2>${e(title)}</h2><button type="button" data-dismiss aria-label="Close" data-i18n-aria-label="Close">${glyph(X)}</button></header>${content}<p class="database-message" role="status"></p></form>`;
  const dismiss = () => dialog.close(); dialog.querySelector("[data-dismiss]")!.addEventListener("click", dismiss);
  dialog.querySelectorAll("[data-cancel]").forEach(button => button.addEventListener("click", dismiss));
  let busy = false;
  dialog.addEventListener("cancel", event => { if (busy) event.preventDefault(); });
  dialog.addEventListener("close", () => dialog.remove());
  dialog.querySelector("form")!.addEventListener("submit", event => {
    event.preventDefault(); if (busy) return; busy = true;
    const values = new FormData(event.target as HTMLFormElement);
    dialog.querySelectorAll<HTMLButtonElement>("button").forEach(button => button.disabled = true);
    void submit(values).then(dismiss).catch(error => { dialog.querySelector("[role=status]")!.textContent = error.message; }).finally(() => { busy = false; dialog.querySelectorAll<HTMLButtonElement>("button").forEach(button => button.disabled = false); });
  });
  document.body.append(dialog); dialog.showModal(); return dialog;
}

export class DatabaseWorkspace {
  private selectedRows = new Set<string>();
  private updateSelection?: () => void;
  private calendarAnchor = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })();
  private menu?: DatabasePopover;
  private visibleLimit?: number;
  private layoutSaving = false;
  private timelineTitleId?: string;
  private sourceSaving = false;
  private presentation?: PresentationDraft;
  private presentationSaving?: Promise<boolean>;
  private presentationFailed = false;
  private sourceTitle?: SourceTitleDraft;
  private sourceTitleSaving?: Promise<boolean>;
  private wikiPickerCleanup?: () => void;
  private iconCleanup?: () => void;
  private coverPickerCleanup?: () => void;
  private coverCleanup?: () => void;
  private coverSignature?: string;
  private peek?: DatabasePeek;
  private search = "";
  private showSearch = false;
  private opening = 0;
  private snapshot?: DatabaseSnapshot;
  private pending = new Map<string, Pending>();
  private resizeCleanup?: () => void;
  private widthDraft?: { viewId: string; baseRevision: string; layout: DatabaseLayout };
  private widthSaving?: Promise<boolean>;
  private orderDraft?: { viewId: string; baseRevision: string; rowOrder: string[] };
  private orderSaving?: Promise<boolean>;
  private saving?: Promise<boolean>;
  private failed = false;
  private alive = true;
  private activeView = "";
  private pointerDown = false;
  private rowsNeedRefresh = false;
  private refreshTimer?: ReturnType<typeof setTimeout>;
  private saveTimer?: ReturnType<typeof setTimeout>;
  private inlineLayoutCleanup?: () => void;
  private viewOverflowCleanup?: () => void;
  constructor(private host: HTMLElement, private hooks: Hooks) {
    if (hooks.inline) this.inlineLayoutCleanup = installInlineDatabaseLayout(host);
    host.addEventListener("pointerdown", () => { this.pointerDown = true; });
    window.addEventListener("pointerup", this.pointerUp);
    window.addEventListener("pointercancel", this.pointerUp);
    document.addEventListener(externalEntitiesChanged, this.referencesChanged);
  }
  private referencesChanged = () => {
    if (!this.snapshot) return;
    for (const element of this.host.querySelectorAll<HTMLElement>("[data-external-property]")) {
      const page = this.snapshot.pages.find(page => page.id === element.dataset.externalPage);
      const field = this.snapshot.dataSources.flatMap(source => source.properties).find(field => field.id === element.dataset.externalProperty);
      if (page && field) element.replaceWith(propertyInput(field, page, page.properties[field.key], () => {}));
    }
  };
  private pointerUp = () => { this.pointerDown = false; if (this.rowsNeedRefresh) this.scheduleRows(); };
  get dirty() { return this.sourceSaving || !!(this.menu?.saveOnDismiss && this.menu.dirty) || this.layoutSaving || this.pending.size > 0 || !!this.orderDraft || !!this.widthDraft || !!this.widthSaving || !!this.saving || !!this.peek?.dirty || !!this.presentation || !!this.presentationSaving || !!this.sourceTitle || !!this.sourceTitleSaving; }
  presentHost(page: Page) {
    if (!this.snapshot || page.id !== this.snapshot.hostPage?.id || this.presentation) return;
    this.snapshot.hostPage = page; this.snapshot.database = { ...this.snapshot.database, title: page.title, icon: page.icon, parent: page.parent };
    this.refreshPresentation();
  }
  destroy() { this.host.querySelectorAll<HTMLElement>(".database-alternate-layout").forEach(disposeDatabaseLayout); this.resizeCleanup?.(); this.inlineLayoutCleanup?.(); this.viewOverflowCleanup?.(); this.wikiPickerCleanup?.(); this.menu?.destroy(); this.menu = undefined; this.alive = false; document.removeEventListener(externalEntitiesChanged, this.referencesChanged); this.iconCleanup?.(); this.coverPickerCleanup?.(); this.coverCleanup?.(); this.peek?.destroy(); closeOptions?.(); clearTimeout(this.refreshTimer); clearTimeout(this.saveTimer); window.removeEventListener("pointerup", this.pointerUp); window.removeEventListener("pointercancel", this.pointerUp); }
  private message(text: string) { if (this.alive) { const element = this.host.querySelector<HTMLElement>(".database-message"); if (element) { element.dataset.state = text === "Saved locally" ? "saved" : "active"; setUIText(element, text); element.classList.toggle("is-error", !["Saved locally", "Saving changes…", "Unsaved changes"].includes(text)); } const recovery = this.host.querySelector<HTMLElement>(".database-save-recovery"); if (recovery) recovery.hidden = !this.failed && !this.presentationFailed && !this.sourceTitle?.failed; } }
  private scheduleSave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => { if (this.alive) void this.flush(); }, 600);
  }
  private draftKey() { return `notdown-database-draft:${this.hooks.vaultKey}:${this.snapshot!.database.id}`; }
  private viewKey() { return `${this.draftKey()}:view${this.hooks.initialSourceUrl ? `:${this.hooks.initialSourceUrl.toLowerCase().replace(/-/g, "")}` : ""}`; }
  private persist() {
    try {
      if (this.pending.size) sessionStorage.setItem(this.draftKey(), JSON.stringify([...this.pending])); else sessionStorage.removeItem(this.draftKey());
      if (this.widthDraft) sessionStorage.setItem(`${this.draftKey()}:column-widths`, JSON.stringify(this.widthDraft)); else sessionStorage.removeItem(`${this.draftKey()}:column-widths`);
      if (this.orderDraft) sessionStorage.setItem(`${this.draftKey()}:row-order`, JSON.stringify(this.orderDraft)); else sessionStorage.removeItem(`${this.draftKey()}:row-order`);
    }
    catch { this.message("Browser draft storage is full. Save before leaving this database."); }
  }
  async load(id?: string) {
    if (id) {
      const snapshot = await api<DatabaseSnapshot>(`/databases/${encodeURIComponent(id)}`);
      if (!this.alive) return;
      if (snapshot.database.trashed) throw new Error("This database is in Trash or its host page no longer exists.");
      this.snapshot = snapshot;
      this.activeView ||= databaseSourceView(snapshot, this.hooks.initialSourceUrl)?.id ?? "";
      try { const draft = sessionStorage.getItem(`${this.draftKey()}:presentation`); if (draft) this.presentation = JSON.parse(draft); } catch { /* Optional tab draft. */ }
      try { const draft = sessionStorage.getItem(`${this.draftKey()}:source-title`); if (draft) this.sourceTitle = JSON.parse(draft); } catch { /* Optional tab draft. */ }
      try { this.activeView = sessionStorage.getItem(this.viewKey()) ?? this.activeView; } catch { /* View selection is optional local state. */ }
      if (snapshot.views.some(view => view.id === this.hooks.initialViewId)) this.rememberView(this.hooks.initialViewId!);
      try { const draft = sessionStorage.getItem(this.draftKey()); if (draft) this.pending = new Map(JSON.parse(draft)); } catch { /* Disk remains authoritative. */ }
      try { const draft = sessionStorage.getItem(`${this.draftKey()}:row-order`); if (draft) { this.orderDraft = JSON.parse(draft); this.failed = true; } } catch { /* Disk remains authoritative. */ }
      try { const draft = sessionStorage.getItem(`${this.draftKey()}:column-widths`); if (draft) { this.widthDraft = JSON.parse(draft); this.failed = true; } } catch { /* Disk remains authoritative. */ }
      this.render();
      if (this.widthDraft) this.message("Your column width draft is preserved. Retry saving or discard the draft and reload.");
      else if (this.orderDraft) this.message("Your row order draft is preserved. Retry saving or discard the draft and reload.");
      else if (this.sourceTitle?.failed) this.message("Your data source name draft is preserved. Retry saving or discard the draft and reload.");
      else if (this.pending.size || this.presentation || this.sourceTitle) { this.message("Recovered unsaved edits. Saving…"); this.scheduleSave(); }
    } else {
      const databases = await api<Database[]>("/databases");
      if (!this.alive) return;
      this.host.innerHTML = `<section class="database-workspace"><header class="database-heading"><div><h1 data-i18n="Databases">Databases</h1><p data-i18n="Organize Markdown pages with shared properties and saved views.">Organize Markdown pages with shared properties and saved views.</p></div><button class="primary-button" data-db-new data-i18n="New database">New database</button></header><div class="database-list">${databases.map(database => `<button data-db-open="${e(database.id)}"><strong>${e(database.title)}</strong><span>${database.dataSourceIds.length} <span data-i18n="data source">data source</span>${database.dataSourceIds.length === 1 ? "" : "s"} →</span></button>`).join("") || `<div class="database-empty"><h2 data-i18n="No databases yet">No databases yet</h2><p data-i18n="Create a database, or import one from Notion using the sidebar.">Create a database, or import one from Notion using the sidebar.</p></div>`}</div></section>`;
      this.host.querySelector("[data-db-new]")!.addEventListener("click", () => this.newDatabase());
      const newWiki = document.createElement("button"); newWiki.className = "secondary-button"; setUIText(newWiki, "New wiki");
      newWiki.onclick = () => { void (this.hooks.createWiki ? this.hooks.createWiki() : api<DatabaseSnapshot>("/databases", { method: "POST", body: JSON.stringify({ title: "New wiki", kind: "wiki" }) }).then(snapshot => this.hooks.openDatabase(snapshot.database.id))); };
      this.host.querySelector(".database-heading")!.append(newWiki);
      for (const database of databases) if (isWikiDatabase(database)) setUIText(this.host.querySelector(`[data-db-open="${CSS.escape(database.id)}"] span`)!, "Wiki · Home and page views →");
      this.host.querySelectorAll<HTMLElement>("[data-db-open]").forEach(button => button.addEventListener("click", () => void this.hooks.openDatabase(button.dataset.dbOpen)));
      const list = this.host.querySelector<HTMLElement>(".database-list")!;
      const catalog = document.createElement("div"); catalog.hidden = true; list.after(catalog);
      const tabs = document.createElement("div"); tabs.className = "database-view-tabs database-catalog-tabs"; tabs.setAttribute("role", "tablist"); setUIAttribute(tabs, "aria-label", "Database library");
      for (const name of ["Databases", "Data sources"]) {
        const button = document.createElement("button"); button.textContent = name; button.setAttribute("role", "tab"); button.setAttribute("aria-selected", String(name === "Databases"));
        button.addEventListener("click", async () => {
          const showSources = name === "Data sources";
          tabs.querySelectorAll("button").forEach(item => item.setAttribute("aria-selected", String(item === button)));
          list.hidden = showSources; catalog.hidden = !showSources;
          if (!showSources) return;
          setUIText(catalog, "Loading data sources…");
          try { const sources = await api<DatabaseSourceSummary[]>("/data-sources"); if (this.alive && catalog.isConnected) renderSourceCatalog(catalog, sources); }
          catch (error) { if (this.alive) catalog.textContent = error instanceof Error ? error.message : "Data sources could not be loaded."; }
        }); tabs.append(button);
      }
      list.before(tabs);
    }
  }
  private newDatabase() {
    if (this.hooks.createDatabase) { void this.hooks.createDatabase(); return; }
    void api<DatabaseSnapshot>("/databases", { method: "POST", body: JSON.stringify({ title: "New database" }) })
      .then(snapshot => this.hooks.openDatabase(snapshot.database.id))
      .catch(error => this.message(error instanceof Error ? error.message : "Could not create database"));
  }
  private get view() { return this.snapshot!.views.find(view => view.id === this.activeView) ?? this.snapshot!.views[0]; }
  private get showSourceTitle() { return this.view?.layout?.showDataSourceTitle ?? (this.hooks.inline || this.snapshot!.dataSources.length > 1); }
  get selectedViewId() { return this.snapshot ? this.view?.id : undefined; }
  private rememberView(id: string) { this.selectedRows.clear(); this.visibleLimit = undefined; this.activeView = id; try { sessionStorage.setItem(this.viewKey(), id); } catch { /* Saved view definitions remain on disk. */ } this.hooks.viewChanged?.(); }
  private get source() { return this.snapshot!.dataSources.find(source => source.id === this.view?.dataSourceId) ?? this.snapshot!.dataSources[0]; }
  private queue(page: Page, field: DatabaseProperty, value: unknown) {
    const key = `${page.id}/${field.id}`, previous = this.pending.get(key);
    this.pending.set(key, { pageId: page.id, propertyId: field.id, value, baseRevision: previous?.baseRevision ?? page.revision, schemaRevision: previous?.schemaRevision ?? this.source.revision, sourceId: this.source.id });
    this.persist(); this.message(this.failed ? "Save failed. Your edits are kept; review the error before retrying." : "Unsaved changes");
    this.scheduleSave();
  }
  async flush(): Promise<boolean> {
    clearTimeout(this.saveTimer);
    if (this.sourceSaving) { this.message("Wait for data source changes to finish."); return false; }
    if (this.menu?.saveOnDismiss && !(await this.menu.save())) return false;
    if (this.peek && !(await this.peek.flush())) return false;
    if (!(await this.flushPresentation())) return false;
    if (this.sourceTitleSaving && !(await this.sourceTitleSaving)) return false;
    // Records use the source revision captured when editing. Save them before
    // changing the source title, which also advances that revision.
    if (!(await this.flushRecords())) return false;
    if (!(await this.flushWidths())) return false;
    if (!(await this.flushOrder())) return false;
    return this.flushSourceTitle();
  }
  private async flushWidths(): Promise<boolean> {
    if (this.widthSaving) return this.widthSaving;
    if (this.failed) return false;
    if (!this.widthDraft) return true;
    const draft = this.widthDraft;
    this.widthSaving = (async () => {
      try {
        this.message("Saving changes…");
        const saved = await api<DatabaseView>(`/database-views/${draft.viewId}`, { method: "PUT", body: JSON.stringify({ baseRevision: draft.baseRevision, layout: draft.layout }) });
        this.snapshot!.views = this.snapshot!.views.map(view => view.id === saved.id ? saved : view);
        this.widthDraft = undefined; this.persist(); this.message("Saved locally"); return true;
      } catch (error) { this.failed = true; this.message(`${error instanceof Error ? error.message : "Save failed"}. Your column width draft is preserved.`); return false; }
      finally { this.widthSaving = undefined; }
    })();
    return this.widthSaving;
  }
  private async flushOrder(): Promise<boolean> {
    if (this.orderSaving) return this.orderSaving;
    if (this.failed) return false;
    if (!this.orderDraft) return true;
    const draft = this.orderDraft;
    this.orderSaving = (async () => {
      try {
        const saved = await api<DatabaseView>(`/database-views/${draft.viewId}`, { method: "PUT", body: JSON.stringify({ baseRevision: draft.baseRevision, rowOrder: draft.rowOrder }) });
        this.snapshot!.views = this.snapshot!.views.map(view => view.id === saved.id ? saved : view);
        this.orderDraft = undefined; this.persist(); this.scheduleRows(); this.message("Saved locally"); return true;
      } catch (error) { this.failed = true; this.message(`${error instanceof Error ? error.message : "Save failed"}. Your row order draft is preserved.`); return false; }
      finally { this.orderSaving = undefined; }
    })();
    return this.orderSaving;
  }
  private async flushRecords(): Promise<boolean> {
    if (this.saving) return this.saving;
    if (this.failed) return false;
    if (!this.pending.size) return true;
    this.saving = Promise.resolve().then(async () => {
      this.message("Saving changes…");
      try {
        while (this.pending.size) {
          const [key, entry] = this.pending.entries().next().value!;
          const saved = await api<Page>(`/data-sources/${encodeURIComponent(entry.sourceId)}/records/${encodeURIComponent(entry.pageId)}`, { method: "PUT", body: JSON.stringify(entry) });
          const existing = this.snapshot!.pages.find(page => page.id === saved.id);
          if (existing) Object.assign(existing, saved);
          if (this.pending.get(key) === entry) this.pending.delete(key);
          for (const next of this.pending.values()) if (next.pageId === saved.id && next.baseRevision === entry.baseRevision) next.baseRevision = saved.revision;
          this.persist(); this.hooks.changed(saved);
        }
        this.message("Saved locally"); this.scheduleRows(); return true;
      } catch (error) {
        this.failed = true; this.message(`${error instanceof Error ? error.message : "Save failed"}. Edits remain in this tab. Your draft is kept until you retry or discard it.`); return false;
      } finally {
        this.saving = undefined;
      }
    });
    return this.saving;
  }
  private persistSourceTitle() {
    try { if (this.sourceTitle) sessionStorage.setItem(`${this.draftKey()}:source-title`, JSON.stringify(this.sourceTitle)); else sessionStorage.removeItem(`${this.draftKey()}:source-title`); }
    catch { this.message("Browser draft storage is full. Save before leaving this database."); }
  }
  private async flushSourceTitle(): Promise<boolean> {
    if (this.sourceTitleSaving) return this.sourceTitleSaving;
    if (this.sourceTitle?.failed) return false;
    if (!this.sourceTitle) return true;
    this.sourceTitleSaving = Promise.resolve().then(async () => {
      this.message("Saving changes…");
      try {
        while (this.sourceTitle) {
          const submitted = this.sourceTitle;
          const saved = await api<DatabaseDataSource>(`/data-sources/${encodeURIComponent(submitted.sourceId)}`, { method: "PUT", body: JSON.stringify({ title: submitted.title, baseRevision: submitted.baseRevision }) });
          this.snapshot!.dataSources = this.snapshot!.dataSources.map(source => source.id === saved.id ? saved : source);
          if (this.sourceTitle === submitted) this.sourceTitle = undefined;
          else this.sourceTitle.baseRevision = saved.revision;
          // Only our acknowledged title change is safe to carry into cells
          // entered while this request was in flight; the fields are unchanged.
          for (const entry of this.pending.values()) if (entry.sourceId === saved.id && entry.schemaRevision === submitted.baseRevision) entry.schemaRevision = saved.revision;
          this.persist(); this.persistSourceTitle(); this.refreshSourceTitle();
          document.dispatchEvent(new CustomEvent("notdown-database-updated", { detail: this.snapshot }));
        }
        this.message(this.pending.size ? "Unsaved changes" : "Saved locally"); return true;
      } catch (error) {
        if (this.sourceTitle) this.sourceTitle.failed = true;
        this.persistSourceTitle(); this.message(`${error instanceof Error ? error.message : "Save failed"}. Your data source name is preserved in this tab.`); return false;
      } finally { this.sourceTitleSaving = undefined; }
    });
    return this.sourceTitleSaving;
  }
  private refreshSourceTitle() {
    if (!this.alive || !this.snapshot) return;
    const source = this.source;
    const input = this.host.querySelector<HTMLInputElement>(".database-source-title-input");
    if (input && source) {
      const title = this.sourceTitle?.sourceId === source.id ? this.sourceTitle.title : source.title;
      if (input.value !== title) input.value = title;
      input.closest("h2")?.setAttribute("aria-label", title);
    }
    this.host.querySelectorAll<HTMLElement>("[data-db-tab]").forEach(tab => {
      const view = this.snapshot!.views.find(view => view.id === tab.dataset.dbTab)!;
      const title = this.snapshot!.dataSources.find(source => source.id === view.dataSourceId)?.title ?? "Unavailable source";
      tab.title = `${view.name} · ${title}`; tab.setAttribute("aria-description", `Data source: ${title}`);
    });
  }
  private renderSourceTitle(source: DatabaseDataSource) {
    const title = document.createElement("h2"); title.className = "database-source-title"; title.dataset.sourceId = source.id;
    if (this.view?.linked) title.append(linkedDatabaseIcon());
    const input = document.createElement("input"); input.type = "text"; input.className = "database-source-title-input";
    setUIAttribute(input, "aria-label", "Data source title"); input.readOnly = !!source.unavailable || !!source.trashed;
    input.value = this.sourceTitle?.sourceId === source.id ? this.sourceTitle.title : source.title;
    title.setAttribute("aria-label", input.value);
    input.addEventListener("input", () => {
      this.sourceTitle = { ...(this.sourceTitle ?? { sourceId: source.id, baseRevision: this.snapshot!.dataSources.find(item => item.id === source.id)!.revision }), title: input.value };
      title.setAttribute("aria-label", input.value); this.persistSourceTitle();
      if (!this.sourceTitle.failed) { this.message("Unsaved changes"); this.scheduleSave(); }
    });
    input.addEventListener("blur", () => { if (this.sourceTitle) void this.flush(); });
    input.addEventListener("keydown", event => {
      if (event.isComposing) return;
      if (event.key === "Enter") { event.preventDefault(); void this.flush(); }
      if (event.key === "Escape" && !this.sourceTitleSaving) {
        event.preventDefault(); event.stopPropagation(); this.sourceTitle = undefined; this.persistSourceTitle(); this.refreshSourceTitle();
        this.message(this.pending.size || this.presentation ? "Unsaved changes" : "Saved locally");
      }
    });
    title.append(input); return title;
  }
  private persistPresentation() {
    try { if (this.presentation) sessionStorage.setItem(`${this.draftKey()}:presentation`, JSON.stringify(this.presentation)); else sessionStorage.removeItem(`${this.draftKey()}:presentation`); }
    catch { this.message("Browser draft storage is full. Save before leaving this database."); }
  }
  private queuePresentation(patch: Pick<PresentationDraft, "title" | "icon" | "cover" | "coverPosition">) {
    this.presentation = { ...(this.presentation ?? { baseRevision: this.snapshot!.database.revision, ...(this.snapshot!.hostPage ? { hostRevision: this.snapshot!.hostPage.revision } : {}) }), ...patch };
    this.persistPresentation(); this.message("Unsaved changes");
    if (!this.presentationFailed) this.scheduleSave();
  }
  private async flushPresentation(): Promise<boolean> {
    if (this.presentationSaving) return this.presentationSaving;
    if (this.presentationFailed) return false;
    if (!this.presentation) return true;
    this.presentationSaving = Promise.resolve().then(async () => {
      try {
        while (this.presentation) {
          const submitted = this.presentation;
          const saved = await api<DatabaseSnapshot>(`/databases/${this.snapshot!.database.id}`, { method: "PUT", body: JSON.stringify(submitted) });
          this.snapshot!.database = saved.database; this.snapshot!.hostPage = saved.hostPage;
          if (this.presentation === submitted) this.presentation = undefined;
          else { this.presentation.baseRevision = saved.database.revision; this.presentation.hostRevision = saved.hostPage?.revision; }
          this.persistPresentation();
          if (saved.hostPage) this.hooks.changed(saved.hostPage);
          document.dispatchEvent(new CustomEvent("notdown-database-updated", { detail: saved }));
          this.refreshPresentation();
        }
        this.message("Saved locally"); return true;
      } catch (error) {
        this.presentationFailed = true; this.persistPresentation(); this.message(`${error instanceof Error ? error.message : "Save failed"}. Your database appearance draft is preserved in this tab.`); return false;
      } finally { this.presentationSaving = undefined; }
    });
    return this.presentationSaving;
  }
  private refreshPresentation() {
    if (!this.alive || !this.snapshot) return;
    const icon = this.presentation?.icon ?? this.snapshot.hostPage?.icon ?? this.snapshot.database.icon ?? "";
    const pageHeader = !this.hooks.inline && !isWikiDatabase(this.snapshot.database);
    const hasIcon = !!icon && icon !== "file-text" && icon !== "table-2";
    const button = this.host.querySelector<HTMLButtonElement>("[data-db-icon]");
    if (button) { button.hidden = pageHeader && !hasIcon && !this.view?.linked; button.replaceChildren(this.view?.linked && !this.showSourceTitle ? linkedDatabaseIcon(icon || "table-2") : pageIconElement(icon)); }
    const addIcon = this.host.querySelector<HTMLButtonElement>("[data-db-add-icon]"); if (addIcon) addIcon.hidden = hasIcon || !!this.view?.linked;
    const properties = this.snapshot.hostPage?.properties ?? this.snapshot.database.properties as Record<string, unknown> ?? {};
    const value = this.presentation?.cover ?? properties.cover;
    const cover = typeof value === "string" && isPageCoverPath(value) ? value : "";
    const raw = this.presentation && own(this.presentation, "coverPosition") ? this.presentation.coverPosition : properties.coverPosition;
    const position = typeof raw === "number" && Number.isFinite(raw) ? Math.max(0, Math.min(100, raw)) : 50;
    const addCover = this.host.querySelector<HTMLButtonElement>("[data-db-add-cover]"); if (addCover) addCover.hidden = !!cover;
    const region = this.host.querySelector<HTMLElement>(".database-page-cover");
    const signature = JSON.stringify([cover, position]);
    if (region && signature !== this.coverSignature) {
      this.coverCleanup?.(); this.coverSignature = signature;
      this.coverCleanup = renderDatabasePageCover(region, cover, position, anchor => void this.chooseCover(anchor), value => this.applyCover({ coverPosition: value }));
    }
    this.host.querySelector(".database-workspace")?.classList.toggle("has-database-cover", pageHeader && !!cover);
    const title = this.host.querySelector<HTMLInputElement>("[data-i18n-aria-label='Database title']");
    if (title) { title.value = this.presentation?.title ?? this.snapshot.database.title; title.closest("h1")?.setAttribute("aria-label", title.value); }
  }
  private async chooseIcon(anchor: HTMLElement) {
    if (!(await this.flush()) || !this.alive) return;
    this.coverPickerCleanup?.(); this.coverPickerCleanup = undefined; this.iconCleanup?.();
    this.iconCleanup = openCalloutIconPicker(anchor, icon => {
      this.iconCleanup = undefined;
      this.queuePresentation({ icon }); this.refreshPresentation(); void this.flush();
    }, "Database icon", { lucide: true, current: this.snapshot!.hostPage?.icon ?? this.snapshot!.database.icon ?? "table-2" });
  }
  private applyCover(patch: Pick<PresentationDraft, "cover" | "coverPosition">) {
    if (!this.alive) return;
    this.queuePresentation(patch); this.refreshPresentation(); void this.flush();
  }
  private async chooseCover(anchor: HTMLElement) {
    if (!(await this.flush()) || !this.alive) return;
    this.iconCleanup?.(); this.coverPickerCleanup?.();
    const properties = this.snapshot!.hostPage?.properties ?? this.snapshot!.database.properties as Record<string, unknown> ?? {};
    const cover = typeof properties.cover === "string" ? properties.cover : "";
    this.coverPickerCleanup = openPageCoverPicker(anchor, {
      cover,
      onSelect: value => { this.coverPickerCleanup = undefined; this.applyCover({ cover: value, coverPosition: null }); },
      onRemove: () => { this.coverPickerCleanup = undefined; this.applyCover({ cover: "", coverPosition: null }); },
      onUpload: async file => {
        const data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader(); reader.onerror = reject; reader.onload = () => resolve(String(reader.result).split(",")[1]); reader.readAsDataURL(file);
        });
        const uploaded = await api<{ path: string }>("/assets", { method: "POST", body: JSON.stringify({ name: file.name, contentType: file.type, data }) });
        if (!this.alive) return;
        this.coverPickerCleanup = undefined; this.applyCover({ cover: uploaded.path, coverPosition: null });
      },
      onError: error => this.message(error instanceof Error ? error.message : String(error)),
    });
  }
  private matchingRows(source: DatabaseDataSource): Page[] {
    const rows = queryDatabase(this.snapshot!.pages, source, this.view, this.search);
    const field = !["calendar", "chart"].includes(this.view.type) && source.properties.find(field => field.id === this.view.layout?.groupBy);
    return field ? databaseGroups(rows, field, this.view).flatMap(group => group.pages) : rows;
  }
  private rows(source: DatabaseDataSource): Page[] { if (["chart", "map", "dashboard"].includes(this.view.type)) return this.matchingRows(source); return this.matchingRows(source).slice(0, this.visibleLimit ?? (this.view.layout?.loadLimit || Infinity)); }
  private updateLoadMore() {
    this.host.querySelector(".database-load-more")?.remove();
    const total = this.matchingRows(this.source).length, shown = this.rows(this.source).length;
    if (shown >= total) return;
    const button = document.createElement("button"); button.className = "database-load-more"; button.textContent = `Load more (${shown} of ${total})`;
    button.onclick = () => { this.visibleLimit = shown + (this.view.layout?.loadLimit || 50); this.scheduleRows(); };
    this.host.querySelector(".database-row-count")?.before(button);
  }
  private queueReference(page: Page, field: DatabaseProperty, value: unknown) {
    if (field.dependencyRole !== "blocking") { this.queueScheduled([{ page, field, value }]); return; }
    const forward = this.source.properties.find(item => item.id === field.inversePropertyId && item.dependencyRole === "blockedBy");
    if (!forward) return;
    const selected = new Set(relationIds(value));
    const changes = this.snapshot!.pages.filter(item => item.dataSourceId === this.source.id && item.id !== page.id).flatMap(item => {
      const prior = this.pending.get(`${item.id}/${forward.id}`)?.value ?? item.properties[forward.key];
      const had = relationIds(prior).includes(page.id), wants = selected.has(item.id);
      if (had === wants) return [];
      const refs = (Array.isArray(prior) ? prior : []).filter(ref => ref.pageId !== page.id);
      return [{ item, refs: wants ? [...refs, { pageId: page.id, title: page.title }] : refs, wants }];
    }).sort((a, b) => Number(a.wants) - Number(b.wants));
    if (changes.some(change => databasePropertyReadOnly(forward) || documentOverrides(change.item, forward))) { this.message("Edit document metadata to change this dependency."); return; }
    this.queueScheduled(changes.map(change => ({ page: change.item, field: forward, value: change.refs })));
  }
  private queueScheduled(changes: RecordChange[]): boolean {
    try {
      const pages = this.snapshot!.pages.map(page => {
        const properties = { ...page.properties };
        for (const entry of this.pending.values()) if (entry.pageId === page.id) {
          const field = this.source.properties.find(field => field.id === entry.propertyId); if (field) properties[field.key] = entry.value;
        }
        return { ...page, properties };
      });
      const plan = scheduleDependencies(pages, this.source, changes);
      if (plan.some(change => databasePropertyReadOnly(change.field) || documentOverrides(change.page, change.field))) throw new Error("Edit document metadata to change this dependency or date.");
      for (const change of plan) this.queue(change.page, change.field, change.value);
      return true;
    } catch (error) { this.message(error instanceof Error ? error.message : "Could not schedule dependencies"); return false; }
  }
  private async configureDependencies(patch: Pick<DatabaseDataSource, "dependencyAutoShift" | "dependencyDatePropertyId">) {
    if (!await this.flush() || !await this.closePeek()) throw new Error("Save pending changes before changing dependencies");
    const source = this.source;
    const saved = await api<DatabaseDataSource>(`/data-sources/${source.id}`, { method: "PUT", body: JSON.stringify({ baseRevision: source.revision, ...patch }) });
    this.snapshot!.dataSources = this.snapshot!.dataSources.map(item => item.id === saved.id ? saved : item); this.renderAlternate();
  }
  private async configureTimeline(patch: Partial<DatabaseLayout>) {
    if (!await this.flush() || !await this.closePeek()) throw new Error("Save pending changes before changing the timeline");
    const view = this.view;
    const saved = await api<DatabaseView>(`/database-views/${view.id}`, { method: "PUT", body: JSON.stringify({ baseRevision: view.revision, layout: { ...view.layout, ...patch } }) });
    this.snapshot!.views = this.snapshot!.views.map(item => item.id === saved.id ? saved : item); this.renderAlternate();
  }
  private async enableDependencies() {
    if (!await this.flush() || !await this.closePeek()) throw new Error("Save pending changes before enabling dependencies");
    const source = this.source;
    if (source.properties.some(field => field.dependencyRole === "blockedBy")) return;
    const forwardId = crypto.randomUUID(), inverseId = crypto.randomUUID();
    const fields: DatabaseProperty[] = [
      { id: forwardId, key: forwardId, name: "Blocked by", type: "relation", localRelation: true, dependencyRole: "blockedBy" },
      { id: inverseId, key: inverseId, name: "Blocking", type: "relation", localRelation: true, dependencyRole: "blocking", inversePropertyId: forwardId },
    ];
    const saved = await api<DatabaseDataSource>(`/data-sources/${source.id}`, { method: "PUT", body: JSON.stringify({ baseRevision: source.revision, properties: [...source.properties, ...fields], dependencyAutoShift: true, dependencyDatePropertyId: this.view.layout?.datePropertyId }) });
    this.snapshot!.dataSources = this.snapshot!.dataSources.map(item => item.id === saved.id ? saved : item); this.render();
  }
  private async manageCalendar() {
    if (!await this.flush() || !await this.closePeek()) throw new Error("Save pending changes before opening Calendar");
    let calendar = this.snapshot!.views.find(view => view.type === "calendar" && view.dataSourceId === this.source.id && view.layout?.datePropertyId === this.view.layout?.datePropertyId);
    if (!calendar) {
      this.snapshot = await createDatabaseView(this.snapshot!, { ...this.view, id: "", revision: "", name: "Calendar", type: "calendar", layout: { datePropertyId: this.view.layout?.datePropertyId } }, this.view);
      calendar = this.snapshot.views.at(-1)!;
    }
    this.rememberView(calendar.id); this.render();
  }
  private renderAlternate() {
    const mount = this.host.querySelector<HTMLElement>(".database-alternate-layout"); if (!mount) return;
    const source = this.source, view = this.view;
    renderDatabaseLayout(mount, source, this.rows(source), databaseViewProperties(source, view, this.snapshot!.database), view, {
      open: page => { if (this.snapshot!.dataSources.some(source => source.id === page.dataSourceId)) void this.openPeek(page.id); else void this.flush().then(ok => { if (ok) void this.hooks.openPage(page.id); }); },
      dashboard: {
        vaultKey: this.hooks.vaultKey,
        snapshot: this.snapshot!,
        prepare: async () => await this.flush() && (!this.peek || await this.peek.flush()),
        save: async (layout, baseRevision) => {
          const saved = await api<DatabaseView>(`/database-views/${view.id}`, { method: "PUT", body: JSON.stringify({ baseRevision, layout }) });
          this.snapshot!.views = this.snapshot!.views.map(item => item.id === saved.id ? saved : item);
          return saved;
        },
      },
      add: properties => { void this.flush().then(ok => { if (ok) this.addRow(properties); }); },
      views: () => this.snapshot!.views,
      openView: id => { void this.flush().then(ok => { if (ok) { this.rememberView(id); this.render(); } }); },
      submit: async (title, properties) => {
        if (!await this.flush() || !await this.closePeek()) throw new Error("Save pending changes first");
        const saved = await api<Page>(`/data-sources/${source.id}/records`, { method: "POST", body: JSON.stringify({ title, properties, baseRevision: source.revision }) });
        this.snapshot!.pages.push(saved); this.hooks.changed(saved);
      },
      settings: () => this.editView("Layout"),
      configure: patch => this.configureTimeline(patch),
      dependencies: () => this.enableDependencies(),
      dependencySettings: patch => this.configureDependencies(patch),
      calendar: () => this.manageCalendar(),
      pages: () => this.snapshot!.pages,
      reference: (page, field, value) => { this.queueReference(page, field, value); void this.flush(); },
      createSuccessor: (page, properties) => this.createTimelineSuccessor(page, properties),
      titleEditor: page => this.timelineTitleEditor(page),
      groupMenu: (field, key, anchor) => { void this.editGroup(field, key, anchor); },
      collapseGroup: key => { void this.collapseGroup(key); },
      writable: (page, field) => !source.unavailable && !source.trashed && !this.layoutSaving && !databasePropertyReadOnly(field) && !documentOverrides(page, field),
      move: (page, field, value, placement) => { void (async () => {
        if (this.layoutSaving || !await this.flush() || !await this.closePeek()) return;
        this.layoutSaving = true;
        try {
          if (!this.queueScheduled([{ page, field, value }])) return;
          if (placement && !view.sorts?.length && !view.layout?.groupBy) {
            const order = [...new Set([...(view.rowOrder ?? []), ...this.snapshot!.pages.filter(item => item.dataSourceId === source.id && !item.trashed).map(item => item.id)])].filter(id => id !== page.id);
            const index = placement.beforeId ? order.indexOf(placement.beforeId) : order.length;
            order.splice(index < 0 ? order.length : index, 0, page.id);
            this.orderDraft = { viewId: view.id, baseRevision: view.revision, rowOrder: order }; this.persist();
          }
          if (await this.flush()) this.renderAlternate();
        }
        finally { this.layoutSaving = false; this.renderAlternate(); }
      })().catch(error => this.message(error.message)); },
      month: this.calendarAnchor,
      navigate: day => { this.calendarAnchor = day; this.renderAlternate(); },
    });
    const count = this.host.querySelector(".database-row-count"); if (count) count.textContent = `${this.rows(source).length} pages`; this.updateLoadMore();
  }
  private scheduleRows() {
    this.rowsNeedRefresh = true;
    clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => {
      if (!this.alive || !this.snapshot || this.pointerDown || this.pending.size || this.host.contains(document.activeElement) && document.activeElement?.classList.contains("database-timeline-title-input")) return;
      if (this.view.type !== "table") { this.rowsNeedRefresh = false; this.renderAlternate(); return; }
      const body = this.host.querySelector("tbody"); if (!body) return;
      this.rowsNeedRefresh = false;
      const rows = this.rows(this.source), field = this.source.properties.find(field => field.id === this.view.layout?.groupBy);
      const groups = field ? databaseGroups(rows, field, this.view) : undefined;
      const ordered = groups ? groups.flatMap(group => group.pages) : rows;
      const visible = new Set(ordered.filter(page => !field || !this.view.layout?.collapsedGroups?.includes(String(fieldValue(page, field) ?? ""))).map(page => page.id));
      body.querySelectorAll(".database-table-group,.database-group-columns,.database-group-add").forEach(row => row.remove());
      const elements = new Map(Array.from(body.querySelectorAll<HTMLTableRowElement>("tr[data-page-id]"), row => [row.dataset.pageId!, row]));
      for (const [id, element] of elements) element.hidden = !visible.has(id);
      const template = this.host.querySelector<HTMLTableRowElement>("thead tr")!, nodes: Element[] = [];
      this.host.querySelector<HTMLElement>("thead")!.hidden = !!groups?.length;
      this.host.querySelector<HTMLElement>(".database-add-row")!.hidden = !!groups?.length;
      if (groups && field) for (const group of groups) {
        const heading = document.createElement("tr"); heading.className = "database-table-group"; heading.dataset.group = group.key;
        const cell = document.createElement("td"); cell.colSpan = template.children.length;
        cell.append(groupHeading(group, field, this.view, {
          add: properties => { void this.flush().then(ok => { if (ok) this.addRow(properties); }); },
          groupMenu: (field, key, anchor) => { void this.editGroup(field, key, anchor); },
          collapseGroup: key => { void this.collapseGroup(key); },
        })); heading.append(cell); nodes.push(heading);
        if (this.view.layout?.collapsedGroups?.includes(group.key)) continue;
        const columns = template.cloneNode(true) as HTMLTableRowElement; columns.className = "database-group-columns";
        for (const th of columns.querySelectorAll<HTMLElement>("[data-property-id]")) th.querySelector("button")!.onclick = () => { const property = this.source.properties.find(item => item.id === th.dataset.propertyId)!; void this.flush().then(async ok => { if (ok && await this.closePeek()) this.editProperty(property, undefined, th.querySelector("button")!); }); };
        columns.querySelector<HTMLButtonElement>(".database-add-column button")!.onclick = () => { void this.flush().then(ok => { if (ok) this.editProperty(); }); };
        nodes.push(columns, ...group.pages.map(page => elements.get(page.id)!).filter(Boolean));
        const footer = document.createElement("tr"); footer.className = "database-group-add"; const td = document.createElement("td"); td.colSpan = template.children.length;
        const add = document.createElement("button"); add.className = "database-add-row"; add.innerHTML = `${glyph(Plus)}New page`; add.setAttribute("aria-label", `New page in ${group.name}`);
        add.onclick = () => { void this.flush().then(ok => { if (ok) this.addRow({ [field.key]: group.key === "" ? null : field.type === "checkbox" ? group.key === "true" : group.key }); }); };
        td.append(add); footer.append(td); nodes.push(footer);
      } else nodes.push(...ordered.map(page => elements.get(page.id)!).filter(Boolean));
      nodes.forEach((node, index) => { if (body.children[index] !== node) body.insertBefore(node, body.children[index] ?? null); });
      this.updateSelection?.();
      const count = this.host.querySelector(".database-row-count"); if (count) count.textContent = `${ordered.length} ${ordered.length === 1 ? "page" : "pages"}`; this.updateLoadMore();
      for (const page of ordered) for (const field of this.source.properties.filter(field => field.dependencyRole === "blocking")) {
        const td = elements.get(page.id)?.querySelector<HTMLElement>(`td[data-property-id="${CSS.escape(field.id)}"]`);
        td?.replaceChildren(this.recordCell(page, field, dependencyValue(page, field, this.source, this.snapshot!.pages)));
      }
    }, 0);
  }
  private async collapseGroup(key: string) {
    if (this.layoutSaving || !await this.flush() || !await this.closePeek()) return;
    const view = this.view, collapsed = new Set(view.layout?.collapsedGroups); collapsed.has(key) ? collapsed.delete(key) : collapsed.add(key);
    this.layoutSaving = true;
    try {
      const saved = await api<DatabaseView>(`/database-views/${view.id}`, { method: "PUT", body: JSON.stringify({ baseRevision: view.revision, layout: { ...view.layout, collapsedGroups: [...collapsed] } }) });
      this.snapshot!.views = this.snapshot!.views.map(item => item.id === saved.id ? saved : item); this.scheduleRows();
    } catch (error) { this.message(error instanceof Error ? error.message : "Could not save group state"); }
    finally { this.layoutSaving = false; }
  }
  private async editGroup(field: DatabaseProperty, key: string, anchor: HTMLElement) {
    if (!await this.flush() || !await this.closePeek()) return;
    this.menu?.destroy();
    let source = this.source, baseline = structuredClone(field), baselineView = this.view;
    this.menu = openGroupMenu(anchor.isConnected ? anchor : this.host.querySelector<HTMLElement>("[data-db-view]")!, {
      field, key, view: baselineView,
      save: async (property, view) => {
        if (JSON.stringify(property) !== JSON.stringify(baseline)) {
          source = await api<DatabaseDataSource>(`/data-sources/${source.id}`, { method: "PUT", body: JSON.stringify({ baseRevision: source.revision, properties: source.properties.map(item => item.id === property.id ? property : item) }) });
          this.snapshot!.dataSources = this.snapshot!.dataSources.map(item => item.id === source.id ? source : item); baseline = structuredClone(property);
        }
        if (JSON.stringify(view.layout) !== JSON.stringify(baselineView.layout ?? {})) {
          baselineView = await api<DatabaseView>(`/database-views/${view.id}`, { method: "PUT", body: JSON.stringify({ baseRevision: baselineView.revision, layout: view.layout }) });
          this.snapshot!.views = this.snapshot!.views.map(item => item.id === view.id ? baselineView : item);
        }
        this.render(); document.dispatchEvent(new CustomEvent("notdown-database-updated", { detail: this.snapshot }));
      },
      edit: () => this.editView("Group"), trash: () => this.trashGroup(field, key),
    });
  }
  private trashGroup(field: DatabaseProperty, key: string) {
    const group = databaseGroups(this.matchingRows(this.source), field, this.view).find(group => group.key === key); if (!group?.pages.length) return;
    const targets = [...group.pages], total = targets.length; let moved = 0;
    formDialog("Move group to Trash", `<p><span data-i18n="Move">Move</span> ${total} <span data-i18n="page">page</span>${total === 1 ? "" : "s"} <span data-i18n="in">in</span> <strong>${e(group.name)}</strong> <span data-i18n="and their child pages to Trash? You can restore them from Trash.">and their child pages to Trash? You can restore them from Trash.</span></p><footer><button type="button" data-cancel data-i18n="Cancel">Cancel</button><button type="submit" class="primary-button" data-i18n="Move to Trash">Move to Trash</button></footer>`, async () => {
      try {
        while (targets.length) {
          const target = targets[0];
          const saved = await api<Page>(`/pages/${target.id}`, { method: "PUT", body: JSON.stringify({ baseRevision: target.revision, trashed: true }) });
          if (!saved.trashed) throw new Error("Document metadata controls this page's Trash state. Edit its source first.");
          const old = this.snapshot!.pages.find(page => page.id === saved.id); if (old) Object.assign(old, saved);
          this.hooks.changed(saved); targets.shift(); moved++; this.scheduleRows();
        }
        this.render();
      } catch (error) { throw new Error(`${moved} of ${total} pages moved. ${error instanceof Error ? error.message : "Could not move remaining pages"}. Remaining pages were not overwritten.`); }
    });
  }
  private wireSaveControls() {
    if (!this.hooks.inline && !isWikiDatabase(this.snapshot!.database)) {
      const section = this.host.querySelector<HTMLElement>(".database-workspace")!; section.classList.add("database-page-workspace");
      const heading = section.querySelector<HTMLElement>(".database-heading")!;
      const region = document.createElement("div"); region.className = "page-cover-region database-page-cover"; heading.before(region);
      const actions = document.createElement("div"); actions.className = "database-heading-actions";
      actions.innerHTML = `<button type="button" data-db-add-icon>${glyph(Smile)}<span data-i18n="Add icon">Add icon</span></button><button type="button" data-db-add-cover>${glyph(Image)}<span data-i18n="Add cover">Add cover</span></button>`;
      heading.prepend(actions);
      actions.querySelector<HTMLElement>("[data-db-add-icon]")!.onclick = event => void this.chooseIcon(event.currentTarget as HTMLElement);
      actions.querySelector<HTMLElement>("[data-db-add-cover]")!.onclick = event => void this.chooseCover(event.currentTarget as HTMLElement);
    }
    this.host.querySelector("[data-db-retry]")!.addEventListener("click", () => { this.failed = false; this.presentationFailed = false; if (this.sourceTitle) this.sourceTitle.failed = false; void this.flush(); });
    this.refreshPresentation();
    const titleInput = this.host.querySelector<HTMLInputElement>("[data-i18n-aria-label='Database title']")!;
    titleInput.addEventListener("input", () => { this.queuePresentation({ title: titleInput.value }); titleInput.closest("h1")!.setAttribute("aria-label", titleInput.value); });
    titleInput.addEventListener("change", () => void this.flush());
    titleInput.addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); void this.flush(); } });
    this.host.querySelector<HTMLButtonElement>("[data-db-icon]")!.addEventListener("click", event => void this.chooseIcon(event.currentTarget as HTMLElement));
    this.host.querySelector("[data-db-discard]")!.addEventListener("mousedown", event => event.preventDefault());
    this.host.querySelector("[data-db-discard]")!.addEventListener("click", () => {
      if (this.saving || this.widthSaving || this.orderSaving || this.presentationSaving || this.sourceTitleSaving) { this.message("Wait for the current save to finish before discarding edits."); return; }
      this.pending.clear(); this.widthDraft = undefined; this.orderDraft = undefined; this.persist(); this.failed = false;
      this.presentation = undefined; this.persistPresentation(); this.presentationFailed = false;
      this.sourceTitle = undefined; this.persistSourceTitle();
      void (async () => { if (!(await this.closePeek())) return; await this.load(this.snapshot!.database.id); })().catch(error => this.message(error.message));
    });
  }
  private render(preserveMenu = false) {
    this.host.querySelectorAll<HTMLElement>(".database-alternate-layout").forEach(disposeDatabaseLayout);
    this.resizeCleanup?.(); this.resizeCleanup = undefined;
    this.coverPickerCleanup?.(); this.coverPickerCleanup = undefined; this.coverCleanup?.(); this.coverCleanup = undefined; this.coverSignature = undefined;
    this.viewOverflowCleanup?.(); this.viewOverflowCleanup = undefined;
    this.wikiPickerCleanup?.(); this.wikiPickerCleanup = undefined;
    if (!preserveMenu) { this.menu?.destroy(); this.menu = undefined; }
    ++this.opening;
    const scrollTop = this.host.querySelector<HTMLElement>(".database-table-pane")?.scrollTop ?? 0;
    const scrollLeft = this.host.querySelector<HTMLElement>(".database-table-scroll")?.scrollLeft ?? 0;
    const snapshot = this.snapshot!, source = this.source, view = this.view;
    if (!view) { this.renderEmpty(snapshot); return; }
    this.peek?.destroy(); this.peek = undefined;
    this.host.innerHTML = `<div class="database-layout"><section class="database-workspace database-table-pane"><header class="database-heading"><div class="database-heading-title"><button type="button" class="database-title-icon" data-db-icon aria-label="Change database icon" title="Change database icon" data-i18n-title="Change database icon" data-i18n-aria-label="Change database icon"></button><h1 aria-label="${e(snapshot.database.title)}"><input class="database-title-input" aria-label="Database title" value="${e(this.presentation?.title ?? snapshot.database.title)}" maxlength="500"  data-i18n-aria-label="Database title"/></h1></div></header><div class="database-toolbar"><div class="database-view-tabs" role="tablist" aria-label="Database views" data-i18n-aria-label="Database views">${snapshot.views.map(item => `<button role="tab" aria-selected="${view?.id === item.id}" data-db-tab="${e(item.id)}">${databaseViewIconHTML(item)}${e(item.name)}</button>`).join("")}<button class="database-icon-button" data-db-new-view aria-label="New view" title="New view" data-i18n-title="New view" data-i18n-aria-label="New view">${glyph(Plus)}</button></div><div class="database-toolbar-actions"><button class="database-icon-button ${view?.filters?.length ? "is-active" : ""}" data-db-filter aria-label="Filter" title="Filter" data-i18n-title="Filter" data-i18n-aria-label="Filter">${glyph(ListFilter)}</button><button class="database-icon-button ${view?.sorts?.length ? "is-active" : ""}" data-db-sort aria-label="Sort" title="Sort" data-i18n-title="Sort" data-i18n-aria-label="Sort">${glyph(ArrowDownUp)}</button><div class="database-search-control"><button class="database-icon-button" data-db-search aria-label="Search database" title="Search database" aria-expanded="${this.showSearch}" data-i18n-title="Search database" data-i18n-aria-label="Search database">${glyph(Search)}</button><div class="database-search" ${this.showSearch ? "" : "hidden"}><input type="search" aria-label="Search database records" placeholder="Type to search..." value="${e(this.search)}" data-i18n-placeholder="Type to search..." data-i18n-aria-label="Search database records"/><button aria-label="Close database search" class="database-icon-button" data-i18n-aria-label="Close database search">${glyph(X)}</button></div></div><button class="database-icon-button" data-db-view aria-label="View settings" title="View settings" data-i18n-title="View settings" data-i18n-aria-label="View settings">${glyph(SlidersHorizontal)}</button><div class="database-new-control"><button class="database-new-button" data-db-row aria-label="Add row" data-i18n="New" data-i18n-aria-label="Add row">New</button><details class="database-new-menu"><summary class="database-new-menu-button" aria-label="New options" data-i18n-aria-label="New options">${glyph(ChevronDown)}</summary><div class="database-menu"><button data-db-row data-i18n="New page">New page</button><button data-action="import-notion" data-i18n="Import from Notion">Import from Notion</button></div></details></div></div></div><p class="database-message" role="status" data-state="saved" data-i18n="Saved locally">Saved locally</p><div class="database-save-recovery" hidden><button data-db-retry data-i18n="Retry save">Retry save</button><button data-db-discard data-i18n="Discard draft and reload">Discard draft and reload</button></div><div class="database-table-scroll"><table class="database-table"><thead><tr></tr></thead><tbody></tbody></table><button class="database-add-row" data-db-row>${glyph(Plus)}<span data-i18n="New page">New page</span></button></div><p class="database-row-count"></p></section><aside class="database-peek-mount" hidden></aside></div>`;
    if (isWikiDatabase(snapshot.database) && !this.hooks.inline) {
      const section = this.host.querySelector<HTMLElement>(".database-workspace")!; section.classList.add("wiki-collection", "wiki-shell");
      const cover = snapshot.hostPage?.properties?.cover, position = snapshot.hostPage?.properties?.coverPosition;
      if (typeof cover === "string" && isPageCoverPath(cover)) {
        const image = document.createElement("img"); image.className = "wiki-cover"; image.src = vaultAssetUrl(cover); image.alt = "Wiki cover";
        image.style.objectPosition = '50% ' + (typeof position === 'number' ? Math.max(0, Math.min(100, position)) : 50) + '%'; section.prepend(image);
      }
      const mount = document.createElement("div"); mount.className = "wiki-picker-mount"; this.host.querySelector(".database-toolbar")!.prepend(mount);
      this.wikiPickerCleanup = mountWikiViewPicker(mount, snapshot, view.id, {
        prepare: () => this.flush(),
        menuOpened: pop => { this.menu = pop; },
        updated: next => { this.snapshot = next; this.render(); },
        select: async id => { if (!await this.flush()) return; if (id === "home") await this.hooks.openDatabase(snapshot.database.id); else { this.rememberView(id); this.render(); } },
        create: async anchor => { if (await this.flush()) this.newView(anchor); },
        edit: async (id, anchor) => { if (!await this.flush()) return; if (id === "home") { await this.hooks.openDatabase(snapshot.database.id); document.querySelector<HTMLDetailsElement>("#page-options")?.setAttribute("open", ""); } else { this.rememberView(id); this.render(); this.editView(undefined, undefined, this.host.querySelector<HTMLElement>(".wiki-view-trigger")!); } },
        report: error => this.message(error instanceof Error ? error.message : String(error)),
      });
    }
    if (preserveMenu) this.menu?.reanchor(this.host.querySelector<HTMLElement>("[data-db-view]")!);
    if (this.hooks.inline) {
      this.host.querySelector(".database-workspace")!.classList.add("database-inline-workspace");
      const open = document.createElement("button"); open.type = "button"; open.className = "database-icon-button"; setUIAttribute(open, "aria-label", "Open as page"); open.title = "Open as page"; open.innerHTML = glyph(Maximize2);
      open.onclick = () => { void (async () => { if (await this.flush() && await this.closePeek()) await this.hooks.openDatabase(snapshot.database.id); })().catch(error => this.message(error.message)); };
      this.host.querySelector("[data-db-view]")!.before(open);
    }
    if (typeof snapshot.database.homePageId === "string" || isWikiDatabase(snapshot.database)) {
      const home = document.createElement("button");
      home.type = "button"; setUIText(home, "Home"); setUIAttribute(home, "aria-label", "Open database Home");
      home.addEventListener("click", () => { void (async () => { if (await this.flush()) await this.hooks.openDatabase(snapshot.database.id); })().catch(error => this.message(error.message)); });
      this.host.querySelector(".database-view-tabs")!.prepend(home);
    }
    if (Array.isArray(view?.importWarnings) && view.importWarnings.length) {
      const note = document.createElement("p"); note.className = "database-import-note";
      note.textContent = view.importWarnings.filter((value): value is string => typeof value === "string").join(" ");
      this.host.querySelector(".database-table-scroll")!.before(note);
    }
    this.wireSaveControls();
    const act = (action: () => void) => void this.flush().then(async ok => { if (ok && await this.closePeek()) action(); });
    this.host.querySelectorAll<HTMLElement>("[data-db-tab]").forEach(button => {
      button.setAttribute("aria-haspopup", "dialog");
      button.addEventListener("contextmenu", event => { event.preventDefault(); act(() => this.tabMenu(button.dataset.dbTab!)); });
      button.addEventListener("click", () => {
      const id = button.dataset.dbTab!;
      if (id !== this.view?.id) act(() => { this.rememberView(id); this.render(); });
      else act(() => this.tabMenu(id));
    }); });
    this.host.querySelectorAll("[data-db-row]").forEach(button => button.addEventListener("click", () => act(() => this.addRow())));
    this.host.querySelector("[data-db-view]")!.addEventListener("click", () => act(() => this.editView()));
    this.host.querySelector("[data-db-filter]")!.addEventListener("click", () => act(() => this.editView("Filter")));
    this.host.querySelector("[data-db-sort]")!.addEventListener("click", () => act(() => this.editView("Sort")));
    this.host.querySelector("[data-db-new-view]")!.addEventListener("click", () => act(() => this.newView()));
    const searchHost = this.host.querySelector<HTMLElement>(".database-search")!, searchInput = searchHost.querySelector<HTMLInputElement>("input")!;
    this.host.querySelector("[data-db-search]")!.addEventListener("click", () => { this.showSearch = !this.showSearch; searchHost.hidden = !this.showSearch; this.host.querySelector("[data-db-search]")!.setAttribute("aria-expanded", String(this.showSearch)); if (this.showSearch) searchInput.focus(); });
    searchInput.addEventListener("input", () => { this.search = searchInput.value; this.visibleLimit = undefined; this.scheduleRows(); });
    const closeSearch = () => { this.showSearch = false; this.search = ""; searchInput.value = ""; searchHost.hidden = true; this.host.querySelector("[data-db-search]")!.setAttribute("aria-expanded", "false"); this.scheduleRows(); };
    searchHost.querySelector("button")!.addEventListener("click", closeSearch);
    searchInput.addEventListener("keydown", event => { if (event.key === "Escape") { event.preventDefault(); closeSearch(); this.host.querySelector<HTMLButtonElement>("[data-db-search]")!.focus(); } });
    const workspace = this.host.querySelector<HTMLElement>(".database-workspace")!;
    workspace.dataset.verticalLines = String(view.layout?.showVerticalLines !== false);
    workspace.classList.toggle("database-hide-page-icons", view.layout?.showPageIcon === false);
    workspace.classList.toggle("database-wrap-content", !!view.layout?.wrapContent);
    if (this.showSourceTitle && source) {
      this.host.querySelector(".database-toolbar")!.before(this.renderSourceTitle(source));
    }
    this.refreshSourceTitle();
    this.viewOverflowCleanup = installViewOverflow(this.host, {
      views: snapshot.views, selected: this.view?.id,
      select: id => act(() => { this.rememberView(id); this.render(); }),
      edit: (id, anchor) => act(() => this.tabMenu(id, anchor)),
      create: () => act(() => this.newView()),
      createSource: isWikiDatabase(snapshot.database) ? undefined : () => { void this.manageSources(undefined, undefined, 0, true).catch(error => this.message(error.message)); },
    });
    if (!source) { this.message("This database has no available data source."); this.host.querySelectorAll<HTMLButtonElement>("[data-db-row],[data-db-new-view],[data-db-view],[data-db-filter],[data-db-sort]").forEach(button => button.disabled = true); return; }
    if (source.unavailable) { this.message(source.trashed ? "This data source is in Trash. Restore it from Manage data sources." : "This linked data source is unavailable. Restore its owning database to use these records."); this.host.querySelectorAll<HTMLButtonElement>("[data-db-row],[data-db-filter],[data-db-sort]").forEach(button => button.disabled = true); }
    if (view.type !== "table") {
      const mount = document.createElement("div"); mount.className = "database-alternate-layout";
      this.host.querySelector(".database-table-scroll")!.replaceWith(mount);
      this.renderAlternate();
      this.host.querySelector<HTMLElement>(".database-table-pane")!.scrollTop = scrollTop;
      return;
    }
    this.updateSelection = undefined;
    const fields = databaseViewProperties(source, view, snapshot.database);
    const heading = this.host.querySelector("thead tr")!;
    for (const field of fields) {
      const th = document.createElement("th"), button = document.createElement("button"); th.dataset.type = field.type; th.dataset.propertyId = field.id; th.classList.toggle("database-frozen-column", field.id === view.layout?.frozenPropertyId); th.setAttribute("aria-label", field.name); button.innerHTML = `${typeIcon(field.type)}<span>${e(field.name)}</span>`; button.title = `Edit ${field.name} property`; button.setAttribute("aria-label", `Edit ${field.name} property`);
      button.addEventListener("click", () => act(() => this.editProperty(field, undefined, this.host.querySelector<HTMLElement>(`th[data-property-id="${CSS.escape(field.id)}"] button`) ?? button))); th.append(button); heading.append(th);
    }
    const addColumn = document.createElement("th"); addColumn.className = "database-add-column"; addColumn.innerHTML = `<button class="database-icon-button" aria-label="Add property" title="Add property" data-i18n-title="Add property" data-i18n-aria-label="Add property">${glyph(Plus)}</button>`; addColumn.querySelector("button")!.addEventListener("click", () => act(() => this.editProperty())); heading.append(addColumn);
    const body = this.host.querySelector("tbody")!, rows = this.snapshot!.pages.filter(page => page.dataSourceId === source.id && !page.trashed), visible = new Set(this.rows(source).map(page => page.id));
    for (const page of rows) {
      const tr = document.createElement("tr"); tr.dataset.pageId = page.id; tr.hidden = !visible.has(page.id);
      for (const field of fields) {
        const td = document.createElement("td"), pending = this.pending.get(`${page.id}/${field.id}`);
        td.dataset.type = field.type; td.dataset.propertyId = field.id; td.classList.toggle("database-frozen-column", field.id === view.layout?.frozenPropertyId); td.classList.toggle("database-wrap-cell", !!view.layout?.wrapContent || !!view.layout?.wrapPropertyIds?.includes(field.id));
        const value = pending ? pending.value : fieldValue(page, field);
        const cell = this.recordCell(page, field, value);
        td.append(cell); tr.append(td);
      }
      const tail = document.createElement("td"); tail.className = "database-row-tail"; tr.append(tail);
      body.append(tr);
    }
    this.updateSelection = installTableSelection(this.host.querySelector<HTMLTableElement>(".database-table")!, this.selectedRows, {
      fields: source.properties.filter(field => field.type !== "title" && !databasePropertyReadOnly(field) && !field.dependencyRole && (!["relation", "people", "files"].includes(field.type) || field.localRelation || field.type === "people" && !field.notion)),
      canReorder: !view.sorts?.length && !view.layout?.groupBy && !source.unavailable,
      edit: (field, anchor, ids) => { void this.editSelectedProperty(field, anchor, ids); },
      add: id => { void this.flush().then(ok => { if (ok) this.addRow(this.view.layout?.groupBy ? (() => { const field = this.source.properties.find(field => field.id === this.view.layout?.groupBy)!; const page = this.snapshot!.pages.find(page => page.id === id)!; return { [field.key]: fieldValue(page, field) }; })() : {}, id); }); },
      reorder: (ids, target, after) => { void this.reorderSelected(ids, target, after); },
    });
    this.resizeCleanup = installDatabaseTableResize(this.host.querySelector<HTMLTableElement>(".database-table")!, fields,
      (this.widthDraft?.viewId === view.id ? this.widthDraft.layout.columnWidths : view.layout?.columnWidths) ?? {},
      () => !this.widthSaving && !this.widthDraft && !this.layoutSaving && !this.sourceSaving && !this.failed && !this.orderDraft && !this.menu?.dirty,
      widths => {
        this.widthDraft = { viewId: view.id, baseRevision: this.view.revision, layout: { ...this.view.layout, columnWidths: { ...this.view.layout?.columnWidths, ...widths } } };
        this.persist(); this.message("Unsaved changes"); void this.flush();
      });
    this.host.querySelector(".database-row-count")!.textContent = `${visible.size} ${visible.size === 1 ? "page" : "pages"}`;
    this.host.querySelector<HTMLElement>(".database-table-pane")!.scrollTop = scrollTop;
    this.host.querySelector<HTMLElement>(".database-table-scroll")!.scrollLeft = scrollLeft;
    this.scheduleRows();
  }
  private renderEmpty(snapshot: DatabaseSnapshot) {
    this.host.innerHTML = `<section class="database-workspace"><header class="database-heading"><div class="database-heading-title"><button data-db-icon class="database-title-icon" aria-label="Change database icon" data-i18n-aria-label="Change database icon"></button><h1><input class="database-title-input" aria-label="Database title" value="${e(this.presentation?.title ?? snapshot.database.title)}" data-i18n-aria-label="Database title"></h1></div></header><div class="database-toolbar"><div class="database-view-tabs" role="tablist" aria-label="Database views" data-i18n-aria-label="Database views"><button data-db-new-view data-i18n="New view">New view</button></div><button data-db-view data-i18n="Manage data sources">Manage data sources</button></div><p class="database-message" role="status" data-i18n="Saved locally">Saved locally</p><div class="database-save-recovery" hidden><button data-db-retry data-i18n="Retry save">Retry save</button><button data-db-discard data-i18n="Discard draft and reload">Discard draft and reload</button></div><p class="database-empty" data-i18n="No views. Your data sources and pages are kept.">No views. Your data sources and pages are kept.</p></section>`;
    if (this.hooks.inline && this.source) this.host.querySelector(".database-heading")!.after(this.renderSourceTitle(this.source));
    this.wireSaveControls();
    const create = this.host.querySelector<HTMLButtonElement>("[data-db-new-view]")!; create.disabled = !snapshot.dataSources.some(source => !source.trashed && !source.unavailable);
    create.onclick = () => { void this.flush().then(ok => { if (ok) this.newView(create); }); };
    this.host.querySelector<HTMLButtonElement>("[data-db-view]")!.onclick = () => { void this.manageSources().catch(error => this.message(error.message)); };
  }
  private async reorderSelected(ids: string[], target: string, after: boolean) {
    if (!await this.flush() || !await this.closePeek() || this.view.sorts?.length || this.view.layout?.groupBy || this.source.unavailable) return;
    const pages = this.matchingRows(this.source), moving = pages.filter(page => ids.includes(page.id)).map(page => page.id);
    if (!moving.length || moving.includes(target) || !pages.some(page => page.id === target)) return;
    const order = [...new Set([...(this.view.rowOrder ?? []), ...this.snapshot!.pages.filter(page => page.dataSourceId === this.source.id && !page.trashed).map(page => page.id)])].filter(id => !moving.includes(id));
    const index = order.indexOf(target); if (index < 0) return;
    order.splice(index + (after ? 1 : 0), 0, ...moving);
    this.orderDraft = { viewId: this.view.id, baseRevision: this.view.revision, rowOrder: order }; this.persist();
    await this.flushOrder();
  }
  private async editSelectedProperty(field: DatabaseProperty, anchor: HTMLElement, ids: string[]) {
    if (!await this.flush() || !await this.closePeek()) return;
    this.menu?.destroy();
    const pages = this.snapshot!.pages.filter(page => ids.includes(page.id) && page.dataSourceId === this.source.id && !page.trashed);
    if (!pages.length || this.source.unavailable) return;
    if (pages.some(page => documentOverrides(page, field))) { this.message("Some selected values are defined in document metadata. Edit them in source."); return; }
    const pop = new DatabasePopover(anchor, "Edit property"); this.menu = pop;
    const panel = pop.panel("Edit property");
    const label = document.createElement("p"); label.textContent = field.name; panel.append(label);
    let value: unknown = null, changed = false;
    const first = fieldValue(pages[0], field), same = pages.every(page => JSON.stringify(fieldValue(page, field)) === JSON.stringify(first));
    const editor = propertyInput(field, { ...pages[0], title: "Selected rows" }, same ? first : null, next => { value = next; changed = true; }, false, this.snapshot!.pages, panel); panel.append(editor);
    const apply = document.createElement("button"); apply.type = "button"; setUIText(apply, "Apply to selected rows");
    pop.saveOnDismiss = false;
    apply.onclick = () => { if (!changed) return; void pop.perform(async () => {
      if (!this.queueScheduled(pages.map(page => ({ page, field, value })))) throw new Error("Could not apply selected property values");
      if (!await this.flushRecords()) throw new Error("Save failed. Remaining edits are preserved.");
      this.render(true);
    }); };
    panel.append(apply);
  }
  private recordCell(page: Page, field: DatabaseProperty, value: unknown) {
    const cell = propertyInput(field, page, value, value => this.queueReference(page, field, value), !!this.view.layout?.wrapContent || !!this.view.layout?.wrapPropertyIds?.includes(field.id), this.snapshot!.pages);
    cell.addEventListener("change", () => void this.flush());
    cell.addEventListener("keydown", event => { if (event.key === "Enter" && event.target instanceof HTMLInputElement) { event.preventDefault(); void this.flush(); } });
    if (field.type === "title") {
      const pageIcon = document.createElement("span"); pageIcon.className = "database-page-icon"; pageIcon.append(pageIconElement(page.icon || "file-text")); cell.prepend(pageIcon);
      const open = document.createElement("button"); open.className = "database-open-page"; open.innerHTML = `${glyph(PanelRight)}<span data-i18n="OPEN">OPEN</span>`; open.setAttribute("aria-label", `Open ${page.title}`);
      open.addEventListener("click", () => void this.openPeek(page.id)); cell.append(open);
    }
    return cell;
  }
  private updatePeekRow(page: Page) {
    const row = this.host.querySelector<HTMLTableRowElement>(`tr[data-page-id="${CSS.escape(page.id)}"]`);
    if (!row) { this.renderAlternate(); return; }
    for (const td of row.querySelectorAll<HTMLElement>("td[data-property-id]")) {
      const field = this.source.properties.find(field => field.id === td.dataset.propertyId); if (!field) continue;
      td.replaceChildren(this.recordCell(page, field, dependencyValue(page, field, this.source, this.snapshot!.pages) ?? fieldValue(page, field)));
      td.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>("input,textarea,select,.database-select-control,.database-place-cell button").forEach(control => control.disabled = true);
    }
    this.scheduleRows();
  }
  private async closePeek(): Promise<boolean> {
    if (!this.peek) return true;
    if (!(await this.peek.flush())) return false;
    this.peek.destroy(); this.peek = undefined;
    this.render(); return true;
  }
  private async openPeek(id: string) {
    if (!(await this.flush()) || !this.alive) return;
    const generation = ++this.opening;
    if (this.hooks.interactionMode === "touch" || this.view.layout?.openPagesIn === "full") { await this.hooks.openPage(id); return; }
    try {
      const page = await api<Page>(`/pages/${encodeURIComponent(id)}`);
      if (!this.alive || generation !== this.opening) return;
      const source = this.snapshot!.dataSources.find(item => item.id === page.dataSourceId);
    if (!source) { this.message("The page no longer belongs to this database. Reload to see its current location."); return; }
      const mount = this.host.querySelector<HTMLElement>(".database-peek-mount")!;
      if (!this.peek) this.peek = new DatabasePeek(mount, {
        vaultKey: this.hooks.vaultKey, pages: () => this.snapshot!.pages,
        propertyInput: (field, page, value, commit) => propertyInput(field.dependencyRole === "blocking" ? { ...field, readOnly: true } : field, page, dependencyValue(page, field, source, this.snapshot!.pages) ?? value, commit, false, this.snapshot!.pages),
        addProperty: async () => { if (await this.flush()) this.editProperty(undefined, this.peek?.pageId); },
        openFull: pageId => this.hooks.openPage(pageId),
        closed: () => { void this.closePeek(); },
        changed: saved => { const old = this.snapshot!.pages.find(item => item.id === saved.id); if (old) Object.assign(old, saved); else this.snapshot!.pages.push(saved); this.hooks.changed(saved); this.updatePeekRow(saved); },
      });
      if (!(await this.peek.open(page, source)) || generation !== this.opening) return;
      mount.hidden = false; mount.classList.toggle("database-center-peek", this.view.layout?.openPagesIn === "center"); this.host.querySelector(".database-layout")!.classList.add("database-peek-open");
      this.host.querySelectorAll<HTMLElement>("tr[data-page-id]").forEach(row => row.classList.toggle("database-row-peek", row.dataset.pageId === id));
      this.host.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>(".database-table input,.database-table textarea,.database-table select,.database-table .database-select-control,.database-table .database-place-cell button").forEach(input => input.disabled = true);
    } catch (error) { this.message(error instanceof Error ? error.message : "Could not open this record"); }
  }
  private async createTimelineSuccessor(predecessor: Page, properties: Record<string, unknown>) {
    if (this.layoutSaving) return;
    const source = this.source, view = this.view;
    if (!await this.flush() || !await this.closePeek()) throw new Error("Save pending changes before creating a page");
    if (!this.alive || this.view.id !== view.id) return;
    const forward = source.properties.find(field => field.dependencyRole === "blockedBy");
    if (!forward) return;
    this.layoutSaving = true;
    try {
      // Plan the new record before writing so its date follows the same overlap
      // policy as an existing successor, without rewriting its predecessor.
      const draft = { ...predecessor, id: crypto.randomUUID(), title: "Untitled", body: "", properties: { ...properties } };
      const refs = [{ pageId: predecessor.id, title: predecessor.title }];
      const plan = scheduleDependencies([...this.snapshot!.pages, draft], source, [{ page: draft, field: forward, value: refs }]);
      for (const change of plan) if (change.page.id === draft.id) draft.properties[change.field.key] = change.value;
      const saved = await api<Page>(`/data-sources/${source.id}/records`, { method: "POST", body: JSON.stringify({ title: draft.title, properties: draft.properties, baseRevision: source.revision }) });
      const order = [...new Set([...(view.rowOrder ?? []), ...this.snapshot!.pages.filter(page => page.dataSourceId === source.id && !page.trashed).map(page => page.id), saved.id])];
      this.snapshot!.pages.push(saved); this.hooks.changed(saved);
      this.orderDraft = { viewId: view.id, baseRevision: view.revision, rowOrder: order }; this.persist();
      await this.flushOrder();
      this.timelineTitleId = saved.id;
    } finally {
      this.layoutSaving = false;
      if (this.alive) this.renderAlternate();
    }
  }
  private timelineTitleEditor(page: Page): HTMLElement | undefined {
    if (page.id !== this.timelineTitleId) return;
    const field = this.source.properties.find(field => field.type === "title"); if (!field) return;
    const input = document.createElement("input"); input.className = "database-timeline-title-input"; input.maxLength = 500;
    setUIAttribute(input, "placeholder", "Type a name…"); setUIAttribute(input, "aria-label", "Page title");
    input.value = String(this.pending.get(`${page.id}/${field.id}`)?.value ?? (page.title === "Untitled" ? "" : page.title));
    input.oninput = () => this.queue(page, field, input.value.trim() || "Untitled");
    input.onkeydown = event => { if (!event.isComposing && ["Enter", "Escape"].includes(event.key)) { event.preventDefault(); event.stopPropagation(); input.blur(); } };
    input.onblur = () => {
      this.timelineTitleId = undefined;
      void this.flush().then(() => { if (this.alive) this.renderAlternate(); });
    };
    requestAnimationFrame(() => { if (input.isConnected) input.focus({preventScroll:true}); });
    return input;
  }
  private addRow(properties: Record<string, unknown> = {}, beforeId?: string) {
    const source = this.source;
    formDialog("Add row", `<label><span data-i18n="Row title">Row title</span><input name="title" required maxlength="500" autofocus /></label><footer><button type="button" data-cancel data-i18n="Cancel">Cancel</button><button type="submit" class="primary-button" data-i18n="Create row">Create row</button></footer>`, async form => {
      const saved = await api<Page>(`/data-sources/${source.id}/records`, { method: "POST", body: JSON.stringify({ title: form.get("title"), properties, baseRevision: source.revision }) });
      const view = this.view, rowOrder = this.rows(source).map(page => page.id);
      this.snapshot!.pages.push(saved); this.hooks.changed(saved);
      try {
        const order = Array.isArray(view.rowOrder) ? [...view.rowOrder as string[]] : rowOrder;
        for (const page of this.snapshot!.pages) if (page.dataSourceId === source.id && page.id !== saved.id && !order.includes(page.id)) order.push(page.id);
        const updated = await api<DatabaseView>(`/database-views/${view.id}`, { method: "PUT", body: JSON.stringify({ baseRevision: view.revision, rowOrder: beforeId && order.includes(beforeId) ? [...order.slice(0, order.indexOf(beforeId)), saved.id, ...order.slice(order.indexOf(beforeId))] : [...order, saved.id] }) });
        this.snapshot!.views = this.snapshot!.views.map(item => item.id === updated.id ? updated : item);
      } catch (error) { this.render(); this.message(`Page created. Its row order could not be saved: ${error instanceof Error ? error.message : "view changed"}. Reload to continue.`); return; }
      this.render();
    });
  }
  private editProperty(field?: DatabaseProperty, reopenPageId?: string, anchor?: HTMLElement, insertAt?: { id: string; side: "left" | "right" }) {
    this.menu?.destroy(); this.menu = undefined;
    if (field) {
      let source = this.source, baseline = structuredClone(field), baselineView = this.view;
      const selectedView = { ...baselineView, propertyIds: databaseViewProperties(source, baselineView, this.snapshot!.database).map(item => item.id) };
      this.menu = openPropertyMenu(anchor ?? this.host.querySelector<HTMLElement>("[data-db-view]")!, {
        field, view: selectedView,
        save: async (property, view) => {
          if (JSON.stringify(property) !== JSON.stringify(baseline)) {
            source = await api<DatabaseDataSource>(`/data-sources/${source.id}`, { method: "PUT", body: JSON.stringify({ baseRevision: source.revision, properties: source.properties.map(item => item.id === property.id ? property : item) }) });
            this.snapshot!.dataSources = this.snapshot!.dataSources.map(item => item.id === source.id ? source : item); baseline = structuredClone(property);
          }
          if (JSON.stringify(view.layout) !== JSON.stringify(baselineView.layout ?? {}) || JSON.stringify(view.propertyIds) !== JSON.stringify(selectedView.propertyIds)) {
            baselineView = await api<DatabaseView>(`/database-views/${view.id}`, { method: "PUT", body: JSON.stringify({ baseRevision: baselineView.revision, propertyIds: view.propertyIds, layout: view.layout }) });
            this.snapshot!.views = this.snapshot!.views.map(item => item.id === view.id ? baselineView : item);
          }
          this.render(); document.dispatchEvent(new CustomEvent("notdown-database-updated", { detail: this.snapshot }));
        },
        insert: side => this.editProperty(undefined, undefined, undefined, { id: field.id, side }),
        query: kind => this.editView(kind, field),
      }); return;
    }
    const source = this.source;
    formDialog("Add property", `<label><span data-i18n="Property name">Property name</span><input name="name" required maxlength="200" autofocus /></label><label><span data-i18n="Property type">Property type</span><select name="type">${editableTypes.map(type => `<option value="${type}">${e(typeLabels[type] ?? type)}</option>`).join("")}</select></label><label><span data-i18n="Options (one per line)">Options (one per line)</span><textarea name="options" rows="4" placeholder="To do&#10;In progress&#10;Done"></textarea></label><footer><button type="button" data-cancel data-i18n="Cancel">Cancel</button><button class="primary-button" type="submit" data-i18n="Save property">Save property</button></footer>`, async form => {
      const id = crypto.randomUUID(), type = String(form.get("type")) as DatabasePropertyType;
      const names = String(form.get("options") ?? "").split(/\r?\n/).map(name => name.trim()).filter(Boolean);
      if (new Set(names).size !== names.length) throw new Error("Option names must be unique");
      const property: DatabaseProperty = { id, name: String(form.get("name")).trim(), key: id, type };
      if (type === "relation") property.localRelation = true;
      if (["select", "multi_select", "status"].includes(type)) property.options = names.map((name, index) => ({ id: crypto.randomUUID(), name, color: ["gray", "blue", "green", "red", "yellow"][index % 5] }));
      const properties = [...source.properties], index = insertAt ? properties.findIndex(field => field.id === insertAt.id) : -1;
      properties.splice(index < 0 ? properties.length : index + (insertAt?.side === "right" ? 1 : 0), 0, property);
      const saved = await api<DatabaseDataSource>(`/data-sources/${source.id}`, { method: "PUT", body: JSON.stringify({ baseRevision: source.revision, properties }) });
      this.snapshot!.dataSources = this.snapshot!.dataSources.map(item => item.id === saved.id ? saved : item);
      const view = this.view;
      if (view.propertyIds || insertAt) {
        try {
          const ids = view.propertyIds ? [...view.propertyIds] : databaseViewProperties(source, view, this.snapshot!.database).map(field => field.id);
          const position = insertAt ? ids.indexOf(insertAt.id) : -1; ids.splice(position < 0 ? ids.length : position + (insertAt?.side === "right" ? 1 : 0), 0, property.id);
          const updated = await api<DatabaseView>(`/database-views/${view.id}`, { method: "PUT", body: JSON.stringify({ baseRevision: view.revision, propertyIds: ids }) });
          this.snapshot!.views = this.snapshot!.views.map(item => item.id === updated.id ? updated : item);
        } catch (error) { this.render(); this.message(`Property created. Its column could not be shown: ${error instanceof Error ? error.message : "view changed"}. Reload and select it in View settings.`); return; }
      }
      this.render(); if (reopenPageId) await this.openPeek(reopenPageId);
    });
  }
  showViewOptions() { this.editView(undefined, undefined, this.host.querySelector<HTMLElement>(".wiki-view-trigger") ?? undefined); }
  private tabMenu(id: string, providedAnchor?: HTMLElement) {
    this.menu?.destroy();
    const snapshot = this.snapshot!, view = snapshot.views.find(item => item.id === id), anchor = providedAnchor ?? this.host.querySelector<HTMLElement>(`[data-db-tab="${CSS.escape(id)}"]`);
    if (!view || !anchor) return;
    const source = snapshot.dataSources.find(source => source.id === view.dataSourceId); if (!source) return;
    const publish = (next: DatabaseSnapshot, selected = this.view?.id) => {
      this.snapshot = next; this.rememberView(next.views.some(view => view.id === selected) ? selected! : next.views[0]?.id ?? ""); this.render();
      document.dispatchEvent(new CustomEvent("notdown-database-updated", { detail: next }));
    };
    this.menu = openTabMenu(anchor, {
      view, source, wiki: isWikiDatabase(snapshot.database), lastSourceView: snapshot.views.filter(item => item.dataSourceId === source.id).length === 1, ownsSource: source.ownerDatabaseId === snapshot.database.id,
      showSourceTitle: this.showSourceTitle,
      save: async draft => {
        const saved = await api<DatabaseView>(`/database-views/${id}`, { method: "PUT", body: JSON.stringify({ baseRevision: view.revision, name: draft.name, icon: draft.icon, type: draft.type, layout: draft.layout }) });
        this.snapshot!.views = this.snapshot!.views.map(item => item.id === saved.id ? saved : item); this.render(); document.dispatchEvent(new CustomEvent("notdown-database-updated", { detail: this.snapshot }));
      },
      edit: section => this.editView(section, undefined, this.host.querySelector<HTMLElement>("[data-db-view]")!, view),
      duplicate: async () => {
        const { id: _id, databaseId: _databaseId, revision: _revision, ...copy } = view;
        const next = await api<DatabaseSnapshot>(`/databases/${snapshot.database.id}/views`, { method: "POST", body: JSON.stringify({ ...copy, name: `${view.name} (copy)`, baseRevision: snapshot.database.revision }) });
        publish(next, next.views.find(item => !snapshot.views.some(previous => previous.id === item.id))!.id);
      },
      remove: async trashSource => { const next = await api<DatabaseSnapshot>(`/database-views/${id}/delete`, { method: "POST", body: JSON.stringify({ baseRevision: view.revision, databaseRevision: snapshot.database.revision, ...(trashSource ? { trashSource: true, sourceRevision: source.revision } : {}) }) }); publish(next); if (trashSource) document.dispatchEvent(new Event("notdown-database-structure-changed")); },
    });
  }
  private editView(section?: "Filter" | "Sort" | "Group" | "Layout" | "Source", property?: DatabaseProperty, anchor?: HTMLElement, target?: DatabaseView) {
    this.menu?.destroy();
    const view = structuredClone(target ?? this.view); if (!view) return;
    if (property && section === "Filter") view.filters = [...view.filters ?? [], { propertyId: property.id, operator: "is_not_empty" }];
    if (property && section === "Sort") view.sorts = [...view.sorts ?? [], { propertyId: property.id, direction: "ascending" }];
    if (property && section === "Group") view.layout = { ...view.layout, groupBy: property.id };
    this.menu = openViewMenu(anchor ?? this.host.querySelector<HTMLElement>(section === "Filter" ? "[data-db-filter]" : section === "Sort" ? "[data-db-sort]" : "[data-db-view]")!, {
      sources: this.snapshot!.dataSources, view, surface: this.host, wiki: isWikiDatabase(this.snapshot!.database), manageSources: isWikiDatabase(this.snapshot!.database) ? undefined : (pop, button, level) => { void this.manageSources(pop, button, level).catch(error => this.message(error.message)); },
      save: async draft => {
        const saved = await api<DatabaseView>(`/database-views/${view.id}`, { method: "PUT", body: JSON.stringify({ baseRevision: view.revision, name: draft.name, icon: draft.icon, type: draft.type, layout: draft.layout, filterMode: draft.filterMode, propertyIds: draft.propertyIds, filters: draft.filters, sorts: draft.sorts }) });
        view.revision = saved.revision; draft.revision = saved.revision;
        this.snapshot!.views = this.snapshot!.views.map(item => item.id === saved.id ? saved : item); this.visibleLimit = undefined; this.render(true);
        document.dispatchEvent(new CustomEvent("notdown-database-updated", { detail: this.snapshot }));
      },
      editProperty: (field, anchor) => this.editProperty(field, undefined, anchor.isConnected ? anchor : undefined), addProperty: () => this.editProperty(),
    }, section);
    if (property) this.menu.dirty = true;
  }
  private async manageSources(pop?: DatabasePopover, anchor?: HTMLElement, level = 0, initialCreate = false) {
    if (isWikiDatabase(this.snapshot?.database)) return;
    if (!await this.flush() || !await this.closePeek() || !this.alive) return;
    if (!pop) this.menu?.destroy();
    const snapshot = this.snapshot!;
    const publish = (next: DatabaseSnapshot, sourceId: string) => {
      if (!this.alive) return;
      this.snapshot = next; this.rememberView(next.views.find(view => view.dataSourceId === sourceId)?.id ?? ""); this.render();
      document.dispatchEvent(new CustomEvent("notdown-database-updated", { detail: next }));
    };
    const mutate = async (operation: string, input: Record<string, unknown>) => {
      this.sourceSaving = true;
      try { return await api<DatabaseSnapshot>(`/databases/${snapshot.database.id}/data-sources${operation}`, { method: "POST", body: JSON.stringify({ ...input, baseRevision: snapshot.database.revision }) }); }
      finally { this.sourceSaving = false; }
    };
    this.menu = openSourceMenu(anchor ?? this.host.querySelector<HTMLElement>("[data-db-view]")!, {
      snapshot, surface: this.host, initialCreate, list: () => api<DatabaseSourceSummary[]>("/data-sources?includeTrashed=true"),
      move: async (source, target) => { const next = await api<DatabaseSnapshot>(`/data-sources/${source.id}/move`, { method: "POST", body: JSON.stringify({ baseRevision: source.revision, databaseRevision: snapshot.database.revision, targetDatabaseId: target.id, targetRevision: target.revision }) }); publish(next, source.id); document.dispatchEvent(new Event("notdown-database-structure-changed")); },
      trash: async (source, trashed) => { const next = await api<DatabaseSnapshot>(`/data-sources/${source.id}/trash`, { method: "POST", body: JSON.stringify({ baseRevision: source.revision, databaseRevision: source.ownerRevision ?? snapshot.database.revision, trashed }) }); if (next.database.id === snapshot.database.id) publish(next, source.id); document.dispatchEvent(new Event("notdown-database-structure-changed")); },
      create: async title => { const next = await mutate("", { title }); publish(next, next.database.dataSourceIds.find(id => !snapshot.database.dataSourceIds.includes(id))!); },
      link: async source => { const next = await mutate("/link", { dataSourceId: source.id, sourceRevision: source.revision }); publish(next, source.id); },
      select: sourceId => { this.rememberView(snapshot.views.find(view => view.dataSourceId === sourceId)?.id ?? ""); this.render(); },
    }, pop ? { pop, level } : undefined);
  }
  private newView(anchor?: HTMLElement) {
    this.menu?.destroy();
    const snapshot = this.snapshot!;
    const view: DatabaseView = { id: crypto.randomUUID(), databaseId: snapshot.database.id, dataSourceId: this.source.id, name: "", type: "table", layout: {}, revision: "" };
    this.menu = openViewMenu(anchor ?? this.host.querySelector<HTMLElement>("[data-db-new-view]")!, {
      sources: snapshot.dataSources, view, create: true, wiki: isWikiDatabase(snapshot.database),
      save: async draft => {
        const next = await createDatabaseView(snapshot, draft, this.view);
        this.snapshot = next; this.rememberView(next.database.viewIds.find(id => !snapshot.database.viewIds.includes(id)) ?? ""); this.render();
        document.dispatchEvent(new CustomEvent("notdown-database-updated", { detail: next }));
      }, editProperty: () => {}, addProperty: () => {},
    });
  }
}
