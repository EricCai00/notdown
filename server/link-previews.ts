import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { VaultError, type createVault } from "./vault";
import {
  httpsUrl,
  linkTarget,
  type LinkPreviewData,
  type LinkTarget,
} from "../src/features/links/link-preview";

type Credentials = { github: string; onedrive: string };
const text = (v: unknown, limit = 500) =>
  typeof v === "string" ? v.slice(0, limit) : "";
export function linkPreviews(
  vault: ReturnType<typeof createVault>,
  request: typeof fetch = fetch,
) {
  const filename = path.join(
    vault.vaultPath,
    ".notdown",
    "link-connections.json",
  );
  let pending = Promise.resolve(),
    generation = 0,
    active = 0;
  const cache = new Map<string, { expires: number; data: LinkPreviewData }>();
  const flights = new Map<string, Promise<LinkPreviewData>>();
  async function read(): Promise<Credentials> {
    try {
      return {
        github: "",
        onedrive: "",
        ...JSON.parse(await fs.readFile(filename, "utf8")),
      };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT")
        return { github: "", onedrive: "" };
      throw e;
    }
  }
  async function settings() {
    const c = await read();
    return { github: !!c.github, onedrive: !!c.onedrive };
  }
  async function configure(input: unknown) {
    const p = z
      .object({
        provider: z.enum(["github", "onedrive"]),
        token: z
          .string()
          .trim()
          .max(16000)
          .regex(/^[^\r\n]*$/)
          .optional(),
        disconnect: z.boolean().optional(),
      })
      .strict()
      .safeParse(input);
    if (!p.success)
      throw new VaultError(400, "Invalid link connection settings");
    const operation = pending.then(async () => {
      const c = await read();
      c[p.data.provider] = p.data.disconnect
        ? ""
        : p.data.token || c[p.data.provider];
      await fs.mkdir(path.dirname(filename), { recursive: true });
      await fs.writeFile(filename + ".tmp", JSON.stringify(c), { mode: 0o600 });
      await fs.rename(filename + ".tmp", filename);
      generation++;
      cache.clear();
      flights.clear();
    });
    pending = operation.catch(() => {});
    await operation;
    return settings();
  }
  async function json(url: string, token: string, preview = false) {
    // Every URL is constructed below, never fetched from user input or an API response.
    if (
      !["api.github.com", "graph.microsoft.com"].includes(new URL(url).hostname)
    )
      throw new VaultError(400, "Unsupported API host");
    try {
      const response = await request(url, {
        redirect: "error",
        signal: AbortSignal.timeout(15000),
        ...(preview ? { method: "POST", body: "{}" } : {}),
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "User-Agent": "Notdown-link-preview",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!response.ok) {
        const message =
          response.status === 401
            ? "Connection expired. Update its token in Settings → Link previews."
            : response.status === 403 || response.status === 429
              ? "Access denied or rate limited. Check permissions or try again later."
              : response.status === 404
                ? "Content not found or this account cannot access it."
                : `Preview service returned HTTP ${response.status}.`;
        throw new VaultError(response.status === 401 ? 401 : 502, message);
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error("empty");
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 2_000_000) {
            await reader.cancel();
            throw new VaultError(502, "Preview exceeds the 2 MB limit.");
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      const result = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (!result || typeof result !== "object") throw new Error("invalid");
      return result;
    } catch (e) {
      if (e instanceof VaultError) throw e;
      throw new VaultError(
        502,
        "Cannot load preview. The service is unavailable or returned invalid content.",
      );
    }
  }
  async function github(
    t: LinkTarget,
    token: string,
  ): Promise<LinkPreviewData> {
    const root = `https://api.github.com/repos/${encodeURIComponent(t.owner!)}/${encodeURIComponent(t.repo!)}`;
    const endpoint =
      t.kind === "code"
        ? `/contents/${t.file!.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(t.ref!)}`
        : t.kind === "pull"
          ? `/pulls/${t.number}`
          : t.kind === "issue"
            ? `/issues/${t.number}`
            : "";
    const d = await json(root + endpoint, token);
    const base: LinkPreviewData = {
      provider: "github",
      url: t.url,
      title: text(d.title || d.name) || t.label,
      kind: t.kind!,
      repository: `${t.owner}/${t.repo}`,
      number: t.number,
      updated: text(d.updated_at),
      author: text(d.user?.login || d.owner?.login),
      avatar: httpsUrl(d.user?.avatar_url || d.owner?.avatar_url),
    };
    if (t.kind === "code") {
      if (
        d.type !== "file" ||
        d.encoding !== "base64" ||
        typeof d.content !== "string"
      )
        throw new VaultError(
          422,
          "This file cannot be previewed. Use a text file permalink (commit or encoded branch name).",
        );
      const raw = Buffer.from(d.content, "base64").toString("utf8");
      if (raw.includes("\0"))
        throw new VaultError(422, "Binary files have no code preview.");
      const lines = raw.split(/\r?\n/),
        start = t.start || 1,
        end = Math.min(t.end || lines.length, start + 199);
      if (start > lines.length)
        throw new VaultError(422, "The requested line no longer exists.");
      const selected = lines.slice(start - 1, end).join("\n");
      return {
        ...base,
        title: t.file!,
        code: selected.slice(0, 40000),
        start,
        truncated: end < (t.end || lines.length) || selected.length > 40000,
        description: t.ref,
      };
    }
    return {
      ...base,
      state: d.merged_at
        ? "Merged"
        : d.draft
          ? "Draft"
          : d.state === "open"
            ? "Open"
            : d.state === "closed"
              ? "Closed"
              : "",
      description: text(d.description || d.body, 1000),
    };
  }
  async function onedrive(
    t: LinkTarget,
    token: string,
  ): Promise<LinkPreviewData> {
    if (!token)
      throw new VaultError(
        401,
        "Connect OneDrive in Settings → Link previews to view this file.",
      );
    const share = "u!" + Buffer.from(t.url).toString("base64url");
    const d = await json(
      `https://graph.microsoft.com/v1.0/shares/${share}/driveItem?$expand=thumbnails`,
      token,
    );
    if (typeof d.name !== "string")
      throw new VaultError(502, "OneDrive returned no file details.");
    return {
      provider: "onedrive",
      url: t.url,
      title: text(d.name),
      kind: d.folder ? "folder" : "file",
      description: text(d.description),
      size: typeof d.size === "number" ? d.size : undefined,
      mime: text(d.file?.mimeType),
      updated: text(d.lastModifiedDateTime),
      image: httpsUrl(
        d.thumbnails?.[0]?.large?.url || d.thumbnails?.[0]?.medium?.url,
      ),
    };
  }
  async function resolve(input: unknown) {
    const p = z
      .object({ url: z.string().max(8192) })
      .strict()
      .safeParse(input);
    const t = p.success && linkTarget(p.data.url);
    if (!t)
      throw new VaultError(
        400,
        "Use a GitHub repository, PR, issue or file link, or a OneDrive / SharePoint sharing link.",
      );
    const hit = cache.get(t.url);
    if (hit && hit.expires > Date.now()) return hit.data;
    const inflight = flights.get(t.url);
    if (inflight) return inflight;
    if (active >= 4)
      throw new VaultError(
        429,
        "Preview requests are busy. Try again shortly.",
      );
    const version = generation;
    active++;
    const operation = (async () => {
      try {
        const c = await read();
        const data = await (t.provider === "github"
          ? github(t, c.github)
          : onedrive(t, c.onedrive));
        if (version !== generation)
          throw new VaultError(
            409,
            "Connection changed. Refresh this preview.",
          );
        if (cache.size >= 100) cache.delete(cache.keys().next().value!);
        cache.set(t.url, { data, expires: Date.now() + 60000 });
        return data;
      } finally {
        active--;
        if (version === generation) flights.delete(t.url);
      }
    })();
    flights.set(t.url, operation);
    return operation;
  }
  async function viewer(input: unknown) {
    const p = z
        .object({ url: z.string().max(8192) })
        .strict()
        .safeParse(input),
      t = p.success && linkTarget(p.data.url);
    if (!t || t.provider !== "onedrive")
      throw new VaultError(400, "Use a OneDrive or SharePoint sharing link.");
    if (active >= 4)
      throw new VaultError(
        429,
        "Preview requests are busy. Try again shortly.",
      );
    const version = generation;
    active++;
    try {
      const c = await read();
      if (!c.onedrive)
        throw new VaultError(
          401,
          "Connect OneDrive in Settings → Link previews.",
        );
      const share = "u!" + Buffer.from(t.url).toString("base64url");
      const item = await json(
        `https://graph.microsoft.com/v1.0/shares/${share}/driveItem`,
        c.onedrive,
      );
      if (
        typeof item.id !== "string" ||
        typeof item.parentReference?.driveId !== "string"
      )
        throw new VaultError(
          422,
          "This item has no embedded viewer. Open the original file.",
        );
      const result = await json(
        `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(item.parentReference.driveId)}/items/${encodeURIComponent(item.id)}/preview`,
        c.onedrive,
        true,
      );
      const url = httpsUrl(result.getUrl);
      if (
        !url ||
        !/(^|\.)(sharepoint\.com|onedrive\.com|officeapps\.live\.com|office\.net)$/.test(
          new URL(url).hostname,
        )
      )
        throw new VaultError(
          422,
          "This file has no supported embedded viewer. Open the original file.",
        );
      if (version !== generation)
        throw new VaultError(409, "Connection changed. Refresh this preview.");
      return { url };
    } finally {
      active--;
    }
  }
  return { settings, configure, resolve, viewer };
}
