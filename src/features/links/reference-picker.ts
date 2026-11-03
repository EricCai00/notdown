import type { Page } from "../../shared/types";
import { escape } from "../../shared/types";
import { enabled, defaultSyntax, type SyntaxConfig } from "../../markdown-engine/config";
import { parseNative } from "../../markdown-engine/codec";
import { referenceLocations, type ReferenceLocation } from "../../document/reference-locations";
import { escapeXml } from "../../document/notion-syntax";

export function referenceMarkdown(page: Page, location: ReferenceLocation | undefined, config: SyntaxConfig, label = ""): string {
  const wiki = enabled(config, "wikilinks_title_after_pipe");
  const fragment = location ? wiki && location.kind === "heading" ? location.headingPath!.join("#") : location.fragment : "";
  const destination = page.id + (fragment ? "#" + fragment : "");
  const display = label || (location ? `${page.title} › ${location.label}` : page.title);
  if (!location && enabled(config, "notion_pages") && !label)
    return `<mention-page url="#page/${encodeURIComponent(page.id)}">${escapeXml(page.title)}</mention-page>`;
  if (wiki && !/[\[\]|\r\n]/.test(destination + display))
    return `[[${destination}${label || location ? "|" + display : ""}]]`;
  const href = `#page/${encodeURIComponent(page.id)}${fragment ? "#" + encodeURIComponent(fragment) : ""}`;
  return `[${display.replace(/([\\\[\]])/g, "\\$1")}](${href})`;
}

export function mountReferencePicker(root: HTMLElement, kind: "page" | "location", pages: Page[], currentId: string, config: SyntaxConfig, insert: (source: string) => void) {
  const available = pages.filter(page => !page.trashed);
  root.innerHTML = `<label><span data-i18n="Page">Page</span><select aria-label="Reference page" data-i18n-aria-label="Reference page">${available.map(page => `<option value="${escape(page.id)}" ${page.id === currentId ? "selected" : ""}>${escape(page.title)}</option>`).join("")}</select></label>
    <label><span data-i18n="Display text (optional)">Display text (optional)</span><input aria-label="Reference display text" placeholder="Use the page or location name" data-i18n-placeholder="Use the page or location name" data-i18n-aria-label="Reference display text"></label>
    ${kind === "location" ? `<input aria-label="Find location" placeholder="Find a heading, block or anchor" data-i18n-placeholder="Find a heading, block or anchor" data-i18n-aria-label="Find location"><div data-reference-locations></div>` : `<button class="primary" data-reference-insert data-i18n="Insert page link">Insert page link</button>`}`;
  const select = root.querySelector<HTMLSelectElement>("select")!;
  const label = root.querySelector<HTMLInputElement>('[data-i18n-aria-label="Reference display text"]')!;
  const selected = () => available.find(page => page.id === select.value)!;
  if (kind === "page") root.querySelector("button")!.addEventListener("click", () => insert(referenceMarkdown(selected(), undefined, config, label.value)));
  else {
    const search = root.querySelector<HTMLInputElement>('[data-i18n-aria-label="Find location"]')!;
    const list = root.querySelector<HTMLElement>("[data-reference-locations]")!;
    let locations: ReferenceLocation[] = [];
    const render = () => {
      const query = search.value.trim().toLocaleLowerCase();
      list.innerHTML = locations.map((location, index) => ({ location, index }))
        .filter(({ location }) => `${location.label} ${location.fragment} ${location.kind}`.toLocaleLowerCase().includes(query))
        .map(({ location, index }) => `<button class="search-result" data-location-index="${index}"><span>${escape(location.label)}</span><small>${escape(location.kind)} · ${escape(location.fragment)}</small></button>`).join("") || `<p data-i18n="No matching locations. Headings, existing block IDs and anchors appear here.">No matching locations. Headings, existing block IDs and anchors appear here.</p>`;
    };
    const load = () => {
      const page = selected();
      locations = referenceLocations(parseNative(page.body, page.syntax || defaultSyntax(page.bodyFormat)));
      render();
    };
    select.addEventListener("change", load);
    search.addEventListener("input", render);
    list.addEventListener("click", event => {
      const button = (event.target as Element).closest<HTMLElement>("[data-location-index]");
      if (button) insert(referenceMarkdown(selected(), locations[Number(button.dataset.locationIndex)], config, label.value));
    });
    load();
  }
}
