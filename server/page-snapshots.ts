import { randomUUID } from "node:crypto";
import type { Page } from "../src/shared/types";
import type { PageSnapshot } from "../src/shared/page-snapshot";

/** Per-vault, bounded revision indexes; no authoritative content is cached here. */
export class PageSnapshots {
  private snapshots = new Map<string, Map<string, string>>();

  encode(pages: Page[], previous: string): PageSnapshot {
    const baseline = this.snapshots.get(previous);
    const revisions = new Map<string, string>();
    const result = pages.map(page => {
      // revision covers body bytes; include projections such as inherited trash.
      const { body: _body, ...metadata } = page;
      const fingerprint = JSON.stringify(metadata);
      revisions.set(page.id, fingerprint);
      return baseline?.get(page.id) === fingerprint ? page.id : page;
    });
    const snapshot = randomUUID();
    this.snapshots.set(snapshot, revisions);
    while (this.snapshots.size > 8) this.snapshots.delete(this.snapshots.keys().next().value!);
    return { snapshot, pages: result };
  }
}
