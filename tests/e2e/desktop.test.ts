import { test, expect, _electron as electron, type ElectronApplication } from "@playwright/test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse } from "yaml";

async function readNotes(vaultPath: string) {
  const files = await fs.readdir(path.join(vaultPath, "pages"));
  return Promise.all(files.filter(name => name.endsWith(".md")).map(async name => {
    const source = await fs.readFile(path.join(vaultPath, "pages", name), "utf8");
    const match = /^---\n([\s\S]*?)\n---\n/.exec(source)!;
    return { ...parse(match[1]), body: source.slice(match[0].length) };
  }));
}

let root: string;
let desktop: ElectronApplication;
test.beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-desktop-test-"));
  const env = { ...process.env, NOTDOWN_DESKTOP_PROFILE: path.join(root, "profile"), NOTDOWN_DESKTOP_HEADLESS: "1" };
  delete env.ELECTRON_RUN_AS_NODE;
  const packaged = process.env.NOTDOWN_PACKAGED_EXE;
  desktop = await electron.launch({ executablePath: packaged, args: packaged ? [`--user-data-dir=${path.join(root, "profile")}`] : [path.resolve(".")], env });
  expect(await desktop.evaluate(({ app }) => app.getPath("userData"))).toBe(path.join(root, "profile"));
});
test("two vaults isolate drafts and folder import copies its sources", async () => {
  const firstPath = path.join(root, "First"); await fs.mkdir(firstPath);
  const first = await chooseFolder(firstPath, "create");
  await first.locator('.new-page[data-action="new"]').click();
  await first.locator("#page-title").fill("First vault draft");
  const launcherPromise = desktop.waitForEvent("window");
  await first.locator('[data-action="open-vault"]').click();
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
  await page.locator('.new-page[data-action="new"]').click();
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
