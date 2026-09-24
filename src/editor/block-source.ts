import type { Node as PMNode } from "prosemirror-model";
import { isListItem } from "../document/list-items";
import { blockAtPos } from "./editor-blocks";
import { restoreFootnotes } from "./footnotes";
import "./block-source.css";

/** Serialize only the selected block, without page metadata or source gaps. */
export function blockSource(doc: PMNode, pos: number, serialize: (doc: PMNode) => string): string {
  const block = blockAtPos(doc, pos);
  if (!block) throw new Error("This block is no longer available.");
  let node = block.node;
  if (isListItem(node) && block.listNode) {
    const list = block.listNode;
    node = list.type.create({
      ...list.attrs,
      source: null,
      sourceFingerprint: null,
      order: Number(list.attrs.order || 1) + doc.resolve(block.pos).index(),
    }, node);
  }
  const fragment = doc.type.create({
    sourceFormat: doc.attrs.sourceFormat,
    sourceNewline: doc.attrs.sourceNewline,
  }, node);
  return serialize(restoreFootnotes(fragment));
}

export function openBlockSource(source: string, onClose: () => void): HTMLDialogElement {
  const dialog = document.createElement("dialog");
  dialog.className = "pm-block-source-dialog";
  dialog.setAttribute("aria-label", "Block source");
  const header = document.createElement("header");
  const title = document.createElement("h2");
  title.textContent = "Block source";
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "×";
  close.setAttribute("aria-label", "Close block source");
  close.onclick = () => dialog.close();
  header.append(title, close);
  const input = document.createElement("textarea");
  input.readOnly = true;
  input.spellcheck = false;
  input.wrap = "off";
  input.value = source;
  input.setAttribute("aria-label", "Block Markdown source");
  const footer = document.createElement("footer");
  const status = document.createElement("output");
  status.setAttribute("aria-live", "polite");
  const copy = document.createElement("button");
  copy.type = "button";
  copy.textContent = "Copy source";
  copy.onclick = async () => {
    try {
      await navigator.clipboard.writeText(source);
      status.textContent = "Copied";
    } catch {
      input.focus();
      input.select();
      status.textContent = "Copy unavailable. Press Ctrl+C / ⌘C to copy.";
    }
  };
  footer.append(status, copy);
  dialog.append(header, input, footer);
  dialog.onclose = () => { dialog.remove(); onClose(); };
  document.body.append(dialog);
  dialog.showModal();
  input.focus();
  return dialog;
}
