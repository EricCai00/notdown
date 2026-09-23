import type { Node as PMNode } from "prosemirror-model";
import type { EditorView, NodeView } from "prosemirror-view";
import { closeHistory } from "prosemirror-history";
import { Bookmark, Pencil, RefreshCw, createElement } from "lucide";
import { bookmarkUrl, type BookmarkMetadata } from "./bookmark";
import { openBlockProperties } from "../../editor/block-properties";
import { api } from "../../shared/types";
import "./bookmark.css";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = "") {
  const element = document.createElement(tag);
  element.className = cls; element.textContent = text;
  return element;
}
const glyph = (shape: typeof Bookmark, size = 18) => createElement(shape, { width: size, height: size, "aria-hidden": "true" });

export class BookmarkView implements NodeView {
  readonly dom = el("section", "pm-content-object pm-object-web_bookmark");
  private dialog?: HTMLDivElement;
  private original?: PMNode;
  private controller?: AbortController;
  private serial = 0;
  private disposed = false;
  private loading = false;
  private message = "";
  constructor(private node: PMNode, private view: EditorView, private getPos: () => number | undefined) {
    this.dom.contentEditable = "false";
    this.dom.addEventListener("notdown-create-bookmark", this.createFromPaste);
    this.render();
  }
  private createFromPaste = () => { if (this.view.editable) void this.resolve(String(this.node.attrs.url)); };
  private action(label: string, shape: typeof Bookmark, callback: () => void) {
    const button = el("button", "pm-bookmark-action");
    button.type = "button"; button.title = label; button.setAttribute("aria-label", label);
    button.append(glyph(shape, 15)); button.onclick = callback;
    return button;
  }
  private render() {
    const a = this.node.attrs, url = bookmarkUrl(a.url);
    this.dom.replaceChildren();
    this.dom.setAttribute("aria-busy", String(this.loading));
    if (!url) {
      const button = el("button", "pm-bookmark-empty", "");
      button.type = "button"; button.disabled = !this.view.editable;
      button.append(glyph(Bookmark, 25), el("span", "", "Add a web bookmark"));
      button.onclick = () => this.open();
      this.dom.append(button);
      return;
    }
    const link = el("a", "pm-bookmark-card");
    link.href = url; link.target = "_blank"; link.rel = "noopener noreferrer";
    // The editor's text-link handler requires Ctrl; a bookmark is a direct link.
    link.onclick = event => event.stopPropagation();
    const body = el("div", "pm-bookmark-body");
    const identity = el("div", "pm-bookmark-icon");
    identity.append(glyph(Bookmark, 24));
    if (bookmarkUrl(a.icon)) {
      const img = el("img", ""); img.src = a.icon; img.alt = ""; img.referrerPolicy = "no-referrer";
      img.onload = () => identity.replaceChildren(img);
      img.onerror = () => img.remove();
    }
    body.append(identity, el("div", "pm-bookmark-title", a.title || new URL(url).hostname));
    if (a.description) body.append(el("div", "pm-bookmark-description", a.description));
    body.append(el("div", "pm-bookmark-url", a.url));
    link.append(body);
    if (bookmarkUrl(a.image)) {
      const image = el("img", "pm-bookmark-image");
      image.src = a.image; image.alt = ""; image.loading = "lazy"; image.referrerPolicy = "no-referrer";
      image.onerror = () => image.remove(); link.append(image);
    }
    this.dom.append(link);
    if (a.caption) this.dom.append(el("div", "pm-bookmark-caption", a.caption));
    if (this.view.editable) {
      const actions = el("div", "pm-bookmark-actions");
      const refresh = this.action("Refresh bookmark", RefreshCw, () => { void this.resolve(url); });
      refresh.disabled = this.loading;
      actions.append(refresh, this.action("Edit bookmark link", Pencil, () => this.open()));
      const properties = el("button", "pm-bookmark-action", "Properties");
      properties.type = "button";
      properties.onclick = () => { const pos = this.getPos(); if (pos !== undefined) openBlockProperties(this.view, pos); };
      actions.append(properties); this.dom.append(actions);
    }
    if (this.loading || this.message) {
      const status = el("output", "pm-bookmark-status", this.loading ? "Loading bookmark…" : this.message);
      status.setAttribute("aria-live", "polite"); this.dom.append(status);
    }
  }
  private position = () => {
    if (!this.dialog) return;
    const rect = this.dom.getBoundingClientRect(), width = this.dialog.offsetWidth, height = this.dialog.offsetHeight;
    this.dialog.style.left = Math.max(8, Math.min(rect.left + (rect.width - width) / 2, innerWidth - width - 8)) + "px";
    this.dialog.style.top = Math.max(8, Math.min(rect.bottom - 1, innerHeight - height - 8)) + "px";
  };
  private close = (focus = false) => {
    const dialog = this.dialog;
    this.dialog = undefined; this.original = undefined;
    this.controller?.abort(); this.serial++; this.loading = false;
    dialog?.remove();
    window.removeEventListener("resize", this.position);
    document.removeEventListener("scroll", this.position, true);
    if (!this.disposed) { this.render(); if (focus) this.view.focus(); }
  };
  private open() {
    if (!this.view.editable || this.dialog) return;
    const dialog = this.dialog = el("div", "pm-bookmark-popover");
    this.original = this.node;
    dialog.popover = "auto"; dialog.setAttribute("role", "dialog"); dialog.setAttribute("aria-label", "Web bookmark");
    const form = el("form", ""), input = el("input", ""), submit = el("button", "");
    input.type = "text"; input.inputMode = "url"; input.setAttribute("autocomplete", "url");
    input.placeholder = "Paste in https://…"; input.setAttribute("aria-label", "Bookmark URL");
    input.value = this.node.attrs.url; input.autofocus = true;
    submit.type = "submit"; submit.textContent = input.value ? "Update bookmark" : "Create bookmark";
    const output = el("output", "pm-bookmark-error"); output.setAttribute("aria-live", "polite");
    const update = () => { submit.disabled = !input.value.trim(); output.textContent = ""; input.removeAttribute("aria-invalid"); };
    input.oninput = update; update();
    form.append(input, submit, el("p", "", "Create a visual bookmark from a link."), output);
    form.onsubmit = event => {
      event.preventDefault();
      if (!bookmarkUrl(input.value)) { output.textContent = "Enter a valid http:// or https:// URL."; input.setAttribute("aria-invalid", "true"); input.focus(); return; }
      submit.disabled = true; input.disabled = true; submit.textContent = "Creating bookmark…";
      void this.resolve(input.value.trim(), output);
    };
    dialog.append(form); document.body.append(dialog);
    dialog.addEventListener("toggle", event => {
      if ((event as ToggleEvent).newState === "closed" && this.dialog === dialog) this.close();
    });
    dialog.addEventListener("keydown", event => {
      if (event.key === "Escape") { event.preventDefault(); this.close(true); }
    });
    dialog.showPopover(); this.position(); input.focus(); input.select();
    window.addEventListener("resize", this.position); document.addEventListener("scroll", this.position, true);
  }
  private async resolve(url: string, output?: HTMLOutputElement) {
    if (!this.view.editable || !bookmarkUrl(url)) return;
    const original = this.original || this.node, serial = ++this.serial;
    this.controller?.abort(); this.controller = new AbortController();
    this.loading = true; this.message = ""; this.render();
    let metadata: BookmarkMetadata | undefined;
    try {
      metadata = await api<BookmarkMetadata>("/bookmarks/resolve", { method: "POST", body: JSON.stringify({ url }), signal: this.controller.signal });
    } catch {
      if (this.disposed || serial !== this.serial) return;
      this.message = "Could not load webpage details. Link saved; you can retry or edit its properties.";
    }
    if (this.disposed || serial !== this.serial) return;
    this.loading = false;
    const pos = this.getPos();
    if (!this.view.editable || pos === undefined || !this.view.state.doc.nodeAt(pos)?.eq(original)) {
      if (output) output.textContent = "This bookmark changed. Close and reopen it to try again.";
      this.render(); return;
    }
    const changedUrl = bookmarkUrl(original.attrs.url) !== bookmarkUrl(url);
    const attrs = { ...original.attrs, ...(changedUrl ? { title: "", description: "", image: "", icon: "" } : {}), ...metadata, url };
    // Clear the draft before dispatch: the resulting NodeView update is our own commit.
    const returnFocus = !!this.dialog || document.activeElement === document.body;
    this.close();
    this.view.dispatch(closeHistory(this.view.state.tr).setNodeMarkup(pos, undefined, attrs));
    if (returnFocus) this.view.focus();
    this.render();
  }
  update(node: PMNode) {
    if (node.type !== this.node.type) return false;
    if (!node.eq(this.node)) {
      this.controller?.abort(); this.serial++; this.loading = false;
      if (this.dialog) this.close();
    }
    this.node = node; this.render(); return true;
  }
  stopEvent(event: Event) { return event.type !== "dragstart" && event.type !== "dragend"; }
  ignoreMutation() { return true; }
  destroy() { this.disposed = true; this.close(); this.dom.removeEventListener("notdown-create-bookmark", this.createFromPaste); }
}
