import { parseFragment } from "parse5";
import { parseNative } from "../../markdown-engine/codec";
import { defaultSyntax } from "../../markdown-engine/config";
import { editorKind } from "../../document/node-identity";
import type { Page } from "../../shared/types";
import { localAssetPath } from "./asset-model";

const referenceFields: Record<string, string[]> = {
  image: ["src"], image_block: ["src"], media_block: ["src"], notion_embed: ["src"], web_embed: ["url"],
  meeting_notes: ["audio"], web_bookmark: ["image", "icon", "url"], link_preview: ["image", "url"],
  link_mention: ["url"], callout: ["icon"],
};

/** Read the actual dialect tree; never count example code as live references. */
export function pageAssetReferences(page: Page) {
  const references = new Map<string, Set<string>>();
  let uncertain = false;
  const add = (value: unknown, location: string) => {
    const path = localAssetPath(value);
    if (!path) return;
    const locations = references.get(path) ?? new Set<string>();
    locations.add(location); references.set(path, locations);
  };
  const property = (value: unknown, label: string) => {
    if (typeof value === "string") add(value, label);
    else if (Array.isArray(value)) value.forEach(item => property(item, label));
    else if (value && typeof value === "object") Object.values(value).forEach(item => property(item, label));
  };
  add(page.icon, "Page icon");
  for (const [key, value] of Object.entries(page.properties)) property(value, key === "cover" ? "Page cover" : `Property: ${key}`);
  try {
    parseNative(page.body, page.syntax ?? defaultSyntax(page.bodyFormat)).descendants(node => {
      const kind = editorKind(node);
      if (["code_block", "executable_chunk", "executable_inline", "math_block", "math_inline"].includes(kind)) return false;
      if (["opaque_block", "unknown_block", "unsupported"].includes(kind)) {
        if (/assets\//.test(String(node.attrs.raw || node.attrs.source || node.textContent))) uncertain = true;
        return false;
      }
      for (const key of referenceFields[kind] ?? []) add(node.attrs[key], "Body");
      if (kind === "mail") for (const path of String(node.attrs.attachments || node.attrs.nfmAttrs?.attachments || "").split(",")) add(path.trim(), "Body");
      for (const mark of node.marks) if (mark.type.name === "link") add(mark.attrs.href, "Body");
      if (["html_block", "html_inline"].includes(kind)) {
        const raw = String(node.attrs.html || node.attrs.raw || node.textContent);
        const visit = (element: { attrs?: { name: string; value: string }[]; childNodes?: unknown[]; content?: unknown }) => {
          for (const attr of element.attrs ?? []) if (["src", "href", "data", "poster"].includes(attr.name)) add(attr.value, "Body HTML");
          for (const child of element.childNodes ?? []) visit(child as typeof element);
          if (element.content) visit(element.content as typeof element);
        };
        visit(parseFragment(raw));
      }
    });
  } catch { uncertain = true; }
  return { references, uncertain };
}
