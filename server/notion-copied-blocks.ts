import { attributesXml } from "../src/document/notion-syntax.js";
import { cachedNotionContent, matchesNotionCache } from "./notion-private-blocks.js";
import type { CachedNotionBlock } from "./notion-desktop-cache.js";
import { VaultError } from "./vault.js";

type Json = Record<string, any>;
type Snapshot = { source: { id: string; spaceId: string }; trees: Json[] };
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const object = (value: unknown): value is Json => !!value && typeof value === "object" && !Array.isArray(value);
const meta = ["id", "version", "space_id", "parent_id", "parent_table", "alive", "created_by_id", "created_by_table", "created_time", "last_edited_by_id", "last_edited_by_table", "last_edited_time", "nav_parent_id", "nav_parent_table"];

export function parseCopiedNotionBlocks(input: unknown): Snapshot | undefined {
  if (input === undefined) return;
  try {
    if (typeof input !== "string" || Buffer.byteLength(input) > 5 * 1024 * 1024) throw Error();
    const value = JSON.parse(input);
    if (value.version !== 1 || value.source?.table !== "block" || !uuid.test(value.source.id) || !uuid.test(value.source.spaceId) || value.data?.action !== "copy" || !Array.isArray(value.data.blocks) || !value.data.blocks.length || value.data.blocks.length > 1000) throw Error();
    const trees = value.data.blocks.map((item: Json) => {
      if (!object(item) || !uuid.test(item.blockId) || !object(item.blockSubtree) || item.blockSubtree.__version__ !== 3 || !object(item.blockSubtree.block)) throw Error();
      return item.blockSubtree;
    });
    return { source: value.source, trees };
  } catch { throw new VaultError(400, "Copied Notion blocks are invalid or too large. Copy the source buttons again."); }
}

/** A session may hold explicit copies from several source pages and selections. */
export function parseCopiedNotionSnapshots(input: unknown): Snapshot[] | undefined {
  if (input === undefined) return;
  try {
    if (typeof input !== "string" || Buffer.byteLength(input) > 5 * 1024 * 1024) throw Error();
    const value = JSON.parse(input);
    const copies = value.version === 2 ? value.snapshots : [value];
    if (!Array.isArray(copies) || !copies.length || copies.length > 1000) throw Error();
    return copies.map(copy => parseCopiedNotionBlocks(JSON.stringify(copy))!);
  } catch { throw new VaultError(400, "Copied Notion snapshots are invalid or too large. Copy the source pages again."); }
}

export function recoverCopiedNotionButton(api: Json, pageId: string, input?: Snapshot | Snapshot[]) {
  const snapshots = input ? Array.isArray(input) ? input : [input] : [];
  for (let index = snapshots.length - 1; index >= 0; index--) {
    const snapshot = snapshots[index];
    if (snapshot.source.id === pageId && snapshot.trees.some(tree => Object.hasOwn(tree.block, api.id)))
      return recoverButtonFromSnapshot(api, pageId, snapshot);
  }
  return { warnings: [] as string[] };
}

