import { commentDialog } from "../editor/comment-dialog";
import { lastExecutableLanguage, rememberExecutableLanguage } from "../editor/executable-language";
import { internalReference, resolveReferencePage, type InternalReference, type ReferenceSyntax } from "../document/internal-reference";
import { mountReferencePicker } from "../features/links/reference-picker";
import { graphHTML, mountGraph } from "../features/pages/graph-view";
import { openImportDialog } from "../features/vault/import-dialog";
import { openNotionImportDialog } from "../features/vault/notion-import-dialog";
import { DatabaseWorkspace, propertyInput } from "../features/databases/database-workspace";
import type { Database, DatabaseDataSource, DatabaseSnapshot } from "../features/databases/database-model";
import { databaseTree } from "../features/databases/database-tree";
import { databaseReference } from "../features/databases/database-reference";
import { installDesktopCloseGuard } from "../features/vault/desktop-bridge";
import { openVaultManager } from "../features/vault/vault-manager";
import { applySidebarPreferences, mountSidebarPreferences } from "./sidebar-preferences";
import { WorkspaceTabs, renderWorkspaceTabs } from "./workspace-tabs";
import { mountApplicationMenu } from "./application-menu";
import "./workspace-tabs.css";
import { vaultAssetUrl, vaultPageUrl, vaultPrefix } from "../shared/vault-url";
import { sourceFileMenu, handleSourceFile } from "../features/pages/source-file";
import { mountConflictDiff } from "../features/pages/conflict-diff";
import "../features/pages/conflict-diff.css";
import { insertMenuItems } from "../editor/insert-menu";
import { isMediaInsertKind, mediaAccept, mediaFileMatches, mediaInsertMarkdown } from "../blocks/media-insert";
import { codeInputMode, setCodeInputMode, lastCodeLanguage, type CodeInputMode } from "../editor/code-input-preferences";
import { numberedListDisplay, setNumberedListDisplay, type NumberedListDisplay } from "../editor/numbered-list-display";
import { inlineObjectDialog } from "../editor/inline-object-dialog";
import { inlineObjectCommands, type InlineObjectCommand } from "../document/inline-objects";
import { footnoteChoices, type FootnoteInput } from "../editor/footnotes";
import { contentCommand } from "../document/content-objects";
import { documentPageTitle, renameDocumentPageSource } from "../features/metadata/pandoc-page-title";
import { openCalloutIconPicker } from "../blocks/callout-icon-picker";
import { pageIconElement } from "../shared/page-icons";
import { emojiStyle, emojiStyleOptions, initializeEmojiStyle, setEmojiStyle, type EmojiStyle } from "../blocks/emoji-style";
import { nextExampleLabel } from "../document/example-numbering";
import { objectSamples } from "../document/object-model";
import { insertFormats } from "../editor/insert-format";
import { mountServiceSettings } from "./service-settings";
import { mountRuntimeSettings } from "./runtime-settings";
import { mountSyncSettings, installSyncScheduler } from "../features/vault/sync-settings";
import { mountHistorySettings } from "../features/vault/history-settings";
import { openPageHistory } from "../features/pages/history-dialog";
import { openPeople } from "../features/people/people-view";
import { openAssetLibrary } from "../features/assets/asset-library";
import { openPeopleEvent, refreshPeople } from "../features/people/people-client";
import { personMention } from "../features/people/person";
import { plainText } from "../shared/plain-text";
import { startReminders } from "../features/dates/reminders";
import { BlockEditor } from "../editor/prosemirror-editor";
import { MarkdownWorkspace, type EditMode } from "../markdown-engine/workspace";
import {
  defaultSyntax,
  syntaxFormat,
  usesNotionSyntax,
  commandEnabled,
  enabled,
} from "../markdown-engine/config";
import { refreshIcons } from "../shared/icons";
import "./style.css";
import notdownIcon from "../assets/notdown-icon.png";
import "../editor/notion-blocks.css";
import { api, ApiError, escape as e, type Page } from "../shared/types";
import {
  getOutline,
  htmlDocument,
  type OutlineNode,
} from "../document/document-format";
import { escapeXml, pageUrl } from "../document/notion-syntax";
import { toMyBase } from "../integrations/mybase";
import { searchPages } from "../features/pages/page-search";
import { showPageContextMenu, pageActionsHTML, type PageAction } from "../features/pages/page-context-menu";
import { closePageContextMenu } from "../features/pages/page-context-menu";
import { comparePageOrder, type PageMoveInput } from "../features/pages/page-order";
import { installSidebarDrag } from "./sidebar-drag";
import { installSidebarLayout } from "./sidebar-layout";
import { renderBreadcrumb } from "../blocks/breadcrumb-view";
import { PageNavigation, parseRoute, type PageRoute } from "../features/pages/page-navigation";
import { PageBacklinks } from "../features/pages/page-backlinks";
import { isPageCoverPath, openPageCoverPicker } from "../features/pages/page-cover-picker";
import "../features/pages/page-cover-picker.css";

type View = "document" | "outline" | "mindmap" | "source" | "split";
initializeEmojiStyle();
type LibraryView = "gallery" | "list" | "tree" | "graph";
let pages: Page[] = [];
let current: Page | null = null;
let editor: BlockEditor | undefined;
let workspace: MarkdownWorkspace | undefined;
let editorChanged = false;
let editorReady = false;
let editorGeneration = 0;
let view: View = "document";
let libraryView: LibraryView = "gallery";
let library = false;
let databaseWorkspace: DatabaseWorkspace | undefined;
let databaseRoute: { kind: "database"; id?: string } | undefined;
let databaseSchemaRevision: string | undefined;
let databases: Database[] = [];
let databaseApiAvailable = true;
const databaseRestartMessage = "Database features need the updated local server. Restart the backend with npm run dev; your existing pages remain available.";
async function readDatabaseList(): Promise<Database[]> {
  try {
    const resources = await api<Database[]>("/databases");
    databaseApiAvailable = true;
    return resources;
  } catch (error) {
    // A pre-database backend must not prevent opening ordinary Markdown pages.
    // Other errors (including invalid metadata and access failures) still surface.
    if (!(error instanceof ApiError) || error.status !== 404) throw error;
    databaseApiAvailable = false;
    return [];
  } finally {
    const notice = document.querySelector<HTMLElement>("#database-api-notice");
    if (notice) notice.hidden = databaseApiAvailable;
  }
}
async function refreshWorkspacePages(): Promise<Page[]> {
  const [loaded, resources] = await Promise.all([api<Page[]>("/pages"), readDatabaseList()]);
  databases = resources;
  return loaded;
}
let dirty = false;
let saving: Promise<boolean> | null = null;
let saveTimer: ReturnType<typeof setTimeout>;
let conflict: any = null;
let search = "";
let vaultPath = "";
let browserVaultManagement = false;
let sourceSelection: { start: number; end: number } | null = null;
let draftWarningShown = false;
let slashCleanup: (() => void) | undefined;
let tocCleanup: (() => void) | undefined;
let graphCleanup: (() => void) | undefined;
let pageActionBusy = false;
let pageIconCleanup: (() => void) | undefined;
let coverPickerCleanup: (() => void) | undefined;
let coverRepositionCleanup: (() => void) | undefined;
let sidebarLayout: ReturnType<typeof installSidebarLayout>;
let navigation: PageNavigation | undefined;
let workspaceTabs: WorkspaceTabs | undefined;
const backlinks = new PageBacklinks();

function updateNavigationButtons() {
  const back = document.querySelector<HTMLButtonElement>('[data-action="history-back"]');
  const forward = document.querySelector<HTMLButtonElement>('[data-action="history-forward"]');
  if (back) back.disabled = !navigation?.canBack;
  if (forward) forward.disabled = !navigation?.canForward;
  if (navigation && !navigation.loading) workspaceTabs?.sync(navigation.route);
}

