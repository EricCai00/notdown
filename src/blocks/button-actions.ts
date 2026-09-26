import { isEditorKind } from "../document/node-identity";
import { Fragment, type Node as PMNode } from "prosemirror-model";
import { closeHistory } from "prosemirror-history";
import type { EditorState } from "prosemirror-state";
import { editorFingerprint } from "../document/editor-markdown";

export interface ButtonAction {
  type: string;
  position?: string;
  content?: string;
  target?: string;
  message?: string;
  [key: string]: unknown;
}
export const buttonPositions = { above: "Above button", below: "Below button", start: "At top of page", end: "At bottom of page" };
export const buttonActionNames: Record<string, string> = {
  "insert-blocks": "Insert blocks", "open-url": "Open page or URL", confirmation: "Show confirmation",
  "insert-text": "Insert text (legacy)", "toggle-tasks": "Toggle tasks (local)",
};

/** A string attribute keeps the local XML codec lossless, including unknown action fields. */
export function readButtonActions(attrs: PMNode["attrs"]): ButtonAction[] {
  if (attrs.actions !== "" && attrs.actions != null) {
    let value: unknown;
    try { value = JSON.parse(attrs.actions); } catch { throw new Error("Button actions contain invalid JSON. Repair them in source view."); }
    if (!Array.isArray(value) || value.length > 50 || value.some(a => !a || typeof a !== "object" || Array.isArray(a) || typeof a.type !== "string"))
      throw new Error("Button actions must be a list of up to 50 action objects. Repair them in source view.");
    return value;
  }
  return attrs.action ? [{ type: attrs.action, target: attrs.target || "" }] : [];
}

export function buttonTarget(value: string): { pageId: string } | { url: string } | null {
  const target = value.trim();
  if (/[\u0000-\u001f\u007f]/.test(target)) return null;
  if (/^#page\/[^\s/#?]+$/.test(target)) {
    try { return { pageId: decodeURIComponent(target.slice(6)) }; } catch { return null; }
  }
  if (!/^https?:\/\//i.test(target)) return null;
  try { const url = new URL(target); return url.hostname && !url.username && !url.password ? { url: url.href } : null; } catch { return null; }
}

export function validateButtonActions(actions: ButtonAction[]): string | undefined {
  if (!actions.length) return "Add an action to this button.";
  if (actions.length > 50) return "A button can have up to 50 actions.";
  for (const [index, action] of actions.entries()) {
    const prefix = `Step ${index + 1}: `;
    if (!Object.hasOwn(buttonActionNames, action.type)) return prefix + "This action is not supported. Its source has been preserved.";
    if (action.type === "insert-blocks" && (typeof action.content !== "string" || !action.content.trim())) return prefix + "Add blocks to insert.";
    if (action.type === "insert-blocks" && !Object.hasOwn(buttonPositions, action.position || "below")) return prefix + "Choose an insertion position.";
    if (action.type === "insert-text" && typeof action.target !== "string") return prefix + "Enter text to insert.";
    if (action.type === "confirmation" && (typeof action.message !== "string" || !action.message.trim())) return prefix + "Enter a confirmation message.";
    if (action.type === "open-url") {
      if (typeof action.target !== "string" || !buttonTarget(action.target)) return prefix + "Choose a page or enter a valid HTTP(S) URL.";
      if (index !== actions.length - 1) return prefix + "Opening a page or URL must be the last step.";
    }
  }
}

/** Exact insertion, never ProseMirror's fitting replacement (which can silently drop structure). */
export function buttonTransaction(state: EditorState, pos: number, original: PMNode, actions: ButtonAction[], parse: (source: string) => PMNode) {
  if (!state.doc.nodeAt(pos)?.eq(original)) throw new Error("This button changed. Run it again.");
  const error = validateButtonActions(actions); if (error) throw new Error(error);
  const tr = closeHistory(state.tr).setMeta("isolateHistory", true);
  const cursors = new Map<string, number>();
  for (const action of actions) {
    if (action.type === "insert-blocks" || action.type === "insert-text") {
      const position = action.type === "insert-text" ? "below" : action.position || "below";
      const buttonPos = tr.mapping.map(pos, 1);
      const at = cursors.get(position) ?? (position === "start" ? 0 : position === "end" ? tr.doc.content.size : buttonPos + (position === "below" ? original.nodeSize : 0));
      const parsed = action.type === "insert-text"
        ? Fragment.from(state.schema.nodes["block.paragraph"].create(null, action.target ? state.schema.text(action.target) : undefined))
        : parse(action.content!).content;
      if (action.type === "insert-blocks") {
        let marker = "NotdownButtonBoundary7E39";
        while (action.content!.includes(marker)) marker += "X";
        const surrounded = parse(marker + "\n\n" + action.content + "\n\n" + marker);
        let isolated = surrounded.childCount === parsed.childCount + 2 && surrounded.firstChild?.textContent === marker && surrounded.lastChild?.textContent === marker;
        if (isolated) parsed.forEach((node, _offset, index) => { if (editorFingerprint(node) !== editorFingerprint(surrounded.child(index + 1))) isolated = false; });
        if (!isolated) throw new Error("These blocks depend on surrounding text or have an unclosed boundary. Complete the template before inserting it.");
      }
      const fresh: PMNode[] = [];
      parsed.forEach(node => fresh.push(node.type.create({ ...node.attrs, sourceKey: null, sourceStart: null, sourceEnd: null }, node.content, node.marks)));
      const content = Fragment.fromArray(fresh);
      const $at = tr.doc.resolve(at);
      if (!$at.parent.canReplace($at.index(), $at.index(), content)) throw new Error("These blocks cannot be inserted here. Choose the top or bottom of the page.");
      tr.insert(at, content);
      for (const [key, cursor] of cursors) if (cursor >= at) cursors.set(key, cursor + content.size);
      cursors.set(position, at + content.size);
    } else if (action.type === "toggle-tasks") {
      tr.doc.descendants((node, at) => {
        if (isEditorKind(node, "task_list_item")) tr.setNodeMarkup(at, undefined, { ...node.attrs, checked: !node.attrs.checked });
      });
    }
  }
  tr.doc.check();
  return tr;
}
