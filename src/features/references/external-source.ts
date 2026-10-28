import { parseNative } from "../../markdown-engine/codec";
import { defaultSyntax } from "../../markdown-engine/config";
import type { Page } from "../../shared/types";
import { notionId, type ExternalObservation } from "./external-entity";
import { referenceOccurrences } from "./reference-occurrences";

/** Only parsed, live references count. Examples, unknown containers and code stay opaque. */
export function pageExternalReferences(page: Page): { observations: (ExternalObservation & { location: string; occurrence?: number })[]; uncertain: boolean } {
  const observations: (ExternalObservation & { location: string; occurrence?: number })[] = [];
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
    for (const ref of referenceOccurrences(parseNative(page.body, page.syntax ?? defaultSyntax(page.bodyFormat))))
      if (ref.external) observations.push({ ...ref.external, location: "Body", occurrence: ref.occurrence });
  } catch { uncertain = true; }
  return { observations, uncertain };
}
