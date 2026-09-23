import {
  blockCatalog,
  childStructureCatalog,
  type CatalogEntry,
} from "./block-catalog-data";
import { getContentCapabilities } from "../document/content-objects";
import {
  catalogExtensions,
  catalogExtension,
  catalogObjects,
  extensionCategories,
  extensionsForObject,
  objectsForExtension,
  variantsForObject,
  objectsForVariant,
  variantReferences,
  objectReferences,
  objectFeatureNotes,
  workbookStateLabel,
  type Reference,
} from "./catalog-relations";
import {
  dialects,
  extensions,
  enabled,
  supportsOption,
  syntaxFormat,
  canonicalExtensionId,
  type SyntaxConfig,
  type Dialect,
} from "../markdown-engine/config";
import { parseNative, serializeNative } from "../markdown-engine/codec";
import { BlockEditor } from "../editor/prosemirror-editor";
import "../app/style.css";
import "../markdown-engine/products.css";
import "./block-catalog.css";
import { groupExtensions, extensionProvenanceHtml, pandocDefaultVersion, isBuiltInSyntax } from "./extension-provenance";
import "./extension-provenance.css";
import { extensionCategoryHeading } from "./extension-categories";
import { syntaxForObject, syntaxForExtension, syntaxForVariant, syntaxSearchText } from "./catalog-syntax-index";
import { workbookCaptured, type SyntaxGuide } from "./catalog-syntax";

const escape = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const root = document.querySelector<HTMLDivElement>("#catalog")!;
root.innerHTML = `<header class="catalog-header"><a href="/">← Notdown</a><span>REFERENCE LIBRARY</span></header>
<main class="catalog-main"><div class="catalog-intro"><p>Explore your building blocks</p><h1>Block Explorer</h1><p>Content objects, editing capabilities and source encodings. Examples stay in this preview and never write to your vault.</p></div>
<nav class="catalog-tabs" aria-label="Browse catalog"><button data-tab="blocks" aria-pressed="true">Content objects</button><button data-tab="implementation" aria-pressed="false">Child structures</button><button data-tab="dialects" aria-pressed="false">Markdown variants</button><button data-tab="extensions" aria-pressed="false">Extensions</button></nav>
<div class="catalog-filters"><label>Search<input type="search" aria-label="Search catalog" placeholder="Name, alias or extension…"/></label><label class="category-filter">Category<select aria-label="Block category"><option value="">All categories</option>${["block", "metadata", "inline", "character"].map((c) => `<option>${c}</option>`).join("")}</select></label><label class="extension-category-filter" hidden>Extension source<select aria-label="Extension source"><option value="">All sources</option>${Object.entries(
  extensionCategories,
)
  .map(([id, label]) => `<option value="${id}">${label}</option>`)
  .join(
    "",
  )}</select></label><label class="dialect-filter">Dialect<select aria-label="Catalog dialect">${dialects.map((d) => `<option value="${d.id}">${d.label}</option>`).join("")}</select></label></div>
<p class="catalog-count" aria-live="polite"></p><div class="catalog-layout"><section class="catalog-results" aria-label="Catalog results"></section><aside class="catalog-detail" aria-label="Block details"></aside></div></main>`;
let tab = "blocks",
  query = "",
  category = "",
  extensionCategory = "",
  variant: Dialect = "typora",
  selected = blockCatalog[0].id;
let preview: BlockEditor | undefined;
const results = root.querySelector<HTMLElement>(".catalog-results")!;
const detail = root.querySelector<HTMLElement>(".catalog-detail")!;
const count = root.querySelector<HTMLElement>(".catalog-count")!;
const config = (): SyntaxConfig => ({ version: 1, variant, extensions: {} });
const matches = (...values: string[]) =>
  values.join(" ").toLowerCase().includes(query.toLowerCase());
const stateLabel = (id: string, c = config()) =>
  isBuiltInSyntax(c.variant, id) ? "Built-in syntax · no switch" : !supportsOption(c, id)
    ? "Not applicable as a configurable switch"
    : enabled(c, id)
      ? "Enabled by default"
      : "Disabled by default · optional";
