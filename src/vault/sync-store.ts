import { Buffer } from "buffer";
import { parseDocument, isMap } from "yaml";
import { archivePath } from "./archive";
import { hashBytes, randomUUID } from "./crypto";
import { VaultError, assertId, type Page, type PageInput } from "./vault";
import type { VaultPlatform, StorageError } from "./platform";
import { absent, itemRevision, stateRevision, validateItem, type SyncItem, type SyncState, type SyncConflict } from "../sync/protocol";

type StoredPage = { page: Page; source: string; filePath: string; metadata: Record<string, unknown> };
type Index = { version: 1; pages: Record<string, Record<string, unknown>>; [key: string]: unknown };
type Host = {
  root: string; platform: VaultPlatform;
  serialize<T>(operation: () => Promise<T>): Promise<T>;
  scan(): Promise<Map<string, StoredPage>>;
  readMetadata(): Promise<Index>;
  safeDirectory(directory: string): Promise<void>;
  atomicWrite(file: string, data: string | Buffer, expected?: string | null): Promise<void>;
  decode(source: string, file: string, metadata: Record<string, unknown>): StoredPage;
  encode(previous: StoredPage | undefined, id: string, input: PageInput): { source: string; metadata: Record<string, unknown> };
  snapshot(page: StoredPage): Promise<void>;
  pageConflict(current: StoredPage, incoming: SyncItem, conflict: SyncConflict): Promise<void>;
};
type FileChange = { path: string; before: string | null; after: string | null };
const object = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v);
const own = (v: object, key: string) => Object.prototype.hasOwnProperty.call(v, key);
const resourceGroups = ["databases", "dataSources", "views", "assets"];
const resourceData = (group: string, record: unknown) => ["databases", "dataSources", "views"].includes(group) && object(record)
  ? Object.fromEntries(Object.entries(record).filter(([field]) => field !== "revision")) : record;
export const syncLocalPath = ".notdown/sync";
export const isSyncLocalFile = (file: string) => file.toLowerCase() === syncLocalPath || file.toLowerCase().startsWith(`${syncLocalPath}/`);

