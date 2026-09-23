import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Only the native Recycle Bin operation is available; never fall back to unlink. */
export async function recycleFile(filename: string): Promise<void> {
  if (process.platform !== "win32") throw new Error("System Recycle Bin is currently supported on Windows only.");
  if (!path.isAbsolute(filename)) throw new Error("Recycling requires an absolute file path.");
  const stat = await fs.lstat(filename);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Only regular page files can be recycled.");
  const script = fileURLToPath(new URL("./recycle-file.ps1", import.meta.url));
  const powershell = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  await promisify(execFile)(powershell, ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script, "-LiteralPath", filename], {
    windowsHide: true,
    timeout: 30_000,
    maxBuffer: 128 * 1024,
  });
  try { await fs.lstat(filename); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
  throw new Error("Windows did not move the page to the Recycle Bin.");
}
