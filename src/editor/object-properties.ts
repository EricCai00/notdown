import { editorKind, isEditorKind } from "../document/node-identity";
import { Plugin } from "prosemirror-state";
import type { Node as PMNode } from "prosemirror-model";
import { resolveContentObject } from "../document/content-objects";
import { personId } from "../features/people/person";
import { hasOfficialDateTime } from "../document/notdown-boundary";
import { showEditorPanel } from "./editor-panel";

const fields: Record<string, Record<string, string>> = {
  link_mention: { url: "URL", label: "Label" },
  image: { src: "Image URL", alt: "Alternative text", title: "Title" },
  syntax_inline: { raw: "Source" },
  html_inline: { raw: "HTML source" },
  opaque_block: { raw: "Original source" },
  mention: { label: "Label", "@url": "Reference URL", "@start": "Date or start", "@end": "End date", "@reminder": "Reminder date and time" },
  footnote_reference: { label: "Footnote identifier" },
  citation: { url: "Source URL" },
};
/** Atom properties use document transactions and the active reader, like block fields. */
export function objectProperties(parse: (source: string) => PMNode, supplemental: () => boolean = () => false, imageCaption: () => boolean = () => false) {
  let dialog: HTMLDialogElement | undefined;
  return new Plugin({
    props: { handleDoubleClickOn(view, _pos, node, pos, event, direct) {
      if (!direct || !view.editable || !fields[editorKind(node)] || (isEditorKind(node, "mention") && (node.attrs.kind === "date" && supplemental() && !hasOfficialDateTime(node) || node.attrs.kind === "user" && personId(node.attrs.nfmAttrs.url)))) return false;
      dialog?.remove(); const element = dialog = document.createElement("dialog"); element.className = "pm-link-dialog";
      const heading = document.createElement("h3"); heading.textContent = resolveContentObject(node)?.name || "Content properties";
      const form = document.createElement("form"), output = document.createElement("output"); output.setAttribute("aria-live", "polite");
      const controls: Record<string, HTMLInputElement | HTMLTextAreaElement> = {};
      const visibleFields = isEditorKind(node, "mention") && node.attrs.kind === "date" && (!supplemental() || hasOfficialDateTime(node))
        ? { "@start": "Start date", "@end": "End date", "@startTime": "Start time", "@endTime": "End time", "@timeZone": "Time zone" }
        : isEditorKind(node, "image") && imageCaption() && view.state.doc.resolve(pos).parent.childCount === 1
          ? { src: "Image URL", alt: "Caption" }
        : fields[editorKind(node)];
      for (const [key, label] of Object.entries(visibleFields)) {
        if (key === "@reminder" && !supplemental()) continue;
        const row = document.createElement("label"); row.textContent = label;
        const control = key === "raw" ? document.createElement("textarea") : document.createElement("input");
        control.value = String(key.startsWith("@") ? node.attrs.nfmAttrs?.[key.slice(1)] || "" : node.attrs[key] || "");
        control.setAttribute("aria-label", label); controls[key] = control; row.append(control); form.append(row);
      }
      const save = document.createElement("button"), cancel = document.createElement("button"); save.type = "submit"; save.textContent = "Save"; cancel.type = "button"; cancel.textContent = "Cancel"; cancel.onclick = () => element.close();
      form.append(output, save, cancel); element.append(heading, form); document.body.append(element);
      element.onclose = () => element.remove();
      const original = view.state.doc;
      form.onsubmit = e => {
        e.preventDefault();
        if (!view.state.doc.eq(original)) { output.textContent = "Content changed. Close and reopen its properties."; return; }
        const attrs: Record<string, any> = { ...node.attrs, nfmAttrs: { ...node.attrs.nfmAttrs } };
        for (const [key, input] of Object.entries(controls)) { if (key.startsWith("@")) { if (input.value) attrs.nfmAttrs[key.slice(1)] = input.value; else delete attrs.nfmAttrs[key.slice(1)]; } else attrs[key] = input.value; }
        let replacement = node.type.create(attrs, node.content, node.marks);
        if (["syntax_inline", "html_inline"].includes(editorKind(node))) {
          const parsed = parse(attrs.raw), child = parsed.firstChild?.firstChild;
          if (parsed.childCount !== 1 || parsed.firstChild?.childCount !== 1 || !child?.isInline) { output.textContent = "Enter one complete inline object."; return; }
          replacement = child.mark(node.marks);
        }
        view.dispatch(view.state.tr.replaceWith(pos, pos + node.nodeSize, replacement)); element.close(); view.focus();
      };
      showEditorPanel(element, heading.textContent!, view.dom); Object.values(controls)[0]?.focus({ preventScroll: true }); event.preventDefault(); return true;
    } },
    view: () => ({ destroy() { dialog?.remove(); } }),
  });
}