function renderTabs() {
  const host = document.querySelector<HTMLElement>("#workspace-tabs");
  if (!host || !workspaceTabs) return;
  // A newly mounted page must not accept input until its tab view is restored.
  const panel = document.querySelector<HTMLElement>("#main");
  if (panel) panel.inert = workspaceTabs.busy;
  renderWorkspaceTabs(host, workspaceTabs, route => {
    const page = route.kind === "page" ? (current?.id === route.id ? current : pages.find(page => page.id === route.id || page.legacyIds?.includes(route.id))) : undefined;
    const database = route.kind === "database" ? databases.find(database => database.id === route.id) : undefined;
    const host = database && pages.find(page => page.id === (database.pageId ?? database.id));
    return { title: page?.title ?? host?.title ?? database?.title ?? (route.kind === "page" ? "Page unavailable" : route.kind === "database" ? "Databases" : route.view === "graph" ? "Graph" : "Vault"),
      icon: pageIconElement(page?.icon ?? host?.icon ?? (route.kind === "database" ? "🗃️" : route.kind === "vault" ? "📚" : "📄")) };
  }, dirty || editorChanged || !!conflict);
  const add = document.querySelector<HTMLButtonElement>('[data-action="new-tab"]');
  if (add) add.disabled = workspaceTabs.busy;
}
// Keep existing preferences and window-specific drafts across the app rename.
for (const storageName of ["localStorage", "sessionStorage"] as const) {
  try {
    const storage = window[storageName];
    if (storage.getItem("notdown-storage-migrated") === "1") continue;
    const oldKeys = Array.from({ length: storage.length }, (_, i) =>
      storage.key(i),
    ).filter((key): key is string => key !== null && key.startsWith("yejian-"));
    for (const key of oldKeys) {
      const nextKey = `notdown-${key.slice("yejian-".length)}`;
      if (storage.getItem(nextKey) === null) {
        const value = storage.getItem(key);
        if (value !== null) storage.setItem(nextKey, value);
      }
    }
    storage.setItem("notdown-storage-migrated", "1");
  } catch {
    // Storage can be disabled or full; preserve the old data for a later retry.
  }
}
const draftSession = (() => {
  try {
    const id = sessionStorage.getItem("notdown-session") || crypto.randomUUID();
    sessionStorage.setItem("notdown-session", id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
})();
const draftKey = (id: string) => `notdown-draft:${vaultPrefix() ? vaultPrefix() + ":" : ""}${id}:${draftSession}`;
const collapsed = new Set<string>();
const libraryTreeExpansion = new Map<string, boolean>();
const childPageExpansion = new Map<string, boolean>();
function recentPages(): string[] {
  try {
    const value = JSON.parse(
      localStorage.getItem("notdown-recent-pages") || "[]",
    );
    return Array.isArray(value)
      ? value.filter((id) => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}
const app = document.querySelector<HTMLDivElement>("#app")!;
const icon = (name: string, cls = "") =>
  `<i data-lucide="${name}" class="${cls}"></i>`;
const button = (action: string, name: string, title: string, extra = "") =>
  `<button class="icon-button" data-action="${action}" title="${title}" aria-label="${title}" ${extra}>${icon(name)}</button>`;

function toast(message: string) {
  document.querySelector(".toast")?.remove();
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  document.body.append(el);
  setTimeout(() => el.remove(), 4500);
}
function report(error: unknown) {
  console.error(error);
  toast(error instanceof Error ? error.message : "Operation failed. Please try again.");
}
function persistDraft(page: Page) {
  try {
    localStorage.setItem(draftKey(page.id), JSON.stringify(page));
    if (databaseSchemaRevision && page.dataSourceId) localStorage.setItem(`${draftKey(page.id)}:schema`, databaseSchemaRevision);
  } catch {
    if (!draftWarningShown) {
      toast("Browser draft storage is full. Saving to disk will continue; confirm that saving succeeds before closing.");
      draftWarningShown = true;
    }
  }
}
function removeDraft(id: string) {
  try {
    localStorage.removeItem(draftKey(id));
    localStorage.removeItem(`${draftKey(id)}:schema`);
  } catch {
    /* 磁盘保存不依赖浏览器缓存。 */
  }
}
function readDraft(id: string) {
  try {
    return localStorage.getItem(draftKey(id));
  } catch {
    return null;
  }
}
function status(text: string, kind = "") {
  renderTabs();
  const el = document.querySelector("#save-status");
  if (el) {
    if (el.className === kind && el.querySelector("span")?.textContent === text) return;
    el.className = kind;
    el.innerHTML = `${icon(kind === "error" ? "circle-alert" : "circle-check")}<span>${e(text)}</span>`;
    refreshIcons();
  }
}
function markDirty() {
  if (!current) return;
  dirty = true;
  persistDraft(current);
  status("Unsaved", "pending");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void save().catch(report), 750);
  updateCounts();
}
async function save(): Promise<boolean> {
  if (editor?.isComposing() || workspace?.source.composing) return false;
  if (databaseWorkspace && !(await databaseWorkspace.flush())) return false;
  if (workspace && !(await workspace.blocks.flushDatabaseViews())) return false;
  captureEditor();
  clearTimeout(saveTimer);
  if (saving) {
    await saving;
    return dirty && !conflict ? save() : !conflict && !dirty;
  }
  if (!dirty || !current) return true;
  if (conflict) return false;
  status("Saving Markdown…", "pending");
  saving = (async () => {
    try {
      await workspace?.blocks.flushSyncedBlocks();
      captureEditor();
      clearTimeout(saveTimer);
      if (!current || !dirty) return true;
      const draft = structuredClone(current);
      let schemaRevision = databaseSchemaRevision;
      if (draft.dataSourceId && !schemaRevision) {
        try { schemaRevision = localStorage.getItem(`${draftKey(draft.id)}:schema`) ?? undefined; } catch { /* Optional browser draft. */ }
        schemaRevision ??= (await api<DatabaseDataSource>(`/data-sources/${encodeURIComponent(draft.dataSourceId)}`)).revision;
        if (current?.id === draft.id) { databaseSchemaRevision = schemaRevision; persistDraft(current); }
      }
      const saved = await api<Page>(`/pages/${draft.id}`, {
        method: "PUT",
        body: JSON.stringify({ ...draft, baseRevision: draft.revision, ...(schemaRevision ? { schemaRevision } : {}) }),
      });
      pages = pages.map((page) => (page.id === saved.id ? saved : page));
      if (current?.id === saved.id) {
        captureEditor();
        const unchanged =
          current.body === draft.body &&
          current.bodyFormat === draft.bodyFormat &&
          JSON.stringify(current.syntax) === JSON.stringify(draft.syntax) &&
          current.title === draft.title &&
          current.parent === draft.parent &&
          current.icon === draft.icon &&
          current.favorite === draft.favorite &&
          current.trashed === draft.trashed &&
          current.sidebarOrder === draft.sidebarOrder &&
          JSON.stringify(current.properties) ===
            JSON.stringify(draft.properties);
        current.revision = saved.revision;
        current.updated = saved.updated;
        if (unchanged) {
          Object.assign(current, saved);
          const title = document.querySelector<HTMLTextAreaElement>("#page-title");
          if (title) title.value = saved.title;
          renderPageDecoration();
        }
        dirty = !unchanged;
        if (!dirty) removeDraft(saved.id);
        else persistDraft(current);
      }
      status(dirty ? "Editing…" : "Saved locally", dirty ? "pending" : "");
      sidebarDrag.saved(saved.id, draft.revision, saved.revision);
      renderSidebar();
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        conflict = error.data;
        status("Conflict · Both versions preserved", "error");
        showConflict();
      } else {
        status("Save failed · Draft preserved in browser", "error");
        report(error);
      }
      return false;
    } finally {
      saving = null;
    }
  })();
  const success = await saving;
  return success && dirty ? save() : success;
}

function pageIcon(page: Page) {
  return pageIconElement(page.icon).outerHTML;
}
let sidebarSnapshot: { container: Element; key: string } | undefined;
function renderSidebar() {
  renderTabs();
  if (sidebarDrag.isDragging()) return;
  const container = document.querySelector("#page-tree");
  if (!container) return;
  const tree = databaseTree(pages, databases);
  const activeId = databaseRoute?.id ? (databases.find(item => item.id === databaseRoute!.id)?.pageId ?? databaseRoute.id) : current?.id;
  const key = JSON.stringify([
    tree.pages.map(page => [page.id, page.parent, page.title, page.icon, page.favorite, page.sidebarOrder, page.databaseId, page.dataSourceId]),
    [...collapsed],
  ]);
  if (sidebarSnapshot?.container === container && sidebarSnapshot.key === key) {
    for (const row of container.querySelectorAll<HTMLElement>("[data-page-row]")) {
      row.classList.toggle("active", !library && row.dataset.pageRow === activeId);
    }
    refreshBreadcrumbs();
    return;
  }
  const visited = new Set<string>();
  const childrenByParent = new Map<string | null, Page[]>();
  for (const page of tree.pages) {
    const siblings = childrenByParent.get(page.parent) ?? [];
    siblings.push(page);
    childrenByParent.set(page.parent, siblings);
  }
  for (const siblings of childrenByParent.values()) siblings.sort(comparePageOrder);
  function rows(parent: string | null, depth: number): string {
    return (childrenByParent.get(parent) ?? [])
      .map((p) => {
        if (visited.has(p.id)) return "";
        visited.add(p.id);
        const children = childrenByParent.has(p.id);
        return `<div data-page-row="${e(p.id)}" ${p.databaseId ? `data-database-row="${e(p.databaseId)}"` : ""} class="tree-row ${activeId === p.id && !library ? "active" : ""}" style="--depth:${depth}" ${p.parent ? `data-tree-parent="${e(p.parent)}"` : ""}>
        ${children ? `<button class="tree-toggle" data-toggle="${e(p.id)}" aria-label="Expand or collapse ${e(p.title)}" aria-expanded="${!collapsed.has(p.id)}">${icon(collapsed.has(p.id) ? "chevron-right" : "chevron-down")}</button>` : ""}
        <button class="tree-page" draggable="${!p.dataSourceId && !tree.virtualIds.has(p.id)}" ${p.databaseId ? `data-open-database="${e(p.databaseId)}" data-open="${e(p.id)}"` : `data-open="${e(p.id)}"`}>${pageIcon(p)}<span>${e(p.title)}</span></button>
        ${tree.virtualIds.has(p.id) ? "" : `<button class="tree-menu" data-page-menu="${e(p.id)}" aria-label="Page actions for ${e(p.title)}" aria-haspopup="menu">${icon("ellipsis")}</button>`}${p.databaseId ? `<button class="tree-add" data-database-new-record="${e(p.databaseId)}" aria-label="Add database record">${icon("plus")}</button>` : `<button class="tree-add" data-child="${e(p.id)}" aria-label="Add child page">${icon("plus")}</button>`}</div>${collapsed.has(p.id) ? "" : rows(p.id, depth + 1)}`;
      })
      .join("");
  }
  container.innerHTML =
    rows(null, 0) || `<p class="empty-small">No pages yet. Write down your first idea.</p>`;
  const favorites = document.querySelector("#favorite-pages");
  if (favorites) favorites.innerHTML = tree.pages.some((page) => page.favorite)
    ? `<div class="section-label">Favorites</div>${tree.pages.filter((page) => page.favorite).sort(comparePageOrder).map((page) => `<div class="tree-row" data-page-row="${e(page.id)}" style="--depth:0"><button class="tree-page" draggable="${!page.dataSourceId}" ${page.databaseId ? `data-open-database="${e(page.databaseId)}" data-open="${e(page.id)}"` : `data-open="${e(page.id)}"`}>${pageIcon(page)}<span>${e(page.title)}</span></button><button class="tree-menu" data-page-menu="${e(page.id)}" aria-label="Page actions for ${e(page.title)}" aria-haspopup="menu">${icon("ellipsis")}</button></div>`).join("")}` : "";
  const count = document.querySelector("#page-count");
  if (count) count.textContent = String(pages.length);
  sidebarSnapshot = { container, key };
  refreshBreadcrumbs();
  refreshIcons();
}

function shell() {
  const vaultName = vaultPath.split(/[\\/]/).filter(Boolean).pop() || "Vault";
  app.inert = true;
  app.setAttribute("aria-busy", "true");
  app.innerHTML = `<aside class="sidebar" id="sidebar">
    <button class="workspace-switch" data-action="vaults" aria-label="Open knowledge bases: ${e(vaultName)}" title="${e(vaultName)} · Manage knowledge bases"><span><strong>${e(vaultName)}</strong></span>${icon("chevrons-up-down")}</button>
    <button class="search-launch" data-action="search">${icon("search")}<span>Search</span><kbd>Ctrl K</kbd></button>
    <nav class="main-nav"><button data-action="home">${icon("layout-dashboard")}Vault<span id="page-count">${pages.length}</span></button><button data-action="databases">${icon("table-2")}Databases</button><button data-action="attachments">${icon("paperclip")}Attachments</button><button data-action="people">${icon("user")}People</button><button data-action="graph">${icon("waypoints")}Graph</button><button data-action="conflicts">${icon("git-branch")}Conflicts and versions</button></nav>
    <div id="database-api-notice" class="database-api-notice" role="status" ${databaseApiAvailable ? "hidden" : ""}>${e(databaseRestartMessage)}<button data-action="retry-databases">Check connection</button></div><div id="favorite-pages"></div><div class="section-label" data-page-root-drop title="Drop a page here to move it to the vault root"><span>Private pages</span>${button("new", "plus", "New page")}</div><div id="page-tree"></div>
    <div class="sidebar-bottom"><button class="new-page" data-action="import">${icon("folder-input")}Import</button><button class="new-page" data-action="trash" data-page-trash-drop>${icon("trash-2")}Trash</button><a class="markdown-lab-link" data-experimental="block-explorer" data-sidebar-hidden href="/block-catalog.html" target="_blank" rel="noopener">${icon("blocks")}Block Explorer${icon("arrow-up-right")}</a><a class="markdown-lab-link" data-experimental="markdown-lab" data-sidebar-hidden href="/markdown-lab.html" target="_blank" rel="noopener">${icon("code-xml")}Markdown Lab${icon("arrow-up-right")}</a><div class="local-badge"><span></span>Local Markdown vault</div><button data-action="settings">${icon("settings-2")}Workspace settings${icon("chevron-right")}</button></div>
  </aside><div class="main-shell"><header class="topbar">${button("sidebar", "panel-left", "Toggle sidebar")}<nav class="page-history" aria-label="Page history">${button("history-back", "arrow-left", "Back", "disabled")}${button("history-forward", "arrow-right", "Forward", "disabled")}</nav><div id="breadcrumb"></div><div class="top-actions"><span id="save-status"></span>${sourceFileMenu()}<details id="page-options" class="page-options" name="topbar-menu">${pageOptions()}</details></div></header><main id="main"></main><footer class="statusbar"><span>${icon("hard-drive")}<span id="footer-location">Markdown · Local files</span></span><span id="word-count"></span></footer></div>`;
  app.classList.add("workspace-layout");
  document.body.classList.toggle("desktop-window", !!window.notdownDesktop);
  const chrome = document.createElement("header"); chrome.className = "workspace-chrome";
  chrome.innerHTML = `<div class="workspace-chrome-tools"><button type="button" class="workspace-app-menu" aria-label="Notdown menu" title="Notdown menu"><img src="${notdownIcon}" width="18" height="18" alt=""></button></div><div class="workspace-tab-area"><div id="workspace-tabs" role="tablist" aria-label="Workspace tabs"></div><button type="button" class="workspace-new-tab" data-action="new-tab" aria-label="New tab" title="New tab">+</button><div class="workspace-drag-space"></div></div>`;
  chrome.querySelector(".workspace-chrome-tools")!.append(app.querySelector('.topbar > [data-action="sidebar"]')!);
  chrome.querySelector(".workspace-tab-area")!.prepend(app.querySelector(".page-history")!);
  app.prepend(chrome);
  mountApplicationMenu(chrome.querySelector<HTMLButtonElement>(".workspace-app-menu")!, () => {
    const busy = !workspaceTabs || workspaceTabs.busy;
    return [
      { label: "File", items: [
        { action: "new-tab", label: "New tab", shortcut: window.notdownDesktop ? "Ctrl+T" : undefined, disabled: busy },
        { action: "new", label: "New page", disabled: busy },
        { action: "import", label: "Import…", disabled: busy },
        { action: "vaults", label: "Manage knowledge bases…", disabled: busy },
        { action: "close-tab", label: "Close tab", shortcut: window.notdownDesktop ? "Ctrl+W" : undefined, disabled: busy },
      ] },
      { label: "View", items: [
        { action: "sidebar", label: "Toggle sidebar" },
        { action: "settings", label: "Workspace settings…" },
      ] },
      { label: "History", items: [
        { action: "history-back", label: "Back", disabled: busy || !navigation?.canBack },
        { action: "history-forward", label: "Forward", disabled: busy || !navigation?.canForward },
        { action: "reopen-tab", label: "Reopen closed tab", shortcut: window.notdownDesktop ? "Ctrl+Shift+T" : undefined, disabled: busy || !workspaceTabs?.canReopen },
      ] },
    ];
  });
  const resizer = document.createElement("div");
  resizer.className = "sidebar-resizer";
  resizer.tabIndex = 0;
  resizer.setAttribute("role", "separator");
  resizer.setAttribute("aria-label", "Resize sidebar");
  resizer.setAttribute("aria-orientation", "vertical");
  resizer.setAttribute("aria-controls", "sidebar");
  resizer.title = "Drag to resize sidebar; double-click to reset";
  app.append(resizer);
  applySidebarPreferences();
  for (const link of app.querySelectorAll<HTMLAnchorElement>(".markdown-lab-link")) link.setAttribute("href", vaultPageUrl(link.getAttribute("href")!.slice(1)));
  sidebarLayout = installSidebarLayout();
  renderSidebar();
}

function captureEditor() {
  if (!editor || !editorReady || !current) return;
  if (workspace) {
    const snapshot = workspace.capture();
    editorChanged = false;
    if (
      snapshot.source !== current.body ||
      (current.syntax &&
        JSON.stringify(current.syntax) !== JSON.stringify(snapshot.config))
    ) {
      current.body = snapshot.source;
      current.syntax = snapshot.config;
      current.bodyFormat = syntaxFormat(snapshot.config);
      markDirty();
    }
    return;
  }
  const body = editor.getValue();
  editorChanged = false;
  if (body !== current.body) {
    current.body = body;
    current.bodyFormat = editor.getBodyFormat();
    markDirty();
  }
}
function destroyEditor() {
  databaseWorkspace?.destroy();
  databaseWorkspace = undefined;
  databaseRoute = undefined;
  databaseSchemaRevision = undefined;
  graphCleanup?.();
  graphCleanup = undefined;
  pageIconCleanup?.();
  pageIconCleanup = undefined;
  coverPickerCleanup?.();
  coverPickerCleanup = undefined;
  coverRepositionCleanup?.();
  coverRepositionCleanup = undefined;
  if (document.querySelector(".insert-dialog")) closeModal();
  captureEditor();
  tocCleanup?.();
  tocCleanup = undefined;
  editorGeneration++;
  if (editor) {
    if (workspace) {
      workspace.destroy();
      workspace = undefined;
    } else editor.destroy();
    editor = undefined;
  }
  editorChanged = false;
  editorReady = false;
}
async function openReferencePage(id: string, reference?: InternalReference) {
  if (!(await navigation?.navigate({ kind: "page", id, ...(reference?.fragment ? { fragment: reference.fragment } : {}) })) || current?.id !== id) return;
  if (reference?.kind === "location") revealReference(reference);
}
function revealReference(reference: InternalReference) {
  workspace?.capture();
  if (view === "source") { workspace?.setMode("document"); view = "document"; }
  if (!editor?.scrollToReference(reference)) toast("Linked location not found.");
}
async function openPage(id: string, allowTrashed = false) {
  const databaseId = pages.find(page => page.id === id)?.databaseId ?? databases.find(database => (database.pageId ?? database.id) === id)?.id;
  if (databaseId && !allowTrashed) return navigation?.navigate({ kind: "database", id: databaseId });
  return navigation?.navigate({ kind: "page", id }, allowTrashed);
}

async function loadPage(id: string, allowTrashed = false, isCurrent = () => true): Promise<boolean> {
  if (!(await save()) || !isCurrent()) return false;
  // A rapid Back then Forward can return to the still-mounted page. Keep its
  // editor/undo history instead of fetching a snapshot that could become stale.
  if (!library && current?.id === id) return true;
  closeModal();
  closePageContextMenu();
  const activePages = await refreshWorkspacePages();
  if (!isCurrent()) return false;
  const requestedId = id;
  const activePage = activePages.find(page => page.id === id || page.legacyIds?.includes(id));
  id = activePage?.id ?? id;
  if (!allowTrashed && !activePage) {
    toast("This page is in Trash or no longer exists.");
    return false;
  }
  // The list already contains full, fresh disk snapshots. A second GET would
  // scan the whole vault again. Clone so edits cannot mutate the sidebar snapshot.
  const page = activePage ? structuredClone(activePage) : await api<Page>(`/pages/${encodeURIComponent(id)}`);
  if (page.databaseId && !allowTrashed) return loadDatabases(page.databaseId, isCurrent);
  if (!isCurrent() || !(await save()) || !isCurrent()) return false;
  // Input may have arrived while fetching the destination. Save it before
  // destroying the outgoing DOM; never pair it with the destination revision.
  pages = activePages;
  destroyEditor();
  current = page;
  library = false;
  search = "";
  const draftId = [id, requestedId, ...(page.legacyIds ?? [])].find(candidate => readDraft(candidate));
  const draft = draftId ? readDraft(draftId) : null;
  if (draft) {
    try {
      const recovered = JSON.parse(draft) as Page;
      if (
        (recovered.id === id || page.legacyIds?.includes(recovered.id)) &&
        (recovered.body !== page.body ||
          recovered.bodyFormat !== page.bodyFormat ||
          JSON.stringify(recovered.syntax) !== JSON.stringify(page.syntax) ||
          recovered.title !== page.title ||
          recovered.parent !== page.parent ||
          recovered.icon !== page.icon ||
          recovered.favorite !== page.favorite ||
          recovered.trashed !== page.trashed ||
          recovered.sidebarOrder !== page.sidebarOrder ||
          JSON.stringify(recovered.properties) !==
            JSON.stringify(page.properties))
      ) {
        current = { ...recovered, id };
        if (draftId !== id) {
          try {
            localStorage.setItem(draftKey(id), JSON.stringify(current));
            removeDraft(draftId!);
          } catch { /* Preserve the original draft if browser storage is full. */ }
        }
        dirty = true;
        toast("Your unsaved draft has been restored. File revisions will be checked when saving.");
      } else removeDraft(id);
    } catch {
      toast("Could not read the browser draft. Opened the disk version.");
    }
  }
  localStorage.setItem("notdown-page", id);
  try {
    localStorage.setItem(
      "notdown-recent-pages",
      JSON.stringify(
        [id, ...recentPages().filter((pageId) => pageId !== id)].slice(0, 30),
      ),
    );
  } catch {
    /* Navigation also works with unavailable local storage. */
  }
  renderDocument();
  renderSidebar();
  if (dirty) markDirty();
  return true;
}
function refreshBreadcrumbs() {
  const sourceMenu = document.querySelector<HTMLDetailsElement>("#source-file-options");
  if (sourceMenu) {
    sourceMenu.hidden = !current || library;
    if (sourceMenu.hidden) sourceMenu.open = false;
  }
  const header = document.querySelector("#breadcrumb");
  if (!header) return;
  if (databaseRoute) { header.innerHTML = `${icon("table-2")}<strong>Databases</strong>`; return; }
  if (!current || library) {
    header.innerHTML = `${icon("library")}<strong>Vault</strong>`;
    return;
  }
  header.replaceChildren(renderBreadcrumb(pages, current));
  // Refresh only non-editable navigation DOM; leave editor input and undo history intact.
  document.querySelectorAll("#document-content .pm-object-breadcrumb .pm-breadcrumb").forEach(nav => {
    nav.replaceChildren(...renderBreadcrumb(pages, current!).childNodes);
  });
}
function renderDocument() {
  if (!current) return;
  destroyEditor();
  const linkedTitle = documentPageTitle(current.body, current.syntax ?? defaultSyntax(current.bodyFormat));
  if (linkedTitle !== undefined && !linkedTitle.trim() && current.title.trim()) {
    current.body = renameDocumentPageSource(current.body, current.syntax ?? defaultSyntax(current.bodyFormat), current.title);
    markDirty();
  }
  if (linkedTitle?.trim() && linkedTitle.length <= 500 && linkedTitle !== current.title) {
    current.title = linkedTitle;
    pages = pages.map(page => page.id === current!.id ? { ...current! } : page);
    markDirty();
  }
  const p = current;
  refreshBreadcrumbs();
  document.querySelector("#page-options")!.innerHTML = pageOptions();
  document.querySelector("#main")!.innerHTML =
    `<div class="document-wrap ${view === "mindmap" ? "wide" : ""}">
    <div id="page-cover-region" class="page-cover-region"></div>
    <article class="document"><header class="page-header"><div id="page-decoration"></div><textarea id="page-title" class="page-title" rows="1" aria-label="Page title" placeholder="New page">${e(p.title)}</textarea></header>
    <details class="page-properties"><summary>Properties${icon("chevron-down")}</summary><div class="properties"><div class="property-row"><span>${icon("folder-tree")}Parent page</span><select id="parent-select" aria-label="Parent page"><option value="">Vault root</option>${pages
      .filter((x) => x.id !== p.id)
      .map(
        (x) =>
          `<option value="${e(x.id)}" ${p.parent === x.id ? "selected" : ""}>${e(x.title)}</option>`,
      )
      .join("")}</select></div>
    <div class="property-row"><span>${icon("tags")}Properties</span><button data-action="properties" class="property-values">${
      p.dataSourceId ? '<span class="muted">Additional page properties…</span>' : Object.entries(p.properties || {})
        .slice(0, 4)
        .map(
          ([key, value]) =>
            `<span class="tag">${e(key)} · ${e(Array.isArray(value) ? value.join(", ") : String(value))}</span>`,
        )
        .join("") || `<span class="muted">Add page properties</span>`
    }</button></div><div id="page-metadata"></div></div></details>
    <div id="database-page-properties"></div><div id="document-content" class="document-content"></div><div id="children-links"></div><div id="backlinks"></div></article><aside id="floating-toc" class="floating-toc" tabindex="0" aria-label="Page contents"></aside></div>`;
  renderContent();
  renderPageDecoration();
  void renderDatabasePageProperties(p);
  const title = document.querySelector<HTMLTextAreaElement>("#page-title")!;
  title.style.height = `${title.scrollHeight}px`;
  renderRelations();
  updateCounts();
  status(dirty ? "Unsaved" : "Saved locally", dirty ? "pending" : "");
  refreshIcons();
}
function renderPageDecoration() {
  if (!current) return;
  coverRepositionCleanup?.();
  coverRepositionCleanup = undefined;
  const p = current, host = document.querySelector("#page-decoration"), coverHost = document.querySelector("#page-cover-region");
  if (!host || !coverHost) return;
  const hasIcon = !!p.icon && p.icon !== "file-text";
  const cover = typeof p.properties?.cover === "string" ? p.properties.cover : "";
  const hasCover = !!cover && isPageCoverPath(cover);
  const rawPosition = p.properties?.coverPosition;
  const position = typeof rawPosition === "number" && Number.isFinite(rawPosition) ? Math.max(0, Math.min(100, rawPosition)) : 50;
  document.querySelector(".document-wrap")?.classList.toggle("has-page-cover", hasCover);
  coverHost.innerHTML = hasCover ? `<img class="page-cover" src="${e(vaultAssetUrl(cover))}" alt="Page cover" style="object-position: 50% ${position}%"><div class="page-cover-toolbar"><button type="button" data-action="page-cover" aria-label="Change cover">Change</button><button type="button" data-action="cover-reposition">Reposition</button><a href="${e(vaultAssetUrl(cover))}" download target="_blank" rel="noopener noreferrer" aria-label="Download cover" title="Download cover">${icon("download")}</a></div>` : "";
  const actions = `${hasIcon ? "" : `<button data-action="page-icon">${icon("smile")}Add icon</button>`}${hasCover ? "" : `<button data-action="page-cover">${icon("image")}Add cover</button>`}`;
  host.innerHTML = `${hasIcon ? `<button class="page-emblem" data-action="page-icon" aria-label="Change page icon">${pageIcon(p)}</button>` : ""}${actions ? `<div class="page-decoration-actions">${actions}</div>` : ""}`;
  refreshIcons();
}
function pageOptions() {
  if (library)
    return `<summary class="icon-button" aria-label="Workspace options">${icon("ellipsis")}</summary><div class="page-options-menu" role="menu"><button role="menuitem" data-action="settings">${icon("settings-2")}Settings</button></div>`;
  const modes: [View, string, string][] = [
    ["document", "file-text", "Page"],
    ["outline", "list-tree", "Outline"],
    ["mindmap", "network", "Mind map"],
    ["source", "code-xml", "Markdown source"],
    ["split", "columns-2", "Source and page"],
  ];
  return `<summary class="icon-button" aria-label="Page options" title="Page options">${icon("ellipsis")}</summary><div class="page-options-menu" role="menu">${current ? `<small>Page</small>${pageActionsHTML(current, "data-current-page-action")}<hr>` : ""}<small>View</small>${modes.map(([v, i, label]) => `<button role="menuitemradio" aria-checked="${view === v}" data-view="${v}">${icon(i)}<span>${label}</span>${v === "source" ? "<kbd>Ctrl E</kbd>" : ""}</button>`).join("")}<hr/><button role="menuitem" data-action="page-history">${icon("git-branch")}Page history</button><button role="menuitem" data-action="page-attachments">${icon("paperclip")}Page attachments</button><button role="menuitem" data-action="page-properties">${icon("tags")}Page properties</button><button role="menuitem" data-action="export">${icon("download")}Export HTML</button><button role="menuitem" data-action="export-text">${icon("file-text")}Export plain text</button><button role="menuitem" data-action="settings">${icon("settings-2")}Settings</button></div>`;
}
function renderContent() {
  if (!current) return;
  const content = document.querySelector<HTMLDivElement>("#document-content")!;
  if (["document", "source", "split"].includes(view)) {
    const generation = ++editorGeneration,
      pageId = current.id;
    content.innerHTML = '<div id="editing-workspace"></div>';
    workspace = new MarkdownWorkspace(
      content.querySelector<HTMLElement>("#editing-workspace")!,
      {
        metadataHost: document.querySelector<HTMLElement>("#page-metadata")!,
        source: current.body,
        config:
          current.syntax ?? defaultSyntax(current.bodyFormat || "markdown"),
        mode: view as EditMode,
        pages: () => pages,
        recentPages,
        currentPage: () => current?.id === pageId ? current : undefined,
        onSavePage: async () => generation === editorGeneration && current?.id === pageId && await save(),
        onDeleteChildPages: (ids, isCurrent) => deleteChildPages(ids,
          () => generation === editorGeneration && current?.id === pageId && isCurrent()),
        onCreatePage: async (title, parent) => {
          if (generation !== editorGeneration || current?.id !== pageId) return null;
          const created = await api<Page>("/pages", {
            method: "POST",
            body: JSON.stringify({ title, parent, icon: "file-text", body: "", properties: {} }),
          });
          pages = [...pages.filter(page => page.id !== created.id), created];
          renderSidebar();
          return created;
        },
        onChange: (source, config) => {
          if (generation !== editorGeneration || current?.id !== pageId) return;
          editorChanged = false;
          current.body = source;
          current.syntax = config;
          current.bodyFormat = syntaxFormat(config);
          const linkedTitle = documentPageTitle(source, config);
          if (linkedTitle !== undefined && current.title !== linkedTitle) {
            current.title = linkedTitle;
            const title = document.querySelector<HTMLTextAreaElement>("#page-title");
            if (title) {
              title.value = linkedTitle;
              title.style.height = "auto";
              title.style.height = `${title.scrollHeight}px`;
            }
            pages = pages.map(page => page.id === current!.id ? { ...current! } : page);
            renderSidebar();
          }
          markDirty();
          scheduleToc();
        },
        onMode: (mode) => {
          view = mode;
          document.querySelector("#page-options")!.innerHTML = pageOptions();
          renderToc();
        },
        onInsert: showInsert,
        onError: report,
        onOpenPage: (id, reference) => {
          void openReferencePage(id, reference).catch(report);
        },
      },
    );
    editor = workspace.blocks;
    editorReady = true;
  } else {
    const outline = getOutline(
      current.body,
      current.bodyFormat,
      current.syntax,
    );
    content.innerHTML = `<p class="view-description">Generated from headings and lists in your Markdown.</p>${outline.length ? `<div class="${view === "mindmap" ? "mindmap" : "outline-view"}">${view === "mindmap" ? `<div class="mindmap-root">${e(current.title)}</div>` : ""}${outlineHTML(outline)}</div>` : `<div class="empty-state">${icon("list-tree")}<h3>Give your notes some structure</h3><p>Add headings or lists to see your outline here.</p><button data-view="document" class="primary-button">Start editing</button></div>`}`;
  }
  renderToc();
  refreshIcons();
}
function outlineHTML(nodes: OutlineNode[]): string {
  return `<ul>${nodes.map((node) => `<li><details open><summary><span class="outline-dot"></span>${e(node.text)}</summary>${node.children.length ? outlineHTML(node.children) : ""}</details></li>`).join("")}</ul>`;
}
function documentHeadings() {
  return Array.from(
    document.querySelectorAll<HTMLElement>(
      "#editor .pm-document :is(h1,h2,h3,h4,h5,h6)",
    ),
  );
}
function renderToc() {
  tocCleanup?.();
  tocCleanup = undefined;
  const toc = document.querySelector<HTMLElement>("#floating-toc");
  if (!toc) return;
  const headings = documentHeadings();
  toc.hidden = view !== "document" || !headings.length;
  if (toc.hidden) {
    toc.replaceChildren();
    return;
  }
  const baseLevel = Math.min(
    ...headings.map((h) => Number(h.tagName.slice(1))),
  );
  const previousScroll = toc.querySelector(".toc-list")?.scrollTop ?? 0;
  toc.innerHTML = `<nav aria-label="Heading navigation"><ol class="toc-list">${headings
    .map((heading, index) => {
      const level = Number(heading.tagName.slice(1));
      const text = heading.textContent?.trim() || "Untitled heading";
      return `<li><button type="button" data-heading="${index}" style="--depth:${level - baseLevel}" title="${e(text)}" aria-label="${e(text)}"><span class="toc-line" aria-hidden="true"></span><span class="toc-text">${e(text)}</span></button></li>`;
    })
    .join("")}</ol></nav>`;
  toc.classList.toggle(
    "pinned",
    localStorage.getItem("notdown-toc") === "pinned",
  );
  const main = document.querySelector<HTMLElement>("#main")!;
  const list = toc.querySelector<HTMLElement>(".toc-list")!;
  list.scrollTop = previousScroll;
  const buttons = Array.from(toc.querySelectorAll<HTMLButtonElement>("button"));
  const abort = new AbortController();
  const { signal } = abort;
  let activeIndex = -1;
  let requestedIndex: number | null = null;
  let frame = 0;
  const updateActive = () => {
    frame = 0;
    // Match the reading position below the top bar, ignoring folded sections.
    const readingTop = main.getBoundingClientRect().top + 96;
    const atEnd =
      main.scrollHeight > main.clientHeight + 1 &&
      main.scrollTop + main.clientHeight >= main.scrollHeight - 2;
    let next = -1;
    headings.forEach((heading, index) => {
      if (!heading.getClientRects().length) return;
      if (
        next < 0 ||
        atEnd ||
        heading.getBoundingClientRect().top <= readingTop
      )
        next = index;
    });
    // A click stays selected through the animation and at the scroll boundary.
    // Resume following the reading position when the user scrolls or edits.
    if (requestedIndex !== null) next = requestedIndex;
    if (next === activeIndex) return;
    buttons[activeIndex]?.removeAttribute("aria-current");
    buttons[next]?.setAttribute("aria-current", "location");
    activeIndex = next;
    // Keep the current marker in a long outline without interrupting browsing.
    if (next >= 0 && !toc.matches(":hover, :focus-within")) {
      const row = buttons[next].getBoundingClientRect();
      const bounds = list.getBoundingClientRect();
      if (row.top < bounds.top || row.bottom > bounds.bottom)
        list.scrollTop +=
          row.top - bounds.top - (bounds.height - row.height) / 2;
    }
  };
  const scheduleUpdate = () => {
    if (!frame) frame = requestAnimationFrame(updateActive);
  };
  buttons.forEach((button, index) => {
    // Bind to the rendered heading, rather than resolving a fresh DOM index.
    const heading = headings[index];
    button.addEventListener(
      "click",
      (event) => {
        event.preventDefault();
        if (!heading.isConnected) return;
        editor?.revealHeading(heading);
        if (!heading.getClientRects().length) return;
        requestedIndex = index;
        main.scrollTo({
          top:
            main.scrollTop +
            heading.getBoundingClientRect().top -
            main.getBoundingClientRect().top -
            80,
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "instant"
            : "smooth",
        });
        scheduleUpdate();
      },
      { signal },
    );
  });
  const resumeReading = (event: Event) => {
    if (toc.contains(event.target as Node)) return;
    if (requestedIndex !== null) {
      requestedIndex = null;
      // Stop an in-flight jump before a wheel, touch, or keyboard scroll.
      main.scrollTo({ top: main.scrollTop, behavior: "instant" });
      scheduleUpdate();
    }
  };
  main.addEventListener("wheel", resumeReading, { passive: true, signal });
  main.addEventListener("pointerdown", resumeReading, { signal });
  main.addEventListener("keydown", resumeReading, { signal });
  main.addEventListener("scroll", scheduleUpdate, { passive: true, signal });
  const resize = new ResizeObserver(scheduleUpdate);
  resize.observe(main);
  resize.observe(document.querySelector("#document-content")!);
  scheduleUpdate();
  tocCleanup = () => {
    abort.abort();
    resize.disconnect();
    cancelAnimationFrame(frame);
  };
}
let tocUpdateTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleToc() {
  clearTimeout(tocUpdateTimer);
  tocUpdateTimer = setTimeout(renderToc, 500);
}
function renderRelations() {
  if (!current) return;
  const pageId = current.id;
  const children = pages.filter((p) => p.parent === current!.id);
  const childrenOpen = childPageExpansion.get(pageId) ?? children.length <= 5;
  document.querySelector("#children-links")!.innerHTML = children.length
    ? `<details class="relations child-pages" ${childrenOpen ? "open" : ""}><summary><h3>${icon("chevron-right", "child-pages-chevron")}${icon("files")}Child page <span>${children.length}</span></h3></summary>${children.map((p) => `<button class="child-card" data-open="${e(p.id)}">${pageIcon(p)}<span>${e(p.title)}</span>${icon("arrow-up-right")}</button>`).join("")}</details>`
    : "";
  const childPages = document.querySelector<HTMLDetailsElement>("#children-links > details");
  childPages?.querySelector("summary")?.addEventListener("click", () => {
    // Native summary activation also handles Enter/Space. Record only user choices.
    childPageExpansion.set(pageId, !childPages.open);
  });
  const incoming = backlinks.incoming(pages, current);
  document.querySelector("#backlinks")!.innerHTML = incoming.length
    ? `<section class="relations"><h3>${icon("link-2")}Backlinks <span>${incoming.length}</span></h3>${incoming.map((p) => `<button class="backlink" data-open="${e(p.id)}">${pageIcon(p)}${e(p.title)}</button>`).join("")}</section>`
    : "";
}
function updateCounts() {
  const el = document.querySelector("#word-count");
  if (el)
    el.textContent =
      current && !library
        ? `${current.body.replace(/\s/g, "").length.toLocaleString()} characters · UTF-8`
        : `${pages.length} pages · Markdown`;
}

async function showLibrary(selected = libraryView) {
  return navigation?.navigate({ kind: "vault", view: selected });
}

async function loadLibrary(selected = libraryView, isCurrent = () => true): Promise<boolean> {
  if (!(await save()) || !isCurrent()) return false;
  closeModal();
  closePageContextMenu();
  const loaded = await refreshWorkspacePages();
  if (!isCurrent() || !(await save()) || !isCurrent()) return false;
  destroyEditor();
  library = true;
  libraryView = selected;
  pages = loaded;
  renderLibrary();
  renderSidebar();
  updateCounts();
  return true;
}
function renderLibrary() {
  graphCleanup?.();
  graphCleanup = undefined;
  document.querySelector("#page-options")!.innerHTML = pageOptions();
  refreshBreadcrumbs();
  const filtered = pages.filter((p) =>
    `${p.title} ${p.body} ${JSON.stringify(p.properties)}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const modes: [LibraryView, string, string][] = [
    ["gallery", "layout-grid", "Gallery"],
    ["list", "table-2", "List"],
    ["tree", "list-tree", "Page tree"],
    ["graph", "waypoints", "Graph"],
  ];
  document.querySelector("#main")!.innerHTML =
    `<section class="library"><div class="library-intro"><div><h1>Vault</h1></div><button class="primary-button" data-action="new">${icon("plus")}New page</button></div>
    <div class="library-toolbar"><div class="tabs">${modes.map(([v, i, label]) => `<button data-library-view="${v}" class="${libraryView === v ? "selected" : ""}">${icon(i)}${label}</button>`).join("")}</div><label class="library-search">${icon("search")}<input id="library-search" aria-label="Filter pages" placeholder="Filter pages…" value="${e(search)}" /></label></div>
    <div id="library-results">${libraryView === "gallery" ? galleryHTML(filtered) : libraryView === "list" ? listHTML(filtered) : libraryView === "graph" ? graphHTML(filtered) : libraryTreeHTML(filtered)}</div></section>`;
  const graphRoot = document.querySelector<HTMLElement>("#library-results .graph-view");
  if (graphRoot) graphCleanup = mountGraph(graphRoot, filtered, pages);
  document.querySelectorAll<HTMLDetailsElement>(".library-tree details[data-tree-page]").forEach(details => {
    details.addEventListener("toggle", () => {
      if (details.isConnected) libraryTreeExpansion.set(details.dataset.treePage!, details.open);
    });
  });
  refreshIcons();
}
function galleryHTML(list: Page[]) {
  return list.length
    ? `<div class="gallery">${list
        .map(
          (p, i) =>
            `<button class="gallery-card" data-open="${e(p.id)}"><div class="card-cover tone-${i % 4}"><span>${pageIcon(p)}</span><div class="card-pattern"></div></div><div class="card-body"><h3>${e(p.title)}</h3><p>${e(
              p.body
                .replace(/^#{1,6}\s+.*$/gm, "")
                .replace(/[*\[\]`>:]/g, "")
                .trim()
                .slice(0, 98) || "An idea waiting to take shape.",
            )}</p><div class="card-footer"><span>${e(p.parent ? pages.find((x) => x.id === p.parent)?.title || "Child page" : "Root page")}</span>${icon("arrow-up-right")}</div></div></button>`,
        )
        .join("")}</div>`
    : `<p class="empty-state">No matching pages.</p>`;
}
function listHTML(list: Page[]) {
  return `<div class="table-scroll"><table class="pages-table"><thead><tr><th>Page name</th><th>Parent page</th><th>Properties</th><th>Last modified</th></tr></thead><tbody>${list
    .map(
      (p) =>
        `<tr><td><button data-open="${e(p.id)}">${pageIcon(p)}${e(p.title)}</button></td><td>${e(p.parent ? pages.find((x) => x.id === p.parent)?.title : "—")}</td><td>${Object.entries(
          p.properties,
        )
          .map(
            ([key, value]) =>
              `<span class="tag">${e(key)}: ${e(String(value))}</span>`,
          )
          .join(" ")}</td><td>${formatDate(p.updated)}</td></tr>`,
    )
    .join("")}</tbody></table></div>`;
}
function libraryTreeHTML(list: Page[]) {
  if (!list.length) return '<p class="empty-state">No matching pages.</p>';
  const ids = new Set(list.map((p) => p.id));
  const seen = new Set<string>();
  const row = (p: Page, depth: number): string => {
    if (seen.has(p.id)) return "";
    seen.add(p.id);
    const children = list.filter(c => c.parent === p.id && !seen.has(c.id));
    const content = `<button data-open="${e(p.id)}">${pageIcon(p)}${e(p.title)}</button><span class="muted">${p.body.length} characters</span>`;
    if (!children.length) return `<li><div class="library-tree-row"><span class="library-tree-chevron-space" aria-hidden="true"></span>${content}</div></li>`;
    // Roots are level 1. Open levels 1 and 2 to show exactly three levels.
    const open = libraryTreeExpansion.get(p.id) ?? depth < 2;
    return `<li><details data-tree-page="${e(p.id)}" ${open ? "open" : ""}><summary class="library-tree-row" aria-label="Toggle children of ${e(p.title)}">${icon("chevron-right", "library-tree-chevron")}${content}</summary><ul>${children.map(c => row(c, depth + 1)).join("")}</ul></details></li>`;
  };
  return `<div class="library-tree"><ul>${list
    .filter((p) => !p.parent || !ids.has(p.parent))
    .map(p => row(p, 0))
    .join("")}</ul></div>`;
}
function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function modal(title: string, body: string, wide = false) {
  closeModal();
  const dialog = document.createElement("dialog");
  dialog.id = "dialog";
  dialog.className = wide ? "wide-dialog" : "";
  dialog.innerHTML = `<div class="dialog-heading"><h2>${e(title)}</h2>${button("close-dialog", "x", "Close")}</div>${body}`;
  document.body.append(dialog);
  dialog.showModal();
  refreshIcons();
  return dialog;
}
function closeModal() {
  slashCleanup?.();
  slashCleanup = undefined;
  editor?.cancelSlash();
  const dialog = document.querySelector("#dialog");
  if (dialog instanceof HTMLDialogElement) dialog.close();
  document.querySelector("#dialog")?.remove();
}
async function newPage(parent: string | null = null, embed = false) {
  if (!(await save())) return;
  const ownerId = current?.id;
  const page = await api<Page>("/pages", {
    method: "POST",
    body: JSON.stringify({
      title: "New page",
      parent,
      icon: "file-text",
      body: "",
      properties: {},
    }),
  });
  pages.push(page);
  if (embed && current?.id === ownerId) {
    insertMarkdown(
      `\n<page url="${escapeXml(pageUrl(page.id))}">${escapeXml(page.title)}</page>\n`,
    );
    if (!(await save())) return;
  }
  closeModal();
  view = "document";
  await openPage(page.id);
  const title = document.querySelector<HTMLInputElement>("#page-title");
  title?.focus();
  title?.select();
}

let databaseCreationBusy = false;
async function createDatabase(parent: string | null, mode?: "inline" | "full") {
  if (databaseCreationBusy) return;
  databaseCreationBusy = true;
  app.inert = true;
  const ownerId = current?.id, originalRoute = location.hash;
  try {
    if (!(await save())) return;
    pages = await refreshWorkspacePages();
    if (!databaseApiAvailable) { toast(databaseRestartMessage); return; }
    if (!(await save())) return;
    const parentPage = current?.id === parent ? current : pages.find(page => page.id === parent);
    if (parent && !parentPage) throw new Error("The parent page is no longer available.");
    const snapshot = await api<DatabaseSnapshot>("/databases", {
      method: "POST",
      body: JSON.stringify({ title: "New database", parent, ...(parentPage ? { parentRevision: parentPage.revision } : {}) }),
    });
    pages = await refreshWorkspacePages();
    if (parent) collapsed.delete(parent);
    collapsed.delete(snapshot.database.pageId ?? snapshot.database.id);
    renderSidebar();
    if (location.hash !== originalRoute) return;
    if (mode && current?.id === ownerId) {
      const hostId = snapshot.database.pageId ?? snapshot.database.id;
      const source = workspace && usesNotionSyntax(workspace.session.snapshot.config) && enabled(workspace.session.snapshot.config, "notion_databases")
        ? databaseReference(hostId, "", mode === "inline")
        : `[New database](#database/${snapshot.database.id})`;
      insertMarkdown(`\n${source}\n`);
      if (!(await save())) { toast("Database created in the tree. Its page reference remains in your unsaved draft."); return; }
    }
    closeModal();
    if (mode !== "inline") await navigation?.navigate({ kind: "database", id: snapshot.database.id });
  } catch (error) { report(error); }
  finally {
    databaseCreationBusy = false;
    app.inert = false;
    if (databaseRoute?.id && location.hash !== originalRoute) {
      const title = document.querySelector<HTMLInputElement>('#main [aria-label="Database title"]');
      title?.focus(); title?.select();
    }
  }
}
async function addDatabaseRecord(id: string) {
  if (!(await save())) return;
  const snapshot = await api<DatabaseSnapshot>(`/databases/${encodeURIComponent(id)}`);
  if (!snapshot.dataSources.length) { toast("This database has no available data source."); return; }
  if (!(await navigation?.navigate({ kind: "database", id }))) return;
  document.querySelector<HTMLButtonElement>("#main [data-db-row]")?.click();
}
type PageMetadataPatch = Partial<Pick<Page, "title" | "parent" | "favorite" | "trashed" | "sidebarOrder">>;

async function deleteChildPages(ids: string[], isCurrent: () => boolean): Promise<boolean> {
  if (pageActionBusy || !isCurrent()) return false;
  const targets = [...new Set(ids)].flatMap(id => {
    const page = pages.find(item => item.id === id);
    return page ? [page] : [];
  });
  if (!targets.length) return true;
  // A malformed child entry must not trash the editor's page or its ancestors.
  const ancestors = new Set<string>();
  for (let page = current; page && !ancestors.has(page.id); page = pages.find(item => item.id === page!.parent) ?? null)
    ancestors.add(page.id);
  if (targets.some(page => ancestors.has(page.id))) {
    toast("This child page entry points to the current page or an ancestor. Remove it in Source instead.");
    return false;
  }
  const targetIds = new Set(targets.map(page => page.id));
  const roots = targets.filter(target => {
    const visited = new Set<string>();
    for (let parent = target.parent; parent && !visited.has(parent); parent = pages.find(page => page.id === parent)?.parent ?? null) {
      if (targetIds.has(parent)) return false;
      visited.add(parent);
    }
    return true;
  });
  const label = targets.length === 1 ? targets[0].title : `${targets[0].title} and ${targets.length - 1} more`;
  const dialog = modal("Delete child pages", `<p>Delete ${e(label)}${targets.length > 1 ? ` (${targets.length} child pages)` : ""}?</p><p class="muted">These pages and their children will move to Trash. You can restore them from Trash.</p><div class="dialog-actions"><button type="button" class="secondary-button" data-action="close-dialog">Cancel</button><button type="button" class="primary-button danger" data-confirm-child-delete>Move to Trash</button></div>`);
  return new Promise(resolve => {
    let submitting = false;
    dialog.addEventListener("close", () => { if (!submitting) resolve(false); }, { once: true });
    dialog.querySelector<HTMLButtonElement>("[data-confirm-child-delete]")!.addEventListener("click", async event => {
      if (submitting) return;
      submitting = true;
      (event.currentTarget as HTMLButtonElement).disabled = true;
      try {
        for (const target of roots) {
          if (!isCurrent() || !(await mutateSidebarPage(target, { trashed: true }))) { resolve(false); return; }
          if (!pages.some(page => page.id === target.id)) continue;
          // YAML can override the vault metadata; retain the blocks in that case.
          resolve(false);
          return;
        }
        toast(`Moved ${targets.length} child ${targets.length === 1 ? "page" : "pages"} to Trash. You can restore them from Trash.`);
        resolve(isCurrent());
      } catch (error) {
        report(error);
        resolve(false);
      } finally {
        if (dialog.isConnected) closeModal();
      }
    });
  });
}

async function loadDatabases(id?: string, isCurrent = () => true): Promise<boolean> {
  if (!(await save()) || !isCurrent()) return false;
  const loadedPages = await refreshWorkspacePages();
  if (!isCurrent() || !(await save()) || !isCurrent()) return false;
  if (!databaseApiAvailable) {
    closeModal(); closePageContextMenu(); destroyEditor();
    current = null; library = false; dirty = false; pages = loadedPages;
    databaseRoute = { kind: "database", ...(id ? { id } : {}) };
    document.querySelector("#main")!.innerHTML = `<section class="database-workspace"><h1>Databases</h1><p>${e(databaseRestartMessage)}</p><button class="primary-button" data-action="retry-databases">Check connection</button></section>`;
    document.querySelector("#page-options")!.innerHTML = pageOptions();
    renderSidebar(); updateCounts(); status("Server update needed", "error");
    return true;
  }
  const host = document.createElement("div");
  const controller = new DatabaseWorkspace(host, {
    vaultKey: vaultPath,
    openPage,
    openDatabase: id => navigation?.navigate({ kind: "database", ...(id ? { id } : {}) }) ?? Promise.resolve(false),
    changed: saved => { const index = pages.findIndex(page => page.id === saved.id); if (index < 0) pages.push(saved); else pages[index] = saved; renderSidebar(); },
    createDatabase: () => createDatabase(null),
  });
  try { await controller.load(id); }
  catch (error) { controller.destroy(); throw error; }
  if (!isCurrent() || !(await save()) || !isCurrent()) { controller.destroy(); return false; }
  closeModal(); closePageContextMenu(); destroyEditor();
  current = null; library = false; dirty = false;
  pages = loadedPages;
  databaseWorkspace = controller; databaseRoute = { kind: "database", ...(id ? { id } : {}) };
  document.querySelector("#main")!.replaceChildren(host);
  document.querySelector("#breadcrumb")!.textContent = "Databases";
  const sourceMenu = document.querySelector<HTMLElement>("#source-file-options"); if (sourceMenu) sourceMenu.hidden = true;
  document.querySelector("#page-options")!.innerHTML = pageOptions();
  status("Local database"); renderSidebar(); updateCounts(); refreshIcons();
  return true;
}

async function renderDatabasePageProperties(page: Page) {
  const host = document.querySelector<HTMLElement>("#database-page-properties");
  if (!host) return;
  if (page.databaseId) {
    const button = document.createElement("button"); button.className = "primary-button"; button.textContent = "Open database";
    button.addEventListener("click", () => void navigation?.navigate({ kind: "database", id: page.databaseId })); host.append(button);
  }
  if (!page.dataSourceId) return;
  try {
    const source = await api<DatabaseDataSource>(`/data-sources/${encodeURIComponent(page.dataSourceId)}`);
    if (!host.isConnected || current?.id !== page.id) return;
    let recoveredSchema: string | null = null;
    try { if (readDraft(page.id)) recoveredSchema = localStorage.getItem(`${draftKey(page.id)}:schema`); } catch { /* Optional draft recovery. */ }
    databaseSchemaRevision = recoveredSchema ?? source.revision;
    host.className = "database-page-properties";
    const heading = document.createElement("h3"); heading.textContent = source.title; host.append(heading);
    for (const field of source.properties.filter(field => field.type !== "title")) {
      const row = document.createElement("div"); row.className = "database-page-property";
      const label = document.createElement("span"); label.textContent = field.name;
      const cell = propertyInput(field, page, page.properties[field.key], value => {
        if (current?.id !== page.id) return;
        current.properties[field.key] = value;
        markDirty();
      });
      row.append(label, cell); host.append(row);
    }
  } catch (error) { if (host.isConnected) { const note = document.createElement("p"); note.textContent = error instanceof Error ? error.message : "Database properties could not be loaded"; host.append(note); } }
}

async function requirePageActions() {
  const info = await api<{ capabilities?: { pageActions?: number; sidebarDrag?: number; systemRecycleBin?: boolean } }>("/status");
  if (!info.capabilities?.pageActions)
    throw new Error("The local server needs to be restarted to use page actions. Your page has not been changed.");
  return info;
}

async function mutateSidebarPage(page: Page, patch: PageMetadataPatch | "duplicate", move?: PageMoveInput): Promise<boolean> {
  if (pageActionBusy) return false;
  pageActionBusy = true;
  app.inert = true;
  try {
    const info = await requirePageActions();
    if (move && !info.capabilities?.sidebarDrag) throw new Error("Restart the local server to enable page dragging. Your page has not been moved.");
    const localId = current?.id, localRevision = current?.revision;
    if (!(await save())) return false;
    if (move && localId && current?.id === localId && move.baseRevisions[localId] === localRevision)
      move.baseRevisions[localId] = current.revision;
    const base = current?.id === page.id ? current : page;
    const renamedBody = patch !== "duplicate" && patch.title !== undefined
      ? renameDocumentPageSource(base.body, base.syntax ?? defaultSyntax(base.bodyFormat), patch.title)
      : base.body;
    const schemaRevision = base.dataSourceId && patch !== "duplicate" && patch.title !== undefined
      ? (await api<DatabaseDataSource>(`/data-sources/${encodeURIComponent(base.dataSourceId)}`)).revision : undefined;
    const saved = await api<Page>(`/pages/${page.id}${move ? "/move" : patch === "duplicate" ? "/duplicate" : ""}`, {
      method: move || patch === "duplicate" ? "POST" : "PUT",
      body: JSON.stringify({ ...(move ?? (patch === "duplicate" ? {} : patch)), ...(renamedBody !== base.body ? { body: renamedBody } : {}), baseRevision: base.revision, ...(schemaRevision ? { schemaRevision } : {}) }),
    });
    if (patch !== "duplicate" && Object.entries(patch).some(([key, value]) => saved[key as keyof Page] !== value))
      toast("Document metadata overrides this property. Edit its YAML or title block to change it.");
    if (patch !== "duplicate" && current?.id === saved.id) {
      if (renamedBody !== base.body) {
        destroyEditor();
        current = saved;
        renderDocument();
      }
      // The editor still owns its body and undo history; only metadata changed.
      Object.assign(current, { title: saved.title, parent: saved.parent, favorite: saved.favorite, trashed: saved.trashed, sidebarOrder: saved.sidebarOrder, revision: saved.revision, updated: saved.updated });
      const title = document.querySelector<HTMLTextAreaElement>("#page-title");
      if (title && patch.title !== undefined) title.value = saved.title;
      const parent = document.querySelector<HTMLSelectElement>("#parent-select");
      if (parent) parent.value = saved.parent ?? "";
    }
    pages = await refreshWorkspacePages();
    closeModal();
    if (current && !pages.some((item) => item.id === current!.id)) {
      destroyEditor();
      current = null;
      dirty = false;
      await showLibrary();
    } else if (patch === "duplicate") {
      await openPage(saved.id);
    } else if (library) renderLibrary();
    else if (current) renderRelations();
    renderSidebar();
    document.querySelector("#page-options")!.innerHTML = pageOptions();
    refreshIcons();
    return true;
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      if (current?.id === page.id) {
        if (patch !== "duplicate") Object.assign(current, patch);
        persistDraft(current);
        dirty = true;
        conflict = error.data;
        showConflict();
      } else {
        toast("The page changed. Both versions are preserved in Conflicts and versions; the action was not retried.");
      }
    } else report(error);
    return false;
  } finally {
    app.inert = false;
    pageActionBusy = false;
  }
}

