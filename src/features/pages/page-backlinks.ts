import { extractPageReferences } from "../../document/document-format";
import { resolveReferencePage, type InternalReference } from "../../document/internal-reference";
import type { Page } from "../../shared/types";

/** Derived links only: disk snapshots and window drafts remain authoritative. */
export class PageBacklinks {
  private names = "";
  private generation = 0;
  private entries = new Map<string, { body: string; syntax: string; references: InternalReference[]; generation: number; targets: Set<string> }>();

  constructor(private extract = extractPageReferences) {}

  incoming(pages: readonly Page[], target: Page): Page[] {
    // Resolution depends on titles, aliases, and duplicate-title ambiguity.
    const names = JSON.stringify(pages.map(page => [page.id, page.title, page.legacyIds]));
    if (names !== this.names) {
      this.generation++;
      this.names = names;
    }
    const liveIds = new Set(pages.map(page => page.id));
    for (const id of this.entries.keys()) if (!liveIds.has(id)) this.entries.delete(id);
    return pages.filter(page => {
      if (page.id === target.id) return false;
      const syntax = JSON.stringify([page.bodyFormat, page.syntax]);
      let entry = this.entries.get(page.id);
      if (!entry || entry.body !== page.body || entry.syntax !== syntax) {
        entry = { body: page.body, syntax, generation: -1, targets: new Set(),
          references: this.extract(page.body, page.bodyFormat, page.syntax) };
        this.entries.set(page.id, entry);
      }
      if (entry.generation !== this.generation) {
        entry.targets = new Set(entry.references.flatMap(reference => {
          const target = resolveReferencePage(reference, pages, page.id);
          return target ? [target.id] : [];
        }));
        entry.generation = this.generation;
      }
      return entry.targets.has(target.id) || entry.targets.has(target.title);
    });
  }
}
