import { randomUUID } from "../vault/crypto";
import { VaultError } from "../vault/vault";
import type { createVaultSyncStore } from "../vault/sync-store";
import { itemRevision, type SyncItem } from "./protocol";
import { synchronize, type SyncProgress } from "./engine";
import { createCloudClient, signInCloud, type CloudConnection, type CloudVault } from "./supabase";
import { createWebDavClient, webDavAddress, webDavRetryAt, WebDavError, type WebDavConnection } from "./webdav";

type Storage = ReturnType<typeof createVaultSyncStore>;
/** An optional platform lease for one already-started sync; it never schedules work. */
export type SyncRunLease = { update(progress: SyncProgress): void; finish(): Promise<void> };
export type SyncRunLifecycle = { start(): Promise<SyncRunLease> };
export type SyncStatus = {
  provider?: "supabase" | "webdav"; folder?: string; nextSyncAt?: number; retryAt?: number; needsSignIn?: boolean;
  signedIn: boolean; enabled: boolean; running: boolean; url: string; key: string;
  email?: string; vaultId?: string; vaultName?: string; lastSyncedAt?: string;
  conflicts: number; error?: string; progress?: SyncProgress;
};
type Connection = CloudConnection | WebDavConnection;
export type CloudNotebook = CloudVault & { folder?: string };
const isDav = (value: Connection): value is WebDavConnection => "provider" in value && value.provider === "webdav";
const bindingFor = (value: Connection) => isDav(value) ? `webdav|${value.url}|${value.username}|${value.folder}|${value.vaultId}` : `${value.url}|${value.session.user.id}|${value.vaultId}`;
const jobs = new Map<string, { task?: Promise<SyncProgress>; error?: string; progress?: SyncProgress; nextSyncAt?: number; retryAt?: number; needsSignIn?: boolean }>();
const waitingMessage = "WebDAV is waiting for its request limit to reset. Local changes remain saved.";

