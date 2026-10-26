import { test, expect, _electron as electron, type ElectronApplication } from "@playwright/test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse } from "yaml";
import { spawn } from "node:child_process";

async function readNotes(vaultPath: string) {
  const files = await fs.readdir(path.join(vaultPath, "pages"));
  const index = JSON.parse(await fs.readFile(path.join(vaultPath, "metadata.json"), "utf8").catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return '{"pages":{}}'; throw error; }));
  return Promise.all(files.filter(name => name.endsWith(".md")).map(async name => {
    const source = await fs.readFile(path.join(vaultPath, "pages", name), "utf8");
    const defaults = Object.values(index.pages).find((entry: any) => entry.file === name) as Record<string, unknown> | undefined;
    const match = /^---\n([\s\S]*?)\n---\n/.exec(source);
    return { ...defaults, ...(match ? parse(match[1]) : {}), body: match ? source.slice(match[0].length) : source };
  }));
}

test("managed vaults use sibling named folders and remain separate", async () => {
  const welcome = await desktop.firstWindow();
  await expect(welcome.locator("#data-path")).toHaveText(path.join(root, "profile", "vault-data"));
  await welcome.locator("#vault-name").fill("Work");
  const firstPromise = desktop.waitForEvent("window"); await welcome.locator("#managed-create").click();
  const first = await firstPromise; await expect(first.locator(".sidebar")).toBeVisible();
  const managedRoot = path.join(root, "profile", "vault-data");
  expect(await fs.readdir(path.join(managedRoot, "Work", "pages"))).toEqual([]);
  const launcherPromise = desktop.waitForEvent("window"); await first.locator('.workspace-switch[data-action="vaults"]').click();
  const launcher = await launcherPromise; await expect(launcher.locator("#managed-vaults")).toContainText("Work");
  await launcher.locator("#vault-name").fill("Personal");
  const secondPromise = desktop.waitForEvent("window"); await launcher.locator("#managed-create").click();
  const second = await secondPromise; await expect(second.locator(".sidebar")).toBeVisible();
  expect(await fs.readdir(managedRoot)).toEqual(expect.arrayContaining(["Work", "Personal"]));
  expect(new URL(first.url()).origin).not.toBe(new URL(second.url()).origin);
});

