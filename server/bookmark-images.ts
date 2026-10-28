import type { DefaultTreeAdapterMap } from "parse5";
import { bookmarkUrl } from "../src/features/bookmarks/bookmark";

type HtmlNode = DefaultTreeAdapterMap["node"];

/** Choose a declared page image, with a narrow fallback for Bangumi subject covers. */
export function bookmarkImage(document: HtmlNode, pageUrl: string): string {
  const groups: string[][] = [[], [], [], [], [], []];
  const structured: unknown[] = [];
  let base = pageUrl, foundBase = false;
  const page = new URL(pageUrl);
  const bangumi = ["bgm.tv", "bangumi.tv", "chii.in"].includes(page.hostname) && /^\/subject\/\d+\/?$/.test(page.pathname);
  const plain = (node: HtmlNode): string => "value" in node ? node.value : "childNodes" in node ? node.childNodes.map(plain).join("") : "";
  const token = (value: string | undefined, expected: string) => (value || "").toLowerCase().split(/\s+/).includes(expected);
  const visit = (node: HtmlNode, subjectInfo = false) => {
    if ("tagName" in node) {
      const attrs = Object.fromEntries(node.attrs.map(a => [a.name, a.value]));
      subjectInfo ||= attrs.id === "bangumiInfo";
      if (node.tagName === "base" && attrs.href && !foundBase) {
        foundBase = true;
        try { base = bookmarkUrl(new URL(attrs.href, pageUrl).href) || pageUrl; } catch { /* Keep the document URL. */ }
      }
      if (node.tagName === "meta" && attrs.content) {
        const key = (attrs.property || attrs.name || "").toLowerCase();
        if (["og:image", "og:image:url", "og:image:secure_url"].includes(key)) groups[0].push(attrs.content);
        if (["twitter:image", "twitter:image:src"].includes(key)) groups[1].push(attrs.content);
      }
      if (node.tagName === "link" && token(attrs.rel, "image_src") && attrs.href) groups[2].push(attrs.href);
      if (token(attrs.itemprop, "image")) {
        const image = node.tagName === "meta" ? attrs.content : node.tagName === "link" ? attrs.href : node.tagName === "img" ? attrs.src || attrs["data-src"] : "";
        if (image) groups[4].push(image);
      }
      if (node.tagName === "script" && (attrs.type || "").toLowerCase().split(";")[0].trim() === "application/ld+json" && structured.length < 20) {
        try { structured.push(JSON.parse(plain(node))); } catch { /* Malformed metadata must not break a bookmark. */ }
      }
      if (bangumi && subjectInfo && node.tagName === "img" && token(attrs.class, "cover")) {
        const image = attrs.src || attrs["data-src"];
        if (image) groups[5].push(image);
      }
    }
    if ("childNodes" in node) node.childNodes.forEach(child => visit(child, subjectInfo));
  };
  visit(document);

  // Only inspect page/entity metadata, not arbitrary author/comment/avatar objects.
  // JSON is parsed as data and traversal is bounded even for deeply nested markup.
  const primary: string[] = [], images: string[] = [];
  const imageValues = (value: unknown, depth = 0): string[] => {
    if (depth > 5) return [];
    if (typeof value === "string") return [value];
    if (Array.isArray(value)) return value.slice(0, 20).flatMap(v => imageValues(v, depth + 1));
    if (!value || typeof value !== "object") return [];
    const data = value as Record<string, unknown>;
    return imageValues(data.contentUrl ?? data.url, depth + 1);
  };
  let remaining = 200;
  const entity = (value: unknown, depth = 0) => {
    if (depth > 8 || remaining-- <= 0 || !value || typeof value !== "object") return;
    if (Array.isArray(value)) { value.slice(0, 50).forEach(v => entity(v, depth + 1)); return; }
    const data = value as Record<string, unknown>;
    primary.push(...imageValues(data.primaryImageOfPage));
    if (data.mainEntity) entity(data.mainEntity, depth + 1);
    const types = imageValues(data["@type"]).map(t => t.split(/[\/#]/).pop());
    if (!types.some(t => ["Person", "Organization", "WebSite", "BreadcrumbList"].includes(t || ""))) images.push(...imageValues(data.image));
    if (data["@graph"]) entity(data["@graph"], depth + 1);
  };
  structured.forEach(value => entity(value));
  groups[3].push(...primary, ...images);
  for (const candidates of groups) for (const candidate of candidates) {
    try {
      const image = candidate.trim() && bookmarkUrl(new URL(candidate.trim(), base).href);
      if (image) return image;
    } catch { /* Try the next declared image. */ }
  }
  return "";
}
