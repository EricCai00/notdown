import { Fragment, type Node as PMNode } from "prosemirror-model";
import { Plugin, PluginKey, TextSelection, type EditorState } from "prosemirror-state";
import { closeHistory } from "prosemirror-history";
import type { EditorView } from "prosemirror-view";
import { createEditorNode, isEditorKind } from "../document/node-identity";

type Match = { from: number; to: number; query: string };
export type ExampleReferenceChoice = { label: string; number: number; text: string };
const key = new PluginKey<number | null>("example-reference-input");
let nextId = 0;

export function exampleReferenceChoices(doc: PMNode, query = ""): ExampleReferenceChoice[] {
  const labels = new Set<string>(), choices: ExampleReferenceChoice[] = [];
  const needle = query.trim().toLocaleLowerCase();
  doc.descendants(node => {
    if (!isEditorKind(node, "example_list_item") || !node.attrs.label || labels.has(node.attrs.label)) return;
    labels.add(node.attrs.label);
    const choice = { label: String(node.attrs.label), number: Number(node.attrs.number),
      text: (node.firstChild?.textContent || "").replace(/\s+/g, " ").trim() };
    if (`${choice.number} ${choice.label} ${choice.text}`.toLocaleLowerCase().includes(needle)) choices.push(choice);
  });
  return choices;
}

