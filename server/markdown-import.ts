import { createHash } from "node:crypto";
import path from "node:path";
import { Document, isMap, parseDocument } from "yaml";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { gfm } from "micromark-extension-gfm";
import { validSyntax, syntaxFormat, type SyntaxConfig } from "../src/markdown-engine/config.js";
import { VaultError } from "./vault.js";
import { stablePageUuid } from "./page-id.js";
import type { DatabaseResources } from "../src/features/databases/database-model.js";

export type ImportFile = { path: string; data: string };
export type ImportRequest = { files: ImportFile[]; dialect: "gfm" | "obsidian" | "notdown" | "rmarkdown" | "quarto"; name: string };
export type ImportPlan = {
  databaseResources?: DatabaseResources;
  id: string;
  name: string;
  pages: { id: string; path: string; source: string; metadata: Record<string, unknown> }[];
  assets: { filename: string; data: Buffer }[];
  originals: { path: string; data: Buffer }[];
  warnings: string[];
  errors: string[];
};
const digest = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
const maxBytes = 20 * 1024 * 1024;
const frontmatter = /^(?:\uFEFF)?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;
const safeAssetExtension = /\.(png|jpe?g|gif|webp|avif|mp3|ogg|wav|m4a|mp4|webm|pdf|txt|zip)$/i;

export function destinationMarker(raw: string, definition: boolean): number {
  if (definition) {
    // Definition labels may contain escaped brackets and colons.
    for (let i = 1; i < raw.length; i++) {
      if (raw[i] === "\\") { i++; continue; }
      if (raw[i] === "]" && raw[i + 1] === ":") return i + 2;
    }
    return -1;
  }
  let depth = 0;
  for (let i = raw.startsWith("!") ? 1 : 0; i < raw.length; i++) {
    if (raw[i] === "\\") { i++; continue; }
    if (raw[i] === "`") {
      let count = 1; while (raw[i + count] === "`") count++;
      const end = raw.indexOf("`".repeat(count), i + count);
      if (end >= 0) { i = end + count - 1; continue; }
    }
    if (raw[i] === "[") depth++;
    if (raw[i] === "]" && --depth === 0) return raw[i + 1] === "(" ? i + 2 : -1;
  }
  return -1;
}

function safePath(value: unknown): string {
  if (typeof value !== "string" || !value || value.length > 1000 || /[\\\x00-\x1f:]/.test(value) || value.startsWith("/") || value.split("/").some(p => !p || p === "." || p === ".."))
    throw new VaultError(400, "Import paths must be relative paths inside the selected folder");
  return value;
}

/** Only destinations of parsed Markdown links/images/definitions are replaced.
 * Code, HTML and unknown syntax are never globally rewritten. Originals are archived.
 */
