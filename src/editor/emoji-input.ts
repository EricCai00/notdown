import { isEditorKind } from "../document/node-identity";
import { Plugin, PluginKey, TextSelection, type EditorState } from "prosemirror-state";
import { closeHistory } from "prosemirror-history";
import type { EditorView } from "prosemirror-view";
import definitions from "markdown-it-emoji/lib/data/full.mjs";
import { emojiGroups, findEmoji } from "../blocks/emoji-catalog";
import { createElement, Search, Clock3, Smile, Leaf, Utensils, Volleyball, Plane, Lightbulb, CircleCheck, Flag } from "lucide";

type Match = { from: number; to: number; query: string };
export type EmojiChoice = { name: string; icon: string; shortcode?: string };
const normalizeIcon = (icon: string) => icon.replace(/\uFE0F/g, "");
const aliasesByIcon = new Map<string, string[]>();
for (const [name, icon] of Object.entries(definitions)) {
  const key = normalizeIcon(icon);
  aliasesByIcon.set(key, [...(aliasesByIcon.get(key) ?? []), name]);
}
const catalogByIcon = new Map(emojiGroups.flatMap(group => group.entries.map(([icon, name]) => {
  const shortcode = aliasesByIcon.get(normalizeIcon(icon))?.[0];
  return [normalizeIcon(icon), { icon, name, ...(shortcode ? { shortcode } : {}) }] as const;
})));
const choiceLabel = (choice: EmojiChoice) => choice.shortcode ? `:${choice.shortcode}:` : choice.name;
export const emojiCategories = [
  { name: "People", icon: Smile, groups: ["Smileys & Emotion", "People & Body", "Component"] },
  { name: "Nature", icon: Leaf, groups: ["Animals & Nature"] },
  { name: "Food & Drink", icon: Utensils, groups: ["Food & Drink"] },
  { name: "Activities", icon: Volleyball, groups: ["Activities"] },
  { name: "Travel & Places", icon: Plane, groups: ["Travel & Places"] },
  { name: "Objects", icon: Lightbulb, groups: ["Objects"] },
  { name: "Symbols", icon: CircleCheck, groups: ["Symbols"] },
  { name: "Flags", icon: Flag, groups: ["Flags"] },
].map(category => ({
  ...category,
  choices: emojiGroups.filter(group => category.groups.includes(group.name))
    .flatMap(group => group.entries.map(([icon]) => catalogByIcon.get(normalizeIcon(icon))!)),
}));
const recentKey = "notdown-shortcode-recent-emoji";
const categoryTabs = [{ name: "Search results", icon: Search }, { name: "Recent", icon: Clock3 }, ...emojiCategories];
const key = new PluginKey<number | null>("emoji-input");
let nextId = 0;

/** Search the complete Unicode catalog, plus aliases actually supported by the reader. */
export function emojiChoices(query: string): EmojiChoice[] {
  const needle = query.toLowerCase();
  if (!needle) return [];
  const names = new Set(findEmoji(needle.replace(/[_-]/g, " ")).map(([icon]) => icon));
  return [...catalogByIcon.values()].flatMap(choice => {
    const aliases = (aliasesByIcon.get(normalizeIcon(choice.icon)) ?? []).filter(alias => alias.includes(needle))
      .sort((a, b) => Number(b === needle) - Number(a === needle) || Number(b.startsWith(needle)) - Number(a.startsWith(needle)));
    return aliases.length ? [{ ...choice, shortcode: aliases[0] }] : names.has(choice.icon) ? [choice] : [];
  }).sort((a, b) => Number(b.shortcode === needle) - Number(a.shortcode === needle)
    || Number(b.shortcode?.startsWith(needle) ?? false) - Number(a.shortcode?.startsWith(needle) ?? false));
}