function pageActionForm(page: Page, action: "rename" | "move") {
  const descendants = new Set([page.id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const candidate of pages) if (candidate.parent && descendants.has(candidate.parent) && !descendants.has(candidate.id)) {
      descendants.add(candidate.id);
      changed = true;
    }
  }
  const dialog = modal(action === "rename" ? "Rename page" : "Move page", `<form class="page-action-form">
    ${action === "rename" ? `<label>Page name<input name="title" required maxlength="500" value="${e(page.title)}"></label>` : `<p class="muted">Move ${e(page.title)} and its child pages.</p><label>Destination<select name="parent"><option value="">Vault root</option>${pages.filter((candidate) => !descendants.has(candidate.id)).map((candidate) => `<option value="${e(candidate.id)}" ${candidate.id === page.parent ? "selected" : ""}>${e(candidate.title)}</option>`).join("")}</select></label>`}
    <div class="dialog-actions"><button type="button" class="secondary-button" data-action="close-dialog">Cancel</button><button type="submit" class="primary-button">${action === "rename" ? "Save name" : "Move page"}</button></div></form>`);
  const input = dialog.querySelector<HTMLInputElement>("input");
  input?.select();
  dialog.querySelector("form")!.addEventListener("submit", (event) => {
    event.preventDefault();
    const title = input?.value.trim();
    if (action === "rename" && !title) { input?.setCustomValidity("Enter a page name."); input?.reportValidity(); return; }
    const submit = dialog.querySelector<HTMLButtonElement>("[type=submit]")!;
    submit.disabled = true;
    void mutateSidebarPage(page, action === "rename" ? { title } : { parent: dialog.querySelector("select")!.value || null }).finally(() => { submit.disabled = false; });
  });
  input?.addEventListener("input", () => input.setCustomValidity(""));
}

