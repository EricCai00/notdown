import { Plugin, PluginKey, TextSelection, type EditorState } from "prosemirror-state";
import { closeHistory } from "prosemirror-history";
import type { EditorView } from "prosemirror-view";
import { createEditorNode, isEditorKind } from "../document/node-identity";
import { placeDatePanel } from "../features/dates/date-view";

export interface InputPage { id: string; title: string; parent?: string | null; trashed?: boolean }
export interface PageInputOptions {
  pages: () => InputPage[];
  currentPage?: () => InputPage | undefined;
  allow: (command: string) => boolean;
  create?: (title: string, parent: string | null) => Promise<InputPage | null>;
  onError: (error: unknown) => void;
}
export type PageInputMatch = { from: number; to: number; query: string; trigger: "[[" | "+" | "@" };
const key = new PluginKey<number | null>("page-reference-input");

/** Only unescaped, unformatted text at the caret can open a completion menu. */
export function pageInputMatch(state: EditorState, mention = false): PageInputMatch | null {
  const { selection } = state;
  if (!(selection instanceof TextSelection) || !selection.empty || !selection.$from.parent.isTextblock || selection.$from.parent.type.spec.code) return null;
  const { $from } = selection;
  const text = $from.parent.textBetween(0, $from.parentOffset, "\n", "\ufffc");
  const found = mention ? /(?:^|\s)(@)([^@\n\ufffc]{0,80})$/.exec(text)
    : /(?:\[\[([^\[\]|#\n\ufffc]{0,80})|(?:^|\s)\+([^\s+\n\ufffc][^+\n\ufffc]{0,79})?)$/.exec(text);
  if (!found) return null;
  const trigger = mention ? "@" : found[1] !== undefined ? "[[" : "+";
  const query = mention ? found[2] : found[1] ?? found[2] ?? "";
  // A bare '+ ' belongs to the existing bulleted-list input rule.
  if (trigger === "+" && /^\s/.test(query)) return null;
  const local = $from.parentOffset - query.length - trigger.length;
  const prefix = text.slice(0, local);
  if ((prefix.match(/\\+$/)?.[0].length ?? 0) % 2) return null;
  let ticks = 0;
  for (const run of prefix.matchAll(/(\\*)(`+)/g)) {
    if (run[1].length % 2) continue;
    if (!ticks) ticks = run[2].length;
    else if (ticks === run[2].length) ticks = 0;
  }
  if (ticks) return null;
  let protectedText = (state.storedMarks ?? $from.marks()).some(mark => mark.type.spec.code || isEditorKind(mark, "link"));
  $from.parent.nodesBetween(local, $from.parentOffset, node => {
    if (node.marks.some(mark => mark.type.spec.code || isEditorKind(mark, "link"))) protectedText = true;
  });
  return protectedText ? null : { from: $from.start() + local, to: selection.from, query, trigger };
}

export function pageInputChoices(pages: InputPage[], query: string): InputPage[] {
  const byId = new Map(pages.map(page => [page.id, page]));
  const visible = (page: InputPage) => {
    const seen = new Set<string>();
    let ancestor: InputPage | undefined = page;
    while (ancestor && !seen.has(ancestor.id)) {
      if (ancestor.trashed) return false;
      seen.add(ancestor.id);
      ancestor = ancestor.parent ? byId.get(ancestor.parent) : undefined;
    }
    return true;
  };
  const needle = query.trim().toLocaleLowerCase();
  return pages.filter(page => visible(page) && page.title.toLocaleLowerCase().includes(needle))
    .sort((a, b) => Number(b.title.toLocaleLowerCase() === needle) - Number(a.title.toLocaleLowerCase() === needle)
      || Number(b.title.toLocaleLowerCase().startsWith(needle)) - Number(a.title.toLocaleLowerCase().startsWith(needle))
      || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
}

export function pageInputLabel(page: InputPage, pages: InputPage[]): string {
  if (pages.filter(item => item.title === page.title).length < 2) return page.title;
  const parent = pages.find(item => item.id === page.parent);
  return `${page.title} · ${parent?.title || "Workspace"} · ${page.id.slice(0, 8)}`;
}

export function insertPageInput(state: EditorState, match: PageInputMatch, page: InputPage, allow: PageInputOptions["allow"]) {
  const marks = (state.storedMarks ?? state.selection.$from.marks()).filter(mark => !isEditorKind(mark, "link"));
  const wiki = allow("wiki_syntax"), mention = !wiki && allow("mention");
  const url = `#page/${encodeURIComponent(page.id)}`;
  const node = wiki || mention
    ? createEditorNode(state.schema, "page_link", { target: page.id, label: page.title, labelMode: "auto", syntaxForm: wiki ? "wiki" : "mention", ...(mention ? { url } : {}) }, null, marks)
    : state.schema.text(page.title || "Untitled", [...marks, state.schema.marks.link.create({ href: url })]);
  const $to = state.doc.resolve(match.to);
  const suffix = $to.parent.textBetween($to.parentOffset, Math.min($to.parentOffset + 2, $to.parent.content.size));
  const end = match.to + (match.trigger === "[[" && suffix === "]]" ? 2 : 0);
  const tr = closeHistory(state.tr).replaceWith(match.from, end, node).setMeta("isolateHistory", true);
  return tr.setSelection(TextSelection.create(tr.doc, match.from + node.nodeSize)).setStoredMarks(marks);
}

export function pageReferenceInput(options: PageInputOptions) {
  let view: EditorView, panel: HTMLDivElement | undefined, current: PageInputMatch | null = null;
  let active = 0, busy = false, composing = false, parent: string | null = null;
  let compositionEnd: ReturnType<typeof setTimeout> | undefined;
  type Choice = { page: InputPage } | { create: string };
  let choices: Choice[] = [];
  const hide = () => { panel?.remove(); panel = undefined; current = null; };
  const dismiss = () => { if (current) view.dispatch(view.state.tr.setMeta(key, current.from)); hide(); };
  const same = (a: PageInputMatch | null, b: PageInputMatch) => a?.from === b.from && a.to === b.to && a.query === b.query && a.trigger === b.trigger;
  const choose = async (choice: Choice) => {
    if (busy || composing || !view.editable || view.composing || !current || !same(pageInputMatch(view.state), current)) return;
    const match = current, doc = view.state.doc;
    try {
      let page: InputPage | null;
      if ("create" in choice) {
        if (!options.create) return;
        busy = true;
        panel?.setAttribute("aria-busy", "true");
        page = await options.create(choice.create, parent);
      } else page = pageInputChoices(options.pages(), "").find(page => page.id === choice.page.id) ?? null;
      // Navigation, edits, Escape and mode changes invalidate the pending insertion.
      if (!page || view.isDestroyed || !view.editable || !view.hasFocus() || !view.state.doc.eq(doc) || !same(current, match) || !same(pageInputMatch(view.state), match)) return;
      const tr = insertPageInput(view.state, match, page, options.allow);
      hide(); view.dispatch(tr.scrollIntoView()); view.focus();
    } catch (error) { options.onError(error); }
    finally { busy = false; if (!view.isDestroyed) paint(); }
  };
  const position = () => { if (panel && current) placeDatePanel(panel, view.coordsAtPos(current.from)); };
  const highlight = () => {
    panel?.querySelectorAll('[role="option"]').forEach((node, index) => {
      node.setAttribute("aria-selected", String(index === active));
      if (index === active) node.scrollIntoView({ block: "nearest" });
    });
  };
  const paint = () => {
    const match = view.editable && !composing && !view.composing && (view.hasFocus() || !!panel?.contains(document.activeElement)) ? pageInputMatch(view.state) : null;
    if (!match || key.getState(view.state) === match.from) { hide(); return; }
    if (!same(current, match)) active = 0;
    if (current?.from !== match.from) parent = options.currentPage?.()?.id ?? null;
    current = match;
    const pages = pageInputChoices(options.pages(), match.query).slice(0, 12);
    const create = options.create && match.query.trim() ? [{ create: match.query.trim() }] : [];
    choices = match.trigger === "+" ? [...create, ...pages.map(page => ({ page }))] : [...pages.map(page => ({ page })), ...create];
    active = Math.min(active, Math.max(0, choices.length - 1));
    if (!panel) {
      panel = document.createElement("div"); panel.className = "pm-date-panel pm-page-input";
      panel.setAttribute("aria-label", "Page suggestions");
      panel.onpointerdown = event => { if (!(event.target instanceof HTMLSelectElement)) event.preventDefault(); };
      document.body.append(panel);
    }
    panel.setAttribute("aria-busy", String(busy));
    const list = document.createElement("div"); list.setAttribute("role", "listbox"); list.setAttribute("aria-label", "Pages");
    choices.forEach((choice, index) => {
      const button = document.createElement("button"); button.type = "button"; button.className = "pm-people-choice";
      button.setAttribute("role", "option"); button.disabled = busy;
      button.textContent = "page" in choice ? pageInputLabel(choice.page, options.pages()) : `Create “${choice.create}”`;
      button.onclick = () => { view.focus(); void choose(choice); }; list.append(button);
    });
    if (!choices.length) { list.textContent = "No matching pages"; list.className = "pm-date-hint"; }
    panel.replaceChildren(list);
    if (create.length) {
      const label = document.createElement("label"); label.className = "pm-date-hint"; label.textContent = "Create in ";
      const select = document.createElement("select"); select.setAttribute("aria-label", "New page parent"); select.disabled = busy;
      const root = document.createElement("option"); root.value = ""; root.textContent = "Workspace (top level)"; select.append(root);
      pageInputChoices(options.pages(), "").forEach(page => {
        const item = document.createElement("option"); item.value = page.id; item.textContent = pageInputLabel(page, options.pages()); select.append(item);
      });
      select.value = parent ?? "";
      select.onchange = () => { parent = select.value || null; view.focus(); };
      label.append(select); panel.append(label);
    }
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
        return !mapped.deleted && pageInputMatch(state)?.from === mapped.pos ? mapped.pos : null;
      },
    },
    props: {
      handleKeyDown(_view, event) {
        if (!panel || !current || composing || event.isComposing || view.composing || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return false;
        if (event.key === "Escape") { dismiss(); return true; }
        if (busy) return event.key === "Enter" || event.key === "Tab";
        if (!choices.length) return false;
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          active = (active + (event.key === "ArrowDown" ? 1 : -1) + choices.length) % choices.length; highlight(); return true;
        }
        if (event.key === "Enter" || event.key === "Tab") { void choose(choices[active]); return true; }
        return false;
      },
      handleDOMEvents: {
        compositionstart() { clearTimeout(compositionEnd); composing = true; hide(); return false; },
        compositionend() {
          clearTimeout(compositionEnd);
          compositionEnd = setTimeout(() => { composing = false; if (!view.isDestroyed) paint(); }, 0);
          return false;
        },
      },
    },
    view(editor) {
      view = editor;
      const events = new AbortController(), signal = events.signal;
      document.addEventListener("pointerdown", event => { if (panel && !panel.contains(event.target as Node)) dismiss(); }, { signal, capture: true });
      document.addEventListener("focusin", event => { if (panel && !panel.contains(event.target as Node) && !view.dom.contains(event.target as Node)) dismiss(); }, { signal });
      document.addEventListener("scroll", position, { signal, capture: true });
      window.addEventListener("resize", position, { signal });
      return { update: paint, destroy() { clearTimeout(compositionEnd); events.abort(); hide(); } };
    },
  });
}
