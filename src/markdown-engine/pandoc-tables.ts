import type MarkdownIt from "markdown-it";
import type { Node as PMNode } from "prosemirror-model";
import { editorSchema as schema } from "../editor-schema";
import { enabled, type SyntaxConfig } from "./config";
import { readAttributes, writeAttributes } from "./attributes";

type Cell = { raw: string; colspan: number; rowspan: number; align: string };
type Row = { cells: Cell[]; header: boolean };
export function installPandocTables(md: MarkdownIt, config: SyntaxConfig, parse: (raw: string, env: any) => PMNode) {
  md.block.ruler.before("table", "pandoc_tables", (s, start, end, silent) => {
    if (s.sCount[start] - s.blkIndent >= 4) return false;
    const line = (n: number) => n < end ? s.src.slice(s.bMarks[n] + s.blkIndent, s.eMarks[n]) : "";
    let first = start, caption = "", captionSide = "bottom";
    if (enabled(config, "table_captions")) {
      const m = /^(?:Table:|:)\s+(.+)$/.exec(line(first));
      if (m) { caption = m[1]; captionSide = "top"; first++; while (first < end && s.isEmpty(first)) first++; }
    }
    let next = first, syntaxForm = "", rows: Row[] = [];
    const top = line(first);
    if (enabled(config, "grid_tables") && /^\+(?:[-=]+\+)+\s*$/.test(top)) {
      syntaxForm = "grid";
      const edges = [...top.matchAll(/\+/g)].map(m => m.index!); next++;
      let barrier = top;
      let owners: (Cell | undefined)[] = [];
      while (next < end) {
        const data: string[] = [];
        while (next < end && !/^\+[\s=+:-]+\+\s*$/.test(line(next))) {
          if (!line(next).startsWith("|") || line(next)[edges.at(-1)!] !== "|") return false;
          data.push(line(next++));
        }
        if (!data.length || next === end) break;
        const border = line(next++), cells: Cell[] = [], newOwners: (Cell | undefined)[] = [];
        for (let c = 0; c < edges.length - 1;) {
          let span = 1;
          while (c + span < edges.length - 1 && data.every(text => text[edges[c + span]] !== "|")) span++;
          const raw = data.map(text => text.slice(edges[c] + 1, edges[c + span]).replace(/ +$/, "")).join("\n");
          const indentation = Math.min(...raw.split("\n").filter(Boolean).map(text => /^ */.exec(text)![0].length));
          const body = raw.split("\n").map(text => text.slice(Number.isFinite(indentation) ? indentation : 0)).join("\n").trim();
          const previous = owners[c];
          if (previous && !/[-=]/.test(barrier.slice(edges[c] + 1, edges[c + span]))) {
            previous.rowspan++; previous.raw += (previous.raw && body ? "\n" : "") + body;
            for (let k = 0; k < span; k++) newOwners[c + k] = previous;
          } else {
            const cell = { raw: body, colspan: span, rowspan: 1, align: "" };
            cells.push(cell); for (let k = 0; k < span; k++) newOwners[c + k] = cell;
          }
          c += span;
        }
        rows.push({ cells, header: /=/.test(border) }); owners = newOwners; barrier = border;
        if (!line(next).startsWith("|")) break;
      }
      if (!rows.length) return false;
    } else if (enabled(config, "simple_tables") || enabled(config, "multiline_tables")) {
      const rule = (text: string) => /^ *-+(?: +-+)+ *$/.test(text);
      const full = (text: string) => /^-{3,}\s*$/.test(text);
      let separator = first, headerLines: string[] = [], multiline = false;
      if (full(top) && enabled(config, "multiline_tables")) {
        multiline = true; separator++;
        while (separator < end && !rule(line(separator)) && !full(line(separator)) && !s.isEmpty(separator)) headerLines.push(line(separator++));
      } else if (!rule(top)) {
        if (!enabled(config, "simple_tables") || !rule(line(first + 1))) return false;
        headerLines = [top]; separator++;
      }
      if (!rule(line(separator))) return false;
      if (!multiline && !enabled(config, "simple_tables")) return false;
      const segments = [...line(separator).matchAll(/-+/g)], columns = segments.map(m => m.index!);
      const widths = segments.map(m => m[0].length);
      const last = columns.at(-1)! + widths.at(-1)!;
      const split = (lines: string[]) => columns.map((col, i): Cell => {
        const nextCol = columns[i + 1] ?? Math.max(last, ...lines.map(l => l.length));
        const fragments = lines.map(l => l.slice(col, nextCol));
        const header = headerLines[0]?.slice(col, col + widths[i]) || "";
        const align = /^\s+\S.*\s+$/.test(header) ? "center" : /^\s+\S/.test(header) ? "right" : /\S\s+$/.test(header) ? "left" : "";
        return { raw: fragments.map(l => l.trim()).join(multiline ? "\n" : " "), colspan: 1, rowspan: 1, align };
      });
      if (headerLines.length) rows.push({ cells: split(headerLines), header: true });
      next = separator + 1;
      while (next < end && !full(line(next)) && !rule(line(next))) {
        if (s.isEmpty(next)) { if (!multiline) break; next++; continue; }
        const lines = [line(next++)];
        if (multiline) while (next < end && !s.isEmpty(next) && !full(line(next)) && !rule(line(next))) lines.push(line(next++));
        rows.push({ cells: split(lines), header: false });
      }
      if (full(line(next)) || rule(line(next))) next++;
      else if (multiline) return false;
      if (rows.length <= (headerLines.length ? 1 : 0)) return false;
      syntaxForm = multiline ? "multiline" : "simple";
    } else return false;
    let attributes: Record<string, string> = {};
    let tail = next; while (tail < end && s.isEmpty(tail)) tail++;
    if (enabled(config, "table_captions")) {
      const m = /^(?:Table:|:)\s+(.+)$/.exec(line(tail));
      if (m) { caption = m[1]; captionSide = "bottom"; next = tail + 1; }
    }
    if (enabled(config, "table_attributes")) {
      const m = /\s*\{([^{}]+)\}$/.exec(caption);
      if (m) { attributes = readAttributes(m[0].trim()); caption = caption.slice(0, m.index); }
      if (/^\{[^{}]+\}$/.test(line(next))) { attributes = { ...attributes, ...readAttributes(line(next)) }; next++; }
    }
    if (silent) return true;
    const children = rows.map(row => schema.nodes.table_row.create({ header: row.header }, row.cells.map(cell => schema.nodes.table_cell.create({ colspan: cell.colspan, rowspan: cell.rowspan, nfmAttrs: cell.align ? { align: cell.align } : {} }, parse(cell.raw, s.env).content))));
    if (caption) children.unshift(schema.nodes.table_caption.create(null, parse(caption, s.env).firstChild?.content));
    const token = s.push("source_node", "", 0); token.block = true; token.map = [start, next];
    token.meta = { node: schema.nodes.table.create({ syntaxForm, captionSide, markdownAttrs: attributes, captionId: attributes.id || "", nfmAttrs: { "header-row": String(rows[0]?.header || false) } }, children) };
    s.line = next; return true;
  }, { alt: ["paragraph", "reference", "blockquote", "list"] });
}

