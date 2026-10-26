import { app, BrowserWindow, Menu, Tray, nativeImage } from "electron";

type Options = {
  icon: string;
  saveTargets(): BrowserWindow[];
  save(window: BrowserWindow): Promise<boolean>;
  setQuitting(active: boolean): void;
  welcome(): BrowserWindow;
};

/** One process owns the tray and all vault windows, including hidden ones. */
export class DesktopLifecycle {
  readonly tray: Tray;
  readonly menu: Menu;
  private lastWindow?: BrowserWindow;
  private exiting = false;
  private pendingQuit?: Promise<void>;
  private closing = new Set<number>();
  private presentations = new Map<number, number>();

  constructor(private options: Options) {
    this.tray = new Tray(nativeImage.createFromPath(options.icon).resize({ width: 16, height: 16 }));
    this.tray.setToolTip("Notdown");
    this.menu = Menu.buildFromTemplate([
      { id: "open", label: "Open Notdown", click: () => this.restore() },
      { type: "separator" },
      { id: "quit", label: "Quit Notdown", click: () => { void this.requestQuit(); } },
    ]);
    this.tray.setContextMenu(this.menu);
    this.tray.on("click", () => this.restore());
    this.tray.on("double-click", () => this.restore());
    app.on("activate", () => this.restore());
    app.on("before-quit", event => {
      if (this.exiting) return;
      event.preventDefault();
      void this.requestQuit();
    });
  }

  show(window: BrowserWindow) {
    if (window.isDestroyed()) return;
    this.lastWindow = window;
    this.presentations.set(window.id, (this.presentations.get(window.id) ?? 0) + 1);
    if (window.isMinimized()) window.restore();
    window.show(); window.focus();
  }

  restore() {
    if (this.exiting) return;
    const window = this.lastWindow && !this.lastWindow.isDestroyed() ? this.lastWindow
      : this.options.saveTargets().find(window => !window.isDestroyed())
        ?? BrowserWindow.getAllWindows().find(window => !window.isDestroyed());
    this.show(window ?? this.options.welcome());
  }

  track(window: BrowserWindow, saveOnClose: boolean) {
    const windowId = window.id;
    this.lastWindow = window;
    window.on("closed", () => { this.closing.delete(windowId); this.presentations.delete(windowId); });
    window.on("focus", () => { this.lastWindow = window; });
    window.on("close", event => {
      if (this.exiting) return;
      event.preventDefault();
      if (this.pendingQuit || this.closing.has(windowId)) return;
      this.closing.add(windowId);
      const presentation = this.presentations.get(windowId);
      void (async () => {
        try {
          const saved = !saveOnClose || await this.options.save(window);
          if (window.isDestroyed()) return;
          if (!saved) this.show(window);
          else if (!this.pendingQuit && this.presentations.get(windowId) === presentation) window.hide();
        } catch { this.show(window); }
        finally { this.closing.delete(windowId); }
      })();
    });
  }

  requestQuit(): Promise<void> {
    if (this.exiting) return Promise.resolve();
    if (this.pendingQuit) return this.pendingQuit;
    this.options.setQuitting(true);
    this.pendingQuit = this.prepareQuit().finally(() => {
      this.pendingQuit = undefined;
      if (!this.exiting) this.options.setQuitting(false);
    });
    return this.pendingQuit;
  }

  private async prepareQuit() {
    const targets = this.options.saveTargets().filter(window => !window.isDestroyed());
    const ids = targets.map(window => window.id);
    const results = await Promise.all(targets.map(async window => {
      try { return await this.options.save(window); } catch { return false; }
    }));
    // A vault opened while saves were pending has not approved this exit.
    const approved = new Set(ids.filter((_, index) => results[index]));
    const unsaved = this.options.saveTargets().filter(window => !window.isDestroyed() && !approved.has(window.id));
    if (unsaved.length) { this.show(unsaved[0]); return; }
    this.exiting = true;
    this.tray.destroy();
    app.quit();
  }
}
