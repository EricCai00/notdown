import { hashBytes, randomUUID } from "./crypto.js";
import type { StorageError, VaultPlatform } from "./platform.js";
import { VaultError, assertId } from "./vault.js";

export type HistorySettings = {
  intervalMinutes: number; idleSeconds: number; retentionDays: number; maxVersions: number; gitEnabled: boolean;
};
export const defaultHistorySettings: HistorySettings = { intervalMinutes: 5, idleSeconds: 120, retentionDays: 30, maxVersions: 100, gitEnabled: false };
export type HistoryRecord = { source: string; metadata: Record<string, unknown> };
export type HistoryEntry = { id: string; createdAt: string; kind: "snapshot" | "git"; message: string; protected: boolean };
export const isHistoryTransientFile = (name: string) => name === ".notdown/git-history.lock" || /^\.notdown\/git-history\.git\/(?:.*\.lock|gc\.pid)$/.test(name);
type Stored = HistoryRecord & { page: { id: string; revision: string; updated: string } };
type Checkpoint = { revision: string; createdAt: string; signature: string; sourceHash: string; metadataHash: string; protected: boolean; message: string };
type Host = {
  root: string; platform: VaultPlatform;
  safeDirectory(directory: string): Promise<void>;
  atomicWrite(file: string, source: string, expected?: string | null): Promise<void>;
  readOptional(file: string): Promise<string | null>;
  serialize<T>(fn: () => Promise<T>): Promise<T>;
};
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, stable(child)]));
  return value;
}
/** Separate from the CAS revision: timestamps alone do not create user history. */
export function historySignature(record: HistoryRecord): string {
  const { updated: _updated, ...metadata } = record.metadata;
  return hashBytes(JSON.stringify([record.source, stable(metadata)]));
}
function validSettings(value: unknown): value is HistorySettings {
  if (!value || typeof value !== "object") return false;
  const v = value as HistorySettings;
  return typeof v.gitEnabled === "boolean" && [[v.intervalMinutes, 1, 60], [v.idleSeconds, 30, 600], [v.retentionDays, 1, 3650], [v.maxVersions, 1, 1000]]
    .every(([n, min, max]) => Number.isInteger(n) && n >= min && n <= max);
}

