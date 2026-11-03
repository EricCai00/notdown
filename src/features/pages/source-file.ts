import { api } from "../../shared/types";
import { apiUrl } from "../../shared/vault-url";
import "./source-file.css";

export function sourceFileMenu() {
  return `<details id="source-file-options" class="page-options source-file-options" name="topbar-menu" hidden>
    <summary class="icon-button" aria-label="Open source file" title="Open source file" aria-haspopup="menu" data-i18n-title="Open source file" data-i18n-aria-label="Open source file"><i data-lucide="file-code-2"></i><span data-i18n="Open source file">Open source file</span><i data-lucide="chevron-down"></i></summary>
    <div class="page-options-menu" role="menu" aria-label="Source file" data-i18n-aria-label="Source file">
      <button role="menuitem" data-source-file="browser"><i data-lucide="globe"></i><span data-i18n="Show in browser">Show in browser</span></button>
      <button role="menuitem" data-source-file="app"><i data-lucide="external-link"></i><span data-i18n="Open in default app">Open in default app</span></button>
      <button role="menuitem" data-source-file="copy"><i data-lucide="copy"></i><span data-i18n="Copy file path">Copy file path</span></button>
    </div>
  </details>`;
}

let busy = false;
export async function handleSourceFile(
  action: string,
  id: string,
  context: { save: () => Promise<boolean>; isCurrent: () => boolean; toast: (message: string) => void },
) {
  if (busy || !["browser", "app", "copy"].includes(action)) return;
  busy = true;
  // Reserve the tab during the click gesture, before saving asynchronously.
  const tab = action === "browser" ? window.open("about:blank", "_blank") : null;
  if (tab) tab.opener = null;
  try {
    if (action === "browser" && !tab) throw new Error("Allow pop-ups to show the source file in a new tab.");
    if (action !== "copy" && (!(await context.save()) || !context.isCurrent())) {
      tab?.close();
      return;
    }
    const endpoint = `/pages/${encodeURIComponent(id)}`;
    if (action === "browser") {
      tab!.location.replace(apiUrl(`${endpoint}/source`));
    } else if (action === "app") {
      await api(`${endpoint}/source-file/open`, { method: "POST", body: "{}" });
      context.toast("Source file opened in the default app.");
    } else {
      const file = await api<{ path: string }>(`${endpoint}/source-file`);
      await navigator.clipboard.writeText(file.path);
      context.toast("File path copied.");
    }
  } catch (error) {
    tab?.close();
    throw error;
  } finally {
    busy = false;
  }
}
