import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { promises as fs } from "node:fs";
import path from "node:path";

/** Receives only a page path resolved by the vault, never a client-supplied path. */
export async function openFile(filename: string): Promise<void> {
  if (!path.isAbsolute(filename) || path.extname(filename).toLowerCase() !== ".md")
    throw new Error("Only absolute Markdown page paths can be opened.");
  const stat = await fs.lstat(filename);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Only regular page files can be opened.");
  const run = promisify(execFile);
  const options = { windowsHide: true, timeout: 15_000, maxBuffer: 128 * 1024 };
  if (process.platform === "win32") {
    const powershell = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    // Keep the filename out of executable code, including quotes, $, %, and brackets.
    await run(powershell, ["-NoProfile", "-NonInteractive", "-Command", "Invoke-Item -LiteralPath $env:NOTDOWN_SOURCE_FILE -ErrorAction Stop"], {
      ...options, env: { ...process.env, NOTDOWN_SOURCE_FILE: filename },
    });
  } else {
    await run(process.platform === "darwin" ? "open" : "xdg-open", [filename], options);
  }
}
