import { api, escape as e, type Page } from "../../shared/types";
import { documentMetadata } from "../metadata/document-metadata";
import { databaseViewProperties } from "./database-columns";
import { databaseSourceView } from "./database-reference";
import { openSourceMenu } from "./database-source-menu";
import { renderSourceCatalog } from "./database-source-catalog";
import type { DatabaseSourceSummary } from "./database-model";
import { Database as DatabaseIcon } from "lucide";
import { databasePropertyReadOnly, type Database, type DatabaseDataSource, type DatabaseProperty, type DatabasePropertyType, type DatabaseSnapshot, type DatabaseView } from "./database-model";
import { isWikiDatabase } from "./database-model";
import { createElement, Columns3, LayoutGrid, List, Table2, Plus, ChevronDown, Type, CircleChevronDown, AlignLeft, SquareCheck, Hash, Calendar, Link, Users, FileText, PanelRight, ListFilter, ArrowDownUp, Search, SlidersHorizontal, Ellipsis, ArrowLeft, X, Check, type IconNode } from "lucide";
import { DatabasePeek } from "./database-peek";
import { openCalloutIconPicker } from "../../blocks/callout-icon-picker";
import { pageIconElement } from "../../shared/page-icons";
import "./databases.css";
import { queryDatabase, groupable, databaseGroups, fieldValue } from "./database-query";
import { renderDatabaseLayout, groupHeading } from "./database-layouts";
import { openViewMenu, openPropertyMenu, openGroupMenu } from "./database-menus";
import type { DatabasePopover } from "./database-popover";
const viewIcons = { table: Table2, board: Columns3, gallery: LayoutGrid, list: List, calendar: Calendar };
import { externalEntitiesChanged, externalLibrary, resolveExternal } from "../references/external-client";
import { requestPeople } from "../people/people-client";

type Pending = { pageId: string; propertyId: string; value: unknown; baseRevision: string; schemaRevision: string; sourceId: string };
type PresentationDraft = { baseRevision: string; hostRevision?: string; title?: string; icon?: string };
type Hooks = { vaultKey: string; initialSourceUrl?: string; initialViewId?: string; viewChanged?: () => void; interactionMode?: "desktop" | "touch"; openPage: (id: string) => Promise<unknown>; openDatabase: (id?: string) => Promise<unknown>; changed: (page: Page) => void; createDatabase?: () => Promise<unknown>; createWiki?: () => Promise<unknown>; undoWiki?: (snapshot: DatabaseSnapshot) => Promise<unknown> };
const editableTypes: DatabasePropertyType[] = ["text", "number", "checkbox", "date", "select", "multi_select", "status", "url", "email", "phone"];
const typeLabels: Record<string, string> = { text: "Text", number: "Number", checkbox: "Checkbox", date: "Date", select: "Select", multi_select: "Multi-select", status: "Status", url: "URL", email: "Email", phone: "Phone" };
const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const glyph = (node: IconNode, className = "") => createElement(node, { width: 18, height: 18, "stroke-width": 1.7, "aria-hidden": "true", class: className }).outerHTML;
const typeIcon = (type: string) => glyph(({ title: Type, text: AlignLeft, number: Hash, checkbox: SquareCheck, date: Calendar, select: CircleChevronDown, multi_select: CircleChevronDown, status: CircleChevronDown, url: Link, relation: Link, people: Users, files: FileText } as Record<string, IconNode>)[type] ?? AlignLeft, "database-type-icon");
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