test("desktop settings has grouped navigation and the Markdown display preferences", async () => {
  const vaultPath = path.join(root, "Settings"); await fs.mkdir(vaultPath);
  const page = await chooseFolder(vaultPath, "create");
  await page.getByRole("button", { name: "Workspace settings", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Workspace settings", exact: true });
  const nav = dialog.getByRole("navigation", { name: "Settings sections" });
  await expect(nav.getByRole("button")).toHaveCount(6);
  await nav.getByRole("button", { name: "Editing", exact: true }).click();
  await expect(dialog.getByRole("checkbox", { name: "Show dialect selector", exact: true })).toBeChecked();
  await expect(dialog.getByRole("button", { name: "Done", exact: true })).toBeInViewport();
  await page.screenshot({ path: ".run/logs/settings-desktop-packaged.png" });
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await expect(dialog).toHaveCount(0);
});

let root: string;
let desktop: ElectronApplication;
let launchArgs: string[];
let launchEnv: NodeJS.ProcessEnv;

async function trayAction(action: "open" | "click" | "quit") {
  await desktop.evaluate(async ({ app }, action) => {
    const require = process.getBuiltinModule("module").createRequire(app.getAppPath() + "/package.json");
    const { desktopLifecycle } = require("./desktop-dist/main.mjs");
    if (action === "click") desktopLifecycle.tray.emit("click");
    else desktopLifecycle.menu.getMenuItemById(action).click();
  }, action);
}

async function launchAgain() {
  const executable = await desktop.evaluate(() => process.execPath);
  const child = spawn(executable, launchArgs, { env: launchEnv, windowsHide: true, stdio: "ignore" });
  const code = await new Promise<number | null>((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); });
  expect(code).toBe(0);
}
test.beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-desktop-test-"));
  const env = { ...process.env, NOTDOWN_DESKTOP_PROFILE: path.join(root, "profile"), NOTDOWN_DATA_PATH: path.join(root, "profile", "vault-data"), NOTDOWN_DESKTOP_HEADLESS: "1" };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.VAULT_PATH;
  const packaged = process.env.NOTDOWN_PACKAGED_EXE;
  launchArgs = packaged ? [`--user-data-dir=${path.join(root, "profile")}`] : [path.resolve(".")]; launchEnv = env;
  desktop = await electron.launch({ executablePath: packaged, args: launchArgs, env });
  expect(await desktop.evaluate(({ app }) => app.getPath("userData"))).toBe(path.join(root, "profile"));
});
test("integrated title bar keeps native controls and desktop tab shortcuts save before switching", async () => {
  const vaultPath = path.join(root, "Tabs"); await fs.mkdir(vaultPath);
  const page = await chooseFolder(vaultPath, "create");
  const chrome = await desktop.evaluate(({ BrowserWindow, Menu }, origin) => {
    const window = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().startsWith(origin))!;
    return { menu: Menu.getApplicationMenu() === null, menuVisible: window.isMenuBarVisible(), bounds: window.getBounds(), content: window.getContentBounds() };
  }, new URL(page.url()).origin);
  expect(chrome.menu).toBe(true); expect(chrome.menuVisible).toBe(false);
  expect(chrome.bounds.height - chrome.content.height).toBeLessThan(25);
  await expect(page.locator(".sidebar-pages")).toHaveCount(0);
  await expect(page.locator("#sidebar")).toHaveCSS("overflow-y", "auto");
  await expect(page.locator('.sidebar-bottom > [data-action="import"]')).toBeInViewport();
  await expect(page.locator('.sidebar-bottom > [data-action="trash"]')).toBeInViewport();
  await expect(page.locator(".workspace-switch strong")).toHaveText("Tabs");
  await expect(page.locator(".workspace-switch img")).toHaveCount(0);
  await page.getByRole("button", { name: "Notdown menu", exact: true }).click();
  await expect(page.getByRole("menu", { name: "Notdown menu", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.locator('#sidebar .section-label [data-action="new"]').click();
  await page.locator("#page-title").fill("Desktop first tab");
  await page.locator("#editor .pm-document").fill("First tab body");
  await page.keyboard.press("Control+t");
  await expect(page.locator('#workspace-tabs [role="tab"]')).toHaveCount(2);
  await page.locator('#sidebar .section-label [data-action="new"]').click();
  await page.locator("#page-title").fill("Desktop second tab");
  await page.locator("#editor .pm-document").fill("Pending second tab text");
  await page.keyboard.press("Control+1");
  await expect(page.locator("#page-title")).toHaveValue("Desktop first tab");
  expect((await readNotes(vaultPath)).some(note => note.body.includes("Pending second tab text"))).toBe(true);
  await page.keyboard.press("Control+w");
  await expect(page.locator('#workspace-tabs [role="tab"]')).toHaveCount(1);
  await expect(page.locator("#page-title")).toHaveValue("Desktop second tab");
  await page.keyboard.press("Control+Shift+t");
  await expect(page.locator('#workspace-tabs [role="tab"]')).toHaveCount(2);
  await expect(page.locator("#page-title")).toHaveValue("Desktop first tab");
  await page.evaluate(() => { window.open(location.href, "_blank"); });
  await expect.poll(async () => (await desktop.windows()).length).toBe(1);
});

test("two vaults isolate drafts and folder import copies its sources", async () => {
  const firstPath = path.join(root, "First"); await fs.mkdir(firstPath);
  const first = await chooseFolder(firstPath, "create");
  await first.locator('#sidebar .section-label [data-action="new"]').click();
  await first.locator("#page-title").fill("First vault draft");
  const launcherPromise = desktop.waitForEvent("window");
  await first.locator('.workspace-switch[data-action="vaults"]').click();
  const launcher = await launcherPromise;
  const secondPath = path.join(root, "Second"); await fs.mkdir(secondPath);
  await desktop.evaluate(({ dialog }, selected) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selected] }); }, secondPath);
  const secondPromise = desktop.waitForEvent("window");
  await launcher.locator("#create").click();
  const second = await secondPromise;
  await expect(second.locator(".sidebar")).toBeVisible();
  expect(new URL(first.url()).origin).not.toBe(new URL(second.url()).origin);
  const sourcePath = path.join(root, "Source notes"); await fs.mkdir(sourcePath);
  const source = "# Imported note\n\nOriginal body";
  await fs.writeFile(path.join(sourcePath, "Note.md"), source);
  await second.getByRole("button", { name: "Import", exact: true }).click();
  await second.locator('[data-action="import-folder"]').click();
  await second.locator("#import-files").setInputFiles(sourcePath);
  await expect(second.locator("#import-commit")).toBeEnabled();
  await second.locator("#import-commit").click();
  await expect(second.locator(".import-dialog")).toHaveCount(0);
  expect(await fs.readFile(path.join(sourcePath, "Note.md"), "utf8")).toBe(source);
  const firstNotes = await readNotes(firstPath);
  expect(firstNotes).toHaveLength(1);
  expect(firstNotes[0].title).toBe("First vault draft");
  const secondNotes = await readNotes(secondPath);
  expect(secondNotes.some(note => note.body.includes("Original body"))).toBe(true);
  expect(secondNotes.some(note => note.title === "First vault draft")).toBe(false);
  await expect(first.locator("#page-title")).toHaveValue("First vault draft");
});
test.afterEach(async () => {
  // Kill only this test-owned app after assertions, so failed-save guards cannot hang cleanup.
  if (desktop) {
    const closed = desktop.waitForEvent("close", { timeout: 10_000 }).catch(() => {});
    await desktop.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await closed;
  }
  if (path.dirname(path.resolve(root)) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith("notdown-desktop-test-")) throw new Error("Unsafe desktop test cleanup");
  await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});
