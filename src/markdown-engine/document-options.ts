import type MarkdownIt from "markdown-it";
import { enabled, type SyntaxConfig } from "./config";

export function rebasePath(url: string, sourcePath: string): string {
  if (!url || /^(?:[a-z][\w+.-]*:|[\/#?])/i.test(url)) return url;
  const directory = sourcePath.replace(/\\/g, "/").split("/").slice(0, -1);
  for (const part of url.split("/")) {
    if (part === ".") continue;
    if (part === ".." && directory.length && directory.at(-1) !== "..") directory.pop();
    else directory.push(part);
  }
  return directory.join("/");
}
export function originalLink(url: string, attrs: Record<string, string> = {}) {
  return url === attrs._rebased ? attrs._original : url;
}
export function installDocumentOptions(md: MarkdownIt, config: SyntaxConfig) {
  md.core.ruler.push("document_options", s => {
    const lines = s.src.split("\n");
    for (const token of s.tokens) {
      if (enabled(config, "sourcepos") && token.map && token.type !== "inline") {
        const [start, end] = token.map;
        const position = `${start + 1}:1-${end}:${lines[end - 1]?.length || 0}`;
        if (token.meta?.node) { const n = token.meta.node; token.meta.node = n.type.create({ ...n.attrs, markdownAttrs: { ...n.attrs.markdownAttrs, _sourcepos: position } }, n.content, n.marks); }
        else token.meta = { ...token.meta, markdownAttrs: { ...token.meta?.markdownAttrs, _sourcepos: position } };
      }
      if (!enabled(config, "rebase_relative_paths")) continue;
      const sourcePath = String(s.env.sourcePath || config.sourcePath || "");
      if (!sourcePath) continue;
      for (const child of token.children || []) {
        const key = child.type === "image" ? "src" : child.type === "link_open" ? "href" : "";
        if (!key) continue;
        const original = child.attrGet(key) || "", rebased = rebasePath(original, sourcePath);
        if (rebased !== original) {
          child.attrSet(key, rebased);
          child.meta = { ...child.meta, markdownAttrs: { ...child.meta?.markdownAttrs, _original: original, _rebased: rebased } };
        }
      }
    }
  });
}
