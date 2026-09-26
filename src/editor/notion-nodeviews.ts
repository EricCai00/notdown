import { isEditorKind } from "../document/node-identity";
import { DOMSerializer, type Node as PMNode } from "prosemirror-model";
import { tocIncludes } from "../blocks/content-toc";
import { Selection } from "prosemirror-state";
import type {
  EditorView,
  NodeView,
  NodeViewConstructor,
} from "prosemirror-view";
import katex from "katex";
import { colorStyle } from "../document/notion-syntax";
import { closeHistory } from "prosemirror-history";
import { openCalloutIconPicker } from "../blocks/callout-icon-picker";
import { ColumnsView } from "../blocks/columns-view";
import { EquationView } from "../blocks/equation-view";
import { AlertView } from "../blocks/alert-view";

class CalloutView implements NodeView {
  dom = document.createElement("aside");
  contentDOM = document.createElement("div");
  private icon = document.createElement("button");
  private closePicker?: () => void;
  constructor(private node: PMNode, private view: EditorView, private getPos: () => number | undefined) {
    this.contentDOM.className = "pm-callout-content";
    this.icon.type = "button";
    this.icon.contentEditable = "false";
    this.icon.className = "pm-callout-icon";
    this.icon.setAttribute("aria-label", "Choose callout icon");
    this.icon.setAttribute("aria-haspopup", "dialog");
    this.icon.addEventListener("click", () => {
      if (!this.view.editable) return;
      this.closePicker?.();
      this.closePicker = openCalloutIconPicker(this.icon, icon => {
        const pos = this.getPos();
        const current = pos === undefined ? null : this.view.state.doc.nodeAt(pos);
        if (current?.type !== this.node.type || !this.view.editable) return;
        this.view.dispatch(closeHistory(this.view.state.tr).setNodeMarkup(pos!, undefined, { ...current.attrs, icon }));
        this.view.focus();
      });
    });
    this.dom.append(this.icon, this.contentDOM);
    this.render();
  }
  private render() {
    const spec = DOMSerializer.renderSpec(document, this.node.type.spec.toDOM!(this.node)).dom as HTMLElement;
    for (const attr of Array.from(this.dom.attributes)) this.dom.removeAttribute(attr.name);
    for (const attr of Array.from(spec.attributes)) this.dom.setAttribute(attr.name, attr.value);
    this.dom.classList.add("pm-callout-interactive");
    this.icon.textContent = this.node.attrs.icon || "+";
    this.icon.classList.toggle("pm-callout-icon-empty", !this.node.attrs.icon);
    this.icon.title = this.node.attrs.icon ? "Change callout icon" : "Add callout icon";
  }
  update(node: PMNode) {
    if (node.type !== this.node.type || node.attrs.syntaxForm === "alert") return false;
    this.node = node;
    this.render();
    return true;
  }
  stopEvent(event: Event) { return this.icon.contains(event.target as Node); }
  ignoreMutation(mutation: { type: string; target: Node }) {
    return mutation.type !== "selection" && !this.contentDOM.contains(mutation.target);
  }
  destroy() { this.closePicker?.(); }
}

class ToggleView implements NodeView {
  dom = document.createElement("div");
  contentDOM = document.createElement("div");
  private button = document.createElement("button");
  private open = true;
  constructor(private node: PMNode, private view: EditorView, private getPos: () => number | undefined, private supplemental: () => boolean) {
    if (this.supplemental()) this.open = (isEditorKind(node, "nested_block") ? node.firstChild : node)?.attrs.nfmAttrs?.open !== "false";
    this.button.type = "button";
    this.button.contentEditable = "false";
    this.button.className = "pm-toggle-chevron";
    this.button.addEventListener("reveal-content", () => { this.open = true; this.render(); });
    this.button.addEventListener("click", () => {
      this.open = !this.open;
      const pos = this.getPos(), head = isEditorKind(this.node, "nested_block") ? this.node.firstChild! : this.node;
      if (this.supplemental() && this.view.editable && pos !== undefined) this.view.dispatch(this.view.state.tr.setNodeMarkup(pos + (isEditorKind(this.node, "nested_block") ? 1 : 0), undefined, { ...head.attrs, nfmAttrs: { ...head.attrs.nfmAttrs, open: String(this.open) } }));
      this.render();
    });
    this.contentDOM.className = "pm-toggle-content";
    this.dom.append(this.button, this.contentDOM);
    this.render();
  }
  render() {
    this.dom.className = `pm-toggle${isEditorKind(this.node, "nested_block") ? " pm-heading-toggle" : ""}${this.open ? "" : " pm-toggle-closed"}`;
    this.dom.style.cssText = colorStyle(
      this.node.attrs.color || this.node.firstChild?.attrs.color || "",
    );
    this.button.setAttribute("aria-label", this.open ? "Collapse content" : "Expand content");
    this.button.setAttribute("aria-expanded", String(this.open));
    this.button.textContent = this.open ? "▾" : "▸";
  }
  update(node: PMNode) {
    if (node.type !== this.node.type) return false;
    if (isEditorKind(node, "nested_block") && !node.firstChild?.attrs.toggle) return false;
    this.node = node;
    if (this.supplemental()) this.open = (isEditorKind(node, "nested_block") ? node.firstChild : node)?.attrs.nfmAttrs?.open !== "false";
    this.render();
    return true;
  }
  stopEvent(event: Event) {
    return this.button.contains(event.target as Node);
  }
  ignoreMutation(mutation: { type: string; target: Node }) {
    return (
      mutation.type !== "selection" &&
      (this.button.contains(mutation.target) || mutation.target === this.dom)
    );
  }
}

