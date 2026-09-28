import { extractLinks } from "../../document/document-format";
import type { Page } from "../../shared/types";

/** Derived links only: disk snapshots and window drafts remain authoritative. */
export class PageBacklinks {
  private names = "";
  private entries = new Map<string, { body: string; syntax: string; targets: Set<string> }>();

  constructor(private extract = extractLinks) {}

  incoming(pages: readonly Page[], target: Page): Page[] {
    // Resolution depends on titles, aliases, and duplicate-title ambiguity.
    const names = JSON.stringify(pages.map(page => [page.id, page.title, page.legacyIds]));
    if (names !== this.names) {
      this.entries.clear();
      this.names = names;
    }
    const liveIds = new Set(pages.map(page => page.id));
    for (const id of this.entries.keys()) if (!liveIds.has(id)) this.entries.delete(id);
    return pages.filter(page => {
      if (page.id === target.id) return false;
      const syntax = JSON.stringify([page.bodyFormat, page.syntax]);
      let entry = this.entries.get(page.id);
      if (!entry || entry.body !== page.body || entry.syntax !== syntax) {
        entry = { body: page.body, syntax,
          targets: new Set(this.extract(page.body, page.bodyFormat, page.syntax, pages, page.id)) };
        this.entries.set(page.id, entry);
      }
      return entry.targets.has(target.id) || entry.targets.has(target.title);
    });
  }
}
