/** A bounded BibTeX entry reader for citation lookup; formatting is author/year/title. */
export function bibliographyEntries(source: string): Record<string, string> {
  const result: Record<string, string> = {};
  let at = 0;
  const value = () => {
    while (/\s/.test(source[at] || "\0")) at++;
    const open = source[at];
    if (open !== "{" && open !== '"') {
      const start = at;
      while (at < source.length && !/[,}\n]/.test(source[at])) at++;
      return source.slice(start, at).trim();
    }
    at++;
    let depth = 1,
      text = "";
    while (at < source.length) {
      const c = source[at++];
      if (c === "\\" && at < source.length) {
        text += c + source[at++];
        continue;
      }
      if (open === "{" && c === "{") depth++;
      if (c === (open === "{" ? "}" : '"')) {
        if (--depth === 0) break;
      }
      text += c;
    }
    return text;
  };
  while (at < source.length) {
    const found = /@([a-z]+)\s*[{(]\s*([^,\s]+)\s*,/gi;
    found.lastIndex = at;
    const m = found.exec(source);
    if (!m) break;
    at = found.lastIndex;
    const fields: Record<string, string> = {};
    while (at < source.length) {
      while (/[\s,]/.test(source[at] || "\0")) at++;
      if (/[})]/.test(source[at] || "")) {
        at++;
        break;
      }
      const key = /^([\w-]+)\s*=\s*/.exec(source.slice(at));
      if (!key) {
        at++;
        continue;
      }
      at += key[0].length;
      fields[key[1].toLowerCase()] = value();
    }
    if (!["comment", "preamble", "string"].includes(m[1].toLowerCase()))
      result[m[2]] = [
        fields.author?.replace(/\s+and\s+/g, ", "),
        fields.year && "(" + fields.year + ")",
        fields.title,
        fields.journal || fields.publisher,
      ]
        .filter(Boolean)
        .join(". ")
        .replace(/[{}]/g, "");
  }
  return result;
}
