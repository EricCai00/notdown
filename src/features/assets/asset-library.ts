import { api, ApiError, escape as e } from "../../shared/types";
import { refreshIcons } from "../../shared/icons";
import { fileSizeLabel } from "../../document/media";
import { createEditorNode } from "../../document/node-identity";
import { editorSchema } from "../../document/editor-schema";
import { MediaView } from "../../blocks/media-view";
import type { MediaInsertKind } from "../../blocks/media-insert";
import { assetUrl, type AssetLibrary, type AssetReference, type VaultAsset } from "./asset-model";
import "./asset-library.css";

type Options = {
  pageId?: string; pageTitle?: string; pageOnly?: boolean;
  canInsert?: (kind: MediaInsertKind) => boolean;
  onInsert?: (asset: VaultAsset, kind: MediaInsertKind) => boolean;
  onOpenPage: (reference: AssetReference) => Promise<void>;
};
const icons = { image: "image", audio: "music", video: "video", pdf: "file-text", html: "code-xml", file: "paperclip" };
const labels = { image: "Image", audio: "Audio", video: "Video", pdf: "PDF", html: "HTML", file: "File" };
const size = (asset: VaultAsset) => asset.size === null ? "Size unavailable" : fileSizeLabel(asset.size);
const date = (value: string | null) => value ? new Date(value).toLocaleString() : "Not recorded";

