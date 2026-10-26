import { test, expect, _electron as electron, type ElectronApplication } from "@playwright/test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse } from "yaml";

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

let root: string;
let desktop: ElectronApplication;
test.beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-desktop-test-"));
  const env = { ...process.env, NOTDOWN_DESKTOP_PROFILE: path.join(root, "profile"), NOTDOWN_DATA_PATH: path.join(root, "profile", "vault-data"), NOTDOWN_DESKTOP_HEADLESS: "1" };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.VAULT_PATH;
  const packaged = process.env.NOTDOWN_PACKAGED_EXE;
  desktop = await electron.launch({ executablePath: packaged, args: packaged ? [`--user-data-dir=${path.join(root, "profile")}`] : [path.resolve(".")], env });
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
test("first launch creates an empty vault, remembers it and saves pending input on close", async () => {
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
  // Leave a launcher open so the app stays alive while its editing window closes.
  const launcherPromise = desktop.waitForEvent("window");
  await page.evaluate(() => (window as any).notdownDesktop.openVaultWindow());
  const launcher = await launcherPromise;
  await desktop.evaluate(({ BrowserWindow }, url) => { BrowserWindow.getAllWindows().find(w => w.webContents.getURL().startsWith(url))!.close(); }, origin);
  await expect.poll(() => page.isClosed()).toBe(true);
  const notes = await readNotes(vaultPath);
  expect(notes).toHaveLength(1);
  expect(notes[0].title).toBe("Desktop note");
  expect(notes[0].body).toContain("Pending body is saved on close");
  await expect(launcher.locator("#recents")).toContainText("My vault");
  const reopenedPromise = desktop.waitForEvent("window");
  await launcher.locator("#recents button").click();
  const reopened = await reopenedPromise;
  await expect(reopened.locator("#page-title")).toHaveValue("Desktop note");
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
