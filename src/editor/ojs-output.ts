// Display-only sandbox. The shared runtime retains the real DOM and its event handlers.
import DOMPurify from "dompurify";

let port: MessagePort | undefined;
const nodeKey = "data-notdown-ojs-node";
function patch(current: Node, next: Node) {
  if (current.nodeType !== next.nodeType || current.nodeName !== next.nodeName) { current.parentNode!.replaceChild(next.cloneNode(true), current); return; }
  if (current.nodeType === Node.TEXT_NODE) { if (current.nodeValue !== next.nodeValue) current.nodeValue = next.nodeValue; return; }
  if (!(current instanceof Element) || !(next instanceof Element)) return;
  for (const attribute of [...current.attributes]) if (!next.hasAttribute(attribute.name)) current.removeAttribute(attribute.name);
  for (const attribute of [...next.attributes]) if (current.getAttribute(attribute.name) !== attribute.value) current.setAttribute(attribute.name, attribute.value);
  const children = [...next.childNodes];
  children.forEach((child, index) => current.childNodes[index] ? patch(current.childNodes[index], child) : current.append(child.cloneNode(true)));
  while (current.childNodes.length > children.length) current.lastChild!.remove();
}
window.addEventListener("message", event => {
  if (event.source !== parent || event.data?.type !== "notdown-ojs-output-connect" || !event.ports[0]) return;
  port?.close(); port = event.ports[0];
  port.onmessage = event => {
    if (event.data?.type !== "render" || typeof event.data.html !== "string") return;
    const next = document.createElement("body");
    next.innerHTML = DOMPurify.sanitize(event.data.html, { ADD_TAGS: ["form"], FORBID_TAGS: ["script", "iframe", "object", "embed", "style"], FORBID_ATTR: ["autofocus", "action", "formaction"] });
    patch(document.body, next);
    for (const state of event.data.controls || []) {
      const element = document.querySelector(`[${nodeKey}="${CSS.escape(String(state.id))}"]`);
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
        if (!(element instanceof HTMLInputElement && element.type === "file") && element.value !== state.value) element.value = state.value;
        if (element instanceof HTMLInputElement) element.checked = state.checked;
      }
    }
  };
});
for (const type of ["input", "change", "click", "submit"] as const) document.addEventListener(type, event => {
  const element = event.target instanceof Element ? event.target.closest(`[${nodeKey}]`) : null;
  if (!element) return;
  if (type === "submit" || type === "click" && element.closest("a")) event.preventDefault();
  const control = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement ? element : undefined;
  port?.postMessage({ type: "event", event: type, id: element.getAttribute(nodeKey), value: control?.value,
    checked: element instanceof HTMLInputElement ? element.checked : undefined });
});
new ResizeObserver(() => parent.postMessage({ type: "notdown-ojs-height", height: Math.ceil(document.body.getBoundingClientRect().height) }, "*")).observe(document.body);
parent.postMessage({ type: "notdown-ojs-output-ready" }, "*");
