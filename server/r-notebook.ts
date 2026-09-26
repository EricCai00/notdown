import { z } from "zod";
import { parseNative } from "../src/markdown-engine/codec";
import { rChunkMarkdown } from "../src/markdown-engine/rmarkdown";
import { VaultError } from "./vault";
import { NotebookWorker } from "./notebook-worker";
import type { RuntimeOptions } from "../src/shared/runtime-settings";

const requestSchema = z.object({
  session: z.string().uuid(), source: z.string().max(128_000),
  variant: z.enum(["rmarkdown", "notdown"]), mode: z.enum(["current", "above", "inline"]),
  extensions: z.record(z.string(), z.boolean()).refine(value => Object.keys(value).length <= 160).default({}),
  index: z.number().int().min(0).max(1000),
}).strict();
export type NotebookOutput = { index: number; html?: string; text?: string; error?: string };
export type NotebookReply = { outputs: NotebookOutput[]; error?: string; sessionStarted?: boolean };


/** Each window supplies a random session identity; no vault files enter the worker. */
export class RNotebook {
  constructor(private settings: () => Promise<RuntimeOptions> = async () => ({})) {}
  private workers = new Map<string, NotebookWorker>();
  async execute(input: unknown, signal?: AbortSignal): Promise<NotebookReply> {
    const parsed = requestSchema.safeParse(input);
    if (!parsed.success) throw new VaultError(400, "Expected a notebook session, source, mode and R object index");
    if (signal?.aborted) throw new VaultError(499, "R notebook cancelled");
    const request = parsed.data;
    const chunks: { index: number; source: string }[] = [], inline: string[] = [];
    parseNative(request.source, { version: 1, variant: request.variant, extensions: request.extensions }).descendants(node => {
      if (node.type.name === "block.executable_chunk") chunks.push({ index: chunks.length, source: rChunkMarkdown(node) });
      if (node.type.name === "inline.executable_expression") inline.push(node.textContent);
    });
    if (request.index >= (request.mode === "inline" ? inline.length : chunks.length)) throw new VaultError(400, "R object no longer exists");
    const selected = request.mode === "above" ? chunks.slice(0, request.index) : [chunks[request.index]];
    if (request.mode === "above" && !selected.length) return { outputs: [] };
    return this.executeCells(request.session, { document: request.source,
      ...(request.mode === "inline" ? { expression: inline[request.index], index: request.index } : { chunks: selected }),
    }, signal);
  }
  async executeCells(session: string, command: object, signal?: AbortSignal): Promise<NotebookReply> {
    const request = { session };
    if (signal?.aborted) throw new VaultError(499, "R notebook cancelled");
    let worker = this.workers.get(request.session);
    if (worker?.busy) throw new VaultError(429, "This R notebook is already running");
    const sessionStarted = !worker;
    if (!worker) {
      if (this.workers.size >= 2) throw new VaultError(429, "Two R notebooks are already open. Close one before starting another.");
      worker = new NotebookWorker(() => this.workers.delete(request.session), "r", this.settings);
      this.workers.set(request.session, worker);
    }
    worker.busy = true;
    const current = worker;
    const cancel = () => current.stop();
    const timer = setTimeout(() => current.stop(new VaultError(408, "R notebook exceeded 60 seconds; session reset.")), 60_000);
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      if (sessionStarted) await current.start();
      if (signal?.aborted) { current.stop(); throw new VaultError(499, "R notebook cancelled"); }
      return { ...await current.execute(command), sessionStarted };
    } catch (error) { current.stop(); throw error; }
    finally { clearTimeout(timer); signal?.removeEventListener("abort", cancel); current.busy = false; current.rest(); }
  }
  dispose(session: string) { this.workers.get(session)?.stop(); }
  close() { for (const worker of this.workers.values()) worker.stop(); }
}
