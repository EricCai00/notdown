import { api, escape as e, type Page } from "../../shared/types";
import { documentMetadata } from "../metadata/document-metadata";
import { databaseViewProperties } from "./database-columns";
import { databasePropertyReadOnly, type Database, type DatabaseDataSource, type DatabaseProperty, type DatabasePropertyType, type DatabaseSnapshot, type DatabaseView } from "./database-model";
import { createElement, Table2, Plus, ChevronDown, Type, CircleChevronDown, AlignLeft, SquareCheck, Hash, Calendar, Link, Users, FileText, PanelRight, ListFilter, ArrowDownUp, Search, SlidersHorizontal, Ellipsis, ArrowLeft, X, Check, PanelsTopLeft, type IconNode } from "lucide";
import { DatabasePeek } from "./database-peek";
import { openCalloutIconPicker } from "../../blocks/callout-icon-picker";
import { pageIconElement } from "../../shared/page-icons";
import "./databases.css";
import { externalEntitiesChanged, externalLibrary, resolveExternal } from "../references/external-client";
import { requestPeople } from "../people/people-client";

type Pending = { pageId: string; propertyId: string; value: unknown; baseRevision: string; schemaRevision: string; sourceId: string };
type PresentationDraft = { baseRevision: string; hostRevision?: string; title?: string; icon?: string };
type Hooks = { vaultKey: string; interactionMode?: "desktop" | "touch"; openPage: (id: string) => Promise<unknown>; openDatabase: (id?: string) => Promise<unknown>; changed: (page: Page) => void; createDatabase?: () => Promise<unknown> };
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

export function propertyInput(field: DatabaseProperty, page: Page, value: unknown, commit: (value: unknown) => void): HTMLElement {
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
  document.body.append(dialog); dialog.showModal();
}

