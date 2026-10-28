import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { documentMetadata } from "../src/features/metadata/document-metadata.js";
import { parseNotionMarkdown, notionInlineLinks } from "../src/document/notion-markdown.js";
import { editorKind } from "../src/document/node-identity.js";
import { openingTag, readAttributes, decodeXml, escapeXml } from "../src/document/notion-syntax.js";
import { notionBlockContent } from "./notion-block-content.js";
import { destinationMarker, type ImportPlan } from "./markdown-import.js";
import { isPageUuid, stablePageUuid } from "../src/vault/page-id.js";
import { VaultError } from "./vault.js";
import { enrichNotionBlocks } from "./notion-block-import.js";
import { notionDatabaseImport } from "./notion-database-import.js";
import { notionSourceTags, notionProseSource, notionElement } from "../src/document/notion-v2.js";
import { notionAssets, notionAssetIdentity, type ReadNotionAsset } from "./notion-assets.js";
import { localizeNotionSynced } from "./notion-synced-import.js";
import type { ImportProgress } from "../src/shared/import-progress.js";
import { readNotionDesktopCache, supplementNotionDates, type ReadNotionCache } from "./notion-desktop-cache.js";
import { supplementNotionColors } from "./notion-color-import.js";
import { hasUnknownNotionCodeLanguage, supplementNotionCodeLanguages } from "./notion-code-import.js";
import { blockifyNotionImages } from "./notion-image-import.js";
import { recoverCachedNotionBlock } from "./notion-private-blocks.js";

const API = "https://api.notion.com/v1";
const VERSION = "2026-03-11";
const MAX_BYTES = 20 * 1024 * 1024;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const digest = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
type Json = Record<string, any>;
type ResolvePage = (id: string) => string | undefined;

/** Inspect a bounded error body without exposing its message, URLs or credentials. */
async function notionReadError(response: Response): Promise<{ code?: string; unsupportedChildren?: string }> {
  const reader = response.body?.getReader();
  if (!reader) return {};
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 16 * 1024) return {};
      chunks.push(value);
    }
    const error = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const codes = ["invalid_json", "invalid_request_url", "invalid_request", "validation_error", "missing_version", "invalid_beta", "unauthorized", "restricted_resource", "object_not_found", "conflict_error", "rate_limited", "internal_server_error", "bad_gateway", "service_unavailable", "database_connection_unavailable", "gateway_timeout"];
    const code = codes.includes(error?.code) ? error.code : undefined;
    const unsupportedChildren = response.status === 400 && code === "validation_error" && typeof error.message === "string"
      ? /^Block type ([a-z][a-z0-9_]{0,63}) is not supported via the API for your bot type\.$/.exec(error.message)?.[1] : undefined;
    return { code, unsupportedChildren };
  } catch { return {}; }
  finally { await reader.cancel().catch(() => {}); }
}