async function handlePageAction(page: Page, action: PageAction) {
  if (action === "open-tab") {
    await workspaceTabs?.open(page.databaseId ? { kind: "database", id: page.databaseId } : { kind: "page", id: page.id });
  } else if (action === "link") {
    const url = new URL(location.href);
    url.hash = pageUrl(page.id);
    try { await navigator.clipboard.writeText(url.href); toast("Page link copied."); }
    catch {
      const dialog = modal("Copy page link", `<label>Page link<input readonly value="${e(url.href)}"></label><p class="muted">Select and copy this link.</p>`);
      dialog.querySelector("input")?.select();
    }
  } else if (action === "rename" || action === "move") pageActionForm(page, action);
  else if (action === "favorite") await mutateSidebarPage(page, { favorite: !page.favorite });
  else if (action === "duplicate") {
    if (await mutateSidebarPage(page, "duplicate")) toast("Page duplicated. Child pages and linked pages are not copied.");
  } else if (action === "trash") {
    if (await mutateSidebarPage(page, { trashed: true })) toast("Moved to Trash with its child pages. You can restore it from Trash.");
  }
}

async function showTrash() {
  const info = await requirePageActions();
  const all = await api<Page[]>("/pages?includeTrashed=true");
  const entries = all.filter((page) => page.trashed);
  const dialog = modal("Trash", `<p class="muted">Restore returns a page and its children to the vault. Delete moves their Markdown files to the Windows Recycle Bin, where you can recover them.</p>${!info.capabilities?.systemRecycleBin ? '<p class="muted">System Recycle Bin requires an up-to-date Windows server.</p>' : ""}<div class="trash-list">${entries.length ? entries.map((page) => `<div><span>${e(page.title)}</span><div class="trash-row-actions"><button class="secondary-button" data-restore="${e(page.id)}">${icon("undo-2")}Restore</button><button class="secondary-button danger" data-recycle="${e(page.id)}" title="Move to system Recycle Bin" ${info.capabilities?.systemRecycleBin ? "" : "disabled"}>${icon("trash-2")}Delete</button></div></div>`).join("") : '<p class="empty-small">Trash is empty.</p>'}</div>`);
  dialog.addEventListener("click", (event) => {
    const recycle = (event.target as Element).closest<HTMLButtonElement>("[data-recycle]");
    if (recycle) {
      const target = entries.find((entry) => entry.id === recycle.dataset.recycle);
      if (!target || pageActionBusy) return;
      recycle.disabled = true;
      recycle.textContent = "Deleting…";
      void recycleTrashPage(target, all).catch(report).finally(() => { recycle.disabled = false; recycle.textContent = "Delete"; });
      return;
    }
    const restore = (event.target as Element).closest<HTMLButtonElement>("[data-restore]");
    const page = entries.find((entry) => entry.id === restore?.dataset.restore);
    if (!restore || !page) return;
    restore.disabled = true;
    void mutateSidebarPage(page, { trashed: false }).then(async (success) => {
      if (success) { toast("Page restored."); await showTrash(); }
    }).catch(report).finally(() => { restore.disabled = false; });
  });
}

