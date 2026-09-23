import { Plugin, TextSelection, type Command } from "prosemirror-state";
import type { Node as PMNode } from "prosemirror-model";

export function editDefinition(action: "add" | "remove" | "up" | "down"): Command {
  return (state, dispatch) => {
    const { $from } = state.selection; let depth = $from.depth;
    while (depth && $from.node(depth).type.name !== "definition_list") depth--;
    if (!depth) return false;
    const list = $from.node(depth), groups: PMNode[][] = []; let selected = 0;
    list.forEach((node, _offset, index) => {
      if (!groups.length || node.type.name === "definition_term" && groups.at(-1)!.some(n => n.type.name === "definition_description")) groups.push([]);
      groups.at(-1)!.push(node); if (index === $from.index(depth)) selected = groups.length - 1;
    });
    if (action === "add") {
      groups.splice(selected + 1, 0, [state.schema.nodes.definition_term.create(null, state.schema.text("Term")), state.schema.nodes.definition_description.create(null, state.schema.nodes.paragraph.create(null, state.schema.text("Definition")))]); selected++;
    } else if (action === "remove") { if (groups.length < 2) return false; groups.splice(selected, 1); selected = Math.min(selected, groups.length - 1); }
    else { const target = selected + (action === "up" ? -1 : 1); if (target < 0 || target >= groups.length) return false; [groups[selected], groups[target]] = [groups[target], groups[selected]]; selected = target; }
    if (dispatch) {
      const pos = $from.before(depth), next = list.copy(state.schema.nodes.definition_list.create(null, groups.flat()).content);
      const target = pos + 2 + groups.slice(0, selected).flat().reduce((n, child) => n + child.nodeSize, 0);
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
