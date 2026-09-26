import { z } from "zod";
import { parseNative } from "../src/markdown-engine/codec";
import { executionLanguage, quartoCell } from "../src/markdown-engine/quarto";
import { rChunkMarkdown } from "../src/markdown-engine/rmarkdown";
import { RNotebook, type NotebookReply } from "./r-notebook";
import { NotebookWorker } from "./notebook-worker";
import { VaultError } from "./vault";
import type { Node as PMNode } from "prosemirror-model";
import type { RuntimeOptions } from "../src/shared/runtime-settings";

const schema = z.object({
  session: z.string().uuid(), source: z.string().max(128_000), variant: z.enum(["quarto", "notdown"]),
  extensions: z.record(z.string(), z.boolean()).refine(value => Object.keys(value).length <= 160).default({}),
  mode: z.enum(["current", "above", "inline"]), index: z.number().int().min(0).max(1000),
}).strict();

/** Language sessions share window identity, but never variables or vault files. */
export class QuartoNotebook {
  private r: RNotebook;
  constructor(private settings: () => Promise<RuntimeOptions> = async () => ({})) { this.r = new RNotebook(settings); }
  private workers = new Map<string, NotebookWorker>();
  private busy = new Set<string>();
  async execute(input: unknown, signal?: AbortSignal): Promise<NotebookReply> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new VaultError(400, "Expected a Quarto session, source, mode and object index");
    if (signal?.aborted) throw new VaultError(499, "Notebook cancelled");
    const request = parsed.data;
    const nodes: PMNode[] = [];
    const types = request.mode === "inline" ? ["inline.executable_expression"] : ["block.executable_chunk"];
    parseNative(request.source, { version: 1, variant: request.variant, extensions: request.extensions }).descendants(node => {
      if (types.includes(node.type.name)) nodes.push(node);
    });
    if (!nodes[request.index]) throw new VaultError(400, "Executable object no longer exists");
    const selected = request.mode === "above" ? nodes.slice(0, request.index).map((node, index) => ({ node, index })) : [{ node: nodes[request.index], index: request.index }];
    if (this.busy.has(request.session)) throw new VaultError(429, "This notebook is already running");
    this.busy.add(request.session);
    const controller = new AbortController();
    const cancel = () => controller.abort();
    signal?.addEventListener("abort", cancel, { once: true });
    const timer = setTimeout(cancel, 60_000);
    const reply: NotebookReply = { outputs: [] };
    try {
      for (const { node, index } of selected) {
        if (controller.signal.aborted) throw new VaultError(499, "Notebook cancelled or timed out; session reset");
        const language = executionLanguage(node);
        if (language === "ojs") { reply.outputs.push({ index, text: "Run Observable JS in the browser output panel." }); continue; }
        try {
        const cell = request.mode === "inline" ? { code: node.textContent, options: {} as Record<string, unknown> } : quartoCell(node.textContent, language);
        let result: NotebookReply;
        if (language === "r") {
          result = await this.r.executeCells(request.session, { document: request.source,
            ...(request.mode === "inline" ? { expression: cell.code, index } : { chunks: [{ index, source: rChunkMarkdown(node) }] }),
          }, controller.signal);
        } else result = await this.kernel(request.session, language, { cells: [{ index, code: cell.code }], inline: request.mode === "inline" }, controller.signal);
        reply.sessionStarted ||= result.sessionStarted;
        reply.outputs.push(...result.outputs);
        if (result.error) { reply.outputs.push({ index, error: result.error }); break; }
        if (result.outputs.some(output => output.error) && cell.options.error !== true) break;
        } catch (error) {
          if (controller.signal.aborted) { this.dispose(request.session); throw error; }
          reply.outputs.push({ index, error: error instanceof Error ? error.message : String(error) });
          break;
        }
      }
      return reply;
    } finally { clearTimeout(timer); signal?.removeEventListener("abort", cancel); this.busy.delete(request.session); }
  }
  private async kernel(session: string, language: "python" | "julia", command: object, signal?: AbortSignal) {
    const key = session + ":" + language;
    let worker = this.workers.get(key);
    const sessionStarted = !worker;
    if (!worker) {
      if (this.workers.size >= 4) throw new VaultError(429, "Four language kernels are already open. Restart or close another notebook.");
      worker = new NotebookWorker(() => this.workers.delete(key), language, this.settings);
      this.workers.set(key, worker);
    }
    const current = worker;
    const cancel = () => current.stop();
    const timer = setTimeout(() => current.stop(new VaultError(408, "Notebook exceeded 60 seconds; session reset.")), 60_000);
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      if (signal?.aborted) throw new VaultError(499, "Notebook cancelled");
      if (sessionStarted) await current.start();
      if (signal?.aborted) throw new VaultError(499, "Notebook cancelled");
      const result = await current.execute(command);
      if (result.error) current.stop();
      return { ...result, sessionStarted };
    } catch (error) { current.stop(); throw error; }
    finally { clearTimeout(timer); signal?.removeEventListener("abort", cancel); current.rest(); }
  }
  dispose(session: string) {
    this.r.dispose(session);
    for (const [key, worker] of this.workers) if (key.startsWith(session + ":")) worker.stop();
  }
  close() { this.r.close(); for (const worker of this.workers.values()) worker.stop(); }
}
