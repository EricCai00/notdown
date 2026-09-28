import { createEditorNode, isEditorKind } from "../document/node-identity";
import { editorSchema } from "../document/editor-schema";
import type { Node as PMNode } from "prosemirror-model";
import type { EditorView, NodeView } from "prosemirror-view";
import { closeHistory } from "prosemirror-history";
import { Globe, CodeXml, File as FileIcon, ChevronRight, createElement, Ellipsis, Maximize2, ArrowUpRight, RefreshCw, Download, Captions, Hand, X, AlignLeft, AlignCenter, AlignRight, Copy, Trash2, Link2, type IconNode } from "lucide";
import { NodeSelection } from "prosemirror-state";
import { deleteEditorBlock, duplicateEditorBlock } from "../editor/editor-blocks";
import { referenceLocations } from "../document/reference-locations";
import { routeHash } from "../features/pages/page-navigation";
import type { BreadcrumbPage } from "./breadcrumb-view";
import { bookmarkUrl } from "../features/bookmarks/bookmark";
import { attributesXml, colorStyle } from "../document/notion-syntax";
import { api } from "../shared/types";
import { embedSource, isHtmlAsset } from "../document/embed-source";
import "./embed.css";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = "") {
  const element = document.createElement(tag);
  element.className = cls; element.textContent = text;
  return element;
}

