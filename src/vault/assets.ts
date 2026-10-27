import { Buffer } from "buffer";
import { randomUUID } from "./crypto";
import { assetStorageName, assetMimeExtensions as mimeExtensions } from "./asset-storage";
import type { VaultPlatform, StorageError } from "./platform";
import { VaultError, type Page } from "./vault";
import { localAssetPath, assetKind, type AssetLibrary, type AssetReference, type VaultAsset } from "../features/assets/asset-model";
import { pageAssetReferences } from "../features/assets/asset-references";
import { trashedPageIds } from "../features/pages/page-hierarchy";
import type { ImportPlan } from "../../server/markdown-import";
import { recycleOrphanAssets, type AssetCleanupHost } from "./asset-cleanup";

type AssetRecord = { name: string; contentType: string; size: number; addedAt: string; [key: string]: unknown };
type Host = AssetCleanupHost & {
  platform: VaultPlatform; root: string;
  serialize<T>(operation: () => Promise<T>): Promise<T>;
  pages(): Promise<Page[]>;
  readMetadata(): Promise<Record<string, unknown>>;
  readOptional(path: string): Promise<string | null>;
  safeDirectory(path: string): Promise<void>;
  atomicWrite(path: string, data: string | Buffer, expected?: string | null): Promise<void>;
};
const recordMap = (metadata: Record<string, unknown>): Record<string, unknown> => {
  if (metadata.assets === undefined) return {};
  if (!metadata.assets || typeof metadata.assets !== "object" || Array.isArray(metadata.assets)) throw new VaultError(422, "Invalid attachment metadata; original metadata.json was preserved");
  return metadata.assets as Record<string, unknown>;
};
function record(value: unknown): Partial<AssetRecord> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const data = value as AssetRecord;
  return { name: typeof data.name === "string" ? data.name : undefined, contentType: typeof data.contentType === "string" ? data.contentType : undefined,
    addedAt: typeof data.addedAt === "string" && Number.isFinite(Date.parse(data.addedAt)) ? data.addedAt : undefined,
    size: Number.isSafeInteger(data.size) && data.size >= 0 ? data.size : undefined };
}