class MathView implements NodeView {
  dom: HTMLElement;
  private dialog?: HTMLDialogElement;
  private events?: AbortController;
  private resize?: ResizeObserver;
  constructor(
    private node: PMNode,
    private view: EditorView,
    private getPos: () => number | undefined,
  ) {
    this.dom = document.createElement(node.isInline ? "span" : "div");
    this.dom.contentEditable = "false";
    this.dom.className = node.isInline ? "pm-inline-math" : "pm-equation";
    this.dom.title = "Click to edit equation";
    this.dom.tabIndex = 0;
    this.dom.setAttribute("aria-haspopup", "dialog");
    this.dom.setAttribute("aria-expanded", "false");
    this.dom.addEventListener("click", () => this.edit());
    this.dom.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault(); this.edit();
      }
    });
    this.render();
  }
  render() {
    katex.render(
      (this.node.attrs.latexPrefix || "") + (this.node.isInline ? this.node.attrs.value : this.node.textContent),
      this.dom,
      {
        displayMode: !this.node.isInline,
        throwOnError: false,
        trust: false,
        output: "htmlAndMathml",
      },
    );
  }
  private position = () => {
    const panel = this.dialog;
    if (!panel) return;
    const rect = this.dom.getBoundingClientRect(), margin = 8, gap = 5;
    if (!rect.width || !rect.height) { this.close(); return; }
    panel.style.left = `${Math.max(margin, Math.min(rect.left, innerWidth - panel.offsetWidth - margin))}px`;
    const below = rect.bottom + gap + panel.offsetHeight <= innerHeight - margin;
    panel.style.top = `${Math.max(margin, Math.min(below ? rect.bottom + gap : rect.top - gap - panel.offsetHeight, innerHeight - panel.offsetHeight - margin))}px`;
  };
  private close() {
    this.events?.abort(); this.resize?.disconnect();
    this.dialog?.remove(); this.dialog = undefined;
    this.dom.classList.remove("pm-inline-math-editing");
    this.dom.setAttribute("aria-expanded", "false");
  }
  edit() {
    if (!this.view.editable) return;
    if (this.dialog?.isConnected) return;
    const dialog = document.createElement("dialog"),
      form = document.createElement("form"),
      input = document.createElement("textarea"),
      submit = document.createElement("button");
    dialog.className = "pm-equation-editor pm-inline-equation-editor";
    dialog.setAttribute("aria-label", "Equation");
    dialog.setAttribute("aria-modal", "false");
    const original = this.node, output = document.createElement("output");
    input.value = this.node.isInline
      ? this.node.attrs.value
      : this.node.textContent;
    input.setAttribute("aria-label", "Equation content");
    input.rows = 1;
    input.spellcheck = false;
    input.setAttribute("aria-description", "Enter to finish. Escape to cancel.");
    output.setAttribute("aria-live", "polite");
    submit.type = "submit";
    submit.textContent = "Done ↵";
    submit.setAttribute("aria-label", "Done");
    form.append(input, submit);
    dialog.append(form, output);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!this.node.eq(original)) { output.textContent = "Equation changed. Reopen its editor."; return; }
      const pos = this.getPos();
      if (pos !== undefined) {
        const node = this.node.isInline
          ? this.node.type.create(
              { ...this.node.attrs, value: input.value },
              null,
              this.node.marks,
            )
          : this.node.type.create(
              this.node.attrs,
              input.value
                ? this.view.state.schema.text(input.value)
                : undefined,
            );
        this.view.dispatch(
          this.view.state.tr.replaceWith(pos, pos + this.node.nodeSize, node),
        );
      }
      this.close();
      this.view.focus();
    });
    dialog.addEventListener("keydown", event => {
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === "Escape") {
        event.preventDefault(); event.stopPropagation();
        this.close(); this.view.focus();
      } else if (event.key === "Enter" && !event.shiftKey && event.target === input) {
        event.preventDefault(); event.stopPropagation(); form.requestSubmit();
      }
    });
    dialog.addEventListener("close", () => this.close());
    document.body.append(dialog);
    this.dialog = dialog;
    this.dom.classList.add("pm-inline-math-editing");
    this.dom.setAttribute("aria-expanded", "true");
    this.events = new AbortController();
    const signal = this.events.signal;
    const outside = (event: Event) => {
      if (!dialog.contains(event.target as Node) && !this.dom.contains(event.target as Node)) this.close();
    };
    document.addEventListener("pointerdown", outside, { capture: true, signal });
    document.addEventListener("focusin", outside, { signal });
    document.addEventListener("scroll", this.position, { capture: true, signal });
    window.addEventListener("resize", this.position, { signal });
    this.resize = new ResizeObserver(this.position);
    this.resize.observe(this.dom); this.resize.observe(dialog);
    const fit = () => {
      input.style.height = "0";
      input.style.height = `${Math.max(21, Math.min(160, input.scrollHeight))}px`;
      this.position();
    };
    input.addEventListener("input", fit);
    dialog.show(); fit();
    input.focus({ preventScroll: true });
  }
  update(node: PMNode) {
    if (node.type !== this.node.type) return false;
    if (!node.eq(this.node)) this.close();
    this.node = node;
    this.render();
    return true;
  }
  stopEvent() {
    return true;
  }
  ignoreMutation() {
    return true;
  }
  destroy() {
    this.close();
  }
}