async function recycleTrashPage(page: Page, all: Page[]) {
  if (pageActionBusy) return;
  pageActionBusy = true;
  app.inert = true;
  try {
    const info = await requirePageActions();
    if (!info.capabilities?.systemRecycleBin) throw new Error("System Recycle Bin requires an up-to-date Windows server.");
    if (!(await save())) return;
    const selected = new Map([[page.id, page.revision]]);
    for (let changed = true; changed;) {
      changed = false;
      for (const item of all) if (item.parent && selected.has(item.parent) && !selected.has(item.id)) {
        selected.set(item.id, item.revision); changed = true;
      }
    }
    await api(`/pages/${page.id}/recycle`, {
      method: "POST",
      body: JSON.stringify({ baseRevision: page.revision, baseRevisions: Object.fromEntries(selected) }),
    });
    pages = await refreshWorkspacePages();
    renderSidebar();
    if (current && selected.has(current.id)) {
      destroyEditor();
      current = null;
      dirty = false;
      await showLibrary();
    } else if (library) renderLibrary();
    await showTrash();
    toast(`Moved ${selected.size === 1 ? "page" : `${selected.size} pages`} to the Windows Recycle Bin.`);
  } finally {
    app.inert = false;
    pageActionBusy = false;
  }
}

function sidebarContextMenu(target: Element, x?: number, y?: number) {
  const row = target.closest<HTMLElement>("[data-page-row]");
  if (!row || pageActionBusy) return;
  captureEditor();
  const page = current?.id === row.dataset.pageRow ? current : pages.find((item) => item.id === row.dataset.pageRow);
  if (!page) return;
  const anchor = row.querySelector<HTMLElement>("[data-page-menu]")!;
  const rect = anchor.getBoundingClientRect();
  showPageContextMenu(structuredClone(page), x ?? rect.right, y ?? rect.bottom, anchor, (action) => void handlePageAction(structuredClone(page), action).catch(report));
}

document.addEventListener("contextmenu", (event) => {
  if (!(event.target as Element).closest("[data-page-row]")) return;
  event.preventDefault();
  sidebarContextMenu(event.target as Element, event.clientX, event.clientY);
});
document.addEventListener("keydown", (event) => {
  if ((event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) && (event.target as Element).closest("[data-page-row]")) {
    event.preventDefault();
    sidebarContextMenu(event.target as Element);
  }
});

function showProperties() {
  if (!current) return;
  captureEditor();
  const dialog = modal(
    "Page properties",
    `<p class="muted">Properties are stored in vault metadata.json. YAML and Pandoc title blocks in the document override these defaults. Edit document overrides in source or Metadata details.</p><form id="properties-form"><label>Properties (JSON object)<textarea name="properties" class="code-input" rows="10" spellcheck="false">${e(JSON.stringify(current.properties, null, 2))}</textarea></label><p class="muted">Example: {"status": "In progress", "tags": ["Design", "Knowledge management"]}</p><div class="dialog-actions"><button type="submit" class="primary-button">Save properties</button></div></form>`,
  );
  const initialCover = typeof current.properties.cover === "string" ? current.properties.cover : "";
  const coverRow = document.createElement("label"), coverInput = document.createElement("input"); coverRow.textContent = "Cover image URL";
  coverInput.name = "cover"; coverInput.setAttribute("aria-label", "Cover image URL"); coverInput.value = initialCover; coverRow.append(coverInput); dialog.querySelector("form")!.prepend(coverRow);
  dialog.querySelector("form")!.addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      const value = JSON.parse(
        String(new FormData(event.target as HTMLFormElement).get("properties")),
      );
      if (!value || Array.isArray(value) || typeof value !== "object")
        throw new Error("Properties must be a JSON object.");
      if (coverInput.value !== initialCover) {
        if (coverInput.value) value.cover = coverInput.value; else delete value.cover;
      }
      current!.properties = value;
      markDirty();
      closeModal();
      renderDocument();
    } catch (error) {
      report(error);
    }
  });
}
function showPageIcon(anchor: HTMLElement) {
  if (!current) return;
  captureEditor();
  const page = current;
  coverPickerCleanup?.();
  coverPickerCleanup = undefined;
  pageIconCleanup?.();
  pageIconCleanup = openCalloutIconPicker(anchor, value => {
    pageIconCleanup = undefined;
    if (current !== page) return;
    captureEditor();
    current.icon = value;
    markDirty();
    pages = pages.map(p => p.id === current!.id ? { ...current! } : p);
    renderPageDecoration();
    renderSidebar();
    refreshBreadcrumbs();
    refreshIcons();
    document.querySelector<HTMLButtonElement>('[data-action="page-icon"]')?.focus();
  }, "Page icon", { lucide: true, current: page.icon });
}
function showPageCover(anchor: HTMLElement) {
  if (!current) return;
  captureEditor();
  const page = current;
  const cover = typeof page.properties.cover === "string" ? page.properties.cover : "";
  const apply = (value: string) => {
    if (current !== page) return;
    captureEditor();
    if (value) page.properties.cover = value;
    else delete page.properties.cover;
    if (value !== cover) delete page.properties.coverPosition;
    markDirty();
    renderPageDecoration();
  };
  coverPickerCleanup?.();
  coverPickerCleanup = openPageCoverPicker(anchor, {
    cover,
    onSelect: value => { coverPickerCleanup = undefined; apply(value); },
    onRemove: () => { coverPickerCleanup = undefined; apply(""); },
    onUpload: async file => {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = () => resolve(String(reader.result).split(",")[1]);
        reader.readAsDataURL(file);
      });
      const uploaded = await api<{ path: string }>("/assets", {
        method: "POST",
        body: JSON.stringify({ name: file.name, contentType: file.type, data }),
      });
      if (current !== page) { toast("Image uploaded. Return to the original page to use it."); return; }
      coverPickerCleanup = undefined;
      apply(uploaded.path);
    },
    onError: report,
  });
}

