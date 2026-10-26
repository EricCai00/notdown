import { VaultError } from "./vault.js";
import { isSyncLocalFile } from "./sync-store.js";
import { isHistoryTransientFile } from "./history.js";

export type VaultArchiveFile = { path: string; data: Uint8Array };
export const archiveLimits = { files: 10000, bytes: 128 * 1024 * 1024 };

export function archivePath(value: string): string {
  if (!value || value.length > 1000 || /[\\\x00-\x1f:]/.test(value) || value.startsWith("/") ||
      value.split("/").some(part => !part || part === "." || part === ".." || /[. ]$/.test(part)))
    throw new VaultError(400, "Backup contains an invalid relative file path");
  return value;
}

/** Validate the entire restore before writing anything. Lock files are never portable. */
export function validateArchive(files: VaultArchiveFile[]) {
  if (!Array.isArray(files) || files.length > archiveLimits.files) throw new VaultError(413, "Backup contains too many files");
  let bytes = 0;
  const seen = new Set<string>();
  for (const file of files) {
    if (!file || typeof file.path !== "string" || !(file.data instanceof Uint8Array)) throw new VaultError(400, "Invalid backup entry");
    const name = archivePath(file.path).toLowerCase();
    if (name === ".history/vault.lock" || isHistoryTransientFile(name)) throw new VaultError(400, "Backup contains a transient storage lock");
    if (isSyncLocalFile(name)) throw new VaultError(400, "Backup contains device-local sync credentials or state");
    if (seen.has(name)) throw new VaultError(400, "Backup contains duplicate file paths");
    seen.add(name);
    bytes += file.data.byteLength;
    if (bytes > archiveLimits.bytes) throw new VaultError(413, "Backup exceeds 128 MB uncompressed");
  }
  for (const name of seen) {
    const parts = name.split("/");
    for (let i = 1; i < parts.length; i++) if (seen.has(parts.slice(0, i).join("/"))) throw new VaultError(400, "Backup file conflicts with a directory");
  }
  if (!seen.has("metadata.json") && ![...seen].some(name => name.startsWith("pages/") && name.endsWith(".md")))
    throw new VaultError(400, "Choose a Notdown vault ZIP containing pages/ or metadata.json");
}
