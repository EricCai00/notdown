import type { Node as PMNode } from "prosemirror-model";
import type { EditorView, NodeView } from "prosemirror-view";
import { closeHistory, undo, redo } from "prosemirror-history";
import { createElement, Plus, PenLine, Smile, Trash2, ArrowLeft, ArrowRight, type IconNode } from "lucide";
import { openCalloutIconPicker } from "./callout-icon-picker";
import "./tabs.css";

let nextId = 0;

/** The tab strip is UI; all panel content stays in the parent ProseMirror document. */
export class TabsView implements NodeView {
  dom = document.createElement("section");
  contentDOM = document.createElement("div");
  private strip = document.createElement("div");
  private id = `pm-tabs-${++nextId}`;
  private previewActive?: number;
  private disposed = false;
  private dismiss?: () => void;
  private closePicker?: () => void;

  constructor(private node: PMNode, private view: EditorView, private getPos: () => number | undefined) {
    this.dom.className = "pm-content-object pm-object-tabs";
    this.strip.className = "pm-tabs-strip";
    this.strip.contentEditable = "false";
    this.strip.setAttribute("role", "tablist");
    this.strip.setAttribute("aria-label", "Tabs");
    this.strip.addEventListener("keydown", event => {
      if (!this.view.editable || !(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key !== "z" && key !== "y") return;
      event.preventDefault(); event.stopPropagation();
      (key === "y" || event.shiftKey ? redo : undo)(this.view.state, this.view.dispatch);
      this.focusTab(this.active());
    });
    this.contentDOM.className = "pm-object-content pm-tabs-panels";
    this.dom.append(this.strip, this.contentDOM);
    this.render();
  }

  private active() {
    const value = this.view.editable ? this.node.attrs.active : this.previewActive ?? this.node.attrs.active;
    return Math.max(0, Math.min(this.node.childCount - 1, Math.trunc(Number(value)) || 0));
  }

  private focusTab(index: number) {
    this.strip.querySelectorAll<HTMLButtonElement>('[role="tab"]')[index]?.focus();
  }

  private select(index: number, focus = true) {
    if (this.view.editable) {
      const pos = this.getPos();
      if (pos === undefined) return;
      this.view.dispatch(closeHistory(this.view.state.tr).setNodeMarkup(pos, undefined, { ...this.node.attrs, active: index }));
    } else {
      this.previewActive = index;
      this.render();
    }
    if (focus) this.focusTab(index);
  }

  private button(label: string, icon?: IconNode) {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("aria-label", label);
    if (icon) button.append(createElement(icon, { width: 18, height: 18, "stroke-width": 1.6, "aria-hidden": "true" }));
    return button;
  }

  private render() {
    this.dismiss?.();
    this.strip.replaceChildren();
    const active = this.active();
    this.node.forEach((tab, _offset, index) => {
      const button = this.button(String(tab.attrs.title || "Untitled"));
      button.id = `${this.id}-tab-${index}`;
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", String(index === active));
      button.setAttribute("aria-controls", `${this.id}-panel-${index}`);
      button.tabIndex = index === active ? 0 : -1;
      button.title = String(tab.attrs.title || "Untitled");
      if (this.view.editable) button.setAttribute("aria-haspopup", "menu");
      const icon = String(tab.attrs.nfmAttrs?.icon || "");
      if (icon) {
        const glyph = document.createElement("span");
        glyph.className = "pm-tab-icon";
        glyph.textContent = icon;
        glyph.setAttribute("aria-hidden", "true");
        button.append(glyph);
      }
      const title = document.createElement("span");
      title.className = "pm-tab-title";
      title.textContent = String(tab.attrs.title || "Untitled");
      button.append(title);
      button.addEventListener("click", () => {
        if (this.view.editable && index === this.active()) this.openMenu(index, button);
        else this.select(index);
      });
      button.addEventListener("contextmenu", event => {
        if (!this.view.editable) return;
        event.preventDefault(); event.stopPropagation();
        this.openMenu(index, button);
      });
      button.addEventListener("keydown", event => {
        if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
          event.preventDefault(); event.stopPropagation();
          const next = event.key === "Home" ? 0 : event.key === "End" ? this.node.childCount - 1
            : (index + (event.key === "ArrowLeft" ? -1 : 1) + this.node.childCount) % this.node.childCount;
          this.select(next);
        } else if (this.view.editable && (event.key === "ArrowDown" || event.key === "ContextMenu" || (event.shiftKey && event.key === "F10"))) {
          event.preventDefault(); event.stopPropagation(); this.openMenu(index, button);
        }
      });
      this.strip.append(button);
    });
    if (this.view.editable) {
      const add = this.button("Add tab", Plus);
      add.className = "pm-tabs-add"; add.title = "Add tab";
      add.addEventListener("click", () => {
        const pos = this.getPos(); if (pos === undefined || !this.view.editable) return;
        const index = this.node.childCount;
        const child = this.node.type.schema.nodes["structure.tab"].create({ title: `Tab ${index + 1}` }, this.node.type.schema.nodes["block.paragraph"].create());
        const tr = closeHistory(this.view.state.tr).insert(pos + this.node.nodeSize - 1, child)
          .setNodeMarkup(pos, undefined, { ...this.node.attrs, active: index });
        this.view.dispatch(tr); this.focusTab(index);
      });
      this.strip.append(add);
    }
    queueMicrotask(() => {
      if (this.disposed) return;
      [...this.contentDOM.children].forEach((element, index) => {
        const panel = element as HTMLElement;
        panel.hidden = index !== active;
        panel.id = `${this.id}-panel-${index}`;
        panel.setAttribute("role", "tabpanel");
        panel.setAttribute("aria-labelledby", `${this.id}-tab-${index}`);
      });
    });
  }

