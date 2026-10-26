import { api, escape as e } from "../../shared/types";
import "./vault-manager.css";

type Entry = { name: string; path: string; url: string };
type Hooks = { save(): Promise<boolean>; modal(title: string, body: string): HTMLDialogElement; close(): void };

export async function openVaultManager(currentPath: string, hooks: Hooks) {
  const dialog = hooks.modal("Knowledge bases", '<p role="status">Loading knowledge bases…</p>');
  dialog.classList.add("vault-manager-dialog", "workspace-settings-dialog");
  dialog.setAttribute("aria-label", "Knowledge bases");
  dialog.addEventListener("cancel", event => { event.preventDefault(); hooks.close(); });
  try {
    const state = await api<{ dataPath: string; vaults: Entry[] }>("/vaults");
    if (!dialog.isConnected) return;
    const content = document.createElement("div");
    content.className = "settings-body";
    content.innerHTML = `<p>Current vault</p><code class="vault-path">${e(currentPath)}</code>
      <label class="switch-row"><span>Open in a new tab</span><input type="checkbox" data-new-tab></label>
      <div class="vault-manager-list" aria-label="Known knowledge bases">${state.vaults.map((entry, index) => `<button class="secondary-button" data-vault-index="${index}" ${entry.path === currentPath ? "disabled" : ""}><strong>${e(entry.name)}${entry.path === currentPath ? " · Current" : ""}</strong><small>${e(entry.path)}</small></button>`).join("")}</div>
      <section class="settings-section"><h3>Create a new vault</h3><p>Default location: ${e(state.dataPath)}</p><form data-vault-create><label>Vault name<input name="name" maxlength="80" placeholder="My notes" required></label><label>Custom folder (optional)<input name="path" placeholder="Absolute path to a new or empty folder"></label><button type="submit" class="primary-button">Create vault</button></form></section>
      <section class="settings-section"><h3>Open an existing vault</h3><p>Enter the folder path on the computer running Notdown. It must contain pages/.</p><form data-vault-open><label>Existing vault folder<input name="path" placeholder="Absolute folder path" required></label><button type="submit" class="secondary-button">Open vault</button></form></section>
      <p role="status" data-vault-message></p>`;
    dialog.querySelector('[role="status"]')?.replaceWith(content);
    let busy = false;
    const open = async (input: object) => {
      if (busy) return;
      const tab = content.querySelector<HTMLInputElement>("[data-new-tab]")!.checked ? window.open("about:blank", "_blank") : null;
      if (tab) tab.opener = null;
      const message = content.querySelector<HTMLElement>("[data-vault-message]")!;
      if (content.querySelector<HTMLInputElement>("[data-new-tab]")!.checked && !tab) { message.textContent = "Allow pop-ups to open this vault in a new tab."; return; }
      busy = true;
      const controls = Array.from(content.querySelectorAll<HTMLButtonElement | HTMLInputElement>("button:not(:disabled), input:not(:disabled)"));
      controls.forEach(control => control.disabled = true);
      try {
        message.textContent = "Saving current edits…";
        if (!await hooks.save()) { tab?.close(); message.textContent = "Could not save current edits. Resolve the save error before switching vaults."; return; }
        if (!dialog.isConnected || !dialog.open) { tab?.close(); return; }
        const entry = await api<Entry>("/vaults/open", { method: "POST", body: JSON.stringify(input) });
        if (!dialog.isConnected || !dialog.open) { tab?.close(); return; }
        if (tab) { tab.location.replace(entry.url); hooks.close(); }
        else location.assign(entry.url);
      } catch (error) { tab?.close(); message.textContent = (error as Error).message; }
      finally { busy = false; controls.forEach(control => control.disabled = false); }
    };
    content.addEventListener("click", event => {
      const selected = (event.target as Element).closest<HTMLElement>("[data-vault-index]");
      if (selected) void open({ mode: "open", path: state.vaults[Number(selected.dataset.vaultIndex)].path });
    });
    for (const mode of ["create", "open"]) content.querySelector<HTMLFormElement>(`[data-vault-${mode}]`)!.addEventListener("submit", event => {
      event.preventDefault();
      const values = new FormData(event.currentTarget as HTMLFormElement);
      void open({ mode, name: values.get("name"), path: String(values.get("path") || "").trim() || undefined });
    });
  } catch (error) {
    const message = dialog.querySelector('[role="status"]');
    if (message) message.textContent = (error as Error).message;
  }
}
