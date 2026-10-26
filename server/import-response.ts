import type { Request, Response } from "express";
import type { ImportProgress } from "../src/shared/import-progress.js";
import { VaultError } from "./vault.js";

/** Keep JSON callers compatible; the dialog opts into live NDJSON events. */
export async function importResponse<T>(
  req: Request,
  res: Response,
  run: (progress: (value: ImportProgress) => void) => Promise<T>,
) {
  const streaming = req.get("accept") === "application/x-ndjson";
  const send = (event: unknown) => {
    if (!res.destroyed && !res.writableEnded) res.write(`${JSON.stringify(event)}\n`);
  };
  if (streaming) {
    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
  }
  try {
    const result = await run(value => { if (streaming) send({ type: "progress", ...value }); });
    if (!streaming) return res.json(result);
    send({ type: "result", result });
    res.end();
  } catch (error) {
    if (!streaming) throw error;
    send({ type: "error", error: error instanceof VaultError ? error.message : "Import failed. Original files are preserved; prepare a new preview or retry the same snapshot." });
    res.end();
  }
}
