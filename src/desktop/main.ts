import { locationSettingsPath, saveVaultLocation, savedCreateLocation, saveCreateLocation } from "../../server/vault-location-settings.js";
import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeTheme, safeStorage, session, shell, type BrowserWindowConstructorOptions, type IpcMainInvokeEvent } from "electron";
import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Server } from "node:http";
import { createApp } from "../../server/app.js";
import { createManagedVaultFolder, listManagedVaults, loadLocalEnv, resolveVaultLocation } from "../../server/vault-location.js";
import { DesktopLifecycle } from "./lifecycle.js";
import { createUILanguageStore } from "./ui-language.js";
import { readNotionClipboard } from "./notion-clipboard.js";

const directory = path.dirname(fileURLToPath(import.meta.url));
const welcomeURL = pathToFileURL(path.join(directory, "welcome.html")).href;
const preload = path.join(directory, "preload.cjs");
// The app uses a light palette; native caption hover colors must match it even on dark Windows themes.
nativeTheme.themeSource = "light";
const integratedTitleBar: BrowserWindowConstructorOptions = {
  titleBarStyle: "hidden", titleBarOverlay: { color: "#f7f7f5", symbolColor: "#66645f", height: 36 },
};
type VaultWindow = { origin: string; server: Server; windows: Set<BrowserWindow>; primary: BrowserWindow };
const vaults = new Map<string, VaultWindow>();
const launchers = new Set<BrowserWindow>();
const pendingCloses = new Map<number, { id: string; timer: NodeJS.Timeout; promise: Promise<boolean>; resolve(saved: boolean): void }>();
export let desktopLifecycle: DesktopLifecycle;
let startup: Promise<void>;
let recentsQueue = Promise.resolve();
let notionTokenQueue = Promise.resolve();
let openingQueue = Promise.resolve();
app.setName("Notdown");
// Test invocations use a separate profile; packaged user launches always use Electron's normal profile.
if (!app.isPackaged && process.env.NOTDOWN_DESKTOP_PROFILE) app.setPath("userData", path.resolve(process.env.NOTDOWN_DESKTOP_PROFILE));
if (!app.isPackaged && !process.env.NOTDOWN_DESKTOP_PROFILE) loadLocalEnv();
let dataPath = resolveVaultLocation(!app.isPackaged && process.env.NOTDOWN_DESKTOP_PROFILE
  ? { ...process.env, NOTDOWN_DATA_PATH: path.join(process.env.NOTDOWN_DESKTOP_PROFILE, "vault-data"), VAULT_PATH: undefined }
  : process.env).dataPath;

