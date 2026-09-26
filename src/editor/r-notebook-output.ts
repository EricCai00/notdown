import { createElement, ChevronDown, ChevronUp, X, type IconNode } from "lucide";
import type { RResult } from "./r-notebook-state";

export function rButton(label: string, glyph: IconNode, run: () => void) {
  const button = document.createElement("button");
  button.type = "button"; button.title = label; button.setAttribute("aria-label", label);
  button.append(createElement(glyph, { width: 15, height: 15, "stroke-width": 1.7, "aria-hidden": "true" }));
  button.onclick = run;
  return button;
}

export class RNotebookOutput {
  readonly dom = document.createElement("section");
  private status = document.createElement("span");
  private body = document.createElement("div");
  private fold: HTMLButtonElement;
  private collapsed = false;
  private result?: RResult;
  constructor(clear: () => void, inline = false, private language = "R") {
    this.dom.className = inline ? "pm-r-inline-output" : "pm-r-output";
    this.dom.contentEditable = "false";
    this.dom.setAttribute("aria-label", inline ? `Inline ${this.language} result` : `${this.language} chunk output`);
    this.dom.hidden = true;
    const toolbar = document.createElement("div"); toolbar.className = "pm-r-output-toolbar";
    this.status.setAttribute("role", "status");
    this.fold = rButton("Collapse output", ChevronUp, () => { this.collapsed = !this.collapsed; this.layout(); });
    const remove = rButton("Clear output", X, clear);
    toolbar.append(this.status, this.fold, remove);
    this.body.className = "pm-r-output-body";
    this.dom.append(toolbar, this.body);
  }
  show(result: RResult | undefined) {
    this.dom.hidden = !result;
    if (!result) { this.body.replaceChildren(); this.result = undefined; return; }
    const previous = this.result; this.result = result;
    this.dom.dataset.state = result.phase;
    this.dom.classList.toggle("is-stale", Boolean(result.stale));
    this.status.textContent = result.stale ? "Source changed · result is out of date" : result.phase === "running" ? "Running…" : result.phase === "error" ? `${this.language} error` : result.phase === "stopped" ? "Stopped" : "Output";
    // A stale badge or folding does not reload plots/frames.
    if (result.element) {
      if (this.body.firstChild !== result.element) this.body.replaceChildren(result.element);
    } else if (previous?.element || previous?.html !== result.html || previous?.text !== result.text || previous?.message !== result.message || previous?.phase !== result.phase) {
      this.body.replaceChildren();
      if (result.html) {
        const frame = document.createElement("iframe");
        frame.title = `${this.language} chunk result`; frame.setAttribute("sandbox", ""); frame.referrerPolicy = "no-referrer";
        const parsed = new DOMParser().parseFromString(result.html, "text/html");
        const lines = [...parsed.querySelectorAll("pre")].reduce((sum, pre) => sum + (pre.textContent || "").split("\n").length, 0);
        const rows = parsed.querySelectorAll("tr").length;
        const figures = parsed.querySelectorAll("img, svg").length;
        const paragraphs = parsed.querySelectorAll("p, h1, h2, h3, figcaption").length;
        frame.style.height = `${Math.min(560, Math.max(42, lines * 20 + rows * 29 + figures * 380 + paragraphs * 26 + 20))}px`;
        frame.srcdoc = '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; style-src \'unsafe-inline\'; font-src data:; form-action \'none\'; base-uri \'none\'">' + result.html +
          '<style>html,body{margin:0!important;padding:0!important;max-width:none!important;background:#fff;color:#333;font:13px/1.5 system-ui,sans-serif}body{padding:4px 12px!important;box-sizing:border-box}header{display:none}pre{margin:0 0 6px!important;padding:0!important;border:0!important;background:transparent!important;white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.5 Consolas,monospace}code{font:inherit}table{border-collapse:collapse;width:100%;font:13px/1.5 system-ui,sans-serif}th,td{padding:4px 9px;border-bottom:1px solid #e5e7eb;text-align:left}th{background:#f6f7f8}figure{margin:0}figcaption{margin:4px 0;color:#7b848b;font-size:12px}img{max-width:100%;height:auto;max-height:360px;object-fit:contain}p{margin:4px 0}h1,h2,h3{font-size:16px}</style>';
        this.body.append(frame);
        if (result.message) {
          const error = document.createElement("pre"); error.textContent = result.message; this.body.append(error);
        }
      } else if (result.text !== undefined || result.message) {
        const pre = document.createElement("pre"); pre.textContent = result.message || result.text || "";
        this.body.append(pre);
      } else if (result.phase === "done") {
        const empty = document.createElement("p"); empty.className = "pm-r-no-output"; empty.textContent = "No output"; this.body.append(empty);
      }
    }
    if (result.phase === "running") this.collapsed = false;
    this.layout();
  }
  private layout() {
    this.body.hidden = this.collapsed;
    const label = this.collapsed ? "Expand output" : "Collapse output";
    this.fold.title = label; this.fold.setAttribute("aria-label", label); this.fold.setAttribute("aria-expanded", String(!this.collapsed));
    this.fold.replaceChildren(createElement(this.collapsed ? ChevronDown : ChevronUp, { width: 15, height: 15, "aria-hidden": "true" }));
  }
}
