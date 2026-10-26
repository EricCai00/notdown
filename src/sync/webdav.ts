import { Buffer } from "buffer";
import { gzipSync, Gunzip } from "fflate";
import { hashBytes, randomUUID } from "../vault/crypto";
import { canonical, validateRemote, validateItem, type SyncBatch, type SyncPushResult, type SyncRemote, type RemoteItem } from "./protocol";

export const nutstoreUrl = "https://dav.jianguoyun.com/dav/";
export type DavQuota = { startedAt: number; requests: number; blockedUntil?: number };
export type WebDavConnection = {
  provider: "webdav"; url: string; username: string; password: string; folder: string; enabled: boolean;
  vaultId?: string; vaultName?: string; quota?: DavQuota;
  needsSignIn?: boolean;
};
type Head = { format: "notdown-webdav"; version: 1; vaultId: string; name: string; sequence: number; index: string | null };
type Ref = { version: number; commit: string; position: number };
type Index = { version: 1; vaultId: string; sequence: number; entries: Record<string, Ref>; operations: Record<string, { hash: string; commit: string }> };
type Commit = { version: 1; vaultId: string; operation: string; requestHash: string; mutations: SyncBatch["mutations"]; versions: number[] };
type Options = { now?: () => number; requestLimit?: number };
const digest = /^[a-f0-9]{64}$/;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const windowMs = 30 * 60 * 1000;
const maxJsonBytes = 16 * 1024 * 1024;
const chunkSize = 1024 * 1024;
const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const object = (value: unknown): value is Record<string, any> => !!value && typeof value === "object" && !Array.isArray(value);

