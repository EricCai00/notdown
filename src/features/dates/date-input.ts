import {
  Plugin,
  PluginKey,
  TextSelection,
  type EditorState,
} from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { closeHistory } from "prosemirror-history";
import { dateSuggestions, type DateSuggestion } from "./date-mention";
import { placeDatePanel, renderDateSuggestions } from "./date-view";
import { allPeople, peopleChanged, requestPeople } from "../people/people-client";
import { personInitials, searchPeople, type Person } from "../people/person";

type Match = { from: number; to: number; query: string };
const key = new PluginKey<{ dismissed: number | null }>("date-mention-input");
export function dateInputMatch(state: EditorState): Match | null {
  const { selection } = state;
  if (
    !(selection instanceof TextSelection) ||
    !selection.empty ||
    !selection.$from.parent.isTextblock ||
    selection.$from.parent.type.spec.code
  )
    return null;
  const { $from } = selection;
  const text = $from.parent.textBetween(0, $from.parentOffset, "\n", "\ufffc");
  const match = /(?:^|\s)@([^@\n\ufffc]{0,80})$/.exec(text);
  if (!match) return null;
  const local = $from.parentOffset - match[1].length - 1;
  let code = false;
  $from.parent.nodesBetween(local, $from.parentOffset, (node) => {
    if (node.marks.some((mark) => mark.type.spec.code)) code = true;
  });
  if (code) return null;
  return { from: $from.start() + local, to: selection.from, query: match[1] };
}
export function dateMentionInput(allowed: () => boolean, peopleAllowed: () => boolean = () => false, supplemental: () => boolean = () => false) {
  type Choice = { kind: "date"; date: DateSuggestion } | { kind: "person"; person: Person } | { kind: "manage" };
  let panel: HTMLDivElement | undefined,
    active = -1,
    current: Match | null = null,
    view: EditorView;
  const hide = () => {
    panel?.remove();
    panel = undefined;
    current = null;
  };
  const dismiss = () => {
    if (current) view.dispatch(view.state.tr.setMeta(key, current.from));
    hide();
  };
  const choicesFor = (query: string): Choice[] => [
    ...(peopleAllowed() ? searchPeople(allPeople(), query).slice(0, 12).map(person => ({ kind: "person" as const, person })) : []),
    ...(allowed() ? dateSuggestions(query).filter(date => supplemental() || !date.reminder).map(date => ({ kind: "date" as const, date })) : []),
    ...(peopleAllowed() ? [{ kind: "manage" as const }] : []),
  ];
  const insertPerson = (person: Person, match: Match, doc = view.state.doc) => {
    if (view.isDestroyed || !view.editable || !peopleAllowed() || !view.state.doc.eq(doc) || !allPeople().some(item => item.id === person.id && !item.deleted)) return;
    const node = view.state.schema.nodes.mention.create({ kind: "user", label: person.name, nfmAttrs: { url: `person://${person.id}` } });
    const tr = closeHistory(view.state.tr.replaceWith(match.from, match.to, node));
    tr.setSelection(TextSelection.create(tr.doc, match.from + node.nodeSize));
    hide();
    view.dispatch(tr);
    view.focus();
  };
  const choose = (choice: Choice) => {
    const match = dateInputMatch(view.state);
    if (!match || !current || match.from !== current.from || !view.editable) {
      hide();
      return;
    }
    if (choice.kind === "manage") {
      const doc = view.state.doc;
      dismiss();
      requestPeople({ onSelect: person => insertPerson(person, match, doc) });
      return;
    }
    if (choice.kind === "person") { insertPerson(choice.person, match); return; }
    const node = view.state.schema.nodes.mention.create({
      kind: "date",
      nfmAttrs: supplemental() ? choice.date.attrs : {
        start: choice.date.attrs.start.slice(0, 10),
        ...(choice.date.attrs.start.includes("T") ? { startTime: choice.date.attrs.start.slice(11, 16), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone } : {}),
      },
    });
    const tr = closeHistory(
      view.state.tr.replaceWith(match.from, match.to, node),
    );
    tr.setSelection(TextSelection.create(tr.doc, match.from + node.nodeSize));
    hide();
    view.dispatch(tr);
    view.focus();
  };
  const position = () => {
    if (panel && current) placeDatePanel(panel, view.coordsAtPos(current.from));
  };
  const renderChoices = () => {
    if (!panel || !current) return;
    panel.replaceChildren();
    const choices = choicesFor(current.query);
    const people = choices.filter(choice => choice.kind === "person");
    if (peopleAllowed()) {
      const heading = document.createElement("div");
      heading.className = "pm-date-heading";
      heading.textContent = "People";
      panel.append(heading);
      if (!people.length) {
        const hint = document.createElement("div");
        hint.className = "pm-date-hint";
        hint.textContent = current.query ? "No matching people" : "Add people to your address book";
        panel.append(hint);
      }
    }
    choices.forEach((choice, index) => {
      if (choice.kind === "date") return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = `pm-people-choice${choice.kind === "manage" ? " pm-people-manage" : ""}`;
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", String(index === active));
      if (choice.kind === "person") {
        button.dataset.personId = choice.person.id;
        const avatar = document.createElement("span");
        avatar.className = "person-avatar";
        avatar.setAttribute("aria-hidden", "true");
        avatar.textContent = personInitials(choice.person.name);
        const label = document.createElement("span");
        label.textContent = choice.person.name;
        const extra = document.createElement("small");
        extra.textContent = choice.person.organization || choice.person.email;
        label.append(extra);
        button.append(avatar, label);
      } else button.textContent = "Manage people…";
      button.onpointerdown = event => event.preventDefault();
      button.onclick = () => choose(choice);
      panel!.append(button);
    });
    if (allowed() && dateSuggestions(current.query).length) {
      const dates = document.createElement("div");
      renderDateSuggestions(dates, current.query, active - people.length, date => choose({ kind: "date", date }), supplemental());
      panel.insertBefore(dates, panel.querySelector(".pm-people-manage"));
    }
    panel.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  };
  const paint = () => {
    const match =
      (allowed() || peopleAllowed()) && view.editable && !view.composing && view.hasFocus()
        ? dateInputMatch(view.state)
        : null;
    if (
      !match ||
      key.getState(view.state)?.dismissed === match.from ||
      !choicesFor(match.query).length
    ) {
      hide();
      return;
    }
    if (match.query !== current?.query) active = -1;
    current = match;
    if (!panel) {
      panel = document.createElement("div");
      panel.className = "pm-date-panel pm-date-quick pm-mention-menu";
      panel.setAttribute("role", "listbox");
      panel.setAttribute("aria-label", peopleAllowed() ? "Mention suggestions" : "Date suggestions");
      document.body.append(panel);
    }
    renderChoices();
    position();
  };
  return new Plugin<{ dismissed: number | null }>({
    key,
    state: {
      init: () => ({ dismissed: null }),
      apply(tr, state) {
        const meta = tr.getMeta(key);
        if (typeof meta === "number") return { dismissed: meta };
        if (state.dismissed === null) return state;
        const mapped = tr.mapping.mapResult(state.dismissed);
        return {
          dismissed:
            mapped.deleted ||
            tr.doc.textBetween(
              mapped.pos,
              Math.min(mapped.pos + 1, tr.doc.content.size),
            ) !== "@"
              ? null
              : mapped.pos,
        };
      },
    },
    props: {
      handleKeyDown(_view, event) {
        if (!panel || !current || event.isComposing || view.composing)
          return false;
        const choices = choicesFor(current.query);
        if (event.key === "Escape") {
          dismiss();
          return true;
        }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          active =
            active < 0
              ? event.key === "ArrowDown"
                ? 0
                : choices.length - 1
              : (active +
                  (event.key === "ArrowDown" ? 1 : choices.length - 1)) %
                choices.length;
          renderChoices();
          return true;
        }
        if (event.key === "Enter" && choices.length && (active >= 0 || choices[0].kind !== "manage")) {
          choose(choices[Math.max(0, active)]);
          return true;
        }
        return false;
      },
      handleDOMEvents: {
        compositionstart() {
          hide();
          return false;
        },
        compositionend() {
          queueMicrotask(() => { if (!view.isDestroyed) paint(); });
          return false;
        },
      },
    },
    view(editor) {
      view = editor;
      const events = new AbortController(),
        signal = events.signal;
      document.addEventListener(peopleChanged, () => { active = -1; paint(); }, { signal });
      document.addEventListener(
        "pointerdown",
        (event) => {
          if (panel && !panel.contains(event.target as Node)) dismiss();
        },
        { signal, capture: true },
      );
      document.addEventListener(
        "focusin",
        (event) => {
          if (
            panel &&
            !panel.contains(event.target as Node) &&
            !view.dom.contains(event.target as Node)
          )
            dismiss();
        },
        { signal },
      );
      document.addEventListener("scroll", position, { signal, capture: true });
      window.addEventListener("resize", position, { signal });
      return {
        update() {
          paint();
        },
        destroy() {
          events.abort();
          hide();
        },
      };
    },
  });
}
