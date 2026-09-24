import { DOMSerializer, type Mark, type Schema } from "prosemirror-model";
import { TextSelection } from "prosemirror-state";
import type { EditorView, MarkViewConstructor } from "prosemirror-view";

/** Measure the text edge independently of the browser's ambiguous native
 * caret affinity at an inline boundary. No selection or document mutation. */
function textEdge(view: EditorView, pos: number, side: -1 | 1) {
  const found = view.domAtPos(pos, side);
  let node = found.node;
  let offset = found.offset;
  while (node.nodeType === 1) {
    const child = node.childNodes[side === -1 ? offset - 1 : offset];
    if (
      !child ||
      (child instanceof HTMLElement && child.contentEditable === "false")
    )
      return null;
    node = child;
    offset =
      side === -1
        ? node.nodeType === 3
          ? node.textContent!.length
          : node.childNodes.length
        : 0;
  }
  if (node.nodeType !== 3 || view.posAtDOM(node, offset) !== pos) return null;
  const range = view.dom.ownerDocument.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  const rect = range.getClientRects()[0];
  if (!rect || !rect.height) return null;
  return { node, rect };
}

/** Register the ordinary schema renderers, retaining mark identity in a WeakMap
 * rather than adding attributes that could leak into copied/saved content. */
export function inlineMarkCaret(schema: Schema) {
  const renderedMarks = new WeakMap<HTMLElement, Mark>();
  const markViews: Record<string, MarkViewConstructor> = {};
  for (const [name, type] of Object.entries(schema.marks)) {
    if (!type.spec.toDOM) continue;
    markViews[name] = (mark, view, inline) => {
      const rendered = DOMSerializer.renderSpec(
        view.dom.ownerDocument,
        type.spec.toDOM!(mark, inline),
      );
      const dom = rendered.dom as HTMLElement;
      renderedMarks.set(dom, mark);
      return { dom, contentDOM: rendered.contentDOM };
    };
  }
  return {
    markViews,
    view(view: EditorView) {
      const doc = view.dom.ownerDocument;
      const win = doc.defaultView!;
      const caret = doc.createElement("span");
      caret.className = "pm-inline-boundary-caret";
      caret.setAttribute("aria-hidden", "true");
      caret.hidden = true;
      doc.body.append(caret);
      let frame = 0;
      let composing = false;
      const hide = () => {
        caret.hidden = true;
        view.dom.classList.remove("pm-hide-native-caret");
      };
      const update = () => {
        frame = 0;
        const { selection } = view.state;
        if (
          !view.editable ||
          !view.hasFocus() ||
          composing ||
          view.composing ||
          !(selection instanceof TextSelection) ||
          !selection.empty
        )
          return hide();
        const pos = selection.from;
        const marks = view.state.storedMarks ?? selection.$from.marks();
        const measure = (side: -1 | 1) => {
          const neighbor =
            side === -1
              ? selection.$from.nodeBefore
              : selection.$from.nodeAfter;
          if (!neighbor?.isText) return null;
          const edge = textEdge(view, pos, side);
          if (!edge) return null;
          let x = edge.rect.left;
          let padded = false;
          let inside = false;
          for (
            let el = edge.node.parentElement;
            el && el !== view.dom;
            el = el.parentElement
          ) {
            const mark = renderedMarks.get(el);
            if (!mark) continue;
            const at = view.posAtDOM(
              el,
              side === -1 ? el.childNodes.length : 0,
            );
            if (at !== pos) continue;
            const style = win.getComputedStyle(el);
            const rtl = style.direction === "rtl";
            const rightEdge = (side === -1) !== rtl;
            const padding =
              parseFloat(rightEdge ? style.paddingRight : style.paddingLeft) ||
              0;
            const border =
              parseFloat(
                rightEdge ? style.borderRightWidth : style.borderLeftWidth,
              ) || 0;
            if (padding + border <= 0) continue;
            padded = true;
            if (mark.isInSet(marks)) inside = true;
            else x += (rightEdge ? 1 : -1) * (padding + border);
          }
          return {
            x,
            top: edge.rect.top,
            height: edge.rect.height,
            padded,
            inside,
          };
        };
        const left = measure(-1);
        const right = measure(1);
        if (!left?.padded && !right?.padded) return hide();
        // Inside: stay next to this span's text. Outside: prefer the adjacent
        // character's edge (and font height), or the padded outer edge at EOL.
        const point = left?.inside
          ? left
          : right?.inside
            ? right
            : left?.padded
              ? (right ?? left)
              : (left ?? right);
        if (!point) return hide();
        const bounds = view.dom.getBoundingClientRect();
        if (
          point.top + point.height < Math.max(0, bounds.top) ||
          point.top > Math.min(win.innerHeight, bounds.bottom)
        )
          return hide();
        for (
          let parent = view.dom.parentElement;
          parent;
          parent = parent.parentElement
        ) {
          const style = win.getComputedStyle(parent);
          const clipsY = /auto|scroll|hidden|clip/.test(style.overflowY);
          const clipsX = /auto|scroll|hidden|clip/.test(style.overflowX);
          if (!clipsX && !clipsY) continue;
          const rect = parent.getBoundingClientRect();
          if (
            (clipsY &&
              (point.top < rect.top + parent.clientTop ||
                point.top + point.height >
                  rect.top + parent.clientTop + parent.clientHeight)) ||
            (clipsX &&
              (point.x < rect.left + parent.clientLeft ||
                point.x > rect.left + parent.clientLeft + parent.clientWidth))
          )
            return hide();
        }
        caret.style.left = `${point.x}px`;
        caret.style.top = `${point.top}px`;
        caret.style.height = `${point.height}px`;
        caret.style.backgroundColor = win.getComputedStyle(view.dom).color;
        caret.hidden = false;
        view.dom.classList.add("pm-hide-native-caret");
      };
      const schedule = () => {
        if (!frame) frame = win.requestAnimationFrame(update);
      };
      const startComposition = () => {
        composing = true;
        hide();
      };
      const endComposition = () => {
        composing = false;
        schedule();
      };
      doc.addEventListener("scroll", schedule, true);
      win.addEventListener("resize", schedule);
      view.dom.addEventListener("focus", schedule);
      view.dom.addEventListener("blur", hide);
      view.dom.addEventListener("compositionstart", startComposition);
      view.dom.addEventListener("compositionend", endComposition);
      const resize = new ResizeObserver(schedule);
      resize.observe(view.dom);
      schedule();
      return {
        update: schedule,
        destroy() {
          if (frame) win.cancelAnimationFrame(frame);
          resize.disconnect();
          doc.removeEventListener("scroll", schedule, true);
          win.removeEventListener("resize", schedule);
          view.dom.removeEventListener("focus", schedule);
          view.dom.removeEventListener("blur", hide);
          view.dom.removeEventListener("compositionstart", startComposition);
          view.dom.removeEventListener("compositionend", endComposition);
          hide();
          caret.remove();
        },
      };
    },
  };
}
