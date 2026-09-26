import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { documentMetadata } from "../src/features/metadata/document-metadata.js";
import type { ImportPlan } from "./markdown-import.js";
import { VaultError } from "./vault.js";

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

/** Read-only transport; injected fetch/wait are for deterministic isolated tests. */
export async function prepareNotionImport(
  input: unknown,
  options: {
    signal?: AbortSignal;
    fetch?: typeof fetch;
    wait?: (ms: number, signal: AbortSignal) => Promise<void>;
  } = {},
): Promise<ImportPlan> {
  const request = input as {
    token?: unknown;
    pageId?: unknown;
    includeChildren?: unknown;
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
  }[] = [];
  const warnings = new Set<string>([
    "Links and media URLs are preserved as returned by Notion. Attachments are not downloaded; signed Notion file URLs can expire. This is not an offline attachment backup.",
    "Database records/views, comments, permissions and property semantics are not imported. Page metadata responses are archived. Unsupported blocks retain the API's placeholders; meeting transcripts are not requested.",
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
  async function get(endpoint: string): Promise<Json> {
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
          method: "GET",
          redirect: "error",
          signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
          headers: {
            Authorization: `Bearer ${token}`,
            "Notion-Version": VERSION,
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
  const queue: { id: string; parent: string | null }[] = [
    { id: root, parent: null },
  ];
  const scannedBlocks = new Set<string>();
  async function discover(page: string) {
    const containers = [page];
    for (let index = 0; index < containers.length; index++) {
      const id = containers[index];
      if (scannedBlocks.has(id)) continue;
      scannedBlocks.add(id);
      let cursor: string | null = null;
      const cursors = new Set<string>();
      do {
        const result = await get(
          `/blocks/${id}/children?page_size=100${cursor ? `&start_cursor=${encodeURIComponent(cursor)}` : ""}`,
        );
        if (
          !Array.isArray(result.results) ||
          typeof result.has_more !== "boolean"
        )
          throw new VaultError(502, "Invalid Notion child block response.");
        for (const block of result.results) {
          if (!block || typeof block.id !== "string" || !uuid.test(block.id))
            throw new VaultError(502, "Invalid Notion block ID.");
          const childId = block.id.toLowerCase();
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
            warnings.add(
              `Page ${page}: a child database remains a reference; its records are not imported.`,
            );
          } else if (
            block.has_children === true &&
            block.type !== "synced_block"
          ) {
            containers.push(childId);
          }
        }
        if (!result.has_more) break;
        if (
          typeof result.next_cursor !== "string" ||
          !result.next_cursor ||
          cursors.has(result.next_cursor)
        )
          throw new VaultError(
            502,
            "Notion pagination did not advance; no incomplete import was prepared.",
          );
        cursor = result.next_cursor;
        cursors.add(cursor);
      } while (true);
    }
  }
  for (let index = 0; index < queue.length; index++) {
    const item = queue[index];
    const page = await get(`/pages/${item.id}`);
    if (
      page.object !== "page" ||
      typeof page.id !== "string" ||
      page.id.toLowerCase() !== item.id
    )
      throw new VaultError(502, "Notion did not return the requested page.");
    const response = await get(`/pages/${item.id}/markdown`);
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
    if (response.truncated || response.unknown_block_ids.length)
      throw new VaultError(
        422,
        `Page ${item.id} is truncated or contains inaccessible content. No import was prepared; check sharing or select smaller child pages.`,
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
      title: titleOf(page, "Untitled"),
      icon:
        page.icon?.type === "emoji" &&
        typeof page.icon.emoji === "string" &&
        page.icon.emoji.length <= 100
          ? page.icon.emoji
          : "file-text",
    });
    // Enhanced Markdown may reference ordinary pages with <page> tags even
    // when they are not child_page blocks. Import those references too so the
    // later localization pass has a real local target to point at.
    if (request.includeChildren !== false) {
      const referenced = [...source.matchAll(/<page\b[^>]*\burl\s*=\s*["']([^"']+)["'][^>]*>/gi)];
      for (const match of referenced) {
        const raw = match[1].match(/(?:[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}|[0-9a-f]{32})/i)?.[0];
        if (!raw) continue;
        const compact = raw.replace(/-/g, "").toLowerCase();
        const referencedId = `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
        if (!queued.has(referencedId) && queued.size < 500) {
          queued.add(referencedId);
          // A page tag is a link target, not evidence of a sidebar parent.
          // Only a child_page block from the Block API can assign a parent.
          queue.push({ id: referencedId, parent: null });
        }
      }
    }
    if (request.includeChildren !== false) await discover(item.id);
  }
  // Content identities include the exact archive snapshot and parent mapping. No
  // user page is ever updated; identical snapshots reuse the existing import batch.
  const id = digest(
    JSON.stringify([
      "notion-enhanced-v2-default-icon",
      root,
      request.includeChildren !== false,
      pages.map((p) => [p.id, p.parent]),
      originals.map((f) => [f.path, digest(f.data)]),
    ]),
  );
  const localId = (notionId: string) => `notion-${id.slice(0, 24)}-${notionId}`;
  const localByNotion = new Map(pages.map((page) => [page.id.replace(/-/g, "").toLowerCase(), localId(page.id)]));
  const localizePageReferences = (source: string) => source.replace(
    /<page\b([^>]*\burl\s*=\s*["'])([^"']+)(["'][^>]*)>([\s\S]*?)<\/page>/gi,
    (full, before, url, after, label) => {
      const raw = url.match(/(?:[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}|[0-9a-f]{32})/i)?.[0];
      const target = raw && localByNotion.get(raw.replace(/-/g, "").toLowerCase());
      return target ? `<page${before}#page/${encodeURIComponent(target)}${after}>${label}</page>` : full;
    },
  );
  return {
    id,
    name: pages[0].title,
    assets: [],
    originals,
    errors: [],
    warnings: [...warnings],
    pages: pages.map((page) => ({
      id: localId(page.id),
      path: `${page.title} (${page.id})`,
      source: localizePageReferences(page.source),
      metadata: {
        id: localId(page.id),
        title: page.title,
        parent: page.parent ? localId(page.parent) : null,
        icon: page.icon,
        properties: {},
        bodyFormat: "notion-markdown",
        syntax: { version: 1, variant: "notion-markdown", extensions: {} },
        notionImport: {
          pageId: page.id,
          url: `https://www.notion.so/${page.id.replace(/-/g, "")}`,
          apiVersion: VERSION,
        },
      },
    })),
  };
}
