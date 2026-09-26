import { Plugin, PluginKey, TextSelection, type EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { closeHistory } from "prosemirror-history";
import { codeBlockInput, codeLanguageParams } from "./editor-input-rules";
import { codeLanguage, filterCodeLanguages, type CodeLanguage } from "./code-languages";
import { codeInputMode, codeInputPreferenceEvent, lastCodeLanguage, rememberCodeLanguage } from "./code-input-preferences";
import { inTableCell } from "./editor-table";

const key = new PluginKey<number | null>("code-fence-input");
type FenceMatch = { from: number; to: number; query: string };
let nextId = 0;

export function codeFenceMatch(state: EditorState): FenceMatch | null {
  const { selection } = state, { $from } = selection;
  if (!(selection instanceof TextSelection) || !selection.empty ||
      !$from.parent.isTextblock || $from.parent.type.spec.code || inTableCell(state) ||
      $from.parentOffset !== $from.parent.content.size) return null;
  const match = /^```([\p{L}\p{N}_+#.-]*)$/u.exec($from.parent.textContent);
  if (!match) return null;
  let protectedText = false;
  $from.parent.forEach(node => {
    if (!node.isText || node.marks.some(mark => mark.type.spec.code)) protectedText = true;
  });
  return protectedText ? null : { from: $from.start(), to: selection.from, query: match[1] };
}

export function codeFenceChoices(query: string): CodeLanguage[] {
  const exact = codeLanguage(query || lastCodeLanguage());
  return filterCodeLanguages(query).flatMap(group => group.languages)
    .sort((a, b) => Number(b === exact) - Number(a === exact)).slice(0, 30);
}

/** Complete the fence in-place; Enter creates the block without moving focus. */
export function codeFenceInput(allowed: () => boolean) {
  let view: EditorView, panel: HTMLDivElement | undefined, current: FenceMatch | null = null;
  let choices: CodeLanguage[] = [], active = -1;
  const id = `code-fence-languages-${++nextId}`;
  const enabled = () => allowed() && codeInputMode() === "markdown" && view.editable && !view.composing;
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
  const position = () => {
    if (!panel || !current) return;
    const rect = view.coordsAtPos(current.to), margin = 8;
    panel.style.left = `${Math.max(margin, Math.min(rect.left, innerWidth - panel.offsetWidth - margin))}px`;
    panel.style.top = `${Math.max(margin, Math.min(
      rect.bottom + panel.offsetHeight + margin <= innerHeight ? rect.bottom + 5 : rect.top - panel.offsetHeight - 5,
      innerHeight - panel.offsetHeight - margin))}px`;
  };
  const highlight = () => {
    panel?.querySelectorAll<HTMLElement>('[role="option"]').forEach((option, index) => {
      option.setAttribute("aria-selected", String(index === active));
      option.classList.toggle("is-current", index === active);
    });
    if (active >= 0) {
      view.dom.setAttribute("aria-activedescendant", `${id}-${active}`);
      panel?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
    } else view.dom.removeAttribute("aria-activedescendant");
  };
  const complete = (choice: CodeLanguage) => {
    const match = enabled() ? codeFenceMatch(view.state) : null;
    if (!match || !current || match.from !== current.from || match.query !== current.query) return;
    const spelling = choice.id.includes(" ")
      ? choice.aliases?.find(alias => /^[\p{L}\p{N}_+#.-]+$/u.test(alias)) ?? choice.id.replaceAll(" ", "-")
      : choice.id;
    const tr = view.state.tr.insertText(spelling, match.from + 3, match.to);
    tr.setSelection(TextSelection.create(tr.doc, match.from + 3 + spelling.length));
    view.dispatch(tr);
  };
  const paint = () => {
    const match = enabled() && view.hasFocus() ? codeFenceMatch(view.state) : null;
    if (!match || key.getState(view.state) === match.from) { hide(); return; }
    if (panel && current?.from === match.from && current.query === match.query) {
      view.dom.setAttribute("aria-controls", id);
      if (active >= 0) view.dom.setAttribute("aria-activedescendant", `${id}-${active}`);
      position(); return;
    }
    hide(); current = match;
    choices = codeFenceChoices(match.query);
    active = match.query && choices.length ? 0 : -1;
    panel = document.createElement("div");
    panel.className = "pm-code-language-menu pm-code-fence-menu";
    const list = document.createElement("div");
    list.className = "pm-code-language-list";
    list.id = id;
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-label", "Code language suggestions");
    choices.forEach((choice, index) => {
      const option = document.createElement("button");
      option.type = "button"; option.tabIndex = -1; option.id = `${id}-${index}`;
      option.textContent = choice.label; option.setAttribute("role", "option");
      option.addEventListener("pointerdown", event => event.preventDefault());
      option.addEventListener("click", () => complete(choice));
      list.append(option);
    });
    const hint = document.createElement("p");
    hint.className = "pm-code-fence-hint";
    hint.textContent = choices.length ? "↑↓ choose · Tab complete · Enter create" : "Enter to use this language";
    panel.append(list, hint); document.body.append(panel);
    view.dom.setAttribute("aria-controls", id);
    highlight(); position();
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
        return !mapped.deleted && codeFenceMatch(state)?.from === mapped.pos ? mapped.pos : null;
      },
    },
    props: {
      handleKeyDown(_view, event) {
        if (!enabled() || event.isComposing || event.keyCode === 229 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return false;
        const match = codeFenceMatch(view.state);
        if (!match) return false;
        if (event.key === "Enter") {
          const choice = panel && active >= 0 ? choices[active] : undefined;
          const params = choice ? codeLanguageParams(choice.id)
            : match.query ? codeLanguageParams(match.query) : lastCodeLanguage();
          const tr = codeBlockInput(view.state, match.from, match.to, params);
          if (!tr) return false;
          hide(); view.dispatch(closeHistory(tr).scrollIntoView());
          if (choice || match.query) rememberCodeLanguage(params);
          return true;
        }
        if (!panel) return false;
        if (event.key === "Escape") { dismiss(); return true; }
        if (!choices.length) return false;
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          active = active < 0 ? (event.key === "ArrowDown" ? 0 : choices.length - 1)
            : (active + (event.key === "ArrowDown" ? 1 : -1) + choices.length) % choices.length;
          highlight(); return true;
        }
        if (event.key === "Tab") { complete(choices[Math.max(0, active)]); return true; }
        return false;
      },
      handleDOMEvents: {
        blur() { hide(); return false; },
        focus() { queueMicrotask(() => { if (!view.isDestroyed) paint(); }); return false; },
        compositionstart() { hide(); return false; },
        compositionend() { queueMicrotask(() => { if (!view.isDestroyed) paint(); }); return false; },
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
      window.addEventListener(codeInputPreferenceEvent, paint, { signal });
      window.addEventListener("storage", paint, { signal });
      return { update: paint, destroy() { events.abort(); hide(); } };
    },
  });
}
