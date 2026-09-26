import { isEditorKind } from "./node-identity";
import type { Node as PMNode } from "prosemirror-model";
export function readMmdCitation(raw: string) {
  const match = /^(?:\[([^\]]*)\])?\[#([^\]]+)\](?:\[\])?$/.exec(raw);
  return match ? { key: match[2].replace(/;$/, ""), locator: match[1] || "", suppressed: /^not cited$/i.test(match[1] || "") } : null;
}
/** Replace only the inline bibliography text, retaining locator and delimiters. */
export function replaceMmdInlineBody(raw: string, body: string) {
  const citation = readMmdCitation(raw);
  if (!citation || !/\s/.test(citation.key)) throw new Error("Expected an inline bibliography entry.");
  if (!body.trim() || !/\s/.test(body.trim()) || /[\[\]\\\r\n]/.test(body) || body.endsWith(";"))
    throw new Error("Enter inline bibliography text with spaces, without brackets, backslashes, line breaks or a trailing semicolon.");
  const start = /^(?:\[[^\]]*\])?\[#/.exec(raw)![0].length;
  return raw.slice(0, start) + body + raw.slice(start + citation.key.length);
}
export function mmdCitations(doc: PMNode, bibliography: Record<string, string> = {}) {
  const definitions: { key: string; body: string; pos: number; node: PMNode }[] = [];
  doc.descendants((node, pos) => {
    if (isEditorKind(node, "syntax_block") && node.attrs.kind === "definition" && String(node.attrs.data.key).startsWith("#"))
      definitions.push({ key: node.attrs.data.key.slice(1), body: node.attrs.data.body, pos, node });
  });
  const entries: { key: string; body: string; number: number; missing: boolean; definition?: typeof definitions[number]; inline?: typeof definitions[number]; references: number[] }[] = [];
  const refs: { pos: number; number: number; label: string; suppressed: boolean; missing: boolean }[] = [];
  const byKey = new Map<string, typeof entries[number]>();
  doc.descendants((node, pos) => {
    if (!isEditorKind(node, "syntax_inline") || node.attrs.kind !== "citation") return;
    const citation = readMmdCitation(node.attrs.raw); if (!citation) return;
    const definition = definitions.find(d => d.key === citation.key), inline = /\s/.test(citation.key) && !definition;
    const body = definition?.body || bibliography[citation.key] || (inline ? citation.key : "");
    let entry = body && !inline ? byKey.get(citation.key) : undefined;
    if (!entry) {
      entry = { key: citation.key, body: body || citation.key, number: entries.length + 1, missing: !body, definition, inline: inline ? { key: citation.key, body: citation.key, pos, node } : undefined, references: [] };
      entries.push(entry); if (body && !inline) byKey.set(citation.key, entry);
    }
    if (!citation.suppressed) entry.references.push(pos);
    refs.push({ pos, number: entry.number, label: `(${citation.locator && !citation.suppressed ? citation.locator + ", " : ""}${entry.number})`, suppressed: citation.suppressed, missing: !body });
  });
  return { entries, refs, unused: definitions.filter(d => !entries.some(e => e.definition === d)) };
}
