import type { Page } from "../shared/types";
import { VaultError, type PageInput } from "../vault/vault";
import { syntaxFormat } from "../markdown-engine/config";

type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type Writer = (id: string, input: PageInput, revision: string) => Promise<Page>;

/** One page and one window own each draft. A late save never replaces newer input. */
export class MobileDraftSession {
  base: Page;
  draft: Page;
  dirty = false;
  failure: unknown;
  recovered = false;
  private generation = 0;
  private pending?: Promise<boolean>;
  constructor(page: Page, readonly key: string, private storage: DraftStorage, private write: Writer,
    private notify: () => void = () => {}) {
    this.base = structuredClone(page); this.draft = structuredClone(page);
    const saved = storage.getItem(key);
    if (saved) {
      const entry = JSON.parse(saved);
      if (entry?.base?.id !== page.id || entry?.draft?.id !== page.id || typeof entry.draft.body !== "string" || !/^[a-f0-9]{64}$/.test(entry.base.revision))
        throw new Error("The recovery draft is invalid. It has been preserved in local storage.");
      this.base = entry.base; this.draft = entry.draft; this.dirty = true; this.recovered = true;
      if (this.base.revision !== page.revision) this.failure = new VaultError(409, "The saved page changed while this draft was pending. Save the recovered draft as a new page to keep both.");
    }
  }
  get saving() { return !!this.pending; }
  change(input: Pick<Page, "body" | "title" | "syntax">) {
    const bodyFormat = input.syntax ? syntaxFormat(input.syntax) : this.draft.bodyFormat;
    if (input.body === this.draft.body && input.title === this.draft.title && JSON.stringify(input.syntax) === JSON.stringify(this.draft.syntax) && bodyFormat === this.draft.bodyFormat) return;
    this.draft = { ...this.draft, ...input, bodyFormat };
    this.dirty = true; this.generation++;
    this.persist(); this.notify();
  }
  private persist() { this.storage.setItem(this.key, JSON.stringify({ base: this.base, draft: this.draft })); }
  save(): Promise<boolean> {
    if (this.pending) return this.pending;
    if (this.failure) return Promise.resolve(false);
    this.pending = this.drain().finally(() => { this.pending = undefined; this.notify(); });
    this.notify(); return this.pending;
  }
  private async drain(): Promise<boolean> {
    while (this.dirty) {
      const generation = this.generation, proposed = structuredClone(this.draft);
      try {
        const saved = await this.write(proposed.id, { title: proposed.title, body: proposed.body,
          syntax: proposed.syntax ?? null, bodyFormat: proposed.bodyFormat }, this.base.revision);
        this.base = saved;
        if (generation === this.generation) {
          this.draft = structuredClone(saved); this.dirty = false; this.recovered = false;
          this.storage.removeItem(this.key);
        } else {
          this.draft = { ...this.draft, revision: saved.revision, updated: saved.updated };
          this.persist();
        }
        this.notify();
      } catch (error) { this.failure = error; this.notify(); return false; }
    }
    return true;
  }
  /** Retrying an IO failure retains the original base revision; conflicts need user review. */
  retry() {
    if (this.failure instanceof VaultError && [409, 503].includes(this.failure.status)) return Promise.resolve(false);
    this.failure = undefined; return this.save();
  }
  releaseCopiedDraft() { this.storage.removeItem(this.key); }
}
