import { createElement, Link } from "lucide";
import { pageIconElement } from "../shared/page-icons";
import { safeReference } from "../document/notion-syntax";
import { pageInputChoices } from "./page-reference-input";
import type { LinkedPage } from "./editor-links";
import { placeDatePanel } from "../features/dates/date-view";
import "./link-picker.css";

/** Search text never silently becomes a relative URL. */
export function linkPickerAddress(value: string): string | null {
  const clean = safeReference(value);
  if (!clean || /\s/.test(clean)) return null;
  if (/^(?:#|\/|\.\.?\/)/.test(clean)) return clean;
  if (/^(?:https?:|mailto:|tel:)/i.test(clean)) {
    try { new URL(clean); return clean; } catch { return null; }
  }
  if (/^(?:[\p{L}\d-]+\.)+[\p{L}]{2,}(?::\d+)?(?:[/?#]|$)/u.test(clean)) return `https://${clean}`;
  return null;
}

export function showLinkPicker(options: {
  href: string;
  pages: () => LinkedPage[];
  recentPages?: () => string[];
  anchor: () => { left: number; top: number; bottom: number };
  apply: (href: string, label?: string) => string | undefined;
  cancel: () => void;
}): HTMLDialogElement {
  const dialog = document.createElement("dialog");
  dialog.className = "pm-link-picker";
  dialog.setAttribute("aria-label", "Link");
  dialog.setAttribute("aria-modal", "false");
  const controller = new AbortController(), { signal } = controller;
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Paste link or search pages";
  input.setAttribute("aria-label", "Link address");
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-expanded", "true");
  input.autocomplete = "off";
  input.spellcheck = false;
  input.value = options.href;
  const heading = document.createElement("div");
  heading.className = "pm-link-picker-heading";
  const list = document.createElement("div");
  list.className = "pm-link-picker-results";
  list.id = `link-options-${crypto.randomUUID()}`;
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", "Link destinations");
  input.setAttribute("aria-controls", list.id);
  const output = document.createElement("output");
  output.setAttribute("aria-live", "polite");
  dialog.append(input, heading, list, output);
  type Choice = { href: string; label: string; page?: LinkedPage };
  let choices: Choice[] = [], active = 0;
  const position = () => { if (dialog.open) placeDatePanel(dialog, options.anchor()); };
  const apply = (href: string, label?: string) => {
    const error = options.apply(href, label);
    if (error) { output.textContent = error; position(); return; }
    dialog.close();
  };
  const choose = (index: number) => {
    const choice = choices[index];
    if (!choice) return;
    if (choice.page && !pageInputChoices(options.pages(), "").some(page => page.id === choice.page!.id)) {
      output.textContent = "This page is no longer available. Search again.";
      return;
    }
    apply(choice.href, choice.page?.title);
  };
  const highlight = (scroll = false) => {
    [...list.children].forEach((child, index) => {
      child.setAttribute("aria-selected", String(index === active));
      if (scroll && index === active) child.scrollIntoView({ block: "nearest" });
    });
    const selected = list.children[active];
    if (selected?.getAttribute("role") === "option") input.setAttribute("aria-activedescendant", selected.id);
    else input.removeAttribute("aria-activedescendant");
  };
  const render = () => {
    const query = input.value.trim(), all = options.pages();
    let pages = pageInputChoices(all, query) as LinkedPage[];
    const visible = new Map((pageInputChoices(all, "") as LinkedPage[]).map(page => [page.id, page]));
    const recent = [...new Set(options.recentPages?.() ?? [])].flatMap(id => visible.get(id) ? [visible.get(id)!] : []);
    if (!query && recent.length) pages = recent;
    heading.textContent = query ? "Pages" : recent.length ? "Recents" : "Pages";
    const href = linkPickerAddress(query);
    choices = [...(href ? [{ href, label: query }] : []), ...pages.slice(0, 30).map(page => ({ href: `#page/${encodeURIComponent(page.id)}`, label: page.title || "Untitled", page }))];
    active = 0;
    list.replaceChildren();
    output.textContent = "";
    for (const [index, choice] of choices.entries()) {
      const button = document.createElement("button");
      button.type = "button";
      button.tabIndex = -1;
      button.id = `${list.id}-${index}`;
      button.setAttribute("role", "option");
      button.className = "pm-link-picker-option";
      const icon = choice.page ? pageIconElement(choice.page.icon) : createElement(Link, { width: 20, height: 20, "aria-hidden": "true" });
      const text = document.createElement("span"), title = document.createElement("span"), parent = document.createElement("small");
      text.className = "pm-link-picker-text";
      title.textContent = choice.page ? choice.label : "Link to web page";
      parent.textContent = choice.page ? all.find(page => page.id === choice.page!.parent)?.title || "Workspace" : choice.href;
      text.append(title, parent);
      button.append(icon, text);
      button.title = choice.page ? `${choice.label} · ${parent.textContent}` : choice.href;
      button.addEventListener("pointermove", () => { active = index; highlight(); });
      button.addEventListener("mousedown", event => event.preventDefault());
      button.addEventListener("click", () => choose(index));
      list.append(button);
    }
    if (!choices.length) {
      const empty = document.createElement("div");
      empty.className = "pm-link-picker-empty";
      empty.textContent = "No pages found";
      list.append(empty);
    }
    highlight(); position();
  };
  if (options.href) {
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "pm-link-picker-remove";
    remove.textContent = "Remove link";
    remove.addEventListener("click", () => apply(""));
    dialog.append(remove);
  }
  input.addEventListener("input", render);
  input.addEventListener("keydown", event => {
    if (event.isComposing) return;
    if (["ArrowDown", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      active = choices.length ? (active + (event.key === "ArrowDown" ? 1 : -1) + choices.length) % choices.length : 0;
      highlight(true);
    } else if (event.key === "Enter") { event.preventDefault(); choose(active); }
  });
  dialog.addEventListener("keydown", event => {
    if (event.key === "Escape" && !event.isComposing) {
      event.preventDefault(); event.stopPropagation(); dialog.close(); options.cancel();
    }
  });
  document.addEventListener("pointerdown", event => {
    if (!dialog.contains(event.target as Node)) dialog.close();
  }, { capture: true, signal });
  window.addEventListener("resize", position, { signal });
  document.addEventListener("scroll", event => { if (!dialog.contains(event.target as Node)) position(); }, { capture: true, signal });
  const observer = new MutationObserver(() => { if (!dialog.isConnected) { controller.abort(); observer.disconnect(); } });
  observer.observe(document.body, { childList: true });
  dialog.addEventListener("close", () => { controller.abort(); observer.disconnect(); dialog.remove(); });
  document.body.append(dialog);
  dialog.show();
  render();
  input.focus({ preventScroll: true });
  input.select();
  return dialog;
}
