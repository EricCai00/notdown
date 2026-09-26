import { isEditorKind } from "../document/node-identity";
import { Plugin, TextSelection, type Command } from "prosemirror-state";
import type { Node as PMNode } from "prosemirror-model";

export function editDefinition(action: "add" | "remove" | "up" | "down"): Command {
  return (state, dispatch) => {
    const { $from } = state.selection; let depth = $from.depth;
    while (depth && !isEditorKind($from.node(depth), "definition_list")) depth--;
    if (!depth) return false;
    const list = $from.node(depth), groups: PMNode[] = []; let selected = $from.index(depth);
    list.forEach(node => groups.push(node));
    if (action === "add") {
      groups.splice(selected + 1, 0, state.schema.nodes["block.definition_list_item"].create(null, [state.schema.nodes["structure.definition_term"].create(null, state.schema.text("Term")), state.schema.nodes["structure.definition_description"].create(null, state.schema.nodes["block.paragraph"].create(null, state.schema.text("Definition")))])); selected++;
    } else if (action === "remove") { if (groups.length < 2) return false; groups.splice(selected, 1); selected = Math.min(selected, groups.length - 1); }
    else { const target = selected + (action === "up" ? -1 : 1); if (target < 0 || target >= groups.length) return false; [groups[selected], groups[target]] = [groups[target], groups[selected]]; selected = target; }
    if (dispatch) {
      const pos = $from.before(depth), next = list.type.create(list.attrs, groups, list.marks);
      const target = pos + 3 + groups.slice(0, selected).reduce((n, child) => n + child.nodeSize, 0);
      const tr = state.tr.replaceWith(pos, pos + list.nodeSize, next); dispatch(tr.setSelection(TextSelection.create(tr.doc, target)).scrollIntoView());
    }
    return true;
  };
}
export function definitionControls() {
  return new Plugin({ view(view) {
    const toolbar = document.createElement("div"); toolbar.className = "pm-table-tools"; toolbar.setAttribute("aria-label", "Definition list editing");
    const buttons: [HTMLButtonElement, Command][] = [];
    for (const [action, label] of Object.entries({ add: "Add definition", remove: "Remove definition", up: "Move definition up", down: "Move definition down" })) {
      const button = document.createElement("button"), command = editDefinition(action as Parameters<typeof editDefinition>[0]); button.type = "button"; button.textContent = label;
      button.onmousedown = e => e.preventDefault(); button.onclick = () => { command(view.state, view.dispatch); view.focus(); }; toolbar.append(button); buttons.push([button, command]);
    }
    view.dom.parentElement!.append(toolbar);
    const update = () => { let active = false; for (const [button, command] of buttons) { button.disabled = !view.editable || !command(view.state); active ||= !button.disabled; } toolbar.hidden = !active; };
    update(); return { update, destroy() { toolbar.remove(); } };
  } });
}
