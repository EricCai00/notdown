import { attributesXml } from "../src/document/notion-syntax.js";
import { notionSourceTags } from "../src/document/notion-v2.js";

/** Only actual original synced-block URLs establish identity. Duplicate source
 * IDs are ambiguous and never silently connected. Supplemental IDs are Notdown-only. */
export function localizeNotionSynced(pages: { id: string; source: string }[], localId: (id: string) => string, normalize: (id: string) => string, warn: (message: string) => void) {
  const originals = new Map<string, { page: string; block: string } | null>();
  const sourceId = (url: string) => { try { const parsed = new URL(url); normalize(parsed.origin + parsed.pathname); return normalize(parsed.hash ? decodeURIComponent(parsed.hash.slice(1)) : url); } catch { return; } };
  for (const page of pages) for (const tag of notionSourceTags(page.source)) if (["synced-block", "synced_block"].includes(tag.tag)) {
    const id = sourceId(tag.attrs.url || "");
    if (id) originals.set(id, originals.has(id) ? null : { page: page.id, block: tag.attrs.id || `notion-${id.replace(/-/g, "")}` });
  }
  let linked = 0;
  for (const page of pages) {
    for (const tag of notionSourceTags(page.source).reverse()) {
      if (!["synced-block", "synced_block", "synced-block-reference", "synced_block_reference"].includes(tag.tag)) continue;
      const id = sourceId(tag.attrs.url || ""), target = id && originals.get(id);
      if (!target) { if (tag.tag.endsWith("reference")) warn("Some synced blocks have no unique imported source; their snapshots and remote source references remain."); continue; }
      const reference = tag.tag.endsWith("reference");
      const attrs = reference ? { ...tag.attrs, url: `#page/${localId(target.page)}#block=${target.block}` } : { ...tag.attrs, id: target.block };
      page.source = page.source.slice(0, tag.from) + `<${tag.tag}${attributesXml(attrs)}${tag.selfClosing ? "/>" : ">"}` + page.source.slice(tag.to);
      if (reference) linked++;
    }
  }
  if (linked) warn(`Connected ${linked} synced block reference(s) to their verified local originals. Notion cloud synchronization is not enabled.`);
}
