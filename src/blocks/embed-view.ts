import { isEditorKind } from "../document/node-identity";
import type { Node as PMNode } from "prosemirror-model";
import type { EditorView, NodeView } from "prosemirror-view";
import { closeHistory } from "prosemirror-history";
import { CodeXml, Globe, createElement } from "lucide";
import { bookmarkUrl } from "../features/bookmarks/bookmark";
import { attributesXml } from "../document/notion-syntax";
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
  private original?: PMNode;
  private disposed = false;
  private serial = 0;
  private get html() { return isEditorKind(this.node, "html_embed"); }
  private get value(): string { return String(this.html ? this.node.attrs.html : isEditorKind(this.node, "syntax_block") ? this.node.attrs.data.src || "" : this.node.attrs.url); }
  constructor(private node: PMNode, private view: EditorView, private getPos: () => number | undefined) {
    this.dom.contentEditable = "false";
    this.render();
  }
  private render() {
    this.dom.className = "pm-embed " + (this.html ? "pm-object-html_embed" : "pm-web-embed");
    if (isEditorKind(this.node, "syntax_block")) this.dom.dataset.syntaxKind = "embed";
    this.dom.replaceChildren();
    if (!this.value.trim()) {
      const button = el("button", "pm-embed-empty"); button.type = "button"; button.disabled = !this.view.editable;
      button.append(createElement(this.html ? CodeXml : Globe, { width: 22, height: 22, "aria-hidden": "true" }), el("span", "", this.html ? "Create or upload HTML" : "Embed anything (PDFs, Google Docs, Google Maps, Spotify…)"));
      button.onclick = () => this.open(); this.dom.append(button); return;
    }
    if (this.html || bookmarkUrl(this.value)) {
      const frame = el("iframe", this.html ? "pm-html-embed" : "pm-web-embed-frame");
      frame.title = this.html ? "HTML document" : this.node.attrs.title || this.node.attrs.data?.title || "Web embed";
      frame.setAttribute("sandbox", this.html ? "" : "allow-scripts allow-forms allow-presentation");
      frame.referrerPolicy = "no-referrer";
      if (this.html) frame.srcdoc = this.value; else frame.src = this.value;
      const height = this.node.attrs.data?.height;
      if (/^\d{1,4}$/.test(height)) frame.style.height = height + "px";
      this.dom.append(frame);
    } else this.dom.append(el("p", "pm-embed-note", "Enter a valid http:// or https:// URL to preview this page."));
    const footer = el("div", "pm-embed-footer");
    if (!this.html && bookmarkUrl(this.value)) {
      const link = el("a", "", "Open original"); link.href = this.value; link.target = "_blank"; link.rel = "noopener noreferrer";
      footer.append(link, el("span", "", "Some sites do not allow embedding."));
    }
    if (this.view.editable) {
      const edit = el("button", "pm-embed-edit", this.html ? "Edit HTML" : "Edit embed link"); edit.type = "button";
      edit.onclick = () => this.open(); footer.append(edit);
    }
    this.dom.append(footer);
  }
  private position = () => {
    if (!this.dialog) return;
    const rect = this.dom.getBoundingClientRect();
    this.dialog.style.left = Math.max(8, Math.min(rect.left + (rect.width - this.dialog.offsetWidth) / 2, innerWidth - this.dialog.offsetWidth - 8)) + "px";
    this.dialog.style.top = Math.max(8, Math.min(rect.bottom, innerHeight - this.dialog.offsetHeight - 8)) + "px";
  };
  private close = (focus = false) => {
    const dialog = this.dialog; this.dialog = undefined; this.original = undefined; this.serial++;
    dialog?.remove(); window.removeEventListener("resize", this.position); document.removeEventListener("scroll", this.position, true);
    if (focus && !this.disposed) this.view.focus();
  };
  private open() {
    if (!this.view.editable || this.dialog) return;
    this.original = this.node;
    const dialog = this.dialog = el("div", "pm-embed-popover" + (this.html ? " pm-embed-html-popover" : ""));
    dialog.popover = "auto"; dialog.setAttribute("role", "dialog"); dialog.setAttribute("aria-label", this.html ? "HTML embed" : "Web embed");
    dialog.append(el("div", "pm-embed-header", this.html ? "Add HTML" : "Link"));
    const form = el("form"), input = this.html ? el("textarea") : el("input"), output = el("output", "pm-embed-error");
    input.value = this.value; input.spellcheck = false;
    input.setAttribute("aria-label", this.html ? "HTML code" : "Embed URL");
    input.placeholder = this.html ? "<!doctype html>\n<html>\n  <body>Hello, world!</body>\n</html>" : "Paste in https://…";
    if (input instanceof HTMLInputElement) input.inputMode = "url";
    const submit = el("button", "pm-embed-submit", this.html ? "Embed HTML" : "Embed link"); submit.type = "submit";
    output.setAttribute("aria-live", "polite");
    const update = () => { submit.disabled = !input.value.trim(); output.textContent = ""; input.removeAttribute("aria-invalid"); };
    input.oninput = () => { this.serial++; update(); }; update();
    if (this.html) {
      const upload = el("input"); upload.type = "file"; upload.accept = ".html,.htm,text/html"; upload.hidden = true; upload.setAttribute("aria-label", "HTML file");
      const drop = el("button", "pm-embed-upload"); drop.type = "button";
      drop.append(el("span", "", "</>  Upload HTML file"), el("small", "", "Or drag and drop here")); drop.onclick = () => upload.click();
      const read = async (file?: File) => {
        if (!file) return;
        if (!/\.html?$/i.test(file.name) && file.type !== "text/html") { output.textContent = "Choose an HTML (.html or .htm) file."; return; }
        const serial = ++this.serial;
        try {
          const source = await file.text();
          if (this.disposed || this.dialog !== dialog || serial !== this.serial) return;
          input.value = source; update(); input.focus();
        } catch { if (this.dialog === dialog && serial === this.serial) output.textContent = "Could not read this file. Try again."; }
      };
      upload.onchange = () => { void read(upload.files?.[0]); upload.value = ""; };
      drop.ondragover = event => { event.preventDefault(); drop.classList.add("dragover"); };
      drop.ondragleave = () => drop.classList.remove("dragover");
      drop.ondrop = event => { event.preventDefault(); event.stopPropagation(); drop.classList.remove("dragover"); void read(event.dataTransfer?.files[0]); };
      form.append(drop, upload, el("label", "pm-embed-code-label", "HTML code"));
    }
    form.append(input, submit, el("p", "pm-embed-note", this.html ? "HTML is saved with this page. Scripts are disabled in the preview." : "Works with embeddable links to PDFs, Google Docs, Google Maps, Spotify and more."), output);
    form.onsubmit = event => {
      event.preventDefault(); if (!input.value.trim()) return;
      if (!this.html && !bookmarkUrl(input.value)) { output.textContent = "Enter a valid http:// or https:// URL."; input.setAttribute("aria-invalid", "true"); input.focus(); return; }
      const pos = this.getPos();
      if (!this.view.editable || pos === undefined || !this.original || !this.view.state.doc.nodeAt(pos)?.eq(this.original)) { output.textContent = "This block changed. Close and reopen it to edit."; return; }
      const value = this.html ? input.value : input.value.trim();
      const attrs = { ...this.node.attrs };
      if (this.html) attrs.html = value;
      else if (isEditorKind(this.node, "syntax_block")) {
        attrs.data = { ...attrs.data, src: value };
        attrs.raw = `<iframe${attributesXml(attrs.data)}></iframe>`;
        attrs.source = null; attrs.sourceFingerprint = null;
      } else attrs.url = value;
      this.close(); this.view.dispatch(closeHistory(this.view.state.tr).setNodeMarkup(pos, undefined, attrs)); this.view.focus();
    };
    dialog.append(form); document.body.append(dialog);
    dialog.addEventListener("toggle", event => { if ((event as ToggleEvent).newState === "closed" && this.dialog === dialog) this.close(); });
    dialog.addEventListener("keydown", event => { if (event.key === "Escape") { event.preventDefault(); this.close(true); } });
    dialog.showPopover(); this.position(); input.focus();
    window.addEventListener("resize", this.position); document.addEventListener("scroll", this.position, true);
  }
  update(node: PMNode) {
    if (node.type !== this.node.type || (isEditorKind(node, "syntax_block") && node.attrs.kind !== "embed")) return false;
    if (node.eq(this.node)) return true;
    if (this.dialog) this.close();
    this.node = node; this.render(); return true;
  }
  stopEvent(event: Event) { return event.type !== "dragstart" && event.type !== "dragend"; }
  ignoreMutation() { return true; }
  destroy() { this.disposed = true; this.close(); }
}
