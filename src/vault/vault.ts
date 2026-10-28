import { Buffer } from "buffer";
import { archivePath, archiveLimits, validateArchive, type VaultArchiveFile } from "./archive.js";
import { hashBytes, randomUUID } from "./crypto.js";
import type { VaultPlatform, StorageError } from "./platform.js";
import { documentMetadata } from "../features/metadata/document-metadata.js";
import { isPageUuid, stablePageUuid } from "./page-id.js";
import { createPageIdMigration } from "./page-id-migration.js";
import { trashedPageIds } from "../features/pages/page-hierarchy.js";
import { createPeople } from "./people.js";
import { createExternalEntities } from "./external-entities";
import { createRuntimeSettings } from "./runtime-settings";
import { createPageBatch } from "./page-batch";
import { appendChildPageEntries } from "../features/pages/child-page-entries";
import { defaultChildPageSettings, type ChildPageSettings, type ChildPageSettingsSnapshot } from "../shared/child-page-settings";
import { createPageHistory, historySignature, isHistoryTransientFile, type HistoryRecord } from "./history.js";
import { createDatabases } from "./databases.js";
import { reconcileWikiMembership } from "./wiki.js";
import { isWikiDatabase, type Database } from "../features/databases/database-model.js";
import { createVaultSyncStore, isSyncLocalFile } from "./sync-store.js";
import type { SyncConflict, SyncItem } from "../sync/protocol.js";
import { createSyncService } from "../sync/service.js";
import { createAssets } from "./assets.js";
import type { DatabaseResources } from "../features/databases/database-model.js";
import type { ImportPlan } from "../../server/markdown-import.js";
import type { ImportProgress } from "../shared/import-progress.js";
import { comparePageOrder, orderBetween, pageOrderKey, type PageMoveInput } from "../features/pages/page-order.js";
import type { BodyFormat } from "../document/notion-syntax.js";
import {
  validSyntax,
  syntaxFormat,
  type SyntaxConfig,
} from "../markdown-engine/config.js";

export type Page = {
  dataSourceId?: string;
  databaseId?: string;
  wiki?: boolean;
  wikiMember?: boolean;
  legacyIds?: string[];
  id: string;
  title: string;
  parent: string | null;
  icon: string;
  properties: Record<string, unknown>;
  body: string;
  bodyFormat?: BodyFormat;
  syntax?: SyntaxConfig;
  revision: string;
  updated: string;
  favorite?: boolean;
  trashed?: boolean;
  sidebarOrder?: string;
};
export type PageInput = Partial<
  Pick<Page, "title" | "parent" | "icon" | "properties" | "body" | "bodyFormat" | "favorite" | "trashed" | "sidebarOrder">
> & { syntax?: SyntaxConfig | null };
export type PageMutation = Page & { relatedPages?: Page[] };
export type Conflict = {
  syncId?: string;
  id: string;
  conflictId: string;
  pageId: string;
  createdAt: string;
  baseRevision: string;
  currentRevision: string;
  current: Page;
  proposed: Page;
};
type StoredPage = {
  page: Page;
  source: string;
  filePath: string;
  metadata: Record<string, unknown>;
};
export type LegacyMetadataMigrationPlan = {
  pages: { id: string; file: string; baseRevision: string }[];
};

