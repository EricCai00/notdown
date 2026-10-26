import { parseRoute, routeHash, type PageRoute } from "../features/pages/page-navigation";

export type TabViewState = { mode: string; scroll: number; sourceScroll: number };
export type WorkspaceTab = { id: string; route: PageRoute; state?: TabViewState };
interface Options {
  storage: Pick<Storage, "getItem" | "setItem">;
  key: string;
  navigate(route: PageRoute): Promise<boolean>;
  currentRoute(): PageRoute;
  capture(): TabViewState;
  restore(state?: TabViewState): Promise<void>;
  changed(): void;
  report(error: unknown): void;
}
const identity = routeHash;

/** Tabs own routes and view positions; the existing editor remains the only writer. */
export class WorkspaceTabs {
  tabs: WorkspaceTab[] = [];
  activeId = "";
  busy = false;
  private closed: WorkspaceTab[] = [];
  constructor(initial: PageRoute, private options: Options) {
    try {
      const raw = options.storage.getItem(options.key);
      const saved = raw && raw.length < 128_000 ? JSON.parse(raw) : null;
      if (saved?.version === 1 && Array.isArray(saved.tabs)) {
        for (const item of saved.tabs.slice(0, 128)) {
          const route = typeof item?.hash === "string" && parseRoute(item.hash);
          if (!route || typeof item.id !== "string" || !/^[\w-]{1,80}$/.test(item.id) || this.tabs.some(tab => tab.id === item.id)) continue;
          const state = item.state;
          this.tabs.push({ id: item.id, route, ...(state && ["document", "source", "split", "outline", "mindmap"].includes(state.mode) &&
            Number.isFinite(state.scroll) && state.scroll >= 0 && Number.isFinite(state.sourceScroll) && state.sourceScroll >= 0 ? { state } : {}) });
        }
      }
      const active = this.tabs.find(tab => tab.id === saved?.activeId && identity(tab.route) === identity(initial))
        ?? this.tabs.find(tab => identity(tab.route) === identity(initial));
      if (active) { this.activeId = active.id; active.route = initial; }
    } catch { /* A broken or unavailable session store must not prevent opening the vault. */ }
    if (!this.activeId) {
      const tab = { id: crypto.randomUUID(), route: initial };
      this.tabs.push(tab); this.activeId = tab.id;
    }
    this.persist();
  }
  get active() { return this.tabs.find(tab => tab.id === this.activeId)!; }
  restoreActive() { return this.options.restore(this.active.state); }
  capture() { this.active.state = this.options.capture(); this.persist(); }
  sync(route: PageRoute) {
    if (this.busy) return;
    if (identity(this.active.route) !== identity(route)) this.active.state = undefined;
    this.active.route = structuredClone(route);
    this.persist(); this.options.changed();
  }
  private persist() {
    try {
      this.options.storage.setItem(this.options.key, JSON.stringify({ version: 1, activeId: this.activeId,
        tabs: this.tabs.map(tab => ({ id: tab.id, hash: routeHash(tab.route), state: tab.state })) }));
    } catch { /* Tabs still work when session storage is full or disabled. */ }
  }
  private async run(action: () => Promise<boolean>) {
    if (this.busy) return false;
    this.busy = true; this.options.changed();
    try { return await action(); }
    catch (error) { this.options.report(error); return false; }
    finally { this.busy = false; this.sync(this.options.currentRoute()); }
  }
  async activate(id: string) {
    const tab = this.tabs.find(tab => tab.id === id);
    if (!tab || id === this.activeId) return !!tab;
    return this.run(async () => {
      this.capture();
      if (!await this.options.navigate(tab.route)) return false;
      this.activeId = id; tab.route = this.options.currentRoute();
      await this.options.restore(tab.state); return true;
    });
  }
  async open(route: PageRoute = { kind: "vault", view: "gallery" }, background = false) {
    const existing = this.tabs.find(tab => identity(tab.route) === identity(route));
    // The + button intentionally opens another home tab.
    if (existing && route.kind !== "vault") {
      if (background) return true;
      const loaded = await this.activate(existing.id);
      if (loaded && route.kind === "page" && route.fragment) return this.options.navigate(route);
      return loaded;
    }
    if (background) {
      if (this.busy) return false;
      this.tabs.push({ id: crypto.randomUUID(), route: structuredClone(route) });
      this.persist(); this.options.changed(); return true;
    }
    return this.run(async () => {
      this.capture();
      if (!await this.options.navigate(route)) return false;
      const tab = { id: crypto.randomUUID(), route: this.options.currentRoute() };
      this.tabs.push(tab); this.activeId = tab.id;
      await this.options.restore(); return true;
    });
  }
  async close(id: string) {
    const index = this.tabs.findIndex(tab => tab.id === id);
    if (index < 0 || this.busy) return false;
    if (id !== this.activeId) {
      this.closed.push(this.tabs.splice(index, 1)[0]); this.closed = this.closed.slice(-20);
      this.persist(); this.options.changed(); return true;
    }
    return this.run(async () => {
      this.capture();
      const next = this.tabs[index + 1] ?? this.tabs[index - 1];
      if (!await this.options.navigate(next?.route ?? { kind: "vault", view: "gallery" })) return false;
      this.closed.push(this.tabs[index]); this.closed = this.closed.slice(-20);
      this.tabs.splice(index, 1);
      const target = next ?? { id: crypto.randomUUID(), route: this.options.currentRoute() };
      if (!next) this.tabs.push(target);
      this.activeId = target.id; target.route = this.options.currentRoute();
      await this.options.restore(target.state); return true;
    });
  }
  async reopen() {
    const tab = this.closed.at(-1);
    if (!tab) return false;
    const loaded = await this.open(tab.route);
    if (loaded) this.closed.pop();
    return loaded;
  }
  move(id: string, before: string) {
    if (this.busy || id === before) return;
    const tab = this.tabs.find(tab => tab.id === id);
    if (!tab || !this.tabs.some(tab => tab.id === before)) return;
    this.tabs = this.tabs.filter(tab => tab.id !== id);
    this.tabs.splice(this.tabs.findIndex(tab => tab.id === before), 0, tab);
    this.persist(); this.options.changed();
  }
}

