import { createElement, BookOpen, ChevronRight, FolderOpen, Plus, Check } from "lucide";

export type VaultPickerState = { dataPath: string; createLocation?: string; vaults: { name: string; path: string }[] };
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const label = (s: string) => `<span data-i18n="${s}">${s}</span>`;
const icon = (node: typeof BookOpen) => createElement(node, { width: 20, height: 20, "stroke-width": 1.65, "aria-hidden": "true", focusable: "false" }).outerHTML;
export function vaultPickerHTML(state: VaultPickerState, currentPath = "", newTab = false) {
  const folderField = (mode: string, title: string, value = "") => `<div class="vault-folder-field"><label for="vault-${mode}-path">${label(title)}</label><div class="vault-folder-control"><input id="vault-${mode}-path" name="path" value="${escape(value)}" placeholder="Choose a folder" data-i18n-placeholder="Choose a folder" required><button type="button" data-browse="${mode}">${icon(FolderOpen)}${label("Browse…")}</button></div></div>`;
  return `<div class="vault-picker">
    <div class="vault-list-heading"><h3>${label("Your Notdown vaults")}</h3>${newTab ? `<label class="vault-new-tab">${label("Open in a new tab")}<input type="checkbox" data-new-tab></label>` : ""}</div>
    <div class="vault-manager-list">${state.vaults.map((entry, index) => `<button class="vault-entry ${entry.path === currentPath ? "is-current" : ""}" data-vault-index="${index}" ${entry.path === currentPath ? 'disabled aria-current="true"' : ""}><span class="vault-entry-icon">${icon(BookOpen)}</span><span class="vault-entry-copy"><strong>${escape(entry.name)}</strong><small>${escape(entry.path)}</small></span>${entry.path === currentPath ? `<span class="vault-current-badge">${icon(Check)}${label("Current vault")}</span>` : icon(ChevronRight)}</button>`).join("") || `<p class="vault-empty">${label("Your vaults will appear here.")}</p>`}</div>
    <div class="vault-manager-actions">
      <section class="vault-action" data-create-panel><h3>${icon(Plus)}${label("Create a new vault")}</h3><form data-vault-create><label>${label("Vault name")}<input name="name" maxlength="80" placeholder="My notes" data-i18n-placeholder="My notes" required></label>${folderField("create", "Save location", state.createLocation)}<p class="vault-preview" data-preview></p><button type="submit" class="primary-button">${label("Create vault")}</button></form></section>
      <section class="vault-action" data-open-panel><h3>${icon(FolderOpen)}${label("Open an existing vault")}</h3><form data-vault-open>${folderField("open", "Existing vault folder")}<p class="vault-form-hint">${label("Choose the folder where your vault is saved.")}</p><button type="submit">${label("Open vault")}</button></form></section>
    </div>
    <p role="status" data-vault-message></p></div>`;
}
export function bindVaultPicker(root: HTMLElement, _state: VaultPickerState, options: { rememberLocation(path: string): Promise<void>; browse(path: string): Promise<string | null> }) {
  const create = root.querySelector<HTMLFormElement>('[data-vault-create]')!;
  const location = create.querySelector<HTMLInputElement>('input[name="path"]')!;
  const message = root.querySelector<HTMLElement>('[data-vault-message]')!;
  const preview = () => {
    const parent = location.value.trim().replace(/[\\/]+$/, '');
    const name = create.querySelector<HTMLInputElement>('input[name="name"]')!.value.trim();
    root.querySelector('[data-preview]')!.textContent = location.value.trim() && name ? parent + (location.value.includes('\\') ? '\\' : '/') + name : '';
  };
  // Remember drafts independently of the data root, even before Escape/close.
  let pending = Promise.resolve();
  const remember = () => {
    const value = location.value;
    pending = pending.catch(() => {}).then(() => options.rememberLocation(value));
    void pending.catch(error => { message.textContent = (error as Error).message; });
    return pending;
  };
  location.addEventListener('input', () => { void remember(); });
  create.addEventListener('input', preview); preview();
  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-browse]')) {
    button.addEventListener('click', () => void (async () => {
      if (root.getAttribute('aria-busy') === 'true') return;
      root.setAttribute('aria-busy', 'true'); message.textContent = '';
      const controls = [...root.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input:not(:disabled),button:not(:disabled)')];
      controls.forEach(c => c.disabled = true);
      try {
        const input = button.closest('form')!.querySelector<HTMLInputElement>('input[name="path"]')!;
        const path = await options.browse(input.value.trim());
        if (path) { input.value = path; preview(); if (input === location) await remember(); }
      } catch (error) { message.textContent = (error as Error).message; }
      finally { root.removeAttribute('aria-busy'); controls.forEach(c => c.disabled = false); }
    })());
  }
  return { flush: () => pending };
}
