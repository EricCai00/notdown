import { isEditorKind } from "./node-identity";
import type { Node as PMNode } from "prosemirror-model";
import { writeAttributes } from "../markdown-engine/attributes";

/** Writes the shared table model using MultiMarkdown's spans and sections. */
export function multiMarkdownTable(table: PMNode, inline: (node: PMNode) => string, block?: (node: PMNode) => string): string {
  const rows: PMNode[] = [];
  let caption: PMNode | undefined;
  table.forEach((child) => isEditorKind(child, "table_caption") ? caption = child : rows.push(child));
  const occupied: { remaining: number; origin: number }[] = [];
  let origin = 0;
  const lines: string[] = [];
  let section: unknown;
  let width = 0;
  rows.forEach((row, rowIndex) => {
    if (rowIndex && row.attrs.section !== section && !rows[rowIndex - 1].attrs.header) lines.push("");
    section = row.attrs.section;
    const fields: string[] = [];
    let multiline = false;
    let col = 0;
    const continued = () => {
      let previous = -1;
      while (occupied[col]?.remaining > 0) {
        const span = occupied[col];
        fields.push(span.origin === previous ? "" : " ^^ ");
        previous = span.origin;
        span.remaining--; col++;
      }
    };
    row.forEach((cell) => {
      continued();
      const parts: string[] = [];
      const structured = cell.childCount > 1 || !isEditorKind(cell.firstChild, "paragraph");
      multiline ||= structured;
      cell.forEach((p) => parts.push(structured && block ? block(p) : inline(p)));
      const text = (structured ? parts.join("\n\n") : parts.join("<br>").replace(/ *\n/g, "<br>")).replace(/\|/g, "\\|");
      fields.push(" " + text + " ");
      const span = Number(cell.attrs.colspan) || 1;
      origin++;
      for (let i = 0; i < span; i++) {
        if (i) fields.push("");
        occupied[col++] = { remaining: Math.max(0, (Number(cell.attrs.rowspan) || 1) - 1), origin };
      }
    });
    continued();
    width = Math.max(width, col);
    if (multiline) {
      const columns = fields.map(field => field.split("\n"));
      const height = Math.max(2, ...columns.map(column => column.length));
      for (let line = 0; line < height; line++)
        lines.push("|" + columns.map(column => column[line] || "").join("|") + "|" + (line < height - 1 ? " \\" : ""));
    } else lines.push("|" + fields.join("|") + "|");
    if ((row.attrs.header || rowIndex === 0) && !rows[rowIndex + 1]?.attrs.header) {
      const aligns: string[] = [];
      row.forEach((cell) => {
        const align = cell.attrs.nfmAttrs?.align;
        for (let i = 0; i < (Number(cell.attrs.colspan) || 1); i++)
          aligns.push(({ left: ":---", center: ":---:", right: "---:" } as Record<string, string>)[align] || "---");
      });
      lines.push("| " + Array.from({ length: width }, (_, i) => aligns[i] || "---").join(" | ") + " |");
    }
  });
  if (caption) {
    const text = "[" + inline(caption).replace(/\n/g, " ") + "]" + (table.attrs.captionId ? "[" + table.attrs.captionId + "]" : "");
    if (table.attrs.captionSide === "top") lines.unshift(text);
    else lines.push(text);
  }
  const attributes = writeAttributes(table.attrs.markdownAttrs);
  if (attributes) lines.push("", ":" + attributes);
  return lines.join("\n");
}
