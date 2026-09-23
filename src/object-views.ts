import { DOMSerializer, type Node as PMNode } from "prosemirror-model";
import type { EditorView, NodeView } from "prosemirror-view";
import { objectFields } from "./object-model";
import { api, type Page } from "./types";
import { editorSchema as schema } from "./editor-schema";
import { readAttributes, domAttributes } from "./markdown-engine/attributes";
import { syncedSource, findSyncedSource } from "./synced-source";
import { serializeNative } from "./markdown-engine/codec";
import { defaultSyntax } from "./markdown-engine/config";
import { EditorState } from "prosemirror-state";
import { editorFingerprint } from "./editor-markdown";
import { renderBreadcrumb, type BreadcrumbPage } from "./breadcrumb-view";
import { TabsView } from "./tabs-view";
import { ButtonView } from "./button-view";
import { BookmarkView } from "./bookmark-view";
import { EmbedView } from "./embed-view";
import { parseNotionMarkdown } from "./notion-markdown";

export class ContentObjectView implements NodeView {
  dom = document.createElement("section");
  contentDOM?: HTMLElement;
  private controls = document.createElement("div");
  private preview = document.createElement("div");
  private status = document.createElement("output");
  private disposed = false;
  private request = 0;
  private sourceRevision = "";
  private syncTimer?: ReturnType<typeof setInterval>;
  private syncing = false;
  constructor(private node: PMNode, private view: EditorView, private getPos: () => number | undefined, private pages: () => BreadcrumbPage[], private currentPage?: () => BreadcrumbPage | undefined, private supplemental: () => boolean = () => false) {
    this.dom.className = "pm-content-object pm-object-" + node.type.name;
    this.controls.contentEditable = this.preview.contentEditable = this.status.contentEditable = "false";
    this.dom.append(this.controls, this.preview);
    if (node.type.spec.content) { this.contentDOM = document.createElement("div"); this.contentDOM.className = "pm-object-content"; this.dom.append(this.contentDOM); }
    const action = (label: string, callback: () => void) => {
      const button = document.createElement("button"); button.type = "button"; button.textContent = label; button.disabled = !view.editable;
      button.addEventListener("click", callback); this.controls.append(button);
    };
    if (node.type.name === "ai_block") action("Generate", () => { void this.runService("generate"); });
    if (node.type.name === "meeting_notes") action("Transcribe", () => { void this.runService("transcribe"); });
    if (node.type.name === "synced_block" && supplemental()) {
      action("Refresh from source", () => { void this.sync(false); });
      action("Publish to source", () => { void this.sync(true); });
      action("Toggle live refresh", () => { this.set({ "@auto-refresh": this.node.attrs.nfmAttrs["auto-refresh"] === "true" ? "false" : "true" }); this.status.textContent = this.node.attrs.nfmAttrs["auto-refresh"] === "true" ? "Live local refresh enabled after a source refresh. Local edits pause it." : "Live local refresh disabled."; });
      this.syncTimer = setInterval(() => { if (this.node.attrs.nfmAttrs["auto-refresh"] === "true" && document.visibilityState !== "hidden") void this.sync(false, true); }, 4000);
    }
    this.dom.append(this.status); this.refresh();
  }
  private set(attrs: Record<string, unknown>) {
    const pos = this.getPos(); if (pos === undefined || this.disposed || !this.view.editable) return;
    const next: Record<string, any> = { ...this.node.attrs, nfmAttrs: { ...this.node.attrs.nfmAttrs } };
    for (const [key, value] of Object.entries(attrs)) { if (key.startsWith("@")) next.nfmAttrs[key.slice(1)] = value; else next[key] = value; }
    if (attrs.url !== undefined) { this.sourceRevision = ""; delete next.nfmAttrs["source-revision"]; }
    this.view.dispatch(this.view.state.tr.setNodeMarkup(pos, undefined, next));
  }
  private refresh() {
    this.preview.replaceChildren();
    if (this.node.type.name === "fenced_div" && this.contentDOM) {
      const attrs = domAttributes(readAttributes(this.node.attrs.attributes));
      this.contentDOM.className = "pm-object-content pm-fenced-div " + (attrs.class || "");
      this.contentDOM.dataset.divAttributes = this.node.attrs.attributes;
      for (const key of ["id", "lang", "title", "style"]) { if (attrs[key]) this.contentDOM.setAttribute(key, attrs[key]); else this.contentDOM.removeAttribute(key); }
    }
    if (this.node.type.name === "breadcrumb") {
      this.preview.append(renderBreadcrumb(this.pages(), this.currentPage?.()));
    } else if (!this.contentDOM) {
      const spec = this.node.type.spec.toDOM?.(this.node); if (spec) this.preview.append(DOMSerializer.renderSpec(document, spec).dom);
    }
  }
  private async runService(action: "generate" | "transcribe") {
    const serial = ++this.request; const original = this.node;
    this.status.textContent = action === "generate" ? "Generating…" : "Transcribing…";
    try {
      const response = await api<{ text: string }>("/services/" + action, { method: "POST", body: JSON.stringify(action === "generate" ? { prompt: original.attrs.prompt, model: original.attrs.model, context: original.textContent } : { path: original.attrs.audio, language: original.attrs.language }) });
      if (this.disposed || serial !== this.request) return;
      const pos = this.getPos(); if (pos === undefined) return;
      // Delayed responses never replace edits made while the request was running.
      if (!this.node.eq(original)) { this.status.textContent = "Content changed. Generated text: " + response.text; return; }
      const content = response.text.split(/\r?\n/).map(line => schema.nodes.paragraph.create(null, line ? schema.text(line) : undefined));
      this.view.dispatch(this.view.state.tr.replaceWith(pos + 1, pos + this.node.nodeSize - 1, content));
      this.status.textContent = "Done";
    } catch (error) { if (!this.disposed && serial === this.request) this.status.textContent = (error as Error).message; }
  }
  private async snapshotHash(node: PMNode) {
    const value = editorFingerprint(schema.nodes.doc.create(null, node.content));
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return [...new Uint8Array(bytes)].map(n => n.toString(16).padStart(2, "0")).join("");
  }
  private async sync(publish: boolean, automatic = false) {
    if (!this.supplemental() || this.syncing) return;
    this.syncing = true;
    const original = this.node, serial = ++this.request;
    try {
      if (automatic && (!original.attrs.nfmAttrs["snapshot-hash"] || await this.snapshotHash(original) !== original.attrs.nfmAttrs["snapshot-hash"])) return;
      const target = syncedSource(original.attrs.url);
      this.sourceRevision ||= original.attrs.nfmAttrs["source-revision"] || "";
      if (publish && !this.sourceRevision) throw new Error("Refresh from source before publishing edits.");
      const page = await api<Page>("/pages/" + encodeURIComponent(target.pageId));
      if (this.disposed || serial !== this.request) return;
      if (automatic && page.revision === this.sourceRevision) return;
      const source = findSyncedSource(page, target.blockId);
      if (publish) {
        const tr = EditorState.create({ doc: source.doc }).tr.replaceWith(source.pos + 1, source.pos + source.node.nodeSize - 1, original.content);
        const saved = await api<Page>("/pages/" + encodeURIComponent(page.id), { method: "PUT", body: JSON.stringify({ body: serializeNative(tr.doc, page.syntax || defaultSyntax(page.bodyFormat)), baseRevision: this.sourceRevision }) });
        if (this.disposed || serial !== this.request) return;
        const hash = await this.snapshotHash(original);
        if (this.disposed || serial !== this.request) return;
        this.sourceRevision = saved.revision; this.set({ "@source-revision": saved.revision, "@snapshot-hash": hash }); this.status.textContent = "Published to the local source page.";
      } else {
        const hash = await this.snapshotHash(source.node);
        if (this.disposed || serial !== this.request) return;
        const pos = this.getPos(); if (pos === undefined) return;
        if (!this.node.eq(original)) throw new Error("Content changed while loading. Refresh again to replace the snapshot.");
        this.view.dispatch(this.view.state.tr.replaceWith(pos, pos + this.node.nodeSize, original.type.create({ ...original.attrs, nfmAttrs: { ...original.attrs.nfmAttrs, "source-revision": page.revision, "snapshot-hash": hash } }, source.node.content)));
        this.sourceRevision = page.revision; this.status.textContent = "Local snapshot refreshed. Edits can be published to this source revision.";
      }
    } catch (error) { if (!this.disposed && serial === this.request) this.status.textContent = (error as Error).message; }
    finally { this.syncing = false; }
  }
  update(node: PMNode) {
    if (node.type !== this.node.type) return false;
    if (node.attrs.url !== this.node.attrs.url) { this.sourceRevision = ""; this.request++; }
    this.node = node; this.refresh(); return true;
  }
  stopEvent(event: Event) { return this.controls.contains(event.target as Node) || this.preview.contains(event.target as Node) || this.status.contains(event.target as Node); }
  ignoreMutation(m: MutationRecord | { type: "selection"; target: Node }) { return m.type !== "selection" && (!this.contentDOM || !this.contentDOM.contains(m.target)); }
  destroy() { this.disposed = true; this.request++; clearInterval(this.syncTimer); }
}
export function objectNodeViews(pages: () => BreadcrumbPage[], currentPage?: () => BreadcrumbPage | undefined, parse: (source: string) => PMNode = parseNotionMarkdown, onOpenPage?: (id: string) => void, supplemental: () => boolean = () => false) {
  return Object.fromEntries(Object.keys(objectFields).map(name => [name, (node: PMNode, view: EditorView, getPos: () => number | undefined) => name === "html_embed" || name === "embed_web_contents" ? new EmbedView(node, view, getPos) : name === "web_bookmark" ? new BookmarkView(node, view, getPos) : name === "button" ? new ButtonView(node, view, getPos, parse, pages, onOpenPage) : name === "tabs" ? new TabsView(node, view, getPos) : new ContentObjectView(node, view, getPos, pages, currentPage, supplemental)]));
}
