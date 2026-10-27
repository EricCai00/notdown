import { editorKind, isEditorKind } from "./node-identity";
import type { Node as PMNode } from "prosemirror-model";
import { notionInline } from "./notion-markdown";

export const hasOfficialDateTime = (node: PMNode) =>
  isEditorKind(node, "mention") && node.attrs.kind === "date" &&
    (Object.hasOwn(node.attrs.nfmAttrs, "startTime") || Object.hasOwn(node.attrs.nfmAttrs, "endTime") || Object.hasOwn(node.attrs.nfmAttrs, "timeZone"));

/** Notion properties missing from the documented enhanced Markdown format.
 * Unknown source is retained; these properties only acquire semantics in Notdown. */
export const supplementalAttributes: Record<string, readonly string[]> = {
  notion_embed: ["width", "height", "align", "title"],
  code_block: ["caption"],
  column: ["width-ratio"],
  heading: ["open"],
  toggle_block: ["open"],
  mention: ["reminder", "reminder-offset", "date-format", "time-format", "time-zone"],
  synced_block: ["id", "source-revision", "snapshot-hash", "auto-refresh", "auto-sync"],
  meeting_notes: ["meeting-config"],
};

export function hasSupplementalAttributes(node: PMNode, allowDualColors = false): boolean {
  if (isEditorKind(node, "meeting_notes") && node.attrs.syntaxForm === "notion" &&
      notionInline(String(node.attrs.title || "")).some(child => hasSupplementalAttributes(child, allowDualColors))) return true;
  if (node.type.name === "block.link_to_page") return true;
  if (node.marks.some(mark => isEditorKind(mark, "color") &&
      (!allowDualColors && mark.attrs.bg_color || Object.hasOwn(mark.attrs.nfmAttrs || {}, "bg_color")))) return true;
  if (isEditorKind(node, "table") && node.attrs.syntaxForm === "notion" &&
      (node.attrs.columnAttrs || []).some((attrs: Record<string, unknown>) => Object.keys(attrs).some(key => !["color", "width"].includes(key)))) return true;
  if (isEditorKind(node, "mention") && node.attrs.kind === "date" &&
      [node.attrs.nfmAttrs?.start, node.attrs.nfmAttrs?.end].some(value => typeof value === "string" && value.includes("T"))) return true;
  return (supplementalAttributes[editorKind(node)] || []).some(key =>
    Object.hasOwn(node.attrs.nfmAttrs || {}, key));
}

/** Spans and captions have existing Pandoc encodings, not Notion table syntax. */
export function needsMarkdownTable(node: PMNode): boolean {
  if (!isEditorKind(node, "table") || node.attrs.syntaxForm !== "notion") return false;
  let extended = false;
  node.descendants(child => {
    if (isEditorKind(child, "table_caption") || isEditorKind(child, "table_cell") &&
      (child.attrs.colspan > 1 || child.attrs.rowspan > 1 || child.attrs.nfmAttrs?.align)) extended = true;
  });
  return extended;
}

/** Refuse conversions whose source attributes have no grid-table equivalent. */
export function canConvertNotionTable(node: PMNode): boolean {
  if (node.attrs.syntaxForm !== "notion") return true;
  let safe = !(node.attrs.widths || []).some(Boolean) &&
    !(node.attrs.columnAttrs || []).some((attrs: object) => Object.keys(attrs).length);
  const check = (child: PMNode) => {
    if (!["table", "table_row", "table_cell", "table_caption"].includes(editorKind(child))) return;
    const allowed = isEditorKind(child, "table") ? ["header-row"] : isEditorKind(child, "table_cell") ? ["align", "colspan", "rowspan"] : [];
    if (child.attrs.color || Object.keys(child.attrs.nfmAttrs || {}).some(key => !allowed.includes(key))) safe = false;
  };
  check(node); node.descendants(check);
  return safe;
}
