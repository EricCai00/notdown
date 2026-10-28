import type { Node as PMNode } from "prosemirror-model";
import type { NodeView } from "prosemirror-view";
import { unknownEntityLabel, type ExternalKind } from "./external-entity";
import { externalEntitiesChanged, resolveExternal } from "./external-client";
import { requestPeople } from "../people/people-client";
import "./external-references.css";

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