export function emojiSections(query: string) {
  const matches = emojiChoices(query);
  const order = new Map(matches.map((choice, index) => [choice.icon, index]));
  return emojiCategories.map(category => ({ name: category.name,
    choices: category.choices.filter(choice => order.has(choice.icon))
      .sort((a, b) => order.get(a.icon)! - order.get(b.icon)!)
      .map(choice => matches[order.get(choice.icon)!]),
  })).filter(section => section.choices.length);
}

export function emojiInputMatch(state: EditorState): Match | null {
  const { selection } = state;
  if (!(selection instanceof TextSelection) || !selection.empty
    || !selection.$from.parent.isTextblock || selection.$from.parent.type.spec.code) return null;
  const { $from } = selection;
  const text = $from.parent.textBetween(0, $from.parentOffset, "\n", node => isEditorKind(node, "hard_break") ? "\n" : "\ufffc");
  const match = /(?:^|\s):([a-zA-Z][a-zA-Z0-9_+-]{0,79})$/.exec(text);
  if (!match) return null;
  const local = $from.parentOffset - match[1].length - 1;
  // An unfinished Markdown code span is still ordinary text in the editor.
  if (/(?:^|[^\\])(?:\\\\)*`/.test(text.slice(0, local))) return null;
  let protectedText = (state.storedMarks ?? $from.marks()).some(mark => mark.type.spec.code || isEditorKind(mark, "link"));
  $from.parent.nodesBetween(local, $from.parentOffset, node => {
    if (node.marks.some(mark => mark.type.spec.code || isEditorKind(mark, "link"))) protectedText = true;
  });
  return protectedText ? null : { from: $from.start() + local, to: selection.from, query: match[1] };
}

export function emojiInput(allowed: () => boolean) {
  let view: EditorView, panel: HTMLDivElement | undefined;
  let current: Match | null = null, choices: EmojiChoice[] = [], active = 0;
  let rows: number[][] = [];
  let category = "Search results";
  const recent = (): EmojiChoice[] => {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(recentKey) || "[]");
      return Array.isArray(stored) ? [...new Set(stored)].slice(0, 32).flatMap(icon => {
        const entry = typeof icon === "string" ? catalogByIcon.get(normalizeIcon(icon)) : undefined;
        return entry ? [entry] : [];
      }) : [];
    } catch { return []; }
  };
  const id = `emoji-suggestions-${++nextId}`;
  const hide = () => {
    panel?.remove();
    panel = undefined;
    current = null;
    category = "Search results";
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
    try {
      localStorage.setItem(recentKey, JSON.stringify([choice.icon, ...recent().map(entry => entry.icon).filter(icon => icon !== choice.icon)].slice(0, 32)));
    } catch { /* Optional history must not prevent inserting an emoji. */ }
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
    panel.querySelector(".pm-emoji-caption")!.textContent = choices[active] ? choiceLabel(choices[active]) : "No recently used emoji";
    if (choices[active]) {
      view.dom.setAttribute("aria-activedescendant", `${id}-${active}`);
      const option = panel.querySelector<HTMLElement>(`#${id}-${active}`)!;
      const grid = panel.querySelector<HTMLElement>(".pm-emoji-results")!, item = option.getBoundingClientRect(), viewport = grid.getBoundingClientRect();
      if (item.top < viewport.top) grid.scrollTop -= viewport.top - item.top;
      else if (item.bottom > viewport.bottom) grid.scrollTop += item.bottom - viewport.bottom;
    } else view.dom.removeAttribute("aria-activedescendant");
  };
  const render = () => {
    if (!current) return;
    const sections = category === "Search results" ? emojiSections(current.query)
      : [{ name: category, choices: category === "Recent" ? recent() : emojiCategories.find(item => item.name === category)!.choices }];
    choices = sections.flatMap(section => section.choices);
    rows = [];
    active = Math.max(0, choices.findIndex(choice => choice.shortcode === current!.query.toLowerCase()));
    if (!panel) {
      panel = document.createElement("div");
      panel.className = "pm-emoji-suggestions";
      panel.onpointerdown = event => event.preventDefault();
      document.body.append(panel);
      view.dom.setAttribute("aria-controls", id);
    }
    const heading = document.createElement("div");
    heading.className = "pm-emoji-heading";
    heading.textContent = category;
    const results = document.createElement("div");
    results.className = "pm-emoji-results";
    results.id = id;
    results.setAttribute("role", "listbox");
    results.setAttribute("aria-label", "Emoji suggestions");
    let index = 0;
    sections.forEach((section, sectionIndex) => {
      const group = document.createElement("div");
      group.className = "pm-emoji-section";
      group.setAttribute("role", "group");
      group.setAttribute("aria-labelledby", `${id}-section-${sectionIndex}`);
      const title = document.createElement("div");
      title.className = "pm-emoji-section-title";
      title.id = `${id}-section-${sectionIndex}`;
      title.textContent = section.name;
      const grid = document.createElement("div");
      grid.className = "pm-emoji-grid";
      section.choices.forEach((choice, localIndex) => {
        const optionIndex = index++;
        if (localIndex % 8 === 0) rows.push([]);
        rows.at(-1)!.push(optionIndex);
        const option = document.createElement("button");
        option.type = "button";
        option.tabIndex = -1;
        option.id = `${id}-${optionIndex}`;
        option.setAttribute("role", "option");
        option.setAttribute("aria-label", choiceLabel(choice));
        option.title = choiceLabel(choice);
        option.textContent = choice.icon;
        option.onpointermove = () => { if (active !== optionIndex) { active = optionIndex; highlight(); } };
        option.onclick = () => choose(choice);
        grid.append(option);
      });
      group.append(title, grid);
      results.append(group);
    });
    const caption = document.createElement("div");
    caption.className = "pm-emoji-caption";
    const categories = document.createElement("nav");
    categories.className = "pm-emoji-category-bar";
    categories.setAttribute("aria-label", "Emoji categories");
    categoryTabs.forEach(tab => {
      const button = document.createElement("button");
      button.type = "button";
      button.tabIndex = -1;
      button.title = tab.name;
      button.setAttribute("aria-label", tab.name);
      button.setAttribute("aria-pressed", String(category === tab.name));
      button.append(createElement(tab.icon, { width: 18, height: 18, "aria-hidden": "true" }));
      button.onclick = () => { category = tab.name; render(); };
      categories.append(button);
    });
    panel.replaceChildren(heading, results, caption, categories);
    highlight();
    position();
  };
  const paint = () => {
    const match = allowed() && view.editable && !view.composing && view.hasFocus() ? emojiInputMatch(view.state) : null;
    if (!match || key.getState(view.state) === match.from) { hide(); return; }
    if (current?.from === match.from && current.query === match.query && panel) { position(); return; }
    if (!emojiChoices(match.query).length) { hide(); return; }
    current = match;
    category = "Search results";
    render();
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
        if (!panel || !current || event.isComposing || view.composing || event.ctrlKey || event.metaKey || event.shiftKey) return false;
        if (event.altKey) {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return false;
          const index = categoryTabs.findIndex(tab => tab.name === category);
          category = categoryTabs[(index + (event.key === "ArrowRight" ? 1 : -1) + categoryTabs.length) % categoryTabs.length].name;
          render();
          return true;
        }
        if (event.key === "Escape") { dismiss(); return true; }
        if (!choices.length) return false;
        const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -8, ArrowDown: 8 };
        if (event.key in offsets) {
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            const row = rows.findIndex(items => items.includes(active)), column = rows[row].indexOf(active);
            const next = rows[(row + (event.key === "ArrowDown" ? 1 : -1) + rows.length) % rows.length];
            active = next[Math.min(column, next.length - 1)];
          } else active = ((active + offsets[event.key]) % choices.length + choices.length) % choices.length;
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
