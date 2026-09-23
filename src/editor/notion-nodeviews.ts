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
    if (this.supplemental()) this.open = (node.type.name === "nested_block" ? node.firstChild : node)?.attrs.nfmAttrs?.open !== "false";
    this.button.type = "button";
    this.button.contentEditable = "false";
    this.button.className = "pm-toggle-chevron";
    this.button.addEventListener("reveal-content", () => { this.open = true; this.render(); });
    this.button.addEventListener("click", () => {
      this.open = !this.open;
      const pos = this.getPos(), head = this.node.type.name === "nested_block" ? this.node.firstChild! : this.node;
      if (this.supplemental() && this.view.editable && pos !== undefined) this.view.dispatch(this.view.state.tr.setNodeMarkup(pos + (this.node.type.name === "nested_block" ? 1 : 0), undefined, { ...head.attrs, nfmAttrs: { ...head.attrs.nfmAttrs, open: String(this.open) } }));
      this.render();
    });
    this.contentDOM.className = "pm-toggle-content";
    this.dom.append(this.button, this.contentDOM);
    this.render();
  }
  render() {
    this.dom.className = `pm-toggle${this.node.type.name === "nested_block" ? " pm-heading-toggle" : ""}${this.open ? "" : " pm-toggle-closed"}`;
    this.dom.style.cssText = colorStyle(
      this.node.attrs.color || this.node.firstChild?.attrs.color || "",
    );
    this.button.setAttribute("aria-label", this.open ? "Collapse content" : "Expand content");
    this.button.setAttribute("aria-expanded", String(this.open));
    this.button.textContent = this.open ? "▾" : "▸";
  }
  update(node: PMNode) {
    if (node.type !== this.node.type) return false;
    this.node = node;
    if (this.supplemental()) this.open = (node.type.name === "nested_block" ? node.firstChild : node)?.attrs.nfmAttrs?.open !== "false";
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
  constructor(
    private node: PMNode,
    private view: EditorView,
    private getPos: () => number | undefined,
  ) {
    this.dom = document.createElement(node.isInline ? "span" : "div");
    this.dom.contentEditable = "false";
    this.dom.className = node.isInline ? "pm-inline-math" : "pm-equation";
    this.dom.title = "Click to edit equation";
    this.dom.addEventListener("click", () => this.edit());
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
  edit() {
    if (this.dialog?.isConnected) return;
    const dialog = document.createElement("dialog"),
      form = document.createElement("form"),
      label = document.createElement("label"),
      input = document.createElement("textarea"),
      submit = document.createElement("button");
    dialog.className = "pm-link-dialog";
    label.textContent = "LaTeX equation";
    input.value = this.node.isInline
      ? this.node.attrs.value
      : this.node.textContent;
    input.setAttribute("aria-label", "Equation content");
    input.rows = 3;
    label.append(input);
    submit.type = "submit";
    submit.textContent = "Done";
    form.append(label, submit);
    dialog.append(form);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
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
      dialog.close();
      this.view.focus();
    });
    dialog.addEventListener("close", () => {
      dialog.remove();
      this.dialog = undefined;
    });
    document.body.append(dialog);
    this.dialog = dialog;
    dialog.showModal();
    input.focus();
  }
  update(node: PMNode) {
    if (node.type !== this.node.type) return false;
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
    this.dialog?.remove();
  }
}

export function notionNodeViews(supplemental: () => boolean = () => false): Record<string, NodeViewConstructor> {
  return {
    columns: (node, view, getPos) => new ColumnsView(node, view, getPos, supplemental),
    callout: (node, view, getPos) => {
      if (node.attrs.syntaxForm !== "alert") return new CalloutView(node, view, getPos);
      const { dom, contentDOM } = DOMSerializer.renderSpec(document, node.type.spec.toDOM!(node));
      let disposed = false;
      if (dom instanceof HTMLDetailsElement) dom.addEventListener("toggle", () => {
        if (disposed || !view.editable) return;
        const pos = getPos();
        const current = pos === undefined ? null : view.state.doc.nodeAt(pos);
        const fold = dom.open ? "+" : "-";
        if (current?.type === node.type && current.attrs.fold !== fold)
          view.dispatch(view.state.tr.setNodeMarkup(pos!, undefined, { ...current.attrs, fold }));
      });
      return { dom, contentDOM,
        ignoreMutation: (mutation) => mutation.type !== "selection" && !contentDOM?.contains(mutation.target),
        destroy: () => { disposed = true; },
      };
    },
    toggle_block: (node, view, pos) => new ToggleView(node, view, pos, supplemental),
    nested_block: (node, view, pos) => {
      if (
        node.firstChild?.type.name === "heading" &&
        node.firstChild.attrs.toggle
      )
        return new ToggleView(node, view, pos, supplemental);
      const dom = document.createElement("div");
      dom.className = "pm-nested-block";
      return { dom, contentDOM: dom };
    },
    inline_math: (node, view, pos) => new MathView(node, view, pos),
    equation: (node, view, pos) => new EquationView(node, view, pos),
  };
}

export function refreshEmbeddedToc(view: EditorView) {
  const headings: { pos: number; title: string; level: number }[] = [];
  view.state.doc.descendants((node, pos) => {
    if (node.type.name === "heading")
      headings.push({ pos, title: node.textContent, level: node.attrs.level });
  });
  view.state.doc.descendants((node, pos) => {
    if (node.type.name !== "table_of_contents") return;
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
