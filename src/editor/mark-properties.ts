import { editorKind, isEditorKind } from "../document/node-identity";
import { Plugin } from "prosemirror-state";
import type { Mark, Node as PMNode } from "prosemirror-model";
import { showEditorPanel } from "./editor-panel";

export function markProperties() {
  let dialog: HTMLDialogElement | undefined;
  return new Plugin({ props: { handleDoubleClick(view, position, event) {
    const resolved = view.state.doc.resolve(position), parent = resolved.parent;
    const childIndex = Math.min(resolved.index(), parent.childCount - 1);
    if (!view.editable || childIndex < 0) return false;
    const node = parent.child(childIndex);
    const mark = node.marks.find(m => ["critic", "abbreviation", "native_span"].includes(editorKind(m)) &&
      !(isEditorKind(m, "critic") && m.attrs.kind === "highlight"));
    if (!node.isText || !mark) return false;
    let pos = resolved.start(); for (let i = 0; i < childIndex; i++) pos += parent.child(i).nodeSize;
    let from = pos, to = pos + node.nodeSize, offset = resolved.start();
    const ranges: { from: number; to: number; node: PMNode }[] = [];
    parent.forEach(n => { ranges.push({ from: offset, to: offset + n.nodeSize, node: n }); offset += n.nodeSize; });
    const index = ranges.findIndex(r => r.from === pos);
    for (let i = index - 1; i >= 0 && mark.isInSet(ranges[i].node.marks); i--) from = ranges[i].from;
    for (let i = index + 1; i < ranges.length && mark.isInSet(ranges[i].node.marks); i++) to = ranges[i].to;
    dialog?.remove(); const element = dialog = document.createElement("dialog"); element.className = "pm-link-dialog";
    const form = document.createElement("form"), header = document.createElement("h3"); header.textContent = isEditorKind(mark, "critic") ? "Revision properties" : isEditorKind(mark, "abbreviation") ? "Abbreviation" : "Span properties";
    const controls = new Map<string, HTMLInputElement>();
    const values: Record<string, string> = isEditorKind(mark, "critic") ? { old: mark.attrs.old } : isEditorKind(mark, "abbreviation") ? { title: mark.attrs.title } : { id: mark.attrs.attributes.id || "", class: mark.attrs.attributes.class || "", lang: mark.attrs.attributes.lang || "" };
    for (const [key, value] of Object.entries(values)) { const label = document.createElement("label"), input = document.createElement("input"); label.textContent = ({ old: "Original text", title: "Expansion", id: "Identifier", class: "Classes", lang: "Language" } as Record<string,string>)[key]; input.value = value; input.setAttribute("aria-label", label.textContent); controls.set(key, input); label.append(input); form.append(label); }
    const save = document.createElement("button"), cancel = document.createElement("button"), output = document.createElement("output"); save.type = "submit"; save.textContent = "Save"; cancel.type = "button"; cancel.textContent = "Cancel"; cancel.onclick = () => element.close();
    form.append(output, save, cancel); element.append(header, form); document.body.append(element); element.onclose = () => element.remove();
    const original = view.state.doc;
    if (isEditorKind(mark, "critic") && ["addition", "deletion", "substitution"].includes(mark.attrs.kind)) {
      for (const accept of [true, false]) {
        const button = document.createElement("button"); button.type = "button"; button.textContent = accept ? "Accept revision" : "Reject revision";
        button.onclick = () => {
          if (!view.state.doc.eq(original)) { output.textContent = "Content changed. Reopen its properties."; return; }
          let tr = view.state.tr;
          if (accept && mark.attrs.kind === "deletion" || !accept && mark.attrs.kind === "addition") tr = tr.delete(from, to);
          else if (!accept && mark.attrs.kind === "substitution") {
            const old = String(mark.attrs.old || "");
            tr = old ? tr.replaceWith(from, to, view.state.schema.text(old, node.marks.filter(m => m.type !== mark.type))) : tr.delete(from, to);
          } else tr = tr.removeMark(from, to, mark);
          view.dispatch(tr); element.close(); view.focus();
        };
        form.append(button);
      }
      if (mark.attrs.kind !== "substitution") controls.get("old")!.parentElement!.hidden = true;
    }
    form.onsubmit = e => {
      e.preventDefault(); if (!view.state.doc.eq(original)) { output.textContent = "Content changed. Reopen its properties."; return; }
      const values = Object.fromEntries([...controls].map(([k,v]) => [k, v.value]));
      const next = mark.type.create(isEditorKind(mark, "native_span") ? { ...mark.attrs, attributes: { ...mark.attrs.attributes, ...values } } : { ...mark.attrs, ...values });
      let tr = view.state.tr.removeMark(from, to, mark).addMark(from, to, next);
      if (isEditorKind(mark, "abbreviation")) {
        const term = original.textBetween(from, to), rewrite = (raw: string) => raw.replace(/^( *\*\[([^\]\n]+)\]:[ \t]*)([^\r\n]*)/gm, (line, prefix, key) => key === term ? prefix + values.title : line);
        tr = tr.setDocAttribute("sourceGaps", original.attrs.sourceGaps.map(rewrite)).setDocAttribute("sourceSuffix", rewrite(original.attrs.sourceSuffix || ""));
        original.descendants((n, at) => { if (n.isText && n.text === term && n.marks.some((m: Mark) => m.type === mark.type)) tr.removeMark(at, at + n.nodeSize, mark.type).addMark(at, at + n.nodeSize, next); });
      }
      view.dispatch(tr); element.close(); view.focus();
    };
    showEditorPanel(element, header.textContent!, view.dom); controls.values().next().value?.focus({ preventScroll: true }); event.preventDefault(); return true;
  } }, view: () => ({ destroy() { dialog?.remove(); } }) });
}