async function chooseFolder(folder: string, mode: "create" | "open") {
  const welcome = await desktop.firstWindow();
  await welcome.waitForLoadState("domcontentloaded");
  await desktop.evaluate(({ dialog }, selected) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selected] }); }, folder);
  const next = desktop.waitForEvent("window");
  await welcome.locator(`#${mode}`).click();
  const page = await next;
  await expect(page.locator(".sidebar")).toBeVisible();
  return page;
}
test("closing saves pending input to the vault, hides to tray and restores the same window and tabs", async () => {
  const welcome = await desktop.firstWindow();
  await expect(welcome.getByRole("heading", { name: "A home for your notes." })).toBeVisible();
  const vaultPath = path.join(root, "My vault"); await fs.mkdir(vaultPath);
  const page = await chooseFolder(vaultPath, "create");
  expect(await fs.readdir(path.join(vaultPath, "pages"))).toEqual([]);
  await page.locator('#sidebar .section-label [data-action="new"]').click();
  await expect(page.locator("#page-title")).toBeVisible();
  await page.locator("#page-title").fill("Desktop note");
  await page.locator(".page-pane .ProseMirror").fill("Pending body is saved on close");
  const origin = new URL(page.url()).origin;
  expect((await fetch(`${origin}/api/pages`)).status).toBe(403);
  const pid = desktop.process().pid;
  await desktop.evaluate(({ BrowserWindow }, url) => { BrowserWindow.getAllWindows().find(w => w.webContents.getURL().startsWith(url))!.close(); }, origin);
  await expect.poll(() => desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().every(window => !window.isVisible()))).toBe(true);
  expect(page.isClosed()).toBe(false); expect(desktop.process().pid).toBe(pid);
  await expect.poll(async () => (await readNotes(vaultPath))[0]?.body).toContain("Pending body is saved on close");
  await expect.poll(async () => (await readNotes(vaultPath))[0]?.title).toBe("Desktop note");
  const notes = await readNotes(vaultPath);
  expect(notes).toHaveLength(1);
  expect(notes[0].title).toBe("Desktop note");
  expect(notes[0].body).toContain("Pending body is saved on close");
  await trayAction("click");
  await expect.poll(() => desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some(window => window.isVisible()))).toBe(true);
  await expect(page.locator("#page-title")).toHaveValue("Desktop note");
  await expect(page.locator(".pm-document")).toContainText("Pending body is saved on close");
  expect((await desktop.windows()).length).toBe(1);
  expect(JSON.parse(await fs.readFile(path.join(root, "profile", "vaults.json"), "utf8"))).toContain(vaultPath);
});

test("tray exists, welcome can hide, and quitting from tray exits the process", async () => {
  const welcome = await desktop.firstWindow();
  await welcome.waitForLoadState("domcontentloaded");
  const state = await desktop.evaluate(async ({ app }) => {
    const require = process.getBuiltinModule("module").createRequire(app.getAppPath() + "/package.json");
    const { desktopLifecycle } = require("./desktop-dist/main.mjs");
    return { tray: !desktopLifecycle.tray.isDestroyed(), labels: desktopLifecycle.menu.items.map((item: { label: string }) => item.label) };
  });
  expect(state.tray).toBe(true); expect(state.labels).toEqual(["Open Notdown", "", "Quit Notdown"]);
  await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  expect(welcome.isClosed()).toBe(false);
  await trayAction("open");
  await expect.poll(() => desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible())).toBe(true);
  const closed = desktop.waitForEvent("close"); await trayAction("quit"); await closed;
});

