import type { Node as PMNode } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import { closeHistory } from "prosemirror-history";
import type { EditorView, NodeView } from "prosemirror-view";
import { createElement, ArrowDownLeft, ChevronDown, CircleHelp, Copy, Ellipsis, type IconNode } from "lucide";
import { api, type Page } from "../shared/types";
import { pageIconElement } from "../shared/page-icons";
import { placeDatePanel } from "../features/dates/date-view";
import { showEditorPanel } from "../editor/editor-panel";
import type { BreadcrumbPage } from "./breadcrumb-view";
import { editorSchema as schema } from "../document/editor-schema";
import { parseNative, serializeNative } from "../markdown-engine/codec";
import { defaultSyntax } from "../markdown-engine/config";
import { findSyncedSource, findSyncedSourceInDoc, syncedSource } from "./synced-source";
import { syncContent, syncKey, syncedNodes, unsyncTransaction } from "./synced-editing";
import "./synced-block.css";

const icon = (value: IconNode) => createElement(value, { width: 16, height: 16, "stroke-width": 1.7, "aria-hidden": "true" });
function button(label: string, action: () => void, glyph?: IconNode) {
  const element = document.createElement("button"); element.type = "button";
  element.setAttribute("aria-label", label); element.title = label;
  if (glyph) element.append(icon(glyph)); else element.textContent = label;
  element.onclick = action; return element;
}
async function hash(node: PMNode) {
  const value = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(syncContent(node)));
  return [...new Uint8Array(value)].map(n => n.toString(16).padStart(2, "0")).join("");
}
// One read per editor/interval, even when a document contains many synced blocks.
const pageLists = new WeakMap<EditorView, { until: number; value: Promise<Page[]> }>();
const activeViews = new WeakMap<EditorView, Set<SyncedBlockView>>();
export async function flushSyncedBlocks(view: EditorView) {
  // Sequentially flush sources so two references to the same page do not race.
  for (const block of activeViews.get(view) || []) await block.flush();
}
function allPages(view: EditorView, fresh = false) {
  const cached = pageLists.get(view);
  if (!fresh && cached && cached.until > Date.now()) return cached.value;
  const value = api<Page[]>("/pages"); pageLists.set(view, { until: Date.now() + 2000, value });
  return value;
}

/** Local Markdown source/reference UI. Cloud references remain editable snapshots. */
export class SyncedBlockView implements NodeView {
  dom = document.createElement("section");
  contentDOM = document.createElement("div");
  private toolbar = document.createElement("div");
  private locations: HTMLButtonElement;
  private label = document.createElement("span");
  private copy: HTMLButtonElement;
  private more: HTMLButtonElement;
  private status = document.createElement("output");
  private notice = document.createElement("div");
  private popup?: HTMLDivElement;
  private popupTrigger?: HTMLButtonElement;
  private popupEvents?: AbortController;
  private help?: HTMLDialogElement;
  private abort = new AbortController();
  private timer: ReturnType<typeof setInterval>;
  private pending?: ReturnType<typeof setTimeout>;
  private disposed = false;
  private busy = false;
  private paused = false;
  private epoch = 0;
  private baseline?: Page;
  private syncing?: Promise<void>;
  private knownPages: { id: string; title: string; icon: string; parentTitle: string; original: boolean }[] = [];

