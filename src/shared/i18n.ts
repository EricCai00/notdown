import { zhCN } from "./locales/zh-CN";

export type UILanguage = "en" | "zh-CN";
export const languageKey = "notdown-ui-language";
export const languageChanged = "notdown-language-changed";

export function resolveLanguage(saved: string | null): UILanguage {
  if (saved === "en" || saved === "zh-CN") return saved;
  return "en";
}

function readLanguage(): UILanguage {
  try { return resolveLanguage(localStorage.getItem(languageKey)); }
  catch { return resolveLanguage(null); }
}
let language = readLanguage();
let preferenceVersion = 0;
let ready = Promise.resolve();
export const languageReady = () => ready;
export const uiLanguage = () => language;
const rendered = new WeakMap<Element, Map<string, { key: string; value: string }>>();
function remember(element: Element, name: string, key: string, value: string) {
  if (!rendered.has(element)) rendered.set(element, new Map());
  rendered.get(element)!.set(name, { key, value });
}

/** Only application-owned messages belong here; never pass document content. */
export function t(message: string, values: Record<string, string | number> = {}): string {
  const translated = language === "zh-CN" && Object.hasOwn(zhCN, message) ? zhCN[message] : message;
  return translated.replace(/\{(\w+)\}/g, (match, key: string) => String(values[key] ?? match));
}

export function setUILanguage(value: UILanguage) {
  preferenceVersion++;
  language = value;
  try { localStorage.setItem(languageKey, value); } catch { /* Still usable for this session. */ }
  refreshLanguage();
  if (typeof window !== "undefined") void window.notdownDesktop?.uiLanguage?.set(value).catch(error => console.error("Interface language could not be saved", error));
}

export function setUIText(element: Element, message: string) {
  const value = t(message);
  element.setAttribute("data-i18n", message);
  element.textContent = value;
  remember(element, "text", message, value);
  return value;
}

export function setUIAttribute(element: Element, attribute: string, message: string) {
  element.setAttribute(`data-i18n-${attribute}`, message);
  element.setAttribute(attribute, t(message));
  remember(element, attribute, message, t(message));
}

const attributes = ["title", "aria-label", "placeholder", "aria-description"] as const;
const selector = ["[data-i18n]", ...attributes.map(name => `[data-i18n-${name}]`)].join(",");
function translateElement(element: Element) {
  if (element.closest(".ProseMirror, .cm-editor, textarea, [data-user-content]")) return;
  const message = element.getAttribute("data-i18n");
  if (message !== null) {
    // Keep controls subsequently appended to a label or button mounted.
    const nodes = Array.from(element.childNodes).filter((node): node is Text => node.nodeType === 3);
    const current = nodes.map(node => node.data).join("");
    const previous = rendered.get(element)?.get("text");
    if (previous?.key === message && current !== previous.value) element.removeAttribute("data-i18n");
    else {
      const value = t(message);
      if (current !== value) {
        if (nodes.length) { nodes[0].data = value; nodes.slice(1).forEach(node => node.remove()); }
        else element.prepend(document.createTextNode(value));
      }
      remember(element, "text", message, value);
    }
  }
  for (const name of attributes) {
    const key = element.getAttribute(`data-i18n-${name}`);
    if (key === null) continue;
    const previous = rendered.get(element)?.get(name);
    if (previous?.key === key && element.getAttribute(name) !== previous.value) element.removeAttribute(`data-i18n-${name}`);
    else {
      if (element.getAttribute(name) !== t(key)) element.setAttribute(name, t(key));
      remember(element, name, key, t(key));
    }
  }
}
function translateBindings(root: Element | Document) {
  if (root instanceof Element && root.matches(selector)) translateElement(root);
  root.querySelectorAll(selector).forEach(translateElement);
}
function refreshLanguage() {
  if (typeof document === "undefined") return;
  document.documentElement.lang = language;
  translateBindings(document);
  window.dispatchEvent(new Event(languageChanged));
}

/** Observe opt-in UI bindings only. Editor text, titles and form values are never scanned. */
export function installUILanguage() {
  refreshLanguage();
  const observer = new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes) if (node instanceof Element) translateBindings(node);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  const desktop = window.notdownDesktop?.uiLanguage;
  const version = preferenceVersion;
  const receive = (value: UILanguage) => {
    preferenceVersion++; language = value;
    try { localStorage.setItem(languageKey, value); } catch { /* Session preference remains available. */ }
    refreshLanguage();
  };
  const unsubscribe = desktop?.onChanged(receive);
  ready = desktop ? desktop.get().then(value => {
    if (value && preferenceVersion === version) receive(value);
  }).catch(error => console.error("Interface language could not be loaded", error)) : Promise.resolve();
  window.addEventListener("storage", event => {
    if (event.key !== languageKey && event.key !== null) return;
    language = readLanguage(); refreshLanguage();
  });
  return () => { observer.disconnect(); unsubscribe?.(); };
}
