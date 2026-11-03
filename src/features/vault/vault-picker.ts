export type VaultPickerState = { dataPath: string; vaults: { name: string; path: string }[] };
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const label = (s: string) => `<span data-i18n="${s}">${s}</span>`;
export function vaultPickerHTML(state: VaultPickerState, currentPath = "", newTab = false) {
  const e = escape;
  return `<div class="vault-picker">
    <div class="vault-list-heading"><h3>${label("Your Notdown vaults")}</h3>${newTab ? `<label class="switch-row">${label("Open in a new tab")}<input type="checkbox" data-new-tab></label>` : ""}</div>
    <div class="vault-manager-list">${state.vaults.map((entry, index) => `<button class="vault-entry ${entry.path === currentPath ? "is-current" : ""}" data-vault-index="${index}" ${entry.path === currentPath ? 'disabled aria-current="true"' : ""}><span class="vault-entry-icon" aria-hidden="true">▤</span><span class="vault-entry-copy"><strong>${e(entry.name)}</strong><small>${e(entry.path)}</small></span>${entry.path === currentPath ? `<span class="vault-current-badge">${label("Current vault")}</span>` : '<span aria-hidden="true">›</span>'}</button>`).join("") || `<p>${label("Your vaults will appear here.")}</p>`}</div>
    <div class="vault-manager-actions">
      <details class="settings-section" data-create-panel><summary>${label("Create a new vault")}</summary><form data-vault-create><label>${label("Vault name")}<input name="name" maxlength="80" placeholder="My notes" data-i18n-placeholder="My notes" required></label><details><summary>${label("Advanced options")}</summary><label>${label("Parent folder (this vault only)")}<input name="path" placeholder="Default save location" data-i18n-placeholder="Default save location"></label><button type="button" data-browse="create" hidden>${label("Browse…")}</button></details><p class="vault-preview" data-preview></p><button type="submit" class="primary-button">${label("Create vault")}</button></form></details>
      <details class="settings-section" data-open-panel><summary>${label("Open an existing vault")}</summary><form data-vault-open><label>${label("Existing vault folder")}<input name="path" required></label><button type="button" data-browse="open" hidden>${label("Browse…")}</button><button type="submit">${label("Open vault")}</button></form></details>
    </div>
    <details class="vault-location"><summary>${label("Default save location")}<span>${e(state.dataPath)}</span><span class="vault-change">${label("Change")}</span></summary><form data-vault-location><label>${label("Default save location")}<input name="path" value="${e(state.dataPath)}" required></label><button type="button" data-browse="location" hidden>${label("Browse…")}</button><p>${label("Applies to new vaults. Existing vaults stay where they are.")}</p><button type="submit">${label("Save")}</button></form></details>
    <p class="vault-host-hint">${label("Folders are on the computer running Notdown.")}</p><p role="status" data-vault-message></p></div>`;
}
export function bindVaultPicker(root: HTMLElement, state: VaultPickerState, options: { setLocation(path: string): Promise<void>; reload(): Promise<void>; browse?(): Promise<string | null> }) {
  const create = root.querySelector<HTMLFormElement>('[data-vault-create]')!;
  const preview = () => {
    const values = new FormData(create), parent = String(values.get('path') || state.dataPath).replace(/[\\/]+$/, '');
    root.querySelector('[data-preview]')!.textContent = parent + (parent.includes('\\') ? '\\' : '/') + (values.get('name') || 'My notes');
  };
  create.addEventListener('input', preview); preview();
  for (const panel of root.querySelectorAll<HTMLDetailsElement>('.vault-manager-actions > details')) panel.addEventListener('toggle', () => {
    if (panel.open) for (const other of root.querySelectorAll<HTMLDetailsElement>('.vault-manager-actions > details')) if (other !== panel) other.open = false;
  });
  const run = async (action: () => Promise<void>) => {
    if (root.getAttribute('aria-busy') === 'true') return;
    root.setAttribute('aria-busy', 'true');
    const controls = [...root.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input:not(:disabled),button:not(:disabled)')];
    controls.forEach(c => c.disabled = true);
    try { await action(); } catch (error) { root.querySelector('[data-vault-message]')!.textContent = (error as Error).message; }
    finally { root.removeAttribute('aria-busy'); controls.forEach(c => c.disabled = false); }
  };
  root.querySelector<HTMLFormElement>('[data-vault-location]')!.addEventListener('submit', event => {
    event.preventDefault(); const value = new FormData(event.currentTarget as HTMLFormElement).get('path');
    void run(async () => { await options.setLocation(String(value).trim()); await options.reload(); });
  });
  if (options.browse) for (const button of root.querySelectorAll<HTMLButtonElement>('[data-browse]')) {
    button.hidden = false;
    button.addEventListener('click', () => void run(async () => {
      const path = await options.browse!(); if (!path) return;
      button.closest('form')!.querySelector<HTMLInputElement>('input[name="path"]')!.value = path; preview();
    }));
  }
}
