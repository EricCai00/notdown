import { hashBytes } from "../vault/crypto";

export type SyncKind = "page" | "metadata" | "person" | "asset";
export type SyncItem = { key: string; kind: SyncKind; value: Record<string, any> | null };
export type RemoteItem = { item: SyncItem; version: number };
export type SyncMutation = { item: SyncItem; expectedVersion: number };
export type SyncApply = { item: SyncItem; expectedRevision: string };
export type SyncBatch = { id: string; mutations: SyncMutation[] };
export type SyncPushResult = { accepted: true; items: RemoteItem[] } | { accepted: false; items: RemoteItem[] };
export type TransferProgress = (completed: number, total: number) => void;
export interface SyncRemote {
  maxBatchItems?: number;
  pull(cursor: number, notify?: TransferProgress): Promise<{ cursor: number; items: RemoteItem[]; more: boolean }>;
  push(batch: SyncBatch): Promise<SyncPushResult>;
  upload(hash: string, bytes: Uint8Array, notify?: TransferProgress): Promise<void>;
  download(hash: string, notify?: TransferProgress): Promise<Uint8Array>;
}
export type SyncConflict = {
  id: string; key: string; base: SyncItem | null; local: SyncItem; remote: RemoteItem;
  createdAt: string; resolvedAt?: string; pageConflict?: boolean;
};
export type SyncState = {
  version: 1; binding: string; deviceId: string; cursor: number;
  bases: Record<string, RemoteItem>; conflicts: Record<string, string>;
  pending?: SyncBatch; lastSyncedAt?: string;
};
export interface SyncStore {
  readState(): Promise<SyncState | null>;
  writeState(state: SyncState, expected: string): Promise<void>;
  list(): Promise<SyncItem[]>;
  readItem(item: SyncItem): Promise<SyncItem>;
  readItems?(items: SyncItem[]): Promise<SyncItem[]>;
  apply(item: SyncItem, expectedRevision: string, blob?: Uint8Array): Promise<boolean>;
  applyBatch?(items: SyncApply[]): Promise<boolean[]>;
  preserveConflict(conflict: SyncConflict): Promise<void>;
  getConflict(id: string): Promise<SyncConflict | null>;
  readBlob(item: SyncItem): Promise<Uint8Array>;
}

/** JSONB can reorder keys. Transport fingerprints must not depend on object insertion order. */
export function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as any)[key])}`).join(",")}}`;
}
export const itemRevision = (item: SyncItem) => hashBytes(canonical(item));
export const stateRevision = (state: SyncState | null) => hashBytes(canonical(state));
export const absent = (item: Pick<SyncItem, "key" | "kind">): SyncItem => ({ key: item.key, kind: item.kind, value: null });
export const sameItem = (a: SyncItem, b: SyncItem) => itemRevision(a) === itemRevision(b);

export function validateItem(value: unknown): asserts value is SyncItem {
  const item = value as SyncItem;
  if (!item || typeof item.key !== "string" || item.key.length > 1100 ||
      !["page", "metadata", "person", "asset"].includes(item.kind) || !item.key.startsWith(`${item.kind}:`) ||
      !(item.value === null || typeof item.value === "object" && !Array.isArray(item.value)))
    throw new Error("Invalid sync item");
  if (JSON.stringify(item).length > 12 * 1024 * 1024) throw new Error("Sync item exceeds 12 MB");
}
export function validateRemote(value: RemoteItem) {
  validateItem(value?.item);
  if (!Number.isSafeInteger(value.version) || value.version < 1) throw new Error("Invalid remote revision");
}
