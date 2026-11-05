import { cardPreviewDocument, defaultGalleryPreview, firstCardBlock, type CardPreviewMode } from "./page-card-preview-model";
import DOMPurify from "dompurify";
import { renderNotionMarkdown } from "../../document/document-format";
import { editorKind } from "../../document/node-identity";
import type { Page } from "../../shared/types";
import { vaultAssetUrl } from "../../shared/vault-url";
import "./page-card-preview.css";

export function cardMediaUrl(value: unknown): string | undefined {
  if (typeof value === "string" && /^(https?:\/\/|\/?assets\/|\.\.?\/assets\/|\/page-covers\/)/i.test(value)) return vaultAssetUrl(value);
}

export function pageCardPreview(page: Page, mode: CardPreviewMode = defaultGalleryPreview, fitImage = false): HTMLElement | undefined {
  if (mode === "none") return;
  const box = document.createElement("div"); box.className = "page-card-preview"; box.dataset.userContent = "";
  box.classList.toggle("fit-image", fitImage);
  const image = (src: string) => {
    const img = document.createElement("img"); img.src = src; img.alt = ""; img.loading = "lazy";
    img.onerror = () => img.remove(); box.append(img);
  };
  if (mode === "cover") { const src = cardMediaUrl(page.properties.cover); if (src) image(src); return box; }
  try {
    const doc = cardPreviewDocument(page), first = firstCardBlock(doc);
    if (!first) return box;
    // Keep complete block boundaries; the fixed preview frame clips the ordered
    // blocks to its available height, including a partly visible final block.
    const selected = mode === "content" ? doc.type.create(doc.attrs, first) : doc;
    const content = document.createElement("div"); content.className = "page-card-preview-content";
    // No live embeds, execution, links, or editable controls inside a card.
    content.innerHTML = DOMPurify.sanitize(renderNotionMarkdown(page.body, [], { document: selected }), {
      FORBID_TAGS: ["iframe", "object", "embed", "form", "button", "input", "style", "audio"],
      FORBID_ATTR: ["autoplay", "contenteditable", "id"],
      ALLOW_DATA_ATTR: false,
    });
    for (const media of content.querySelectorAll<HTMLImageElement | HTMLVideoElement>("img, video")) {
      const src = cardMediaUrl(media.getAttribute("src"));
      if (!src) { media.remove(); continue; }
      media.src = src;
      if (media instanceof HTMLImageElement) { media.loading = "lazy"; media.onerror = () => media.remove(); }
      else { media.muted = true; media.preload = "metadata"; media.removeAttribute("controls"); media.removeAttribute("poster"); }
    }
    for (const link of content.querySelectorAll("a")) link.replaceWith(...link.childNodes);
    if (mode === "first-image") {
      const firstImage = content.querySelector("img");
      if (firstImage) { box.append(firstImage); return box; }
      return pageCardPreview(page, "content", fitImage);
    }
    const media = content.querySelector("img, video");
    if (mode !== "first-blocks" && media && (["image_block", "media_block"].includes(editorKind(first)) || !content.textContent?.trim())) box.append(media);
    else { box.classList.add("is-content"); box.append(content); }
  } catch {
    box.classList.add("is-content"); box.textContent = page.body.slice(0, 700);
  }
  return box;
}
