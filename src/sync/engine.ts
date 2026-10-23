import { hashBytes, randomUUID } from "../vault/crypto";
import { absent, itemRevision, sameItem, stateRevision, validateRemote,
  type RemoteItem, type SyncItem, type SyncRemote, type SyncState, type SyncStore } from "./protocol";

export type SyncProgress = { uploaded: number; downloaded: number; conflicts: number };

/** A durable outbox is replayed unchanged after a lost response. No network request holds the vault lock. */
export async function synchronize(store: SyncStore, remote: SyncRemote, binding: string,
  notify: (progress: SyncProgress) => void = () => {}): Promise<SyncProgress> {
  let state = await store.readState();
  let expected = stateRevision(state);
  if (state && state.binding !== binding) throw new Error("This local notebook is connected to another cloud notebook. Disconnect it first.");
  state ??= { version: 1, binding, deviceId: randomUUID(), cursor: 0, bases: {}, conflicts: {} };
  const progress = { uploaded: 0, downloaded: 0, conflicts: 0 };
  const persist = async () => { await store.writeState(state!, expected); expected = stateRevision(state); notify({ ...progress }); };
  await persist();
  const localItems = async () => new Map((await store.list()).map(item => [item.key, item]));

  async function reconcile(incoming: RemoteItem) {
    validateRemote(incoming);
    const { item, version } = incoming, key = item.key;
    const known = state!.bases[key];
    if (known && known.version > version) return; // Idempotent replay of an older change event.
    const conflictId = state!.conflicts[key];
    if (conflictId) {
      const conflict = await store.getConflict(conflictId);
      if (!conflict) throw new Error("A sync conflict record is missing. Sync stopped to preserve the local copy.");
      if (!conflict.resolvedAt) {
        if (conflict.remote.version >= version) return;
        // Preserve each remote generation. The newest unresolved version remains the upload gate.
      } else {
        state!.bases[key] = conflict.remote;
        delete state!.conflicts[key];
      }
    }
    if ((state!.bases[key]?.version ?? 0) > version) return;
    const base = state!.bases[key]?.item ?? absent(item);
    const local = await store.readItem(item);
    if (!state!.conflicts[key] && sameItem(local, item)) { state!.bases[key] = incoming; return; }
    if (!state!.conflicts[key] && sameItem(base, item)) { state!.bases[key] = incoming; return; }
    if (sameItem(local, base) && !state!.conflicts[key]) {
      const blob = item.kind === "asset" && item.value ? await remote.download(item.value.hash) : undefined;
      if (blob && hashBytes(blob) !== item.value!.hash) throw new Error("Attachment checksum failed. The local attachment was preserved.");
      let applied = false;
      try { applied = await store.apply(item, itemRevision(local), blob); }
      catch (error) { if ((error as { status?: number }).status !== 409) throw error; }
      if (applied) {
        state!.bases[key] = incoming; progress.downloaded++; return;
      }
      // A local save raced the download. Preserve its new version, never overwrite it with a refreshed revision.
    }
    const latest = await store.readItem(item);
    const id = `sync-${hashBytes(`${binding}\n${key}\n${version}`).slice(0, 48)}`;
    await store.preserveConflict({ id, key, base: state!.bases[key]?.item ?? null, local: latest,
      remote: incoming, createdAt: new Date().toISOString() });
    state!.conflicts[key] = id; progress.conflicts++;
  }

  async function sendPending() {
    const pending = state!.pending;
    if (!pending) return;
    const response = await remote.push(pending);
    if (!Array.isArray(response.items)) throw new Error("Invalid sync acknowledgement");
    if (response.accepted) {
      if (response.items.length !== pending.mutations.length) throw new Error("Incomplete sync acknowledgement");
      for (const mutation of pending.mutations) {
        const accepted = response.items.find(entry => entry.item.key === mutation.item.key);
        if (!accepted) throw new Error("Missing sync acknowledgement");
        validateRemote(accepted);
        if (!sameItem(accepted.item, mutation.item) || accepted.version <= mutation.expectedVersion)
          throw new Error("Sync acknowledgement does not match the saved outbox");
        state!.bases[accepted.item.key] = accepted; progress.uploaded++;
      }
    } else {
      for (const item of response.items) await reconcile(item);
    }
    delete state!.pending;
    await persist();
  }

  // Retry the exact operation ID before incorporating later changes; an earlier push may have committed.
  await sendPending();
  for (const [key, id] of Object.entries(state.conflicts)) {
    const conflict = await store.getConflict(id);
    if (!conflict) throw new Error("A sync conflict record is missing");
    if (conflict.resolvedAt) { state.bases[key] = conflict.remote; delete state.conflicts[key]; }
  }
  await persist();
  for (let page = 0; ; page++) {
    if (page >= 10000) throw new Error("Sync change stream exceeded the safety limit");
    const pulled = await remote.pull(state.cursor);
    if (!Number.isSafeInteger(pulled.cursor) || pulled.cursor < state.cursor ||
        pulled.more && pulled.cursor === state.cursor || !Array.isArray(pulled.items)) throw new Error("Invalid sync cursor");
    // Applying the last generation for each key prevents false conflicts with this device's older uploads.
    const latest = new Map<string, RemoteItem>();
    for (const entry of pulled.items) { validateRemote(entry); latest.set(entry.item.key, entry); }
    for (const entry of latest.values()) await reconcile(entry);
    state.cursor = pulled.cursor; await persist();
    if (!pulled.more) break;
  }

  const current = await localItems();
  const keys = new Set([...current.keys(), ...Object.keys(state.bases)]);
  const maximumBatch = Math.max(1, Math.min(100, remote.maxBatchItems ?? 1));
  let mutations: NonNullable<SyncState["pending"]>["mutations"] = [], mutationBytes = 0;
  const flush = async () => {
    if (!mutations.length) return;
    state!.pending = { id: randomUUID(), mutations }; mutations = []; mutationBytes = 0;
    await persist(); await sendPending();
  };
  for (const key of keys) {
    if (state.conflicts[key]) continue;
    const base = state.bases[key];
    const item = current.get(key) ?? (base ? absent(base.item) : undefined);
    if (!item || sameItem(item, base?.item ?? absent(item))) continue;
    const size = new TextEncoder().encode(JSON.stringify(item)).length;
    if (mutations.length && (mutations.length >= maximumBatch || mutationBytes + size > 8 * 1024 * 1024)) await flush();
    if (item.kind === "asset" && item.value) {
      const bytes = await store.readBlob(item);
      if (hashBytes(bytes) !== item.value.hash) throw new Error("The attachment changed while preparing upload. Sync again to include its new version.");
      await remote.upload(item.value.hash, bytes);
    }
    mutations.push({ item, expectedVersion: base?.version ?? 0 }); mutationBytes += size;
  }
  await flush();
  state.lastSyncedAt = new Date().toISOString(); await persist();
  return progress;
}
