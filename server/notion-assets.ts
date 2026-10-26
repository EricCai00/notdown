import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { get as httpsGet } from "node:https";
import { get as httpGet } from "node:http";
import { createHash } from "node:crypto";
import { publicBookmarkAddress } from "./bookmarks.js";
import { notionSourceTags, notionProseSource } from "../src/document/notion-v2.js";
import { notionInlineImages } from "../src/document/notion-markdown.js";
import { escapeXml } from "../src/document/notion-syntax.js";
import { destinationMarker, type ImportPlan } from "./markdown-import.js";

export type NotionAsset = { data: Buffer; contentType: string; name?: string };
export type ReadNotionAsset = (url: string, signal: AbortSignal, maxBytes: number) => Promise<NotionAsset>;
const mimeExtensions: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp", "image/svg+xml": "svg", "image/avif": "avif", "application/pdf": "pdf", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/wav": "wav", "audio/ogg": "ogg", "video/mp4": "mp4", "video/webm": "webm", "text/html": "html", "text/plain": "txt", "application/zip": "zip", "application/json": "json", "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx", "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx" };

function safeName(value: unknown): string | undefined {
  if (typeof value !== "string") return;
  const name = value.replaceAll("\\", "/").split("/").pop()!.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 180);
  return name && name !== "." && name !== ".." ? name : undefined;
}

/** Prefer a download filename; signed query strings are never used as a name. */
export function notionAssetName(address: string, disposition = ""): string | undefined {
  const encoded = /(?:^|;)\s*filename\*\s*=\s*UTF-8'[^']*'([^;]+)/i.exec(disposition)?.[1].trim();
  if (encoded) { try { const name = safeName(decodeURIComponent(encoded)); if (name) return name; } catch { /* Try the plain filename. */ } }
  const plain = /(?:^|;)\s*filename\s*=\s*(?:"((?:\\.|[^"\\])*)"|([^;]+))/i.exec(disposition);
  if (plain) { const name = safeName((plain[1] ?? plain[2]).replace(/\\(.)/g, "$1")); if (name) return name; }
  try {
    const name = safeName(decodeURIComponent(new URL(address).pathname.split("/").pop() || ""));
    if (name && /\.[a-z0-9]{1,12}$/i.test(name)) return name;
  } catch { /* Keep an unknown original name unknown. */ }
}

/** No integration credentials; every hop is pinned to a checked public address. */
export const readNotionAsset: ReadNotionAsset = async (address, signal, maxBytes) => {
  let url = new URL(address);
  for (let hop = 0; hop < 5; hop++) {
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.port && !["80", "443"].includes(url.port)) throw new Error("Invalid attachment URL");
    const host = url.hostname.replace(/^\[|\]$/g, "");
    const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { family: 4, all: true });
    signal.throwIfAborted();
    if (!addresses.length || addresses.some(a => !publicBookmarkAddress(a.address))) throw new Error("Attachment host is not public");
    const response = await new Promise<NotionAsset & { location?: string }>((resolve, reject) => {
      const request = (url.protocol === "https:" ? httpsGet : httpGet)(url, {
        agent: false, signal, family: 4,
        lookup: (_host, _options, callback) => callback(null, addresses[0].address, 4),
        headers: { "User-Agent": "Notdown-Notion-Import/2", "Accept-Encoding": "identity" },
      }, response => {
        const status = response.statusCode || 0;
        if ([301,302,303,307,308].includes(status) && response.headers.location) { resolve({ location: response.headers.location, data: Buffer.alloc(0), contentType: "" }); response.destroy(); return; }
        if (status < 200 || status >= 300 || Number(response.headers["content-length"]) > maxBytes) { reject(new Error("Attachment unavailable or too large")); response.destroy(); return; }
        const chunks: Buffer[] = []; let bytes = 0;
        response.on("data", (chunk: Buffer) => { bytes += chunk.length; if (bytes > maxBytes) { reject(new Error("Attachment too large")); response.destroy(); } else chunks.push(chunk); });
        response.on("end", () => resolve({ data: Buffer.concat(chunks), contentType: response.headers["content-type"] || "application/octet-stream", name: notionAssetName(url.href, response.headers["content-disposition"]) }));
        response.on("error", reject); response.on("aborted", () => reject(new Error("Attachment interrupted")));
      });
      request.on("error", reject);
    });
    if (!response.location) return response;
    url = new URL(response.location, url);
  }
  throw new Error("Too many attachment redirects");
};

