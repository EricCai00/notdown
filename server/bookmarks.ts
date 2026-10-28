import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { get as httpGet } from "node:http";
import { Agent as HttpsAgent, get as httpsGet } from "node:https";
import { parse, type DefaultTreeAdapterMap } from "parse5";
import { bookmarkUrl, type BookmarkMetadata } from "../src/features/bookmarks/bookmark";
import { VaultError } from "./vault";
import { systemBookmarkProxy } from "./bookmark-system-proxy";
import { bookmarkImage } from "./bookmark-images";

// Requests are pinned to the checked IPv4 address, including after redirects.
// IPv6-only and non-public destinations fall back to a plain bookmark.
export function publicBookmarkAddress(address: string): boolean {
  if (isIP(address) !== 4) return false;
  const [a, b, c] = address.split(".").map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113));
}

export function parseBookmarkMetadata(html: string, pageUrl: string): BookmarkMetadata {
  const meta = new Map<string, string>();
  let title = "", favicon = "";
  const plain = (node: DefaultTreeAdapterMap["node"]): string =>
    "value" in node ? node.value : "childNodes" in node ? node.childNodes.map(plain).join("") : "";
  const clean = (s: string, length: number) => s.replace(/\s+/g, " ").trim().slice(0, length);
  const visit = (node: DefaultTreeAdapterMap["node"]) => {
    if ("tagName" in node) {
      const attrs = Object.fromEntries(node.attrs.map(a => [a.name, a.value]));
      if (node.tagName === "meta") {
        const key = (attrs.property || attrs.name || "").toLowerCase();
        if (!meta.has(key) && attrs.content) meta.set(key, attrs.content);
      }
      if (node.tagName === "title" && !title) title = plain(node);
      if (node.tagName === "link" && /(?:^|\s)(?:icon|apple-touch-icon)(?:\s|$)/i.test(attrs.rel || "") && !favicon)
        favicon = attrs.href || "";
    }
    if ("childNodes" in node) node.childNodes.forEach(visit);
  };
  const document = parse(html);
  visit(document);
  const asset = (value: string) => {
    try { return value ? bookmarkUrl(new URL(value, pageUrl).href) : ""; } catch { return ""; }
  };
  return {
    title: clean(meta.get("og:title") || meta.get("twitter:title") || title || new URL(pageUrl).hostname, 500),
    description: clean(meta.get("og:description") || meta.get("description") || meta.get("twitter:description") || "", 2000),
    icon: asset(favicon || "/favicon.ico"),
    image: bookmarkImage(document, pageUrl),
  };
}

type PageResponse = { status: number; location?: string; type: string; body: Buffer };
// Electron supplies Chromium's per-URL proxy result (including PAC and bypass rules).
// Keep this adapter independent of Electron so the browser server remains usable.
export type BookmarkProxyResolver = (url: string, signal?: AbortSignal) => Promise<string>;
export function bookmarkPageReader(options: {
  resolveProxy?: BookmarkProxyResolver;
  lookupHost?: (host: string) => Promise<string[]>;
} = {}) {
  const lookupHost = options.lookupHost ?? (async (host: string) => (await lookup(host, { family: 4, all: true })).map(a => a.address));
  const resolveProxy = options.resolveProxy ?? systemBookmarkProxy;
  return async (url: URL, signal: AbortSignal): Promise<PageResponse> => {
    if (url.port && !["80", "443"].includes(url.port)) throw new Error("Unsupported port");
    const host = url.hostname.replace(/^\[|\]$/g, "");
    const addresses = isIP(host) ? [host] : await lookupHost(host);
    signal.throwIfAborted();
    if (!addresses.length || addresses.some(a => !publicBookmarkAddress(a))) throw new Error("Non-public host");
    // Pin the URL itself, not lookup(): a proxy resolves CONNECT/absolute-form
    // destinations independently. Preserve the original HTTP Host and TLS SNI.
    const destination = new URL(url);
    destination.hostname = addresses[0];
    destination.hash = "";
    const routes = (await resolveProxy(url.href, signal)).split(";");
    let failure: unknown = new Error("No supported bookmark proxy");
    for (const route of routes) {
      signal.throwIfAborted();
      try {
        let proxy: URL | undefined;
        if (route.trim() !== "DIRECT") {
          const match = /^(PROXY|HTTPS)\s+(\S+)$/i.exec(route.trim());
          if (!match) throw new Error("Unsupported bookmark proxy");
          proxy = new URL(`${match[1].toUpperCase() === "HTTPS" ? "https" : "http"}://${match[2]}`);
          if (!proxy.hostname || proxy.pathname !== "/" || proxy.search || proxy.hash) throw new Error("Invalid bookmark proxy");
        }
        return await requestPage(destination, url, signal, proxy);
      } catch (error) { failure = error; }
    }
    // A configured proxy failing never silently changes to a direct connection.
    throw failure;
  };
}

