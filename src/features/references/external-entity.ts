/** External identities never depend on a display name or an import batch. */
export type ExternalKind = "page" | "user" | "database" | "data-source" | "block";
export interface ExternalIdentity { provider: "notion"; kind: ExternalKind; id: string }
export interface ExternalObservation extends ExternalIdentity { label?: string; url?: string; data?: Record<string, unknown> }
export interface ExternalEntity extends ExternalObservation {
  key: string;
  status: "resolved" | "unresolved" | "ambiguous";
  localId?: string;
  candidates: string[];
  references: { pageId: string; location: string; occurrence?: number }[];
  importIds: string[];
}
export interface ExternalLibrary { revision: string; entities: ExternalEntity[]; warnings: string[] }
export function notionId(value: unknown): string | undefined {
  if (typeof value !== "string") return;
  const id = value.replace(/-/g, "").toLowerCase();
  if (!/^[a-f0-9]{32}$/.test(id)) return;
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
}
export const externalKey = (identity: ExternalIdentity) => `${identity.provider}:${identity.kind}:${identity.id}`;
/** Strict host/path recognition; query/view IDs and lookalike hosts are not identities. */
export function externalIdentity(value: unknown, kind?: ExternalKind): ExternalIdentity | undefined {
  if (typeof value !== "string") return;
  if (value.startsWith("user://") || value.startsWith("collection://")) {
    const id = notionId(value.slice(value.indexOf("://") + 3));
    return id ? { provider: "notion", kind: value.startsWith("user://") ? "user" : "data-source", id } : undefined;
  }
  let url: URL;
  try { url = new URL(value.startsWith("/p/") ? `https://www.notion.so${value}` : value); } catch { return; }
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password ||
      !/(^|\.)(notion\.so|notion\.com|notion\.site)$/i.test(url.hostname)) return;
  const id = notionId(/([a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})\/?$/i.exec(url.pathname)?.[1]);
  if (!id) return;
  // A block anchor must never silently resolve to the containing page.
  if (url.hash) {
    const block = notionId(url.hash.slice(1));
    return { provider: "notion", kind: "block", id: block ?? `${id}#${url.hash.slice(1)}` };
  }
  return { provider: "notion", kind: kind ?? "page", id };
}
export function unknownEntityLabel(kind: ExternalKind): string {
  return ({ page: "Unknown page", user: "Unknown user", database: "Unknown database", "data-source": "Unknown data source", block: "Unknown location" })[kind];
}
