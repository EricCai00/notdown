import type { Node as PMNode } from "prosemirror-model";
import type { EditorView, NodeView } from "prosemirror-view";
import { api, type Page } from "../shared/types";
import type { BreadcrumbPage } from "./breadcrumb-view";
import type { DatabaseWorkspace } from "../features/databases/database-workspace";
import { databaseHostId } from "../features/databases/database-reference";
import { safeReference } from "../document/notion-syntax";
import { editorKind } from "../document/node-identity";
import { pageReferenceContent } from "../shared/page-reference-content";
import "./database-view.css";
import { externalEntitiesChanged } from "../features/references/external-client";

const active = new WeakMap<EditorView, Set<DatabaseBlockView>>();
const vaultPaths = new WeakMap<EditorView, Promise<string>>();
export async function flushDatabaseViews(view: EditorView): Promise<boolean> {
  for (const block of active.get(view) ?? []) if (!(await block.flush())) return false;
  return true;
}
export function databaseViewsDirty(view: EditorView): boolean {
  return [...(active.get(view) ?? [])].some(block => block.dirty);
}

/** A reference-only atom: inline cells edit page resources through their normal CAS API. */
export class DatabaseBlockView implements NodeView {
  dom = document.createElement("section");
  private link = document.createElement("a");
  private mount = document.createElement("div");
  private status = document.createElement("p");
  private workspace?: DatabaseWorkspace;
  private disposed = false;
  private epoch = 0;
  private databaseId?: string;
  private hostPage?: Page;
  private presentationVersion = 0;
  private events = new AbortController();
  constructor(private node: PMNode, private view: EditorView, private getPos: () => number | undefined,
    private pages: () => BreadcrumbPage[], private currentPage?: () => BreadcrumbPage | undefined,
    private onOpenPage?: (id: string) => void, private savePage?: () => Promise<boolean>, private interactionMode?: "desktop" | "touch") {
    this.dom.contentEditable = "false";
    this.link.className = "pm-database-reference pm-notion-database child-page-node child-page";
    this.mount.className = "pm-inline-database-mount";
    this.status.className = "pm-database-reference-status"; this.status.setAttribute("role", "status");
    this.dom.append(this.link, this.status, this.mount);
    this.link.addEventListener("click", event => {
      if (!this.databaseId || !this.link.hasAttribute("href")) return;
      event.preventDefault(); event.stopPropagation(); void this.openDatabase(this.databaseId);
    });
    this.dom.addEventListener("pointerdown", event => {
      if (!this.view.editable && this.mount.contains(event.target as Node)) { event.preventDefault(); event.stopPropagation(); }
    }, { capture: true, signal: this.events.signal });
    const refresh = (event: Event) => {
      const detail = (event as CustomEvent).detail, host = detail?.hostPage ?? detail;
      if (!host || host.id !== databaseHostId(this.node.attrs.url) || typeof host.title !== "string") return;
      this.presentationVersion++; this.hostPage = host; this.databaseId = host.databaseId ?? this.databaseId;
      // Update only the reference row, keeping pending inline/peek DOM intact.
      this.renderReference();
    };
    document.addEventListener("notdown-database-updated", refresh, { signal: this.events.signal });
    document.addEventListener("notdown-database-record-saved", refresh, { signal: this.events.signal });
    document.addEventListener(externalEntitiesChanged, () => {
      const target = databaseHostId(this.node.attrs.url);
      if (this.workspace && this.hostPage?.id !== target) {
        if (this.workspace.dirty) {
          this.link.replaceChildren(...pageReferenceContent("Unknown database", "table-2"));
          this.link.setAttribute("aria-label", "Unknown database");
          this.link.removeAttribute("href"); this.link.setAttribute("aria-disabled", "true"); this.link.tabIndex = -1;
          this.link.classList.add("external-unresolved");
          this.status.textContent = "This reference changed. Finish saving the table, then reopen this note to load its current target.";
          return;
        }
        this.workspace.destroy(); this.workspace = undefined;
        this.mount.replaceChildren(); this.hostPage = undefined; this.databaseId = undefined; this.status.textContent = "";
      }
      this.renderReference();
      if (!this.workspace) void this.load();
    }, { signal: this.events.signal });
    const views = active.get(view) ?? new Set(); views.add(this); active.set(view, views);
    this.renderReference();
    void this.load();
  }
  get dirty() { return this.workspace?.dirty ?? false; }
  async flush() { return this.workspace ? this.workspace.flush() : true; }
  private renderReference() {
    const local = databaseHostId(this.node.attrs.url), inline = !!local && this.node.attrs.inline === true;
    this.dom.className = `pm-content-object pm-object-database${inline ? " pm-inline-database" : ""}`;
    this.dom.setAttribute("role", "region"); this.dom.setAttribute("aria-label", inline ? "Inline database" : "Database reference");
    const known = this.hostPage?.id === local ? this.hostPage : this.pages().find(page => page.id === local);
    const label = known ? this.node.attrs.label || known.title : "Unknown database";
    this.link.replaceChildren(...pageReferenceContent(label, known?.icon ?? this.node.attrs.icon ?? "table-2"));
    this.link.setAttribute("aria-label", label);
    const href = !known ? "" : this.databaseId ? `#database/${encodeURIComponent(this.databaseId)}` : safeReference(local ? `#page/${local}` : "");
    this.link.classList.toggle("external-unresolved", !known);
    if (!known) { this.link.setAttribute("aria-disabled", "true"); this.link.tabIndex = -1; }
    else { this.link.removeAttribute("aria-disabled"); this.link.removeAttribute("tabindex"); }
    if (href && /^(?:https?:\/\/|#page\/|#database\/)/i.test(href)) this.link.setAttribute("href", href); else this.link.removeAttribute("href");
    if (/^https?:\/\//i.test(href)) { this.link.target = "_blank"; this.link.rel = "noopener noreferrer"; }
    else { this.link.removeAttribute("target"); this.link.removeAttribute("rel"); }
    this.link.title = inline ? "Open database as a full page" : "Open database";
    this.mount.hidden = !inline;
  }
  private draftScope(vaultPath: string, hostId: string) {
    // Occurrence, not source offset: prose edits must not change the draft key.
    const position = this.getPos() ?? 0; let occurrence = 0;
    this.view.state.doc.descendants((node, pos) => {
      if (pos < position && editorKind(node) === "database" && databaseHostId(node.attrs.url) === hostId) occurrence++;
    });
    return `${vaultPath}:inline:${this.currentPage?.()?.id ?? "preview"}:${hostId}:${occurrence}`;
  }
  private async load() {
    const hostId = databaseHostId(this.node.attrs.url), epoch = ++this.epoch, presentationVersion = this.presentationVersion;
    if (!hostId) return;
    this.status.textContent = "Loading database…";
    try {
      const host = await api<Page>(`/pages/${encodeURIComponent(hostId)}`);
      if (this.disposed || epoch !== this.epoch) return;
      if (presentationVersion === this.presentationVersion) this.hostPage = host;
      const resolved = this.hostPage ?? host;
      if (!resolved.databaseId) { this.status.textContent = "This page has no database. Open the page to inspect its contents."; return; }
      this.databaseId = resolved.databaseId; this.renderReference();
      if (!this.node.attrs.inline) { this.status.textContent = ""; return; }
      if (!vaultPaths.has(this.view)) vaultPaths.set(this.view, api<{ vaultPath: string }>("/status").then(status => status.vaultPath));
      const [{ DatabaseWorkspace }, vaultPath] = await Promise.all([import("../features/databases/database-workspace"), vaultPaths.get(this.view)!]);
      if (this.disposed || epoch !== this.epoch) return;
      const workspace = new DatabaseWorkspace(this.mount, {
        inline: true,
        interactionMode: this.interactionMode,
        vaultKey: this.draftScope(vaultPath, hostId),
        initialSourceUrl: typeof this.node.attrs.dataSourceUrl === "string" ? this.node.attrs.dataSourceUrl : undefined,
        openPage: id => this.openPage(id), openDatabase: id => this.openDatabase(id),
        changed: saved => {
          // The supplied page list can contain the outer editor's live draft.
          // Let the app update its separate list cache without touching that draft.
          document.dispatchEvent(new CustomEvent("notdown-database-record-saved", { detail: saved }));
        },
      });
      this.workspace = workspace;
      await workspace.load(resolved.databaseId);
      if (this.disposed || epoch !== this.epoch) { workspace.destroy(); return; }
      this.status.textContent = "";
    } catch (error) {
      if (!this.disposed && epoch === this.epoch) this.status.textContent = `${error instanceof Error ? error.message : "Database unavailable"} The original reference is preserved.`;
    }
  }
  private async beforeNavigation() {
    if (!(await this.flush())) return false;
    return this.savePage ? this.savePage() : true;
  }
  private async openPage(id: string) {
    if (!(await this.beforeNavigation())) return false;
    if (this.onOpenPage) this.onOpenPage(id); else location.hash = `#page/${encodeURIComponent(id)}`;
    return true;
  }
  private async openDatabase(id?: string) {
    if (!(await this.beforeNavigation())) return false;
    location.hash = id ? `#database/${encodeURIComponent(id)}` : "#databases";
    return true;
  }
  update(node: PMNode) {
    if (node.type !== this.node.type || node.attrs.url !== this.node.attrs.url || node.attrs.inline !== this.node.attrs.inline || node.attrs.dataSourceUrl !== this.node.attrs.dataSourceUrl) return false;
    this.node = node; this.renderReference(); return true;
  }
  stopEvent() { return true; }
  ignoreMutation() { return true; }
  destroy() {
    this.disposed = true; ++this.epoch; this.events.abort();
    const workspace = this.workspace;
    const cleanup = () => { workspace?.destroy(); active.get(this.view)?.delete(this); };
    // Node deletion is synchronous. Finish a pending CAS write, or preserve its
    // browser draft on failure; normal page navigation awaits flush explicitly.
    if (workspace?.dirty) void workspace.flush().finally(cleanup); else cleanup();
  }
}
