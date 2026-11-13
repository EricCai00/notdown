/** Read only direct child collections from a finite-depth DAV response. */
export function webDavFolders(xml: string, parent: URL): string[] {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("Unsupported WebDAV directory response");
  const folders = new Set<string>();
  for (const match of xml.matchAll(/<((?:[\w-]+:)?response)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi)) {
    const body = match[2];
    if (!/<(?:[\w-]+:)?collection\s*\/?\s*>/i.test(body)) continue;
    const href = body.match(/<((?:[\w-]+:)?href)\b[^>]*>([^<]*)<\/\1\s*>/i)?.[2];
    if (!href) continue;
    const decoded = href.trim().replace(/&(amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/gi, (_, entity: string) => {
      const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
      if (named[entity]) return named[entity];
      const code = entity.startsWith("#x") ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    });
    let url: URL;
    try { url = new URL(decoded, parent); } catch { continue; }
    if (url.origin !== parent.origin || url.search || url.hash || !url.pathname.startsWith(parent.pathname)) continue;
    const child = url.pathname.slice(parent.pathname.length).replace(/\/$/, "");
    if (!child || child.includes("/")) continue;
    let name: string;
    try { name = decodeURIComponent(child); } catch { continue; }
    if (name.includes("/") || /[\\\x00-\x1f:%?#]/.test(name) || /[. ]$/.test(name) || [".", ".."].includes(name)) continue;
    folders.add(name);
  }
  return [...folders].sort();
}
