import type { Node as PMNode } from "prosemirror-model";
import type { EditorView, NodeView } from "prosemirror-view";
import { renderRawHtml } from "./html.js";

export class HtmlBlockView implements NodeView {
  dom = document.createElement("div");
  private preview = document.createElement("div");
  private input = document.createElement("textarea");
  private button = document.createElement("button");
  constructor(
    private node: PMNode,
    private view: EditorView,
    private getPos: () => number | undefined,
  ) {
    this.dom.className = "pm-html-block";
    this.dom.contentEditable = "false";
    this.preview.className = "pm-html-preview";
    this.input.className = "pm-html-source";
    this.input.setAttribute("aria-label", "HTML block source");
    this.input.spellcheck = false;
    this.input.hidden = true;
    this.button.type = "button";
    this.button.textContent = "Edit HTML";
    this.button.className = "pm-html-edit";
    this.button.addEventListener("click", () => {
      this.input.hidden = !this.input.hidden;
      this.button.textContent = this.input.hidden ? "Edit HTML" : "Hide source";
      if (!this.input.hidden) this.input.focus();
    });
    this.input.addEventListener("input", () => {
      const pos = this.getPos();
      if (pos !== undefined)
        this.view.dispatch(
          this.view.state.tr.setNodeMarkup(pos, undefined, {
            ...this.node.attrs,
            raw: this.input.value,
          }),
        );
    });
    this.input.addEventListener("keydown", (event) => {
      if (
        !event.isComposing &&
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        ["z", "y"].includes(event.key.toLowerCase())
      ) {
        // The HTML source field participates in the same document history.
        const pos = this.getPos();
        const start = this.input.selectionStart;
        const end = this.input.selectionEnd;
        this.view.someProp("handleKeyDown", (handler) =>
          handler(this.view, event),
        );
        event.preventDefault();
        // History may replace the node view. Keep its source editor open and focused.
        const dom = pos === undefined ? null : this.view.nodeDOM(pos);
        if (
          dom instanceof HTMLElement &&
          dom.classList.contains("pm-html-block")
        ) {
          const input =
            dom.querySelector<HTMLTextAreaElement>(".pm-html-source")!;
          input.hidden = false;
          dom.querySelector(".pm-html-edit")!.textContent = "Hide source";
          input.focus();
          input.setSelectionRange(
            Math.min(start, input.value.length),
            Math.min(end, input.value.length),
          );
        }
      }
    });
    this.dom.append(this.button, this.preview, this.input);
    this.update(node);
  }
  update(node: PMNode) {
    if (node.type.name !== "html_block") return false;
    this.node = node;
    const html = renderRawHtml(node.attrs.raw);
    this.preview.innerHTML = html;
    if (this.input.value !== node.attrs.raw) this.input.value = node.attrs.raw;
    return true;
  }
  stopEvent(event: Event) {
    return event.target === this.input || event.target === this.button;
  }
  ignoreMutation() {
    return true;
  }
}
export function htmlInlineView(node: PMNode): NodeView {
  const dom = document.createElement("span");
  dom.className = "pm-html-inline";
  dom.contentEditable = "false";
  dom.title = "Edit the HTML fragment in source view";
  dom.innerHTML = renderRawHtml(node.attrs.html);
  return { dom, ignoreMutation: () => true };
}
