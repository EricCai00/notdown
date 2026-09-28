import { createElement, ArrowUpRight } from "lucide";
import { pageIconElement } from "./page-icons";

/** Shared presentation only. Ownership, routes and source labels stay with each view. */
export function pageReferenceContent(label: string, icon?: string, reference = false): HTMLElement[] {
  const slot = document.createElement("span"); slot.className = "page-link-icon-slot"; slot.setAttribute("aria-hidden", "true");
  slot.append(pageIconElement(icon));
  if (reference) slot.append(createElement(ArrowUpRight, {
    class: "page-link-reference-arrow", width: 18, height: 18, "stroke-width": 1.8, "aria-hidden": "true", focusable: "false",
  }));
  const text = document.createElement("span"); text.className = "page-link-label"; text.textContent = label;
  return [slot, text];
}
