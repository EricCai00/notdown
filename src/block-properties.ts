import type { Node as PMNode } from "prosemirror-model";
import { Plugin, type EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { closeHistory } from "prosemirror-history";
import { objectFields } from "./object-model";
import { resolveContentObject } from "./content-objects";
import { metadataValues } from "./markdown-engine/products";
import { editMetadata } from "./markdown-engine/metadata-editing";
import { parseNative } from "./markdown-engine/codec";

export function blockPropertyFields(node: PMNode) {
  if (node.type.name === "syntax_block" && node.attrs.kind === "metadata") {
    return Object.entries(metadataValues(node.attrs.raw, node.attrs.metadataForm))
      .filter(([, value]) => value === null || typeof value !== "object")
      .map(([key, value]) => ({ key, label: "Metadata " + key, value: String(value ?? ""), multiline: true }));
  }
  return Object.entries(objectFields[node.type.name] || {}).map(([key, label]) => ({
    key, label,
    value: String(key.startsWith("@") ? node.attrs.nfmAttrs?.[key.slice(1)] ?? "" : node.attrs[key] ?? ""),
    multiline: ["html", "prompt", "target", "path", "description", "caption"].includes(key),
  }));
}

/** Build one undoable update, preserving attributes and rejecting stale targets. */
export function blockPropertiesTransaction(state: EditorState, pos: number, original: PMNode, values: Record<string, string>) {
  const node = state.doc.nodeAt(pos);
  if (!node?.eq(original)) throw new Error("This block changed. Close and reopen its properties.");
  const fields = blockPropertyFields(node);
  const changed = fields.filter(field => values[field.key] !== undefined && values[field.key] !== field.value);
  if (!changed.length) return null;
  if (node.type.name === "syntax_block" && node.attrs.kind === "metadata") {
    let raw = node.attrs.raw;
    for (const field of changed) raw = editMetadata(raw, node.attrs.metadataForm, field.key, values[field.key]);
    const parsed = parseNative(raw, node.attrs.config), next = parsed.firstChild;
    if (parsed.childCount !== 1 || next?.type !== node.type || next.attrs.kind !== "metadata")
      throw new Error("These values do not form a valid metadata block.");
    return closeHistory(state.tr).setNodeMarkup(pos, undefined, {
      ...node.attrs, ...next.attrs, sourceKey: node.attrs.sourceKey, source: null, sourceFingerprint: null,
    });
  }
  const attrs: Record<string, any> = { ...node.attrs, nfmAttrs: { ...node.attrs.nfmAttrs } };
  for (const { key } of changed) {
    if (key === "active") {
      const value = Number(values[key]);
      if (!values[key].trim() || !Number.isInteger(value) || value < 0 || value >= node.childCount)
        throw new Error(`Active tab must be an integer from 0 to ${node.childCount - 1}.`);
      attrs[key] = value;
    } else if (key.startsWith("@")) attrs.nfmAttrs[key.slice(1)] = values[key];
    else attrs[key] = values[key];
  }
  if (changed.some(field => field.key === "url") && node.type.name === "synced_block") {
    delete attrs.nfmAttrs["source-revision"];
    delete attrs.nfmAttrs["snapshot-hash"];
  }
  return closeHistory(state.tr).setNodeMarkup(pos, undefined, attrs);
}

const openers = new WeakMap<EditorView, (pos: number) => void>();
export function openBlockProperties(view: EditorView, pos: number) {
  if (view.state.doc.nodeAt(pos)?.type.name === "button") {
    if (view.editable) view.nodeDOM(pos)?.dispatchEvent(new Event("notdown-configure-button"));
    return;
  }
  openers.get(view)?.(pos);
}

export function blockProperties(supplemental: () => boolean = () => false) {
  let active: { pos: number; original: PMNode; dialog: HTMLDialogElement; save: HTMLButtonElement; output: HTMLOutputElement; valid: boolean } | undefined;
  return new Plugin({
    state: {
      init: () => null,
      apply(tr) {
        if (active?.valid && tr.docChanged) {
          const mapped = tr.mapping.mapResult(active.pos, 1);
          active.pos = mapped.pos;
          active.valid = !mapped.deleted && !!tr.doc.nodeAt(mapped.pos)?.eq(active.original);
        }
        return null;
      },
    },
    view(view) {
      openers.set(view, pos => {
        const node = view.state.doc.nodeAt(pos);
        if (!view.editable || !node) return;
        const fields = blockPropertyFields(node).filter(field => supplemental() || node.type.name !== "synced_block" || field.key !== "@id");
        if (!fields.length) return;
        active?.dialog.remove();
        const dialog = document.createElement("dialog"); dialog.className = "pm-block-properties-dialog";
        const title = (resolveContentObject(node)?.name || (node.type.name === "tab" ? "Tab" : "Block")) + " properties";
        dialog.setAttribute("aria-label", title);
        const header = document.createElement("header"), heading = document.createElement("h2"), close = document.createElement("button");
        heading.textContent = title; close.type = "button"; close.textContent = "×"; close.setAttribute("aria-label", "Close properties"); close.onclick = () => dialog.close();
        header.append(heading, close);
        const form = document.createElement("form"), body = document.createElement("div"), footer = document.createElement("footer");
        body.className = "pm-block-property-fields";
        const controls = new Map<string, HTMLInputElement | HTMLTextAreaElement>();
        for (const field of fields) {
          const row = document.createElement("label"), label = document.createElement("span"); label.textContent = field.label;
          const input = field.multiline ? document.createElement("textarea") : document.createElement("input");
          input.value = field.value; input.setAttribute("aria-label", field.label);
          if (input instanceof HTMLInputElement && field.key === "active") { input.type = "number"; input.min = "0"; input.max = String(node.childCount - 1); input.step = "1"; }
          row.append(label, input); body.append(row); controls.set(field.key, input);
        }
        const output = document.createElement("output"); output.setAttribute("aria-live", "polite");
        const save = document.createElement("button"), cancel = document.createElement("button");
        save.type = "submit"; save.textContent = "Save"; save.className = "primary";
        cancel.type = "button"; cancel.textContent = "Cancel"; cancel.onclick = () => dialog.close();
        footer.append(cancel, save); form.append(body, output, footer); dialog.append(header, form);
        const current = active = { pos, original: node, dialog, save, output, valid: true };
        dialog.onclose = () => { if (active === current) active = undefined; dialog.remove(); if (!active && !view.isDestroyed && view.dom.isConnected) view.focus(); };
        form.onsubmit = event => {
          event.preventDefault();
          if (!current.valid || !view.editable) return;
          try {
            const tr = blockPropertiesTransaction(view.state, current.pos, current.original, Object.fromEntries([...controls].map(([key, input]) => [key, input.value])));
            active = undefined;
            if (tr) { view.dispatch(tr); view.dispatch(closeHistory(view.state.tr).setMeta("addToHistory", false)); }
            dialog.close();
          } catch (error) { output.textContent = (error as Error).message; }
        };
        document.body.append(dialog); dialog.showModal(); controls.values().next().value?.focus();
      });
      return {
        update() {
          if (!active) return;
          if (!view.editable || !view.state.doc.nodeAt(active.pos)?.eq(active.original)) active.valid = false;
          if (!active.valid) { active.save.disabled = true; active.output.textContent = "This block changed or was removed. Close and reopen its properties."; }
        },
        destroy() { active?.dialog.remove(); active = undefined; openers.delete(view); },
      };
    },
  });
}