export function notionNodeViews(supplemental: () => boolean = () => false, alertTitles: () => boolean = () => false): Record<string, NodeViewConstructor> {
  return {
    columns: (node, view, getPos) => new ColumnsView(node, view, getPos, supplemental),
    callout: (node, view, getPos) => {
      if (node.attrs.syntaxForm !== "alert") return new CalloutView(node, view, getPos);
      return new AlertView(node, view, getPos, alertTitles);
    },
    toggle_block: (node, view, pos) => new ToggleView(node, view, pos, supplemental),
    nested_block: (node, view, pos) => {
      if (
        isEditorKind(node.firstChild, "heading") &&
        node.firstChild.attrs.toggle
      )
        return new ToggleView(node, view, pos, supplemental);
      const dom = document.createElement("div");
      dom.className = "pm-nested-block";
      return { dom, contentDOM: dom, update: next =>
        next.type === node.type && !(isEditorKind(next.firstChild, "heading") && next.firstChild.attrs.toggle) };
    },
    inline_math: (node, view, pos) => new MathView(node, view, pos),
    equation: (node, view, pos) => new EquationView(node, view, pos),
  };
}

export function refreshEmbeddedToc(view: EditorView) {
  const headings: { pos: number; title: string; level: number }[] = [];
  view.state.doc.descendants((node, pos) => {
    if (isEditorKind(node, "heading"))
      headings.push({ pos, title: node.textContent, level: node.attrs.level });
  });
  view.state.doc.descendants((node, pos) => {
    if (!isEditorKind(node, "table_of_contents")) return;
    const toc = view.nodeDOM(pos);
    if (!(toc instanceof HTMLElement)) return;
    toc.replaceChildren();
    const visible = headings.filter((heading) => tocIncludes(node, heading.level));
    if (!visible.length) toc.textContent = "Add headings to see the table of contents here.";
    for (const heading of visible) {
      const link = document.createElement("button");
      link.type = "button";
      link.textContent = heading.title || "Untitled heading";
      link.style.paddingLeft = `${(heading.level - 1) * 16}px`;
      link.addEventListener("click", () =>
        view.dispatch(
          view.state.tr
            .setSelection(
              Selection.near(view.state.doc.resolve(heading.pos + 1)),
            )
            .scrollIntoView(),
        ),
      );
      toc.append(link);
    }
  });
}