const modes: Record<string, string> = {
  direct: "Direct editing",
  source: "Source editing",
  reference: "Reference payload",
  text: "Text processing",
  preserved: "Source preservation",
};
function href(targetTab: string, id = "", targetVariant = variant) {
  return (
    "#" + new URLSearchParams({ tab: targetTab, id, variant: targetVariant,
      ...(targetTab === tab ? { q: query, category, source: extensionCategory } : {}),
    })
  );
}
const objectLink = (id: string) => {
  const object = catalogObjects.find((o) => o.id === id)!;
  return `<a data-object="${escape(id)}" href="${href("blocks", id)}">${escape(object.name)} <small>${object.category}</small></a>`;
};
const extensionLink = (id: string) =>
  `<a data-extension="${escape(id)}" href="${href("extensions", id)}">${escape(catalogExtension(id)?.label ?? id)}</a>`;
const variantLink = (id: Dialect) =>
  `<a data-variant="${id}" href="${href("dialects", id, id)}">${escape(dialects.find((d) => d.id === id)!.label)}</a>`;
const referenceLinks = (refs: Reference[]) =>
  `<ul class="catalog-links">${refs.map((r) => `<li><a href="${escape(r.url)}" target="_blank" rel="noopener noreferrer">${escape(r.label)} ↗</a></li>`).join("")}</ul>`;
function syntaxDescriptions(guides: SyntaxGuide[]) {
  if (!guides.length) return "";
  return `<section class="catalog-syntax"><h3>Syntax guide <small>${guides.length} entries</small></h3><p class="catalog-muted">Workbook markdown / extended · ${workbookCaptured}; Pandoc manual · 3.11 extension inventory. Reference associations do not imply default support or complete implementation. Examples below are source text, never executed.</p>${guides.map(s => `<details class="catalog-syntax-entry" data-syntax-id="${escape(s.id)}"><summary>${escape(s.title)} <small>${escape(s.locator)}</small>${s.correction ? ' <span class="catalog-syntax-badge">Correction</span>' : ''}${s.limitation ? ' <span class="catalog-syntax-badge">Limited / unavailable</span>' : ''}</summary><p><small>${escape(s.origin)}</small></p><p>${escape(s.note)}</p>${s.source ? `<pre class="catalog-syntax-source">${escape(s.source)}</pre>` : '<p class="catalog-muted">No Markdown input syntax for this option.</p>'}${s.correction ? `<p class="catalog-syntax-correction"><strong>Mapping / example correction:</strong> ${escape(s.correction)}</p>` : ''}${s.limitation ? `<p><strong>Implementation boundary:</strong> ${escape(s.limitation)}</p>` : ''}<p class="catalog-muted">${s.id.startsWith('workbook-') ? 'Original workbook example retained; corrections are shown separately.' : 'Minimal authored example; some options change parsing rules or output behavior rather than adding syntax.'}</p>${s.extensions.length ? `<div class="catalog-tags">${s.extensions.map(id => extensionLink(id).replace("data-extension=", "data-syntax-extension=")).join('')}</div><p class="catalog-muted">Related switches in ${escape(dialects.find(d => d.id === variant)!.label)}: ${s.extensions.map(id => `${escape(id)} — ${escape(extensionState(id))}`).join('; ')}. Listed switches may be alternatives or modifiers, not cumulative requirements.</p>` : '<p class="catalog-muted">No dedicated registered extension for this entry; see the scope and implementation boundary above.</p>'}${s.objects.length ? `<div class="catalog-tags">${s.objects.map(id => objectLink(id).replace("data-object=", "data-syntax-object=")).join('')}</div>` : ''}${referenceLinks(s.references)}</details>`).join('')}</section>`;
}
const routeLabel = (route: ReturnType<typeof variantsForObject>[number]) =>
  route.status === "unavailable"
      ? "No registered route"
    : `${route.status === "default" ? "Default route" : "Optional route"} · ${route.editing.map((m) => modes[m]).join(", ")}`;