export function createAssets(host: Host) {
  const { fs, path } = host.platform;
  const directory = path.join(host.root, "assets"), metadataPath = path.join(host.root, "metadata.json");
  const referenceCache = new Map<string, { revision: string; result: ReturnType<typeof pageAssetReferences> }>();
  async function persistMetadata(metadata: Record<string, unknown>, before: string | null, context: Record<string, unknown>) {
    const after = JSON.stringify(metadata, null, 2) + "\n";
    try { await host.atomicWrite(metadataPath, after, before); }
    catch {
      const recovery = path.join(host.root, ".history", "asset-conflicts");
      await host.safeDirectory(recovery);
      await host.atomicWrite(path.join(recovery, `${randomUUID()}.json`), JSON.stringify({ ...context, before, proposed: after }, null, 2), null);
      throw new VaultError(409, "Attachment metadata changed during save. Files and proposed metadata were preserved; refresh before retrying.", context);
    }
  }
  return {
    recycleOrphansLocked: (pages: Page[]) => recycleOrphanAssets(host, pages),
    /** Called within importBatch's vault lock, after publishing the actual files. */
    async registerImportedLocked(items: ImportPlan["assets"], importId: string) {
      const imported = items.filter(item => item.origin || item.name || item.contentType);
      if (!imported.length) return;
      await host.safeDirectory(directory);
      const before = await host.readOptional(metadataPath), metadata = await host.readMetadata();
      const records = { ...recordMap(metadata) }, addedAt = new Date().toISOString();
      const changed: string[] = [];
      for (const item of imported) {
        if (!/^[a-zA-Z0-9_-]+\.[a-z0-9]+$/.test(item.filename)) throw new VaultError(400, "Invalid imported attachment name");
        const key = `assets/${item.filename}`, existing = records[key];
        if (existing !== undefined && (!existing || typeof existing !== "object" || Array.isArray(existing))) throw new VaultError(422, "Invalid attachment metadata; original metadata.json was preserved");
        const name = typeof item.name === "string" ? path.basename(item.name.replaceAll("\\", "/")).replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 180) : "";
        const next = { ...(name ? { name } : {}), contentType: item.contentType || "application/octet-stream", size: item.data.length,
          addedAt, origin: item.origin || "import", importId, ...existing as Record<string, unknown> };
        if (JSON.stringify(next) === JSON.stringify(existing)) continue;
        const target = path.join(directory, item.filename);
        try {
          const stat = await fs.lstat(target);
          if (!stat.isFile() || stat.isSymbolicLink() || !(await fs.readFile(target)).equals(item.data)) throw new VaultError(409, "An imported attachment changed. Its file and metadata were preserved.");
        } catch (error) {
          if ((error as StorageError).code === "ENOENT") throw new VaultError(409, "An imported attachment is missing. Existing pages and metadata were preserved.");
          throw error;
        }
        records[key] = next; changed.push(key);
      }
      if (!changed.length) return;
      metadata.assets = records;
      await persistMetadata(metadata, before, { importId, paths: changed });
    },
    info(value: unknown) {
      return host.serialize(async () => {
        const key = localAssetPath(value);
        if (!key) throw new VaultError(400, "Invalid attachment path");
        let target = host.root, size: number | null = null;
        const parts = key.split("/");
        for (const [index, part] of parts.entries()) {
          target = path.join(target, part);
          const stat = await fs.lstat(target).catch(error => {
            if ((error as StorageError).code === "ENOENT") throw new VaultError(404, "Attachment not found");
            throw error;
          });
          if (stat.isSymbolicLink() || (index < parts.length - 1 ? !stat.isDirectory() : !stat.isFile())) throw new VaultError(422, "Invalid attachment path");
          size = stat.size ?? null;
        }
        const stored = record(recordMap(await host.readMetadata())[key]);
        return { path: key, name: stored.name || null, size };
      });
    },
    list(): Promise<AssetLibrary> {
      return host.serialize(async () => {
        const pages = await host.pages(), metadata = recordMap(await host.readMetadata());
        const references = new Map<string, AssetReference[]>(), warnings: string[] = [];
        const trashed = trashedPageIds(pages), ids = new Set(pages.map(page => page.id));
        for (const id of referenceCache.keys()) if (!ids.has(id)) referenceCache.delete(id);
        for (const page of pages) {
          let cached = referenceCache.get(page.id);
          if (!cached || cached.revision !== page.revision) {
            cached = { revision: page.revision, result: pageAssetReferences(page) }; referenceCache.set(page.id, cached);
          }
          if (cached.result.uncertain) warnings.push(`Some source in “${page.title}” could not be checked for attachment references.`);
          for (const [key, locations] of cached.result.references) {
            const refs = references.get(key) ?? [];
            refs.push({ pageId: page.id, title: page.title, trashed: trashed.has(page.id), locations: [...locations] }); references.set(key, refs);
          }
        }
        const assets: VaultAsset[] = [], found = new Set<string>();
        const visit = async (folder: string, prefix: string) => {
          const stat = await fs.lstat(folder);
          if (stat.isSymbolicLink() || !stat.isDirectory()) return;
          for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
            if (entry.isSymbolicLink() || entry.name.startsWith(".")) continue;
            const key = `${prefix}/${entry.name}`, full = path.join(folder, entry.name);
            if (entry.isDirectory()) { await visit(full, key); continue; }
            if (!entry.isFile()) continue;
            try {
              const info = await fs.lstat(full);
              if (!info.isFile() || info.isSymbolicLink()) continue;
              const stored = record(metadata[key]);
              const contentType = stored.contentType || Object.entries(mimeExtensions).find(([, ext]) => key.toLowerCase().endsWith(`.${ext}`))?.[0] || "application/octet-stream";
              assets.push({ path: key, name: stored.name || entry.name, originalName: stored.name || null,
                contentType, kind: assetKind(key, contentType), size: info.size ?? stored.size ?? null,
                addedAt: stored.addedAt ?? null, modifiedAt: info.mtimeMs ? new Date(info.mtimeMs).toISOString() : stored.addedAt ?? null,
                missing: false, references: references.get(key) ?? [] }); found.add(key);
            } catch (error) { if ((error as StorageError).code !== "ENOENT") throw error; }
          }
        };
        await visit(directory, "assets");
        for (const [key, refs] of references) if (!found.has(key)) {
          const stored = record(metadata[key]);
          assets.push({ path: key, name: stored.name || key.split("/").pop()!, originalName: stored.name || null,
            contentType: stored.contentType || "application/octet-stream", kind: assetKind(key, stored.contentType),
            size: null, addedAt: stored.addedAt ?? null, modifiedAt: null, missing: true, references: refs });
        }
        return { assets: assets.sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path)), warnings };
      });
    },
    upload(name: unknown, contentType: unknown, data: unknown) {
      return host.serialize(async () => {
        if (typeof name !== "string" || !name.trim() || typeof contentType !== "string" || typeof data !== "string") throw new VaultError(400, "Attachments require name, contentType, and base64 data");
        if (data.length > 28 * 1024 * 1024) throw new VaultError(413, "Attachment exceeds 20 MB");
        // Avoid a repeating four-character regex group: large valid files can overflow V8's stack.
        if (data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) throw new VaultError(400, "Invalid attachment base64 encoding");
        const bytes = Buffer.from(data, "base64");
        if (bytes.toString("base64") !== data) throw new VaultError(400, "Invalid attachment base64 encoding");
        if (bytes.length > 20 * 1024 * 1024) throw new VaultError(413, "Attachment exceeds 20 MB");
        await host.pages(); // Recover pending page transactions before touching shared metadata.
        const before = await host.readOptional(metadataPath), metadata = await host.readMetadata();
        const records = recordMap(metadata);
        const mime = contentType.split(";")[0].trim().toLowerCase();
        const acceptedType = Object.hasOwn(mimeExtensions, mime) ? mime : "application/octet-stream";
        const filename = assetStorageName(bytes, name, acceptedType), key = `assets/${filename}`;
        const cleanName = path.basename(name.replaceAll("\\", "/")).replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 180) || filename;
        const existing = records[key];
        if (existing !== undefined && (!existing || typeof existing !== "object" || Array.isArray(existing))) throw new VaultError(422, "Invalid attachment metadata; original metadata.json was preserved");
        metadata.assets = { ...records, [key]: { name: cleanName, contentType: acceptedType, size: bytes.length, addedAt: new Date().toISOString(), ...existing as Record<string, unknown> } };
        await host.safeDirectory(directory);
        const target = path.join(directory, filename);
        try {
          const stat = await fs.lstat(target);
          if (!stat.isFile() || stat.isSymbolicLink() || !(await fs.readFile(target)).equals(bytes)) {
            const recovery = path.join(host.root, ".history", "asset-conflicts");
            await host.safeDirectory(recovery);
            await host.atomicWrite(path.join(recovery, `${randomUUID()}.json`), JSON.stringify({ path: key, name: cleanName, contentType: acceptedType, data: bytes.toString("base64"), reason: "content-path-changed" }), null);
            throw new VaultError(409, "An attachment at this content path changed; its file and the proposed upload were preserved.");
          }
        } catch (error) {
          if ((error as StorageError).code !== "ENOENT") throw error;
          await host.atomicWrite(target, bytes, null);
        }
        await persistMetadata(metadata, before, { path: key });
        return { path: key, name: cleanName, contentType: acceptedType };
      });
    },
  };
}