function startCoverReposition() {
  if (!current) return;
  const page = current;
  const region = document.querySelector<HTMLElement>("#page-cover-region");
  const image = region?.querySelector<HTMLImageElement>(".page-cover");
  const toolbar = region?.querySelector<HTMLElement>(".page-cover-toolbar");
  if (!region || !image || !toolbar) return;
  coverPickerCleanup?.();
  coverPickerCleanup = undefined;
  coverRepositionCleanup?.();
  const raw = page.properties.coverPosition;
  let candidate = typeof raw === "number" && Number.isFinite(raw) ? Math.max(0, Math.min(100, raw)) : 50;
  const preview = () => { image.style.objectPosition = `50% ${candidate}%`; };
  const pointerDown = (event: PointerEvent) => {
    if (event.target !== image || !image.naturalWidth || !image.naturalHeight) return;
    event.preventDefault();
    const scale = Math.max(region.clientWidth / image.naturalWidth, region.clientHeight / image.naturalHeight);
    const overflow = image.naturalHeight * scale - region.clientHeight;
    if (overflow <= 0) return;
    const startY = event.clientY, startPosition = candidate;
    image.setPointerCapture(event.pointerId);
    const move = (moveEvent: PointerEvent) => {
      candidate = Math.max(0, Math.min(100, startPosition - (moveEvent.clientY - startY) * 100 / overflow));
      preview();
    };
    const stop = () => {
      image.removeEventListener("pointermove", move);
      image.removeEventListener("pointerup", stop);
      image.removeEventListener("pointercancel", stop);
    };
    image.addEventListener("pointermove", move);
    image.addEventListener("pointerup", stop);
    image.addEventListener("pointercancel", stop);
  };
  const keydown = (event: KeyboardEvent) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    candidate = Math.max(0, Math.min(100, candidate + (event.key === "ArrowUp" ? 5 : -5)));
    preview();
  };
  const click = (event: MouseEvent) => {
    const target = event.target as Element;
    if (target.closest("[data-cover-position-save]")) {
      if (current === page) {
        captureEditor();
        page.properties.coverPosition = Math.round(candidate);
        markDirty();
      }
      renderPageDecoration();
    } else if (target.closest("[data-cover-position-cancel]")) renderPageDecoration();
  };
  coverRepositionCleanup = () => {
    region.removeEventListener("pointerdown", pointerDown);
    region.removeEventListener("keydown", keydown);
    toolbar.removeEventListener("click", click);
    region.classList.remove("is-repositioning");
    region.removeAttribute("tabindex");
    region.removeAttribute("aria-label");
  };
  region.classList.add("is-repositioning");
  region.tabIndex = 0;
  region.setAttribute("aria-label", "Reposition cover with drag or arrow keys");
  toolbar.innerHTML = `<button type="button" data-cover-position-save>Save position</button><button type="button" data-cover-position-cancel>Cancel</button>`;
  region.addEventListener("pointerdown", pointerDown);
  region.addEventListener("keydown", keydown);
  toolbar.addEventListener("click", click);
  region.focus();
}
function showSettings() {
  const settingsDialog = modal(
    "Workspace settings",
    `<div class="settings-section"><h3>Your files belong to you</h3><p>Content is saved in local Markdown files. Shared page metadata is saved in metadata.json in the same vault.</p><code class="vault-path">${e(vaultPath)}</code></div><div class="settings-section"><h3>Reading experience</h3><label class="switch-row"><span>Color headings by level</span><input type="checkbox" id="color-headings" ${localStorage.getItem("notdown-color") === "on" ? "checked" : ""} /></label><label class="switch-row"><span>Pin table of contents (hover to expand when off)</span><input type="checkbox" id="pin-toc" ${localStorage.getItem("notdown-toc") === "pinned" ? "checked" : ""} /></label></div><div class="settings-section"><h3>Current development version</h3><p>Local revision checks and conflict copies protect your edits. Configure Cloud sync below to connect your devices while the app is open.</p><p>MyBase supports metadata export. Queries and two-way property sync are not yet implemented.</p></div><div class="dialog-actions"><button class="secondary-button" data-action="mybase-export">Export page metadata for MyBase</button><button class="primary-button" data-action="close-dialog">Done</button></div>`,
  );
  settingsDialog.classList.add("workspace-settings-dialog");
  settingsDialog.setAttribute("aria-label", "Workspace settings");
  const settingsBody = document.createElement("div"); settingsBody.className = "settings-body";
  for (const child of Array.from(settingsDialog.children).slice(1)) settingsBody.append(child);
  settingsDialog.append(settingsBody);
  settingsDialog.addEventListener("cancel", event => { event.preventDefault(); closeModal(); });
  const outside = (event: MouseEvent) => {
    const bounds = settingsDialog.getBoundingClientRect();
    return event.target === settingsDialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom);
  };
  let pressedOutside = false;
  settingsDialog.addEventListener("pointerdown", event => { pressedOutside = outside(event); });
  settingsDialog.addEventListener("click", event => { if (pressedOutside && outside(event)) closeModal(); pressedOutside = false; });
  const vaultButton = document.createElement("button"); vaultButton.type = "button"; vaultButton.className = "secondary-button"; vaultButton.dataset.action = "vaults"; vaultButton.textContent = "Manage knowledge bases";
  settingsDialog.querySelector(".vault-path")?.after(vaultButton);
  const typingSection = document.createElement("div");
  typingSection.className = "settings-section";
  const typingHeading = document.createElement("h3");
  typingHeading.textContent = "Editing";
  const codeRow = document.createElement("label");
  codeRow.className = "switch-row";
  codeRow.textContent = "Code block input";
  const codeSelect = document.createElement("select");
  codeSelect.setAttribute("aria-label", "Code block input");
  for (const [value, label] of [["notion", "Notion"], ["markdown", "Markdown"]]) {
    const option = document.createElement("option");
    option.value = value; option.textContent = label; codeSelect.append(option);
  }
  codeSelect.value = codeInputMode();
  const codeHint = document.createElement("p");
  const describeCodeInput = () => {
    codeHint.textContent = codeSelect.value === "notion"
      ? "Type three backticks to enter a code block immediately."
      : "Type three backticks, optionally enter a language with suggestions, then press Enter. Three backticks followed by a space also creates a code block.";
  };
  codeSelect.addEventListener("change", () => {
    setCodeInputMode(codeSelect.value as CodeInputMode); describeCodeInput();
  });
  describeCodeInput(); codeRow.append(codeSelect);
  const languageHint = document.createElement("p");
  languageHint.textContent = "New code blocks reuse your last selected language unless you specify another one. Your input preference is saved on this device.";
  typingSection.append(typingHeading, codeRow, codeHint, languageHint);
  settingsDialog.querySelectorAll(".settings-section")[2]?.before(typingSection);
  const emojiRow = document.createElement("label");
  emojiRow.className = "switch-row";
  emojiRow.textContent = "Emoji style";
  const emojiSelect = document.createElement("select");
  emojiSelect.setAttribute("aria-label", "Emoji style");
  for (const { value, label } of emojiStyleOptions) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    emojiSelect.append(option);
  }
  emojiSelect.value = emojiStyle();
  emojiSelect.addEventListener("change", () => setEmojiStyle(emojiSelect.value as EmojiStyle));
  emojiRow.append(emojiSelect);
  settingsDialog.querySelectorAll(".settings-section")[1]?.append(emojiRow);
  const listRow = document.createElement("label");
  listRow.className = "switch-row";
  listRow.textContent = "Numbered list display";
  const listSelect = document.createElement("select");
  listSelect.setAttribute("aria-label", "Numbered list display");
  for (const [value, label] of [["markdown", "Markdown · 1 → 1 → 1"], ["notion", "Notion · 1 → a → i → 1"]]) {
    const option = document.createElement("option");
    option.value = value; option.textContent = label; listSelect.append(option);
  }
  listSelect.value = numberedListDisplay();
  listSelect.addEventListener("change", () => setNumberedListDisplay(listSelect.value as NumberedListDisplay));
  listRow.append(listSelect);
  const listHint = document.createElement("p");
  listHint.textContent = "Changes nested numbering for lists starting with numbers. Explicit letter and Roman numeral styles are preserved. Display only; Markdown source stays unchanged. Saved on this device.";
  settingsDialog.querySelectorAll(".settings-section")[1]?.append(listRow, listHint);
  void mountRuntimeSettings(settingsBody);
  void mountServiceSettings(settingsBody);
  void mountSyncSettings(settingsBody, { beforeSync: save });
  void mountHistorySettings(settingsBody, save);
  mountSidebarPreferences(settingsBody);
}
function showConflict() {
  if (!conflict) return;
  const disk = conflict.current as Page,
    proposed = conflict.proposed as Page;
  const draft = current?.id === proposed?.id ? current : proposed;
  const diskBody = disk?.body ?? "";
  const proposedBody = proposed?.body ?? draft?.body ?? "";
  const dialog = modal(
    "Two versions detected; both have been preserved",
    `<p class="muted">Review the changed lines below. Unchanged sections are folded. Both original versions are preserved.</p><section class="conflict-section"><h3>Disk → Your edits</h3><div class="conflict-legend"><span class="diff-count-removed">− Version on disk</span><span class="diff-count-added">+ Your edits</span></div><div class="conflict-diff" data-conflict-diff aria-label="Conflict differences"></div></section><section class="conflict-section"><h3>Merged result</h3><p class="muted">Changes that will be saved, compared with the version on disk.</p><div class="conflict-diff" data-merged-diff aria-label="Merged differences"></div><details class="conflict-source"><summary>Edit merged content</summary><label for="merged-body">Full Markdown source</label><textarea id="merged-body" rows="8" class="code-input">${e(draft?.body ?? proposedBody)}</textarea></details></section><p class="muted">Your edited title and properties will be used. The complete disk metadata remains in history. Further file changes will preserve another conflict.</p><div class="dialog-actions"><button class="secondary-button" data-action="close-dialog">Resolve later</button><button class="primary-button" data-action="resolve-conflict">Save merged version</button></div>`,
    true,
  );
  mountConflictDiff(dialog, diskBody, proposedBody);
}
async function resolveConflict() {
  const body =
    document.querySelector<HTMLTextAreaElement>("#merged-body")!.value;
  const draft =
    current?.id === conflict.proposed?.id ? current : conflict.proposed;
  try {
    const schemaRevision = draft.dataSourceId ? (await api<DatabaseDataSource>(`/data-sources/${encodeURIComponent(draft.dataSourceId)}`)).revision : undefined;
    const saved = await api<Page>(`/conflicts/${conflict.conflictId}/resolve`, {
      method: "POST",
      body: JSON.stringify({
        baseRevision: conflict.current.revision,
        ...(schemaRevision ? { schemaRevision } : {}),
        body,
        bodyFormat: draft.bodyFormat || "markdown",
        syntax: draft.syntax ?? null,
        title: draft.title,
        parent: draft.parent,
        properties: draft.properties,
        icon: draft.icon,
        favorite: draft.favorite,
        trashed: draft.trashed,
        sidebarOrder: draft.sidebarOrder,
      }),
    });
    const oldId = current?.id;
    destroyEditor();
    current = saved;
    dirty = false;
    conflict = null;
    if (oldId) removeDraft(oldId);
    pages = await refreshWorkspacePages();
    closeModal();
    if (pages.some((page) => page.id === saved.id)) renderDocument();
    else { current = null; await showLibrary(); }
    renderSidebar();
    toast("Merged version saved to Markdown.");
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      conflict = error.data;
      if (current && current.id === conflict.proposed?.id) {
        current.body = body;
        persistDraft(current);
      }
      showConflict();
    } else report(error);
  }
}
async function showConflicts() {
  if (conflict) {
    showConflict();
    return;
  }
  const entries = await api<any[]>("/conflicts");
  const dialog = modal(
    "Conflicts and versions",
    `<p class="muted">Every save checks the source file revision. Conflicting edits are preserved as separate Markdown files without overwriting the disk content.</p><div class="conflict-list">${entries.length ? entries.map((entry, i) => `<div><strong>${e(entry.proposed?.title || entry.title || entry.pageId || entry.id || entry.conflictId)}</strong><p>${e(entry.resolved ? "Merged" : "Both versions are preserved. Open them to merge manually.")}</p>${entry.resolved ? "" : `<button class="secondary-button" data-conflict-entry="${i}">Review and merge</button>`}</div>`).join("") : `<div class="empty-state">${icon("git-branch")}<h3>No conflicts</h3><p>Your notes are safely saved.</p></div>`}</div>`,
  );
  dialog
    .querySelectorAll<HTMLButtonElement>("[data-conflict-entry]")
    .forEach((el) =>
      el.addEventListener(
        "click",
        () =>
          void (async () => {
            if (!(await save())) return;
            const entry = entries[Number(el.dataset.conflictEntry)];
            await openPage(entry.pageId || entry.proposed.id, true);
            if (current?.id !== (entry.pageId || entry.proposed.id)) return;
            const fresh = await api<Page>(
              `/pages/${entry.pageId || entry.proposed.id}`,
            );
            captureEditor();
            const recovered =
              dirty && current?.id === entry.proposed.id
                ? structuredClone(current)
                : null;
            destroyEditor();
            conflict = {
              ...entry,
              conflictId: entry.conflictId || entry.id,
              current: fresh,
            };
            current = recovered || {
              ...entry.proposed,
              revision: fresh.revision,
            };
            dirty = true;
            persistDraft(current!);
            renderDocument();
            showConflict();
          })().catch(report),
      ),
    );
}
function showSearch() {
  captureEditor();
  const dialog = modal(
    "Search vault",
    `<label class="dialog-search">${icon("search")}<input id="search-input" aria-label="Search vault" role="combobox" aria-expanded="true" aria-controls="search-results" placeholder="Search pages or content…" autocomplete="off" autofocus /><kbd>Esc</kbd></label><div class="search-section-label">Recently visited</div><div id="search-results" role="listbox" aria-label="Search results"></div><div class="search-hints"><span>↑ ↓ Select</span><span>Enter Open</span><span>Esc Close</span></div>`,
  );
  dialog.classList.add("search-dialog");
  const input = dialog.querySelector<HTMLInputElement>("#search-input")!;
  const results = dialog.querySelector<HTMLElement>("#search-results")!;
  let selected = 0;
  let matches: Page[] = [];
  const highlight = (value: string, query: string) => {
    const term = query.replace(/^"|"$/g, "").trim();
    const position = value
      .toLocaleLowerCase()
      .indexOf(term.toLocaleLowerCase());
    if (!term || position < 0) return e(value);
    return `${e(value.slice(0, position))}<mark>${e(value.slice(position, position + term.length))}</mark>${e(value.slice(position + term.length))}`;
  };
  const selection = () => {
    results
      .querySelectorAll<HTMLElement>("[role=option]")
      .forEach((row, index) => {
        row.classList.toggle("selected", index === selected);
        row.setAttribute("aria-selected", String(index === selected));
      });
    input.setAttribute(
      "aria-activedescendant",
      matches[selected] ? `result-${matches[selected].id}` : "",
    );
  };
  const render = (q: string) => {
    const searchable = pages.map((page) =>
      current?.id === page.id ? current : page,
    );
    matches = searchPages(searchable, q, recentPages()).slice(0, 40);
    selected = 0;
    dialog.querySelector(".search-section-label")!.textContent = q.trim()
      ? `${matches.length} results`
      : "Recently visited";
    results.innerHTML =
      matches
        .map((p, index) => {
          const parent = pages.find((parent) => parent.id === p.parent);
          const plain = p.body.replace(/[#*`]/g, "").replace(/\s+/g, " ");
          const at = plain
            .toLocaleLowerCase()
            .indexOf(q.replace(/^"|"$/g, "").toLocaleLowerCase());
          const snippet = q.trim()
            ? plain.slice(Math.max(0, at - 25), Math.max(0, at - 25) + 100)
            : "";
          return `<button id="result-${e(p.id)}" role="option" data-open="${e(p.id)}" data-result-index="${index}" class="search-result">${pageIcon(p)}<span><strong>${highlight(p.title, q)}</strong><small class="search-result-path">${e(parent?.title || "Private pages")}</small>${snippet ? `<small>${highlight(snippet, q)}</small>` : ""}</span>${icon("corner-down-left")}</button>`;
        })
        .join("") || '<div class="search-empty">No matching pages found</div>';
    selection();
    refreshIcons();
  };
  input.addEventListener("input", () => render(input.value));
  results.addEventListener("pointermove", (event) => {
    const row = (event.target as Element).closest<HTMLElement>(
      "[data-result-index]",
    );
    if (row) {
      selected = Number(row.dataset.resultIndex);
      selection();
    }
  });
  dialog.addEventListener("keydown", (event) => {
    if (event.isComposing) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      selected =
        (selected + (event.key === "ArrowDown" ? 1 : -1) + matches.length) %
        Math.max(1, matches.length);
      selection();
      results
        .querySelector('[aria-selected="true"]')
        ?.scrollIntoView({ block: "nearest" });
    } else if (event.key === "Enter" && matches[selected]) {
      event.preventDefault();
      const id = matches[selected].id;
      closeModal();
      void openPage(id).catch(report);
    }
  });
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeModal();
  });
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) closeModal();
  });
  render("");
  input.focus();
}
function insertMarkdown(text: string) {
  closeModal();
  if (workspace) {
    workspace.insert(text);
    sourceSelection = null;
    return;
  }
  if (view === "document" && editor) {
    editor.insertValue(text);
    current!.body = editor.getValue();
    current!.bodyFormat = editor.getBodyFormat();
  } else if (view === "source") {
    const el = document.querySelector<HTMLTextAreaElement>("#source-editor")!;
    el.setRangeText(
      text,
      sourceSelection?.start ?? el.selectionStart,
      sourceSelection?.end ?? el.selectionEnd,
      "end",
    );
    current!.body = el.value;
    el.focus();
  } else {
    current!.body += `\n\n${text}`;
    renderDocument();
  }
  sourceSelection = null;
  markDirty();
}
async function showAttachments(pageOnly = false) {
  captureEditor();
  workspace?.capture();
  editor?.captureSelection();
  const owner = !library && !databaseWorkspace ? current : null;
  const ownerEditor = editor, ownerWorkspace = workspace;
  const config = workspace?.session.snapshot.config || current?.syntax || defaultSyntax(current?.bodyFormat);
  const originalConfig = JSON.stringify(config);
  closeModal();
  if (!(await save())) return;
  openAssetLibrary({
    pageId: owner?.id, pageTitle: owner?.title, pageOnly: pageOnly && !!owner,
    canInsert: owner ? kind => commandEnabled(config, kind) : undefined,
    onInsert: owner ? (asset, kind) => {
      if (current?.id !== owner.id || editor !== ownerEditor || workspace !== ownerWorkspace || library ||
          JSON.stringify(workspace?.session.snapshot.config || current.syntax || defaultSyntax(current.bodyFormat)) !== originalConfig) {
        toast("The page changed. Reopen Attachments to choose where to insert the file."); return false;
      }
      const destination = asset.path.split("/").map(encodeURIComponent).join("/");
      insertMarkdown(mediaInsertMarkdown(kind, asset.name, destination, config));
      return true;
    } : undefined,
    onOpenPage: async reference => { try { await openPage(reference.pageId); } catch (error) { report(error); } },
  });
}
function showInsert() {
  if (!current || library) return;
  const initialQuery = editor?.getSlashQuery();
  const inline = initialQuery !== undefined && initialQuery !== null;
  const source = workspace
    ? null
    : document.querySelector<HTMLTextAreaElement>("#source-editor");
  sourceSelection = source
    ? { start: source.selectionStart, end: source.selectionEnd }
    : null;
  const selection = window.getSelection();
  const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
  const caret = range?.getBoundingClientRect();
  const fallback = (
    document.activeElement?.closest(".pm-document") ||
    source ||
    document.querySelector("#editor")
  )?.getBoundingClientRect();
  const anchor = caret?.height ? caret : fallback;
  editor?.captureSelection();
  const items = insertMenuItems(workspace?.session.snapshot.config, workspace?.activePane !== "source" && editor?.inFootnote());
  let dialog: HTMLElement;
  if (inline) {
    slashCleanup?.();
    document.querySelector("#dialog")?.remove();
    dialog = document.createElement("div");
    dialog.id = "dialog";
    dialog.className = "inline-slash";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-label", "Choose block type");
    dialog.innerHTML =
      '<div class="dialog-heading"><h2>Insert content</h2></div><div class="insert-grid" role="listbox" aria-label="Block types"></div><div class="insert-footer"><button type="button" class="insert-close"><span>Close menu</span><kbd>esc</kbd></button></div>';
    document.body.append(dialog);
  } else {
    dialog = modal(
      "Insert content",
      `<label class="insert-search">${icon("search")}<input aria-label="Search block types" placeholder="Search block types…" /></label><div class="insert-grid" role="listbox" aria-label="Block types"></div>`,
    );
  }
  dialog.classList.add("insert-dialog");
  const left = Math.max(
    12,
    Math.min(anchor?.left ?? 300, window.innerWidth - 336),
  );
  const top = Math.max(
    12,
    Math.min((anchor?.bottom ?? 160) + 5, window.innerHeight - 380),
  );
  dialog.style.left = `${left}px`;
  dialog.style.top = `${top}px`;
  let selected = 0;
  let filtered = items;
  const input = dialog.querySelector<HTMLInputElement>("input");
  const list = dialog.querySelector<HTMLElement>(".insert-grid")!;
  const positionInline = () => {
    if (!inline || !dialog.isConnected) return;
    const rect = editor?.getSlashAnchor();
    if (!rect) return;
    const viewport = window.visualViewport;
    const edge = 12;
    const gap = 8;
    const viewportTop = viewport?.offsetTop ?? 0;
    const viewportLeft = viewport?.offsetLeft ?? 0;
    const viewportBottom = viewportTop + (viewport?.height ?? window.innerHeight);
    const viewportRight = viewportLeft + (viewport?.width ?? window.innerWidth);
    const below = Math.max(0, viewportBottom - edge - rect.bottom - gap);
    const above = Math.max(0, rect.top - gap - viewportTop - edge);
    const desired = Math.min(380, list.scrollHeight + 78);
    const opensBelow = below >= Math.min(240, desired) || below >= above;
    const available = opensBelow ? below : above;
    dialog.style.maxHeight = `${Math.min(380, available)}px`;
    dialog.style.maxWidth = `${Math.max(0, viewportRight - viewportLeft - edge * 2)}px`;
    const size = dialog.getBoundingClientRect();
    dialog.style.left = `${Math.max(viewportLeft + edge, Math.min(rect.left, viewportRight - edge - size.width))}px`;
    dialog.style.top = `${opensBelow ? rect.bottom + gap : rect.top - gap - size.height}px`;
    dialog.dataset.placement = opensBelow ? "below" : "above";
  };
  dialog.querySelector(".insert-close")?.addEventListener("click", () => closeModal());
  const paint = () => {
    let previousGroup = "";
    list.innerHTML = filtered.map(([id, i, title, desc, , group], index) => {
      const heading = group !== previousGroup ? '<div class="insert-group-heading" role="presentation">' + e(group) + '</div>' : "";
      previousGroup = group;
      return heading + `<button id="insert-option-${id}" role="option" aria-selected="${index === selected}" data-insert="${id}" title="${e(desc)}" class="${index === selected ? "selected" : ""}">${icon(i)}<span><strong>${e(title)}</strong><small>${e(desc)}</small></span></button>`;
    }).join("") || '<p class="muted">No matching blocks</p>';
    refreshIcons();
    (input || dialog).setAttribute(
      "aria-activedescendant",
      filtered[selected] ? `insert-option-${filtered[selected][0]}` : "",
    );
    positionInline();
  };
  input?.setAttribute("role", "combobox");
  input?.setAttribute("aria-expanded", "true");
  const filter = (text: string) => {
    const query = text
      .replace(/^[/、]/, "")
      .toLowerCase()
      .trim();
    filtered = items.filter((item) =>
      item.join(" ").toLowerCase().includes(query),
    );
    selected = 0;
    if (inline) dialog.querySelector("h2")!.textContent = query ? "Filtered results" : "Insert content";
    paint();
    list.scrollTop = 0;
  };
  input?.addEventListener("input", () => filter(input.value));
  const keydown = (event: KeyboardEvent) => {
    if (event.isComposing || editor?.isComposing()) return;
    if (inline && event.key === "Enter" && event.shiftKey) {
      closeModal();
      return;
    }
    if (inline && editor?.getSlashQuery() == null) {
      closeModal();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      event.stopImmediatePropagation();
      selected =
        (selected + (event.key === "ArrowDown" ? 1 : -1) + filtered.length) %
        Math.max(filtered.length, 1);
      paint();
      list
        .querySelector('[aria-selected="true"]')
        ?.scrollIntoView({ block: "nearest" });
    } else if (event.key === "Enter" && filtered[selected]) {
      event.preventDefault();
      event.stopImmediatePropagation();
      void handleInsert(filtered[selected][0]).catch(report);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      closeModal();
      if (!inline) {
        editor?.focus();
        source?.focus();
      }
    } else if (
      inline &&
      ["Enter", "Tab", "ArrowLeft", "ArrowRight", "Home", "End"].includes(
        event.key,
      )
    ) {
      closeModal();
    }
  };
  if (inline) {
    const controller = new AbortController();
    const signal = controller.signal;
    let positionFrame = 0;
    const schedulePosition = () => {
      cancelAnimationFrame(positionFrame);
      positionFrame = requestAnimationFrame(positionInline);
    };
    slashCleanup = () => {
      controller.abort();
      cancelAnimationFrame(positionFrame);
    };
    document.addEventListener("keydown", keydown, { signal, capture: true });
    const updateQuery = (event: Event) => {
      if (!(event.target as Element).closest("#editor")) return;
      queueMicrotask(() => {
        if (signal.aborted || editor?.isComposing()) return;
        const query = editor?.getSlashQuery();
        if (query == null) closeModal();
        else {
          filter(query);
          schedulePosition();
        }
      });
    };
    document.addEventListener("input", updateQuery, { signal });
    document.addEventListener("compositionend", updateQuery, { signal });
    document.addEventListener("editor-slash-update", updateQuery, { signal });
    document.addEventListener(
      "selectionchange",
      () => {
        if (!editor?.isComposing() && editor?.getSlashQuery() == null)
          closeModal();
        else schedulePosition();
      },
      { signal },
    );
    document.addEventListener(
      "pointerdown",
      (event) => {
        if (dialog.contains(event.target as Node)) event.preventDefault();
        else closeModal();
      },
      { signal },
    );
    document.addEventListener("scroll", (event) => {
      if (!dialog.contains(event.target as Node)) schedulePosition();
    }, { signal, capture: true });
    window.addEventListener("resize", schedulePosition, { signal });
    window.visualViewport?.addEventListener("resize", schedulePosition, { signal });
    window.visualViewport?.addEventListener("scroll", schedulePosition, { signal });
    filter(initialQuery!);
    schedulePosition();
  } else {
    dialog.addEventListener("keydown", keydown);
    paint();
    input?.focus();
  }
}
// Syntax that requires a value asks for real content instead of inserting a sample.
function insertContentInput(title: string, fields: string[], encode: (values: string[]) => string) {
  captureEditor();
  workspace?.capture();
  const owner = current, ownerWorkspace = workspace, ownerEditor = editor;
  const originalBody = current!.body;
  const dialog = modal(title, `<form>${fields.map(label => `<label>${e(label)}<input aria-label="${e(label)}" required /></label>`).join("")}<output role="status"></output><button type="submit">Insert</button></form>`);
  const inputs = [...dialog.querySelectorAll<HTMLInputElement>("form input")];
  dialog.querySelector("form")!.onsubmit = event => {
    event.preventDefault();
    if (current !== owner || workspace !== ownerWorkspace || editor !== ownerEditor || current!.body !== originalBody) {
      dialog.querySelector("output")!.textContent = "The page changed. Reopen the insertion dialog."; return;
    }
    const values = inputs.map(input => input.value);
    if (values.some(value => !value.trim())) return;
    insertMarkdown(encode(values));
  };
  inputs[0]?.focus();
}

