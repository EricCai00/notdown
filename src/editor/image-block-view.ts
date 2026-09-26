import type { Node as PMNode } from "prosemirror-model";
import type { EditorView, NodeView } from "prosemirror-view";
import { AlignCenter, AlignLeft, AlignRight, Captions, Crop, Download, Ellipsis, X, ZoomIn, ZoomOut, createElement, type IconNode } from "lucide";
import { imageModel, imageLayout, type ImageCrop } from "../document/image-layout";
import { safeReference as safeUrl } from "../document/notion-syntax";
import { mediaFilename } from "../document/media";
import { imageTransaction, type ImageChange } from "./image-transactions";
import { domAttributes } from "../markdown-engine/attributes";
import { showEditorPanel } from "./editor-panel";
import "./image-block.css";

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = "") {
  const node = document.createElement(tag); node.className = className; node.textContent = text; return node;
}
function button(label: string, icon: IconNode, action: () => void) {
  const control = element("button"); control.type = "button"; control.title = label; control.setAttribute("aria-label", label);
  control.append(createElement(icon, { width: 16, height: 16, "stroke-width": 1.65, "aria-hidden": "true" }));
  control.onclick = action; return control;
}

export class ImageBlockView implements NodeView {
  readonly dom: HTMLElement;
  private shell = element("span", "pm-image-shell");
  private viewport = element("span", "pm-image-viewport");
  private image = element("img", "pm-image-content");
  private caption: HTMLElement;
  private toolbar = element("span", "pm-image-toolbar");
  private status = element("span", "pm-image-status");
  private popup?: HTMLElement;
  private dialog?: HTMLDialogElement;
  private drag?: AbortController;
  private cropButton: HTMLButtonElement;
  private resizeControls: HTMLButtonElement[] = [];
  private disposed = false;
  private events = new AbortController();
  constructor(private node: PMNode, private view: EditorView, private getPos: () => number | undefined,
    private canLayout: () => boolean, private showCaption: () => boolean = () => true) {
    this.dom = element(node.isInline ? "span" : "figure", "pm-image-block-view");
    this.dom.contentEditable = "false";
    this.caption = element(node.isInline ? "span" : "figcaption", "pm-image-caption");
    this.image.draggable = false;
    this.image.onload = () => { this.dom.dataset.imageState = "loaded"; this.status.textContent = ""; this.present(); };
    this.image.onerror = () => { this.dom.dataset.imageState = "unavailable"; this.status.textContent = "Image unavailable"; this.cropButton.disabled = true; };
    this.viewport.append(this.image);
    this.toolbar.setAttribute("role", "toolbar"); this.toolbar.setAttribute("aria-label", "Image controls");
    const alignment = button("Image alignment", AlignCenter, () => this.alignMenu());
    alignment.disabled = !view.editable || !canLayout();
    const caption = button("Edit caption", Captions, () => this.captionDialog()); caption.disabled = !view.editable || !showCaption();
    this.cropButton = button("Crop image", Crop, () => this.cropDialog());
    const expand = button("Expand image", ZoomIn, () => this.expand());
    const download = element("a"); download.title = "Download image"; download.setAttribute("aria-label", "Download image");
    download.append(createElement(Download, { width: 16, height: 16, "stroke-width": 1.65, "aria-hidden": "true" }));
    download.addEventListener("click", event => event.stopPropagation());
    const more = button("More image actions", Ellipsis, () => this.moreMenu());
    this.toolbar.append(alignment, caption, this.cropButton, expand, download, more);
    this.toolbar.addEventListener("pointerdown", event => event.preventDefault());
    this.shell.append(this.viewport, this.toolbar);
    for (const side of ["left", "right"] as const) {
      const handle = element("button", "pm-image-resize pm-image-resize-" + side); handle.type = "button";
      handle.setAttribute("aria-label", `Resize image from ${side}`); handle.title = "Drag to resize; arrow keys adjust width";
      handle.addEventListener("pointerdown", event => this.resize(event, side));
      handle.addEventListener("keydown", event => {
        if (!["ArrowLeft", "ArrowRight"].includes(event.key) || !this.canLayout()) return;
        event.preventDefault();
        const delta = (event.key === "ArrowRight" ? 1 : -1) * (side === "left" ? -1 : 1) * (event.shiftKey ? 40 : 10);
        this.apply({ layout: { width: String(this.boundedWidth(this.shell.getBoundingClientRect().width + delta)) } });
      });
      this.resizeControls.push(handle); this.shell.append(handle);
    }
    this.status.setAttribute("role", "status");
    this.dom.append(this.shell, this.caption, this.status);
    document.addEventListener("pointerdown", event => { if (!this.dom.contains(event.target as Node)) this.closeMenu(); }, { signal: this.events.signal });
    this.dom.addEventListener("keydown", event => { if (event.key === "Escape" && this.popup) { event.preventDefault(); this.closeMenu(); this.toolbar.querySelector<HTMLButtonElement>("button:last-child")?.focus(); } });
    this.present();
  }
  private get model() { return imageModel(this.node)!; }
  private present() {
    const model = this.model, layout = imageLayout(model.attributes, this.canLayout());
    const source = safeUrl(model.src);
    if (this.image.getAttribute("src") !== source) { this.dom.dataset.imageState = "loading"; this.image.src = source; }
    this.image.alt = model.alt; this.image.title = model.title;
    const attributes = domAttributes(model.attributes);
    this.image.className = "pm-image-content " + (attributes.class || "");
    for (const key of ["id", "lang", "data-md-id"]) {
      if (attributes[key]) this.image.setAttribute(key, attributes[key]); else this.image.removeAttribute(key);
    }
    const link = this.toolbar.querySelector("a")!; link.href = source; link.download = mediaFilename(model.src);
    link.target = "_blank"; link.rel = "noopener noreferrer";
    this.dom.dataset.align = layout.align;
    this.shell.style.width = layout.width || `${this.image.naturalWidth || 400}px`;
    this.caption.style.width = this.shell.style.width;
    const renderedWidth = parseFloat(layout.width) || this.image.naturalWidth;
    this.dom.classList.toggle("pm-image-small", this.image.naturalWidth > 0 && (renderedWidth < 200 || renderedWidth * this.image.naturalHeight / this.image.naturalWidth < 80));
    this.caption.textContent = this.showCaption() ? model.caption : "";
    this.caption.hidden = !this.caption.textContent;
    this.image.style.cssText = ""; this.viewport.style.aspectRatio = "";
    if (layout.crop) {
      const [x, y, w, h, ratio] = layout.crop;
      this.viewport.style.aspectRatio = String(ratio * w / h);
      this.image.style.cssText = `position:absolute;left:${-x / w * 100}%;top:${-y / h * 100}%;width:${100 / w}%;height:${100 / h}%;max-width:none`;
    }
    this.cropButton.disabled = !this.view.editable || !this.canLayout() || !this.image.naturalWidth;
    for (const handle of this.resizeControls) handle.hidden = !this.view.editable || !this.canLayout();
  }
  private apply(changes: ImageChange, original = this.node) {
    const pos = this.getPos();
    if (this.disposed || pos === undefined || !this.view.editable) throw new Error("This image is no longer editable.");
    const tr = imageTransaction(this.view.state, pos, original, changes, this.canLayout());
    this.view.dispatch(tr); this.status.textContent = "";
  }
  private closeMenu() { this.popup?.remove(); this.popup = undefined; }
  private menu() {
    this.closeMenu(); const menu = this.popup = element("span", "pm-image-menu"); menu.setAttribute("role", "menu");
    this.shell.append(menu); return menu;
  }
  private action(menu: HTMLElement, label: string, run: () => void, disabled = false) {
    const item = element("button", "", label); item.type = "button"; item.disabled = disabled; item.setAttribute("role", "menuitem");
    item.onclick = () => { this.closeMenu(); try { run(); if (!this.dialog) this.view.focus(); } catch (error) { this.status.textContent = (error as Error).message; } };
    menu.append(item); return item;
  }
  private alignMenu() {
    const menu = this.menu();
    for (const [align, icon] of [["left", AlignLeft], ["center", AlignCenter], ["right", AlignRight]] as const) {
      const item = this.action(menu, `Align ${align}`, () => this.apply({ layout: { align } }));
      item.prepend(createElement(icon, { width: 16, height: 16, "aria-hidden": "true" }));
    }
    menu.querySelector<HTMLButtonElement>("button")?.focus();
  }
  private moreMenu() {
    const menu = this.menu(), editable = this.view.editable;
    this.action(menu, "Replace image…", () => this.textDialog("Replace image", "Image URL", this.model.src, value => ({ src: value })), !editable);
    this.action(menu, "Copy image link", () => { void navigator.clipboard.writeText(new URL(this.model.src, document.baseURI).href).then(() => { this.status.textContent = "Image link copied"; }).catch(() => { this.status.textContent = "Unable to copy image link"; }); });
    this.action(menu, "Original size", () => this.apply({ layout: { width: null } }), !editable || !this.canLayout());
    this.action(menu, "Reset crop", () => this.apply({ layout: { crop: null } }), !editable || !this.canLayout() || !this.model.attributes.crop);
    this.action(menu, "Delete image", () => { const pos = this.getPos(); if (pos !== undefined) this.view.dispatch(this.view.state.tr.delete(pos, pos + this.node.nodeSize)); }, !editable);
  }
  private captionDialog() { this.textDialog("Image caption", "Caption", this.model.caption, caption => ({ caption })); }
  private textDialog(title: string, label: string, value: string, change: (value: string) => ImageChange) {
    this.dialog?.close(); const original = this.node;
    const dialog = this.dialog = element("dialog", "pm-link-dialog"), form = element("form"), row = element("label", "", label);
    const input = element("input"), output = element("output"); input.value = value; input.setAttribute("aria-label", label); row.append(input);
    const save = element("button", "", "Save"), cancel = element("button", "", "Cancel"); save.type = "submit"; cancel.type = "button";
    cancel.onclick = () => dialog.close(); form.append(row, output, save, cancel); dialog.append(form); document.body.append(dialog);
    form.onsubmit = event => { event.preventDefault(); try { if (input.value !== value) this.apply(change(input.value), original); dialog.close(); this.view.focus(); } catch (error) { output.textContent = (error as Error).message; } };
    dialog.onclose = () => { dialog.remove(); if (this.dialog === dialog) this.dialog = undefined; };
    showEditorPanel(dialog, title, this.view.dom); input.focus({ preventScroll: true });
  }
  private boundedWidth(width: number) { return Math.round(Math.max(64, Math.min(this.dom.getBoundingClientRect().width || 1000, width))); }
  private resize(event: PointerEvent, side: "left" | "right") {
    if (!this.view.editable || !this.canLayout() || event.button !== 0) return;
    event.preventDefault(); event.stopPropagation(); this.closeMenu();
    this.drag?.abort(); const controller = this.drag = new AbortController(), original = this.node;
    const start = event.clientX, width = this.shell.getBoundingClientRect().width;
    const centered = imageLayout(this.model.attributes, true).align === "center";
    let next = width;
    this.dom.classList.add("is-resizing");
    const end = (commit: boolean) => {
      controller.abort(); this.drag = undefined; this.dom.classList.remove("is-resizing");
      try { if (commit && Math.abs(next - width) >= 1) this.apply({ layout: { width: String(next) } }, original); }
      catch (error) { this.status.textContent = (error as Error).message; }
      this.present();
      if (commit) this.view.focus();
    };
    document.addEventListener("pointermove", move => {
      next = this.boundedWidth(width + (move.clientX - start) * (side === "left" ? -1 : 1) * (centered ? 2 : 1));
      this.shell.style.width = next + "px";
    }, { signal: controller.signal });
    document.addEventListener("pointerup", () => end(true), { once: true, signal: controller.signal });
    document.addEventListener("pointercancel", () => end(false), { once: true, signal: controller.signal });
    document.addEventListener("keydown", key => { if (key.key === "Escape") { key.preventDefault(); end(false); } }, { signal: controller.signal });
    window.addEventListener("blur", () => end(false), { once: true, signal: controller.signal });
  }
  private expand() {
    this.dialog?.close();
    const dialog = this.dialog = element("dialog", "pm-image-lightbox"), controls = element("div", "pm-image-lightbox-controls");
    dialog.setAttribute("aria-label", "Expanded image");
    const image = element("img"); image.src = safeUrl(this.model.src); image.alt = this.model.alt;
    let zoom = 1;
    const setZoom = (next: number) => { zoom = Math.max(.25, Math.min(4, next)); image.style.transform = `scale(${zoom})`; };
    controls.append(button("Zoom out", ZoomOut, () => setZoom(zoom / 1.25)), button("Zoom in", ZoomIn, () => setZoom(zoom * 1.25)), button("Close expanded image", X, () => dialog.close()));
    const stage = element("div", "pm-image-lightbox-stage"); stage.append(image); dialog.append(controls, stage); document.body.append(dialog);
    dialog.onclose = () => { dialog.remove(); if (this.dialog === dialog) this.dialog = undefined; this.toolbar.querySelector<HTMLButtonElement>('[aria-label="Expand image"]')?.focus(); };
    dialog.showModal();
  }
  private cropDialog() {
    if (!this.image.naturalWidth || !this.canLayout()) return;
    this.dialog?.close(); const original = this.node, ratio = this.image.naturalWidth / this.image.naturalHeight;
    const dialog = this.dialog = element("dialog", "pm-image-crop-dialog"); dialog.setAttribute("aria-label", "Crop image");
    const title = element("h3", "", "Crop image"), stage = element("div", "pm-image-crop-stage"), picture = element("img");
    picture.src = safeUrl(this.model.src); picture.alt = this.model.alt; picture.draggable = false;
    stage.style.aspectRatio = String(ratio); stage.style.width = `min(640px, 75vw, ${55 * ratio}vh)`;
    const box = element("div", "pm-image-crop-box"); box.setAttribute("aria-label", "Crop selection"); stage.append(picture, box);
    let crop: ImageCrop = [...(imageLayout(this.model.attributes, true).crop || [0, 0, 1, 1, ratio])] as ImageCrop;
    crop[4] = ratio;
    const fields = element("div", "pm-image-crop-fields"), inputs: HTMLInputElement[] = [];
    const render = () => {
      box.style.cssText = `left:${crop[0] * 100}%;top:${crop[1] * 100}%;width:${crop[2] * 100}%;height:${crop[3] * 100}%`;
      inputs.forEach((input, i) => input.value = String(Math.round(crop[i] * 1000) / 10));
    };
    for (const [i, label] of ["Left", "Top", "Width", "Height"].entries()) {
      const row = element("label", "", label + " %"), input = element("input"); input.type = "number"; input.min = i < 2 ? "0" : "2"; input.max = "100"; input.step = "0.1"; input.setAttribute("aria-label", "Crop " + label.toLowerCase());
      input.onchange = () => {
        const value = Number(input.value) / 100;
        if (!Number.isFinite(value)) return render();
        crop[i] = Math.max(i < 2 ? 0 : .02, Math.min(i < 2 ? 1 - crop[i + 2] : 1 - crop[i - 2], value)); render();
      };
      inputs.push(input); row.append(input); fields.append(row);
    }
    for (const corner of ["nw", "ne", "sw", "se"]) { const handle = element("span", "pm-image-crop-corner"); handle.dataset.corner = corner; box.append(handle); }
    box.onpointerdown = event => {
      if (event.button !== 0) return; event.preventDefault(); box.setPointerCapture(event.pointerId);
      const initial = [...crop], bounds = stage.getBoundingClientRect(), x = event.clientX, y = event.clientY;
      const corner = (event.target as HTMLElement).dataset.corner;
      box.onpointermove = move => {
        const dx = (move.clientX - x) / bounds.width, dy = (move.clientY - y) / bounds.height;
        if (!corner) { crop[0] = Math.max(0, Math.min(1 - crop[2], initial[0] + dx)); crop[1] = Math.max(0, Math.min(1 - crop[3], initial[1] + dy)); }
        else {
          const left = corner.includes("w") ? Math.max(0, Math.min(initial[0] + initial[2] - .02, initial[0] + dx)) : initial[0];
          const top = corner.includes("n") ? Math.max(0, Math.min(initial[1] + initial[3] - .02, initial[1] + dy)) : initial[1];
          const right = corner.includes("e") ? Math.min(1, Math.max(initial[0] + .02, initial[0] + initial[2] + dx)) : initial[0] + initial[2];
          const bottom = corner.includes("s") ? Math.min(1, Math.max(initial[1] + .02, initial[1] + initial[3] + dy)) : initial[1] + initial[3];
          crop = [left, top, right - left, bottom - top, ratio];
        }
        render();
      };
      const stop = () => { box.onpointermove = null; box.onpointerup = null; box.onpointercancel = null; };
      box.onpointerup = box.onpointercancel = stop;
    };
    const presets = element("div", "pm-image-crop-presets");
    for (const [label, aspect] of [["Original", ratio], ["Square", 1], ["16:9", 16 / 9], ["4:3", 4 / 3]] as const) {
      const preset = element("button", "", label); preset.type = "button"; preset.onclick = () => {
        const w = Math.min(1, aspect / ratio), h = Math.min(1, ratio / aspect);
        crop = [(1 - w) / 2, (1 - h) / 2, w, h, ratio]; render();
      }; presets.append(preset);
    }
    const actions = element("div", "pm-image-crop-actions"), cancel = element("button", "", "Cancel"), apply = element("button", "primary", "Apply crop"), output = element("output");
    output.setAttribute("aria-live", "polite"); cancel.onclick = () => dialog.close();
    apply.onclick = () => { try { this.apply({ layout: { crop: crop.map(n => Number(n.toFixed(6))).join(",") } }, original); dialog.close(); this.view.focus(); } catch (error) { output.textContent = (error as Error).message; } };
    actions.append(cancel, apply); dialog.append(title, stage, presets, fields, output, actions); document.body.append(dialog); render();
    dialog.onclose = () => { dialog.remove(); if (this.dialog === dialog) this.dialog = undefined; };
    dialog.showModal();
  }
  update(next: PMNode) {
    if (next.type !== this.node.type || !imageModel(next)) return false;
    if (!next.eq(this.node)) { this.drag?.abort(); this.drag = undefined; this.dom.classList.remove("is-resizing"); }
    this.node = next; this.present(); return true;
  }
  stopEvent(event: Event) { return event.target instanceof Element && !!event.target.closest("button, a, input, [role=menu]"); }
  ignoreMutation() { return true; }
  destroy() { this.disposed = true; this.drag?.abort(); this.events.abort(); this.dialog?.close(); this.dialog?.remove(); }
}