function rewriteLinks(body: string, filename: string, targets: Map<string, string>, warnings: Set<string>) {
  const tree = fromMarkdown(body, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] });
  const edits: { start: number; end: number; text: string }[] = [];
  function visit(node: any) {
    if (["link", "image", "definition"].includes(node.type) && typeof node.url === "string") {
      const url = node.url as string;
      if (url && !/^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(url)) {
        const suffixAt = url.search(/[?#]/);
        const sourcePath = suffixAt < 0 ? url : url.slice(0, suffixAt);
        let decoded = sourcePath;
        try { decoded = decodeURIComponent(sourcePath); } catch { /* Keep unresolved reference. */ }
        const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(filename), decoded));
        const target = targets.get(resolved);
        if (target) {
          const start = node.position?.start.offset, end = node.position?.end.offset;
          if (typeof start === "number" && typeof end === "number") {
            const raw = body.slice(start, end);
            // The AST isolates the syntax; locate its destination without reserializing prose.
            const marker = destinationMarker(raw, node.type === "definition");
            if (marker > 0) {
              let offset = marker;
              while (/\s/.test(raw[offset] ?? "") && offset < raw.length) offset++;
              const angle = raw[offset] === "<";
              if (angle) offset++;
              let stop = offset, depth = 0;
              for (; stop < raw.length; stop++) {
                const char = raw[stop];
                if (char === "\\") { stop++; continue; }
                if (angle ? char === ">" : /\s/.test(char) || (char === ")" && depth === 0)) break;
                if (!angle && char === "(") depth++;
                if (!angle && char === ")") depth--;
              }
              const suffix = suffixAt < 0 ? "" : url.slice(suffixAt);
              // Page routes do not yet address heading anchors. Preserve the original in the archive.
              if (target.startsWith("#page/") && suffix) warnings.add(`${filename}: a page anchor/query was omitted (${url}).`);
              edits.push({ start: start + offset, end: start + stop, text: target + (target.startsWith("#page/") ? "" : suffix) });
            } else warnings.add(`${filename}: could not rebase ${url}; original reference retained.`);
          }
        } else warnings.add(`${filename}: unresolved local reference ${url}; original reference retained.`);
      }
    }
    for (const child of node.children ?? []) visit(child);
  }
  visit(tree);
  if (body.includes("[[") || tree.children.some(node => node.type === "html"))
    warnings.add(`${filename}: wiki links and raw HTML are preserved as written; review their local references.`);
  for (const edit of edits.sort((a, b) => b.start - a.start)) body = body.slice(0, edit.start) + edit.text + body.slice(edit.end);
  return body;
}

