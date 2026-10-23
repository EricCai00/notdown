import { Buffer } from "buffer";
import { hashBytes } from "../vault/crypto";
import type { SyncBatch, SyncPushResult, SyncRemote } from "./protocol";

export type CloudSession = { access_token: string; refresh_token: string; expires_at: number; user: { id: string; email?: string } };
export type CloudConnection = { url: string; key: string; session: CloudSession; vaultId?: string; vaultName?: string; enabled: boolean };
export type CloudVault = { id: string; name: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const checksum = /^[0-9a-f]{64}$/;
const chunkSize = 1024 * 1024;

export function cloudAddress(url: string, key: string) {
  const address = new URL(url);
  if (address.username || address.password || address.search || address.hash || address.pathname !== "/" ||
      address.protocol !== "https:" && !(address.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(address.hostname)))
    throw new Error("Use an HTTPS Supabase project URL, without a path. HTTP is supported only for local development.");
  if (typeof key !== "string" || key.length < 10 || key.length > 4096 || /[\r\n]/.test(key) || key.startsWith("sb_secret_")) throw new Error("Enter a publishable key, never a secret or service-role key.");
  if (key.split(".").length === 3) {
    let claims; try { claims = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString()); } catch { throw new Error("Invalid project key"); }
    if (claims.role !== "anon") throw new Error("Use the public anon key, never the service-role key.");
  }
  return address.origin;
}
function session(value: any): CloudSession {
  if (!value || typeof value.access_token !== "string" || typeof value.refresh_token !== "string" || !uuid.test(value.user?.id)) throw new Error("Invalid sign-in response");
  const expires_at = value.expires_at ?? Math.floor(Date.now() / 1000) + Number(value.expires_in);
  if (!Number.isFinite(expires_at)) throw new Error("Invalid session expiry");
  return { access_token: value.access_token, refresh_token: value.refresh_token, expires_at, user: { id: value.user.id, email: value.user.email } };
}
async function fetchChecked(fetcher: typeof fetch, url: string, init: RequestInit): Promise<Response> {
  const response = await fetcher(url, { ...init, redirect: "error", signal: AbortSignal.timeout(45000) });
  if (!response.ok) {
    let detail = ""; try { const error = await response.json(); detail = error.msg || error.message || error.error_description || error.error || ""; } catch { /* HTTP status remains useful. */ }
    throw new Error(`Cloud request failed (${response.status})${detail ? `: ${String(detail).slice(0, 300)}` : ""}`);
  }
  return response;
}
export async function signInCloud(input: { url: string; key: string; email: string; password: string }, fetcher: typeof fetch = fetch): Promise<CloudConnection> {
  const url = cloudAddress(input.url, input.key);
  if (!input.email?.trim() || !input.password) throw new Error("Email and password are required");
  const response = await fetchChecked(fetcher, `${url}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: input.key, "Content-Type": "application/json" }, body: JSON.stringify({ email: input.email.trim(), password: input.password }),
  });
  return { url, key: input.key, session: session(await response.json()), enabled: false };
}

export function createCloudClient(connection: CloudConnection, save: (connection: CloudConnection) => Promise<void>, fetcher: typeof fetch = fetch) {
  cloudAddress(connection.url, connection.key);
  async function request(route: string, init: RequestInit = {}) {
    if (connection.session.expires_at * 1000 < Date.now() + 60000) {
      const refreshed = await fetchChecked(fetcher, `${connection.url}/auth/v1/token?grant_type=refresh_token`, {
        method: "POST", headers: { apikey: connection.key, "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: connection.session.refresh_token }),
      });
      const next = session(await refreshed.json());
      if (next.user.id !== connection.session.user.id) throw new Error("Cloud account changed unexpectedly");
      connection.session = next; await save(connection);
    }
    return fetchChecked(fetcher, connection.url + route, { ...init,
      headers: { apikey: connection.key, Authorization: `Bearer ${connection.session.access_token}`, ...init.headers } });
  }
  async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    const result = await request(`/rest/v1/rpc/${name}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(args) });
    return result.json();
  }
  function objectPath(name: string) {
    if (!uuid.test(connection.vaultId ?? "") || !uuid.test(connection.session.user.id)) throw new Error("Choose a cloud notebook first");
    return `/storage/v1/object/notdown-sync/${connection.session.user.id}/${connection.vaultId}/${name}`;
  }
  async function put(name: string, bytes: Uint8Array) {
    // Immutable object names make a partially uploaded attachment safe to resume across process restarts.
    try { await request(objectPath(name), { method: "POST", headers: { "Content-Type": "application/octet-stream", "x-upsert": "false" }, body: Uint8Array.from(bytes) }); }
    catch (error) {
      // Never assume an upload error means 'already exists'; prove that the stored bytes are identical.
      try { const existing = new Uint8Array(await (await request(objectPath(name))).arrayBuffer()); if (hashBytes(existing) === hashBytes(bytes)) return; } catch { /* Preserve the original failure. */ }
      throw error;
    }
  }
  const remote: SyncRemote = {
    pull: cursor => rpc("nd_sync_pull", { p_vault: connection.vaultId, p_cursor: cursor, p_limit: 100 }),
    push: (batch: SyncBatch) => rpc<SyncPushResult>("nd_sync_push", { p_vault: connection.vaultId, p_operation: batch.id, p_mutations: batch.mutations }),
    async upload(hash, bytes) {
      if (!checksum.test(hash) || hashBytes(bytes) !== hash || bytes.length > 64 * 1024 * 1024) throw new Error("Invalid attachment upload");
      const chunks: { hash: string; size: number }[] = [];
      for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        const part = bytes.slice(offset, offset + chunkSize), partHash = hashBytes(part);
        await put(`chunks/${partHash}`, part); chunks.push({ hash: partHash, size: part.length });
      }
      await put(`manifests/${hash}`, new TextEncoder().encode(JSON.stringify({ version: 1, hash, size: bytes.length, chunks })));
    },
    async download(hash) {
      if (!checksum.test(hash)) throw new Error("Invalid attachment checksum");
      const manifestText = await (await request(objectPath(`manifests/${hash}`))).text();
      if (manifestText.length > 16000) throw new Error("Invalid attachment manifest size");
      const manifest = JSON.parse(manifestText);
      if (manifest.version !== 1 || manifest.hash !== hash || !Number.isSafeInteger(manifest.size) || manifest.size < 0 || manifest.size > 64 * 1024 * 1024 ||
          !Array.isArray(manifest.chunks) || manifest.chunks.length > 64) throw new Error("Invalid attachment manifest");
      const bytes = new Uint8Array(manifest.size); let offset = 0;
      for (const chunk of manifest.chunks) {
        if (!checksum.test(chunk.hash) || !Number.isSafeInteger(chunk.size) || chunk.size < 1 || chunk.size > chunkSize || offset + chunk.size > bytes.length) throw new Error("Invalid attachment chunk");
        const part = new Uint8Array(await (await request(objectPath(`chunks/${chunk.hash}`))).arrayBuffer());
        if (part.length !== chunk.size || hashBytes(part) !== chunk.hash) throw new Error("Attachment chunk checksum failed");
        bytes.set(part, offset); offset += part.length;
      }
      if (offset !== bytes.length || hashBytes(bytes) !== hash) throw new Error("Attachment checksum failed");
      return bytes;
    },
  };
  return {
    remote,
    async vaults() { const values = await rpc<CloudVault[]>("nd_sync_vaults"); if (!Array.isArray(values) || values.some(value => !uuid.test(value.id) || typeof value.name !== "string")) throw new Error("Invalid notebook list"); return values; },
    createVault: (id: string, name: string) => rpc<CloudVault>("nd_sync_create_vault", { p_id: id, p_name: name }),
  };
}
