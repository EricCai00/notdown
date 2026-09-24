import type { Node as PMNode } from "prosemirror-model";
import { parseFragment, type DefaultTreeAdapterMap } from "parse5";
import type { InternalReference } from "./internal-reference";

export interface ReferenceLocation {
  kind: "heading" | "block" | "anchor";
  fragment: string;
  label: string;
  pos: number;
  headingPath?: string[];
}

/** Read parsed structure, never scan code fences or rewrite the Markdown body. */
export function referenceLocations(doc: PMNode): ReferenceLocation[] {
  const result: ReferenceLocation[] = [];
  const headings: { level: number; title: string }[] = [];
  const walk = (parent: PMNode, base: number, blocked = false) => {
    let previous: { node: PMNode; pos: number } | undefined;
    parent.forEach((node, offset) => {
      const pos = base + offset;
      if (node.type.name === "heading") {
        while (headings.length && headings.at(-1)!.level >= node.attrs.level) headings.pop();
        headings.push({ level: node.attrs.level, title: node.textContent });
        result.push({ kind: "heading", fragment: node.attrs.markdownAttrs?.id || node.textContent,
          label: node.textContent, pos, headingPath: headings.map(h => h.title) });
      }
      const id = node.attrs.markdownAttrs?.id || node.attrs.attributes?.id;
      if (id && node.type.name !== "heading") result.push({ kind: "anchor", fragment: id, label: id, pos });
      for (const mark of node.marks) {
        const anchor = mark.attrs.attributes?.id;
        if (anchor) result.push({ kind: "anchor", fragment: anchor, label: anchor, pos });
      }
      if (["html_inline", "html_block"].includes(node.type.name)) {
        const visit = (element: DefaultTreeAdapterMap["childNode"]) => {
          if (!("tagName" in element) || ["script", "style", "iframe", "template"].includes(element.tagName)) return;
          for (const attr of element.attrs) if (attr.name === "id" || element.tagName === "a" && attr.name === "name")
            result.push({ kind: "anchor", fragment: attr.value, label: attr.value, pos });
          element.childNodes.forEach(visit);
        };
        parseFragment(String(node.attrs.raw || "")).childNodes.forEach(visit);
      }
      if (node.isTextblock && !blocked && !node.type.spec.code) {
        let marker: PMNode | undefined;
        node.forEach(child => { if (child.type.name === "syntax_inline" && child.attrs.kind === "block-anchor") marker = child; });
        if (marker) {
          const standalone = !node.textContent.trim();
          const target = standalone ? previous : { node, pos };
          if (target) result.push({ kind: "block", fragment: "^" + marker.attrs.target,
            label: target.node.textContent.trim().slice(0, 90) || marker.attrs.target, pos: target.pos });
        }
      }
      // Obsidian does not address individual parts of quotes, callouts or tables.
      if (!node.isLeaf && !node.type.spec.code) walk(node, pos + 1,
        blocked || ["blockquote", "callout", "table"].includes(node.type.name));
      previous = { node, pos };
    });
  };
  walk(doc, 0);
  return result;
}

export function findReferenceLocation(doc: PMNode, reference: InternalReference): ReferenceLocation | undefined {
  const locations = referenceLocations(doc);
  if (reference.locator === "block") {
    const matches = locations.filter(l => l.kind === "block" && l.fragment === reference.fragment);
    return matches.length === 1 ? matches[0] : undefined;
  }
  const exact = locations.find(l => l.fragment === reference.fragment);
  if (reference.locator === "anchor" && exact) return exact;
  if (reference.locator === "heading" || reference.locator === "anchor") {
    const path = reference.fragment.split("#");
    return locations.find(l => l.kind === "heading" && path.every((part, index) =>
      l.headingPath?.[l.headingPath.length - path.length + index]?.toLocaleLowerCase() === part.toLocaleLowerCase()))
      || locations.find(l => l.fragment === reference.fragment);
  }
  return exact;
}
