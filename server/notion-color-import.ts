import type { Node as PMNode } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import { parseNative, serializeNative } from "../src/markdown-engine/codec.js";
import { editorKind } from "../src/document/node-identity.js";
import { inlineColors } from "../src/document/notion-syntax.js";
import type { SyntaxConfig } from "../src/markdown-engine/config.js";
import type { CachedNotionBlock, NotionCacheSnapshot } from "./notion-desktop-cache.js";

type Json = Record<string, any>;
type Colors = { color: string; bg_color: string };
type Run = { text: string; colors: Colors; styles: string; from: number; to: number };
const names = new Set(["gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"]);
const types = new Set(["paragraph", "heading_1", "heading_2", "heading_3", "heading_4", "bulleted_list_item", "numbered_list_item", "to_do", "toggle", "quote", "callout"]);
const color = (value: unknown): Colors | undefined => {
  if (value === "default") return { color: "", bg_color: "" };
  if (typeof value !== "string") return;
  const bg = value.endsWith("_background"), base = bg ? value.slice(0, -11) : value;
  return names.has(base) ? { color: bg ? "" : base, bg_color: bg ? base : "" } : undefined;
};
const signature = (bold: boolean, italic: boolean, strike: boolean, underline: boolean, code: boolean, link = "") => JSON.stringify([bold, italic, strike, underline, code, link]);
const sourceStyles = (node: PMNode) => signature(
  ...["strong", "em", "strike", "underline", "code"].map(kind => node.marks.some(mark => editorKind(mark) === kind)) as [boolean, boolean, boolean, boolean, boolean],
  node.marks.find(mark => editorKind(mark) === "link")?.attrs.href || "",
);
function publicRuns(block: Json): Run[] | undefined {
  const parts = block[block.type]?.rich_text;
  if (!types.has(block.type) || !Array.isArray(parts) || !parts.length || !Number.isFinite(Date.parse(block.last_edited_time))) return;
  const result: Run[] = []; let from = 0;
  for (const part of parts) {
    const a = part.annotations, colors = color(a?.color);
    if (part.type !== "text" || typeof part.text?.content !== "string" || !colors ||
        !["bold", "italic", "strikethrough", "underline", "code"].every(key => typeof a[key] === "boolean")) return;
    const text = part.text.content, to = from + text.length;
    result.push({ text, colors, from, to, styles: signature(a.bold, a.italic, a.strikethrough, a.underline, a.code, part.text.link?.url || "") }); from = to;
  }
  return result;
}
function cacheRuns(block: CachedNotionBlock, api: Json): Run[] | undefined {
  const cacheType: Record<string, string> = { paragraph: "text", heading_1: "header", heading_2: "sub_header", heading_3: "sub_sub_header", heading_4: "header_4", bulleted_list_item: "bulleted_list", numbered_list_item: "numbered_list", to_do: "to_do", toggle: "toggle", quote: "quote", callout: "callout" };
  if (block.type !== cacheType[api.type]) return;
  const edited = Date.parse(api.last_edited_time);
  if (!Number.isFinite(edited) || !Number.isFinite(block.lastEdited) ||
      (edited % 60000 ? edited !== block.lastEdited : Math.floor(edited / 60000) !== Math.floor(block.lastEdited / 60000))) return;
  const parts = block.properties.title;
  if (!Array.isArray(parts)) return;
  const result: Run[] = []; let from = 0;
  for (const part of parts) {
    if (!Array.isArray(part) || typeof part[0] !== "string" || part.length > 2 || part[1] && !Array.isArray(part[1])) return;
    const marks: any[] = part[1] || [], colors: Colors = { color: "", bg_color: "" };
    for (const mark of marks) {
      if (!Array.isArray(mark) || !["h", "b", "i", "s", "u", "c", "a"].includes(mark[0])) return;
      if (mark[0] !== "h") continue;
      const next = color(mark[1]); if (!next) return;
      for (const key of ["color", "bg_color"] as const) {
        if (colors[key] && next[key] && colors[key] !== next[key]) return;
        colors[key] ||= next[key];
      }
    }
    const text = part[0], to = from + text.length;
    result.push({ text, colors, from, to, styles: signature(
      ...["b", "i", "s", "u", "c"].map(kind => marks.some(mark => mark[0] === kind)) as [boolean, boolean, boolean, boolean, boolean],
      marks.find(mark => mark[0] === "a")?.[1] || "",
    ) }); from = to;
  }
  return result;
}
const overlaps = (runs: Run[], from: number, to: number) => runs.filter(run => run.from < to && run.to > from);
const nonColor = (node: PMNode) => {
  const result: unknown[] = [];
  node.forEach(child => { for (const char of child.text || "") result.push([char, child.marks.filter(mark => editorKind(mark) !== "color").map(mark => mark.toJSON())]); });
  return JSON.stringify(result);
};

