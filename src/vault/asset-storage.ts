import { hashBytes } from "./crypto";
import { stableUuid } from "../shared/stable-uuid";

export const assetMimeExtensions: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp", "image/avif": "avif", "image/svg+xml": "svg",
  "audio/mpeg": "mp3", "audio/ogg": "ogg", "audio/wav": "wav", "audio/mp4": "m4a", "audio/flac": "flac", "audio/aac": "aac",
  "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov", "application/pdf": "pdf",
  "text/plain": "txt", "text/html": "html", "application/zip": "zip", "application/json": "json",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
};

/** One content identity across upload, folder import and Notion; original names live in metadata. */
export function assetStorageName(data: Uint8Array, name = "", contentType = ""): string {
  const mime = contentType.split(";")[0].trim().toLowerCase();
  let extension = assetMimeExtensions[mime] || /\.([a-z0-9]{1,10})$/i.exec(name)?.[1].toLowerCase() || "bin";
  if (extension === "jpeg") extension = "jpg";
  if (extension === "htm") extension = "html";
  return `${stableUuid(`notdown/asset/${hashBytes(data)}/${extension}`)}.${extension}`;
}
