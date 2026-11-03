import { savedVaultLocation, saveVaultLocation } from "./vault-location-settings.js";
import express from "express";
import path from "node:path";
import { promises as fs } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { createApp } from "./app.js";
import { VaultError } from "./vault.js";
import { createManagedVaultFolder, listManagedVaults } from "./vault-location.js";
import { seedNewDefaultVault } from "./seed.js";

export type BrowserVaultEntry = { name: string; path: string; url: string };
export interface BrowserVaultManagement {
  list(): Promise<{ dataPath: string; vaults: BrowserVaultEntry[] }>;
  setLocation(input: unknown): Promise<void>;
  open(input: { mode?: unknown; name?: unknown; path?: unknown }): Promise<BrowserVaultEntry>;
}
type Options = Parameters<typeof createApp>[0] & { dataPath: string; seedDefault?: boolean; locationSettings?: string };

/** One createApp per canonical directory; default and already-open tabs never change vault. */
export async function createBrowserApp(options: Options) {
  const host = express();
  const apps = new Map<string, ReturnType<typeof createApp>>();
  const entries = new Map<string, BrowserVaultEntry>();
  const locationSettings = options.locationSettings || path.join(options.dataPath, ".vault-location.json");
  let dataPath = savedVaultLocation(locationSettings) || path.resolve(options.dataPath);
  const settings = path.join(path.dirname(locationSettings), ".browser-vaults.json");
  const identity = (root: string) => createHash("sha256").update(process.platform === "win32" ? root.toLowerCase() : root).digest("hex");
  const register = (root: string) => {
    const id = identity(root), entry = { name: path.basename(root), path: root, url: `/v/${id}/` };
    entries.set(id, entry); return { id, entry };
  };
  let queue = Promise.resolve();
  const serial = <T>(operation: () => Promise<T>) => {
    const next = queue.then(operation); queue = next.then(() => {}, () => {}); return next;
  };
  const canonical = async (selected: string) => {
    const stat = await fs.lstat(selected).catch(() => null);
    if (!stat?.isDirectory() || stat.isSymbolicLink()) throw new VaultError(400, "Choose an existing real folder, not a file or shortcut.");
    return fs.realpath(selected);
  };
  const persist = async () => {
    await fs.mkdir(path.dirname(settings), { recursive: true });
    const temporary = `${settings}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporary, JSON.stringify([...entries.values()].map(entry => entry.path)));
      await fs.rename(temporary, settings);
    } finally { await fs.unlink(temporary).catch(() => {}); }
  };
  const application = async (root: string) => {
    const { id, entry } = register(root);
    if (!apps.has(id)) {
      const app = createApp({ ...options, vaultPath: root, vaultManagement: management });
      try { await app.locals.vault.init(); }
      catch (error) { await app.locals.closeRNotebook(); throw error; }
      apps.set(id, app);
    }
    return { app: apps.get(id)!, entry };
  };
  const management: BrowserVaultManagement = {
    setLocation(input) { return serial(async () => {
      for (const entry of await listManagedVaults(dataPath)) register(await canonical(entry.path));
      await persist();
      dataPath = await saveVaultLocation(locationSettings, input);
    }); },
    async list() {
      for (const entry of await listManagedVaults(dataPath)) register(await canonical(entry.path));
      return { dataPath, vaults: [...entries.values()].sort((a, b) => a.name.localeCompare(b.name)) };
    },
    open(input) { return serial(async () => {
      if (!["create", "open"].includes(String(input.mode))) throw new VaultError(400, "Choose create or open.");
      if (input.path && (typeof input.path !== "string" || !path.isAbsolute(input.path))) throw new VaultError(400, "Enter an absolute folder path.");
      let selected: string;
      if (input.mode === "create" && (!input.path || typeof input.name === "string")) {
        if (typeof input.name !== "string") throw new VaultError(400, "Enter a vault name.");
        try { selected = await createManagedVaultFolder(typeof input.path === "string" ? input.path : dataPath, input.name); }
        catch (error) { throw new VaultError(400, (error as Error).message); }
      } else {
        if (typeof input.path !== "string" || !path.isAbsolute(input.path)) throw new VaultError(400, "Enter an absolute folder path on this computer.");
        selected = path.resolve(input.path);
        if (input.mode === "create") {
          // No recursive creation: a typo must not create an unexpected directory tree.
          await fs.mkdir(selected).catch(error => { if (error.code !== "EEXIST") throw error; });
        }
      }
      const root = await canonical(selected), names = await fs.readdir(root);
      if (input.mode === "create" && names.length) throw new VaultError(400, "Create a vault in an empty folder. Existing files are never overwritten.");
      const pages = await fs.lstat(path.join(root, "pages")).catch(() => null);
      if (input.mode === "open" && (!pages?.isDirectory() || pages.isSymbolicLink())) throw new VaultError(400, "This is not a Notdown vault. Choose the folder containing pages/.");
      const { entry } = await application(root);
      await persist(); return entry;
    }); },
  };
  const initialApp = createApp({ ...options, vaultManagement: management });
  await seedNewDefaultVault(initialApp.locals.vault, !!options.seedDefault);
  await initialApp.locals.vault.init();
  const root = await canonical(options.vaultPath);
  apps.set(register(root).id, initialApp);
  const initial = { app: initialApp };
  for (const registry of new Set([path.join(options.dataPath, ".browser-vaults.json"), settings])) try {
    const saved: unknown = JSON.parse(await fs.readFile(registry, "utf8"));
    if (Array.isArray(saved)) for (const item of saved.slice(-100)) {
      if (typeof item === "string" && path.isAbsolute(item)) {
        try { register(await canonical(item)); } catch { /* Keep unavailable folders off the list. */ }
      }
    }
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") console.warn("Browser vault list could not be read", error); }
  host.get(/^\/v\/([a-f0-9]{64})$/, (req, res) => res.redirect(308, `/v/${req.params[0]}/${req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : ""}`));
  host.use("/v/:id", (req, res, next) => {
    void serial(async () => {
      const id = String(req.params.id);
      if (!entries.has(id)) await management.list();
      const entry = entries.get(id);
      if (!entry) { res.status(404).json({ error: "Vault unavailable. Open it from the knowledge base manager." }); return; }
      const resolved = await canonical(entry.path).catch(() => null);
      if (!resolved || identity(resolved) !== id) { res.status(404).json({ error: "Vault folder is unavailable; it has not been recreated." }); return; }
      const pages = await fs.lstat(path.join(entry.path, "pages")).catch(() => null);
      if (!pages?.isDirectory() || pages.isSymbolicLink()) { res.status(404).json({ error: "Vault folder is unavailable; it has not been recreated." }); return; }
      return (await application(entry.path)).app;
    }).then(app => { if (app) app(req, res, next); }).catch(next);
  });
  host.use(initial.app);
  host.locals = initial.app.locals;
  const closeDefault = initial.app.locals.closeRNotebook;
  host.locals.closeRNotebook = () => Promise.all([...apps.values()].map(app => app === initial.app ? closeDefault() : app.locals.closeRNotebook()));
  return host;
}
