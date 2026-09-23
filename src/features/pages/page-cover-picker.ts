import gallery from "./page-cover-gallery.json";
import { refreshIcons } from "../../shared/icons";
import { escape } from "../../shared/types";

export const galleryCoverPath = (asset: string) =>
  `/page-covers/${encodeURIComponent(asset)}`;

const galleryThumbnailPath = (asset: string) =>
  `/page-covers/thumbs/${encodeURIComponent(asset)}`;

export function isPageCoverPath(value: string): boolean {
  return /^(?:https?:\/\/|assets\/|\/assets\/|\/page-covers\/)/i.test(value);
}

interface CoverPickerOptions {
  cover: string;
  onSelect: (value: string) => void;
  onUpload: (file: File) => Promise<void>;
  onRemove: () => void;
  onError: (error: unknown) => void;
}

type CoverTab = "gallery" | "upload" | "link" | "unsplash";

export function openPageCoverPicker(anchor: HTMLElement, options: CoverPickerOptions): () => void {
  const picker = document.createElement("div");
  picker.className = "page-cover-picker";
  picker.setAttribute("role", "dialog");
  picker.setAttribute("aria-label", "Choose page cover");
  picker.innerHTML = `<div class="page-cover-picker-tabs" role="tablist" aria-label="Cover source">
    <button type="button" role="tab" data-cover-tab="gallery">Gallery</button>
    <button type="button" role="tab" data-cover-tab="upload">Upload</button>
    <button type="button" role="tab" data-cover-tab="link">Link</button>
    <button type="button" role="tab" data-cover-tab="unsplash"><i data-lucide="image"></i>Unsplash</button>
    <button type="button" class="page-cover-remove" data-cover-remove ${options.cover ? "" : "disabled"}>Remove</button>
  </div><div class="page-cover-picker-body" role="tabpanel"></div>`;
  document.body.append(picker);
  const body = picker.querySelector<HTMLElement>(".page-cover-picker-body")!;
  let activeTab: CoverTab = "gallery";
  let closed = false;

  function position() {
    const coverRegion = anchor.closest(".page-cover-region");
    const rect = (coverRegion || anchor).getBoundingClientRect();
    const top = (anchor.closest(".page-cover-toolbar") || anchor).getBoundingClientRect().bottom;
    const width = Math.min(540, window.innerWidth - 16);
    const height = Math.min(486, window.innerHeight - 16);
    picker.style.width = `${width}px`;
    picker.style.maxHeight = `${height}px`;
    picker.style.left = `${Math.max(8, Math.min(rect.right - 12 - width, window.innerWidth - width - 8))}px`;
    picker.style.top = `${Math.max(8, Math.min(top + 5, window.innerHeight - height - 8))}px`;
  }

  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener("pointerdown", outside, true);
    document.removeEventListener("keydown", keydown, true);
    window.removeEventListener("resize", position);
    document.querySelector("#main")?.removeEventListener("scroll", position);
    picker.remove();
  }

  function outside(event: PointerEvent) {
    if (!picker.contains(event.target as Node) && !anchor.contains(event.target as Node)) close();
  }

  function keydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      anchor.focus();
    }
  }

  function render(tab: CoverTab) {
    activeTab = tab;
    picker.querySelectorAll<HTMLButtonElement>("[data-cover-tab]").forEach(button => {
      const selected = button.dataset.coverTab === tab;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    if (tab === "gallery") {
      body.innerHTML = gallery.groups.map(group => {
        const items = gallery.items.filter(item => item.group === group);
        return `<section class="page-cover-group"><h3>${escape(group)}</h3><div class="page-cover-grid">${items.map(item => {
          const src = galleryCoverPath(item.asset);
          return `<button type="button" class="page-cover-choice" data-cover-asset="${escape(item.asset)}" aria-label="${escape(item.file)}" title="${escape(item.file)}" aria-pressed="${options.cover === src}"><img src="${escape(galleryThumbnailPath(item.asset))}" alt="" loading="lazy"></button>`;
        }).join("")}</div></section>`;
      }).join("");
    } else if (tab === "upload") {
      body.innerHTML = `<div class="page-cover-picker-form"><label class="page-cover-upload"><i data-lucide="upload"></i><strong>Upload an image</strong><span>PNG, JPEG, WebP, GIF or AVIF · up to 15 MB</span><input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" aria-label="Upload cover image"></label><p class="page-cover-picker-error" role="alert"></p></div>`;
    } else {
      body.innerHTML = `<form class="page-cover-picker-form" data-cover-link-form>
        ${tab === "unsplash" ? '<p>Find an image on <a href="https://unsplash.com/" target="_blank" rel="noopener noreferrer">Unsplash</a>, then paste its image URL here.</p>' : '<p>Paste an image URL or a vault asset path.</p>'}
        <label>Cover image URL<input name="cover" aria-label="Cover image URL" placeholder="https://… or assets/…" value="${tab === "link" ? escape(options.cover) : ""}"></label>
        <p class="page-cover-picker-error" role="alert"></p>
        <button type="submit">Save cover</button>
      </form>`;
    }
    refreshIcons();
  }

  picker.addEventListener("click", event => {
    const button = (event.target as Element).closest<HTMLButtonElement>("button");
    if (!button) return;
    const tab = button.dataset.coverTab as CoverTab | undefined;
    if (tab) { render(tab); return; }
    if (button.hasAttribute("data-cover-remove")) { options.onRemove(); close(); return; }
    const asset = button.dataset.coverAsset;
    if (asset) { options.onSelect(galleryCoverPath(asset)); close(); }
  });
  picker.addEventListener("keydown", event => {
    const tab = (event.target as Element).closest<HTMLButtonElement>("[data-cover-tab]");
    if (!tab) return;
    const tabs = Array.from(picker.querySelectorAll<HTMLButtonElement>("[data-cover-tab]"));
    const index = tabs.indexOf(tab);
    const next = event.key === "ArrowRight" ? (index + 1) % tabs.length
      : event.key === "ArrowLeft" ? (index - 1 + tabs.length) % tabs.length
      : event.key === "Home" ? 0
      : event.key === "End" ? tabs.length - 1
      : -1;
    if (next < 0) return;
    event.preventDefault();
    render(tabs[next].dataset.coverTab as CoverTab);
    tabs[next].focus();
  });
  picker.addEventListener("submit", event => {
    const form = event.target as HTMLFormElement;
    if (!form.matches("[data-cover-link-form]")) return;
    event.preventDefault();
    const value = form.querySelector<HTMLInputElement>("[name=cover]")!.value.trim();
    const error = form.querySelector<HTMLElement>(".page-cover-picker-error")!;
    if (!value || !isPageCoverPath(value)) {
      error.textContent = "Use an HTTP(S) image URL or an assets/ path.";
      return;
    }
    options.onSelect(value);
    close();
  });
  picker.addEventListener("change", event => {
    const input = event.target as HTMLInputElement;
    if (activeTab !== "upload" || input.type !== "file") return;
    const file = input.files?.[0];
    if (!file) return;
    const error = body.querySelector<HTMLElement>(".page-cover-picker-error")!;
    if (!/^image\/(?:png|jpeg|webp|gif|avif)$/.test(file.type) || file.size > 15 * 1024 * 1024) {
      error.textContent = "Choose a supported image up to 15 MB.";
      input.value = "";
      return;
    }
    input.disabled = true;
    void options.onUpload(file).then(close).catch(cause => {
      input.disabled = false;
      error.textContent = "Upload failed. Please try again.";
      options.onError(cause);
    });
  });
  document.addEventListener("pointerdown", outside, true);
  document.addEventListener("keydown", keydown, true);
  window.addEventListener("resize", position);
  document.querySelector("#main")?.addEventListener("scroll", position);
  render("gallery");
  position();
  picker.querySelector<HTMLButtonElement>('[data-cover-tab="gallery"]')?.focus();
  return close;
}
