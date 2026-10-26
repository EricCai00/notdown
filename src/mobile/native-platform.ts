import { Buffer } from "buffer";
import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import * as posix from "pathe";
import type { VaultPlatform, VaultFileSystem, VaultFileInfo } from "../vault/platform";

type FileInfo = { name?: string; kind: "file" | "directory" | "symlink" };
interface NativeStorage {
  stat(options: { path: string }): Promise<FileInfo>;
  read(options: { path: string }): Promise<{ data: string }>;
  list(options: { path: string }): Promise<{ entries: FileInfo[] }>;
  mkdir(options: { path: string; recursive: boolean }): Promise<void>;
  write(options: { path: string; data: string; exclusive: boolean }): Promise<void>;
  remove(options: { path: string; force: boolean }): Promise<void>;
  move(options: { from: string; to: string }): Promise<void>;
  link(options: { from: string; to: string }): Promise<void>;
  replace(options: { from: string; to: string; expected: string | null }): Promise<void>;
  replaceMany(options: { files: { path: string; expected: string | null; data: string }[] }): Promise<void>;
  acquire(options: { path: string }): Promise<{ token: string }>;
  release(options: { token: string }): Promise<void>;
  exportDocument(options: { name: string; data: string }): Promise<{ saved: boolean }>;
  background(): Promise<void>;
  hideKeyboard(): Promise<void>;
  addListener(event: "pause" | "resume", listener: () => void): Promise<PluginListenerHandle>;
}
export const NativeVault = registerPlugin<NativeStorage>("NotdownVault");
const info = (entry: FileInfo): VaultFileInfo => ({
  isFile: () => entry.kind === "file", isDirectory: () => entry.kind === "directory", isSymbolicLink: () => entry.kind === "symlink",
});
export function createNativePlatform(): VaultPlatform {
  async function readFile(file: string): Promise<Buffer>;
  async function readFile(file: string, encoding: "utf8"): Promise<string>;
  async function readFile(file: string, encoding?: "utf8"): Promise<Buffer | string> {
    const bytes = Buffer.from((await NativeVault.read({ path: file })).data, "base64");
    return encoding ? bytes.toString(encoding) : bytes;
  }
  const fs: VaultFileSystem = {
    lstat: async file => info(await NativeVault.stat({ path: file })),
    readFile,
    readdir: async directory => (await NativeVault.list({ path: directory })).entries.map(entry => ({ name: entry.name!, ...info(entry) })),
    mkdir: (directory, options) => NativeVault.mkdir({ path: directory, recursive: options?.recursive ?? false }),
    writeFile: (file, data, options) => NativeVault.write({ path: file, data: Buffer.from(data).toString("base64"), exclusive: options?.flag === "wx" }),
    async open(file) {
      await fs.writeFile(file, "", { flag: "wx" });
      let closed = false;
      return {
        async writeFile(data) { if (closed) throw new Error("File is closed"); await fs.writeFile(file, data); },
        async sync() { /* Native write always fsyncs before resolving. */ },
        async close() { closed = true; },
      };
    },
    rm: (file, options) => NativeVault.remove({ path: file, force: options?.force ?? false }),
    unlink: file => NativeVault.remove({ path: file, force: false }),
    rename: (from, to) => NativeVault.move({ from, to }),
    link: (from, to) => NativeVault.link({ from, to }),
  };
  return {
    id: "android-private-files", fs, path: { ...posix, sep: "/" }, environment: {},
    async withLock<T>(root: string, operation: () => Promise<T>): Promise<T> {
      let token: string | undefined;
      for (let attempt = 0; ; attempt++) {
        try { token = (await NativeVault.acquire({ path: root })).token; break; }
        catch (error) {
          if ((error as { code?: string }).code !== "ELOCKED" || attempt >= 100) throw error;
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }
      try { return await operation(); } finally { await NativeVault.release({ token }); }
    },
    replaceFile: (from, to, expected) => NativeVault.replace({ from, to, expected: expected?.toString("base64") ?? null }),
    replaceFiles: files => NativeVault.replaceMany({ files: files.map(file => ({ path: file.path,
      expected: file.before?.toString("base64") ?? null, data: file.after.toString("base64") })) }),
    async recycleFile() { throw new Error("Permanent deletion is unavailable on Android; pages remain in Trash"); },
  };
}