function notionReferenceUrl(value: string): string {
  return /^\/p\/(?:[0-9a-f]{32}|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})(?:[?#]|$)/i.test(value)
    ? `https://www.notion.so${value}` : value;
}

/** Extract only the path's page ID: query strings often contain a different view ID. */
export function notionPageId(value: unknown): string {
  if (typeof value !== "string" || value.length > 2000)
    throw new VaultError(400, "Enter a Notion page ID or URL.");
  let candidate = value.trim();
  if (candidate.startsWith("https://")) {
    let url: URL;
    try {
      url = new URL(candidate);
    } catch {
      throw new VaultError(400, "Invalid Notion page URL.");
    }
    if (
      !/^(?:[a-z0-9-]+\.)*notion\.(?:so|site|com)$/.test(url.hostname) ||
      url.username ||
      url.password ||
      url.port
    )
      throw new VaultError(
        400,
        "Use a notion.com / notion.so / notion.site page URL or a page ID.",
      );
    candidate = url.pathname.split("/").filter(Boolean).at(-1) ?? "";
    candidate =
      candidate.match(
        /(?:[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}|[0-9a-f]{32})$/i,
      )?.[0] ?? "";
  }
  if (!uuid.test(candidate) && !/^[0-9a-f]{32}$/i.test(candidate))
    throw new VaultError(400, "Enter a Notion page ID or URL.");
  const raw = candidate.replace(/-/g, "").toLowerCase();
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
}

function titleOf(page: Json, fallback: string): string {
  for (const property of Object.values<Json>(page.properties ?? {})) {
    if (property?.type !== "title" || !Array.isArray(property.title)) continue;
    const title = property.title
      .map((v: Json) =>
        typeof v.plain_text === "string"
          ? v.plain_text
          : (v.text?.content ?? ""),
      )
      .join("")
      .trim();
    if (title) return title.slice(0, 500);
  }
  return fallback;
}

/** Visit only parsed resource blocks: examples in fences, inline code and unknown
 * syntax must not trigger requests or have their source rewritten. */
function blockReferences(source: string, notdown = false, version: "v1" | "v2" = "v1") {
  const references: { id: string; tag: string; from: number; to: number; label?: string; anchored?: boolean }[] = [];
  if (version === "v2") {
    for (const tag of notionSourceTags(source)) {
      if (!["page", "page-link", "folder", "database", "mention", "mention-page"].includes(tag.tag)) continue;
      if (!tag.selfClosing && !notionElement(source, tag.from)) continue;
      if (tag.tag === "mention" && tag.attrs.type && !["page", "database"].includes(tag.attrs.type)) continue;
      for (const match of source.slice(tag.from, tag.to).matchAll(/([a-zA-Z][\w-]*)\s*=\s*("[^"]*"|'[^']*')/g)) {
        if (match[1] !== "url") continue;
        const value = notionReferenceUrl(tag.attrs[match[1]]);
        let id: string;
        let anchored = false;
        try {
          anchored = value.startsWith("https://") && !!new URL(value).hash;
          id = notionPageId(value.startsWith("collection://") ? value.slice(13) : value);
        } catch { continue; }
        const from = tag.from + match.index! + match[0].length - match[2].length + 1;
        const element = tag.tag === "folder" ? notionElement(source, tag.from) : undefined;
        references.push({ id, tag: value.startsWith("collection://") ? "data-source" : tag.attrs.type === "database" ? "database" : tag.tag, from, to: from + match[2].length - 2, anchored, ...(element ? { label: decodeXml(source.slice(element.openEnd, element.bodyEnd)).slice(0, 500) } : {}) });
      }
    }
    return references;
  }
  parseNotionMarkdown(source, name => notdown && name === "link_to_page").descendants(node => {
    if (!["owned_page", "child_page", "database"].includes(editorKind(node))) return;
    const start = node.attrs.sourceStart;
    if (typeof start !== "number") return;
    const raw = source.slice(start, node.attrs.sourceEnd);
    if (typeof node.attrs.source === "string" && node.attrs.source !== raw) return;
    const indent = raw.length - raw.trimStart().length;
    const tag = openingTag(raw.slice(indent));
    if (!tag || !["page", "page-link", "database"].includes(tag.tag) || !tag.attrs.url) return;
    let id: string;
    try { id = notionPageId(tag.attrs.url); } catch { return; }
    const opening = raw.slice(indent, indent + tag.length);
    // Consume complete attributes so a quoted value containing `url=` is safe.
    for (const match of opening.matchAll(/([a-zA-Z][\w-]*)\s*=\s*("[^"]*"|'[^']*')/g)) {
      if (match[1] !== "url") continue;
      const from = start + indent + match.index! + match[0].length - match[2].length + 1;
      references.push({ id, tag: tag.tag, from, to: from + match[2].length - 2 });
    }
  });
  return references;
}

/** Mask block-only syntax, retaining offsets, then use the editor's inline
 * grammar to locate destinations. No serialization or global URL replacement. */
function localizeInlinePageLinks(source: string, resolvePage: ResolvePage, notdown: boolean, warnings: Set<string>, version: "v1" | "v2" = "v1"): string {
  const masked = source.split("");
  const mask = (from: number, to: number) => {
    for (let i = from; i < to; i++) if (masked[i] !== "\r" && masked[i] !== "\n") masked[i] = " ";
  };
  parseNotionMarkdown(source, name => notdown && name === "link_to_page").descendants((node, _pos, parent) => {
    // Single-line containers parse their body with relative source offsets.
    // Preserve the carrier when those offsets do not address the outer source.
    if (typeof node.attrs.sourceStart === "number" && typeof node.attrs.source === "string" &&
        source.slice(node.attrs.sourceStart, node.attrs.sourceEnd) !== node.attrs.source) {
      if (parent && typeof parent.attrs.sourceStart === "number" && typeof parent.attrs.sourceEnd === "number")
        mask(parent.attrs.sourceStart, parent.attrs.sourceEnd);
      return false;
    }
    if (["code_block", "opaque_block", "math_block", "unsupported", "media_block", "owned_page", "child_page", "database"].includes(editorKind(node))) {
      if (typeof node.attrs.sourceStart === "number" && typeof node.attrs.sourceEnd === "number") mask(node.attrs.sourceStart, node.attrs.sourceEnd);
      return false;
    }
  });
  // Structural tag attributes and line attributes are not inline prose. Keep
  // inline spans/mentions intact: their own grammar protects attribute values.
  const visible = masked.join("");
  for (const line of visible.matchAll(/[^\r\n]+/g)) {
    const raw = line[0], base = line.index!;
    const indent = raw.length - raw.trimStart().length;
    const tag = openingTag(raw.slice(indent));
    if (tag && ["columns", "column", "callout", "details", "synced_block", "synced_block_reference", "table", "tr", "td", "summary"].includes(tag.tag))
      mask(base + indent, base + indent + tag.length);
    const attrs = /(?<!\\)\s+\{([^{}]*)\}\s*$/.exec(raw);
    if (attrs && readAttributes(attrs[1])) mask(base + attrs.index, base + raw.length);
  }
  const edits: { from: number; to: number; text: string }[] = [];
  const links = [...(version === "v2" ? notionProseSource(source) : masked.join("")).matchAll(/[^\r\n]+/g)].flatMap(line =>
    notionInlineLinks(line[0]).map(link => ({ ...link, from: link.from + line.index!, to: link.to + line.index! })));
  for (const link of links) {
    // Relative /p/ URLs are meaningful only in this Notion import context.
    const remote = notionReferenceUrl(link.href);
    if (!remote.startsWith("https://")) continue;
    let id: string, url: URL;
    try { id = notionPageId(remote); url = new URL(remote); } catch { continue; }
    const target = !url.hash ? resolvePage(id) : undefined;
    // Imported blocks do not carry Notion's original block IDs. Retain remote
    // anchors rather than silently linking to a different local location.
    const text = target && !url.hash ? `#page/${target}` : remote;
    if (url.hash) warnings.add("Links to Notion block anchors remain remote because imported blocks do not retain Notion block IDs.");
    if (text === link.href) continue;
    const raw = source.slice(link.from, link.to), marker = destinationMarker(raw, false);
    if (marker < 0) continue;
    let from = marker;
    while (from < raw.length && /\s/.test(raw[from])) from++;
    const angle = raw[from] === "<";
    if (angle) from++;
    let to = from, depth = 0;
    for (; to < raw.length; to++) {
      const char = raw[to];
      if (char === "\\") { to++; continue; }
      if (angle ? char === ">" : /\s/.test(char) || char === ")" && depth === 0) break;
      if (!angle && char === "(") depth++;
      if (!angle && char === ")") depth--;
    }
    edits.push({ from: link.from + from, to: link.from + to, text });
  }
  let boundary = source.length;
  for (const edit of edits.sort((a, b) => b.from - a.from)) {
    if (edit.to > boundary) throw new VaultError(400, "Overlapping Notion link destinations; original source retained.");
    source = source.slice(0, edit.from) + edit.text + source.slice(edit.to);
    boundary = edit.from;
  }
  return source;
}

/** Read-only transport; injected fetch/wait are for deterministic isolated tests. */
export async function prepareNotionImport(
  input: unknown,
  options: {
    signal?: AbortSignal;
    fetch?: typeof fetch;
    wait?: (ms: number, signal: AbortSignal) => Promise<void>;
    readAsset?: ReadNotionAsset;
    readCache?: ReadNotionCache;
    existingPages?: readonly { id: string; pageId: string }[];
    onProgress?: (progress: ImportProgress) => void;
  } = {},
): Promise<ImportPlan> {
  const request = input as {
    token?: unknown;
    pageId?: unknown;
    includeChildren?: unknown;
    variant?: unknown;
    downloadAssets?: unknown;
    useDesktopCache?: unknown;
  } | null;
  if (
    !request ||
    typeof request.token !== "string" ||
    !/^[\x21-\x7e]{10,500}$/.test(request.token)
  )
    throw new VaultError(
      400,
      "Enter a Notion integration token (without spaces).",
    );
  if (
    request.includeChildren !== undefined &&
    typeof request.includeChildren !== "boolean"
  )
    throw new VaultError(400, "Invalid child page selection.");
  const root = notionPageId(request.pageId);
  if (request.useDesktopCache !== undefined && typeof request.useDesktopCache !== "boolean") throw new VaultError(400, "Invalid desktop cache selection.");
  if (request.downloadAssets !== undefined && typeof request.downloadAssets !== "boolean") throw new VaultError(400, "Invalid attachment selection.");
  const variant = request.variant ?? "notion-markdown";
  if (variant !== "notdown" && variant !== "notion-markdown") throw new VaultError(400, "Choose Notdown or Notion Markdown for import.");
  const token = request.token;
  const signal = AbortSignal.any([
    options.signal ?? new AbortController().signal,
    AbortSignal.timeout(15 * 60_000),
  ]);
  const transport = options.fetch ?? fetch;
  const wait =
    options.wait ?? ((ms, signal) => delay(ms, undefined, { signal }));
  const originals: ImportPlan["originals"] = [];
  const pages: {
    id: string;
    parent: string | null;
    title: string;
    icon: string;
    source: string;
    cover?: string;
    imageIcon?: string;
    folder?: boolean;
  }[] = [];
  const warnings = new Set<string>([
    "Page targets use this import's copies or unique existing Notion imports in the current vault; missing or ambiguous targets and unmapped block anchors stay remote.",
    "Database records and supported properties become local copies. Formula/rollup results are read-only snapshots; permissions and automations are not imported. Original v2 Markdown and API responses are archived. Meeting transcripts are requested when accessible.",
    variant === "notdown" ? "Unknown blocks are recovered through v2 Markdown and Block API data, including readable template buttons. Missing button/AI/form configuration keeps a typed source reference." : "Unknown blocks are recovered using official v2 syntax. Supplemental Notdown controls remain preserved references.",
  ]);
  let bytes = 0,
    calls = 0;
  let progress: ImportProgress = { phase: "reading", completed: 0, currentTitle: root };
  const report = (update: Partial<ImportProgress>) => {
    progress = { ...progress, ...update, requestCount: calls, discovered: queued.size };
    options.onProgress?.({ ...progress });
  };
  const pagination = new Map<string, number>();
  const archive = (path: string, data: Buffer) => {
    bytes += data.length;
    if (bytes > MAX_BYTES)
      throw new VaultError(
        413,
        "Notion import exceeds 20 MB including original responses. Select a smaller page tree.",
      );
    originals.push({ path, data });
  };
  async function get(endpoint: string, allowMissing: boolean | "probe" | "optional" = false, body?: Json): Promise<Json> {
    if (body && !/^\/data_sources\/[0-9a-f-]+\/query$/.test(endpoint))
      throw new VaultError(400, "Only read-only Notion data source queries may use POST.");
    const pathname = endpoint.split("?")[0];
    const operation = /^\/pages\/[^/]+\/markdown$/.test(pathname) ? "Reading page Markdown"
      : /^\/pages\/[^/]+\/properties\//.test(pathname) ? "Reading complete page properties"
      : pathname.startsWith("/pages/") ? "Reading page details"
      : pathname.startsWith("/databases/") ? "Reading database details"
      : /^\/data_sources\/[^/]+\/query$/.test(pathname) ? "Querying database records"
      : pathname.startsWith("/data_sources/") ? "Reading data source schema"
      : pathname.endsWith("/children") ? "Scanning child pages and blocks"
      : pathname.startsWith("/blocks/") ? "Reading block details"
      : pathname === "/views" ? "Listing database views" : "Reading database view";
    const paginated = pathname.endsWith("/children") || pathname.endsWith("/query") || pathname.includes("/properties/") || pathname === "/views";
    const pageNumber = endpoint.includes("start_cursor=") || body?.start_cursor ? (pagination.get(pathname) ?? 1) + 1 : 1;
    pagination.set(pathname, pageNumber);
    const step = `${operation}${paginated ? ` (page ${pageNumber})` : ""}`;
    for (let attempt = 0; attempt < 3; attempt++) {
      signal.throwIfAborted();
      if (++calls > 1500)
        throw new VaultError(
          413,
          "Notion import exceeds 1,500 API requests. Select a smaller page tree.",
        );
      if (calls > 1) await wait(350, signal);
      report({ step: `${step} — waiting for Notion${attempt ? ` (retry ${attempt}/2)` : ""}` });
      let response: Response;
      try {
        response = await transport(`${API}${endpoint}`, {
          method: body ? "POST" : "GET",
          ...(body ? { body: JSON.stringify(body) } : {}),
          redirect: "error",
          signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
          headers: {
            Authorization: `Bearer ${token}`,
            "Notion-Version": VERSION,
            ...(body ? { "Content-Type": "application/json" } : {}),
          },
        });
      } catch (error) {
        if (error instanceof VaultError) throw error;
        if (signal.aborted) throw error;
        const detail = error instanceof Error && error.message ? ` (${error.message.slice(0, 120)})` : "";
        throw new VaultError(502, `Could not connect to the Notion API${detail}. Check the connection and retry the preview.`);
      }
      if (response.status === 429 && attempt < 2) {
        const seconds = Number(response.headers.get("retry-after") ?? "1");
        await response.body?.cancel();
        if (!Number.isFinite(seconds) || seconds < 0 || seconds > 30)
          throw new VaultError(
            429,
            "Notion is rate limiting requests. Retry the preview later.",
          );
        report({ step: `Notion rate limit: waiting ${Math.max(1, seconds)}s before retry ${attempt + 1}/2 — ${step}` });
        await wait(Math.max(1, seconds) * 1000, signal);
        continue;
      }
      if (!response.ok) {
        const detail = await notionReadError(response);
        // Notion advertises has_children on AI blocks while refusing this read.
        // Keep their placeholders/cache recovery available, but never swallow a
        // different validation error or a failed continuation of a partial list.
        if (allowMissing && detail.unsupportedChildren && /^\/blocks\/[^/]+\/children$/.test(pathname) && !endpoint.includes("start_cursor="))
          return { object: "unavailable", unsupportedChildren: detail.unsupportedChildren };
        if (allowMissing && ([403, 404].includes(response.status) || (allowMissing === "probe" || allowMissing === "optional") && [400, 405].includes(response.status) && !(pathname.endsWith("/children") && endpoint.includes("start_cursor=")))) return { object: "unavailable" };
        const reason =
          response.status === 401
            ? "Invalid Notion integration token."
            : response.status === 403 || response.status === 404
              ? "Notion content is unavailable. Share the page and its children with the connection and enable Read content."
              : `Notion returned HTTP ${response.status}${detail.code ? ` (${detail.code})` : ""} at ${pathname}. ${response.status === 400 ? "The request was rejected; preview could not be prepared." : "Retry the preview later."}`;
        // Never echo upstream error bodies (which may contain credentials or private URLs).
        throw new VaultError(response.status === 429 ? 429 : 502, reason);
      }
      const reader = response.body?.getReader();
      if (!reader)
        throw new VaultError(502, "Notion returned an empty response.");
      report({ step: `${step} — receiving response` });
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size + bytes > MAX_BYTES)
            throw new VaultError(
              413,
              "Notion import exceeds 20 MB. Select a smaller page tree.",
            );
          chunks.push(value);
        }
      } catch (error) {
        await reader.cancel().catch(() => {});
        throw error instanceof VaultError
          ? error
          : new VaultError(
              502,
              "Notion response was interrupted. Retry the preview.",
            );
      }
      const raw = Buffer.concat(chunks);
      let result: Json;
      try {
        result = JSON.parse(raw.toString("utf8"));
      } catch {
        throw new VaultError(502, "Notion returned invalid JSON.");
      }
      if (!result || typeof result !== "object" || Array.isArray(result))
        throw new VaultError(502, "Invalid Notion response.");
      archive(`api/${String(originals.length).padStart(5, "0")}.json`, raw);
      return result;
    }
    throw new VaultError(429, "Notion is rate limiting requests. Retry later.");
  }
  const queued = new Set<string>([root]);
  const queue: { id: string; parent: string | null; record?: Json; folder?: boolean; folderTitle?: string; database?: { title: string; icon: string } }[] = [
    { id: root, parent: null },
  ];
  const enqueue = (id: string, parent: string | null, record?: Json) => {
    const existing = queue.find(entry => entry.id === id);
    if (existing) {
      if (parent) existing.parent = parent;
      if (record) existing.record = record;
      return existing;
    }
    if (queued.size >= 500) throw new VaultError(413, "Notion import exceeds 500 pages. Select a smaller database or page tree.");
    const item: (typeof queue)[number] = { id, parent, record };
    queued.add(id); queue.push(item);
    return item;
  };
  const databaseImport = notionDatabaseImport({ read: get, normalizeId: notionPageId, warn: message => warnings.add(message), enqueue, includeChildren: request.includeChildren !== false,
    enqueueDatabase: (id, parent, info) => { enqueue(id, parent).database = info; }, onResource: title => report({ currentTitle: title }) });
  report({ step: "Identifying the Notion page, database or data source" });
  const rootPage = await get(`/pages/${root}`, "probe");
  if (rootPage.object === "unavailable") {
    const rootDatabase = await get(`/databases/${root}`, "probe");
    if (rootDatabase.object !== "unavailable") queue[0].database = (await databaseImport.database(root, rootDatabase))!;
    else queue[0].database = (await databaseImport.dataSource(root, await get(`/data_sources/${root}`)))!;
  } else queue[0].record = rootPage;
  const scannedBlocks = new Set<string>();
  const blocks = new Map<string, Json>();
  const markdownCache = new Map<string, Json>();
  async function readMarkdown(id: string, optional = false): Promise<Json> {
    if (markdownCache.has(id)) return markdownCache.get(id)!;
    const result = await get(`/pages/${id}/markdown?markdown_version=v2&include_transcript=true`, optional ? "optional" : false);
    if (result.object === "unavailable") { markdownCache.set(id, result); return result; }
    if (result.object !== "page_markdown" || typeof result.id !== "string" || result.id.toLowerCase() !== id || typeof result.markdown !== "string" || typeof result.truncated !== "boolean" || !Array.isArray(result.unknown_block_ids))
      throw new VaultError(502, "Notion did not return a valid v2 Markdown response.");
    if (result.truncated && !result.unknown_block_ids.length) {
      if (!optional) throw new VaultError(422, `Page ${id} is truncated without unknown_block_ids. No import was prepared; select smaller child pages.`);
      warnings.add(`Block ${id}: truncated without recovery IDs; its placeholder was preserved.`);
      return { object: "unavailable" };
    }
    markdownCache.set(id, result);
    return result;
  }
  const childCache = new Map<string, Json[]>();
  const unavailableChildren = new Set<string>();
  async function readChildren(id: string, optional = false): Promise<Json[]> {
    if (childCache.has(id)) return childCache.get(id)!;
    const children: Json[] = [], cursors = new Set<string>(); let cursor = "";
    do {
      const result = await get(`/blocks/${id}/children?page_size=100${cursor ? `&start_cursor=${encodeURIComponent(cursor)}` : ""}`, optional ? "optional" : true);
      if (result.object === "unavailable") {
        unavailableChildren.add(id);
        if (result.unsupportedChildren) warnings.add(`Block ${id}: Notion does not expose ${result.unsupportedChildren} children through this connection. Available Markdown and verified cache recovery are still used; unrecovered child content remains incomplete.`);
        else if (!optional || cursor) warnings.add(`Block ${id}: children unavailable; references remain incomplete.`);
        break;
      }
      if (!Array.isArray(result.results) || typeof result.has_more !== "boolean") throw new VaultError(502, "Invalid Notion child block response.");
      for (const block of result.results) {
        if (!block || typeof block.id !== "string" || !uuid.test(block.id)) throw new VaultError(502, "Invalid Notion block ID.");
        blocks.set(block.id.toLowerCase(), block); children.push(block);
      }
      if (!result.has_more) break;
      if (typeof result.next_cursor !== "string" || !result.next_cursor || cursors.has(result.next_cursor)) throw new VaultError(502, "Notion pagination did not advance; no incomplete import was prepared.");
      cursor = result.next_cursor; cursors.add(cursor);
    } while (true);
    childCache.set(id, children); return children;
  }
  async function homeBlocks(children: Json[], ancestors = new Set<string>()): Promise<string> {
    const content: string[] = [];
    for (const block of children) {
      const id = notionPageId(block.id), url = `https://www.notion.so/${id}`;
      if (ancestors.has(id) || ancestors.size >= 30) throw new VaultError(422, "Wiki Home contains a cyclic or excessively deep block tree.");
      const kind = block.type;
      if (kind === "child_page" || kind === "child_database") {
        const tag = kind === "child_page" ? "page" : "database";
        content.push(`<${tag} url="${url}">${escapeXml(block[kind]?.title || "Untitled")}</${tag}>`); continue;
      }
      const nested = block.has_children && !(kind === "synced_block" && block.synced_block?.synced_from)
        ? await homeBlocks(await readChildren(id), new Set([...ancestors, id])) : "";
      const rendered = notionBlockContent(block, nested ? [nested] : [], variant === "notdown");
      if (rendered !== undefined) content.push(rendered);
      else {
        warnings.add(`Wiki Home block ${id}: ${String(kind)} could not be converted; its placeholder and original JSON are retained.`);
        // The normal unknown-block recovery pass restores readable descendants.
        // Appending them here as well would duplicate content in that pass.
        content.push(`<unknown url="${url}" alt="${escapeXml(String(kind))}"/>`);
      }
    }
    return content.join("\n\n");
  }
  async function discover(page: string) {
    const containers = [page];
    for (let index = 0; index < containers.length; index++) {
      const id = containers[index];
      if (scannedBlocks.has(id)) continue;
      scannedBlocks.add(id);
        for (const block of await readChildren(id)) {
          if (!block || typeof block.id !== "string" || !uuid.test(block.id))
            throw new VaultError(502, "Invalid Notion block ID.");
          const childId = block.id.toLowerCase();
          blocks.set(childId, block);
          if (block.type === "child_page") {
            const existing = queue.find((entry) => entry.id === childId);
            if (existing) {
              // A page reference may have queued this page first. The block
              // tree is authoritative for its parent relationship.
              existing.parent = page;
            } else {
              if (queued.size >= 500)
                throw new VaultError(
                  413,
                  "Notion import exceeds 500 pages. Select a smaller page tree.",
                );
              queued.add(childId);
              queue.push({ id: childId, parent: page });
            }
          } else if (block.type === "child_database") {
            const database = await databaseImport.database(childId);
            if (database) enqueue(childId, page).database = database;
          } else if (
            block.has_children === true &&
            block.type !== "synced_block"
          ) {
            containers.push(childId);
          }
        }
    }
  }
  for (let index = 0; index < queue.length; index++) {
    const item = queue[index];
    report({ phase: "reading", completed: index, step: "Preparing page", currentTitle: item.database?.title ?? item.folderTitle ?? (item.record ? titleOf(item.record, "Untitled") : blocks.get(item.id)?.child_page?.title) ?? item.id });
    let databaseMarkdown: Json | undefined;
    const databaseRaw = item.database ? databaseImport.rawDatabase(item.id) : undefined;
    if (item.database) {
      const children = databaseRaw?.notionSourceOnly ? [] : await readChildren(item.id, true);
      if (children.length || !databaseRaw?.notionSourceOnly && (databaseImport.possibleWiki(item.id) || unavailableChildren.has(item.id))) {
        databaseMarkdown = await readMarkdown(item.id, true);
        if (databaseMarkdown.object === "unavailable" && children.length) {
          databaseMarkdown = { object: "page_markdown", id: item.id, markdown: await homeBlocks(children), truncated: false, unknown_block_ids: [] };
          warnings.add(`Database ${item.database.title}: Home reconstructed from readable blocks; original block JSON is archived.`);
        }
        if (databaseMarkdown.object !== "unavailable") databaseImport.markHome(item.id);
        else warnings.add(`Database ${item.database.title}: the API did not expose readable Home content. Records were imported; the Home page could not be recovered.`);
      }
      if (!databaseImport.hasHome(item.id)) {
        pages.push({ id: item.id, parent: item.parent, source: "", title: item.database.title, icon: item.database.icon, cover: databaseRaw?.cover?.[databaseRaw.cover.type]?.url, imageIcon: databaseRaw?.icon?.[databaseRaw.icon.type]?.url });
        if (request.includeChildren !== false && children.length) await discover(item.id);
        continue;
      }
    }
    const page = item.database ? { ...databaseRaw, object: "page", id: item.id, properties: {} } : item.folder ? { object: "page", id: item.id, properties: {} } : item.record ?? await get(`/pages/${item.id}`);
    if (
      page.object !== "page" ||
      typeof page.id !== "string" ||
      page.id.toLowerCase() !== item.id
    )
      throw new VaultError(502, "Notion did not return the requested page.");
    const title = item.database?.title ?? titleOf(page, item.folder ? item.folderTitle || "Folder" : "Untitled");
    report({ phase: "reading", completed: index, step: "Reading page properties", currentTitle: title });
    await databaseImport.pageProperties(item.id, page);
    const response = databaseMarkdown ?? await readMarkdown(item.id);
    if (
      response.object !== "page_markdown" ||
      typeof response.id !== "string" ||
      response.id.toLowerCase() !== item.id ||
      typeof response.markdown !== "string" ||
      typeof response.truncated !== "boolean" ||
      !Array.isArray(response.unknown_block_ids)
    )
      throw new VaultError(
        502,
        "Notion did not return a valid Enhanced Markdown response.",
      );
    if (response.unknown_block_ids.length) {
      // Notion also sets truncated for inaccessible blocks. Keep these
      // placeholders importable, while making the incomplete content explicit.
      warnings.add(
        `Page ${item.id}: the Markdown API reported ${response.unknown_block_ids.length} block(s) as unknown (unknown_block_ids).${response.truncated ? " Notion also marked this response as truncated." : ""} Preview and import are available, but content may be incomplete. ${variant === "notdown" ? "Supported blocks will be restored where the Block API can read them; unresolved placeholders remain." : "The returned Markdown and placeholders are preserved."}`,
      );
    } else if (response.truncated)
      throw new VaultError(
        422,
        `Page ${item.id} is truncated without unknown_block_ids. No import was prepared; select smaller child pages.`,
      );
    const source: string = response.markdown;
    if (Buffer.byteLength(source) > 10 * 1024 * 1024)
      throw new VaultError(413, `Page ${item.id} exceeds 10 MB.`);
    // The vault always recognizes document metadata, regardless of dialect. Do not
    // silently reinterpret leading Notion prose as application metadata.
    try {
      if (documentMetadata(source).form) throw new Error("metadata");
    } catch {
      throw new VaultError(
        422,
        `Page ${item.id} starts with ambiguous YAML/Pandoc metadata. Its API Markdown cannot be imported unchanged into this vault.`,
      );
    }
    archive(`pages/${item.id}.md`, Buffer.from(source));
    pages.push({
      ...item,
      source,
      cover: page.cover?.[page.cover.type]?.url,
      imageIcon: page.icon?.type === "custom_emoji" ? page.icon.custom_emoji?.url : page.icon?.[page.icon?.type]?.url,
      title,
      icon:
        page.icon?.type === "emoji" &&
        typeof page.icon.emoji === "string" &&
        page.icon.emoji.length <= 100
          ? page.icon.emoji
          : item.database ? item.database.icon : item.folder ? "folder" : "file-text",
    });
    // <page> is the official child-page carrier. Localize only parsed tags;
    report({ phase: "reading", completed: index + 1, step: "Finding child pages and databases", currentTitle: title });
    // <unknown> URLs address source blocks and must never become page targets.
    if (request.includeChildren !== false) {
      for (const { id: referencedId, tag, label, anchored } of blockReferences(source, variant === "notdown", "v2")) {
        if (anchored) continue;
        // Databases are discovered through child_database and read using their
        // resource endpoint, never queued as ordinary /pages targets.
        if (tag === "database") {
          if (queued.has(referencedId)) continue;
          const database = await databaseImport.database(referencedId);
          if (database) enqueue(referencedId, null).database = database;
          continue;
        }
        if (tag === "data-source") continue;
        if (tag === "folder") { if (!queued.has(referencedId)) { const folder = enqueue(referencedId, item.folder ? item.id : null); folder.folder = true; folder.folderTitle = label; } continue; }
        // Links and mentions resolve later; they never authorize traversal.
        if (tag === "mention" || tag === "mention-page" || tag === "page-link") continue;
        if (!queued.has(referencedId) && queued.size < 500) {
          queued.add(referencedId);
          // A page tag is a link target, not evidence of a sidebar parent.
          // Only a child_page block from the Block API can assign a parent.
          queue.push({ id: referencedId, parent: item.folder ? item.id : null });
        }
      }
    }
    if (request.includeChildren !== false && !item.folder) await discover(item.id);
    report({ phase: "reading", completed: index + 1, step: "Page read", currentTitle: title });
  }
  // A reference can be imported before its owning page is scanned. Resolve the
  // final hierarchy after discovery, rather than keeping the earlier copy.
  const discoveredPageIds = new Set(pages.map(page => page.id));
  for (const page of pages) page.parent = databaseImport.recordParent(page.id, discoveredPageIds) ?? queue.find(entry => entry.id === page.id)!.parent;
  report({ phase: "restoring", completed: pages.length, step: "Completing database record properties", currentTitle: undefined });
  const recordTitles = await databaseImport.completeProperties();
  for (const page of pages) if (recordTitles.get(page.id)) page.title = recordTitles.get(page.id)!;
  {
    const titles = new Map(pages.map(page => [page.id, page.title]));
    for (const page of pages) {
      report({ phase: "restoring", completed: pages.length, step: "Restoring unsupported blocks and page references", currentTitle: page.title });
      page.source = await enrichNotionBlocks(page.source, {
        normalizeId: notionPageId,
        version: "v2", local: variant === "notdown",
        readChildren,
        recoverPrivateBlock: request.useDesktopCache === true && variant === "notdown" ? async block => {
          const kind = block.type === "unsupported" ? block.unsupported?.block_type : block.type;
          if (!["ai_block", "button"].includes(kind)) return;
          let snapshot;
          try { snapshot = await (options.readCache ?? readNotionDesktopCache)(page.id, [block.id]); }
          catch (error) {
            if (signal.aborted || error instanceof VaultError) throw error;
            warnings.add("Local Notion cache supplement failed; unsupported block source was retained.");
            return;
          }
          if (snapshot.warning) warnings.add(snapshot.warning);
          const result = recoverCachedNotionBlock(block, snapshot);
          for (const warning of result.warnings) warnings.add(warning);
          if (result.evidence) archive(`private-blocks/${block.id}.json`, Buffer.from(JSON.stringify(result.evidence, null, 2)));
          return result.source;
        } : undefined,
        readMarkdown: async id => { const result = await readMarkdown(id, true); return result.object === "page_markdown" ? result.markdown : undefined; },
        readBlock: async id => {
          if (!blocks.has(id)) blocks.set(id, await get(`/blocks/${id}`, true));
          return blocks.get(id)!;
        },
        pageTitle: async id => {
          if (!titles.has(id)) {
            const target = await get(`/pages/${id}`, true);
            const valid = target.object === "page" && typeof target.id === "string" && target.id.toLowerCase() === id;
            titles.set(id, valid ? titleOf(target, "Linked page") : "Linked page");
            if (!valid) warnings.add(`Page ${id}: title unavailable; a fallback label is used and the source ID is preserved for link resolution.`);
          }
          return titles.get(id)!;
        },
        warn: message => warnings.add(message),
      });
      const sourceTags = notionSourceTags(page.source);
      const hasColors = sourceTags.some(tag => tag.tag === "span" && (tag.attrs.color || tag.attrs.bg_color));
      const hasDates = sourceTags.some(tag => tag.tag === "date");
      const hasUnknownCode = hasUnknownNotionCodeLanguage(page.source);
      let pageBlocks: Json[] = [], colorCache: Awaited<ReturnType<ReadNotionCache>> | undefined;
      if (hasUnknownCode || hasColors || hasDates && request.useDesktopCache === true && variant === "notdown") {
        report({ step: "Checking code languages, block styles and reminders", currentTitle: page.title });
        const pending = [page.id], visited = new Set<string>();
        for (let i = 0; i < pending.length; i++) {
          signal.throwIfAborted();
          const id = pending[i];
          if (visited.has(id)) continue;
          if (visited.size >= 10000) throw new VaultError(413, "Too many blocks to verify Notion styles. Select a smaller page tree.");
          visited.add(id);
          for (const block of await readChildren(id)) {
            pageBlocks.push(block);
            if (block.has_children && !["child_page", "child_database", "synced_block"].includes(block.type)) pending.push(block.id.toLowerCase());
          }
        }
        if (request.useDesktopCache === true && (hasColors || hasDates && variant === "notdown")) {
          try {
            colorCache = await (options.readCache ?? readNotionDesktopCache)(page.id, pageBlocks.map(block => block.id));
          } catch (error) {
            if (signal.aborted || error instanceof VaultError) throw error;
            colorCache = { blocks: [], warning: "Local Notion cache supplement failed; public API content was retained." };
          }
          if (colorCache.warning) warnings.add(colorCache.warning);
        }
      }
      if (hasUnknownCode) {
        const code = supplementNotionCodeLanguages(page.source, pageBlocks);
        page.source = code.source;
        for (const warning of code.warnings) warnings.add(`${page.title}: ${warning}`);
        if (code.restored) {
          archive(`code-language-recovery/${page.id}.json`, Buffer.from(JSON.stringify({ version: 1, pageId: page.id, source: "Same-batch Block API; unique complete code text verified", blocks: code.evidence }, null, 2)));
          warnings.add(`${page.title}: restored ${code.restored} code language label(s) from matching Block API code blocks.`);
        }
      }
      if (hasColors) {
        const colors = supplementNotionColors(page.source, pageBlocks, variant, colorCache);
        page.source = colors.source;
        for (const warning of colors.warnings) warnings.add(`${page.title}: ${warning}`);
        if (colors.evidence.length) archive(`color-recovery/${page.id}.json`, Buffer.from(JSON.stringify({ version: 1, pageId: page.id, source: "Same-batch public Markdown and Block API; optional verified desktop cache", blocks: colors.evidence }, null, 2)));
        if (colors.restoredApi || colors.restoredCache) warnings.add(`${page.title}: restored dual colors in ${colors.restoredApi} text range(s) from complementary public API data and ${colors.restoredCache} from the verified desktop cache. These are matched snapshots, not an atomic cloud snapshot.`);
      }
      if (hasDates) {
        let unmatched = true;
        if (request.useDesktopCache === true && variant === "notdown") {
          report({ step: "Checking date reminders against the local Notion desktop cache", currentTitle: page.title });
          try {
            const snapshot = colorCache!;
            if (snapshot.warning) warnings.add(snapshot.warning);
            const recovered = supplementNotionDates(page.source, pageBlocks, snapshot);
            page.source = recovered.source;
            unmatched = recovered.matched < recovered.total;
            if (recovered.evidence.length) archive(`desktop-cache/${page.id}.json`, Buffer.from(JSON.stringify({ source: "Notion desktop SQLite cache; public block IDs, dates and edit minutes verified", pageId: page.id, dates: recovered.evidence }, null, 2)));
            if (recovered.restored) warnings.add(`${page.title}: restored ${recovered.restored} reminder(s) from the local Notion desktop cache. This is a cached snapshot, not a guarantee of current cloud reminder settings.`);
          } catch (error) {
            if (signal.aborted) throw error;
            // Snapshot/archive size failures must retain the import's existing limits.
            if (error instanceof VaultError) throw error;
            warnings.add("Local Notion cache supplement failed; API dates were retained without inferring reminders.");
          }
        }
        if (unmatched) warnings.add("Notion's public API omits reminder configuration. Dates without a unique, matching desktop cache record require review in Remind; a time alone does not establish a reminder.");
        if (request.useDesktopCache === true && variant !== "notdown") warnings.add("Desktop cache reminder recovery requires the Notdown dialect; official Notion Markdown is preserved without supplemental attributes.");
      }
    }
  }
  for (const page of pages) if (Buffer.byteLength(page.source) > 10 * 1024 * 1024)
    throw new VaultError(413, `Page ${page.id} exceeds 10 MB after block restoration.`);
  // File names are separate from captions in Block API data. Scan only the
  // current pages' block containers when descendants were excluded from import.
  if (request.downloadAssets !== false) {
    for (const page of pages) {
      if (!notionSourceTags(page.source).some(tag => ["file", "embed"].includes(tag.tag))) continue;
      const pending = [page.id], visited = new Set<string>();
      for (let index = 0; index < pending.length; index++) {
        const id = pending[index];
        if (visited.has(id)) continue;
        visited.add(id);
        for (const block of await readChildren(id)) {
          if (block.has_children && !["child_page", "child_database", "synced_block"].includes(block.type)) pending.push(block.id.toLowerCase());
        }
      }
    }
  }
  const assetNames = new Map<string, string>();
  for (const block of blocks.values()) {
    const data = block[block.type], url = data?.[data.type]?.url || (block.type === "embed" ? data?.url : undefined);
    if (typeof url === "string" && typeof data?.name === "string" && data.name.trim()) assetNames.set(notionAssetIdentity(url), data.name);
  }
  const media = notionAssets({ signal, nameHints: assetNames, read: options.readAsset, remaining: () => MAX_BYTES - bytes, reserve: size => { bytes += size; }, warn: message => warnings.add(message), onRead: (name, attempt) => report({ step: `Downloading attachment ${attempt}${name ? `: ${name}` : ""}` }) });
  if (request.downloadAssets !== false) {
    for (const page of pages) {
      report({ phase: "attachments", completed: pages.length, step: "Downloading page attachments, cover and icon", currentTitle: page.title });
      page.source = await media.rewrite(page.source);
      if (page.cover) page.cover = await media.save(page.cover);
      if (page.imageIcon) page.imageIcon = await media.save(page.imageIcon);
      if (page.imageIcon?.startsWith("assets/")) page.icon = page.imageIcon;
    }
    report({ phase: "attachments", completed: pages.length, step: "Downloading database file properties", currentTitle: undefined });
    await databaseImport.saveAttachments(media.save);
    if (media.assets.length) warnings.add(`${media.assets.length} unique attachment(s), including available covers and custom icons, are ready for the Attachments library.`);
  } else warnings.add("Attachment downloading is disabled; remote attachment URLs can expire.");
  for (const page of pages) page.source = blockifyNotionImages(page.source, variant);
  report({ phase: "finalizing", completed: pages.length, step: "Resolving local links and preparing the preview", currentTitle: undefined });
  const localizePageReferences = (source: string, resolvePage: ResolvePage, databases?: Record<string, unknown>) => {
    for (const reference of blockReferences(source, variant === "notdown", "v2").sort((a, b) => b.from - a.from)) {
      if (reference.anchored) {
        warnings.add("Links to Notion block anchors remain remote because imported blocks do not retain Notion block IDs.");
        const raw = source.slice(reference.from, reference.to);
        if (raw.startsWith("/p/")) source = source.slice(0, reference.from) + notionReferenceUrl(raw) + source.slice(reference.to);
        continue;
      }
      // Database carriers must resolve to an imported database host.
      if (reference.tag === "database" && !databases) continue;
      const target = resolvePage(reference.id);
      if (reference.tag === "database" && (!target || !databases?.[target])) continue;
      if (target) source = source.slice(0, reference.from) + `#page/${encodeURIComponent(target)}` + source.slice(reference.to);
      else if (source.slice(reference.from, reference.to).startsWith("/p/"))
        source = source.slice(0, reference.from) + notionReferenceUrl(source.slice(reference.from, reference.to)) + source.slice(reference.to);
    }
    return localizeInlinePageLinks(source, resolvePage, variant === "notdown", warnings, "v2");
  };
  const importedIds = new Set(pages.map(page => page.id));
  const candidates = new Map<string, Set<string>>();
  for (const page of options.existingPages ?? []) {
    if (!isPageUuid(page.id)) continue;
    let pageId: string;
    try { pageId = notionPageId(page.pageId); } catch { continue; }
    if (importedIds.has(pageId)) continue;
    if (!candidates.has(pageId)) candidates.set(pageId, new Set());
    candidates.get(pageId)!.add(page.id);
  }
  const externalBindings = new Map<string, string>();
  // Include only bindings actually used by this snapshot in its identity.
  // Same-batch targets are excluded so repeating an import remains idempotent.
  for (const page of pages) localizePageReferences(page.source, pageId => {
    const matches = candidates.get(pageId);
    if (matches?.size !== 1) return;
    const target = [...matches][0];
    externalBindings.set(pageId, target);
    return target;
  });
  // Content identities include the exact archive snapshot and parent mapping. No
  // user page is ever updated; identical snapshots reuse the existing import batch.
  const id = digest(
    JSON.stringify([
      `notion-markdown-v2-recovery-${variant}`,
      "page-links-v2-mentions-and-existing-imports",
      "image-blocks-v1",
      [...externalBindings].sort(([a], [b]) => a.localeCompare(b)),
      "database-resources-v3-wiki-views",
      root,
      request.includeChildren !== false,
      request.downloadAssets !== false,
      media.assets.map(asset => asset.filename),
      pages.map((p) => [p.id, p.parent]),
      originals.map((f) => [f.path, digest(f.data)]),
    ]),
  );
  const localId = (notionId: string) => stablePageUuid(`notion-${id.slice(0, 24)}-${notionId}`);
  if (variant === "notdown") localizeNotionSynced(pages, localId, notionPageId, message => warnings.add(message));
  const databaseResult = databaseImport.finish(localId, new Set(pages.map(page => page.id)));
  const localByNotion = new Map(pages.map(page => [page.id, localId(page.id)]));
  const resolvePage: ResolvePage = pageId => {
    const matches = candidates.get(pageId);
    const target = localByNotion.get(pageId) ?? (matches?.size === 1 ? [...matches][0] : undefined);
    if (target) return target;
    warnings.add(matches && matches.size > 1
      ? `Page ${pageId}: multiple existing local copies match this Notion source; its source URLs remain remote. Choose a local target in External references, or include the target in this import.`
      : `Page ${pageId}: target is not imported in this batch or the current vault; its source URLs remain remote. It is displayed as an unavailable reference until a later import or explicit binding resolves it.`);
    return undefined;
  };
  // Database queries can discover records before their host entry is queued.
  // Commit validates parent existence sequentially, so publish ancestors first.
  const ordered: typeof pages = [], visited = new Set<string>(), visiting = new Set<string>();
  const byId = new Map(pages.map(page => [page.id, page]));
  const visit = (page: (typeof pages)[number]) => {
    if (visited.has(page.id)) return;
    if (visiting.has(page.id)) throw new VaultError(422, "Notion returned a cyclic page hierarchy; no import was prepared.");
    visiting.add(page.id);
    if (page.parent && byId.has(page.parent)) visit(byId.get(page.parent)!);
    visiting.delete(page.id); visited.add(page.id); ordered.push(page);
  };
  for (const page of pages) visit(page);
  const localizedPages = ordered.map(page => ({ ...page, source: localizePageReferences(page.source, resolvePage, databaseResult.resources.databases) }));
  const homePages = localizedPages.filter(page => databaseImport.hasHome(page.id));
  if (localizedPages.length + homePages.length > 500) throw new VaultError(413, "Notion import exceeds 500 pages including database Home pages.");
  return {
    id,
    name: pages[0].title,
    assets: media.assets,
    originals,
    errors: [],
    ...(Object.keys(databaseResult.resources.databases).length ? { databaseResources: databaseResult.resources } : {}),
    warnings: [...warnings],
    pages: [...localizedPages.map((page) => ({
      id: localId(page.id),
      path: `${page.title} (${page.id})`,
      source: databaseImport.hasHome(page.id) ? "" : page.source,
      metadata: {
        id: localId(page.id),
        title: page.title,
        parent: page.parent ? localId(page.parent) : null,
        icon: page.icon,
        ...databaseResult.metadata(page.id),
        properties: { ...((databaseResult.metadata(page.id).properties ?? {}) as Json), ...(page.cover ? { cover: page.cover } : {}) },
        bodyFormat: "notion-markdown",
        syntax: { version: 1, variant, notionVersion: "v2", extensions: {} },
        notionImport: {
          batchId: id,
          pageId: page.id,
          url: `https://www.notion.so/${page.id.replace(/-/g, "")}`,
          apiVersion: VERSION,
          markdownVersion: "v2",
          ...(page.folder ? { resourceType: "folder" } : {}),
          ...(page.imageIcon ? { iconUrl: page.imageIcon } : {}),
        },
      },
    })), ...homePages.map(page => ({
      id: localId(`home-${page.id}`), path: `${page.title} - Home`, source: page.source,
      metadata: { id: localId(`home-${page.id}`), title: "Home", parent: localId(page.id), icon: "file-text",
        bodyFormat: "notion-markdown", syntax: { version: 1, variant, notionVersion: "v2", extensions: {} },
        notionImport: { batchId: id, resourceType: "wiki-home", sourceDatabaseId: page.id, url: `https://www.notion.so/${page.id}`, apiVersion: VERSION, markdownVersion: "v2" },
      },
    }))],
  };
}
