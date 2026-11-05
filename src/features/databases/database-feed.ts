import MarkdownIt from "markdown-it";
import DOMPurify from "dompurify";
import { t, uiLanguage } from "../../shared/i18n";
import { vaultAssetUrl } from "../../shared/vault-url";
import type { Page } from "../../shared/types";
import type { DatabaseProperty, DatabaseView } from "./database-model";
import { documentMetadata } from "../metadata/document-metadata";
import { pageIconElement } from "../../shared/page-icons";
import { allPeople } from "../people/people-client";
import "./database-advanced-layouts.css";

// A read-only CommonMark preview. Never serialize this projection back into the page.
const markdown = new MarkdownIt({ html: false, breaks: false });

function personName(value: unknown): string {
  if (Array.isArray(value)) return value.map(personName).filter(Boolean).join(", ");
  if (typeof value === "string") return value.trim();
  if (!value || typeof value !== "object") return "";
  const person = value as Record<string, unknown>;
  return allPeople().find(item => item.id === person.id)?.name ?? (typeof person.name === "string" ? person.name : "");
}

export function appendFeedHeader(card: HTMLElement, page: Page) {
  let author = page.properties.author;
  try { const metadata = documentMetadata(page.body); if (Object.hasOwn(metadata.values, "author")) author = metadata.values.author; } catch { /* Keep malformed source recoverable. */ }
  const name = personName(author);
  const header = document.createElement("header"); header.className = "database-feed-header";
  const avatar = document.createElement("span"); avatar.className = "database-feed-avatar"; avatar.setAttribute("aria-hidden", "true");
  if (name) avatar.textContent = Array.from(name)[0].toLocaleUpperCase();
  else { const icon = pageIconElement("file-text"); if (icon) avatar.append(icon); }
  const byline = document.createElement("div"); byline.className = "database-feed-byline";
  if (name) { const label = document.createElement("span"); label.className = "database-feed-author"; label.dataset.userContent = ""; label.textContent = name; byline.append(label); }
  const date = new Date(page.updated);
  if (!Number.isNaN(date.getTime())) {
    const time = document.createElement("time"); time.dateTime = date.toISOString(); time.title = date.toLocaleString(uiLanguage());
    const seconds = Math.round((date.getTime() - Date.now()) / 1000), magnitude = Math.abs(seconds);
    const [unit, divisor]: [Intl.RelativeTimeFormatUnit, number] = magnitude < 60 ? ["second", 1] : magnitude < 3600 ? ["minute", 60] : magnitude < 86400 ? ["hour", 3600] : ["day", 86400];
    const relative = magnitude < 60 ? t("just now") : new Intl.RelativeTimeFormat(uiLanguage(), { numeric: "auto", style: "short" }).format(Math.round(seconds / divisor), unit);
    time.textContent = t("Updated {time}", { time: relative }); byline.append(time);
  }
  header.append(avatar, byline); card.append(header);
}

function feedDate(value: string, timeZone?: string): string {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(day ? `${value}T12:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return value;
  try { return date.toLocaleString(uiLanguage(), { year: "numeric", month: "long", day: "numeric", ...(day ? { timeZone: "UTC" } : { hour: "numeric", minute: "2-digit", ...(timeZone ? { timeZone } : {}) }) }); }
  catch { return value; }
}

/** Readable projections only: dates retain both ends; references keep their stored fallback. */
export function appendFeedProperty(host: HTMLElement, field: DatabaseProperty, value: unknown, pages: Page[], open?: (page: Page) => void): boolean {
  if (field.type === "date") {
    const range = value && typeof value === "object" ? value as Record<string, unknown> : { start: value };
    if (typeof range.start !== "string") return false;
    const zone = typeof range.time_zone === "string" ? range.time_zone : undefined;
    host.textContent = [range.start, range.end].filter((part): part is string => typeof part === "string" && !!part).map(part => feedDate(part, zone)).join(" → "); return true;
  }
  if (field.type === "people") { host.textContent = personName(value) || t("Unavailable reference"); return true; }
  if (field.type !== "relation") return false;
  host.classList.add("database-feed-relations");
  for (const valueItem of Array.isArray(value) ? value : [value]) {
    const item: Record<string, unknown> = valueItem && typeof valueItem === "object" ? valueItem as Record<string, unknown> : { pageId: valueItem };
    const target = pages.find(page => page.id === item.pageId && !page.trashed);
    const reference = document.createElement(target && open ? "button" : "span"); reference.className = "database-feed-reference";
    const icon = pageIconElement(target?.icon || "file-text"); if (icon) reference.append(icon);
    const label = document.createElement("span"); label.textContent = target?.title ?? (typeof item.title === "string" ? item.title : t("Unavailable reference")); reference.append(label);
    if (reference instanceof HTMLButtonElement && target && open) { reference.type = "button"; reference.onclick = () => open(target); }
    host.append(reference);
  }
  return true;
}

export function appendFeedContent(card: HTMLElement, page: Page, view: DatabaseView) {
  let body = page.body;
  try { const metadata = documentMetadata(body); if (metadata.form === "yaml") body = body.replace(/^(?:\uFEFF)?---[\t ]*\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[\t ]*(?:\r?\n|$)/, ""); } catch { /* Invalid source remains visible. */ }
  const content = document.createElement("div"); content.className = "database-feed-content"; content.dataset.userContent = "";
  content.innerHTML = DOMPurify.sanitize(markdown.render(body), { FORBID_TAGS: ["iframe", "form", "input", "button", "style"] });
  for (const img of content.querySelectorAll("img")) { const src = img.getAttribute("src") ?? ""; if (/^(https?:\/\/|\/?assets\/|\.\.?\/assets\/)/i.test(src)) { img.src = vaultAssetUrl(src); img.loading = "lazy"; img.alt ||= ""; } else img.remove(); }
  for (const link of content.querySelectorAll("a")) { const href = link.getAttribute("href") ?? ""; if (/^https?:\/\//i.test(href)) { link.target = "_blank"; link.rel = "noopener noreferrer"; } else if (!/^(mailto:|tel:)/i.test(href)) { link.removeAttribute("href"); } }
  content.classList.toggle("is-preview", view.layout?.feedContent !== "full"); if (content.childNodes.length) card.append(content);
}
