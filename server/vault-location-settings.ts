import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";

export function locationSettingsPath(env: NodeJS.ProcessEnv = process.env) {
  return path.join(env.NOTDOWN_DESKTOP_PROFILE || env.LOCALAPPDATA || (process.platform === "win32" ? path.join(os.homedir(), "AppData", "Local") : path.join(os.homedir(), ".config")), "Notdown", "vault-location.json");
}
export function savedVaultLocation(file: string): string | undefined {
  try { const value = JSON.parse(readFileSync(file, "utf8")).dataPath; return typeof value === "string" && path.isAbsolute(value) ? value : undefined; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error("Could not read vault location settings."); }
}
export function savedCreateLocation(file: string): string {
  try { const value = JSON.parse(readFileSync(file, "utf8")).createLocation; return typeof value === "string" ? value : ""; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error("Could not read vault location settings."); return ""; }
}
const preferenceWrites = new Map<string, Promise<void>>();
function updateLocationSettings(file: string, changes: object) {
  const pending = (preferenceWrites.get(file) || Promise.resolve()).catch(() => {}).then(async () => {
    let previous = {};
    try { previous = JSON.parse(await fs.readFile(file, "utf8")); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    await fs.mkdir(path.dirname(file), { recursive: true });
    const temp = `${file}.${randomUUID()}.tmp`;
    try { await fs.writeFile(temp, JSON.stringify({ ...previous, ...changes })); await fs.rename(temp, file); }
    finally { await fs.unlink(temp).catch(() => {}); }
  });
  preferenceWrites.set(file, pending);
  void pending.finally(() => { if (preferenceWrites.get(file) === pending) preferenceWrites.delete(file); }).catch(() => {});
  return pending;
}
export function saveCreateLocation(file: string, input: unknown) {
  // This is a form preference, not a command to create, move or open a directory.
  if (typeof input !== "string" || input.length > 32768 || /[\x00-\x1f]/.test(input)) throw new Error("Invalid save location.");
  return updateLocationSettings(file, { createLocation: input });
}
export function documentsDirectory() {
  if (process.platform === "win32") {
    const value = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding; [Environment]::GetFolderPath('MyDocuments')"], { encoding: "utf8", windowsHide: true }).trim();
    if (!value || !path.isAbsolute(value)) throw new Error("Windows Documents folder is unavailable.");
    return value;
  }
  return path.join(os.homedir(), "Documents");
}
export async function saveVaultLocation(file: string, input: unknown) {
  if (typeof input !== "string" || !path.isAbsolute(input)) throw new Error("Choose an absolute folder path.");
  const stat = await fs.lstat(input);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Choose an existing real folder.");
  const selected = await fs.realpath(input);
  if (await fs.stat(path.join(selected, "pages")).catch(() => null)) throw new Error("Choose a parent folder, not a vault.");
  await fs.access(selected, fs.constants.W_OK);
  await updateLocationSettings(file, { dataPath: selected });
  return selected;
}
