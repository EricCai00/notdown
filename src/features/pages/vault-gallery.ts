import { setUIText, setUIAttribute } from "../../shared/i18n";
import type { Page } from "../../shared/types";
import { vaultPrefix } from "../../shared/vault-url";
import { pageCardPreview } from "./page-card-preview";
import { cardPreviewChoices, defaultGalleryPreview, type CardPreviewMode } from "./page-card-preview-model";

/** Vault layout preferences are local to this vault and do not edit page metadata. */
export function mountVaultGallery(host: HTMLElement, pages: Page[]) {
  const key = `notdown-vault-gallery-preview:${vaultPrefix() || "default"}`;
  let mode: CardPreviewMode = defaultGalleryPreview;
  try { const saved = localStorage.getItem(key); if (cardPreviewChoices.some(([id]) => id === saved)) mode = saved as CardPreviewMode; } catch { /* Optional preference. */ }
  const label = document.createElement("label"); label.className = "vault-gallery-preview-setting";
  const name = document.createElement("span"); setUIText(name, "Card preview");
  const select = document.createElement("select"); setUIAttribute(select, "aria-label", "Card preview");
  for (const [id, title] of cardPreviewChoices) { const option = document.createElement("option"); option.value = id; setUIText(option, title); select.append(option); }
  select.value = mode; label.append(name, select); host.querySelector(".library-toolbar")?.append(label);
  const draw = () => {
    const byId = new Map(pages.map(page => [page.id, page]));
    for (const card of host.querySelectorAll<HTMLElement>(".gallery-card")) {
      card.querySelector(".page-card-preview")?.remove();
      const page = byId.get(card.dataset.open!); if (!page) continue;
      const preview = pageCardPreview(page, mode); if (preview) card.prepend(preview);
    }
  };
  select.onchange = () => { mode = select.value as CardPreviewMode; try { localStorage.setItem(key, mode); } catch { /* Session choice still works. */ } draw(); };
  draw();
}
