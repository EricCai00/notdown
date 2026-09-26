import type { Node as PMNode } from "prosemirror-model";
import { parseNative, serializeNative } from "./codec.js";
import { syntaxFormat, normalizeSyntax, type SyntaxConfig } from "./config.js";

export interface DocumentSnapshot {
  source: string;
  config: SyntaxConfig;
  doc: PMNode;
  projectionPending?: boolean;
}
/** One in-memory draft and one history for both projections. Disk writes remain CAS-based. */
export class DocumentSession {
  snapshot: DocumentSnapshot;
  private past: DocumentSnapshot[] = [];
  private future: DocumentSnapshot[] = [];
  private lastOrigin = "";
  private lastTime = 0;
  private lastEdit: { from: number; to: number; kind: string } | undefined;
  constructor(source: string, config: SyntaxConfig, private readonly projectDocument: (doc: PMNode) => PMNode = doc => doc) {
    this.snapshot = {
      source,
      config: structuredClone(normalizeSyntax(config)),
      doc: this.parse(source, config),
    };
  }
  parse(source: string, config = this.snapshot.config) {
    return this.projectDocument(parseNative(source, config));
  }
  breakHistory() {
    this.lastTime = 0;
    this.lastOrigin = "";
    this.lastEdit = undefined;
  }
  private commit(next: DocumentSnapshot, origin: string) {
    const before = this.snapshot;
    if (
      next.source === before.source &&
      JSON.stringify(next.config) === JSON.stringify(before.config)
    )
      return false;
    const now = Date.now();
    // Inspect the changed span, not the document tail: an unrelated trailing
    // newline must not split every keystroke into its own undo entry.
    let from = 0, oldEnd = before.source.length, newEnd = next.source.length;
    while (from < oldEnd && from < newEnd && before.source[from] === next.source[from]) from++;
    while (oldEnd > from && newEnd > from && before.source[oldEnd - 1] === next.source[newEnd - 1]) {
      oldEnd--;
      newEnd--;
    }
    const removed = before.source.slice(from, oldEnd), inserted = next.source.slice(from, newEnd);
    const kind = !removed ? "insert" : !inserted ? "delete" : "replace";
    const edit = kind !== "replace" && Math.max(removed.length, inserted.length) <= 8 &&
      !/[\r\n]/.test(removed + inserted) ? { from, to: newEnd, kind } : undefined;
    const adjacent = edit && this.lastEdit && edit.kind === this.lastEdit.kind &&
      (kind === "insert" ? from === this.lastEdit.to : oldEnd === this.lastEdit.from || from === this.lastEdit.from);
    const group =
      adjacent &&
      origin !== "config" &&
      this.lastOrigin === origin &&
      now - this.lastTime < 1000;
    if (!group) this.past.push(before);
    let retained = 0;
    this.past = this.past
      .slice(-80)
      .reverse()
      .filter((item) => {
        retained += item.source.length * 2;
        return retained <= 8 * 1024 * 1024;
      })
      .reverse();
    this.future = [];
    this.snapshot = next;
    this.lastOrigin = origin;
    this.lastTime = now;
    this.lastEdit = edit;
    return true;
  }
  sourceChanged(source: string, deferProjection = false) {
    if (source === this.snapshot.source) return false;
    return this.commit(
      {
        source,
        config: this.snapshot.config,
        doc: deferProjection
          ? this.snapshot.doc
          : this.parse(source, this.snapshot.config),
        projectionPending: deferProjection,
      },
      "source",
    );
  }
  project() {
    this.snapshot = {
      ...this.snapshot,
      doc: this.parse(this.snapshot.source, this.snapshot.config),
      projectionPending: false,
    };
  }
  documentChanged(doc: PMNode) {
    return this.commit(
      {
        doc,
        config: this.snapshot.config,
        source: serializeNative(doc, this.snapshot.config),
      },
      "document",
    );
  }
  configure(config: SyntaxConfig) {
    return this.commit(
      {
        source: this.snapshot.source,
        config: structuredClone(normalizeSyntax(config)),
        doc: this.parse(this.snapshot.source, config),
      },
      "config",
    );
  }
  undo() {
    const previous = this.past.pop();
    if (!previous) return false;
    this.future.push(this.snapshot);
    this.snapshot = previous;
    // Visual edits already have an exact document snapshot. Reparsing an
    // unfinished shortcode such as "Hello :smile" can turn it into metadata.
    if (this.snapshot.projectionPending) this.project();
    this.breakHistory();
    return true;
  }
  redo() {
    const next = this.future.pop();
    if (!next) return false;
    this.past.push(this.snapshot);
    this.snapshot = next;
    if (this.snapshot.projectionPending) this.project();
    this.breakHistory();
    return true;
  }
  get format() {
    return syntaxFormat(this.snapshot.config);
  }
}
