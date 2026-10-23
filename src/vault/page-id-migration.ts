import type { Buffer } from "buffer";
import { hashBytes, randomUUID } from "./crypto.js";
import type { VaultPlatform, StorageError } from "./platform.js";
import { documentMetadata } from "../features/metadata/document-metadata.js";
import { isPageUuid, stablePageUuid } from "./page-id.js";
import { migratePageReferences } from "./page-id-references.js";
import { VaultError, type Page } from "./vault.js";

type Stored = { page: Page; source: string; filePath: string; metadata: Record<string, unknown> };
type Index = { version: 1; pages: Record<string, Record<string, unknown>>; [key: string]: unknown };
type Change = { file: string; before: string | null; after: string | null };
export type PageIdMigrationPlan = {
  pages: { id: string; nextId: string; file: string; baseRevision: string }[];
  fingerprint: string;
};
type Context = {
  platform: VaultPlatform;
  root: string;
  scan: () => Promise<Map<string, Stored>>;
  serialize: <T>(fn: () => Promise<T>) => Promise<T>;
  readMetadata: () => Promise<Index>;
  readOptional: (file: string) => Promise<string | null>;
  atomicWrite: (file: string, data: string | Buffer, expected?: string | null) => Promise<void>;
  safeDirectory: (file: string) => Promise<void>;
  snapshot: (page: Stored) => Promise<void>;
};
const hash = (value: string) => hashBytes(value);
const legacyNotion = /^notion-([a-f0-9]{24})-([a-f0-9-]{36})$/;

