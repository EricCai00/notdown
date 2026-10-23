export type AssetKind = "image" | "audio" | "video" | "pdf" | "html" | "file";
export type AssetReference = {
  pageId: string; title: string; trashed: boolean; locations: string[];
};
export type VaultAsset = {
  path: string;
  name: string;
  originalName: string | null;
  contentType: string;
  kind: AssetKind;
  size: number | null;
  addedAt: string | null;
  modifiedAt: string | null;
  missing: boolean;
  references: AssetReference[];
};
export type AssetLibrary = { assets: VaultAsset[]; warnings: string[] };

/** Canonical vault path, without interpreting remote URLs or escaping the assets tree. */
export function localAssetPath(value: unknown): string | undefined {
  if (typeof value !== "string" || !/^(?:\/?assets\/|\.\.\/assets\/|\.\/assets\/)/.test(value)) return;
  let path: string;
  try { path = decodeURIComponent(value.split(/[?#]/)[0]); } catch { return; }
  path = path.replace(/^(?:\/|\.\.\/|\.\/)/, "");
  const parts = path.split("/");
  if (parts[0] !== "assets" || parts.length < 2 || parts.some(part => !part || part === "." || part === ".." || /[\\\u0000-\u001f\u007f]/.test(part))) return;
  return path;
}

export function assetUrl(path: string): string {
  return "/" + path.split("/").map(encodeURIComponent).join("/");
}

export function assetKind(path: string, contentType = ""): AssetKind {
  const extension = path.split(".").pop()?.toLowerCase();
  if (/^image\//.test(contentType) || /^(png|jpe?g|gif|webp|avif|svg|bmp|ico|tiff?)$/.test(extension || "")) return "image";
  if (/^audio\//.test(contentType) || /^(mp3|m4a|ogg|wav|flac|aac)$/.test(extension || "")) return "audio";
  if (/^video\//.test(contentType) || /^(mp4|webm|mov|m4v)$/.test(extension || "")) return "video";
  if (extension === "pdf" || contentType === "application/pdf") return "pdf";
  if (/^html?$/.test(extension || "") || contentType === "text/html") return "html";
  return "file";
}
