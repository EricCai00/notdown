import type { Node as PMNode } from "prosemirror-model";
import { isEditorKind } from "../document/node-identity";
import { tableMap } from "./table-selection";
import { syncTableWidthAttributes } from "../document/table-width-attributes";

/** Resize from an immutable starting table, so dragging back restores removed content. */
export function resizeTable(table: PMNode, width: number, height: number): PMNode {
  const schema = table.type.schema, map = tableMap(schema.topNodeType.create(null, table), 0);
  const rows: PMNode[] = [], captions: PMNode[] = [];
  table.forEach(node => (isEditorKind(node, "table_row") ? rows : captions).push(node));
  const minimum = Math.max(1, ...rows.map((row, index) => row.attrs.header ? index + 1 : 1));
  width = Math.max(1, Math.min(map.width + 100, Math.round(width) || 1));
  height = Math.max(minimum, Math.min(map.height + 100, Math.round(height) || minimum));
  if (width === map.width && height === map.height) return table;
  const content = Array.from({ length: height }, (_, r) => {
    const cells: PMNode[] = [];
    for (let c = 0; c < width; c++) {
      const cell = map.grid[r]?.[c];
      if (cell) {
        if (cell.r === r && cell.c === c) cells.push(cell.node.type.create({ ...cell.node.attrs,
          colspan: Math.min(cell.w, width - c), rowspan: Math.min(cell.h, height - r),
        }, cell.node.content, cell.node.marks));
      } else {
        const align = map.grid[0]?.[c]?.node.attrs.nfmAttrs?.align;
        cells.push(schema.nodes["structure.table_cell"].create({ header: !!rows[r]?.attrs.header, nfmAttrs: align ? { align } : {} }, schema.nodes["block.paragraph"].create()));
      }
    }
    const original = rows[r];
    return schema.nodes["structure.table_row"].create(original?.attrs ?? { section: rows.at(-1)?.attrs.section ?? 0 }, cells);
  });
  const resizeAttributes = (values: unknown[], blank: () => unknown) => values.length
    ? Array.from({ length: width }, (_, c) => values[c] ?? blank()) : values;
  return table.type.create(syncTableWidthAttributes({ ...table.attrs,
    columnAttrs: resizeAttributes(table.attrs.columnAttrs, () => ({})),
  }, resizeAttributes(table.attrs.widths, () => "")), [...captions, ...content], table.marks);
}
