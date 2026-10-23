import { createElement, icons, type IconNode } from "lucide";
import { assetDisplayUrl } from "./asset-display";

// Include the installed library's complete public catalog, including legacy aliases.
// Look up names before classifying text, so names containing digits remain icons.
export const lucidePageIcons = Object.entries(icons).map(([name, node]) => ({
  name: name.replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([a-zA-Z])([0-9])/g, "$1-$2").toLowerCase(),
  node,
})).sort((a, b) => a.name.localeCompare(b.name));

const lookup = new Map<string, IconNode>(lucidePageIcons.map(({ name, node }) => [name.replaceAll("-", ""), node]));

export function lucidePageIcon(name?: string): IconNode | undefined {
  return name && /^[a-z][a-z0-9-]*$/i.test(name)
    ? lookup.get(name.replaceAll("-", "").toLowerCase()) : undefined;
}

/** Unknown names fall back without changing the saved metadata; symbols stay text. */
export function pageIconElement(icon?: string): Element {
  if (icon && /^assets\/[a-zA-Z0-9_-]+\.(?:png|jpe?g|gif|webp|avif|svg|ico)$/i.test(icon)) {
    const image = document.createElement("img");
    image.className = "page-link-icon image"; image.src = assetDisplayUrl(icon); image.alt = "";
    image.width = image.height = 16; image.style.objectFit = "contain";
    return image;
  }
  const node = lucidePageIcon(icon);
  if (icon && !node && /[^a-z0-9-]/i.test(icon)) {
    const span = document.createElement("span");
    span.className = "page-link-icon emoji";
    span.setAttribute("aria-hidden", "true");
    span.textContent = icon;
    return span;
  }
  return createElement(node ?? icons.FileText, {
    class: "page-link-icon lucide",
    "data-page-icon": node ? icon! : "file-text",
    width: 16,
    height: 16,
    "stroke-width": 1.65,
    "aria-hidden": "true",
    focusable: "false",
  });
}
