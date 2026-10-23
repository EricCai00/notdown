import { hashBytes } from "../../src/vault/crypto";
import { canonical, type RemoteItem, type SyncBatch, type SyncPushResult, type SyncRemote } from "../../src/sync/protocol";

/** Reference protocol server with isolated accounts supplied by each test. No user vault is opened. */
export class TestSyncRemote implements SyncRemote {
  sequence = 0;
  items = new Map<string, RemoteItem>();
  events: RemoteItem[] = [];
  operations = new Map<string, { input: string; response: SyncPushResult }>();
  blobs = new Map<string, Uint8Array>();
  offline = false;
  loseResponse = false;
  pageSize = 100;
  private online() { if (this.offline) throw new Error("Network offline"); }
  async pull(cursor: number) {
    this.online();
    const events = this.events.filter(item => item.version > cursor).slice(0, this.pageSize);
    const last = events.at(-1)?.version ?? cursor;
    return structuredClone({ cursor: last, items: events, more: last < this.sequence });
  }
  async push(batch: SyncBatch): Promise<SyncPushResult> {
    this.online();
    const old = this.operations.get(batch.id);
    if (old) { if (old.input !== canonical(batch)) throw new Error("Operation ID reused with different contents"); return structuredClone(old.response); }
    const conflicts = batch.mutations.filter(value => (this.items.get(value.item.key)?.version ?? 0) !== value.expectedVersion);
    const response: SyncPushResult = conflicts.length ? { accepted: false, items: conflicts.map(value => structuredClone(this.items.get(value.item.key)!)) }
      : { accepted: true, items: batch.mutations.map(value => {
        const remote = { item: structuredClone(value.item), version: ++this.sequence };
        this.items.set(value.item.key, remote); this.events.push(remote); return structuredClone(remote);
      }) };
    this.operations.set(batch.id, { input: canonical(batch), response: structuredClone(response) });
    if (this.loseResponse) { this.loseResponse = false; throw new Error("Connection closed after commit"); }
    return response;
  }
  async upload(hash: string, bytes: Uint8Array) { this.online(); if (hashBytes(bytes) !== hash) throw new Error("Checksum mismatch"); this.blobs.set(hash, Uint8Array.from(bytes)); }
  async download(hash: string) { this.online(); const value = this.blobs.get(hash); if (!value) throw new Error("Missing blob"); return Uint8Array.from(value); }
}
