import { randomUUID } from "./crypto";
import type { VaultPlatform } from "./platform";
import { VaultError } from "./vault";

type FileChange = { path: string; before: string | null; after: string };
type Storage = {
  platform: VaultPlatform;
  root: string;
  readOptional(filename: string): Promise<string | null>;
  atomicWrite(filename: string, source: string, expected?: string | null): Promise<void>;
};

/** A recoverable page/metadata transaction, always called under the existing vault lock. */
export function createPageBatch(storage: Storage) {
  const { fs, path } = storage.platform;
  const directory = path.join(storage.root, ".history");
  function target(relative: string) {
    if (typeof relative !== "string" || relative !== "metadata.json" &&
        (!relative.startsWith("pages/") || !relative.endsWith(".md") || /[\\/\0]/.test(relative.slice(6))))
      throw new VaultError(422, "Invalid page batch path; recovery file preserved");
    return path.join(storage.root, ...relative.split("/"));
  }
  async function apply(filename: string, files: FileChange[]) {
    if (!files.length || new Set(files.map(file => file.path)).size !== files.length || files.some(file =>
      typeof file.path !== "string" || !(file.before === null || typeof file.before === "string") || typeof file.after !== "string"))
      throw new VaultError(422, "Invalid page batch; recovery file preserved");
    // Check every participant before writing any of them. Never retry over an external edit.
    for (const file of files) {
      const source = await storage.readOptional(target(file.path));
      if (source !== file.before && source !== file.after)
        throw new VaultError(503, `A page batch conflicts with external changes. Both versions are preserved in ${filename}`);
    }
    for (const file of files) {
      const destination = target(file.path), source = await storage.readOptional(destination);
      if (source !== file.after) await storage.atomicWrite(destination, file.after, file.before);
    }
    await fs.rm(filename);
  }
  return {
    async recover() {
      for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
        if (!/^page-batch-[a-f0-9-]+\.json$/.test(entry.name)) continue;
        const filename = path.join(directory, entry.name);
        const record = JSON.parse((await storage.readOptional(filename))!);
        if (record?.version !== 1 || !Array.isArray(record.files)) throw new VaultError(422, "Invalid page batch journal");
        await apply(filename, record.files);
      }
    },
    async commit(files: FileChange[]) {
      if (!files.length) return;
      const current = await Promise.all(files.map(async file => ({ ...file, current: await storage.readOptional(target(file.path)) })));
      if (current.some(file => file.current !== file.before)) {
        const recoveryPath = path.join(directory, `page-batch-conflict-${randomUUID()}.json`);
        await storage.atomicWrite(recoveryPath, JSON.stringify({ version: 1, files: current }, null, 2) + "\n", null);
        throw new VaultError(409, "A page changed while preparing child page entries. Both versions were preserved; no changes were applied.", { recoveryPath });
      }
      const filename = path.join(directory, `page-batch-${randomUUID()}.json`);
      await storage.atomicWrite(filename, JSON.stringify({ version: 1, files }, null, 2) + "\n", null);
      await apply(filename, files);
    },
  };
}
