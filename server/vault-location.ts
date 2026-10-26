import path from "node:path";
import os from "node:os";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { promises as fs } from "node:fs";

export function loadLocalEnv(directory = process.cwd()) {
  const file = path.join(directory, ".env");
  if (existsSync(file)) loadEnvFile(file);
}
export function vaultFolder(dataPath: string, name: string) {
  if (typeof name !== "string" || !name.trim() || name !== name.trim() || name.length > 80 || /[<>:"/\\|?*\x00-\x1f]/.test(name) || /[. ]$/.test(name) ||
    name === "." || name === ".." || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(name)) throw new Error("Choose a vault name without path separators or reserved characters.");
  return path.join(path.resolve(dataPath), name);
}
export function resolveVaultLocation(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()) {
  const defaultData = process.platform === "win32" ? path.join(env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "Notdown")
    : path.join(env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share"), "Notdown");
  const dataPath = path.resolve(cwd, env.NOTDOWN_DATA_PATH || defaultData);
  const legacy = path.join(cwd, "vault");
  const explicit = env.VAULT_PATH !== undefined;
  const vaultPath = explicit ? path.resolve(cwd, env.VAULT_PATH!)
    : !env.NOTDOWN_DATA_PATH && !env.NOTDOWN_VAULT_NAME && existsSync(path.join(legacy, "pages")) ? legacy
    : vaultFolder(dataPath, env.NOTDOWN_VAULT_NAME || "Default");
  return { dataPath, vaultPath, isDefault: !explicit && !env.NOTDOWN_VAULT_NAME };
}
export async function listManagedVaults(dataPath: string) {
  const root = path.resolve(dataPath);
  try {
    const stat = await fs.lstat(root);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("The vaults directory must be a real folder.");
    const result: { name: string; path: string }[] = [];
    for (const entry of await fs.readdir(root, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      const pages = await fs.lstat(path.join(root, entry.name, "pages")).catch(() => null);
      if (pages?.isDirectory() && !pages.isSymbolicLink()) result.push({ name: entry.name, path: path.join(root, entry.name) });
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
}
export async function createManagedVaultFolder(dataPath: string, name: string) {
  const selected = vaultFolder(dataPath, name), root = path.resolve(dataPath);
  if (existsSync(path.join(root, "pages"))) throw new Error("The data folder already contains a vault. Move that vault into its own named subfolder first.");
  await fs.mkdir(root, { recursive: true });
  for (const folder of [root, path.dirname(selected)]) {
    await fs.mkdir(folder, { recursive: true });
    const stat = await fs.lstat(folder);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Managed vaults require real folders.");
  }
  await fs.mkdir(selected); // Existing directories are never reused or overwritten.
  return selected;
}
