import { api, escape as e } from "../../shared/types";
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
    <p>Import a local copy using Notion's Enhanced Markdown API.</p>
    <label>Integration token<input id="notion-token" type="password" autocomplete="off" spellcheck="false" /></label>
    <label>Page URL or ID<input id="notion-page" type="text" placeholder="https://www.notion.so/..." autocomplete="off" spellcheck="false" /></label>
    <label><input id="notion-children" type="checkbox" checked /> Include descendant pages</label>
    <p class="import-hint">Share the root page with your Notion connection and enable Read content. The token is used only for this preview and is not saved. Up to 500 pages / 20 MB including archived responses.</p>
    <p class="import-hint">Attachments remain remote and signed URLs may expire. Database records, views, comments and permissions are not imported. Page links keep their Notion destinations.</p>
    <div id="notion-preview" aria-live="polite"></div>
    <p id="notion-status" role="status"></p>
    <footer><button id="notion-cancel">Cancel</button><button id="notion-preview-button" class="primary-button">Preview</button><button id="notion-commit" class="primary-button" disabled>Import copies</button></footer>`;
  document.body.append(dialog);
  const token = dialog.querySelector<HTMLInputElement>("#notion-token")!;
  const page = dialog.querySelector<HTMLInputElement>("#notion-page")!;
  const children = dialog.querySelector<HTMLInputElement>("#notion-children")!;
  const previewButton = dialog.querySelector<HTMLButtonElement>(
    "#notion-preview-button",
  )!;
  const commit = dialog.querySelector<HTMLButtonElement>("#notion-commit")!;
  const status = dialog.querySelector<HTMLElement>("#notion-status")!;
  const preview = dialog.querySelector<HTMLElement>("#notion-preview")!;
  const cancel = dialog.querySelector<HTMLButtonElement>("#notion-cancel")!;
  const close = dialog.querySelector<HTMLButtonElement>("#notion-close")!;
  let summary: Preview | null = null;
  let state: "idle" | "preview" | "commit" = "idle";
  let controller: AbortController | undefined;
  const update = () => {
    token.disabled = page.disabled = children.disabled = state !== "idle";
    previewButton.disabled = state !== "idle";
    commit.disabled = state !== "idle" || !summary;
    cancel.disabled = close.disabled = state === "commit";
  };
  const invalidate = () => {
    summary = null;
    preview.replaceChildren();
    status.textContent = "";
    update();
  };
  for (const input of [token, page, children])
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
    status.textContent =
      "Reading Enhanced Markdown and page hierarchy from Notion… Large page trees may take several minutes.";
    try {
      const result = await api<Preview>("/notion/import/preview", {
        method: "POST",
        signal: controller.signal,
        body: JSON.stringify({
          token: token.value.trim(),
          pageId: page.value.trim(),
          includeChildren: children.checked,
        }),
      });
      if (!dialog.isConnected) return;
      summary = result;
      preview.innerHTML = `<h3>${e(result.name)}</h3><p>${result.pages} pages · Notion-flavored Markdown</p>
        <details><summary>Import limitations</summary><ul>${result.warnings.map((w) => `<li>${e(w)}</li>`).join("")}</ul></details>
        <label>API Markdown preview<select id="notion-preview-page">${result.documents.map((doc, index) => `<option value="${index}">${e(doc.title)} (${index + 1})</option>`).join("")}</select></label>
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
        "Ready. Review the API Markdown above. Existing local pages will not be overwritten.";
    } catch (error) {
      if (dialog.isConnected)
        status.textContent =
          error instanceof Error ? error.message : String(error);
    } finally {
      token.value = "";
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
      status.textContent = "Importing the previewed snapshot…";
      const result = await api<{ pageIds: string[] }>("/import/commit", {
        method: "POST",
        body: JSON.stringify({ id }),
      });
      await options.complete(result.pageIds);
      dialog.close();
    } catch (error) {
      status.textContent =
        error instanceof Error ? error.message : String(error);
    } finally {
      state = "idle";
      update();
    }
  });
  dialog.showModal();
}
