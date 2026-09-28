import type { Node as PMNode } from "prosemirror-model";
import { Plugin, PluginKey, type EditorState } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import { isEditorKind } from "../document/node-identity";
import { tableMap } from "./table-selection";
import { normalizedTableWidths } from "../document/table-width-attributes";

type Widths = Map<number, number[]>;
type WidthState = { values: Widths; undo: Widths[]; redo: Widths[] };
type Change = { pos: number; widths: number[] } | { history: "undo" | "redo" };
export const tableWidthsKey = new PluginKey<WidthState>("table-column-widths");

export function adjustColumnWidths(widths: readonly number[], index: number, delta: number) {
  const next = [...widths];
  if (index < 0 || index >= widths.length - 1 || !Number.isFinite(delta)) return next;
  const pair = widths[index] + widths[index + 1], minimum = Math.min(48, pair / 2);
  next[index] = Math.round(Math.max(minimum, Math.min(pair - minimum, widths[index] + delta)) * 100) / 100;
  next[index + 1] = pair - next[index];
  return next;
}

/** Native colgroups or explicitly enabled Quarto table attributes persist widths. */
export function tableWidthAttrs(table: PMNode, widths: readonly number[], markdown = false) {
  if (table.attrs.syntaxForm !== "notion") return markdown ? { ...table.attrs, widths: widths.map(String), markdownAttrs: {
    ...table.attrs.markdownAttrs, "tbl-colwidths": normalizedTableWidths(widths),
  } } : null;
  const values = widths.map(width => String(Math.round(width * 100) / 100));
  return { ...table.attrs, widths: values,
    columnAttrs: values.map((width, index) => ({ ...table.attrs.columnAttrs[index], width })),
  };
}

export function setViewTableWidths(state: EditorState, pos: number, widths: number[]) {
  return state.tr.setMeta(tableWidthsKey, { pos, widths } satisfies Change).setMeta("addToHistory", false);
}

export function tableColumnWidths() {
  return new Plugin<WidthState>({ key: tableWidthsKey,
    state: {
      init: () => ({ values: new Map(), undo: [], redo: [] }),
      apply(tr, previous) {
        let current = previous;
        if (tr.docChanged) {
          const values: Widths = new Map();
          for (const [pos, widths] of previous.values) {
            const mapped = tr.mapping.mapResult(pos, 1);
            if (!mapped.deleted && isEditorKind(tr.doc.nodeAt(mapped.pos), "table") && tableMap(tr.doc, mapped.pos).width === widths.length)
              values.set(mapped.pos, widths);
          }
          // Source editing owns document undo. Temporary layout undo lasts until the next body edit.
          current = { values, undo: [], redo: [] };
        }
        const change = tr.getMeta(tableWidthsKey) as Change | undefined;
        if (!change) return current;
        if ("history" in change) {
          const stack = current[change.history], values = stack.at(-1);
          if (!values) return current;
          return change.history === "undo" ? { values, undo: stack.slice(0, -1), redo: [...current.redo, current.values] }
            : { values, undo: [...current.undo, current.values], redo: stack.slice(0, -1) };
        }
        const values = new Map(current.values); values.set(change.pos, [...change.widths]);
        return { values, undo: [...current.undo.slice(-49), current.values], redo: [] };
      },
    },
    props: {
      handleKeyDown(view, event) {
        if (!(event.ctrlKey || event.metaKey) || event.altKey) return false;
        const key = event.key.toLowerCase();
        const action = key === "z" ? event.shiftKey ? "redo" : "undo" : key === "y" ? "redo" : null;
        if (!action || !tableWidthsKey.getState(view.state)?.[action].length) return false;
        view.dispatch(view.state.tr.setMeta(tableWidthsKey, { history: action } satisfies Change).setMeta("addToHistory", false));
        return true;
      },
      decorations(state) {
        const decorations: Decoration[] = [], local = tableWidthsKey.getState(state)?.values;
        state.doc.descendants((node, pos) => {
          if (!isEditorKind(node, "table")) return;
          const widths = local?.get(pos) ?? (node.attrs.widths as string[]).map(value => /^\d+(?:\.\d+)?(?:px)?$/.test(value) ? parseFloat(value) : 0);
          const map = tableMap(state.doc, pos);
          if (widths.length !== map.width || !widths.every(width => Number.isFinite(width) && width > 0)) return false;
          const sum = widths.reduce((a, b) => a + b, 0);
          decorations.push(Decoration.node(pos, pos + node.nodeSize, { style: "table-layout:fixed;width:100%" }));
          for (const cell of map.cells) {
            const width = widths.slice(cell.c, cell.c + cell.w).reduce((a, b) => a + b, 0) / sum * 100;
            decorations.push(Decoration.node(cell.pos, cell.pos + cell.node.nodeSize, { style: `width:${width}%;box-sizing:border-box` }));
          }
          return false;
        });
        return DecorationSet.create(state.doc, decorations);
      },
    },
  });
}
