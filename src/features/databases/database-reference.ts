import { escapeXml, localPageTarget } from "../../document/notion-syntax";
import { resolveExternal } from "../references/external-client";
import type { DatabaseSnapshot, DatabaseView } from "./database-model";

/** A collection:// carrier chooses a source; it is not a database/page identity. */
export function databaseSourceView(snapshot: DatabaseSnapshot, sourceUrl: unknown): DatabaseView | undefined {
  if (typeof sourceUrl !== "string") return;
  const match = /^collection:\/\/([0-9a-f-]{32,36})\/?$/i.exec(sourceUrl);
  if (!match) return;
  const same = (value: unknown) => typeof value === "string" && value.replace(/-/g, "").toLowerCase() === match[1].replace(/-/g, "").toLowerCase();
  const source = snapshot.dataSources.find(source => same(source.id) || same((source.notion as { id?: string } | undefined)?.id));
  return source ? snapshot.views.find(view => view.dataSourceId === source.id) : undefined;
}

/** Local identity carried by the existing official database URL attribute. */
export function databaseHostId(url: unknown): string | undefined {
  if (typeof url !== "string") return;
  const external = resolveExternal(url, "database");
  if (external?.status === "resolved") return external.localId;
  const target = localPageTarget(url);
  return target && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(target) ? target : undefined;
}
/** The Markdown contains only a reference; records and schema remain vault resources. */
export function databaseReference(hostId: string, title: string, inline = true): string {
  if (!databaseHostId(`#page/${encodeURIComponent(hostId)}`)) throw new Error("Invalid database host page ID");
  return `<database url="#page/${encodeURIComponent(hostId)}" inline="${inline}">${escapeXml(title.replace(/[\r\n]+/g, " "))}</database>`;
}
