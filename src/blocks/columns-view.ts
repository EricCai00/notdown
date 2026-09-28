import { DOMSerializer, type Node as PMNode } from "prosemirror-model";
import type { EditorView, NodeView } from "prosemirror-view";
import {
  columnTracks,
  columnWidths,
  columnWidthTransaction,
  resizeColumnPair,
} from "./column-widths";

export class ColumnsView implements NodeView {
  dom = document.createElement("div");
  contentDOM = document.createElement("div");
  private handles: HTMLDivElement[] = [];
  private observer: ResizeObserver;
  private cancelDrag?: () => void;
  private frame = 0;

  constructor(
    private node: PMNode,
    private view: EditorView,
    private getPos: () => number | undefined,
  ) {
    this.contentDOM.className = "pm-columns-content";
    this.dom.append(this.contentDOM);
    this.observer = new ResizeObserver(() => this.layout());
    this.observer.observe(this.dom);
    this.render();
  }

  private render() {
    const spec = DOMSerializer.renderSpec(
      document,
      this.node.type.spec.toDOM!(this.node),
    ).dom as HTMLElement;
    // Preserve schema-owned colors, IDs and classes as well as editor decorations.
    const selected = ["pm-block-selected", "ProseMirror-selectednode"].filter(
      (name) => this.dom.classList.contains(name),
    );
    for (const attr of Array.from(this.dom.attributes))
      this.dom.removeAttribute(attr.name);
    for (const attr of Array.from(spec.attributes))
      this.dom.setAttribute(attr.name, attr.value);
    this.dom.classList.add("note-columns", "pm-columns-interactive");
    this.dom.classList.add(...selected);
    if (this.handles.length !== this.node.childCount - 1) {
      this.handles.forEach((handle) => handle.remove());
      this.handles = Array.from(
        { length: this.node.childCount - 1 },
        (_, index) => {
          const handle = document.createElement("div");
          handle.className = "pm-column-resizer";
          handle.contentEditable = "false";
          handle.tabIndex = 0;
          handle.setAttribute("role", "separator");
          handle.setAttribute("aria-orientation", "vertical");
          handle.setAttribute(
            "aria-label",
            `Resize columns ${index + 1} and ${index + 2}`,
          );
          handle.title =
            "Drag to resize columns · Double-click for equal widths";
          handle.addEventListener("pointerdown", (event) =>
            this.startDrag(event, index),
          );
          handle.addEventListener("dblclick", (event) => {
            event.preventDefault();
            this.commit(
              Array.from(
                { length: this.node.childCount },
                () => 1 / this.node.childCount,
              ),
            );
          });
          handle.addEventListener("keydown", (event) => {
            if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
            event.preventDefault();
            const available = this.availableWidth();
            if (available > 0)
              this.commit(
                resizeColumnPair(
                  columnWidths(this.node),
                  index,
                  (event.key === "ArrowLeft" ? -1 : 1) * available * 0.02,
                  available,
                ),
              );
          });
          this.dom.append(handle);
          return handle;
        },
      );
    }
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.layout());
  }

  private availableWidth() {
    return Array.from(this.contentDOM.children).reduce(
      (sum, column) => sum + column.getBoundingClientRect().width,
      0,
    );
  }

  private layout() {
    const columns = Array.from(this.contentDOM.children);
    const rect = this.dom.getBoundingClientRect();
    this.handles.forEach((handle, index) => {
      const left = columns[index]?.getBoundingClientRect(),
        right = columns[index + 1]?.getBoundingClientRect();
      handle.hidden =
        !this.view.editable || !left || !right || right.left <= left.left;
      if (left && right) {
        handle.style.left = `${(left.right + right.left) / 2 - rect.left}px`;
        handle.setAttribute(
          "aria-valuenow",
          String(Math.round((left.width / (left.width + right.width)) * 100)),
        );
        handle.setAttribute("aria-valuemin", "0");
        handle.setAttribute("aria-valuemax", "100");
      }
    });
  }

  private commit(widths: number[]) {
    const pos = this.getPos();
    if (
      !this.view.editable ||
      pos === undefined ||
      this.view.state.doc.nodeAt(pos) !== this.node
    )
      return;
    const tr = columnWidthTransaction(this.view.state, pos, widths);
    if (tr) this.view.dispatch(tr);
  }

  private startDrag(event: PointerEvent, index: number) {
    if (event.button !== 0 || !this.view.editable) return;
    event.preventDefault();
    event.stopPropagation();
    this.cancelDrag?.();
    const available = this.availableWidth();
    if (!available) return;
    const doc = this.view.state.doc,
      widths = columnWidths(this.node),
      start = event.clientX;
    const handle = this.handles[index];
    let next = widths;
    const cleanup = () => {
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", finish, true);
      window.removeEventListener("pointercancel", cancel, true);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("blur", cancel);
      this.cancelDrag = undefined;
      this.dom.classList.remove("pm-columns-resizing");
      this.dom.style.setProperty(
        "--column-widths",
        columnTracks(columnWidths(this.node)),
      );
      this.layout();
    };
    const cancel = () => cleanup();
    const move = (e: PointerEvent) => {
      if (e.pointerId !== event.pointerId) return;
      if (this.view.state.doc !== doc) {
        cancel();
        return;
      }
      e.preventDefault();
      next = resizeColumnPair(widths, index, e.clientX - start, available);
      this.dom.style.setProperty("--column-widths", columnTracks(next));
      this.layout();
    };
    const finish = (e: PointerEvent) => {
      if (e.pointerId !== event.pointerId) return;
      move(e);
      cleanup();
      if (
        this.view.state.doc === doc &&
        next.some((width, i) => Math.abs(width - widths[i]) > 0.000001)
      )
        this.commit(next);
      this.view.focus();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        cancel();
      }
    };
    this.cancelDrag = cancel;
    this.dom.classList.add("pm-columns-resizing");
    handle.focus({ preventScroll: true });
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", finish, true);
    window.addEventListener("pointercancel", cancel, true);
    window.addEventListener("keydown", key, true);
    window.addEventListener("blur", cancel);
  }

  update(node: PMNode) {
    if (node.type !== this.node.type) return false;
    if (node !== this.node) this.cancelDrag?.();
    this.node = node;
    this.render();
    return true;
  }
  stopEvent(event: Event) {
    return this.handles.some((handle) => handle.contains(event.target as Node));
  }
  ignoreMutation(mutation: { type: string; target: Node }) {
    return (
      mutation.type !== "selection" &&
      !this.contentDOM.contains(mutation.target)
    );
  }
  destroy() {
    this.cancelDrag?.();
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
  }
}
