// This entry is bundled into an opaque-origin sandbox; never imported by the app.
import "./ojs-scheduler";
import { Runtime } from "@observablehq/runtime";
import { Library } from "@observablehq/stdlib";
import { Inspector } from "@observablehq/inspector";
import * as Inputs from "@observablehq/inputs";
import * as Plot from "@observablehq/plot";
import { Interpreter } from "@alex.garcia/unofficial-observablehq-compiler";

const library = Object.assign(new Library(), { Inputs: () => Inputs, Plot: () => Plot });
const runtime = new Runtime(library), main = runtime.module();
const interpreter = new Interpreter({ module: main, defineImportMarkdown: false });
type Cell = { variables: { delete(): void }[]; container: HTMLElement; observer?: MutationObserver; serial: number };
const cells = new Map<string, Cell>();
const ports = new Map<string, MessagePort>();
const nodeKey = "data-notdown-ojs-node";
function render(key: string) {
  const cell = cells.get(key), port = ports.get(key);
  if (!cell || !port) return;
  for (const element of cell.container.querySelectorAll("*"))
    if (!element.hasAttribute(nodeKey)) element.setAttribute(nodeKey, String(++cell.serial));
  const controls = [...cell.container.querySelectorAll("input,textarea,select")].map(element => ({
    id: element.getAttribute(nodeKey), value: (element as HTMLInputElement).value, checked: (element as HTMLInputElement).checked,
  }));
  const clone = cell.container.cloneNode(true) as HTMLElement;
  const originals = cell.container.querySelectorAll("canvas");
  clone.querySelectorAll("canvas").forEach((canvas, index) => {
    try { const image = document.createElement("img"); image.src = originals[index].toDataURL(); canvas.replaceWith(image); } catch { /* A tainted canvas cannot be transferred. */ }
  });
  if (clone.innerHTML.length <= 8 * 1024 * 1024) port.postMessage({ type: "render", html: clone.innerHTML, controls });
}
const send = (key: string, text: string, error?: string) => {
  parent.postMessage({ type: "notdown-ojs-result", key, text: text.slice(0, 100_000), error }, "*");
  render(key);
};
const summary = (container: HTMLElement) => Array.from(container.children).map(element => element.textContent?.trim()).filter(Boolean).join("\n");
window.addEventListener("message", async event => {
  if (event.source !== parent) return;
  if (event.data?.type === "notdown-ojs-connect" && event.ports[0]) {
    const key = event.data.key, port = event.ports[0];
    ports.get(key)?.close(); ports.set(key, port);
    port.onmessage = event => {
      const cell = cells.get(key), message = event.data;
      if (!cell || message?.type !== "event" || !["input", "change", "click", "submit"].includes(message.event)) return;
      const element = cell.container.querySelector(`[${nodeKey}="${CSS.escape(String(message.id))}"]`);
      if (!element) return;
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
        if (!(element instanceof HTMLInputElement && element.type === "file") && typeof message.value === "string") element.value = message.value;
        if (element instanceof HTMLInputElement && typeof message.checked === "boolean") element.checked = message.checked;
      }
      element.dispatchEvent(new Event(message.event, { bubbles: true, cancelable: true }));
      render(key);
    };
    render(key); return;
  }
  if (event.data?.type === "notdown-ojs-clear") { ports.get(event.data.key)?.close(); ports.delete(event.data.key); return; }
  if (event.data?.type === "notdown-ojs-dispose") {
    const cell = cells.get(event.data.key);
    cells.delete(event.data.key); cell?.observer?.disconnect(); cell?.variables.forEach(variable => variable.delete()); cell?.container.remove();
    ports.get(event.data.key)?.close(); ports.delete(event.data.key); return;
  }
  if (event.data?.type !== "notdown-ojs-run") return;
  const { key, code } = event.data;
  if (typeof code !== "string" || code.length > 128_000 || typeof key !== "string") return;
  const old = cells.get(key);
  old?.observer?.disconnect(); old?.variables.forEach(variable => variable.delete()); old?.container.remove();
  const container = document.createElement("section"); document.body.append(container);
  const current: Cell = { variables: [], container, serial: 0 }; cells.set(key, current);
  current.observer = new MutationObserver(() => { if (cells.get(key) === current) render(key); });
  current.observer.observe(container, { childList: true, subtree: true, characterData: true, attributes: true });
  try {
    const variables = await interpreter.module(code, main, () => {
      const element = document.createElement("div"); container.append(element);
      const inspector = new Inspector(element);
      return {
        pending: () => inspector.pending(),
        fulfilled: (value: unknown, name: string) => {
          if (cells.get(key) !== current) return;
          inspector.fulfilled(value, name);
          send(key, summary(container) || "Output");
        },
        rejected: (error: unknown) => {
          if (cells.get(key) !== current) return;
          inspector.rejected(error); send(key, "", String(error));
        },
      };
    });
    current.variables = variables.flat();
    if (cells.get(key) !== current) { current.variables.forEach(variable => variable.delete()); return; }
    send(key, summary(container) || "Observable cells defined");
  } catch (error) {
    if (cells.get(key) !== current) return;
    const pre = document.createElement("pre"); pre.textContent = String(error); container.append(pre); send(key, "", String(error));
  }
});
parent.postMessage({ type: "notdown-ojs-ready" }, "*");
