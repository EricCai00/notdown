import type { ImportProgress } from "./import-progress";
import { apiUrl } from "./vault-url";

export interface Page {
  dataSourceId?: string;
  databaseId?: string;
  wiki?: boolean;
  wikiMember?: boolean;
  legacyIds?: string[];
  id: string;
  title: string;
  parent: string | null;
  icon: string;
  properties: Record<string, unknown>;
  body: string;
  bodyFormat?: import("../document/notion-syntax").BodyFormat;
  syntax?: import("../markdown-engine/config").SyntaxConfig;
  revision: string;
  updated: string;
  favorite?: boolean;
  trashed?: boolean;
  sidebarOrder?: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public data: any,
  ) {
    super(data.error || data.message || `Request failed (${status})`);
  }
}

export type ApiTransport = (path: string, options: RequestInit) => Promise<unknown>;
let localTransport: ApiTransport | undefined;
/** Installed by the offline mobile entry point before mounting shared editor views. */
export function setApiTransport(transport: ApiTransport | undefined) { localTransport = transport; }

export async function api<T>(
  path: string,
  options: RequestInit = {},
  onProgress?: (progress: ImportProgress) => void,
): Promise<T> {
  if (localTransport) return await localTransport(path, options) as T;
  const response = await fetch(apiUrl(path), {
    ...options,
    headers: { "Content-Type": "application/json", ...(onProgress ? { Accept: "application/x-ndjson" } : {}), ...options.headers },
  });
  if (response.ok && onProgress && response.headers.get("content-type")?.includes("application/x-ndjson")) {
    if (!response.body) throw new Error("Import progress stream is unavailable.");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop()!;
        if (done && buffer) { lines.push(buffer); buffer = ""; }
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line);
          if (event.type === "error") throw new Error(event.error);
          if (event.type === "result") return event.result as T;
          if (event.type === "progress") onProgress(event);
        }
        if (done) throw new Error("Import connection closed before completion. Review the import before retrying.");
      }
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }
  const result = await response.json();
  if (!response.ok) throw new ApiError(response.status, result);
  return result;
}

export function escape(value: unknown): string {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
