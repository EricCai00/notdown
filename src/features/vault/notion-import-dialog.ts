import { api, escape as e } from "../../shared/types";
import type { ImportProgress } from "../../shared/import-progress";
import "./import-dialog.css";

type Preview = {
  id: string;
  name: string;
  pages: number;
  warnings: string[];
  documents: { id: string; title: string; source: string }[];
};

export function openNotionImportDialog(options: {
  save: () => Promise<boolean>;
  complete: (ids: string[]) => Promise<void>;
}) {
  if (document.querySelector(".import-dialog")) return;
  const dialog = document.createElement("dialog");
  dialog.className = "import-dialog notion-import-dialog";
  dialog.setAttribute("aria-label", "Import from Notion API");
  dialog.innerHTML = `<header><h2>Import from Notion API</h2><button id="notion-close" aria-label="Close import">×</button></header>
    <p>Import a local copy of a page, database or data source using Notion's API.</p>
    <p class="import-hint">The API omits reminders. Matching public API colors are combined automatically. On Windows, the local Notion desktop cache can fill missing colors and Notdown reminders. Open the source pages in Notion and let them sync before previewing. Stale, conflicting or ambiguous content is preserved for review.</p>
    <label>Integration token<input id="notion-token" type="password" autocomplete="off" spellcheck="false" /></label>
    <label>Page URL or ID<input id="notion-page" type="text" placeholder="https://www.notion.so/..." autocomplete="off" spellcheck="false" /></label>
    <label><input id="notion-children" type="checkbox" checked /> Include descendant pages</label>
    <label><input id="notion-assets" type="checkbox" checked /> Import files, media, covers and icons into Attachments</label>
    <label><input id="notion-cache" type="checkbox" checked /> Restore missing colors and Notdown reminders from this computer's Notion desktop cache</label>
    <label>Import dialect<select id="notion-variant"><option value="notdown">Notdown — restore supported unknown blocks</option><option value="notion-markdown">Notion Markdown — preserve official output</option></select></label>
    <p class="import-hint">Share the root page with your Notion connection and enable Read content. The token is used only for this preview and is not saved. Up to 500 pages / 20 MB including archived responses.</p>
    <p class="import-hint">Imports use Notion Markdown v2, including available meeting transcripts. Descendants include child databases. Formula and rollup values remain snapshots; original views are archived and local tables show all records. Attachments up to 10 MB each are saved within the total import limit; failures retain their source URLs. Permissions and automations remain in Notion.</p>
    <div id="notion-preview" aria-live="polite"></div>
    <p id="notion-status" role="status"></p>
    <p id="notion-step" role="status" hidden></p>
    <p id="notion-timing" class="import-hint" aria-live="off" hidden></p>
    <progress id="notion-progress" aria-label="Notion import progress" hidden></progress>
    <details id="notion-progress-details" hidden><summary>Recent steps</summary><ol id="notion-progress-history"></ol></details>
    <footer><button id="notion-cancel">Cancel</button><button id="notion-preview-button" class="primary-button">Preview</button><button id="notion-commit" class="primary-button" disabled>Import copies</button></footer>`;
  document.body.append(dialog);
  const token = dialog.querySelector<HTMLInputElement>("#notion-token")!;
  const page = dialog.querySelector<HTMLInputElement>("#notion-page")!;
  const children = dialog.querySelector<HTMLInputElement>("#notion-children")!;
  const attachments = dialog.querySelector<HTMLInputElement>("#notion-assets")!;
  const desktopCache = dialog.querySelector<HTMLInputElement>("#notion-cache")!;
  const variant = dialog.querySelector<HTMLSelectElement>("#notion-variant")!;
  const previewButton = dialog.querySelector<HTMLButtonElement>(
    "#notion-preview-button",
  )!;
  const commit = dialog.querySelector<HTMLButtonElement>("#notion-commit")!;
  const status = dialog.querySelector<HTMLElement>("#notion-status")!;
  const progress = dialog.querySelector<HTMLProgressElement>("#notion-progress")!;
  const step = dialog.querySelector<HTMLElement>("#notion-step")!;
  const timing = dialog.querySelector<HTMLElement>("#notion-timing")!;
  const progressDetails = dialog.querySelector<HTMLDetailsElement>("#notion-progress-details")!;
  const history = dialog.querySelector<HTMLOListElement>("#notion-progress-history")!;
  let timer: ReturnType<typeof setInterval> | undefined;
  let startedAt = 0, stepStartedAt = 0, lastUpdateAt = 0, lastStep = "";
  const updateTiming = () => {
    const now = Date.now();
    const seconds = (since: number) => Math.max(0, Math.floor((now - since) / 1000));
    timing.textContent = `Elapsed: ${seconds(startedAt)}s · This step: ${seconds(stepStartedAt)}s · Last update: ${seconds(lastUpdateAt)}s ago`;
  };
  const finishProgress = () => {
    if (timer !== undefined) { clearInterval(timer); timer = undefined; updateTiming(); }
    if (!step.hidden && step.textContent && !step.textContent.startsWith("Last step: ")) step.textContent = `Last step: ${step.textContent}`;
    progress.hidden = true;
  };
  const clearProgress = () => {
    finishProgress();
    step.hidden = timing.hidden = progressDetails.hidden = true;
    history.replaceChildren();
    lastStep = "";
  };
  const showProgress = (value: ImportProgress) => {
    if (!dialog.isConnected) return;
    const now = Date.now();
    if (timer === undefined) {
      startedAt = stepStartedAt = now;
      timing.hidden = false;
      timer = setInterval(updateTiming, 1000);
    }
    lastUpdateAt = now;
    progress.hidden = false;
    if (value.total !== undefined) {
      progress.max = Math.max(1, value.total);
      progress.value = value.completed;
    } else progress.removeAttribute("value");
    const count = value.total === undefined ? `${value.completed} pages read` : `${value.completed} / ${value.total} pages imported`;
    const phase = { reading: "Reading pages", restoring: "Restoring page content", attachments: "Downloading attachments", importing: "Importing pages", finalizing: "Finalizing" }[value.phase];
    status.textContent = `${count}. ${phase}…${value.currentTitle ? ` Current page: ${value.currentTitle}` : ""}`;
    step.hidden = !value.step;
    step.textContent = [value.step, value.requestCount === undefined ? "" : `Notion requests: ${value.requestCount}`, value.discovered === undefined ? "" : `Pages discovered: ${value.discovered}`].filter(Boolean).join(" · ");
    const key = `${value.phase}|${value.step ?? phase}|${value.currentTitle ?? ""}|${value.requestCount ?? ""}`;
    if (key !== lastStep) {
      stepStartedAt = now;
      lastStep = key;
      const entry = document.createElement("li");
      entry.textContent = `${Math.floor((now - startedAt) / 1000)}s · ${value.step ?? phase}${value.currentTitle ? ` · ${value.currentTitle}` : ""}`;
      history.append(entry);
      while (history.children.length > 8) history.firstElementChild!.remove();
      progressDetails.hidden = false;
    }
    updateTiming();
  };
  const preview = dialog.querySelector<HTMLElement>("#notion-preview")!;
  const cancel = dialog.querySelector<HTMLButtonElement>("#notion-cancel")!;
  const close = dialog.querySelector<HTMLButtonElement>("#notion-close")!;
  let summary: Preview | null = null;
  let state: "idle" | "preview" | "commit" = "idle";
  let controller: AbortController | undefined;
  const update = () => {
    token.disabled = page.disabled = children.disabled = attachments.disabled = desktopCache.disabled = variant.disabled = state !== "idle";
    previewButton.disabled = state !== "idle";
    commit.disabled = state !== "idle" || !summary;
    cancel.disabled = close.disabled = state === "commit";
  };
  const invalidate = () => {
    summary = null;
    preview.replaceChildren();
    status.textContent = "";
    clearProgress();
    update();
  };
  for (const input of [token, page, children, attachments, desktopCache, variant])
    input.addEventListener("input", invalidate);
  const dismiss = () => {
    if (state !== "commit") dialog.close();
  };
  cancel.addEventListener("click", dismiss);
  close.addEventListener("click", dismiss);
  dialog.addEventListener("cancel", (event) => {
    if (state === "commit") event.preventDefault();
  });
  dialog.addEventListener("close", () => {
    finishProgress();
    controller?.abort();
    token.value = "";
    summary = null;
    dialog.remove();
  });
  previewButton.addEventListener("click", async () => {
    if (state !== "idle") return;
    if (!token.value.trim()) {
      status.textContent = "Enter the Notion integration token first.";
      token.focus();
      return;
    }
    if (!page.value.trim()) {
      status.textContent = "Enter a Notion page URL or ID first.";
      page.focus();
      return;
    }
    invalidate();
    state = "preview";
    update();
    controller = new AbortController();
    showProgress({ phase: "reading", completed: 0, step: "Connecting to the local import service" });
    try {
      const result = await api<Preview>("/notion/import/preview", {
        method: "POST",
        signal: controller.signal,
        body: JSON.stringify({
          token: token.value.trim(),
          pageId: page.value.trim(),
          includeChildren: children.checked,
          downloadAssets: attachments.checked,
          useDesktopCache: desktopCache.checked,
          variant: variant.value,
        }),
      }, showProgress);
      if (!dialog.isConnected) return;
      summary = result;
      preview.innerHTML = `<h3>${e(result.name)}</h3><p>${result.pages} pages · ${variant.value === "notdown" ? "Notdown" : "Notion Markdown"}</p>
        <details><summary>Import notes and limitations</summary><ul>${result.warnings.map((w) => `<li>${e(w)}</li>`).join("")}</ul></details>
        <label>Markdown to import<select id="notion-preview-page">${result.documents.map((doc, index) => `<option value="${index}">${e(doc.title)} (${index + 1})</option>`).join("")}</select></label>
        <pre id="notion-markdown-source" tabindex="0"></pre>`;
      const select = preview.querySelector<HTMLSelectElement>("select")!;
      const source = preview.querySelector<HTMLElement>("pre")!;
      const show = () => {
        source.textContent =
          result.documents[Number(select.value)]?.source ?? "";
      };
      select.addEventListener("change", show);
      show();
      status.textContent =
        "Ready. Review the Markdown above. Existing local pages will not be overwritten.";
    } catch (error) {
      if (dialog.isConnected)
        status.textContent =
          error instanceof Error ? error.message : String(error);
    } finally {
      token.value = "";
      finishProgress();
      state = "idle";
      update();
    }
  });
  commit.addEventListener("click", async () => {
    if (state !== "idle" || !summary) return;
    const id = summary.id;
    state = "commit";
    update();
    try {
      if (!(await options.save()))
        throw new Error(
          "Save or resolve the current page conflict before importing.",
        );
      clearProgress();
      showProgress({ phase: "importing", completed: 0, total: summary!.pages, step: "Preparing the local import" });
      const result = await api<{ pageIds: string[] }>("/import/commit", {
        method: "POST",
        body: JSON.stringify({ id }),
      }, showProgress);
      await options.complete(result.pageIds);
      dialog.close();
    } catch (error) {
      status.textContent =
        error instanceof Error ? error.message : String(error);
    } finally {
      finishProgress();
      state = "idle";
      update();
    }
  });
  dialog.showModal();
}
