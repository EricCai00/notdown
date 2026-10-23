import { Buffer } from "buffer";
import * as posix from "pathe";
import type { VaultPlatform, VaultFileSystem, VaultFileInfo } from "../vault/platform";

type Entry = { path: string; kind: "file" | "directory"; data?: Uint8Array };
const error = (code: string, message: string): never => { throw Object.assign(new Error(message), { code }); };
const request = <T>(value: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  value.onsuccess = () => resolve(value.result); value.onerror = () => reject(value.error);
});
const info = (entry: Entry): VaultFileInfo => ({
  size: entry.kind === "file" ? entry.data?.byteLength ?? 0 : undefined,
  isFile: () => entry.kind === "file", isDirectory: () => entry.kind === "directory", isSymbolicLink: () => false,
});

/** Persistent browser preview. Android always selects the native filesystem adapter. */
export async function createBrowserPlatform(name = "notdown-mobile-preview-v1"): Promise<VaultPlatform> {
  const opening = indexedDB.open(name, 1);
  opening.onupgradeneeded = () => {
    opening.result.createObjectStore("files", { keyPath: "path" }).put({ path: "/", kind: "directory" });
  };
  const db = await request(opening);
  async function transaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => Promise<T>): Promise<T> {
    const tx = db.transaction("files", mode), store = tx.objectStore("files");
    const completed = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error ?? new Error("Storage transaction aborted")); tx.onerror = () => {};
    });
    try { const result = await action(store); await completed; return result; }
    catch (failure) { try { tx.abort(); } catch { /* Already completed. */ } await completed.catch(() => {}); throw failure; }
  }
  const get = (store: IDBObjectStore, file: string): Promise<Entry | undefined> => request(store.get(posix.resolve(file)));
  const required = async (store: IDBObjectStore, file: string): Promise<Entry> => (await get(store, file)) ?? error("ENOENT", `File not found: ${file}`);
  async function readFile(file: string): Promise<Buffer>;
  async function readFile(file: string, encoding: "utf8"): Promise<string>;
  async function readFile(file: string, encoding?: "utf8"): Promise<Buffer | string> {
    return transaction("readonly", async store => {
      const entry = await required(store, file);
      if (entry.kind !== "file") error("EISDIR", "Expected a file");
      const bytes = Buffer.from(entry.data!);
      return encoding ? bytes.toString(encoding) : bytes;
    });
  }
  const fs: VaultFileSystem = {
    lstat: file => transaction("readonly", async store => info(await required(store, file))),
    readFile,
    readdir: directory => transaction("readonly", async store => {
      const entry = await required(store, directory);
      if (entry.kind !== "directory") error("ENOTDIR", "Expected a directory");
      return (await request<Entry[]>(store.getAll())).filter(item => item.path !== entry.path && posix.dirname(item.path) === entry.path)
        .map(item => ({ name: posix.basename(item.path), ...info(item) }));
    }),
    mkdir: (directory, options) => transaction("readwrite", async store => {
      const resolved = posix.resolve(directory);
      const parts = resolved.split("/").filter(Boolean);
      let current = "";
      for (const [index, part] of parts.entries()) {
        current += "/" + part;
        const entry = await get(store, current);
        if (entry?.kind === "file") error("ENOTDIR", "A file occupies the directory path");
        if (!entry) {
          if (!options?.recursive && index < parts.length - 1) error("ENOENT", "Parent directory is missing");
          store.put({ path: current, kind: "directory" });
        } else if (!options?.recursive && index === parts.length - 1) error("EEXIST", "Directory exists");
      }
    }),
    writeFile: (file, data, options) => transaction("readwrite", async store => {
      const resolved = posix.resolve(file), previous = await get(store, resolved);
      if (previous && options?.flag === "wx") error("EEXIST", "File already exists");
      if (previous?.kind === "directory") error("EISDIR", "Cannot replace a directory");
      if ((await required(store, posix.dirname(resolved))).kind !== "directory") error("ENOTDIR", "Invalid parent directory");
      store.put({ path: resolved, kind: "file", data: Uint8Array.from(typeof data === "string" ? new TextEncoder().encode(data) : data) });
    }),
    async open(file) {
      await fs.writeFile(file, new Uint8Array(), { flag: "wx" });
      let closed = false;
      return {
        async writeFile(data) { if (closed) error("EBADF", "File is closed"); await fs.writeFile(file, data); },
        async sync() { /* Every write awaits its IndexedDB transaction commit. */ },
        async close() { closed = true; },
      };
    },
    rm: (file, options) => transaction("readwrite", async store => {
      const entry = await get(store, file);
      if (!entry) { if (options?.force) return; return error("ENOENT", "File not found"); }
      if (entry.kind === "directory" && (await request<Entry[]>(store.getAll())).some(item => item.path.startsWith(entry.path + "/"))) error("ENOTEMPTY", "Directory is not empty");
      store.delete(entry.path);
    }),
    unlink: file => fs.rm(file),
    rename: (from, to) => transaction("readwrite", async store => {
      const source = await required(store, from);
      if (source.kind !== "file") error("EISDIR", "Only files can be renamed");
      if ((await required(store, posix.dirname(to))).kind !== "directory") error("ENOTDIR", "Invalid destination");
      if ((await get(store, to))?.kind === "directory") error("EISDIR", "Cannot replace a directory");
      store.put({ ...source, path: posix.resolve(to) }); store.delete(source.path);
    }),
    link: (from, to) => transaction("readwrite", async store => {
      const source = await required(store, from);
      if (source.kind !== "file") error("EISDIR", "Expected a file");
      if (await get(store, to)) error("EEXIST", "Destination exists");
      if ((await required(store, posix.dirname(to))).kind !== "directory") error("ENOTDIR", "Invalid destination");
      store.put({ ...source, path: posix.resolve(to) });
    }),
  };
  return {
    id: name, fs, path: { ...posix, sep: "/" }, environment: {},
    async withLock<T>(root: string, operation: () => Promise<T>): Promise<T> {
      if (!navigator.locks) throw new Error("This preview needs a browser with Web Locks on localhost or HTTPS");
      return navigator.locks.request(`${name}:${root}`, operation);
    },
    replaceFile: (temporary, destination, expected) => transaction("readwrite", async store => {
      const previous = await get(store, destination);
      if (previous?.kind === "directory") error("EISDIR", "Cannot replace a directory");
      const bytes = previous ? Buffer.from(previous.data!) : null;
      if (bytes === null ? expected !== null : expected === null || !bytes.equals(expected)) error("ESTALE", "File changed during save; recovery copy preserved");
      const source = await required(store, temporary);
      store.put({ ...source, path: destination }); store.delete(temporary);
    }),
    async recycleFile() { throw new Error("Permanent deletion is unavailable in the mobile preview"); },
  };
}