async function handleInsert(id: string) {
  if (document.querySelector(".inline-slash")) {
    if (editor?.getSlashQuery() == null) {
      closeModal();
      return;
    }
    editor.consumeSlash();
    editor.captureSelection();
  }
  if (id === "attachments") { await showAttachments(); return; }
  if (id === "database_full_page" || id === "database_inline") {
    if (!current) return;
    if (id === "database_inline" && (!workspace || !usesNotionSyntax(workspace.session.snapshot.config) || !enabled(workspace.session.snapshot.config, "notion_databases"))) return;
    const parent = current.id;
    closeModal();
    await createDatabase(parent, id === "database_inline" ? "inline" : "full");
    return;
  }
  if (id === "html_embed") {
    insertMarkdown('\n\n<embed src=""></embed>\n\n'); return;
  }
  if (id === "embed") {
    const localWeb = !workspace || enabled(workspace.session.snapshot.config, "notion_web_embed");
    insertMarkdown("\n\n" + (localWeb ? '<web-embed/>' : '<iframe src="" title="Web embed"></iframe>') + "\n\n");
    return;
  }
  if (id === "tabs" && workspace && ["notdown", "notion-markdown"].includes(workspace.session.snapshot.config.variant)) {
    insertMarkdown('\n\n<tabs>\n\t<tab>\n\t\tTab 1\n\t\t<empty-block/>\n\t</tab>\n\t<tab>\n\t\tTab 2\n\t\t<empty-block/>\n\t</tab>\n</tabs>\n\n'); return;
  }
  if (id === "meeting_notes" && workspace && ["notdown", "notion-markdown"].includes(workspace.session.snapshot.config.variant)) {
    const today = new Date(); const day = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('-');
    insertMarkdown('\n\n<meeting-notes>\n\t<mention-date start=' + JSON.stringify(day) + '/>\n\t<notes>\n\t\t\n\t</notes>\n</meeting-notes>\n\n'); return;
  }
  if (objectSamples[id]) {
    const emptyObjects: Record<string, string> = {
      button: '<button label="Button" actions="[]"/>', ai_block: '<ai-block/>',
      web_bookmark: '<bookmark/>', link_preview: '<link-preview/>', breadcrumb: '<breadcrumb/>',
      tabs: '<tabs>\n<tab title="">\n\n</tab>\n<tab title="">\n\n</tab>\n</tabs>',
      meeting_notes: '<meeting-notes title="">\n\n</meeting-notes>',
    };
    if (emptyObjects[id]) insertMarkdown("\n\n" + emptyObjects[id] + "\n\n");
    return;
  }
  if (id === "r_inline") {
    insertContentInput("Executable expression", ["Expression"], ([expression]) => "`r " + expression + "`"); return;
  }
  if (id === "executable_chunk" || id === "executable_inline") {
    captureEditor();
    workspace?.capture();
    const config = workspace?.session.snapshot.config ?? current!.syntax;
    if (!config || !commandEnabled(config, id)) return;
    const language = lastExecutableLanguage(commandEnabled(config, "quarto_python"));
    rememberExecutableLanguage(language);
    if (id === "executable_chunk") {
      insertMarkdown("\n```{" + language + "}\n\n```\n");
      return;
    }
    insertContentInput("Executable expression", ["Expression"], ([expression]) => "`" + (language === "r" ? "r" : "{" + language + "}") + " " + expression + "`");
    return;
  }
  if (inlineObjectCommands.includes(id as InlineObjectCommand)) {
    captureEditor();
    workspace?.capture();
    const owner = current, ownerWorkspace = workspace, ownerEditor = editor;
    const config = workspace?.session.snapshot.config ?? current!.syntax;
    if (!config || !commandEnabled(config, id)) return;
    const doc = workspace?.session.snapshot.doc ?? editor!.getDocument();
    const originalBody = current!.body;
    closeModal();
    inlineObjectDialog(id as InlineObjectCommand, config, doc, value => {
      if (current !== owner || workspace !== ownerWorkspace || editor !== ownerEditor || current!.body !== originalBody)
        throw new Error("The page changed. Reopen the insertion dialog.");
      if (workspace) workspace.insertInlineObject(value);
      else { editor!.insertInlineObject(value); captureEditor(); }
      sourceSelection = null;
    }, () => { if (current === owner) editor?.focus(); });
    return;
  }
  if (id === "comment" || id === "inline_comment") {
    const owner = current;
    const ownerWorkspace = workspace;
    const ownerEditor = editor;
    closeModal();
    commentDialog({
      inline: id === "inline_comment",
      submit(value, inline) {
        if (current !== owner || workspace !== ownerWorkspace || editor !== ownerEditor)
          throw new Error("The page changed. Reopen the comment input.");
        insertMarkdown(inline ? `%%${value}%%` : `\n\n%%\n${value}\n%%\n\n`);
      },
      close() { if (current === owner) editor?.focus(); },
    });
    return;
  }
  const blockTypes = ["text", "heading1", "heading2", "heading3", "heading4", "heading5", "heading6", "list", "number", "task", "quote", "code", "divider"] as const;
  const blockType = blockTypes.find(type => type === id);
  if (blockType && (view === "document" || (view === "split" && workspace?.activePane === "document")) && editor) {
    closeModal();
    editor.insertBlockType(blockType);
    captureEditor();
    return;
  }
  if (insertFormats[id]) {
    closeModal();
    if (workspace) workspace.insertFormat(id);
    else if (editor && view === "document") { editor.insertFormat(id); captureEditor(); }
    else if (view === "source") {
      const el = document.querySelector<HTMLTextAreaElement>("#source-editor")!;
      const from = sourceSelection?.start ?? el.selectionStart, to = sourceSelection?.end ?? el.selectionEnd;
      const { before, after } = insertFormats[id];
      el.setRangeText(before + el.value.slice(from, to) + after, from, to, "select");
      el.setSelectionRange(from + before.length, to + before.length);
      current!.body = el.value; el.focus(); markDirty();
    }
    sourceSelection = null;
    return;
  }
  if (id === "inline_equation") {
    insertContentInput("Inline equation", ["Equation content"], ([value]) => `$${value}$`); return;
  }
  if (id === "transclusion") {
    insertContentInput("File inclusion", ["File path"], ([value]) => `\n\n{{${value}}}\n\n`); return;
  }
  if (id === "definitions") {
    insertContentInput("Definition list", ["Term", "Definition"], ([term, definition]) => `\n\n${term}\n:   ${definition}\n\n`); return;
  }
  const snippets: Record<string, string> = {
    emoji: '😀',
    synced_block: '\n<synced_block>\n<empty-block/>\n</synced_block>\n',
    date_or_reminder: workspace?.session.snapshot.config.variant === "notdown" ? '<mention-date/>' : `<mention-date start="${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}"/>`,
    diagram: "\n\n```mermaid\n\n```\n\n",
    alert: "\n\n> [!NOTE]\n>\n\n",
    html: "\n\n<div>\n</div>\n\n",
    footnote: "",
    lines: "\n\n| \n| \n\n",
    div: "\n\n::: {.container}\n\n:::\n\n",
    text: "\n\n",
    toggle_heading: '\n## {toggle="true"}\n\t<empty-block/>\n',
    heading1: "\n# ",
    heading2: "\n## ",
    heading3: "\n### ",
    heading4: "\n#### ",
    heading5: "\n##### ",
    heading6: "\n###### ",
    list: "\n- ",
    number: "\n1. ",
    task: "\n- [ ] ",
    quote: "\n> ",
    code: "\n```" + lastCodeLanguage() + "\n\n```\n",
    divider: "\n---\n",
    quarto_python: "\n```{python}\n\n```\n",
    quarto_julia: "\n```{julia}\n\n```\n",
    quarto_ojs: "\n```{ojs}\n\n```\n",
    quarto_r: "\n```{r}\n\n```\n",
    r_chunk: "\n```{r}\n\n```\n",
    columns:
      "\n<columns>\n\t<column>\n\t\t<empty-block/>\n\t</column>\n\t<column>\n\t\t<empty-block/>\n\t</column>\n</columns>\n",
    callout:
      '\n<callout icon="💡" color="gray_bg">\n\t<empty-block/>\n</callout>\n',
    toggle:
      "\n<details>\n<summary></summary>\n\t<empty-block/>\n</details>\n",
    table:
      '\n<table header-row="true">\n\t<tr>\n\t\t<td></td>\n\t\t<td></td>\n\t</tr>\n\t<tr>\n\t\t<td></td>\n\t\t<td></td>\n\t</tr>\n</table>\n',
    toc: "\n<table_of_contents/>\n",
    equation: "\n$$\n\n$$\n",
  };
  if (
    id === "toc" &&
    workspace && enabled(workspace.session.snapshot.config, "toc_directives") && !usesNotionSyntax(workspace.session.snapshot.config)
  )
    snippets.toc = "\n\n[toc]\n\n";
  if (id === "callout" && workspace && !usesNotionSyntax(workspace.session.snapshot.config) && enabled(workspace.session.snapshot.config, "alerts"))
    snippets.callout = snippets.alert;
  if (id === "footnote") {
    let label = "note",
      number = 1;
    while (current!.body.includes("[^" + label + "]"))
      label = "note" + ++number;
    snippets.footnote = `[^${label}]\n\n[^${label}]:\n\n`;
  }
  if (
    id === "table" &&
    workspace &&
    (enabled(workspace.session.snapshot.config, "pipe_tables") || enabled(workspace.session.snapshot.config, "mmd_tables"))
  )
    snippets.table = "\n|  |  |\n| --- | --- |\n|  |  |\n";
  if (
    workspace &&
    !enabled(workspace.session.snapshot.config, "notion_colors")
  )
    snippets.callout = snippets.callout.replace(' color="gray_bg"', "");
  if (snippets[id]) {
    insertMarkdown(snippets[id]);
    return;
  }
  if (id === "child") {
    closeModal();
    await newPage(current!.id, true);
    return;
  }
  if (["page_link", "location_link"].includes(id)) {
    captureEditor();
    const owner = current!.id;
    const kind = id === "location_link" ? "location" : "page";
    modal(kind === "page" ? "Page link" : "Location link", '<div id="reference-picker"></div>');
    mountReferencePicker(document.querySelector<HTMLElement>("#reference-picker")!, kind,
      pages.map(page => page.id === owner ? current! : page), owner,
      workspace?.session.snapshot.config || defaultSyntax(current!.bodyFormat), source => {
        if (current?.id === owner) insertMarkdown(source);
      });
    return;
  }
  if (id === "link" || id === "mention") {
    if (!workspace || !commandEnabled(workspace.session.snapshot.config, id)) return;
    modal(
      "Link to page",
      `<div>${pages
        .filter((p) => p.id !== current!.id)
        .map(
          (p) =>
            `<button class="search-result" data-insert-link="${e(p.id)}" data-inline-mention="${id === "mention"}">${pageIcon(p)}${e(p.title)}</button>`,
        )
        .join("")}</div>`,
    );
    return;
  }
  if (isMediaInsertKind(id)) {
    captureEditor();
    workspace?.capture();
    const config = workspace?.session.snapshot.config || current!.syntax || defaultSyntax(current!.bodyFormat);
    if (!commandEnabled(config, id)) return;
    closeModal();
    const ownerId = current!.id;
    const ownerWorkspace = workspace, ownerEditor = editor;
    const originalConfig = JSON.stringify(config);
    const input = document.createElement("input");
    input.type = "file";
    input.accept = mediaAccept[id];
    input.tabIndex = -1;
    input.setAttribute("aria-label", "Choose media file");
    // Hand focus to a connected, non-editable control before opening native UI.
    // A detached input.click() leaves the slash editor in its typing state.
    input.style.cssText = "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none";
    const previousFocus = document.activeElement;
    const pickerEvents = new AbortController();
    const finishPicker = () => {
      const restoreFocus = document.activeElement === input;
      pickerEvents.abort();
      input.remove();
      if (restoreFocus && current?.id === ownerId && workspace === ownerWorkspace && editor === ownerEditor &&
          previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    };
    input.addEventListener("cancel", finishPicker, { once: true, signal: pickerEvents.signal });
    input.addEventListener(
      "change",
      () =>
        void (async () => {
          const file = input.files?.[0];
          if (!file) return;
          if (!mediaFileMatches(id, file)) throw new Error(`Choose ${id === "image" || id === "audio" ? "an" : "a"} ${id} file.`);
          if (file.size > 15 * 1024 * 1024)
            throw new Error("Attachments can be up to 15 MB.");
          const data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = reject;
            reader.onload = () => resolve(String(reader.result).split(",")[1]);
            reader.readAsDataURL(file);
          });
          const result = await api<{ path: string }>("/assets", {
            method: "POST",
            body: JSON.stringify({
              name: file.name,
              contentType: file.type || "application/octet-stream",
              data,
            }),
          });
          if (current?.id !== ownerId || workspace !== ownerWorkspace || editor !== ownerEditor ||
              JSON.stringify(workspace?.session.snapshot.config || current!.syntax || defaultSyntax(current!.bodyFormat)) !== originalConfig) {
            toast("File uploaded. Return to the original page to insert it.");
            return;
          }
          insertMarkdown(mediaInsertMarkdown(id, file.name, result.path, config));
        })().catch(report).finally(finishPicker),
      { once: true, signal: pickerEvents.signal },
    );
    document.body.append(input);
    input.focus({ preventScroll: true });
    try { input.click(); }
    catch (error) { finishPicker(); throw error; }
  }
}
function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function exportHTML() {
  if (!current) return;
  if (!(await save())) return;
  download(
    `${current.title.replace(/[<>:"/\\|?*]/g, "_")}.html`,
    htmlDocument(
      current.title,
      current.body,
      pages,
      current.bodyFormat,
      current.syntax,
    ),
    "text/html;charset=utf-8",
  );
  toast("HTML exported. Attachments use relative paths; keep the assets folder alongside the export.");
}

function routeForNewTab(target: EventTarget | null): PageRoute | undefined {
  const element = target instanceof Element ? target.closest<HTMLElement>("[data-open-database],[data-open],a[href]") : null;
  if (!element || element.closest("#workspace-tabs")) return;
  if (element.dataset.openDatabase) return { kind: "database", id: element.dataset.openDatabase };
  if (element.dataset.open) {
    const page = pages.find(page => page.id === element.dataset.open);
    if (page) return page.databaseId ? { kind: "database", id: page.databaseId } : { kind: "page", id: page.id };
  }
  const href = element.getAttribute("href");
  if (!href?.startsWith("#page/")) return;
  const reference = internalReference(href, (element.dataset.referenceSyntax || "markdown") as ReferenceSyntax);
  const page = reference && resolveReferencePage(reference, pages, current?.id);
  if (page) return { kind: "page", id: page.id, ...(reference?.fragment ? { fragment: reference.fragment } : {}) };
}
for (const type of ["click", "auxclick"] as const) document.addEventListener(type, event => {
  if (!workspaceTabs || !(event.button === 1 || event.button === 0 && (event.ctrlKey || event.metaKey) && !event.altKey)) return;
  const route = routeForNewTab(event.target);
  if (!route) return;
  event.preventDefault(); event.stopPropagation();
  void workspaceTabs.open(route, !event.shiftKey);
}, true);
document.addEventListener("mousedown", event => { if (event.button === 1 && routeForNewTab(event.target)) event.preventDefault(); }, true);
document.addEventListener("keydown", event => {
  if (!window.notdownDesktop || !workspaceTabs || event.isComposing || editor?.isComposing() || workspace?.source.composing ||
      !(event.ctrlKey || event.metaKey) || event.altKey || document.querySelector("#dialog, dialog[open]")) return;
  const key = event.key.toLowerCase(), tabs = workspaceTabs;
  let action: (() => Promise<boolean>) | undefined;
  if (key === "t") action = () => event.shiftKey ? tabs.reopen() : tabs.open();
  else if (key === "w" && !event.shiftKey) action = () => tabs.close(tabs.activeId);
  else if (key === "tab") {
    const index = tabs.tabs.findIndex(tab => tab.id === tabs.activeId);
    action = () => tabs.activate(tabs.tabs[(index + (event.shiftKey ? -1 : 1) + tabs.tabs.length) % tabs.tabs.length].id);
  } else if (/^[1-9]$/.test(key) && !event.shiftKey) {
    const tab = key === "9" ? tabs.tabs.at(-1) : tabs.tabs[Number(key) - 1];
    if (tab) action = () => tabs.activate(tab.id);
  }
  if (action) { event.preventDefault(); event.stopImmediatePropagation(); void action(); }
}, true);

