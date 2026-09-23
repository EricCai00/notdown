import type { Node as PMNode } from "prosemirror-model";

/** Code captions use the existing fenced-code attribute carrier. */
export function codeCaption(node: PMNode): string {
  return String(node.attrs.markdownAttrs?.caption ?? "");
}

/** Keep arbitrary plain text inside a single quoted fence attribute. */
export function encodeCodeCaption(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/\{/g, "&#123;")
    .replace(/\}/g, "&#125;");
}

export function decodeCodeCaption(value: string): string {
  return value
    .replace(/&#(?:x7b|123);/gi, "{")
    .replace(/&#(?:x7d|125);/gi, "}")
    .replace(/&quot;|&#(?:x22|34);/gi, '"')
    .replace(/&amp;/gi, "&");
}
