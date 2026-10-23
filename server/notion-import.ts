import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { documentMetadata } from "../src/features/metadata/document-metadata.js";
import { parseNotionMarkdown, notionInlineLinks } from "../src/document/notion-markdown.js";
import { editorKind } from "../src/document/node-identity.js";
import { openingTag, readAttributes, decodeXml } from "../src/document/notion-syntax.js";
import { destinationMarker, type ImportPlan } from "./markdown-import.js";
import { stablePageUuid } from "../src/vault/page-id.js";
import { VaultError } from "./vault.js";
import { enrichNotionBlocks } from "./notion-block-import.js";
import { notionDatabaseImport } from "./notion-database-import.js";
import { notionSourceTags, notionProseSource, notionElement } from "../src/document/notion-v2.js";
import { notionAssets, type ReadNotionAsset } from "./notion-assets.js";
import { localizeNotionSynced } from "./notion-synced-import.js";

const API = "https://api.notion.com/v1";
const VERSION = "2026-03-11";
const MAX_BYTES = 20 * 1024 * 1024;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const digest = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
type Json = Record<string, any>;

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
  const references: { id: string; tag: string; from: number; to: number; label?: string }[] = [];
  if (version === "v2") {
    for (const tag of notionSourceTags(source)) {
      if (!["page", "page-link", "folder", "database", "mention"].includes(tag.tag)) continue;
      for (const match of source.slice(tag.from, tag.to).matchAll(/([a-zA-Z][\w-]*)\s*=\s*("[^"]*"|'[^']*')/g)) {
        if (match[1] !== "url") continue;
        const value = tag.attrs[match[1]];
        let id: string;
        try {
          if (value.startsWith("https://") && new URL(value).hash) continue;
          id = notionPageId(value.startsWith("collection://") ? value.slice(13) : value);
        } catch { continue; }
        const from = tag.from + match.index! + match[0].length - match[2].length + 1;
        const element = tag.tag === "folder" ? notionElement(source, tag.from) : undefined;
        references.push({ id, tag: value.startsWith("collection://") ? "data-source" : tag.attrs.type === "database" ? "database" : tag.tag, from, to: from + match[2].length - 2, ...(element ? { label: decodeXml(source.slice(element.openEnd, element.bodyEnd)).slice(0, 500) } : {}) });
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
function localizeInlinePageLinks(source: string, localByNotion: Map<string, string>, notdown: boolean, warnings: Set<string>, version: "v1" | "v2" = "v1"): string {
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
    const relative = /^\/p\/(?:[0-9a-f]{32}|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})(?:[?#]|$)/i.test(link.href);
    const remote = relative ? `https://www.notion.so${link.href}` : link.href;
    if (!remote.startsWith("https://")) continue;
    let id: string, url: URL;
    try { id = notionPageId(remote); url = new URL(remote); } catch { continue; }
    const target = localByNotion.get(id.replace(/-/g, ""));
    // Imported blocks do not carry Notion's original block IDs. Retain remote
    // anchors rather than silently linking to a different local location.
    const text = target && !url.hash ? `#page/${target}` : remote;
    if (target && url.hash) warnings.add("Links to Notion block anchors remain remote because imported blocks do not retain Notion block IDs.");
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
  } = {},
): Promise<ImportPlan> {
  const request = input as {
    token?: unknown;
    pageId?: unknown;
    includeChildren?: unknown;
    variant?: unknown;
    downloadAssets?: unknown;
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
    "Page targets in this import use local links; unimported targets and unmapped block anchors stay remote.",
    "Database records and supported properties become local copies. Formula/rollup results are read-only snapshots; permissions and automations are not imported. Original v2 Markdown and API responses are archived. Meeting transcripts are requested when accessible.",
    variant === "notdown" ? "Unknown blocks are recovered through v2 Markdown and Block API data, including readable template buttons. Missing button/AI/form configuration keeps a typed source reference." : "Unknown blocks are recovered using official v2 syntax. Supplemental Notdown controls remain preserved references.",
  ]);
  let bytes = 0,
    calls = 0;
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
    for (let attempt = 0; attempt < 3; attempt++) {
      signal.throwIfAborted();
      if (++calls > 1500)
        throw new VaultError(
          413,
          "Notion import exceeds 1,500 API requests. Select a smaller page tree.",
        );
      if (calls > 1) await wait(350, signal);
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
        await wait(Math.max(1, seconds) * 1000, signal);
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        if (allowMissing && ([403, 404].includes(response.status) || (allowMissing === "probe" || allowMissing === "optional") && [400, 405].includes(response.status))) return { object: "unavailable" };
        const reason =
          response.status === 401
            ? "Invalid Notion integration token."
            : response.status === 403 || response.status === 404
              ? "Notion content is unavailable. Share the page and its children with the connection and enable Read content."
              : `Notion returned HTTP ${response.status}. Retry the preview later.`;
        // Never echo upstream error bodies (which may contain credentials or private URLs).
        throw new VaultError(response.status === 429 ? 429 : 502, reason);
      }
      const reader = response.body?.getReader();
      if (!reader)
        throw new VaultError(502, "Notion returned an empty response.");
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
  const databaseImport = notionDatabaseImport({ read: get, normalizeId: notionPageId, warn: message => warnings.add(message), enqueue });
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
  async function readChildren(id: string): Promise<Json[]> {
    if (childCache.has(id)) return childCache.get(id)!;
    const children: Json[] = [], cursors = new Set<string>(); let cursor = "";
    do {
      const result = await get(`/blocks/${id}/children?page_size=100${cursor ? `&start_cursor=${encodeURIComponent(cursor)}` : ""}`, true);
      if (result.object === "unavailable") { warnings.add(`Block ${id}: children unavailable; references remain incomplete.`); break; }
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
    if (item.database) {
      pages.push({ id: item.id, parent: item.parent, source: "", title: item.database.title, icon: item.database.icon });
      continue;
    }
    const page = item.folder ? { object: "page", id: item.id, properties: {} } : item.record ?? await get(`/pages/${item.id}`);
    if (
      page.object !== "page" ||
      typeof page.id !== "string" ||
      page.id.toLowerCase() !== item.id
    )
      throw new VaultError(502, "Notion did not return the requested page.");
    await databaseImport.pageProperties(item.id, page);
    const response = await readMarkdown(item.id);
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
      title: titleOf(page, item.folder ? item.folderTitle || "Folder" : "Untitled"),
      icon:
        page.icon?.type === "emoji" &&
        typeof page.icon.emoji === "string" &&
        page.icon.emoji.length <= 100
          ? page.icon.emoji
          : item.folder ? "folder" : "file-text",
    });
    // <page> is the official child-page carrier. Localize only parsed tags;
    // <unknown> URLs address source blocks and must never become page targets.
    if (request.includeChildren !== false) {
      for (const { id: referencedId, tag, label } of blockReferences(source, variant === "notdown", "v2")) {
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
        // Ordinary mentions localize only when their destinations are in this import.
        if (tag === "mention") continue;
        if (!queued.has(referencedId) && queued.size < 500) {
          queued.add(referencedId);
          // A page tag is a link target, not evidence of a sidebar parent.
          // Only a child_page block from the Block API can assign a parent.
          queue.push({ id: referencedId, parent: item.folder ? item.id : null });
        }
      }
    }
    if (request.includeChildren !== false && !item.folder) await discover(item.id);
  }
  // A reference can be imported before its owning page is scanned. Resolve the
  // final hierarchy after discovery, rather than keeping the earlier copy.
  for (const page of pages) page.parent = queue.find(entry => entry.id === page.id)!.parent;
  const recordTitles = await databaseImport.completeProperties();
  for (const page of pages) if (recordTitles.get(page.id)) page.title = recordTitles.get(page.id)!;
  {
    const titles = new Map(pages.map(page => [page.id, page.title]));
    for (const page of pages) page.source = await enrichNotionBlocks(page.source, {
      normalizeId: notionPageId,
      version: "v2", local: variant === "notdown",
      readChildren,
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
          if (!valid) warnings.add(`Page ${id}: title unavailable; the page link keeps its remote destination.`);
        }
        return titles.get(id)!;
      },
      warn: message => warnings.add(message),
    });
  }
  for (const page of pages) if (Buffer.byteLength(page.source) > 10 * 1024 * 1024)
    throw new VaultError(413, `Page ${page.id} exceeds 10 MB after block restoration.`);
  const media = notionAssets({ signal, read: options.readAsset, remaining: () => MAX_BYTES - bytes, reserve: size => { bytes += size; }, warn: message => warnings.add(message) });
  if (request.downloadAssets !== false) {
    for (const page of pages) {
      page.source = await media.rewrite(page.source);
      if (page.cover) page.cover = await media.save(page.cover);
      if (page.imageIcon) page.imageIcon = await media.save(page.imageIcon);
      if (page.imageIcon?.startsWith("assets/")) page.icon = page.imageIcon;
    }
    await databaseImport.saveAttachments(media.save);
    if (media.assets.length) warnings.add(`${media.assets.length} unique attachment(s), including available covers and custom icons, are ready for the Attachments library.`);
  } else warnings.add("Attachment downloading is disabled; remote attachment URLs can expire.");
  // Content identities include the exact archive snapshot and parent mapping. No
  // user page is ever updated; identical snapshots reuse the existing import batch.
  const id = digest(
    JSON.stringify([
      `notion-markdown-v2-recovery-${variant}`,
      "inline-page-links-v1",
      "database-resources-v2-local-references",
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
  const localByNotion = new Map(pages.map((page) => [page.id.replace(/-/g, "").toLowerCase(), localId(page.id)]));
  const localizePageReferences = (source: string) => {
    for (const reference of blockReferences(source, variant === "notdown", "v2").sort((a, b) => b.from - a.from)) {
      const target = localByNotion.get(reference.id.replace(/-/g, ""));
      // A database reference must resolve to an imported database host. Keep
      // inline, data-source-url, labels and unknown attributes byte-for-byte.
      if (reference.tag === "database" && (!target || !databaseResult.resources.databases[target])) continue;
      if (target) source = source.slice(0, reference.from) + `#page/${encodeURIComponent(target)}` + source.slice(reference.to);
    }
    return localizeInlinePageLinks(source, localByNotion, variant === "notdown", warnings, "v2");
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
  const localizedPages = ordered.map(page => ({ ...page, source: localizePageReferences(page.source) }));
  return {
    id,
    name: pages[0].title,
    assets: media.assets,
    originals,
    errors: [],
    ...(Object.keys(databaseResult.resources.databases).length ? { databaseResources: databaseResult.resources } : {}),
    warnings: [...warnings],
    pages: localizedPages.map((page) => ({
      id: localId(page.id),
      path: `${page.title} (${page.id})`,
      source: page.source,
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
    })),
  };
}
