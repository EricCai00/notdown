import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { Buffer } from "buffer";
import { VaultError } from "../src/vault/vault.js";
import type { VaultPlatform } from "../src/vault/platform.js";
import { replaceFile } from "./file-replace.js";
import { recycleFile } from "./recycle-file.js";

async function readFile(file: string): Promise<Buffer>;
async function readFile(file: string, encoding: "utf8"): Promise<string>;
async function readFile(file: string, encoding?: "utf8"): Promise<Buffer | string> {
  const bytes = await fs.readFile(file);
  return encoding ? bytes.toString(encoding) : Buffer.from(bytes);
}

/** Desktop owns OS paths, the process lock, durable writes and system recycle bin. */
export const nodeVaultPlatform: VaultPlatform = {
  id: "node",
  fs: { ...fs, readFile },
  path,
  environment: process.env,
  recycleFile,
  replaceFile: (temporary, destination, expected) =>
    replaceFile(temporary, destination, expected === null ? null : globalThis.Buffer.from(expected)),
  async withLock<T>(root: string, operation: () => Promise<T>): Promise<T> {
    const lockPath = path.join(root, ".history", "vault.lock");
    const token = JSON.stringify({ pid: process.pid, token: randomUUID() });
    const readOwner = async () => {
      try {
        const stat = await fs.lstat(lockPath);
        if (!stat.isFile() || stat.isSymbolicLink()) throw new VaultError(422, "Invalid storage file");
        return await fs.readFile(lockPath, "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    };
    for (let attempt = 0; ; attempt++) {
      try { await fs.writeFile(lockPath, token, { flag: "wx", mode: 0o600 }); break; }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        const owner = await readOwner();
        if (owner) {
          try {
            const pid = JSON.parse(owner).pid;
            if (Number.isInteger(pid) && pid > 0) {
              try { process.kill(pid, 0); }
              catch (error) {
                if ((error as NodeJS.ErrnoException).code === "ESRCH" && await readOwner() === owner) {
                  await fs.rm(lockPath, { force: true });
                  continue;
                }
              }
            }
          } catch { /* A writer may still be filling its newly acquired lock. */ }
        }
        if (attempt >= 100) throw new VaultError(503, "The vault is busy in another process. Your draft has not been written.");
        await delay(50);
      }
    }
    try { return await operation(); }
    finally { if (await readOwner() === token) await fs.rm(lockPath); }
  },
};
