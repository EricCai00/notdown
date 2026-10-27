import { fromMarkdown } from "mdast-util-from-markdown";
import type { Nodes } from "mdast";
import type { Node as PMNode } from "prosemirror-model";
import { editorKind } from "../document/node-identity";
import { mmdCitations, readMmdCitation } from "../document/mmd-citations";
import { markReference, nodeReference, resolveReferencePage, type ReferencePage } from "../document/internal-reference";
import { metadataValues } from "../markdown-engine/products";
import { inlineSource, inlineText, type InlineTarget } from "./inline-context";

export interface InlineSourceDetails {
  source: string;
  reference?: { source: string; description?: string };
}

/** Resolve supporting source without interpreting code fences or rewriting content. */
export function inlineSourceDetails(doc: PMNode, target: InlineTarget, serialize: (doc: PMNode) => string, context: { pages?: readonly ReferencePage[]; currentPageId?: string } = {}): InlineSourceDetails {
  const result: InlineSourceDetails = { source: inlineSource(doc, target, serialize) };
  const { node, mark } = target, kind = mark ? editorKind(mark) : editorKind(node);
  const isolated = (node: PMNode) => serialize(doc.type.create({ sourceFormat: doc.attrs.sourceFormat, sourceNewline: doc.attrs.sourceNewline }, node));
  if (kind === "footnote_reference") {
    let definition: PMNode | undefined;
    doc.descendants(n => { if (editorKind(n) === "footnote" && n.attrs.label === node.attrs.label) { definition = n; return false; } });
    result.reference = definition ? { source: isolated(definition) } : { source: "", description: `Footnote definition not found: ${node.attrs.label}` };
  } else if (!mark && kind === "syntax_inline" && node.attrs.kind === "citation") {
    const key = readMmdCitation(node.attrs.raw)?.key;
    const entry = key ? mmdCitations(doc).entries.find(entry => entry.key === key) : undefined;
    result.reference = entry?.definition ? { source: entry.definition.node.attrs.raw }
      : entry?.inline ? { source: entry.inline.body, description: "Bibliography text is stored in this inline citation." }
      : { source: "", description: "Citation definition not found in this document." };
    if (!key) {
      const paths: string[] = [];
      doc.descendants(n => {
        if (editorKind(n) === "syntax_block" && n.attrs.kind === "metadata") {
          const metadata = metadataValues(n.attrs.raw, n.attrs.metadataForm);
          if (metadata.bibliography || metadata.bibtex) paths.push(String(metadata.bibliography || metadata.bibtex));
        }
      });
      result.reference = { source: paths.join("\n"), description: paths.length ? "External bibliography configured for this document. Its file contents are not embedded here." : "No local bibliography source is configured for this citation." };
    }
  } else if (!mark && kind === "syntax_inline" && ["abbreviation", "glossary"].includes(node.attrs.kind)) {
    const key = (node.attrs.kind === "abbreviation" ? ">" : "?") + node.attrs.label;
    let definition: PMNode | undefined;
    doc.descendants(n => { if (editorKind(n) === "syntax_block" && n.attrs.kind === "definition" && n.attrs.data.key === key) definition ??= n; });
    result.reference = definition ? { source: definition.attrs.raw } : { source: node.attrs.title || "", description: "Expansion stored with this inline, or unresolved reference." };
  } else if (mark && kind === "abbreviation") {
    result.reference = { source: String(mark.attrs.title), description: "Abbreviation expansion" };
  } else if (!mark && kind === "syntax_inline" && node.attrs.kind === "variable") {
    const key = /^\[%([^\]]+)\]$/.exec(node.attrs.raw)?.[1];
    let source = "";
    doc.descendants(n => {
      if (editorKind(n) === "syntax_block" && n.attrs.kind === "metadata" && key && Object.hasOwn(metadataValues(n.attrs.raw, n.attrs.metadataForm), key)) source = n.attrs.raw;
    });
    result.reference = { source, description: source ? "Document metadata containing this variable" : "Variable not found in document metadata." };
  } else {
    const href = String(mark?.attrs.href || node.attrs.src || node.attrs.url || "");
    if (href) {
      result.reference = { source: href + ((mark?.attrs.title || node.attrs.title) ? `\nTitle: ${mark?.attrs.title || node.attrs.title}` : "") };
      // MDAST supplies source ranges and parsed definitions, so bracket-like text
      // in code and unrelated definitions can never masquerade as this source.
      const source = serialize(doc), root = fromMarkdown(source);
      const definitions = new Map<string, Extract<Nodes, { type: "definition" }>>();
      const visit = (node: Nodes, fn: (node: Nodes) => void) => { fn(node); if ("children" in node) node.children.forEach(child => visit(child, fn)); };
      const text = (node: Nodes): string => "children" in node ? node.children.map(text).join("") : "value" in node ? node.value : "alt" in node ? node.alt || "" : "";
      visit(root, n => { if (n.type === "definition" && !definitions.has(n.identifier)) definitions.set(n.identifier, n); });
      const image = kind === "image", label = image ? String(node.attrs.alt || "") : inlineText(doc, target);
      const candidates: { node: Nodes; definition?: Extract<Nodes, { type: "definition" }> }[] = [];
      visit(root, n => {
        if (image ? n.type !== "image" && n.type !== "imageReference" : n.type !== "link" && n.type !== "linkReference") return;
        const definition = "identifier" in n ? definitions.get(n.identifier) : undefined;
        if (("url" in n ? n.url : definition?.url) === href && text(n) === label) candidates.push({ node: n, definition });
      });
      let occurrence = 0, previousEnd = -1;
      doc.descendants((n, pos) => {
        if (pos >= target.from) return false;
        if (image) { if (editorKind(n) === "image" && n.attrs.src === href && n.attrs.alt === label) occurrence++; }
        else {
          const link = n.marks.find(m => editorKind(m) === "link" && m.attrs.href === href);
          if (link && pos >= previousEnd) {
            // The same link can span multiple styled text nodes.
            const resolved = doc.resolve(pos), siblings = resolved.parent;
            let from = pos, to = pos + n.nodeSize;
            siblings.forEach((sibling, offset) => { const at = resolved.start() + offset; if (at === to && link.isInSet(sibling.marks)) to += sibling.nodeSize; });
            previousEnd = to;
            if (doc.textBetween(from, to, "", "") === label) occurrence++;
          }
        }
      });
      const candidate = candidates[occurrence];
      const slice = (n: Nodes) => source.slice(n.position!.start.offset, n.position!.end.offset);
      if (candidate?.definition && candidate.node.position && candidate.definition.position) {
        result.source = slice(candidate.node);
        result.reference = { source: slice(candidate.definition), description: "Reference definition in this document" };
      }
    } else if (kind === "page_link") result.reference = { source: String(node.attrs.target || ""), description: "Page or location target" };
    else if (!mark && kind === "syntax_inline" && node.attrs.kind === "unresolved_reference") result.reference = { source: "", description: "Reference definition not found in this document." };
  }
  const reference = mark ? markReference(mark) : nodeReference(node);
  if (reference && reference.addressing !== "url") {
    const page = resolveReferencePage(reference, context.pages || [], context.currentPageId);
    result.reference = { source: [page && `Page: ${page.title}`, page && `ID: ${page.id}`, `Target: ${reference.raw}`].filter(Boolean).join("\n"),
      description: page ? "Local page or location reference" : "Target page was not found or is ambiguous in this vault." };
  }
  return result;
}
