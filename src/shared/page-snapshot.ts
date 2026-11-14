import type { Page } from "./types";

export const pageSnapshotHeader = "X-Notdown-Page-Snapshot";
/** IDs refer only to the exact snapshot requested by this client. */
export interface PageSnapshot {
  snapshot: string;
  pages: (Page | string)[];
}