export function createSyncService(store: Storage, storageId: string, fetcher: typeof fetch = (...args) => fetch(...args), options: { privateReplica?: boolean; runLifecycle?: SyncRunLifecycle } = {}) {
  const job = jobs.get(storageId) ?? {}; jobs.set(storageId, job);
  const connection = () => store.readConnection<Connection>();
  const idle = () => { if (job.task) throw new VaultError(409, "Wait for the current sync to finish before changing its connection."); };
  async function client() {
    const value = await connection();
    if (!value) throw new VaultError(401, "Sign in to cloud sync first");
    return { value, api: isDav(value) ? createWebDavClient(value, value => store.writeConnection(value), fetcher)
      : createCloudClient(value, value => store.writeConnection(value), fetcher) };
  }
  async function status(): Promise<SyncStatus> {
    const [value, state, conflicts] = await Promise.all([connection(), store.readState(), store.conflicts()]);
    const deadline = Math.max(job.retryAt ?? 0, value && isDav(value) ? webDavRetryAt(value) ?? 0 : 0);
    const retryAt = deadline > Date.now() ? deadline : undefined;
    job.retryAt = retryAt;
    return { signedIn: !!value, enabled: !!value?.enabled, running: !!job.task,
      provider: value && isDav(value) ? "webdav" : "supabase", folder: value && isDav(value) ? value.folder : undefined,
      url: value?.url ?? "", key: value && !isDav(value) ? value.key : "", email: value ? isDav(value) ? value.username : value.session.user.email : undefined,
      vaultId: value?.vaultId, vaultName: value?.vaultName, lastSyncedAt: state?.lastSyncedAt,
      conflicts: conflicts.length, error: job.error ?? (value && isDav(value) && value.needsSignIn ? "WebDAV needs you to sign in again with a valid application password." : retryAt ? waitingMessage : undefined),
      progress: job.progress, needsSignIn: job.needsSignIn || !!(value && isDav(value) && value.needsSignIn),
      retryAt, nextSyncAt: Math.max(job.nextSyncAt ?? 0, retryAt ?? 0) };
  }
  function run() {
    if (job.task) return job.task;
    let started = false;
    let lease: SyncRunLease | undefined;
    job.task = (async () => {
      const { value, api } = await client();
      if (!value.enabled || !value.vaultId) throw new VaultError(400, "Choose a cloud notebook and enable sync first");
      if (options.privateReplica) await store.bindReplica(bindingFor(value), bindingFor(value));
      if (isDav(value)) {
        if (job.needsSignIn || value.needsSignIn) throw new WebDavError("Sign in again before retrying WebDAV authentication.", 401);
        const retryAt = webDavRetryAt(value);
        if (retryAt) throw new WebDavError(waitingMessage, 429, retryAt);
        job.nextSyncAt = Date.now() + 60000;
      }
      started = true;
      lease = await options.runLifecycle?.start();
      job.error = undefined;
      job.retryAt = undefined;
      job.progress = { uploaded: 0, downloaded: 0, conflicts: 0, phase: "preparing", startedAt: Date.now(), updatedAt: Date.now() };
      const binding = bindingFor(value);
      return synchronize(store, api.remote, binding, progress => { job.progress = progress; lease?.update(progress); });
    })().catch(error => {
      job.error = error instanceof Error ? error.message : String(error);
      if (started && job.progress) job.progress = { ...job.progress, updatedAt: Date.now() };
      if (error instanceof WebDavError) {
        if (error.retryAt) {
          job.nextSyncAt = error.retryAt;
          job.retryAt = error.retryAt;
        }
        if ([401, 403].includes(error.status)) job.needsSignIn = true;
      }
      throw error;
    }).finally(async () => { try { await lease?.finish(); } finally { job.task = undefined; } });
    return job.task;
  }
  async function handle(action: string, method: string, input: any = {}): Promise<unknown> {
    // This read never queues behind local file transactions or scans conflict bodies.
    if (method === "GET" && action === "progress") return { running: !!job.task, progress: job.progress, error: job.error, retryAt: job.retryAt };
    if (method === "GET" && action === "status") return status();
    if (method === "GET" && action === "vaults") return (await client()).api.vaults();
    if (method === "GET" && action === "notebooks") {
      const { value, api } = await client();
      return isDav(value) ? createWebDavClient(value, value => store.writeConnection(value), fetcher).discoverVaults() : api.vaults();
    }
    if (method === "GET" && action === "conflicts") return (await store.conflicts()).map(value => ({ ...value, localRevision: itemRevision(value.local) }));
    if (method !== "POST") throw new VaultError(404, "Unknown sync operation");
    if (action === "run") { const result = await run(); return { ...result, status: await status() }; }
    idle();
    if (action === "sign-in") {
      const before = await connection();
      if (input.provider === "webdav") {
        const address = webDavAddress(input.url, input.folder);
        const proposed: WebDavConnection = { provider: "webdav", ...address, username: String(input.email ?? "").trim(), password: input.password, enabled: false };
        if (before && (!isDav(before) || before.url !== proposed.url || before.username !== proposed.username || before.folder !== proposed.folder))
          throw new VaultError(409, "Disconnect the existing notebook before changing the server, account, provider, or remote folder.");
        if (before && isDav(before)) proposed.quota = before.quota;
        await createWebDavClient(proposed, async () => {}, fetcher).probe();
        await store.writeConnection({ ...proposed, vaultId: before?.vaultId, vaultName: before?.vaultName, enabled: before?.enabled ?? false });
      } else {
        if (before && isDav(before)) throw new VaultError(409, "Disconnect WebDAV before connecting Supabase.");
        const signedIn = await signInCloud(input, fetcher);
        if (before && (before.url !== signedIn.url || before.session.user.id !== signedIn.session.user.id))
          throw new VaultError(409, "Disconnect the existing account before connecting a different account or server.");
        await store.writeConnection({ ...before, ...signedIn, vaultId: before?.vaultId, vaultName: before?.vaultName, enabled: before?.enabled ?? false });
      }
      job.error = undefined; job.needsSignIn = false; job.nextSyncAt = undefined; job.retryAt = undefined;
    } else if (action === "connect") {
      const { value, api } = await client();
      if (value.vaultId && value.vaultId !== input.vaultId) throw new VaultError(409, "Disconnect this notebook before switching cloud notebooks.");
      let remote;
      if (input.vaultId) remote = (await api.vaults()).find(vault => vault.id === input.vaultId);
      else {
        if (typeof input.name !== "string" || !input.name.trim() || input.name.length > 200) throw new VaultError(400, "Enter a notebook name");
        remote = await api.createVault(randomUUID(), input.name.trim());
      }
      if (!remote) throw new VaultError(404, "Cloud notebook was not found for this account");
      const proposed = { ...value, vaultId: remote.id, vaultName: remote.name, enabled: true };
      if (options.privateReplica) await store.bindReplica(bindingFor(proposed), value.vaultId ? bindingFor(value) : undefined);
      await store.writeConnection(proposed);
    } else if (action === "pause") {
      const { value } = await client();
      if (typeof input.paused !== "boolean") throw new VaultError(400, "Specify whether sync is paused");
      await store.writeConnection({ ...value, enabled: !input.paused });
    } else if (action === "disconnect") {
      if ((await store.conflicts()).length) throw new VaultError(409, "Resolve sync conflicts before disconnecting this notebook.");
      const value = await connection();
      if (options.privateReplica && value?.vaultId) await store.bindReplica(bindingFor(value), bindingFor(value));
      // Neither local notes nor cloud notes are deleted. Credentials never enter the history archive.
      await store.writeConnection(null);
      if (!options.privateReplica) await store.resetState();
      job.error = undefined; job.progress = undefined; job.retryAt = undefined; job.nextSyncAt = undefined;
    } else if (action === "resolve") {
      if (!["local", "remote", "merged"].includes(input.choice)) throw new VaultError(400, "Choose local, remote, or merged content");
      const conflict = await store.getConflict(input.id);
      if (!conflict) throw new VaultError(404, "Sync conflict not found");
      const selected: SyncItem | undefined = input.choice === "remote" ? conflict.remote.item : input.choice === "merged" ? input.merged : undefined;
      const blob = selected?.kind === "asset" && selected.value ? await (await client()).api.remote.download(selected.value.hash) : undefined;
      await store.resolve(input.id, input.choice, input.baseRevision, input.merged, blob);
    } else throw new VaultError(404, "Unknown sync operation");
    return status();
  }
  /** Copy authenticated access into an isolated replica without exposing secrets to the UI. */
  async function connectReplica(target: Storage, notebook: CloudNotebook) {
    idle();
    const { value, api } = await client();
    let proposed: Connection;
    if (isDav(value)) {
      const address = webDavAddress(value.url, notebook.folder ?? value.folder);
      const remote = await createWebDavClient({ ...value, ...address, vaultId: notebook.id }, updated => {
        value.quota = updated.quota; value.needsSignIn = updated.needsSignIn; return store.writeConnection(value);
      }, fetcher).vaults();
      if (!remote.some(item => item.id === notebook.id)) throw new VaultError(404, "Cloud notebook was not found for this account");
      proposed = { ...value, ...address, vaultId: notebook.id, vaultName: remote[0].name, enabled: true };
    } else {
      const remote = (await api.vaults()).find(item => item.id === notebook.id);
      if (!remote) throw new VaultError(404, "Cloud notebook was not found for this account");
      proposed = { ...value, vaultId: remote.id, vaultName: remote.name, enabled: true };
    }
    const [previous, state] = await Promise.all([target.readConnection<Connection>(), target.readState()]);
    if (previous?.vaultId && bindingFor(previous) !== bindingFor(proposed) || state && state.binding !== bindingFor(proposed))
      throw new VaultError(409, "This offline copy belongs to another cloud notebook. Its files were preserved.");
    await target.bindReplica(bindingFor(proposed), previous?.vaultId ? bindingFor(previous) : undefined);
    await target.writeConnection(proposed);
  }
  return { status, run, handle, connectReplica };
}
