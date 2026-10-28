import { Capacitor } from "@capacitor/core";
import { Buffer } from "buffer";
import { MarkdownWorkspace, type EditMode } from "../markdown-engine/workspace";
import { commandEnabled, defaultSyntax, dialectGroups, resetExtensions, validSyntax, syntaxFormat, type SyntaxConfig } from "../markdown-engine/config";
import { DatabaseWorkspace, propertyInput } from "../features/databases/database-workspace";
import type { Database, DatabaseDataSource } from "../features/databases/database-model";
import { databaseTree } from "../features/databases/database-tree";
import { isWikiDatabase } from "../features/databases/database-model";
import { databaseReference } from "../features/databases/database-reference";
import { documentMetadata } from "../features/metadata/document-metadata";
import { createVault, type Page } from "../vault/vault";
import type { VaultPlatform } from "../vault/platform";
import { setApiTransport } from "../shared/types";
import { setAssetDisplayResolver } from "../shared/asset-display";
import { refreshIcons } from "../shared/icons";
import { pageIconElement } from "../shared/page-icons";
import { searchPages } from "../features/pages/page-search";
import { setExternalLibrary } from "../features/references/external-client";
import { openPeopleEvent, refreshPeople } from "../features/people/people-client";
import { openPeople } from "../features/people/people-view";
import { mediaInsertMarkdown } from "../blocks/media-insert";
import { mountSyncSettings, installSyncScheduler, type SyncHooks } from "../features/vault/sync-settings";
import { createNativePlatform, NativeVault } from "./native-platform";
import { nativeSyncFetch } from "./sync-fetch";
import { MobileDraftSession } from "./draft-session";
import { mobileVaultApi, type MobileVault } from "./vault-api";
import { writeVaultZip, exportVaultZip } from "./backup";
import { mobileNotebookReady } from "./notebook-policy";
import { mobilePageTree } from "./page-tree";
import { MobileAssetLoader, refreshMobileAssetDisplays } from "./asset-loader";
import { MobileEditingToolbar } from "./editing-toolbar";
import notdownIcon from "../assets/notdown-icon.png";
import "../app/style.css";
import "../editor/notion-blocks.css";
import "./mobile.css";

const native = Capacitor.isNativePlatform();
document.body.classList.add("mobile-app");
let keyboardVisible = false;
const app = document.querySelector<HTMLElement>("#mobile-app")!;
app.dataset.connected = "false";
const icon = (name: string) => `<i data-lucide="${name}" aria-hidden="true"></i>`;
app.innerHTML = `
  <header class="mobile-header"><button type="button" data-action="pages" aria-label="Open pages">${icon("panel-left")}</button><img src="${notdownIcon}" alt="" class="mobile-logo"><strong>Notdown</strong><span class="mobile-offline">${native ? "On device" : "Browser preview"}</span><button type="button" data-action="more" aria-label="Notebook options">${icon("ellipsis")}</button></header>
  <div class="mobile-page-meta" hidden><input id="mobile-title" aria-label="Page title" maxlength="500" spellcheck="false"><div class="mobile-page-info"><span id="mobile-save-state" role="status" aria-live="polite"></span><div class="mobile-modes" role="group" aria-label="Editing view"><button type="button" data-view="document" aria-pressed="true">Page</button><button type="button" data-view="source" aria-pressed="false">Source</button></div></div></div>
  <div id="mobile-recovery" hidden><span></span><button type="button" data-action="recover-copy">Save draft as new page</button><button type="button" data-action="retry">Retry save</button></div>
  <main id="mobile-content"><div class="mobile-empty"><img src="${notdownIcon}" alt=""><h1>Connect your cloud notebook</h1><p>Use the same cloud notebook as your computer.</p><button type="button" class="mobile-primary" data-action="sync">Set up cloud sync</button></div><div id="mobile-workspace" hidden></div></main>
  <nav class="mobile-tools" aria-label="Editing tools" hidden></nav>
  <section id="mobile-tool-panel" class="mobile-tool-panel" role="region" hidden></section>
  <dialog id="mobile-pages" class="mobile-drawer" aria-label="Pages"><div class="mobile-dialog-heading"><h2>Pages</h2><button type="button" data-close aria-label="Close pages">${icon("x")}</button></div><input id="mobile-search" type="search" aria-label="Search pages" placeholder="Search your notes…"><button type="button" class="mobile-new-page" data-action="new">${icon("plus")} New page</button><div id="mobile-page-list"></div><div class="mobile-drawer-footer"><button type="button" data-action="import">${icon("folder-input")} Import</button><button type="button" data-action="export">${icon("archive")} Export ZIP</button></div><p class="mobile-storage-note">An offline copy of your cloud notebook. Export a separate backup before uninstalling.</p></dialog>
  <dialog id="mobile-menu" class="mobile-sheet" aria-labelledby="mobile-menu-title"><div class="mobile-dialog-heading"><h2 id="mobile-menu-title">Notebook</h2><button type="button" data-close aria-label="Close menu">${icon("x")}</button></div><div id="mobile-menu-items"></div></dialog>
  <input id="mobile-import" type="file" accept=".md,.markdown,.qmd,.rmd" multiple hidden>
  <input id="mobile-image" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" hidden>
  <div id="mobile-notice" aria-live="polite" hidden></div>`;