/** One cache per preview; asset names are stable content hashes, never URL names. */
export function notionAssets(options: { signal: AbortSignal; read?: ReadNotionAsset; remaining(): number; reserve(bytes: number): void; warn(message: string): void; onRead?: (name: string | undefined, attempt: number) => void }) {
  const assets: ImportPlan["assets"] = [], cache = new Map<string, string>();
  const names = new Map<string, { asset: ImportPlan["assets"][number]; priority: number }>(); let attempts = 0;
  const rememberName = (filename: string, value: unknown, priority: number) => {
    const record = names.get(filename), name = safeName(value);
    if (record && name && priority > record.priority) { record.asset.name = name; record.priority = priority; }
  };
  const save = async (url: string, nameHint?: string): Promise<string> => {
    if (!/^https?:\/\//.test(url)) return url;
    if (cache.has(url)) { const local = cache.get(url)!; if (local.startsWith("assets/")) rememberName(local.slice(7), nameHint, 3); return local; }
    const max = Math.min(10 * 1024 * 1024, options.remaining());
    try {
      options.signal.throwIfAborted();
      if (++attempts > 500 || max <= 0) throw new Error("Attachment budget reached");
      options.onRead?.(safeName(nameHint) ?? notionAssetName(url), attempts);
      const signal = AbortSignal.any([options.signal, AbortSignal.timeout(20_000)]);
      // The timer also bounds DNS and injected transports that do not observe abort.
      const file = await new Promise<NotionAsset>((resolve, reject) => {
        const abort = () => reject(new Error("Attachment timed out"));
        signal.addEventListener("abort", abort, { once: true });
        (options.read ?? readNotionAsset)(url, signal, max).then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
        if (signal.aborted) abort();
      });
      if (file.data.length > max) throw new Error("Attachment too large");
      const contentType = file.contentType.split(";")[0].trim().toLowerCase() || "application/octet-stream";
      const ext = mimeExtensions[contentType] || /\.([a-z0-9]{1,10})$/i.exec(file.name || safeName(nameHint) || new URL(url).pathname)?.[1].toLowerCase() || "bin";
      const filename = `notion-${createHash("sha256").update(file.data).digest("hex")}.${ext}`;
      if (!names.has(filename)) {
        options.reserve(file.data.length);
        const asset = { filename, data: file.data, contentType, origin: "notion" as const };
        assets.push(asset); names.set(filename, { asset, priority: 0 });
      }
      rememberName(filename, notionAssetName(url), 1);
      rememberName(filename, file.name, 2);
      rememberName(filename, nameHint, 3);
      const local = `assets/${filename}`; cache.set(url, local); return local;
    } catch {
      options.signal.throwIfAborted();
      cache.set(url, url);
      options.warn("Some attachments could not be saved (unavailable, private host, timeout, or size limit). Their original remote URLs remain and may expire.");
      return url;
    }
  };
  const rewrite = async (source: string): Promise<string> => {
    const edits: { from: number; to: number; url: string; name?: string; replacement?: string }[] = [];
    for (const tag of notionSourceTags(source)) {
      if (tag.tag === "mail" && tag.attrs.attachments) {
        const match = /\battachments\s*=\s*("[^"]*"|'[^']*')/.exec(source.slice(tag.from, tag.to));
        if (match) {
          const from = tag.from + match.index + match[0].length - match[1].length + 1;
          const urls = tag.attrs.attachments.split(","), local: string[] = [];
          for (const url of urls) local.push(await save(url.trim()));
          if (local.some((url,i) => url !== urls[i].trim())) edits.push({ from, to: from + match[1].length - 2, url: tag.attrs.attachments, replacement: escapeXml(local.join(",")) });
        }
        continue;
      }
      if (!["image", "file", "audio", "video", "pdf", "embed"].includes(tag.tag)) continue;
      for (const match of source.slice(tag.from, tag.to).matchAll(/([a-zA-Z][\w-]*)\s*=\s*("[^"]*"|'[^']*')/g)) {
        if (!["source", "src"].includes(match[1])) continue;
        const url = tag.attrs[match[1]];
        if (tag.tag === "embed" && !/\.html?(?:[?#]|$)/i.test(url)) continue;
        const from = tag.from + match.index! + match[0].length - match[2].length + 1;
        edits.push({ from, to: from + match[2].length - 2, url, name: tag.attrs.name });
      }
    }
    for (const line of notionProseSource(source).matchAll(/[^\r\n]+/g)) for (const image of notionInlineImages(line[0])) {
      const start = line.index! + image.from, raw = source.slice(start, line.index! + image.to), marker = destinationMarker(raw, false);
      if (marker < 0) continue;
      let from = marker; while (/\s/.test(raw[from] || "") && from < raw.length) from++;
      const angle = raw[from] === "<"; if (angle) from++;
      let to = from, depth = 0;
      for (; to < raw.length; to++) { const char = raw[to]; if (char === "\\") { to++; continue; } if (angle ? char === ">" : /\s/.test(char) || char === ")" && !depth) break; if (!angle && char === "(") depth++; if (!angle && char === ")") depth--; }
      edits.push({ from: start + from, to: start + to, url: image.href });
    }
    for (const edit of edits.sort((a,b) => b.from - a.from)) { const local = edit.replacement ?? await save(edit.url, edit.name); if (local !== edit.url) source = source.slice(0, edit.from) + local + source.slice(edit.to); }
    return source;
  };
  return { assets, rewrite, save };
}
