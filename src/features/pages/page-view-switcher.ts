import { escape as e } from "../../shared/types";
import { t } from "../../shared/i18n";
import "./page-view-switcher.css";

const icon = (name: string) => `<i data-lucide="${e(name)}" aria-hidden="true"></i>`;

export const pageViews = [
  ["document", "file-text", "Page", "Page", "Write with blocks"],
  ["outline", "list-tree", "Outline", "Outline", "Browse headings and lists"],
  ["mindmap", "network", "Mind map", "Mind map", "Explore page branches"],
  ["source", "code-xml", "Markdown source", "Source", "Edit Markdown directly"],
  ["split", "columns-2", "Source and page", "Split", "Edit source beside the page"],
] as const;
export type PageView = (typeof pageViews)[number][0];

export function renderPageViewSwitcher(view: PageView, visible: boolean) {
  const host = document.querySelector<HTMLDetailsElement>("#page-view-switcher");
  if (!host) return;
  const restoreFocus = host.contains(document.activeElement);
  host.hidden = !visible;
  host.open = false;
  if (!visible) { host.replaceChildren(); return; }
  const selected = pageViews.find(([id]) => id === view) ?? pageViews[0];
  host.innerHTML = `<summary aria-label="${e(t("Switch view"))}" title="${e(t("Switch view"))}" aria-haspopup="menu" data-i18n-aria-label="Switch view" data-i18n-title="Switch view">
    ${icon(selected[1])}<span class="page-view-current" data-i18n="${e(selected[3])}">${e(t(selected[3]))}</span>${icon("chevron-down")}
  </summary><div class="page-options-menu page-view-menu" role="menu" aria-label="${e(t("Page view"))}" data-i18n-aria-label="Page view">
    <small data-i18n="Page view">${e(t("Page view"))}</small>
    ${pageViews.map(([id, glyph, label, , description]) => `${id === "source" ? '<hr role="separator">' : ""}<button type="button" role="menuitemradio" aria-checked="${view === id}" aria-label="${e(t(label))}" data-i18n-aria-label="${e(label)}" data-view="${id}">
      <span class="page-view-icon" aria-hidden="true">${icon(glyph)}</span><span class="page-view-copy"><span data-i18n="${e(label)}">${e(t(label))}</span><small data-i18n="${e(description)}">${e(t(description))}</small></span><span class="page-view-check" aria-hidden="true">${view === id ? icon("check") : ""}</span>
    </button>`).join("")}
  </div>`;
  if (restoreFocus) host.querySelector("summary")?.focus({ preventScroll: true });
}
