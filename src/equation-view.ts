import type { Node as PMNode } from "prosemirror-model";
import { NodeSelection } from "prosemirror-state";
import type { EditorView, NodeView } from "prosemirror-view";
import { closeHistory } from "prosemirror-history";
import katex from "katex";

/** Formula input enters the document immediately, including before a view switch. */
export class EquationView implements NodeView {
  readonly dom = document.createElement("div");
  private panel?: HTMLDivElement;
  private input?: HTMLTextAreaElement;
  private events?: AbortController;
  private resize?: ResizeObserver;
  private writing = false;
  private firstInput = true;

  constructor(private node: PMNode, private view: EditorView, private getPos: () => number | undefined) {
    this.dom.className = "pm-equation";
    this.dom.contentEditable = "false";
    this.dom.tabIndex = 0;
    this.dom.setAttribute("role", "button");
    this.dom.setAttribute("aria-label", "Edit equation");
    this.dom.setAttribute("aria-haspopup", "dialog");
    this.dom.setAttribute("aria-expanded", "false");
    this.dom.addEventListener("click", () => this.open());
    this.dom.addEventListener("notdown-edit-equation", () => this.open());
    this.dom.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault(); this.open();
      }
    });
    this.render();
  }

  private render() {
    this.dom.classList.toggle("pm-equation-empty", !this.node.textContent.trim());
    if (!this.node.textContent.trim()) {
      const icon = document.createElement("span"), label = document.createElement("span");
      icon.className = "pm-equation-icon";
      icon.textContent = "TᴇX";
      icon.setAttribute("aria-hidden", "true");
      label.textContent = "Add a TeX equation";
      this.dom.replaceChildren(icon, label);
    } else {
      katex.render((this.node.attrs.latexPrefix || "") + this.node.textContent, this.dom, {
        displayMode: true, throwOnError: false, trust: false, output: "htmlAndMathml",
      });
    }
    this.position();
  }

  private position = () => {
    if (!this.panel) return;
    const rect = this.dom.getBoundingClientRect();
    if (!rect.width || !rect.height) { this.close(); return; }
    const panel = this.panel, margin = 8;
    panel.style.left = `${Math.max(margin, Math.min(rect.left, innerWidth - panel.offsetWidth - margin))}px`;
    const below = rect.bottom + panel.offsetHeight <= innerHeight - margin;
    panel.style.top = `${Math.max(margin, Math.min(below ? rect.bottom : rect.top - panel.offsetHeight, innerHeight - panel.offsetHeight - margin))}px`;
  };

  private open() {
    if (!this.view.editable) return;
    if (this.panel) { this.input?.focus(); return; }
    const panel = document.createElement("div"), input = document.createElement("textarea"), done = document.createElement("button");
    panel.className = "pm-equation-editor";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Edit equation");
    input.setAttribute("aria-label", "Equation content");
    input.setAttribute("aria-description", "Enter to finish. Shift+Enter for a new line.");
    input.placeholder = "|x| = \\begin{cases}\n  x, &\\quad x \\geq 0 \\\\\n -x, &\\quad x < 0\n\\end{cases}";
    input.value = this.node.textContent;
    input.spellcheck = false;
    input.rows = 3;
    done.type = "button";
    done.textContent = "Done ↵";
    done.setAttribute("aria-label", "Done");
    done.addEventListener("click", () => this.finish());
    panel.append(input, done);
    this.panel = panel; this.input = input; this.firstInput = true;
    document.body.append(panel);
    this.dom.classList.add("pm-equation-editing");
    this.dom.setAttribute("aria-expanded", "true");
    const fit = () => {
      input.style.height = "0";
      input.style.height = `${Math.max(56, Math.min(260, input.scrollHeight))}px`;
      this.position();
    };
    input.addEventListener("input", () => { this.write(); fit(); });
    panel.addEventListener("keydown", event => {
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === "Escape" || (event.key === "Enter" && !event.shiftKey && event.target === input)) {
        event.preventDefault(); event.stopPropagation(); this.finish();
      }
    });
    this.events = new AbortController();
    const signal = this.events.signal;
    const outside = (event: Event) => {
      if (!panel.contains(event.target as Node) && !this.dom.contains(event.target as Node)) this.close();
    };
    document.addEventListener("pointerdown", outside, { capture: true, signal });
    document.addEventListener("focusin", outside, { signal });
    document.addEventListener("scroll", this.position, { capture: true, signal });
    window.addEventListener("resize", this.position, { signal });
    this.resize = new ResizeObserver(this.position);
    this.resize.observe(this.dom);
    fit(); input.focus(); input.setSelectionRange(input.value.length, input.value.length);
  }

  private write() {
    const pos = this.getPos(), value = this.input?.value;
    if (pos === undefined || value === undefined || !this.view.editable || this.view.state.doc.nodeAt(pos) !== this.node) {
      this.close(); return;
    }
    if (value === this.node.textContent) return;
    const next = this.node.type.create(this.node.attrs, value ? this.view.state.schema.text(value) : undefined, this.node.marks);
    let tr = this.view.state.tr.replaceWith(pos, pos + this.node.nodeSize, next);
    if (this.firstInput) tr = closeHistory(tr);
    this.firstInput = false;
    this.writing = true;
    try { this.view.dispatch(tr); } finally { this.writing = false; }
  }

  private finish() {
    this.write(); this.close();
    const pos = this.getPos();
    if (pos !== undefined && this.view.state.doc.nodeAt(pos)?.type === this.node.type) {
      this.view.dispatch(closeHistory(this.view.state.tr).setSelection(NodeSelection.create(this.view.state.doc, pos)));
    }
    this.view.focus();
  }

  private close() {
    this.events?.abort(); this.resize?.disconnect();
    this.panel?.remove(); this.panel = undefined; this.input = undefined;
    this.dom.classList.remove("pm-equation-editing");
    this.dom.setAttribute("aria-expanded", "false");
  }

  update(node: PMNode) {
    if (node.type !== this.node.type) return false;
    // A source edit, undo, or external refresh must never retain an older input buffer.
    if (!this.writing && !node.eq(this.node)) this.close();
    this.node = node; this.render(); return true;
  }
  stopEvent() { return true; }
  ignoreMutation() { return true; }
  destroy() { this.close(); }
}
