import type { Page } from "../../shared/types";
import { resolveReferencePage } from "../../document/internal-reference";
import { findReferenceLocation } from "../../document/reference-locations";
import { parseNative } from "../../markdown-engine/codec";
import { defaultSyntax } from "../../markdown-engine/config";
import { trashedPageIds } from "../pages/page-hierarchy";
import { referenceOccurrences } from "./reference-occurrences";

export interface InternalLibraryEntry {
  key: string;
  label: string;
  target: string;
  status: "resolved" | "unresolved";
  references: { pageId: string; location: "Body"; key: string; occurrence: number }[];
}

/** Local links are a read-only view of current notes, never persistent bindings. */
export function internalLibrary(pages: readonly Page[]) {
  const hidden = trashedPageIds(pages), available = pages.filter(page => !hidden.has(page.id));
  const documents = new Map<string, ReturnType<typeof parseNative>>(), warnings: string[] = [];
  for (const page of available) {
    try { documents.set(page.id, parseNative(page.body, page.syntax ?? defaultSyntax(page.bodyFormat))); }
    catch { warnings.push(`Some references in “${page.title}” could not be checked.`); }
  }
  const entries = new Map<string, InternalLibraryEntry>();
  for (const page of available) {
    const doc = documents.get(page.id);
    if (!doc) continue;
    for (const ref of referenceOccurrences(doc)) {
      if (!ref.internal || ref.external) continue;
      const target = resolveReferencePage(ref.internal, available, page.id), targetDoc = target && documents.get(target.id);
      const resolved = !!target && (!ref.internal.fragment || !!targetDoc && !!findReferenceLocation(targetDoc, ref.internal));
      const key = `${page.id}:${ref.key}`;
      let entry = entries.get(key);
      if (!entry) {
        entry = { key, label: ref.label || ref.internal.raw, target: ref.internal.raw, status: resolved ? "resolved" : "unresolved", references: [] };
        entries.set(key, entry);
      }
      entry.references.push({ pageId: page.id, location: "Body", key: ref.key, occurrence: ref.occurrence });
    }
  }
  return { entries: [...entries.values()], warnings };
}
