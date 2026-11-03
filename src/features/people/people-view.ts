import { setUIText } from "../../shared/i18n";
import { allPeople, peopleChanged, refreshPeople, savePerson } from "./people-client";
import { personFields, personInitials, searchPeople, type Person, type PersonInput } from "./person";
import { ApiError, escape as e } from "../../shared/types";
import "./people.css";

type Draft = { original?: Person; input: PersonInput };
// Per-window drafts survive closing/reopening the dialog; they never acquire a
// newer revision from a background refresh. YAML remains the persisted truth.
const drafts = new Map<string, Draft>();
window.addEventListener("beforeunload", event => {
  if (drafts.size) { event.preventDefault(); event.returnValue = ""; }
});
export function openPeople(options: { selectedId?: string; onSelect?: (person: Person) => void } = {}) {
  document.querySelector<HTMLDialogElement>(".people-dialog")?.close();
  const dialog = document.createElement("dialog");
  dialog.className = "people-dialog";
  dialog.setAttribute("aria-labelledby", "people-title");
  dialog.innerHTML = `<header class="people-header"><div><h2 id="people-title" data-i18n="People">People</h2><p data-i18n="Your local address book">Your local address book</p></div><button type="button" class="icon-button people-close" aria-label="Close people" data-i18n-aria-label="Close people">×</button></header>
    <div class="people-layout"><section class="people-directory" aria-label="Contact directory" data-i18n-aria-label="Contact directory"><div class="people-tools"><input type="search" aria-label="Search people" placeholder="Search people…" data-i18n-placeholder="Search people…" data-i18n-aria-label="Search people"><button type="button" class="secondary-button people-new" data-i18n="+ New person">+ New person</button><label class="people-deleted"><input type="checkbox"> <span data-i18n="Show deleted people">Show deleted people</span></label></div><div class="people-list" role="list" aria-label="People" data-i18n-aria-label="People"></div></section><section class="people-detail" aria-label="Person details" data-i18n-aria-label="Person details"></section></div><footer class="people-footer" data-i18n="Local contacts · Mention someone by typing @ in a note.">Local contacts · Mention someone by typing @ in a note.</footer>`;
  document.body.append(dialog);
  const events = new AbortController(), signal = events.signal;
  const list = dialog.querySelector<HTMLElement>(".people-list")!;
  const detail = dialog.querySelector<HTMLElement>(".people-detail")!;
  const search = dialog.querySelector<HTMLInputElement>('[data-i18n-aria-label="Search people"]')!;
  const deleted = dialog.querySelector<HTMLInputElement>('.people-deleted input')!;
  let selected = options.selectedId ?? "", busy = false, failure = false;
  let draft: Draft | undefined;
  function paintList() {
    const matches = searchPeople(allPeople(), search.value, deleted.checked);
    list.innerHTML = matches.length ? matches.map(person => `<div role="listitem"><button type="button" class="people-row ${person.id === selected ? "selected" : ""}" data-person="${e(person.id)}" aria-pressed="${person.id === selected}"><span class="person-avatar" aria-hidden="true">${e(personInitials(person.name))}</span><span><strong>${e(person.name)}</strong><small>${e(person.organization || person.email || person.phone || "Local contact")}</small></span></button></div>`).join("") : `<p class="people-empty">${search.value ? "No people match your search." : deleted.checked ? "No deleted people." : "No people yet. Add your first contact to mention them in notes."}</p>`;
    list.querySelectorAll<HTMLButtonElement>("[data-person]").forEach(button => {
      button.disabled = busy;
      button.onclick = () => select(button.dataset.person!);
    });
  }
  function select(id: string) {
    if (busy) return;
    selected = id;
    const original = allPeople().find(person => person.id === id);
    draft = drafts.get(id);
    if (!draft && (original || id === "new")) draft = { original, input: Object.fromEntries(personFields.map(field => [field, original?.[field] ?? ""])) };
    paintList();
    paintDetail();
  }
  function paintDetail() {
    if (!draft) {
      detail.innerHTML = `<div class="people-welcome"><span class="person-avatar" aria-hidden="true">@</span><h3>${selected ? "Person unavailable" : "Select or add a person"}</h3><p>${selected ? "This contact could not be found. Existing mentions keep their saved name." : "Add contact details and mention people in notes."}</p></div>`;
      return;
    }
    const original = draft.original, removed = original?.deleted;
    detail.innerHTML = `<form class="person-form"><div class="person-form-heading"><span class="person-avatar" aria-hidden="true">${e(personInitials(String(draft.input.name || "")))}</span><div><h3>${original ? "Contact details" : "New person"}</h3><p>${removed ? "Deleted contact · Existing mentions are preserved." : "A person in your address book, without an account or workspace access."}</p></div></div>
      ${personFields.map(field => `<label>${({ name: "Name", email: "Email", phone: "Phone", organization: "Organization", notes: "Notes" })[field]}${field === "name" ? " *" : ""}${field === "notes" ? `<textarea name="notes" aria-label="Notes" rows="4" maxlength="20000" ${removed ? "readonly" : ""}>${e(draft!.input.notes)}</textarea>` : `<input name="${field}" type="${field === "phone" ? "tel" : "text"}" ${field === "name" ? "required" : ""} maxlength="500" value="${e(draft!.input[field])}" ${removed ? "readonly" : ""}>`}</label>`).join("")}
      <output class="person-status" role="status"></output><div class="person-actions">${original ? `<button type="button" class="secondary-button person-delete">${removed ? "Restore person" : "Delete person"}</button>` : ""}<span></span>${original && !removed && options.onSelect ? `<button type="button" class="secondary-button person-mention" data-i18n="Mention person">Mention person</button>` : ""}${!removed ? `<button type="submit" class="primary-button" data-i18n="Save person">Save person</button>` : ""}</div></form>`;
    const form = detail.querySelector<HTMLFormElement>("form")!;
    form.oninput = () => {
      if (busy || !draft) return;
      draft.input = Object.fromEntries(personFields.map(field => [field, (form.elements.namedItem(field) as HTMLInputElement).value]));
      drafts.set(selected, draft);
      setUIText(detail.querySelector("output")!, "Unsaved changes");
    };
    form.onsubmit = event => { event.preventDefault(); void save(draft!.input); };
    detail.querySelector<HTMLButtonElement>(".person-delete")?.addEventListener("click", () => void save({ ...draft!.input, deleted: !removed }));
    detail.querySelector<HTMLButtonElement>(".person-mention")?.addEventListener("click", () => {
      const person = allPeople().find(person => person.id === selected && !person.deleted);
      if (!person) { setUIText(detail.querySelector("output")!, "This person is no longer available."); return; }
      dialog.close();
      options.onSelect?.(person);
    });
    detail.scrollTop = 0;
  }
  async function save(input: PersonInput) {
    if (busy || !draft) return;
    const savingDraft = draft;
    busy = true;
    dialog.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement>("button,input,textarea").forEach(element => { element.disabled = true; });
    setUIText(detail.querySelector("output")!, "Saving…");
    try {
      const person = await savePerson(input, savingDraft.original);
      drafts.delete(selected);
      selected = person.id;
      draft = { original: person, input: Object.fromEntries(personFields.map(field => [field, person[field]])) };
      deleted.checked = person.deleted;
      paintDetail();
      detail.querySelector("output")!.textContent = person.deleted ? "Person deleted. You can restore this contact here." : "Saved locally";
    } catch (error) {
      const status = detail.querySelector("output")!;
      status.textContent = error instanceof Error ? error.message : "Unable to save person.";
      if (error instanceof ApiError && error.status === 409) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "secondary-button";
        setUIText(button, "Review latest contact");
        button.onclick = () => {
          const latest = error.data.current as Person;
          const proposed = error.data.proposed as Person;
          status.replaceChildren();
          const comparison = document.createElement("pre");
          comparison.className = "person-conflict";
          comparison.textContent = personFields.map(field => `${field}\nOn disk: ${latest[field]}\nYour draft: ${proposed[field]}`).join("\n\n");
          const use = document.createElement("button");
          use.type = "button";
          use.className = "secondary-button";
          setUIText(use, "Load latest contact");
          use.onclick = () => { drafts.delete(selected); draft = { original: latest, input: Object.fromEntries(personFields.map(field => [field, latest[field]])) }; paintDetail(); };
          status.append(comparison, use);
        };
        status.append(" ", button);
      }
    } finally {
      busy = false;
      dialog.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement>("button,input,textarea").forEach(element => { element.disabled = false; });
      paintList();
    }
  }
  search.oninput = paintList;
  deleted.onchange = paintList;
  dialog.querySelector<HTMLButtonElement>(".people-new")!.onclick = () => { select("new"); detail.querySelector<HTMLInputElement>('[name="name"]')?.focus(); };
  dialog.querySelector<HTMLButtonElement>(".people-close")!.onclick = () => { if (!busy) dialog.close(); };
  dialog.addEventListener("cancel", event => { if (busy) event.preventDefault(); });
  dialog.addEventListener("close", () => { events.abort(); dialog.remove(); }, { once: true });
  document.addEventListener(peopleChanged, () => {
    paintList();
    // Only the directory refreshes. An open form keeps its captured revision.
  }, { signal });
  deleted.checked = allPeople().find(person => person.id === selected)?.deleted ?? false;
  select(selected);
  dialog.showModal();
  search.focus();
  void refreshPeople().then(() => {
    if (signal.aborted) return;
    if (!draft && selected) { deleted.checked = allPeople().find(person => person.id === selected)?.deleted ?? false; select(selected); }
    paintList();
  }).catch(error => {
    if (signal.aborted || failure) return;
    failure = true;
    list.textContent = `Unable to load people: ${error instanceof Error ? error.message : error}`;
    const retry = document.createElement("button");
    setUIText(retry, "Retry");
    retry.onclick = () => { dialog.close(); openPeople(options); };
    list.append(retry);
  });
}
