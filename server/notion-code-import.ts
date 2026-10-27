import type { Node as PMNode } from "prosemirror-model";
import { parseNotionMarkdown } from "../src/document/notion-markdown.js";
import { editorKind } from "../src/document/node-identity.js";
import { codeLanguage } from "../src/editor/code-languages.js";

type Json = Record<string, any>;
const languageId = (value: string) => codeLanguage(value)?.id ?? value.trim().toLowerCase();
const unknownLanguage = (node: PMNode) => {
  const params = String(node.attrs.params || "").trim();
  // Mermaid has its own diagram path and intentionally is not in the menu.
  return !!params && params.toLowerCase() !== "mermaid" && !codeLanguage(params);
};

/** Known menu languages, aliases, plain text and diagrams need no API check. */
export function hasUnknownNotionCodeLanguage(source: string): boolean {
  let unknown = false;
  parseNotionMarkdown(source, undefined, undefined, "v2").descendants(node => {
    if (editorKind(node) !== "code_block") return;
    unknown ||= unknownLanguage(node);
    return false;
  });
  return unknown;
}

/** Markdown and Block API can disagree on a fence language (observed: shell
 * exported as shen). Only unknown labels are candidates. Join unique, complete
 * code bodies; patch only the opening language, preserving literal code,
 * attributes and the archived API source. */
export function supplementNotionCodeLanguages(source: string, blocks: readonly Json[]) {
  const nodes = new Map<string, PMNode[]>();
  parseNotionMarkdown(source, undefined, undefined, "v2").descendants(node => {
    if (editorKind(node) !== "code_block") return;
    const matches = nodes.get(node.textContent) ?? [];
    matches.push(node); nodes.set(node.textContent, matches);
    return false;
  });
  const api = new Map<string, Json[]>(), ids = new Set<string>();
  for (const block of blocks) {
    if (block.object !== "block" || block.type !== "code" || typeof block.id !== "string" || ids.has(block.id) || block.archived || block.in_trash) continue;
    ids.add(block.id);
    const parts = block.code?.rich_text;
    if (!Array.isArray(parts) || parts.some(part => part.type !== "text" || typeof part.text?.content !== "string")) continue;
    const text = parts.map(part => part.text.content).join("");
    const matches = api.get(text) ?? [];
    matches.push(block); api.set(text, matches);
  }
  const edits: { from: number; to: number; text: string }[] = [];
  const evidence: { blockId: string; from: string; to: string }[] = [], warnings: string[] = [];
  for (const [text, matches] of nodes) {
    if (!matches.some(unknownLanguage)) continue;
    const candidates = api.get(text);
    if (!text || !candidates?.length) continue;
    const block = candidates[0], language = block.code.language;
    if (typeof language !== "string" || !/^[a-z][a-z0-9+#. -]*$/i.test(language)) continue;
    if (matches.every(node => languageId(String(node.attrs.params || "")) === languageId(language)) && candidates.every(candidate => candidate.code.language === language)) continue;
    if (matches.length !== 1 || candidates.length !== 1) {
      warnings.push("Code language recovery: complete code text is ambiguous; original Markdown retained."); continue;
    }
    const node = matches[0], raw = node.attrs.source;
    if (typeof raw !== "string" || !raw) continue;
    // Nested readers may use slice-relative offsets. Resolve only a unique,
    // byte-identical source range, never a substring of an unrelated example.
    const start = source.indexOf(raw);
    if (start < 0 || source.indexOf(raw, start + 1) !== -1 || start > 0 && !/[\r\n]/.test(source[start - 1])) continue;
    const header = /^([\t ]*(?:`{3,}|~{3,})[\t ]*)([^\r\n]*)/.exec(raw);
    const fence = /^[\t ]*(`{3,}|~{3,})/.exec(raw)?.[1];
    if (!fence || !new RegExp(`^[\\t ]*${fence[0]}{${fence.length},}[\\t ]*$`).test(raw.split(/\r\n|\r|\n/).at(-1)!)) continue;
    const params = String(node.attrs.params || "");
    if (!header || !params || !header[2].startsWith(params) || !/^(?:[\t ]|$)/.test(header[2].slice(params.length))) continue;
    const from = start + header[1].length, to = from + params.length;
    const changed = raw.slice(0, header[1].length) + language + raw.slice(header[1].length + params.length);
    const verified: PMNode[] = [];
    parseNotionMarkdown(changed, undefined, undefined, "v2").descendants(next => { if (editorKind(next) === "code_block") verified.push(next); });
    if (verified.length !== 1 || verified[0].textContent !== text || verified[0].attrs.params !== language) continue;
    edits.push({ from, to, text: language }); evidence.push({ blockId: block.id, from: params, to: language });
  }
  for (const edit of edits.sort((a, b) => b.from - a.from)) source = source.slice(0, edit.from) + edit.text + source.slice(edit.to);
  return { source, restored: edits.length, evidence, warnings };
}
