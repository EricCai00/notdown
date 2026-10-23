import { Capacitor } from "@capacitor/core";
import { Buffer } from "buffer";
import { MarkdownWorkspace, type EditMode } from "../markdown-engine/workspace";
import { defaultSyntax, commandEnabled, type SyntaxConfig } from "../markdown-engine/config";
import { parseNative } from "../markdown-engine/codec";
import { createVault, type Page } from "../vault/vault";
import type { VaultPlatform } from "../vault/platform";
import { setApiTransport } from "../shared/types";
import { setAssetDisplayResolver } from "../shared/asset-display";
import { refreshIcons } from "../shared/icons";
import { pageIconElement } from "../shared/page-icons";
import { searchPages } from "../features/pages/page-search";
import { mediaInsertMarkdown } from "../blocks/media-insert";
import { mountSyncSettings, installSyncScheduler, type SyncHooks } from "../features/vault/sync-settings";
import { createNativePlatform, NativeVault } from "./native-platform";
import { nativeSyncFetch } from "./sync-fetch";
import { MobileDraftSession } from "./draft-session";
import { mobileVaultApi, type MobileVault } from "./vault-api";
import { readVaultZip, writeVaultZip, exportVaultZip } from "./backup";
import notdownIcon from "../assets/notdown-icon.png";
import "../app/style.css";
import "../editor/notion-blocks.css";
import "./mobile.css";

const native = Capacitor.isNativePlatform();
const app = document.querySelector<HTMLElement>("#mobile-app")!;
const icon = (name: string) => `<i data-lucide="${name}" aria-hidden="true"></i>`;
app.innerHTML = `
  <header class="mobile-header"><button type="button" data-action="pages" aria-label="Open pages">${icon("panel-left")}</button><img src="${notdownIcon}" alt="" class="mobile-logo"><strong>Notdown</strong><span class="mobile-offline">${native ? "On device" : "Browser preview"}</span><button type="button" data-action="more" aria-label="Notebook options">${icon("ellipsis")}</button></header>
  <div class="mobile-page-meta" hidden><input id="mobile-title" aria-label="Page title" maxlength="500" spellcheck="false"><div class="mobile-page-info"><span id="mobile-save-state" role="status" aria-live="polite"></span><div class="mobile-modes" role="group" aria-label="Editing view"><button type="button" data-view="document" aria-pressed="true">Page</button><button type="button" data-view="source" aria-pressed="false">Source</button></div></div></div>
  <div id="mobile-recovery" hidden><span></span><button type="button" data-action="recover-copy">Save draft as new page</button><button type="button" data-action="retry">Retry save</button></div>
  <main id="mobile-content"><div class="mobile-empty"><img src="${notdownIcon}" alt=""><h1>Your notes, with you.</h1><p>Write offline. Keep your Markdown files.</p><button type="button" class="mobile-primary" data-action="new">Create a page</button><button type="button" data-action="import">Import Markdown or vault ZIP</button></div><div id="mobile-workspace" hidden></div></main>
  <nav class="mobile-tools" aria-label="Editing tools" hidden><button type="button" data-action="insert" aria-label="Insert block">${icon("plus")}</button><button type="button" data-format="bold" aria-label="Bold">${icon("bold")}</button><button type="button" data-format="italic" aria-label="Italic">${icon("italic")}</button><button type="button" data-action="image" aria-label="Insert image">${icon("image")}</button><span></span><button type="button" data-action="undo" aria-label="Undo">${icon("undo-2")}</button><button type="button" data-action="redo" aria-label="Redo">${icon("redo-2")}</button><button type="button" data-action="save" aria-label="Save page">${icon("check")}</button></nav>
  <dialog id="mobile-pages" class="mobile-drawer" aria-label="Pages"><div class="mobile-dialog-heading"><h2>Pages</h2><button type="button" data-close aria-label="Close pages">${icon("x")}</button></div><label class="mobile-vault-label">Notebook<select id="mobile-vault" aria-label="Notebook"></select></label><input id="mobile-search" type="search" aria-label="Search pages" placeholder="Search your notes…"><button type="button" class="mobile-new-page" data-action="new">${icon("plus")} New page</button><div id="mobile-page-list"></div><div class="mobile-drawer-footer"><button type="button" data-action="import">${icon("folder-input")} Import</button><button type="button" data-action="export">${icon("archive")} Export ZIP</button></div><p class="mobile-storage-note">Saved on this device. Set up Cloud sync in Notebook options, and export a separate backup before uninstalling.</p></dialog>
  <dialog id="mobile-menu" class="mobile-sheet" aria-labelledby="mobile-menu-title"><div class="mobile-dialog-heading"><h2 id="mobile-menu-title">Notebook</h2><button type="button" data-close aria-label="Close menu">${icon("x")}</button></div><div id="mobile-menu-items"></div></dialog>
  <input id="mobile-import" type="file" accept=".zip,.md,.markdown,.qmd,.rmd" multiple hidden>
  <input id="mobile-image" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" hidden>
  <div id="mobile-notice" aria-live="polite" hidden></div>`;
