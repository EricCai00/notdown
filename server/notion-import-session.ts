import { randomUUID } from "node:crypto";
import type { ImportProgress } from "../src/shared/import-progress.js";
import type { ImportPlan } from "./markdown-import.js";
import { prepareNotionImport } from "./notion-import.js";
import { VaultError } from "./vault.js";

export type NotionBatch = {
  continuationId: string;
  batch: number;
  progress: ImportProgress;
  error?: string;
  retryAfterMs?: number;
};

/** A suspended traversal keeps its queues, cursors and source snapshots intact.
 * Nothing is written to the vault until the complete plan is reviewed. */
export class NotionImportSession {
  readonly id = randomUUID();
  private controller = new AbortController();
  private progress: ImportProgress = { phase: "reading", completed: 0 };
  private listener?: (progress: ImportProgress) => void;
  private response?: { resolve: (result: NotionBatch | ImportPlan) => void; reject: (error: unknown) => void };
  private resume?: () => void;
  private started = false;
  private expired = false;
  private timer?: ReturnType<typeof setTimeout>;
  private batch = 0;
  private batchStarted = 0;
  private firstPage = 0;
  private firstRequest = 0;
  private disconnected = false;
  private plan?: ImportPlan;
  private failure?: unknown;

  constructor(
    private input: unknown,
    private options: Parameters<typeof prepareNotionImport>[1] = {},
    private limits = { pages: 25, requests: 100, milliseconds: 60_000, idleMs: 30 * 60_000 },
  ) { this.touch(); }

  private touch() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.cancel(), this.limits.idleMs);
    this.timer.unref();
  }

  cancel() {
    this.expired = true;
    clearTimeout(this.timer);
    this.controller.abort();
    this.resume?.();
    this.input = undefined;
    this.options = {};
    this.plan = undefined;
  }

  private async suspend(error?: string, retryAfterMs?: number) {
    this.controller.signal.throwIfAborted();
    const gate = new Promise<void>(resolve => { this.resume = resolve; });
    this.response!.resolve({ continuationId: this.id, batch: this.batch, progress: { ...this.progress }, ...(error ? { error, retryAfterMs } : {}) });
    await gate;
    this.resume = undefined;
    this.controller.signal.throwIfAborted();
  }

  private async checkpoint() {
    this.controller.signal.throwIfAborted();
    if (this.disconnected || this.progress.completed - this.firstPage >= this.limits.pages ||
      (this.progress.requestCount ?? 0) - this.firstRequest >= this.limits.requests ||
      Date.now() - this.batchStarted >= this.limits.milliseconds) await this.suspend();
  }

  async read(listener: (progress: ImportProgress) => void, signal?: AbortSignal): Promise<NotionBatch | ImportPlan> {
    if (this.expired) throw new VaultError(410, "Notion reading session expired. Prepare a new preview.");
    if (this.response) throw new VaultError(429, "This Notion batch is already being read. Please wait.");
    if (this.failure) throw this.failure;
    if (this.plan) return this.plan;
    // Idle expiry applies between batches, never while a read is in flight.
    clearTimeout(this.timer);
    this.batch++;
    this.batchStarted = Date.now();
    this.firstPage = this.progress.completed;
    this.firstRequest = this.progress.requestCount ?? 0;
    this.disconnected = signal?.aborted ?? false;
    const disconnect = () => { this.disconnected = true; };
    signal?.addEventListener("abort", disconnect, { once: true });
    this.listener = listener;
    listener({ ...this.progress });
    try {
      return await new Promise<NotionBatch | ImportPlan>((resolve, reject) => {
        this.response = { resolve, reject };
        if (this.started) { this.resume?.(); return; }
        this.started = true;
        void prepareNotionImport(this.input, {
          ...this.options,
          signal: this.controller.signal,
          timeoutMs: 0,
          largeImport: true,
          checkpoint: () => this.checkpoint(),
          retryRead: error => this.suspend(error.message, typeof error.details.retryAfterMs === "number" ? error.details.retryAfterMs : undefined),
          onProgress: progress => { this.progress = progress; this.listener?.({ ...progress }); },
        }).then(plan => { if (!this.expired) this.plan = plan; this.response?.resolve(plan); }, error => {
          this.failure = error;
          this.response?.reject(error);
        }).finally(() => { this.input = undefined; this.options = {}; });
      });
    } finally {
      this.response = undefined;
      this.listener = undefined;
      signal?.removeEventListener("abort", disconnect);
      if (!this.expired) this.touch();
    }
  }
}
