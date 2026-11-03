import { setUIAttribute, setUIText } from "../../shared/i18n";
import type { Node as PMNode } from "prosemirror-model";
import type { EditorView, NodeView } from "prosemirror-view";
import type { EditorView as CodeEditor } from "@codemirror/view";
import { createMetadataCodeEditor } from "./metadata-code-editor";
import { metadataSourceTransaction } from "./metadata-source";
import { blockPropertyFields, openBlockProperties } from "../../editor/block-properties";
import { Plugin, TextSelection } from "prosemirror-state";
import { metadataValues } from "../../markdown-engine/products";
import { createElement, FileCode2, Text, List, X } from "lucide";

/** Invisible metadata must not be selected/deleted by ordinary body editing. */
export function protectPageMetadata() {
  const end = (doc: PMNode) => {
    let offset = 0;
    for (let i = 0; i < doc.childCount && doc.child(i).attrs.metadataForm; i++) offset += doc.child(i).nodeSize;
    return offset;
  };
  const count = (doc: PMNode) => {
    let total = 0;
    doc.descendants(node => { if (node.attrs.metadataForm) total++; });
    return total;
  };
  return new Plugin({
    filterTransaction: (tr, state) => tr.getMeta("pageMetadataProjection") || !tr.docChanged || count(tr.doc) >= count(state.doc),
    props: {
      handleKeyDown(view, event) {
        const boundary = end(view.state.doc);
        if (!boundary || event.isComposing) return false;
        const { selection, doc } = view.state;
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
          if (boundary < doc.content.size) view.dispatch(view.state.tr.setSelection(TextSelection.between(doc.resolve(boundary), doc.resolve(doc.content.size))));
          return true;
        }
        return event.key === "Backspace" && selection.empty && selection.from <= boundary + 1;
      },
    },
  });
}

/** Only the presentation moves; metadata remains in the same document and history. */
export class PageMetadataView implements NodeView {
  dom = document.createElement("span");
  private section = document.createElement("section");
  private summary = document.createElement("button");
  private dialog = document.createElement("dialog");
  private code?: CodeEditor;
  private mount = document.createElement("div");
  private save = document.createElement("button");
  private error = document.createElement("output");
  private original?: PMNode;
  private node: PMNode;
  private committed = false;
  private fields = document.createElement("button");
  private form: string;
  private type: PMNode["type"];

