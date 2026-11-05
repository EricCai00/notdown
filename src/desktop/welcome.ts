import { vaultPickerHTML, bindVaultPicker, type VaultPickerState } from "../features/vault/vault-picker";
import { installUILanguage } from "../shared/i18n";
type WelcomeAPI = { managed(): Promise<VaultPickerState>; rememberLocation(path: string): Promise<void>; browse(path: string): Promise<string | null>; submit(input: object): Promise<void> };
const welcome = (window as unknown as { notdownWelcome: WelcomeAPI }).notdownWelcome;
const root = document.querySelector<HTMLElement>('#vault-picker')!;
installUILanguage();
async function render() {
  const state = await welcome.managed();
  root.innerHTML = vaultPickerHTML(state);
  const picker = bindVaultPicker(root, state, { rememberLocation: path => welcome.rememberLocation(path), browse: path => welcome.browse(path) });
  let busy = false;
  const open = async (input: object) => {
    if (busy || root.getAttribute('aria-busy') === 'true') return;
    busy = true;
    const controls = [...root.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button:not(:disabled),input:not(:disabled)')];
    controls.forEach(c => c.disabled = true);
    try { await picker.flush(); await welcome.submit(input); }
    catch (error) { root.querySelector('[data-vault-message]')!.textContent = (error as Error).message; }
    finally { busy = false; controls.forEach(c => c.disabled = false); }
  };
  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-vault-index]')) button.onclick = () => void open({ mode: 'open', path: state.vaults[Number(button.dataset.vaultIndex)].path });
  for (const mode of ['create', 'open']) root.querySelector<HTMLFormElement>(`[data-vault-${mode}]`)!.onsubmit = event => {
    event.preventDefault(); const values = new FormData(event.currentTarget as HTMLFormElement);
    void open({ mode, name: values.get('name'), path: String(values.get('path') || '').trim() || undefined });
  };
}
void render().catch(error => { root.textContent = String(error); });