export class VaultError extends Error {
  constructor(
    public status: number,
    message: string,
    public details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

const validId = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;
const hash = hashBytes;
const own = (object: object, key: string) =>
  Object.prototype.hasOwnProperty.call(object, key);

export function assertId(id: unknown): asserts id is string {
  if (typeof id !== "string" || !validId.test(id))
    throw new VaultError(400, "Invalid page ID");
}

function checkInput(input: PageInput) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new VaultError(400, "A page object is required");
  for (const key of ["favorite", "trashed"] as const) {
    if (own(input, key) && typeof input[key] !== "boolean")
      throw new VaultError(400, `${key} must be a boolean`);
  }
  if (own(input, "sidebarOrder") && (typeof input.sidebarOrder !== "string" || !/^[0-9]{1,4096}$/.test(input.sidebarOrder)))
    throw new VaultError(400, "Invalid sidebar order");
  if (
    own(input, "title") &&
    (typeof input.title !== "string" ||
      !input.title.trim() ||
      input.title.length > 500)
  ) {
    throw new VaultError(400, "Title must not be empty or exceed 500 characters");
  }
  if (own(input, "parent") && input.parent !== null) assertId(input.parent);
  if (
    own(input, "icon") &&
    (typeof input.icon !== "string" || input.icon.length > 100)
  )
    throw new VaultError(400, "Invalid icon");
  if (own(input, "body") && typeof input.body !== "string")
    throw new VaultError(400, "Content must be a Markdown string");
  if (
    own(input, "syntax") &&
    input.syntax !== null &&
    !validSyntax(input.syntax)
  )
    throw new VaultError(400, "Invalid Markdown dialect configuration");
  if (
    input.syntax &&
    input.bodyFormat &&
    syntaxFormat(input.syntax) !== input.bodyFormat
  )
    throw new VaultError(400, "Dialect does not match bodyFormat");
  if (
    own(input, "bodyFormat") &&
    !["markdown", "notion-markdown"].includes(input.bodyFormat!)
  )
    throw new VaultError(400, "Unsupported body format");
  if (own(input, "body") && Buffer.byteLength(input.body!) > 10 * 1024 * 1024)
    throw new VaultError(413, "Page exceeds 10 MB");
  if (
    own(input, "properties") &&
    (!input.properties ||
      typeof input.properties !== "object" ||
      Array.isArray(input.properties))
  ) {
    throw new VaultError(400, "properties must be an object");
  }
}

const vaultQueues = new Map<string, Promise<unknown>>();
type MetadataFile = { version: 1; pages: Record<string, Record<string, unknown>>; [key: string]: unknown };

/** Each mutation is serialized; Markdown files are re-read for every operation. */
export function createVault(vaultPath: string, platform: VaultPlatform, options: {
  recycleFile?: (filename: string) => Promise<void>; syncFetch?: typeof fetch;
  onChange?: () => void;
  /** App-managed mobile replicas use indexed page reads and independent attachment display reads. */
  privateReplica?: boolean;
} = {}) {
  const { fs, path } = platform;
  function decode(source: string, filePath: string, defaults: Record<string, unknown> = {}): StoredPage {
    let overlay: Record<string, unknown>;
    try {
      const parsed = documentMetadata(source);
      overlay = parsed.values;
      if (parsed.form === "pandoc" && typeof overlay.title === "string" && !overlay.title.trim()) delete overlay.title;
    }
    catch { throw new VaultError(422, `Invalid YAML metadata in file: ${path.basename(filePath)}`); }
    const stem = path.basename(filePath, path.extname(filePath));
    const fallbackId = isPageUuid(stem) ? stem : stablePageUuid(stem);
    const id = defaults.id ?? overlay.id ?? fallbackId;
    const legacyIds = Array.isArray((defaults.pageIdMigration as { previousIds?: unknown })?.previousIds)
      ? (defaults.pageIdMigration as { previousIds: unknown[] }).previousIds.filter((id): id is string => typeof id === "string" && validId.test(id))
      : defaults.id === undefined && overlay.id === undefined && !isPageUuid(stem)
        ? [validId.test(stem) ? stem : `page-${hash(stem).slice(0, 32)}`] : [];
    const metadata: Record<string, unknown> = { title: stem, parent: null, icon: "\u{1F4C4}", properties: {}, bodyFormat: "markdown", updated: "", ...defaults, ...overlay, id };
    const known = new Set(["id", "title", "parent", "icon", "properties", "bodyFormat", "syntax", "updated", "favorite", "trashed", "sidebarOrder", "dataSourceId", "databaseId"]);
    const extra = Object.fromEntries(Object.entries(overlay).filter(([key]) => !known.has(key)));
    const properties = { ...(defaults.properties as object ?? {}), ...extra, ...(overlay.properties as object ?? {}) };
    const { title, parent, icon, updated, bodyFormat, syntax, favorite, trashed, sidebarOrder } = metadata;
    try {
      checkInput(defaults as PageInput);
      assertId(id);
      checkInput({ title, parent, icon, properties, bodyFormat,
        ...(favorite === undefined ? {} : { favorite }), ...(trashed === undefined ? {} : { trashed }),
        ...(sidebarOrder === undefined ? {} : { sidebarOrder }), ...(syntax === undefined ? {} : { syntax }),
      } as PageInput);
      if (typeof updated !== "string") throw new Error("updated");
      if (overlay.properties !== undefined && (!overlay.properties || typeof overlay.properties !== "object" || Array.isArray(overlay.properties))) throw new Error("properties");
    } catch { throw new VaultError(422, `Invalid page metadata in file: ${path.basename(filePath)}`); }
    return {
      source, filePath, metadata: defaults,
      page: {
        ...(legacyIds.length ? { legacyIds } : {}),
        id: id as string, title: title as string, parent: parent as string | null,
        ...(typeof defaults.dataSourceId === "string" ? { dataSourceId: defaults.dataSourceId } : {}),
        ...(typeof defaults.databaseId === "string" ? { databaseId: defaults.databaseId } : {}),
        ...(defaults.wiki === true ? { wiki: true } : {}),
        ...(typeof defaults.wikiMembership === "string" ? { wikiMember: true } : {}),
        icon: icon as string, properties, updated: updated as string, body: source,
        bodyFormat: bodyFormat as BodyFormat,
        ...(syntax === undefined ? {} : { syntax: syntax as SyntaxConfig }),
        revision: hash(JSON.stringify([source, defaults])),
        ...(favorite === undefined ? {} : { favorite: favorite as boolean }),
        ...(trashed === undefined ? {} : { trashed: trashed as boolean }),
        ...(sidebarOrder === undefined ? {} : { sidebarOrder: sidebarOrder as string }),
      },
    };
  }

  function encode(
    previous: StoredPage | undefined,
    id: string,
    input: PageInput,
  ): { source: string; metadata: Record<string, unknown> } {
    if (
      previous &&
      own(input, "bodyFormat") &&
      input.bodyFormat !== previous.page.bodyFormat &&
      !own(input, "body")
    )
      throw new VaultError(400, "Changing body format requires the complete converted content");
    const metadata: Record<string, unknown> = previous
      ? { title: path.basename(previous.filePath, ".md"), parent: null, icon: "\u{1F4C4}",
          properties: {}, bodyFormat: "markdown", ...previous.metadata, id }
      : { id };
    const set = (key: string, value: unknown) => { metadata[key] = value; };
    if (previous?.page.legacyIds?.length && !metadata.pageIdMigration)
      metadata.pageIdMigration = { version: 1, previousIds: previous.page.legacyIds };
    let overlay: Record<string, unknown>;
    try { overlay = documentMetadata(input.body ?? previous?.source ?? "").values; }
    catch { throw new VaultError(422, "Invalid YAML metadata; the original file was preserved"); }
    const overlayProperties = { ...Object.fromEntries(Object.entries(overlay).filter(([key]) =>
      !["id", "title", "parent", "icon", "properties", "bodyFormat", "syntax", "updated", "favorite", "trashed", "sidebarOrder"].includes(key))),
      ...(overlay.properties as object ?? {}) } as Record<string, unknown>;
    const unchangedOverride = (key: string, value: unknown) => own(overlay, key) && JSON.stringify(overlay[key]) === JSON.stringify(value);
    if (
      previous &&
      own(input, "syntax") &&
      JSON.stringify(input.syntax) !== JSON.stringify(previous.page.syntax) &&
      !own(input, "body")
    )
      throw new VaultError(400, "Changing dialect or extensions requires the complete content");
    if (
      previous?.page.syntax &&
      own(input, "bodyFormat") &&
      !own(input, "syntax") &&
      input.bodyFormat !== syntaxFormat(previous.page.syntax)
    )
      throw new VaultError(400, "Changing format requires updating the dialect configuration");
    if (!previous) {
      set("id", id);
      set("title", input.title ?? "Untitled page");
      set("parent", input.parent ?? null);
      set("icon", input.icon ?? "📄");
      set("properties", input.properties ?? {});
      set("bodyFormat", input.bodyFormat ?? "notion-markdown");
    } else {
      for (const key of [
        "title",
        "parent",
        "icon",
        "properties",
        "bodyFormat",
      ] as const) {
        if (key === "properties" && input.properties) {
          const properties = { ...(metadata.properties as Record<string, unknown>) };
          for (const name of new Set([...Object.keys(previous.page.properties), ...Object.keys(input.properties)])) {
            if (own(overlayProperties, name) && JSON.stringify(overlayProperties[name]) === JSON.stringify(input.properties[name])) continue;
            if (JSON.stringify(input.properties[name]) === JSON.stringify(previous.page.properties[name])) continue;
            if (own(input.properties, name)) properties[name] = input.properties[name];
            else delete properties[name];
          }
          set(key, properties);
        } else if (own(input, key) && !unchangedOverride(key, input[key]) && JSON.stringify(input[key]) !== JSON.stringify(previous.page[key])) set(key, input[key]);
      }
    }
    set("updated", new Date().toISOString());
    if (own(input, "sidebarOrder") && !unchangedOverride("sidebarOrder", input.sidebarOrder) && input.sidebarOrder !== previous?.page.sidebarOrder) set("sidebarOrder", input.sidebarOrder);
    for (const key of ["favorite", "trashed"] as const) {
      if (own(input, key) && (!previous || (!unchangedOverride(key, input[key]) && JSON.stringify(input[key]) !== JSON.stringify(previous.page[key])))) set(key, input[key]);
    }
    // Crossing format families must keep JSON defaults coherent even when the
    // new syntax is already declared by the document's YAML override.
    const changingFormat = previous && own(input, "bodyFormat") && input.bodyFormat !== previous.page.bodyFormat;
    if (input.syntax && (!previous || ((!unchangedOverride("syntax", input.syntax) || changingFormat) && JSON.stringify(input.syntax) !== JSON.stringify(previous.page.syntax)))) {
      set("syntax", input.syntax);
      set("bodyFormat", syntaxFormat(input.syntax));
    } else if (input.syntax === null) delete metadata.syntax;
    return { source: input.body ?? previous?.source ?? "", metadata };
  }


  const root = path.resolve(vaultPath);
  const pagesPath = path.join(root, "pages");
  const historyPath = path.join(root, ".history");
  const conflictsPath = path.join(historyPath, "conflicts");
  const assetsPath = path.join(root, "assets");
  const metadataPath = path.join(root, "metadata.json");
  let initialized: Promise<void> | undefined;

  async function safeDirectory(directory: string) {
    try {
      const stat = await fs.lstat(directory);
      if (stat.isSymbolicLink() || !stat.isDirectory())
        throw new VaultError(422, "Vault directory cannot be a symbolic link or regular file");
    } catch (error) {
      if ((error as StorageError).code !== "ENOENT") throw error;
      await fs.mkdir(directory);
    }
  }
  async function init() {
    initialized ??= (async () => {
      // The selected vault path itself must be real; no links in managed child directories.
      await fs.mkdir(path.dirname(root), { recursive: true });
      await safeDirectory(root);
      await safeDirectory(pagesPath);
      await safeDirectory(historyPath);
      await safeDirectory(conflictsPath);
      await safeDirectory(assetsPath);
    })();
    await initialized;
  }
  function serialize<T>(operation: () => Promise<T>): Promise<T> {
    const locked = async () => {
      await init();
      await safeDirectory(historyPath);
      return platform.withLock(root, operation);
    };
    const queueKey = platform.id + ":" + root;
    const next = (vaultQueues.get(queueKey) ?? Promise.resolve()).then(locked, locked);
    const tail = next.catch(() => undefined);
    vaultQueues.set(queueKey, tail);
    void tail.then(() => { if (vaultQueues.get(queueKey) === tail) vaultQueues.delete(queueKey); });
    return next;
  }
  async function readMetadata(): Promise<MetadataFile> {
    try {
      const stat = await fs.lstat(metadataPath);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("file");
      const value = JSON.parse(await fs.readFile(metadataPath, "utf8"));
      if (value?.version !== 1 || !value.pages || typeof value.pages !== "object" || Array.isArray(value.pages) ||
          Object.values(value.pages).some(entry => !entry || typeof entry !== "object" || Array.isArray(entry))) throw new Error("schema");
      return value;
    } catch (error) {
      if ((error as StorageError).code === "ENOENT") return { version: 1, pages: {} };
      throw new VaultError(422, "Invalid vault metadata.json; original file was preserved");
    }
  }
  function entryMetadata(entry: Record<string, unknown>) {
    const { file: _file, sourceHash: _hash, ...metadata } = entry;
    return metadata;
  }
  async function readOptional(filename: string): Promise<string | null> {
    try {
      const stat = await fs.lstat(filename);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new VaultError(422, "Invalid storage file");
      return await fs.readFile(filename, "utf8");
    } catch (error) {
      if ((error as StorageError).code === "ENOENT") return null;
      throw error;
    }
  }
  async function recoverPending() {
    await pageBatch.recover();
    await syncStore.recover();
    await pageIdMigration.recover();
    for (const entry of await fs.readdir(historyPath, { withFileTypes: true })) {
      if (!/^pending-[a-zA-Z0-9_-]+\.json$/.test(entry.name)) continue;
      const journalPath = path.join(historyPath, entry.name);
      const journal = JSON.parse((await readOptional(journalPath))!);
      if (typeof journal.file !== "string" || path.basename(journal.file) !== journal.file || !journal.file.endsWith(".md") ||
          typeof journal.source !== "string" || typeof journal.after !== "string" ||
          !(journal.before === null || typeof journal.before === "string") ||
          !(journal.previousSource === null || typeof journal.previousSource === "string"))
        throw new VaultError(422, "Invalid pending vault transaction; recovery file preserved");
      const filename = path.join(pagesPath, journal.file);
      const source = await readOptional(filename), metadata = await readOptional(metadataPath);
      if ((source !== journal.previousSource && source !== journal.source) || (metadata !== journal.before && metadata !== journal.after))
        throw new VaultError(503, `An interrupted save conflicts with external changes. Both versions are preserved in ${journalPath}`);
      if (source !== journal.source) await atomicWrite(filename, journal.source, source);
      if (metadata !== journal.after) await atomicWrite(metadataPath, journal.after, metadata);
      await fs.rm(journalPath);
    }
  }
  async function persist(filePath: string, encoded: ReturnType<typeof encode>, current?: StoredPage, databaseCreation?: { resources: DatabaseResources; expectedMetadata: string | null }, reconcileWiki = true) {
    const before = await readOptional(metadataPath);
    const index = await readMetadata();
    const id = String(encoded.metadata.id);
    const previousSource = await readOptional(filePath);
    if (databaseCreation) {
      if (before !== databaseCreation.expectedMetadata) {
        const directory = path.join(historyPath, "database-conflicts");
        await safeDirectory(directory);
        const recoveryPath = path.join(directory, `${randomUUID()}.json`);
        await atomicWrite(recoveryPath, JSON.stringify({ current: index, proposed: databaseCreation.resources, page: encoded, baseMetadata: databaseCreation.expectedMetadata }, null, 2));
        throw new VaultError(409, "The vault changed while creating the database. Your proposed database was preserved.", { recoveryPath });
      }
      if (previousSource !== null || index.pages[id]) throw new VaultError(409, "Database page identity already exists");
      Object.assign(index, databaseCreation.resources);
    }
    if (current) {
      const latest = decode(previousSource ?? "", filePath, index.pages[id] ? entryMetadata(index.pages[id]) : {});
      if (previousSource === null || latest.page.revision !== current.page.revision)
        return registerConflict(latest, { ...encoded.metadata, body: encoded.source } as PageInput, current.page.revision);
    }
    index.pages[id] = { ...encoded.metadata, file: path.basename(filePath), sourceHash: hash(encoded.source) };
    if (reconcileWiki) await reconcileWikiIndex(index, [decode(encoded.source, filePath, encoded.metadata).page]);
    if (!index.pages[id].dataSourceId) delete encoded.metadata.dataSourceId;
    if (!index.pages[id].wikiMembership) delete encoded.metadata.wikiMembership;
    Object.assign(encoded.metadata, entryMetadata(index.pages[id]));
    const after = JSON.stringify(index, null, 2) + "\n";
    // Preserve both halves before touching either canonical file.
    const recovery = path.join(historyPath, `pending-${id}.json`);
    await atomicWrite(recovery, JSON.stringify({ file: path.basename(filePath), previousSource, before, after, ...encoded }, null, 2));
    if (previousSource !== encoded.source) await atomicWrite(filePath, encoded.source, previousSource);
    await atomicWrite(metadataPath, after, before);
    await fs.rm(recovery);
    historyChanged(id);
  }
  async function prepareRead() {
    await init();
    await safeDirectory(root);
    await safeDirectory(pagesPath);
    await safeDirectory(historyPath);
    await safeDirectory(conflictsPath);
    await safeDirectory(assetsPath);
    await recoverPending();
  }
  async function reconcileWikiIndex(index: MetadataFile, changed: Page[] = []) {
    if (!Object.values((index.databases ?? {}) as Record<string, Database>).some(isWikiDatabase) && !Object.values(index.pages).some(entry => entry.wikiMembership)) return;
    const stored = await scan(), unindexed = [...stored.values()].filter(item => !index.pages[item.page.id]);
    for (const item of unindexed) index.pages[item.page.id] = { ...item.metadata, file: path.basename(item.filePath), sourceHash: hash(item.source) };
    const all = new Map([...stored.values()].map(item => [item.page.id, item.page]));
    for (const page of changed) all.set(page.id, page);
    reconcileWikiMembership(index, [...all.values()]);
    for (const item of unindexed) if (!index.pages[item.page.id].wikiMembership) delete index.pages[item.page.id];
  }
  async function wikiParent(databaseId: string) {
    return isWikiDatabase(((await readMetadata()).databases as Record<string, Database> | undefined)?.[databaseId]);
  }
  async function scan(): Promise<Map<string, StoredPage>> {
    await prepareRead();
    const index = await readMetadata();
    const result = new Map<string, StoredPage>();
    const entries = await fs.readdir(pagesPath, { withFileTypes: true });
    const filenames = new Set(entries.map(entry => entry.name));
    type MetadataEntry = [string, Record<string, unknown>];
    const byFile = new Map<string, MetadataEntry>();
    const renamed = new Map<unknown, MetadataEntry[]>();
    for (const entry of Object.entries(index.pages)) {
      const metadata = entry[1];
      if (typeof metadata.file === "string" && !byFile.has(metadata.file)) byFile.set(metadata.file, entry);
      if (!filenames.has(metadata.file as string)) {
        const candidates = renamed.get(metadata.sourceHash) ?? [];
        candidates.push(entry); renamed.set(metadata.sourceHash, candidates);
      }
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (
        !entry.isFile() ||
        entry.isSymbolicLink() ||
        !entry.name.toLowerCase().endsWith(".md")
      )
        continue;
      const filePath = path.join(pagesPath, entry.name);
      const stat = await fs.lstat(filePath);
      if (!stat.isFile() || stat.isSymbolicLink()) continue;
      const source = await fs.readFile(filePath, "utf8");
      let metadataEntry = byFile.get(entry.name);
      // An unambiguous byte-identical rename keeps its stable identity.
      if (!metadataEntry) {
        const candidates = renamed.get(hash(source)) ?? [];
        if (candidates.length === 1) metadataEntry = candidates[0];
      }
      const stored = decode(source, filePath, metadataEntry ? { ...entryMetadata(metadataEntry[1]), id: metadataEntry[0] } : {});
      if (result.has(stored.page.id))
        throw new VaultError(422, `Duplicate page ID: ${stored.page.id}`);
      result.set(stored.page.id, stored);
    }
    return result;
  }
  async function indexedPage(id: string): Promise<StoredPage | undefined> {
    await prepareRead();
    const index = await readMetadata(), entry = index.pages[id];
    const file = entry?.file;
    // Legacy identities, external renames and ambiguous file mappings use the full scanner.
    if (typeof file !== "string" || path.basename(file) !== file || /[/\\]/.test(file) || !file.toLowerCase().endsWith(".md") ||
        Object.values(index.pages).filter(value => value.file === file).length !== 1) return;
    const filePath = path.join(pagesPath, file), source = await readOptional(filePath);
    if (source === null) return;
    return decode(source, filePath, { ...entryMetadata(entry), id });
  }
  async function pagesForUpdate(id: string, input: PageInput) {
    if (options.privateReplica && childSettings(await readMetadata()).allowUninserted && Object.keys(input).every(key => ["body", "title", "syntax", "bodyFormat"].includes(key))) {
      const current = await indexedPage(id);
      if (current && !current.page.dataSourceId && !current.page.databaseId) {
        let overlay: Record<string, unknown> | undefined, previousOverlay: Record<string, unknown> | undefined;
        try { overlay = documentMetadata(input.body ?? current.source).values; previousOverlay = documentMetadata(current.source).values; }
        catch { /* Full validation below preserves the existing error path. */ }
        // Hierarchy, trash and database operations still use the complete scanner.
        if (overlay && previousOverlay && !["parent", "trashed", "dataSourceId", "databaseId"].some(key => own(overlay, key) || own(previousOverlay, key))) {
          const family = new Map([[current.page.id, current]]);
          let parent = current.page.parent;
          while (parent && !family.has(parent)) {
            const ancestor = await indexedPage(parent);
            if (!ancestor) return scan();
            family.set(parent, ancestor); parent = ancestor.page.parent;
          }
          return family;
        }
      }
    }
    return scan();
  }
  async function atomicWrite(filePath: string, data: string | Buffer, expected?: string | null) {
    await safeDirectory(path.dirname(filePath));
    let previous: Buffer | null = null;
    try {
      const stat = await fs.lstat(filePath);
      if (stat.isSymbolicLink() || !stat.isFile())
        throw new VaultError(422, "Cannot write to a symbolic link or directory");
      previous = await fs.readFile(filePath);
    } catch (error) {
      if ((error as StorageError).code !== "ENOENT") throw error;
    }
    if (expected !== undefined && (previous === null ? null : previous.toString("utf8")) !== expected)
      throw new VaultError(503, "Storage changed during save. The pending transaction preserves your version; no forced retry was performed.");
    const temporary = path.join(
      path.dirname(filePath),
      `.${path.basename(filePath)}.${randomUUID()}.tmp`,
    );
    try {
      const handle = await fs.open(temporary, "wx", 0o600);
      try {
        await handle.writeFile(data);
        await handle.sync();
      } finally {
        await handle.close();
      }
      if ((await readOptional(filePath)) !== (previous === null ? null : previous.toString("utf8")))
        throw new VaultError(503, "Storage changed during save; your pending version was preserved.");
      await platform.replaceFile(temporary, filePath, previous);
    } finally {
      await fs.rm(temporary, { force: true });
    }
  }
  function checkParent(
    id: string,
    parent: string | null | undefined,
    pages: Map<string, StoredPage>,
  ) {
    if (parent == null) return;
    assertId(parent);
    const visited = new Set([id]);
    let cursor: string | null = parent;
    while (cursor) {
      if (visited.has(cursor))
        throw new VaultError(400, "Page hierarchy cannot contain cycles");
      visited.add(cursor);
      const found = pages.get(cursor);
      if (!found) throw new VaultError(400, `Parent page not found: ${cursor}`);
      if (found.page.trashed) throw new VaultError(400, "Restore the parent page from Trash first");
      cursor = found.page.parent;
    }
  }
  const history = createPageHistory({ root, platform, safeDirectory, atomicWrite, readOptional, serialize });
  const pageBatch = createPageBatch({ platform, root, readOptional, atomicWrite });

  function childSettings(index: MetadataFile): ChildPageSettings {
    const raw = index.childPageSettings;
    if (raw === undefined) return { ...defaultChildPageSettings };
    if (!raw || typeof raw !== "object" || Array.isArray(raw) ||
        typeof (raw as ChildPageSettings).allowUninserted !== "boolean" || typeof (raw as ChildPageSettings).autoInsert !== "boolean")
      throw new VaultError(422, "Invalid child page settings; the original metadata was preserved");
    const settings = raw as ChildPageSettings;
    return { allowUninserted: settings.allowUninserted, autoInsert: settings.autoInsert };
  }
  const childSettingsRevision = (index: MetadataFile) => hash(JSON.stringify(index.childPageSettings ?? null));
  type PageChange = { current?: StoredPage; proposed: StoredPage };
  function appendEntries(parent: StoredPage, children: Page[], all: Map<string, StoredPage>) {
    try {
      return appendChildPageEntries(parent.page, children, [...all.values()].map(item => item.page));
    } catch (error) { throw new VaultError(422, `${parent.page.title}: ${error instanceof Error ? error.message : String(error)}`); }
  }
  async function commitChildPageChanges(changes: Map<string, PageChange>, settings?: ChildPageSettings) {
    const before = await readOptional(metadataPath), index = await readMetadata();
    const files: { path: string; before: string | null; after: string }[] = [];
    for (const [id, { current, proposed }] of changes) {
      const source = await readOptional(proposed.filePath);
      const latest = source === null ? undefined : decode(source, proposed.filePath, index.pages[id] ? entryMetadata(index.pages[id]) : {});
      if (current ? !latest || latest.page.revision !== current.page.revision : source !== null || index.pages[id]) {
        if (latest && current) return registerConflict(latest, { body: proposed.source }, current.page.revision);
        throw new VaultError(409, "A page changed while preparing child page entries. No changes were applied.");
      }
      if (current) await history.snapshot(current, false, "Before child page update");
      index.pages[id] = { ...proposed.metadata, file: path.basename(proposed.filePath), sourceHash: hash(proposed.source) };
      files.push({ path: `pages/${path.basename(proposed.filePath)}`, before: source, after: proposed.source });
    }
    if (settings) index.childPageSettings = { ...(index.childPageSettings as object ?? {}), ...settings };
    await reconcileWikiIndex(index, [...changes.values()].map(change => change.proposed.page));
    files.push({ path: "metadata.json", before, after: JSON.stringify(index, null, 2) + "\n" });
    await pageBatch.commit(files);
    for (const [id, change] of changes) change.proposed = decode(change.proposed.source, change.proposed.filePath, entryMetadata(index.pages[id]));
    for (const id of changes.keys()) historyChanged(id);
    return index;
  }
  function planMissingChildEntries(all: Map<string, StoredPage>) {
    const changes = new Map<string, PageChange>(), hidden = trashedPageIds([...all.values()].map(item => item.page));
    let inserted = 0;
    for (const parent of all.values()) {
      if (hidden.has(parent.page.id) || parent.page.databaseId) continue;
      const children = [...all.values()].map(item => item.page).filter(child => child.parent === parent.page.id &&
        !hidden.has(child.id) && !child.dataSourceId && !child.databaseId).sort(comparePageOrder);
      if (!children.length) continue;
      const result = appendEntries(parent, children, all);
      if (!result.inserted) continue;
      const encoded = encode(parent, parent.page.id, { body: result.body });
      changes.set(parent.page.id, { current: parent, proposed: decode(encoded.source, parent.filePath, encoded.metadata) });
      inserted += result.inserted;
    }
    return { changes, inserted };
  }
  async function repairRequiredChildEntries() {
    if (childSettings(await readMetadata()).allowUninserted) return;
    const { changes } = planMissingChildEntries(await scan());
    if (changes.size) await commitChildPageChanges(changes);
  }
  async function persistWithChildEntries(current: StoredPage | undefined, proposed: StoredPage, all: Map<string, StoredPage>): Promise<PageMutation> {
    const settings = childSettings(await readMetadata());
    if (settings.allowUninserted && !settings.autoInsert) {
      await persist(proposed.filePath, { source: proposed.source, metadata: proposed.metadata }, current);
      return decode(proposed.source, proposed.filePath, proposed.metadata).page;
    }
    const changes = new Map<string, PageChange>([[proposed.page.id, { current, proposed }]]);
    const family = new Map(all); family.set(proposed.page.id, proposed);
    const hidden = trashedPageIds([...family.values()].map(item => item.page));
    const append = (parent: StoredPage, children: Page[]) => {
      if (hidden.has(parent.page.id) || parent.page.databaseId) return;
      const result = appendEntries(parent, children.filter(child => !hidden.has(child.id) && !child.dataSourceId && !child.databaseId), family);
      if (!result.inserted) return;
      const encoded = encode(parent, parent.page.id, { body: result.body });
      const next = decode(encoded.source, parent.filePath, encoded.metadata);
      changes.set(parent.page.id, { current: changes.get(parent.page.id)?.current ?? parent, proposed: next });
      family.set(parent.page.id, next);
    };
    if (!settings.allowUninserted && !proposed.page.trashed)
      append(proposed, [...family.values()].map(item => item.page).filter(page => page.parent === proposed.page.id));
    if (proposed.page.parent && !hidden.has(proposed.page.id) && !proposed.page.dataSourceId && !proposed.page.databaseId &&
        (!settings.allowUninserted || !current || proposed.page.parent !== current.page.parent || current.page.trashed && !proposed.page.trashed)) {
      const parent = family.get(proposed.page.parent);
      if (parent) append(parent, [proposed.page]);
    }
    if (changes.size === 1) {
      const only = changes.get(proposed.page.id)!;
      await persist(only.proposed.filePath, { source: only.proposed.source, metadata: only.proposed.metadata }, current);
    } else await commitChildPageChanges(changes);
    const saved = changes.get(proposed.page.id)!.proposed;
    return { ...decode(saved.source, saved.filePath, saved.metadata).page,
      relatedPages: [...changes].filter(([id]) => id !== proposed.page.id).map(([, change]) => change.proposed.page) };
  }
  const historyDirty = new Set<string>();
  const historyTouched = new Set<string>();
  const historyTimers = new Map<string, ReturnType<typeof setTimeout>>();
  let historyClosed = false;
  async function checkpointHistory(protect = false, message = "Editing paused", only?: string) {
    if (!historyDirty.size || only && !historyDirty.has(only)) return 0;
    return serialize(async () => {
      const target = only ? await indexedPage(only) : undefined;
      const pages = target ? new Map([[target.page.id, target]]) : await scan();
      let count = 0;
      for (const id of [...historyDirty].filter(id => only === undefined || only === id)) {
        const stored = pages.get(id);
        if (stored && await history.snapshot(stored, protect, message, true)) count++;
        historyDirty.delete(id);
        clearTimeout(historyTimers.get(id)); historyTimers.delete(id);
      }
      return count;
    });
  }
  function historyChanged(id: string) {
    historyDirty.add(id);
    options.onChange?.();
    if (historyClosed) return;
    clearTimeout(historyTimers.get(id));
    void history.getSettings().then(({ settings }) => {
      if (historyClosed) return;
      clearTimeout(historyTimers.get(id));
      const timer = setTimeout(() => {
        void fs.lstat(root).then(() => historyClosed ? 0 : checkpointHistory(false, "Editing paused", id)).catch(error => {
          if ((error as StorageError).code !== "ENOENT") console.warn("History checkpoint could not be created", error);
        });
      }, settings.idleSeconds * 1000);
      historyTimers.set(id, timer);
      (timer as { unref?: () => void }).unref?.();
    }).catch(error => console.warn("History settings could not be read", error));
  }
  async function snapshot(stored: StoredPage) { await history.snapshot(stored, true, "Recovery checkpoint"); }
  async function registerConflict(
    current: StoredPage,
    input: PageInput,
    baseRevision: string,
    sync?: { conflict: SyncConflict; item: SyncItem },
  ): Promise<never> {
    const conflictId = sync?.conflict.id ?? randomUUID();
    const encoded = sync ? { source: sync.item.value!.source as string, metadata: sync.item.value!.metadata as Record<string, unknown> } : encode(current, current.page.id, input);
    const proposed = decode(encoded.source, current.filePath, encoded.metadata).page;
    const record = {
      ...(sync ? { syncId: conflictId, base: sync.conflict.base, remoteVersion: sync.conflict.remote.version } : {}),
      metadata: encoded.metadata,
      id: conflictId,
      conflictId,
      pageId: current.page.id,
      createdAt: new Date().toISOString(),
      baseRevision,
      currentRevision: current.page.revision,
    };
    await snapshot(current);
    await atomicWrite(path.join(conflictsPath, `${conflictId}.md`), encoded.source);
    await atomicWrite(
      path.join(conflictsPath, `${conflictId}.json`),
      JSON.stringify(record, null, 2),
    );
    throw new VaultError(
      409,
      "Another window, device, or external editor modified this page. Your version has been preserved.",
      {
        conflictId,
        current: current.page,
        proposed,
      },
    );
  }
  async function updateLocked(
    id: string,
    input: PageInput,
    baseRevision: string,
    databaseValidation?: { schemaRevision?: string },
  ): Promise<PageMutation> {
    assertId(id);
    checkInput(input);
    if (
      typeof baseRevision !== "string" ||
      !/^[a-f0-9]{64}$/.test(baseRevision)
    )
      throw new VaultError(400, "Saving requires a valid baseRevision");
    const pages = await pagesForUpdate(id, input);
    const current = findStoredPage(pages, id);
    if (!current) throw new VaultError(404, "Page not found");
    id = current.page.id;
    if (current.page.revision !== baseRevision)
      return registerConflict(current, input, baseRevision);
    if (own(input, "parent") && input.parent !== current.page.parent) {
      if (current.page.dataSourceId && !current.page.wikiMember) throw new VaultError(422, "Database records stay inside their database; remove the record from the collection first");
      const parentDatabase = input.parent && findStoredPage(pages, input.parent)?.page.databaseId;
      if (parentDatabase && !await wikiParent(parentDatabase)) throw new VaultError(422, "Use the database to add records; ordinary pages cannot be moved into a database");
    }
    if (databaseValidation && current.page.dataSourceId)
      await databases.validatePageUpdateLocked(current.page, input, baseRevision, databaseValidation.schemaRevision);
    if (!current.page.trashed || input.trashed === false || own(input, "parent")) checkParent(
      id,
      own(input, "parent") ? input.parent : current.page.parent,
      pages,
    );
    const encoded = encode(current, id, input);
    if (historySignature(encoded) === historySignature(current)) return current.page;
    await history.snapshot(current, false, historyTouched.has(id) ? "Before edit" : "Before editing session", !historyTouched.has(id));
    // Re-check after preparing the history snapshot to observe external writers.
    const latestStat = await fs.lstat(current.filePath);
    if (latestStat.isSymbolicLink())
      throw new VaultError(422, "Cannot write to a symbolic link");
    const latest = (options.privateReplica ? await indexedPage(id) : undefined) ?? (await scan()).get(id);
    if (!latest) throw new VaultError(409, "Page was removed externally");
    if (latest.page.revision !== baseRevision)
      return registerConflict(latest, input, baseRevision);
    const proposed = decode(encoded.source, current.filePath, encoded.metadata);
    if (!proposed.page.trashed) checkParent(id, proposed.page.parent, pages);
    const saved = await persistWithChildEntries(current, proposed, pages);
    historyTouched.add(id);
    return saved;
  }
  async function conflictRecord(id: string): Promise<Conflict> {
    assertId(id);
    await init();
    await safeDirectory(conflictsPath);
    const metadataFile = path.join(conflictsPath, `${id}.json`);
    const proposedFile = path.join(conflictsPath, `${id}.md`);
    try {
      const stats = await Promise.all([
        fs.lstat(metadataFile),
        fs.lstat(proposedFile),
      ]);
      if (stats.some((s) => s.isSymbolicLink() || !s.isFile()))
        throw new VaultError(422, "Invalid conflict file");
      const record = JSON.parse(await fs.readFile(metadataFile, "utf8"));
      assertId(record.pageId);
      if (record.conflictId !== id) throw new VaultError(422, "Conflict record does not match");
      const pages = await scan();
      const current = pages.get(record.pageId);
      if (!current) throw new VaultError(404, "The page for this conflict no longer exists");
      const proposed = decode(
        await fs.readFile(proposedFile, "utf8"),
        proposedFile,
        record.metadata ?? {},
      ).page;
      if (proposed.id !== record.pageId)
        throw new VaultError(422, "Conflict page ID does not match");
      return { ...record, current: current.page, proposed };
    } catch (error) {
      if ((error as StorageError).code === "ENOENT")
        throw new VaultError(404, "Conflict not found or already resolved");
      throw error;
    }
  }

  function legacyMetadataPlan(pages: Map<string, StoredPage>) {
    const candidates: { current: StoredPage; source: string; metadata: Record<string, unknown> }[] = [];
    for (const current of pages.values()) {
      if ((current.metadata.legacyYamlMigration as { version?: number } | undefined)?.version === 1) continue;
      const match = /^(?:\uFEFF)?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(current.source);
      if (!match) continue;
      const fields = documentMetadata(match[0]).values;
      // Historical application headers always had this identity and page-field set.
      // A document's ordinary YAML title/author block is not an application header.
      if (fields.id !== current.page.id || !["title", "parent", "icon", "properties"].every(key => own(fields, key)) ||
          (!own(fields, "updated") && !own(fields, "bodyFormat"))) continue;
      const source = current.source.slice(match[0].length);
      const metadata = {
        ...current.metadata, ...fields, id: current.page.id,
        properties: { ...(current.metadata.properties as object ?? {}), ...(fields.properties as object ?? {}) },
        legacyYamlMigration: { version: 1, sourceRevision: current.page.revision },
      };
      // Validate every result before changing any canonical file. In-document
      // YAML/Pandoc that was behind the application header now supplies overrides.
      decode(source, current.filePath, metadata);
      JSON.stringify(metadata);
      candidates.push({ current, source, metadata });
    }
    return candidates;
  }

  function findStoredPage(pages: Map<string, StoredPage>, id: string) {
    return pages.get(id) ?? [...pages.values()].find(stored => stored.page.legacyIds?.includes(id));
  }
  const pageIdMigration = createPageIdMigration({ platform, root, scan, serialize, readMetadata, readOptional, atomicWrite, safeDirectory, snapshot });
  const syncStore = createVaultSyncStore({ platform, root, scan, serialize, readMetadata, atomicWrite, safeDirectory, decode, encode,
    snapshot: async stored => { await history.snapshot(stored, false, "Before sync"); },
    pageConflict: async (current, item, conflict) => {
      try { await registerConflict(current, {}, current.page.revision, { conflict, item }); }
      catch (error) { if (!(error instanceof VaultError) || error.status !== 409 || error.details.conflictId !== conflict.id) throw error; }
    },
  });
  const databases = createDatabases({
    platform, root, serialize, readMetadata, readOptional, atomicWrite, safeDirectory,
    scanPages: async () => [...(await scan()).values()].map(stored => stored.page),
    createRecord: async (input, sourceId) => {
      checkInput(input);
      const pages = await scan();
      const id = randomUUID(), filePath = path.join(pagesPath, `${id}.md`);
      checkParent(id, input.parent, pages);
      const encoded = encode(undefined, id, input);
      encoded.metadata.dataSourceId = sourceId;
      await persist(filePath, encoded);
      return decode(encoded.source, filePath, encoded.metadata).page;
    },
    createDatabasePage: async (input, id, resources, expectedMetadata, parentRevision) => {
      checkInput(input); assertId(id);
      const pages = await scan();
      checkParent(id, input.parent, pages);
      if (input.parent && pages.get(input.parent)?.page.revision !== parentRevision) {
        const directory = path.join(historyPath, "database-conflicts");
        await safeDirectory(directory);
        const recoveryPath = path.join(directory, `${randomUUID()}.json`);
        await atomicWrite(recoveryPath, JSON.stringify({ current: pages.get(input.parent)?.page, proposed: { ...input, id, resources }, baseRevision: parentRevision }, null, 2));
        throw new VaultError(409, "The parent page changed while creating the database. The proposal was preserved.", { recoveryPath });
      }
      const encoded = encode(undefined, id, input), filePath = path.join(pagesPath, `${id}.md`);
      encoded.metadata.databaseId = id;
      if (isWikiDatabase(resources.databases[id])) encoded.metadata.wiki = true;
      await persist(filePath, encoded, undefined, { resources, expectedMetadata });
      return decode(encoded.source, filePath, encoded.metadata).page;
    },
    convertWikiPage: async (id, revision, resources, expectedMetadata, wiki) => {
      const all = await scan(), current = all.get(id);
      if (!current) throw new VaultError(404, "Page not found");
      if (current.page.revision !== revision) return registerConflict(current, {}, revision);
      const before = await readOptional(metadataPath), index = await readMetadata();
      if (before !== expectedMetadata) {
        const directory = path.join(historyPath, "database-conflicts"); await safeDirectory(directory);
        const recoveryPath = path.join(directory, `${randomUUID()}.json`);
        await atomicWrite(recoveryPath, JSON.stringify({ current: index, proposed: resources, pageId: id, wiki, baseRevision: revision, expectedMetadata }, null, 2));
        throw new VaultError(409, "The vault changed while preparing the wiki conversion. Both versions were preserved; reopen the page before retrying.", { recoveryPath });
      }
      await history.snapshot(current, false, wiki ? "Before turning into wiki" : "Before undoing wiki");
      // Archive resources and every page's metadata before the single CAS write. Markdown is unchanged.
      const directory = path.join(historyPath, "database-transactions"); await safeDirectory(directory);
      if (!wiki) {
        const previous = (index.databases as Record<string, Database>)[id];
        for (const page of all.values()) if (page.page.dataSourceId && previous.dataSourceIds.includes(page.page.dataSourceId) && index.pages[page.page.id]) index.pages[page.page.id].wikiMembership = id;
      }
      Object.assign(index, { databases: resources.databases, dataSources: resources.dataSources, views: resources.views });
      const entry = index.pages[id] ?? { ...current.metadata, file: path.basename(current.filePath), sourceHash: hash(current.source) };
      index.pages[id] = entry;
      if (wiki) { entry.databaseId = id; entry.wiki = true; }
      else { delete entry.databaseId; delete entry.wiki; }
      const unindexed = [...all.values()].filter(item => !index.pages[item.page.id]);
      for (const item of unindexed) index.pages[item.page.id] = { ...item.metadata, file: path.basename(item.filePath), sourceHash: hash(item.source) };
      reconcileWikiMembership(index, [...all.values()].map(item => item.page));
      for (const item of unindexed) if (!index.pages[item.page.id].wikiMembership) delete index.pages[item.page.id];
      const after = JSON.stringify(index, null, 2) + "\n", recoveryPath = path.join(directory, `${randomUUID()}.json`);
      await atomicWrite(recoveryPath, JSON.stringify({ operation: wiki ? "turn-into-wiki" : "undo-wiki", before, after }, null, 2));
      // External text edits do not take our process lock; verify all affected files before changing membership.
      const previousPages = JSON.parse(before ?? '{"pages":{}}').pages;
      for (const stored of all.values()) if (JSON.stringify(index.pages[stored.page.id]) !== JSON.stringify(previousPages[stored.page.id])) {
        if (await readOptional(stored.filePath) !== stored.source) throw new VaultError(409, "A page changed during wiki conversion; the proposal was preserved.", { recoveryPath });
      }
      try { await atomicWrite(metadataPath, after, before); }
      catch (error) { throw new VaultError(409, "Metadata changed during wiki conversion; both versions were preserved.", { recoveryPath, cause: String(error) }); }
      return decode(current.source, current.filePath, entryMetadata(entry)).page;
    },
    updateRecord: updateLocked,
    conflictRecord: async (id, input, revision) => {
      const current = (await scan()).get(id);
      if (!current) throw new VaultError(404, "Page not found");
      return registerConflict(current, input, revision);
    },
    detachRecord: async (id, revision) => {
      const pages = await scan(), current = pages.get(id);
      if (!current) throw new VaultError(404, "Page not found");
      if (current.page.revision !== revision) return registerConflict(current, {}, revision);
      await snapshot(current);
      const parent = current.page.parent ? pages.get(current.page.parent)?.page : undefined;
      const encoded = encode(current, id, parent?.databaseId ? { parent: parent.parent } : {});
      delete encoded.metadata.dataSourceId;
      await persist(current.filePath, encoded, current);
      return decode(encoded.source, current.filePath, encoded.metadata).page;
    },
  });

  const assets = createAssets({ platform, root, serialize, readMetadata, readOptional, safeDirectory, atomicWrite,
    pages: async () => [...(await scan()).values()].map(stored => stored.page),
    recycleFile: file => (options.recycleFile ?? platform.recycleFile)(file),
    protectedPages: async () => {
      const pages: Page[] = [];
      for (const entry of await fs.readdir(conflictsPath, { withFileTypes: true })) {
        if (entry.isSymbolicLink()) throw new VaultError(422, "Cannot inspect symbolic conflict records");
        if (entry.isFile() && entry.name.endsWith(".json")) pages.push((await conflictRecord(entry.name.slice(0, -5))).proposed);
      }
      return pages;
    } });
  const people = createPeople({ platform, root, init, safeDirectory, atomicWrite, serialize });
  const externalEntities = createExternalEntities({ platform, root, serialize, readMetadata, readOptional, safeDirectory, atomicWrite, scan,
    people: () => people.list(true) });
  return {
    externalEntities,
    vaultPath: root,
    history,
    checkpointHistory,
    closeHistory() { historyClosed = true; for (const timer of historyTimers.values()) clearTimeout(timer); historyTimers.clear(); },
    captureHistory() {
      return serialize(async () => {
        const pages = [...(await scan()).values()].map(stored => ({ id: stored.page.id, source: stored.source, metadata: stored.metadata }));
        const { pages: _pages, ...metadata } = await readMetadata();
        const people: { name: string; source: string }[] = [];
        const folder = path.join(root, "people");
        const stat = await fs.lstat(folder).catch((error: StorageError) => { if (error.code === "ENOENT") return null; throw error; });
        if (stat) {
          if (!stat.isDirectory() || stat.isSymbolicLink()) throw new VaultError(422, "Invalid people directory");
          for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
            if (!entry.isFile() || entry.isSymbolicLink() || !/\.ya?ml$/i.test(entry.name)) continue;
            const source = await readOptional(path.join(folder, entry.name));
            if (source !== null) people.push({ name: entry.name, source });
          }
        }
        return { pages, metadata, people };
      });
    },
    restoreHistory(id: string, record: HistoryRecord, baseRevision: string): Promise<Page> {
      return serialize(async () => {
        assertId(id); checkInput({ ...record.metadata, body: record.source });
        if (!/^[a-f0-9]{64}$/.test(baseRevision ?? "")) throw new VaultError(400, "Restoring requires baseRevision");
        const pages = await scan(), current = findStoredPage(pages, id);
        if (!current) throw new VaultError(404, "Page not found");
        const metadata: Record<string, unknown> = { ...current.metadata, ...record.metadata, id: current.page.id, updated: new Date().toISOString() };
        // Collection membership belongs to the current database; its schema is checked below.
        for (const key of ["dataSourceId", "databaseId"] as const) {
          if (current.metadata[key] === undefined) delete metadata[key]; else metadata[key] = current.metadata[key];
        }
        const encoded = { source: record.source, metadata }, proposed = decode(record.source, current.filePath, metadata);
        const input = { ...proposed.page };
        if (current.page.revision !== baseRevision) return registerConflict(current, input, baseRevision);
        if (!proposed.page.trashed) checkParent(current.page.id, proposed.page.parent, pages);
        if (current.page.dataSourceId) {
          const resources = (await readMetadata()).dataSources as Record<string, Record<string, unknown>> | undefined;
          const { revision: _revision, ...schema } = resources?.[current.page.dataSourceId] ?? {};
          await databases.validatePageUpdateLocked(current.page, input, baseRevision, hash(JSON.stringify(schema)));
        }
        await history.snapshot(current, true, "Before restore");
        return persistWithChildEntries(current, proposed, pages);
      });
    },
    sync: createSyncService(syncStore, `${platform.id}:${root}`, options.syncFetch),
    syncStore,
    listAssets: assets.list,
    assetInfo: assets.info,
    /** Byte-preserving backup of the vault, including unknown files and history. */
    exportFiles(): Promise<VaultArchiveFile[]> {
      return serialize(async () => {
        await scan();
        const files: VaultArchiveFile[] = [];
        let bytes = 0;
        const visit = async (directory: string, relative: string) => {
          for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
            const name = relative ? `${relative}/${entry.name}` : entry.name;
            if (name === ".history/vault.lock" || isHistoryTransientFile(name) || isSyncLocalFile(name)) continue;
            if (entry.isSymbolicLink()) throw new VaultError(422, "Backup cannot follow symbolic links");
            const file = path.join(directory, entry.name);
            if (entry.isDirectory()) await visit(file, name);
            else if (entry.isFile()) {
              const data = await fs.readFile(file);
              bytes += data.byteLength;
              if (bytes > archiveLimits.bytes || files.length >= archiveLimits.files) throw new VaultError(413, "Backup exceeds 128 MB or 10,000 files");
              files.push({ path: name, data });
            }
          }
        };
        await visit(root, "");
        return files;
      });
    },
    /** Restore only into a fresh vault. A failed restore never replaces the active vault. */
    restoreFiles(files: VaultArchiveFile[]): Promise<Page[]> {
      validateArchive(files);
      return serialize(async () => {
        const empty = async (directory: string): Promise<boolean> => {
          for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
            const file = path.join(directory, entry.name);
            if (file === path.join(historyPath, "vault.lock")) continue;
            if (entry.isSymbolicLink() || !entry.isDirectory() || !await empty(file)) return false;
          }
          return true;
        };
        if (!await empty(root)) throw new VaultError(409, "Restore requires a new empty vault; existing files were preserved");
        for (const file of files) {
          const parts = file.path.split("/");
          let directory = root;
          for (const part of parts.slice(0, -1)) { directory = path.join(directory, part); await safeDirectory(directory); }
          await atomicWrite(path.join(root, ...parts), Buffer.from(file.data), null);
        }
        return [...(await scan()).values()].map(stored => stored.page).sort(comparePageOrder);
      });
    },
    readAsset(relative: string): Promise<Buffer> {
      const read = async () => {
        await init(); await safeDirectory(root);
        const safe = archivePath(relative.replace(/^\//, ""));
        if (!safe.startsWith("assets/")) throw new VaultError(400, "Expected a vault attachment path");
        const parts = safe.split("/");
        let target = root;
        for (let i = 0; i < parts.length; i++) {
          target = path.join(target, parts[i]);
          const stat = await fs.lstat(target);
          if (stat.isSymbolicLink() || (i < parts.length - 1 ? !stat.isDirectory() : !stat.isFile())) throw new VaultError(422, "Invalid attachment path");
        }
        return fs.readFile(target);
      };
      // Attachments are published by atomic replacement. Display reads can observe either
      // complete version without holding the mobile navigation/save queue or vault lock.
      return options.privateReplica ? read() : serialize(read);
    },
    assetsPath,
    databases,
    people,
    runtimeSettings: createRuntimeSettings({ platform, root, atomicWrite, serialize }),
    childPageSettings: {
      get(): Promise<ChildPageSettingsSnapshot> {
        return serialize(async () => {
          await prepareRead();
          const index = await readMetadata();
          return { settings: childSettings(index), revision: childSettingsRevision(index) };
        });
      },
      configure(input: { settings: ChildPageSettings; baseRevision: string }): Promise<ChildPageSettingsSnapshot> {
        return serialize(async () => {
          const all = await scan(), index = await readMetadata();
          if (!input || !input.settings || typeof input.settings.allowUninserted !== "boolean" || typeof input.settings.autoInsert !== "boolean" ||
              typeof input.baseRevision !== "string" || !/^[a-f0-9]{64}$/.test(input.baseRevision))
            throw new VaultError(400, "Expected child page settings and baseRevision");
          if (childSettingsRevision(index) !== input.baseRevision) {
            const conflictFile = `child-page-settings-conflict-${randomUUID()}.json`;
            await atomicWrite(path.join(historyPath, conflictFile), JSON.stringify({ current: childSettings(index), proposed: input.settings, baseRevision: input.baseRevision }, null, 2), null);
            throw new VaultError(409, `Child page settings changed in another window. Both versions are preserved in .history/${conflictFile}. Reopen Settings to review them.`);
          }
          const settings = { allowUninserted: input.settings.allowUninserted, autoInsert: input.settings.autoInsert };
          const { changes, inserted } = settings.allowUninserted ? { changes: new Map<string, PageChange>(), inserted: 0 } : planMissingChildEntries(all);
          const saved = await commitChildPageChanges(changes, settings);
          return { settings, revision: childSettingsRevision(saved), inserted, updatedPages: changes.size };
        });
      },
    },
    insertChildPage(id: string, input: { baseRevision: string; parentRevision: string }): Promise<Page> {
      return serialize(async () => {
        assertId(id);
        if (!input || !/^[a-f0-9]{64}$/.test(input.baseRevision ?? "") || !/^[a-f0-9]{64}$/.test(input.parentRevision ?? ""))
          throw new VaultError(400, "Inserting requires the child page and parent page revisions");
        const all = await scan(), child = all.get(id), hidden = trashedPageIds([...all.values()].map(item => item.page));
        if (!child) throw new VaultError(404, "Page not found");
        const parent = child.page.parent ? all.get(child.page.parent) : undefined;
        if (!parent || hidden.has(id) || child.page.databaseId || child.page.dataSourceId || parent.page.databaseId)
          throw new VaultError(400, "Choose an ordinary child page with an active parent page");
        if (child.page.revision !== input.baseRevision || parent.page.revision !== input.parentRevision)
          return registerConflict(parent, { body: appendEntries(parent, [child.page], all).body }, input.parentRevision);
        const result = appendEntries(parent, [child.page], all);
        if (!result.inserted) return parent.page;
        return updateLocked(parent.page.id, { body: result.body }, parent.page.revision);
      });
    },
    init,
    planPageIdMigration: pageIdMigration.plan,
    migratePageIds: pageIdMigration.migrate,
    planLegacyMetadataMigration(): Promise<LegacyMetadataMigrationPlan> {
      return serialize(async () => ({ pages: legacyMetadataPlan(await scan()).map(({ current }) => ({
        id: current.page.id, file: path.basename(current.filePath), baseRevision: current.page.revision,
      })) }));
    },
    migrateLegacyMetadata(plan: LegacyMetadataMigrationPlan): Promise<{ migrated: number; backupPath: string | null }> {
      return serialize(async () => {
        if (!plan || !Array.isArray(plan.pages) || plan.pages.some(page => !page || typeof page.baseRevision !== "string" || !/^[a-f0-9]{64}$/.test(page.baseRevision)))
          throw new VaultError(400, "Migration requires a reviewed page revision plan");
        const candidates = legacyMetadataPlan(await scan());
        if (candidates.length !== plan.pages.length || new Set(plan.pages.map(page => page.id)).size !== plan.pages.length || candidates.some(({ current }) => {
          const expected = plan.pages.find(page => page.id === current.page.id);
          return !expected || expected.file !== path.basename(current.filePath) || expected.baseRevision !== current.page.revision;
        })) throw new VaultError(409, "The vault changed after migration planning. No page was migrated; review a fresh plan.");
        if (!candidates.length) return { migrated: 0, backupPath: null };
        const archiveRoot = path.join(historyPath, "migrations");
        await safeDirectory(archiveRoot);
        const backupPath = path.join(archiveRoot, `yaml-to-json-${randomUUID()}`);
        await safeDirectory(backupPath);
        const originalMetadata = await readOptional(metadataPath);
        if (originalMetadata !== null) await atomicWrite(path.join(backupPath, "metadata.before.json"), originalMetadata);
        const manifest = {
          version: 1, completed: false, createdAt: new Date().toISOString(), hadMetadataFile: originalMetadata !== null,
          pages: candidates.map(({ current, source, metadata }) => ({
            id: current.page.id, file: path.basename(current.filePath), baseRevision: current.page.revision,
            originalHash: hash(current.source), bodyHash: hash(source), metadata,
          })),
        };
        // Archive every original (including YAML comments) before removing any header.
        for (const { current } of candidates) {
          await atomicWrite(path.join(backupPath, path.basename(current.filePath)), current.source);
          await snapshot(current);
        }
        await atomicWrite(path.join(backupPath, "manifest.json"), JSON.stringify(manifest, null, 2));
        const latest = await scan();
        if (candidates.some(({ current }) => latest.get(current.page.id)?.page.revision !== current.page.revision))
          throw new VaultError(409, "A page changed while preparing migration backups. No page was migrated.", { backupPath });
        let migrated = 0;
        try {
          for (const { current, source, metadata } of candidates) {
            await persist(current.filePath, { source, metadata }, current);
            migrated++;
          }
          await atomicWrite(path.join(backupPath, "manifest.json"), JSON.stringify({ ...manifest, completed: true }, null, 2));
        } catch (error) {
          throw new VaultError(error instanceof VaultError ? error.status : 503,
            "Migration stopped. Original files and metadata are backed up; completed pages are marked and will not be migrated twice.",
            { migrated, backupPath, cause: error instanceof Error ? error.message : String(error) });
        }
        return { migrated, backupPath };
      });
    },
    importBatch(plan: ImportPlan, onProgress?: (progress: ImportProgress) => void): Promise<{ id: string; pageIds: string[]; alreadyImported: boolean }> {
      return serialize(async () => {
        onProgress?.({ phase: "importing", completed: 0, total: plan.pages.length, step: "Checking the import snapshot and existing files" });
        await init();
        if (!/^[a-f0-9]{64}$/.test(plan.id)) throw new VaultError(400, "Invalid import identity");
        const archiveRoot = path.join(historyPath, "imports");
        await safeDirectory(archiveRoot);
        const archive = path.join(archiveRoot, plan.id);
        await safeDirectory(archive);
        const manifestPath = path.join(archive, "manifest.json");
        try {
          const stat = await fs.lstat(manifestPath);
          if (!stat.isFile() || stat.isSymbolicLink()) throw new VaultError(422, "Invalid import manifest");
          const previous = JSON.parse(await fs.readFile(manifestPath, "utf8"));
          if (previous.completed === true && previous.id === plan.id) {
            onProgress?.({ phase: "importing", completed: 0, total: plan.pages.length, step: "Checking attachments for this previously imported snapshot" });
            await recoverPending();
            await assets.registerImportedLocked(plan.assets, plan.id);
            await people.registerNotionLocked(await externalEntities.registerImportedLocked(plan));
            await repairRequiredChildEntries();
            onProgress?.({ phase: "finalizing", completed: previous.pageIds.length, total: plan.pages.length, step: "Existing imported snapshot verified" });
            return { id: plan.id, pageIds: previous.pageIds, alreadyImported: true };
          }
        } catch (error) { if ((error as StorageError).code !== "ENOENT") throw error; }
        onProgress?.({ phase: "importing", completed: 0, total: plan.pages.length, step: "Validating page identities, content and parents" });
        const pages = await scan();
        const importMetadata = await readMetadata();
        for (const item of plan.pages) {
          assertId(item.id);
          if (!isPageUuid(item.id)) throw new VaultError(400, "New imported page IDs must be UUIDs");
          const decoded = decode(item.source, `${item.id}.md`, item.metadata);
          if (decoded.page.id !== item.id) throw new VaultError(400, "Import identity mismatch");
          const existing = pages.get(item.id);
          if (existing && existing.source !== item.source) throw new VaultError(409, "An imported page has changed. It will not be overwritten.");
          if (existing && importMetadata.pages[item.id] && existing.page.revision !== decoded.page.revision)
            throw new VaultError(409, "Imported page metadata has changed. It will not be overwritten.");
          checkParent(item.id, decoded.page.parent, pages);
          pages.set(item.id, decoded);
        }
        const writeNew = async (filename: string, data: Buffer | string) => {
          const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data);
          try {
            const stat = await fs.lstat(filename);
            if (!stat.isFile() || stat.isSymbolicLink() || !(await fs.readFile(filename)).equals(bytes))
              throw new VaultError(409, "Import destination already exists with different content");
            return;
          } catch (error) { if ((error as StorageError).code !== "ENOENT") throw error; }
          const temporary = path.join(path.dirname(filename), `.${randomUUID()}.tmp`);
          try {
            const handle = await fs.open(temporary, "wx", 0o600);
            try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
            // Atomically publish a complete new file, never replace an existing target.
            await fs.link(temporary, filename);
          } finally { await fs.rm(temporary, { force: true }); }
        };
        const manifest = { id: plan.id, name: plan.name, completed: false, pageIds: plan.pages.map(p => p.id), originals: plan.originals.map((file, index) => ({ path: file.path, archive: `${index}.source` })), warnings: plan.warnings, errors: plan.errors };
        await atomicWrite(manifestPath, JSON.stringify(manifest, null, 2));
        try {
          for (const [index, file] of plan.originals.entries()) {
            onProgress?.({ phase: "importing", completed: 0, total: plan.pages.length, step: `Archiving original files (${index + 1} / ${plan.originals.length})` });
            await writeNew(path.join(archive, `${index}.source`), file.data);
          }
          for (const asset of plan.assets) {
            onProgress?.({ phase: "importing", completed: 0, total: plan.pages.length, step: `Saving attachment: ${asset.name ?? asset.filename}` });
            if (!/^[a-zA-Z0-9_-]+\.[a-z0-9]+$/.test(asset.filename)) throw new VaultError(400, "Invalid imported attachment name");
            await writeNew(path.join(assetsPath, asset.filename), asset.data);
          }
          onProgress?.({ phase: "importing", completed: 0, total: plan.pages.length, step: "Registering imported attachments" });
          await assets.registerImportedLocked(plan.assets, plan.id);
          let completed = 0;
          for (const item of plan.pages) {
            onProgress?.({ phase: "importing", completed, total: plan.pages.length, step: "Writing page Markdown and metadata", currentTitle: String(item.metadata.title ?? "Untitled") });
            await writeNew(path.join(pagesPath, `${item.id}.md`), item.source);
            await persist(path.join(pagesPath, `${item.id}.md`), { source: item.source, metadata: item.metadata }, undefined, undefined, false);
            onProgress?.({ phase: "importing", completed: ++completed, total: plan.pages.length, step: "Page imported", currentTitle: String(item.metadata.title ?? "Untitled") });
          }
          onProgress?.({ phase: "finalizing", completed, total: plan.pages.length, step: "Saving database resources and the import manifest" });
          if (plan.databaseResources) await databases.importLocked(plan.databaseResources);
          await people.registerNotionLocked(await externalEntities.registerImportedLocked(plan));
          await repairRequiredChildEntries();
          await atomicWrite(manifestPath, JSON.stringify({ ...manifest, completed: true }, null, 2));
        } catch (error) {
          throw new VaultError(500, "Import stopped. Original files are preserved. Retry the same folder selection to resume; existing content will not be overwritten.", { importId: plan.id });
        }
        return { id: plan.id, pageIds: manifest.pageIds, alreadyImported: false };
      });
    },
    async list(options: { includeTrashed?: boolean } = {}): Promise<Page[]> {
      return serialize(async () => {
      const all = [...(await scan()).values()].map((item) => item.page).sort(comparePageOrder);
      const hidden = trashedPageIds(all);
      return options.includeTrashed ? all : all.filter((page) => !hidden.has(page.id));
      });
    },
    /** Source identities for import references, excluding Trash and its descendants. */
    async notionImportTargets(): Promise<{ id: string; pageId: string }[]> {
      return serialize(async () => {
        const stored = [...(await scan()).values()];
        const hidden = trashedPageIds(stored.map(item => item.page));
        return stored.flatMap(item => {
          if (hidden.has(item.page.id)) return [];
          const metadata = { ...item.metadata, ...documentMetadata(item.source).values };
          const origin = metadata.notionImport as { pageId?: unknown } | null;
          return origin && typeof origin.pageId === "string" ? [{ id: item.page.id, pageId: origin.pageId }] : [];
        });
      });
    },
    async get(id: string): Promise<Page> {
      return serialize(async () => {
      assertId(id);
      const result = (options.privateReplica ? await indexedPage(id) : undefined) ?? findStoredPage(await scan(), id);
      if (!result) throw new VaultError(404, "Page not found");
      return result.page;
      });
    },
    async sourceFile(id: string) {
      return serialize(async () => {
      assertId(id);
      const result = findStoredPage(await scan(), id);
      if (!result) throw new VaultError(404, "Page not found");
      return { path: result.filePath, source: result.source };
      });
    },
    create(input: PageInput, options: { id?: string } = {}): Promise<PageMutation> {
      return serialize(async () => {
        checkInput(input);
        const pages = await scan();
        const id = options.id ?? randomUUID();
        assertId(id);
        if (!isPageUuid(id)) throw new VaultError(400, "New page IDs must be UUIDs");
        if (pages.has(id)) throw new VaultError(409, "Page ID already exists");
        checkParent(id, input.parent, pages);
        if (input.parent && findStoredPage(pages, input.parent)?.page.databaseId && !await wikiParent(findStoredPage(pages, input.parent)!.page.databaseId!))
          throw new VaultError(422, "Use the database to create a record inside it");
        const encoded = encode(undefined, id, input);
        const filePath = path.join(pagesPath, `${id}.md`);
        try {
          await fs.lstat(filePath);
          throw new VaultError(409, "Target page file already exists");
        } catch (error) {
          if ((error as StorageError).code !== "ENOENT") throw error;
        }
        const proposed = decode(encoded.source, filePath, encoded.metadata);
        checkParent(id, proposed.page.parent, pages);
        return persistWithChildEntries(undefined, proposed, pages);
      });
    },
    update(id: string, input: PageInput, baseRevision: string, schemaRevision?: string): Promise<PageMutation> {
      return serialize(() => updateLocked(id, input, baseRevision, { schemaRevision }));
    },
    move(id: string, input: PageMoveInput, baseRevision: string): Promise<PageMutation> {
      return serialize(async () => {
        assertId(id);
        if (!input || !own(input, "parent") || !own(input, "sidebarOrder") ||
            typeof baseRevision !== "string" || !/^[a-f0-9]{64}$/.test(baseRevision) ||
            !input.baseRevisions || typeof input.baseRevisions !== "object" || Array.isArray(input.baseRevisions))
          throw new VaultError(400, "Moving requires the page revision and destination revisions");
        const patch = { parent: input.parent, sidebarOrder: input.sidebarOrder };
        checkInput(patch);
        for (const anchor of [input.beforeId, input.afterId]) if (anchor !== null) assertId(anchor);
        for (const revision of Object.values(input.baseRevisions)) if (typeof revision !== "string" || !/^[a-f0-9]{64}$/.test(revision))
          throw new VaultError(400, "Invalid destination revision");
        const all = await scan(), source = all.get(id);
        if (!source) throw new VaultError(404, "Page not found");
        if (source.page.revision !== baseRevision) return registerConflict(source, patch, baseRevision);
        const hidden = trashedPageIds([...all.values()].map((item) => item.page));
        if (hidden.has(id)) throw new VaultError(400, "Restore the page from Trash first");
        checkParent(id, input.parent, all);
        const siblings = [...all.values()].map((item) => item.page)
          .filter((page) => page.parent === input.parent && page.id !== id && !hidden.has(page.id)).sort(comparePageOrder);
        const references = [...siblings, ...(input.parent ? [all.get(input.parent)!.page] : [])];
        if (references.length !== Object.keys(input.baseRevisions).length || references.some((page) => input.baseRevisions[page.id] !== page.revision))
          return registerConflict(source, patch, baseRevision);
        const index = input.beforeId === null ? siblings.length : siblings.findIndex((page) => page.id === input.beforeId);
        if (index < 0 || (siblings[index - 1]?.id ?? null) !== input.afterId)
          throw new VaultError(400, "Page order anchors are not adjacent");
        const expected = orderBetween(index ? pageOrderKey(siblings[index - 1]) : null, index < siblings.length ? pageOrderKey(siblings[index]) : null);
        if (input.sidebarOrder !== expected) throw new VaultError(400, "Page order does not match the destination");
        return updateLocked(id, patch, baseRevision);
      });
    },
    duplicate(id: string, baseRevision: string): Promise<Page> {
      return serialize(async () => {
        assertId(id);
        if (typeof baseRevision !== "string" || !/^[a-f0-9]{64}$/.test(baseRevision))
          throw new VaultError(400, "Duplicating requires a valid baseRevision");
        const all = await scan();
        const original = all.get(id);
        if (!original) throw new VaultError(404, "Page not found");
        if (original.page.databaseId) throw new VaultError(422, "Duplicating an entire database is not supported yet");
        if (original.page.revision !== baseRevision)
          return registerConflict(original, {}, baseRevision);
        if (trashedPageIds([...all.values()].map((item) => item.page)).has(id))
          throw new VaultError(400, "Restore the page from Trash first");
        const copyId = randomUUID();
        const encoded = encode(original, copyId, {
          title: `${original.page.title.slice(0, 493)} (copy)`,
          favorite: false,
          trashed: false,
        });
        delete encoded.metadata.pageIdMigration;
        const filePath = path.join(pagesPath, `${copyId}.md`);
        return persistWithChildEntries(undefined, decode(encoded.source, filePath, encoded.metadata), all);
      });
    },
    recycle(id: string, baseRevision: string, baseRevisions: Record<string, string>): Promise<{ recycled: string[]; deletedAssets: string[]; warnings: string[] }> {
      return serialize(async () => {
        assertId(id);
        if (!baseRevisions || typeof baseRevisions !== "object" || Array.isArray(baseRevisions) ||
            typeof baseRevision !== "string" || !/^[a-f0-9]{64}$/.test(baseRevision))
          throw new VaultError(400, "Recycling requires page and descendant revisions");
        const all = await scan();
        const target = all.get(id);
        if (!target) throw new VaultError(404, "Page not found");
        if (target.page.revision !== baseRevision) return registerConflict(target, {}, baseRevision);
        if (!target.page.trashed) throw new VaultError(400, "Move the page to Trash first");
        const selected = new Map([[id, target]]);
        for (let changed = true; changed;) {
          changed = false;
          for (const [pageId, item] of all) if (item.page.parent && selected.has(item.page.parent) && !selected.has(pageId)) {
            selected.set(pageId, item); changed = true;
          }
        }
        if (Object.keys(baseRevisions).length !== selected.size || [...selected.keys()].some((pageId) => !Object.prototype.hasOwnProperty.call(baseRevisions, pageId)))
          throw new VaultError(409, "The page tree changed. Reopen Trash before deleting.");
        for (const [pageId, item] of selected) {
          if (!/^[a-f0-9]{64}$/.test(baseRevisions[pageId])) throw new VaultError(400, "Invalid descendant revision");
          if (item.page.revision !== baseRevisions[pageId]) return registerConflict(item, {}, baseRevisions[pageId]);
        }
        // Do not strand active conflict records whose source file is still needed.
        for (const entry of await fs.readdir(conflictsPath, { withFileTypes: true })) {
          if (entry.isFile() && !entry.isSymbolicLink() && entry.name.endsWith(".json")) {
            const record = JSON.parse(await fs.readFile(path.join(conflictsPath, entry.name), "utf8"));
            if (selected.has(record.pageId)) throw new VaultError(400, "Resolve conflicts for this page and its children before deleting.");
          }
        }
        for (const item of selected.values()) await snapshot(item);
        const latest = await scan();
        for (const [pageId, item] of selected) {
          const fresh = latest.get(pageId);
          if (!fresh) throw new VaultError(409, "The page tree changed. Reopen Trash before deleting.");
          if (fresh.page.revision !== item.page.revision) return registerConflict(fresh, {}, item.page.revision);
        }
        if ([...latest.values()].some((item) => item.page.parent && selected.has(item.page.parent) && !selected.has(item.page.id)))
          throw new VaultError(409, "The page tree changed. Reopen Trash before deleting.");
        const recycled: string[] = [];
        // Children first: if Windows refuses one file, its parent remains recoverable in Trash.
        for (const item of [...selected.values()].reverse()) {
          await safeDirectory(pagesPath);
          if (path.dirname(path.resolve(item.filePath)) !== pagesPath) throw new VaultError(400, "Invalid page file path");
          const stat = await fs.lstat(item.filePath);
          if (!stat.isFile() || stat.isSymbolicLink()) throw new VaultError(422, "Cannot recycle symbolic links");
          const fresh = (await scan()).get(item.page.id)!;
          if (fresh.page.revision !== item.page.revision) return registerConflict(fresh, {}, item.page.revision);
          try { await (options.recycleFile ?? platform.recycleFile)(item.filePath); }
          catch {
            throw new VaultError(503, "Windows could not recycle every page. Reopen Trash to see remaining pages; completed files are in the system Recycle Bin and history snapshots are preserved.", { recycled });
          }
          recycled.push(item.page.id);
        }
        const cleanup = await assets.recycleOrphansLocked([...selected.values()].map(item => item.page));
        return { recycled, ...cleanup };
      });
    },
    async listConflicts(): Promise<Conflict[]> {
      return serialize(async () => {
      await init();
      await safeDirectory(conflictsPath);
      const files = await fs.readdir(conflictsPath, { withFileTypes: true });
      const conflicts: Conflict[] = [];
      const activeSyncConflicts = await syncStore.activePageConflictsLocked();
      for (const file of files) {
        if (
          file.isFile() &&
          !file.isSymbolicLink() &&
          file.name.endsWith(".json")
        ) {
          const id = file.name.slice(0, -5);
          const record = JSON.parse(await fs.readFile(path.join(conflictsPath, file.name), "utf8"));
          if (record.syncId && !activeSyncConflicts.has(record.syncId)) continue;
          try { conflicts.push(await conflictRecord(id)); }
          catch (error) { if (!(record.syncId && error instanceof VaultError && error.status === 404)) throw error; }
        }
      }
      return conflicts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      });
    },
    resolveConflict(
      id: string,
      input: PageInput,
      baseRevision: string,
      schemaRevision?: string,
    ): Promise<Page> {
      return serialize(async () => {
        checkInput(input);
        const conflict = await conflictRecord(id);
        if (conflict.syncId) return syncStore.resolvePageLocked(conflict.syncId, input, baseRevision);
        const { title, parent, icon, properties, body, bodyFormat, syntax, favorite, trashed, sidebarOrder } =
          conflict.proposed;
        const proposed = {
            title,
            parent,
            icon,
            properties,
            body,
            bodyFormat: bodyFormat || "markdown",
            syntax: syntax ?? null,
            ...(favorite === undefined ? {} : { favorite }),
            ...(trashed === undefined ? {} : { trashed }),
            ...(sidebarOrder === undefined ? {} : { sidebarOrder }),
            ...input,
          };
        const page = await updateLocked(conflict.pageId, proposed, baseRevision, { schemaRevision });
        // Keep proposed Markdown and metadata as an audit trail, outside the active list.
        const resolvedPath = path.join(conflictsPath, "resolved");
        await safeDirectory(resolvedPath);
        await fs.rename(
          path.join(conflictsPath, `${id}.json`),
          path.join(resolvedPath, `${id}.json`),
        );
        await fs.rename(
          path.join(conflictsPath, `${id}.md`),
          path.join(resolvedPath, `${id}.md`),
        );
        return page;
      });
    },
    uploadAsset: assets.upload,
  };
}
