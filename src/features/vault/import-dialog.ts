import { setUIAttribute, setUIText } from "../../shared/i18n";
import { api, escape as e } from "../../shared/types";
import "./import-dialog.css";

type Summary = { id: string; name: string; pages: number; attachments: number; files: { path: string; id: string }[]; errors: string[]; warnings: string[] };
export function openImportDialog(options: { save: () => Promise<boolean>; complete: (ids: string[]) => Promise<void> }) {
  document.querySelector(".import-dialog")?.remove();
  const dialog = document.createElement("dialog");
  dialog.className = "import-dialog";
  setUIAttribute(dialog, "aria-label", "Import Markdown folder");
  dialog.innerHTML = `<form method="dialog"><header><h2 data-i18n="Import Markdown folder">Import Markdown folder</h2><button aria-label="Close import" data-i18n-aria-label="Close import">×</button></header></form>
    <p data-i18n="Copy existing notes into this vault. Your source folder stays unchanged.">Copy existing notes into this vault. Your source folder stays unchanged.</p>
    <label><span data-i18n="Markdown dialect">Markdown dialect</span><select id="import-dialect"><option value="gfm">GitHub Flavored Markdown</option><option value="obsidian">Obsidian</option><option value="notdown">Notdown</option><option value="rmarkdown">R Markdown (.Rmd)</option><option value="quarto">Quarto (.md / .qmd)</option></select></label>
    <label class="import-picker"><span data-i18n="Choose a folder">Choose a folder</span><input id="import-files" type="file" webkitdirectory multiple></label>
    <p class="import-hint" data-i18n="Up to 500 files / 20 MB per import. Hidden files are excluded. Standard Markdown links and images are rebased; wiki links and HTML references need review. Original files are archived in the vault.">Up to 500 files / 20 MB per import. Hidden files are excluded. Standard Markdown links and images are rebased; wiki links and HTML references need review. Original files are archived in the vault.</p>
    <div id="import-preview" aria-live="polite"></div>
    <label id="import-skip-row" hidden><input id="import-skip" type="checkbox"><span data-i18n="Skip the invalid files listed above">Skip the invalid files listed above</span></label>
    <p id="import-status" role="status"></p>
    <footer><button id="import-cancel" data-i18n="Cancel">Cancel</button><button id="import-commit" class="primary-button" disabled data-i18n="Import copies">Import copies</button></footer>`;
  document.body.append(dialog);
  const input = dialog.querySelector<HTMLInputElement>("#import-files")!;
  const dialect = dialog.querySelector<HTMLSelectElement>("#import-dialect")!;
  const commit = dialog.querySelector<HTMLButtonElement>("#import-commit")!;
  const status = dialog.querySelector<HTMLElement>("#import-status")!;
  const skip = dialog.querySelector<HTMLInputElement>("#import-skip")!;
  let summary: Summary | null = null;
  let busy = false;
  const setBusy = (value: boolean) => {
    busy = value;
    input.disabled = value;
    dialect.disabled = value;
    dialog.querySelectorAll<HTMLButtonElement>("button").forEach(b => b.disabled = value);
    commit.disabled = value || !summary || (summary.errors.length > 0 && !skip.checked);
  };
  dialog.addEventListener("cancel", event => { if (busy) event.preventDefault(); });
  dialog.addEventListener("close", () => dialog.remove());
  dialog.querySelector("#import-cancel")!.addEventListener("click", () => dialog.close());
  skip.addEventListener("change", () => setBusy(false));
  const preview = async () => {
    summary = null;
    skip.checked = false;
    dialog.querySelector<HTMLElement>("#import-skip-row")!.hidden = true;
    dialog.querySelector("#import-preview")!.replaceChildren();
    const files = [...(input.files ?? [])].filter(file => !file.webkitRelativePath.split("/").slice(1).some(part => part.startsWith(".")));
    if (!files.length) { setUIText(status, "Select a folder containing Markdown files."); setBusy(false); return; }
    setBusy(true);
    try {
      if (files.length > 500 || files.reduce((size, f) => size + f.size, 0) > 20 * 1024 * 1024) throw new Error("Select a smaller folder (up to 500 files / 20 MB).");
      setUIText(status, "Reading files and checking links…");
      const encoded = [];
      for (const file of files) {
        const data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(",")[1]);
          reader.onerror = () => reject(new Error(`Unable to read ${file.name}`));
          reader.readAsDataURL(file);
        });
        encoded.push({ path: file.webkitRelativePath.split("/").slice(1).join("/") || file.name, data });
      }
      summary = await api<Summary>("/import/preview", { method: "POST", body: JSON.stringify({ name: files[0].webkitRelativePath.split("/")[0] || "Imported notes", dialect: dialect.value, files: encoded }) });
      dialog.querySelector("#import-preview")!.innerHTML = `<h3>${e(summary.name)}</h3><p>${summary.pages} <span data-i18n="pages, including folder pages ·">pages, including folder pages ·</span> ${summary.attachments} <span data-i18n="attachments">attachments</span></p><ul class="import-file-list">${summary.files.map(file => `<li>${e(file.path)}</li>`).join("")}</ul>${summary.errors.length ? `<h3 data-i18n="Invalid files">Invalid files</h3><ul>${summary.errors.map(message => `<li>${e(message)}</li>`).join("")}</ul>` : ""}${summary.warnings.length ? `<details><summary><span data-i18n="Review">Review</span> ${summary.warnings.length} <span data-i18n="notices">notices</span></summary><ul>${summary.warnings.map(message => `<li>${e(message)}</li>`).join("")}</ul></details>` : ""}`;
      dialog.querySelector<HTMLElement>("#import-skip-row")!.hidden = !summary.errors.length;
      setUIText(status, "Ready. Existing pages will not be overwritten. Reimporting the identical selection is safe.");
    } catch (error) { status.textContent = error instanceof Error ? error.message : String(error); }
    finally { setBusy(false); }
  };
  input.addEventListener("change", () => void preview());
  dialect.addEventListener("change", () => void preview());
  commit.addEventListener("click", async () => {
    if (!summary || busy) return;
    setBusy(true);
    try {
      if (!await options.save()) throw new Error("Save or resolve the current page conflict before importing.");
      setUIText(status, "Importing copies…");
      const result = await api<{ pageIds: string[]; alreadyImported: boolean }>("/import/commit", { method: "POST", body: JSON.stringify({ id: summary.id, skipInvalid: skip.checked }) });
      await options.complete(result.pageIds);
      dialog.close();
    } catch (error) { status.textContent = error instanceof Error ? error.message : String(error); }
    finally { setBusy(false); }
  });
  dialog.showModal();
}
