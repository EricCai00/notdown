import { fromMarkdown } from "mdast-util-from-markdown";
import { parseDocument, isScalar } from "yaml";
import { parseNative } from "../markdown-engine/codec.js";
import { defaultSyntax } from "../markdown-engine/config.js";
import { editorKind } from "../document/node-identity.js";
import { nodeReference, markReference } from "../document/internal-reference.js";
import { destinationMarker } from "../document/markdown-destination.js";
import type { Page } from "./vault.js";

/** Rewrite only reference destinations, never reserialize the document. */
export function migratePageReferences(page: Pick<Page, "body" | "bodyFormat" | "syntax">, ids: Map<string, string>): string {
  const source = page.body;
  if (![...ids.keys()].some(id => source.includes(id) || source.includes(encodeURIComponent(id)))) return source;
  const edits: { start: number; end: number; text: string }[] = [];
  const protectedRanges: [number, number][] = [];
  const replaceAddress = (raw: string) => {
    const prefix = raw.startsWith("#page/") ? "#page/" : "";
    const offset = prefix.length, hash = raw.indexOf("#", offset);
    let address = raw.slice(offset, hash < 0 ? undefined : hash);
    try { address = decodeURIComponent(address); } catch { return raw; }
    const extension = !prefix && /\.md$/i.test(address) ? address.slice(-3) : "";
    const target = ids.get(extension ? address.slice(0, -3) : address);
    return target ? prefix + target + extension + (hash < 0 ? "" : raw.slice(hash)) : raw;
  };
  const yaml = /^(?:\uFEFF)?---[\t ]*\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[\t ]*(?:\r?\n|$)/.exec(source);
  if (yaml) {
    protectedRanges.push([0, yaml[0].length]);
    const doc = parseDocument(yaml[1]);
    if (doc.errors.length) throw new Error("Cannot migrate invalid document metadata");
    const base = yaml[0].indexOf(yaml[1]);
    for (const key of ["id", "parent"]) {
      const node = doc.get(key, true);
      if (isScalar(node) && typeof node.value === "string" && ids.has(node.value) && node.range)
        edits.push({ start: base + node.range[0], end: base + node.range[1], text: JSON.stringify(ids.get(node.value)) });
    }
  }
  const doc = parseNative(source, page.syntax ?? defaultSyntax(page.bodyFormat ?? "markdown"));
  const wikiTargets = new Set<string>(), titleFirstTargets = new Set<string>();
  doc.descendants(node => {
    if (["code_block", "executable_chunk", "opaque_block", "html_block", "math_block", "metadata_block"].includes(editorKind(node))) {
      if (typeof node.attrs.sourceStart === "number" && typeof node.attrs.sourceEnd === "number")
        protectedRanges.push([node.attrs.sourceStart, node.attrs.sourceEnd]);
      return false;
    }
    for (const reference of [nodeReference(node), ...node.marks.map(markReference)]) {
      if (reference?.syntax === "wiki") wikiTargets.add(reference.raw);
      if (reference?.syntax === "wiki-title-first") titleFirstTargets.add(reference.raw);
    }
  });
  const masked = source.split("");
  for (const [from, to] of protectedRanges) for (let i = from; i < to; i++)
    if (masked[i] !== "\r" && masked[i] !== "\n") masked[i] = " ";
  // NFM tree tabs are not CommonMark indented code. Keep an offset map while
  // removing them so the standard Markdown AST can locate inline destinations.
  const positions: number[] = [], chars: string[] = [];
  let lineStart = true;
  for (let i = 0; i < masked.length; i++) {
    if (lineStart && masked[i] === "\t") continue;
    chars.push(masked[i]); positions.push(i);
    lineStart = masked[i] === "\n" || masked[i] === "\r";
  }
  positions.push(source.length);
  const text = chars.join("");
  const inlineCode: [number, number][] = [];
  const visit = (node: any) => {
    const from = node.position?.start.offset, to = node.position?.end.offset;
    if (node.type === "inlineCode" && from !== undefined) inlineCode.push([positions[from], positions[to]]);
    if (["link", "definition"].includes(node.type) && typeof node.url === "string" && from !== undefined) {
      const replacement = replaceAddress(node.url);
      if (replacement !== node.url) {
        const raw = text.slice(from, to), marker = destinationMarker(raw, node.type === "definition");
        let start = marker;
        while (/\s/.test(raw[start] ?? "") && start < raw.length) start++;
        if (raw[start] === "<") start++;
        if (marker > 0 && raw.slice(start, start + node.url.length) === node.url)
          edits.push({ start: positions[from + start], end: positions[from + start + node.url.length], text: replacement });
        else throw new Error("A page reference cannot be rewritten without changing its source spelling");
      }
    }
    for (const child of node.children ?? []) visit(child);
  };
  visit(fromMarkdown(text));
  const visible = (start: number, end: number) => ![...protectedRanges, ...inlineCode].some(([a, b]) => start < b && end > a);
  for (const match of source.matchAll(/<(?:page-link|page|mention-page)\b[^>]*>|\[\[[^\]\r\n]+\]\]|::page\{[^}\r\n]*\}/g)) {
    const start = match.index!;
    if (!visible(start, start + match[0].length) || source[start - 1] === "\\") continue;
    const raw = match[0];
    if (raw.startsWith("[[")) {
      const parts = raw.slice(2, -2).split("|");
      const titleFirst = parts.length === 2 && titleFirstTargets.has(parts[1]);
      const address = titleFirst ? parts[1] : parts[0];
      if (!titleFirst && !wikiTargets.has(address)) continue;
      const offset = start + 2 + (titleFirst ? parts[0].length + 1 : 0), replacement = replaceAddress(address);
      if (replacement !== address) edits.push({ start: offset, end: offset + address.length, text: replacement });
    } else {
      const attr = /\b(?:url|id)\s*=\s*(["'])(.*?)\1/.exec(raw);
      if (!attr) continue;
      const replacement = replaceAddress(attr[2]);
      if (replacement !== attr[2]) {
        const offset = attr.index + attr[0].indexOf(attr[1]) + 1;
        edits.push({ start: start + offset, end: start + offset + attr[2].length, text: replacement });
      }
    }
  }
  let result = source, boundary = source.length;
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    if (edit.end > boundary) throw new Error("Overlapping page reference edits");
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
    boundary = edit.start;
  }
  return result;
}