  constructor(private node: PMNode, private view: EditorView, private getPos: () => number | undefined,
    private currentPage: () => BreadcrumbPage | undefined, private supplemental: () => boolean,
    private savePage?: () => Promise<boolean>) {
    this.dom.className = "pm-content-object pm-object-synced_block";
    this.contentDOM.className = "pm-object-content";
    this.toolbar.className = "pm-synced-toolbar";
    this.toolbar.setAttribute("role", "toolbar"); this.toolbar.setAttribute("aria-label", "Synced block");
    this.locations = button("Synced block locations", () => { void this.showLocations(); });
    this.locations.className = "pm-synced-locations";
    this.locations.replaceChildren(icon(ArrowDownLeft), this.label, icon(ChevronDown));
    this.copy = button("Copy synced block", () => { void this.copyBlock(); }, Copy);
    this.copy.className = "pm-synced-copy"; this.copy.dataset.tooltip = "Copy synced block";
    this.more = button("Synced block options", () => this.showOptions(), Ellipsis);
    this.more.dataset.tooltip = "More options";
    for (const trigger of [this.locations, this.more]) { trigger.setAttribute("aria-haspopup", "menu"); trigger.setAttribute("aria-expanded", "false"); }
    this.toolbar.append(this.locations, this.copy, this.more);
    this.status.className = "pm-synced-status"; this.status.setAttribute("aria-live", "polite");
    this.notice.className = "pm-synced-notice";
    for (const element of [this.toolbar, this.status, this.notice]) element.contentEditable = "false";
    this.dom.append(this.toolbar, this.notice, this.contentDOM, this.status);
    this.dom.addEventListener("pointerenter", () => { void this.loadLocations(); }, { signal: this.abort.signal });
    document.addEventListener("pointerdown", event => {
      if (!this.dom.contains(event.target as Node)) this.closePopup();
    }, { signal: this.abort.signal });
    this.dom.addEventListener("keydown", event => {
      if (!this.popup) return;
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); const trigger = this.popupTrigger; this.closePopup(); trigger?.focus(); }
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) && !this.contentDOM.contains(event.target as Node)) {
        event.preventDefault(); event.stopPropagation();
        const items = [...this.popup.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]')];
        const index = items.indexOf(document.activeElement as HTMLElement);
        items[event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowUp" ? -1 : 1) + items.length) % items.length]?.focus();
      }
    }, { signal: this.abort.signal });
    this.timer = setInterval(() => { if (document.visibilityState !== "hidden") void this.automatic(); }, 2000);
    const active = activeViews.get(view) || new Set<SyncedBlockView>(); active.add(this); activeViews.set(view, active);
    this.render();
    // Do not dispatch while ProseMirror is constructing its node views.
    this.pending = setTimeout(() => { void this.loadLocations(); void this.automatic(); }, 0);
  }

  private localTarget() { try { return this.node.attrs.reference ? syncedSource(this.node.attrs.url) : undefined; } catch { return undefined; } }
  private key() { return syncKey(this.node, this.currentPage()?.id || ""); }
  private setStatus(message: string, error = false) { this.status.textContent = message; this.dom.classList.toggle("pm-synced-error", error); }
  private render() {
    const local = this.supplemental(), target = this.localTarget();
    this.toolbar.hidden = !local;
    const others = this.knownPages.filter(page => page.id !== this.currentPage()?.id).length;
    this.label.textContent = this.node.attrs.reference && !target ? "External snapshot" : others ? `Synced to ${others} other ${others === 1 ? "page" : "pages"}` : "Synced block";
    this.notice.textContent = this.node.attrs.nfmAttrs.notice || "";
    this.copy.disabled = !local || !this.view.editable || this.busy || !this.currentPage() || this.node.attrs.reference && !target;
    this.more.disabled = !this.view.editable;
    this.popup?.querySelectorAll<HTMLButtonElement>('[data-sync-idle="true"]').forEach(item => { item.disabled = this.busy || !this.view.editable; });
    this.dom.dataset.syncState = this.paused ? "paused" : this.busy ? "syncing" : "ready";
    this.positionPopup();
  }
  private live() { return !this.disposed && !this.view.isDestroyed && this.view.editable && !this.view.composing && this.supplemental() && this.view.dom.closest<HTMLElement>(".markdown-workspace")?.dataset.mode !== "source"; }
  private patch(attrs: Record<string, string>, content?: PMNode["content"], group = false) {
    if (!this.live()) return;
    const pos = this.getPos(); if (pos === undefined) return;
    const tr = this.view.state.tr, key = this.key();
    const nodes = group ? syncedNodes(tr.doc).filter(item => item.node.attrs.reference && syncKey(item.node, this.currentPage()?.id || "") === key && syncContent(item.node) === syncContent(this.node)) : [{ node: this.node, pos }];
    for (const item of nodes) {
      const mapped = tr.mapping.map(item.pos);
      const next = { ...item.node.attrs, nfmAttrs: { ...item.node.attrs.nfmAttrs, ...attrs } };
      if (content) tr.replaceWith(mapped, mapped + item.node.nodeSize, item.node.type.create(next, content));
      else tr.setNodeMarkup(mapped, undefined, next);
    }
    this.view.dispatch(tr.setMeta("addToHistory", !!content));
  }
  private closePopup() {
    this.popupEvents?.abort(); this.popupEvents = undefined;
    this.popup?.remove(); this.popup = undefined;
    this.popupTrigger?.setAttribute("aria-expanded", "false"); this.popupTrigger = undefined;
    this.dom.classList.remove("pm-synced-menu-open");
  }
  private positionPopup = () => {
    if (!this.popup || !this.popupTrigger) return;
    const rect = this.toolbar.getBoundingClientRect();
    placeDatePanel(this.popup, { top: rect.top, bottom: rect.bottom,
      left: this.popupTrigger === this.locations ? rect.left : rect.right - this.popup.offsetWidth });
  };
  private openPopup(trigger: HTMLButtonElement, label: string, className = "") {
    this.closePopup();
    const popup = this.popup = document.createElement("div"); popup.className = `pm-synced-menu ${className}`.trim();
    popup.contentEditable = "false"; popup.setAttribute("role", "menu"); popup.setAttribute("aria-label", label);
    this.popupTrigger = trigger; trigger.setAttribute("aria-expanded", "true");
    this.dom.classList.add("pm-synced-menu-open"); this.toolbar.append(popup);
    this.popupEvents = new AbortController();
    const { signal } = this.popupEvents;
    window.addEventListener("resize", this.positionPopup, { signal });
    document.addEventListener("scroll", event => {
      if (!this.popup?.contains(event.target as Node)) this.positionPopup();
    }, { capture: true, signal });
    this.positionPopup(); return popup;
  }
  private async loadLocations(fresh = false) {
    if (!this.supplemental() || this.disposed || !this.key() && this.node.attrs.reference) return;
    const key = this.key(), epoch = this.epoch;
    try {
      const pages = await allPages(this.view, fresh);
      if (this.disposed || epoch !== this.epoch || key !== this.key()) return;
      this.knownPages = [];
      const titles = new Map(pages.filter(page => !page.trashed).map(page => [page.id, page.title || "Untitled"]));
      for (const page of pages) {
        if (page.trashed || page.syntax?.variant !== "notdown") continue;
        const unnamedOriginal = !key && !this.node.attrs.reference && page.id === this.currentPage()?.id;
        if (!key && !unnamedOriginal) continue;
        const doc = page.id === this.currentPage()?.id ? this.view.state.doc : parseNative(page.body, page.syntax || defaultSyntax(page.bodyFormat));
        const matches = key ? syncedNodes(doc).filter(item => syncKey(item.node, page.id) === key) : [];
        if (matches.length || unnamedOriginal) this.knownPages.push({ id: page.id, title: page.title || "Untitled", icon: page.icon,
          parentTitle: page.parent ? titles.get(page.parent) || "" : "", original: unnamedOriginal || matches.some(item => !item.node.attrs.reference) });
      }
      this.knownPages.sort((a, b) => Number(b.original) - Number(a.original)); this.render();
    } catch { /* A transient count lookup must not disable editing or synchronization. */ }
  }
  private async showLocations() {
    if (this.popupTrigger === this.locations) { this.closePopup(); return; }
    const popup = this.openPopup(this.locations, "Synced block locations", "pm-synced-locations-menu"); popup.textContent = "Loading locations…";
    await this.loadLocations(true);
    if (this.popup !== popup || this.disposed) return;
    popup.replaceChildren();
    const heading = document.createElement("div"); heading.className = "pm-synced-menu-heading"; heading.textContent = "Synced to"; popup.append(heading);
    for (const page of this.knownPages) {
      const link = document.createElement("a"); link.className = "pm-synced-page"; link.setAttribute("role", "menuitem");
      link.href = `#page/${encodeURIComponent(page.id)}`;
      const title = document.createElement("span"); title.className = "pm-synced-page-title"; title.textContent = page.title; title.title = page.title;
      const meta = document.createElement("span"); meta.className = "pm-synced-page-meta";
      if (page.parentTitle) { const parent = document.createElement("span"); parent.className = "pm-synced-page-parent"; parent.textContent = page.parentTitle; parent.title = page.parentTitle; meta.append(parent); }
      for (const label of [page.original ? "Original" : "", page.id === this.currentPage()?.id ? "This page" : ""].filter(Boolean)) {
        const badge = document.createElement("small"); badge.className = "pm-synced-badge"; badge.textContent = label; meta.append(badge);
      }
      if (page.id === this.currentPage()?.id) link.setAttribute("aria-current", "page");
      link.append(pageIconElement(page.icon), title, meta);
      link.onclick = () => this.closePopup(); popup.append(link);
    }
    if (!this.knownPages.length) { const empty = document.createElement("p"); empty.textContent = this.node.attrs.reference ? "Source unavailable. This copy keeps its content." : "Copy this block and paste it on another page."; popup.append(empty); }
    popup.append(document.createElement("hr"));
    const help = button("Learn more about Synced blocks", () => this.showHelp(), CircleHelp);
    help.className = "pm-synced-help"; help.setAttribute("role", "menuitem");
    help.append(document.createTextNode("Learn more about Synced blocks")); popup.append(help);
    this.positionPopup();
    popup.querySelector<HTMLElement>("a, button")?.focus({ preventScroll: true });
  }
  private showHelp() {
    this.closePopup();
    if (this.help?.isConnected) { this.help.querySelector<HTMLButtonElement>("button")?.focus(); return; }
    const dialog = this.help = document.createElement("dialog");
    const body = document.createElement("div"); body.className = "pm-synced-help-body";
    for (const text of [
      "Use Copy synced block and paste it into another Notdown page to reuse the same content.",
      "With automatic sync enabled, edits in local copies update the original and other open copies. Unopened pages keep their last saved snapshot until opened. Conflicting edits pause syncing and keep both versions recoverable.",
      "Unsync keeps this copy’s content and stops sharing it. If the original still has copies, unsync those copies first.",
      "Synced blocks work within this vault. External Notion references are saved snapshots; they do not sync with Notion.",
    ]) { const paragraph = document.createElement("p"); paragraph.textContent = text; body.append(paragraph); }
    dialog.append(body);
    dialog.addEventListener("close", () => {
      dialog.remove();
      if (this.help !== dialog) return;
      this.help = undefined;
      if (!this.disposed && this.dom.isConnected && !this.toolbar.hidden) {
        // The toolbar may have hidden while the user read the help panel.
        this.toolbar.style.visibility = "visible";
        this.locations.focus({ preventScroll: true });
        this.toolbar.style.removeProperty("visibility");
      }
    }, { once: true });
    document.body.append(dialog); showEditorPanel(dialog, "Synced blocks", this.dom);
    dialog.querySelector<HTMLButtonElement>("button")?.focus();
  }
  private showOptions() {
    if (this.popupTrigger === this.more) { this.closePopup(); return; }
    const popup = this.openPopup(this.more, "Synced block options");
    const action = (label: string, run: () => void, needsIdle = false) => {
      const item = button(label, () => { this.closePopup(); run(); }); item.setAttribute("role", "menuitem"); item.dataset.syncIdle = String(needsIdle); item.disabled = needsIdle && this.busy; popup.append(item); return item;
    };
    const target = this.localTarget();
    if (target) {
      action("Refresh from source", () => { this.paused = false; void this.sync(false); }, true);
      action("Publish to source", () => { this.paused = false; void this.sync(true); }, true);
      action("Toggle live refresh", () => {
        this.patch({ "auto-refresh": this.node.attrs.nfmAttrs["auto-refresh"] === "true" ? "false" : "true" });
        this.setStatus(this.node.attrs.nfmAttrs["auto-refresh"] === "true" ? "Live refresh enabled. Local edits pause refresh." : "Live refresh disabled.");
      });
      action(this.node.attrs.nfmAttrs["auto-sync"] === "true" ? "Pause automatic sync" : "Enable automatic sync", () => {
        this.paused = false; this.patch({ "auto-sync": this.node.attrs.nfmAttrs["auto-sync"] === "true" ? "false" : "true" });
        void this.automatic();
      });
      popup.append(document.createElement("hr"));
    }
    action("Unsync", () => { void this.unsync(); }, true);
    this.positionPopup();
    popup.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true });
  }
  private async unsync() {
    if (!this.live()) return;
    const original = this.node;
    if (!original.attrs.reference && this.key()) {
      // Do not leave silent dangling references when unwrapping an original.
      try {
        const pages = await allPages(this.view, true);
        if (!this.live() || !this.node.eq(original)) return;
        const key = this.key();
        const hasCopies = pages.some(page => !page.trashed && page.syntax?.variant === "notdown" && syncedNodes(page.id === this.currentPage()?.id ? this.view.state.doc : parseNative(page.body, page.syntax)).some(item => item.node.attrs.reference && syncKey(item.node, page.id) === key));
        if (hasCopies) { this.setStatus("Unsync the copies first. The original is still used on other locations."); return; }
      } catch (error) { this.setStatus((error as Error).message, true); return; }
    }
    const pos = this.getPos(); if (pos === undefined || !this.live()) return;
    const tr = unsyncTransaction(this.view.state, pos);
    if (tr) this.view.dispatch(closeHistory(tr).scrollIntoView()); this.view.focus();
  }
  private async copyBlock() {
    if (!this.live() || this.busy || !this.currentPage()) return;
    this.busy = true; this.render();
    try {
      if (!this.node.attrs.reference && !this.node.attrs.nfmAttrs.id) this.patch({ id: crypto.randomUUID() });
      if (!this.savePage || !await this.savePage()) throw new Error("Save this page successfully before copying its synced block.");
      if (!this.live()) return;
      const original = this.node, key = this.key(), target = syncedSource(key);
      const page = await api<Page>("/pages/" + encodeURIComponent(target.pageId));
      const source = findSyncedSource(page, target.blockId);
      if (syncContent(original) !== syncContent(source.node)) throw new Error("This copy has unpublished changes. Publish or refresh it before copying.");
      const fingerprint = await hash(original);
      if (!this.live() || !this.node.eq(original)) throw new Error("Content changed. Copy the block again.");
      const attrs = { ...original.attrs.nfmAttrs, "source-revision": page.revision, "snapshot-hash": fingerprint, "auto-sync": "true" };
      delete attrs.id;
      const reference = original.type.create({ url: key, reference: true, nfmAttrs: attrs }, original.content);
      const text = serializeNative(schema.nodes.doc.create(null, reference), { version: 1, variant: "notdown", extensions: {} });
      await navigator.clipboard.writeText(text);
      this.setStatus("Copied. Paste on any Notdown page to sync this content.");
    } catch (error) { if (!this.disposed) this.setStatus((error as Error).message, true); }
    finally { this.busy = false; if (!this.disposed) this.render(); }
  }
  private async automatic() {
    if (!this.live() || this.busy || this.paused || !this.localTarget()) return;
    const auto = this.node.attrs.nfmAttrs["auto-sync"] === "true", refresh = this.node.attrs.nfmAttrs["auto-refresh"] === "true";
    if (!auto && !refresh) return;
    const target = this.localTarget()!;
    if (target.pageId === this.currentPage()?.id) return; // A transaction mirrors these without HTTP writes.
    // One node view owns each source request; same-page peers are updated in one transaction.
    const leader = syncedNodes(this.view.state.doc).find(item => item.node.attrs.reference &&
      (item.node.attrs.nfmAttrs["auto-sync"] === "true" || item.node.attrs.nfmAttrs["auto-refresh"] === "true") &&
      syncKey(item.node, this.currentPage()?.id || "") === this.key() && syncContent(item.node) === syncContent(this.node));
    if (leader?.pos !== this.getPos()) return;
    const original = this.node, fingerprint = await hash(original);
    if (!this.live() || this.busy || !this.node.eq(original)) return;
    const previous = original.attrs.nfmAttrs["snapshot-hash"];
    if (!previous && auto) { this.paused = true; this.setStatus("Sync paused. Refresh from source to connect this snapshot.", true); return; }
    const edited = !!previous && fingerprint !== previous;
    if (edited && !auto || !previous && refresh) return;
    await this.sync(edited, true);
  }
  async flush() {
    await this.syncing;
    await this.automatic();
    await this.syncing;
  }
  private sync(publish: boolean, automatic = false) {
    if (this.syncing) return this.syncing;
    const operation = this.performSync(publish, automatic);
    this.syncing = operation;
    void operation.finally(() => { if (this.syncing === operation) this.syncing = undefined; });
    return operation;
  }
  private async performSync(publish: boolean, automatic = false) {
    if (!this.live() || this.busy) return;
    const original = this.node, epoch = this.epoch, target = this.localTarget(); if (!target) return;
    this.busy = true; this.render();
    const valid = () => this.live() && epoch === this.epoch;
    try {
      if (target.pageId === this.currentPage()?.id) {
        const source = findSyncedSourceInDoc(this.view.state.doc, target.blockId);
        if (publish) this.view.dispatch(this.view.state.tr.replaceWith(source.pos + 1, source.pos + source.node.nodeSize - 1, original.content));
        else this.patch({}, source.node.content);
        this.setStatus(""); return;
      }
      const revision = original.attrs.nfmAttrs["source-revision"] || "";
      if (publish && !revision) throw new Error("Refresh from source before publishing edits.");
      const latest = await api<Page>("/pages/" + encodeURIComponent(target.pageId));
      if (!valid() || !this.node.eq(original)) return;
      if (latest.trashed) throw new Error("Source is in Trash. This copy keeps its content.");
      if (latest.syntax?.variant !== "notdown") throw new Error("The source must use the Notdown dialect for local sync.");
      const source = findSyncedSource(latest, target.blockId);
      if (publish) {
        // Serialize from the captured page if available; never retry a newer revision.
        const base = this.baseline && this.baseline.revision === revision ? this.baseline : latest;
        const captured = findSyncedSource(base, target.blockId);
        const tr = EditorState.create({ doc: captured.doc }).tr.replaceWith(captured.pos + 1, captured.pos + captured.node.nodeSize - 1, original.content);
        const saved = await api<Page>("/pages/" + encodeURIComponent(latest.id), { method: "PUT", body: JSON.stringify({ body: serializeNative(tr.doc, base.syntax || defaultSyntax(base.bodyFormat)), baseRevision: revision }) });
        if (!valid()) return;
        const fingerprint = await hash(original); if (!valid()) return;
        this.baseline = saved;
        this.patch({ "source-revision": saved.revision, "snapshot-hash": fingerprint }, undefined, true);
        this.setStatus(automatic ? "" : "Published to the local source page.");
      } else {
        this.baseline = latest;
        if (automatic && latest.revision === revision) return;
        const fingerprint = await hash(source.node); if (!valid() || !this.node.eq(original)) return;
        this.patch({ "source-revision": latest.revision, "snapshot-hash": fingerprint }, source.node.content, true);
        this.setStatus(automatic ? "" : "Local snapshot refreshed.");
      }
    } catch (error) {
      if (valid()) { this.paused = true; this.setStatus(`Sync paused. ${(error as Error).message} Your local content is kept.`, true); }
    } finally { this.busy = false; if (!this.disposed) this.render(); }
  }
  update(node: PMNode) {
    if (node.type !== this.node.type) return false;
    if (node.attrs.url !== this.node.attrs.url || node.attrs.reference !== this.node.attrs.reference) {
      this.epoch++; this.baseline = undefined; this.paused = false; this.knownPages = []; this.closePopup();
    }
    const changed = syncContent(node) !== syncContent(this.node);
    this.node = node; this.render();
    if (changed) { clearTimeout(this.pending); this.pending = setTimeout(() => { void this.automatic(); }, 900); }
    return true;
  }
  stopEvent(event: Event) { return !this.contentDOM.contains(event.target as Node); }
  ignoreMutation(mutation: MutationRecord | { type: "selection"; target: Node }) {
    return mutation.type !== "selection" && !this.contentDOM.contains(mutation.target);
  }
  destroy() { this.disposed = true; this.epoch++; activeViews.get(this.view)?.delete(this); clearInterval(this.timer); clearTimeout(this.pending); this.abort.abort(); this.closePopup(); this.help?.close(); this.help?.remove(); }
}
