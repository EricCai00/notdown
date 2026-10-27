import type { Node as PMNode, Mark } from "prosemirror-model";
import { DOMSerializer } from "prosemirror-model";
import type { NodeView, MarkView } from "prosemirror-view";
import { externalIdentity, unknownEntityLabel, type ExternalKind } from "./external-entity";
import { externalEntitiesChanged, resolveExternal } from "./external-client";
import { requestPeople } from "../people/people-client";
import "./external-references.css";

/** Retain source and actual text in the document; only the presentation is disabled. */
export class ExternalLinkView implements MarkView {
  dom: HTMLElement;
  contentDOM: HTMLElement;
  private events = new AbortController();
  constructor(mark: Mark) {
    const rendered = DOMSerializer.renderSpec(document, mark.type.spec.toDOM!(mark, true));
    this.dom = rendered.dom as HTMLElement;
    this.contentDOM = rendered.contentDOM as HTMLElement ?? this.dom;
    const identity = externalIdentity(mark.attrs.href);
    if (!identity) return;
    const content = document.createElement("span");
    this.dom.append(content); this.contentDOM = content;
    const render = () => {
      const entity = resolveExternal(mark.attrs.href), resolved = entity?.status === "resolved" && entity.localId;
      this.dom.classList.add("external-reference");
      this.dom.dataset.externalKind = identity.kind;
      this.dom.dataset.externalLabel = unknownEntityLabel(identity.kind);
      this.dom.classList.toggle("external-unresolved", !resolved);
      if (resolved) {
        if (entity.kind === "user") {
          this.dom.removeAttribute("href"); this.dom.setAttribute("role", "button");
          this.dom.onclick = event => { event.preventDefault(); requestPeople({ selectedId: entity.localId }); };
          this.dom.onkeydown = event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); this.dom.click(); } };
        } else this.dom.setAttribute("href", `#page/${entity.localId}`);
        this.dom.removeAttribute("aria-disabled"); this.dom.removeAttribute("tabindex");
        if (entity.kind === "user") this.dom.tabIndex = 0;
        this.dom.removeAttribute("aria-label");
        this.dom.removeAttribute("target"); this.dom.title = entity.label || "";
      } else {
        this.dom.onclick = null; this.dom.onkeydown = null; this.dom.removeAttribute("role");
        this.dom.removeAttribute("href"); this.dom.setAttribute("aria-disabled", "true"); this.dom.tabIndex = -1;
        this.dom.setAttribute("aria-label", unknownEntityLabel(identity.kind));
        this.dom.title = entity?.status === "ambiguous" ? "Multiple local copies match. Choose a target in External references." : "Not linked yet. A later import can resolve this reference.";
      }
    };
    render();
    document.addEventListener(externalEntitiesChanged, render, { signal: this.events.signal });
  }
  ignoreMutation(mutation: { type: string; target: Node }) { return mutation.type === "attributes" && mutation.target === this.dom; }
  destroy() { this.events.abort(); }
}

export class ExternalMentionView implements NodeView {
  dom = document.createElement("span");
  private events = new AbortController();
  constructor(private node: PMNode, private onOpenPage?: (id: string) => void) {
    this.dom.contentEditable = "false";
    this.dom.className = "pm-mention external-reference";
    document.addEventListener(externalEntitiesChanged, () => this.render(), { signal: this.events.signal });
    this.dom.onclick = event => {
      const entity = this.entity();
      if (entity?.status !== "resolved" || !entity.localId) return;
      if (entity.kind === "user") { event.preventDefault(); requestPeople({ selectedId: entity.localId }); }
      else { event.preventDefault(); this.onOpenPage?.(entity.localId); }
    };
    this.dom.onkeydown = event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); this.dom.click(); } };
    this.render();
  }
  private entity() { return resolveExternal(this.node.attrs.nfmAttrs?.url, this.node.attrs.kind as ExternalKind); }
  private render() {
    const kind = this.node.attrs.kind as ExternalKind, entity = this.entity(), resolved = entity?.status === "resolved";
    this.dom.classList.toggle("external-unresolved", !resolved);
    this.dom.dataset.externalKind = kind;
    this.dom.dataset.mentionKind = kind;
    this.dom.textContent = `${kind === "user" ? "@" : "▤ "}${resolved ? entity.label || this.node.attrs.label : unknownEntityLabel(kind)}`;
    if (resolved) { this.dom.tabIndex = 0; this.dom.setAttribute("role", "button"); this.dom.removeAttribute("aria-disabled"); }
    else { this.dom.tabIndex = -1; this.dom.removeAttribute("role"); this.dom.setAttribute("aria-disabled", "true"); }
    this.dom.title = resolved ? entity.label || "" : "Not linked yet. Source information is preserved.";
  }
  update(node: PMNode) { if (node.type !== this.node.type) return false; this.node = node; this.render(); return true; }
  stopEvent(event: Event) { return ["click", "keydown", "mousedown"].includes(event.type); }
  ignoreMutation() { return true; }
  destroy() { this.events.abort(); }
}