refreshIcons();
const title = app.querySelector<HTMLInputElement>("#mobile-title")!;
const drawer = app.querySelector<HTMLDialogElement>("#mobile-pages")!;
const menu = app.querySelector<HTMLDialogElement>("#mobile-menu")!;
const mount = app.querySelector<HTMLElement>("#mobile-workspace")!;
const search = app.querySelector<HTMLInputElement>("#mobile-search")!;
const databaseMount = document.createElement("div"); databaseMount.id = "mobile-databases"; databaseMount.hidden = true;
const wikiNavigation = document.createElement("nav"); wikiNavigation.className = "database-view-tabs wiki-home-tabs"; wikiNavigation.hidden = true;
const recordProperties = document.createElement("section"); recordProperties.id = "mobile-record-properties"; recordProperties.hidden = true;
mount.before(wikiNavigation, recordProperties); mount.after(databaseMount);
const databaseButtons = document.createElement("div"); databaseButtons.className = "mobile-database-buttons";
databaseButtons.innerHTML = `<button type="button" data-action="databases">${icon("table-2")} Databases</button><button type="button" data-action="new-database">${icon("plus")} New database</button>`;
app.querySelector(".mobile-new-page")!.after(databaseButtons);

let platform: VaultPlatform;
let vault: MobileVault;
let vaultId = "main";
let pages: Page[] = [];
let databases: Database[] = [];
let databaseWorkspace: DatabaseWorkspace | undefined;
let databaseRoute: { id?: string } | undefined;
let recordSource: DatabaseDataSource | undefined;
let recordMetadata = "";
let viewHash = "";
const collapsedPages = new Set<string>();
let renderedPages: Page[] | undefined;
let renderedQuery = "";
let pageListDirty = true;
let workspace: MarkdownWorkspace | undefined;
let session: MobileDraftSession | undefined;
let timer: ReturnType<typeof setTimeout>;
let noticeTimer: ReturnType<typeof setTimeout>;
let operation = Promise.resolve();
let attachmentPage: string | undefined;
let stopSync: (() => void) | undefined;
let syncDialog: HTMLDialogElement | undefined;
let setupRequired = true;
const assets = new MobileAssetLoader(key => vault.readAsset(key), (key, url) => refreshMobileAssetDisplays(app, key, url));
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
  return operation;
}
async function refreshPages() {
  [pages, databases] = await Promise.all([vault.list(), vault.databases.list()]);
  setExternalLibrary(await vault.externalEntities.list());
  pageListDirty = true;
}
function rememberRoute(hash: string) {
  viewHash = hash; history.replaceState(null, "", hash);
  localStorage.setItem(`notdown-mobile-last-route:${vaultId}`, hash);
}
function databaseChanged(saved: Page) {
  const index = pages.findIndex(page => page.id === saved.id);
  if (index < 0) pages.push(saved); else pages[index] = saved;
  pageListDirty = true;
  if (drawer.open) renderPages();
}
function closeDialogs() { drawer.close(); menu.close(); syncDialog?.close(); }
function dismissKeyboard() {
  const focused = document.activeElement;
  const editing = focused instanceof HTMLElement && (focused.isContentEditable || focused.matches("input, textarea, select"));
  if (editing) focused.blur();
  if (!native) keyboardVisible = false;
  if (native) void NativeVault.hideKeyboard().catch(tell);
  return editing;
}
setAssetDisplayResolver(raw => assets.resolve(raw));
function renderState() {
  if (!session) return;
  const failure = session.failure;
  app.querySelector("#mobile-save-state")!.textContent = failure ? "Draft needs attention" : session.saving ? "Saving…" : session.dirty ? (session.recovered ? "Recovered draft" : "Unsaved changes") : "Saved on this device";
  const recovery = app.querySelector<HTMLElement>("#mobile-recovery")!;
  recovery.hidden = !failure;
  recovery.querySelector("span")!.textContent = failure instanceof Error ? failure.message : failure ? String(failure) : "";
  const index = pages.findIndex(page => page.id === session!.draft.id);
  if (index >= 0) {
    const previous = pages[index], next = session.draft;
    if (previous.title !== next.title || previous.icon !== next.icon || previous.parent !== next.parent ||
        previous.sidebarOrder !== next.sidebarOrder || previous.trashed !== next.trashed ||
        (search.value.trim() && (previous.body !== next.body || previous.updated !== next.updated))) pageListDirty = true;
    pages[index] = { ...next };
  }
  if (drawer.open) renderPages();
  renderRecordProperties();
}
function change(source: string, config: SyntaxConfig) {
  if (!session) return;
  const syntax = !session.draft.syntax && JSON.stringify(config) === JSON.stringify(defaultSyntax(session.draft.bodyFormat)) ? undefined : config;
  try { session.change({ body: source, syntax, title: title.value.trim() || session.draft.title }); }
  catch (error) { tell(`Recovery storage is unavailable: ${error instanceof Error ? error.message : error}. Keep the app open until saving succeeds.`); }
  clearTimeout(timer); timer = setTimeout(() => { void save().catch(tell); }, 300);
  editingTools.schedule();
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
  if (databaseWorkspace && !await databaseWorkspace.flush()) return false;
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
  const activeId = databaseRoute?.id ? (databases.find(item => item.id === databaseRoute!.id)?.pageId ?? databaseRoute.id) : session?.draft.id;
  if (renderedPages === pages && renderedQuery === search.value && !pageListDirty) {
    for (const button of target.querySelectorAll<HTMLButtonElement>("[data-page-id]"))
      button.setAttribute("aria-current", String(button.dataset.pageId === activeId));
    return;
  }
  renderedPages = pages; renderedQuery = search.value; pageListDirty = false;
  target.replaceChildren();
  const searching = !!search.value.trim();
  const tree = databaseTree(pages, databases).pages;
  const rows = searching ? searchPages(tree, search.value).map(page => ({ page, depth: 0, hasChildren: false })) : mobilePageTree(tree, collapsedPages);
  for (const { page, depth, hasChildren } of rows) {
    const row = document.createElement("div"); row.className = "mobile-page-tree-row";
    row.dataset.depth = String(depth); row.style.setProperty("--depth", String(depth));
    if (hasChildren) {
      const toggle = document.createElement("button"); toggle.type = "button"; toggle.className = "mobile-page-toggle";
      toggle.setAttribute("aria-label", `Expand or collapse ${page.title}`);
      toggle.setAttribute("aria-expanded", String(!collapsedPages.has(page.id)));
      toggle.innerHTML = icon(collapsedPages.has(page.id) ? "chevron-right" : "chevron-down");
      toggle.onclick = () => { collapsedPages.has(page.id) ? collapsedPages.delete(page.id) : collapsedPages.add(page.id); pageListDirty = true; renderPages(); };
      row.append(toggle);
    } else {
      const spacer = document.createElement("span"); spacer.className = "mobile-page-toggle-space"; row.append(spacer);
    }
    const button = document.createElement("button"); button.type = "button"; button.className = "mobile-page-row";
    button.dataset.pageId = page.id; button.setAttribute("aria-current", String(page.id === activeId));
    button.append(pageIconElement(page.icon));
    const text = document.createElement("span"); text.textContent = page.title; button.append(text);
    button.onclick = () => enqueue(async () => {
      if (await leavePage()) { if (session?.draft.id === page.id) closeDialogs(); else await openPage(page.id); }
    });
    row.append(button); target.append(row);
  }
  if (!target.childElementCount) target.textContent = search.value ? "No matching pages." : "Your notebook is empty.";
  refreshIcons();
}
async function openPage(id: string): Promise<void> {
  const database = databases.find(item => (item.pageId ?? item.id) === id);
  if (database && !isWikiDatabase(database)) return openDatabases(database.id);
  const page = await vault.get(id);
  if (page.databaseId && !isWikiDatabase(database)) return openDatabases(page.databaseId);
  const selectedVault = vault;
  const source = page.dataSourceId ? await vault.databases.getSource(page.dataSourceId) : undefined;
  const nextSession = new MobileDraftSession(page, draftKey(page.id), localStorage,
    async (id, input, revision, schemaRevision) => selectedVault.update(id, input, revision, schemaRevision),
    () => { if (session === nextSession) renderState(); }, source?.revision);
  editingTools.reset(); workspace?.destroy(); databaseWorkspace?.destroy(); databaseWorkspace = undefined; databaseRoute = undefined;
  databaseMount.hidden = true; databaseMount.replaceChildren(); recordSource = source; recordMetadata = "";
  session = nextSession; title.value = session.draft.title;
  closeDialogs(); app.querySelector<HTMLElement>(".mobile-empty")!.hidden = true;
  mount.hidden = false; app.querySelector<HTMLElement>(".mobile-page-meta")!.hidden = false;
  app.querySelector<HTMLElement>(".mobile-tools")!.hidden = false;
  workspace = new MarkdownWorkspace(mount, {
    interactionMode: "touch",
    canTouchDrag: () => !keyboardVisible && !editingTools.panelOpen && !document.querySelector("dialog[open]") && workspace?.activePane === "document",
    source: session.draft.body, config: session.draft.syntax ?? defaultSyntax(session.draft.bodyFormat),
    mode: "document", pages: () => pages, currentPage: () => session?.draft,
    onChange: change, onError: tell, onInsert: showInsert, onSavePage: save,
    onMode: mode => updateMode(mode),
    onOpenPage: (id, reference) => enqueue(async () => { if (await leavePage()) { await openPage(id); if (reference) workspace?.blocks.scrollToReference(reference); } }),
    onCreatePage: async (name, parent) => vault.create({ title: name, parent, body: "", syntax: { ...defaultSyntax(), variant: "notdown" } }),
  });
  updateMode("document"); renderState();
  const wiki = databases.find(item => isWikiDatabase(item) && (item.pageId === id || item.homePageId === id));
  wikiNavigation.replaceChildren(); wikiNavigation.hidden = !wiki;
  if (wiki) {
    const home = document.createElement("button"); home.textContent = "Home"; home.setAttribute("aria-current", "page");
    const all = document.createElement("button"); all.textContent = "All pages"; all.onclick = () => { void enqueue(async () => { if (await leavePage()) await openDatabases(wiki.id, true); }); };
    wikiNavigation.append(home, all);
  }
  localStorage.setItem(`notdown-mobile-last-page:${vaultId}`, id);
  rememberRoute(`#page/${encodeURIComponent(id)}`);
  app.querySelector<HTMLElement>("#mobile-content")!.scrollTop = 0;
}
function renderRecordProperties() {
  if (!recordSource || !session) { recordProperties.hidden = true; recordProperties.replaceChildren(); return; }
  const draft = session.draft;
  let metadata: Record<string, unknown>;
  try { metadata = documentMetadata(draft.body).values; }
  catch { recordMetadata = ""; recordProperties.hidden = true; return; }
  const signature = JSON.stringify([draft.id, draft.title, metadata]);
  if (recordMetadata === signature) return;
  recordMetadata = signature; recordProperties.hidden = false; recordProperties.replaceChildren();
  const owner = databases.find(database => database.dataSourceIds.includes(recordSource!.id));
  if (owner) {
    const back = document.createElement("button"); back.type = "button"; back.textContent = "← Back to database";
    back.onclick = () => { void enqueue(async () => { if (await leavePage()) await openDatabases(owner.id); }); }; recordProperties.append(back);
  }
  for (const field of recordSource.properties.filter(field => field.type !== "title")) {
    const row = document.createElement("div"); row.className = "database-page-property";
    const label = document.createElement("span"); label.textContent = field.name;
    const nested = metadata.properties && typeof metadata.properties === "object" ? metadata.properties as Record<string, unknown> : {};
    const value = Object.hasOwn(nested, field.key) ? nested[field.key] : Object.hasOwn(metadata, field.key) ? metadata[field.key] : draft.properties[field.key];
    const cell = propertyInput(field, draft, value, value => {
      if (session?.draft.id !== draft.id) return;
      const current = session.draft;
      session.change({ body: current.body, title: current.title, syntax: current.syntax, properties: { ...current.properties, [field.key]: value } });
      clearTimeout(timer); timer = setTimeout(() => { void save().catch(tell); }, 300);
    });
    row.append(label, cell); recordProperties.append(row);
  }
}
async function openDatabases(id?: string, showPages = false): Promise<void> {
  // Resolve before destroying the current editor so a failed read keeps its draft visible.
  if (id) { const snapshot = await vault.databases.get(id); if (isWikiDatabase(snapshot.database) && !showPages) return openPage(typeof snapshot.database.homePageId === "string" ? snapshot.database.homePageId : snapshot.database.pageId ?? id); }
  editingTools.reset(); workspace?.destroy(); workspace = undefined; session = undefined; recordSource = undefined;
  databaseWorkspace?.destroy(); databaseRoute = { id };
  mount.hidden = true; recordProperties.hidden = true; databaseMount.hidden = false;
  wikiNavigation.hidden = true;
  for (const selector of [".mobile-page-meta", ".mobile-tools", "#mobile-recovery", ".mobile-empty"]) app.querySelector<HTMLElement>(selector)!.hidden = true;
  closeDialogs();
  databaseWorkspace = new DatabaseWorkspace(databaseMount, {
    vaultKey: vault.vaultPath, interactionMode: "touch", changed: databaseChanged,
    openPage: id => enqueue(async () => { if (await leavePage()) await openPage(id); }),
    openDatabase: id => enqueue(async () => { if (await leavePage()) await openDatabases(id); }),
    createDatabase: () => enqueue(() => createDatabase()),
    createWiki: () => enqueue(() => createDatabase(undefined, "wiki")),
    undoWiki: snapshot => enqueue(async () => {
      await vault.databases.undoWiki(snapshot.database.id, { baseRevision: snapshot.database.revision, hostRevision: snapshot.hostPage!.revision });
      await refreshPages(); await openPage(snapshot.hostPage!.id);
    }),
  });
  await databaseWorkspace.load(id);
  rememberRoute(id ? `#database/${encodeURIComponent(id)}${showPages ? "#pages" : ""}` : "#databases");
  app.querySelector<HTMLElement>("#mobile-content")!.scrollTop = 0;
}
async function createDatabase(mode?: "full" | "inline", kind: "database" | "wiki" = "database") {
  if (setupRequired || !await leavePage()) return;
  const owner = mode ? session?.draft : undefined;
  if (mode && (!owner || !workspace)) return;
  if (mode === "inline" && !commandEnabled(workspace!.session.snapshot.config, "database_inline")) return;
  app.inert = true;
  try {
    const snapshot = await vault.databases.create({ title: kind === "wiki" ? "New wiki" : "New database", kind, parent: owner?.id ?? null, ...(owner ? { parentRevision: owner.revision } : {}) });
    await refreshPages();
    if (owner && workspace) {
      collapsedPages.delete(owner.id);
      const reference = commandEnabled(workspace.session.snapshot.config, "database_inline")
        ? databaseReference(snapshot.database.pageId ?? snapshot.database.id, "", mode === "inline", kind === "wiki")
        : `[${snapshot.database.title}](#database/${snapshot.database.id})`;
      workspace.insert(`\n${reference}\n`);
      if (!await save()) { tell("Database created in Pages. Its reference remains in your unsaved draft."); return; }
    }
    if (mode !== "inline") await openDatabases(snapshot.database.id);
  } finally { app.inert = false; }
}
function updateMode(mode: EditMode) {
  // These are exclusive views; toolbar actions follow the visible pane even
  // before the user taps into its editor and triggers focusin.
  if (workspace && mode !== "split") workspace.activePane = mode;
  for (const button of app.querySelectorAll<HTMLButtonElement>("[data-view]")) button.setAttribute("aria-pressed", String(button.dataset.view === mode));
  editingTools.reset();
}
async function refreshNotebookName() {
  const status = await vault.sync.status();
  app.querySelector(".mobile-header strong")!.textContent = status.vaultName || "Notdown";

}
async function switchVault(id: string, supplied?: MobileVault) {
  stopSync?.();
  const next = supplied ?? createVault(`/vaults/${id}`, platform, { syncFetch: native ? nativeSyncFetch : undefined, privateReplica: true });
  const [loaded, resources, references] = await Promise.all([next.list(), next.databases.list(), next.externalEntities.list()]);
  editingTools.reset(); workspace?.destroy(); workspace = undefined; session = undefined;
  databaseWorkspace?.destroy(); databaseWorkspace = undefined; databaseRoute = undefined; recordSource = undefined;
  databaseMount.hidden = true; databaseMount.replaceChildren(); recordProperties.hidden = true;
  assets.clear();
  if (vaultId !== id) collapsedPages.clear();
  vaultId = id; vault = next; pages = loaded; databases = resources;
  setExternalLibrary(references);
  await refreshPeople();
  setupRequired = !mobileNotebookReady(await next.sync.status());
  app.dataset.connected = String(!setupRequired);
  const empty = app.querySelector<HTMLElement>(".mobile-empty")!;
  empty.innerHTML = setupRequired
    ? `<img src="${notdownIcon}" alt=""><h1>Connect your cloud notebook</h1><p>Use the same cloud notebook as your computer.</p><button type="button" class="mobile-primary" data-action="sync">Set up cloud sync</button>`
    : `<img src="${notdownIcon}" alt=""><h1>Your notebook is connected.</h1><p>New pages sync with your computer.</p><button type="button" class="mobile-primary" data-action="new">Create a page</button>`;
  if (!setupRequired) stopSync = installSyncScheduler(syncHooks(next));
  localStorage.setItem("notdown-mobile-active-vault", id);
  await refreshNotebookName(); search.value = ""; renderPages();
  if (setupRequired) {
    mount.hidden = true; mount.replaceChildren(); empty.hidden = false;
    for (const selector of [".mobile-page-meta", ".mobile-tools", "#mobile-recovery"]) app.querySelector<HTMLElement>(selector)!.hidden = true;
    await showSync(); return;
  }
  const last = localStorage.getItem(`notdown-mobile-last-page:${id}`);
  const route = localStorage.getItem(`notdown-mobile-last-route:${id}`), databaseId = route?.match(/^#database\/([^#]+)(?:#pages)?$/)?.[1];
  if (route === "#databases" || databaseId && databases.some(item => item.id === decodeURIComponent(databaseId))) await openDatabases(databaseId ? decodeURIComponent(databaseId) : undefined, route?.endsWith("#pages"));
  else if (pages.length) await openPage(pages.find(page => page.id === last)?.id ?? pages[0].id);
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
      if (setupRequired) {
        if (mobileNotebookReady(await selectedVault.sync.status())) {
          await switchVault(vaultId, selectedVault);
          syncDialog?.close(); syncDialog?.remove(); syncDialog = undefined;
        }
        return;
      }
      const active = session, activeDatabase = databaseRoute;
      const [latest, resources, references] = await Promise.all([selectedVault.list(), selectedVault.databases.list(), selectedVault.externalEntities.list()]);
      if (selectedVault !== vault) return;
      setExternalLibrary(references);
      await refreshPeople();
      if (selectedVault !== vault || session !== active || databaseRoute !== activeDatabase || !capture() || session?.dirty || session?.saving || session?.failure || databaseWorkspace?.dirty || workspace?.blocks.databaseViewsDirty) return;
      pages = latest; databases = resources; pageListDirty = true; renderPages();
      const current = latest.find(page => page.id === active?.draft.id);
      // Inline databases and record schemas can change independently of their host page.
      if (!activeDatabase && current && active && !current.dataSourceId && current.revision === active.base.revision && !mount.querySelector(".pm-object-database")) return;
      if (!activeDatabase && !active && !latest.length) return;
      // Only the short local reload is inert; typing during the network transfer remains editable and recoverable.
      mount.inert = true; databaseMount.inert = true; title.disabled = true;
      const reopenSync = syncDialog?.open;
      try {
        assets.clear();
        if (activeDatabase && (!activeDatabase.id || resources.some(item => item.id === activeDatabase.id))) await openDatabases(activeDatabase.id);
        else if (activeDatabase) await openDatabases();
        else if (current) await openPage(current.id);
        else if (!active && latest.length) await openPage(latest[0].id);
        else if (active) await switchVault(vaultId, selectedVault);
      } finally { mount.inert = false; databaseMount.inert = false; title.disabled = false; if (reopenSync && syncDialog?.isConnected && !syncDialog.open) syncDialog.showModal(); }
    },
  };
}
async function showSync() {
  if (!await leavePage()) return;
  closeDialogs(); syncDialog?.remove();
  syncDialog = document.createElement("dialog"); syncDialog.className = "mobile-sync-dialog"; syncDialog.setAttribute("aria-label", "Cloud sync");
  syncDialog.addEventListener("cancel", event => { if (setupRequired) event.preventDefault(); });
  const close = document.createElement("button"); close.type = "button"; close.className = "secondary-button"; close.textContent = "Close"; close.onclick = () => syncDialog?.close();
  close.hidden = setupRequired;
  syncDialog.append(close); app.append(syncDialog); syncDialog.showModal();
  await mountSyncSettings(syncDialog, syncHooks(vault), { existingOnly: true, onStatus: async status => {
    if (!mobileNotebookReady(status) && !setupRequired) await switchVault(vaultId, vault);
  } });
}
async function newPage() {
  if (setupRequired) { await showSync(); return; }
  if (!await leavePage()) return;
  const page = await vault.create({ title: "Untitled page", body: "", syntax: { ...defaultSyntax(), variant: "notdown" } });
  pages = await vault.list(); await openPage(page.id); workspace?.blocks.focus();
}
function showMenu(heading: string, buttons: { label: string; action: () => void; disabled?: boolean; danger?: boolean }[], note?: string) {
  editingTools.closePanel();
  dismissKeyboard();
  closeDialogs(); app.querySelector("#mobile-menu-title")!.textContent = heading;
  const container = app.querySelector<HTMLElement>("#mobile-menu-items")!; container.replaceChildren();
  if (note) { const text = document.createElement("p"); text.className = "mobile-sheet-note"; text.textContent = note; container.append(text); }
  for (const item of buttons) { const button = document.createElement("button"); button.type = "button"; button.textContent = item.label; button.disabled = !!item.disabled; if (item.danger) button.className = "mobile-danger"; button.onclick = () => { menu.close(); item.action(); }; container.append(button); }
  container.scrollTop = 0;
  menu.showModal();
}

