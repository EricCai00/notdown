/** Locate only the leading image label; URLs, titles and unknown attributes remain byte-for-byte intact. */
export function imageCaptionRange(raw: string): { from: number; to: number } | null {
  const start = /^\s*!\[/.exec(raw);
  if (!start) return null;
  let depth = 1;
  for (let i = start[0].length; i < raw.length; i++) {
    if (raw[i] === "\\") { i++; continue; }
    if (raw[i] === "[") depth++;
    if (raw[i] === "]" && --depth === 0) return { from: start[0].length, to: i };
  }
  return null;
}
export function replaceImageCaption(raw: string, caption: string) {
  const range = imageCaptionRange(raw);
  if (!range || /[\r\n]/.test(caption)) throw new Error("Enter a single-line image caption.");
  return raw.slice(0, range.from) + caption.replace(/[\\\[\]]/g, "\\$&") + raw.slice(range.to);
}