export function renderWorkspaceTabs(host: HTMLElement, model: WorkspaceTabs,
  label: (route: PageRoute) => { title: string; icon: Element }, pending: boolean) {
  const focused = host.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.tabFocus : undefined;
  if (focused) host.dataset.restoreTabFocus = focused;
  const scroll = host.scrollLeft;
  host.replaceChildren();
  for (const tab of model.tabs) {
    const info = label(tab.route), active = tab.id === model.activeId;
    const item = document.createElement("div"); item.className = "workspace-tab"; item.classList.toggle("active", active);
    item.draggable = !model.busy; item.dataset.tabId = tab.id;
    const button = document.createElement("button"); button.type = "button"; button.role = "tab";
    button.id = `workspace-tab-${tab.id}`; button.dataset.tabFocus = tab.id;
    button.setAttribute("aria-label", info.title);
    button.setAttribute("aria-selected", String(active)); button.setAttribute("aria-controls", "main");
    button.tabIndex = active ? 0 : -1; button.disabled = model.busy; button.title = info.title;
    info.icon.classList.add("workspace-tab-icon");
    const text = document.createElement("span"); text.textContent = info.title;
    button.append(info.icon, text);
    if (active && pending) { const dot = document.createElement("span"); dot.className = "workspace-tab-dirty"; dot.setAttribute("aria-hidden", "true"); button.setAttribute("aria-description", "Unsaved changes"); button.append(dot); }
    button.onclick = () => { void model.activate(tab.id); };
    const close = document.createElement("button"); close.type = "button"; close.className = "workspace-tab-close";
    close.textContent = "×"; close.setAttribute("aria-label", `Close tab: ${info.title}`); close.dataset.tabFocus = `close-${tab.id}`;
    close.disabled = model.busy; close.onclick = () => { void model.close(tab.id); };
    item.onauxclick = event => { if (event.button === 1) { event.preventDefault(); void model.close(tab.id); } };
    item.ondragstart = event => { event.dataTransfer?.setData("application/x-notdown-tab", tab.id); };
    item.ondragover = event => { if (event.dataTransfer?.types.includes("application/x-notdown-tab")) event.preventDefault(); };
    item.ondrop = event => { const id = event.dataTransfer?.getData("application/x-notdown-tab"); if (id) { event.preventDefault(); model.move(id, tab.id); } };
    item.append(button, close); host.append(item);
  }
  host.scrollLeft = scroll;
  const restoreFocus = focused ?? (document.activeElement === document.body ? host.dataset.restoreTabFocus : undefined);
  if (!model.busy && restoreFocus) (host.querySelector<HTMLElement>(`[data-tab-focus="${CSS.escape(restoreFocus)}"]`) ?? host.querySelector<HTMLElement>('[aria-selected="true"]'))?.focus({ preventScroll: true });
  if (!model.busy) delete host.dataset.restoreTabFocus;
  host.querySelector(".workspace-tab.active")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  host.onkeydown = event => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>('[role="tab"]');
    if (!target) return;
    const buttons = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')], index = buttons.indexOf(target);
    if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      buttons[event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length]?.focus();
    } else if (event.key === "Delete") { event.preventDefault(); void model.close(target.dataset.tabFocus!); }
  };
  const panel = document.querySelector("#main");
  panel?.setAttribute("role", "tabpanel"); panel?.setAttribute("aria-labelledby", `workspace-tab-${model.activeId}`);
}
