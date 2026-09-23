import type { Node as PMNode } from "prosemirror-model";
import { parseNative, serializeNative } from "./codec.js";
import { syntaxFormat, normalizeSyntax, type SyntaxConfig } from "./config.js";

export interface DocumentSnapshot {
  source: string;
  config: SyntaxConfig;
  doc: PMNode;
}
/** One in-memory draft and one history for both projections. Disk writes remain CAS-based. */
export class DocumentSession {
  snapshot: DocumentSnapshot;
  private past: DocumentSnapshot[] = [];
  private future: DocumentSnapshot[] = [];
  private lastOrigin = "";
  private lastTime = 0;
  constructor(source: string, config: SyntaxConfig) {
    this.snapshot = {
      source,
      config: structuredClone(normalizeSyntax(config)),
      doc: parseNative(source, config),
    };
  }
  breakHistory() {
    this.lastTime = 0;
    this.lastOrigin = "";
  }
  private commit(next: DocumentSnapshot, origin: string) {
    const before = this.snapshot;
    if (
      next.source === before.source &&
      JSON.stringify(next.config) === JSON.stringify(before.config)
    )
      return false;
    const now = Date.now();
    const delta = Math.abs(next.source.length - before.source.length);
    const group =
      delta <= 8 &&
      !next.source
        .slice(Math.min(next.source.length, before.source.length))
        .includes("\n") &&
      origin !== "config" &&
      this.lastOrigin === origin &&
      now - this.lastTime < 500;
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
          : parseNative(source, this.snapshot.config),
      },
      "source",
    );
  }
  project() {
    this.snapshot = {
      ...this.snapshot,
      doc: parseNative(this.snapshot.source, this.snapshot.config),
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
        doc: parseNative(this.snapshot.source, config),
      },
      "config",
    );
  }
  undo() {
    const previous = this.past.pop();
    if (!previous) return false;
    this.future.push(this.snapshot);
    this.snapshot = previous;
    this.project();
    this.breakHistory();
    return true;
  }
  redo() {
    const next = this.future.pop();
    if (!next) return false;
    this.past.push(this.snapshot);
    this.snapshot = next;
    this.project();
    this.breakHistory();
    return true;
  }
  get format() {
    return syntaxFormat(this.snapshot.config);
  }
}
