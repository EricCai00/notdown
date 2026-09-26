import { isEditorKind } from "../document/node-identity";
import type { Node as PMNode } from "prosemirror-model";
import type { EditorState } from "prosemirror-state";
import { closeHistory } from "prosemirror-history";

/** Local Markdown extension, not an attribute documented by Notion's Markdown API. */
export function columnWidths(node: PMNode): number[] {
  const values: number[] = [];
  node.forEach((child) =>
    values.push(Number(child.attrs.nfmAttrs?.["width-ratio"])),
  );
  if (
    values.some((value) => !Number.isFinite(value) || value <= 0 || value >= 1)
  )
    return values.map(() => 1 / values.length);
  const sum = values.reduce((a, b) => a + b, 0);
  return values.map((value) => value / sum);
}

export function columnTracks(widths: readonly number[]): string {
  return widths.map((width) => `minmax(0, ${width}fr)`).join(" ");
}

export function resizeColumnPair(
  widths: readonly number[],
  index: number,
  delta: number,
  available: number,
): number[] {
  const result = [...widths];
  const pair = widths[index] + widths[index + 1];
  const minimum = Math.min(80 / available, pair / 2);
  result[index] = Math.max(
    minimum,
    Math.min(pair - minimum, widths[index] + delta / available),
  );
  result[index + 1] = pair - result[index];
  return result;
}

export function columnWidthTransaction(
  state: EditorState,
  pos: number,
  widths: readonly number[],
) {
  const node = state.doc.nodeAt(pos);
  if (
    !isEditorKind(node, "columns") ||
    node.childCount !== widths.length ||
    widths.some((value) => !Number.isFinite(value) || value <= 0 || value >= 1)
  )
    return null;
  const sum = widths.reduce((a, b) => a + b, 0);
  const tr = closeHistory(state.tr).setMeta("isolateHistory", true);
  let used = 0;
  node.forEach((column, offset, index) => {
    const units =
      index === widths.length - 1
        ? 1_000_000 - used
        : Math.min(
            1_000_000 - used - (widths.length - index - 1),
            Math.max(1, Math.round((widths[index] / sum) * 1_000_000)),
          );
    used += units;
    tr.setNodeMarkup(pos + 1 + offset, undefined, {
      ...column.attrs,
      nfmAttrs: {
        ...column.attrs.nfmAttrs,
        "width-ratio": String(units / 1_000_000),
      },
    });
  });
  return tr;
}
