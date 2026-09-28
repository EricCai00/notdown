/** Notion's published Enhanced Markdown vocabulary. No executable HTML. */
export type BodyFormat = "markdown" | "notion-markdown";
export const NOTION_FORMAT: BodyFormat = "notion-markdown";
export type TagAttributes = Record<string, string>;

export function escapeXml(value: unknown): string {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
export function decodeXml(value: string): string {
  return value.replace(
    /&(?:amp|lt|gt|quot|apos|#39|#\d+|#x[\da-f]+);/gi,
    (entity) => {
      const named: Record<string, string> = {
        "&amp;": "&",
        "&lt;": "<",
        "&gt;": ">",
        "&quot;": '"',
        "&apos;": "'",
        "&#39;": "'",
      };
      if (named[entity.toLowerCase()]) return named[entity.toLowerCase()];
      const code = Number.parseInt(
        entity.slice(entity[2]?.toLowerCase() === "x" ? 3 : 2, -1),
        entity[2]?.toLowerCase() === "x" ? 16 : 10,
      );
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "�";
    },
  );
}
export function readAttributes(source: string): TagAttributes | null {
  const result: TagAttributes = Object.create(null);
  let rest = source.trim();
  while (rest) {
    const match = /^([a-zA-Z][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')\s*/.exec(
      rest,
    );
    if (!match || Object.hasOwn(result, match[1])) return null;
    result[match[1]] = decodeXml(match[2] ?? match[3]);
    rest = rest.slice(match[0].length);
  }
  return result;
}
export function attributesXml(attrs: TagAttributes): string {
  return Object.entries(attrs)
    .filter(
      ([key, value]) =>
        /^[a-zA-Z][\w-]*$/.test(key) && value !== undefined && (value !== "" || key === "ratio" || key === "width"),
    )
    .map(([key, value]) => ` ${key}="${escapeXml(value)}"`)
    .join("");
}
export function openingTag(
  source: string,
): {
  tag: string;
  attrs: TagAttributes;
  selfClosing: boolean;
  length: number;
} | null {
  const match =
    /^<([a-z][\w-]*)(\s+(?:[^>"']|"[^"]*"|'[^']*')*?)?\s*(\/?)>/.exec(source);
  if (!match) return null;
  const attrs = readAttributes(match[2] ?? "");
  return attrs
    ? {
        tag: match[1],
        attrs,
        selfClosing: match[3] === "/",
        length: match[0].length,
      }
    : null;
}
export function safeReference(value: string): string {
  const clean = value.trim();
  if (
    /[\u0000-\u001f\u007f]/.test(clean) ||
    /^(?:javascript|vbscript|data|file|file-upload):/i.test(clean) || /^\{\{.*\}\}$/.test(clean)
  )
    return "";
  return clean;
}
export function localPageTarget(url: string): string | null {
  if (url.startsWith("#page/")) {
    try {
      return decodeURIComponent(url.slice(6));
    } catch {
      return null;
    }
  }
  if (/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(url)) return url;
  return null;
}
export function pageUrl(target: string): string {
  return /^(?:[a-z][a-z\d+.-]*:|[#/])/i.test(target)
    ? target
    : `#page/${encodeURIComponent(target)}`;
}
const colors: Record<string, string> = {
  gray: "#787774",
  brown: "#9f6b53",
  orange: "#d9730d",
  yellow: "#a87c00",
  green: "#448361",
  blue: "#337ea9",
  purple: "#9065b0",
  pink: "#c14c8a",
  red: "#d44c47",
  gray_bg: "#f1f1ef",
  brown_bg: "#f4eeee",
  orange_bg: "#fbecdd",
  yellow_bg: "#fbf3db",
  green_bg: "#edf3ec",
  blue_bg: "#e7f3f8",
  purple_bg: "#f4f0f7",
  pink_bg: "#f9eef3",
  red_bg: "#fdebec",
};
export function colorStyle(color: string): string {
  return Object.hasOwn(colors, color)
    ? `${color.endsWith("_bg") ? "background-color" : "color"}:${colors[color]}`
    : "";
}

/** Independent inline channels; the old color="yellow_bg" remains readable. */
export function inlineColors(attrs: { color?: string; bg_color?: string }) {
  const legacyBackground = attrs.color?.endsWith("_bg");
  return {
    color: legacyBackground ? "" : attrs.color || "",
    bg_color: attrs.bg_color || (legacyBackground ? attrs.color!.slice(0, -3) : ""),
  };
}

export function inlineColorStyle(attrs: { color?: string; bg_color?: string }): string {
  const { color, bg_color } = inlineColors(attrs);
  return [colorStyle(color), bg_color ? colorStyle(`${bg_color}_bg`) : ""].filter(Boolean).join(";");
}
