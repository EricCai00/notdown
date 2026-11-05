import { createElement, Download } from "lucide";
import { setUIAttribute, setUIText } from "../../shared/i18n";
import { vaultAssetUrl } from "../../shared/vault-url";

/** The database banner uses the same cover assets and position as its host page. */
export function renderDatabasePageCover(region: HTMLElement, cover: string, position: number, choose: (anchor: HTMLElement) => void, save: (position: number) => void) {
  region.replaceChildren();
  if (!cover) return () => {};
  const image = document.createElement("img"); image.className = "page-cover"; image.src = vaultAssetUrl(cover); image.alt = "Database cover";
  image.style.objectPosition = `50% ${position}%`;
  const toolbar = document.createElement("div"); toolbar.className = "page-cover-toolbar";
  const button = (label: string, action: (button: HTMLButtonElement) => void) => {
    const el = document.createElement("button"); el.type = "button"; setUIText(el, label); el.onclick = () => action(el); return el;
  };
  let candidate = position, moving = false, stopDrag = () => {};
  const preview = () => { image.style.objectPosition = `50% ${candidate}%`; };
  const finish = () => {
    moving = false; stopDrag(); region.classList.remove("is-repositioning"); region.removeAttribute("tabindex"); region.removeAttribute("aria-label");
    toolbar.replaceChildren(change, reposition, download);
  };
  const change = button("Change", anchor => choose(anchor)); setUIAttribute(change, "aria-label", "Change cover");
  const reposition = button("Reposition", () => {
    moving = true; candidate = position; region.classList.add("is-repositioning"); region.tabIndex = 0;
    setUIAttribute(region, "aria-label", "Reposition cover with drag or arrow keys");
    toolbar.replaceChildren(button("Save position", () => { const value = Math.round(candidate); finish(); save(value); }), button("Cancel", () => { candidate = position; preview(); finish(); }));
    region.focus();
  });
  const download = document.createElement("a"); download.href = vaultAssetUrl(cover); download.download = ""; download.target = "_blank"; download.rel = "noopener noreferrer";
  setUIAttribute(download, "aria-label", "Download cover"); download.append(createElement(Download, { width: 14, height: 14, "aria-hidden": "true" }));
  toolbar.append(change, reposition, download); region.append(image, toolbar);
  const pointerDown = (event: PointerEvent) => {
    if (!moving || event.target !== image || event.button !== 0 || !image.naturalHeight) return;
    const scale = Math.max(region.clientWidth / image.naturalWidth, region.clientHeight / image.naturalHeight);
    const overflow = image.naturalHeight * scale - region.clientHeight; if (overflow <= 0) return;
    event.preventDefault(); stopDrag();
    const start = event.clientY, baseline = candidate;
    image.setPointerCapture(event.pointerId);
    const move = (event: PointerEvent) => { candidate = Math.max(0, Math.min(100, baseline - (event.clientY - start) * 100 / overflow)); preview(); };
    stopDrag = () => {
      image.removeEventListener("pointermove", move); image.removeEventListener("pointerup", stopDrag); image.removeEventListener("pointercancel", stopDrag);
      if (image.hasPointerCapture(event.pointerId)) image.releasePointerCapture(event.pointerId);
    };
    image.addEventListener("pointermove", move); image.addEventListener("pointerup", stopDrag); image.addEventListener("pointercancel", stopDrag);
  };
  const keyDown = (event: KeyboardEvent) => {
    if (!moving) return;
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); candidate = position; preview(); finish(); reposition.focus(); }
    if (["ArrowUp", "ArrowDown"].includes(event.key)) { event.preventDefault(); candidate = Math.max(0, Math.min(100, candidate + (event.key === "ArrowUp" ? -5 : 5))); preview(); }
  };
  region.addEventListener("pointerdown", pointerDown); region.addEventListener("keydown", keyDown);
  return () => { finish(); region.removeEventListener("pointerdown", pointerDown); region.removeEventListener("keydown", keyDown); };
}