refreshIcons();
const title = app.querySelector<HTMLInputElement>("#mobile-title")!;
const drawer = app.querySelector<HTMLDialogElement>("#mobile-pages")!;
const menu = app.querySelector<HTMLDialogElement>("#mobile-menu")!;
const mount = app.querySelector<HTMLElement>("#mobile-workspace")!;
const search = app.querySelector<HTMLInputElement>("#mobile-search")!;
const vaultSelect = app.querySelector<HTMLSelectElement>("#mobile-vault")!;
let platform: VaultPlatform;
let vault: MobileVault;
let vaultId = "main";
let pages: Page[] = [];
let workspace: MarkdownWorkspace | undefined;
let session: MobileDraftSession | undefined;
let timer: ReturnType<typeof setTimeout>;
let noticeTimer: ReturnType<typeof setTimeout>;
let operation = Promise.resolve();
let attachmentPage: string | undefined;
let stopSync: (() => void) | undefined;
let syncDialog: HTMLDialogElement | undefined;
const assetUrls = new Map<string, string>();
const sessionId = native ? "android" : (() => {
  const key = "notdown-mobile-window", value = sessionStorage.getItem(key) || crypto.randomUUID();
  sessionStorage.setItem(key, value); return value;
})();
const draftKey = (id: string) => `notdown-mobile-draft:${vaultId}:${sessionId}:${id}`;

