import { api, escape as e } from "../../shared/types";
import type { DatabaseSourceSummary } from "./database-model";
import "./databases.css";

export type DatabaseCreation = { title: string; mode: "inline" | "full"; source?: DatabaseSourceSummary };
/** One creation flow: an owned source or a link produces the same database resource. */
export async function chooseDatabase(options: { inlineAllowed: boolean; create(draft: DatabaseCreation): Promise<void> }) {
  const dialog = document.createElement("dialog"); dialog.className = "database-create-dialog"; dialog.setAttribute("aria-label", "Create database");
  dialog.innerHTML = `<form><div class="dialog-heading"><h2>Database</h2><button type="button" data-cancel aria-label="Cancel">×</button></div><label>Name<input name="title" aria-label="Database name" value="New database" maxlength="500" required></label><label>Display<select name="mode" aria-label="Database display"><option value="inline" ${options.inlineAllowed ? "" : "disabled"}>Inline</option><option value="full" ${options.inlineAllowed ? "" : "selected"}>Full page</option></select></label><fieldset><legend>Data source</legend><label><input type="radio" name="start" value="new" checked>New data source</label><label><input type="radio" name="start" value="link">Link existing data source</label></fieldset><div data-sources hidden><label>Find a source<input type="search" aria-label="Find data source" placeholder="Source or database name"></label><div class="database-create-sources" role="listbox" aria-label="Available data sources"></div></div><p role="status"></p><div class="dialog-actions"><button type="button" data-cancel>Cancel</button><button class="primary-button" type="submit">Create database</button></div></form>`;
  document.body.append(dialog); dialog.showModal();
  const form = dialog.querySelector("form")!, name = dialog.querySelector<HTMLInputElement>('[name="title"]')!, mode = dialog.querySelector<HTMLSelectElement>('[name="mode"]')!, status = dialog.querySelector<HTMLElement>('[role="status"]')!;
  if (options.inlineAllowed) mode.value = "inline";
  let sources: DatabaseSourceSummary[] = [], selected: DatabaseSourceSummary | undefined, edited = false, busy = false;
  const search = dialog.querySelector<HTMLInputElement>('[type="search"]')!, list = dialog.querySelector<HTMLElement>('[role="listbox"]')!;
  name.oninput = () => edited = true;
  const linked = () => new FormData(form).get("start") === "link";
  const render = () => {
    const query = search.value.toLocaleLowerCase();
    list.innerHTML = sources.filter(source => `${source.title} ${source.ownerTitle}`.toLocaleLowerCase().includes(query)).map(source => `<button type="button" role="option" aria-selected="${selected?.id === source.id}" data-source="${e(source.id)}"><strong>${e(source.title)}</strong><small>From ${e(source.ownerTitle)}</small></button>`).join("") || '<p>No available sources</p>';
    list.querySelectorAll<HTMLButtonElement>("[data-source]").forEach(button => button.onclick = () => { selected = sources.find(source => source.id === button.dataset.source); if (!edited && selected) name.value = selected.title; render(); });
  };
  form.querySelectorAll<HTMLInputElement>('[name="start"]').forEach(radio => radio.onchange = () => { dialog.querySelector<HTMLElement>("[data-sources]")!.hidden = !linked(); if (!edited) name.value = linked() && selected ? selected.title : "New database"; });
  search.oninput = render;
  const done = new Promise<void>(resolve => {
    const close = () => { if (busy) return; dialog.close(); dialog.remove(); resolve(); };
    dialog.querySelectorAll<HTMLButtonElement>("[data-cancel]").forEach(button => button.onclick = close);
    dialog.oncancel = event => { event.preventDefault(); close(); };
    form.onsubmit = event => {
      event.preventDefault(); if (busy) return;
      if (linked() && !selected) { status.textContent = "Choose a data source."; return; }
      busy = true; form.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>("button,input,select").forEach(control => control.disabled = true);
      const start = form.querySelector<HTMLInputElement>('[name="start"][value="link"]')!.checked;
      void options.create({ title: name.value.trim(), mode: mode.value as "inline" | "full", ...(start ? { source: selected } : {}) }).then(() => { busy = false; close(); }).catch(error => { status.textContent = error instanceof Error ? error.message : String(error); }).finally(() => { busy = false; form.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>("button,input,select").forEach(control => control.disabled = false); if (!options.inlineAllowed) mode.querySelector<HTMLOptionElement>('[value="inline"]')!.disabled = true; });
    };
  });
  void api<DatabaseSourceSummary[]>("/data-sources").then(result => { sources = result; if (dialog.isConnected) render(); }).catch(error => { status.textContent = error instanceof Error ? error.message : String(error); });
  name.focus(); name.select(); await done;
}
