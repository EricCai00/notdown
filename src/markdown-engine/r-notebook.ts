import { api, ApiError } from "../shared/types";
import { rTargets, type RAction, type RResult, type RTarget } from "../editor/r-notebook-state";
import { OJSNotebook } from "./ojs-notebook";
import { executionLanguage } from "./quarto";

type Snapshot = { source: string; config: { variant: string; extensions?: Record<string, boolean> } };
type Reply = { outputs: { index: number; html?: string; text?: string; error?: string }[]; error?: string; sessionStarted?: boolean };
const codeOf = (target: RTarget) => JSON.stringify([executionLanguage(target.node()), target.node().textContent,
  target.kind === "chunk" ? target.node().attrs.header : ""]);

/** Runtime state belongs to this workspace, never to a Markdown transaction. */
export class RNotebookController {
  private session = crypto.randomUUID();
  private events = new AbortController();
  private controller?: AbortController;
  private states = new Map<RTarget, RResult>();
  private executed = new Map<RTarget, string>();
  private active = new Map<RTarget, string>();
  private source?: string;
  private enabled = false;
  private disposed = false;
  private sessionUsed = false;
  private backend = "rmarkdown";
  private variant?: string;
  private ojs: OJSNotebook;
  private batch?: AbortController;
  private inlineMode: "code" | "result" = "code";
  private knownTargets = new WeakSet<RTarget>();
  private toolbar = document.createElement("div");
  private runAllButton = document.createElement("button");
  private inlineToggle = document.createElement("button");

