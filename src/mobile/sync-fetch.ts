import { Buffer } from "buffer";
import { registerPlugin } from "@capacitor/core";

interface NativeSyncHttp {
  request(input: { id: string; url: string; method: string; headers: Record<string, string>; data?: string }): Promise<{ status: number; headers: Record<string, string>; data: string }>;
  cancel(input: { id: string }): Promise<void>;
}
const transport = registerPlugin<NativeSyncHttp>("NotdownSyncHttp");

/** Explicit sync-only bridge. WebDAV does not need permissive CORS on Android. */
export const nativeSyncFetch: typeof fetch = async (input, init = {}) => {
  const request = new Request(input, init), id = crypto.randomUUID();
  if (request.signal.aborted) throw request.signal.reason;
  const data = ["GET", "HEAD"].includes(request.method) ? undefined : Buffer.from(await request.arrayBuffer()).toString("base64");
  const abort = () => { void transport.cancel({ id }).catch(() => {}); };
  request.signal.addEventListener("abort", abort, { once: true });
  try {
    const result = await transport.request({ id, url: request.url, method: request.method, headers: Object.fromEntries(request.headers), data });
    if (request.signal.aborted) throw request.signal.reason;
    if (request.redirect === "error" && result.status >= 300 && result.status < 400) throw new Error("Sync HTTP redirects are disabled");
    return new Response(request.method === "HEAD" || [204, 205, 304].includes(result.status) ? null : Uint8Array.from(Buffer.from(result.data, "base64")), { status: result.status, headers: result.headers });
  } finally { request.signal.removeEventListener("abort", abort); }
};
