import { api, escape as e, type Page } from "../../shared/types";
import { MarkdownWorkspace, type EditMode } from "../../markdown-engine/workspace";
import { defaultSyntax, syntaxFormat, type SyntaxConfig } from "../../markdown-engine/config";
import { documentMetadata } from "../metadata/document-metadata";
import { documentPageTitle } from "../metadata/pandoc-page-title";
import type { DatabaseDataSource, DatabaseProperty } from "./database-model";
import { createElement, ChevronsRight, Maximize2, Save, SquareCheck, CircleChevronDown, Hash, Calendar, AlignLeft, Plus } from "lucide";
import "./database-peek.css";

type Options = {
  vaultKey: string;
  pages: () => Page[];
  changed: (page: Page) => void;
  openFull: (id: string) => Promise<unknown>;
  closed: () => void;
  addProperty?: () => Promise<void>;
  propertyInput: (field: DatabaseProperty, page: Page, value: unknown, commit: (value: unknown) => void) => HTMLElement;
};
const glyph = (icon: typeof Save) => createElement(icon, { width: 18, height: 18, "stroke-width": 1.6, "aria-hidden": "true" }).outerHTML;
const propertyGlyph = (type: string) => glyph(type === "checkbox" ? SquareCheck : ["select", "multi_select", "status"].includes(type) ? CircleChevronDown : type === "number" ? Hash : type === "date" ? Calendar : AlignLeft);