  constructor(private root: HTMLElement, private capture: () => Snapshot) {
    this.ojs = new OJSNotebook(root, (target, result) => this.set(target, result));
    this.toolbar.className = "notebook-controls";
    this.toolbar.setAttribute("role", "group"); this.toolbar.setAttribute("aria-label", "Notebook controls");
    this.runAllButton.type = this.inlineToggle.type = "button";
    this.runAllButton.onclick = () => { if (this.batch) this.stop(); else void this.runAll(); };
    this.inlineToggle.setAttribute("role", "switch");
    this.inlineToggle.setAttribute("aria-label", "Show all inline results");
    this.inlineToggle.onclick = () => {
      this.capture();
      const allResults = rTargets(root).filter(target => target.kind === "inline").every(target => target.inlineView?.() === "result");
      this.setInlineMode(allResults ? "code" : "result");
    };
    this.toolbar.append(this.runAllButton, this.inlineToggle);
    root.querySelector(".editing-toolbar")?.append(this.toolbar);
    root.addEventListener("notdown-inline-view", () => this.controls(), { signal: this.events.signal });
    root.addEventListener("notdown-r-reset", () => this.reset(), { signal: this.events.signal });
    window.addEventListener("notdown-runtime-settings-changed", () => this.reset(), { signal: this.events.signal });
    window.addEventListener("pagehide", () => this.reset(), { signal: this.events.signal });
    root.addEventListener("notdown-r-action", event => {
      const { target, action } = (event as CustomEvent<{ target: RTarget; action: RAction }>).detail;
      if (rTargets(root).includes(target) && (!this.batch || ["stop", "clear", "restart"].includes(action))) void this.action(target, action);
    }, { signal: this.events.signal });
  }
  update(snapshot: Snapshot) {
    if (this.variant !== undefined && this.variant !== snapshot.config.variant) this.reset();
    this.variant = snapshot.config.variant;
    this.enabled = ["rmarkdown", "quarto", "notdown"].includes(snapshot.config.variant);
    this.controls();
    if (!this.enabled) { this.reset(); return; }
    for (const target of this.states.keys()) if (!this.root.contains(target.dom)) { this.states.delete(target); this.executed.delete(target); }
    if (this.source !== undefined && this.source !== snapshot.source) {
      if (this.batch) this.stop();
      if ([...this.active].some(([target, code]) => !this.root.contains(target.dom) || codeOf(target) !== code)) this.stop();
      this.ojs.sourceChanged();
      for (const [target, result] of this.states) this.set(target, result);
    }
    this.source = snapshot.source;
    for (const target of rTargets(this.root)) if (!this.knownTargets.has(target)) {
      this.knownTargets.add(target); target.setInlineView?.(this.inlineMode);
    }
    this.controls();
  }
  private controls() {
    const targets = rTargets(this.root), inlines = targets.filter(target => target.kind === "inline");
    this.toolbar.hidden = !this.enabled || !targets.length;
    this.runAllButton.textContent = this.batch ? "Stop all" : "Run all";
    this.runAllButton.disabled = Boolean(this.controller && !this.batch);
    this.inlineToggle.hidden = !inlines.length;
    const results = inlines.filter(target => target.inlineView?.() === "result").length;
    this.inlineToggle.setAttribute("aria-checked", String(inlines.length > 0 && results === inlines.length));
    this.inlineToggle.textContent = results === inlines.length ? "Inline: Results" : results ? "Inline: Mixed" : "Inline: Code";
  }
  private setInlineMode(mode: "code" | "result") {
    this.inlineMode = mode;
    for (const target of rTargets(this.root)) target.setInlineView?.(mode);
    this.controls();
  }
  private async runAll() {
    if (!this.enabled || this.controller || this.batch) return;
    this.capture();
    const targets = rTargets(this.root);
    if (!targets.length) return;
    const batch = this.batch = new AbortController();
    this.root.dataset.runningAll = "true";
    this.setInlineMode("result");
    // Define chunk variables first, including those referenced by earlier prose.
    const ordered = [...targets.filter(target => target.kind === "chunk"), ...targets.filter(target => target.kind === "inline")];
    try {
      for (const target of ordered) {
        if (batch.signal.aborted || this.disposed || !this.root.contains(target.dom)) break;
        await this.action(target, target.kind === "chunk" ? "current" : "inline");
      }
    } finally {
      if (this.batch === batch) { this.batch = undefined; delete this.root.dataset.runningAll; this.controls(); }
    }
  }
  private set(target: RTarget, result: RResult | undefined) {
    if (result) {
      result = { ...result, stale: this.executed.has(target) && this.executed.get(target) !== codeOf(target) };
      this.states.set(target, result);
    } else { this.states.delete(target); this.executed.delete(target); }
    if (this.root.contains(target.dom)) target.show(result);
  }
  private stop() {
    this.batch?.abort(); this.batch = undefined; delete this.root.dataset.runningAll;
    this.controls();
    if (!this.controller) return;
    this.controller.abort(); this.controller = undefined;
    for (const [target, result] of this.states)
      if (result.phase === "running") this.set(target, { phase: "stopped", message: "Execution stopped. Notebook session reset." });
    this.active.clear();
    this.releaseSession();
    this.controls();
  }
  private releaseSession() {
    if (this.sessionUsed) void api(`/${this.backend}/notebook/${this.session}`, { method: "DELETE", body: "{}", keepalive: true }).catch(() => {});
    this.sessionUsed = false;
    this.session = crypto.randomUUID();
  }
  private reset() {
    this.stop(); this.releaseSession();
    this.ojs.reset();
    for (const target of this.states.keys()) this.set(target, undefined);
  }
  private async action(target: RTarget, action: RAction) {
    if (action === "clear") { if (this.states.get(target)?.phase === "running") this.stop(); this.ojs.clear(target); this.set(target, undefined); return; }
    if (action === "stop") { this.stop(); return; }
    if (action === "restart") { this.reset(); return; }
    if (!this.enabled || this.controller) return;
    const position = target.position();
    const snapshot = this.capture();
    // Capturing pending input may replace a projected node view.
    const current = rTargets(this.root).find(item => item.kind === target.kind && item.position() === position);
    if (!current || !["rmarkdown", "quarto", "notdown"].includes(snapshot.config.variant)) return;
    target = current;
    const targets = rTargets(this.root).filter(item => item.kind === target.kind);
    const index = targets.indexOf(target);
    const selected = action === "above" ? targets.slice(0, index) : [target];
    if (!selected.length) return;
    const controller = this.controller = new AbortController();
    this.controls();
    this.source = snapshot.source;
    this.active = new Map(selected.map(item => [item, codeOf(item)]));
    selected.forEach(item => { this.executed.set(item, codeOf(item)); this.set(item, { phase: "running" }); });
    try {
      const backend = snapshot.config.variant === "rmarkdown" ? "rmarkdown" : "quarto";
      if (this.backend !== backend) this.releaseSession();
      this.backend = backend;
      const browserOnly = selected.every(item => executionLanguage(item.node()) === "ojs");
      this.sessionUsed ||= !browserOnly;
      const reply: Reply = browserOnly ? { outputs: selected.map(item => ({ index: targets.indexOf(item) })) } : await api<Reply>(`/${backend}/notebook`, { method: "POST", signal: controller.signal,
        body: JSON.stringify({ session: this.session, source: snapshot.source, variant: snapshot.config.variant, extensions: snapshot.config.extensions || {}, mode: action, index }),
      });
      if (this.disposed || this.controller !== controller) return;
      if (reply.error) throw new Error(reply.error);
      for (const output of reply.outputs || []) {
        const item = targets[output.index];
        if (item && selected.includes(item)) {
          if (executionLanguage(item.node()) === "ojs" && !output.error) {
            await this.ojs.run(item, output.index);
            if (this.controller !== controller) return;
          } else this.set(item, { phase: output.error ? "error" : "done", html: output.html, text: output.text, message: output.error });
        }
      }
      for (const item of selected) if (this.states.get(item)?.phase === "running")
        this.set(item, { phase: "stopped", message: "Not executed after an earlier error." });
    } catch (error) {
      if (this.disposed || this.controller !== controller) return;
      const message = error instanceof ApiError && error.status === 404
        ? "The running notebook backend is out of date. Restart the Notdown service, then run this code again."
        : error instanceof Error ? error.message : String(error);
      for (const item of selected) this.set(item, { phase: "error", message });
    } finally { if (this.controller === controller) { this.controller = undefined; this.active.clear(); this.controls(); } }
  }
  destroy() { this.disposed = true; this.reset(); this.ojs.destroy(); this.events.abort(); this.toolbar.remove(); }
}
