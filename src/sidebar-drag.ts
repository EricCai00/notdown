import type { Page } from "./types";
import { planPageMove, type PageDropPosition, type PageMoveInput } from "./page-order";

type Drop = { element: HTMLElement; position: PageDropPosition | "trash"; move: PageMoveInput | null };
export function installSidebarDrag(options: {
  begin: () => Page[] | null;
  drop: (page: Page, move: PageMoveInput | "trash") => void;
  end: () => void;
}) {
  let snapshot: Page[] = [], sourceId: string | null = null, hover: Drop | null = null;
  let pending: { id: string; x: number; y: number; pointer: number } | null = null;
  let cursorX = 0, cursorY = 0, frame = 0, suppressClickUntil = 0;
  let ghost: HTMLElement | null = null;
  const clearHover = () => { hover?.element.removeAttribute("data-page-drop"); hover = null; };
  const finish = () => {
    const active = sourceId !== null;
    const sidebar = document.querySelector<HTMLElement>(".sidebar");
    if (pending && sidebar?.hasPointerCapture(pending.pointer)) sidebar.releasePointerCapture(pending.pointer);
    pending = null; sourceId = null; snapshot = []; clearHover(); cancelAnimationFrame(frame);
    sidebar?.classList.remove("is-page-dragging");
    document.querySelectorAll(".is-page-drag-source").forEach((row) => row.classList.remove("is-page-drag-source"));
    ghost?.remove(); ghost = null;
    if (active) { suppressClickUntil = Date.now() + 250; setTimeout(options.end, 0); }
  };
  const findDrop = (): Drop | null => {
    const target = document.elementFromPoint(cursorX, cursorY);
    if (!target) return null;
    const trash = target.closest<HTMLElement>("[data-page-trash-drop]");
    if (trash) return { element: trash, position: "trash", move: null };
    let element = target.closest<HTMLElement>("#page-tree [data-page-row]");
    let position: PageDropPosition, targetId: string | null;
    if (element) {
      const rect = element.getBoundingClientRect(), fraction = (cursorY - rect.top) / rect.height;
      position = fraction < .25 ? "before" : fraction > .75 ? "after" : "inside";
      targetId = element.dataset.pageRow!;
    } else {
      element = target.closest<HTMLElement>("[data-page-root-drop]");
      if (!element) return null;
      position = "root"; targetId = null;
    }
    try {
      const move = planPageMove(snapshot, sourceId!, targetId, position);
      return move ? { element, position, move } : null;
    } catch { return null; }
  };
  const updateHover = () => {
    clearHover(); hover = findDrop(); hover?.element.setAttribute("data-page-drop", hover.position);
    if (ghost) {
      ghost.style.left = Math.min(cursorX + 14, innerWidth - 220) + "px";
      ghost.style.top = Math.min(cursorY + 12, innerHeight - 40) + "px";
      ghost.classList.toggle("invalid-drop", !hover);
    }
  };
  const scroll = () => {
    if (!sourceId) return;
    const sidebar = document.querySelector<HTMLElement>(".sidebar");
    if (sidebar) {
      const rect = sidebar.getBoundingClientRect();
      const speed = cursorX < rect.left || cursorX > rect.right ? 0 : cursorY < rect.top + 48 ? -9 : cursorY > rect.bottom - 48 ? 9 : 0;
      if (speed) { sidebar.scrollTop += speed; updateHover(); }
    }
    frame = requestAnimationFrame(scroll);
  };
  // Use pointer events, like editor block dragging, rather than the OS drag loop.
  document.addEventListener("dragstart", (event) => {
    if ((event.target as Element).closest(".sidebar .tree-page")) event.preventDefault();
  });
  document.addEventListener("pointerdown", (event) => {
    // A new press is an intentional click, even immediately after a drop.
    suppressClickUntil = 0;
    if (event.button !== 0 || event.pointerType === "touch") return;
    const button = (event.target as Element).closest<HTMLElement>(".sidebar .tree-page[data-open]");
    if (button) pending = { id: button.dataset.open!, x: event.clientX, y: event.clientY, pointer: event.pointerId };
  });
  document.addEventListener("pointermove", (event) => {
    if (!pending || pending.pointer !== event.pointerId) return;
    cursorX = event.clientX; cursorY = event.clientY;
    if (!sourceId) {
      if (Math.hypot(cursorX - pending.x, cursorY - pending.y) < 6) return;
      const available = options.begin();
      if (!available) { pending = null; return; }
      snapshot = structuredClone(available); sourceId = pending.id;
      const page = snapshot.find((item) => item.id === sourceId);
      if (!page) { finish(); return; }
      const sidebar = document.querySelector<HTMLElement>(".sidebar")!;
      sidebar.setPointerCapture(event.pointerId);
      sidebar.classList.add("is-page-dragging");
      sidebar.querySelectorAll<HTMLElement>("[data-page-row]").forEach((row) => row.classList.toggle("is-page-drag-source", row.dataset.pageRow === sourceId));
      ghost = document.createElement("div"); ghost.className = "sidebar-drag-ghost"; ghost.textContent = page.title;
      document.body.append(ghost); frame = requestAnimationFrame(scroll);
    }
    event.preventDefault(); updateHover();
  });
  document.addEventListener("pointerup", (event) => {
    if (!pending || pending.pointer !== event.pointerId) return;
    if (!sourceId) { pending = null; return; }
    event.preventDefault(); event.stopPropagation();
    cursorX = event.clientX; cursorY = event.clientY;
    const target = findDrop(), source = snapshot.find((page) => page.id === sourceId)!;
    finish();
    if (target) setTimeout(() => options.drop(source, target.position === "trash" ? "trash" : target.move!), 0);
  }, true);
  document.addEventListener("pointercancel", finish);
  document.addEventListener("keydown", (event) => { if (pending && event.key === "Escape") finish(); });
  window.addEventListener("blur", finish);
  document.addEventListener("click", (event) => {
    if (Date.now() < suppressClickUntil && (event.target as Element).closest(".sidebar")) {
      event.preventDefault(); event.stopImmediatePropagation();
    }
  }, true);
  return {
    isDragging: () => sourceId !== null,
    saved: (id: string, previous: string, revision: string) => {
      const page = snapshot.find((item) => item.id === id && item.revision === previous);
      if (page) page.revision = revision;
    },
  };
}