/** Adopt only an entire verified, static insertion workflow; unknown steps stay opaque. */
function recoverButtonFromSnapshot(api: Json, pageId: string, snapshot: Snapshot) {
  const warnings: string[] = [];
  if (!snapshot || snapshot.source.id !== pageId || (api.type === "unsupported" ? api.unsupported?.block_type : api.type) !== "button") return { warnings };
  const candidates = snapshot.trees.filter(tree => Object.hasOwn(tree.block, api.id));
  if (!candidates.length) return { warnings };
  const tree = candidates[0];
  if (candidates.some(other => JSON.stringify(other) !== JSON.stringify(tree))) return { warnings: [`Button ${api.id}: conflicting copied records; its source was retained.`] };
  const adopted: Record<string, Json> = { block: {}, automation: {}, automation_action: {} };
  const record = (table: string, id: string, parent?: { id: string; table: string }) => {
    const value = uuid.test(id) && object(tree[table]) && Object.hasOwn(tree[table], id) ? tree[table][id]?.value : undefined;
    if (!object(value) || value.id !== id || value.space_id !== snapshot.source.spaceId || value.alive !== true || !Number.isInteger(value.version) || value.version < 0 || parent && (value.parent_id !== parent.id || value.parent_table !== parent.table)) throw Error();
    adopted[table][id] = value;
    return value;
  };
  try {
    const button = record("block", api.id);
    const cached = (value: Json): CachedNotionBlock => ({ id: value.id, type: value.type, version: value.version, lastEdited: value.last_edited_time, properties: value.properties || {}, format: value.format || {}, content: value.content || [], parentId: value.parent_id, parentTable: value.parent_table });
    const parent = api.parent;
    if (button.type !== "button" || !matchesNotionCache(api, cached(button)) || !parent || !["page_id", "block_id"].includes(parent.type) || parent[parent.type] !== button.parent_id || button.parent_table !== "block") throw Error();
    if (!object(button.format) || Object.keys(button.format).some(key => key !== "automation_id") || Object.keys(button.properties || {}).length || button.content?.length) throw Error();
    const automation = record("automation", button.format.automation_id, { id: button.id, table: "block" });
    if (Object.keys(automation).some(key => ![...meta, "status", "trigger", "action_ids", "properties", "last_executed_time", "last_failed_time", "last_failed_reason"].includes(key)) || automation.status !== "active" || automation.trigger?.type !== "button" || Object.keys(automation.trigger).some(key => !["id", "type"].includes(key)) || !object(automation.properties) || Object.keys(automation.properties).some(key => key !== "name") || typeof automation.properties.name !== "string" || !automation.properties.name.trim() || automation.properties.name.length > 500 || !Array.isArray(automation.action_ids) || !automation.action_ids.length || automation.action_ids.length > 50 || new Set(automation.action_ids).size !== automation.action_ids.length) throw Error();
    const actions: { type: string; position: string; content: string }[] = [];
    for (const id of automation.action_ids) {
      const action = record("automation_action", id, { id: automation.id, table: "automation" });
      if (action.type !== "duplicate_blocks" || Object.keys(action).some(key => ![...meta, "type", "blocks"].includes(key)) || !Array.isArray(action.blocks) || action.blocks.length !== 1) throw Error();
      const holder = record("block", action.blocks[0], { id: action.id, table: "automation_action" });
      // The action's empty text holder owns its editable template, not an output paragraph.
      if (holder.type !== "text" || Object.keys(holder.properties || {}).length || Object.keys(holder.format || {}).length || !Array.isArray(holder.content) || !holder.content.length) throw Error();
      const records = new Map<string, CachedNotionBlock>();
      const collect = (value: Json, depth = 0) => {
        if (depth > 30 || Object.keys(adopted.block).length > 1000 || records.has(value.id) || value.content !== undefined && (!Array.isArray(value.content) || value.content.some((child: unknown) => typeof child !== "string" || !uuid.test(child))) || !object(value.properties || {}) || !object(value.format || {})) throw Error();
        records.set(value.id, cached(value));
        for (const child of value.content || []) collect(record("block", child, { id: value.id, table: "block" }), depth + 1);
      };
      collect(holder);
      const content = cachedNotionContent(records.get(holder.id)!, records);
      if (content === undefined || !content.trim()) throw Error();
      actions.push({ type: "insert-blocks", position: "below", content });
    }
    const source = `<button${attributesXml({ label: automation.properties.name, actions: JSON.stringify(actions) }).replace(/\r/g, "&#13;").replace(/\n/g, "&#10;")}/>`;
    warnings.push(`Button ${api.id}: restored its name and static insert-below workflow from copied Notion blocks. Review the copied snapshot before running it; cloud automation execution is not transferred.`);
    return { source, warnings, evidence: { source: "Explicitly copied Notion v3 blocks", pageId, spaceId: snapshot.source.spaceId, records: adopted } };
  } catch {
    warnings.push(`Button ${api.id}: copied configuration is stale, incomplete, conflicting or contains unsupported actions or attributes; its source was retained.`);
    return { warnings };
  }
}