/** Only createVault constructs this adapter. All public writes use its lock and compare-and-swap. */
export function createVaultSyncStore(host: Host) {
  const { fs, path } = host.platform, root = host.root;
  const local = path.join(root, ".notdown", "sync");
  const history = path.join(root, ".history", "sync");
  const journal = path.join(history, "pending.json");
  const conflictDir = path.join(history, "conflicts");
  async function ready() {
    await host.safeDirectory(path.join(root, ".notdown")); await host.safeDirectory(local);
    await host.safeDirectory(path.join(root, ".history")); await host.safeDirectory(history);
    await host.safeDirectory(conflictDir);
  }
  async function readBytes(file: string): Promise<Buffer | null> {
    try {
      const stat = await fs.lstat(file);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new VaultError(422, "Invalid sync file");
      return await fs.readFile(file);
    } catch (error) { if ((error as StorageError).code === "ENOENT") return null; throw error; }
  }
  async function readJson<T>(file: string): Promise<T | null> {
    const bytes = await readBytes(file); return bytes === null ? null : JSON.parse(bytes.toString("utf8"));
  }
  async function directories(relative: string) {
    let folder = root;
    for (const part of relative.split("/").slice(0, -1)) { folder = path.join(folder, part); await host.safeDirectory(folder); }
  }
  function allowedFile(relative: string) {
    archivePath(relative);
    if (!(relative === "metadata.json" || /^pages\/[^/]+\.md$/.test(relative) || /^people\/[^/]+\.ya?ml$/.test(relative) || relative.startsWith("assets/")))
      throw new VaultError(422, "Sync transaction contains an unsupported file");
    return path.join(root, ...relative.split("/"));
  }
  async function recover() {
    try { const stat = await fs.lstat(history); if (!stat.isDirectory() || stat.isSymbolicLink()) throw new VaultError(422, "Invalid sync history directory"); }
    catch (error) { if ((error as StorageError).code === "ENOENT") return; throw error; }
    const pending = await readJson<{ id: string; files: FileChange[]; snapshot?: { before: SyncItem; after: SyncItem } }>(journal);
    if (!pending) return;
    if (!Array.isArray(pending.files) || pending.files.length > 10000) throw new VaultError(422, "Invalid sync recovery record");
    for (const file of pending.files) {
      if (!(file.before === null || typeof file.before === "string") || !(file.after === null || typeof file.after === "string"))
        throw new VaultError(422, "Invalid sync recovery contents");
      const target = allowedFile(file.path), bytes = await readBytes(target), current = bytes?.toString("base64") ?? null;
      if (current !== file.before && current !== file.after)
        throw new VaultError(503, "An interrupted sync conflicts with an external edit. Both versions and the recovery record were preserved.");
    }
    for (const file of pending.files) {
      const target = allowedFile(file.path), current = await readBytes(target);
      if ((current?.toString("base64") ?? null) !== file.before && (current?.toString("base64") ?? null) !== file.after)
        throw new VaultError(503, "A file changed during sync recovery. The recovery record and local contents were preserved.");
      if ((current?.toString("base64") ?? null) === file.after) continue;
      await directories(file.path);
      if (file.after !== null) {
        // A byte-preserving CAS also works for attachments and UTF-8 BOM/CRLF Markdown.
        const temporary = path.join(path.dirname(target), `.sync-${randomUUID()}.tmp`);
        const handle = await fs.open(temporary, "wx", 0o600);
        try { await handle.writeFile(Buffer.from(file.after, "base64")); await handle.sync(); } finally { await handle.close(); }
        try { await host.platform.replaceFile(temporary, target, current); }
        finally { await fs.rm(temporary, { force: true }); }
      } else if (current !== null) {
        const saved = path.join(history, `${pending.id}-${hashBytes(file.path).slice(0, 16)}.deleted`);
        await fs.rename(target, saved);
        if ((await readBytes(saved))?.toString("base64") !== file.before) {
          // An external writer ignored the app lock. Restore only if nobody has recreated the path.
          try { await host.platform.replaceFile(saved, target, null); } catch { /* Both paths remain recoverable. */ }
          throw new VaultError(503, "A file changed during deletion. Sync stopped and preserved its content.");
        }
      }
    }
    // Keep resource history, not a full copy of the entire metadata.json for every downloaded page.
    // The complete file journal remains available until the transaction and this archive are durable.
    const archived = pending.snapshot ? { id: pending.id, snapshot: pending.snapshot,
      files: pending.files.map(file => ({ path: file.path,
        beforeHash: file.before === null ? null : hashBytes(Buffer.from(file.before, "base64")),
        afterHash: file.after === null ? null : hashBytes(Buffer.from(file.after, "base64")) })) } : pending;
    const archiveFile = path.join(history, `${pending.id}.json`), archiveText = JSON.stringify(archived);
    const existing = await readBytes(archiveFile);
    if (existing && existing.toString("utf8") !== archiveText) throw new VaultError(503, "Sync history changed during recovery. Both records were preserved.");
    if (!existing) await host.atomicWrite(archiveFile, archiveText, null);
    await fs.rm(journal);
  }
  async function commit(changes: { path: string; bytes: Buffer | null; expected: Buffer | null }[], snapshot: { before: SyncItem; after: SyncItem }) {
    await ready(); await recover();
    const files: FileChange[] = [];
    for (const change of changes) {
      const before = await readBytes(allowedFile(change.path));
      if ((before?.toString("base64") ?? null) !== (change.expected?.toString("base64") ?? null))
        throw new VaultError(409, "A file changed while preparing sync. The local version was preserved.");
      if (change.path.startsWith("assets/") && before) {
        const blobs = path.join(history, "blobs"); await host.safeDirectory(blobs);
        const prior = path.join(blobs, hashBytes(before));
        if (!await readBytes(prior)) await host.atomicWrite(prior, before, null);
      }
      files.push({ path: change.path, before: before?.toString("base64") ?? null, after: change.bytes?.toString("base64") ?? null });
    }
    await host.atomicWrite(journal, JSON.stringify({ id: randomUUID(), files, snapshot }), null);
    await recover();
  }
  const pageItem = (stored: StoredPage): SyncItem => ({ kind: "page", key: `page:${stored.page.id}`,
    value: { file: path.basename(stored.filePath), source: stored.source, metadata: { ...stored.metadata, id: stored.page.id } } });

  async function listLocked(): Promise<SyncItem[]> {
    const pages = await host.scan(), index = await host.readMetadata();
    const items = [...pages.values()].map(pageItem);
    for (const [key, value] of Object.entries(index)) {
      if (key === "version" || key === "pages") continue;
      if (resourceGroups.includes(key) && object(value)) {
        for (const [id, record] of Object.entries(value)) {
          // Database API revisions are derived locally from JSON bytes, whose order JSONB may change.
          // Their semantic resource data is the portable input; each device computes its own CAS token.
          const data = resourceData(key, record);
          items.push({ kind: "metadata", key: `metadata:${key}/${encodeURIComponent(id)}`, value: { data } });
        }
      } else items.push({ kind: "metadata", key: `metadata:extra/${encodeURIComponent(key)}`, value: { data: value } });
    }
    async function visit(folder: string, prefix: string, assets: boolean) {
      let entries;
      try { entries = await fs.readdir(folder, { withFileTypes: true }); }
      catch (error) { if ((error as StorageError).code === "ENOENT") return; throw error; }
      for (const entry of entries) {
        if (entry.isSymbolicLink()) throw new VaultError(422, "Sync cannot follow symbolic links");
        const relative = prefix + entry.name, file = path.join(folder, entry.name);
        if (entry.isDirectory() && assets) await visit(file, `${relative}/`, true);
        else if (entry.isFile() && (assets || /\.ya?ml$/.test(entry.name))) {
          const bytes = (await readBytes(file))!;
          items.push(assets ? { kind: "asset", key: `asset:${relative}`, value: { hash: hashBytes(bytes), size: bytes.length } }
            : { kind: "person", key: `person:${entry.name}`, value: { source: bytes.toString("utf8") } });
        }
      }
    }
    await visit(path.join(root, "people"), "", false); await visit(path.join(root, "assets"), "assets/", true);
    return items;
  }
  function validate(item: SyncItem) {
    validateItem(item);
    const name = item.key.slice(item.kind.length + 1), value = item.value;
    if (item.kind === "page") {
      assertId(name);
      if (value) {
        if (typeof value.file !== "string" || value.file.includes("/") || !value.file.endsWith(".md") || typeof value.source !== "string" || !object(value.metadata) || value.metadata.id !== name)
          throw new VaultError(422, "Invalid synced page");
        allowedFile(`pages/${value.file}`);
        if (Buffer.byteLength(value.source) > 10 * 1024 * 1024) throw new VaultError(413, "Page exceeds 10 MB");
        const decoded = host.decode(value.source, path.join(root, "pages", value.file), value.metadata);
        if (decoded.page.id !== name) throw new VaultError(422, "Synced page identity does not match");
      }
    } else if (item.kind === "metadata") {
      const slash = name.indexOf("/"), group = name.slice(0, slash), key = decodeURIComponent(name.slice(slash + 1));
      if (slash < 0 || !["extra", ...resourceGroups].includes(group) || !key ||
          ["__proto__", "prototype", "constructor"].includes(key) || group === "extra" && ["pages", "version", ...resourceGroups].includes(key) ||
          value && !own(value, "data")) throw new VaultError(422, "Invalid synced metadata key");
      if (group === "assets") {
        if (!archivePath(key).startsWith("assets/") || value && !object(value.data)) throw new VaultError(422, "Invalid attachment metadata");
      } else if (group !== "extra") { assertId(key); if (value && (!object(value.data) || value.data.id !== key)) throw new VaultError(422, "Invalid metadata resource identity"); }
    } else if (item.kind === "person") {
      allowedFile(`people/${name}`);
      if (value) {
        if (typeof value.source !== "string" || Buffer.byteLength(value.source) > 1024 * 1024) throw new VaultError(422, "Invalid contact source");
        const doc = parseDocument(value.source, { uniqueKeys: true });
        if (doc.errors.length || !isMap(doc.contents)) throw new VaultError(422, "Invalid contact YAML");
        const record = doc.toJS({ maxAliasCount: 50 }); assertId(record.id);
        if (typeof record.name !== "string" || !record.name.trim() || typeof record.created !== "string" || typeof record.updated !== "string") throw new VaultError(422, "Invalid contact");
      }
    } else {
      if (!name.startsWith("assets/")) throw new VaultError(422, "Invalid attachment path"); allowedFile(name);
      if (value && (!/^[a-f0-9]{64}$/.test(value.hash) || !Number.isSafeInteger(value.size) || value.size < 0 || value.size > 64 * 1024 * 1024)) throw new VaultError(422, "Invalid attachment descriptor");
    }
  }
  async function readItemLocked(item: SyncItem): Promise<SyncItem> {
    validate(item);
    const name = item.key.slice(item.kind.length + 1);
    if (item.kind === "page") { const page = (await host.scan()).get(name); return page ? pageItem(page) : absent(item); }
    await host.scan(); // Also recover an interrupted ordinary Markdown/metadata save before reading a resource.
    if (item.kind === "metadata") {
      const index = await host.readMetadata(), slash = name.indexOf("/"), group = name.slice(0, slash), key = decodeURIComponent(name.slice(slash + 1));
      const target = group === "extra" ? index : index[group];
      if (target !== undefined && !object(target)) throw new VaultError(422, "Invalid local metadata group");
      return { ...item, value: target && own(target, key) ? { data: resourceData(group, (target as Record<string, unknown>)[key]) } : null };
    }
    const bytes = await readBytes(allowedFile(item.kind === "person" ? `people/${name}` : name));
    return { ...item, value: bytes === null ? null : item.kind === "person" ? { source: bytes.toString("utf8") } : { hash: hashBytes(bytes), size: bytes.length } };
  }
  async function applyLocked(item: SyncItem, expected: string, blob?: Uint8Array) {
    validate(item);
    const existing = await readItemLocked(item);
    if (itemRevision(existing) !== expected) return false;
    const name = item.key.slice(item.kind.length + 1), value = item.value;
    const changes: { path: string; bytes: Buffer | null; expected: Buffer | null }[] = [];
    const metadataBefore = await readBytes(path.join(root, "metadata.json"));
    const index = await host.readMetadata();
    if (item.kind === "page") {
      const current = (await host.scan()).get(name);
      if (itemRevision(current ? pageItem(current) : absent(item)) !== expected) return false;
      if (value) {
        const pages = await host.scan(), proposed = host.decode(value.source, path.join(root, "pages", value.file), value.metadata);
        pages.set(name, proposed);
        const visited = new Set<string>(); let cursor: string | null = name;
        while (cursor) {
          if (visited.has(cursor)) throw new VaultError(409, "The incoming move would create a page hierarchy cycle. Review both versions.");
          visited.add(cursor); cursor = pages.get(cursor)?.page.parent ?? null;
        }
      }
      if (current) await host.snapshot(current);
      const file = value?.file ?? (current ? path.basename(current.filePath) : undefined);
      if (value) {
        // A remote rename cannot overwrite a different page's file.
        const occupied = [...(await host.scan()).values()].find(page => path.basename(page.filePath).toLowerCase() === file.toLowerCase() && page.page.id !== name);
        if (occupied || !current && await readBytes(allowedFile(`pages/${file}`))) throw new VaultError(409, "The incoming filename is already used by another local page");
        if (current && path.basename(current.filePath) !== file && path.basename(current.filePath).toLowerCase() === file.toLowerCase())
          throw new VaultError(409, "A case-only filename change needs review on this device");
        const samePath = current && path.basename(current.filePath) === file;
        if (!samePath && await readBytes(allowedFile(`pages/${file}`))) throw new VaultError(409, "The incoming filename already exists");
        index.pages[name] = { ...value.metadata, file, sourceHash: hashBytes(value.source) };
        changes.push({ path: `pages/${file}`, bytes: Buffer.from(value.source), expected: samePath ? Buffer.from(current.source) : null });
        if (current && !samePath) changes.push({ path: `pages/${path.basename(current.filePath)}`, bytes: null, expected: Buffer.from(current.source) });
      } else {
        if (current) changes.push({ path: `pages/${file}`, bytes: null, expected: Buffer.from(current.source) });
        delete index.pages[name];
      }
      changes.push({ path: "metadata.json", bytes: Buffer.from(JSON.stringify(index, null, 2) + "\n"), expected: metadataBefore });
    } else if (item.kind === "metadata") {
      const slash = name.indexOf("/"), group = name.slice(0, slash), key = decodeURIComponent(name.slice(slash + 1));
      const target = group === "extra" ? index : (index[group] ??= {}) as Record<string, unknown>;
      if (!object(target)) throw new VaultError(422, "Local metadata group has an unsupported format");
      const current: SyncItem = { ...item, value: own(target, key) ? { data: resourceData(group, target[key]) } : null };
      if (itemRevision(current) !== expected) return false;
      if (value) Object.defineProperty(target, key, { value: value.data, writable: true, enumerable: true, configurable: true }); else delete target[key];
      changes.push({ path: "metadata.json", bytes: Buffer.from(JSON.stringify(index, null, 2) + "\n"), expected: metadataBefore });
    } else if (item.kind === "person") changes.push({ path: `people/${name}`, bytes: value ? Buffer.from(value.source) : null, expected: existing.value ? Buffer.from(existing.value.source) : null });
    else {
      if (value && (!blob || blob.byteLength !== value.size || hashBytes(blob) !== value.hash)) throw new VaultError(422, "Attachment content does not match its checksum");
      const previous = await readBytes(allowedFile(name));
      if ((previous ? hashBytes(previous) : null) !== (existing.value?.hash ?? null)) return false;
      changes.push({ path: name, bytes: value ? Buffer.from(blob!) : null, expected: previous });
    }
    await commit(changes, { before: existing, after: item }); return true;
  }
  async function getConflictLocked(id: string) { assertId(id); await ready(); return readJson<SyncConflict>(path.join(conflictDir, `${id}.json`)); }
  async function listConflictsLocked() {
    await ready(); const latest = new Map<string, SyncConflict>();
    for (const file of await fs.readdir(conflictDir, { withFileTypes: true })) {
      if (!file.isFile() || !file.name.endsWith(".json")) continue;
      const entry = await getConflictLocked(file.name.slice(0, -5));
      if (entry && (!latest.has(entry.key) || latest.get(entry.key)!.remote.version < entry.remote.version)) latest.set(entry.key, entry);
    }
    return [...latest.values()].filter(entry => !entry.resolvedAt);
  }
  async function markResolved(conflict: SyncConflict) {
    conflict.resolvedAt = new Date().toISOString();
    await host.atomicWrite(path.join(conflictDir, `${conflict.id}.json`), JSON.stringify(conflict));
    if (conflict.pageConflict) {
      const folder = path.join(root, ".history", "conflicts"), resolved = path.join(folder, "resolved");
      await host.safeDirectory(resolved);
      for (const extension of ["md", "json"]) {
        const file = path.join(folder, `${conflict.id}.${extension}`);
        if (await readBytes(file)) await fs.rename(file, path.join(resolved, `${conflict.id}.${extension}`));
      }
    }
  }
  async function resolveLocked(id: string, choice: "local" | "remote" | "merged", expected: string, merged?: SyncItem, blob?: Uint8Array) {
    const conflict = await getConflictLocked(id);
    if (!conflict || conflict.resolvedAt) throw new VaultError(404, "Sync conflict is no longer active");
    const latest = (await listConflictsLocked()).find(entry => entry.key === conflict.key);
    if (latest?.id !== id) throw new VaultError(409, "A newer remote version arrived. Reopen the conflict before resolving it.");
    const current = (await listLocked()).find(item => item.key === conflict.key) ?? absent(conflict.remote.item);
    if (itemRevision(current) !== expected) throw new VaultError(409, "The local version changed. Reopen the conflict; both versions remain preserved.");
    const selected = choice === "local" ? current : choice === "remote" ? conflict.remote.item : merged;
    if (!selected || selected.key !== conflict.key || selected.kind !== conflict.remote.item.kind) throw new VaultError(400, "Invalid merged sync item");
    if (choice !== "local" && !await applyLocked(selected, expected, blob)) throw new VaultError(409, "The local version changed during conflict resolution");
    await markResolved(conflict);
    return selected;
  }
  return {
    recover,
    list: () => host.serialize(listLocked),
    readItem: (item: SyncItem) => host.serialize(() => readItemLocked(item)),
    apply: (item: SyncItem, expected: string, blob?: Uint8Array) => host.serialize(() => applyLocked(item, expected, blob)),
    readBlob: (item: SyncItem) => host.serialize(async () => { validate(item); if (item.kind !== "asset") throw new VaultError(400, "Expected an attachment"); return (await readBytes(allowedFile(item.key.slice(6)))) ?? Buffer.alloc(0); }),
    readState: () => host.serialize(async () => {
      await ready(); const state = await readJson<SyncState>(path.join(local, "state.json"));
      if (state && (state.version !== 1 || typeof state.binding !== "string" || typeof state.deviceId !== "string" ||
        !Number.isSafeInteger(state.cursor) || state.cursor < 0 || !object(state.bases) || !object(state.conflicts)))
        throw new VaultError(422, "Unsupported or invalid local sync state. The original state was preserved.");
      return state;
    }),
    writeState: (state: SyncState, expected: string) => host.serialize(async () => {
      await ready(); const file = path.join(local, "state.json"), previous = await readJson<SyncState>(file);
      if (stateRevision(previous) !== expected) throw new VaultError(409, "Another window is syncing this notebook. This run stopped without replacing its state.");
      await host.atomicWrite(file, JSON.stringify(state));
    }),
    readConnection: <T>() => host.serialize(async () => { await ready(); return readJson<T>(path.join(local, "connection.json")); }),
    writeConnection: (value: unknown) => host.serialize(async () => { await ready(); await host.atomicWrite(path.join(local, "connection.json"), JSON.stringify(value)); }),
    resetState: () => host.serialize(async () => {
      await ready(); const file = path.join(local, "state.json");
      if (await readBytes(file)) await fs.rename(file, path.join(history, `disconnected-${randomUUID()}.json`));
    }),
    preserveConflict: (conflict: SyncConflict) => host.serialize(async () => {
      assertId(conflict.id); validate(conflict.local); validate(conflict.remote.item); await ready();
      if (await getConflictLocked(conflict.id)) return;
      if (conflict.local.kind === "page" && conflict.local.value && conflict.remote.item.value) {
        const current = (await host.scan()).get(conflict.key.slice(5));
        if (current) { await host.pageConflict(current, conflict.remote.item, conflict); conflict.pageConflict = true; }
      }
      await host.atomicWrite(path.join(conflictDir, `${conflict.id}.json`), JSON.stringify(conflict), null);
    }),
    getConflict: (id: string) => host.serialize(() => getConflictLocked(id)),
    conflicts: () => host.serialize(async () => {
      const entries = await listConflictsLocked();
      const values: SyncConflict[] = [];
      for (const conflict of entries) values.push({ ...conflict, local: await readItemLocked(conflict.remote.item) });
      return values;
    }),
    resolve: (id: string, choice: "local" | "remote" | "merged", expected: string, merged?: SyncItem, blob?: Uint8Array) => host.serialize(() => resolveLocked(id, choice, expected, merged, blob)),
    activePageConflictsLocked: async () => new Set((await listConflictsLocked()).filter(entry => entry.pageConflict).map(entry => entry.id)),
    /** Called inside the existing resolveConflict vault lock, preserving full remote metadata. */
    async resolvePageLocked(id: string, input: PageInput, baseRevision: string): Promise<Page> {
      const conflict = await getConflictLocked(id);
      if (!conflict?.remote.item.value) throw new VaultError(404, "Sync conflict is no longer active");
      const pageId = conflict.key.slice(5), current = (await host.scan()).get(pageId);
      if (!current || current.page.revision !== baseRevision) throw new VaultError(409, "The local page changed. Both versions remain preserved.");
      const incoming = conflict.remote.item.value;
      const encoded = host.encode(host.decode(incoming.source, current.filePath, incoming.metadata), pageId, input);
      const selected: SyncItem = { kind: "page", key: conflict.key, value: { file: path.basename(current.filePath), ...encoded } };
      await resolveLocked(id, "merged", itemRevision(pageItem(current)), selected);
      return (await host.scan()).get(pageId)!.page;
    },
  };
}