async function requestPage(destination: URL, original: URL, signal: AbortSignal, proxy?: URL): Promise<PageResponse> {
  const forward = !!proxy && destination.protocol === "http:";
  const connection = forward ? new URL(proxy) : destination;
  const authorization = forward && (connection.username || connection.password)
    ? `Basic ${Buffer.from(`${decodeURIComponent(connection.username)}:${decodeURIComponent(connection.password)}`).toString("base64")}` : "";
  if (forward) { connection.username = ""; connection.password = ""; }
  const agent = proxy && !forward ? new HttpsAgent({ keepAlive: false, proxyEnv: { HTTPS_PROXY: proxy.href } }) : undefined;
  try { return await new Promise<PageResponse>((resolve, reject) => {
    const request = (connection.protocol === "https:" ? httpsGet : httpGet)(connection, {
      agent: agent ?? false, signal,
      ...(forward ? { path: destination.href } : destination.protocol === "https:" && !isIP(original.hostname) ? { servername: original.hostname } : {}),
      headers: { Host: original.host, "User-Agent": "Notdown-Bookmark/1.0", Accept: "text/html,application/xhtml+xml", "Accept-Encoding": "identity", ...(authorization ? { "Proxy-Authorization": authorization } : {}) },
    }, response => {
      const status = response.statusCode || 0;
      const type = response.headers["content-type"] || "";
      if ([301, 302, 303, 307, 308].includes(status)) {
        resolve({ status, location: response.headers.location, type, body: Buffer.alloc(0) });
        response.destroy(); return;
      }
      if (status < 200 || status >= 300 || !/^(text\/html|application\/xhtml\+xml)\b/i.test(type)) {
        reject(new Error("No public HTML preview")); response.destroy(); return;
      }
      const chunks: Buffer[] = []; let bytes = 0;
      response.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > 2_000_000) { reject(new Error("Page too large")); response.destroy(); }
        else chunks.push(chunk);
      });
      response.on("end", () => resolve({ status, type, body: Buffer.concat(chunks) }));
      response.on("error", reject);
      response.on("aborted", () => reject(new Error("Response interrupted")));
    });
    request.on("error", reject);
  }); } finally { agent?.destroy(); }
}

export function bookmarks(read = bookmarkPageReader()) {
  let active = 0;
  return { async resolve(input: unknown): Promise<BookmarkMetadata> {
    const url = bookmarkUrl((input as { url?: unknown } | null)?.url);
    if (!url) throw new VaultError(400, "Enter a valid http:// or https:// URL.");
    if (active >= 6) throw new VaultError(429, "Please try creating the bookmark again shortly.");
    active++;
    const signal = AbortSignal.timeout(10000);
    try {
      let current = new URL(url);
      for (let i = 0; i <= 4; i++) {
        // The deadline also bounds DNS lookups and a stalled response body.
        const response = await new Promise<PageResponse>((resolve, reject) => {
          const abort = () => reject(new Error("Bookmark request timed out"));
          signal.addEventListener("abort", abort, { once: true });
          read(current, signal).then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
          if (signal.aborted) abort();
        });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          const next = response.location && bookmarkUrl(new URL(response.location, current).href);
          if (!next) throw new Error("Invalid redirect");
          current = new URL(next); continue;
        }
        const charset = /charset\s*=\s*["']?([\w-]+)/i.exec(response.type)?.[1] ||
          /<meta[^>]+charset\s*=\s*["']?([\w-]+)/i.exec(response.body.subarray(0, 4096).toString("ascii"))?.[1] || "utf-8";
        let html: string;
        try { html = new TextDecoder(charset).decode(response.body); } catch { html = response.body.toString("utf8"); }
        return parseBookmarkMetadata(html, current.href);
      }
      throw new Error("Too many redirects");
    } catch {
      throw new VaultError(502, "Could not load webpage details. The link can still be saved.");
    } finally { active--; }
  } };
}
