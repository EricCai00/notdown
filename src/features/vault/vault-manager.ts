import { setUIAttribute, setUIText } from "../../shared/i18n";
import { api, escape as e } from "../../shared/types";
import { vaultPickerHTML, bindVaultPicker } from "./vault-picker";
import "./vault-picker.css";
import "./vault-manager.css";

type Entry = { name: string; path: string; url: string };
type Hooks = { save(): Promise<boolean>; modal(title: string, body: string): HTMLDialogElement; close(): void };

export async function openVaultManager(currentPath: string, hooks: Hooks) {
  const dialog = hooks.modal("Knowledge bases", `<p role="status" data-i18n="Loading knowledge bases…">Loading knowledge bases…</p>`);
  dialog.classList.add("vault-manager-dialog");
  setUIAttribute(dialog, "aria-label", "Knowledge bases");
  dialog.addEventListener("cancel", event => { event.preventDefault(); hooks.close(); });
  try {
    const state = await api<{ dataPath: string; createLocation: string; vaults: Entry[] }>("/vaults");
    if (!dialog.isConnected) return;
    const content = document.createElement("div");
    content.className = "settings-body";
    content.innerHTML = vaultPickerHTML(state, currentPath, true);
    dialog.querySelector('[role="status"]')?.replaceWith(content);
    const picker = bindVaultPicker(content, state, {
      rememberLocation: async path => { await api("/vaults/create-location", { method: "POST", body: JSON.stringify({ path }) }); },
      browse: async path => (await api<{ path: string | null }>("/vaults/browse", { method: "POST", body: JSON.stringify({ path }) })).path,
    });
    let busy = false;
    const open = async (input: object) => {
      if (busy || content.getAttribute("aria-busy") === "true") return;
      const tab = content.querySelector<HTMLInputElement>("[data-new-tab]")!.checked ? window.open("about:blank", "_blank") : null;
      if (tab) tab.opener = null;
      const message = content.querySelector<HTMLElement>("[data-vault-message]")!;
      if (content.querySelector<HTMLInputElement>("[data-new-tab]")!.checked && !tab) { setUIText(message, "Allow pop-ups to open this vault in a new tab."); return; }
      busy = true;
      const controls = Array.from(content.querySelectorAll<HTMLButtonElement | HTMLInputElement>("button:not(:disabled), input:not(:disabled)"));
      controls.forEach(control => control.disabled = true);
      try {
        await picker.flush();
        setUIText(message, "Saving current edits…");
        if (!await hooks.save()) { tab?.close(); setUIText(message, "Could not save current edits. Resolve the save error before switching vaults."); return; }
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
      if (selected && !selected.hasAttribute("disabled")) void open({ mode: "open", path: state.vaults[Number(selected.dataset.vaultIndex)].path });
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
