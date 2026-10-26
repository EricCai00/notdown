import { app, BrowserWindow, dialog, ipcMain, Menu, session, shell, type IpcMainInvokeEvent } from "electron";
import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Server } from "node:http";
import { createApp } from "../../server/app.js";
import { createManagedVaultFolder, listManagedVaults, loadLocalEnv, resolveVaultLocation } from "../../server/vault-location.js";

const directory = path.dirname(fileURLToPath(import.meta.url));
const welcomeURL = pathToFileURL(path.join(directory, "welcome.html")).href;
const preload = path.join(directory, "preload.cjs");
type VaultWindow = { origin: string; server: Server; windows: Set<BrowserWindow>; primary: BrowserWindow };
const vaults = new Map<string, VaultWindow>();
const launchers = new Set<BrowserWindow>();
const pendingCloses = new Map<number, { id: string; timer: NodeJS.Timeout }>();
const allowedCloses = new Set<number>();
let recentsQueue = Promise.resolve();
let openingQueue = Promise.resolve();
app.setName("Notdown");
// Test invocations use a separate profile; packaged user launches always use Electron's normal profile.
if (!app.isPackaged && process.env.NOTDOWN_DESKTOP_PROFILE) app.setPath("userData", path.resolve(process.env.NOTDOWN_DESKTOP_PROFILE));
if (!app.isPackaged && !process.env.NOTDOWN_DESKTOP_PROFILE) loadLocalEnv();
const dataPath = resolveVaultLocation(!app.isPackaged && process.env.NOTDOWN_DESKTOP_PROFILE
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
async function recents(): Promise<string[]> {
  try {
    const data = JSON.parse(await fs.readFile(settingsPath(), "utf8"));
    return Array.isArray(data) ? data.filter((item): item is string => typeof item === "string" && path.isAbsolute(item)).slice(0, 10) : [];
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") console.warn("Recent vaults could not be read", error); return []; }
}
function remember(root: string) {
  recentsQueue = recentsQueue.catch(() => {}).then(async () => {
    const recent = [root, ...(await recents()).filter(p => p !== root)].slice(0, 10);
    await fs.mkdir(app.getPath("userData"), { recursive: true });
    const temp = `${settingsPath()}.tmp`;
    await fs.writeFile(temp, JSON.stringify(recent, null, 2));
    await fs.rename(temp, settingsPath());
  });
  return recentsQueue;
}
function configureWindow(window: BrowserWindow, origin?: string) {
  window.webContents.on("will-navigate", (event, url) => {
    if (origin && new URL(url).origin === origin) return;
    event.preventDefault();
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (origin && new URL(url).origin === origin) {
      const vault = [...vaults.values()].find(v => v.origin === origin);
      if (vault) {
        const child = new BrowserWindow({ width: 1200, height: 850, show: !process.env.NOTDOWN_DESKTOP_HEADLESS, webPreferences: { session: window.webContents.session, contextIsolation: true, sandbox: true, nodeIntegration: false } });
        vault.windows.add(child);
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
  const window = new BrowserWindow({ width: 760, height: 820, minWidth: 540, minHeight: 650, title: "Notdown", icon: path.join(directory, "icon.png"), show: !process.env.NOTDOWN_DESKTOP_HEADLESS, webPreferences: { preload, contextIsolation: true, sandbox: true, nodeIntegration: false } });
  launchers.add(window);
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
  if (existing && !existing.primary.isDestroyed()) { existing.primary.show(); existing.primary.focus(); return; }
  if (existing) throw new Error("Close the other windows for this vault before reopening it.");
  const names = await fs.readdir(root);
  if (create && names.length) throw new Error("Create a vault in an empty folder. Import existing Markdown after opening the new vault.");
  if (!create && !names.includes("pages")) throw new Error("This is not a Notdown vault. Create a new vault, then use Import Markdown folder to copy these notes.");
  const token = randomUUID();
  const web = createApp({ vaultPath: root, frontendDir: path.join(directory, "frontend"), allowedOrigins: [], accessToken: token, openFile: async filename => { const error = await shell.openPath(filename); if (error) throw new Error(error); }, recycleFile: filename => shell.trashItem(filename) });
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
  const window = new BrowserWindow({ width: 1440, height: 950, minWidth: 700, minHeight: 540, title: `Notdown — ${path.basename(root)}`, icon: path.join(directory, "icon.png"), show: !process.env.NOTDOWN_DESKTOP_HEADLESS, webPreferences: { preload, session: vaultSession, contextIsolation: true, sandbox: true, nodeIntegration: false } });
  const vault = { origin, server, windows: new Set([window]), primary: window };
  vaults.set(root, vault);
  configureWindow(window, origin);
  window.on("close", event => {
    if (allowedCloses.has(window.id)) return;
    event.preventDefault();
    if (pendingCloses.has(window.id)) return;
    const id = randomUUID();
    const timer = setTimeout(() => {
      pendingCloses.delete(window.id);
      if (!window.isDestroyed()) void dialog.showMessageBox(window, { type: "warning", message: "The editor has not confirmed that your changes are saved.", detail: "The window will stay open. Wait for the editor or resolve the save error before closing.", buttons: ["Keep open"] });
    }, 15_000);
    pendingCloses.set(window.id, { id, timer });
    window.webContents.send("vault:save-before-close", id);
  });
  window.on("closed", () => { const pending = pendingCloses.get(window.id); if (pending) clearTimeout(pending.timer); pendingCloses.delete(window.id); allowedCloses.delete(window.id); releaseWindow(vault, window); });
  await window.loadURL(origin);
  await remember(root).catch(error => console.warn("Recent vault not saved", error));
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => showWelcome());
  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", event => {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length) { event.preventDefault(); for (const window of windows) window.close(); }
  });
  void app.whenReady().then(async () => {
    Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: "File", submenu: [{ label: "Open vault…", click: () => showWelcome() }, { role: "close" }, { role: "quit" }] }, { role: "editMenu" }, { label: "View", submenu: [{ role: "zoomIn" }, { role: "zoomOut" }, { role: "resetZoom" }, { role: "togglefullscreen" }] }]));
    ipcMain.handle("vault:welcome", event => { trusted(event); showWelcome(); });
    ipcMain.handle("vault:recents", event => { trusted(event, true); return recents(); });
    ipcMain.handle("vault:managed", async event => { trusted(event, true); return { dataPath, vaults: await listManagedVaults(dataPath) }; });
    ipcMain.handle("vault:create-managed", async (event, name: unknown) => {
      const owner = trusted(event, true);
      if (typeof name !== "string") throw new Error("Enter a vault name.");
      const selected = await createManagedVaultFolder(dataPath, name);
      await openVault(selected, true); owner.close();
    });
    ipcMain.handle("vault:open-managed", async (event, selected: unknown) => {
      const owner = trusted(event, true);
      if (typeof selected !== "string" || !(await listManagedVaults(dataPath)).some(vault => vault.path === selected)) throw new Error("Choose an existing vault.");
      await openVault(selected, false); owner.close();
    });
    ipcMain.handle("vault:choose", async (event, mode: unknown) => {
      const owner = trusted(event, true);
      if (mode !== "open" && mode !== "create") throw new Error("Invalid folder action");
      const result = await dialog.showOpenDialog(owner, { title: mode === "create" ? "Choose an empty folder for your new vault" : "Open a Notdown vault", properties: ["openDirectory", "createDirectory"] });
      if (result.canceled || !result.filePaths[0]) return;
      await openVault(result.filePaths[0], mode === "create");
      owner.close();
    });
    ipcMain.handle("vault:recent", async (event, selected: unknown) => {
      const owner = trusted(event, true);
      if (typeof selected !== "string" || !(await recents()).includes(selected)) throw new Error("Choose a folder using Open vault");
      await openVault(selected, false); owner.close();
    });
    ipcMain.on("vault:close-result", (event, id: unknown, saved: unknown) => {
      let owner: BrowserWindow;
      try { owner = trusted(event); } catch { return; }
      const pending = pendingCloses.get(owner.id);
      if (!pending || pending.id !== id) return;
      clearTimeout(pending.timer); pendingCloses.delete(owner.id);
      if (saved === true) { allowedCloses.add(owner.id); owner.close(); }
    });
    const argument = process.argv.find(arg => arg.startsWith("--vault="));
    if (argument) {
      try { await openVault(path.resolve(argument.slice(8)), false); }
      catch (error) { showWelcome(); void dialog.showErrorBox("Unable to open vault", String(error)); }
    } else showWelcome();
  }).catch(error => { console.error(error); app.exit(1); });
}