export function prepareMarkdownImport(input: ImportRequest): ImportPlan {
  if (!input || !["gfm", "obsidian", "notdown", "rmarkdown", "quarto"].includes(input.dialect) || typeof input.name !== "string" || !input.name.trim() || input.name.length > 200 || !Array.isArray(input.files) || !input.files.length || input.files.length > 500)
    throw new VaultError(400, "Select 1–500 files, a folder name and a supported import dialect");
  let bytes = 0;
  const seen = new Set<string>();
  const originals = input.files.map(file => {
    if (!file || typeof file !== "object") throw new VaultError(400, "Invalid import file");
    const filename = safePath(file.path);
    if (seen.has(filename.toLowerCase())) throw new VaultError(400, "Duplicate or case-ambiguous import path");
    seen.add(filename.toLowerCase());
    // A repeated four-character regex group can exhaust V8's stack on valid large attachments.
    if (typeof file.data !== "string" || file.data.length > 28 * 1024 * 1024 || file.data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(file.data))
      throw new VaultError(400, "Invalid import file encoding");
    const data = Buffer.from(file.data, "base64");
    if (data.toString("base64") !== file.data) throw new VaultError(400, "Invalid import file encoding");
    bytes += data.length;
    if (bytes > maxBytes) throw new VaultError(413, "Import exceeds 20 MB; import a smaller folder");
    return { path: filename, data };
  }).sort((a, b) => a.path.localeCompare(b.path));
  const id = digest(JSON.stringify([input.name, input.dialect, originals.map(file => [file.path, digest(file.data)])]));
  const prefix = `import-${id.slice(0, 24)}`;
  const plan: ImportPlan = { id, name: input.name, pages: [], assets: [], originals, warnings: [], errors: [] };
  const warnings = new Set<string>();
  const targets = new Map<string, string>();
  const documents: { path: string; id: string; body: string; prefix: string; metadata: Document }[] = [];
  for (const [index, file] of originals.entries()) {
    if (file.path.split("/").some(part => part.startsWith("."))) { warnings.add(`${file.path}: hidden file skipped.`); continue; }
    if (/\.(?:md|markdown|rmd|qmd)$/i.test(file.path)) {
      try {
        const text = new TextDecoder("utf-8", { fatal: true }).decode(file.data);
        if (file.data.length > 10 * 1024 * 1024) throw new Error("page exceeds 10 MB");
        const match = frontmatter.exec(text);
        if (!match && /^(?:\uFEFF)?---\r?\n/.test(text)) throw new Error("unclosed YAML frontmatter");
        const metadata = match ? parseDocument(match[1], { uniqueKeys: true }) : new Document();
        if (metadata.errors.length || (match && !isMap(metadata.contents))) throw new Error("invalid YAML mapping");
        metadata.toJS({ maxAliasCount: 50 });
        const pageId = stablePageUuid(`${prefix}-${index}`);
        documents.push({ path: file.path, id: pageId, body: match ? text.slice(match[0].length) : text, prefix: match?.[0] ?? "", metadata });
        targets.set(file.path, `#page/${pageId}`);
      } catch (error) { plan.errors.push(`${file.path}: ${error instanceof Error ? error.message : error}`); }
    } else {
      const extension = safeAssetExtension.exec(file.path)?.[0].toLowerCase() ?? ".bin";
      const filename = `${prefix}-${index}${extension}`;
      plan.assets.push({ filename, data: file.data });
      targets.set(file.path, `assets/${filename}`);
    }
  }
  if (!documents.length) throw new VaultError(400, "No readable Markdown pages found", { errors: plan.errors });
  const folderIds = new Map<string, string>([["", stablePageUuid(`${prefix}-root`)]]);
  for (const document of documents) {
    let folder = path.posix.dirname(document.path);
    while (folder !== "." && folder !== "") {
      if (!folderIds.has(folder)) folderIds.set(folder, stablePageUuid(`${prefix}-folder-${folderIds.size}`));
      folder = path.posix.dirname(folder);
    }
  }
  const syntax: SyntaxConfig = { version: 1, variant: input.dialect, extensions: {} };
  for (const [folder, folderId] of [...folderIds].sort((a, b) => a[0].split("/").length - b[0].split("/").length || a[0].localeCompare(b[0]))) {
    const parent = folder ? folderIds.get(path.posix.dirname(folder) === "." ? "" : path.posix.dirname(folder))! : null;
    const metadata = new Document({ id: folderId, title: folder ? path.posix.basename(folder) : input.name, parent, icon: "📁", properties: {}, bodyFormat: syntaxFormat(syntax), syntax });
    plan.pages.push({ id: folderId, path: folder || "(import root)", source: "", metadata: metadata.toJS() });
  }
  for (const file of documents) {
    const metadata = file.metadata;
    const oldTitle = metadata.get("title");
    const title = typeof oldTitle === "string" && oldTitle.trim() && oldTitle.length <= 500 ? oldTitle : path.posix.basename(file.path).replace(/\.(md|markdown|rmd|qmd)$/i, "").slice(0, 500);
    const originalSyntax = metadata.toJS({ maxAliasCount: 50 })?.syntax;
    const selectedSyntax = validSyntax(originalSyntax) ? originalSyntax : /\.qmd$/i.test(file.path) ? { ...syntax, variant: "quarto" as const } : /\.rmd$/i.test(file.path) ? { ...syntax, variant: "rmarkdown" as const } : syntax;
    metadata.set("id", file.id);
    metadata.set("title", title);
    metadata.set("parent", folderIds.get(path.posix.dirname(file.path) === "." ? "" : path.posix.dirname(file.path)));
    if (typeof metadata.get("icon") !== "string" || String(metadata.get("icon")).length > 100) metadata.set("icon", "📄");
    if (!isMap(metadata.get("properties", true))) metadata.set("properties", {});
    metadata.set("bodyFormat", syntaxFormat(selectedSyntax));
    metadata.set("syntax", selectedSyntax);
    // Imported copies start live and unordered; original managed fields remain in the archive.
    for (const key of ["favorite", "trashed", "sidebarOrder", "updated"]) metadata.delete(key);
    const body = rewriteLinks(file.body, file.path, targets, warnings);
    plan.pages.push({ id: file.id, path: file.path, source: file.prefix + body, metadata: metadata.toJS() });
  }
  plan.warnings = [...warnings];
  return plan;
}

export function importSummary(plan: ImportPlan) {
  return { id: plan.id, name: plan.name, files: plan.pages.map(p => ({ path: p.path, id: p.id })), pages: plan.pages.length, attachments: plan.assets.length, warnings: plan.warnings, errors: plan.errors };
}
