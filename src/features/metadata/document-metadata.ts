import { isMap, parseDocument } from "yaml";

export type DocumentMetadata = { values: Record<string, unknown>; form?: "yaml" | "pandoc" };

/** Vault metadata overlays are independent of the renderer's dialect switches.
 * Only a complete leading block is read; its bytes remain part of the document. */
export function documentMetadata(source: string): DocumentMetadata {
  const yaml = /^(?:\uFEFF)?---[\t ]*\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[\t ]*(?:\r?\n|$)/.exec(source);
  if (yaml) {
    const doc = parseDocument(yaml[1], { uniqueKeys: true });
    if (doc.errors.length) {
      // Ordinary Markdown between thematic breaks is not a YAML mapping.
      if (!/^(?:[\w\p{L}]|["']).*:/mu.test(yaml[1])) return { values: {} };
      throw new Error("Invalid YAML metadata");
    }
    if (!isMap(doc.contents)) return { values: {} };
    return { values: doc.toJS({ maxAliasCount: 50 }), form: "yaml" };
  }
  const lines = source.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (!/^%(?:\s|$)/.test(lines[0])) return { values: {} };
  const fields: string[] = [];
  for (const line of lines) {
    if (/^%(?:\s|$)/.test(line)) {
      if (fields.length === 3) break;
      fields.push(line.replace(/^%[\t ]*/, ""));
    } else if (/^[\t ]+\S/.test(line) && fields.length) fields[fields.length - 1] += "\n" + line.trim();
    else break;
  }
  return { values: Object.fromEntries(fields.map((value, index) => [["title", "author", "date"][index], value])), form: "pandoc" };
}
