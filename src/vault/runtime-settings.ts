import { hashBytes, randomUUID } from "./crypto.js";
import type { VaultPlatform, StorageError } from "./platform.js";
import { z } from "zod";
import { runtimeKeys, type RuntimeSettings, type RuntimeOptions } from "../shared/runtime-settings";
import { VaultError } from "./vault";

const value = z.string().max(2048).refine(text => !/[\r\n\0]/.test(text)).transform(text => text.trim());
export const runtimeSettingsSchema = z.object({ rscript: value, python: value, julia: value, pandoc: value,
  pythonKernel: value, juliaKernel: value, jupyterDataDir: value }).strict();
const updateSchema = z.object({ settings: runtimeSettingsSchema, baseRevision: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
const hash = (source: string | null) => hashBytes(source ?? "");
const environmentKeys = { rscript: "NOTDOWN_RSCRIPT", python: "NOTDOWN_PYTHON", julia: "NOTDOWN_JULIA", pandoc: "PANDOC_PATH",
  pythonKernel: "NOTDOWN_JUPYTER_PYTHON_KERNEL", juliaKernel: "NOTDOWN_JUPYTER_JULIA_KERNEL", jupyterDataDir: "JUPYTER_DATA_DIR" } as const;
export function inheritedRuntimes(environment: Record<string, string | undefined>): RuntimeSettings {
  return Object.fromEntries(runtimeKeys.map(key => [key, environment[environmentKeys[key]] || ""])) as RuntimeSettings;
}

type Storage = {
  platform: VaultPlatform;
  root: string;
  atomicWrite(file: string, source: string, expected?: string | null): Promise<void>;
  serialize<T>(operation: () => Promise<T>): Promise<T>;
};

/** Uses the vault's lock, revision checks and atomic writer; never stored in page Markdown. */
export function createRuntimeSettings(storage: Storage) {
  const { fs, path, environment } = storage.platform;
  const directory = path.join(storage.root, ".notdown"), filename = path.join(directory, "runtimes.json");
  async function read() {
    let source: string | null = null;
    try {
      for (const folder of [storage.root, directory]) {
        const stat = await fs.lstat(folder);
        if (stat.isSymbolicLink() || !stat.isDirectory()) throw new VaultError(422, "Invalid runtime settings directory");
      }
      const stat = await fs.lstat(filename);
      if (stat.isSymbolicLink() || !stat.isFile()) throw new VaultError(422, "Invalid runtimes.json file");
      source = await fs.readFile(filename, "utf8");
    } catch (error) { if ((error as StorageError).code !== "ENOENT") throw error; }
    let raw: Record<string, unknown>;
    try {
      raw = source === null ? {} : JSON.parse(source);
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error();
      const settings = runtimeSettingsSchema.parse(Object.fromEntries(runtimeKeys.map(key => [key, raw[key] ?? ""])));
      return { raw, source, settings, revision: hash(source) };
    } catch { throw new VaultError(422, "Invalid runtimes.json; the original file was preserved"); }
  }
  return {
    async get() { const { settings, revision } = await read(); return { settings, revision, inherited: inheritedRuntimes(environment) }; },
    async configure(input: unknown) {
      const parsed = updateSchema.safeParse(input);
      if (!parsed.success) throw new VaultError(400, "Expected interpreter settings and baseRevision; paths cannot contain newlines or null bytes");
      return storage.serialize(async () => {
        const current = await read();
        const proposed = JSON.stringify({ ...current.raw, ...parsed.data.settings }, null, 2) + "\n";
        const preserve = async () => {
          const conflictFile = `runtime-conflict-${randomUUID()}.json`;
          await storage.atomicWrite(path.join(directory, conflictFile), JSON.stringify({ baseRevision: parsed.data.baseRevision,
            current: (await read()).source, proposed }, null, 2) + "\n", null);
          throw new VaultError(409, `Interpreter settings changed in another window. Both versions were preserved in .notdown/${conflictFile}. Reopen Settings to review the saved version.`, { conflictFile });
        };
        if (current.revision !== parsed.data.baseRevision) return preserve();
        try { await storage.atomicWrite(filename, proposed, current.source); }
        catch (error) { if (error instanceof VaultError && error.status === 503) return preserve(); throw error; }
        return { settings: parsed.data.settings, revision: hash(proposed), inherited: inheritedRuntimes(environment) };
      });
    },
  };
}
