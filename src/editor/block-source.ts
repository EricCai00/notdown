import type { Node as PMNode } from "prosemirror-model";
import { EditorState } from "@codemirror/state";
import { EditorView, lineNumbers, keymap } from "@codemirror/view";
import { defaultKeymap } from "@codemirror/commands";
import { createElement, CodeXml, Copy, X } from "lucide";
import { markdownSourceLanguage } from "../markdown-engine/source-language";
import { isListItem } from "../document/list-items";
import { isEditorKind } from "../document/node-identity";
import { blockAtPos } from "./editor-blocks";
import { restoreFootnotes } from "./footnotes";
import "./block-source.css";

/** Serialize only the selected block, without page metadata or source gaps. */
export function blockSource(doc: PMNode, pos: number, serialize: (doc: PMNode) => string): string {
  const block = blockAtPos(doc, pos);
  if (!block) throw new Error("This block is no longer available.");
  let node = block.node;
  if ((isListItem(node) || isEditorKind(node, "definition_list_item")) && block.listNode) {
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

export function openBlockSource(source: string, onClose: () => void, signal?: AbortSignal, scope: "Block" | "Inline" = "Block", reference?: { source: string; description?: string }): HTMLDialogElement {
  const dialog = document.createElement("dialog");
  dialog.className = "pm-block-source-dialog";
  dialog.setAttribute("aria-label", `${scope} source`);
  const header = document.createElement("header");
  const title = document.createElement("h2");
  title.textContent = `${scope} source`;
  const close = document.createElement("button");
  close.type = "button";
  close.append(createElement(X));
  close.className = "pm-block-source-close";
  close.setAttribute("aria-label", `Close ${scope.toLowerCase()} source`);
  close.onclick = () => dialog.close();
  const heading = document.createElement("div");
  heading.className = "pm-block-source-heading";
  heading.append(createElement(CodeXml), title);
  const mount = document.createElement("div");
  mount.className = "pm-block-source-code";
  const sourceState = (value: string, label: string) => EditorState.create({
    doc: value,
    extensions: [
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
      EditorState.tabSize.of(2),
      EditorView.contentAttributes.of({
        role: "textbox", "aria-label": label,
        "aria-readonly": "true", "aria-multiline": "true", tabindex: "0",
      }),
      lineNumbers(),
      keymap.of(defaultKeymap),
      markdownSourceLanguage(),
    ],
  });
  const state = sourceState(source, `${scope} Markdown source`);
  const editor = new EditorView({ state, parent: mount });
  const footer = document.createElement("footer");
  const status = document.createElement("output");
  status.setAttribute("aria-live", "polite");
  const details = document.createElement("span");
  details.textContent = `${state.doc.lines} ${state.doc.lines === 1 ? "line" : "lines"} · Read only`;
  const copy = document.createElement("button");
  copy.type = "button";
  copy.append(createElement(Copy), document.createTextNode("Copy"));
  copy.setAttribute("aria-label", "Copy source");
  copy.className = "pm-block-source-copy";
  copy.onclick = async () => {
    try {
      await navigator.clipboard.writeText(source);
      status.textContent = "Copied";
    } catch {
      editor.focus();
      editor.dispatch({ selection: { anchor: 0, head: editor.state.doc.length } });
      status.textContent = "Copy unavailable. Press Ctrl+C / ⌘C to copy.";
    }
  };
  const actions = document.createElement("div");
  actions.className = "pm-block-source-actions";
  actions.append(copy, close);
  header.append(heading, actions);
  footer.append(details, status);
  const sections = document.createElement("div"); sections.className = "pm-source-sections";
  let referenceEditor: EditorView | undefined;
  if (reference) {
    const label = document.createElement("h3"); label.textContent = "Inline reference";
    sections.append(label, mount);
    const referenceHeader = document.createElement("div"); referenceHeader.className = "pm-source-section-heading";
    const referenceLabel = document.createElement("h3"); referenceLabel.textContent = "Reference source";
    const copyReference = document.createElement("button"); copyReference.type = "button"; copyReference.textContent = "Copy"; copyReference.setAttribute("aria-label", "Copy reference source");
    copyReference.disabled = !reference.source;
    copyReference.onclick = () => { void navigator.clipboard.writeText(reference.source).then(() => { status.textContent = "Reference source copied"; }).catch(() => {
      referenceEditor?.focus(); referenceEditor?.dispatch({ selection: { anchor: 0, head: referenceEditor.state.doc.length } }); status.textContent = "Press Ctrl+C / ⌘C to copy.";
    }); };
    referenceHeader.append(referenceLabel, copyReference); sections.append(referenceHeader);
    if (reference.description) { const hint = document.createElement("p"); hint.className = "pm-source-description"; hint.textContent = reference.description; sections.append(hint); }
    if (reference.source) {
      const referenceMount = document.createElement("div"); referenceMount.className = "pm-block-source-code";
      referenceEditor = new EditorView({ state: sourceState(reference.source, "Reference source"), parent: referenceMount }); sections.append(referenceMount);
    }
  } else sections.append(mount);
  dialog.append(header, sections, footer);
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    signal?.removeEventListener("abort", dispose);
    editor.destroy();
    referenceEditor?.destroy();
    dialog.remove();
    onClose();
  };
  signal?.addEventListener("abort", dispose, { once: true });
  dialog.onclose = dispose;
  document.body.append(dialog);
  dialog.showModal();
  editor.focus();
  return dialog;
}