/** An isolated page editor. Its revision and draft always belong to the opened row. */
export class DatabasePeek {
  private page?: Page;
  private source?: DatabaseDataSource;
  private schemaRevision = "";
  private workspace?: MarkdownWorkspace;
  private changed = false;
  private version = 0;
  private saving?: Promise<boolean>;
  private failed = false;
  private alive = true;
  private opening = 0;
  private saveTimer?: ReturnType<typeof setTimeout>;
  private mode: EditMode = "document";
  private metadataSignature = "";
  constructor(private host: HTMLElement, private options: Options) {
    host.addEventListener("keydown", this.keydown);
  }
  get pageId() { return this.page?.id; }
  get dirty() { this.capture(); return this.changed || !!this.saving || !!this.workspace?.blocks.databaseViewsDirty; }
  private key(id: string) { return `notdown-database-peek:${this.options.vaultKey}:${id}`; }
  private message(text: string, error = false) {
    if (!this.alive) return;
    const status = this.host.querySelector<HTMLElement>(".database-peek-status");
    if (status) { status.textContent = text; status.classList.toggle("is-error", error); }
  }
  private persist() {
    if (!this.page) return;
    try {
      if (this.changed) sessionStorage.setItem(this.key(this.page.id), JSON.stringify({ page: this.page, schemaRevision: this.schemaRevision }));
      else sessionStorage.removeItem(this.key(this.page.id));
    } catch { this.message("Draft storage is full. Save before closing this record.", true); }
  }
  private markDirty() {
    if (!this.alive || !this.page) return;
    this.changed = true; this.version++; this.persist();
    clearTimeout(this.saveTimer);
    if (!this.failed) {
      this.message("Unsaved changes");
      this.saveTimer = setTimeout(() => void this.flush(), 750);
    }
  }
  private acceptBody(body: string, config: SyntaxConfig) {
    if (!this.page || !this.alive) return;
    if (this.page.body === body && JSON.stringify(this.page.syntax ?? defaultSyntax(this.page.bodyFormat)) === JSON.stringify(config)) return;
    this.page.body = body; this.page.syntax = config; this.page.bodyFormat = syntaxFormat(config);
    const title = documentPageTitle(body, config);
    if (title !== undefined) this.page.title = title;
    this.markDirty();
    this.refreshMetadata();
  }
  private capture() {
    if (!this.workspace || !this.page) return;
    const snapshot = this.workspace.capture();
    this.acceptBody(snapshot.source, snapshot.config);
  }
  async open(page: Page, source: DatabaseDataSource): Promise<boolean> {
    const generation = ++this.opening;
    if (!(await this.flush()) || !this.alive || generation !== this.opening) return false;
    let fresh: Page;
    try { fresh = await api<Page>(`/pages/${encodeURIComponent(page.id)}`); }
    catch (error) { this.message(error instanceof Error ? error.message : "Could not open this record.", true); return false; }
    if (!this.alive || generation !== this.opening || !(await this.flush()) || generation !== this.opening) return false;
    this.workspace?.destroy(); this.workspace = undefined;
    this.page = structuredClone(fresh); this.source = structuredClone(source); this.schemaRevision = source.revision;
    this.changed = false; this.failed = false; this.version = 0; this.metadataSignature = "";
    let recovered = false;
    try {
      const raw = sessionStorage.getItem(this.key(page.id));
      if (raw) {
        const draft = JSON.parse(raw);
        if (draft.page?.id === fresh.id && typeof draft.page.body === "string" && typeof draft.page.revision === "string" && typeof draft.schemaRevision === "string") {
          this.page = draft.page; this.schemaRevision = draft.schemaRevision; this.changed = true; recovered = true;
        }
      }
    } catch { /* The durable page remains available if optional draft storage fails. */ }
    this.render();
    if (recovered) this.message("Recovered unsaved edits. Save to check for conflicts.");
    return true;
  }
  async flush(): Promise<boolean> {
    if (this.workspace && !(await this.workspace.blocks.flushDatabaseViews())) return false;
    this.capture(); clearTimeout(this.saveTimer);
    if (this.saving) return this.saving;
    if (this.failed) return false;
    if (!this.changed || !this.page) return true;
    this.saving = Promise.resolve().then(async () => {
      try {
        while (this.changed && this.page) {
          await this.workspace?.blocks.flushSyncedBlocks();
          this.capture(); clearTimeout(this.saveTimer);
          const submitted = structuredClone(this.page), version = this.version;
          this.message("Saving…");
          const saved = await api<Page>(`/pages/${encodeURIComponent(submitted.id)}`, {
            method: "PUT", body: JSON.stringify({ ...submitted, baseRevision: submitted.revision, schemaRevision: this.schemaRevision }),
          });
          this.capture();
          // A response advances only this editor's accepted write; newer local input stays intact.
          this.page.revision = saved.revision; this.page.updated = saved.updated;
          if (version === this.version) { Object.assign(this.page, saved); this.changed = false; }
          this.persist(); this.options.changed(saved);
        }
        this.refreshMetadata(); this.message("Saved locally");
        const discard = this.host.querySelector<HTMLButtonElement>(".database-peek-discard"); if (discard) discard.hidden = true;
        return true;
      } catch (error) {
        this.failed = true; this.persist();
        this.message(`${error instanceof Error ? error.message : "Save failed"} Your draft is preserved in this tab.`, true);
        const discard = this.host.querySelector<HTMLButtonElement>(".database-peek-discard"); if (discard) discard.hidden = false;
        return false;
      } finally { this.saving = undefined; }
    });
    return this.saving;
  }
  destroy() {
    this.capture(); this.persist(); this.alive = false; ++this.opening;
    clearTimeout(this.saveTimer); this.host.removeEventListener("keydown", this.keydown);
    this.workspace?.destroy(); this.workspace = undefined;
    this.host.replaceChildren();
  }
  private keydown = (event: KeyboardEvent) => {
    if (event.defaultPrevented) return;
    if (event.key === "Escape" && this.host.querySelector(".database-peek-insert")) {
      event.preventDefault(); event.stopPropagation(); this.host.querySelector(".database-peek-insert")?.remove(); this.workspace?.blocks.focus(); return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault(); event.stopPropagation(); this.failed = false; void this.flush();
    }
    if (event.key === "Escape" && !event.isComposing && !document.querySelector("dialog[open]")) {
      event.preventDefault(); event.stopPropagation(); void this.close();
    }
  };
  private async close() { if (await this.flush()) this.options.closed(); }
  private async full(id = this.page?.id) { if (id && await this.flush()) await this.options.openFull(id); }
  private async discardAndReload() {
    if (!this.page || !this.source || this.saving) return;
    const pageId = this.page.id, generation = ++this.opening;
    // Only this explicit action replaces the retained revision and draft. Read
    // both durable snapshots successfully before discarding anything local.
    this.host.inert = true; this.message("Loading the saved record…");
    try {
      const page = await api<Page>(`/pages/${encodeURIComponent(pageId)}`);
      const source = await api<DatabaseDataSource>(`/data-sources/${encodeURIComponent(page.dataSourceId ?? this.source.id)}`);
      if (!this.alive || generation !== this.opening) return;
      this.workspace?.destroy(); this.workspace = undefined;
      clearTimeout(this.saveTimer);
      this.page = page; this.source = source; this.schemaRevision = source.revision;
      this.changed = false; this.failed = false; this.version = 0; this.metadataSignature = "";
      this.persist(); this.render(); this.options.changed(page);
      this.message("Loaded the saved record.");
    } catch (error) {
      this.message(`${error instanceof Error ? error.message : "Reload failed"} Your draft is still preserved.`, true);
    } finally { this.host.inert = false; }
  }
  private render() {
    const page = this.page!;
    this.host.innerHTML = `<aside class="database-peek" role="region" aria-label="Record peek"><header class="database-peek-header"><div class="database-peek-navigation"><button type="button" aria-label="Close record" title="Close record">${glyph(ChevronsRight)}</button><button type="button" aria-label="Open as full page" title="Open as full page">${glyph(Maximize2)}</button></div><span class="database-peek-status" role="status">Saved locally</span><button type="button" aria-label="Save record" title="Save record">${glyph(Save)}</button></header><button class="database-peek-discard" type="button" hidden>Discard draft and reload</button><div class="database-peek-scroll"><article class="database-peek-content"><textarea class="database-peek-title" aria-label="Record title" rows="1" placeholder="Untitled">${e(page.title)}</textarea><div class="database-peek-properties"></div><div class="database-peek-editor"></div></article></div></aside>`;
    this.host.querySelector("[aria-label='Close record']")!.addEventListener("click", () => void this.close());
    this.host.querySelector("[aria-label='Open as full page']")!.addEventListener("click", () => void this.full());
    this.host.querySelector("[aria-label='Save record']")!.addEventListener("click", () => { this.failed = false; void this.flush(); });
    this.host.querySelector(".database-peek-discard")!.addEventListener("click", () => void this.discardAndReload());
    const title = this.host.querySelector<HTMLTextAreaElement>(".database-peek-title")!;
    title.addEventListener("input", () => { if (this.page) { this.page.title = title.value; this.resizeTitle(); this.markDirty(); } });
    title.addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); this.workspace?.blocks.focus(); } });
    const root = this.host.querySelector<HTMLElement>(".database-peek-editor")!;
    this.workspace = new MarkdownWorkspace(root, {
      source: page.body, config: page.syntax ?? defaultSyntax(page.bodyFormat), mode: this.mode,
      pages: () => this.options.pages().map(item => item.id === this.page?.id ? this.page : item), currentPage: () => this.page,
      onSavePage: () => this.flush(), onChange: (body, config) => this.acceptBody(body, config),
      onMode: mode => { this.mode = mode; }, onError: error => this.message(error instanceof Error ? error.message : String(error), true),
      onOpenPage: id => void this.full(id),
      onCreatePage: async (title, parent) => {
        if (!(await this.flush())) return null;
        const created = await api<Page>("/pages", { method: "POST", body: JSON.stringify({ title, parent, body: "", properties: {} }) });
        this.options.changed(created); return created;
      },
      onInsert: () => this.insertMenu(),
    });
    this.refreshMetadata(true); this.resizeTitle();
  }
  private resizeTitle() {
    const title = this.host.querySelector<HTMLTextAreaElement>(".database-peek-title");
    if (title) { title.style.height = "auto"; title.style.height = `${Math.max(48, title.scrollHeight)}px`; }
  }
  private refreshMetadata(force = false) {
    if (!this.page || !this.source) return;
    let values: Record<string, unknown> = {};
    try { values = documentMetadata(this.page.body).values; } catch { return; }
    const signature = JSON.stringify(values);
    const title = this.host.querySelector<HTMLTextAreaElement>(".database-peek-title");
    if (title) {
      title.readOnly = Object.prototype.hasOwnProperty.call(values, "title");
      title.title = title.readOnly ? "Defined in document metadata — edit in source" : "";
      if (title.readOnly) { title.value = this.page.title; this.resizeTitle(); }
    }
    if (!force && signature === this.metadataSignature) return;
    this.metadataSignature = signature;
    const host = this.host.querySelector(".database-peek-properties"); if (!host) return;
    host.replaceChildren();
    const nested = values.properties && typeof values.properties === "object" ? values.properties as Record<string, unknown> : {};
    for (const field of this.source.properties.filter(field => field.type !== "title").sort((left, right) => left.name.localeCompare(right.name))) {
      const row = document.createElement("div"); row.className = "database-peek-property";
      const label = document.createElement("span"); label.className = "database-peek-property-name";
      label.innerHTML = propertyGlyph(field.type) + `<span>${e(field.name)}</span>`;
      const value = Object.prototype.hasOwnProperty.call(nested, field.key) ? nested[field.key] : Object.prototype.hasOwnProperty.call(values, field.key) ? values[field.key] : this.page.properties[field.key];
      const cell = this.options.propertyInput(field, this.page, value, value => {
        if (!this.page) return;
        this.page.properties[field.key] = value; this.markDirty();
      });
      cell.addEventListener("change", () => void this.flush());
      row.append(label, cell); host.append(row);
    }
    if (this.options.addProperty) {
      const add = document.createElement("button"); add.type = "button"; add.className = "database-peek-add-property";
      add.innerHTML = glyph(Plus) + "<span>Add a property</span>";
      add.addEventListener("click", () => {
        void this.flush().then(async ok => { if (ok) await this.options.addProperty?.(); }).catch(error => this.message(error instanceof Error ? error.message : String(error), true));
      });
      host.append(add);
    }
  }
  private insertMenu() {
    if (!this.workspace) return;
    const root = this.host.querySelector(".database-peek-content"); if (!root) return;
    root.querySelector(".database-peek-insert")?.remove();
    const menu = document.createElement("div"); menu.className = "database-peek-insert"; menu.setAttribute("role", "menu");
    const choices = [["text", "Text"], ["heading1", "Heading"], ["task", "To-do list"], ["list", "Bulleted list"], ["quote", "Quote"], ["code", "Code"]] as const;
    for (const [type, label] of choices) {
      const button = document.createElement("button"); button.type = "button"; button.textContent = label; button.setAttribute("role", "menuitem");
      button.addEventListener("click", () => { menu.remove(); this.workspace?.blocks.insertBlockType(type); }); menu.append(button);
    }
    root.append(menu); menu.querySelector("button")?.focus();
  }
}
