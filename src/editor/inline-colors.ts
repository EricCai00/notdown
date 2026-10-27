import type { Mark } from "prosemirror-model";
import type { EditorState } from "prosemirror-state";
import { inlineColors } from "../document/notion-syntax";

export const inlineColorNames = ["gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"] as const;
export type InlineColorKind = "color" | "background";
const channel = (kind: InlineColorKind) => kind === "background" ? "bg_color" : "color";

/** An empty string is the default; null means a selection with mixed colors. */
export function selectedInlineColor(state: EditorState, kind: InlineColorKind): string | null {
  const value = (marks: readonly Mark[]) => inlineColors(marks.find(mark => mark.type === state.schema.marks.color)?.attrs ?? {})[channel(kind)];
  const { from, to, empty, $from } = state.selection;
  if (empty) return value(state.storedMarks ?? $from.marks());
  let selected: string | undefined;
  let mixed = false;
  state.doc.nodesBetween(from, to, node => {
    if (!node.isInline) return;
    const next = value(node.marks);
    if (selected !== undefined && selected !== next) mixed = true;
    selected = next;
  });
  return mixed ? null : selected ?? "";
}

/** Change one supported channel, retaining other marks and unknown span fields. */
export function inlineColorTransaction(state: EditorState, kind: InlineColorKind, value: string, combine: boolean) {
  if (value !== "" && !inlineColorNames.some(name => name === value)) return null;
  const type = state.schema.marks.color;
  const markFor = (marks: readonly Mark[]) => {
    const old = marks.find(mark => mark.type === type);
    const colors = inlineColors(old?.attrs ?? {});
    colors[channel(kind)] = value;
    // v2 can combine channels through nested official spans; legacy official
    // files still use a single color attribute until explicitly switched.
    if (!combine && value) colors[channel(kind === "color" ? "background" : "color")] = "";
    const nfmAttrs = { ...old?.attrs.nfmAttrs };
    delete nfmAttrs.color; delete nfmAttrs.bg_color; delete nfmAttrs.underline;
    if (!colors.color && !colors.bg_color && !Object.keys(nfmAttrs).length) return null;
    return type.create({
      color: !combine && colors.bg_color ? `${colors.bg_color}_bg` : colors.color,
      bg_color: combine ? colors.bg_color : "", nfmAttrs,
    });
  };
  const tr = state.tr, { from, to, empty, $from } = state.selection;
  if (empty) {
    const marks = state.storedMarks ?? $from.marks(), mark = markFor(marks);
    tr.setStoredMarks(mark ? mark.addToSet(marks) : type.removeFromSet(marks));
  } else state.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isInline) return;
    const start = Math.max(from, pos), end = Math.min(to, pos + node.nodeSize), mark = markFor(node.marks);
    tr.removeMark(start, end, type);
    if (mark) tr.addMark(start, end, mark);
  });
  return tr;
}
