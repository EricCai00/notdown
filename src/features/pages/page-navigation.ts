export type LibraryRoute = "gallery" | "list" | "tree" | "graph";
export type PageRoute = { kind: "page"; id: string; fragment?: string } | { kind: "vault"; view: LibraryRoute };
type Entry = { session: string; index: number; route: PageRoute };
const key = "notdownNavigation";

export function routeHash(route: PageRoute): string {
  return route.kind === "page" ? `#page/${encodeURIComponent(route.id)}${route.fragment ? "#" + encodeURIComponent(route.fragment) : ""}` : `#vault/${route.view}`;
}

export function parseRoute(hash: string): PageRoute | null {
  if (hash.startsWith("#page/")) {
    try {
      const separator = hash.indexOf("#", 6);
      const id = decodeURIComponent(hash.slice(6, separator < 0 ? undefined : separator));
      const fragment = separator < 0 ? "" : decodeURIComponent(hash.slice(separator + 1));
      return id ? { kind: "page", id, ...(fragment ? { fragment } : {}) } : null;
    }
    catch { return null; }
  }
  const view = hash.slice(7);
  return hash.startsWith("#vault/") && ["gallery", "list", "tree", "graph"].includes(view)
    ? { kind: "vault", view: view as LibraryRoute } : null;
}

function entry(): Entry | null {
  const value = history.state?.[key];
  const route = value?.route;
  const validRoute = route && (route.kind === "page" ? typeof route.id === "string" && route.id.length > 0
    : route.kind === "vault" && ["gallery", "list", "tree", "graph"].includes(route.view));
  return value && typeof value.session === "string" && Number.isInteger(value.index) && value.index >= 0 &&
    validRoute ? value : null;
}

/** One browser history, shared by browser controls and the app's arrows.
 * Loads are serialized and superseded loads may never replace the editor. */
export class PageNavigation {
  private active: Entry;
  private cursor: Entry;
  private upper: number;
  private generation = 0;
  private pending = false;
  private restoring = false;
  private observedURL = location.href;
  private queue: Promise<boolean> = Promise.resolve(true);

  constructor(initial: PageRoute,
    private load: (route: PageRoute, isCurrent: () => boolean, allowTrashed: boolean) => Promise<boolean>,
    private changed: () => void,
    private report: (error: unknown) => void,
  ) {
    const existing = entry();
    this.active = existing && routeHash(existing.route) === location.hash
      ? { ...existing, route: initial }
      : { session: crypto.randomUUID(), index: 0, route: initial };
    this.cursor = this.active;
    let stored = 0;
    try { stored = Number(sessionStorage.getItem(this.storageKey)); } catch { /* Optional button state persistence. */ }
    this.upper = Math.max(this.active.index, Number.isInteger(stored) ? stored : 0);
    this.write(this.active, false);
    window.addEventListener("popstate", this.traverse);
    window.addEventListener("hashchange", this.traverse);
    this.changed();
  }

  private get storageKey() { return `notdown-navigation:${this.active.session}`; }
  get canBack() { return !this.pending && !this.restoring && this.active.index > 0; }
  get canForward() { return !this.pending && !this.restoring && this.active.index < this.upper; }
  back() { if (this.canBack) history.back(); }
  forward() { if (this.canForward) history.forward(); }

  private write(value: Entry, push: boolean) {
    const state = { ...history.state, [key]: value };
    if (push) history.pushState(state, "", routeHash(value.route));
    else history.replaceState(state, "", routeHash(value.route));
    this.cursor = value;
    this.observedURL = location.href;
    try { sessionStorage.setItem(this.storageKey, String(this.upper)); } catch { /* Navigation still works. */ }
  }

  navigate(route: PageRoute, allowTrashed = false): Promise<boolean> {
    if (this.restoring) return Promise.resolve(false);
    if (!this.pending && routeHash(route) === routeHash(this.active.route) && location.hash === routeHash(route)) {
      // Vault callers also refresh after mutations; keep its entry while
      // refreshing the view. A mounted page keeps its editor and undo history.
      return route.kind === "vault" ? this.request(route, this.active, false) : Promise.resolve(true);
    }
    return this.request(route, null, allowTrashed);
  }

  private traverse = () => {
    // Chrome sends both popstate and hashchange for one hash traversal.
    const target = entry();
    if (location.href === this.observedURL && target?.session === this.cursor.session && target.index === this.cursor.index) return;
    this.observedURL = location.href;
    if (this.restoring && target?.session === this.active.session && target.index === this.active.index) {
      this.restoring = false;
      this.write(this.active, false);
      this.changed();
      return;
    }
    // Keep fragment-only/invalid links on the current page, but still account
    // for their browser entry so later Back and rollback offsets stay correct.
    const route = parseRoute(location.hash) || this.active.route;
    const known = target?.session === this.active.session && routeHash(target.route) === location.hash;
    const destination = known
      ? target : { session: this.active.session, index: this.cursor.index + 1, route };
    // Assigning location.hash makes a fresh browser entry and drops Forward.
    // Stamp it now: another hash change may arrive before this page loads.
    if (!known) {
      this.upper = destination.index;
      history.replaceState({ ...history.state, [key]: destination }, "", location.href);
    }
    this.cursor = destination;
    void this.request(route, destination, false);
  };

  private request(route: PageRoute, destination: Entry | null, allowTrashed: boolean): Promise<boolean> {
    const generation = ++this.generation;
    const isCurrent = () => generation === this.generation;
    this.pending = true;
    this.changed();
    this.queue = this.queue.then(async () => {
      if (!isCurrent()) return false;
      let loaded = false;
      try { loaded = await this.load(route, isCurrent, allowTrashed); }
      catch (error) { if (isCurrent()) this.report(error); }
      if (!isCurrent()) return false;
      this.pending = false;
      if (loaded) {
        const browserEntry = entry();
        const base = browserEntry?.session === this.active.session ? browserEntry.index : this.active.index;
        this.active = destination || { session: this.active.session, index: base + 1, route };
        this.upper = destination ? Math.max(this.upper, destination.index) : this.active.index;
        this.write(this.active, !destination);
      } else if (location.hash !== routeHash(this.active.route)) {
        // A native Back/Forward has already moved the URL. Return to the exact
        // entry whose editor is still displayed, retaining the forward branch.
        const failedEntry = destination || entry();
        const delta = failedEntry?.session === this.active.session ? this.active.index - failedEntry.index : 0;
        if (delta) { this.restoring = true; history.go(delta); }
        else this.write(this.active, false);
      }
      this.changed();
      return loaded;
    });
    return this.queue;
  }
}