/** Page snapshots are bounded independently of frequent durable saves. Legacy files remain readable. */
export function createPageHistory(host: Host) {
  const { fs, path } = host.platform;
  const directory = path.join(host.root, ".notdown"), settingsFile = path.join(directory, "history.json");
  const checkpoints = path.join(host.root, ".history", "checkpoints");
  async function readSettings() {
    let source: string | null = null;
    try {
      const stat = await fs.lstat(directory);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new VaultError(422, "Invalid history settings directory");
      source = await host.readOptional(settingsFile);
    } catch (error) { if ((error as StorageError).code !== "ENOENT") throw error; }
    let raw: Record<string, unknown>;
    try {
      raw = source === null ? {} : JSON.parse(source);
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error();
      const settings = { ...defaultHistorySettings, ...Object.fromEntries(Object.keys(defaultHistorySettings).filter(key => key in raw).map(key => [key, raw[key]])) };
      if (!validSettings(settings)) throw new Error();
      return { source, raw, settings, revision: hashBytes(source ?? "") };
    } catch { throw new VaultError(422, "Invalid history.json; the original file was preserved"); }
  }
  async function index(id: string) {
    const file = path.join(checkpoints, `${id}.json`);
    const source = await host.readOptional(file);
    if (source === null) return { file, source, raw: {} as Record<string, unknown>, entries: [] as Checkpoint[] };
    try {
      const value = JSON.parse(source);
      if (value.version !== 1 || !Array.isArray(value.entries) || value.entries.some((entry: Checkpoint) =>
        !/^[a-f0-9]{64}$/.test(entry.revision) || !Number.isFinite(Date.parse(entry.createdAt)) ||
        ![entry.signature, entry.sourceHash, entry.metadataHash].every(hash => /^[a-f0-9]{64}$/.test(hash)) || typeof entry.protected !== "boolean")) throw new Error();
      return { file, source, raw: value as Record<string, unknown>, entries: value.entries as Checkpoint[] };
    } catch { throw new VaultError(422, "Invalid checkpoint index; history was preserved"); }
  }
  async function snapshot(stored: Stored, force = true, message = "Before change", checkpoint = false) {
    assertId(stored.page.id);
    await host.safeDirectory(checkpoints);
    const current = await index(stored.page.id), { settings } = await readSettings();
    const signature = historySignature(stored), now = Date.now();
    const last = current.entries.at(-1);
    if (!force && last && (last.signature === signature || !checkpoint && now - Date.parse(last.createdAt) < settings.intervalMinutes * 60_000)) return false;
    const folder = path.join(host.root, ".history", stored.page.id);
    await host.safeDirectory(folder);
    const sourceFile = path.join(folder, `${stored.page.revision}.md`), metadataFile = path.join(folder, `${stored.page.revision}.json`);
    const metadata = JSON.stringify(stored.metadata, null, 2);
    const originalSource = await host.readOptional(sourceFile), originalMetadata = await host.readOptional(metadataFile);
    if (originalSource !== null && originalSource !== stored.source || originalMetadata !== null && originalMetadata !== metadata)
      throw new VaultError(422, "An existing history snapshot differs; both current files and history were preserved");
    if (originalSource === null) await host.atomicWrite(sourceFile, stored.source, null);
    if (originalMetadata === null) await host.atomicWrite(metadataFile, metadata, null);
    const existing = current.entries.find(entry => entry.revision === stored.page.revision);
    const entries = current.entries.filter(entry => entry.revision !== stored.page.revision);
    entries.push({ ...existing, revision: stored.page.revision, createdAt: existing?.createdAt ?? new Date(now).toISOString(), signature,
      sourceHash: hashBytes(stored.source), metadataHash: hashBytes(metadata), protected: force || existing?.protected === true, message });
    entries.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    // Only indexed automatic snapshots are eligible. Unknown and legacy recovery files are untouched.
    const automatic = entries.filter(entry => !entry.protected);
    const candidates = automatic.filter((entry, i) => entry !== entries.at(-1) &&
      (Date.parse(entry.createdAt) < now - settings.retentionDays * 86_400_000 || i < automatic.length - settings.maxVersions));
    const remove: Checkpoint[] = [];
    for (const entry of candidates) {
      const source = await host.readOptional(path.join(folder, `${entry.revision}.md`));
      const metadata = await host.readOptional(path.join(folder, `${entry.revision}.json`));
      if (source !== null && hashBytes(source) !== entry.sourceHash || metadata !== null && hashBytes(metadata) !== entry.metadataHash) {
        entry.protected = true; entry.message = "Externally changed recovery copy";
      } else remove.push(entry);
    }
    const kept = entries.filter(entry => !remove.includes(entry));
    await host.atomicWrite(current.file, JSON.stringify({ ...current.raw, version: 1, entries: kept }, null, 2), current.source);
    for (const entry of remove) {
      for (const [extension, expectedHash] of [["md", entry.sourceHash], ["json", entry.metadataHash]]) {
        const file = path.join(folder, `${entry.revision}.${extension}`), source = await host.readOptional(file);
        if (source !== null && hashBytes(source) === expectedHash) await fs.rm(file);
      }
    }
    return true;
  }
  return {
    snapshot,
    async getSettings() { const { settings, revision } = await readSettings(); return { settings, revision }; },
    configure(input: unknown) {
      const value = input as { settings?: HistorySettings; baseRevision?: string } | null;
      if (!value || !validSettings(value.settings) || Object.keys(value.settings).some(key => !Object.hasOwn(defaultHistorySettings, key)) || !/^[a-f0-9]{64}$/.test(value.baseRevision ?? ""))
        throw new VaultError(400, "Expected valid history settings and baseRevision");
      const proposedSettings = value.settings;
      return host.serialize(async () => {
        await host.safeDirectory(directory);
        const current = await readSettings(), proposed = JSON.stringify({ ...current.raw, ...proposedSettings }, null, 2);
        const conflict = async () => {
          const conflictFile = `history-conflict-${randomUUID()}.json`;
          await host.atomicWrite(path.join(directory, conflictFile), JSON.stringify({ current: (await readSettings()).source, proposed, baseRevision: value.baseRevision }), null);
          throw new VaultError(409, "History settings changed. Both versions were preserved; reopen Settings.", { conflictFile });
        };
        if (value.baseRevision !== current.revision) return conflict();
        try { await host.atomicWrite(settingsFile, proposed, current.source); }
        catch (error) { if (error instanceof VaultError && error.status === 503) return conflict(); throw error; }
        return { settings: proposedSettings, revision: hashBytes(proposed) };
      });
    },
    list(id: string): Promise<HistoryEntry[]> {
      assertId(id);
      return host.serialize(async () => {
        const folder = path.join(host.root, ".history", id), indexed = await index(id);
        const folderStat = await fs.lstat(folder).catch((error: StorageError) => { if (error.code === "ENOENT") return null; throw error; });
        if (!folderStat) return [];
        if (!folderStat.isDirectory() || folderStat.isSymbolicLink()) throw new VaultError(422, "Invalid history directory");
        const result: HistoryEntry[] = [];
        for (const file of await fs.readdir(folder, { withFileTypes: true })) {
          if (!file.isFile() || file.isSymbolicLink() || !/^[a-f0-9]{64}\.md$/.test(file.name)) continue;
          const revision = file.name.slice(0, -3), entry = indexed.entries.find(item => item.revision === revision);
          const stat = await fs.lstat(path.join(folder, file.name));
          result.push({ id: revision, createdAt: entry?.createdAt ?? new Date(stat.mtimeMs ?? 0).toISOString(), kind: "snapshot",
            message: entry?.message ?? "Legacy snapshot", protected: entry?.protected ?? true });
        }
        return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      });
    },
    read(id: string, revision: string): Promise<HistoryRecord> {
      assertId(id);
      if (!/^[a-f0-9]{64}$/.test(revision)) throw new VaultError(400, "Invalid history revision");
      return host.serialize(async () => {
        const folder = path.join(host.root, ".history", id);
        const stat = await fs.lstat(folder).catch(() => null);
        if (!stat) throw new VaultError(404, "History version not found");
        if (!stat.isDirectory() || stat.isSymbolicLink()) throw new VaultError(422, "Invalid history directory");
        const source = await host.readOptional(path.join(folder, `${revision}.md`));
        if (source === null) throw new VaultError(404, "History version not found");
        const raw = await host.readOptional(path.join(folder, `${revision}.json`));
        const metadata = raw === null ? {} : JSON.parse(raw);
        if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) throw new VaultError(422, "Invalid historical metadata");
        return { source, metadata };
      });
    },
  };
}