test("launching again restores hidden or minimized windows without another instance or launcher", async () => {
  const vaultPath = path.join(root, "Single instance"); await fs.mkdir(vaultPath);
  const page = await chooseFolder(vaultPath, "create");
  const pid = desktop.process().pid;
  const windowId = await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].id);
  await desktop.evaluate(({ app }) => {
    (app as unknown as { testSecondLaunches: number }).testSecondLaunches = 0;
    app.on("second-instance", () => { (app as unknown as { testSecondLaunches: number }).testSecondLaunches++; });
  });
  await page.locator('#sidebar .section-label [data-action="new"]').click();
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let saving = false;
  await page.route("**/api/pages/*", async route => {
    if (route.request().method() === "PUT") { saving = true; await held; }
    await route.continue();
  });
  await page.locator(".pm-document").fill("Pending input during relaunch");
  await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await expect.poll(() => saving).toBe(true);
  await launchAgain();
  await expect.poll(() => desktop.evaluate(({ BrowserWindow, app }) => ({
    lock: app.hasSingleInstanceLock(), notifications: (app as unknown as { testSecondLaunches: number }).testSecondLaunches,
    windows: BrowserWindow.getAllWindows().map(window => ({ id: window.id, visible: window.isVisible(), minimized: window.isMinimized(), url: window.webContents.getURL() })),
  }))).toMatchObject({ lock: true, notifications: 1, windows: [{ id: windowId, visible: true, minimized: false }] });
  release();
  await expect(page.locator("#save-status")).toContainText("Saved");
  await page.unroute("**/api/pages/*");
  expect(await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible())).toBe(true);
  await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].minimize());
  await launchAgain();
  await expect.poll(() => desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMinimized())).toBe(false);
  expect(await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(window => window.id))).toEqual([windowId]);
  expect(desktop.process().pid).toBe(pid); expect(page.isClosed()).toBe(false);
});

test("quit keeps all windows frozen until all saves finish and preserves drafts when any save fails", async () => {
  const firstPath = path.join(root, "Quit first"); await fs.mkdir(firstPath);
  const first = await chooseFolder(firstPath, "create");
  await first.locator('#sidebar .section-label [data-action="new"]').click();
  await first.locator("#page-title").fill("First quit draft");
  const launcherPromise = desktop.waitForEvent("window"); await first.locator(".workspace-switch").click();
  const launcher = await launcherPromise;
  const secondPath = path.join(root, "Quit second"); await fs.mkdir(secondPath);
  await desktop.evaluate(({ dialog }, selected) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selected] }); }, secondPath);
  const next = desktop.waitForEvent("window"); await launcher.locator("#create").click(); const second = await next;
  await second.locator('#sidebar .section-label [data-action="new"]').click();
  await second.locator("#page-title").fill("Second quit draft");
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let saveStarted = false;
  await second.route("**/api/pages/*", async route => {
    if (route.request().method() !== "PUT") { await route.continue(); return; }
    saveStarted = true; await held;
    await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Temporary test save failure" }) });
  });
  await first.locator(".pm-document").evaluate(element => element.textContent = "First pending quit body");
  await second.locator(".pm-document").evaluate(element => element.textContent = "Second pending quit body");
  await trayAction("quit");
  await expect.poll(() => saveStarted).toBe(true);
  await expect.poll(async () => (await readNotes(firstPath))[0]?.body).toContain("First pending quit body");
  await expect(first.locator("#app")).toHaveAttribute("inert", "");
  release();
  await expect(second.locator("#save-status")).toContainText("Save failed");
  await expect(first.locator("#app")).not.toHaveAttribute("inert", "");
  await expect(second.locator("#app")).not.toHaveAttribute("inert", "");
  expect(first.isClosed()).toBe(false); expect(second.isClosed()).toBe(false);
  await second.unroute("**/api/pages/*");
  const closed = desktop.waitForEvent("close");
  await second.getByRole("button", { name: "Notdown menu", exact: true }).click();
  await second.getByRole("menuitem", { name: "Quit Notdown", exact: true }).click();
  await closed;
  expect((await readNotes(secondPath))[0].body).toContain("Second pending quit body");
});
test("failed conflict save prevents close and preserves both versions", async () => {
  const vaultPath = path.join(root, "Existing");
  await fs.mkdir(path.join(vaultPath, "pages"), { recursive: true });
  const filename = path.join(vaultPath, "pages", "test-page.md");
  const source = "---\nid: test-page\ntitle: Before\n---\nInitial";
  await fs.writeFile(filename, source);
  const page = await chooseFolder(vaultPath, "open");
  await expect(page.locator("#page-title")).toHaveValue("Before");
  await page.locator("#page-title").fill("Unsaved local title");
  await fs.writeFile(filename, source.replace("Initial", "External newer content"));
  const origin = new URL(page.url()).origin;
  await desktop.evaluate(({ BrowserWindow }, url) => { BrowserWindow.getAllWindows().find(w => w.webContents.getURL().startsWith(url))!.close(); }, origin);
  await expect(page.locator("#save-status")).toContainText("Conflict");
  expect(page.isClosed()).toBe(false);
  expect((await readNotes(vaultPath))[0].body).toBe("External newer content");
  const conflicts = (await fs.readdir(path.join(vaultPath, ".history/conflicts"))).filter(name => name.endsWith(".md"));
  expect(conflicts.length).toBeGreaterThan(0);
  expect(await fs.readFile(path.join(vaultPath, ".history/conflicts", conflicts[0]), "utf8")).toContain("Unsaved local title");
});