document.addEventListener("click", (event) => {
  const target = event.target as Element;
  const actionEl = target.closest<HTMLElement>(
    "[data-action],[data-source-file],[data-current-page-action],[data-page-menu],[data-open],[data-open-database],[data-database-new-record],[data-view],[data-library-view],[data-toggle],[data-child],[data-insert],[data-insert-link],a[href^='#page/']",
  );
  if (!actionEl) return;
  event.preventDefault();
  actionEl
    .closest<HTMLDetailsElement>(".page-options")
    ?.removeAttribute("open");
  void (async () => {
    if (actionEl.dataset.sourceFile && current && !library) {
      const id = current.id;
      await handleSourceFile(actionEl.dataset.sourceFile, id, {
        save: async () => (await save()) && !conflict,
        isCurrent: () => current?.id === id && !library, toast,
      });
      return;
    }
    if (actionEl.dataset.currentPageAction && current && !library) {
      captureEditor();
      await handlePageAction(structuredClone(current), actionEl.dataset.currentPageAction as PageAction);
      return;
    }
    if (actionEl.dataset.pageMenu) {
      sidebarContextMenu(actionEl);
      return;
    }
    if (actionEl.dataset.openDatabase) {
      closeModal(); await navigation?.navigate({ kind: "database", id: actionEl.dataset.openDatabase }); return;
    }
    if (actionEl.dataset.databaseNewRecord) { await addDatabaseRecord(actionEl.dataset.databaseNewRecord); return; }
    if (actionEl.dataset.open) {
      closeModal();
      await openPage(actionEl.dataset.open);
      return;
    }
    if (actionEl.matches("a[href^='#page/']")) {
      const reference = internalReference(actionEl.getAttribute("href")!, (actionEl.dataset.referenceSyntax || "markdown") as ReferenceSyntax);
      const page = reference && resolveReferencePage(reference, pages, current?.id);
      if (page) await openReferencePage(page.id, reference!);
      else toast("Linked page not found or ambiguous.");
      return;
    }
    if (actionEl.dataset.view) {
      const next = actionEl.dataset.view as View;
      if (workspace?.blocks.databaseViewsDirty && !(await save())) return;
      if (workspace && ["document", "source", "split"].includes(next)) {
        workspace.setMode(next as EditMode);
        view = next;
        document.querySelector("#page-options")!.innerHTML = pageOptions();
        renderToc();
        return;
      }
      view = next;
      renderDocument();
      return;
    }
    if (actionEl.dataset.libraryView) {
      await showLibrary(actionEl.dataset.libraryView as LibraryView);
      return;
    }
    if (actionEl.dataset.toggle) {
      const id = actionEl.dataset.toggle;
      const restoreFocus = document.activeElement === actionEl;
      collapsed.has(id) ? collapsed.delete(id) : collapsed.add(id);
      renderSidebar();
      if (restoreFocus) document.querySelector<HTMLButtonElement>(`[data-toggle="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
      return;
    }
    if (actionEl.dataset.child) {
      await newPage(actionEl.dataset.child);
      return;
    }
    if (actionEl.dataset.insert) {
      await handleInsert(actionEl.dataset.insert);
      return;
    }
    if (actionEl.dataset.insertLink) {
      if (actionEl.dataset.inlineMention !== "true" && (!workspace || !commandEnabled(workspace.session.snapshot.config, "link"))) return;
      const p = pages.find((p) => p.id === actionEl.dataset.insertLink)!;
      if (
        actionEl.dataset.inlineMention !== "true" &&
        workspace &&
        !usesNotionSyntax(workspace.session.snapshot.config)
      ) {
        insertMarkdown(`[[${p.id}|${p.title.replace(/[\[\]|\r\n]/g, " ")}]]`);
        return;
      }
      insertMarkdown(
        actionEl.dataset.inlineMention === "true"
          ? `<mention-page url="${escapeXml(pageUrl(p.id))}">${escapeXml(p.title)}</mention-page>`
          : `\n<page-link url="${escapeXml(pageUrl(p.id))}">${escapeXml(p.title)}</page-link>\n`,
      );
      return;
    }
    switch (actionEl.dataset.action) {
      case "new-tab":
        await workspaceTabs?.open();
        break;
      case "close-tab":
        if (workspaceTabs) await workspaceTabs.close(workspaceTabs.activeId);
        break;
      case "reopen-tab":
        await workspaceTabs?.reopen();
        break;
      case "attachments":
        await showAttachments();
        break;
      case "page-attachments":
        await showAttachments(true);
        break;
      case "retry-databases": {
        if (!(await save())) break;
        if (databaseRoute) await loadDatabases(databaseRoute.id);
        else { pages = await refreshWorkspacePages(); renderSidebar(); if (!databaseApiAvailable) toast(databaseRestartMessage); }
        break;
      }
      case "new-database":
        await createDatabase(null);
        break;
      case "databases":
        await navigation?.navigate({ kind: "database" });
        break;
      case "trash":
        await showTrash();
        break;
      case "home":
        await showLibrary();
        break;
      case "graph":
        await showLibrary("graph");
        break;
      case "new":
        await newPage();
        break;
      case "child":
        await newPage(current!.id);
        break;
      case "search":
        showSearch();
        break;
      case "properties":
        showProperties();
        break;
      case "page-icon":
        showPageIcon(actionEl!);
        break;
      case "page-cover":
        showPageCover(actionEl!);
        break;
      case "cover-reposition":
        startCoverReposition();
        break;
      case "page-properties": {
        const panel =
          document.querySelector<HTMLDetailsElement>(".page-properties");
        if (panel) {
          panel.open = !panel.open;
          panel.scrollIntoView({ block: "nearest" });
        }
        break;
      }
      case "people":
        captureEditor();
        closeModal();
        openPeople();
        break;
      case "settings":
        showSettings();
        break;
      case "import": {
        const dialog = modal("Import", `<p>Choose where to import your notes from.</p><div class="import-source-options"><button class="secondary-button" data-action="import-folder" aria-label="Import Markdown folder">${icon("folder-input")}<span>Import Markdown folder<small>Copy local Markdown files and attachments.</small></span></button><button class="secondary-button" data-action="import-notion" aria-label="Import from Notion API">${icon("globe")}<span>Import from Notion API<small>Import pages and databases from Notion.</small></span></button></div>`);
        dialog.setAttribute("aria-label", "Import");
        break;
      }
      case "import-folder":
        closeModal();
        openImportDialog({ save, complete: async ids => {
          pages = await refreshWorkspacePages();
          renderSidebar();
          const first = ids.find(id => pages.some(page => page.id === id));
          if (first) await loadPage(first);
          else await showLibrary();
          toast("Markdown import complete. Source files were preserved.");
        } });
        break;
      case "import-notion":
        closeModal();
        openNotionImportDialog({ save, complete: async ids => {
          pages = await refreshWorkspacePages();
          renderSidebar();
          const first = ids.find(id => pages.some(page => page.id === id));
          if (first) await openPage(first);
          else await showLibrary();
          toast("Notion Enhanced Markdown import complete. Source API content was preserved.");
        } });
        break;
      case "vaults":
        if (window.notdownDesktop) { if (await save()) await window.notdownDesktop.openVaultWindow(); }
        else if (browserVaultManagement) await openVaultManager(vaultPath, { save, modal, close: closeModal });
        else toast("Restart the local server to use knowledge base management.");
        break;
      case "export":
        await exportHTML();
        break;
      case "export-text":
        if (current && await save()) download(`${current.title.replace(/[<>:"/\\|?*]/g, "_")}.txt`, plainText(current.body, current.syntax || defaultSyntax(current.bodyFormat)), "text/plain;charset=utf-8");
        break;
      case "close-dialog":
        closeModal();
        break;
      case "conflicts":
        await showConflicts();
        break;
      case "page-history":
        if (current && await save()) await openPageHistory(structuredClone(current), { modal, restored: async page => {
          closeModal(); destroyEditor(); current = null; dirty = false;
          await loadPage(page.id, true); renderSidebar(); toast("Page version restored. The previous version was preserved.");
        } });
        break;
      case "resolve-conflict":
        await resolveConflict();
        break;
      case "sidebar":
        sidebarLayout.toggle();
        break;
      case "history-back":
        navigation?.back();
        break;
      case "history-forward":
        navigation?.forward();
        break;
      case "mybase-export":
        if (current) {
          download(
            `${current.id}.mybase`,
            toMyBase(current),
            "text/plain;charset=utf-8",
          );
          toast("MyBase metadata exported. The main MyBase library was not modified.");
        } else toast("Open a page first.");
        break;
    }
  })().catch(report);
});
document.addEventListener("pointerdown", (event) => {
  document.querySelectorAll(".page-options[open]").forEach(menu => {
    if (!menu.contains(event.target as Node)) menu.removeAttribute("open");
  });
});
document.addEventListener("input", (event) => {
  const target = event.target as HTMLInputElement;
  if (target.closest("#editor")) editorChanged = true;
  if (target.id === "page-title" && current) {
    captureEditor();
    current.title = target.value;
    try {
      if (workspace) workspace.setPageTitle(target.value);
      else current.body = renameDocumentPageSource(current.body, current.syntax ?? defaultSyntax(current.bodyFormat), target.value);
    } catch (error) { report(error); }
    refreshBreadcrumbs();
    target.style.height = "auto";
    target.style.height = `${target.scrollHeight}px`;
    markDirty();
  }
  if (!workspace && target.id === "source-editor" && current) {
    current.body = target.value;
    markDirty();
    renderToc();
  }
  if (target.id === "library-search") {
    const start = target.selectionStart;
    search = target.value;
    renderLibrary();
    const next = document.querySelector<HTMLInputElement>("#library-search")!;
    next.focus();
    next.setSelectionRange(start, start);
  }
});
document.addEventListener("change", (event) => {
  const target = event.target as HTMLInputElement;
  if (target.id === "parent-select" && current) {
    const next = target.value || null;
    let ancestor = pages.find((p) => p.id === next);
    const seen = new Set<string>();
    while (ancestor && !seen.has(ancestor.id)) {
      if (ancestor.id === current.id) {
        target.value = current.parent || "";
        toast("A page cannot be moved under its own child.");
        return;
      }
      seen.add(ancestor.id);
      ancestor = pages.find((p) => p.id === ancestor!.parent);
    }
    current.parent = next;
    refreshBreadcrumbs();
    markDirty();
  }
  if (target.id === "color-headings") {
    localStorage.setItem("notdown-color", target.checked ? "on" : "off");
    document.body.classList.toggle("color-headings", target.checked);
  }
  if (target.id === "pin-toc") {
    localStorage.setItem("notdown-toc", target.checked ? "pinned" : "hover");
    renderToc();
  }
});
document.addEventListener(
  "keydown",
  (event) => {
    if (event.isComposing || editor?.isComposing()) return;
    const eventTarget = event.target as HTMLElement;
    if (eventTarget.closest(".people-dialog")) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        eventTarget.closest(".people-dialog")?.querySelector<HTMLFormElement>(".person-form")?.requestSubmit();
      }
      return;
    }
    if (eventTarget.id === "page-title" && workspace && current &&
      (event.ctrlKey || event.metaKey) && !event.altKey && ["z", "y"].includes(event.key.toLowerCase()) &&
      documentPageTitle(current.body, current.syntax ?? defaultSyntax(current.bodyFormat)) !== undefined) {
      event.preventDefault();
      workspace.history(event.key.toLowerCase() === "y" || event.shiftKey ? "redo" : "undo");
      return;
    }
    const options = document.querySelector<HTMLDetailsElement>(
      ".page-options[open]",
    );
    if (options && event.key === "Escape") {
      event.preventDefault();
      options.open = false;
      options.querySelector<HTMLElement>("summary")?.focus();
      return;
    }
    if (
      options?.contains(eventTarget) &&
      ["ArrowDown", "ArrowUp"].includes(event.key)
    ) {
      event.preventDefault();
      const items = Array.from(
        options.querySelectorAll<HTMLButtonElement>("button"),
      );
      const currentIndex = items.indexOf(
        document.activeElement as HTMLButtonElement,
      );
      items[
        (currentIndex + (event.key === "ArrowDown" ? 1 : -1) + items.length) %
          items.length
      ]?.focus();
      return;
    }
    if (event.key === "Enter" && eventTarget.id === "page-title") {
      event.preventDefault();
      if (view === "document") editor?.focus();
      return;
    }
    if (
      (event.ctrlKey || event.metaKey) &&
      !event.altKey &&
      event.key.toLowerCase() === "e" &&
      current &&
      !library &&
      !document.querySelector("#dialog, dialog[open]")
    ) {
      event.preventDefault();
      event.stopPropagation();
      captureEditor();
      view = view === "source" ? "document" : "source";
      if (workspace) {
        workspace.setMode(view);
        document.querySelector("#page-options")!.innerHTML = pageOptions();
        renderToc();
        if (view === "source") workspace.source.focus();
        else editor?.focus();
        return;
      }
      renderDocument();
      if (view === "source")
        document.querySelector<HTMLTextAreaElement>("#source-editor")?.focus();
      else editor?.focus();
      return;
    }
    if (
      (event.ctrlKey || event.metaKey) &&
      (event.key.toLowerCase() === "p" ||
        (event.key.toLowerCase() === "k" && !eventTarget.closest("#editor")))
    ) {
      event.preventDefault();
      event.stopPropagation();
      showSearch();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      event.stopPropagation();
      void save().catch(report);
      return;
    }
    if (
      event.isComposing ||
      !(event.key === "/" || event.key === "、") ||
      !current ||
      library ||
      document.querySelector("#dialog, .page-metadata-dialog[open]")
    )
      return;
    const target = event.target as Element;
    if (!workspace && target.id === "source-editor") {
      const area = target as HTMLTextAreaElement;
      const before = area.value.slice(0, area.selectionStart);
      if (!before || /\s$/.test(before)) {
        event.preventDefault();
        event.stopPropagation();
        showInsert();
      }
    }
  },
  true,
);
document.addEventListener("compositionend", (event) => {
  if (
    event.data !== "、" ||
    !current ||
    library ||
    document.querySelector("#dialog")
  )
    return;
  const target = event.target as Element;
  if (workspace || target.id !== "source-editor") return;
  const area = target as HTMLTextAreaElement;
  const pos = area.selectionStart;
  if (pos >= 1 && (pos === 1 || /\s/.test(area.value[pos - 2]))) {
    area.setRangeText("", pos - 1, pos, "end");
    current.body = area.value;
    markDirty();
    showInsert();
  }
});
const sidebarDrag = installSidebarDrag({
  begin: () => {
    if (pageActionBusy || conflict) return null;
    captureEditor();
    closePageContextMenu();
    return pages.map((page) => current?.id === page.id ? current : page);
  },
  drop: (page, move) => {
    if (move === "trash") void handlePageAction(page, "trash").catch(report);
    else {
      if (move.parent) collapsed.delete(move.parent);
      void mutateSidebarPage(page, { parent: move.parent, sidebarOrder: move.sidebarOrder }, move).then((success) => {
        if (success) toast("Page moved.");
      }).catch(report);
    }
  },
  end: () => renderSidebar(),
});

window.addEventListener("beforeunload", (event) => {
  workspaceTabs?.capture();
  captureEditor();
  if (dirty || saving || databaseWorkspace?.dirty || workspace?.blocks.databaseViewsDirty) {
    event.preventDefault();
    event.returnValue = "";
  }
});
installDesktopCloseGuard(save);

document.addEventListener("notdown-database-record-saved", event => {
  const saved = (event as CustomEvent<Page>).detail;
  if (!saved?.id || current?.id === saved.id) return;
  // A nested table response may refresh navigation, never the outer editor draft.
  const index = pages.findIndex(page => page.id === saved.id);
  if (index < 0) pages.push(saved); else pages[index] = saved;
  renderSidebar();
});
document.addEventListener("notdown-database-updated", event => {
  const snapshot = (event as CustomEvent<DatabaseSnapshot>).detail;
  if (!snapshot?.database?.id) return;
  databases = databases.map(database => database.id === snapshot.database.id ? snapshot.database : database);
  if (snapshot.hostPage && current?.id !== snapshot.hostPage.id) {
    const host = snapshot.hostPage;
    pages = pages.map(page => page.id === host.id ? host : page);
  }
  renderSidebar();
});

async function boot() {
  if (location.pathname.startsWith("/v/") && !vaultPrefix()) throw new Error("Invalid knowledge base URL. Open the root address to choose a vault.");
  if (vaultPrefix() === location.pathname) { location.replace(location.pathname + "/" + location.search + location.hash); return; }
  const [loaded, info] = await Promise.all([
    refreshWorkspacePages(),
    api<{ vaultPath: string; vaultManagement?: boolean }>("/status"),
  ]);
  pages = loaded;
  vaultPath = info.vaultPath;
  browserVaultManagement = !!info.vaultManagement;
  void refreshPeople().catch(error => console.warn("People refresh:", error));
  window.addEventListener("focus", () => { void refreshPeople().catch(error => console.warn("People refresh:", error)); });
  setInterval(() => { if (document.visibilityState === "visible") void refreshPeople().catch(error => console.warn("People refresh:", error)); }, 5000);
  document.body.classList.toggle(
    "color-headings",
    localStorage.getItem("notdown-color") === "on",
  );
  shell();
  const saved = localStorage.getItem("notdown-page");
  const route = parseRoute(location.hash);
  const linked = route?.kind === "page" ? route.id : null;
  if (route?.kind === "database") await loadDatabases(route.id);
  else if (pages.length && route?.kind !== "vault")
    await loadPage(pages.find((p) => p.id === linked || linked && p.legacyIds?.includes(linked))?.id || pages.find((p) => p.id === saved || saved && p.legacyIds?.includes(saved))?.id || pages[0].id);
  else await loadLibrary(route?.kind === "vault" ? route.view : "gallery");
  navigation = new PageNavigation(
    databaseRoute ?? (current && !library ? { kind: "page", id: current.id, ...(route?.kind === "page" && route.id === current.id && route.fragment ? { fragment: route.fragment } : {}) } : { kind: "vault", view: libraryView }),
    async (route, isCurrent, allowTrashed) => {
      workspaceTabs?.capture();
      if (route.kind === "database") return loadDatabases(route.id, isCurrent);
      if (route.kind === "vault") return loadLibrary(route.view, isCurrent);
      const loaded = await loadPage(route.id, allowTrashed, isCurrent);
      if (loaded && isCurrent() && route.fragment) revealReference(internalReference("#" + encodeURIComponent(route.fragment))!);
      return loaded;
    },
    updateNavigationButtons,
    report,
  );
  updateNavigationButtons();
  workspaceTabs = new WorkspaceTabs(navigation.route, {
    storage: sessionStorage, key: `notdown-workspace-tabs:${vaultPath}`,
    navigate: route => navigation!.navigate(route), currentRoute: () => navigation!.route,
    capture: () => ({ mode: view, scroll: document.querySelector("#main")!.scrollTop, sourceScroll: workspace?.source.scrollDOM.scrollTop ?? 0 }),
    restore: async state => {
      if (current && !library && !databaseRoute) {
        view = (state?.mode ?? "document") as View;
        if (workspace && ["document", "source", "split"].includes(view)) await workspace.setMode(view as EditMode);
        else renderContent();
        document.querySelector("#page-options")!.innerHTML = pageOptions(); renderToc();
      }
      document.querySelector("#main")!.scrollTop = state?.scroll ?? 0;
      if (workspace) workspace.source.scrollDOM.scrollTop = state?.sourceScroll ?? 0;
    },
    changed: renderTabs, report,
  });
  renderTabs();
  await workspaceTabs.restoreActive();
  window.addEventListener("resize", renderTabs);
  window.notdownDesktop?.onOpenTab?.(url => {
    const destination = new URL(url, location.href), route = parseRoute(destination.hash);
    if (destination.origin === location.origin && destination.pathname === location.pathname && route) void workspaceTabs?.open(route);
  });
  if (route?.kind === "page" && route.fragment && current?.id === route.id)
    revealReference(internalReference("#" + encodeURIComponent(route.fragment))!);
  app.inert = false;
  app.removeAttribute("aria-busy");
  startReminders(() => pages, vaultPath, toast);
  installSyncScheduler({ beforeSync: save });
  setInterval(() => {
    captureEditor();
    if (
      databaseWorkspace ||
      workspace?.blocks.databaseViewsDirty ||
      dirty ||
      editorChanged ||
      saving ||
      conflict ||
      pageActionBusy ||
      sidebarDrag.isDragging() ||
      document.querySelector(".page-context-menu") ||
      document.querySelector("#dialog, .people-dialog[open], .attachments-dialog[open]")
    )
      return;
    void (async () => {
      const [latest, latestDatabases] = await Promise.all([api<Page[]>("/pages"), readDatabaseList()]);
      const changed =
        JSON.stringify(latest.map((p) => [p.id, p.revision])) !==
        JSON.stringify(pages.map((p) => [p.id, p.revision])) || JSON.stringify(latestDatabases) !== JSON.stringify(databases);
      captureEditor();
      if (databaseWorkspace || workspace?.blocks.databaseViewsDirty || dirty || editorChanged || saving || conflict || pageActionBusy || sidebarDrag.isDragging() || document.querySelector("#dialog, .page-context-menu, .page-metadata-dialog[open], .people-dialog[open], .attachments-dialog[open]") || !changed) return;
      pages = latest;
      databases = latestDatabases;
      renderSidebar();
      if (library) renderLibrary();
      else if (current) {
        const latestCurrent = latest.find((p) => p.id === current!.id);
        if (!latestCurrent) {
          destroyEditor();
          current = null;
          await showLibrary();
          toast("This page was moved to Trash or removed externally.");
          return;
        }
        if (latestCurrent && latestCurrent.revision !== current.revision) {
          destroyEditor();
          current = latestCurrent;
          renderDocument();
          toast("Loaded external changes to the Markdown file.");
        }
      }
    })().catch((error) => console.warn("Workspace refresh:", error));
  }, 5000);
}
void boot().catch((error) => {
  app.inert = false;
  app.removeAttribute("aria-busy");
  app.innerHTML = `<div class="boot-error"><h1>Unable to open the vault</h1><p>${e(error instanceof Error ? error.message : error)}</p><p>Make sure the local server is running:<code>npm run dev</code></p><button onclick="location.reload()">Retry</button></div>`;
});
document.addEventListener(openPeopleEvent, event => {
  captureEditor();
  closeModal();
  openPeople((event as CustomEvent).detail);
});