/** Join only uniquely aligned complete text blocks, never substrings. Each
 * changed block is reparsed before its exact source range is patched. */
export function supplementNotionColors(source: string, blocks: readonly Json[], variant: "notdown" | "notion-markdown", snapshot?: NotionCacheSnapshot) {
  const syntax: SyntaxConfig = { version: 1, variant, notionVersion: "v2", extensions: {} };
  const doc = parseNative(source, syntax), candidates = new Map<string, PMNode[]>();
  doc.forEach(node => {
    if (!["paragraph", "heading"].includes(editorKind(node)) || !node.childCount ||
        node.content.content.some(child => !child.isText || child.marks.some(mark => !["strong", "em", "strike", "underline", "code", "link", "color"].includes(editorKind(mark))))) return;
    if (!candidates.has(node.textContent)) candidates.set(node.textContent, []);
    candidates.get(node.textContent)!.push(node);
  });
  const unique = new Map<string, Json>();
  for (const block of blocks) if (typeof block.id === "string") unique.set(block.id, block);
  const api = [...unique.values()].map(block => ({ block, runs: publicRuns(block) })).filter((entry): entry is { block: Json; runs: Run[] } => !!entry.runs);
  const textCounts = new Map<string, number>();
  for (const block of unique.values()) {
    const parts = block[block.type]?.rich_text;
    if (!Array.isArray(parts) || !parts.length || parts.some(part => typeof (part.text?.content ?? part.plain_text) !== "string")) continue;
    const text = parts.map(part => part.text?.content ?? part.plain_text).join(""); textCounts.set(text, (textCounts.get(text) || 0) + 1);
  }
  const cache = new Map<string, CachedNotionBlock>(), duplicateCache = new Set<string>();
  for (const block of snapshot?.blocks || []) {
    if (cache.has(block.id)) duplicateCache.add(block.id);
    cache.set(block.id, block);
  }
  for (const id of duplicateCache) cache.delete(id);
  const edits: { from: number; to: number; text: string }[] = [], evidence: Json[] = [], warnings = new Set<string>();
  let restoredApi = 0, restoredCache = 0;
  const warn = (id: string, reason: string) => { if (warnings.size < 12) warnings.add(`Color recovery for block ${id}: ${reason}; original Markdown retained.`); };
  for (const block of unique.values()) {
    const parts = block[block.type]?.rich_text;
    if (Array.isArray(parts) && parts.some(part => part.annotations?.color && part.annotations.color !== "default") && !publicRuns(block)) warn(block.id, "public rich-text shape is unsupported");
  }
  for (const { block, runs } of api) {
    if (duplicateCache.has(block.id)) { warn(block.id, "desktop cache identity is ambiguous"); continue; }
    const text = runs.map(run => run.text).join("");
    const cached = cache.get(block.id), fromCache = cached && cacheRuns(cached, block);
    const colored = runs.some(run => run.colors.color || run.colors.bg_color) || fromCache?.some(run => run.colors.color && run.colors.bg_color);
    if (!colored) continue;
    const matches = candidates.get(text);
    if (!text || textCounts.get(text) !== 1 || matches?.length !== 1) { warn(block.id, "complete block text is missing or ambiguous"); continue; }
    const node = matches[0], raw = node.attrs.source;
    const sourceType = editorKind(node) === "heading" ? `heading_${node.attrs.level}` : "paragraph";
    if (block.type !== sourceType) { warn(block.id, "block type does not match the Markdown"); continue; }
    if (typeof raw !== "string" || !raw) { warn(block.id, "source boundary is unavailable"); continue; }
    const from = node.attrs.sourceStart;
    if (typeof from !== "number" || source.slice(from, from + raw.length) !== raw) {
      warn(block.id, "source boundary is unavailable"); continue;
    }
    // A malformed or code-looking source block cannot become an editable match.
    const isolated = parseNative(raw, syntax);
    if (isolated.childCount !== 1 || isolated.firstChild!.type !== node.type || isolated.firstChild!.textContent !== text || nonColor(isolated.firstChild!) !== nonColor(node)) { warn(block.id, "isolated source does not match the text block"); continue; }
    const usableCache = fromCache && fromCache.map(run => run.text).join("") === text ? fromCache : undefined;
    const tr = EditorState.create({ doc: doc.type.create(null, node) }).tr;
    const changes: Json[] = []; let conflict = false;
    node.forEach((child, at) => {
      const old = child.marks.find(mark => editorKind(mark) === "color"), original = inlineColors(old?.attrs || {});
      const cuts = new Set([at, at + child.nodeSize]);
      for (const run of [...runs, ...(usableCache || [])]) if (run.from < at + child.nodeSize && run.to > at) { cuts.add(Math.max(at, run.from)); cuts.add(Math.min(at + child.nodeSize, run.to)); }
      const points = [...cuts].sort((a, b) => a - b);
      for (let i = 0; i < points.length - 1; i++) {
        const start = points[i], end = points[i + 1], publicRun = overlaps(runs, start, end)[0], cachedRun = usableCache && overlaps(usableCache, start, end)[0];
        if (!publicRun || publicRun.styles !== sourceStyles(child)) { conflict = true; continue; }
        if (cachedRun && cachedRun.styles !== publicRun.styles) { conflict = true; continue; }
        const combined = { ...original }; let method = "api";
        for (const key of ["color", "bg_color"] as const) {
          if (combined[key] && publicRun.colors[key] && combined[key] !== publicRun.colors[key]) conflict = true;
          combined[key] ||= publicRun.colors[key];
        }
        if (cachedRun) for (const key of ["color", "bg_color"] as const) {
          if (combined[key] && cachedRun.colors[key] && combined[key] !== cachedRun.colors[key]) conflict = true;
          if (!combined[key] && cachedRun.colors[key]) { combined[key] = cachedRun.colors[key]; method = "cache"; }
        }
        if (!combined.color || !combined.bg_color || combined.color === original.color && combined.bg_color === original.bg_color) continue;
        const attrs = { ...old?.attrs.nfmAttrs }; delete attrs.color; delete attrs.bg_color;
        tr.addMark(1 + start, 1 + end, node.type.schema.marks.color.create({ ...combined, nfmAttrs: attrs }));
        changes.push({ from: start, to: end, method, original, api: publicRun.colors, applied: combined });
      }
    });
    if (conflict) { warn(block.id, "styles or color channels conflict"); continue; }
    if (!changes.length) {
      if (cached && !usableCache) warn(block.id, "desktop cache is stale or does not match the public block");
      continue;
    }
    const replacement = serializeNative(tr.doc, syntax), reopened = parseNative(replacement, syntax);
    if (reopened.childCount !== 1 || reopened.firstChild!.type !== node.type || reopened.firstChild!.textContent !== text || nonColor(reopened.firstChild!) !== nonColor(node)) { warn(block.id, "round-trip validation failed"); continue; }
    const colorText = (value: PMNode) => JSON.stringify(value.content.content.flatMap(child => [...(child.text || "")].map(char => [char, inlineColors(child.marks.find(mark => editorKind(mark) === "color")?.attrs || {})])));
    if (colorText(reopened.firstChild!) !== colorText(tr.doc.firstChild!)) { warn(block.id, "color round-trip validation failed"); continue; }
    if (from > 0 && source[from - 1] !== "\n" && /[\r\n]/.test(replacement) && !/[\r\n]/.test(raw)) { warn(block.id, "replacement would change a surrounding block boundary"); continue; }
    edits.push({ from, to: from + raw.length, text: replacement });
    restoredApi += changes.filter(change => change.method === "api").length;
    restoredCache += changes.filter(change => change.method === "cache").length;
    evidence.push({ blockId: block.id, publicEdited: block.last_edited_time, changes,
      ...(changes.some(change => change.method === "cache") && cached ? { cache: { version: cached.version, lastEdited: cached.lastEdited, title: cached.properties.title } } : {}) });
  }
  edits.sort((a, b) => a.from - b.from);
  // Never apply overlapping patches produced by nested source projections.
  if (edits.some((edit, i) => i > 0 && edit.from < edits[i - 1].to)) return { source, restoredApi: 0, restoredCache: 0, evidence: [], warnings: ["Color recovery source ranges overlap; original Markdown retained."] };
  for (const edit of edits.reverse()) source = source.slice(0, edit.from) + edit.text + source.slice(edit.to);
  return { source, restoredApi, restoredCache, evidence, warnings: [...warnings] };
}
