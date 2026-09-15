import type { Node as PMNode } from "prosemirror-model";
import { Selection } from "prosemirror-state";
import type {
  EditorView,
  NodeView,
  NodeViewConstructor,
} from "prosemirror-view";
import katex from "katex";
import { colorStyle } from "./notion-syntax";

class ToggleView implements NodeView {
  dom = document.createElement("div");
  contentDOM = document.createElement("div");
  private button = document.createElement("button");
  private open = true;
  constructor(private node: PMNode) {
    this.button.type = "button";
    this.button.contentEditable = "false";
    this.button.className = "pm-toggle-chevron";
    this.button.addEventListener("click", () => {
      this.open = !this.open;
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
    this.button.setAttribute("aria-label", this.open ? "折叠内容" : "展开内容");
    this.button.setAttribute("aria-expanded", String(this.open));
    this.button.textContent = this.open ? "▾" : "▸";
  }
  update(node: PMNode) {
    if (node.type !== this.node.type) return false;
    this.node = node;
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
    this.dom.title = "点击编辑公式";
    this.dom.addEventListener("click", () => this.edit());
    this.render();
  }
  render() {
    katex.render(
      this.node.isInline ? this.node.attrs.value : this.node.textContent,
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
    label.textContent = "LaTeX 公式";
    input.value = this.node.isInline
      ? this.node.attrs.value
      : this.node.textContent;
    input.setAttribute("aria-label", "公式内容");
    input.rows = 3;
    label.append(input);
    submit.type = "submit";
    submit.textContent = "完成";
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

export function notionNodeViews(): Record<string, NodeViewConstructor> {
  return {
    toggle_block: (node) => new ToggleView(node),
    nested_block: (node) => {
      if (
        node.firstChild?.type.name === "heading" &&
        node.firstChild.attrs.toggle
      )
        return new ToggleView(node);
      const dom = document.createElement("div");
      dom.className = "pm-nested-block";
      return { dom, contentDOM: dom };
    },
    inline_math: (node, view, pos) => new MathView(node, view, pos),
    equation: (node, view, pos) => new MathView(node, view, pos),
    table: (node) => {
      const dom = document.createElement("table"),
        contentDOM = document.createElement("tbody");
      dom.className = "pm-table";
      dom.append(contentDOM);
      const update = (next: PMNode) => {
        if (next.type !== node.type) return false;
        dom.dataset.headerRow = String(
          next.attrs.nfmAttrs["header-row"] === "true",
        );
        dom.dataset.headerColumn = String(
          next.attrs.nfmAttrs["header-column"] === "true",
        );
        dom.style.cssText = colorStyle(next.attrs.color);
        dom.querySelector("colgroup")?.remove();
        if (next.attrs.widths.length) {
          const group = document.createElement("colgroup");
          for (const width of next.attrs.widths) {
            const col = document.createElement("col");
            if (/^\d+(?:\.\d+)?(?:px|%)?$/.test(width))
              col.style.width = /^\d+$/.test(width) ? `${width}px` : width;
            group.append(col);
          }
          dom.prepend(group);
        }
        return true;
      };
      update(node);
      return {
        dom,
        contentDOM,
        update,
        ignoreMutation: (mutation) =>
          mutation.type !== "selection" &&
          !contentDOM.contains(mutation.target),
      };
    },
  };
}

export function refreshEmbeddedToc(view: EditorView) {
  const headings: { pos: number; title: string; level: number }[] = [];
  view.state.doc.descendants((node, pos) => {
    if (node.type.name === "heading")
      headings.push({ pos, title: node.textContent, level: node.attrs.level });
  });
  for (const toc of view.dom.querySelectorAll<HTMLElement>(".pm-toc")) {
    toc.replaceChildren();
    if (!headings.length) toc.textContent = "添加标题后，目录会显示在这里。";
    for (const heading of headings) {
      const link = document.createElement("button");
      link.type = "button";
      link.textContent = heading.title || "未命名标题";
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
  }
}