  private change(index: number, action: "remove" | "left" | "right") {
    const pos = this.getPos(); if (pos === undefined || !this.view.editable || this.node.childCount < 2) return;
    const children: PMNode[] = []; this.node.forEach(child => children.push(child));
    let active = this.active();
    if (action === "remove") {
      children.splice(index, 1);
      active = active > index ? active - 1 : active === index ? Math.min(index, children.length - 1) : active;
    } else {
      const other = index + (action === "left" ? -1 : 1);
      if (other < 0 || other >= children.length) return;
      [children[index], children[other]] = [children[other], children[index]];
      if (active === index) active = other; else if (active === other) active = index;
    }
    this.view.dispatch(closeHistory(this.view.state.tr).replaceWith(pos, pos + this.node.nodeSize, this.node.type.create({ ...this.node.attrs, active }, children, this.node.marks)));
    this.focusTab(active);
  }

  private edit(index: number, original: PMNode, attrs: Record<string, unknown>) {
    const pos = this.getPos();
    // A popup must never write an old draft over an externally replaced tab.
    if (this.disposed || !this.view.editable || pos === undefined || this.node.maybeChild(index) !== original) return;
    let offset = pos + 1;
    for (let i = 0; i < index; i++) offset += this.node.child(i).nodeSize;
    this.view.dispatch(closeHistory(this.view.state.tr).setNodeMarkup(offset, undefined, { ...original.attrs, ...attrs }));
    this.focusTab(index);
  }

  private openMenu(index: number, anchor: HTMLButtonElement) {
    this.dismiss?.();
    const original = this.node.child(index);
    const menu = document.createElement("div");
    menu.className = "pm-tabs-menu"; menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", "Tab actions");
    const controller = new AbortController(), options = { signal: controller.signal };
    const close = () => { controller.abort(); menu.remove(); anchor.setAttribute("aria-expanded", "false"); this.dismiss = undefined; };
    this.dismiss = close;
    anchor.setAttribute("aria-expanded", "true");
    const item = (label: string, icon: IconNode, run: () => void, disabled = false) => {
      const button = this.button(label, icon);
      button.setAttribute("role", "menuitem"); button.disabled = disabled;
      const text = document.createElement("span"); text.textContent = label; button.append(text);
      button.addEventListener("click", run); menu.append(button); return button;
    };
    item("Rename", PenLine, () => {
      menu.replaceChildren(); menu.setAttribute("role", "dialog"); menu.setAttribute("aria-label", "Rename tab");
      const form = document.createElement("form"), input = document.createElement("input");
      input.value = original.attrs.title; input.setAttribute("aria-label", "Tab title"); input.required = true;
      const save = this.button("Save"); save.textContent = "Save"; save.type = "submit";
      form.append(input, save); menu.append(form);
      form.addEventListener("submit", event => {
        event.preventDefault();
        if (!input.value.trim()) return;
        close(); this.edit(index, original, { title: input.value.trim() });
      });
      input.focus(); input.select();
    });
    item("Edit icon", Smile, () => {
      close();
      this.closePicker?.();
      this.closePicker = openCalloutIconPicker(anchor, icon => {
        this.closePicker = undefined;
        const nfmAttrs = { ...original.attrs.nfmAttrs };
        if (icon) nfmAttrs.icon = icon; else delete nfmAttrs.icon;
        this.edit(index, original, { nfmAttrs });
      }, "Tab icon");
    });
    menu.append(document.createElement("hr"));
    item("Move tab left", ArrowLeft, () => { close(); this.change(index, "left"); }, index === 0);
    item("Move tab right", ArrowRight, () => { close(); this.change(index, "right"); }, index === this.node.childCount - 1);
    menu.append(document.createElement("hr"));
    const remove = item("Delete", Trash2, () => { close(); this.change(index, "remove"); }, this.node.childCount === 1);
    remove.className = "pm-tab-delete";
    if (remove.disabled) remove.title = "Keep at least one tab";
    document.body.append(menu);
    const rect = anchor.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - menu.offsetWidth - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(rect.bottom + 5, innerHeight - menu.offsetHeight - 8))}px`;
    menu.querySelector<HTMLButtonElement>("button")?.focus();
    document.addEventListener("pointerdown", event => { if (!menu.contains(event.target as Node)) close(); }, options);
    document.addEventListener("focusin", event => { if (!menu.contains(event.target as Node)) close(); }, options);
    window.addEventListener("resize", close, options);
    document.addEventListener("scroll", event => { if (!menu.contains(event.target as Node)) close(); }, { ...options, capture: true });
    menu.addEventListener("keydown", event => {
      if (event.key === "Escape") { event.preventDefault(); close(); this.focusTab(index); }
      else if (menu.getAttribute("role") === "menu" && ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const buttons = [...menu.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
          : (current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }
      event.stopPropagation();
    }, options);
  }

  update(node: PMNode) {
    if (node.type !== this.node.type) return false;
    this.closePicker?.(); this.closePicker = undefined;
    this.node = node; this.render(); return true;
  }
  stopEvent(event: Event) { return this.strip.contains(event.target as Node); }
  ignoreMutation(mutation: MutationRecord | { type: "selection"; target: Node }) {
    if (mutation.type === "selection") return false;
    if (!this.contentDOM.contains(mutation.target)) return true;
    return mutation.type === "attributes" && mutation.target.parentNode === this.contentDOM
      && ["hidden", "id", "role", "aria-labelledby"].includes(mutation.attributeName || "");
  }
  destroy() { this.disposed = true; this.dismiss?.(); this.closePicker?.(); }
}