/** Canonical grid output handles block cells and keeps span geometry. */
export function writeGridTable(table: PMNode, write: (node: PMNode) => string) {
  const rows: PMNode[] = []; let caption: PMNode | undefined;
  table.forEach(n => n.type.name === "table_caption" ? caption = n : rows.push(n));
  type Placement = { node: PMNode; row: number; col: number; colspan: number; rowspan: number; lines: string[] };
  const grid: Placement[][] = rows.map(() => []), placements: Placement[] = [];
  rows.forEach((row, r) => { let c = 0; row.forEach(node => {
    while (grid[r][c]) c++;
    const lines: string[] = []; node.forEach(n => lines.push(write(n)));
    const p = { node, row: r, col: c, colspan: Math.max(1, Number(node.attrs.colspan) || 1), rowspan: Math.max(1, Number(node.attrs.rowspan) || 1), lines: lines.join("\n\n").split("\n") };
    placements.push(p); for (let y = r; y < Math.min(rows.length, r + p.rowspan); y++) for (let x = c; x < c + p.colspan; x++) grid[y][x] = p; c += p.colspan;
  }); });
  const count = Math.max(1, ...grid.map(r => r.length)); const widths = Array.from({length:count}, () => 5);
  for (const p of placements) { const needed = Math.max(...p.lines.map(l => l.length)) + 2; const current = widths.slice(p.col, p.col + p.colspan).reduce((a,b)=>a+b,0) + p.colspan - 1; if(needed>current) widths[p.col+p.colspan-1] += needed-current; }
  const border = (r: number) => "+" + widths.map((w,c) => (r >= 0 && grid[r][c] && grid[r+1]?.[c] === grid[r][c] ? " " : rows[r]?.attrs.header && !rows[r+1]?.attrs.header ? "=" : "-").repeat(w)).join("+") + "+";
  const output = [border(-1)];
  for(let r=0;r<rows.length;r++) {
    const height = Math.max(1, ...placements.filter(p=>p.row===r).map(p=>p.lines.length));
    for(let line=0;line<height;line++) {
      let text = "|";
      for(let c=0;c<count;) { const p=grid[r][c], span=p?.colspan||1, width=widths.slice(c,c+span).reduce((a,b)=>a+b,0)+span-1; const value=p?.row===r?p.lines[line]||"":""; text += (" "+value).padEnd(width," ")+"|"; c+=span; }
      output.push(text);
    }
    output.push(border(r));
  }
  if(caption) { const value = "Table: " + write(caption) + writeAttributes(table.attrs.markdownAttrs); if(table.attrs.captionSide === "top") output.unshift(value,""); else output.push("",value); }
  else if (Object.keys(table.attrs.markdownAttrs || {}).length) output.push(writeAttributes(table.attrs.markdownAttrs).trim());
  return output.join("\n");
}
export function writeSimpleTable(table: PMNode, write: (node: PMNode) => string): string {
  const rows: PMNode[] = []; let caption: PMNode | undefined;
  table.forEach(n => n.type.name === "table_caption" ? caption = n : rows.push(n));
  const values = rows.map(row => { const cells: string[][] = []; row.forEach(cell => { const blocks: string[] = []; cell.forEach(n => blocks.push(write(n))); cells.push(blocks.join("\n\n").split("\n")); }); return cells; });
  const width = Math.max(...values.map(r => r.length));
  const widths = Array.from({length:width}, (_, i) => Math.max(3, ...values.flatMap(r => (r[i] || [""]).map(v=>v.length))) + 2);
  const multiline = table.attrs.syntaxForm === "multiline" || values.some(r=>r.some(c=>c.length>1));
  const separator = widths.map(w=>"-".repeat(w)).join(" "), full = "-".repeat(separator.length);
  const output: string[] = multiline ? [full] : [];
  values.forEach((row, r) => {
    if(r===0 && !rows[r].attrs.header) output.push(separator);
    const height = Math.max(1,...row.map(c=>c.length));
    for(let line=0;line<height;line++) output.push(widths.map((w,i) => {
      const v=row[i]?.[line] || "", align=rows[r].maybeChild(i)?.attrs.nfmAttrs?.align;
      return align==="right" ? v.padStart(w) : align==="center" ? v.padStart(Math.floor((w+v.length)/2)).padEnd(w) : v.padEnd(w);
    }).join(" ").trimEnd());
    if(rows[r].attrs.header && !rows[r+1]?.attrs.header) output.push(separator);
    else if(multiline && r<rows.length-1) output.push("");
  });
  if(multiline) output.push(full);
  if(caption) { const v="Table: "+write(caption) + writeAttributes(table.attrs.markdownAttrs); if(table.attrs.captionSide==="top") output.unshift(v,""); else output.push("",v); }
  else if (Object.keys(table.attrs.markdownAttrs || {}).length) output.push(writeAttributes(table.attrs.markdownAttrs).trim());
  return output.join("\n");
}
