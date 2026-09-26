import type { Node as ProseMirrorNode } from "prosemirror-model";
import { Plugin } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import { editorKind } from "../document/node-identity";

export type NumberedListDisplay = "markdown" | "notion";
const storageKey = "notdown-numbered-list-display";
const preferenceEvent = "notdown-numbered-list-display-change";

export function numberedListDisplay(): NumberedListDisplay {
  try { return localStorage.getItem(storageKey) === "notion" ? "notion" : "markdown"; }
  catch { return "markdown"; }
}

export function setNumberedListDisplay(value: NumberedListDisplay) {
  try { localStorage.setItem(storageKey, value); } catch { /* Still update open editors. */ }
  window.dispatchEvent(new CustomEvent(preferenceEvent, { detail: value }));
}

/** Presentation only: never change list attributes, source, or undo history. */
function decorations(doc: ProseMirrorNode, mode: NumberedListDisplay): DecorationSet {
  if (mode === "markdown") return DecorationSet.empty;
  const result: Decoration[] = [];
  const styles = ["decimal", "lower-alpha", "lower-roman"];
  const visit = (node: ProseMirrorNode, pos: number, depth: number | null) => {
    if (editorKind(node) === "ordered_list") {
      // An explicit letter/Roman list owns its subtree's numbering style.
      if (node.attrs.markerStyle !== "decimal") depth = null;
      if (depth !== null) {
        if (depth % 3 !== 0) result.push(Decoration.node(pos, pos + node.nodeSize, {
          style: `list-style-type: ${styles[depth % 3]}`,
        }));
        depth += 1;
      }
    }
    node.forEach((child, offset) => visit(child, pos + (node === doc ? 0 : 1) + offset, depth));
  };
  visit(doc, 0, 0);
  return DecorationSet.create(doc, result);
}

export function numberedListDisplayPlugin() {
  let mode = numberedListDisplay();
  let previousDoc: ProseMirrorNode | undefined;
  let previousMode: NumberedListDisplay | undefined;
  let cached = DecorationSet.empty;
  return new Plugin({
    props: {
      decorations(state) {
        if (state.doc !== previousDoc || mode !== previousMode) {
          cached = decorations(state.doc, mode);
          previousDoc = state.doc; previousMode = mode;
        }
        return cached;
      },
    },
    view(view) {
      const refresh = (event: Event) => {
        if (event instanceof StorageEvent && event.key !== storageKey && event.key !== null) return;
        mode = event instanceof CustomEvent ? event.detail : numberedListDisplay();
        view.updateState(view.state);
      };
      window.addEventListener(preferenceEvent, refresh);
      window.addEventListener("storage", refresh);
      return { destroy() {
        window.removeEventListener(preferenceEvent, refresh);
        window.removeEventListener("storage", refresh);
      } };
    },
  });
}
