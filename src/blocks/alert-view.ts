import { DOMSerializer, type Node as PMNode } from "prosemirror-model";
import type { EditorView, NodeView } from "prosemirror-view";
import { closeHistory } from "prosemirror-history";
import { alertLabel, alertTypes } from "../document/alert-presentation";
import { openAlertTypePicker } from "./alert-type-picker";

const alertViews = new WeakMap<HTMLElement, AlertView>();
export function refreshAlertViews(view: EditorView) {
  view.dom.querySelectorAll<HTMLElement>(".pm-alert").forEach(dom => alertViews.get(dom)?.refresh());
}

/** The title is a node attribute; body content stays in the main ProseMirror document. */
export class AlertView implements NodeView {
  dom: HTMLElement;
  contentDOM: HTMLElement;
  private heading: HTMLElement;
  private title: HTMLElement;
  private input?: HTMLInputElement;
  private mirror?: HTMLElement;
  private writing = false;
  private composing = false;
  private firstInput = true;
  private disposed = false;
  private iconButton = document.createElement("button");
  private closePicker?: () => void;

  constructor(private node: PMNode, private view: EditorView, private getPos: () => number | undefined, private canEditTitle: () => boolean) {
    const rendered = DOMSerializer.renderSpec(document, node.type.spec.toDOM!(node));
    this.dom = rendered.dom as HTMLElement;
    alertViews.set(this.dom, this);
    this.contentDOM = rendered.contentDOM as HTMLElement;
    this.heading = this.dom.querySelector(".pm-alert-title")!;
    this.title = this.dom.querySelector(".pm-alert-title-text")!;
    const icon = this.heading.querySelector(".pm-alert-icon")!;
    this.iconButton.type = "button";
    this.iconButton.className = "pm-alert-type-button";
    this.iconButton.setAttribute("aria-label", "Change alert type");
    this.iconButton.setAttribute("aria-haspopup", "menu");
    this.iconButton.setAttribute("aria-expanded", "false");
    icon.replaceWith(this.iconButton);
    this.iconButton.append(icon);
    this.iconButton.addEventListener("click", event => {
      event.preventDefault();
      if (!this.view.editable) return;
      if (this.iconButton.getAttribute("aria-expanded") === "true") { this.closePicker?.(); return; }
      this.closePicker?.();
      this.closePicker = openAlertTypePicker(this.iconButton, {
        kind: this.node.attrs.kind, style: this.node.attrs.alertStyle,
        extended: this.canEditTitle(), fold: this.node.attrs.fold,
      }, patch => {
        if (!this.canEditTitle() && (patch.fold !== undefined || patch.kind && !(alertTypes as readonly string[]).includes(patch.kind))) return;
        this.firstInput = true;
        this.write(patch);
      });
    });
    this.heading.addEventListener("click", event => {
      // Native summary activation must not fold the body while placing the title caret.
      if (event.target === this.input || this.iconButton.contains(event.target as Node)) event.preventDefault();
    });
    if (this.dom instanceof HTMLDetailsElement) this.dom.addEventListener("toggle", () => {
      if (this.disposed || !this.view.editable) return;
      const fold = (this.dom as HTMLDetailsElement).open ? "+" : "-";
      this.write({ fold });
    });
    this.syncTitle();
  }

