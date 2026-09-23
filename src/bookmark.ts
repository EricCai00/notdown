export interface BookmarkMetadata {
  title: string;
  description: string;
  icon: string;
  image: string;
}

/** Only explicit web URLs; never interpret arbitrary editor text as a URL. */
export function bookmarkUrl(value: unknown): string {
  if (typeof value !== "string" || value.length > 8192) return "";
  try {
    const url = new URL(value.trim());
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password
      ? url.href : "";
  } catch { return ""; }
}
