import { parseNative } from "../../markdown-engine/codec";
import { defaultSyntax } from "../../markdown-engine/config";
import { editorKind } from "../../document/node-identity";
import type { Page } from "../../shared/types";
import { externalIdentity, notionId, type ExternalObservation, type ExternalKind } from "./external-entity";

/** Only parsed, live references count. Examples, unknown containers and code stay opaque. */
export function pageExternalReferences(page: Page): { observations: (ExternalObservation & { location: string })[]; uncertain: boolean } {
  const observations: (ExternalObservation & { location: string })[] = [];
  const add = (url: unknown, label: unknown, location: string, kind?: ExternalKind) => {
    const identity = externalIdentity(url, kind);
    if (identity) observations.push({ ...identity, url: String(url), label: typeof label === "string" ? label : "", location });
  };
  const properties = (value: unknown, location: string) => {
    if (Array.isArray(value)) { value.forEach(item => properties(item, location)); return; }
    if (!value || typeof value !== "object") return;
    const object = value as Record<string, any>;
    if (notionId(object.notionPageId)) observations.push({ provider: "notion", kind: "page", id: notionId(object.notionPageId)!, url: object.url, location });
    else if (object.object === "user" && notionId(object.id)) observations.push({ provider: "notion", kind: "user", id: notionId(object.id)!, label: object.name, data: object, location });
    else for (const entry of Object.values(object)) properties(entry, location);
  };
  properties(page.properties, "Properties");
  let uncertain = false;
  try {
    parseNative(page.body, page.syntax ?? defaultSyntax(page.bodyFormat)).descendants(node => {
      const kind = editorKind(node);
      if (["code_block", "executable_chunk", "executable_inline", "math_block", "inline_math", "opaque_block", "unknown_block", "unsupported"].includes(kind)) return false;
      if (["page_link", "child_page", "mention", "database"].includes(kind)) {
        const type = kind === "database" || node.attrs.kind === "database" ? "database" : node.attrs.kind === "data-source" ? "data-source" : undefined;
        add(node.attrs.url || node.attrs.nfmAttrs?.url || node.attrs.target, node.attrs.label, "Body", type);
      }
      for (const mark of node.marks) if (mark.type.name === "link") add(mark.attrs.href, node.textContent, "Body");
    });
  } catch { uncertain = true; }
  return { observations, uncertain };
}
