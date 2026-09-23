/** MultiMarkdown metadata is plain text, not a YAML parser. */
export const mmdMetadataKey = (key: string) => key.replace(/ /g, "").toLowerCase();

export function readMmdMetadata(source: string): { values: Record<string, string>; endLine: number } | null {
  const lines = source.split(/\r\n|\n|\r/);
  const values: Record<string, string> = Object.create(null);
  let line = lines[0] === "---" ? 1 : 0;
  let key = "";
  for (; line < lines.length; line++) {
    const text = lines[line];
    if (!text.trim()) break;
    if (/^(?:---|\.\.\.)[ \t]*$/.test(text)) { line++; break; }
    const match = /^([A-Za-z0-9][A-Za-z0-9 _-]*):[ \t]*(.*)$/.exec(text);
    if (match) {
      key = mmdMetadataKey(match[1]);
      values[key] = match[2].trimEnd();
    } else {
      // Continuations containing a colon must be indented. Invalid first keys
      // do not silently become metadata or consume the following document.
      if (!key || (!/^[ \t]/.test(text) && text.includes(":"))) return null;
      values[key] += "\n" + text.trim();
    }
  }
  return key ? { values, endLine: line } : null;
}
