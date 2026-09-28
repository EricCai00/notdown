import { parseNotionMarkdown } from "../src/document/notion-markdown.js";
import { openingTag, attributesXml, escapeXml } from "../src/document/notion-syntax.js";

type Json = Record<string, any>;
type Options = {
  normalizeId(value: unknown): string;
  readBlock(id: string): Promise<Json>;
  pageTitle(id: string): Promise<string>;
  warn(message: string): void;
};

/** Enrich only parsed unknown placeholders. Their URL addresses the source
 * block; the destination must come from a verified Block API response. */
export async function enrichNotionBlocks(source: string, options: Options): Promise<string> {
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
