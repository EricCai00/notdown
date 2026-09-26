import sandboxScript from "virtual:notdown-ojs";
import outputScript from "virtual:notdown-ojs-output";
import inspectorCSS from "../../node_modules/@observablehq/inspector/dist/inspector.css?raw";
import inputsCSS from "@observablehq/inputs/dist/index.css?raw";
import { quartoCell, executionLanguage } from "./quarto";
import { rTargets, type RResult, type RTarget } from "../editor/r-notebook-state";
import "./ojs-notebook.css";

type Entry = { target: RTarget; visible: boolean; display?: HTMLIFrameElement };
const frameSource = (script: string) => `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' https:; connect-src https:; img-src data: blob: https:; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none'">` +
  `<style>${inspectorCSS}\n${inputsCSS}\nhtml,body{margin:0;background:white;color:#333;font:13px/1.5 system-ui}body{padding:4px 12px;box-sizing:border-box}pre{white-space:pre-wrap;margin:0}svg,img{max-width:100%}form{max-width:100%}</style>` +
  `<body><script>${script.replace(/<\/script/gi, "<\\/script")}<\/script>`;

/** One hidden reactive module; each chunk has its own isolated interactive output. */
export class OJSNotebook {
  private frame?: HTMLIFrameElement;
  private ready?: Promise<void>;
  private resolveReady?: () => void;
  private targets = new Map<string, Entry>();
  private keys = new WeakMap<RTarget, string>();
  private serial = 0;
  private events = new AbortController();
  constructor(private root: HTMLElement, private show: (target: RTarget, state: RResult) => void) {
    window.addEventListener("message", event => {
      if (event.source === this.frame?.contentWindow) {
        if (event.data?.type === "notdown-ojs-ready") this.resolveReady?.();
        if (event.data?.type !== "notdown-ojs-result") return;
        const entry = this.targets.get(event.data.key);
        if (!entry?.visible || !this.root.contains(entry.target.dom)) return;
        this.show(entry.target, { phase: event.data.error ? "error" : "done", element: entry.display,
          text: String(event.data.text || "").slice(0, 100_000), message: event.data.error ? String(event.data.error).slice(0, 100_000) : undefined });
        return;
      }
      for (const [key, entry] of this.targets) {
        if (!entry.visible || !entry.display || event.source !== entry.display.contentWindow) continue;
        if (event.data?.type === "notdown-ojs-output-ready") {
          const channel = new MessageChannel();
          this.frame?.contentWindow?.postMessage({ type: "notdown-ojs-connect", key }, "*", [channel.port1]);
          entry.display.contentWindow!.postMessage({ type: "notdown-ojs-output-connect" }, "*", [channel.port2]);
        }
        if (event.data?.type === "notdown-ojs-height" && Number.isFinite(event.data.height))
          entry.display.style.height = `${Math.max(36, Math.min(600, event.data.height))}px`;
      }
    }, { signal: this.events.signal });
  }
  async run(target: RTarget, _index: number) {
    if (!this.frame) this.create();
    const frame = this.frame;
    await this.ready;
    if (this.frame !== frame || !this.root.contains(target.dom)) return;
    const key = this.keys.get(target) ?? `cell:${++this.serial}`;
    this.keys.set(target, key);
    const entry: Entry = { target, visible: true };
    if (target.kind === "chunk") {
      const display = entry.display = document.createElement("iframe");
      display.title = "Observable JS chunk result"; display.className = "quarto-ojs-output";
      display.setAttribute("sandbox", "allow-scripts"); display.referrerPolicy = "no-referrer";
      display.srcdoc = frameSource(outputScript);
    }
    this.targets.set(key, entry);
    this.show(target, { phase: "done", element: entry.display, text: "" });
    const code = target.kind === "chunk" ? quartoCell(target.node().textContent, "ojs").code : target.node().textContent;
    frame!.contentWindow!.postMessage({ type: "notdown-ojs-run", key, code }, "*");
  }
  clear(target: RTarget) {
    for (const [key, entry] of this.targets) if (entry.target === target) {
      entry.visible = false;
      this.frame?.contentWindow?.postMessage({ type: "notdown-ojs-clear", key }, "*");
    }
  }
  sourceChanged() {
    const live = new Set(rTargets(this.root).filter(target => executionLanguage(target.node()) === "ojs"));
    for (const [key, entry] of this.targets) if (!live.has(entry.target)) {
      this.targets.delete(key);
      this.frame?.contentWindow?.postMessage({ type: "notdown-ojs-dispose", key }, "*");
    }
  }
  private create() {
    const frame = this.frame = document.createElement("iframe");
    frame.title = "Observable JS runtime"; frame.hidden = true; frame.setAttribute("aria-hidden", "true");
    frame.setAttribute("sandbox", "allow-scripts"); frame.referrerPolicy = "no-referrer";
    this.ready = new Promise(resolve => { this.resolveReady = resolve; });
    frame.srcdoc = frameSource(sandboxScript); this.root.append(frame);
  }
  reset() {
    this.resolveReady?.(); this.frame?.remove(); this.frame = undefined; this.ready = undefined;
    this.targets.clear(); this.keys = new WeakMap();
  }
  destroy() { this.reset(); this.events.abort(); }
}
