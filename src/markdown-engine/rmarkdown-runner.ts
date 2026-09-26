import { api, ApiError } from "../shared/types";
import "./rmarkdown.css";

type Snapshot = { source: string; config: { variant: string } };
/** Results are an ephemeral projection of one captured draft, never document nodes. */
export class RMarkdownRunner {
  private panel = document.createElement("section");
  private events = new AbortController();
  private enabled = false;
  private stopButton = document.createElement("button");
  private status = document.createElement("p");
  private output = document.createElement("div");
  private controller?: AbortController;
  private source?: string;
  private destroyed = false;
  private buttons = document.createElement("div");
  private knitButton = document.createElement("button");
  private editButton = document.createElement("button");

  constructor(private root: HTMLElement, private capture: () => Snapshot) {
    this.panel.className = "rmarkdown-results";
    this.panel.setAttribute("aria-label", "R Markdown results");
    this.panel.hidden = true;
    this.stopButton.type = "button";
    this.stopButton.textContent = "Stop R";
    this.stopButton.hidden = true;
    this.buttons.className = "rmarkdown-actions";
    this.knitButton.type = this.editButton.type = "button";
    this.knitButton.textContent = "Knit";
    this.knitButton.title = "Run the whole document in a fresh R session and show the knitted result";
    this.editButton.textContent = "Return to editing";
    this.editButton.hidden = true;
    this.knitButton.onclick = () => { if (!this.controller) void this.run(); };
    this.editButton.onclick = () => this.edit();
    this.buttons.append(this.knitButton, this.editButton, this.stopButton);
    root.querySelector(".editing-toolbar")!.append(this.buttons);
    this.status.setAttribute("role", "status");
    this.panel.append(this.status, this.output);
    root.append(this.panel);
    root.querySelectorAll("[data-mode]").forEach(button => button.addEventListener("click", () => {
      if (!this.panel.hidden) this.edit();
    }, { signal: this.events.signal }));
    root.addEventListener("keydown", event => {
      if (!this.enabled || event.isComposing || !(event.ctrlKey || event.metaKey) || !event.shiftKey || event.altKey || event.key !== "Enter") return;
      // The notebook node view owns its current-chunk / inline shortcuts.
      if (document.getSelection()?.anchorNode?.parentElement?.closest(".pm-r-chunk, .pm-r-inline") || (event.target as HTMLElement).closest?.(".pm-r-chunk, .pm-r-inline")) return;
      event.preventDefault(); event.stopPropagation();
      if (!this.controller) void this.run();
    }, { capture: true, signal: this.events.signal });
    this.stopButton.addEventListener("click", () => this.stop());
  }

  update(snapshot: Snapshot) {
    const enabled = snapshot.config.variant === "rmarkdown";
    this.enabled = enabled;
    this.buttons.hidden = !enabled;
    if (!enabled && !this.panel.hidden) this.edit();
    if (this.source !== undefined && snapshot.source !== this.source) {
      // An external source update cannot leave a stale preview covering new text.
      this.edit();
    }
  }

  private edit() {
    this.stop(); this.panel.hidden = true; this.output.replaceChildren();
    this.root.classList.remove("is-r-knitted"); this.editButton.hidden = true;
    this.source = undefined;
    this.root.dispatchEvent(new Event("notdown-r-reset"));
  }

  private stop() {
    if (!this.controller) return;
    this.controller.abort();
    this.controller = undefined;
    this.stopButton.hidden = true;
    this.knitButton.disabled = false;
    this.status.textContent = "R execution stopped.";
  }

  private async run() {
    this.stop();
    const snapshot = this.capture();
    if (snapshot.config.variant !== "rmarkdown") return;
    this.root.dispatchEvent(new Event("notdown-r-reset"));
    this.source = snapshot.source;
    const controller = this.controller = new AbortController();
    this.panel.hidden = false;
    this.root.classList.add("is-r-knitted");
    this.editButton.hidden = false; this.knitButton.disabled = true;
    this.stopButton.hidden = false;
    this.output.replaceChildren();
    this.status.textContent = "Knitting…";
    try {
      const result = await api<{ html: string; log: string }>("/rmarkdown/run", {
        method: "POST", body: JSON.stringify({ source: snapshot.source }), signal: controller.signal,
      });
      if (this.destroyed || this.controller !== controller) return;
      const frame = document.createElement("iframe");
      frame.title = "R Markdown output";
      frame.setAttribute("sandbox", "");
      frame.referrerPolicy = "no-referrer";
      // Neither output scripts nor network requests can access the local API.
      frame.srcdoc = '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; style-src \'unsafe-inline\'; font-src data:; form-action \'none\'; base-uri \'none\'">' + result.html +
        '<style>body{margin:0;padding:4px 8px;max-width:none;color:#37352f;font:15px/1.6 system-ui,sans-serif}pre{font:13px/1.6 Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere}div.sourceCode{margin:12px 0 6px;padding:8px 12px;border:1px solid #dce1e5;border-radius:4px;background:#f7f8fa}div.sourceCode pre{margin:0}img{max-width:100%;height:auto}table{border-collapse:collapse}th,td{padding:5px 10px;border-bottom:1px solid #e5e7eb}</style>';
      this.output.append(frame);
      if (result.log.trim()) {
        const details = document.createElement("details"), summary = document.createElement("summary"), log = document.createElement("pre");
        summary.textContent = "R console";
        log.textContent = result.log;
        details.append(summary, log);
        this.output.append(details);
      }
      this.status.textContent = "Knit complete · Read-only result";
    } catch (error) {
      if (this.destroyed || this.controller !== controller) return;
      this.status.textContent = error instanceof ApiError && error.status === 404
        ? "The running R backend is out of date. Restart the Notdown service, then click Knit again."
        : error instanceof Error ? error.message : String(error);
    } finally {
      if (this.controller === controller) {
        this.controller = undefined;
        this.stopButton.hidden = true;
        this.knitButton.disabled = false;
      }
    }
  }

  destroy() { this.destroyed = true; this.stop(); this.events.abort(); this.panel.remove(); this.buttons.remove(); this.root.classList.remove("is-r-knitted"); }
}
