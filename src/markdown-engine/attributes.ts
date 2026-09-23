/** Attributes are data: never emit event handlers or app action attributes. */
export function readAttributes(source: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const m of source
    .replace(/^\{|\}$/g, "")
    .matchAll(
      /(?:^|\s)([.#][\w:-]+|[\w:-]+(?:=(?:"[^"]*"|'[^']*'|[^\s}]+))?)/g,
    )) {
    const part = m[1];
    if (part[0] === "#") result.id = part.slice(1);
    else if (part[0] === ".")
      result.class = [result.class, part.slice(1)].filter(Boolean).join(" ");
    else {
      const at = part.indexOf("=");
      if (at > 0)
        result[part.slice(0, at)] = part
          .slice(at + 1)
          .replace(/^['"]|['"]$/g, "");
    }
  }
  return result;
}
export function domAttributes(attrs: Record<string, string> = {}) {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "_sourcepos") result["data-pos"] = value;
    if (key === "id") {
      result.id = "md-" + value;
      result["data-md-id"] = value;
    }
    if (key === "class")
      result.class = value
        .split(/\s+/)
        .map((c) => "md-user-" + c)
        .join(" ");
    if (["lang", "title"].includes(key)) result[key] = value;
    if (["width", "height"].includes(key) && /^\d+(?:px|%)?$/.test(value))
      result.style =
        (result.style || "") +
        `${key}:${/^\d+$/.test(value) ? value + "px" : value};`;
  }
  return result;
}
export function writeAttributes(attrs: Record<string, string> = {}) {
  const values = Object.entries(attrs)
    .filter(([k]) => k !== "generated" && !k.startsWith("_"))
    .map(([k, v]) =>
      k === "id"
        ? "#" + v
        : k === "class"
          ? v
              .split(/\s+/)
              .map((c) => "." + c)
              .join(" ")
          : `${k}="${v.replace(/"/g, "&quot;")}"`,
    );
  return values.length ? " {" + values.join(" ") + "}" : "";
}
export const slug = (text: string) =>
  text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_\s-]/gu, "")
    .replace(/\s+/g, "-") || "section";