function tell(value: unknown) {
  const text = value instanceof Error ? value.message : String(value);
  const notice = app.querySelector<HTMLElement>("#mobile-notice")!;
  notice.textContent = text; notice.hidden = false; clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { notice.hidden = true; }, 7000);
}
function enqueue(action: () => Promise<unknown>) {
  operation = operation.then(action).then(() => {}).catch(tell);
}
function closeDialogs() { drawer.close(); menu.close(); syncDialog?.close(); }
function assetKey(raw: string) {
  try { raw = decodeURIComponent(raw); } catch { return undefined; }
  return /^\/?assets\//.test(raw) ? raw.replace(/^\//, "") : undefined;
}
setAssetDisplayResolver(raw => assetUrls.get(assetKey(raw) ?? "") ?? raw);
const mimeTypes: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", avif: "image/avif", pdf: "application/pdf", mp3: "audio/mpeg", mp4: "video/mp4", webm: "video/webm" };
async function loadAsset(raw: string) {
  const key = assetKey(raw);
  if (!key || assetUrls.has(key)) return;
  const bytes = await vault.readAsset(key);
  assetUrls.set(key, URL.createObjectURL(new Blob([Uint8Array.from(bytes)], { type: mimeTypes[key.split(".").pop()!.toLowerCase()] ?? "application/octet-stream" })));
}
async function prepareAssets(page: Page) {
  const config = page.syntax ?? defaultSyntax(page.bodyFormat);
  const paths = new Set<string>();
  parseNative(page.body, config).descendants(node => {
    if (typeof node.attrs.src === "string" && assetKey(node.attrs.src)) paths.add(node.attrs.src);
    for (const mark of node.marks) if (typeof mark.attrs.href === "string" && assetKey(mark.attrs.href)) paths.add(mark.attrs.href);
  });
  for (const path of paths) await loadAsset(path).catch(() => { /* Preserve unresolved attachments and their source paths. */ });
}
function renderState() {
  if (!session) return;
  const failure = session.failure;
  app.querySelector("#mobile-save-state")!.textContent = failure ? "Draft needs attention" : session.saving ? "Saving…" : session.dirty ? (session.recovered ? "Recovered draft" : "Unsaved changes") : "Saved on this device";
  const recovery = app.querySelector<HTMLElement>("#mobile-recovery")!;
  recovery.hidden = !failure;
  recovery.querySelector("span")!.textContent = failure instanceof Error ? failure.message : failure ? String(failure) : "";
  const index = pages.findIndex(page => page.id === session!.draft.id);
  if (index >= 0) pages[index] = { ...session.draft };
  if (drawer.open) renderPages();
}
function change(source: string, config: SyntaxConfig) {
  if (!session) return;
  const syntax = !session.draft.syntax && JSON.stringify(config) === JSON.stringify(defaultSyntax(session.draft.bodyFormat)) ? undefined : config;
  try { session.change({ body: source, syntax, title: title.value.trim() || session.draft.title }); }
  catch (error) { tell(`Recovery storage is unavailable: ${error instanceof Error ? error.message : error}. Keep the app open until saving succeeds.`); }
  clearTimeout(timer); timer = setTimeout(() => { void save().catch(tell); }, 300);
}
function capture() {
  if (!workspace || !session) return true;
  if (workspace.blocks.isComposing() || workspace.source.composing) return false;
  const snapshot = workspace.capture();
  change(snapshot.source, snapshot.config); clearTimeout(timer);
  return true;
}
async function save() {
  if (!capture()) return false;
  if (workspace && !await workspace.blocks.flushDatabaseViews()) return false;
  await workspace?.blocks.flushSyncedBlocks();
  return session ? session.save() : true;
}
async function leavePage() {
  const success = await save();
  if (!success && !session?.failure) tell("Finish the current input before switching pages.");
  return success;
}
function renderPages() {
  const target = app.querySelector<HTMLElement>("#mobile-page-list")!;
  target.replaceChildren();
  for (const page of searchPages(pages, search.value)) {
    const button = document.createElement("button"); button.type = "button"; button.className = "mobile-page-row";
    button.dataset.pageId = page.id; button.setAttribute("aria-current", String(page.id === session?.draft.id));
    button.append(pageIconElement(page.icon));
    const text = document.createElement("span"); text.textContent = page.title; button.append(text);
    button.onclick = () => enqueue(async () => { if (await leavePage()) await openPage(page.id); });
    target.append(button);
  }
  if (!target.childElementCount) target.textContent = search.value ? "No matching pages." : "Your notebook is empty.";
}
async function openPage(id: string) {
  const page = await vault.get(id);
  const selectedVault = vault;
  const nextSession = new MobileDraftSession(page, draftKey(page.id), localStorage,
    async (id, input, revision) => selectedVault.update(id, input, revision,
      page.dataSourceId ? (await selectedVault.databases.getSource(page.dataSourceId)).revision : undefined),
    () => { if (session === nextSession) renderState(); });
  await prepareAssets(nextSession.draft);
  workspace?.destroy(); session = nextSession; title.value = session.draft.title;
  closeDialogs(); app.querySelector<HTMLElement>(".mobile-empty")!.hidden = true;
  mount.hidden = false; app.querySelector<HTMLElement>(".mobile-page-meta")!.hidden = false;
  app.querySelector<HTMLElement>(".mobile-tools")!.hidden = false;
  workspace = new MarkdownWorkspace(mount, {
    source: session.draft.body, config: session.draft.syntax ?? defaultSyntax(session.draft.bodyFormat),
    mode: "document", pages: () => pages, currentPage: () => session?.draft,
    onChange: change, onError: tell, onInsert: showInsert, onSavePage: save,
    onMode: mode => updateMode(mode),
    onOpenPage: (id, reference) => enqueue(async () => { if (await leavePage()) { await openPage(id); if (reference) workspace?.blocks.scrollToReference(reference); } }),
    onCreatePage: async (name, parent) => vault.create({ title: name, parent, body: "", syntax: { ...defaultSyntax(), variant: "notdown" } }),
  });
  updateMode("document"); renderState();
  localStorage.setItem(`notdown-mobile-last-page:${vaultId}`, id);
  app.querySelector<HTMLElement>("#mobile-content")!.scrollTop = 0;
}
function updateMode(mode: EditMode) {
  for (const button of app.querySelectorAll<HTMLButtonElement>("[data-view]")) button.setAttribute("aria-pressed", String(button.dataset.view === mode));
}
async function refreshVaultList() {
  const entries = await platform.fs.readdir("/vaults", { withFileTypes: true });
  const ids = entries.filter(entry => entry.isDirectory() && /^[a-zA-Z0-9-]{1,64}$/.test(entry.name)).map(entry => entry.name);
  if (!ids.includes(vaultId)) ids.unshift(vaultId);
  vaultSelect.replaceChildren(...ids.map(id => {
    const option = document.createElement("option"); option.value = id;
    option.textContent = localStorage.getItem(`notdown-mobile-vault-name:${id}`) || (id === "main" ? "My notebook" : `Imported notebook · ${id.slice(0, 8)}`);
    return option;
  }));
  vaultSelect.value = vaultId;
}
async function switchVault(id: string, supplied?: MobileVault) {
  stopSync?.();
  const next = supplied ?? createVault(`/vaults/${id}`, platform, { syncFetch: native ? nativeSyncFetch : undefined });
  const loaded = await next.list();
  workspace?.destroy(); workspace = undefined; session = undefined;
  for (const url of assetUrls.values()) URL.revokeObjectURL(url); assetUrls.clear();
  vaultId = id; vault = next; pages = loaded;
  stopSync = installSyncScheduler(syncHooks(next));
  localStorage.setItem("notdown-mobile-active-vault", id);
  await refreshVaultList(); search.value = ""; renderPages();
  const last = localStorage.getItem(`notdown-mobile-last-page:${id}`);
  if (pages.length) await openPage(pages.find(page => page.id === last)?.id ?? pages[0].id);
  else {
    closeDialogs(); mount.hidden = true; mount.replaceChildren();
    app.querySelector<HTMLElement>(".mobile-empty")!.hidden = false;
    for (const selector of [".mobile-page-meta", ".mobile-tools", "#mobile-recovery"]) app.querySelector<HTMLElement>(selector)!.hidden = true;
  }
}
function syncHooks(selectedVault: MobileVault): SyncHooks {
  return {
    beforeSync: async () => selectedVault === vault && await save(),
    afterSync: async () => {
      if (selectedVault !== vault) return;
      const active = session;
      const latest = await selectedVault.list();
      if (selectedVault !== vault || session !== active || !capture() || session?.dirty || session?.saving || session?.failure) return;
      pages = latest; renderPages();
      const current = latest.find(page => page.id === active?.draft.id);
      if (current && active && current.revision === active.base.revision) return;
      if (!active && !latest.length) return;
      // Only the short local reload is inert; typing during the network transfer remains editable and recoverable.
      mount.inert = true; title.disabled = true;
      const reopenSync = syncDialog?.open;
      try {
        for (const url of assetUrls.values()) URL.revokeObjectURL(url); assetUrls.clear();
        if (current) await openPage(current.id);
        else if (!active && latest.length) await openPage(latest[0].id);
        else if (active) await switchVault(vaultId, selectedVault);
      } finally { mount.inert = false; title.disabled = false; if (reopenSync && syncDialog?.isConnected && !syncDialog.open) syncDialog.showModal(); }
    },
  };
}
async function showSync() {
  if (!await leavePage()) return;
  closeDialogs(); syncDialog?.remove();
  syncDialog = document.createElement("dialog"); syncDialog.className = "mobile-sync-dialog"; syncDialog.setAttribute("aria-label", "Cloud sync");
  const close = document.createElement("button"); close.type = "button"; close.className = "secondary-button"; close.textContent = "Close"; close.onclick = () => syncDialog?.close();
  syncDialog.append(close); app.append(syncDialog); syncDialog.showModal();
  await mountSyncSettings(syncDialog, syncHooks(vault));
}
async function newPage() {
  if (!await leavePage()) return;
  const page = await vault.create({ title: "Untitled page", body: "", syntax: { ...defaultSyntax(), variant: "notdown" } });
  pages = await vault.list(); await openPage(page.id); workspace?.blocks.focus();
}
function showMenu(heading: string, buttons: { label: string; action: () => void; disabled?: boolean }[], note?: string) {
  closeDialogs(); app.querySelector("#mobile-menu-title")!.textContent = heading;
  const container = app.querySelector<HTMLElement>("#mobile-menu-items")!; container.replaceChildren();
  for (const item of buttons) { const button = document.createElement("button"); button.type = "button"; button.textContent = item.label; button.disabled = !!item.disabled; button.onclick = () => { menu.close(); item.action(); }; container.append(button); }
  if (note) { const text = document.createElement("p"); text.className = "mobile-storage-note"; text.textContent = note; container.append(text); }
  menu.showModal();
}
function showInsert() {
  if (!workspace) return;
  workspace.blocks.captureSelection();
  const blocks = ["heading1", "heading2", "list", "number", "task", "quote", "code", "divider"] as const;
  const labels = ["Heading 1", "Heading 2", "Bulleted list", "Numbered list", "To-do list", "Quote", "Code block", "Divider"];
  const source: Record<string, string> = { heading1: "# ", heading2: "## ", list: "- ", number: "1. ", task: "- [ ] ", quote: "> ", code: "```\n\n```", divider: "\n---\n" };
  showMenu("Insert block", blocks.map((kind, i) => ({ label: labels[i], disabled: !commandEnabled(workspace!.session.snapshot.config, kind),
    action: () => { if (workspace!.activePane === "source") workspace!.insert(source[kind]); else workspace!.blocks.insertBlockType(kind); } })));
}
function selectImage() {
  if (!workspace || !session) return;
  workspace.blocks.captureSelection(); attachmentPage = session.draft.id;
  app.querySelector<HTMLInputElement>("#mobile-image")!.click();
}
async function backup() {
  if (!await leavePage()) return;
  tell("Preparing backup…");
  const saved = await exportVaultZip(writeVaultZip(await vault.exportFiles()));
  if (saved) tell("Notebook backup exported.");
}
async function copyRecovery() {
  if (!session || !capture()) return;
  const original = session, draft = original.draft;
  const copy = await vault.create({ title: `${draft.title.slice(0, 475)} (recovered)`, body: draft.body, bodyFormat: draft.bodyFormat,
    syntax: draft.syntax, properties: draft.properties, icon: draft.icon });
  original.releaseCopiedDraft(); pages = await vault.list(); await openPage(copy.id);
  tell("Draft saved as a new page. The original page and conflict history are preserved.");
}
const actions: Record<string, () => void | Promise<unknown>> = {
  pages: () => { renderPages(); drawer.showModal(); }, new: newPage,
  more: () => showMenu("Notebook", [
    { label: "New page", action: () => enqueue(newPage) },
    { label: "Import Markdown or vault ZIP", action: () => actions.import() },
    { label: "Export notebook ZIP", action: () => enqueue(backup) },
    { label: "Cloud sync", action: () => enqueue(showSync) },
  ], "Notes are saved on this device. Cloud sync runs while the app is open. Export a separate backup before uninstalling."),
  insert: showInsert, image: selectImage,
  undo: () => { workspace?.history("undo"); }, redo: () => { workspace?.history("redo"); },
  save: async () => { await save(); }, retry: async () => { if (capture()) await session?.retry(); },
  "recover-copy": copyRecovery,
  import: () => { closeDialogs(); app.querySelector<HTMLInputElement>("#mobile-import")!.click(); }, export: backup,
};
app.addEventListener("click", event => {
  const button = (event.target as Element).closest<HTMLButtonElement>("button"); if (!button) return;
  if (button.hasAttribute("data-close")) { button.closest("dialog")?.close(); return; }
  if (button.dataset.view) {
    const mode = button.dataset.view as EditMode;
    enqueue(async () => {
      if (!capture() || !workspace) return;
      if (await workspace.setMode(mode)) updateMode(mode);
      await session?.save();
    });
    return;
  }
  if (button.dataset.format) { workspace?.insertFormat(button.dataset.format); return; }
  const action = button.dataset.action && actions[button.dataset.action]; if (action) enqueue(async () => { await action(); });
});
app.querySelector(".mobile-tools")!.addEventListener("pointerdown", event => event.preventDefault());
search.oninput = renderPages;
title.oninput = () => {
  if (!session || !workspace || !title.value.trim()) return;
  workspace.setPageTitle(title.value.trim());
  const snapshot = workspace.capture(); change(snapshot.source, snapshot.config);
};
title.onblur = () => { if (!title.value.trim()) title.value = session?.draft.title ?? ""; };
vaultSelect.onchange = () => enqueue(async () => { const id = vaultSelect.value; if (await leavePage()) await switchVault(id); else vaultSelect.value = vaultId; });
for (const dialog of [drawer, menu]) dialog.addEventListener("click", event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } });
app.querySelector<HTMLInputElement>("#mobile-import")!.onchange = event => {
  const input = event.target as HTMLInputElement, files = Array.from(input.files ?? []); input.value = "";
  enqueue(async () => {
    if (!files.length || !await leavePage()) return;
    if (files.some(file => /\.zip$/i.test(file.name))) {
      if (files.length !== 1) throw new Error("Choose one vault ZIP at a time.");
      const file = files[0]; if (file.size > 128 * 1024 * 1024) throw new Error("Backup ZIP exceeds 128 MB");
      const entries = readVaultZip(new Uint8Array(await file.arrayBuffer())), id = crypto.randomUUID();
      const restored = createVault(`/vaults/${id}`, platform, { syncFetch: native ? nativeSyncFetch : undefined });
      await restored.restoreFiles(entries);
      localStorage.setItem(`notdown-mobile-vault-name:${id}`, file.name.replace(/\.zip$/i, ""));
      await switchVault(id, restored); tell("Backup restored into a new notebook. Your previous notebook is still available.");
    } else {
      let last: Page | undefined;
      for (const file of files) {
        if (!/\.(md|markdown|rmd|qmd)$/i.test(file.name) || file.size > 10 * 1024 * 1024) throw new Error("Choose Markdown files smaller than 10 MB.");
        const variant = /\.rmd$/i.test(file.name) ? "rmarkdown" : /\.qmd$/i.test(file.name) ? "quarto" : "notdown";
        last = await vault.create({ title: file.name.replace(/\.[^.]+$/, "").slice(0, 500) || "Imported page", body: Buffer.from(await file.arrayBuffer()).toString("utf8"), syntax: { ...defaultSyntax(), variant } });
      }
      pages = await vault.list(); if (last) await openPage(last.id); tell(`${files.length} Markdown file(s) imported.`);
    }
  });
};
app.querySelector<HTMLInputElement>("#mobile-image")!.onchange = event => {
  const input = event.target as HTMLInputElement, file = input.files?.[0], target = attachmentPage; input.value = "";
  enqueue(async () => {
    if (!file || !workspace || session?.draft.id !== target) return;
    if (!/^image\/(png|jpeg|gif|webp|avif)$/.test(file.type) || file.size > 20 * 1024 * 1024) throw new Error("Choose a PNG, JPEG, GIF, WebP or AVIF image smaller than 20 MB.");
    const uploaded = await vault.uploadAsset(file.name, file.type, Buffer.from(await file.arrayBuffer()).toString("base64"));
    await loadAsset(uploaded.path);
    workspace.insert(mediaInsertMarkdown("image", uploaded.name, uploaded.path, workspace.session.snapshot.config));
    await save();
  });
};
window.addEventListener("notdown:back", () => enqueue(async () => {
  if (syncDialog?.open) { syncDialog.close(); return; }
  if (menu.open) { menu.close(); return; }
  if (drawer.open) { drawer.close(); if (native && await leavePage()) await NativeVault.background(); return; }
  if (await leavePage()) { renderPages(); drawer.showModal(); }
}));
document.addEventListener("visibilitychange", () => { if (document.hidden) void save().catch(tell); });
app.addEventListener("compositionend", () => { setTimeout(() => { void save().catch(tell); }, 0); });
window.addEventListener("pagehide", () => { capture(); });
window.addEventListener("beforeunload", event => { capture(); if (session?.dirty) { event.preventDefault(); event.returnValue = ""; } });
const viewport = () => {
  const height = window.visualViewport?.height ?? window.innerHeight;
  document.documentElement.style.setProperty("--mobile-height", `${height}px`);
};
window.visualViewport?.addEventListener("resize", viewport); window.addEventListener("resize", viewport); viewport();

async function start() {
  platform = native ? createNativePlatform() : await (await import("./browser-platform")).createBrowserPlatform();
  await platform.fs.mkdir("/vaults", { recursive: true });
  setApiTransport(mobileVaultApi(() => vault));
  const active = localStorage.getItem("notdown-mobile-active-vault");
  await switchVault(active && /^[a-zA-Z0-9-]{1,64}$/.test(active) ? active : "main");
  if (native) {
    await NativeVault.addListener("pause", () => { void save().catch(tell); });
    await NativeVault.addListener("resume", () => { void refreshVaultList().catch(tell); });
  }
  app.dataset.ready = "true";
}
void start().catch(error => { tell(error); app.dataset.ready = "error"; });
