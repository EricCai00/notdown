import { BlockEditor } from "./prosemirror-editor";
import { refreshIcons } from "./icons";
import "./style.css";
import "./notion-blocks.css";
import { api, ApiError, escape as e, type Page } from "./types";
import {
  getOutline,
  extractLinks,
  htmlDocument,
  type OutlineNode,
} from "./document-format";
import { escapeXml, pageUrl } from "./notion-syntax";
import { parseEditorMarkdown } from "./editor-markdown";
import { serializeNotionMarkdown } from "./notion-markdown";
import { toMyBase } from "./mybase";
import { searchPages } from "./page-search";

type View = "document" | "outline" | "mindmap" | "source";
type LibraryView = "gallery" | "list" | "tree" | "graph";
let pages: Page[] = [];
let current: Page | null = null;
let editor: BlockEditor | undefined;
let editorChanged = false;
let editorReady = false;
let editorGeneration = 0;
let view: View = "document";
let libraryView: LibraryView = "gallery";
let library = false;
let dirty = false;
let saving: Promise<boolean> | null = null;
let saveTimer: ReturnType<typeof setTimeout>;
let conflict: any = null;
let search = "";
let vaultPath = "";
let sourceSelection: { start: number; end: number } | null = null;
let draftWarningShown = false;
let slashCleanup: (() => void) | undefined;
let tocCleanup: (() => void) | undefined;
// Keep existing preferences and window-specific drafts across the app rename.
for (const storageName of ["localStorage", "sessionStorage"] as const) {
  try {
    const storage = window[storageName];
    if (storage.getItem("notdown-storage-migrated") === "1") continue;
    const oldKeys = Array.from({ length: storage.length }, (_, i) => storage.key(i))
      .filter((key): key is string => key !== null && key.startsWith("yejian-"));
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
const draftKey = (id: string) => `notdown-draft:${id}:${draftSession}`;
const collapsed = new Set<string>();
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
  toast(error instanceof Error ? error.message : "操作失败，请重试");
}
function persistDraft(page: Page) {
  try {
    localStorage.setItem(draftKey(page.id), JSON.stringify(page));
  } catch {
    if (!draftWarningShown) {
      toast("浏览器草稿空间不足，将继续保存到磁盘；关闭前请确认保存成功。");
      draftWarningShown = true;
    }
  }
}
function removeDraft(id: string) {
  try {
    localStorage.removeItem(draftKey(id));
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
  const el = document.querySelector("#save-status");
  if (el) {
    el.className = kind;
    el.innerHTML = `${icon(kind === "error" ? "circle-alert" : "circle-check")}<span>${e(text)}</span>`;
    refreshIcons();
  }
}
function markDirty() {
  if (!current) return;
  dirty = true;
  persistDraft(current);
  status("尚未保存", "pending");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void save().catch(report), 750);
  updateCounts();
}
async function save(): Promise<boolean> {
  captureEditor();
  clearTimeout(saveTimer);
  if (saving) {
    await saving;
    return dirty && !conflict ? save() : !conflict && !dirty;
  }
  if (!dirty || !current) return true;
  if (conflict) return false;
  const draft = structuredClone(current);
  status("正在写入 Markdown…", "pending");
  saving = (async () => {
    try {
      const saved = await api<Page>(`/pages/${draft.id}`, {
        method: "PUT",
        body: JSON.stringify({ ...draft, baseRevision: draft.revision }),
      });
      pages = pages.map((page) => (page.id === saved.id ? saved : page));
      if (current?.id === saved.id) {
        captureEditor();
        const unchanged =
          current.body === draft.body &&
          current.bodyFormat === draft.bodyFormat &&
          current.title === draft.title &&
          current.parent === draft.parent &&
          current.icon === draft.icon &&
          JSON.stringify(current.properties) ===
            JSON.stringify(draft.properties);
        current.revision = saved.revision;
        current.updated = saved.updated;
        dirty = !unchanged;
        if (!dirty) removeDraft(saved.id);
        else persistDraft(current);
      }
      status(dirty ? "正在编辑…" : "已保存到本地", dirty ? "pending" : "");
      renderSidebar();
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        conflict = error.data;
        status("有冲突 · 两个版本均已保留", "error");
        showConflict();
      } else {
        status("保存失败 · 草稿已保留在浏览器", "error");
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
  return page.icon && /[^a-z-]/.test(page.icon)
    ? `<span class="emoji">${e(page.icon)}</span>`
    : icon(page.icon || "file-text");
}
function renderSidebar() {
  const container = document.querySelector("#page-tree");
  if (!container) return;
  const visited = new Set<string>();
  function rows(parent: string | null, depth: number): string {
    return pages
      .filter((p) => p.parent === parent)
      .map((p) => {
        if (visited.has(p.id)) return "";
        visited.add(p.id);
        const children = pages.some((c) => c.parent === p.id);
        return `<div class="tree-row ${current?.id === p.id && !library ? "active" : ""}" style="--depth:${depth}">
        <button class="tree-toggle" data-toggle="${e(p.id)}" aria-label="展开或收起 ${e(p.title)}">${children ? icon(collapsed.has(p.id) ? "chevron-right" : "chevron-down") : ""}</button>
        <button class="tree-page" data-open="${e(p.id)}">${pageIcon(p)}<span>${e(p.title)}</span></button>
        <button class="tree-add" data-child="${e(p.id)}" aria-label="添加子页面">${icon("plus")}</button></div>${collapsed.has(p.id) ? "" : rows(p.id, depth + 1)}`;
      })
      .join("");
  }
  container.innerHTML =
    rows(null, 0) || `<p class="empty-small">还没有页面，写下第一个想法。</p>`;
  const count = document.querySelector("#page-count");
  if (count) count.textContent = String(pages.length);
  refreshIcons();
}

function shell() {
  app.innerHTML = `<aside class="sidebar">
    <button class="workspace-switch" data-action="settings"><span class="workspace-avatar">${icon("notebook-pen")}</span><span><strong>Notdown 工作空间</strong></span>${icon("chevrons-up-down")}</button>
    <button class="search-launch" data-action="search">${icon("search")}<span>搜索</span><kbd>Ctrl K</kbd></button>
    <nav class="main-nav"><button data-action="home">${icon("layout-dashboard")}知识库<span id="page-count">${pages.length}</span></button><button data-action="graph">${icon("waypoints")}关系图谱</button><button data-action="conflicts">${icon("git-branch")}冲突与版本</button></nav>
    <div class="section-label"><span>私人页面</span>${button("new", "plus", "新建页面")}</div><div id="page-tree"></div>
    <button class="new-page" data-action="new">${icon("plus")}新建页面</button>
    <div class="sidebar-bottom"><div class="local-badge"><span></span>本地 Markdown 知识库</div><button data-action="settings">${icon("settings-2")}工作区设置${icon("chevron-right")}</button></div>
  </aside><div class="main-shell"><header class="topbar">${button("sidebar", "panel-left", "展开侧栏")}<div id="breadcrumb"></div><div class="top-actions"><span id="save-status"></span><details id="page-options" class="page-options">${pageOptions()}</details></div></header><main id="main"></main><footer class="statusbar"><span>${icon("hard-drive")}<span id="footer-location">Markdown · 本地文件</span></span><span id="word-count"></span></footer></div>`;
  renderSidebar();
}

function captureEditor() {
  if (!editor || !editorReady || !current) return;
  const body = editor.getValue();
  editorChanged = false;
  if (body !== current.body || current.bodyFormat !== editor.getBodyFormat()) {
    current.body = body;
    current.bodyFormat = editor.getBodyFormat();
    markDirty();
  }
}
function destroyEditor() {
  if (document.querySelector(".insert-dialog")) closeModal();
  captureEditor();
  tocCleanup?.();
  tocCleanup = undefined;
  editorGeneration++;
  if (editor) {
    editor.destroy();
    editor = undefined;
  }
  editorChanged = false;
  editorReady = false;
}
async function openPage(id: string) {
  if (!(await save())) return;
  const page = await api<Page>(`/pages/${encodeURIComponent(id)}`);
  destroyEditor();
  current = page;
  library = false;
  search = "";
  const draft = readDraft(id);
  if (draft) {
    try {
      const recovered = JSON.parse(draft) as Page;
      if (
        recovered.id === id &&
        (recovered.body !== page.body ||
          recovered.bodyFormat !== page.bodyFormat ||
          recovered.title !== page.title ||
          recovered.parent !== page.parent ||
          recovered.icon !== page.icon ||
          JSON.stringify(recovered.properties) !==
            JSON.stringify(page.properties))
      ) {
        current = recovered;
        dirty = true;
        toast("已恢复上次未保存的草稿，保存时会检查文件版本。");
      } else removeDraft(id);
    } catch {
      toast("无法读取浏览器草稿，已打开磁盘版本。");
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
}
function breadcrumb() {
  if (!current || library) return `${icon("library")}<strong>知识库</strong>`;
  const ancestors: Page[] = [];
  let p = pages.find((x) => x.id === current!.parent);
  const seen = new Set<string>();
  while (p && !seen.has(p.id)) {
    seen.add(p.id);
    ancestors.unshift(p);
    p = pages.find((x) => x.id === p!.parent);
  }
  return `${icon("library")}<button data-action="home">知识库</button>${ancestors.map((a) => `<span class="crumb-divider">/</span><button data-open="${e(a.id)}">${e(a.title)}</button>`).join("")}<span class="crumb-divider">/</span><strong>${e(current.title)}</strong>`;
}
function renderDocument() {
  if (!current) return;
  destroyEditor();
  const p = current;
  document.querySelector("#breadcrumb")!.innerHTML = breadcrumb();
  document.querySelector("#page-options")!.innerHTML = pageOptions();
  document.querySelector("#main")!.innerHTML =
    `<div class="document-wrap ${view === "mindmap" ? "wide" : ""}">
    <article class="document">${p.icon && p.icon !== "file-text" ? `<div class="page-emblem">${pageIcon(p)}</div>` : ""}<textarea id="page-title" class="page-title" rows="1" aria-label="页面标题" placeholder="新页面">${e(p.title)}</textarea>
    <details class="page-properties"><summary>属性${icon("chevron-down")}</summary><div class="properties"><div class="property-row"><span>${icon("folder-tree")}父页面</span><select id="parent-select" aria-label="父页面"><option value="">知识库根目录</option>${pages
      .filter((x) => x.id !== p.id)
      .map(
        (x) =>
          `<option value="${e(x.id)}" ${p.parent === x.id ? "selected" : ""}>${e(x.title)}</option>`,
      )
      .join("")}</select></div>
    <div class="property-row"><span>${icon("tags")}属性</span><button data-action="properties" class="property-values">${
      Object.entries(p.properties || {})
        .slice(0, 4)
        .map(
          ([key, value]) =>
            `<span class="tag">${e(key)} · ${e(Array.isArray(value) ? value.join("、") : String(value))}</span>`,
        )
        .join("") || `<span class="muted">添加页面属性</span>`
    }</button></div></div></details>
    <div id="document-content" class="document-content"></div><div id="children-links"></div><div id="backlinks"></div></article><aside id="floating-toc" class="floating-toc" tabindex="0" aria-label="页面目录"></aside></div>`;
  renderContent();
  const title = document.querySelector<HTMLTextAreaElement>("#page-title")!;
  title.style.height = `${title.scrollHeight}px`;
  renderRelations();
  updateCounts();
  status(dirty ? "尚未保存" : "已保存到本地", dirty ? "pending" : "");
  refreshIcons();
}
function pageOptions() {
  if (library)
    return `<summary class="icon-button" aria-label="工作区选项">${icon("ellipsis")}</summary><div class="page-options-menu" role="menu"><button role="menuitem" data-action="settings">${icon("settings-2")}设置</button></div>`;
  const modes: [View, string, string][] = [
    ["document", "file-text", "页面"],
    ["outline", "list-tree", "大纲"],
    ["mindmap", "network", "思维导图"],
    ["source", "code-xml", "Markdown 源码"],
  ];
  return `<summary class="icon-button" aria-label="页面选项" title="页面选项">${icon("ellipsis")}</summary><div class="page-options-menu" role="menu"><small>视图</small>${modes.map(([v, i, label]) => `<button role="menuitemradio" aria-checked="${view === v}" data-view="${v}">${icon(i)}<span>${label}</span>${v === "source" ? "<kbd>Ctrl E</kbd>" : ""}</button>`).join("")}<hr/><button role="menuitem" data-action="page-properties">${icon("tags")}页面属性</button><button role="menuitem" data-action="export">${icon("download")}导出 HTML</button><button role="menuitem" data-action="settings">${icon("settings-2")}设置</button></div>`;
}
function renderContent() {
  if (!current) return;
  const content = document.querySelector<HTMLDivElement>("#document-content")!;
  if (view === "document") {
    const generation = ++editorGeneration;
    const pageId = current.id;
    content.innerHTML = '<div id="editor"></div>';
    editor = new BlockEditor(content.querySelector<HTMLElement>("#editor")!, {
      value: current.body,
      bodyFormat: current.bodyFormat,
      pages: () => pages,
      onChange: (value, format) => {
        if (generation !== editorGeneration || current?.id !== pageId) return;
        editorChanged = false;
        if (current.body !== value || current.bodyFormat !== format) {
          current.body = value;
          current.bodyFormat = format;
          markDirty();
          renderToc();
        }
      },
      onInsert: showInsert,
      onError: report,
    });
    editorReady = true;
  } else if (view === "source") {
    if (current.bodyFormat !== "notion-markdown") {
      current.body = serializeNotionMarkdown(parseEditorMarkdown(current.body));
      current.bodyFormat = "notion-markdown";
      markDirty();
    }
    content.innerHTML = `<div class="source-caption">Markdown 正文 · 系统属性保存在文件头部的 YAML 中</div><textarea id="source-editor" spellcheck="false" aria-label="Markdown 源码">${e(current.body)}</textarea>`;
  } else {
    const outline = getOutline(current.body, current.bodyFormat);
    content.innerHTML = `<p class="view-description">由正文的标题与列表生成，与 Markdown 保持一致。</p>${outline.length ? `<div class="${view === "mindmap" ? "mindmap" : "outline-view"}">${view === "mindmap" ? `<div class="mindmap-root">${e(current.title)}</div>` : ""}${outlineHTML(outline)}</div>` : `<div class="empty-state">${icon("list-tree")}<h3>让内容有一点结构</h3><p>添加标题或列表，这里就会长出你的大纲。</p><button data-view="document" class="primary-button">开始编辑</button></div>`}`;
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
  toc.innerHTML = `<nav aria-label="标题导航"><ol class="toc-list">${headings
    .map((heading, index) => {
      const level = Number(heading.tagName.slice(1));
      const text = heading.textContent?.trim() || "未命名标题";
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
function renderRelations() {
  if (!current) return;
  const children = pages.filter((p) => p.parent === current!.id);
  document.querySelector("#children-links")!.innerHTML = children.length
    ? `<section class="relations"><h3>${icon("files")}子页面 <span>${children.length}</span></h3>${children.map((p) => `<button class="child-card" data-open="${e(p.id)}">${pageIcon(p)}<span>${e(p.title)}</span>${icon("arrow-up-right")}</button>`).join("")}</section>`
    : "";
  const incoming = pages.filter(
    (p) =>
      p.id !== current!.id &&
      extractLinks(p.body, p.bodyFormat).some(
        (target) => target === current!.id || target === current!.title,
      ),
  );
  document.querySelector("#backlinks")!.innerHTML = incoming.length
    ? `<section class="relations"><h3>${icon("link-2")}反向链接 <span>${incoming.length}</span></h3>${incoming.map((p) => `<button class="backlink" data-open="${e(p.id)}">${pageIcon(p)}${e(p.title)}</button>`).join("")}</section>`
    : "";
}
function updateCounts() {
  const el = document.querySelector("#word-count");
  if (el)
    el.textContent =
      current && !library
        ? `${current.body.replace(/\s/g, "").length.toLocaleString()} 字符 · UTF-8`
        : `${pages.length} 个页面 · Markdown`;
}

async function showLibrary(selected = libraryView) {
  if (!(await save())) return;
  destroyEditor();
  library = true;
  libraryView = selected;
  pages = await api<Page[]>("/pages");
  renderLibrary();
  renderSidebar();
  updateCounts();
}
function renderLibrary() {
  document.querySelector("#page-options")!.innerHTML = pageOptions();
  document.querySelector("#breadcrumb")!.innerHTML = breadcrumb();
  const filtered = pages.filter((p) =>
    `${p.title} ${p.body} ${JSON.stringify(p.properties)}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const modes: [LibraryView, string, string][] = [
    ["gallery", "layout-grid", "画廊"],
    ["list", "table-2", "列表"],
    ["tree", "list-tree", "页面树"],
    ["graph", "waypoints", "关系图谱"],
  ];
  document.querySelector("#main")!.innerHTML =
    `<section class="library"><div class="library-intro"><div><h1>知识库</h1></div><button class="primary-button" data-action="new">${icon("plus")}新建页面</button></div>
    <div class="library-toolbar"><div class="tabs">${modes.map(([v, i, label]) => `<button data-library-view="${v}" class="${libraryView === v ? "selected" : ""}">${icon(i)}${label}</button>`).join("")}</div><label class="library-search">${icon("search")}<input id="library-search" aria-label="筛选页面" placeholder="筛选页面…" value="${e(search)}" /></label></div>
    <div id="library-results">${libraryView === "gallery" ? galleryHTML(filtered) : libraryView === "list" ? listHTML(filtered) : libraryView === "graph" ? graphHTML(filtered) : libraryTreeHTML(filtered)}</div></section>`;
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
                .slice(0, 98) || "一个等待被填满的想法。",
            )}</p><div class="card-footer"><span>${e(p.parent ? pages.find((x) => x.id === p.parent)?.title || "子页面" : "根页面")}</span>${icon("arrow-up-right")}</div></div></button>`,
        )
        .join("")}</div>`
    : `<p class="empty-state">没有匹配的页面。</p>`;
}
function listHTML(list: Page[]) {
  return `<div class="table-scroll"><table class="pages-table"><thead><tr><th>页面名称</th><th>父页面</th><th>属性</th><th>最后修改</th></tr></thead><tbody>${list
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
  const ids = new Set(list.map((p) => p.id));
  const seen = new Set<string>();
  const row = (p: Page): string => {
    if (seen.has(p.id)) return "";
    seen.add(p.id);
    return `<li><details open><summary><button data-open="${e(p.id)}">${pageIcon(p)}${e(p.title)}</button><span class="muted">${p.body.length} 字符</span></summary><ul>${list
      .filter((c) => c.parent === p.id)
      .map(row)
      .join("")}</ul></details></li>`;
  };
  return `<div class="library-tree"><ul>${list
    .filter((p) => !p.parent || !ids.has(p.parent))
    .map(row)
    .join("")}</ul></div>`;
}
function graphHTML(list: Page[]) {
  const width = 900,
    height = 540;
  const positions = new Map(
    list.map((p, i) => [
      p.id,
      {
        x:
          width / 2 +
          Math.cos((i * Math.PI * 2) / Math.max(1, list.length) - Math.PI / 2) *
            Math.min(320, 85 + list.length * 20),
        y:
          height / 2 +
          Math.sin((i * Math.PI * 2) / Math.max(1, list.length) - Math.PI / 2) *
            195,
      },
    ]),
  );
  const edges = list
    .flatMap((p) => {
      const targets = [
        ...extractLinks(p.body, p.bodyFormat).map(
          (t) => pages.find((x) => x.id === t || x.title === t)?.id,
        ),
        p.parent,
      ];
      return [...new Set(targets)]
        .filter((id): id is string => !!id && positions.has(id))
        .map((id) => {
          const from = positions.get(p.id)!,
            to = positions.get(id)!;
          return `<line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" class="${id === p.parent ? "parent-edge" : "link-edge"}" />`;
        });
    })
    .join("");
  return `<div class="graph-view"><div class="graph-legend"><span class="legend-line"></span>页面链接<span class="legend-line dashed"></span>父子页面</div><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="知识库页面关系图">${edges}${list
    .map((p) => {
      const pos = positions.get(p.id)!;
      return `<a href="#page/${e(p.id)}"><circle cx="${pos.x}" cy="${pos.y}" r="${p.parent ? 11 : 17}" /><text x="${pos.x}" y="${pos.y + 37}" text-anchor="middle">${e(p.title.slice(0, 19))}</text></a>`;
    })
    .join("")}</svg></div>`;
}
function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

function modal(title: string, body: string, wide = false) {
  closeModal();
  const dialog = document.createElement("dialog");
  dialog.id = "dialog";
  dialog.className = wide ? "wide-dialog" : "";
  dialog.innerHTML = `<div class="dialog-heading"><h2>${e(title)}</h2>${button("close-dialog", "x", "关闭")}</div>${body}`;
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
      title: "新页面",
      parent,
      icon: "file-text",
      body: "",
      properties: {},
    }),
  });
  pages.push(page);
  if (embed && current?.id === ownerId) {
    insertMarkdown(`\n<page url="${escapeXml(pageUrl(page.id))}">${escapeXml(page.title)}</page>\n`);
    if (!(await save())) return;
  }
  closeModal();
  view = "document";
  await openPage(page.id);
  const title = document.querySelector<HTMLInputElement>("#page-title");
  title?.focus();
  title?.select();
}
function showProperties() {
  if (!current) return;
  const dialog = modal(
    "页面属性",
    `<p class="muted">属性写入 Markdown 的 YAML 文件头；列表视图与 MyBase 元数据导出共用这些值。</p><form id="properties-form"><label>属性（JSON 对象）<textarea name="properties" class="code-input" rows="10" spellcheck="false">${e(JSON.stringify(current.properties, null, 2))}</textarea></label><p class="muted">例如：{"状态": "进行中", "标签": ["设计", "知识管理"]}</p><div class="dialog-actions"><button type="submit" class="primary-button">保存属性</button></div></form>`,
  );
  dialog.querySelector("form")!.addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      const value = JSON.parse(
        String(new FormData(event.target as HTMLFormElement).get("properties")),
      );
      if (!value || Array.isArray(value) || typeof value !== "object")
        throw new Error("属性必须是一个 JSON 对象。");
      current!.properties = value;
      markDirty();
      closeModal();
      renderDocument();
    } catch (error) {
      report(error);
    }
  });
}
function showSettings() {
  modal(
    "工作区设置",
    `<div class="settings-section"><h3>文件属于你</h3><p>正文与页面属性保存在本地 Markdown 文件中，可用任意文本编辑器或 AI 工具读写。</p><code class="vault-path">${e(vaultPath)}</code></div><div class="settings-section"><h3>阅读体验</h3><label class="switch-row"><span>彩色标题层级</span><input type="checkbox" id="color-headings" ${localStorage.getItem("notdown-color") === "on" ? "checked" : ""} /></label><label class="switch-row"><span>目录常驻（关闭后悬停展开）</span><input type="checkbox" id="pin-toc" ${localStorage.getItem("notdown-toc") === "pinned" ? "checked" : ""} /></label></div><div class="settings-section"><h3>当前开发版本</h3><p>已实现本地版本检查与冲突分支。跨设备后台同步尚未接入。</p><p>MyBase 目前支持元数据导出；查询和属性双向同步仍待接入。</p></div><div class="dialog-actions"><button class="secondary-button" data-action="mybase-export">导出当前页 MyBase 元数据</button><button class="primary-button" data-action="close-dialog">完成</button></div>`,
  );
}
function showConflict() {
  if (!conflict) return;
  const disk = conflict.current as Page,
    proposed = conflict.proposed as Page;
  modal(
    "检测到两个版本，内容已分别保留",
    `<p class="muted">文件在你编辑期间被修改。请对照两个版本编辑合并内容，再保存。若文件再次变化，会继续保留冲突。</p><div class="conflict-columns"><label>磁盘上的版本<pre>${e(disk?.body || "")}</pre></label><label>你的编辑<pre>${e(proposed?.body || current?.body || "")}</pre></label></div><label>合并后的正文<textarea id="merged-body" rows="10" class="code-input">${e(current?.body || proposed?.body || "")}</textarea></label><p class="muted">页面标题和属性使用你的编辑版本；磁盘版完整元数据保留在历史中。</p><div class="dialog-actions"><button class="secondary-button" data-action="close-dialog">稍后处理</button><button class="primary-button" data-action="resolve-conflict">保存合并版本</button></div>`,
    true,
  );
}
async function resolveConflict() {
  const body =
    document.querySelector<HTMLTextAreaElement>("#merged-body")!.value;
  const draft =
    current?.id === conflict.proposed?.id ? current : conflict.proposed;
  try {
    const saved = await api<Page>(`/conflicts/${conflict.conflictId}/resolve`, {
      method: "POST",
      body: JSON.stringify({
        baseRevision: conflict.current.revision,
        body,
        bodyFormat: draft.bodyFormat || "markdown",
        title: draft.title,
        parent: draft.parent,
        properties: draft.properties,
        icon: draft.icon,
      }),
    });
    const oldId = current?.id;
    current = saved;
    dirty = false;
    conflict = null;
    if (oldId) removeDraft(oldId);
    pages = await api<Page[]>("/pages");
    closeModal();
    renderDocument();
    renderSidebar();
    toast("合并版本已写入 Markdown。");
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
    "冲突与版本",
    `<p class="muted">每次应用写入都会检查源文件版本。冲突提案保留为独立 Markdown 文件，不覆盖磁盘正文。</p><div class="conflict-list">${entries.length ? entries.map((entry, i) => `<div><strong>${e(entry.proposed?.title || entry.title || entry.pageId || entry.id || entry.conflictId)}</strong><p>${e(entry.resolved ? "已合并" : "两个版本均已保留，可以打开并手动合并。")}</p>${entry.resolved ? "" : `<button class="secondary-button" data-conflict-entry="${i}">查看并合并</button>`}</div>`).join("") : `<div class="empty-state">${icon("git-branch")}<h3>目前没有冲突</h3><p>你的想法都已安稳保存。</p></div>`}</div>`,
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
            await openPage(entry.pageId || entry.proposed.id);
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
    "搜索知识库",
    `<label class="dialog-search">${icon("search")}<input id="search-input" aria-label="搜索知识库" role="combobox" aria-expanded="true" aria-controls="search-results" placeholder="搜索页面或内容…" autocomplete="off" autofocus /><kbd>Esc</kbd></label><div class="search-section-label">最近访问</div><div id="search-results" role="listbox" aria-label="搜索结果"></div><div class="search-hints"><span>↑ ↓ 选择</span><span>Enter 打开</span><span>Esc 关闭</span></div>`,
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
      ? `${matches.length} 个结果`
      : "最近访问";
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
          return `<button id="result-${e(p.id)}" role="option" data-open="${e(p.id)}" data-result-index="${index}" class="search-result">${pageIcon(p)}<span><strong>${highlight(p.title, q)}</strong><small class="search-result-path">${e(parent?.title || "私人页面")}</small>${snippet ? `<small>${highlight(snippet, q)}</small>` : ""}</span>${icon("corner-down-left")}</button>`;
        })
        .join("") || '<div class="search-empty">没有找到匹配的页面</div>';
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
function showInsert() {
  if (!current || library) return;
  const initialQuery = editor?.getSlashQuery();
  const inline = initialQuery !== undefined && initialQuery !== null;
  const source = document.querySelector<HTMLTextAreaElement>("#source-editor");
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
  const items = [
    ["text", "pen-line", "文本", "开始输入纯文本。", "paragraph text"],
    ["child", "file-plus-2", "页面", "在此页面中嵌入子页面。", "page child"],
    [
      "task",
      "square-check",
      "待办事项",
      "使用待办列表跟踪任务。",
      "todo checkbox task",
    ],
    ["heading1", "heading-1", "标题 1", "大号标题。", "h1 heading"],
    ["heading2", "heading-2", "标题 2", "中号标题。", "h2 heading"],
    ["heading3", "heading-3", "标题 3", "小号标题。", "h3 heading"],
    ["list", "list", "项目符号列表", "创建简单的项目符号列表。", "bullet list"],
    ["number", "list", "编号列表", "创建带编号的列表。", "number ordered"],
    ["quote", "quote", "引用", "引用一段文字。", "quote"],
    ["divider", "grip", "分割线", "在视觉上分隔内容。", "divider hr"],
    ["code", "code", "代码", "添加一段代码。", "code"],
    ["inline", "code-xml", "行内代码", "在当前文字中插入代码。", "inline"],
    ["link", "link-2", "链接到页面", "引用已有页面。", "link wiki"],
    [
      "mention",
      "at-sign",
      "提及页面",
      "在文字中提及已有页面。",
      "mention wiki",
    ],
    ["columns", "columns-2", "两栏", "并排放置内容。", "columns"],
    ["callout", "lightbulb", "提示块", "突出显示一段提示。", "callout"],
    ["toggle", "chevron-right", "折叠列表", "展开或收起子内容。", "toggle details"],
    ["table", "table", "简单表格", "按行列组织内容。", "table"],
    ["toc", "list", "目录", "跳转到页面中的标题。", "toc contents"],
    ["equation", "sigma", "公式", "插入数学公式。", "math equation"],
    [
      "file",
      "paperclip",
      "图片、视频、音频、文件",
      "上传或嵌入文件。",
      "image video audio file",
    ],
  ];
  let dialog: HTMLElement;
  if (inline) {
    slashCleanup?.();
    document.querySelector("#dialog")?.remove();
    dialog = document.createElement("div");
    dialog.id = "dialog";
    dialog.className = "inline-slash";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-label", "选择块类型");
    dialog.innerHTML =
      '<div class="dialog-heading"><h2>基础块</h2></div><div class="insert-grid" role="listbox" aria-label="块类型"></div>';
    document.body.append(dialog);
  } else {
    dialog = modal(
      "基础块",
      `<label class="insert-search">${icon("search")}<input aria-label="搜索块类型" placeholder="搜索块类型…" /></label><div class="insert-grid" role="listbox" aria-label="块类型"></div>`,
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
  const paint = () => {
    list.innerHTML =
      filtered
        .map(
          ([id, i, title, desc], index) =>
            `<button id="insert-option-${id}" role="option" aria-selected="${index === selected}" data-insert="${id}" class="${index === selected ? "selected" : ""}">${icon(i)}<span><strong>${title}</strong><small>${desc}</small></span></button>`,
        )
        .join("") || '<p class="muted">没有匹配的块</p>';
    refreshIcons();
    (input || dialog).setAttribute(
      "aria-activedescendant",
      filtered[selected] ? `insert-option-${filtered[selected][0]}` : "",
    );
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
    paint();
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
    slashCleanup = () => controller.abort();
    document.addEventListener("keydown", keydown, { signal, capture: true });
    const updateQuery = (event: Event) => {
      if (!(event.target as Element).closest("#editor")) return;
      queueMicrotask(() => {
        if (signal.aborted || editor?.isComposing()) return;
        const query = editor?.getSlashQuery();
        if (query == null) closeModal();
        else filter(query);
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
    document
      .querySelector("#main")
      ?.addEventListener("scroll", () => closeModal(), { signal, once: true });
    filter(initialQuery!);
  } else {
    dialog.addEventListener("keydown", keydown);
    paint();
    input?.focus();
  }
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
  const blockTypes = [
    "text",
    "heading1",
    "heading2",
    "heading3",
    "list",
    "number",
    "task",
    "quote",
    "code",
    "divider",
  ] as const;
  const blockType = blockTypes.find((type) => type === id);
  if (blockType && view === "document" && editor) {
    closeModal();
    editor.insertBlockType(blockType);
    captureEditor();
    return;
  }
  const snippets: Record<string, string> = {
    text: "\n\n",
    heading1: "\n# ",
    heading2: "\n## ",
    heading3: "\n### ",
    list: "\n- ",
    number: "\n1. ",
    task: "\n- [ ] ",
    quote: "\n> ",
    code: "\n```text\n\n```\n",
    divider: "\n---\n",
    inline: "`行内代码`",
    columns:
      "\n<columns>\n\t<column>\n\t\t左侧内容\n\t</column>\n\t<column>\n\t\t右侧内容\n\t</column>\n</columns>\n",
    callout: '\n<callout icon="💡" color="gray_bg">\n\t写下提示内容\n</callout>\n',
    toggle: '\n<details>\n<summary>折叠列表</summary>\n\t<empty-block/>\n</details>\n',
    table: '\n<table header-row="true">\n\t<tr>\n\t\t<td>名称</td>\n\t\t<td>内容</td>\n\t</tr>\n\t<tr>\n\t\t<td></td>\n\t\t<td></td>\n\t</tr>\n</table>\n',
    toc: '\n<table_of_contents/>\n',
    equation: '\n$$\nx^2 + y^2 = z^2\n$$\n',
  };
  if (snippets[id]) {
    insertMarkdown(snippets[id]);
    return;
  }
  if (id === "child") {
    closeModal();
    await newPage(current!.id, true);
    return;
  }
  if (id === "link" || id === "mention") {
    modal(
      "链接到页面",
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
  if (id === "file") {
    closeModal();
    const ownerId = current!.id;
    const input = document.createElement("input");
    input.type = "file";
    input.addEventListener(
      "change",
      () =>
        void (async () => {
          const file = input.files?.[0];
          if (!file) return;
          if (file.size > 15 * 1024 * 1024)
            throw new Error("当前附件大小上限为 15 MB。");
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
          const alt = file.name.replace(/[\[\]\\]/g, "_");
          if (current?.id !== ownerId) {
            toast("文件已上传；请返回原页面后插入附件。");
            return;
          }
          const mediaType = file.type.startsWith("audio/") ? "audio" : file.type.startsWith("video/") ? "video" : file.type === "application/pdf" ? "pdf" : "file";
          insertMarkdown(file.type.startsWith("image/") ? `![${alt}](${result.path})` : `<${mediaType} src="${escapeXml(result.path)}">${escapeXml(file.name)}</${mediaType}>`);
        })().catch(report),
    );
    input.click();
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
    htmlDocument(current.title, current.body, pages, current.bodyFormat),
    "text/html;charset=utf-8",
  );
  toast("HTML 已导出。附件使用相对路径，请同时保留 assets 文件夹。");
}

document.addEventListener("click", (event) => {
  const target = event.target as Element;
  const actionEl = target.closest<HTMLElement>(
    "[data-action],[data-open],[data-view],[data-library-view],[data-toggle],[data-child],[data-insert],[data-insert-link],a[href^='#page/']",
  );
  if (!actionEl) return;
  event.preventDefault();
  actionEl
    .closest<HTMLDetailsElement>(".page-options")
    ?.removeAttribute("open");
  void (async () => {
    if (actionEl.dataset.open) {
      closeModal();
      await openPage(actionEl.dataset.open);
      return;
    }
    if (actionEl.matches("a[href^='#page/']")) {
      const id = decodeURIComponent(actionEl.getAttribute("href")!.slice(6));
      if (pages.some((p) => p.id === id)) await openPage(id);
      else toast("尚未找到链接的页面。");
      return;
    }
    if (actionEl.dataset.view) {
      view = actionEl.dataset.view as View;
      renderDocument();
      return;
    }
    if (actionEl.dataset.libraryView) {
      libraryView = actionEl.dataset.libraryView as LibraryView;
      renderLibrary();
      return;
    }
    if (actionEl.dataset.toggle) {
      const id = actionEl.dataset.toggle;
      collapsed.has(id) ? collapsed.delete(id) : collapsed.add(id);
      renderSidebar();
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
      const p = pages.find((p) => p.id === actionEl.dataset.insertLink)!;
      insertMarkdown(
        actionEl.dataset.inlineMention === "true"
          ? `<mention-page url="${escapeXml(pageUrl(p.id))}">${escapeXml(p.title)}</mention-page>`
          : `\n<page url="${escapeXml(pageUrl(p.id))}">${escapeXml(p.title)}</page>\n`,
      );
      return;
    }
    switch (actionEl.dataset.action) {
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
      case "page-properties": {
        const panel =
          document.querySelector<HTMLDetailsElement>(".page-properties");
        if (panel) {
          panel.open = !panel.open;
          panel.scrollIntoView({ block: "nearest" });
        }
        break;
      }
      case "settings":
        showSettings();
        break;
      case "export":
        await exportHTML();
        break;
      case "close-dialog":
        closeModal();
        break;
      case "conflicts":
        await showConflicts();
        break;
      case "resolve-conflict":
        await resolveConflict();
        break;
      case "sidebar":
        document.body.classList.toggle("sidebar-open");
        break;
      case "mybase-export":
        if (current) {
          download(
            `${current.id}.mybase`,
            toMyBase(current),
            "text/plain;charset=utf-8",
          );
          toast("已导出 MyBase 元数据，没有写入 MyBase 主库。");
        } else toast("请先打开一个页面。");
        break;
    }
  })().catch(report);
});
document.addEventListener("pointerdown", (event) => {
  if (!(event.target as Element).closest(".page-options"))
    document.querySelector(".page-options[open]")?.removeAttribute("open");
});
document.addEventListener("input", (event) => {
  const target = event.target as HTMLInputElement;
  if (target.closest("#editor")) editorChanged = true;
  if (target.id === "page-title" && current) {
    current.title = target.value;
    target.style.height = "auto";
    target.style.height = `${target.scrollHeight}px`;
    markDirty();
  }
  if (target.id === "source-editor" && current) {
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
        toast("不能把页面移动到自己的子页面下。");
        return;
      }
      seen.add(ancestor.id);
      ancestor = pages.find((p) => p.id === ancestor!.parent);
    }
    current.parent = next;
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
      document.querySelector("#dialog")
    )
      return;
    const target = event.target as Element;
    if (target.id === "source-editor") {
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
  if (target.id !== "source-editor") return;
  const area = target as HTMLTextAreaElement;
  const pos = area.selectionStart;
  if (pos >= 1 && (pos === 1 || /\s/.test(area.value[pos - 2]))) {
    area.setRangeText("", pos - 1, pos, "end");
    current.body = area.value;
    markDirty();
    showInsert();
  }
});
window.addEventListener("beforeunload", (event) => {
  captureEditor();
  if (dirty || saving) {
    event.preventDefault();
    event.returnValue = "";
  }
});

async function boot() {
  const [loaded, info] = await Promise.all([
    api<Page[]>("/pages"),
    api<{ vaultPath: string }>("/status"),
  ]);
  pages = loaded;
  vaultPath = info.vaultPath;
  document.body.classList.toggle(
    "color-headings",
    localStorage.getItem("notdown-color") === "on",
  );
  shell();
  const saved = localStorage.getItem("notdown-page");
  if (pages.length)
    await openPage(pages.find((p) => p.id === saved)?.id || pages[0].id);
  else await showLibrary();
  setInterval(() => {
    captureEditor();
    if (
      dirty ||
      editorChanged ||
      saving ||
      conflict ||
      document.querySelector("#dialog")
    )
      return;
    void (async () => {
      const latest = await api<Page[]>("/pages");
      const changed =
        JSON.stringify(latest.map((p) => [p.id, p.revision])) !==
        JSON.stringify(pages.map((p) => [p.id, p.revision]));
      captureEditor();
      if (dirty || editorChanged || saving || conflict || !changed) return;
      pages = latest;
      renderSidebar();
      if (library) renderLibrary();
      else if (current) {
        const latestCurrent = latest.find((p) => p.id === current!.id);
        if (latestCurrent && latestCurrent.revision !== current.revision) {
          destroyEditor();
          current = latestCurrent;
          renderDocument();
          toast("已载入外部修改的 Markdown 文件。");
        }
      }
    })().catch((error) => console.warn("Workspace refresh:", error));
  }, 5000);
}
void boot().catch((error) => {
  app.innerHTML = `<div class="boot-error"><h1>暂时无法打开知识库</h1><p>${e(error instanceof Error ? error.message : error)}</p><p>请确认本地服务已启动：<code>npm run dev</code></p><button onclick="location.reload()">重试</button></div>`;
});
