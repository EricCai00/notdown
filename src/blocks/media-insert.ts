import { escapeXml } from "../document/notion-syntax";
import { enabled, type SyntaxConfig } from "../markdown-engine/config";

export const mediaAccept = {
  image: "image/*", audio: "audio/*,.mp3,.m4a,.ogg,.wav,.flac,.aac",
  video: "video/*,.mp4,.webm,.mov,.m4v", pdf: "application/pdf,.pdf", file: "",
} as const;
export type MediaInsertKind = keyof typeof mediaAccept;
export function isMediaInsertKind(id: string): id is MediaInsertKind { return Object.hasOwn(mediaAccept, id); }

export function mediaFileMatches(kind: MediaInsertKind, file: { name: string; type: string }): boolean {
  if (kind === "file") return true;
  const mime = file.type.toLowerCase();
  const extensions = {
    image: /\.(png|jpe?g|gif|webp|avif|svg|bmp|ico|tiff?)$/i,
    audio: /\.(mp3|m4a|ogg|wav|flac|aac)$/i,
    video: /\.(mp4|webm|mov|m4v)$/i,
    pdf: /\.pdf$/i,
  };
  if (mime && mime !== "application/octet-stream") return kind === "pdf" ? mime === "application/pdf" : mime.startsWith(kind + "/");
  return extensions[kind].test(file.name);
}

export function mediaInsertMarkdown(kind: MediaInsertKind, name: string, path: string, config: SyntaxConfig): string {
  const label = name.replace(/[\\\[\]]/g, "\\$&").replace(/[\r\n]/g, " ");
  const destination = path.replace(/[\s()<>]/g, c => encodeURIComponent(c).replace(/\(/g, "%28").replace(/\)/g, "%29"));
  if (kind === "image") return `\n\n![](${destination})\n\n`;
  if (!enabled(config, "notion_media")) {
    if (kind !== "file") throw new Error("This page format does not support media blocks.");
    return `\n\n[${label}](${destination})\n\n`;
  }
  const caption = kind === "audio" || kind === "video" ? "" : escapeXml(name);
  return `\n\n<${kind} src="${escapeXml(path)}">${caption}</${kind}>\n\n`;
}
