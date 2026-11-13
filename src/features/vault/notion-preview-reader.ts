import { ApiError } from "../../shared/types";
import type { ImportProgress } from "../../shared/import-progress";

export type NotionPreviewBatch = { continuationId: string; batch: number; progress: ImportProgress; error?: string; retryAfterMs?: number };

function wait(ms: number, signal: AbortSignal) {
  signal.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}

/** Retry only preview reads. Writes and revision conflicts never use this loop. */
export async function readNotionPreview<T extends { id: string }>(options: {
  continuationId?: string;
  signal: AbortSignal;
  read: (continuationId?: string) => Promise<T | NotionPreviewBatch>;
  onContinuation: (id?: string) => void;
  onBatch: (batch: NotionPreviewBatch) => void;
  onRetry: (retry: { attempt: number; delayMs: number; restarting: boolean; message: string }) => void;
  shouldPause: () => boolean;
  wait?: (ms: number, signal: AbortSignal) => Promise<void>;
}) {
  let id = options.continuationId, failures = 0, restarts = 0;
  let lastBatch: NotionPreviewBatch | undefined;
  const retry = async (error: Error, restarting = false, retryAfterMs = 0) => {
    if (++failures > 8) throw error;
    const delayMs = Math.max(Math.min(1000 * 2 ** (failures - 1), 30_000), retryAfterMs);
    options.onRetry({ attempt: failures, delayMs, restarting, message: error.message });
    await (options.wait ?? wait)(delayMs, options.signal);
    options.signal.throwIfAborted();
  };
  for (;;) {
    options.signal.throwIfAborted();
    if (options.shouldPause()) return lastBatch;
    let result: T | NotionPreviewBatch;
    try { result = await options.read(id); }
    catch (error) {
      options.signal.throwIfAborted();
      if (error instanceof ApiError && error.status === 410 && id) {
        // An expired in-memory traversal cannot be continued. Rebuild a complete
        // preview with the same options; no partial plan has reached the vault.
        id = undefined; lastBatch = undefined; options.onContinuation(undefined);
        if (++restarts > 2) throw error;
        await retry(error, true);
        continue;
      }
      const transient = error instanceof TypeError || error instanceof ApiError && error.data.retryable !== false && (error.status === 429 || error.status >= 500);
      if (!transient || !(error instanceof Error)) {
        // A terminal traversal has unwound: retaining its ID cannot resume it.
        options.onContinuation(undefined);
        throw error;
      }
      await retry(error);
      continue;
    }
    if (!("continuationId" in result)) return result;
    id = result.continuationId; lastBatch = result;
    options.onContinuation(id); options.onBatch(result);
    if (options.shouldPause()) return result;
    if (result.error) await retry(new Error(result.error), false, result.retryAfterMs);
    else failures = 0;
  }
}
