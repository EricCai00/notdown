import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { VaultError } from "./vault";

/** Explicit configuration wins. Never accept a runtime path from a document. */
export async function pythonRuntime(override?: string): Promise<{ executable: string; args: string[] }> {
  const candidates: { executable: string; args: string[] }[] = [];
  if (override || process.env.NOTDOWN_PYTHON) candidates.push({ executable: (override || process.env.NOTDOWN_PYTHON)!, args: [] });
  else {
    if (process.env.VIRTUAL_ENV) candidates.push({ executable: path.join(process.env.VIRTUAL_ENV, process.platform === "win32" ? "Scripts/python.exe" : "bin/python"), args: [] });
    candidates.push({ executable: "python3", args: [] }, { executable: "python", args: [] });
    if (process.platform === "win32") {
      candidates.unshift({ executable: "py", args: ["-3"] });
      const root = path.join(process.env.LOCALAPPDATA || "", "Programs", "Python");
      for (const name of (await fs.readdir(root).catch(() => [])).sort().reverse())
        if (/^Python3\d+$/.test(name)) candidates.push({ executable: path.join(root, name, "python.exe"), args: [] });
    }
  }
  for (const candidate of candidates) {
    const available = await new Promise<boolean>(resolve => {
      const child = spawn(candidate.executable, [...candidate.args, "-c", "import sys, jupyter_client; assert sys.version_info >= (3, 9)"], { windowsHide: true, stdio: "ignore", shell: false });
      const timer = setTimeout(() => { child.kill(); resolve(false); }, 4000);
      child.on("error", () => { clearTimeout(timer); resolve(false); });
      child.on("close", code => { clearTimeout(timer); resolve(code === 0); });
    });
    if (available) return candidate;
  }
  throw new VaultError(503, "Python 3.9+ with jupyter_client is required. Run: python -m pip install jupyter_client ipykernel. Set NOTDOWN_PYTHON to that Python executable. Julia also requires an IJulia kernel.");
}
