import { parseNotionMarkdown } from "../src/document/notion-markdown.js";
import { openingTag, attributesXml, escapeXml } from "../src/document/notion-syntax.js";
import { notionSourceTags } from "../src/document/notion-v2.js";
import { notionBlockContent } from "./notion-block-content.js";
import { VaultError } from "./vault.js";

type Json = Record<string, any>;
type Options = {
  normalizeId(value: unknown): string;
  readBlock(id: string): Promise<Json>;
  pageTitle(id: string): Promise<string>;
  warn(message: string): void;
  version?: "v1" | "v2";
  local?: boolean;
  readMarkdown?(id: string): Promise<string | undefined>;
  readChildren?(id: string): Promise<Json[]>;
  recoverPrivateBlock?(block: Json): Promise<string | undefined>;
};

/** Enrich only parsed unknown placeholders. Their URL addresses the source
 * block; the destination must come from a verified Block API response. */
export async function enrichNotionBlocks(source: string, options: Options): Promise<string> {
  if (options.version === "v2") return enrichV2(source, options);
  const placeholders: { from: number; to: number; url: string; attrs: Record<string, string> }[] = [];
  parseNotionMarkdown(source).descendants(node => {
    if (node.type.name !== "block.unsupported" || typeof node.attrs.sourceStart !== "number") return;
    const raw = source.slice(node.attrs.sourceStart, node.attrs.sourceEnd);
    const indent = raw.length - raw.trimStart().length;
    const tag = openingTag(raw.slice(indent));
    if (tag?.tag !== "unknown" || !tag.selfClosing) return;
    placeholders.push({ from: node.attrs.sourceStart + indent, to: node.attrs.sourceStart + indent + tag.length,
      url: tag.attrs.url || "", attrs: tag.attrs });
  });
  const edits: { from: number; to: number; text: string }[] = [];
  for (const placeholder of placeholders) {
    let id: string;
    try {
      // Validate the host/path first; fragments may contain the actual block ID.
      const url = new URL(placeholder.url);
      options.normalizeId(url.origin + url.pathname);
      id = options.normalizeId(url.hash ? decodeURIComponent(url.hash.slice(1)) : url.origin + url.pathname);
    } catch {
      options.warn("An unknown block has no usable Notion block URL; its placeholder was preserved.");
      continue;
    }
    const block = await options.readBlock(id);
    if (block.object !== "block" || typeof block.id !== "string" || block.id.toLowerCase() !== id ||
        block.archived || block.in_trash || block.has_children) {
      options.warn(`Block ${id}: unavailable, invalid or contains children; its placeholder was preserved.`);
      continue;
    }
    const { url: _url, alt: _alt, ...extra } = placeholder.attrs;
    const attributes = (values: Record<string, string>) => attributesXml({ ...extra, ...values })
      .replace(/\r/g, "&#13;").replace(/\n/g, "&#10;");
    const data = block[block.type];
    let text: string | undefined;
    if (block.type === "link_to_page" && data?.type === "page_id") {
      let target: string;
      try { target = options.normalizeId(data.page_id); } catch { target = ""; }
      if (target) text = `<page-link${attributes({ url: `https://www.notion.so/${target}` })}>${escapeXml(await options.pageTitle(target)).replace(/\r/g, "&#13;").replace(/\n/g, "&#10;")}</page-link>`;
    } else if (["bookmark", "embed", "link_preview"].includes(block.type) && typeof data?.url === "string") {
      const tag = ({ bookmark: "bookmark", embed: "web-embed", link_preview: "link-preview" } as Record<string, string>)[block.type];
      // Card captions are plain text in the existing codec; rich-text detail
      // remains available in the archived Block JSON.
      const caption = Array.isArray(data.caption) ? data.caption.map((part: Json) =>
        typeof part.plain_text === "string" ? part.plain_text : typeof part.text?.content === "string" ? part.text.content : "").join("") : "";
      text = `<${tag}${attributes({ url: data.url, ...(caption ? { caption } : {}) })}/>`;
    } else if (block.type === "breadcrumb" && data && typeof data === "object") {
      text = `<breadcrumb${attributes({})}/>`;
    }
    if (text) edits.push({ from: placeholder.from, to: placeholder.to, text });
    else options.warn(`Block ${id}: ${String(block.type || "unsupported")} has no supported Notdown conversion; its placeholder was preserved.`);
  }
  if (edits.length) options.warn(`Restored ${edits.length} unknown block(s) using Block API data and Notdown syntax.`);
  for (const edit of edits.sort((a, b) => b.from - a.from))
    source = source.slice(0, edit.from) + edit.text + source.slice(edit.to);
  return source;
}

function sourceBlockId(url: string, options: Options): string | undefined {
  try {
    const parsed = new URL(url);
    options.normalizeId(parsed.origin + parsed.pathname);
    return options.normalizeId(parsed.hash ? decodeURIComponent(parsed.hash.slice(1)) : parsed.origin + parsed.pathname);
  } catch { return; }
}

