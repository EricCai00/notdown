import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { randomUUID } from "node:crypto";
import { VaultError, assertId, type createVault } from "../src/vault/vault.js";
import type { HistoryEntry, HistoryRecord } from "../src/vault/history.js";

type Vault = ReturnType<typeof createVault>;
const run = promisify(execFile);
const gitNull = process.platform === "win32" ? "NUL" : os.devNull;
const config = "[core]\n\trepositoryformatversion = 0\n\tfilemode = false\n\tbare = true\n\tlogallrefupdates = true\n";
const queues = new Map<string, Promise<unknown>>();
// '%' cannot occur in a page ID, so escaped Windows device names cannot collide with another ID.
const projectionName = (id: string) => /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i.test(id) ? `%${Buffer.from(id).toString("hex")}` : id;
const gitEnvironment = () => ({ ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_/i.test(key))), GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: gitNull, GIT_TERMINAL_PROMPT: "0" });

/** An owned, local-only Git repository containing a projection of text and page metadata. */
export function createGitHistory(vault: Vault, executable = "git") {
  const directory = path.join(vault.vaultPath, ".notdown"), repository = path.join(directory, "git-history.git");
  const marker = path.join(repository, "notdown-history.json"), lock = path.join(directory, "git-history.lock");
  let timer: ReturnType<typeof setInterval> | undefined, idle: ReturnType<typeof setTimeout> | undefined;
  let enabled = false, closed = false, intervalMinutes = 5, idleSeconds = 120, error: string | undefined;
  let availability: { available: boolean; version?: string } | undefined;
  async function available() {
    if (!availability) {
      try { availability = { available: true, version: (await run(executable, ["--version"], { env: gitEnvironment(), windowsHide: true, timeout: 5000 })).stdout.trim() }; }
      catch { availability = { available: false }; }
    }
    return availability;
  }
  async function realFolder(folder: string, create = false) {
    if (create) await fs.mkdir(folder, { recursive: true });
    const stat = await fs.lstat(folder);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new VaultError(422, "Git history requires real storage directories");
  }
  async function git(args: string[], cwd?: string, accepted: number[] = []) {
    try {
      return (await run(executable, ["--literal-pathspecs", "-c", `core.hooksPath=${gitNull}`, "-c", "core.fsmonitor=false", "-c", "commit.gpgSign=false",
        "-c", "core.autocrlf=false", "-c", "user.name=Notdown", "-c", "user.email=history@notdown.local", `--git-dir=${repository}`,
        ...(cwd ? [`--work-tree=${cwd}`] : []), ...args], { cwd: cwd ?? vault.vaultPath, env: gitEnvironment(), windowsHide: true, timeout: 60_000, maxBuffer: 24 * 1024 * 1024 })).stdout;
    } catch (cause) {
      if (accepted.includes((cause as { code: number }).code)) return null;
      throw new VaultError(503, "The local Git history operation failed. Your saved notes and existing history were preserved.");
    }
  }
  async function ownedRepository(create: boolean) {
    await realFolder(vault.vaultPath);
    await realFolder(directory, create);
    const stat = await fs.lstat(repository).catch((e: NodeJS.ErrnoException) => { if (e.code === "ENOENT") return null; throw e; });
    if (!stat) {
      if (!create) return false;
      if (!(await available()).available) throw new VaultError(503, "Git is not installed or could not start. Install Git to enable local Git history.");
      await fs.mkdir(repository);
      // An incomplete initialization remains identifiable without adopting a foreign repository.
      await fs.writeFile(marker, JSON.stringify({ version: 1, purpose: "notdown-text-history" }), { flag: "wx" });
      await run(executable, ["-c", `core.hooksPath=${gitNull}`, "init", "--bare", "--initial-branch=history", "--template=", repository],
        { env: gitEnvironment(), windowsHide: true, timeout: 10_000 });
      await fs.writeFile(path.join(repository, "config"), config);
    } else if (!stat.isDirectory() || stat.isSymbolicLink()) throw new VaultError(422, "Invalid Git history directory");
    const ownerStat = await fs.lstat(marker).catch(() => null);
    if (!ownerStat?.isFile() || ownerStat.isSymbolicLink() || await fs.readFile(marker, "utf8") !== JSON.stringify({ version: 1, purpose: "notdown-text-history" }))
      throw new VaultError(422, "This Git history repository is not managed by Notdown; it was left unchanged");
    const configFile = path.join(repository, "config"), configStat = await fs.lstat(configFile).catch(() => null);
    if (!configStat?.isFile() || configStat.isSymbolicLink() || await fs.readFile(configFile, "utf8") !== config)
      throw new VaultError(422, "The managed Git configuration changed; it was preserved and will not be executed");
    for (const folder of [path.join(repository, "objects"), path.join(repository, "refs")]) await realFolder(folder);
    if (await fs.lstat(path.join(repository, "objects", "info", "alternates")).catch(() => null))
      throw new VaultError(422, "External Git object stores are not supported for managed history");
    return true;
  }
  async function locked<T>(operation: () => Promise<T>) {
    await realFolder(directory, true);
    const token = JSON.stringify({ pid: process.pid, token: randomUUID() });
    for (let attempt = 0; ; attempt++) {
      try { await fs.writeFile(lock, token, { flag: "wx", mode: 0o600 }); break; }
      catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
        const stat = await fs.lstat(lock);
        if (!stat.isFile() || stat.isSymbolicLink()) throw new VaultError(422, "Invalid Git history lock");
        const owner = await fs.readFile(lock, "utf8");
        try {
          const pid = JSON.parse(owner).pid;
          if (Number.isInteger(pid) && pid > 0) {
            try { process.kill(pid, 0); }
            catch (e) { if ((e as NodeJS.ErrnoException).code === "ESRCH" && await fs.readFile(lock, "utf8") === owner) { await fs.rm(lock); continue; } }
          }
        } catch { /* An incomplete or unknown lock remains protected. */ }
        if (attempt >= 80) throw new VaultError(503, "Git history is busy in another process. Your notes remain saved.");
        await delay(50);
      }
    }
    try { return await operation(); }
    finally { if (await fs.readFile(lock, "utf8").catch(() => "") === token) await fs.rm(lock); }
  }
  async function checkpoint(message = "Automatic checkpoint") {
    if (typeof message !== "string" || !message.trim() || message.length > 160 || /[\r\n\0]/.test(message)) throw new VaultError(400, "Use a checkpoint name of 1–160 characters");
    const task = (queues.get(repository) ?? Promise.resolve()).catch(() => {}).then(async () => {
      const state = await vault.history.getSettings();
      if (!state.settings.gitEnabled) throw new VaultError(400, "Enable local Git history first");
      return locked(async () => {
        await ownedRepository(true);
        const captured = await vault.captureHistory();
        const scratch = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-git-history-"));
        try {
          await fs.mkdir(path.join(scratch, "pages")); await fs.mkdir(path.join(scratch, "page-metadata")); await fs.mkdir(path.join(scratch, "people"));
          let bytes = 0;
          const writeText = async (file: string, source: string) => {
            bytes += Buffer.byteLength(source);
            if (bytes > 64 * 1024 * 1024) throw new VaultError(413, "The text history checkpoint exceeds 64 MB");
            await fs.writeFile(file, source);
          };
          for (const page of captured.pages) {
            assertId(page.id);
            const name = projectionName(page.id);
            await writeText(path.join(scratch, "pages", `${name}.md`), page.source);
            await writeText(path.join(scratch, "page-metadata", `${name}.json`), JSON.stringify(page.metadata, null, 2));
          }
          await writeText(path.join(scratch, "vault-metadata.json"), JSON.stringify(captured.metadata, null, 2));
          for (const person of captured.people) await writeText(path.join(scratch, "people", person.name), person.source);
          const previous = await git(["rev-parse", "--verify", "HEAD"], undefined, [128]);
          await git(["add", "--all", "--", "."], scratch);
          const clean = await git(["diff", "--cached", "--quiet", "--no-ext-diff", "--no-textconv"], scratch, [1]);
          if (previous && clean !== null) { error = undefined; return { created: false, id: previous.trim() }; }
          await git(["commit", "--no-verify", "-m", message.trim()], scratch);
          if (!previous) await git(["repack", "-ad"]);
          else await git(["gc", "--auto"]);
          error = undefined;
          return { created: true, id: (await git(["rev-parse", "HEAD"]))!.trim() };
        } finally {
          const resolved = path.resolve(scratch);
          if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith("notdown-git-history-")) throw new Error("Unsafe Git scratch cleanup");
          await fs.rm(resolved, { recursive: true, force: true });
        }
      });
    });
    const tail = task.catch(() => {}); queues.set(repository, tail);
    void tail.then(() => { if (queues.get(repository) === tail) queues.delete(repository); });
    return task.catch(cause => { error = cause instanceof Error ? cause.message : "Git history failed"; throw cause; });
  }
  const background = (message: string) => { void checkpoint(message).catch(cause => { error = cause instanceof Error ? cause.message : "Git history failed"; }); };
  async function start(captureOnOpen = true) {
    const { settings } = await vault.history.getSettings();
    enabled = settings.gitEnabled; intervalMinutes = settings.intervalMinutes; idleSeconds = settings.idleSeconds;
    clearInterval(timer); clearTimeout(idle);
    if (enabled && !closed) {
      timer = setInterval(() => background("Automatic checkpoint"), intervalMinutes * 60_000); timer.unref();
      // Also captures changes made while the application was closed.
      if (captureOnOpen) background("Vault opened");
    }
  }
  return {
    start, checkpoint,
    changed() {
      if (!enabled || closed) return;
      clearTimeout(idle); idle = setTimeout(() => background("Editing paused"), idleSeconds * 1000); idle.unref();
    },
    async status() {
      const state = await vault.history.getSettings(), support = await available();
      let latest: string | undefined;
      if (await fs.lstat(repository).catch(() => null)) {
        try { if (await ownedRepository(false)) latest = (await git(["rev-parse", "--verify", "HEAD"], undefined, [128]))?.trim(); }
        catch (cause) { error = cause instanceof Error ? cause.message : "Git history could not be read"; }
      }
      return { ...state, ...support, repository: state.settings.gitEnabled ? repository : undefined, latest, error, localOnly: true };
    },
    async configure(input: unknown) {
      if ((input as { settings?: { gitEnabled?: boolean } })?.settings?.gitEnabled && !(await available()).available)
        throw new VaultError(503, "Git is not installed or could not start. Install Git to enable local Git history.");
      await vault.history.configure(input);
      await start(false);
      if (enabled) await checkpoint("History settings changed");
      return this.status();
    },
    async list(id: string): Promise<HistoryEntry[]> {
      assertId(id);
      if (!await fs.lstat(repository).catch(() => null)) return [];
      try {
        await ownedRepository(false);
        const name = projectionName(id);
        const text = await git(["log", "-100", "--format=%H%x09%cI%x09%s", "HEAD", "--", `pages/${name}.md`, `page-metadata/${name}.json`], undefined, [128]);
        return (text?.trim() ? text.trim().split("\n") : []).map(line => {
          const [revision, createdAt, ...message] = line.split("\t");
          return { id: revision, createdAt, kind: "git", message: message.join("\t"), protected: true };
        });
      } catch (cause) { error = cause instanceof Error ? cause.message : "Git history could not be read"; return []; }
    },
    async read(id: string, revision: string): Promise<HistoryRecord> {
      assertId(id);
      if (!/^[a-f0-9]{40}$/.test(revision)) throw new VaultError(400, "Invalid Git version");
      await ownedRepository(false);
      const name = projectionName(id);
      const source = await git(["show", `${revision}:pages/${name}.md`], undefined, [128]);
      const metadata = await git(["show", `${revision}:page-metadata/${name}.json`], undefined, [128]);
      if (source === null || metadata === null) throw new VaultError(404, "This page is not present in the selected Git version");
      return { source, metadata: JSON.parse(metadata) };
    },
    async close() {
      if (closed) return;
      closed = true; clearInterval(timer); clearTimeout(idle);
      if (enabled) await checkpoint("Vault closed").catch(cause => { error = String(cause); });
    },
  };
}
