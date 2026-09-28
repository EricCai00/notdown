import { editorKind, isEditorKind } from "../document/node-identity";
import { DOMSerializer, type Node as PMNode } from "prosemirror-model";
import type { EditorView, NodeView } from "prosemirror-view";
import { objectFields } from "../document/object-model";
import { api } from "../shared/types";
import { editorSchema as schema } from "../document/editor-schema";
import { readAttributes, domAttributes } from "../markdown-engine/attributes";
import { renderBreadcrumb, type BreadcrumbPage } from "../blocks/breadcrumb-view";
import { TabsView } from "../blocks/tabs-view";
import { ButtonView } from "../blocks/button-view";
import { BookmarkView } from "../features/bookmarks/bookmark-view";
import { EmbedView } from "../blocks/embed-view";
import { MediaView } from "../blocks/media-view";
import { AiBlockView } from "../blocks/ai-block-view";
import { SyncedBlockView } from "../blocks/synced-block-view";
import { DatabaseBlockView } from "../blocks/database-view";
import { MeetingNotesView, MeetingSectionView } from "../blocks/meeting-notes-view";
import { notionInline, parseNotionMarkdown } from "../document/notion-markdown";

export class ContentObjectView implements NodeView {
  dom = document.createElement("section");
  contentDOM?: HTMLElement;
  private controls = document.createElement("div");
  private preview = document.createElement("div");
  private status = document.createElement("output");
  private disposed = false;
  private request = 0;
  constructor(private node: PMNode, private view: EditorView, private getPos: () => number | undefined, private pages: () => BreadcrumbPage[], private currentPage?: () => BreadcrumbPage | undefined, private supplemental: () => boolean = () => false) {
    this.dom.className = "pm-content-object pm-object-" + editorKind(node);
    this.controls.contentEditable = this.preview.contentEditable = this.status.contentEditable = "false";
    this.dom.append(this.controls, this.preview);
    if (node.type.spec.content) { this.contentDOM = document.createElement("div"); this.contentDOM.className = "pm-object-content"; this.dom.append(this.contentDOM); }
    const action = (label: string, callback: () => void) => {
      const button = document.createElement("button"); button.type = "button"; button.textContent = label; button.disabled = !view.editable;
      button.addEventListener("click", callback); this.controls.append(button);
    };
    if (isEditorKind(node, "ai_block")) action("Generate", () => { void this.runService("generate"); });
    this.dom.append(this.status); this.refresh();
  }
  private refresh() {
    this.preview.replaceChildren();
    if (isEditorKind(this.node, "meeting_notes")) {
      const title = document.createElement("h3");
      if (this.node.attrs.syntaxForm === "notion") {
        const paragraph = schema.nodes["block.paragraph"].create(null, notionInline(this.node.attrs.title || ""));
        title.append(DOMSerializer.fromSchema(schema).serializeFragment(paragraph.content));
      } else title.textContent = this.node.attrs.title || "Meeting notes";
      this.preview.append(title);
    }
    if (isEditorKind(this.node, "synced_block") && this.node.attrs.nfmAttrs.notice) {
      const notice = document.createElement("p"); notice.textContent = this.node.attrs.nfmAttrs.notice;
      notice.className = "pm-synced-notice"; this.preview.append(notice);
    }
    if (isEditorKind(this.node, "fenced_div") && this.contentDOM) {
      const attrs = domAttributes(readAttributes(this.node.attrs.attributes));
      this.contentDOM.className = "pm-object-content pm-fenced-div " + (attrs.class || "");
      this.contentDOM.dataset.divAttributes = this.node.attrs.attributes;
      for (const key of ["id", "lang", "title", "style"]) { if (attrs[key]) this.contentDOM.setAttribute(key, attrs[key]); else this.contentDOM.removeAttribute(key); }
    }
    if (isEditorKind(this.node, "breadcrumb")) {
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
      const content = response.text.split(/\r?\n/).map(line => schema.nodes["block.paragraph"].create(null, line ? schema.text(line) : undefined));
      this.view.dispatch(this.view.state.tr.replaceWith(pos + 1, pos + this.node.nodeSize - 1, content));
      this.status.textContent = "Done";
    } catch (error) { if (!this.disposed && serial === this.request) this.status.textContent = (error as Error).message; }
  }
  update(node: PMNode) {
    if (node.type !== this.node.type) return false;
    this.node = node; this.refresh(); return true;
  }
  stopEvent(event: Event) { return this.controls.contains(event.target as Node) || this.preview.contains(event.target as Node) || this.status.contains(event.target as Node); }
  ignoreMutation(m: MutationRecord | { type: "selection"; target: Node }) { return m.type !== "selection" && (!this.contentDOM || !this.contentDOM.contains(m.target)); }
  destroy() { this.disposed = true; this.request++; }
}
export function objectNodeViews(pages: () => BreadcrumbPage[], currentPage?: () => BreadcrumbPage | undefined, parse: (source: string) => PMNode = parseNotionMarkdown, onOpenPage?: (id: string) => void, supplemental: () => boolean = () => false, savePage?: () => Promise<boolean>) {
  return Object.fromEntries([...Object.keys(objectFields), "meeting_section"].map(name => [name, (node: PMNode, view: EditorView, getPos: () => number | undefined) => name === "database" ? new DatabaseBlockView(node, view, getPos, pages, currentPage, onOpenPage, savePage) : name === "meeting_section" ? new MeetingSectionView(node) : name === "meeting_notes" ? new MeetingNotesView(node, view, getPos, supplemental, currentPage) : name === "synced_block" ? new SyncedBlockView(node, view, getPos, currentPage || (() => undefined), supplemental, savePage) : name === "ai_block" ? new AiBlockView(node, view, getPos, pages, currentPage, parse) : name === "media_block" ? new MediaView(node) : name === "web_embed" || name === "notion_embed" ? new EmbedView(node, view, getPos, currentPage, supplemental) : name === "web_bookmark" ? new BookmarkView(node, view, getPos) : name === "button" ? new ButtonView(node, view, getPos, parse, pages, onOpenPage) : name === "tabs" ? new TabsView(node, view, getPos) : new ContentObjectView(node, view, getPos, pages, currentPage, supplemental)]));
}
