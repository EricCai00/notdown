import type { Node as PMNode } from "prosemirror-model";
import type { EditorView } from "prosemirror-view";
import { closeHistory } from "prosemirror-history";
import { moveEditorBlock, type EditorBlock } from "./editor-blocks";

/** Long press owns the gesture only after the hold threshold. Early movement scrolls. */
export function installTouchBlockDrag(view: EditorView, options: {
  allowed: () => boolean;
  flush: () => void;
  candidate: (x: number, y: number) => EditorBlock | null;
}) {
  const root = view.dom;
  const marker = document.createElement("div"); marker.className = "pm-touch-drop-line";
  const outline = document.createElement("div"); outline.className = "pm-touch-drag-outline";
  const preview = document.createElement("div"); preview.className = "pm-touch-drag-preview";
  preview.setAttribute("aria-hidden", "true");
  const status = document.createElement("div"); status.className = "pm-touch-drag-status";
  status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
  document.body.append(marker, outline, preview, status);
  let hold: ReturnType<typeof setTimeout> | undefined, frame = 0, suppressClickUntil = 0;
  let gesture: { id: number; x: number; y: number; startX: number; startY: number; block: EditorBlock; doc: PMNode; active: boolean; element: HTMLElement; scroll: HTMLElement | null } | undefined;
  let target: { block: EditorBlock; placement: "before" | "after" } | undefined;
  const cancel = () => {
    clearTimeout(hold); cancelAnimationFrame(frame);
    gesture = undefined; target = undefined;
    root.classList.remove("pm-touch-dragging"); marker.hidden = outline.hidden = preview.hidden = true;
  };
  cancel();
  const current = () => gesture && gesture.element.isConnected && view.editable && !view.composing && options.allowed() && gesture.doc.eq(view.state.doc);
  const locate = () => {
    if (!gesture?.active) return;
    const { x, y, block: source } = gesture;
    // Paint outside contenteditable: changing a paragraph's class can make PM
    // reparse it and detach the browser's original touch target mid-gesture.
    const sourceRect = gesture.element.getBoundingClientRect();
    Object.assign(outline.style, { left: `${sourceRect.left}px`, top: `${sourceRect.top}px`, width: `${sourceRect.width}px`, height: `${sourceRect.height}px` });
    preview.style.left = `${Math.max(8, Math.min(innerWidth - preview.offsetWidth - 8, x - 40))}px`;
    preview.style.top = `${Math.max(8, y - 58)}px`;
    const block = options.candidate(x, y);
    const dom = block && view.nodeDOM(block.pos);
    target = undefined; marker.hidden = true;
    if (!block || !(dom instanceof HTMLElement) || block.pos >= source.pos && block.pos < source.end) return;
    const rect = dom.getBoundingClientRect();
    const placement = y < rect.top + rect.height / 2 ? "before" : "after";
    if (!moveEditorBlock(view.state, source.pos, block.pos, placement)) return;
    target = { block, placement };
    marker.style.left = `${Math.max(8, rect.left)}px`;
    marker.style.top = `${placement === "before" ? rect.top : rect.bottom}px`;
    marker.style.width = `${Math.min(rect.right, innerWidth - 8) - Math.max(8, rect.left)}px`;
    marker.hidden = false;
  };
  const tick = () => {
    if (!current()) { cancel(); return; }
    if (gesture?.active && gesture.scroll) {
      const rect = gesture.scroll.getBoundingClientRect(), edge = 48;
      const velocity = gesture.y < rect.top + edge ? -Math.min(12, (rect.top + edge - gesture.y) / 4)
        : gesture.y > rect.bottom - edge ? Math.min(12, (gesture.y - rect.bottom + edge) / 4) : 0;
      if (velocity) {
        const before = gesture.scroll.scrollTop;
        gesture.scroll.scrollTop += velocity;
        if (gesture.scroll.scrollTop !== before) locate();
      }
    }
    frame = requestAnimationFrame(tick);
  };
  const start = (event: TouchEvent) => {
    if (event.touches.length !== 1) { cancel(); return; }
    if (!options.allowed() || !view.editable || view.composing || !(event.target instanceof Element)) return;
    // Embedded controls and independently editable widgets retain their own gestures.
    if (event.target.closest("button, input, textarea, select, a, audio, video, iframe, .cm-editor, .database-workspace")) return;
    options.flush();
    const touch = event.touches[0], block = options.candidate(touch.clientX, touch.clientY);
    const element = block && view.nodeDOM(block.pos);
    if (!block || !(element instanceof HTMLElement)) return;
    cancel();
    let scroll = root.parentElement;
    while (scroll && !/(auto|scroll)/.test(getComputedStyle(scroll).overflowY)) scroll = scroll.parentElement;
    gesture = { id: touch.identifier, x: touch.clientX, y: touch.clientY, startX: touch.clientX, startY: touch.clientY, block, doc: view.state.doc, active: false, element, scroll };
    hold = setTimeout(() => {
      if (!current() || !gesture) { cancel(); return; }
      gesture.active = true; outline.hidden = false;
      root.classList.add("pm-touch-dragging");
      window.getSelection()?.removeAllRanges();
      preview.textContent = block.node.textContent.slice(0, 80) || "Move block"; preview.hidden = false;
      status.textContent = "Moving block. Drag to a new position and release.";
      locate(); tick();
    }, 450);
  };
  const move = (event: TouchEvent) => {
    if (!gesture) return;
    if (event.touches.length !== 1 || !current()) { cancel(); return; }
    const touch = Array.from(event.touches).find(touch => touch.identifier === gesture!.id);
    if (!touch) { cancel(); return; }
    gesture.x = touch.clientX; gesture.y = touch.clientY;
    if (!gesture.active) {
      if (Math.hypot(gesture.x - gesture.startX, gesture.y - gesture.startY) > 10) cancel();
      return;
    }
    event.preventDefault(); event.stopImmediatePropagation(); locate();
  };
  const end = (event: TouchEvent) => {
    if (!gesture) return;
    if (gesture.active) {
      // Run before PM's touchend handler can focus the editor and summon the IME.
      event.preventDefault(); event.stopImmediatePropagation(); suppressClickUntil = performance.now() + 700;
      // Recompute after any viewport/layout change since the last touchmove.
      if (current()) locate();
      const transaction = current() && target ? moveEditorBlock(view.state, gesture.block.pos, target.block.pos, target.placement) : null;
      cancel();
      if (transaction) { view.dispatch(closeHistory(transaction).setMeta("isolateHistory", true)); status.textContent = "Block moved."; }
      else status.textContent = "Move cancelled.";
    } else cancel();
  };
  const scroll = () => { if (gesture && !gesture.active) cancel(); };
  const context = (event: Event) => { if (gesture && options.allowed()) event.preventDefault(); };
  const click = (event: Event) => { if (performance.now() < suppressClickUntil) { event.preventDefault(); event.stopImmediatePropagation(); } };
  const hidden = () => { if (document.hidden) cancel(); };
  const multitouch = (event: TouchEvent) => { if (gesture && event.touches.length !== 1) cancel(); };
  const abort = new AbortController(), signal = abort.signal;
  root.addEventListener("touchstart", start, { passive: true, signal });
  root.addEventListener("touchmove", move, { passive: false, capture: true, signal });
  root.addEventListener("touchend", end, { passive: false, capture: true, signal });
  root.addEventListener("touchcancel", cancel, { signal });
  root.addEventListener("contextmenu", context, { signal });
  root.addEventListener("click", click, { capture: true, signal });
  document.addEventListener("scroll", scroll, { capture: true, signal });
  document.addEventListener("touchstart", multitouch, { passive: true, capture: true, signal });
  document.addEventListener("visibilitychange", hidden, { signal });
  window.addEventListener("blur", cancel, { signal });
  return () => { cancel(); abort.abort(); marker.remove(); preview.remove(); status.remove(); };
}
