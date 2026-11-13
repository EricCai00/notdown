import test from "node:test";
import assert from "node:assert/strict";
import { readNotionPreview, type NotionPreviewBatch } from "../../src/features/vault/notion-preview-reader.js";
import { ApiError } from "../../src/shared/types.js";

const batch = (error?: string): NotionPreviewBatch => ({ continuationId: "same-session", batch: 1, progress: { phase: "reading", completed: 2 }, ...(error ? { error } : {}) });
const defaults = () => ({ signal: new AbortController().signal, onContinuation: (_id?: string) => {}, onBatch: (_batch: NotionPreviewBatch) => {}, onRetry: (_retry: unknown) => {}, shouldPause: () => false, wait: async (_ms: number, _signal: AbortSignal) => {} });

test("transient failures automatically retry the same continuation and respect rate-limit waits", async () => {
  const ids: (string | undefined)[] = [], waits: number[] = [];
  let calls = 0;
  const result = await readNotionPreview({ ...defaults(),
    read: async id => {
      ids.push(id);
      if (++calls === 1) return batch();
      if (calls === 2) return { ...batch("Rate limited"), retryAfterMs: 60_000 };
      if (calls === 3) throw new TypeError("Network interrupted");
      return { id: "complete-plan" };
    }, wait: async ms => { waits.push(ms); },
  });
  assert.deepEqual(result, { id: "complete-plan" });
  assert.deepEqual(ids, [undefined, "same-session", "same-session", "same-session"]);
  assert.deepEqual(waits, [60_000, 2000]);
});

test("an expired session automatically starts a fresh preview instead of reusing the dead ID", async () => {
  const ids: (string | undefined)[] = [], changes: (string | undefined)[] = [], retries: any[] = [];
  const result = await readNotionPreview({ ...defaults(), continuationId: "expired-session",
    read: async id => { ids.push(id); if (id) throw new ApiError(410, { error: "Session expired" }); return { id: "fresh-plan" }; },
    onContinuation: id => { changes.push(id); }, onRetry: retry => { retries.push(retry); },
  });
  assert.deepEqual(result, { id: "fresh-plan" });
  assert.deepEqual(ids, ["expired-session", undefined]);
  assert.deepEqual(changes, [undefined]); assert.equal(retries[0].restarting, true);
});

test("automatic retries are bounded and permanent errors are not retried", async () => {
  for (const error of [new ApiError(400, { error: "Bad selection" }), new ApiError(401, { error: "Invalid token" }), new ApiError(413, { error: "20 MB limit" }), new ApiError(502, { error: "Invalid source", retryable: false })]) {
    let calls = 0;
    const continuations: (string | undefined)[] = [];
    await assert.rejects(readNotionPreview({ ...defaults(), continuationId: "terminal-session", onContinuation: id => { continuations.push(id); }, read: async () => { calls++; throw error; } }), candidate => candidate === error);
    assert.equal(calls, 1);
    assert.deepEqual(continuations, [undefined]);
  }
  let attempts = 0;
  await assert.rejects(readNotionPreview({ ...defaults(), read: async () => { attempts++; return batch("Still offline"); } }), /Still offline/);
  assert.equal(attempts, 9);
  let starts = 0;
  await assert.rejects(readNotionPreview({ ...defaults(), read: async id => {
    if (!id) { starts++; return batch(); } throw new ApiError(410, { error: "Session expired" });
  } }), /Session expired/);
  assert.equal(starts, 3);
});

test("pause preserves a batch and cancellation interrupts an automatic retry immediately", async () => {
  let paused = false, calls = 0;
  const result = await readNotionPreview({ ...defaults(),
    read: async () => { calls++; return batch("Offline"); },
    onRetry: () => { paused = true; }, shouldPause: () => paused,
  });
  assert.equal(calls, 1); assert.deepEqual(result, batch("Offline"));
  const controller = new AbortController();
  await assert.rejects(readNotionPreview({ ...defaults(), signal: controller.signal,
    read: async () => batch("Offline"), wait: undefined,
    onRetry: () => { queueMicrotask(() => controller.abort()); },
  }), error => error instanceof Error && error.name === "AbortError");
});