  constructor(node: PMNode, private view: EditorView, private getPos: () => number | undefined, host: HTMLElement, private parse: (source: string) => PMNode) {
    this.node = node;
    this.form = node.attrs.metadataForm;
    this.type = node.type;
    this.dom.hidden = true;
    this.dom.contentEditable = "false";
    this.dom.className = "page-metadata-anchor";
    this.section.className = "page-metadata-section property-row";
    const name = ({ yaml: "YAML metadata", pandoc: "Pandoc title block", mmd: "MultiMarkdown metadata" } as Record<string, string>)[this.form] || "Metadata";
    const label = document.createElement("span"), labelText = document.createElement("span");
    labelText.textContent = ({ yaml: "YAML", pandoc: "Pandoc title", mmd: "MultiMarkdown" } as Record<string, string>)[this.form] || "Metadata";
    label.append(createElement(this.form === "yaml" ? FileCode2 : this.form === "pandoc" ? Text : List), labelText);
    this.summary.type = "button";
    this.summary.className = "property-values page-metadata-summary";
    this.summary.setAttribute("aria-label", name + " details");
    this.summary.setAttribute("aria-haspopup", "dialog");
    this.summary.onclick = () => this.open();
    this.section.append(label, this.summary);
    this.dialog.className = "page-metadata-dialog";
    this.dialog.setAttribute("aria-label", name);
    const header = document.createElement("header"), heading = document.createElement("h3");
    heading.textContent = name;
    const close = document.createElement("button");
    close.type = "button";
    close.className = "icon-button";
    setUIAttribute(close, "aria-label", "Close metadata details");
    close.append(createElement(X));
    close.onclick = () => this.dialog.close();
    header.append(heading, close);
    const actions = document.createElement("div");
    actions.className = "page-metadata-dialog-actions";
    this.fields.type = "button";
    setUIText(this.fields, "Edit fields");
    this.fields.onclick = () => {
      const pos = this.getPos();
      if (pos !== undefined) {
        this.dialog.close();
        openBlockProperties(this.view, pos);
      }
    };
    actions.append(this.fields);
    this.mount.className = "metadata-code-editor";
    this.error.className = "metadata-code-error";
    this.error.setAttribute("aria-live", "polite");
    const cancel = document.createElement("button");
    cancel.type = "button";
    setUIText(cancel, "Cancel");
    cancel.onclick = () => this.dialog.close();
    this.save.type = "button";
    this.save.className = "primary-button";
    setUIText(this.save, "Save changes");
    this.save.onclick = () => this.commit();
    actions.append(cancel, this.save);
    this.dialog.append(header, this.mount, this.error, actions);
    this.dialog.addEventListener("close", () => {
      this.original = undefined;
      this.code?.destroy();
      this.code = undefined;
      if (this.committed && !this.view.isDestroyed) this.view.focus();
      else if (this.summary.isConnected) this.summary.focus();
      this.committed = false;
    });
    this.dialog.addEventListener("click", event => {
      const bounds = this.dialog.getBoundingClientRect();
      if (event.target === this.dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) this.dialog.close();
    });
    document.body.append(this.dialog);
    host.append(this.section);
    this.update(node);
  }
  private open() {
    this.original = this.node;
    this.error.textContent = "";
    this.save.disabled = false;
    this.fields.disabled = false;
    this.code?.destroy();
    this.code = createMetadataCodeEditor(this.mount, this.node.attrs.raw, this.form, () => this.commit(), () => {
      this.fields.disabled = this.code?.state.sliceDoc() !== this.original?.attrs.raw;
      if (this.original?.eq(this.node)) this.error.textContent = "";
    });
    this.dialog.showModal();
    this.code.requestMeasure();
    this.code.focus();
  }
  private commit() {
    if (!this.code || !this.original || this.save.disabled || !this.view.editable || this.code.composing) return;
    const pos = this.getPos();
    if (pos === undefined) return;
    try {
      const tr = metadataSourceTransaction(this.view.state, pos, this.original, this.code.state.sliceDoc(), this.parse);
      this.original = undefined;
      if (tr) this.view.dispatch(tr);
      this.committed = true;
      this.dialog.close();
    } catch (error) {
      this.error.textContent = error instanceof Error ? error.message : String(error);
    }
  }
  update(node: PMNode) {
    if (node.type !== this.type || node.attrs.metadataForm !== this.form) return false;
    this.node = node;
    if (this.original && !this.original.eq(node)) {
      this.save.disabled = true;
      setUIText(this.error, "This metadata changed. Copy your draft, then close and reopen its details.");
    }
    this.fields.hidden = !blockPropertyFields(node).length;
    this.summary.replaceChildren();
    const entries = Object.entries(metadataValues(node.attrs.raw, this.form));
    for (const [key, value] of entries.slice(0, 2)) {
      const tag = document.createElement("span");
      tag.className = "tag";
      const text = typeof value === "object" ? JSON.stringify(value) : String(value ?? "");
      tag.textContent = `${key} · ${text.replace(/\s+/g, " ") || "Empty"}`;
      tag.title = `${key}: ${text}`;
      this.summary.append(tag);
    }
    if (entries.length > 2) {
      const more = document.createElement("span");
      more.className = "muted page-metadata-more";
      more.textContent = `+${entries.length - 2}`;
      this.summary.append(more);
    }
    if (!entries.length) {
      const text = document.createElement("span");
      text.className = "muted";
      setUIText(text, "View original metadata");
      this.summary.append(text);
    }
    return true;
  }
  ignoreMutation() { return true; }
  destroy() { this.code?.destroy(); this.dialog.remove(); this.section.remove(); }
}