export function openAssetLibrary(options: Options) {
  document.querySelector<HTMLDialogElement>(".attachments-dialog")?.close();
  const dialog = document.createElement("dialog");
  dialog.className = "attachments-dialog";
  dialog.setAttribute("aria-labelledby", "attachments-title");
  dialog.innerHTML = `<header class="attachments-header"><div><h2 id="attachments-title"><i data-lucide="paperclip"></i>Attachments</h2><p class="attachments-summary">Loading your vault…</p></div><div class="attachments-actions"><button type="button" class="secondary-button" data-asset-action="upload"><i data-lucide="plus"></i>Upload files</button><button type="button" class="icon-button" data-asset-action="refresh" aria-label="Refresh attachments"><i data-lucide="redo-2"></i></button><button type="button" class="icon-button" data-asset-action="close" aria-label="Close attachments"><i data-lucide="x"></i></button></div></header>
    <div class="attachments-toolbar"><input type="search" aria-label="Search attachments" placeholder="Search by name or path…"><select aria-label="Attachment type"><option value="">All types</option>${Object.entries(labels).map(([kind, label]) => `<option value="${kind}">${label}</option>`).join("")}</select><select aria-label="Sort attachments"><option value="name">Name</option><option value="size">Largest first</option><option value="date">Recently added</option></select><label class="attachments-scope"><input type="checkbox" ${options.pageOnly ? "checked" : ""} ${options.pageId ? "" : "disabled"}>This page only</label></div>
    <p class="attachments-status" role="status" hidden></p>
    <div class="attachments-layout"><section class="attachments-directory" aria-label="Attachment directory"><div class="attachments-list" role="list" aria-label="Attachments"></div></section><section class="attachments-detail" aria-label="Attachment details"></section></div>
    <footer class="attachments-footer">References include saved pages, page properties and Trash. History and unsaved drafts are not included.</footer>`;
  document.body.append(dialog);
  const events = new AbortController(), signal = events.signal;
  const list = dialog.querySelector<HTMLElement>(".attachments-list")!;
  const detail = dialog.querySelector<HTMLElement>(".attachments-detail")!;
  const status = dialog.querySelector<HTMLElement>(".attachments-status")!;
  const search = dialog.querySelector<HTMLInputElement>('input[type="search"]')!;
  const filter = dialog.querySelector<HTMLSelectElement>('[aria-label="Attachment type"]')!;
  const sort = dialog.querySelector<HTMLSelectElement>('[aria-label="Sort attachments"]')!;
  const scope = dialog.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
  let data: AssetLibrary = { assets: [], warnings: [] }, selected: string | undefined, loading = true, uploading = false;
  let preview: MediaView | undefined, request: AbortController | undefined;
  const message = (text: string, error = false) => { status.hidden = !text; status.textContent = text; status.classList.toggle("error", error); };
  const visible = () => data.assets.filter(asset => (!filter.value || asset.kind === filter.value) &&
    (!scope.checked || asset.references.some(ref => ref.pageId === options.pageId)) &&
    `${asset.name} ${asset.path}`.toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase()))
    .sort((a, b) => (sort.value === "size" ? (b.size ?? -1) - (a.size ?? -1) : sort.value === "date" ? (b.addedAt || "").localeCompare(a.addedAt || "") : 0) || a.name.localeCompare(b.name));
  const renderDetail = () => {
    preview?.destroy(); preview = undefined;
    const asset = data.assets.find(item => item.path === selected);
    if (!asset) { detail.innerHTML = `<div class="attachments-welcome"><i data-lucide="paperclip"></i><h3>${data.assets.length ? "Select an attachment" : "Your files, in one place"}</h3><p>Preview a file, see where it is used, or reuse it in a page.</p></div>`; refreshIcons(); return; }
    const kinds = ([asset.kind === "html" ? "file" : asset.kind, "file"] as MediaInsertKind[])
      .filter((kind, index, all) => all.indexOf(kind) === index && options.canInsert?.(kind));
    const active = asset.references.filter(ref => !ref.trashed).length;
    detail.innerHTML = `<div class="attachment-heading"><span class="attachment-kind">${labels[asset.kind]}</span><h3>${e(asset.name)}</h3><code>${e(asset.path)}</code></div><div class="attachment-preview"></div>
      <div class="attachment-actions">${asset.missing ? '<span class="attachment-missing">File missing</span>' : `<a class="secondary-button" href="${e(assetUrl(asset.path))}" download="${e(asset.originalName || asset.name)}"><i data-lucide="download"></i>Download</a><button type="button" class="secondary-button" data-asset-action="copy"><i data-lucide="copy"></i>Copy path</button>${options.onInsert && kinds.length ? `<label>Insert as<select aria-label="Insert attachment as">${kinds.map(kind => `<option value="${kind}">${kind === "file" ? "File / link" : labels[kind]}</option>`).join("")}</select></label><button type="button" class="primary-button" data-asset-action="insert">Insert into page</button>` : ""}`}</div>
      <dl class="attachment-info"><div><dt>Size</dt><dd>${size(asset)}</dd></div><div><dt>Original name</dt><dd>${e(asset.originalName || "Not recorded")}</dd></div><div><dt>Added</dt><dd>${e(date(asset.addedAt))}</dd></div><div><dt>Modified</dt><dd>${e(date(asset.modifiedAt))}</dd></div></dl>
      <div class="attachment-references"><h4>Used in ${active} ${active === 1 ? "page" : "pages"}${asset.references.some(ref => ref.trashed) ? " · Also in Trash" : ""}</h4>${asset.references.length ? asset.references.map(ref => `<button type="button" data-asset-page="${e(ref.pageId)}" ${ref.trashed ? "disabled" : ""}><i data-lucide="${ref.trashed ? "trash-2" : "file-text"}"></i><span><strong>${e(ref.title)}${ref.trashed ? " (Trash)" : ""}</strong><small>${e(ref.locations.join(" · "))}</small></span>${ref.trashed ? "" : '<i data-lucide="arrow-up-right"></i>'}</button>`).join("") : '<p>No references found in saved pages. Older versions or unsaved drafts may still use this file.</p>'}</div>`;
    const container = detail.querySelector<HTMLElement>(".attachment-preview")!;
    if (asset.missing) container.innerHTML = '<p>The page still references this path, but the local file is unavailable.</p>';
    else if (asset.kind === "image") {
      const img = document.createElement("img"); img.src = assetUrl(asset.path); img.alt = asset.name;
      img.addEventListener("error", () => { container.textContent = "Image preview unavailable. You can download the original file."; }, { once: true, signal });
      container.append(img);
    } else if (["audio", "video", "pdf"].includes(asset.kind)) {
      preview = new MediaView(createEditorNode(editorSchema, "media_block", { src: assetUrl(asset.path), type: asset.kind, caption: asset.kind === "pdf" ? asset.name : "" }));
      container.append(preview.dom);
    } else if (asset.kind === "html") {
      const frame = document.createElement("iframe"); frame.src = assetUrl(asset.path); frame.title = asset.name;
      frame.setAttribute("sandbox", ""); frame.referrerPolicy = "no-referrer"; container.append(frame);
    } else container.innerHTML = '<div class="attachment-file-preview"><i data-lucide="file-text"></i><p>Download this file to open it in its app.</p></div>';
    refreshIcons();
  };
  const renderList = () => {
    const assets = visible();
    const focused = list.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.assetPath : undefined;
    if (selected && !assets.some(asset => asset.path === selected)) { selected = undefined; renderDetail(); }
    list.innerHTML = assets.map(asset => {
      const count = asset.references.filter(ref => !ref.trashed).length;
      return `<div role="listitem"><button type="button" class="attachment-row ${selected === asset.path ? "selected" : ""}" data-asset-path="${e(asset.path)}" aria-pressed="${selected === asset.path}"><span class="attachment-thumb">${asset.kind === "image" && !asset.missing ? `<img src="${e(assetUrl(asset.path))}" alt="" loading="lazy">` : `<i data-lucide="${icons[asset.kind]}"></i>`}</span><span class="attachment-row-text"><strong>${e(asset.name)}</strong><small>${asset.missing ? "File missing" : size(asset)} · ${count} ${count === 1 ? "page" : "pages"}${asset.references.some(ref => ref.trashed) ? " · Trash" : ""}</small></span>${asset.missing ? '<span class="attachment-missing">Missing</span>' : ""}</button></div>`;
    }).join("") || `<div class="attachments-empty">${loading ? "Loading attachments…" : data.assets.length ? "No attachments match these filters." : "No attachments yet. Upload files or add media to a page."}</div>`;
    const local = data.assets.filter(asset => !asset.missing);
    dialog.querySelector<HTMLElement>(".attachments-summary")!.textContent = `${assets.length !== data.assets.length ? `${assets.length} shown · ` : ""}${local.length} ${local.length === 1 ? "file" : "files"} in vault · ${fileSizeLabel(local.reduce((sum, asset) => sum + (asset.size ?? 0), 0))}${local.some(asset => asset.size === null) ? " known size" : ""}${data.assets.some(asset => asset.missing) ? ` · ${data.assets.filter(asset => asset.missing).length} missing` : ""}${scope.checked ? ` · ${options.pageTitle || "This page"}` : ""}`;
    if (focused) list.querySelector<HTMLButtonElement>(`[data-asset-path="${CSS.escape(focused)}"]`)?.focus({ preventScroll: true });
    refreshIcons();
  };
  const load = async () => {
    request?.abort(); const controller = request = new AbortController();
    loading = true; list.setAttribute("aria-busy", "true");
    try {
      const result = await api<AssetLibrary>("/assets", { signal: controller.signal });
      if (signal.aborted || controller.signal.aborted) return;
      if (!Array.isArray(result.assets)) throw new Error("The attachment library needs the updated local backend. Restart the server and refresh.");
      data = result; loading = false; renderList(); renderDetail();
      message(data.warnings.join(" "));
    } catch (error) {
      if (!signal.aborted && !controller.signal.aborted) {
        loading = false; renderList();
        message(error instanceof ApiError && error.status === 404 ? "The attachment library needs the updated local backend. Restart the server and refresh." : error instanceof Error ? error.message : "Could not load attachments.", true);
      }
    } finally { if (request === controller) list.removeAttribute("aria-busy"); }
  };
  const upload = () => {
    if (uploading) return;
    const input = document.createElement("input"); input.type = "file"; input.multiple = true;
    input.setAttribute("aria-label", "Upload attachments"); input.style.cssText = "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none";
    dialog.append(input); input.focus();
    const finish = () => { input.remove(); dialog.querySelector<HTMLButtonElement>('[data-asset-action="upload"]')?.focus(); };
    input.addEventListener("cancel", finish, { once: true, signal });
    input.addEventListener("change", () => void (async () => {
      uploading = true;
      const button = dialog.querySelector<HTMLButtonElement>('[data-asset-action="upload"]')!; button.disabled = true;
      let uploaded = 0, failure = "";
      try {
        for (const file of Array.from(input.files || [])) {
          if (signal.aborted) break;
          if (file.size > 15 * 1024 * 1024) throw new Error(`${file.name}: attachments can be up to 15 MB.`);
          message(`Uploading ${file.name}…`);
          const base64 = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(new Error(`Could not read ${file.name}`)); reader.onload = () => resolve(String(reader.result).split(",")[1]); reader.readAsDataURL(file); });
          const result = await api<{ path: string }>("/assets", { method: "POST", body: JSON.stringify({ name: file.name, contentType: file.type || "application/octet-stream", data: base64 }) });
          selected = result.path; uploaded++;
        }
      } catch (error) { failure = error instanceof Error ? error.message : "Upload failed."; }
      finally {
        uploading = false; button.disabled = false; finish();
        if (!signal.aborted) {
          if (uploaded) { scope.checked = false; filter.value = ""; search.value = ""; }
          await load();
          if (failure) message(`${uploaded ? `${uploaded} uploaded. ` : ""}${failure}`, true);
        }
      }
    })(), { once: true, signal });
    input.click();
  };
  for (const element of [search, filter, sort, scope]) element.addEventListener(element === search ? "input" : "change", renderList, { signal });
  dialog.addEventListener("click", event => {
    const target = (event.target as Element).closest<HTMLElement>("[data-asset-action], [data-asset-path], [data-asset-page]");
    if (!target) return;
    const asset = data.assets.find(item => item.path === selected);
    if (target.dataset.assetPath) { selected = target.dataset.assetPath; renderList(); renderDetail(); return; }
    if (target.dataset.assetPage && asset) {
      const reference = asset.references.find(ref => ref.pageId === target.dataset.assetPage);
      if (reference && !reference.trashed) { dialog.close(); void options.onOpenPage(reference); } return;
    }
    switch (target.dataset.assetAction) {
      case "close": dialog.close(); break;
      case "refresh": void load(); break;
      case "upload": upload(); break;
      case "copy": if (asset) void navigator.clipboard.writeText(asset.path).then(() => message("Attachment path copied."), () => message("Could not copy the path. Select it above to copy manually.", true)); break;
      case "insert": if (asset && !asset.missing) {
        const kind = detail.querySelector<HTMLSelectElement>('[aria-label="Insert attachment as"]')!.value as MediaInsertKind;
        if (!options.canInsert?.(kind)) return;
        dialog.close();
        options.onInsert?.(asset, kind);
      } break;
    }
  }, { signal });
  dialog.addEventListener("keydown", event => { if (event.key === "Escape") event.stopPropagation(); }, { signal });
  dialog.addEventListener("close", () => { events.abort(); request?.abort(); preview?.destroy(); dialog.remove(); }, { once: true });
  renderList(); renderDetail(); dialog.showModal(); search.focus(); void load();
}
