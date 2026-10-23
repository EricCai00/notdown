import type { DOMOutputSpec, Node as PMNode } from "prosemirror-model";
import { safeReference } from "./notion-syntax";

export function mediaFilename(src: string): string {
  const basename = src.split(/[?#]/)[0].split(/[\\/]/).pop() || "File";
  try { return decodeURIComponent(basename); } catch { return basename; }
}

export function fileSizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"];
  let value = bytes / 1024, unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
  return `${Number(value.toFixed(1))} ${units[unit]}`;
}

/** Watch pages are HTML, not media streams. Only recognized YouTube URLs use an iframe. */
export function youtubeEmbedSource(src: string): string | undefined {
  let url: URL;
  try { url = new URL(src); } catch { return; }
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.port) return;
  const host = url.hostname.toLowerCase();
  let id: string | undefined;
  if (host === "youtu.be") id = /^\/([\w-]+)\/?$/.exec(url.pathname)?.[1];
  else if (["youtube.com", "www.youtube.com", "m.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com"].includes(host)) {
    id = url.pathname === "/watch" ? url.searchParams.get("v") || undefined : /^\/(?:embed|shorts|live)\/([\w-]+)\/?$/.exec(url.pathname)?.[1];
  }
  if (!id || !/^[\w-]{11}$/.test(id)) return;
  const embed = new URL(`https://${host.endsWith("youtube-nocookie.com") ? "www.youtube-nocookie.com" : "www.youtube.com"}/embed/${id}`);
  const time = url.searchParams.get("start") || url.searchParams.get("t") || "";
  const parts = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/.exec(time);
  const seconds = parts ? Number(parts[1] || 0) * 3600 + Number(parts[2] || 0) * 60 + Number(parts[3] || 0) : 0;
  if (Number.isSafeInteger(seconds) && seconds > 0) embed.searchParams.set("start", String(seconds));
  return embed.href;
}

/** File presentation is explicit; a .mp3/.pdf URL does not turn a file into a player. */
export function mediaDOM(node: PMNode, previewPDF: boolean): DOMOutputSpec {
  const src = safeReference(node.attrs.src);
  const kind = node.attrs.type;
  const label = node.attrs.caption || mediaFilename(src);
  if (kind === "file") return ["figure", { class: "pm-media-block pm-file-block", "data-media-type": "file", contenteditable: "false" },
    ["a", { href: src, class: "pm-file-card", download: label },
      ["http://www.w3.org/2000/svg svg", { class: "pm-file-icon", width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "1.65", "aria-hidden": "true" },
        ["http://www.w3.org/2000/svg path", { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6" }]],
      ["span", { class: "pm-file-name" }, label],
      ["span", { class: "pm-file-size" }]]];
  const content: DOMOutputSpec[] = [];
  const youtube = kind === "video" ? youtubeEmbedSource(src) : undefined;
  if (youtube) content.push(["iframe", {
    src: youtube, class: "pm-video-embed", title: node.attrs.caption || "YouTube video player",
    allow: "autoplay; encrypted-media; picture-in-picture; fullscreen", allowfullscreen: "",
    referrerpolicy: "strict-origin-when-cross-origin",
    style: "display:block;width:100%;aspect-ratio:16/9;border:0",
  }]);
  else if ((kind === "audio" || kind === "video") && src)
    content.push([kind, { src, controls: "", preload: "metadata", "aria-label": label }]);
  if (kind === "pdf" && src && previewPDF)
    content.push(["object", { data: src, type: "application/pdf", width: "100%", height: "480", "aria-label": label }, ["a", { href: src }, "Open PDF"]]);
  if (kind === "audio" || kind === "video") {
    if (node.attrs.caption) content.push(["figcaption", { class: "pm-media-caption" }, node.attrs.caption]);
  } else content.push(["figcaption", {}, ["a", { href: src, class: "media-download" }, label]]);
  return ["figure", { class: `pm-media-block pm-${kind}-block`, "data-media-type": kind, contenteditable: "false" }, ...content];
}