export class WebDavError extends Error {
  constructor(message: string, readonly status = 0, readonly retryAt?: number) { super(message); }
}
export function webDavAddress(raw: string, folder: string) {
  const url = new URL(raw);
  if (url.username || url.password || url.search || url.hash || url.protocol !== "https:" &&
      !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) throw new Error("Use an HTTPS WebDAV URL. HTTP is allowed only on localhost for testing.");
  if (typeof folder !== "string" || !folder || folder.length > 256 || /[\\\x00-\x1f:?#%]/.test(folder) ||
      folder.split("/").some(part => !part || part === "." || part === ".." || /[. ]$/.test(part))) throw new Error("Choose a relative remote folder, such as Notdown/My-notebook.");
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return { url: url.href, folder };
}
function strongEtag(response: Response) {
  const value = response.headers.get("etag");
  // Nutstore returns a bare opaque token. Preserve it verbatim for If-Match;
  // probe() still verifies invalid, current and stale versions before enabling sync.
  if (!value || !(/^"[^"\r\n]+"$/.test(value) || /^[A-Za-z0-9_-]{1,128}$/.test(value))) throw new WebDavError("This WebDAV server did not return a strong ETag. Sync stopped to protect concurrent edits.");
  return value;
}

/** WebDAV stores immutable commits; only head.json is mutable, protected by a verified If-Match CAS. */
export function createWebDavClient(connection: WebDavConnection, save: (value: WebDavConnection) => Promise<void>,
  fetcher: typeof fetch = fetch, options: Options = {}) {
  const address = webDavAddress(connection.url, connection.folder), now = options.now ?? Date.now;
  if (!connection.username?.trim() || /[:\r\n]/.test(connection.username) || !connection.password || /[\r\n]/.test(connection.password)) throw new Error("Enter your WebDAV account and application password.");
  const authorization = `Basic ${Buffer.from(`${connection.username}:${connection.password}`).toString("base64")}`;
  const root = connection.folder.split("/").map(encodeURIComponent).join("/") + "/";
  const folders = new Set<string>(), cachedObjects = new Map<string, any>();
  let cachedHead: { value: Head; etag: string } | undefined;
  let cachedIndex: { hash: string | null; value: Index } | undefined;
  const limit = options.requestLimit ?? 240;

  async function request(relative: string, method = "GET", body?: Uint8Array | string, headers: Record<string, string> = {}) {
    const timestamp = now();
    let quota = connection.quota;
    if (quota?.blockedUntil && quota.blockedUntil > timestamp) throw new WebDavError("WebDAV is cooling down after a request limit. Local changes remain saved.", 429, quota.blockedUntil);
    if (!quota || timestamp - quota.startedAt >= windowMs || timestamp < quota.startedAt) quota = { startedAt: timestamp, requests: 0 };
    if (quota.requests >= limit) throw new WebDavError("This device reached its WebDAV request budget. Sync will resume after the current window.", 429, quota.startedAt + windowMs);
    connection.quota = { ...quota, requests: quota.requests + 1 }; await save(connection);
    const target = new URL(relative, address.url);
    if (target.origin !== new URL(address.url).origin || !target.pathname.startsWith(new URL(address.url).pathname)) throw new Error("Invalid WebDAV request path");
    let response: Response;
    try { response = await fetcher(target.href, { method, headers: { Authorization: authorization, "Cache-Control": "no-cache", ...headers },
      body: body === undefined ? undefined : typeof body === "string" ? body : Uint8Array.from(body), redirect: "error", signal: AbortSignal.timeout(45000) }); }
    catch { throw new WebDavError("Cannot reach WebDAV. Check the server address and network; local changes remain saved. Android uses native requests; browser preview additionally requires server CORS support."); }
    if (response.status === 401 || response.status === 403) {
      connection.needsSignIn = true; await save(connection);
      throw new WebDavError("WebDAV authentication or permission failed. Use a third-party application password and check folder permissions.", response.status);
    }
    if (response.status === 429 || response.status === 503) {
      const retry = response.headers.get("retry-after"), seconds = retry && /^\d+$/.test(retry) ? Number(retry) * 1000 : 0;
      const retryAt = Math.min(timestamp + 86400000, Math.max(timestamp + 60000, seconds ? timestamp + seconds : retry ? Date.parse(retry) || timestamp + windowMs : timestamp + windowMs));
      connection.quota.blockedUntil = retryAt; await save(connection);
      throw new WebDavError("The WebDAV service requested a pause. Local changes are preserved and automatic sync will wait.", response.status, retryAt);
    }
    if (response.status >= 300 && response.status < 400) throw new WebDavError("WebDAV redirects are not followed. Use the final HTTPS server address.", response.status);
    return response;
  }
  function success(response: Response, statuses = [200, 201, 204]) {
    if (!statuses.includes(response.status)) throw new WebDavError(`WebDAV request failed (${response.status}). No newer remote version was overwritten.`, response.status);
    return response;
  }
  async function bytes(response: Response, maximum = maxJsonBytes) {
    const length = Number(response.headers.get("content-length"));
    if (Number.isFinite(length) && length > maximum) throw new WebDavError("WebDAV response exceeds its size limit");
    if (!response.body) return new Uint8Array();
    const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
    try { for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > maximum) { await reader.cancel(); throw new WebDavError("WebDAV response exceeds its size limit"); } chunks.push(part.value); } }
    finally { reader.releaseLock(); }
    const data = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length; } return data;
  }
  async function makeDirectory(relative: string, exclusive = false) {
    if (!exclusive && folders.has(relative)) return false;
    // Nutstore returns 201 even for an existing collection. Check explicitly
    // before reserving a new notebook or an exclusively owned diagnostic child.
    if (exclusive) {
      const existing = await request(relative, "PROPFIND", undefined, { Depth: "0" });
      if (existing.status === 207) return false;
      success(existing, [404]);
    }
    const response = await request(relative, "MKCOL");
    if (response.status === 201) { folders.add(relative); return true; }
    if (!exclusive && response.status === 405) {
      success(await request(relative, "PROPFIND", undefined, { Depth: "0" }), [207]); folders.add(relative); return false;
    }
    if (exclusive && response.status === 405) return false;
    success(response, [201]); return false;
  }
  function validateHead(value: any): asserts value is Head {
    if (!object(value) || value.format !== "notdown-webdav" || value.version !== 1 || !uuid.test(value.vaultId) ||
      typeof value.name !== "string" || !value.name || value.name.length > 200 || !Number.isSafeInteger(value.sequence) || value.sequence < 0 ||
      !(value.index === null || digest.test(value.index)) || value.sequence > 0 && value.index === null)
      throw new WebDavError("This folder does not contain a supported Notdown WebDAV notebook.");
    if (connection.vaultId && value.vaultId !== connection.vaultId) throw new WebDavError("The remote notebook identity changed. Sync stopped without applying it.");
  }
  async function head(optional = false) {
    const response = await request(`${root}head.json`);
    if (optional && response.status === 404) return null;
    success(response, [200]); const etag = strongEtag(response);
    const value = JSON.parse(new TextDecoder().decode(await bytes(response, 16384))); validateHead(value);
    cachedHead = { value, etag }; return cachedHead;
  }
  function objectPath(hash: string) { if (!digest.test(hash)) throw new Error("Invalid WebDAV content hash"); return `${root}objects/${hash.slice(0, 2)}/${hash}`; }
  async function putObject(data: Uint8Array) {
    const hash = hashBytes(data), relative = objectPath(hash);
    await makeDirectory(`${root}objects/`); await makeDirectory(`${root}objects/${hash.slice(0, 2)}/`);
    const found = await request(relative, "HEAD");
    if (found.status === 200) {
      if (Number(found.headers.get("content-length")) !== data.length) throw new WebDavError("An existing WebDAV object has an unexpected size. Its content was preserved.");
      return hash;
    }
    success(found, [404]);
    // Some DAV servers ignore If-None-Match. The name is a SHA-256 of these exact bytes, so identical writes are safe.
    const uploaded = await request(relative, "PUT", data, { "Content-Type": "application/octet-stream", "If-None-Match": "*" });
    success(uploaded, [200, 201, 204, 412]); return hash;
  }
  async function getObject(hash: string, maximum = maxJsonBytes) {
    const data = await bytes(success(await request(objectPath(hash)), [200]), maximum);
    if (hashBytes(data) !== hash) throw new WebDavError("WebDAV content checksum failed. The local copy was preserved."); return data;
  }
  async function putJson(value: unknown) {
    const raw = new TextEncoder().encode(canonical(value));
    if (raw.length > maxJsonBytes) throw new WebDavError("The WebDAV index or commit exceeds 16 MiB. Sync stopped before publishing it.");
    return putObject(gzipSync(raw, { level: 6, mtime: 0 }));
  }
  async function getJson(hash: string) {
    if (cachedObjects.has(hash)) return cachedObjects.get(hash);
    const compressed = await getObject(hash);
    // Bound both declared size and streamed expansion; a forged ISIZE must not permit an allocation bomb.
    if (compressed.length < 18 || new DataView(compressed.buffer, compressed.byteOffset + compressed.length - 4, 4).getUint32(0, true) > maxJsonBytes) throw new WebDavError("Invalid or oversized compressed WebDAV object");
    const parts: Uint8Array[] = []; let length = 0;
    const decoder = new Gunzip(part => { length += part.length; if (length > maxJsonBytes) throw new WebDavError("Oversized WebDAV object"); parts.push(part); });
    for (let offset = 0; offset < compressed.length; offset += 1024) decoder.push(compressed.subarray(offset, offset + 1024), offset + 1024 >= compressed.length);
    const raw = new Uint8Array(length); let offset = 0; for (const part of parts) { raw.set(part, offset); offset += part.length; }
    const value = JSON.parse(new TextDecoder().decode(raw));
    if (cachedObjects.size >= 8) cachedObjects.delete(cachedObjects.keys().next().value!);
    cachedObjects.set(hash, value); return value;
  }
  async function index(current: Head) {
    if (cachedIndex?.hash === current.index) return cachedIndex.value;
    const value: Index = current.index ? await getJson(current.index) : { version: 1, vaultId: current.vaultId, sequence: 0, entries: {}, operations: {} };
    if (!object(value) || value.version !== 1 || value.vaultId !== current.vaultId || value.sequence !== current.sequence || !object(value.entries) || !object(value.operations)) throw new WebDavError("Invalid WebDAV version index");
    for (const [key, entry] of Object.entries(value.entries)) {
      if (!object(entry) || !Number.isSafeInteger(entry.version) || entry.version < 1 || entry.version > current.sequence || !digest.test(entry.commit) || !Number.isInteger(entry.position) || entry.position < 0 || entry.position >= 100 || key.length > 1100) throw new WebDavError("Invalid WebDAV index entry");
    }
    cachedIndex = { hash: current.index, value }; return value;
  }
  async function commit(hash: string, vaultId: string): Promise<Commit> {
    const value = await getJson(hash);
    if (!object(value) || value.version !== 1 || value.vaultId !== vaultId || !uuid.test(value.operation) || !digest.test(value.requestHash) ||
      !Array.isArray(value.mutations) || value.mutations.length < 1 || value.mutations.length > 100 || !Array.isArray(value.versions) || value.versions.length !== value.mutations.length)
      throw new WebDavError("Invalid WebDAV commit");
    value.mutations.forEach((mutation: any, i: number) => {
      validateItem(mutation.item); validateRemote({ item: mutation.item, version: value.versions[i] });
      if (!Number.isSafeInteger(mutation.expectedVersion) || mutation.expectedVersion < 0) throw new WebDavError("Invalid commit base version");
    });
    if (hashBytes(canonical({ id: value.operation, mutations: value.mutations })) !== value.requestHash) throw new WebDavError("WebDAV operation checksum failed");
    return value as Commit;
  }
  async function entry(key: string, ref: Ref, vaultId: string): Promise<RemoteItem> {
    const value = await commit(ref.commit, vaultId), mutation = value.mutations[ref.position];
    if (!mutation || mutation.item.key !== key || value.versions[ref.position] !== ref.version) throw new WebDavError("WebDAV index does not match its commit");
    return { item: mutation.item, version: ref.version };
  }

  async function probe() {
    success(await request("", "PROPFIND", undefined, { Depth: "0" }), [207]);
    // Nutstore limits top-level names and forbids deleting top-level collections.
    // Retain one empty diagnostic parent; only clean up an exclusively created child.
    await makeDirectory("Notdown-checks/");
    const folder = `Notdown-checks/nd-${randomUUID().replace(/-/g, "").slice(0, 24)}/`;
    if (!await makeDirectory(folder, true)) throw new WebDavError("Unable to create a unique connection-test folder");
    try {
      const file = folder + "condition.txt", first = randomUUID(), second = randomUUID();
      success(await request(file, "PUT", first));
      const original = success(await request(file), [200]), etag = strongEtag(original);
      if (await original.text() !== first) throw new WebDavError("WebDAV changed uploaded bytes");
      const invalid = await request(file, "PUT", "must-not-be-written", { "If-Match": `"notdown-invalid-${randomUUID()}"` });
      if (invalid.status !== 412 || await (await request(file)).text() !== first) throw new WebDavError("This WebDAV server ignores conditional writes. Sync cannot safely be enabled.");
      success(await request(file, "PUT", second, { "If-Match": etag }));
      const latest = success(await request(file), [200]);
      if (strongEtag(latest) === etag || await latest.text() !== second) throw new WebDavError("WebDAV version tags did not change with the content");
      if ((await request(file, "PUT", first, { "If-Match": etag })).status !== 412 || await (await request(file)).text() !== second) throw new WebDavError("WebDAV accepted an outdated version. Sync cannot safely be enabled.");
    } finally { try { await request(folder, "DELETE"); } catch { /* Only the random diagnostic folder may remain; never touch user files. */ } }
  }
  const remote: SyncRemote = {
    maxBatchItems: 32,
    async pull(cursor, notify) {
      const current = (await head())!.value;
      if (!Number.isSafeInteger(cursor) || cursor < 0 || cursor > current.sequence) throw new WebDavError("Remote history moved backwards. Sync stopped to preserve both copies.");
      if (cursor === current.sequence) return { cursor, items: [], more: false };
      const state = await index(current);
      const changed = Object.entries(state.entries).filter(([, ref]) => ref.version > cursor).sort((a, b) => a[1].version - b[1].version);
      const page = changed.slice(0, 100), items: RemoteItem[] = [];
      notify?.(0, page.length);
      for (const [key, ref] of page) { items.push(await entry(key, ref, current.vaultId)); notify?.(items.length, page.length); }
      return { cursor: changed.length > page.length ? page.at(-1)![1].version : current.sequence, items, more: changed.length > page.length };
    },
    async push(batch): Promise<SyncPushResult> {
      if (!uuid.test(batch.id) || !Array.isArray(batch.mutations) || !batch.mutations.length || batch.mutations.length > 100 || new Set(batch.mutations.map(m => m.item.key)).size !== batch.mutations.length) throw new WebDavError("Invalid WebDAV upload batch");
      for (const mutation of batch.mutations) { validateItem(mutation.item); if (!Number.isSafeInteger(mutation.expectedVersion) || mutation.expectedVersion < 0) throw new WebDavError("Invalid base version"); }
      const current = (await head())!, state = await index(current.value), requestHash = hashBytes(canonical(batch));
      if (own(state.operations, batch.id)) {
        const recorded = state.operations[batch.id];
        if (recorded.hash !== requestHash || !digest.test(recorded.commit)) throw new WebDavError("The same operation ID was used with different content");
        const previous = await commit(recorded.commit, current.value.vaultId);
        if (previous.operation !== batch.id || previous.requestHash !== requestHash) throw new WebDavError("Invalid operation receipt");
        return { accepted: true, items: previous.mutations.map((mutation, i) => ({ item: mutation.item, version: previous.versions[i] })) };
      }
      const conflicts: RemoteItem[] = [];
      for (const mutation of batch.mutations) {
        const previous = own(state.entries, mutation.item.key) ? state.entries[mutation.item.key] : undefined;
        if (!previous && mutation.expectedVersion !== 0) throw new WebDavError("The expected remote item is missing. Sync stopped.");
        if ((previous?.version ?? 0) !== mutation.expectedVersion) conflicts.push(await entry(mutation.item.key, previous!, current.value.vaultId));
      }
      if (conflicts.length) return { accepted: false, items: conflicts };
      const versions = batch.mutations.map((_, i) => current.value.sequence + i + 1);
      const change: Commit = { version: 1, vaultId: current.value.vaultId, operation: batch.id, requestHash, mutations: batch.mutations, versions };
      const changeHash = await putJson(change), next: Index = structuredClone(state);
      next.sequence = versions.at(-1)!;
      batch.mutations.forEach((mutation, position) => { next.entries[mutation.item.key] = { version: versions[position], commit: changeHash, position }; });
      next.operations[batch.id] = { hash: requestHash, commit: changeHash };
      const indexHash = await putJson(next), nextHead: Head = { ...current.value, sequence: next.sequence, index: indexHash };
      const response = await request(`${root}head.json`, "PUT", canonical(nextHead), { "Content-Type": "application/json", "If-Match": current.etag });
      if (response.status === 412) { cachedHead = undefined; cachedIndex = undefined; throw new WebDavError("Another device published changes first. Your upload remains queued; sync again to compare its original versions.", 409); }
      success(response); cachedHead = undefined; cachedIndex = { hash: indexHash, value: next };
      return { accepted: true, items: batch.mutations.map((mutation, i) => ({ item: mutation.item, version: versions[i] })) };
    },
    async upload(hash, data, notify) {
      if (!digest.test(hash) || data.length > 64 * 1024 * 1024 || hashBytes(data) !== hash) throw new WebDavError("Invalid attachment upload");
      const manifestPath = `${root}blobs/${hash}.json`, exists = await request(manifestPath, "HEAD");
      if (exists.status === 200) { notify?.(data.length, data.length); return; }
      success(exists, [404]); await makeDirectory(`${root}blobs/`);
      const chunks: { hash: string; size: number }[] = [];
      notify?.(0, data.length);
      for (let i = 0; i < data.length; i += chunkSize) { const part = data.slice(i, i + chunkSize); chunks.push({ hash: await putObject(part), size: part.length }); notify?.(i + part.length, data.length); }
      success(await request(manifestPath, "PUT", canonical({ version: 1, hash, size: data.length, chunks }), { "Content-Type": "application/json" }));
    },
    async download(hash, notify) {
      if (!digest.test(hash)) throw new WebDavError("Invalid attachment checksum");
      const manifest = JSON.parse(new TextDecoder().decode(await bytes(success(await request(`${root}blobs/${hash}.json`), [200]), 16384)));
      if (manifest.version !== 1 || manifest.hash !== hash || !Number.isSafeInteger(manifest.size) || manifest.size < 0 || manifest.size > 64 * 1024 * 1024 || !Array.isArray(manifest.chunks) || manifest.chunks.length > 64) throw new WebDavError("Invalid attachment manifest");
      const data = new Uint8Array(manifest.size); let offset = 0;
      notify?.(0, data.length);
      for (const chunk of manifest.chunks) {
        if (!Number.isSafeInteger(chunk.size) || chunk.size < 1 || chunk.size > chunkSize || offset + chunk.size > data.length) throw new WebDavError("Invalid attachment chunk size");
        const part = await getObject(chunk.hash, chunkSize); if (part.length !== chunk.size) throw new WebDavError("Attachment chunk length mismatch");
        data.set(part, offset); offset += part.length; notify?.(offset, data.length);
      }
      if (offset !== data.length || hashBytes(data) !== hash) throw new WebDavError("Attachment checksum failed"); return data;
    },
  };
  return {
    remote, probe,
    async vaults() { const current = await head(true); return current ? [{ id: current.value.vaultId, name: current.value.name }] : []; },
    async createVault(id: string, name: string) {
      if (!uuid.test(id) || !name.trim() || name.length > 200) throw new WebDavError("Invalid notebook name or ID");
      const pieces = root.split("/").filter(Boolean); let folder = "";
      for (const piece of pieces.slice(0, -1)) { folder += piece + "/"; await makeDirectory(folder); }
      // Refuse pre-existing incomplete or unrelated directories, including on
      // servers whose MKCOL reports 201 for an existing collection.
      if (!await makeDirectory(root, true)) {
        const existing = await head(true);
        if (existing) throw new WebDavError("A notebook already exists in this folder. Select it from the list instead of creating another.", 409);
        throw new WebDavError("This folder already exists without a valid Notdown index. Choose a new empty folder name; its files were preserved.", 409);
      }
      if (await head(true)) throw new WebDavError("A notebook already exists in this folder. Select it from the list instead of creating another.", 409);
      const value: Head = { format: "notdown-webdav", version: 1, vaultId: id, name: name.trim(), sequence: 0, index: null };
      success(await request(`${root}head.json`, "PUT", canonical(value), { "Content-Type": "application/json" }));
      const checked = await head(); if (checked!.value.vaultId !== id) throw new WebDavError("Notebook initialization could not be verified");
      return { id, name: name.trim() };
    },
  };
}
