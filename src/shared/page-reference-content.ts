import { pageIconElement } from "./page-icons";
import { referenceArrow } from "./reference-arrow";

/** Shared presentation only. Ownership, routes and source labels stay with each view. */
export function pageReferenceContent(label: string, icon?: string, reference = false): HTMLElement[] {
  const slot = document.createElement("span"); slot.className = "page-link-icon-slot"; slot.setAttribute("aria-hidden", "true");
  slot.append(pageIconElement(icon));
  if (reference) slot.append(referenceArrow("page-link-reference-arrow"));
  const text = document.createElement("span"); text.className = "page-link-label"; text.textContent = label;
  return [slot, text];
}
