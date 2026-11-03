import { setUIText, setUIAttribute } from "../shared/i18n";
import { apiUrl } from "../shared/vault-url";
import { isEditorKind } from "../document/node-identity";
import type { Node as PMNode } from "prosemirror-model";
import type { SyntaxConfig } from "../markdown-engine/config";
import { buildInlineInsertion, inlineChoices, inlineEncodings, type InlineEncoding, type InlineInsertion, type InlineObjectCommand } from "../document/inline-objects";
import { metadataValues } from "../markdown-engine/products";
import { showEditorPanel } from "./editor-panel";

export function inlineObjectDialog(command: InlineObjectCommand, config: SyntaxConfig, doc: PMNode, onInsert: (value: InlineInsertion) => void, onClose: () => void) {
  const dialog = document.createElement("dialog"); dialog.className = "pm-link-dialog";
  const title = document.createElement("h3"); title.textContent = "Insert " + command.replace(/_/g, " ");
  dialog.setAttribute("aria-label", title.textContent);
  const form = document.createElement("form"), encoding = document.createElement("select");
  const labels = { notion: "Notion URL citation", mmd: "MultiMarkdown", pandoc: "Pandoc citation", php: "PHP / Pandoc abbreviation", critic: "CriticMarkup" };
  for (const value of inlineEncodings(command, config)) { const option = document.createElement("option"); option.value = value; option.textContent = labels[value]; encoding.append(option); }
  const row = (name: string, input: HTMLElement) => { const label = document.createElement("label"); label.textContent = name; input.setAttribute("aria-label", name); label.append(input); form.append(label); return label; };
  row("Encoding", encoding);
  const controls: Record<string, HTMLInputElement | HTMLTextAreaElement> = {};
  let bibliography: Record<string, string> = {};
  const controller = new AbortController();
  const fields = document.createElement("div"), hint = document.createElement("p"); hint.className = "muted";
  const output = document.createElement("output"); output.setAttribute("role", "status");
  const save = document.createElement("button"), cancel = document.createElement("button");
  save.type = "submit"; setUIText(save, "Insert"); cancel.type = "button"; setUIText(cancel, "Cancel"); cancel.onclick = () => dialog.close();
  form.append(fields, hint, output, save, cancel); dialog.append(title, form);
  const render = () => {
    fields.replaceChildren(); for (const key of Object.keys(controls)) delete controls[key]; output.textContent = "";
    const add = (key: string, name: string, multiline = false) => {
      const label = document.createElement("label"); label.textContent = name;
      const input = multiline ? document.createElement("textarea") : document.createElement("input");
      input.setAttribute("aria-label", name); label.append(input); fields.append(label); controls[key] = input; return input;
    };
    if (encoding.value === "critic") {
      if (command !== "addition") add("old", "Original text", true);
      if (command !== "deletion") add("text", "New text", true);
      setUIText(hint, "One inline revision. Double-click an existing revision to edit it, accept it or reject it.");
    } else {
      const key = add("key", encoding.value === "notion" ? "Source URL" : command === "metadata_variable" ? "Variable name" : "Reference key");
      const choices = inlineChoices(doc, command, encoding.value as InlineEncoding);
      if (command === "citation" && encoding.value !== "notion") for (const [key, value] of Object.entries(bibliography)) if (!choices.has(key)) choices.set(key, value);
      if (choices.size) {
        const list = document.createElement("select"); setUIAttribute(list, "aria-label", "Existing references");
        const option = document.createElement("option"); option.value = ""; setUIText(option, "New reference"); list.append(option);
        for (const [value, text] of choices) { const option = document.createElement("option"); option.value = value; option.textContent = `${value} — ${text.slice(0, 90)}`; list.append(option); }
        fields.prepend(list); list.onchange = () => { key.value = list.value; if (controls.body) controls.body.value = inlineChoices(doc, command, encoding.value as InlineEncoding).get(list.value) || ""; };
      }
      if (["mmd", "php"].includes(encoding.value) && command !== "metadata_variable") add("body", "Definition", true);
      if (command === "citation" && encoding.value === "mmd") {
        const checkbox = add("inline", "Inline bibliography") as HTMLInputElement; checkbox.type = "checkbox";
        checkbox.onchange = () => { key.disabled = checkbox.checked; };
      }
      if (command === "citation" && encoding.value !== "notion") add("locator", "Locator (optional)");
      hint.textContent = encoding.value === "pandoc" ? "Use a key from the local bibliography file configured in document metadata. CSL preview requires Pandoc; the citation source remains editable."
        : command === "metadata_variable" ? "Reads existing body metadata. Missing names remain visible as unresolved variables."
        : encoding.value === "notion" ? "An inline link to the source URL."
        : "Reuse an existing definition, or create one with this reference. Definitions remain editable in the document.";
    }
  };
  encoding.onchange = render; render();
  form.onsubmit = event => {
    event.preventDefault();
    try { onInsert(buildInlineInsertion(command, encoding.value as InlineEncoding, Object.fromEntries(Object.entries(controls).map(([key, input]) => [key, input instanceof HTMLInputElement && input.type === "checkbox" ? String(input.checked) : input.value])), config, doc, bibliography)); dialog.close(); }
    catch (error) { output.textContent = error instanceof Error ? error.message : String(error); }
  };
  dialog.onclose = () => { controller.abort(); dialog.remove(); onClose(); }; document.body.append(dialog); showEditorPanel(dialog, title.textContent!); Object.values(controls)[0]?.focus({ preventScroll: true });
  if (command === "citation") {
    const metadata: Record<string, unknown> = {};
    doc.descendants(node => { if (isEditorKind(node, "syntax_block") && node.attrs.kind === "metadata") Object.assign(metadata, metadataValues(node.attrs.raw, node.attrs.metadataForm)); });
    const path = String(metadata.bibliography || metadata.bibtex || "");
    if (path) void fetch(apiUrl("/syntax/bibliography"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path }), signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error("Unable to read the local bibliography."); return response.json(); })
      .then(result => {
        if (!dialog.isConnected) return;
        bibliography = result.entries || {};
        const values = Object.fromEntries(Object.entries(controls).map(([key, input]) => [key, { value: input.value, checked: input instanceof HTMLInputElement && input.checked }]));
        const focused = Object.entries(controls).find(([, input]) => input === document.activeElement)?.[0];
        render(); for (const [key, saved] of Object.entries(values)) if (controls[key]) { controls[key].value = saved.value; if (controls[key] instanceof HTMLInputElement) (controls[key] as HTMLInputElement).checked = saved.checked; }
        if ((controls.inline as HTMLInputElement | undefined)?.checked && controls.key) controls.key.disabled = true;
        if (focused) controls[focused]?.focus();
      }).catch(error => { if (!controller.signal.aborted) output.textContent = String(error.message); });
  }
  return dialog;
}