/** Drafts belong to this node view, and only a submitted draft enters the document. */
export class EmbedView implements NodeView {
  readonly dom = el("section", "pm-embed");
  private dialog?: HTMLDivElement;
  private submenu?: HTMLDivElement;
  private submenuTrigger?: HTMLButtonElement;
  private original?: PMNode;
  private disposed = false;
  private serial = 0;
  private local = false;
  private captionVisible = false;
  private interactive = false;
  private fullscreen?: HTMLDialogElement;
  private cancelResize?: () => void;
  private abort = new AbortController();
  private status = el("output", "pm-embed-status");
  private get attachment() { return isEditorKind(this.node, "notion_embed"); }
  private get html() { return this.attachment || isHtmlAsset(this.value); }
  private get custom() { return isEditorKind(this.node, "web_embed"); }
  private get layout() { return this.custom || this.attachment && this.supplemental(); }
  private get resizable() { return this.layout || isEditorKind(this.node, "syntax_block"); }
  private get captionable() { return this.custom || this.attachment; }
  private get properties() { return isEditorKind(this.node, "syntax_block") ? this.node.attrs.data : this.attachment ? this.supplemental() ? this.node.attrs.nfmAttrs : {} : this.node.attrs; }
  private get filename() {
    let name = String(this.properties.title || this.value.split("/").pop()?.split(/[?#]/)[0] || "HTML document");
    try { name = decodeURIComponent(name); } catch { /* Preserve malformed remote names. */ }
    return name;
  }
  private get value(): string { return String(this.attachment ? this.node.attrs.src : isEditorKind(this.node, "syntax_block") ? this.node.attrs.data.src || "" : this.node.attrs.url); }
  constructor(private node: PMNode, private view: EditorView, private getPos: () => number | undefined, private currentPage?: () => BreadcrumbPage | undefined, private supplemental: () => boolean = () => false) {
    this.dom.contentEditable = "false";
    this.dom.tabIndex = 0;
    this.status.setAttribute("aria-live", "polite");
    document.addEventListener("pointerdown", event => { if (!this.dom.contains(event.target as Node) && !this.dialog?.contains(event.target as Node)) this.setInteractive(false); }, { signal: this.abort.signal });
    this.dom.addEventListener("notdown-embed-menu", () => this.menu(), { signal: this.abort.signal });
    this.dom.addEventListener("keydown", event => {
      if ((event.target as HTMLElement).matches("input,textarea,button,a")) return;
      if (event.key === " ") { event.preventDefault(); this.showFullscreen(); }
      if (event.key === "Escape") { event.preventDefault(); this.setInteractive(false); }
      if (event.key.toLowerCase() === "m" && event.ctrlKey && event.altKey && this.captionable && view.editable) { event.preventDefault(); this.showCaption(); }
    });
    this.dom.addEventListener("contextmenu", event => { event.preventDefault(); this.menu(); });
    this.render();
  }
  private button(label: string, glyph: IconNode, action: () => void) {
    const button = el("button"); button.type = "button"; button.title = label; button.setAttribute("aria-label", label);
    button.append(createElement(glyph, { width: 18, height: 18, "stroke-width": 1.7, "aria-hidden": "true" }));
    button.onclick = action; return button;
  }
  private setInteractive(value: boolean) {
    this.interactive = value;
    this.dom.classList.toggle("is-interactive", value);
    const frame = this.dom.querySelector("iframe"); if (frame) frame.tabIndex = this.html && !value ? -1 : 0;
  }
  private availableWidth() {
    const parent = this.dom.parentElement!, style = getComputedStyle(parent);
    return parent.clientWidth - parseFloat(style.paddingLeft || "0") - parseFloat(style.paddingRight || "0");
  }
  private set(values: Record<string, string>, rerender = true) {
    const pos = this.getPos();
    if (!this.view.editable || pos === undefined || !this.view.state.doc.nodeAt(pos)?.eq(this.node)) return;
    const attrs = { ...this.node.attrs };
    if (isEditorKind(this.node, "syntax_block")) {
      attrs.data = { ...attrs.data, ...values }; attrs.raw = `<iframe${attributesXml(attrs.data)}></iframe>`;
      attrs.source = null; attrs.sourceFingerprint = null;
    } else if (this.attachment) {
      attrs.nfmAttrs = { ...attrs.nfmAttrs };
      for (const [key, value] of Object.entries(values)) {
        if (["src", "caption"].includes(key)) attrs[key] = value;
        else if (this.supplemental()) attrs.nfmAttrs[key] = value;
      }
    } else Object.assign(attrs, values);
    this.local = !rerender;
    try { this.view.dispatch((rerender ? closeHistory(this.view.state.tr) : this.view.state.tr).setNodeMarkup(pos, undefined, attrs)); }
    finally { this.local = false; }
  }
  private render() {
    this.dom.classList.add("pm-embed");
    this.dom.classList.toggle("pm-web-embed", !this.html);
    this.dom.classList.toggle("pm-html-embed", this.html);
    this.dom.style.cssText = colorStyle(this.node.attrs.color || "");
    this.dom.dataset.align = this.layout && ["left", "center", "right"].includes(this.properties.align) ? this.properties.align : "center";
    const width = String(this.properties.width || "");
    if (/^\d{1,4}(?:%)?$/.test(width)) this.dom.style.width = width.endsWith("%") ? `${Math.max(20, Math.min(100, Number(width.slice(0, -1))))}%` : `${Math.max(160, Number(width))}px`;
    if (isEditorKind(this.node, "syntax_block")) this.dom.dataset.syntaxKind = "embed";
    this.dom.replaceChildren();
    if (!this.value.trim()) {
      const button = el("button", "pm-embed-empty"); button.type = "button"; button.disabled = !this.view.editable;
      button.append(createElement(this.html ? CodeXml : Globe, { width: 22, height: 22, "aria-hidden": "true" }), el("span", "", this.html ? "Upload an HTML file" : "Embed a webpage"));
      button.onclick = () => this.open(); this.dom.append(button); return;
    }
    const toolbar = el("div", "pm-embed-toolbar"); toolbar.setAttribute("role", "toolbar"); toolbar.setAttribute("aria-label", "Embed actions");
    if (!this.html && this.view.editable) {
      if (this.layout) toolbar.append(this.button("Align", AlignCenter, () => this.menu("align")));
      if (this.captionable) toolbar.append(this.button("Caption", Captions, () => this.showCaption()));
    }
    toolbar.append(this.html ? this.button("Full screen", Maximize2, () => this.showFullscreen()) : this.button("Open in browser", ArrowUpRight, () => this.openOriginal()));
    const more = this.button("Embed options", Ellipsis, () => this.menu()); more.setAttribute("aria-haspopup", "menu"); toolbar.append(more);
    if (this.html) {
      const header = el("div", "pm-embed-file-header");
      header.append(el("span", "pm-embed-filename", this.filename), toolbar); this.dom.append(header);
    } else this.dom.append(toolbar);
    if (isHtmlAsset(this.value) || bookmarkUrl(this.value)) {
      const preview = el("div", "pm-embed-preview");
      const frame = el("iframe", "pm-web-embed-frame");
      frame.title = this.properties.title || (this.html ? "HTML embed" : "Web embed");
      frame.setAttribute("sandbox", isHtmlAsset(this.value) || this.attachment ? "" : "allow-scripts allow-forms allow-presentation");
      frame.referrerPolicy = "no-referrer";
      frame.src = embedSource(this.value);
      const height = String(this.properties.height || "");
      preview.style.height = (/^\d{1,4}$/.test(height) ? Math.max(120, Math.min(2000, Number(height))) : 360) + "px";
      preview.append(frame);
      if (this.html) {
        const shield = el("div", "pm-embed-shield");
        const interact = this.button("Interact", Hand, () => { this.setInteractive(true); frame.focus(); }); interact.append(el("span", "", "Interact")); shield.append(interact); preview.append(shield);
      }
      if (this.view.editable && this.resizable) for (const side of this.html ? ["bottom", "bottom-left", "bottom-right"] : ["left", "right", "bottom", "bottom-left", "bottom-right"]) {
        const handle = el("button", "pm-embed-resize"); handle.type = "button"; handle.dataset.side = side;
        handle.setAttribute("aria-label", `Resize embed ${side}`); handle.title = "Drag to resize; use arrow keys for fine adjustments";
        handle.onpointerdown = event => this.resize(event, side, preview);
        handle.onkeydown = event => {
          if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
          event.preventDefault(); event.stopPropagation();
          const vertical = event.key === "ArrowUp" || event.key === "ArrowDown", step = event.shiftKey ? 40 : 10;
          const rect = this.dom.getBoundingClientRect(), parent = this.availableWidth();
          this.set(vertical ? { height: String(Math.max(120, Math.min(2000, preview.offsetHeight + (event.key === "ArrowDown" ? step : -step)))) } : { width: String(Math.round(Math.max(Math.min(100, 160 / parent * 100), Math.min(100, (rect.width + (event.key === "ArrowRight" ? step : -step)) / parent * 100)))) + "%" });
          this.dom.querySelector<HTMLButtonElement>(`[data-side="${side}"]`)?.focus();
        };
        preview.append(handle);
      }
      this.dom.append(preview);
    } else this.dom.append(el("p", "pm-embed-note", "Enter a valid http:// or https:// URL to preview this page."));
    if (this.captionable && (this.captionVisible || this.node.attrs.caption)) {
      const caption = el("textarea", "pm-embed-caption"); caption.rows = 1; caption.placeholder = "Write a caption…"; caption.setAttribute("aria-label", "Embed caption"); caption.value = this.node.attrs.caption || ""; caption.readOnly = !this.view.editable;
      const fit = () => { caption.style.height = "auto"; caption.style.height = Math.max(28, caption.scrollHeight) + "px"; };
      caption.oninput = () => { this.set({ caption: caption.value }, false); fit(); };
      caption.onkeydown = event => { if (event.key === "Escape" || event.key === "Enter" && !event.shiftKey && !event.isComposing) { event.preventDefault(); this.dom.focus(); } };
      this.dom.append(caption); queueMicrotask(() => { if (caption.isConnected) fit(); });
    }
    this.dom.append(this.status); this.setInteractive(this.interactive);
  }
  private showCaption() { this.captionVisible = true; if (!this.dom.querySelector(".pm-embed-caption")) this.render(); this.dom.querySelector<HTMLTextAreaElement>(".pm-embed-caption")?.focus(); }
  private openOriginal() { const url = embedSource(this.value); if (url) window.open(url, "_blank", "noopener,noreferrer"); }
  private showFullscreen() {
    const source = this.dom.querySelector("iframe"); if (!source || this.fullscreen) return;
    this.close();
    const dialog = this.fullscreen = el("dialog", "pm-embed-fullscreen"); dialog.setAttribute("aria-label", "Embed full screen");
    const close = () => { dialog.remove(); this.fullscreen = undefined; if (!this.disposed) this.dom.focus(); };
    const header = el("div", "pm-embed-fullscreen-header"); header.append(el("span", "", source.title), this.button("Close full screen", X, close));
    const frame = source.cloneNode() as HTMLIFrameElement; frame.tabIndex = 0;
    dialog.append(header, frame); dialog.addEventListener("cancel", event => { event.preventDefault(); close(); });
    document.body.append(dialog); dialog.showModal();
  }
  private resize(event: PointerEvent, side: string, preview: HTMLElement) {
    if (event.button !== 0) return;
    event.preventDefault(); event.stopPropagation(); this.cancelResize?.();
    const original = this.node, handle = event.currentTarget as HTMLElement;
    const width = this.dom.offsetWidth, height = preview.offsetHeight, parent = this.availableWidth();
    const x = event.clientX, y = event.clientY, horizontal = side !== "bottom", vertical = side.startsWith("bottom");
    let nextWidth = width, nextHeight = height;
    const abort = new AbortController(); handle.setPointerCapture(event.pointerId); this.dom.classList.add("is-resizing");
    const cleanup = () => { abort.abort(); this.dom.classList.remove("is-resizing"); if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId); this.cancelResize = undefined; };
    this.cancelResize = () => { cleanup(); this.render(); };
    handle.addEventListener("pointermove", e => {
      const delta = (e.clientX - x) * (side.includes("left") ? -1 : 1) * (this.dom.dataset.align === "center" ? 2 : 1);
      nextWidth = Math.max(Math.min(160, parent), Math.min(parent, width + delta)); nextHeight = Math.max(120, Math.min(2000, height + e.clientY - y));
      if (horizontal) this.dom.style.width = `${nextWidth}px`; if (vertical) preview.style.height = `${nextHeight}px`;
    }, { signal: abort.signal });
    handle.addEventListener("pointerup", () => {
      cleanup();
      if (!this.node.eq(original)) { this.render(); return; }
      const values: Record<string, string> = {};
      if (horizontal) values.width = Math.round(nextWidth / parent * 100) + "%";
      if (vertical) values.height = String(Math.round(nextHeight));
      this.set(values); this.dom.focus();
    }, { signal: abort.signal });
    handle.addEventListener("pointercancel", () => this.cancelResize?.(), { signal: abort.signal });
    handle.addEventListener("lostpointercapture", () => this.cancelResize?.(), { signal: abort.signal });
    document.addEventListener("keydown", e => { if (e.key === "Escape") { e.preventDefault(); this.cancelResize?.(); } }, { signal: abort.signal });
  }
  private async copy(value: string) {
    try { await navigator.clipboard.writeText(value); this.status.textContent = "Copied"; }
    catch { this.status.textContent = "Could not copy to clipboard."; }
  }
  private closeSubmenu() { this.submenu?.remove(); this.submenu = undefined; this.submenuTrigger?.setAttribute("aria-expanded", "false"); this.submenuTrigger = undefined; }
  private menu(section?: "align") {
    this.close(); this.setInteractive(false);
    const pos = this.getPos(); if (pos === undefined) return;
    if (this.view.editable) this.view.dispatch(this.view.state.tr.setSelection(NodeSelection.create(this.view.state.doc, pos)));
    const dialog = this.dialog = el("div", "pm-embed-popover pm-embed-menu"); dialog.popover = "auto";
    dialog.setAttribute("role", "menu"); dialog.setAttribute("aria-label", section === "align" ? "Align embed" : "Embed options"); this.dom.classList.add("menu-open");
    const search = el("input"); search.placeholder = "Search actions…"; search.setAttribute("aria-label", "Search embed actions");
    dialog.append(search, el("div", "pm-embed-menu-label", section === "align" ? "Align" : this.html ? "HTML embed" : "Web embed"));
    const add = (label: string, glyph: IconNode, action: () => void, hint = "", parent: HTMLElement = dialog) => {
      const button = this.button(label, glyph, () => { this.close(); action(); }); button.setAttribute("role", "menuitem");
      button.append(el("span", "", label)); if (hint) button.append(el("kbd", "", hint)); parent.append(button); return button;
    };
    const branch = (label: string, glyph: IconNode, fill: (parent: HTMLElement) => void) => {
      const trigger = this.button(label, glyph, () => {}); trigger.setAttribute("role", "menuitem"); trigger.setAttribute("aria-haspopup", "menu"); trigger.setAttribute("aria-expanded", "false");
      trigger.append(el("span", "", label), createElement(ChevronRight, { width: 16, height: 16, "aria-hidden": "true" }));
      const show = () => {
        if (this.submenuTrigger === trigger) return;
        this.closeSubmenu();
        // The parent owns dismissal. An auto child would light-dismiss itself
        // when its already-hovered trigger is clicked, racing the click handler.
        const child = this.submenu = el("div", "pm-embed-popover pm-embed-menu pm-embed-submenu"); child.popover = "manual"; child.setAttribute("role", "menu"); child.setAttribute("aria-label", label);
        this.submenuTrigger = trigger; fill(child); dialog.append(child); child.showPopover(); trigger.setAttribute("aria-expanded", "true"); this.position();
        child.addEventListener("keydown", event => {
          if (["Escape", "ArrowLeft"].includes(event.key)) { event.preventDefault(); event.stopPropagation(); this.closeSubmenu(); trigger.focus(); }
        });
        child.addEventListener("toggle", event => { if ((event as ToggleEvent).newState === "closed" && this.submenu === child) this.closeSubmenu(); });
      };
      trigger.onclick = () => { show(); this.submenu?.querySelector<HTMLButtonElement>("button")?.focus(); }; trigger.onpointerenter = show;
      trigger.onkeydown = event => { if (event.key === "ArrowRight") { event.preventDefault(); show(); this.submenu?.querySelector<HTMLButtonElement>("button")?.focus(); } };
      dialog.append(trigger);
    };
    const alignment = (parent: HTMLElement) => {
      for (const [value, glyph] of [["left", AlignLeft], ["center", AlignCenter], ["right", AlignRight]] as const) {
        const button = add(`Align ${value}`, glyph, () => this.set({ align: value }), "", parent);
        button.setAttribute("role", "menuitemradio"); button.setAttribute("aria-checked", String(this.dom.dataset.align === value));
      }
    };
    if (section === "align") alignment(dialog);
    else {
    if (this.html && this.view.editable) branch("Turn into", RefreshCw, parent => {
      add("File", FileIcon, () => {
        const at = this.getPos(); if (at === undefined || !this.view.state.doc.nodeAt(at)?.eq(this.node)) return;
        const file = createEditorNode(editorSchema, "media_block", { type: "file", src: this.value, caption: this.node.attrs.caption || this.filename, nfmAttrs: { ...this.node.attrs.nfmAttrs } });
        this.view.dispatch(closeHistory(this.view.state.tr).replaceWith(at, at + this.node.nodeSize, file)); this.view.focus();
      }, "", parent);
    });
    if (this.view.editable) add("Replace", RefreshCw, () => this.open());
    if (this.html && embedSource(this.value)) add("Download", Download, () => {
      const link = el("a"); link.href = embedSource(this.value); link.download = this.filename;
      link.target = "_blank"; link.rel = "noopener noreferrer"; link.click();
    });
    if (this.captionable && this.view.editable) add("Caption", Captions, () => this.showCaption(), "Ctrl+Alt+M");
    if (this.html) {
      if (this.layout && this.view.editable) branch("Align", AlignCenter, alignment);
      branch("More options", Ellipsis, parent => {
        add("Full screen", Maximize2, () => this.showFullscreen(), "Space", parent); add("Open in browser", ArrowUpRight, () => this.openOriginal(), "", parent);
      });
    } else {
      add("Full screen", Maximize2, () => this.showFullscreen(), "Space"); add("Open in browser", ArrowUpRight, () => this.openOriginal());
    }
    dialog.append(el("hr"));
    if (!this.html && embedSource(this.value)) add("Copy link to original", Link2, () => { void this.copy(this.value); });
    const page = this.currentPage?.(), reference = referenceLocations(this.view.state.doc).find(ref => ref.pos === pos);
    if (page && reference) add("Copy link to block", Link2, () => { void this.copy(`${location.origin}${location.pathname}${routeHash({ kind: "page", id: page.id, fragment: reference.fragment })}`); });
    if (this.view.editable) {
      add("Duplicate", Copy, () => { const at = this.getPos(); if (at !== undefined) { const tr = duplicateEditorBlock(this.view.state, at); if (tr) this.view.dispatch(closeHistory(tr)); } this.view.focus(); });
      add("Delete", Trash2, () => { const at = this.getPos(); if (at !== undefined) { const tr = deleteEditorBlock(this.view.state, at); if (tr) this.view.dispatch(closeHistory(tr)); } this.view.focus(); });
    }
    }
    search.oninput = () => { this.closeSubmenu(); for (const item of dialog.querySelectorAll<HTMLElement>(':scope > button')) item.hidden = !item.textContent!.toLowerCase().includes(search.value.toLowerCase()); this.position(); };
    dialog.addEventListener("keydown", event => {
      if (event.key === "Escape") { event.preventDefault(); this.close(); this.dom.querySelector<HTMLButtonElement>('[aria-label="Embed options"]')?.focus(); }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault(); const owner = (event.target as HTMLElement).closest('[role="menu"]') || dialog;
        const items = [...owner.querySelectorAll<HTMLButtonElement>(':scope > button:not([hidden])')];
        const index = items.indexOf(document.activeElement as HTMLButtonElement); items[(index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
      }
    });
    document.body.append(dialog); dialog.addEventListener("toggle", event => { if ((event as ToggleEvent).newState === "closed" && this.dialog === dialog) this.close(); });
    dialog.showPopover(); this.position(); search.focus(); window.addEventListener("resize", this.position); document.addEventListener("scroll", this.position, true);
  }
  private position = () => {
    if (!this.dialog) return;
    const rect = this.dom.getBoundingClientRect();
    const menu = this.dialog.classList.contains("pm-embed-menu");
    this.dialog.style.left = Math.max(8, Math.min(menu ? rect.right - 20 : rect.left + (rect.width - this.dialog.offsetWidth) / 2, innerWidth - this.dialog.offsetWidth - 8)) + "px";
    this.dialog.style.top = Math.max(8, Math.min(menu ? rect.top + 28 : rect.bottom, innerHeight - this.dialog.offsetHeight - 8)) + "px";
    if (this.submenu && this.submenuTrigger) {
      const anchor = this.submenuTrigger.getBoundingClientRect(), parent = this.dialog.getBoundingClientRect(), child = this.submenu;
      child.style.left = Math.max(8, Math.min(parent.right + child.offsetWidth + 8 < innerWidth ? parent.right + 4 : parent.left - child.offsetWidth - 4, innerWidth - child.offsetWidth - 8)) + "px";
      child.style.top = Math.max(8, Math.min(anchor.top, innerHeight - child.offsetHeight - 8)) + "px";
    }
  };
  private close = (focus = false) => {
    this.closeSubmenu();
    const dialog = this.dialog; this.dialog = undefined; this.original = undefined; this.serial++;
    this.dom.classList.remove("menu-open");
    dialog?.remove(); window.removeEventListener("resize", this.position); document.removeEventListener("scroll", this.position, true);
    if (focus && !this.disposed) this.view.focus();
  };
  private open() {
    if (!this.view.editable || this.dialog) return;
    this.original = this.node;
    const dialog = this.dialog = el("div", "pm-embed-popover");
    const html = this.html;
    dialog.popover = "auto"; dialog.setAttribute("role", "dialog"); dialog.setAttribute("aria-label", html ? "HTML embed" : "Web embed");
    dialog.append(el("div", "pm-embed-header", html ? "HTML embed" : "Web embed"));
    const form = el("form"), input = el("input"), output = el("output", "pm-embed-error");
    input.value = html ? "" : this.value; input.spellcheck = false; input.inputMode = "url";
    input.setAttribute("aria-label", "Embed URL"); input.placeholder = "Paste in https://…";
    const submit = el("button", "pm-embed-submit", "Embed link"); submit.type = "submit";
    output.setAttribute("aria-live", "polite");
    let selected: File | undefined, uploading = false;
    const update = () => {
      submit.disabled = uploading || (html ? !selected : !input.value.trim());
      submit.textContent = uploading ? "Uploading…" : html ? "Embed file" : "Embed link";
      output.textContent = ""; input.removeAttribute("aria-invalid");
    };
    const upload = el("input"); upload.type = "file"; upload.accept = ".html,.htm,text/html"; upload.hidden = true; upload.setAttribute("aria-label", "HTML file");
    const drop = el("button", "pm-embed-upload"); drop.type = "button";
    const filename = el("small", "", "Or drag and drop here");
    drop.append(el("span", "", "</>  Upload HTML file"), filename); drop.onclick = () => upload.click();
    const choose = (file?: File) => {
      if (!file || uploading) return;
      if (!/\.html?$/i.test(file.name) && file.type !== "text/html") { output.textContent = "Choose an HTML (.html or .htm) file."; return; }
      if (file.size > 20 * 1024 * 1024) { output.textContent = "Attachment exceeds 20 MB."; return; }
      selected = file; this.serial++; input.value = ""; filename.textContent = file.name; update();
    };
    upload.onchange = () => { choose(upload.files?.[0]); upload.value = ""; };
    drop.ondragover = event => { event.preventDefault(); drop.classList.add("dragover"); };
    drop.ondragleave = () => drop.classList.remove("dragover");
    drop.ondrop = event => { event.preventDefault(); event.stopPropagation(); drop.classList.remove("dragover"); choose(event.dataTransfer?.files[0]); };
    input.oninput = () => { selected = undefined; this.serial++; filename.textContent = "Or drag and drop here"; update(); }; update();
    if (html) form.append(drop, upload);
    else form.append(input);
    form.append(submit, el("p", "pm-embed-note", html ? "HTML files are saved in assets; scripts are disabled." : "Some websites do not allow embedding."), output);
    form.onsubmit = async event => {
      event.preventDefault(); if (uploading || (!selected && !input.value.trim())) return;
      if (!selected && !bookmarkUrl(input.value)) { output.textContent = "Enter a valid http:// or https:// URL."; input.setAttribute("aria-invalid", "true"); input.focus(); return; }
      const current = () => {
        const pos = this.getPos();
        return !this.disposed && this.dialog === dialog && this.view.editable && pos !== undefined && this.original && this.view.state.doc.nodeAt(pos)?.eq(this.original) ? pos : undefined;
      };
      if (current() === undefined) { output.textContent = "This block changed. Close and reopen it to edit."; return; }
      let value = input.value.trim();
      const serial = ++this.serial;
      try {
        if (selected) {
          const file = selected; uploading = true; input.disabled = drop.disabled = upload.disabled = true; update();
          const data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader(); reader.onerror = () => reject(new Error("Could not read this file."));
            reader.onload = () => resolve(String(reader.result).split(",")[1]); reader.readAsDataURL(file);
          });
          if (current() === undefined || serial !== this.serial) return;
          const asset = await api<{ path: string }>("/assets", { method: "POST", body: JSON.stringify({ name: file.name, contentType: "text/html", data }) });
          if (!isHtmlAsset(asset.path)) throw new Error("The server did not save this as an HTML file. Restart Notdown and try again.");
          value = asset.path;
        }
        const pos = current();
        if (pos === undefined || serial !== this.serial) return;
        const attrs = { ...this.node.attrs };
        if (isEditorKind(this.node, "syntax_block")) {
          attrs.data = { ...attrs.data, src: value };
          attrs.raw = `<iframe${attributesXml(attrs.data)}></iframe>`;
          attrs.source = null; attrs.sourceFingerprint = null;
        } else if (this.attachment) {
          attrs.src = value;
          if (selected && this.supplemental()) attrs.nfmAttrs = { ...attrs.nfmAttrs, title: selected.name };
        }
        else { attrs.url = value; if (selected) attrs.title = selected.name; }
        this.close(); this.view.dispatch(closeHistory(this.view.state.tr).setNodeMarkup(pos, undefined, attrs)); this.view.focus();
      } catch (error) {
        if (this.dialog === dialog && serial === this.serial) {
          uploading = false; input.disabled = drop.disabled = upload.disabled = false; update();
          output.textContent = error instanceof Error ? error.message : "Upload failed. Try again.";
        }
      }
    };
    dialog.append(form); document.body.append(dialog);
    dialog.addEventListener("toggle", event => { if ((event as ToggleEvent).newState === "closed" && this.dialog === dialog) this.close(); });
    dialog.addEventListener("keydown", event => { if (event.key === "Escape") { event.preventDefault(); this.close(true); } });
    dialog.showPopover(); this.position(); (html ? drop : input).focus();
    window.addEventListener("resize", this.position); document.addEventListener("scroll", this.position, true);
  }
  update(node: PMNode) {
    if (node.type !== this.node.type || (isEditorKind(node, "syntax_block") && node.attrs.kind !== "embed")) return false;
    if (node.eq(this.node)) return true;
    if (this.local) { this.node = node; return true; }
    if (this.dialog) this.close();
    this.cancelResize?.(); this.fullscreen?.remove(); this.fullscreen = undefined;
    const previous = this.value; this.node = node;
    if (this.value !== previous) { this.interactive = false; this.captionVisible = false; }
    this.render(); return true;
  }
  stopEvent(event: Event) { return event.type !== "dragstart" && event.type !== "dragend"; }
  ignoreMutation() { return true; }
  destroy() { this.disposed = true; this.cancelResize?.(); this.abort.abort(); this.fullscreen?.remove(); this.close(); }
}