export function exampleReferenceMatch(state: EditorState): Match | null {
  const { selection } = state;
  if (!(selection instanceof TextSelection) || !selection.empty || !selection.$from.parent.isTextblock
    || selection.$from.parent.type.spec.code) return null;
  const { $from } = selection;
  const text = $from.parent.textBetween(0, $from.parentOffset, "\n", "\ufffc");
  const match = /\(@([^()\n\ufffc]{0,80})$/.exec(text);
  if (!match) return null;
  const local = $from.parentOffset - match[0].length, prefix = text.slice(0, local);
  if ((prefix.match(/\\+$/)?.[0].length ?? 0) % 2) return null;
  let codeDelimiter = 0;
  for (const span of prefix.matchAll(/(\\*)(`+)/g)) {
    if (span[1].length % 2) continue;
    if (!codeDelimiter) codeDelimiter = span[2].length;
    else if (codeDelimiter === span[2].length) codeDelimiter = 0;
  }
  if (codeDelimiter) return null;
  let protectedText = (state.storedMarks ?? $from.marks()).some(mark => mark.type.spec.code || isEditorKind(mark, "link"));
  $from.parent.nodesBetween(local, $from.parentOffset, node => {
    if (node.marks.some(mark => mark.type.spec.code || isEditorKind(mark, "link"))) protectedText = true;
  });
  return protectedText ? null : { from: $from.start() + local, to: selection.from, query: match[1] };
}

export function insertExampleReference(state: EditorState, label: string) {
  const match = exampleReferenceMatch(state), choice = exampleReferenceChoices(state.doc).find(item => item.label === label);
  if (!match || !choice) return null;
  const marks = state.storedMarks ?? state.selection.$from.marks();
  const reference = createEditorNode(state.schema, "syntax_inline", {
    kind: "example-reference", raw: "@" + choice.label, label: String(choice.number), target: "md-example-" + choice.label,
  }, null, marks);
  const closing = state.selection.$from.parent.textBetween(state.selection.$from.parentOffset,
    Math.min(state.selection.$from.parentOffset + 1, state.selection.$from.parent.content.size)) === ")";
  const tr = closeHistory(state.tr).replaceWith(match.from, match.to + Number(closing), Fragment.fromArray([
    state.schema.text("(", marks), reference, state.schema.text(")", marks),
  ])).setMeta("isolateHistory", true);
  return tr.setSelection(TextSelection.create(tr.doc, match.from + 3)).setStoredMarks(marks);
}

export function exampleReferenceInput(allowed: () => boolean) {
  let view: EditorView, panel: HTMLDivElement | undefined, current: Match | null = null;
  let choices: ExampleReferenceChoice[] = [], active = 0;
  const id = `example-references-${++nextId}`;
  const hide = () => {
    panel?.remove(); panel = undefined; current = null;
    if (view.dom.getAttribute("aria-controls") === id) {
      view.dom.removeAttribute("aria-controls");
      view.dom.removeAttribute("aria-activedescendant");
    }
  };
  const dismiss = () => {
    if (current) view.dispatch(view.state.tr.setMeta(key, current.from));
    hide();
  };
  const choose = (label: string) => {
    const match = exampleReferenceMatch(view.state);
    if (!allowed() || !view.editable || view.composing || !current || !match
      || match.from !== current.from || match.to !== current.to || match.query !== current.query) { hide(); return; }
    const tr = insertExampleReference(view.state, label);
    hide();
    if (!tr) return;
    view.dispatch(tr.scrollIntoView());
    view.dispatch(closeHistory(view.state.tr));
    view.focus();
  };
  const position = () => {
    if (!panel || !current) return;
    const caret = view.coordsAtPos(current.from), rect = panel.getBoundingClientRect();
    panel.style.left = `${Math.max(8, Math.min(caret.left, window.innerWidth - rect.width - 8))}px`;
    panel.style.top = `${Math.max(8, caret.bottom + rect.height + 8 <= window.innerHeight
      ? caret.bottom + 6 : caret.top - rect.height - 6)}px`;
  };
  const highlight = () => {
    panel?.querySelectorAll<HTMLElement>('[role="option"]').forEach((option, index) => {
      option.setAttribute("aria-selected", String(index === active));
      if (index === active) {
        view.dom.setAttribute("aria-activedescendant", option.id);
        option.scrollIntoView({ block: "nearest" });
      }
    });
    if (!choices.length) view.dom.removeAttribute("aria-activedescendant");
  };
  const paint = () => {
    const match = allowed() && view.editable && !view.composing && view.hasFocus() ? exampleReferenceMatch(view.state) : null;
    if (!match || key.getState(view.state) === match.from) { hide(); return; }
    const selectedLabel = current?.from === match.from && current.query === match.query ? choices[active]?.label : undefined;
    current = match;
    choices = exampleReferenceChoices(view.state.doc, match.query);
    active = Math.max(0, choices.findIndex(choice => choice.label === selectedLabel));
    if (!panel) {
      panel = document.createElement("div");
      panel.className = "pm-example-references";
      panel.id = id;
      panel.setAttribute("role", "listbox");
      panel.setAttribute("aria-label", "Example references");
      panel.onpointerdown = event => event.preventDefault();
      document.body.append(panel);
    }
    view.dom.setAttribute("aria-controls", id);
    const title = document.createElement("div");
    title.className = "pm-example-reference-hint";
    title.textContent = "Example references";
    const list = document.createElement("div");
    list.className = "pm-example-reference-options";
    choices.forEach((choice, index) => {
      const option = document.createElement("button");
      option.type = "button"; option.tabIndex = -1; option.id = `${id}-${index}`;
      option.setAttribute("role", "option");
      const text = document.createElement("span"), label = document.createElement("small");
      text.textContent = `${choice.number}. ${choice.text || "Untitled example"}`;
      label.textContent = "@" + choice.label;
      option.append(text, label);
      option.onclick = () => choose(choice.label);
      list.append(option);
    });
    if (!choices.length) {
      const empty = document.createElement("div");
      empty.className = "pm-example-reference-hint";
      empty.textContent = match.query ? "No matching examples" : "No labeled examples in this document";
      list.append(empty);
    }
    const hint = document.createElement("div");
    hint.className = "pm-example-reference-hint";
    hint.textContent = "↑ ↓ Select · Enter / Tab Insert · Esc Close";
    panel.replaceChildren(title, list, hint);
    position(); highlight();
  };
  return new Plugin<number | null>({
    key,
    state: {
      init: () => null,
      apply(tr, dismissed, _old, state) {
        const meta = tr.getMeta(key);
        if (typeof meta === "number") return meta;
        if (dismissed === null) return null;
        const mapped = tr.mapping.mapResult(dismissed);
        return !mapped.deleted && exampleReferenceMatch(state)?.from === mapped.pos ? mapped.pos : null;
      },
    },
    props: {
      handleKeyDown(_view, event) {
        if (!panel || !current || event.isComposing || view.composing || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return false;
        if (event.key === "Escape") { dismiss(); return true; }
        if (!choices.length) return false;
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          active = (active + (event.key === "ArrowDown" ? 1 : -1) + choices.length) % choices.length;
          highlight(); return true;
        }
        if (event.key === "Enter" || event.key === "Tab") { choose(choices[active].label); return true; }
        return false;
      },
      handleDOMEvents: {
        compositionstart() { hide(); return false; },
        compositionend() { queueMicrotask(() => { if (!view.isDestroyed) paint(); }); return false; },
        blur() { hide(); return false; },
      },
    },
    view(editor) {
      view = editor;
      const events = new AbortController(), signal = events.signal;
      document.addEventListener("pointerdown", event => {
        if (panel && !panel.contains(event.target as Node)) dismiss();
      }, { signal, capture: true });
      document.addEventListener("scroll", position, { signal, capture: true });
      window.addEventListener("resize", position, { signal });
      return { update: paint, destroy() { events.abort(); hide(); } };
    },
  });
}