export class DatabaseWorkspace {
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
  get dirty() { return this.pending.size > 0 || !!this.saving || !!this.peek?.dirty || !!this.presentation || !!this.presentationSaving; }
  destroy() { this.alive = false; document.removeEventListener(externalEntitiesChanged, this.referencesChanged); this.iconCleanup?.(); this.peek?.destroy(); closeOptions?.(); clearTimeout(this.refreshTimer); window.removeEventListener("pointerup", this.pointerUp); window.removeEventListener("pointercancel", this.pointerUp); }
  private message(text: string) { if (this.alive) { const element = this.host.querySelector(".database-message"); if (element) { element.textContent = text; element.classList.toggle("is-error", !["Saved locally", "Saving changes…", "Unsaved changes"].includes(text)); } } }
  private draftKey() { return `notdown-database-draft:${this.hooks.vaultKey}:${this.snapshot!.database.id}`; }
  private persist() {
    try { if (this.pending.size) sessionStorage.setItem(this.draftKey(), JSON.stringify([...this.pending])); else sessionStorage.removeItem(this.draftKey()); }
    catch { this.message("Browser draft storage is full. Save before leaving this database."); }
  }
  async load(id?: string) {
    if (id) {
      const snapshot = await api<DatabaseSnapshot>(`/databases/${encodeURIComponent(id)}`);
      if (!this.alive) return;
      this.snapshot = snapshot;
      try { const draft = sessionStorage.getItem(`${this.draftKey()}:presentation`); if (draft) this.presentation = JSON.parse(draft); } catch { /* Optional tab draft. */ }
      try { this.activeView = sessionStorage.getItem(`${this.draftKey()}:view`) ?? this.activeView; } catch { /* View selection is optional local state. */ }
      try { const draft = sessionStorage.getItem(this.draftKey()); if (draft) this.pending = new Map(JSON.parse(draft)); } catch { /* Disk remains authoritative. */ }
      this.render();
      if (this.pending.size || this.presentation) this.message("Recovered unsaved edits. Save changes or discard and reload.");
    } else {
      const databases = await api<Database[]>("/databases");
      if (!this.alive) return;
      this.host.innerHTML = `<section class="database-workspace"><header class="database-heading"><div><p class="database-eyebrow">YOUR WORKSPACE</p><h1>Databases</h1><p>Organize Markdown pages with shared properties and saved views.</p></div><button class="primary-button" data-db-new>New database</button></header><div class="database-list">${databases.map(database => `<button data-db-open="${e(database.id)}"><strong>${e(database.title)}</strong><span>${database.dataSourceIds.length} data source${database.dataSourceIds.length === 1 ? "" : "s"} →</span></button>`).join("") || '<div class="database-empty"><h2>A place for your tasks, notes, and collections</h2><p>Create a database, or import one from Notion using the sidebar.</p></div>'}</div></section>`;
      this.host.querySelector("[data-db-new]")!.addEventListener("click", () => this.newDatabase());
      this.host.querySelectorAll<HTMLElement>("[data-db-open]").forEach(button => button.addEventListener("click", () => void this.hooks.openDatabase(button.dataset.dbOpen)));
    }
  }
  private newDatabase() {
    if (this.hooks.createDatabase) { void this.hooks.createDatabase(); return; }
    void api<DatabaseSnapshot>("/databases", { method: "POST", body: JSON.stringify({ title: "New database" }) })
      .then(snapshot => this.hooks.openDatabase(snapshot.database.id))
      .catch(error => this.message(error instanceof Error ? error.message : "Could not create database"));
  }
  private get view() { return this.snapshot!.views.find(view => view.id === this.activeView) ?? this.snapshot!.views[0]; }
  private rememberView(id: string) { this.activeView = id; try { sessionStorage.setItem(`${this.draftKey()}:view`, id); } catch { /* Saved view definitions remain on disk. */ } }
  private get source() { return this.snapshot!.dataSources.find(source => source.id === this.view?.dataSourceId) ?? this.snapshot!.dataSources[0]; }
  private queue(page: Page, field: DatabaseProperty, value: unknown) {
    const key = `${page.id}/${field.id}`, previous = this.pending.get(key);
    this.pending.set(key, { pageId: page.id, propertyId: field.id, value, baseRevision: previous?.baseRevision ?? page.revision, schemaRevision: previous?.schemaRevision ?? this.source.revision, sourceId: this.source.id });
    this.persist(); this.message(this.failed ? "Save failed. Your edits are kept; review the error before retrying." : "Unsaved changes");
  }
  async flush(): Promise<boolean> {
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
  private rows(source: DatabaseDataSource): Page[] {
    let rows = this.snapshot!.pages.filter(page => page.dataSourceId === source.id && !page.trashed);
    if (Array.isArray(this.view?.rowOrder)) { const ranks = new Map((this.view.rowOrder as string[]).map((id, index) => [id, index])); rows.sort((a, b) => (ranks.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (ranks.get(b.id) ?? Number.MAX_SAFE_INTEGER)); }
    if (this.search.trim()) { const query = this.search.trim().toLocaleLowerCase(); rows = rows.filter(page => source.properties.some(field => displayValue(field, field.type === "title" ? page.title : page.properties[field.key]).toLocaleLowerCase().includes(query))); }
    for (const candidate of this.view?.filters ?? []) {
      const filter = candidate as { propertyId?: string; operator?: string; value?: string };
      const field = source.properties.find(field => field.id === filter.propertyId);
      if (field && filter.operator === "contains") rows = rows.filter(page => displayValue(field, field.type === "title" ? page.title : page.properties[field.key]).toLocaleLowerCase().includes(String(filter.value ?? "").toLocaleLowerCase()));
    }
    for (const candidate of [...(this.view?.sorts ?? [])].reverse()) {
      const sort = candidate as { propertyId?: string; direction?: string };
      const field = source.properties.find(field => field.id === sort.propertyId);
      if (field) rows.sort((a, b) => {
        const av = field.type === "title" ? a.title : a.properties[field.key], bv = field.type === "title" ? b.title : b.properties[field.key];
        const order = typeof av === "number" && typeof bv === "number" ? av - bv : displayValue(field, av).localeCompare(displayValue(field, bv), undefined, { numeric: true });
        return sort.direction === "descending" ? -order : order;
      });
    }
    return rows;
  }
  private scheduleRows() {
    this.rowsNeedRefresh = true;
    clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => {
      if (!this.alive || !this.snapshot || this.pointerDown || this.pending.size) return;
      const body = this.host.querySelector("tbody"); if (!body) return;
      this.rowsNeedRefresh = false;
      const rows = this.rows(this.source), visible = new Set(rows.map(page => page.id));
      const elements = new Map(Array.from(body.querySelectorAll<HTMLTableRowElement>("tr[data-page-id]"), row => [row.dataset.pageId!, row]));
      for (const [id, element] of elements) element.hidden = !visible.has(id);
      rows.forEach((page, index) => { const element = elements.get(page.id); if (element && body.children[index] !== element) body.insertBefore(element, body.children[index] ?? null); });
      const count = this.host.querySelector(".database-row-count"); if (count) count.textContent = `${rows.length} ${rows.length === 1 ? "page" : "pages"}`;
    }, 0);
  }
  private render() {
    ++this.opening;
    const scrollTop = this.host.querySelector<HTMLElement>(".database-table-pane")?.scrollTop ?? 0;
    const scrollLeft = this.host.querySelector<HTMLElement>(".database-table-scroll")?.scrollLeft ?? 0;
    const snapshot = this.snapshot!, source = this.source, view = this.view;
    this.peek?.destroy(); this.peek = undefined;
    this.host.innerHTML = `<div class="database-layout"><section class="database-workspace database-table-pane"><button class="database-back" data-db-back aria-label="All databases">${glyph(ArrowLeft)}Databases</button><header class="database-heading"><div class="database-heading-title"><button type="button" class="database-title-icon" data-db-icon aria-label="Change database icon" title="Change database icon"></button><h1 aria-label="${e(snapshot.database.title)}"><input class="database-title-input" aria-label="Database title" value="${e(this.presentation?.title ?? snapshot.database.title)}" maxlength="500" /></h1></div></header><div class="database-toolbar"><div class="database-view-tabs" role="tablist" aria-label="Database views">${snapshot.views.map(item => `<button role="tab" aria-selected="${view?.id === item.id}" data-db-tab="${e(item.id)}">${glyph(Table2)}${e(item.name)}</button>`).join("")}<button class="database-icon-button" data-db-new-view aria-label="New view" title="New view">${glyph(Plus)}</button></div><div class="database-toolbar-actions"><button class="database-icon-button ${view?.filters?.length ? "is-active" : ""}" data-db-filter aria-label="Filter" title="Filter">${glyph(ListFilter)}</button><button class="database-icon-button ${view?.sorts?.length ? "is-active" : ""}" data-db-sort aria-label="Sort" title="Sort">${glyph(ArrowDownUp)}</button><button class="database-icon-button" data-db-search aria-label="Search database" title="Search database" aria-expanded="${this.showSearch}">${glyph(Search)}</button><button class="database-icon-button" data-db-view aria-label="View settings" title="View settings">${glyph(SlidersHorizontal)}</button><div class="database-new-control"><button class="database-new-button" data-db-row aria-label="Add row">New</button><details class="database-new-menu"><summary class="database-new-menu-button" aria-label="New options">${glyph(ChevronDown)}</summary><div class="database-menu"><button data-db-row>New page</button><button data-action="import-notion">Import from Notion</button></div></details></div><details class="database-more-menu"><summary class="database-icon-button" aria-label="Database options">${glyph(Ellipsis)}</summary><div class="database-menu"><button data-db-save>Save changes</button><button data-db-refresh>Discard edits and reload</button></div></details></div></div><div class="database-search" ${this.showSearch ? "" : "hidden"}>${glyph(Search)}<input type="search" aria-label="Search database records" placeholder="Search this database…" value="${e(this.search)}"/><button aria-label="Close database search" class="database-icon-button">${glyph(X)}</button></div><p class="database-message" role="status">Saved locally</p><div class="database-table-scroll"><table class="database-table"><thead><tr></tr></thead><tbody></tbody></table><button class="database-add-row" data-db-row>${glyph(Plus)}New page</button></div><p class="database-row-count"></p></section><aside class="database-peek-mount" hidden></aside></div>`;
    this.host.querySelector("[data-db-back]")!.addEventListener("click", () => void this.hooks.openDatabase());
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
    this.host.querySelectorAll<HTMLElement>("[data-db-tab]").forEach(button => button.addEventListener("click", () => act(() => { this.rememberView(button.dataset.dbTab!); this.render(); })));
    this.host.querySelectorAll("[data-db-row]").forEach(button => button.addEventListener("click", () => act(() => this.addRow())));
    this.host.querySelector("[data-db-view]")!.addEventListener("click", () => act(() => this.editView()));
    this.host.querySelector("[data-db-filter]")!.addEventListener("click", () => act(() => this.editView("Filter")));
    this.host.querySelector("[data-db-sort]")!.addEventListener("click", () => act(() => this.editView("Sort")));
    this.host.querySelector("[data-db-new-view]")!.addEventListener("click", () => act(() => this.newView()));
    const searchHost = this.host.querySelector<HTMLElement>(".database-search")!, searchInput = searchHost.querySelector<HTMLInputElement>("input")!;
    this.host.querySelector("[data-db-search]")!.addEventListener("click", () => { this.showSearch = !this.showSearch; searchHost.hidden = !this.showSearch; if (this.showSearch) searchInput.focus(); });
    searchInput.addEventListener("input", () => { this.search = searchInput.value; this.scheduleRows(); });
    searchHost.querySelector("button")!.addEventListener("click", () => { this.showSearch = false; this.search = ""; searchInput.value = ""; searchHost.hidden = true; this.scheduleRows(); });
    if (!source) { this.message("This database has no available data source."); this.host.querySelectorAll<HTMLButtonElement>("[data-db-row],[data-db-new-view],[data-db-view],[data-db-filter],[data-db-sort]").forEach(button => button.disabled = true); return; }
    const fields = databaseViewProperties(source, view, snapshot.database);
    const heading = this.host.querySelector("thead tr")!;
    for (const field of fields) {
      const th = document.createElement("th"), button = document.createElement("button"); th.dataset.type = field.type; th.setAttribute("aria-label", field.name); button.innerHTML = `${typeIcon(field.type)}<span>${e(field.name)}</span>`; button.title = `Edit ${field.name} property`; button.setAttribute("aria-label", `Edit ${field.name} property`);
      button.addEventListener("click", () => act(() => this.editProperty(field))); th.append(button); heading.append(th);
    }
    const addColumn = document.createElement("th"); addColumn.className = "database-add-column"; addColumn.innerHTML = `<button class="database-icon-button" aria-label="Add property" title="Add property">${glyph(Plus)}</button>`; addColumn.querySelector("button")!.addEventListener("click", () => act(() => this.editProperty())); heading.append(addColumn);
    const body = this.host.querySelector("tbody")!, rows = this.snapshot!.pages.filter(page => page.dataSourceId === source.id && !page.trashed), visible = new Set(this.rows(source).map(page => page.id));
    for (const page of rows) {
      const tr = document.createElement("tr"); tr.dataset.pageId = page.id; tr.hidden = !visible.has(page.id);
      for (const field of fields) {
        const td = document.createElement("td"), pending = this.pending.get(`${page.id}/${field.id}`);
        td.dataset.type = field.type; td.dataset.propertyId = field.id;
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
    const cell = propertyInput(field, page, value, value => this.queue(page, field, value));
    cell.addEventListener("change", () => void this.flush());
    cell.addEventListener("keydown", event => { if (event.key === "Enter" && event.target instanceof HTMLInputElement) { event.preventDefault(); void this.flush(); } });
    if (field.type === "title") {
      const pageIcon = document.createElement("span"); pageIcon.className = "database-page-icon"; pageIcon.innerHTML = glyph(FileText); cell.prepend(pageIcon);
      const open = document.createElement("button"); open.className = "database-open-page"; open.innerHTML = `${glyph(PanelRight)}<span>OPEN</span>`; open.setAttribute("aria-label", `Open ${page.title}`);
      open.addEventListener("click", () => void this.openPeek(page.id)); cell.append(open);
    }
    return cell;
  }
  private updatePeekRow(page: Page) {
    const row = this.host.querySelector<HTMLTableRowElement>(`tr[data-page-id="${CSS.escape(page.id)}"]`);
    if (!row) return;
    for (const td of row.querySelectorAll<HTMLElement>("td[data-property-id]")) {
      const field = this.source.properties.find(field => field.id === td.dataset.propertyId); if (!field) continue;
      td.replaceChildren(this.recordCell(page, field, field.type === "title" ? page.title : page.properties[field.key]));
      td.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>("input,select,.database-select-control").forEach(control => control.disabled = true);
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
    const generation = ++this.opening;
    if (!(await this.flush()) || generation !== this.opening) return;
    if (this.hooks.interactionMode === "touch") { await this.hooks.openPage(id); return; }
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
      mount.hidden = false; this.host.querySelector(".database-layout")!.classList.add("database-peek-open");
      this.host.querySelectorAll<HTMLElement>("tr[data-page-id]").forEach(row => row.classList.toggle("database-row-selected", row.dataset.pageId === id));
      this.host.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>(".database-table input,.database-table select,.database-table .database-select-control").forEach(input => input.disabled = true);
    } catch (error) { this.message(error instanceof Error ? error.message : "Could not open this record"); }
  }
  private addRow() {
    const source = this.source;
    formDialog("Add row", '<label>Row title<input name="title" required maxlength="500" autofocus /></label><footer><button type="button" data-cancel>Cancel</button><button type="submit" class="primary-button">Create row</button></footer>', async form => {
      const saved = await api<Page>(`/data-sources/${source.id}/records`, { method: "POST", body: JSON.stringify({ title: form.get("title"), baseRevision: source.revision }) });
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
  private editProperty(field?: DatabaseProperty, reopenPageId?: string) {
    const source = this.source, canChangeType = !field;
    const options = field?.options ?? [];
    formDialog(field ? "Edit property" : "Add property", `<label>Property name<input name="name" value="${e(field?.name ?? "")}" required maxlength="200" autofocus /></label><label>Property type<select name="type" ${canChangeType ? "" : "disabled"}>${[...(field && !editableTypes.includes(field.type) ? [field.type] : []), ...editableTypes].map(type => `<option value="${type}" ${field?.type === type ? "selected" : ""}>${e(typeLabels[type] ?? type)}</option>`).join("")}</select></label><label>Options (one per line)<textarea name="options" rows="5" placeholder="To do&#10;In progress&#10;Done">${e(options.map(option => option.name).join("\n"))}</textarea></label>${options.map((option, index) => `<label>Color for ${e(option.name)}<select name="color-${index}">${optionColors.map(color => `<option value="${color}" ${color === (option.color ?? "gray") ? "selected" : ""}>${color}</option>`).join("")}</select></label>`).join("")}<p class="database-hint">Options apply to Select, Multi-select and Status. Existing lines rename options without changing their identities; append new names below.</p><footer><button type="button" data-cancel>Cancel</button><button class="primary-button" type="submit">Save property</button></footer>`, async form => {
      const id = field?.id ?? crypto.randomUUID(), type = field?.type ?? String(form.get("type")) as DatabasePropertyType;
      const names = String(form.get("options") ?? "").split(/\r?\n/).map(name => name.trim()).filter(Boolean);
      if (new Set(names).size !== names.length) throw new Error("Option names must be unique");
      if (names.length < options.length) throw new Error("Keep existing options so saved values remain recoverable");
      const property: DatabaseProperty = { ...field, id, name: String(form.get("name")).trim(), key: field?.key ?? id, type };
      if (["select", "multi_select", "status"].includes(type)) property.options = names.map((name, index) => ({ ...options[index], id: options[index]?.id ?? crypto.randomUUID(), name, color: String(form.get(`color-${index}`) ?? options[index]?.color ?? ["green", "blue", "yellow", "red", "brown"][index % 5]) }));
      const properties = field ? source.properties.map(item => item.id === field.id ? property : item) : [...source.properties, property];
      const saved = await api<DatabaseDataSource>(`/data-sources/${source.id}`, { method: "PUT", body: JSON.stringify({ baseRevision: source.revision, properties }) });
      this.snapshot!.dataSources = this.snapshot!.dataSources.map(item => item.id === saved.id ? saved : item);
      const view = this.view;
      if (!field && view?.propertyIds) {
        try {
          const updated = await api<DatabaseView>(`/database-views/${view.id}`, { method: "PUT", body: JSON.stringify({ baseRevision: view.revision, propertyIds: [...view.propertyIds, property.id] }) });
          this.snapshot!.views = this.snapshot!.views.map(item => item.id === updated.id ? updated : item);
        } catch (error) {
          this.render(); this.message(`Property created. Its column could not be shown: ${error instanceof Error ? error.message : "view changed"}. Reload and select it in View settings.`); return;
        }
      }
      this.render();
      if (reopenPageId) await this.openPeek(reopenPageId);
    });
  }
  private editView(title = "View settings") {
    const view = this.view;
    if (!view) return;
    const ordered = databaseViewProperties(this.source, view, this.snapshot!.database);
    const fields = [...ordered, ...this.source.properties.filter(field => !ordered.some(visible => visible.id === field.id))];
    const sort = view.sorts?.[0] as { propertyId?: string; direction?: string } | undefined;
    const filter = view.filters?.[0] as { propertyId?: string; value?: string } | undefined;
    const options = (selected?: string) => `<option value="">None</option>${fields.map(field => `<option value="${e(field.id)}" ${field.id === selected ? "selected" : ""}>${e(field.name)}</option>`).join("")}`;
    formDialog(title, `<label>View name<input name="name" value="${e(view.name)}" required /></label><label>Sort by<select name="sort">${options(sort?.propertyId)}</select></label><label>Direction<select name="direction"><option value="ascending">Ascending</option><option value="descending" ${sort?.direction === "descending" ? "selected" : ""}>Descending</option></select></label><label>Filter property<select name="filter">${options(filter?.propertyId)}</select></label><label>Contains<input name="contains" value="${e(filter?.value ?? "")}" /></label><fieldset><legend>Visible properties</legend>${fields.map(field => `<label class="database-check"><input type="checkbox" name="visible" value="${e(field.id)}" ${!view.propertyIds || view.propertyIds.includes(field.id) || field.type === "title" ? "checked" : ""} ${field.type === "title" ? "disabled" : ""} />${e(field.name)}</label>`).join("")}</fieldset><footer><button type="button" data-cancel>Cancel</button><button class="primary-button" type="submit">Save view</button></footer>`, async form => {
      const visible = new Set(form.getAll("visible"));
      const saved = await api<DatabaseView>(`/database-views/${view.id}`, { method: "PUT", body: JSON.stringify({ baseRevision: view.revision, name: form.get("name"), propertyIds: fields.filter(field => field.type === "title" || visible.has(field.id)).map(field => field.id), sorts: form.get("sort") ? [{ propertyId: form.get("sort"), direction: form.get("direction") }] : [], filters: form.get("filter") ? [{ propertyId: form.get("filter"), operator: "contains", value: form.get("contains") }] : [] }) });
      this.snapshot!.views = this.snapshot!.views.map(item => item.id === saved.id ? saved : item); this.render();
    });
  }
  private newView() {
    const snapshot = this.snapshot!;
    formDialog("New view", `<label>View name<input name="name" required value="Table" /></label><label>Data source<select name="dataSourceId">${snapshot.dataSources.map(source => `<option value="${e(source.id)}">${e(source.title)}</option>`).join("")}</select></label><footer><button type="button" data-cancel>Cancel</button><button class="primary-button" type="submit">Create view</button></footer>`, async form => {
      const next = await api<DatabaseSnapshot>(`/databases/${snapshot.database.id}/views`, { method: "POST", body: JSON.stringify({ baseRevision: snapshot.database.revision, name: form.get("name"), dataSourceId: form.get("dataSourceId"), type: "table" }) });
      this.rememberView(next.database.viewIds.find(id => !snapshot.database.viewIds.includes(id)) ?? "");
      this.snapshot = next; this.render();
    });
  }
}