/** A recoverable multi-file CAS transaction, executed under the vault's lock. */
export function createPageIdMigration(ctx: Context) {
  const { fs, path } = ctx.platform;
  const journalPath = path.join(ctx.root, ".history/page-id-migration.json");
  const resolve = (file: string) => {
    if (!/^(?:metadata\.json|pages\/[^/\\]+\.md|\.history\/imports\/[a-f0-9]{64}\/manifest\.json|\.history\/conflicts\/[a-zA-Z0-9_-]+\.(?:json|md))$/.test(file) || file.includes(".."))
      throw new VaultError(422, "Invalid page ID migration path");
    const target = path.resolve(ctx.root, file);
    if (!target.startsWith(ctx.root + path.sep)) throw new VaultError(422, "Invalid migration target");
    return target;
  };
  async function auxiliary() {
    const files: Change[] = [];
    const imports = path.join(ctx.root, ".history/imports");
    try {
      for (const entry of await fs.readdir(imports, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.isSymbolicLink() || !/^[a-f0-9]{64}$/.test(entry.name)) continue;
        const file = `.history/imports/${entry.name}/manifest.json`;
        const before = await ctx.readOptional(resolve(file));
        if (before !== null) files.push({ file, before, after: before });
      }
    } catch (error) { if ((error as StorageError).code !== "ENOENT") throw error; }
    for (const entry of await fs.readdir(path.join(ctx.root, ".history/conflicts"), { withFileTypes: true })) {
      if (!entry.isFile() || entry.isSymbolicLink() || !/^[a-zA-Z0-9_-]+\.(?:json|md)$/.test(entry.name)) continue;
      const file = `.history/conflicts/${entry.name}`, before = await ctx.readOptional(resolve(file));
      files.push({ file, before, after: before });
    }
    return files.sort((a, b) => a.file.localeCompare(b.file));
  }
  async function state() {
    const pages = await ctx.scan(), extra = await auxiliary();
    const metadata = await ctx.readOptional(path.join(ctx.root, "metadata.json"));
    const rows = [...pages.values()].map(p => ({ id: p.page.id, nextId: isPageUuid(p.page.id) ? p.page.id : stablePageUuid(p.page.id),
      file: path.basename(p.filePath), baseRevision: p.page.revision }));
    return { pages, extra, metadata, plan: { pages: rows,
      fingerprint: hash(JSON.stringify([rows, metadata, extra.map(e => [e.file, e.before])])) } };
  }
  async function applyChanges(changes: Change[]) {
    // Validate the entire transaction before continuing an interrupted run.
    for (const change of changes) {
      if (!(change.before === null || typeof change.before === "string") || !(change.after === null || typeof change.after === "string"))
        throw new VaultError(422, "Invalid page ID migration journal");
      const current = await ctx.readOptional(resolve(change.file));
      if (current !== change.before && current !== change.after)
        throw new VaultError(409, "Page ID migration conflicts with an external edit. Disk content and both migration versions are preserved.", { file: change.file });
    }
    for (const change of changes) {
      const target = resolve(change.file), current = await ctx.readOptional(target);
      if (current === change.after) continue;
      if (current !== change.before) throw new VaultError(409, "File changed during ID migration; recovery copies preserved", { file: change.file });
      if (change.after === null) await fs.unlink(target);
      else await ctx.atomicWrite(target, change.after, change.before);
    }
  }
  async function recover() {
    const raw = await ctx.readOptional(journalPath);
    if (!raw) return;
    const journal = JSON.parse(raw);
    if (journal.version !== 1 || !Array.isArray(journal.changes) ||
        typeof journal.backup !== "string" || !/^\.history\/migrations\/page-ids-[a-f0-9-]{36}$/.test(journal.backup))
      throw new VaultError(422, "Invalid page ID migration journal; preserved for recovery");
    await applyChanges(journal.changes);
    await ctx.atomicWrite(path.join(ctx.root, journal.backup, "manifest.json"), JSON.stringify({ ...journal, completed: true }, null, 2));
    await fs.unlink(journalPath);
  }
  return {
    recover,
    plan: () => ctx.serialize(async () => (await state()).plan),
    migrate: (plan: PageIdMigrationPlan) => ctx.serialize(async () => {
      const current = await state();
      if (!plan || plan.fingerprint !== current.plan.fingerprint || JSON.stringify(plan.pages) !== JSON.stringify(current.plan.pages))
        throw new VaultError(409, "The vault changed after ID migration planning. No files were migrated; review a new plan.");
      const ids = new Map<string, string>();
      for (const row of plan.pages) if (row.id !== row.nextId) ids.set(row.id, row.nextId);
      // Plain Markdown files formerly took their ID from their filename.
      for (const stored of current.pages.values()) if (!stored.metadata.id && !documentMetadata(stored.source).values.id) {
        const stem = path.basename(stored.filePath, ".md");
        const old = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(stem) ? stem : `page-${hash(stem).slice(0, 32)}`;
        if (old !== stored.page.id) ids.set(old, stored.page.id);
      }
      if (!ids.size) return { migrated: 0, updatedReferences: 0, backupPath: null, ids: {} };
      const targets = new Set(plan.pages.map(row => row.nextId));
      if (targets.size !== plan.pages.length) throw new VaultError(409, "UUID migration would collide with an existing page");
      const index = await ctx.readMetadata();
      const changes: Change[] = [], removals: Change[] = [];
      let migrated = 0, updatedReferences = 0;
      const remap = (value: unknown) => typeof value === "string" ? ids.get(value) ?? value : value;
      for (const stored of current.pages.values()) {
        const id = String(remap(stored.page.id));
        const aliases = [...ids].filter(([, target]) => target === id).map(([old]) => old);
        const source = migratePageReferences(stored.page, ids);
        if (!aliases.length && source === stored.source && remap(stored.metadata.parent) === stored.metadata.parent) continue;
        if (source !== stored.source) updatedReferences++;
        const entry: Record<string, unknown> = { ...stored.metadata, id, parent: remap(stored.metadata.parent ?? stored.page.parent) };
        if (aliases.length) {
          const prior = entry.pageIdMigration as { previousIds?: string[] } | undefined;
          if (prior !== undefined && (!prior || typeof prior !== "object" || Array.isArray(prior) ||
              prior.previousIds !== undefined && (!Array.isArray(prior.previousIds) || prior.previousIds.some(id => typeof id !== "string"))))
            throw new VaultError(422, "Existing pageIdMigration metadata has an unsupported shape; original values preserved");
          Object.assign(entry, { pageIdMigration: { ...prior, version: 1, previousIds: [...new Set([...(prior?.previousIds ?? []), ...aliases])] } });
          migrated++;
        }
        const origin = legacyNotion.exec(stored.page.id);
        if (origin) Object.assign(entry, { notionImport: { ...(entry.notionImport as object ?? {}), batchId: origin[1], pageId: origin[2] } });
        const file = aliases.length ? `${id}.md` : path.basename(stored.filePath);
        const oldPath = `pages/${path.basename(stored.filePath)}`, newPath = `pages/${file}`;
        if (oldPath !== newPath) {
          if (await ctx.readOptional(resolve(newPath)) !== null) throw new VaultError(409, "UUID destination file already exists");
          changes.push({ file: newPath, before: null, after: source });
          removals.push({ file: oldPath, before: stored.source, after: null });
        } else if (source !== stored.source) changes.push({ file: oldPath, before: stored.source, after: source });
        // Keep metadata and all unknown fields; only managed identity changes.
        if (id !== stored.page.id) delete index.pages[stored.page.id];
        index.pages[id] = { ...entry, file, sourceHash: hash(source) };
      }
      for (const file of current.extra) {
        if (!file.file.endsWith(".json")) continue;
        const record = JSON.parse(file.before!);
        if (file.file.includes("/imports/")) {
          if (Array.isArray(record.pageIds)) record.pageIds = record.pageIds.map(remap);
        } else {
          const owner = current.pages.get(record.pageId);
          const proposed = current.extra.find(f => f.file === file.file.replace(/\.json$/, ".md"));
          if (owner && proposed?.before !== null && proposed?.before !== undefined) {
            const after = migratePageReferences({ ...owner.page, body: proposed.before }, ids);
            if (after !== proposed.before) changes.push({ ...proposed, after });
          }
          record.pageId = remap(record.pageId);
          record.metadata = { ...(record.metadata ?? {}), id: record.pageId,
            ...(record.metadata?.parent === undefined ? {} : { parent: remap(record.metadata.parent) }) };
        }
        const after = JSON.stringify(record, null, 2);
        if (JSON.stringify(JSON.parse(file.before!)) !== JSON.stringify(record)) changes.push({ ...file, after });
      }
      changes.push({ file: "metadata.json", before: current.metadata, after: JSON.stringify(index, null, 2) + "\n" }, ...removals);
      const backup = `.history/migrations/page-ids-${randomUUID()}`;
      const backupPath = path.join(ctx.root, backup);
      await ctx.safeDirectory(path.join(ctx.root, ".history/migrations"));
      await ctx.safeDirectory(backupPath);
      // The journal includes both versions of every touched file, including
      // metadata/manifests. Historical snapshots and original API archives stay intact.
      const journal = { version: 1, completed: false, backup, createdAt: new Date().toISOString(), ids: Object.fromEntries(ids), changes };
      await ctx.atomicWrite(path.join(backupPath, "manifest.json"), JSON.stringify(journal, null, 2));
      for (const stored of current.pages.values()) await ctx.snapshot(stored);
      const latest = await state();
      if (latest.plan.fingerprint !== plan.fingerprint) throw new VaultError(409, "The vault changed while backing up. No page was migrated.", { backupPath });
      await ctx.atomicWrite(journalPath, JSON.stringify(journal, null, 2), null);
      await recover();
      return { migrated, updatedReferences, backupPath, ids: Object.fromEntries(ids) };
    }),
  };
}