function mountDialectPicker() {
  if (!workspace || !session) return;
  const target = workspace, draft = session;
  const field = document.createElement("label"); field.className = "mobile-dialect-field";
  field.textContent = "Page dialect";
  const select = document.createElement("select");
  select.setAttribute("aria-label", "Page dialect");
  for (const group of dialectGroups) {
    const options = document.createElement("optgroup"); options.label = group.label;
    for (const dialect of group.dialects) options.append(new Option(dialect.label, dialect.id));
    select.append(options);
  }
  select.value = target.session.snapshot.config.variant;
  select.onchange = () => {
    const variant = select.value as SyntaxConfig["variant"];
    select.disabled = true;
    void enqueue(async () => {
      try {
        if (workspace !== target || session !== draft) return;
        if (!await save()) {
          tell("The dialect was not changed. Finish the current input or resolve the save problem first.");
          return;
        }
        const config = target.session.snapshot.config;
        if (config.variant === variant) return;
        target.configure({ ...config, variant, extensions: resetExtensions(config) });
        if (!await save()) tell("The changed dialect is kept in your recovery draft. Resolve the save problem before leaving this page.");
      } finally {
        select.value = target.session.snapshot.config.variant;
        select.disabled = false;
      }
    });
  };
  field.append(select);
  app.querySelector("#mobile-menu-items > button")!.before(field);
}
type TouchSelection = NonNullable<ReturnType<MarkdownWorkspace["blocks"]["touchSelection"]>>;
function touchSelection() {
  const selection = workspace?.blocks.touchSelection();
  if (!selection) tell("Finish the current input before opening editing tools.");
  return selection;
}
function applied(success: boolean) { if (!success) tell("The content changed or this action is unavailable. Tap the content and try again."); }
function showInsert(convert = false, selected?: TouchSelection) {
  closeDialogs(); editingTools.openBlocks(convert, selected);
}
function showBlockActions() {
  if (!workspace || workspace.activePane !== "document") return;
  const selection = touchSelection();
  if (!selection) return;
  const buttons = [
    { label: "Turn into…", disabled: !selection.canConvert, action: () => showInsert(true, selection) },
    ...([["insert-after", "Insert text below"], ["up", "Move up"], ["down", "Move down"], ["indent", "Indent"], ["outdent", "Outdent"], ["duplicate", "Duplicate block"], ["delete", "Delete block"]] as const).map(([action, label]) => ({
      label, disabled: !selection.can(action), danger: action === "delete", action: () => applied(selection.run(action)),
    })),
  ];
  if (selection.inTable) buttons.splice(1, 0, ...([["row-after", "Insert row below"], ["column-after", "Insert column right"], ["delete-row", "Delete row"], ["delete-column", "Delete column"]] as const).map(([action, label]) => ({
    label, disabled: !selection.canTable(action), danger: action.startsWith("delete"), action: () => applied(selection.table(action)),
  })));
  showMenu("Block actions", buttons, [selection.label, selection.preview].filter(Boolean).join(" · "));
}
function selectImage() {
  if (!workspace || !session) return;
  workspace.blocks.captureSelection(); attachmentPage = session.draft.id;
  app.querySelector<HTMLInputElement>("#mobile-image")!.click();
}
const editingTools = new MobileEditingToolbar(app.querySelector(".mobile-tools")!, app.querySelector("#mobile-tool-panel")!, {
  workspace: () => workspace,
  hideKeyboard: () => { dismissKeyboard(); enqueue(save); },
  image: selectImage, more: showBlockActions, error: tell,
  database: mode => { void enqueue(() => createDatabase(mode === "wiki" ? "full" : mode, mode === "wiki" ? "wiki" : "database")); },
});
mount.addEventListener("pointerdown", () => editingTools.closePanel(), { capture: true });
for (const name of ["editor-selection-change", "input", "compositionstart", "compositionend", "focusin"])
  mount.addEventListener(name, () => editingTools.schedule());
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
  pages: () => { editingTools.closePanel(); dismissKeyboard(); renderPages(); drawer.showModal(); }, new: newPage,
  databases: async () => { if (await leavePage()) await openDatabases(); },
  "new-database": () => createDatabase(),
  more: () => {
    showMenu("Notebook", [
      { label: "New page", action: () => enqueue(newPage) },
      { label: "Databases", action: () => enqueue(async () => { if (await leavePage()) await openDatabases(); }) },
      { label: "New database", action: () => enqueue(() => createDatabase()) },
      { label: "New wiki", action: () => enqueue(() => createDatabase(undefined, "wiki")) },
      ...(session && !session.draft.databaseId && !session.draft.dataSourceId ? [{ label: "Turn into wiki", action: () => enqueue(async () => { if (!await leavePage() || !session) return; const page = session.base; await vault.databases.turnIntoWiki(page.id, page.revision); await refreshPages(); await openPage(page.id); }) }] : []),
      ...(session?.draft.wiki ? [{ label: "Undo wiki", action: () => enqueue(async () => { if (!await leavePage() || !session) return; const page = session.base, snapshot = await vault.databases.get(page.databaseId!); await vault.databases.undoWiki(snapshot.database.id, { baseRevision: snapshot.database.revision, hostRevision: page.revision }); await refreshPages(); await openPage(page.id); }) }] : []),
      { label: "Import Markdown", action: () => actions.import() },
      { label: "Export notebook ZIP", action: () => enqueue(backup) },
      { label: "Cloud sync", action: () => enqueue(showSync) },
    ], "Notes are saved on this device. Cloud sync runs while the app is open. Export a separate backup before uninstalling.");
    mountDialectPicker();
  },
  sync: showSync,
  save: async () => { await save(); }, retry: async () => { if (capture()) await session?.retry(); },
  "recover-copy": copyRecovery,
  import: () => { closeDialogs(); app.querySelector<HTMLInputElement>("#mobile-import")!.click(); }, export: backup,
};
app.addEventListener("click", event => {
  if (app.dataset.ready !== "true") return;
  const button = (event.target as Element).closest<HTMLButtonElement>("button"); if (!button) return;
  if (button.hasAttribute("data-close")) { button.closest("dialog")?.close(); return; }
  if (setupRequired && button.dataset.action && button.dataset.action !== "sync") { enqueue(showSync); return; }
  if (button.dataset.view) {
    const mode = button.dataset.view as EditMode;
    enqueue(async () => {
      if (!capture() || !workspace) return;
      if (await workspace.setMode(mode)) updateMode(mode);
      await session?.save();
    });
    return;
  }
  const action = button.dataset.action && actions[button.dataset.action]; if (action) enqueue(async () => { await action(); });
});
search.oninput = renderPages;
title.oninput = () => {
  if (!session || !workspace || !title.value.trim()) return;
  workspace.setPageTitle(title.value.trim());
  const snapshot = workspace.capture(); change(snapshot.source, snapshot.config);
};
title.onblur = () => { if (!title.value.trim()) title.value = session?.draft.title ?? ""; };