function trusted(event: IpcMainInvokeEvent | Electron.IpcMainEvent, welcomeOnly = false) {
  const frame = event.senderFrame;
  if (!frame || frame !== event.sender.mainFrame) throw new Error("Main window required");
  const owner = BrowserWindow.fromWebContents(event.sender);
  if (owner && launchers.has(owner) && frame.url === welcomeURL) return owner;
  if (!welcomeOnly && owner && [...vaults.values()].some(v => v.primary === owner && new URL(frame.url).origin === v.origin)) return owner;
  throw new Error("Untrusted desktop request");
}
const settingsPath = () => path.join(app.getPath("userData"), "vaults.json");
const uiLanguageStore = createUILanguageStore(() => path.join(app.getPath("userData"), "interface-language.json"));
const notionTokenPath = () => path.join(app.getPath("userData"), "notion-import-token.bin");
function requireTokenEncryption() {
  if (!safeStorage.isEncryptionAvailable() || process.platform === "linux" && safeStorage.getSelectedStorageBackend() === "basic_text")
    throw new Error("Encrypted token storage is unavailable on this device.");
}
async function readNotionToken() {
  await notionTokenQueue.catch(() => {});
  let encrypted: Buffer;
  try { encrypted = await fs.readFile(notionTokenPath()); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return ""; throw new Error("The saved Notion token could not be read."); }
  requireTokenEncryption();
  try { return safeStorage.decryptString(encrypted); }
  catch { throw new Error("The saved Notion token could not be decrypted."); }
}
function writeNotionToken(input: unknown) {
  if (typeof input !== "string" || input.length > 4000 || /[\r\n\0]/.test(input))
    throw new Error("Invalid Notion integration token.");
  const token = input.trim();
  notionTokenQueue = notionTokenQueue.catch(() => {}).then(async () => {
    const filename = notionTokenPath();
    if (!token) { await fs.rm(filename, { force: true }); return; }
    requireTokenEncryption();
    const encrypted = safeStorage.encryptString(token);
    await fs.mkdir(path.dirname(filename), { recursive: true });
    const temporary = `${filename}.tmp`;
    await fs.writeFile(temporary, encrypted, { mode: 0o600 });
    await fs.rename(temporary, filename);
  });
  return notionTokenQueue;
}
async function recents(): Promise<string[]> {
  try {
    const data = JSON.parse(await fs.readFile(settingsPath(), "utf8"));
    return Array.isArray(data) ? data.filter((item): item is string => typeof item === "string" && path.isAbsolute(item)).slice(0, 1000) : [];
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") console.warn("Recent vaults could not be read", error); return []; }
}
function remember(root: string) {
  recentsQueue = recentsQueue.catch(() => {}).then(async () => {
    const recent = [root, ...(await recents()).filter(p => p !== root)].slice(0, 1000);
    await fs.mkdir(app.getPath("userData"), { recursive: true });
    const temp = `${settingsPath()}.tmp`;
    await fs.writeFile(temp, JSON.stringify(recent, null, 2));
    await fs.rename(temp, settingsPath());
  });
  return recentsQueue;
}
function configureWindow(window: BrowserWindow, origin?: string) {
  window.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    if (input.key === "F11") { event.preventDefault(); window.setFullScreen(!window.isFullScreen()); }
    else if ((input.control || input.meta) && !input.alt && ["+", "=", "-", "0"].includes(input.key)) {
      event.preventDefault();
      const level = window.webContents.getZoomLevel();
      window.webContents.setZoomLevel(input.key === "0" ? 0 : Math.max(-3, Math.min(3, level + (input.key === "-" ? -0.5 : 0.5))));
    }
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (origin && new URL(url).origin === origin) return;
    event.preventDefault();
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (origin && new URL(url).origin === origin) {
      const destination = new URL(url);
      if (destination.pathname === "/" && /^(?:#page\/|#vault\/|#database\/|#databases$)/.test(destination.hash)) {
        window.webContents.send("vault:open-tab", url);
        return { action: "deny" };
      }
      const vault = [...vaults.values()].find(v => v.origin === origin);
      if (vault) {
        const child = new BrowserWindow({ width: 1200, height: 850, show: !process.env.NOTDOWN_DESKTOP_HEADLESS, webPreferences: { session: window.webContents.session, contextIsolation: true, sandbox: true, nodeIntegration: false } });
        vault.windows.add(child);
        desktopLifecycle.track(child, false);
        child.on("closed", () => releaseWindow(vault, child));
        configureWindow(child, origin);
        void child.loadURL(url);
      }
    } else if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-attach-webview", event => event.preventDefault());
}
function releaseWindow(vault: VaultWindow, window: BrowserWindow) {
  vault.windows.delete(window);
  if (!vault.windows.size) {
    vault.server.closeAllConnections();
    vault.server.close();
    for (const [root, current] of vaults) if (current === vault) vaults.delete(root);
  }
}
function showWelcome() {
  const existing = [...launchers].find(window => !window.isDestroyed());
  if (existing) { desktopLifecycle.show(existing); return existing; }
  const window = new BrowserWindow({ ...integratedTitleBar, width: 760, height: 820, minWidth: 540, minHeight: 650, title: "Notdown", icon: path.join(directory, "icon.png"), show: !process.env.NOTDOWN_DESKTOP_HEADLESS, webPreferences: { preload, contextIsolation: true, sandbox: true, nodeIntegration: false } });
  launchers.add(window);
  desktopLifecycle.track(window, false);
  window.on("closed", () => launchers.delete(window));
  configureWindow(window);
  void window.loadURL(welcomeURL);
  return window;
}
function openVault(selected: string, create: boolean) {
  const operation = openingQueue.then(() => openVaultNow(selected, create));
  openingQueue = operation.catch(() => {});
  return operation;
}
async function openVaultNow(selected: string, create: boolean) {
  const stat = await fs.lstat(selected);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Choose a real folder, not a file or shortcut.");
  const root = await fs.realpath(selected);
  const existing = vaults.get(root);
  if (existing && !existing.primary.isDestroyed()) { desktopLifecycle.show(existing.primary); return; }
  if (existing) throw new Error("Close the other windows for this vault before reopening it.");
  const names = await fs.readdir(root);
  if (create && names.length) throw new Error("Create a vault in an empty folder. Import existing Markdown after opening the new vault.");
  if (!create && !names.includes("pages")) throw new Error("This is not a Notdown vault. Create a new vault, then use Import Markdown folder to copy these notes.");
  const token = randomUUID();
  const web = createApp({ vaultPath: root, frontendDir: path.join(directory, "frontend"), allowedOrigins: [], accessToken: token, bookmarkProxyResolver: url => session.defaultSession.resolveProxy(url), openFile: async filename => { const error = await shell.openPath(filename); if (error) throw new Error(error); }, recycleFile: filename => shell.trashItem(filename) });
  await web.locals.vault.list();
  const server = await new Promise<Server>((resolve, reject) => { const active = web.listen(0, "127.0.0.1", () => resolve(active)); active.once("error", reject); });
  server.once("close", () => web.locals.closeRNotebook());
  const address = server.address();
  if (!address || typeof address === "string") { server.close(); throw new Error("Unable to start the vault service"); }
  const origin = `http://127.0.0.1:${address.port}`;
  const partition = `persist:vault-${createHash("sha256").update(root).digest("hex").slice(0, 24)}`;
  const vaultSession = session.fromPartition(partition);
  vaultSession.setPermissionRequestHandler((_contents, permission, callback, details) => callback(details.requestingUrl.startsWith(`${origin}/`) && permission === "clipboard-sanitized-write"));
  vaultSession.setPermissionCheckHandler((_contents, permission, requestingOrigin) => requestingOrigin === origin && permission === "clipboard-sanitized-write");
  vaultSession.webRequest.onBeforeSendHeaders({ urls: [`${origin}/*`] }, (details, callback) => callback({ requestHeaders: { ...details.requestHeaders, "X-Notdown-Desktop": token } }));
  const window = new BrowserWindow({ ...integratedTitleBar, width: 1440, height: 950, minWidth: 700, minHeight: 540, title: "Notdown", icon: path.join(directory, "icon.png"), show: !process.env.NOTDOWN_DESKTOP_HEADLESS, webPreferences: { preload, session: vaultSession, contextIsolation: true, sandbox: true, nodeIntegration: false } });
  const vault = { origin, server, windows: new Set([window]), primary: window };
  vaults.set(root, vault);
  configureWindow(window, origin);
  desktopLifecycle.track(window, true);
  const windowId = window.id;
  window.on("closed", () => { finishSave(windowId, false); releaseWindow(vault, window); });
  await window.loadURL(origin);
  await remember(root).catch(error => console.warn("Recent vault not saved", error));
}

function finishSave(windowId: number, saved: boolean) {
  const pending = pendingCloses.get(windowId);
  if (!pending) return;
  clearTimeout(pending.timer); pendingCloses.delete(windowId); pending.resolve(saved);
}

function requestSave(window: BrowserWindow): Promise<boolean> {
  if (window.isDestroyed()) return Promise.resolve(false);
  const pending = pendingCloses.get(window.id);
  if (pending) return pending.promise;
  const windowId = window.id, id = randomUUID();
  let resolve!: (saved: boolean) => void;
  const promise = new Promise<boolean>(done => { resolve = done; });
  const timer = setTimeout(() => {
    finishSave(windowId, false);
    if (!window.isDestroyed()) {
      desktopLifecycle.show(window);
      void dialog.showMessageBox(window, { type: "warning", message: "The editor has not confirmed that your changes are saved.", detail: "The window will stay open. Wait for the editor or resolve the save error before closing.", buttons: ["Keep open"] });
    }
  }, 15_000);
  pendingCloses.set(windowId, { id, timer, promise, resolve });
  window.webContents.send("vault:save-before-close", id);
  return promise;
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => { void startup.then(() => desktopLifecycle.restore()); });
  // The tray keeps the single process available even if all windows are destroyed.
  app.on("window-all-closed", () => {});
  startup = app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    desktopLifecycle = new DesktopLifecycle({ icon: path.join(directory, "icon.png"),
      saveTargets: () => [...vaults.values()].map(vault => vault.primary), save: requestSave, welcome: showWelcome,
      setQuitting: active => {
        for (const { primary } of vaults.values()) {
          if (!primary.isDestroyed() && !primary.webContents.isDestroyed()) primary.webContents.send("vault:quit-state", active);
        }
      } });
    ipcMain.handle("app:quit", event => { trusted(event); void desktopLifecycle.requestQuit(); });
    ipcMain.handle("ui:language:get", event => { trusted(event); return uiLanguageStore.get(); });
    ipcMain.handle("ui:language:set", async (event, value: unknown) => {
      trusted(event); await uiLanguageStore.set(value);
      for (const { primary } of vaults.values()) if (!primary.isDestroyed()) primary.webContents.send("ui:language:changed", value);
    });
    ipcMain.handle("notion:token:get", event => { trusted(event); return readNotionToken(); });
    ipcMain.handle("notion:clipboard:get", async event => { trusted(event); return readNotionClipboard(await clipboard.read()); });
    ipcMain.handle("notion:token:set", (event, token: unknown) => { trusted(event); return writeNotionToken(token); });
    ipcMain.handle("vault:welcome", event => { trusted(event); showWelcome(); });
    ipcMain.handle("vault:recents", event => { trusted(event, true); return recents(); });
    ipcMain.handle("vault:managed", async event => {
      trusted(event, true);
      const entries = new Map<string, { name: string; path: string }>();
      for (const selected of [...(await recents()), ...(await listManagedVaults(dataPath)).map(v => v.path)]) {
        const root = await fs.realpath(selected).catch(() => selected);
        entries.set(process.platform === "win32" ? root.toLowerCase() : root, { name: path.basename(root), path: root });
      }
      return { dataPath, createLocation: savedCreateLocation(locationSettingsPath()), vaults: [...entries.values()] };
    });
    ipcMain.handle("vault:location", async (event, input: unknown) => {
      trusted(event, true);
      for (const entry of await listManagedVaults(dataPath)) await remember(entry.path);
      dataPath = await saveVaultLocation(locationSettingsPath(), input);
    });
    ipcMain.handle("vault:create-location", (event, input: unknown) => { trusted(event, true); return saveCreateLocation(locationSettingsPath(), input); });
    ipcMain.handle("vault:browse", async (event, input: unknown) => {
      const owner = trusted(event, true);
      const result = await dialog.showOpenDialog(owner, { defaultPath: typeof input === "string" && path.isAbsolute(input) ? input : undefined, properties: ["openDirectory", "createDirectory"] });
      return result.canceled ? null : result.filePaths[0] || null;
    });
    ipcMain.handle("vault:submit", async (event, input: { mode?: unknown; name?: unknown; path?: unknown }) => {
      const owner = trusted(event, true);
      if (!input || !["create", "open"].includes(String(input.mode))) throw new Error("Invalid vault action");
      let selected: string;
      if (input.mode === "create") {
        if (typeof input.name !== "string" || input.path && (typeof input.path !== "string" || !path.isAbsolute(input.path))) throw new Error("Invalid vault location");
        selected = await createManagedVaultFolder(typeof input.path === "string" && input.path ? input.path : dataPath, input.name);
      } else {
        if (typeof input.path !== "string" || !path.isAbsolute(input.path)) throw new Error("Choose an absolute folder path.");
        selected = input.path;
      }
      await openVault(selected, input.mode === "create"); owner.destroy();
    });
    ipcMain.handle("vault:create-managed", async (event, name: unknown) => {
      const owner = trusted(event, true);
      if (typeof name !== "string") throw new Error("Enter a vault name.");
      const selected = await createManagedVaultFolder(dataPath, name);
      await openVault(selected, true); owner.destroy();
    });
    ipcMain.handle("vault:open-managed", async (event, selected: unknown) => {
      const owner = trusted(event, true);
      if (typeof selected !== "string" || !(await listManagedVaults(dataPath)).some(vault => vault.path === selected)) throw new Error("Choose an existing vault.");
      await openVault(selected, false); owner.destroy();
    });
    ipcMain.handle("vault:choose", async (event, mode: unknown) => {
      const owner = trusted(event, true);
      if (mode !== "open" && mode !== "create") throw new Error("Invalid folder action");
      const result = await dialog.showOpenDialog(owner, { title: mode === "create" ? "Choose an empty folder for your new vault" : "Open a Notdown vault", properties: ["openDirectory", "createDirectory"] });
      if (result.canceled || !result.filePaths[0]) return;
      await openVault(result.filePaths[0], mode === "create");
      owner.destroy();
    });
    ipcMain.handle("vault:recent", async (event, selected: unknown) => {
      const owner = trusted(event, true);
      if (typeof selected !== "string" || !(await recents()).includes(selected)) throw new Error("Choose a folder using Open vault");
      await openVault(selected, false); owner.destroy();
    });
    ipcMain.on("vault:close-result", (event, id: unknown, saved: unknown) => {
      let owner: BrowserWindow;
      try { owner = trusted(event); } catch { return; }
      const pending = pendingCloses.get(owner.id);
      if (!pending || pending.id !== id) return;
      finishSave(owner.id, saved === true);
    });
    const argument = process.argv.find(arg => arg.startsWith("--vault="));
    if (argument) {
      try { await openVault(path.resolve(argument.slice(8)), false); }
      catch (error) { showWelcome(); void dialog.showErrorBox("Unable to open vault", String(error)); }
    } else showWelcome();
  }).catch(error => { console.error(error); app.exit(1); });
}
