import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rscriptPath } from "./rmarkdown";
import { VaultError } from "./vault";

import { pythonRuntime } from "./python-runtime";
import type { NotebookReply } from "./r-notebook";
import { runtimeEnvironment } from "./runtime-settings";
import type { RuntimeOptions } from "../src/shared/runtime-settings";
const limit = 8 * 1024 * 1024;

export class NotebookWorker {
  private process?: ChildProcessWithoutNullStreams;
  private directory?: string;
  private pending?: { marker: string; resolve: () => void; reject: (error: Error) => void };
  private stopped = false;
  private serial = 0;
  private log = "";
  private logSize = 0;
  private idle?: ReturnType<typeof setTimeout>;
  busy = false;
  constructor(private onStop: () => void, private language: "r" | "python" | "julia" = "r",
    private settings: () => Promise<RuntimeOptions> = async () => ({})) {}

  private wait(marker: string) {
    return new Promise<void>((resolve, reject) => { this.pending = { marker, resolve, reject }; });
  }
  async start() {
    const settings = await this.settings();
    if (this.stopped) throw new VaultError(499, "Notebook stopped");
    const directory = this.directory = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-r-notebook-"));
    // Electron's fs can read ASAR assets; external Rscript cannot.
    const driver = path.join(directory, this.language === "r" ? "notebook.R" : "notebook.py");
    await fs.writeFile(driver, await fs.readFile(fileURLToPath(new URL(this.language === "r" ? "./r-notebook-driver.R" : "./jupyter-driver.py", import.meta.url))));
    if (this.stopped) { await this.cleanup(); throw new VaultError(499, "Notebook stopped"); }
    const ready = this.wait("NOTDOWN_READY");
    // Register rejection immediately: a cancelled start must not be unhandled.
    ready.catch(() => {});
    const runtime = this.language === "r" ? { executable: await rscriptPath(settings.rscript), args: ["--vanilla", driver] } : await pythonRuntime(settings.python);
    if (this.language !== "r") runtime.args.push("-u", driver, this.language);
    if (this.stopped) throw new VaultError(499, "Notebook stopped");
    const child = this.process = spawn(runtime.executable, runtime.args, {
      cwd: directory, windowsHide: true, shell: false, detached: process.platform !== "win32",
      env: { ...runtimeEnvironment(settings),
        ...(this.language !== "r" ? { PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" } : {}),
      },
    });
    let lines = "";
    const collect = (data: string) => {
      this.logSize += Buffer.byteLength(data);
      this.log = (this.log + data).slice(-16000);
      if (this.logSize > limit) this.stop(new VaultError(413, "Notebook output exceeds 8 MB"));
    };
    child.stdout.setEncoding("utf8").on("data", (data: string) => {
      collect(data); lines += data;
      let end: number;
      while ((end = lines.indexOf("\n")) >= 0) {
        const line = lines.slice(0, end).trim(); lines = lines.slice(end + 1);
        if (this.pending && line === this.pending.marker) { const pending = this.pending; this.pending = undefined; pending.resolve(); }
      }
    });
    child.stderr.setEncoding("utf8").on("data", collect);
    child.stdin.on("error", () => this.stop(new VaultError(503, "Notebook input closed")));
    child.on("error", () => this.stop(new VaultError(503, this.language === "r" ? "Rscript could not start. Install R, rmarkdown and Pandoc." : "Python could not start. Set NOTDOWN_PYTHON and install jupyter_client.")));
    child.on("close", () => { this.stop(new VaultError(422, this.log || "Notebook stopped")); void this.cleanup(); });
    await ready;
  }
  async execute(command: object): Promise<NotebookReply> {
    clearTimeout(this.idle);
    if (this.stopped || !this.process || !this.directory) throw new VaultError(499, "Notebook stopped");
    const id = ++this.serial;
    this.log = ""; this.logSize = 0;
    const reply = this.wait(`NOTDOWN_REPLY:${id}`);
    this.process.stdin.write(JSON.stringify({ ...command, id }) + "\n");
    await reply;
    const filename = path.join(this.directory, `reply-${id}.json`);
    if ((await fs.stat(filename)).size > limit) throw new VaultError(413, "Notebook output exceeds 8 MB");
    const result = JSON.parse(await fs.readFile(filename, "utf8"));
    await fs.unlink(filename);
    return { outputs: [], ...result };
  }
  rest() { if (!this.stopped) this.idle = setTimeout(() => this.stop(), 15 * 60_000).unref(); }
  stop(error = new VaultError(499, "Notebook execution stopped; notebook session reset.")) {
    if (this.stopped) return;
    this.stopped = true; clearTimeout(this.idle);
    this.pending?.reject(error); this.pending = undefined;
    this.onStop();
    const child = this.process;
    if (child?.pid) {
      if (process.platform === "win32") {
        const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
        killer.on("error", () => child.kill());
      } else { try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); } }
    } else void this.cleanup();
  }
  private async cleanup() {
    const directory = this.directory;
    if (directory && path.dirname(directory) === os.tmpdir() && path.basename(directory).startsWith("notdown-r-notebook-"))
      await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}
