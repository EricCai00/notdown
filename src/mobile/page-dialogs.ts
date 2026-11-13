import { escape as e, type Page } from "../shared/types";
import type { PageInput } from "../vault/vault";
import type { MobileVault } from "./vault-api";

export function closeMobileDialog(dialog: HTMLDialogElement) {
  if (dialog.querySelector("[type=submit]:disabled, [data-confirm-trash]:disabled, [data-restore-history]:disabled")) return;
  dialog.close();
}

export function mobileDialog(title: string, body: string): HTMLDialogElement {
  const dialog = document.createElement("dialog");
  dialog.className = "mobile-page-dialog"; dialog.setAttribute("aria-label", title);
  dialog.innerHTML = `<header class="mobile-dialog-heading"><h2>${e(title)}</h2><button type="button" aria-label="Close dialog">×</button></header>${body}`;
  dialog.querySelector("header button")!.addEventListener("click", () => closeMobileDialog(dialog));
  dialog.addEventListener("cancel", event => {
    event.preventDefault(); closeMobileDialog(dialog);
  });
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  document.body.append(dialog); dialog.showModal();
  return dialog;
}

export function openMobilePageSettings(page: Page, pages: Page[], commit: (patch: PageInput) => Promise<void>) {
  const descendants = new Set([page.id]);
  let previousSize = 0;
  while (previousSize !== descendants.size) {
    previousSize = descendants.size;
    for (const candidate of pages) if (candidate.parent && descendants.has(candidate.parent)) descendants.add(candidate.id);
  }
  const dialog = mobileDialog("Page settings", `<form>
    <label>Page icon<input name="icon" aria-label="Page icon" value="${e(page.icon)}" placeholder="Emoji or icon name"></label>
    ${!page.dataSourceId ? `<label>Parent page<select name="parent" aria-label="Parent page"><option value="">Vault root</option>${pages.filter(candidate => !descendants.has(candidate.id)).map(candidate => `<option value="${e(candidate.id)}" ${candidate.id === page.parent ? "selected" : ""}>${e(candidate.title)}</option>`).join("")}</select></label>` : ""}
    <label>Properties (JSON object)<textarea name="properties" aria-label="Properties (JSON object)" rows="8" spellcheck="false">${e(JSON.stringify(page.properties, null, 2))}</textarea></label>
    <p>Properties are stored in metadata.json. Document YAML and Pandoc title blocks override these defaults.</p>
    <p role="status" data-message></p><button type="submit" class="primary-button">Save properties</button>
  </form>`);
  dialog.querySelector("form")!.onsubmit = event => {
    event.preventDefault();
    const submit = dialog.querySelector<HTMLButtonElement>("[type=submit]")!;
    const message = dialog.querySelector<HTMLElement>("[data-message]")!;
    void (async () => {
      submit.disabled = true;
      try {
        const properties = JSON.parse(dialog.querySelector<HTMLTextAreaElement>("textarea")!.value);
        if (!properties || Array.isArray(properties) || typeof properties !== "object") throw new Error("Properties must be a JSON object.");
        const parent = dialog.querySelector<HTMLSelectElement>("select");
        await commit({ properties, icon: dialog.querySelector<HTMLInputElement>("[name=icon]")!.value, ...(parent ? { parent: parent.value || null } : {}) });
        dialog.close();
      } catch (error) { message.textContent = error instanceof Error ? error.message : String(error); }
      finally { submit.disabled = false; }
    })();
  };
}

export async function openMobileTrash(vault: MobileVault, changed: () => Promise<void>) {
  const [all, sources] = await Promise.all([vault.list({ includeTrashed: true }), vault.databases.listSources(true)]);
  const dialog = mobileDialog("Trash", `<p>Restore pages and data sources to your notebook.</p><div class="mobile-trash-list"></div><p role="status" data-message></p>`);
  const list = dialog.querySelector<HTMLElement>(".mobile-trash-list")!;
  function row(title: string, restore: () => Promise<unknown>) {
    const item = document.createElement("div"), label = document.createElement("span"), button = document.createElement("button");
    label.textContent = title; button.type = "button"; button.textContent = "Restore"; button.setAttribute("aria-label", `Restore ${title}`);
    button.onclick = async () => {
      list.querySelectorAll("button").forEach(control => control.disabled = true);
      try {
        await restore(); await changed(); item.remove();
        if (!list.childElementCount) list.textContent = "Trash is empty.";
      } catch (error) { dialog.querySelector("[data-message]")!.textContent = error instanceof Error ? error.message : String(error); }
      finally { list.querySelectorAll("button").forEach(control => control.disabled = false); }
    };
    item.append(label, button); list.append(item);
  }
  for (const page of all.filter(page => page.trashed && !page.dataSourceTrashed))
    row(page.title, () => vault.update(page.id, { trashed: false }, page.revision));
  for (const source of sources.filter(source => source.trashed))
    row(source.title, async () => {
      const owner = await vault.databases.get(source.ownerDatabaseId!);
      return vault.databases.trashSource(source.id, { baseRevision: source.revision, databaseRevision: owner.database.revision, trashed: false });
    });
  if (!list.childElementCount) list.textContent = "Trash is empty.";
}