function objectRelations(id: string) {
  const relations = extensionsForObject(id);
  return `<h3>Related extensions</h3>${relations.length ? `<ul class="catalog-links">${relations.map((r) => `<li>${extensionLink(r.extensionId)} <small>${r.role === "encoding" ? "Encoding adapter" : r.role === "modifier" ? "Syntax modifier" : "Planned syntax"}</small></li>`).join("")}</ul>` : '<p class="catalog-muted">No extension relation registered. Core syntax may work without an extension.</p>'}
  <details class="catalog-variant-links"><summary>Markdown variants</summary><p>Registry routes in Notdown. Optional routes require extension switches; editing modes do not imply complete upstream support.</p><ul class="catalog-links">${variantsForObject(
    id,
  )
    .map((d) => `<li>${variantLink(d.id)}<small>${routeLabel(d)}</small></li>`)
    .join("")}</ul></details>`;
}
function showVariant(id: Dialect) {
  variant = id;
  const d = dialects.find((d) => d.id === id)!;
  const c: SyntaxConfig = { version: 1, variant: id, extensions: {} };
  // Include unavailable references so extension -> variant navigation always
  // offers a return link, without claiming that the preset supports the syntax.
  const related = groupExtensions(catalogExtensions, id);
  detail.innerHTML = `<small>Markdown variant</small><h2>${escape(d.label)}</h2><code>${id}</code><p>Local preset and registry routes. Page-level overrides may change these defaults.</p><h3>Official references</h3>${referenceLinks(variantReferences[id])}${syntaxDescriptions(syntaxForVariant(id))}
  <h3>Related extensions</h3>${related.map(group => `<section data-extension-group="${group.id}"><h4>${group.label}</h4><ul class="catalog-links">${group.entries.map((e, index) => `<li>${group.id === "other" ? extensionCategoryHeading(group.entries, index) : ""}${extensionLink(e.id)}<code>${escape(e.id)}</code>${extensionProvenanceHtml(id, e.id)}<small>${extensionState(e.id, c)}</small></li>`).join("")}</ul></section>`).join("")}
  <details class="catalog-object-links" open><summary>Content objects</summary><ul class="catalog-links">${objectsForVariant(
    id,
  )
    .map(
      (r) =>
        `<li>${objectLink(r.object.id)}<small>${r.status === "unavailable" ? "No registered route" : (r.status === "default" ? "Default route" : "Optional route") + " · " + r.editing.map((m) => modes[m]).join(", ")}</small></li>`,
    )
    .join("")}</ul></details>`;
}
function extensionState(id: string, c = config()) {
  const e = catalogExtension(id);
  return e?.status === "out-of-scope"
    ? "Outside Markdown scope"
    : e?.status === "pending"
      ? "Not implemented · unavailable"
      : stateLabel(id, c);
}
function showExtension(id: string) {
  const e = catalogExtension(id)!;
  const related = objectsForExtension(id);
  detail.innerHTML = `<small>${extensionCategories[e.category]}</small><h2>${escape(e.label)}</h2><code>${escape(e.id)}</code><p>${escape(e.description)}</p><p>${extensionState(id)}</p>${extensionProvenanceHtml(variant, id)}<h3>Name and scope</h3><p>${escape(e.namingNote)}</p>${id.startsWith("notion_") ? '<p class="catalog-muted">Canonical keys use notion_*. Registered legacy local_* and notdown_* aliases still resolve; the canonical key wins if both are present. A Notion feature name does not imply official Markdown encoding compatibility.</p>' : ""}
  ${syntaxDescriptions(syntaxForExtension(id))}
  <h3>Related objects</h3>${related.length ? `<ul class="catalog-links">${related.map((r) => `<li>${objectLink(r.objectId)}<small>${r.role === "encoding" ? "Encoding adapter" : r.role === "modifier" ? "Syntax modifier" : "Planned syntax · not an active adapter"}</small></li>`).join("")}</ul>` : '<p class="catalog-muted">No content-object relation registered. This may be a document-wide option or outside Markdown scope.</p>'}
  <h3>Markdown variants</h3><p class="catalog-muted">Syntax references, ${escape(pandocDefaultVersion)} defaults, current Notdown defaults and workbook annotations are separate. Missing Pandoc flags may be built-in syntax; product presets have no Pandoc defaults.</p><ul class="catalog-links">${dialects.map((d) => `<li>${variantLink(d.id)}${extensionProvenanceHtml(d.id, id)}<small>Notdown: ${extensionState(id, { version: 1, variant: d.id, extensions: {} })}</small><small>Workbook: ${escape(workbookStateLabel(e.workbookStates[d.id]))}</small></li>`).join("")}</ul>
  <h3>Sources</h3>${e.sourceRange ? `<p class="catalog-muted">markdown &amp; notion.xlsx · extensions!${e.sourceRange} · source: ${escape(e.sourceLabel)} · captured 2026-09-21</p>` : `<p class="catalog-muted">${escape(e.sourceLabel)} · local registry</p>`}${referenceLinks(e.references)}`;
}
function showEntry(entry: CatalogEntry) {
  preview?.destroy();
  preview = undefined;
  const object = entry.object;
  const capabilities = object
    ? getContentCapabilities(object.id, config())
    : undefined;
  detail.innerHTML = `<small>${escape(entry.category)}</small><h2>${escape(entry.label)}</h2><code>${escape(entry.id)}</code>
${object ? `<p class="catalog-status">${object.status} · ${object.stage} · ${object.structure}</p><p>${object.aliases.length ? "Aliases: " + object.aliases.map(escape).join(", ") : ""}</p><p>${capabilities!.available ? "Available routes in this dialect: " + capabilities!.editing.map((mode) => modes[mode]).join(", ") : "No active adapter in this dialect."}</p>` : ""}
${entry.note ? `<p>${escape(entry.note)}</p>` : ""}
${entry.parents ? `<h3>Parent content objects</h3><div class="catalog-tags">${entry.parents.map(objectLink).join("")}</div>` : ""}
${object && childStructureCatalog.some(e => e.parents?.includes(object.id)) ? `<h3>Child structures</h3><div class="catalog-tags">${childStructureCatalog.filter(e => e.parents?.includes(object.id)).map(e => `<a href="${href("implementation", e.id)}">${escape(e.label)}</a>`).join("")}</div>` : ""}
${object?.adapters.length ? `<details class="catalog-adapters"><summary>Encoding and editing details</summary><ul>${object.adapters.map((a) => `<li><code>${escape(a.carrier)}</code> — ${modes[a.editing]}${a.extensions.length ? "; " + a.extensions.map(extensionLink).join(" + ") : ""}</li>`).join("")}</ul></details>` : ""}
${object ? objectRelations(object.id) : ""}
${object ? syntaxDescriptions(syntaxForObject(object.id)) : ""}
${object ? objectFeatureNotes(object.id).map(note => `<p class="catalog-muted">${escape(note)}</p>`).join("") : ""}
${object && objectReferences[object.id]?.length ? `<h3>Syntax and feature references</h3>${referenceLinks(objectReferences[object.id])}` : ""}
${entry.extensions?.length ? `<h3>Example extensions</h3><div class="catalog-tags">${entry.extensions.map(extensionLink).join("")}</div>` : ""}
${entry.sample ? `<h3>Example <small>${variantLink(entry.variant)} · example settings</small></h3><div class="catalog-preview"></div><h3>Markdown source</h3><pre class="catalog-source"></pre><button class="catalog-copy">Copy example</button><span class="catalog-copy-status" role="status"></span>` : `<p class="catalog-muted">${object?.status === "planned" ? "Planned object. No insert action or working preview is provided." : "This entry is a capability or supporting structure, not a separate insert command. See its encoding and editing details."}</p>`}`;
  if (!entry.sample) return;
  detail.querySelector(".catalog-source")!.textContent = entry.sample;
  const mount = detail.querySelector<HTMLElement>(".catalog-preview")!;
  const external =
    object?.adapters.some((a) =>
      /^(?:media|image|paragraph.image|syntax\.(?:embed|figure|transclusion))/.test(
        a.carrier,
      ),
    ) ||
    [
      "syntax:transclusion",
      "syntax:figure",
      "syntax:embed",
      "image",
      "media_block",
    ].includes(entry.id) ||
    entry.id.startsWith("media:");
  if (external)
    mount.textContent =
      "This example needs an attachment or external resource. Replace its address with a resource in your vault.";
  else {
    const c: SyntaxConfig = {
      version: 1,
      variant: entry.variant,
      extensions: Object.fromEntries(
        (entry.extensions || []).map((id) => [id, true]),
      ),
    };
    try {
      preview = new BlockEditor(mount, {
        value: entry.sample,
        pages: () => [],
        onChange() {},
        onInsert() {},
        onError(error) {
          mount.textContent = String(error);
        },
        codec: {
          parse: (source) => parseNative(source, c),
          serialize: (doc) => serializeNative(doc, c),
          format: syntaxFormat(c),
        },
      });
      preview.setEditable(false);
      mount.inert = true;
    } catch (error) {
      mount.textContent = `Unable to preview: ${String(error)}`;
    }
  }
  detail.querySelector(".catalog-copy")?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(entry.sample!);
      detail.querySelector(".catalog-copy-status")!.textContent = "Copied";
    } catch {
      detail.querySelector(".catalog-copy-status")!.textContent =
        "Select and copy the source above.";
    }
  });
}
function render() {
  root.querySelector<HTMLInputElement>("input")!.value = query;
  root.querySelector<HTMLSelectElement>(
    '[aria-label="Block category"]',
  )!.value = category;
  root.querySelector<HTMLSelectElement>(
    '[aria-label="Extension source"]',
  )!.value = extensionCategory;
  root.querySelector<HTMLSelectElement>(
    '[aria-label="Catalog dialect"]',
  )!.value = variant;
  root
    .querySelectorAll<HTMLButtonElement>("[data-tab]")
    .forEach((button) =>
      button.setAttribute("aria-pressed", String(button.dataset.tab === tab)),
    );
  const catalogTab = tab === "blocks" || tab === "implementation";
  root.querySelector<HTMLElement>(".category-filter")!.hidden =
    tab !== "blocks";
  root.querySelector<HTMLElement>(".dialect-filter")!.hidden =
    tab !== "blocks" && tab !== "extensions";
  root.querySelector<HTMLElement>(".extension-category-filter")!.hidden =
    tab !== "extensions";
  detail.hidden = false;
  if (catalogTab) {
    const source =
      tab === "blocks"
        ? blockCatalog
        : childStructureCatalog;
    const primaryMatches = source.filter(
      (e) =>
        (tab !== "blocks" || !category || e.category === category) &&
        matches(
          e.id,
          e.label,
          e.category,
          ...(e.aliases || []),
          ...(e.extensions || []),
        ),
    );
    // A precise object/alias match wins over incidental words in its examples.
    const entries = primaryMatches.length ? primaryMatches : source.filter(e =>
      (tab !== "blocks" || !category || e.category === category) &&
      matches(syntaxSearchText(syntaxForObject(e.id))));
    count.textContent = `${entries.length} ${tab === "blocks" ? "content objects · implementation status is separate from dialect support" : "child structures · each links to its owning content object"}`;
    if (!entries.some((e) => e.id === selected))
      selected = entries[0]?.id || "";
    results.innerHTML =
      entries
        .map(
          (e) =>
            `<button class="catalog-card" data-entry="${escape(e.id)}" aria-pressed="${e.id === selected}"><small>${escape(e.category)}</small><strong>${escape(e.label)}</strong><code>${escape(e.id)}</code>${e.object ? `<small>${e.object.status} · ${e.object.stage}</small>` : ""}</button>`,
        )
        .join("") || '<p class="catalog-empty">No matching entries</p>';
    const entry = entries.find((e) => e.id === selected);
    if (entry) showEntry(entry);
    else {
      preview?.destroy();
      preview = undefined;
      detail.innerHTML = "";
    }
  } else {
    preview?.destroy();
    preview = undefined;
    if (tab === "dialects") {
      const items = dialects.filter((d) => matches(d.id, d.label, syntaxSearchText(syntaxForVariant(d.id))));
      count.textContent = `${items.length} native presets · not complete replicas of the corresponding products`;
      results.innerHTML = items
        .map((d) => {
          const c: SyntaxConfig = { version: 1, variant: d.id, extensions: {} };
          return `<article class="catalog-card"><small>Markdown variant</small><h2>${variantLink(d.id)}</h2><code>${d.id}</code><p>${extensions.filter((e) => enabled(c, e.id)).length} default extensions · ${extensions.filter((e) => supportsOption(c, e.id)).length} configurable extensions</p><button data-dialect="${d.id}">Browse extensions →</button></article>`;
        })
        .join("");
      if (!items.some((d) => d.id === selected)) selected = items[0]?.id || "";
      if (selected) showVariant(selected as Dialect);
      else detail.innerHTML = "";
    } else {
      const items = catalogExtensions.filter(
        (e) =>
          (!extensionCategory || e.category === extensionCategory) &&
          matches(
            e.id,
            e.label,
            e.oldLabel,
            e.legacyId,
            e.description,
            extensionCategories[e.category],
            e.sourceLabel,
            syntaxSearchText(syntaxForExtension(e.id)),
          ),
      );
      count.textContent = `${items.length} extensions · configurable syntax references first (required before optional; GFM Spec before Docs), built-in syntax second, then Others: Pandoc, Notdown Notion, Notdown Markdown extensions. ${pandocDefaultVersion} defaults are shown separately as badges. Outside Markdown scope stays last.`;
      const groups = groupExtensions(items, variant);
      if (!items.some((e) => e.id === selected)) selected = groups[0]?.entries[0]?.id || "";
      results.innerHTML =
        groups
          .map(group => `<section class="catalog-extension-group" data-extension-group="${group.id}"><h2>${group.label} <small>${group.entries.length}</small></h2>${group.entries.map(
            (e, index) =>
              `${group.id === "other" ? extensionCategoryHeading(group.entries, index) : ""}<article class="catalog-card ${e.status === "registered" ? "" : "catalog-pending"}" data-selected="${e.id === selected}" data-extension-id="${e.id}"><h2>${extensionLink(e.id)}</h2><code>${escape(e.id)}</code>${extensionProvenanceHtml(variant, e.id)}<small>Notdown: ${extensionState(e.id)}</small><p>${escape(e.description)}</p></article>`,
          ).join("")}</section>`)
          .join("") || '<p class="catalog-empty">No matching entries</p>';
      if (selected) showExtension(selected);
      else detail.innerHTML = "";
    }
  }
}
function saveLocation(push = true) {
  const hash =
    "#" +
    new URLSearchParams({
      tab,
      id: selected,
      variant,
      q: query,
      category,
      source: extensionCategory,
    });
  if (push) history.pushState(null, "", hash);
  else history.replaceState(null, "", hash);
}
function readLocation() {
  const params = new URLSearchParams(location.hash.slice(1));
  tab = ["blocks", "implementation", "dialects", "extensions"].includes(
    params.get("tab") || "",
  )
    ? params.get("tab")!
    : "blocks";
  selected = params.get("id") || "";
  if (tab === "extensions") selected = canonicalExtensionId(selected);
  if (selected === "inline.file_transclusion") selected = "block.file_transclusion";
  variant =
    dialects.find((d) => d.id === params.get("variant"))?.id ?? "typora";
  query = params.get("q") || "";
  category = params.get("category") || "";
  extensionCategory = params.get("source") || "";
  render();
  detail.scrollTop = 0;
}
window.addEventListener("hashchange", readLocation);
root.addEventListener("click", (event) => {
  const button = (event.target as Element).closest<HTMLButtonElement>("button");
  if (!button) return;
  if (button.dataset.tab) {
    tab = button.dataset.tab;
    query = "";
    category = "";
    extensionCategory = "";
  }
  if (button.dataset.entry) {
    selected = button.dataset.entry;
  }
  if (button.dataset.dialect) {
    variant = button.dataset.dialect as Dialect;
    tab = "extensions";
    query = "";
    extensionCategory = "";
  }
  if (!button.dataset.tab && !button.dataset.entry && !button.dataset.dialect)
    return;
  render();
  saveLocation();
  detail.scrollTop = 0;
});
root
  .querySelector<HTMLInputElement>("input")!
  .addEventListener("input", (event) => {
    query = (event.target as HTMLInputElement).value;
    render();
    saveLocation(false);
  });
root
  .querySelector<HTMLSelectElement>('[aria-label="Block category"]')!
  .addEventListener("change", (event) => {
    category = (event.target as HTMLSelectElement).value;
    render();
    saveLocation(false);
  });
root
  .querySelector<HTMLSelectElement>('[aria-label="Catalog dialect"]')!
  .addEventListener("change", (event) => {
    variant = (event.target as HTMLSelectElement).value as Dialect;
    render();
    saveLocation(false);
  });
root
  .querySelector<HTMLSelectElement>('[aria-label="Extension source"]')!
  .addEventListener("change", (event) => {
    extensionCategory = (event.target as HTMLSelectElement).value;
    render();
    saveLocation(false);
  });
readLocation();