  private syncTitle() {
    this.iconButton.disabled = !this.view.editable;
    if (!this.canEditTitle()) {
      this.title.classList.remove("pm-alert-title-editor");
      this.title.textContent = this.node.attrs.title || alertLabel(this.node.attrs.kind);
      this.input = undefined; this.mirror = undefined;
      return;
    }
    if (!this.input) {
      const input = document.createElement("input"), mirror = document.createElement("span");
      input.type = "text";
      input.size = 1;
      input.className = "pm-alert-title-input";
      input.setAttribute("aria-label", "Alert title");
      input.autocomplete = "off";
      mirror.className = "pm-alert-title-mirror";
      mirror.setAttribute("aria-hidden", "true");
      this.title.classList.add("pm-alert-title-editor");
      this.title.replaceChildren(mirror, input);
      this.input = input; this.mirror = mirror;
      input.addEventListener("focus", () => { this.firstInput = true; });
      input.addEventListener("compositionstart", () => { this.composing = true; });
      input.addEventListener("compositionend", () => { this.composing = false; this.writeTitle(); });
      input.addEventListener("input", () => this.writeTitle());
      input.addEventListener("blur", () => { this.composing = false; this.writeTitle(); });
      input.addEventListener("keydown", event => {
        if (this.composing || event.isComposing || event.keyCode === 229) return;
        if ((event.ctrlKey || event.metaKey) && ["z", "y"].includes(event.key.toLowerCase())) {
          event.preventDefault();
          const pos = this.getPos();
          this.view.someProp("handleKeyDown", handler => handler(this.view, event));
          // Workspace history can replace the node view along with the snapshot.
          const currentDOM = pos === undefined ? null : this.view.nodeDOM(pos);
          if (currentDOM instanceof HTMLElement)
            currentDOM.querySelector<HTMLInputElement>(".pm-alert-title-input")?.focus();
        } else if (event.key === "Enter" || event.key === "Escape") {
          event.preventDefault(); this.writeTitle(); input.blur();
          if (this.dom instanceof HTMLDetailsElement) this.heading.focus();
          else this.view.focus();
        }
      });
    }
    this.input.readOnly = !this.view.editable;
    this.input.placeholder = alertLabel(this.node.attrs.kind);
    // Preserve the browser's caret/IME state for our own transactions. An external
    // projection or undo must replace the previous draft instead of replaying it.
    if (!this.writing && this.input.value !== this.node.attrs.title) {
      this.input.value = this.node.attrs.title;
      this.composing = false;
    }
    this.mirror!.textContent = this.input.value || this.input.placeholder;
  }

  private writeTitle() {
    if (!this.input) return;
    if (!this.canEditTitle() || !this.view.editable) { this.syncTitle(); return; }
    this.mirror!.textContent = this.input.value || this.input.placeholder;
    this.write({ title: this.input.value });
  }

  private write(patch: { title?: string; fold?: string; kind?: string }) {
    if (this.disposed || !this.view.editable) return;
    const pos = this.getPos();
    const current = pos === undefined ? null : this.view.state.doc.nodeAt(pos);
    if (current !== this.node || Object.entries(patch).every(([key, value]) => current.attrs[key] === value)) return;
    let tr = this.view.state.tr.setNodeMarkup(pos!, undefined, { ...current.attrs, ...patch });
    if (this.firstInput || patch.fold !== undefined) tr = closeHistory(tr);
    this.firstInput = false;
    this.writing = true;
    try { this.view.dispatch(tr); } finally { this.writing = false; }
  }

  update(node: PMNode) {
    if (node.type !== this.node.type || node.attrs.syntaxForm !== "alert" || !!node.attrs.fold !== !!this.node.attrs.fold) return false;
    const rendered = DOMSerializer.renderSpec(document, node.type.spec.toDOM!(node)).dom as HTMLElement;
    for (const attr of Array.from(this.dom.attributes)) if (!rendered.hasAttribute(attr.name)) this.dom.removeAttribute(attr.name);
    for (const attr of Array.from(rendered.attributes)) if (this.dom.getAttribute(attr.name) !== attr.value) this.dom.setAttribute(attr.name, attr.value);
    if (node.attrs.kind !== this.node.attrs.kind || node.attrs.alertStyle !== this.node.attrs.alertStyle)
      this.heading.querySelector(".pm-alert-icon")!.replaceWith(rendered.querySelector(".pm-alert-icon")!);
    this.node = node;
    this.syncTitle();
    return true;
  }

  refresh() { this.closePicker?.(); this.syncTitle(); }

  stopEvent(event: Event) { return event.target instanceof Node && this.heading.contains(event.target); }
  ignoreMutation(mutation: { type: string; target: Node }) {
    return (mutation.type === "selection" && this.input === document.activeElement)
      || (mutation.type !== "selection" && !this.contentDOM.contains(mutation.target));
  }
  destroy() { this.disposed = true; this.closePicker?.(); }
}
