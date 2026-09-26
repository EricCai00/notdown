import { isEditorKind } from "../document/node-identity";
import type { EditorView } from "prosemirror-view";
import { TextSelection } from "prosemirror-state";
import MarkdownIt from "markdown-it";
import DOMPurify from "dompurify";
import { mmdCitations, readMmdCitation, replaceMmdInlineBody } from "../document/mmd-citations";
import { parseNative } from "./codec";
import { createBacklinkIcon } from "../shared/icons";
import { showEditorPanel } from "../editor/editor-panel";
const markdown = new MarkdownIt({ html: false });
const ids = new WeakMap<EditorView, string>(); let serial = 0;

export function refreshMmdCitations(view: EditorView, bibliography: Record<string, string>) {
  const projection = mmdCitations(view.state.doc, bibliography);
  let prefix = ids.get(view); if (!prefix) { prefix = `mmd-${++serial}`; ids.set(view, prefix); }
  const root = view.dom.parentElement;
  let panel = root?.querySelector<HTMLElement>(".md-bibliography");
  if (!projection.entries.length && !projection.unused.length) { panel?.remove(); return; }
  if (!panel) { panel = document.createElement("aside"); panel.className = "md-bibliography"; panel.setAttribute("aria-label", "Bibliography"); root?.append(panel); }
  panel.replaceChildren(); const list = document.createElement("ol"); panel.append(list);
  const edit = (definition: typeof projection.unused[number], inline = false) => {
    const button = document.createElement("button"); button.type = "button"; button.textContent = "Edit definition"; button.disabled = !view.editable;
    button.onclick = () => {
      const original = view.state.doc, dialog = document.createElement("dialog"); dialog.className = "pm-link-dialog"; dialog.setAttribute("aria-label", "Citation definition");
      const form = document.createElement("form"), input = document.createElement("textarea"), output = document.createElement("output"); input.setAttribute("aria-label", "Definition source"); input.value = inline ? definition.body : definition.node.attrs.raw;
      const save = document.createElement("button"), cancel = document.createElement("button"); save.type = "submit"; save.textContent = "Save"; cancel.type = "button"; cancel.textContent = "Cancel"; cancel.onclick = () => dialog.close();
      form.append(input, output, save, cancel); dialog.append(form); document.body.append(dialog); dialog.onclose = () => dialog.remove();
      form.onsubmit = event => {
        event.preventDefault(); if (!view.dom.isConnected || !view.state.doc.eq(original)) { output.textContent = "Content changed. Reopen the definition."; return; }
        try {
          if (inline) {
            const source = replaceMmdInlineBody(definition.node.attrs.raw, input.value), citation = readMmdCitation(source)!;
            if (projection.entries.some(entry => entry.definition?.key === input.value) || projection.unused.some(definition => definition.key === input.value) || Object.hasOwn(bibliography, input.value))
              throw new Error("This text is already a reference key. Use a distinct inline bibliography description.");
            const label = citation.suppressed ? "" : `[${citation.locator ? citation.locator + ", " : ""}${citation.key}]`;
            view.dispatch(view.state.tr.setNodeMarkup(definition.pos, undefined, { ...definition.node.attrs, raw: source, label, title: input.value }));
          } else {
            const parsed = parseNative(input.value, definition.node.attrs.config), node = parsed.firstChild;
            if (parsed.childCount !== 1 || !isEditorKind(node, "syntax_block") || node.attrs.kind !== "definition" || node.attrs.data.key !== "#" + definition.key)
              throw new Error("Keep one complete definition with the same reference key.");
            view.dispatch(view.state.tr.setNodeMarkup(definition.pos, undefined, { ...node.attrs, sourceKey: definition.node.attrs.sourceKey }));
          }
          dialog.close(); view.focus();
        } catch (error) { output.textContent = error instanceof Error ? error.message : String(error); }
      };
      showEditorPanel(dialog, "Citation definition", view.dom); input.focus({ preventScroll: true });
    };
    return button;
  };
  for (const entry of projection.entries) {
    const item = document.createElement("li"); item.id = `${prefix}-entry-${entry.number}`;
    const body = document.createElement("span"); body.innerHTML = DOMPurify.sanitize(markdown.renderInline(entry.body)); item.append(body);
    if (entry.missing) { item.setAttribute("aria-invalid", "true"); item.title = "Citation definition not found: " + entry.key; const missing = document.createElement("small"); missing.textContent = " (unresolved)"; item.append(missing); }
    for (const pos of entry.references) {
      const back = document.createElement("a"); back.href = `#${prefix}-ref-${pos}`; back.className = "md-citation-backref"; back.append(createBacklinkIcon()); back.setAttribute("aria-label", "Back to citation");
      back.onclick = event => { event.preventDefault(); const dom = view.nodeDOM(pos); if (dom instanceof HTMLElement) { dom.scrollIntoView({ block: "center" }); view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(pos)))); view.focus(); } }; item.append(back);
    }
    if (entry.definition) item.append(edit(entry.definition));
    else if (entry.inline) item.append(edit(entry.inline, true));
    list.append(item);
  }
  for (const definition of projection.unused) {
    const item = document.createElement("p"); item.textContent = `Unused definition [#${definition.key}]: ${definition.body}`; item.append(edit(definition)); panel.append(item);
  }
  for (const ref of projection.refs) {
    const dom = view.nodeDOM(ref.pos); if (!(dom instanceof HTMLElement)) continue;
    dom.classList.add("md-mmd-citation");
    dom.id = `${prefix}-ref-${ref.pos}`; dom.textContent = ref.suppressed ? "" : ref.label;
    dom.setAttribute("aria-invalid", String(ref.missing)); dom.setAttribute("href", `#${prefix}-entry-${ref.number}`);
    const entry = projection.entries[ref.number - 1]; dom.title = ref.missing ? "Citation definition not found: " + entry.key : entry.body;
    dom.onclick = event => { event.preventDefault(); event.stopPropagation(); root?.querySelector(`#${prefix}-entry-${ref.number}`)?.scrollIntoView({ block: "center" }); };
  }
}
