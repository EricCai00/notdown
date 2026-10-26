import { hashBytes, randomUUID } from "../vault/crypto";
import { absent, itemRevision, sameItem, stateRevision, validateRemote,
  type RemoteItem, type SyncItem, type SyncRemote, type SyncState, type SyncStore } from "./protocol";

export type SyncProgress = {
  uploaded: number; downloaded: number; conflicts: number;
  phase?: "preparing" | "reading" | "applying" | "scanning" | "uploading" | "finalizing" | "complete";
  completed?: number; total?: number; batch?: number; current?: string;
  bytesCompleted?: number; bytesTotal?: number; startedAt?: number; updatedAt?: number;
};

/** A durable outbox is replayed unchanged after a lost response. No network request holds the vault lock. */
export async function synchronize(store: SyncStore, remote: SyncRemote, binding: string,
  notify: (progress: SyncProgress) => void = () => {}): Promise<SyncProgress> {
  const progress: SyncProgress = { uploaded: 0, downloaded: 0, conflicts: 0, startedAt: Date.now() };
  const report = (patch: Partial<SyncProgress> = {}) => { Object.assign(progress, patch, { updatedAt: Date.now() }); notify({ ...progress }); };
  const phase = (value: SyncProgress["phase"], patch: Partial<SyncProgress> = {}) => report({
    phase: value, completed: undefined, total: undefined, current: undefined, bytesCompleted: undefined, bytesTotal: undefined, ...patch,
  });
  const name = (item: SyncItem) => String(item.value?.metadata?.title || item.value?.file || item.key.slice(item.kind.length + 1));
  phase("preparing");
  let state = await store.readState();
  let expected = stateRevision(state);
  if (state && state.binding !== binding) throw new Error("This local notebook is connected to another cloud notebook. Disconnect it first.");
  state ??= { version: 1, binding, deviceId: randomUUID(), cursor: 0, bases: {}, conflicts: {} };
  const persist = async () => { await store.writeState(state!, expected); expected = stateRevision(state); report(); };
  await persist();
  const localItems = async () => new Map((await store.list()).map(item => [item.key, item]));

  async function reconcile(incoming: RemoteItem, suppliedLocal?: SyncItem) {
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
    const local = suppliedLocal ?? await store.readItem(item);
    if (!state!.conflicts[key] && sameItem(local, item)) { state!.bases[key] = incoming; return; }
    if (!state!.conflicts[key] && sameItem(base, item)) { state!.bases[key] = incoming; return; }
    if (sameItem(local, base) && !state!.conflicts[key]) {
      const blob = item.kind === "asset" && item.value ? await remote.download(item.value.hash,
        (bytesCompleted, bytesTotal) => report({ bytesCompleted, bytesTotal })) : undefined;
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

  async function receive(entries: RemoteItem[]) {
    const locals = entries.length > 1 && store.readItems ? await store.readItems(entries.map(entry => entry.item)) : undefined;
    const candidates = locals && store.applyBatch ? entries.flatMap((entry, i) => {
      const { item, version } = entry, base = state!.bases[item.key], local = locals[i];
      if (item.kind === "asset" || state!.conflicts[item.key] || (base?.version ?? 0) > version ||
          sameItem(local, item) || sameItem(base?.item ?? absent(item), item) || !sameItem(local, base?.item ?? absent(item))) return [];
      return [{ item, expectedRevision: itemRevision(local), bytes: new TextEncoder().encode(JSON.stringify({ before: local, after: item })).length + 1 }];
    }) : [];
    const applied = new Set<string>();
    let batch: typeof candidates = [], size = 2;
    const flush = async () => {
      if (batch.length > 1) {
        report({ current: `Saving ${batch.length} changes to this device` });
        const results = await store.applyBatch!(batch.map(({ item, expectedRevision }) => ({ item, expectedRevision })));
        if (results.length !== batch.length || results.some(result => typeof result !== "boolean")) throw new Error("Invalid local sync batch result");
        results.forEach((result, i) => { if (result) applied.add(batch[i].item.key); });
      }
      batch = []; size = 2;
    };
    for (const candidate of candidates) {
      if (batch.length && size + candidate.bytes > 8 * 1024 * 1024) await flush();
      if (candidate.bytes + 2 > 8 * 1024 * 1024) continue; // A single large resource retains the existing individual path.
      batch.push(candidate); size += candidate.bytes;
    }
    await flush();
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      report({ current: name(entry.item), bytesCompleted: undefined, bytesTotal: undefined });
      if (applied.has(entry.item.key)) { state!.bases[entry.item.key] = entry; progress.downloaded++; }
      else await reconcile(entry, locals?.[i]);
      report({ completed: progress.completed! + 1 });
    }
  }

  async function sendPending() {
    const pending = state!.pending;
    if (!pending) return;
    report({ current: `Publishing ${pending.mutations.length} resource(s)`, bytesCompleted: undefined, bytesTotal: undefined });
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
    if (progress.phase === "uploading") report({ completed: (progress.completed ?? 0) + pending.mutations.length });
    delete state!.pending;
    await persist();
  }

  // Retry the exact operation ID before incorporating later changes; an earlier push may have committed.
  if (state.pending) phase("uploading", { completed: 0, total: state.pending.mutations.length });
  await sendPending();
  for (const [key, id] of Object.entries(state.conflicts)) {
    const conflict = await store.getConflict(id);
    if (!conflict) throw new Error("A sync conflict record is missing");
    if (conflict.resolvedAt) { state.bases[key] = conflict.remote; delete state.conflicts[key]; }
  }
  await persist();
  for (let page = 0; ; page++) {
    if (page >= 10000) throw new Error("Sync change stream exceeded the safety limit");
    phase("reading", { batch: page + 1 });
    const pulled = await remote.pull(state.cursor, (completed, total) => report({ completed, total }));
    if (!Number.isSafeInteger(pulled.cursor) || pulled.cursor < state.cursor ||
        pulled.more && pulled.cursor === state.cursor || !Array.isArray(pulled.items)) throw new Error("Invalid sync cursor");
    // Applying the last generation for each key prevents false conflicts with this device's older uploads.
    const latest = new Map<string, RemoteItem>();
    for (const entry of pulled.items) { validateRemote(entry); latest.set(entry.item.key, entry); }
    phase("applying", { completed: 0, total: latest.size });
    let group: RemoteItem[] = [], bytes = 0;
    for (const entry of latest.values()) {
      const size = new TextEncoder().encode(JSON.stringify(entry.item)).length;
      if (group.length && bytes + size > 8 * 1024 * 1024) { await receive(group); group = []; bytes = 0; }
      group.push(entry); bytes += size;
    }
    if (group.length) await receive(group);
    state.cursor = pulled.cursor; await persist();
    if (!pulled.more) break;
  }

  phase("scanning", { batch: undefined });
  const current = await localItems();
  const keys = new Set([...current.keys(), ...Object.keys(state.bases)]);
  const maximumBatch = Math.max(1, Math.min(100, remote.maxBatchItems ?? 1));
  const outgoing: { item: SyncItem; expectedVersion: number }[] = [];
  for (const key of keys) {
    if (state.conflicts[key]) continue;
    const base = state.bases[key], item = current.get(key) ?? (base ? absent(base.item) : undefined);
    if (item && !sameItem(item, base?.item ?? absent(item))) outgoing.push({ item, expectedVersion: base?.version ?? 0 });
  }
  phase("uploading", { completed: 0, total: outgoing.length });
  let mutations: NonNullable<SyncState["pending"]>["mutations"] = [], mutationBytes = 0;
  const flush = async () => {
    if (!mutations.length) return;
    state!.pending = { id: randomUUID(), mutations }; mutations = []; mutationBytes = 0;
    await persist(); await sendPending();
  };
  for (const { item, expectedVersion } of outgoing) {
    const size = new TextEncoder().encode(JSON.stringify(item)).length;
    if (mutations.length && (mutations.length >= maximumBatch || mutationBytes + size > 8 * 1024 * 1024)) await flush();
    report({ current: name(item), bytesCompleted: undefined, bytesTotal: undefined });
    if (item.kind === "asset" && item.value) {
      const bytes = await store.readBlob(item);
      if (hashBytes(bytes) !== item.value.hash) throw new Error("The attachment changed while preparing upload. Sync again to include its new version.");
      await remote.upload(item.value.hash, bytes, (bytesCompleted, bytesTotal) => report({ bytesCompleted, bytesTotal }));
    }
    mutations.push({ item, expectedVersion }); mutationBytes += size;
  }
  await flush();
  phase("finalizing");
  state.lastSyncedAt = new Date().toISOString(); await persist();
  phase("complete");
  return progress;
}
