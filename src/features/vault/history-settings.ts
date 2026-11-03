import { setUIText } from "../../shared/i18n";
import { api } from "../../shared/types";
import type { HistorySettings } from "../../vault/history";
import "./history-settings.css";

type Status = { settings: HistorySettings; revision: string; available: boolean; version?: string; repository?: string; latest?: string; error?: string; localOnly: boolean };
export async function mountHistorySettings(dialog: HTMLElement, beforeChange: () => Promise<boolean>) {
  const section = document.createElement("section"); section.className = "settings-section history-settings";
  section.innerHTML = `<h3 data-i18n="History">History</h3><p data-history-status role="status" data-i18n="Loading history settings…">Loading history settings…</p>`;
  const actions = dialog.querySelector(".dialog-actions");
  if (actions) actions.before(section); else dialog.append(section);
  let state: Status;
  try { state = await api<Status>("/history/settings"); }
  catch { setUIText(section.querySelector("p")!, "History settings need the updated local server. Restart Notdown to use this feature."); return; }
  if (!section.isConnected) return;
  section.innerHTML = `<h3 data-i18n="History">History</h3><p class="muted" data-i18n="Notes save as you type. History keeps checkpoints of your editing sessions.">Notes save as you type. History keeps checkpoints of your editing sessions.</p>
    <form data-history-form><div class="history-setting-fields">
    <label><span data-i18n="Checkpoint interval (minutes)">Checkpoint interval (minutes)</span><input name="intervalMinutes" type="number" min="1" max="60" value="${state.settings.intervalMinutes}" required></label>
    <label><span data-i18n="After editing stops (seconds)">After editing stops (seconds)</span><input name="idleSeconds" type="number" min="30" max="600" value="${state.settings.idleSeconds}" required></label>
    <label><span data-i18n="Keep automatic snapshots (days)">Keep automatic snapshots (days)</span><input name="retentionDays" type="number" min="1" max="3650" value="${state.settings.retentionDays}" required></label>
    <label><span data-i18n="Automatic versions per page">Automatic versions per page</span><input name="maxVersions" type="number" min="1" max="1000" value="${state.settings.maxVersions}" required></label></div>
    <label class="switch-row"><span data-i18n="Local Git history">Local Git history</span><input name="gitEnabled" type="checkbox" ${state.settings.gitEnabled ? "checked" : ""} ${!state.available && !state.settings.gitEnabled ? "disabled" : ""}></label>
    <p class="muted" data-i18n="Git keeps long-term versions of note text, page properties and contacts on this computer. Attachments and service credentials are excluded. No remote upload is configured.">Git keeps long-term versions of note text, page properties and contacts on this computer. Attachments and service credentials are excluded. No remote upload is configured.</p>
    <p data-history-git-detail class="muted"></p><button class="secondary-button" type="submit" data-i18n="Save history settings">Save history settings</button></form>
    <form data-history-checkpoint-form class="history-checkpoint-form"><label><span data-i18n="Name this checkpoint">Name this checkpoint</span><input name="message" maxlength="160" placeholder="Before a major revision" data-i18n-placeholder="Before a major revision"></label><button class="secondary-button" type="submit" data-history-checkpoint data-i18n="Create checkpoint">Create checkpoint</button></form>
    <p data-history-status role="status" aria-live="polite"></p>`;
  const form = section.querySelector<HTMLFormElement>("[data-history-form]")!;
  const status = section.querySelector<HTMLElement>("[data-history-status]")!;
  function summary() {
    section.querySelector<HTMLElement>("[data-history-git-detail]")!.textContent = !state.available ? "Git is unavailable. Install Git to enable long-term history."
      : state.settings.gitEnabled ? `Git history enabled${state.latest ? ` · ${state.latest.slice(0, 8)}` : ""}${state.error ? ` · ${state.error}` : ""}` : "Git history is off. Automatic snapshots remain enabled.";
    section.querySelector<HTMLButtonElement>("[data-history-checkpoint]")!.disabled = !state.available || !state.settings.gitEnabled;
  }
  summary();
  form.addEventListener("submit", event => {
    event.preventDefault();
    void (async () => {
      const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!; button.disabled = true;
      try {
        if (!await beforeChange()) { setUIText(status, "Save or resolve the current page before changing history settings."); return; }
        const data = new FormData(form), settings = { ...state.settings, gitEnabled: data.has("gitEnabled") };
        for (const key of ["intervalMinutes", "idleSeconds", "retentionDays", "maxVersions"] as const) settings[key] = Number(data.get(key));
        setUIText(status, "Saving history settings…");
        state = await api<Status>("/history/settings", { method: "PUT", body: JSON.stringify({ settings, baseRevision: state.revision }) });
        summary(); setUIText(status, "History settings saved.");
      } catch (error) { status.textContent = error instanceof Error ? error.message : "History settings could not be saved."; }
      finally { button.disabled = false; }
    })();
  });
  const checkpoint = section.querySelector<HTMLFormElement>("[data-history-checkpoint-form]")!;
  checkpoint.addEventListener("submit", event => {
    event.preventDefault();
    void (async () => {
      const button = checkpoint.querySelector<HTMLButtonElement>("button")!; button.disabled = true;
      try {
        if (!await beforeChange()) { setUIText(status, "Save or resolve the current page first."); return; }
        setUIText(status, "Creating checkpoint…");
        const result = await api<{ created: boolean; id: string }>("/history/checkpoint", { method: "POST", body: JSON.stringify({ message: String(new FormData(checkpoint).get("message") || "Manual checkpoint") }) });
        status.textContent = result.created ? `Checkpoint created · ${result.id.slice(0, 8)}` : "No changes since the latest Git checkpoint.";
      } catch (error) { status.textContent = error instanceof Error ? error.message : "Checkpoint could not be created."; }
      finally { summary(); }
    })();
  });
}
