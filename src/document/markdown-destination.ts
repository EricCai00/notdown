export function destinationMarker(raw: string, definition: boolean): number {
  if (definition) {
    // Definition labels may contain escaped brackets and colons.
    for (let i = 1; i < raw.length; i++) {
      if (raw[i] === "\\") { i++; continue; }
      if (raw[i] === "]" && raw[i + 1] === ":") return i + 2;
    }
    return -1;
  }
  let depth = 0;
  for (let i = raw.startsWith("!") ? 1 : 0; i < raw.length; i++) {
    if (raw[i] === "\\") { i++; continue; }
    if (raw[i] === "`") {
      let count = 1; while (raw[i + count] === "`") count++;
      const end = raw.indexOf("`".repeat(count), i + count);
      if (end >= 0) { i = end + count - 1; continue; }
    }
    if (raw[i] === "[") depth++;
    if (raw[i] === "]" && --depth === 0) return raw[i + 1] === "(" ? i + 2 : -1;
  }
  return -1;
}

