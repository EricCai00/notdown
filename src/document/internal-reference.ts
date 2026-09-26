import { editorKind, isEditorKind } from "./node-identity";
import type { Mark, Node as PMNode } from "prosemirror-model";

export type ReferenceSyntax = "wiki" | "wiki-title-first" | "markdown" | "mention";
export interface InternalReference {
  kind: "page" | "location";
  address: string;
  addressing: "id" | "path" | "wiki" | "current" | "url";
  fragment: string;
  locator: "heading" | "block" | "anchor" | null;
  syntax: ReferenceSyntax;
  raw: string;
}
export const decodeReference = (value: string): string => {
  try { return decodeURIComponent(value); } catch { return value; }
};

/** A shared semantic projection. Original Markdown/attributes remain authoritative. */
export function internalReference(raw: string, syntax: ReferenceSyntax = "markdown"): InternalReference | null {
  const value = raw.trim();
  if (!value || /[\u0000-\u001f\u007f]/.test(value)) return null;
  let address = "", fragment = "", addressing: InternalReference["addressing"];
  if (value.startsWith("#page/")) {
    const hash = value.indexOf("#", 6);
    address = decodeReference(value.slice(6, hash < 0 ? undefined : hash));
    fragment = hash < 0 ? "" : decodeReference(value.slice(hash + 1));
    addressing = "id";
  } else {
    const hash = value.indexOf("#");
    address = value.slice(0, hash < 0 ? undefined : hash);
    fragment = hash < 0 ? "" : value.slice(hash + 1);
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(address)) {
      if (syntax !== "mention") return null;
      addressing = "url";
    } else addressing = !address ? "current" : syntax.startsWith("wiki") ? "wiki" : "path";
    if (!syntax.startsWith("wiki")) { address = decodeReference(address); fragment = decodeReference(fragment); }
  }
  return { raw, syntax, address, addressing, fragment, kind: fragment ? "location" : "page",
    locator: !fragment ? null : fragment.startsWith("^") ? "block" : syntax.startsWith("wiki") ? "heading" : "anchor" };
}

export function nodeReference(node: PMNode): InternalReference | null {
  if (!["page_link", "child_page"].includes(editorKind(node))) return null;
  return internalReference(node.attrs.url || node.attrs.target,
    node.attrs.syntaxForm || (node.attrs.url || Object.keys(node.attrs.nfmAttrs || {}).length ? "mention" : "wiki"));
}
export function markReference(mark: Mark): InternalReference | null {
  return isEditorKind(mark, "link") ? internalReference(mark.attrs.href || "") : null;
}

export interface ReferencePage { id: string; title: string }
function normalizePath(path: string): string {
  const parts: string[] = [];
  for (const part of path.replace(/\\/g, "/").split("/")) {
    if (part === "..") { if (parts.length && parts.at(-1) !== "..") parts.pop(); else parts.push(part); }
    else if (part && part !== ".") parts.push(part);
  }
  return (path.startsWith("/") ? "/" : "") + parts.join("/").replace(/\.(?:md|markdown)$/i, "");
}
/** Never guess between duplicate titles or discard a supplied folder path. */
export function resolveReferencePage<T extends ReferencePage>(reference: InternalReference, pages: readonly T[], currentId?: string): T | undefined {
  if (reference.addressing === "url") return;
  if (reference.addressing === "current") return pages.find(p => p.id === currentId);
  const byId = pages.find(p => p.id === reference.address);
  if (byId) return byId;
  if (reference.addressing === "id") return;
  const path = normalizePath(reference.address);
  const candidates = pages.filter(p => p.id === path || normalizePath(p.title) === path);
  return candidates.length === 1 ? candidates[0] : undefined;
}
export function referenceHref(reference: InternalReference, pageId?: string): string {
  if (reference.addressing === "url") return reference.raw;
  const suffix = reference.fragment ? "#" + encodeURIComponent(reference.fragment) : "";
  if (pageId) return `#page/${encodeURIComponent(pageId)}${suffix}`;
  if (reference.addressing === "current") return suffix || "#";
  return reference.syntax.startsWith("wiki") || reference.addressing === "id"
    ? `#page/${encodeURIComponent(reference.address)}${suffix}` : reference.raw;
}
export function referenceLabel(node: PMNode, reference: InternalReference, page?: ReferencePage): string {
  const label = String(node.attrs.label || "");
  const explicit = node.attrs.labelMode === "custom" || !node.attrs.labelMode && !node.attrs.url && label && label !== node.attrs.target;
  if (explicit) return label;
  if (reference.kind === "location") return label || reference.address + "#" + reference.fragment;
  return page?.title || label || reference.address || "Untitled page";
}
