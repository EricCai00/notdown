import type { Page } from "../../shared/types";
import { pageIconElement } from "../../shared/page-icons";
import { t } from "../../shared/i18n";

export function databaseRecordIcon(page?: Pick<Page, "icon" | "body">): string {
  return !page?.icon || page.icon === "file-text" && !page.body.trim() ? "file" : page.icon;
}

/** Shared by imported read-only relations and editable local relation values. */
export function databasePageReference(page: Page | undefined, fallback: string, href?: string): HTMLElement {
  const reference = document.createElement(href ? "a" : "span");
  reference.className = "database-page-reference";
  if (href) (reference as HTMLAnchorElement).href = href;
  reference.append(pageIconElement(databaseRecordIcon(page)));
  const label = document.createElement("span"); label.className = "database-page-reference-label";
  label.textContent = page?.importedEmptyTitle ? t("New page") : page?.title || fallback || t("New page");
  reference.append(label);
  return reference;
}
