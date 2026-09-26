import { createEditorNode } from "../../document/node-identity";
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
import { pageInputMatch, pageInputChoices, pageInputLabel, insertPageInput, type InputPage, type PageInputOptions } from "../../editor/page-reference-input";

type Match = { from: number; to: number; query: string };
const key = new PluginKey<{ dismissed: number | null }>("date-mention-input");
export function dateInputMatch(state: EditorState): Match | null {
  return pageInputMatch(state) ? null : pageInputMatch(state, true);
}
export function dateMentionInput(allowed: () => boolean, peopleAllowed: () => boolean = () => false, supplemental: () => boolean = () => false, pageOptions?: PageInputOptions) {
  type Choice = { kind: "date"; date: DateSuggestion } | { kind: "person"; person: Person } | { kind: "page"; page: InputPage } | { kind: "manage" };
  let panel: HTMLDivElement | undefined,
    active = -1,
    current: Match | null = null,
    view: EditorView;
  let composing = false, compositionEnd: ReturnType<typeof setTimeout> | undefined;
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
    ...(pageOptions ? pageInputChoices(pageOptions.pages(), query).slice(0, 12).map(page => ({ kind: "page" as const, page })) : []),
    ...(peopleAllowed() ? [{ kind: "manage" as const }] : []),
  ];
  const insertPerson = (person: Person, match: Match, doc = view.state.doc) => {
    if (view.isDestroyed || !view.editable || !peopleAllowed() || !view.state.doc.eq(doc) || !allPeople().some(item => item.id === person.id && !item.deleted)) return;
    const node = createEditorNode(view.state.schema, "mention", { kind: "user", label: person.name, nfmAttrs: { url: `person://${person.id}` } });
    const tr = closeHistory(view.state.tr.replaceWith(match.from, match.to, node));
    tr.setSelection(TextSelection.create(tr.doc, match.from + node.nodeSize));
    hide();
    view.dispatch(tr);
    view.focus();
  };
  const choose = (choice: Choice) => {
    const match = dateInputMatch(view.state);
    if (!match || !current || match.from !== current.from || !view.editable || composing || view.composing) {
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
    if (choice.kind === "page") {
      const page = pageOptions && pageInputChoices(pageOptions.pages(), "").find(page => page.id === choice.page.id);
      if (!page || !pageOptions) { hide(); return; }
      const tr = insertPageInput(view.state, { ...match, trigger: "@" }, page, pageOptions.allow);
      hide(); view.dispatch(tr); view.focus(); return;
    }
    const node = createEditorNode(view.state.schema, "mention", {
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
      if (choice.kind === "page" && choices.findIndex(item => item.kind === "page") === index) {
        const heading = document.createElement("div");
        heading.className = "pm-date-heading";
        heading.dataset.pageHeading = "";
        heading.textContent = "Pages";
        panel!.append(heading);
      }
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
      } else if (choice.kind === "page") {
        button.dataset.pageId = choice.page.id;
        button.textContent = pageInputLabel(choice.page, pageOptions!.pages());
      } else button.textContent = "Manage people…";
      button.onpointerdown = event => event.preventDefault();
      button.onclick = () => choose(choice);
      panel!.append(button);
    });
    if (allowed() && dateSuggestions(current.query).length) {
      const dates = document.createElement("div");
      renderDateSuggestions(dates, current.query, active - people.length, date => choose({ kind: "date", date }), supplemental());
      panel.insertBefore(dates, panel.querySelector("[data-page-heading], .pm-people-manage"));
    }
    panel.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  };
  const paint = () => {
    const match =
      (allowed() || peopleAllowed() || pageOptions) && view.editable && !composing && !view.composing && view.hasFocus()
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
      panel.setAttribute("aria-label", peopleAllowed() || pageOptions ? "Mention suggestions" : "Date suggestions");
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
        if (!panel || !current || composing || event.isComposing || view.composing || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey)
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
        if ((event.key === "Enter" || event.key === "Tab") && choices.length && (active >= 0 || choices[0].kind !== "manage")) {
          choose(choices[Math.max(0, active)]);
          return true;
        }
        return false;
      },
      handleDOMEvents: {
        compositionstart() {
          clearTimeout(compositionEnd);
          composing = true;
          hide();
          return false;
        },
        compositionend() {
          clearTimeout(compositionEnd);
          compositionEnd = setTimeout(() => { composing = false; if (!view.isDestroyed) paint(); }, 0);
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
          clearTimeout(compositionEnd);
          events.abort();
          hide();
        },
      };
    },
  });
}
