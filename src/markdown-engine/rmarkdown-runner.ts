import { api } from "../shared/types";
import "./rmarkdown.css";

type Snapshot = { source: string; config: { variant: string } };
/** Results are an ephemeral projection of one captured draft, never document nodes. */
export class RMarkdownRunner {
  private controls = document.createElement("div");
  private panel = document.createElement("section");
  private runButton = document.createElement("button");
  private stopButton = document.createElement("button");
  private status = document.createElement("p");
  private output = document.createElement("div");
  private controller?: AbortController;
  private source?: string;
  private destroyed = false;

  constructor(root: HTMLElement, private capture: () => Snapshot, insert: (text: string) => void) {
    this.controls.className = "rmarkdown-controls";
    this.panel.className = "rmarkdown-results";
    this.panel.setAttribute("aria-label", "R Markdown results");
    this.panel.hidden = true;
    this.runButton.type = this.stopButton.type = "button";
    this.runButton.textContent = "Run R Markdown";
    this.runButton.title = "Run this document with local R in a fresh session";
    this.stopButton.textContent = "Stop R";
    this.stopButton.hidden = true;
    const insertButton = document.createElement("button");
    insertButton.type = "button";
    insertButton.textContent = "Insert R chunk";
    insertButton.addEventListener("click", () => insert('```{r}\nsummary(cars)\n```'));
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "Close results";
    close.addEventListener("click", () => { this.stop(); this.panel.hidden = true; });
    const note = document.createElement("p");
    note.className = "rmarkdown-notice";
    note.textContent = "Runs code on your computer with your account's permissions. Run trusted documents only. Each run starts a fresh R session in a temporary folder.";
    this.status.setAttribute("role", "status");
    this.controls.append(insertButton, this.runButton, this.stopButton);
    this.panel.append(close, note, this.status, this.output);
    root.querySelector(".editing-toolbar")!.append(this.controls);
    root.append(this.panel);
    this.runButton.addEventListener("click", () => void this.run());
    this.stopButton.addEventListener("click", () => this.stop());
    // A visible explanation before execution, without a modal confirmation.
    this.controls.title = note.textContent;
  }

  update(snapshot: Snapshot) {
    const enabled = snapshot.config.variant === "rmarkdown";
    this.controls.hidden = !enabled;
    if (!enabled) { this.stop(); this.panel.hidden = true; }
    if (this.source !== undefined && snapshot.source !== this.source) {
      this.stop();
      this.status.textContent = "Source changed. Run again to refresh these results.";
    }
  }

  private stop() {
    if (!this.controller) return;
    this.controller.abort();
    this.controller = undefined;
    this.runButton.disabled = false;
    this.stopButton.hidden = true;
    this.status.textContent = "R execution stopped.";
  }

  private async run() {
    this.stop();
    const snapshot = this.capture();
    if (snapshot.config.variant !== "rmarkdown") return;
    this.source = snapshot.source;
    const controller = this.controller = new AbortController();
    this.panel.hidden = false;
    this.runButton.disabled = true;
    this.stopButton.hidden = false;
    this.output.replaceChildren();
    this.status.textContent = "Running R Markdown…";
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
      frame.srcdoc = '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; style-src \'unsafe-inline\'; font-src data:; form-action \'none\'; base-uri \'none\'">' + result.html;
      this.output.append(frame);
      if (result.log.trim()) {
        const details = document.createElement("details"), summary = document.createElement("summary"), log = document.createElement("pre");
        summary.textContent = "R console";
        log.textContent = result.log;
        details.append(summary, log);
        this.output.append(details);
      }
      this.status.textContent = "R Markdown completed. Results belong to this source snapshot.";
    } catch (error) {
      if (this.destroyed || this.controller !== controller) return;
      this.status.textContent = error instanceof Error ? error.message : String(error);
    } finally {
      if (this.controller === controller) {
        this.controller = undefined;
        this.runButton.disabled = false;
        this.stopButton.hidden = true;
      }
    }
  }

  destroy() { this.destroyed = true; this.stop(); this.panel.remove(); this.controls.remove(); }
}