async function enrichV2(source: string, options: Options, ancestors = new Set<string>(), depth = 0): Promise<string> {
  if (depth > 30) { options.warn("Unknown block recovery reached its nesting limit; remaining source was preserved."); return source; }
  const edits: { from: number; to: number; text: string }[] = [];
  for (const placeholder of notionSourceTags(source).filter(tag => tag.tag === "unknown" && tag.selfClosing)) {
    const id = sourceBlockId(placeholder.attrs.url || "", options);
    if (!id) { options.warn("An unknown block has no usable Notion block URL; its placeholder was preserved."); continue; }
    if (ancestors.has(id)) { options.warn(`Block ${id}: cyclic recovery reference; its placeholder was preserved.`); continue; }
    const path = new Set([...ancestors, id]);
    const block = await options.readBlock(id);
    const valid = block.object === "block" && typeof block.id === "string" && block.id.toLowerCase() === id && !block.archived && !block.in_trash;
    let replacement: string | undefined;
    if (valid && options.local && options.recoverPrivateBlock) replacement = await options.recoverPrivateBlock(block);
    if (replacement === undefined && valid && block.type === "link_to_page") {
      const data = block.link_to_page;
      if (data && ["page_id", "database_id", "data_source_id"].includes(data.type)) {
        let target: string | undefined;
        try { target = options.normalizeId(data[data.type]); } catch { /* preserve invalid target */ }
        if (target) {
          const url = `https://www.notion.so/${target}`;
          const pageTag = options.local ? "page-link" : "mention";
          replacement = data.type === "page_id" ? `<${pageTag}${attributesXml({ url })}>${escapeXml(await options.pageTitle(target))}</${pageTag}>`
            : `<database${attributesXml(data.type === "data_source_id" ? { "data-source-url": `collection://${target}` } : { url })}/>`;
        }
      }
    }
    if (!replacement && valid && !block.has_children) replacement = notionBlockContent(block, [], options.local === true);
    // The Markdown endpoint accepts a block ID and can recover truncated subtrees.
    if (!replacement && options.readMarkdown && !(valid && block.type === "template")) {
      const markdown = await options.readMarkdown(id);
      if (markdown?.trim()) {
        const self = notionSourceTags(markdown).find(tag => tag.tag === "unknown" && sourceBlockId(tag.attrs.url || "", options) === id);
        if (!self) {
          replacement = await enrichV2(markdown, options, path, depth + 1);
          if (valid && block.type === "unsupported") options.warn(`Block ${id}: readable Markdown recovered; ${block.unsupported?.block_type || "unsupported"} configuration is not exposed by the API.`);
        }
      }
    }
    if (!replacement && valid && block.has_children && options.readChildren && depth < 30) {
      const children = await options.readChildren(id), recovered: string[] = [];
      for (const child of children) {
        let childId: string;
        try { childId = options.normalizeId(child.id); } catch { continue; }
        const unknown = `<unknown${attributesXml({ url: `https://www.notion.so/${childId}` })}/>`;
        recovered.push(await enrichV2(unknown, options, path, depth + 1));
      }
      replacement = notionBlockContent(block, recovered, options.local === true);
      if (!replacement && recovered.length) {
        // Preserve the unsupported wrapper and expose its readable children.
        replacement = source.slice(placeholder.from, placeholder.to) + "\n\n" + recovered.join("\n\n");
        options.warn(`Block ${id}: child content recovered; ${block.unsupported?.block_type || block.type} configuration remains unavailable.`);
      }
    }
    if (replacement !== undefined) {
      // Unknown attributes belong to the source placeholder; keep the original in
      // the archive, and retain any extra attributes on the replacement carrier.
      const extra = Object.fromEntries(Object.entries(placeholder.attrs).filter(([key]) => !["url", "alt"].includes(key)));
      const opening = openingTag(replacement);
      if (opening && Object.keys(extra).length) replacement = `<${opening.tag}${attributesXml({ ...extra, ...opening.attrs })}${opening.selfClosing ? "/>" : ">"}` + replacement.slice(opening.length);
      edits.push({ from: placeholder.from, to: placeholder.to, text: replacement });
    } else {
      const kind = valid ? String(block.unsupported?.block_type || block.type || "unsupported") : "unavailable";
      options.warn(`Block ${id}: ${kind} has no readable content or configuration in the public API; its placeholder was preserved.`);
      if (valid && block.type === "unsupported" && typeof block.unsupported?.block_type === "string") edits.push({ from: placeholder.from, to: placeholder.to,
        text: `<unknown${attributesXml({ ...placeholder.attrs, alt: `${kind}: configuration unavailable${placeholder.attrs.alt ? ` (${placeholder.attrs.alt})` : ""}` })}/>` });
    }
  }
  const restored = edits.filter(edit => !edit.text.startsWith("<unknown")).length;
  if (restored) options.warn(`Restored ${restored} unknown block(s) using v2 Markdown, verified Block API data and optional local supplements.`);
  for (const edit of edits.sort((a,b) => b.from - a.from)) source = source.slice(0, edit.from) + edit.text + source.slice(edit.to);
  if (Buffer.byteLength(source) > 10 * 1024 * 1024) throw new VaultError(413, "Recovered Notion content exceeds 10 MB.");
  return source;
}
