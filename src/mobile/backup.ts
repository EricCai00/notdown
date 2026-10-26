import { unzipSync, zipSync } from "fflate";
import { Buffer } from "buffer";
import { archiveLimits, validateArchive, type VaultArchiveFile } from "../vault/archive";
import { Capacitor } from "@capacitor/core";
import { NativeVault } from "./native-platform";
import { isSyncLocalFile } from "../vault/sync-store";
import { isHistoryTransientFile } from "../vault/history";

export function readVaultZip(bytes: Uint8Array): VaultArchiveFile[] {
  if (bytes.byteLength > archiveLimits.bytes) throw new Error("Backup ZIP exceeds 128 MB");
  let count = 0, total = 0;
  const names = new Set<string>();
  const unzipped = unzipSync(bytes, { filter(file) {
    if (file.name.endsWith("/")) return false;
    const name = file.name.toLowerCase();
    if (names.has(name)) throw new Error("Backup contains duplicate file paths");
    names.add(name);
    total += file.originalSize; count++;
    if (total > archiveLimits.bytes || count > archiveLimits.files) throw new Error("Backup exceeds 128 MB uncompressed or 10,000 files");
    return true;
  } });
  let files = Object.entries(unzipped).map(([path, data]) => ({ path, data }));
  if (!files.some(file => file.path === "metadata.json" || file.path.startsWith("pages/"))) {
    const prefix = files[0]?.path.split("/")[0] + "/";
    if (files.length && files.every(file => file.path.startsWith(prefix))) files = files.map(file => ({ ...file, path: file.path.slice(prefix.length) }));
  }
  // A desktop vault may have been zipped while its service held a transient lock.
  files = files.filter(file => file.path !== ".history/vault.lock" && !isHistoryTransientFile(file.path) && !isSyncLocalFile(file.path));
  validateArchive(files); return files;
}
export function writeVaultZip(files: VaultArchiveFile[]): Uint8Array {
  const entries: Record<string, Uint8Array> = Object.create(null);
  for (const file of files) entries[file.path] = file.data;
  if (!files.length) entries["metadata.json"] = new TextEncoder().encode('{"version":1,"pages":{}}\n');
  return zipSync(entries, { level: 6 });
}
export async function exportVaultZip(bytes: Uint8Array): Promise<boolean> {
  const name = `Notdown-${new Date().toISOString().slice(0, 10)}.zip`;
  if (Capacitor.isNativePlatform()) return (await NativeVault.exportDocument({ name, data: Buffer.from(bytes).toString("base64") })).saved;
  const url = URL.createObjectURL(new Blob([Uint8Array.from(bytes)], { type: "application/zip" }));
  const link = document.createElement("a"); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000); return true;
}
