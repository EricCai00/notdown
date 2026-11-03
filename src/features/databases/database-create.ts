import { setUIAttribute, setUIText } from "../../shared/i18n";
import { api, escape as e } from "../../shared/types";
import type { DatabaseSourceSummary } from "./database-model";
import "./databases.css";

export type DatabaseCreation = { title: string; mode: "inline" | "full"; source?: DatabaseSourceSummary };
/** One creation flow: an owned source or a link produces the same database resource. */
export async function chooseDatabase(options: { inlineAllowed: boolean; create(draft: DatabaseCreation): Promise<void> }) {
  const dialog = document.createElement("dialog"); dialog.className = "database-create-dialog"; setUIAttribute(dialog, "aria-label", "Create database");
  dialog.innerHTML = `<form><div class="dialog-heading"><h2 data-i18n="Database">Database</h2><button type="button" data-cancel aria-label="Cancel" data-i18n-aria-label="Cancel">×</button></div><label><span data-i18n="Name">Name</span><input name="title" aria-label="Database name" value="New database" maxlength="500" required data-i18n-aria-label="Database name"></label><label><span data-i18n="Display">Display</span><select name="mode" aria-label="Database display" data-i18n-aria-label="Database display"><option value="inline" ${options.inlineAllowed ? "" : "disabled"} data-i18n="Inline">Inline</option><option value="full" ${options.inlineAllowed ? "" : "selected"} data-i18n="Full page">Full page</option></select></label><fieldset><legend data-i18n="Data source">Data source</legend><label><input type="radio" name="start" value="new" checked><span data-i18n="New data source">New data source</span></label><label><input type="radio" name="start" value="link"><span data-i18n="Link existing data source">Link existing data source</span></label></fieldset><div data-sources hidden><label><span data-i18n="Find a source">Find a source</span><input type="search" aria-label="Find data source" placeholder="Source or database name" data-i18n-placeholder="Source or database name" data-i18n-aria-label="Find data source"></label><div class="database-create-sources" role="listbox" aria-label="Available data sources" data-i18n-aria-label="Available data sources"></div></div><p role="status"></p><div class="dialog-actions"><button type="button" data-cancel data-i18n="Cancel">Cancel</button><button class="primary-button" type="submit" data-i18n="Create database">Create database</button></div></form>`;
  document.body.append(dialog); dialog.showModal();
  const form = dialog.querySelector("form")!, name = dialog.querySelector<HTMLInputElement>('[name="title"]')!, mode = dialog.querySelector<HTMLSelectElement>('[name="mode"]')!, status = dialog.querySelector<HTMLElement>('[role="status"]')!;
  if (options.inlineAllowed) mode.value = "inline";
  let sources: DatabaseSourceSummary[] = [], selected: DatabaseSourceSummary | undefined, edited = false, busy = false;
  const search = dialog.querySelector<HTMLInputElement>('[type="search"]')!, list = dialog.querySelector<HTMLElement>('[role="listbox"]')!;
  name.oninput = () => edited = true;
  const linked = () => new FormData(form).get("start") === "link";
  const render = () => {
    const query = search.value.toLocaleLowerCase();
    list.innerHTML = sources.filter(source => `${source.title} ${source.ownerTitle}`.toLocaleLowerCase().includes(query)).map(source => `<button type="button" role="option" aria-selected="${selected?.id === source.id}" data-source="${e(source.id)}"><strong>${e(source.title)}</strong><small><span data-i18n="From">From</span> ${e(source.ownerTitle)}</small></button>`).join("") || `<p data-i18n="No available sources">No available sources</p>`;
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
      if (linked() && !selected) { setUIText(status, "Choose a data source."); return; }
      busy = true; form.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>("button,input,select").forEach(control => control.disabled = true);
      const start = form.querySelector<HTMLInputElement>('[name="start"][value="link"]')!.checked;
      void options.create({ title: name.value.trim(), mode: mode.value as "inline" | "full", ...(start ? { source: selected } : {}) }).then(() => { busy = false; close(); }).catch(error => { status.textContent = error instanceof Error ? error.message : String(error); }).finally(() => { busy = false; form.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>("button,input,select").forEach(control => control.disabled = false); if (!options.inlineAllowed) mode.querySelector<HTMLOptionElement>('[value="inline"]')!.disabled = true; });
    };
  });
  void api<DatabaseSourceSummary[]>("/data-sources").then(result => { sources = result; if (dialog.isConnected) render(); }).catch(error => { status.textContent = error instanceof Error ? error.message : String(error); });
  name.focus(); name.select(); await done;
}
