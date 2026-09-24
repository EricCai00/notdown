import { Plugin, PluginKey, TextSelection, type EditorState } from "prosemirror-state";
import { closeHistory } from "prosemirror-history";
import type { EditorView } from "prosemirror-view";
import definitions from "markdown-it-emoji/lib/data/full.mjs";

type Match = { from: number; to: number; query: string };
export type EmojiChoice = { name: string; icon: string };
const entries = Object.entries(definitions).map(([name, icon]) => ({ name, icon }));
const key = new PluginKey<number | null>("emoji-input");
let nextId = 0;

/** Use the reader's aliases so every suggested shortcode has the same meaning. */
export function emojiChoices(query: string): EmojiChoice[] {
  const needle = query.toLowerCase();
  if (!needle) return [];
  const seen = new Set<string>();
  return entries.filter(entry => entry.name.includes(needle))
    .sort((a, b) => Number(b.name === needle) - Number(a.name === needle)
      || Number(b.name.startsWith(needle)) - Number(a.name.startsWith(needle)))
    .filter(entry => !seen.has(entry.icon) && !!seen.add(entry.icon))
    .slice(0, 48);
}

export function emojiInputMatch(state: EditorState): Match | null {
  const { selection } = state;
  if (!(selection instanceof TextSelection) || !selection.empty
    || !selection.$from.parent.isTextblock || selection.$from.parent.type.spec.code) return null;
  const { $from } = selection;
  const text = $from.parent.textBetween(0, $from.parentOffset, "\n", "\ufffc");
  const match = /\s:([a-zA-Z][a-zA-Z0-9_+-]{0,79})$/.exec(text);
  if (!match) return null;
  const local = $from.parentOffset - match[1].length - 1;
  // An unfinished Markdown code span is still ordinary text in the editor.
  if (/(?:^|[^\\])(?:\\\\)*`/.test(text.slice(0, local))) return null;
  let protectedText = (state.storedMarks ?? $from.marks()).some(mark => mark.type.spec.code || mark.type.name === "link");
  $from.parent.nodesBetween(local, $from.parentOffset, node => {
    if (node.marks.some(mark => mark.type.spec.code || mark.type.name === "link")) protectedText = true;
  });
  return protectedText ? null : { from: $from.start() + local, to: selection.from, query: match[1] };
}

export function emojiInput(allowed: () => boolean) {
  let view: EditorView, panel: HTMLDivElement | undefined;
  let current: Match | null = null, choices: EmojiChoice[] = [], active = 0;
  const id = `emoji-suggestions-${++nextId}`;
  const hide = () => {
    panel?.remove();
    panel = undefined;
    current = null;
    view.dom.removeAttribute("aria-controls");
    view.dom.removeAttribute("aria-activedescendant");
  };
  const dismiss = () => {
    if (current) view.dispatch(view.state.tr.setMeta(key, current.from));
    hide();
  };
  const choose = (choice: EmojiChoice) => {
    const match = emojiInputMatch(view.state);
    if (!allowed() || !view.editable || !current || !match
      || match.from !== current.from || match.to !== current.to || match.query !== current.query) { hide(); return; }
    const tr = closeHistory(view.state.tr).insertText(choice.icon, match.from, match.to).setMeta("isolateHistory", true);
    tr.setSelection(TextSelection.create(tr.doc, match.from + choice.icon.length));
    hide();
    view.dispatch(tr.scrollIntoView());
    // Keep subsequent typing out of the completion's undo step as well.
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
    if (!panel) return;
    panel.querySelectorAll<HTMLElement>('[role="option"]').forEach((option, index) => {
      option.setAttribute("aria-selected", String(index === active));
    });
    panel.querySelector(".pm-emoji-caption")!.textContent = `:${choices[active].name}:`;
    view.dom.setAttribute("aria-activedescendant", `${id}-${active}`);
  };
  const paint = () => {
    const match = allowed() && view.editable && !view.composing && view.hasFocus() ? emojiInputMatch(view.state) : null;
    if (!match || key.getState(view.state) === match.from) { hide(); return; }
    if (current?.from === match.from && current.query === match.query && panel) { position(); return; }
    choices = emojiChoices(match.query);
    if (!choices.length) { hide(); return; }
    current = match;
    active = 0;
    if (!panel) {
      panel = document.createElement("div");
      panel.className = "pm-emoji-suggestions";
      panel.id = id;
      panel.setAttribute("role", "listbox");
      panel.setAttribute("aria-label", "Emoji suggestions");
      panel.onpointerdown = event => event.preventDefault();
      document.body.append(panel);
      view.dom.setAttribute("aria-controls", id);
    }
    const heading = document.createElement("div");
    heading.className = "pm-emoji-heading";
    heading.textContent = "Emoji";
    const grid = document.createElement("div");
    grid.className = "pm-emoji-grid";
    choices.forEach((choice, index) => {
      const option = document.createElement("button");
      option.type = "button";
      option.tabIndex = -1;
      option.id = `${id}-${index}`;
      option.setAttribute("role", "option");
      option.setAttribute("aria-label", `:${choice.name}:`);
      option.title = `:${choice.name}:`;
      option.textContent = choice.icon;
      option.onpointermove = () => { active = index; highlight(); };
      option.onclick = () => choose(choice);
      grid.append(option);
    });
    const caption = document.createElement("div");
    caption.className = "pm-emoji-caption";
    panel.replaceChildren(heading, grid, caption);
    highlight();
    position();
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
        return !mapped.deleted && emojiInputMatch(state)?.from === mapped.pos ? mapped.pos : null;
      },
    },
    props: {
      handleKeyDown(_view, event) {
        if (!panel || !current || event.isComposing || view.composing || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return false;
        if (event.key === "Escape") { dismiss(); return true; }
        const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -8, ArrowDown: 8 };
        if (event.key in offsets) {
          active = ((active + offsets[event.key]) % choices.length + choices.length) % choices.length;
          highlight();
          return true;
        }
        if (event.key === "Enter" || event.key === "Tab") { choose(choices[active]); return true; }
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
