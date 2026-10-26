import type { SyncStatus } from "../sync/service";

/** A mobile notebook is an offline replica of an existing cloud notebook. */
export function mobileNotebookReady(status: Pick<SyncStatus, "signedIn" | "vaultId" | "lastSyncedAt">) {
  return !!(status.signedIn && status.vaultId && status.lastSyncedAt);
}