for (const dialog of [drawer, menu]) dialog.addEventListener("click", event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } });
app.querySelector<HTMLInputElement>("#mobile-import")!.onchange = event => {
  const input = event.target as HTMLInputElement, files = Array.from(input.files ?? []); input.value = "";
  enqueue(async () => {
    if (!files.length || setupRequired || !await leavePage()) return;
    if (files.some(file => /\.zip$/i.test(file.name))) {
      throw new Error("Restore vault ZIP backups on your computer, then sync the existing cloud notebook here.");
    } else {
      let last: Page | undefined;
      for (const file of files) {
        if (!/\.(md|markdown|rmd|qmd)$/i.test(file.name) || file.size > 10 * 1024 * 1024) throw new Error("Choose Markdown files smaller than 10 MB.");
        const variant = /\.rmd$/i.test(file.name) ? "rmarkdown" : /\.qmd$/i.test(file.name) ? "quarto" : "notdown";
        const body = Buffer.from(await file.arrayBuffer()).toString("utf8");
        const declared = documentMetadata(body).values.syntax;
        const syntax: SyntaxConfig = validSyntax(declared) ? declared : { ...defaultSyntax(), variant };
        last = await vault.create({ title: file.name.replace(/\.[^.]+$/, "").slice(0, 500) || "Imported page", body, syntax, bodyFormat: syntaxFormat(syntax) });
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
    await assets.load(uploaded.path);
    workspace.insert(mediaInsertMarkdown("image", uploaded.name, uploaded.path, workspace.session.snapshot.config));
    await save();
  });
};
window.addEventListener("notdown:keyboard-dismiss", () => { dismissKeyboard(); enqueue(save); });
window.addEventListener("notdown:keyboard-state", event => {
  // Capacitor attaches event data directly to the Event (not CustomEvent.detail).
  keyboardVisible = (event as Event & { visible?: boolean }).visible === true;
});
// Browser previews have no native IME insets; editing focus is their fallback.
if (!native) app.addEventListener("focusin", event => {
  if (event.target instanceof HTMLElement && (event.target.isContentEditable || event.target.matches("input, textarea"))) keyboardVisible = true;
});
window.addEventListener("notdown:back", () => {
  // Check synchronously, before an outstanding save or sync can delay dismissal.
  if (!native && dismissKeyboard()) { enqueue(save); return; }
  enqueue(async () => {
    if (setupRequired) { if (native) await NativeVault.background(); return; }
    if (syncDialog?.open) { syncDialog.close(); return; }
    const databaseDialog = document.querySelector<HTMLDialogElement>(".database-dialog[open]");
    if (databaseDialog) { databaseDialog.close(); return; }
    if (menu.open) { menu.close(); return; }
    if (editingTools.backOneLevel()) return;
    if (drawer.open) { drawer.close(); if (native && await leavePage()) await NativeVault.background(); return; }
    if (await leavePage()) { renderPages(); drawer.showModal(); }
  });
});
document.addEventListener("visibilitychange", () => { if (document.hidden) void save().catch(tell); });
app.addEventListener("compositionend", () => { setTimeout(() => { void save().catch(tell); }, 0); });
window.addEventListener("pagehide", () => { capture(); });
window.addEventListener("beforeunload", event => { capture(); if (session?.dirty || databaseWorkspace?.dirty || workspace?.blocks.databaseViewsDirty) { event.preventDefault(); event.returnValue = ""; } });
window.addEventListener("hashchange", () => {
  const requested = location.hash;
  if (requested === viewHash || app.dataset.ready !== "true") return;
  // Restore the visible route until pending edits have passed their original CAS checks.
  history.replaceState(null, "", viewHash || location.pathname);
  void enqueue(async () => {
    if (!await leavePage()) return;
    if (requested === "#databases") await openDatabases();
    else {
      const route = requested.match(/^#(page|database)\/([^#]+)(?:#pages)?$/);
      if (route?.[1] === "database") await openDatabases(decodeURIComponent(route[2]), requested.endsWith("#pages"));
      else if (route) await openPage(decodeURIComponent(route[2]));
    }
  });
});
document.addEventListener("notdown-database-record-saved", event => {
  const saved = (event as CustomEvent<Page>).detail;
  if (saved?.id) databaseChanged(saved);
});
document.addEventListener("notdown-database-updated", event => {
  const snapshot = (event as CustomEvent).detail;
  if (!snapshot?.database?.id) return;
  databases = databases.map(database => database.id === snapshot.database.id ? snapshot.database : database);
  if (snapshot.hostPage) databaseChanged(snapshot.hostPage);
});
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
  // Preserve existing installs' selected cache; new installs use one cloud replica.
  await switchVault(active && /^[a-zA-Z0-9-]{1,64}$/.test(active) ? active : "main");
  if (native) {
    await NativeVault.addListener("pause", () => { void save().catch(tell); });
    await NativeVault.addListener("resume", () => { void refreshNotebookName().catch(tell); });
  }
  app.dataset.ready = "true";
}
document.addEventListener(openPeopleEvent, event => openPeople((event as CustomEvent).detail));
void start().catch(error => { tell(error); app.dataset.ready = "error"; });
