import { api } from "../../shared/types";
import type { ChildPageSettingsSnapshot } from "../../shared/child-page-settings";

export async function mountChildPageSettings(container: HTMLElement, host: {
  beforeChange(): Promise<boolean>;
  afterChange(): Promise<void>;
  busy(value: boolean): void;
}) {
  const section = document.createElement("section");
  section.className = "settings-section child-page-settings";
  section.innerHTML = '<h3>Child pages</h3><p role="status">Loading child page settings…</p>';
  container.append(section);
  let state: ChildPageSettingsSnapshot;
  try { state = await api<ChildPageSettingsSnapshot>("/child-pages/settings"); }
  catch { section.querySelector("p")!.textContent = "Restart the local server to use child page settings."; return; }
  if (!section.isConnected) return;
  section.innerHTML = `<h3>Child pages</h3>
    <label class="switch-row"><span>Allow child pages without a block in the parent page</span><input type="checkbox" name="allowUninserted"></label>
    <p>Turning this off adds missing child page entries to the end of every parent page in this vault. Future saves keep entries present.</p>
    <label class="switch-row"><span>Automatically insert child page blocks</span><input type="checkbox" name="autoInsert"></label>
    <p>Insert an entry when a child page is created or moved into a parent. Required while child pages without entries are disallowed. Other Markdown dialects use standalone page links. Database records and database blocks keep their own behavior.</p>
    <p role="status" aria-live="polite"></p>`;
  const allow = section.querySelector<HTMLInputElement>('[name="allowUninserted"]')!;
  const auto = section.querySelector<HTMLInputElement>('[name="autoInsert"]')!;
  const status = section.querySelector<HTMLElement>('[role="status"]')!;
  const render = () => {
    allow.checked = state.settings.allowUninserted;
    auto.checked = !state.settings.allowUninserted || state.settings.autoInsert;
    auto.disabled = !state.settings.allowUninserted;
  };
  render();
  section.addEventListener("change", () => {
    const settings = { allowUninserted: allow.checked, autoInsert: auto.disabled ? state.settings.autoInsert : auto.checked };
    allow.disabled = true; auto.disabled = true;
    void (async () => {
      try {
        host.busy(true);
        if (!await host.beforeChange()) { status.textContent = "Save or resolve the current page before changing child page settings."; return; }
        status.textContent = settings.allowUninserted ? "Saving…" : "Adding missing child page entries…";
        state = await api<ChildPageSettingsSnapshot>("/child-pages/settings", { method: "PUT", body: JSON.stringify({ settings, baseRevision: state.revision }) });
        await host.afterChange();
        status.textContent = state.inserted ? `Saved. Added ${state.inserted} child page entries in ${state.updatedPages} parent pages.` : "Child page settings saved.";
      } catch (error) { status.textContent = error instanceof Error ? error.message : "Child page settings could not be saved."; }
      finally { allow.disabled = false; render(); host.busy(false); }
    })();
  });
}
