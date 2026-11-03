import { setUIText } from "../../shared/i18n";
import { api, escape as e, type Page } from "../../shared/types";
import type { HistoryEntry, HistoryRecord } from "../../vault/history";
import { diffHTML } from "./conflict-diff";
import "../vault/history-settings.css";

export async function openPageHistory(page: Page, options: {
  modal(title: string, body: string, wide?: boolean): HTMLDialogElement;
  restored(page: Page): Promise<void>;
}) {
  const base = `/pages/${encodeURIComponent(page.id)}/history`;
  const dialog = options.modal("Page history", `<p class="muted">${e(page.title)} <span data-i18n="· Preview a version before restoring it. Your current version is preserved when you restore.">· Preview a version before restoring it. Your current version is preserved when you restore.</span></p><p data-history-message role="status" data-i18n="Loading versions…">Loading versions…</p><div class="page-history-browser"><nav aria-label="Versions" data-history-list data-i18n-aria-label="Versions"></nav><section data-history-preview aria-label="Version preview" data-i18n-aria-label="Version preview"><p data-i18n="Select a version.">Select a version.</p></section></div>`, true);
  const message = dialog.querySelector<HTMLElement>("[data-history-message]")!;
  const list = dialog.querySelector<HTMLElement>("[data-history-list]")!;
  const preview = dialog.querySelector<HTMLElement>("[data-history-preview]")!;
  let generation = 0;
  try {
    const entries = await api<HistoryEntry[]>(base);
    if (!dialog.isConnected) return;
    message.textContent = entries.length ? `${entries.length} available versions` : "No earlier versions yet. Checkpoints appear as you edit.";
    for (const entry of entries) {
      const button = document.createElement("button"); button.type = "button"; button.className = "secondary-button history-version";
      button.innerHTML = `<strong>${e(entry.kind === "git" ? "Git" : "Snapshot")} · ${e(new Date(entry.createdAt).toLocaleString())}</strong><span>${e(entry.message)}</span>`;
      button.addEventListener("click", () => {
        const selected = ++generation;
        setUIText(preview, "Loading version…");
        list.querySelectorAll("button").forEach(item => item.setAttribute("aria-current", String(item === button)));
        void (async () => {
          setUIText(message, "Loading version…");
          try {
            const endpoint = `${base}/${entry.kind}/${entry.id}`, record = await api<HistoryRecord>(endpoint);
            if (!dialog.isConnected || selected !== generation) return;
            const { updated: _oldUpdated, ...oldMetadata } = record.metadata;
            preview.innerHTML = `<div class="history-preview-actions"><strong>${e(entry.message)}</strong><button type="button" class="primary-button" data-restore-history data-i18n="Restore this version">Restore this version</button></div>
              <details open><summary data-i18n="Markdown source">Markdown source</summary><pre data-history-source></pre></details><details><summary data-i18n="Page properties">Page properties</summary><pre data-history-metadata></pre></details><details><summary data-i18n="Changes from this version to the current page">Changes from this version to the current page</summary>${diffHTML(record.source, page.body)}</details>`;
            preview.querySelector<HTMLElement>("[data-history-source]")!.textContent = record.source;
            preview.querySelector<HTMLElement>("[data-history-metadata]")!.textContent = JSON.stringify(oldMetadata, null, 2);
            setUIText(message, "Preview ready. Restore applies this page's text and properties.");
            preview.querySelector<HTMLButtonElement>("[data-restore-history]")!.addEventListener("click", event => {
              const restore = event.currentTarget as HTMLButtonElement; restore.disabled = true;
              void (async () => {
                try {
                  setUIText(message, "Restoring version…");
                  const restored = await api<Page>(`${endpoint}/restore`, { method: "POST", body: JSON.stringify({ baseRevision: page.revision }) });
                  await options.restored(restored);
                } catch (error) { message.textContent = error instanceof Error ? error.message : "The version could not be restored."; restore.disabled = false; }
              })();
            });
          } catch (error) { if (selected === generation) message.textContent = error instanceof Error ? error.message : "Version could not be read."; }
        })();
      });
      list.append(button);
    }
  } catch (error) { message.textContent = error instanceof Error ? error.message : "History could not be loaded."; }
}