export function propertyInput(field: DatabaseProperty, page: Page, value: unknown, commit: (value: unknown) => void, wrap = false): HTMLElement {
  const label = `${field.name}: ${page.title}`;
  const wrapper = document.createElement("div");
  wrapper.className = "database-cell";
  if (["people", "relation"].includes(field.type)) { wrapper.dataset.externalProperty = field.id; wrapper.dataset.externalPage = page.id; }
  const override = documentOverrides(page, field);
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
  if (["select", "multi_select", "status"].includes(field.type)) {
    const control = document.createElement("button"); control.type = "button"; control.className = "database-select-control";
    control.setAttribute("aria-label", label); control.setAttribute("aria-haspopup", "listbox"); control.setAttribute("aria-expanded", "false");
    let selected = new Set<string>(Array.isArray(value) ? value : typeof value === "string" ? [value] : []);
    const draw = () => { control.innerHTML = [...selected].map(id => optionTag(field.options?.find(option => option.id === id) ?? { name: id })).join("") || '<span class="database-empty-value">Empty</span>'; };
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
      document.body.append(popover); control.setAttribute("aria-expanded", "true"); popover.querySelector<HTMLButtonElement>("button[aria-selected=true],button")?.focus(); document.addEventListener("pointerdown", outside, true);
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
  dialog.innerHTML = `<form><header><h2>${e(title)}</h2><button type="button" data-dismiss aria-label="Close">${glyph(X)}</button></header>${content}<p class="database-message" role="status"></p></form>`;
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
  private calendarAnchor = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })();
  private menu?: DatabasePopover;
  private visibleLimit?: number;
  private layoutSaving = false;
  private sourceSaving = false;
  private presentation?: PresentationDraft;
  private presentationSaving?: Promise<boolean>;
  private presentationFailed = false;
  private iconCleanup?: () => void;
  private peek?: DatabasePeek;
  private search = "";
  private showSearch = false;
  private opening = 0;
  private snapshot?: DatabaseSnapshot;
  private pending = new Map<string, Pending>();
  private saving?: Promise<boolean>;
  private failed = false;
  private alive = true;
  private activeView = "";
  private pointerDown = false;
  private rowsNeedRefresh = false;
  private refreshTimer?: ReturnType<typeof setTimeout>;
  constructor(private host: HTMLElement, private hooks: Hooks) {
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
  get dirty() { return this.sourceSaving || !!(this.menu?.saveOnDismiss && this.menu.dirty) || this.layoutSaving || this.pending.size > 0 || !!this.saving || !!this.peek?.dirty || !!this.presentation || !!this.presentationSaving; }
  destroy() { this.menu?.destroy(); this.menu = undefined; this.alive = false; document.removeEventListener(externalEntitiesChanged, this.referencesChanged); this.iconCleanup?.(); this.peek?.destroy(); closeOptions?.(); clearTimeout(this.refreshTimer); window.removeEventListener("pointerup", this.pointerUp); window.removeEventListener("pointercancel", this.pointerUp); }
  private message(text: string) { if (this.alive) { const element = this.host.querySelector(".database-message"); if (element) { element.textContent = text; element.classList.toggle("is-error", !["Saved locally", "Saving changes…", "Unsaved changes"].includes(text)); } } }
  private draftKey() { return `notdown-database-draft:${this.hooks.vaultKey}:${this.snapshot!.database.id}`; }
  private viewKey() { return `${this.draftKey()}:view${this.hooks.initialSourceUrl ? `:${this.hooks.initialSourceUrl.toLowerCase().replace(/-/g, "")}` : ""}`; }
  private persist() {
    try { if (this.pending.size) sessionStorage.setItem(this.draftKey(), JSON.stringify([...this.pending])); else sessionStorage.removeItem(this.draftKey()); }
    catch { this.message("Browser draft storage is full. Save before leaving this database."); }
  }
  async load(id?: string) {
    if (id) {
      const snapshot = await api<DatabaseSnapshot>(`/databases/${encodeURIComponent(id)}`);
      if (!this.alive) return;
      this.snapshot = snapshot;
      this.activeView ||= databaseSourceView(snapshot, this.hooks.initialSourceUrl)?.id ?? "";
      try { const draft = sessionStorage.getItem(`${this.draftKey()}:presentation`); if (draft) this.presentation = JSON.parse(draft); } catch { /* Optional tab draft. */ }
      try { this.activeView = sessionStorage.getItem(this.viewKey()) ?? this.activeView; } catch { /* View selection is optional local state. */ }
      if (snapshot.views.some(view => view.id === this.hooks.initialViewId)) this.rememberView(this.hooks.initialViewId!);
      try { const draft = sessionStorage.getItem(this.draftKey()); if (draft) this.pending = new Map(JSON.parse(draft)); } catch { /* Disk remains authoritative. */ }
      this.render();
      if (this.pending.size || this.presentation) this.message("Recovered unsaved edits. Save changes or discard and reload.");
    } else {
      const databases = await api<Database[]>("/databases");
      if (!this.alive) return;
      this.host.innerHTML = `<section class="database-workspace"><header class="database-heading"><div><h1>Databases</h1><p>Organize Markdown pages with shared properties and saved views.</p></div><button class="primary-button" data-db-new>New database</button></header><div class="database-list">${databases.map(database => `<button data-db-open="${e(database.id)}"><strong>${e(database.title)}</strong><span>${database.dataSourceIds.length} data source${database.dataSourceIds.length === 1 ? "" : "s"} →</span></button>`).join("") || '<div class="database-empty"><h2>No databases yet</h2><p>Create a database, or import one from Notion using the sidebar.</p></div>'}</div></section>`;
      this.host.querySelector("[data-db-new]")!.addEventListener("click", () => this.newDatabase());
      const newWiki = document.createElement("button"); newWiki.className = "secondary-button"; newWiki.textContent = "New wiki";
      newWiki.onclick = () => { void (this.hooks.createWiki ? this.hooks.createWiki() : api<DatabaseSnapshot>("/databases", { method: "POST", body: JSON.stringify({ title: "New wiki", kind: "wiki" }) }).then(snapshot => this.hooks.openDatabase(snapshot.database.id))); };
      this.host.querySelector(".database-heading")!.append(newWiki);
      for (const database of databases) if (isWikiDatabase(database)) this.host.querySelector(`[data-db-open="${CSS.escape(database.id)}"] span`)!.textContent = "Wiki · Home and page views →";
      this.host.querySelectorAll<HTMLElement>("[data-db-open]").forEach(button => button.addEventListener("click", () => void this.hooks.openDatabase(button.dataset.dbOpen)));
      const list = this.host.querySelector<HTMLElement>(".database-list")!;
      const catalog = document.createElement("div"); catalog.hidden = true; list.after(catalog);
      const tabs = document.createElement("div"); tabs.className = "database-view-tabs database-catalog-tabs"; tabs.setAttribute("role", "tablist"); tabs.setAttribute("aria-label", "Database library");
      for (const name of ["Databases", "Data sources"]) {
        const button = document.createElement("button"); button.textContent = name; button.setAttribute("role", "tab"); button.setAttribute("aria-selected", String(name === "Databases"));
        button.addEventListener("click", async () => {
          const showSources = name === "Data sources";
          tabs.querySelectorAll("button").forEach(item => item.setAttribute("aria-selected", String(item === button)));
          list.hidden = showSources; catalog.hidden = !showSources;
          if (!showSources) return;
          catalog.textContent = "Loading data sources…";
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
  get selectedViewId() { return this.snapshot ? this.view?.id : undefined; }
  private rememberView(id: string) { this.visibleLimit = undefined; this.activeView = id; try { sessionStorage.setItem(this.viewKey(), id); } catch { /* Saved view definitions remain on disk. */ } this.hooks.viewChanged?.(); }
  private get source() { return this.snapshot!.dataSources.find(source => source.id === this.view?.dataSourceId) ?? this.snapshot!.dataSources[0]; }
  private queue(page: Page, field: DatabaseProperty, value: unknown) {
    const key = `${page.id}/${field.id}`, previous = this.pending.get(key);
    this.pending.set(key, { pageId: page.id, propertyId: field.id, value, baseRevision: previous?.baseRevision ?? page.revision, schemaRevision: previous?.schemaRevision ?? this.source.revision, sourceId: this.source.id });
    this.persist(); this.message(this.failed ? "Save failed. Your edits are kept; review the error before retrying." : "Unsaved changes");
  }
  async flush(): Promise<boolean> {
    if (this.sourceSaving) { this.message("Wait for data source changes to finish."); return false; }
    if (this.menu?.saveOnDismiss && !(await this.menu.save())) return false;
    if (this.peek && !(await this.peek.flush())) return false;
    if (!(await this.flushPresentation())) return false;
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
        this.failed = true; this.message(`${error instanceof Error ? error.message : "Save failed"}. Edits remain in this tab. Use Discard edits and reload to load the disk version.`); return false;
      } finally {
        this.saving = undefined;
      }
    });
    return this.saving;
  }
  private persistPresentation() {
    try { if (this.presentation) sessionStorage.setItem(`${this.draftKey()}:presentation`, JSON.stringify(this.presentation)); else sessionStorage.removeItem(`${this.draftKey()}:presentation`); }
    catch { this.message("Browser draft storage is full. Save before leaving this database."); }
  }
  private queuePresentation(patch: { title?: string; icon?: string }) {
    this.presentationFailed = false;
    this.presentation = { ...(this.presentation ?? { baseRevision: this.snapshot!.database.revision, ...(this.snapshot!.hostPage ? { hostRevision: this.snapshot!.hostPage.revision } : {}) }), ...patch };
    this.persistPresentation(); this.message("Unsaved changes");
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
        this.presentationFailed = true; this.persistPresentation(); this.message(`${error instanceof Error ? error.message : "Save failed"}. Your title or icon choice is preserved in this tab.`); return false;
      } finally { this.presentationSaving = undefined; }
    });
    return this.presentationSaving;
  }
  private refreshPresentation() {
    if (!this.alive || !this.snapshot) return;
    const icon = this.presentation?.icon ?? this.snapshot.hostPage?.icon ?? this.snapshot.database.icon ?? "table-2";
    const button = this.host.querySelector<HTMLButtonElement>("[data-db-icon]");
    if (button) button.replaceChildren(pageIconElement(icon));
    const title = this.host.querySelector<HTMLInputElement>("[aria-label='Database title']");
    if (title) { title.value = this.presentation?.title ?? this.snapshot.database.title; title.closest("h1")?.setAttribute("aria-label", title.value); }
  }
  private async chooseIcon(anchor: HTMLElement) {
    if (!(await this.flush()) || !this.alive) return;
    this.iconCleanup?.();
    this.iconCleanup = openCalloutIconPicker(anchor, icon => {
      this.iconCleanup = undefined;
      this.queuePresentation({ icon }); this.refreshPresentation(); void this.flush();
    }, "Database icon", { lucide: true, current: this.snapshot!.hostPage?.icon ?? this.snapshot!.database.icon ?? "table-2" });
  }
  private matchingRows(source: DatabaseDataSource): Page[] {
    const rows = queryDatabase(this.snapshot!.pages, source, this.view, this.search);
    const field = this.view.type !== "calendar" && source.properties.find(field => field.id === this.view.layout?.groupBy);
    return field ? databaseGroups(rows, field, this.view).flatMap(group => group.pages) : rows;
  }
  private rows(source: DatabaseDataSource): Page[] { return this.matchingRows(source).slice(0, this.visibleLimit ?? (this.view.layout?.loadLimit || Infinity)); }
  private updateLoadMore() {
    this.host.querySelector(".database-load-more")?.remove();
    const total = this.matchingRows(this.source).length, shown = this.rows(this.source).length;
    if (shown >= total) return;
    const button = document.createElement("button"); button.className = "database-load-more"; button.textContent = `Load more (${shown} of ${total})`;
    button.onclick = () => { this.visibleLimit = shown + (this.view.layout?.loadLimit || 50); this.scheduleRows(); };
    this.host.querySelector(".database-row-count")?.before(button);
  }
  private renderAlternate() {
    const mount = this.host.querySelector<HTMLElement>(".database-alternate-layout"); if (!mount) return;
    const source = this.source, view = this.view;
    renderDatabaseLayout(mount, source, this.rows(source), databaseViewProperties(source, view, this.snapshot!.database), view, {
      open: page => { void this.openPeek(page.id); },
      add: properties => { void this.flush().then(ok => { if (ok) this.addRow(properties); }); },
      settings: () => this.editView(),
      groupMenu: (field, key, anchor) => { void this.editGroup(field, key, anchor); },
      collapseGroup: key => { void this.collapseGroup(key); },
      writable: (page, field) => !this.layoutSaving && !databasePropertyReadOnly(field) && !documentOverrides(page, field),
      move: (page, field, value) => { void (async () => {
        if (this.layoutSaving || !await this.flush() || !await this.closePeek()) return;
        this.layoutSaving = true;
        try { this.queue(page, field, value); if (await this.flush()) this.renderAlternate(); }
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
      if (!this.alive || !this.snapshot || this.pointerDown || this.pending.size) return;
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
      const count = this.host.querySelector(".database-row-count"); if (count) count.textContent = `${ordered.length} ${ordered.length === 1 ? "page" : "pages"}`; this.updateLoadMore();
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
    formDialog("Move group to Trash", `<p>Move ${total} page${total === 1 ? "" : "s"} in <strong>${e(group.name)}</strong> and their child pages to Trash? You can restore them from Trash.</p><footer><button type="button" data-cancel>Cancel</button><button type="submit" class="primary-button">Move to Trash</button></footer>`, async () => {
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
  private render() {
    this.menu?.destroy(); this.menu = undefined;
    ++this.opening;
    const scrollTop = this.host.querySelector<HTMLElement>(".database-table-pane")?.scrollTop ?? 0;
    const scrollLeft = this.host.querySelector<HTMLElement>(".database-table-scroll")?.scrollLeft ?? 0;
    const snapshot = this.snapshot!, source = this.source, view = this.view;
    this.peek?.destroy(); this.peek = undefined;
    this.host.innerHTML = `<div class="database-layout"><section class="database-workspace database-table-pane"><button class="database-back" data-db-back aria-label="All databases">${glyph(ArrowLeft)}Databases</button><header class="database-heading"><div class="database-heading-title"><button type="button" class="database-title-icon" data-db-icon aria-label="Change database icon" title="Change database icon"></button><h1 aria-label="${e(snapshot.database.title)}"><input class="database-title-input" aria-label="Database title" value="${e(this.presentation?.title ?? snapshot.database.title)}" maxlength="500" /></h1></div></header><div class="database-toolbar"><div class="database-view-tabs" role="tablist" aria-label="Database views">${snapshot.views.map(item => `<button role="tab" aria-selected="${view?.id === item.id}" data-db-tab="${e(item.id)}">${glyph(viewIcons[item.type] ?? Table2)}${e(item.name)}</button>`).join("")}<button class="database-icon-button" data-db-new-view aria-label="New view" title="New view">${glyph(Plus)}</button></div><div class="database-toolbar-actions"><button class="database-icon-button ${view?.filters?.length ? "is-active" : ""}" data-db-filter aria-label="Filter" title="Filter">${glyph(ListFilter)}</button><button class="database-icon-button ${view?.sorts?.length ? "is-active" : ""}" data-db-sort aria-label="Sort" title="Sort">${glyph(ArrowDownUp)}</button><button class="database-icon-button" data-db-search aria-label="Search database" title="Search database" aria-expanded="${this.showSearch}">${glyph(Search)}</button><button class="database-icon-button" data-db-view aria-label="View settings" title="View settings">${glyph(SlidersHorizontal)}</button><div class="database-new-control"><button class="database-new-button" data-db-row aria-label="Add row">New</button><details class="database-new-menu"><summary class="database-new-menu-button" aria-label="New options">${glyph(ChevronDown)}</summary><div class="database-menu"><button data-db-row>New page</button><button data-action="import-notion">Import from Notion</button></div></details></div><details class="database-more-menu"><summary class="database-icon-button" aria-label="Database options">${glyph(Ellipsis)}</summary><div class="database-menu"><button data-db-save>Save changes</button><button data-db-refresh>Discard edits and reload</button></div></details></div></div><div class="database-search" ${this.showSearch ? "" : "hidden"}>${glyph(Search)}<input type="search" aria-label="Search database records" placeholder="Search this database…" value="${e(this.search)}"/><button aria-label="Close database search" class="database-icon-button">${glyph(X)}</button></div><p class="database-message" role="status">Saved locally</p><div class="database-table-scroll"><table class="database-table"><thead><tr></tr></thead><tbody></tbody></table><button class="database-add-row" data-db-row>${glyph(Plus)}New page</button></div><p class="database-row-count"></p></section><aside class="database-peek-mount" hidden></aside></div>`;
    this.host.querySelector("[data-db-back]")!.addEventListener("click", () => void this.hooks.openDatabase());
    const sourcesButton = document.createElement("button"); sourcesButton.type = "button"; sourcesButton.className = "database-icon-button";
    sourcesButton.dataset.dbSources = ""; sourcesButton.setAttribute("aria-label", "Data sources"); sourcesButton.title = "Data sources"; sourcesButton.innerHTML = glyph(DatabaseIcon);
    sourcesButton.addEventListener("click", () => { void this.manageSources().catch(error => this.message(error.message)); });
    if (!isWikiDatabase(snapshot.database)) this.host.querySelector(".database-more-menu")!.before(sourcesButton);
    if (isWikiDatabase(snapshot.database) && this.hooks.undoWiki) {
      const undo = document.createElement("button"); undo.textContent = "Undo wiki"; undo.type = "button";
      undo.onclick = () => { void (async () => { if (await this.flush()) await this.hooks.undoWiki!(this.snapshot!); })().catch(error => this.message(error.message)); };
      this.host.querySelector(".database-more-menu .database-menu")!.append(undo);
    }
    if (typeof snapshot.database.homePageId === "string" || isWikiDatabase(snapshot.database)) {
      const home = document.createElement("button");
      home.type = "button"; home.textContent = "Home"; home.setAttribute("aria-label", "Open database Home");
      home.addEventListener("click", () => { void (async () => { if (await this.flush()) await this.hooks.openPage(typeof snapshot.database.homePageId === "string" ? snapshot.database.homePageId : snapshot.database.pageId ?? snapshot.database.id); })().catch(error => this.message(error.message)); });
      this.host.querySelector(".database-view-tabs")!.prepend(home);
    }
    if (Array.isArray(view?.importWarnings) && view.importWarnings.length) {
      const note = document.createElement("p"); note.className = "database-import-note";
      note.textContent = view.importWarnings.filter((value): value is string => typeof value === "string").join(" ");
      this.host.querySelector(".database-table-scroll")!.before(note);
    }
    this.host.querySelector("[data-db-save]")!.addEventListener("click", () => { this.failed = false; this.presentationFailed = false; void this.flush(); });
    this.refreshPresentation();
    const titleInput = this.host.querySelector<HTMLInputElement>("[aria-label='Database title']")!;
    titleInput.addEventListener("input", () => { this.queuePresentation({ title: titleInput.value }); titleInput.closest("h1")!.setAttribute("aria-label", titleInput.value); });
    titleInput.addEventListener("change", () => void this.flush());
    titleInput.addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); void this.flush(); } });
    this.host.querySelector<HTMLButtonElement>("[data-db-icon]")!.addEventListener("click", event => void this.chooseIcon(event.currentTarget as HTMLElement));
    this.host.querySelector("[data-db-refresh]")!.addEventListener("mousedown", event => event.preventDefault());
    this.host.querySelector("[data-db-refresh]")!.addEventListener("click", () => {
      if (this.saving || this.presentationSaving) { this.message("Wait for the current save to finish before discarding edits."); return; }
      this.pending.clear(); this.persist(); this.failed = false;
      this.presentation = undefined; this.persistPresentation(); this.presentationFailed = false;
      void (async () => { if (!(await this.closePeek())) return; await this.load(snapshot.database.id); })().catch(error => this.message(error.message));
    });
    const act = (action: () => void) => void this.flush().then(async ok => { if (ok && await this.closePeek()) action(); });
    this.host.querySelectorAll<HTMLElement>("[data-db-tab]").forEach(button => button.addEventListener("click", () => {
      const id = button.dataset.dbTab!;
      if (id !== this.view?.id) act(() => { this.rememberView(id); this.render(); });
    }));
    this.host.querySelectorAll("[data-db-row]").forEach(button => button.addEventListener("click", () => act(() => this.addRow())));
    this.host.querySelector("[data-db-view]")!.addEventListener("click", () => act(() => this.editView()));
    this.host.querySelector("[data-db-filter]")!.addEventListener("click", () => act(() => this.editView("Filter")));
    this.host.querySelector("[data-db-sort]")!.addEventListener("click", () => act(() => this.editView("Sort")));
    this.host.querySelector("[data-db-new-view]")!.addEventListener("click", () => act(() => this.newView()));
    const searchHost = this.host.querySelector<HTMLElement>(".database-search")!, searchInput = searchHost.querySelector<HTMLInputElement>("input")!;
    this.host.querySelector("[data-db-search]")!.addEventListener("click", () => { this.showSearch = !this.showSearch; searchHost.hidden = !this.showSearch; if (this.showSearch) searchInput.focus(); });
    searchInput.addEventListener("input", () => { this.search = searchInput.value; this.visibleLimit = undefined; this.scheduleRows(); });
    searchHost.querySelector("button")!.addEventListener("click", () => { this.showSearch = false; this.search = ""; searchInput.value = ""; searchHost.hidden = true; this.scheduleRows(); });
    const workspace = this.host.querySelector<HTMLElement>(".database-workspace")!;
    workspace.dataset.verticalLines = String(view.layout?.showVerticalLines !== false);
    workspace.classList.toggle("database-hide-page-icons", view.layout?.showPageIcon === false);
    workspace.classList.toggle("database-wrap-content", !!view.layout?.wrapContent);
    if ((view.layout?.showDataSourceTitle ?? snapshot.dataSources.length > 1) && source) {
      const title = document.createElement("h2"); title.className = "database-source-title"; title.dataset.sourceId = source.id;
      const button = document.createElement("button"); button.type = "button"; button.setAttribute("aria-label", `Current data source: ${source.title}`);
      button.append(document.createTextNode(source.title), createElement(ChevronDown, { width: 16, height: 16, "aria-hidden": "true" }));
      button.addEventListener("click", () => { void this.manageSources().catch(error => this.message(error.message)); });
      title.append(button); this.host.querySelector(".database-toolbar")!.before(title);
    }
    this.host.querySelectorAll<HTMLElement>("[data-db-tab]").forEach(tab => {
      const item = snapshot.views.find(view => view.id === tab.dataset.dbTab)!;
      const title = snapshot.dataSources.find(source => source.id === item.dataSourceId)?.title ?? "Unavailable source";
      tab.title = `${item.name} · ${title}`; tab.setAttribute("aria-description", `Data source: ${title}`);
    });
    if (!source) { this.message("This database has no available data source."); this.host.querySelectorAll<HTMLButtonElement>("[data-db-row],[data-db-new-view],[data-db-view],[data-db-filter],[data-db-sort]").forEach(button => button.disabled = true); return; }
    if (view.type !== "table") {
      const mount = document.createElement("div"); mount.className = "database-alternate-layout";
      this.host.querySelector(".database-table-scroll")!.replaceWith(mount);
      this.renderAlternate(); return;
    }
    const fields = databaseViewProperties(source, view, snapshot.database);
    const heading = this.host.querySelector("thead tr")!;
    for (const field of fields) {
      const th = document.createElement("th"), button = document.createElement("button"); th.dataset.type = field.type; th.dataset.propertyId = field.id; th.classList.toggle("database-frozen-column", field.id === view.layout?.frozenPropertyId); th.setAttribute("aria-label", field.name); button.innerHTML = `${typeIcon(field.type)}<span>${e(field.name)}</span>`; button.title = `Edit ${field.name} property`; button.setAttribute("aria-label", `Edit ${field.name} property`);
      button.addEventListener("click", () => act(() => this.editProperty(field, undefined, this.host.querySelector<HTMLElement>(`th[data-property-id="${CSS.escape(field.id)}"] button`) ?? button))); th.append(button); heading.append(th);
    }
    const addColumn = document.createElement("th"); addColumn.className = "database-add-column"; addColumn.innerHTML = `<button class="database-icon-button" aria-label="Add property" title="Add property">${glyph(Plus)}</button>`; addColumn.querySelector("button")!.addEventListener("click", () => act(() => this.editProperty())); heading.append(addColumn);
    const body = this.host.querySelector("tbody")!, rows = this.snapshot!.pages.filter(page => page.dataSourceId === source.id && !page.trashed), visible = new Set(this.rows(source).map(page => page.id));
    for (const page of rows) {
      const tr = document.createElement("tr"); tr.dataset.pageId = page.id; tr.hidden = !visible.has(page.id);
      for (const field of fields) {
        const td = document.createElement("td"), pending = this.pending.get(`${page.id}/${field.id}`);
        td.dataset.type = field.type; td.dataset.propertyId = field.id; td.classList.toggle("database-frozen-column", field.id === view.layout?.frozenPropertyId); td.classList.toggle("database-wrap-cell", !!view.layout?.wrapContent || !!view.layout?.wrapPropertyIds?.includes(field.id));
        const value = pending ? pending.value : field.type === "title" ? page.title : page.properties[field.key];
        const cell = this.recordCell(page, field, value);
        td.append(cell); tr.append(td);
      }
      const tail = document.createElement("td"); tail.className = "database-row-tail"; tr.append(tail);
      body.append(tr);
    }
    this.host.querySelector(".database-row-count")!.textContent = `${visible.size} ${visible.size === 1 ? "page" : "pages"}`;
    this.host.querySelector<HTMLElement>(".database-table-pane")!.scrollTop = scrollTop;
    this.host.querySelector<HTMLElement>(".database-table-scroll")!.scrollLeft = scrollLeft;
    this.scheduleRows();
  }
  private recordCell(page: Page, field: DatabaseProperty, value: unknown) {
    const cell = propertyInput(field, page, value, value => this.queue(page, field, value), !!this.view.layout?.wrapContent || !!this.view.layout?.wrapPropertyIds?.includes(field.id));
    cell.addEventListener("change", () => void this.flush());
    cell.addEventListener("keydown", event => { if (event.key === "Enter" && event.target instanceof HTMLInputElement) { event.preventDefault(); void this.flush(); } });
    if (field.type === "title") {
      const pageIcon = document.createElement("span"); pageIcon.className = "database-page-icon"; pageIcon.append(pageIconElement(page.icon || "file-text")); cell.prepend(pageIcon);
      const open = document.createElement("button"); open.className = "database-open-page"; open.innerHTML = `${glyph(PanelRight)}<span>OPEN</span>`; open.setAttribute("aria-label", `Open ${page.title}`);
      open.addEventListener("click", () => void this.openPeek(page.id)); cell.append(open);
    }
    return cell;
  }
  private updatePeekRow(page: Page) {
    const row = this.host.querySelector<HTMLTableRowElement>(`tr[data-page-id="${CSS.escape(page.id)}"]`);
    if (!row) { this.renderAlternate(); return; }
    for (const td of row.querySelectorAll<HTMLElement>("td[data-property-id]")) {
      const field = this.source.properties.find(field => field.id === td.dataset.propertyId); if (!field) continue;
      td.replaceChildren(this.recordCell(page, field, field.type === "title" ? page.title : page.properties[field.key]));
      td.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>("input,textarea,select,.database-select-control").forEach(control => control.disabled = true);
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
        vaultKey: this.hooks.vaultKey, pages: () => this.snapshot!.pages, propertyInput,
        addProperty: async () => { if (await this.flush()) this.editProperty(undefined, this.peek?.pageId); },
        openFull: pageId => this.hooks.openPage(pageId),
        closed: () => { void this.closePeek(); },
        changed: saved => { const old = this.snapshot!.pages.find(item => item.id === saved.id); if (old) Object.assign(old, saved); else this.snapshot!.pages.push(saved); this.hooks.changed(saved); this.updatePeekRow(saved); },
      });
      if (!(await this.peek.open(page, source)) || generation !== this.opening) return;
      mount.hidden = false; mount.classList.toggle("database-center-peek", this.view.layout?.openPagesIn === "center"); this.host.querySelector(".database-layout")!.classList.add("database-peek-open");
      this.host.querySelectorAll<HTMLElement>("tr[data-page-id]").forEach(row => row.classList.toggle("database-row-selected", row.dataset.pageId === id));
      this.host.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>(".database-table input,.database-table textarea,.database-table select,.database-table .database-select-control").forEach(input => input.disabled = true);
    } catch (error) { this.message(error instanceof Error ? error.message : "Could not open this record"); }
  }
  private addRow(properties: Record<string, unknown> = {}) {
    const source = this.source;
    formDialog("Add row", '<label>Row title<input name="title" required maxlength="500" autofocus /></label><footer><button type="button" data-cancel>Cancel</button><button type="submit" class="primary-button">Create row</button></footer>', async form => {
      const saved = await api<Page>(`/data-sources/${source.id}/records`, { method: "POST", body: JSON.stringify({ title: form.get("title"), properties, baseRevision: source.revision }) });
      const view = this.view, rowOrder = this.rows(source).map(page => page.id);
      this.snapshot!.pages.push(saved); this.hooks.changed(saved);
      try {
        const order = Array.isArray(view.rowOrder) ? [...view.rowOrder as string[]] : rowOrder;
        for (const page of this.snapshot!.pages) if (page.dataSourceId === source.id && page.id !== saved.id && !order.includes(page.id)) order.push(page.id);
        const updated = await api<DatabaseView>(`/database-views/${view.id}`, { method: "PUT", body: JSON.stringify({ baseRevision: view.revision, rowOrder: [...order, saved.id] }) });
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
    formDialog("Add property", `<label>Property name<input name="name" required maxlength="200" autofocus /></label><label>Property type<select name="type">${editableTypes.map(type => `<option value="${type}">${e(typeLabels[type] ?? type)}</option>`).join("")}</select></label><label>Options (one per line)<textarea name="options" rows="4" placeholder="To do&#10;In progress&#10;Done"></textarea></label><footer><button type="button" data-cancel>Cancel</button><button class="primary-button" type="submit">Save property</button></footer>`, async form => {
      const id = crypto.randomUUID(), type = String(form.get("type")) as DatabasePropertyType;
      const names = String(form.get("options") ?? "").split(/\r?\n/).map(name => name.trim()).filter(Boolean);
      if (new Set(names).size !== names.length) throw new Error("Option names must be unique");
      const property: DatabaseProperty = { id, name: String(form.get("name")).trim(), key: id, type };
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
  private editView(section?: "Filter" | "Sort" | "Group", property?: DatabaseProperty) {
    this.menu?.destroy();
    const view = structuredClone(this.view); if (!view) return;
    if (property && section === "Filter") view.filters = [...view.filters ?? [], { propertyId: property.id, operator: "is_not_empty" }];
    if (property && section === "Sort") view.sorts = [...view.sorts ?? [], { propertyId: property.id, direction: "ascending" }];
    if (property && section === "Group") view.layout = { ...view.layout, groupBy: property.id };
    this.menu = openViewMenu(this.host.querySelector<HTMLElement>(section === "Filter" ? "[data-db-filter]" : section === "Sort" ? "[data-db-sort]" : "[data-db-view]")!, {
      sources: this.snapshot!.dataSources, view, wiki: isWikiDatabase(this.snapshot!.database), manageSources: isWikiDatabase(this.snapshot!.database) ? undefined : () => { void this.manageSources().catch(error => this.message(error.message)); },
      save: async draft => {
        const saved = await api<DatabaseView>(`/database-views/${view.id}`, { method: "PUT", body: JSON.stringify({ baseRevision: view.revision, name: draft.name, type: draft.type, layout: draft.layout, filterMode: draft.filterMode, propertyIds: draft.propertyIds, filters: draft.filters, sorts: draft.sorts }) });
        this.snapshot!.views = this.snapshot!.views.map(item => item.id === saved.id ? saved : item); this.visibleLimit = undefined; this.render();
        document.dispatchEvent(new CustomEvent("notdown-database-updated", { detail: this.snapshot }));
      },
      editProperty: (field, anchor) => this.editProperty(field, undefined, anchor.isConnected ? anchor : undefined), addProperty: () => this.editProperty(),
    }, section);
    if (property) this.menu.dirty = true;
  }
  private async manageSources() {
    if (isWikiDatabase(this.snapshot?.database)) return;
    if (!await this.flush() || !await this.closePeek() || !this.alive) return;
    this.menu?.destroy();
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
    this.menu = openSourceMenu(this.host.querySelector<HTMLElement>("[data-db-sources]")!, {
      snapshot, list: () => api<DatabaseSourceSummary[]>("/data-sources"),
      create: async title => { const next = await mutate("", { title }); publish(next, next.database.dataSourceIds.find(id => !snapshot.database.dataSourceIds.includes(id))!); },
      link: async source => { const next = await mutate("/link", { dataSourceId: source.id, sourceRevision: source.revision }); publish(next, source.id); },
      select: sourceId => { this.rememberView(snapshot.views.find(view => view.dataSourceId === sourceId)?.id ?? ""); this.render(); },
    });
  }
  private newView() {
    this.menu?.destroy();
    const snapshot = this.snapshot!;
    const view: DatabaseView = { id: crypto.randomUUID(), databaseId: snapshot.database.id, dataSourceId: this.source.id, name: "", type: "table", layout: {}, revision: "" };
    this.menu = openViewMenu(this.host.querySelector<HTMLElement>("[data-db-new-view]")!, {
      sources: snapshot.dataSources, view, create: true, wiki: isWikiDatabase(snapshot.database),
      save: async draft => {
        const layout = draft.layout!;
        let source = snapshot.dataSources.find(item => item.id === draft.dataSourceId)!;
        if (draft.type === "board" && !layout.groupBy || draft.type === "calendar" && !layout.datePropertyId) {
          const board = draft.type === "board", id = crypto.randomUUID();
          const existing = source.properties.find(board ? groupable : field => field.type === "date");
          const field: DatabaseProperty = existing ?? { id, key: id, name: board ? "Status" : "Date", type: board ? "status" : "date", ...(board ? { options: [{ id: crypto.randomUUID(), name: "Not started", color: "gray" }, { id: crypto.randomUUID(), name: "In progress", color: "blue" }, { id: crypto.randomUUID(), name: "Done", color: "green" }] } : {}) };
          if (!existing) {
            source = await api<DatabaseDataSource>(`/data-sources/${source.id}`, { method: "PUT", body: JSON.stringify({ baseRevision: source.revision, properties: [...source.properties, field] }) });
            snapshot.dataSources = snapshot.dataSources.map(item => item.id === source.id ? source : item);
          }
          if (board) layout.groupBy = field.id; else layout.datePropertyId = field.id;
        }
        const propertyIds = draft.type === "table" ? undefined : source.properties.filter(field => field.type === "title" || field.id === layout.groupBy || field.id === layout.datePropertyId).map(field => field.id);
        const rowOrder = queryDatabase(snapshot.pages, source, { ...this.view, filters: [] }).map(page => page.id);
        const next = await api<DatabaseSnapshot>(`/databases/${snapshot.database.id}/views`, { method: "POST", body: JSON.stringify({ baseRevision: snapshot.database.revision, name: draft.name, dataSourceId: source.id, type: draft.type, layout, propertyIds, rowOrder }) });
        this.snapshot = next; this.rememberView(next.database.viewIds.find(id => !snapshot.database.viewIds.includes(id)) ?? ""); this.render();
        document.dispatchEvent(new CustomEvent("notdown-database-updated", { detail: next }));
      }, editProperty: () => {}, addProperty: () => {},
    });
  }
}
