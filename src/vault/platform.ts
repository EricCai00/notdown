import type { Buffer } from "buffer";

/** The file operations required by the shared vault, without a Node runtime. */
export interface VaultFileInfo {
  size?: number;
  mtimeMs?: number;
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
}
export interface VaultDirectoryEntry extends VaultFileInfo { name: string }
export interface VaultFileSystem {
  lstat(file: string): Promise<VaultFileInfo>;
  readFile(file: string): Promise<Buffer>;
  readFile(file: string, encoding: "utf8"): Promise<string>;
  readdir(directory: string, options: { withFileTypes: true }): Promise<VaultDirectoryEntry[]>;
  mkdir(directory: string, options?: { recursive?: boolean }): Promise<unknown>;
  writeFile(file: string, data: string | Uint8Array, options?: { flag?: "wx"; mode?: number }): Promise<void>;
  open(file: string, flag: "wx", mode?: number): Promise<{
    writeFile(data: string | Uint8Array): Promise<void>;
    sync(): Promise<void>;
    close(): Promise<void>;
  }>;
  rm(file: string, options?: { force?: boolean }): Promise<void>;
  unlink(file: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  link(from: string, to: string): Promise<void>;
}
export interface VaultPath {
  sep: string;
  resolve(...parts: string[]): string;
  join(...parts: string[]): string;
  dirname(file: string): string;
  basename(file: string, suffix?: string): string;
  extname(file: string): string;
}
export interface VaultPlatform {
  /** Distinguishes separate storage backends in the in-process operation queue. */
  id: string;
  fs: VaultFileSystem;
  path: VaultPath;
  environment: Record<string, string | undefined>;
  withLock<T>(root: string, operation: () => Promise<T>): Promise<T>;
  replaceFile(temporary: string, destination: string, expected: Buffer | null): Promise<void>;
  recycleFile(file: string): Promise<void>;
}
export type StorageError = Error & { code?: string };
