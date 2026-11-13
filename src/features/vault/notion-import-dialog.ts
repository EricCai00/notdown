import { setUIAttribute, setUIText, t } from "../../shared/i18n";
import { api, ApiError, escape as e } from "../../shared/types";
import type { ImportProgress } from "../../shared/import-progress";
import "./import-dialog.css";
import { appendCopiedNotionBlocks } from "../../shared/notion-copied-snapshots";
import { readNotionPreview, type NotionPreviewBatch } from "./notion-preview-reader";

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
  setUIAttribute(dialog, "aria-label", "Import from Notion API");
  dialog.innerHTML = `<header><h2 data-i18n="Import from Notion API">Import from Notion API</h2><button id="notion-close" aria-label="Close import" data-i18n-aria-label="Close import">×</button></header>
    <p data-i18n="Import a local copy of a page, database or data source using Notion's API.">Import a local copy of a page, database or data source using Notion's API.</p>
    <p class="import-hint" data-i18n="Matching public API colors are combined automatically. On Windows, the local Notion desktop cache can also restore missing colors, Notdown reminders and supported AI block prompts and output. Open the source pages in Notion and let them sync before previewing. Stale, conflicting or incomplete content is preserved for review.">Matching public API colors are combined automatically. On Windows, the local Notion desktop cache can also restore missing colors, Notdown reminders and supported AI block prompts and output. Open the source pages in Notion and let them sync before previewing. Stale, conflicting or incomplete content is preserved for review.</p>
    <label><span data-i18n="Integration token">Integration token</span><input id="notion-token" type="password" autocomplete="off" spellcheck="false" /></label>
    <p class="import-hint" data-i18n="The token is saved on this device and filled in next time. Clear the field to forget it.">The token is saved on this device and filled in next time. Clear the field to forget it.</p>
    <p id="notion-token-status" class="import-hint" role="status" hidden></p>
    <label><span data-i18n="Page URL or ID">Page URL or ID</span><input id="notion-page" type="text" placeholder="https://www.notion.so/..." autocomplete="off" spellcheck="false" /></label>
    <label><input id="notion-children" type="checkbox" checked /> <span data-i18n="Include descendant pages">Include descendant pages</span></label>
    <label><input id="notion-assets" type="checkbox" checked /> <span data-i18n="Import files, media, covers and icons into Attachments">Import files, media, covers and icons into Attachments</span></label>
    <label><input id="notion-cache" type="checkbox" checked /> <span data-i18n="Restore missing colors, Notdown reminders and AI blocks from this computer's Notion desktop cache">Restore missing colors, Notdown reminders and AI blocks from this computer's Notion desktop cache</span></label>
    <div id="notion-copied" ${window.notdownDesktop?.notionImportClipboard ? "" : "hidden"}><p class="import-hint" data-i18n="Select buttons or the whole page in Notion, press Ctrl+C, then read copied blocks here. Repeat for other pages; copies accumulate in this dialog. Preview a common parent with descendants included, or import those pages separately. Closing this dialog clears the copies.">Select buttons or the whole page in Notion, press Ctrl+C, then read copied blocks here. Repeat for other pages; copies accumulate in this dialog. Preview a common parent with descendants included, or import those pages separately. Closing this dialog clears the copies.</p><button id="notion-read-copied" type="button" data-i18n="Read copied Notion blocks">Read copied Notion blocks</button> <button id="notion-clear-copied" type="button" hidden data-i18n="Clear copied blocks">Clear copied blocks</button><p id="notion-copied-status" class="import-hint" role="status"></p></div>
    <label><span data-i18n="Import dialect">Import dialect</span><select id="notion-variant"><option value="notdown" data-i18n="Notdown — restore supported unknown blocks">Notdown — restore supported unknown blocks</option><option value="notion-markdown" data-i18n="Notion Markdown — preserve official output">Notion Markdown — preserve official output</option></select></label>
    <p class="import-hint" data-i18n="Share the root page with your Notion connection and enable Read content. Batched reading has no fixed total page or request count limit.">Share the root page with your Notion connection and enable Read content. Batched reading has no fixed total page or request count limit.</p>
    <details><summary data-i18n="Large import options">Large import options</summary><label><span data-i18n="Snapshot budget">Snapshot budget</span><select id="notion-capacity"><option value="64">64 MiB</option><option value="128">128 MiB</option><option value="256" selected>256 MiB</option><option value="512">512 MiB</option></select></label><p class="import-hint" data-i18n="The budget covers original responses, Markdown and attachments. Larger previews use more memory. Individual page and attachment limits still apply.">The budget covers original responses, Markdown and attachments. Larger previews use more memory. Individual page and attachment limits still apply.</p></details>
    <p class="import-hint" data-i18n="Imports use Notion Markdown v2, including available meeting transcripts. Descendants include child databases. Formula and rollup values remain snapshots; original views are archived and local tables show all records. Attachments up to 10 MB each are saved within the total import limit; failures retain their source URLs. Permissions and cloud automations remain in Notion.">Imports use Notion Markdown v2, including available meeting transcripts. Descendants include child databases. Formula and rollup values remain snapshots; original views are archived and local tables show all records. Attachments up to 10 MB each are saved within the total import limit; failures retain their source URLs. Permissions and cloud automations remain in Notion.</p>
    <div id="notion-preview" aria-live="polite"></div>
    <p class="import-hint" data-i18n="Batches continue automatically. Temporary failures are retried, and expired sessions are rebuilt automatically. You can pause at a batch boundary. Import becomes available after the complete preview.">Batches continue automatically. Temporary failures are retried, and expired sessions are rebuilt automatically. You can pause at a batch boundary. Import becomes available after the complete preview.</p>
    <p id="notion-batch" class="import-hint" role="status" hidden></p>
    <p id="notion-status" role="status"></p>
    <p id="notion-step" role="status" hidden></p>
    <p id="notion-timing" class="import-hint" aria-live="off" hidden></p>
    <progress id="notion-progress" aria-label="Notion import progress" hidden data-i18n-aria-label="Notion import progress"></progress>
    <details id="notion-progress-details" hidden><summary data-i18n="Recent steps">Recent steps</summary><ol id="notion-progress-history"></ol></details>
    <footer><label class="notion-auto-import"><input id="notion-auto-import" type="checkbox" /> <span data-i18n="Import automatically after reading">Import automatically after reading</span></label><button id="notion-cancel" data-i18n="Cancel">Cancel</button><button id="notion-pause" hidden data-i18n="Pause after this batch">Pause after this batch</button><button id="notion-preview-button" class="primary-button" data-i18n="Preview">Preview</button><button id="notion-commit" class="primary-button" disabled data-i18n="Import copies">Import copies</button></footer>`;
  document.body.append(dialog);
  const token = dialog.querySelector<HTMLInputElement>("#notion-token")!;
  const tokenStatus = dialog.querySelector<HTMLElement>("#notion-token-status")!;
  // Desktop origins use a different port after a restart; keep the key in the
  // profile's encrypted store instead of origin-scoped browser storage.
  const tokenStorage = window.notdownDesktop?.notionImportToken ?? {
    get: async () => localStorage.getItem("notdown-notion-import-token") ?? "",
    set: async (value: string) => {
      if (value) localStorage.setItem("notdown-notion-import-token", value);
      else localStorage.removeItem("notdown-notion-import-token");
    },
  };
  let tokenEdit = 0;
  const persistToken = () => {
    const edit = ++tokenEdit;
    void tokenStorage.set(token.value.trim()).then(() => {
      if (dialog.isConnected && edit === tokenEdit) tokenStatus.hidden = true;
    }, () => {
      if (!dialog.isConnected || edit !== tokenEdit) return;
      tokenStatus.hidden = false;
      setUIText(tokenStatus, "The token could not be saved on this device. You can still preview with the entered token.");
    });
  };
  token.addEventListener("input", persistToken);
  void tokenStorage.get().then(value => {
    if (dialog.isConnected && tokenEdit === 0) token.value = value;
  }, () => {
    if (!dialog.isConnected || tokenEdit !== 0) return;
    tokenStatus.hidden = false;
    setUIText(tokenStatus, "The saved token could not be loaded. Enter a token to continue.");
  });
  const page = dialog.querySelector<HTMLInputElement>("#notion-page")!;
  const children = dialog.querySelector<HTMLInputElement>("#notion-children")!;
  const attachments = dialog.querySelector<HTMLInputElement>("#notion-assets")!;
  const desktopCache = dialog.querySelector<HTMLInputElement>("#notion-cache")!;
  const variant = dialog.querySelector<HTMLSelectElement>("#notion-variant")!;
  const capacity = dialog.querySelector<HTMLSelectElement>("#notion-capacity")!;
  const readCopied = dialog.querySelector<HTMLButtonElement>("#notion-read-copied")!;
  const clearCopied = dialog.querySelector<HTMLButtonElement>("#notion-clear-copied")!;
  const copiedStatus = dialog.querySelector<HTMLElement>("#notion-copied-status")!;
  let copiedBlocks: string | undefined;
  const previewButton = dialog.querySelector<HTMLButtonElement>(
    "#notion-preview-button",
  )!;
  const commit = dialog.querySelector<HTMLButtonElement>("#notion-commit")!;
  const autoImport = dialog.querySelector<HTMLInputElement>("#notion-auto-import")!;
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
  let continuationId: string | undefined;
  let pauseRequested = false;
  let retrying = false;
  const pause = dialog.querySelector<HTMLButtonElement>("#notion-pause")!;
  const batchStatus = dialog.querySelector<HTMLElement>("#notion-batch")!;
  const discardSession = () => {
    if (continuationId) void api(`/notion/import/preview/${encodeURIComponent(continuationId)}`, { method: "DELETE", body: "{}" }).catch(() => {});
    continuationId = undefined;
  };
  let state: "idle" | "clipboard" | "preview" | "commit" = "idle";
  let controller: AbortController | undefined;
  const update = () => {
    token.disabled = page.disabled = children.disabled = attachments.disabled = desktopCache.disabled = variant.disabled = capacity.disabled = state !== "idle";
    previewButton.disabled = state !== "idle";
    setUIText(previewButton, continuationId ? "Resume preview" : "Preview");
    pause.hidden = state !== "preview";
    pause.disabled = pauseRequested;
    readCopied.disabled = clearCopied.disabled = state !== "idle";
    dialog.querySelector<HTMLElement>("#notion-copied")!.hidden = !window.notdownDesktop?.notionImportClipboard || variant.value !== "notdown";
    commit.disabled = state !== "idle" || !summary;
    // This choice changes what happens after reading, not the source snapshot.
    // Keep it editable during reading without invalidating the current session.
    autoImport.disabled = state === "commit" || state === "clipboard";
    cancel.disabled = close.disabled = state === "commit";
  };
  const invalidate = () => {
    discardSession();
    batchStatus.hidden = true;
    summary = null;
    preview.replaceChildren();
    status.textContent = "";
    clearProgress();
    update();
  };
  for (const input of [token, page, children, attachments, desktopCache, variant, capacity])
    input.addEventListener("input", invalidate);
  readCopied.addEventListener("click", async () => {
    if (state !== "idle" || !window.notdownDesktop?.notionImportClipboard) return;
    invalidate(); state = "clipboard"; update();
    setUIText(copiedStatus, "Reading copied Notion blocks…");
    try {
      const data = await window.notdownDesktop.notionImportClipboard.get();
      if (!dialog.isConnected) return;
      const result = appendCopiedNotionBlocks(copiedBlocks, data);
      if (!page.value.trim()) page.value = result.sourceId;
      copiedBlocks = result.data; clearCopied.hidden = false;
      copiedStatus.textContent = `${result.copies} copied snapshot${result.copies === 1 ? "" : "s"} loaded from ${result.pages} page${result.pages === 1 ? "" : "s"}. Preview will check matching Button actions.`;
    } catch {
      if (dialog.isConnected) copiedStatus.textContent = `Could not add the copy: select blocks in Notion, press Ctrl+C and keep the combined copies under 5 MiB.${copiedBlocks ? " Previously loaded copies are kept." : ""}`;
    } finally { state = "idle"; update(); }
  });
  clearCopied.addEventListener("click", () => {
    copiedBlocks = undefined; clearCopied.hidden = true; setUIText(copiedStatus, "Copied blocks cleared."); invalidate();
  });
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
    discardSession();
    token.value = "";
    copiedBlocks = undefined;
    summary = null;
    dialog.remove();
  });
  pause.addEventListener("click", () => {
    pauseRequested = true;
    // No request is active during backoff, so pausing can wake it immediately.
    if (retrying) controller?.abort();
    update();
    setUIText(batchStatus, "Pausing after the current batch…");
  });
  previewButton.addEventListener("click", async () => {
    if (state !== "idle") return;
    if (!token.value.trim()) {
      setUIText(status, "Enter the Notion integration token first.");
      token.focus();
      return;
    }
    if (!page.value.trim()) {
      setUIText(status, "Enter a Notion page URL or ID first.");
      page.focus();
      return;
    }
    persistToken();
    if (!continuationId) invalidate();
    pauseRequested = false;
    state = "preview";
    update();
    controller = new AbortController();
    const signal = controller.signal;
    let completed = false;
    showProgress({ phase: "reading", completed: 0, step: "Connecting to the local import service" });
    try {
      const result = await readNotionPreview<Preview>({
        continuationId, signal,
        shouldPause: () => pauseRequested,
        onContinuation: id => { if (!id) discardSession(); else continuationId = id; },
        read: async id => {
          retrying = false;
          batchStatus.hidden = false;
          setUIText(batchStatus, id ? "Reading the next batch…" : "Starting batched preview…");
          const result = await api<Preview | NotionPreviewBatch>("/notion/import/preview", {
            method: "POST",
            signal,
            body: JSON.stringify(id ? { continuationId: id } : {
              batched: true,
              snapshotMiB: Number(capacity.value),
              token: token.value.trim(),
              pageId: page.value.trim(),
              includeChildren: children.checked,
              downloadAssets: attachments.checked,
              useDesktopCache: desktopCache.checked,
              variant: variant.value,
              copiedBlocks: variant.value === "notdown" ? copiedBlocks : undefined,
            }),
          }, showProgress);
          if (!dialog.isConnected) {
            if ("continuationId" in result) {
              continuationId = result.continuationId;
              discardSession();
            }
            signal.throwIfAborted();
          }
          return result;
        },
        onBatch: result => {
          batchStatus.textContent = t("Batches completed: {batch} · Pages read: {pages} · Pages discovered: {discovered}", { batch: result.batch, pages: result.progress.completed, discovered: result.progress.discovered ?? result.progress.completed });
        },
        onRetry: retry => {
          retrying = true;
          batchStatus.hidden = false;
          batchStatus.textContent = t(retry.restarting
            ? "Reading session expired. Rebuilding the preview automatically in {seconds}s…"
            : "Temporary interruption. Retrying automatically in {seconds}s (attempt {attempt}/8)…",
          { seconds: Math.ceil(retry.delayMs / 1000), attempt: retry.attempt });
          status.textContent = retry.restarting
            ? t("The reading session was lost. The same selection will be read again before import.")
            : `${retry.message} ${t("Completed reads are kept. No action is needed while retrying.")}`;
        },
      });
      if (!result || "continuationId" in result) {
        setUIText(status, "Paused. Resume preview to continue from this batch.");
        return;
      }
      discardSession();
      batchStatus.hidden = true;
      summary = result;
      preview.innerHTML = `<h3>${e(result.name)}</h3><p>${result.pages} <span data-i18n="pages ·">pages ·</span> ${variant.value === "notdown" ? "Notdown" : "Notion Markdown"}</p>
        <details><summary data-i18n="Import notes and limitations">Import notes and limitations</summary><ul>${result.warnings.map((w) => `<li>${e(w)}</li>`).join("")}</ul></details>
        <label><span data-i18n="Markdown to import">Markdown to import</span><select id="notion-preview-page">${result.documents.map((doc, index) => `<option value="${index}">${e(doc.title)} (${index + 1})</option>`).join("")}</select></label>
        <pre id="notion-markdown-source" tabindex="0"></pre>`;
      const select = preview.querySelector<HTMLSelectElement>("select")!;
      const source = preview.querySelector<HTMLElement>("pre")!;
      const show = () => {
        source.textContent =
          result.documents[Number(select.value)]?.source ?? "";
      };
      select.addEventListener("change", show);
      show();
      setUIText(status, "Ready. Review the Markdown above. Existing local pages will not be overwritten.");
      completed = true;
    } catch (error) {
      if (dialog.isConnected && pauseRequested && signal.aborted)
        setUIText(status, "Paused. Resume preview to continue from this batch.");
      else if (dialog.isConnected) {
        if (!continuationId) batchStatus.hidden = true;
        status.textContent =
          (error instanceof Error ? error.message : String(error)) + (continuationId ? ` ${t("Automatic retries stopped. Completed reads are kept; Resume preview to try again.")}` : "");
      }
    } finally {
      retrying = false;
      finishProgress();
      state = "idle";
      update();
    }
    if (completed && autoImport.checked && !pauseRequested && !signal.aborted) await importCopies();
  });
  const importCopies = async () => {
    if (state !== "idle" || !summary || !dialog.isConnected || !dialog.open) return;
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
      if (error instanceof ApiError && error.status === 410) {
        summary = null;
        setUIText(status, "This preview is no longer available. Preview again before importing.");
      } else status.textContent = error instanceof Error ? error.message : String(error);
    } finally {
      finishProgress();
      state = "idle";
      update();
    }
  };
  commit.addEventListener("click", () => void importCopies());
  dialog.showModal();
}
