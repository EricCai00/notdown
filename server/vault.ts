import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { documentMetadata } from "../src/features/metadata/document-metadata.js";
import { replaceFile } from "./file-replace.js";
import { trashedPageIds } from "../src/features/pages/page-hierarchy.js";
import { recycleFile } from "./recycle-file.js";
import { createPeople } from "./people.js";
import type { ImportPlan } from "./markdown-import.js";
import { comparePageOrder, orderBetween, pageOrderKey, type PageMoveInput } from "../src/features/pages/page-order.js";
import type { BodyFormat } from "../src/document/notion-syntax.js";
import {
  validSyntax,
  syntaxFormat,
  type SyntaxConfig,
} from "../src/markdown-engine/config.js";

export type Page = {
  id: string;
  title: string;
  parent: string | null;
  icon: string;
  properties: Record<string, unknown>;
  body: string;
  bodyFormat?: BodyFormat;
  syntax?: SyntaxConfig;
  revision: string;
  updated: string;
  favorite?: boolean;
  trashed?: boolean;
  sidebarOrder?: string;
};
export type PageInput = Partial<
  Pick<Page, "title" | "parent" | "icon" | "properties" | "body" | "bodyFormat" | "favorite" | "trashed" | "sidebarOrder">
> & { syntax?: SyntaxConfig | null };
export type Conflict = {
  id: string;
  conflictId: string;
  pageId: string;
  createdAt: string;
  baseRevision: string;
  currentRevision: string;
  current: Page;
  proposed: Page;
};
type StoredPage = {
  page: Page;
  source: string;
  filePath: string;
  metadata: Record<string, unknown>;
};
export type LegacyMetadataMigrationPlan = {
  pages: { id: string; file: string; baseRevision: string }[];
};

export class VaultError extends Error {
  constructor(
    public status: number,
    message: string,
    public details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

const validId = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;
const hash = (source: string) =>
  createHash("sha256").update(source).digest("hex");
const own = (object: object, key: string) =>
  Object.prototype.hasOwnProperty.call(object, key);

export function assertId(id: unknown): asserts id is string {
  if (typeof id !== "string" || !validId.test(id))
    throw new VaultError(400, "Invalid page ID");
}

function checkInput(input: PageInput) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new VaultError(400, "A page object is required");
  for (const key of ["favorite", "trashed"] as const) {
    if (own(input, key) && typeof input[key] !== "boolean")
      throw new VaultError(400, `${key} must be a boolean`);
  }
  if (own(input, "sidebarOrder") && (typeof input.sidebarOrder !== "string" || !/^[0-9]{1,4096}$/.test(input.sidebarOrder)))
    throw new VaultError(400, "Invalid sidebar order");
  if (
    own(input, "title") &&
    (typeof input.title !== "string" ||
      !input.title.trim() ||
      input.title.length > 500)
  ) {
    throw new VaultError(400, "Title must not be empty or exceed 500 characters");
  }
  if (own(input, "parent") && input.parent !== null) assertId(input.parent);
  if (
    own(input, "icon") &&
    (typeof input.icon !== "string" || input.icon.length > 100)
  )
    throw new VaultError(400, "Invalid icon");
  if (own(input, "body") && typeof input.body !== "string")
    throw new VaultError(400, "Content must be a Markdown string");
  if (
    own(input, "syntax") &&
    input.syntax !== null &&
    !validSyntax(input.syntax)
  )
    throw new VaultError(400, "Invalid Markdown dialect configuration");
  if (
    input.syntax &&
    input.bodyFormat &&
    syntaxFormat(input.syntax) !== input.bodyFormat
  )
    throw new VaultError(400, "Dialect does not match bodyFormat");
  if (
    own(input, "bodyFormat") &&
    !["markdown", "notion-markdown"].includes(input.bodyFormat!)
  )
    throw new VaultError(400, "Unsupported body format");
  if (own(input, "body") && Buffer.byteLength(input.body!) > 10 * 1024 * 1024)
    throw new VaultError(413, "Page exceeds 10 MB");
  if (
    own(input, "properties") &&
    (!input.properties ||
      typeof input.properties !== "object" ||
      Array.isArray(input.properties))
  ) {
    throw new VaultError(400, "properties must be an object");
  }
}

function decode(source: string, filePath: string, defaults: Record<string, unknown> = {}): StoredPage {
  let overlay: Record<string, unknown>;
  try {
    const parsed = documentMetadata(source);
    overlay = parsed.values;
    if (parsed.form === "pandoc" && typeof overlay.title === "string" && !overlay.title.trim()) delete overlay.title;
  }
  catch { throw new VaultError(422, `Invalid YAML metadata in file: ${path.basename(filePath)}`); }
  const stem = path.basename(filePath, path.extname(filePath));
  const fallbackId = validId.test(stem) ? stem : `page-${hash(stem).slice(0, 32)}`;
  const id = defaults.id ?? overlay.id ?? fallbackId;
  const metadata: Record<string, unknown> = { title: stem, parent: null, icon: "\u{1F4C4}", properties: {}, bodyFormat: "markdown", updated: "", ...defaults, ...overlay, id };
  const known = new Set(["id", "title", "parent", "icon", "properties", "bodyFormat", "syntax", "updated", "favorite", "trashed", "sidebarOrder"]);
  const extra = Object.fromEntries(Object.entries(overlay).filter(([key]) => !known.has(key)));
  const properties = { ...(defaults.properties as object ?? {}), ...extra, ...(overlay.properties as object ?? {}) };
  const { title, parent, icon, updated, bodyFormat, syntax, favorite, trashed, sidebarOrder } = metadata;
  try {
    checkInput(defaults as PageInput);
    assertId(id);
    checkInput({ title, parent, icon, properties, bodyFormat,
      ...(favorite === undefined ? {} : { favorite }), ...(trashed === undefined ? {} : { trashed }),
      ...(sidebarOrder === undefined ? {} : { sidebarOrder }), ...(syntax === undefined ? {} : { syntax }),
    } as PageInput);
    if (typeof updated !== "string") throw new Error("updated");
    if (overlay.properties !== undefined && (!overlay.properties || typeof overlay.properties !== "object" || Array.isArray(overlay.properties))) throw new Error("properties");
  } catch { throw new VaultError(422, `Invalid page metadata in file: ${path.basename(filePath)}`); }
  return {
    source, filePath, metadata: defaults,
    page: {
      id: id as string, title: title as string, parent: parent as string | null,
      icon: icon as string, properties, updated: updated as string, body: source,
      bodyFormat: bodyFormat as BodyFormat,
      ...(syntax === undefined ? {} : { syntax: syntax as SyntaxConfig }),
      revision: hash(JSON.stringify([source, defaults])),
      ...(favorite === undefined ? {} : { favorite: favorite as boolean }),
      ...(trashed === undefined ? {} : { trashed: trashed as boolean }),
      ...(sidebarOrder === undefined ? {} : { sidebarOrder: sidebarOrder as string }),
    },
  };
}

function encode(
  previous: StoredPage | undefined,
  id: string,
  input: PageInput,
): { source: string; metadata: Record<string, unknown> } {
  if (
    previous &&
    own(input, "bodyFormat") &&
    input.bodyFormat !== previous.page.bodyFormat &&
    !own(input, "body")
  )
    throw new VaultError(400, "Changing body format requires the complete converted content");
  const metadata: Record<string, unknown> = previous
    ? { title: path.basename(previous.filePath, ".md"), parent: null, icon: "\u{1F4C4}",
        properties: {}, bodyFormat: "markdown", ...previous.metadata, id }
    : { id };
  const set = (key: string, value: unknown) => { metadata[key] = value; };
  let overlay: Record<string, unknown>;
  try { overlay = documentMetadata(input.body ?? previous?.source ?? "").values; }
  catch { throw new VaultError(422, "Invalid YAML metadata; the original file was preserved"); }
  const overlayProperties = { ...Object.fromEntries(Object.entries(overlay).filter(([key]) =>
    !["id", "title", "parent", "icon", "properties", "bodyFormat", "syntax", "updated", "favorite", "trashed", "sidebarOrder"].includes(key))),
    ...(overlay.properties as object ?? {}) } as Record<string, unknown>;
  const unchangedOverride = (key: string, value: unknown) => own(overlay, key) && JSON.stringify(overlay[key]) === JSON.stringify(value);
  if (
    previous &&
    own(input, "syntax") &&
    JSON.stringify(input.syntax) !== JSON.stringify(previous.page.syntax) &&
    !own(input, "body")
  )
    throw new VaultError(400, "Changing dialect or extensions requires the complete content");
  if (
    previous?.page.syntax &&
    own(input, "bodyFormat") &&
    !own(input, "syntax") &&
    input.bodyFormat !== syntaxFormat(previous.page.syntax)
  )
    throw new VaultError(400, "Changing format requires updating the dialect configuration");
  if (!previous) {
    set("id", id);
    set("title", input.title ?? "Untitled page");
    set("parent", input.parent ?? null);
    set("icon", input.icon ?? "📄");
    set("properties", input.properties ?? {});
    set("bodyFormat", input.bodyFormat ?? "notion-markdown");
  } else {
    for (const key of [
      "title",
      "parent",
      "icon",
      "properties",
      "bodyFormat",
    ] as const) {
      if (key === "properties" && input.properties) {
        const properties = { ...(metadata.properties as Record<string, unknown>) };
        for (const name of new Set([...Object.keys(previous.page.properties), ...Object.keys(input.properties)])) {
          if (own(overlayProperties, name) && JSON.stringify(overlayProperties[name]) === JSON.stringify(input.properties[name])) continue;
          if (JSON.stringify(input.properties[name]) === JSON.stringify(previous.page.properties[name])) continue;
          if (own(input.properties, name)) properties[name] = input.properties[name];
          else delete properties[name];
        }
        set(key, properties);
      } else if (own(input, key) && !unchangedOverride(key, input[key]) && JSON.stringify(input[key]) !== JSON.stringify(previous.page[key])) set(key, input[key]);
    }
  }
  set("updated", new Date().toISOString());
  if (own(input, "sidebarOrder") && !unchangedOverride("sidebarOrder", input.sidebarOrder) && input.sidebarOrder !== previous?.page.sidebarOrder) set("sidebarOrder", input.sidebarOrder);
  for (const key of ["favorite", "trashed"] as const) {
    if (own(input, key) && (!previous || (!unchangedOverride(key, input[key]) && JSON.stringify(input[key]) !== JSON.stringify(previous.page[key])))) set(key, input[key]);
  }
  if (input.syntax && (!previous || (!unchangedOverride("syntax", input.syntax) && JSON.stringify(input.syntax) !== JSON.stringify(previous.page.syntax)))) {
    set("syntax", input.syntax);
    set("bodyFormat", syntaxFormat(input.syntax));
  } else if (input.syntax === null) delete metadata.syntax;
  return { source: input.body ?? previous?.source ?? "", metadata };
}

const vaultQueues = new Map<string, Promise<unknown>>();
type MetadataFile = { version: 1; pages: Record<string, Record<string, unknown>>; [key: string]: unknown };

/** Each mutation is serialized; Markdown files are re-read for every operation. */
export function createVault(vaultPath: string, options: { recycleFile?: (filename: string) => Promise<void> } = {}) {
  const root = path.resolve(vaultPath);
  const pagesPath = path.join(root, "pages");
  const historyPath = path.join(root, ".history");
  const conflictsPath = path.join(historyPath, "conflicts");
  const assetsPath = path.join(root, "assets");
  const metadataPath = path.join(root, "metadata.json");
  let initialized: Promise<void> | undefined;

  async function safeDirectory(directory: string) {
    try {
      const stat = await fs.lstat(directory);
      if (stat.isSymbolicLink() || !stat.isDirectory())
        throw new VaultError(422, "Vault directory cannot be a symbolic link or regular file");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await fs.mkdir(directory);
    }
  }
  async function init() {
    initialized ??= (async () => {
      // The selected vault path itself must be real; no links in managed child directories.
      await fs.mkdir(path.dirname(root), { recursive: true });
      await safeDirectory(root);
      await safeDirectory(pagesPath);
      await safeDirectory(historyPath);
      await safeDirectory(conflictsPath);
      await safeDirectory(assetsPath);
    })();
    await initialized;
  }
  function serialize<T>(operation: () => Promise<T>): Promise<T> {
    const locked = async () => {
      await init();
      await safeDirectory(historyPath);
      const lockPath = path.join(historyPath, "vault.lock");
      const token = JSON.stringify({ pid: process.pid, token: randomUUID() });
      for (let attempt = 0; ; attempt++) {
        try {
          await fs.writeFile(lockPath, token, { flag: "wx", mode: 0o600 });
          break;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
          const owner = await readOptional(lockPath);
          if (owner) {
            try {
              const pid = JSON.parse(owner).pid;
              if (Number.isInteger(pid) && pid > 0) {
                try { process.kill(pid, 0); }
                catch (error) {
                  if ((error as NodeJS.ErrnoException).code === "ESRCH" && await readOptional(lockPath) === owner) {
                    await fs.rm(lockPath, { force: true });
                    continue;
                  }
                }
              }
            } catch { /* A writer may still be filling a newly acquired lock. */ }
          }
          if (attempt >= 100) throw new VaultError(503, "The vault is busy in another process. Your draft has not been written.");
          await delay(50);
        }
      }
      try { return await operation(); }
      finally { if (await readOptional(lockPath) === token) await fs.rm(lockPath); }
    };
    const next = (vaultQueues.get(root) ?? Promise.resolve()).then(locked, locked);
    const tail = next.catch(() => undefined);
    vaultQueues.set(root, tail);
    void tail.then(() => { if (vaultQueues.get(root) === tail) vaultQueues.delete(root); });
    return next;
  }
  async function readMetadata(): Promise<MetadataFile> {
    try {
      const stat = await fs.lstat(metadataPath);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("file");
      const value = JSON.parse(await fs.readFile(metadataPath, "utf8"));
      if (value?.version !== 1 || !value.pages || typeof value.pages !== "object" || Array.isArray(value.pages) ||
          Object.values(value.pages).some(entry => !entry || typeof entry !== "object" || Array.isArray(entry))) throw new Error("schema");
      return value;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, pages: {} };
      throw new VaultError(422, "Invalid vault metadata.json; original file was preserved");
    }
  }
  function entryMetadata(entry: Record<string, unknown>) {
    const { file: _file, sourceHash: _hash, ...metadata } = entry;
    return metadata;
  }
  async function readOptional(filename: string): Promise<string | null> {
    try {
      const stat = await fs.lstat(filename);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new VaultError(422, "Invalid storage file");
      return await fs.readFile(filename, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }
  async function recoverPending() {
    for (const entry of await fs.readdir(historyPath, { withFileTypes: true })) {
      if (!/^pending-[a-zA-Z0-9_-]+\.json$/.test(entry.name)) continue;
      const journalPath = path.join(historyPath, entry.name);
      const journal = JSON.parse((await readOptional(journalPath))!);
      if (typeof journal.file !== "string" || path.basename(journal.file) !== journal.file || !journal.file.endsWith(".md") ||
          typeof journal.source !== "string" || typeof journal.after !== "string" ||
          !(journal.before === null || typeof journal.before === "string") ||
          !(journal.previousSource === null || typeof journal.previousSource === "string"))
        throw new VaultError(422, "Invalid pending vault transaction; recovery file preserved");
      const filename = path.join(pagesPath, journal.file);
      const source = await readOptional(filename), metadata = await readOptional(metadataPath);
      if ((source !== journal.previousSource && source !== journal.source) || (metadata !== journal.before && metadata !== journal.after))
        throw new VaultError(503, `An interrupted save conflicts with external changes. Both versions are preserved in ${journalPath}`);
      if (source !== journal.source) await atomicWrite(filename, journal.source, source);
      if (metadata !== journal.after) await atomicWrite(metadataPath, journal.after, metadata);
      await fs.rm(journalPath);
    }
  }
  async function persist(filePath: string, encoded: ReturnType<typeof encode>, current?: StoredPage) {
    const before = await readOptional(metadataPath);
    const index = await readMetadata();
    const id = String(encoded.metadata.id);
    const previousSource = await readOptional(filePath);
    if (current) {
      const latest = decode(previousSource ?? "", filePath, index.pages[id] ? entryMetadata(index.pages[id]) : {});
      if (previousSource === null || latest.page.revision !== current.page.revision)
        return registerConflict(latest, { ...encoded.metadata, body: encoded.source } as PageInput, current.page.revision);
    }
    index.pages[id] = { ...encoded.metadata, file: path.basename(filePath), sourceHash: hash(encoded.source) };
    const after = JSON.stringify(index, null, 2) + "\n";
    // Preserve both halves before touching either canonical file.
    const recovery = path.join(historyPath, `pending-${id}.json`);
    await atomicWrite(recovery, JSON.stringify({ file: path.basename(filePath), previousSource, before, after, ...encoded }, null, 2));
    if (previousSource !== encoded.source) await atomicWrite(filePath, encoded.source, previousSource);
    await atomicWrite(metadataPath, after, before);
    await fs.rm(recovery);
  }
  async function scan(): Promise<Map<string, StoredPage>> {
    await init();
    await safeDirectory(root);
    await safeDirectory(pagesPath);
    await safeDirectory(historyPath);
    await safeDirectory(conflictsPath);
    await safeDirectory(assetsPath);
    await recoverPending();
    const index = await readMetadata();
    const result = new Map<string, StoredPage>();
    const entries = await fs.readdir(pagesPath, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (
        !entry.isFile() ||
        entry.isSymbolicLink() ||
        !entry.name.toLowerCase().endsWith(".md")
      )
        continue;
      const filePath = path.join(pagesPath, entry.name);
      const stat = await fs.lstat(filePath);
      if (!stat.isFile() || stat.isSymbolicLink()) continue;
      const source = await fs.readFile(filePath, "utf8");
      let metadataEntry = Object.entries(index.pages).find(([, value]) => value.file === entry.name);
      // An unambiguous byte-identical rename keeps its stable identity.
      if (!metadataEntry) {
        const candidates = Object.entries(index.pages).filter(([, value]) => value.sourceHash === hash(source) && !entries.some(file => file.name === value.file));
        if (candidates.length === 1) metadataEntry = candidates[0];
      }
      const stored = decode(source, filePath, metadataEntry ? { ...entryMetadata(metadataEntry[1]), id: metadataEntry[0] } : {});
      if (result.has(stored.page.id))
        throw new VaultError(422, `Duplicate page ID: ${stored.page.id}`);
      result.set(stored.page.id, stored);
    }
    return result;
  }
  async function atomicWrite(filePath: string, data: string | Buffer, expected?: string | null) {
    await safeDirectory(path.dirname(filePath));
    let previous: Buffer | null = null;
    try {
      const stat = await fs.lstat(filePath);
      if (stat.isSymbolicLink() || !stat.isFile())
        throw new VaultError(422, "Cannot write to a symbolic link or directory");
      previous = await fs.readFile(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (expected !== undefined && (previous === null ? null : previous.toString("utf8")) !== expected)
      throw new VaultError(503, "Storage changed during save. The pending transaction preserves your version; no forced retry was performed.");
    const temporary = path.join(
      path.dirname(filePath),
      `.${path.basename(filePath)}.${randomUUID()}.tmp`,
    );
    try {
      const handle = await fs.open(temporary, "wx", 0o600);
      try {
        await handle.writeFile(data);
        await handle.sync();
      } finally {
        await handle.close();
      }
      if ((await readOptional(filePath)) !== (previous === null ? null : previous.toString("utf8")))
        throw new VaultError(503, "Storage changed during save; your pending version was preserved.");
      await replaceFile(temporary, filePath, previous);
    } finally {
      await fs.rm(temporary, { force: true });
    }
  }
  function checkParent(
    id: string,
    parent: string | null | undefined,
    pages: Map<string, StoredPage>,
  ) {
    if (parent == null) return;
    assertId(parent);
    const visited = new Set([id]);
    let cursor: string | null = parent;
    while (cursor) {
      if (visited.has(cursor))
        throw new VaultError(400, "Page hierarchy cannot contain cycles");
      visited.add(cursor);
      const found = pages.get(cursor);
      if (!found) throw new VaultError(400, `Parent page not found: ${cursor}`);
      if (found.page.trashed) throw new VaultError(400, "Restore the parent page from Trash first");
      cursor = found.page.parent;
    }
  }
  async function snapshot(stored: StoredPage) {
    const directory = path.join(historyPath, stored.page.id);
    await safeDirectory(directory);
    const file = path.join(directory, `${stored.page.revision}.md`);
    await atomicWrite(path.join(directory, `${stored.page.revision}.json`), JSON.stringify(stored.metadata, null, 2));
    try {
      await fs.writeFile(file, stored.source, { flag: "wx", mode: 0o600 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }
  async function registerConflict(
    current: StoredPage,
    input: PageInput,
    baseRevision: string,
  ): Promise<never> {
    const conflictId = randomUUID();
    const encoded = encode(current, current.page.id, input);
    const proposed = decode(encoded.source, current.filePath, encoded.metadata).page;
    const record = {
      metadata: encoded.metadata,
      id: conflictId,
      conflictId,
      pageId: current.page.id,
      createdAt: new Date().toISOString(),
      baseRevision,
      currentRevision: current.page.revision,
    };
    await snapshot(current);
    await atomicWrite(path.join(conflictsPath, `${conflictId}.md`), encoded.source);
    await atomicWrite(
      path.join(conflictsPath, `${conflictId}.json`),
      JSON.stringify(record, null, 2),
    );
    throw new VaultError(
      409,
      "Another window, device, or external editor modified this page. Your version has been preserved.",
      {
        conflictId,
        current: current.page,
        proposed,
      },
    );
  }
  async function updateLocked(
    id: string,
    input: PageInput,
    baseRevision: string,
  ): Promise<Page> {
    assertId(id);
    checkInput(input);
    if (
      typeof baseRevision !== "string" ||
      !/^[a-f0-9]{64}$/.test(baseRevision)
    )
      throw new VaultError(400, "Saving requires a valid baseRevision");
    const pages = await scan();
    const current = pages.get(id);
    if (!current) throw new VaultError(404, "Page not found");
    if (current.page.revision !== baseRevision)
      return registerConflict(current, input, baseRevision);
    if (!current.page.trashed || input.trashed === false || own(input, "parent")) checkParent(
      id,
      own(input, "parent") ? input.parent : current.page.parent,
      pages,
    );
    const encoded = encode(current, id, input);
    await snapshot(current);
    // Re-check after preparing the history snapshot to observe external writers.
    const latestStat = await fs.lstat(current.filePath);
    if (latestStat.isSymbolicLink())
      throw new VaultError(422, "Cannot write to a symbolic link");
    const latest = (await scan()).get(id);
    if (!latest) throw new VaultError(409, "Page was removed externally");
    if (latest.page.revision !== baseRevision)
      return registerConflict(latest, input, baseRevision);
    const proposed = decode(encoded.source, current.filePath, encoded.metadata);
    if (!proposed.page.trashed) checkParent(id, proposed.page.parent, pages);
    await persist(current.filePath, encoded, current);
    return proposed.page;
  }
  async function conflictRecord(id: string): Promise<Conflict> {
    assertId(id);
    await init();
    await safeDirectory(conflictsPath);
    const metadataFile = path.join(conflictsPath, `${id}.json`);
    const proposedFile = path.join(conflictsPath, `${id}.md`);
    try {
      const stats = await Promise.all([
        fs.lstat(metadataFile),
        fs.lstat(proposedFile),
      ]);
      if (stats.some((s) => s.isSymbolicLink() || !s.isFile()))
        throw new VaultError(422, "Invalid conflict file");
      const record = JSON.parse(await fs.readFile(metadataFile, "utf8"));
      assertId(record.pageId);
      if (record.conflictId !== id) throw new VaultError(422, "Conflict record does not match");
      const pages = await scan();
      const current = pages.get(record.pageId);
      if (!current) throw new VaultError(404, "The page for this conflict no longer exists");
      const proposed = decode(
        await fs.readFile(proposedFile, "utf8"),
        proposedFile,
        record.metadata ?? {},
      ).page;
      if (proposed.id !== record.pageId)
        throw new VaultError(422, "Conflict page ID does not match");
      return { ...record, current: current.page, proposed };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        throw new VaultError(404, "Conflict not found or already resolved");
      throw error;
    }
  }

  function legacyMetadataPlan(pages: Map<string, StoredPage>) {
    const candidates: { current: StoredPage; source: string; metadata: Record<string, unknown> }[] = [];
    for (const current of pages.values()) {
      if ((current.metadata.legacyYamlMigration as { version?: number } | undefined)?.version === 1) continue;
      const match = /^(?:\uFEFF)?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(current.source);
      if (!match) continue;
      const fields = documentMetadata(match[0]).values;
      // Historical application headers always had this identity and page-field set.
      // A document's ordinary YAML title/author block is not an application header.
      if (fields.id !== current.page.id || !["title", "parent", "icon", "properties"].every(key => own(fields, key)) ||
          (!own(fields, "updated") && !own(fields, "bodyFormat"))) continue;
      const source = current.source.slice(match[0].length);
      const metadata = {
        ...current.metadata, ...fields, id: current.page.id,
        properties: { ...(current.metadata.properties as object ?? {}), ...(fields.properties as object ?? {}) },
        legacyYamlMigration: { version: 1, sourceRevision: current.page.revision },
      };
      // Validate every result before changing any canonical file. In-document
      // YAML/Pandoc that was behind the application header now supplies overrides.
      decode(source, current.filePath, metadata);
      JSON.stringify(metadata);
      candidates.push({ current, source, metadata });
    }
    return candidates;
  }

  return {
    vaultPath: root,
    assetsPath,
    people: createPeople({ root, init, safeDirectory, atomicWrite, serialize }),
    init,
    planLegacyMetadataMigration(): Promise<LegacyMetadataMigrationPlan> {
      return serialize(async () => ({ pages: legacyMetadataPlan(await scan()).map(({ current }) => ({
        id: current.page.id, file: path.basename(current.filePath), baseRevision: current.page.revision,
      })) }));
    },
    migrateLegacyMetadata(plan: LegacyMetadataMigrationPlan): Promise<{ migrated: number; backupPath: string | null }> {
      return serialize(async () => {
        if (!plan || !Array.isArray(plan.pages) || plan.pages.some(page => !page || typeof page.baseRevision !== "string" || !/^[a-f0-9]{64}$/.test(page.baseRevision)))
          throw new VaultError(400, "Migration requires a reviewed page revision plan");
        const candidates = legacyMetadataPlan(await scan());
        if (candidates.length !== plan.pages.length || new Set(plan.pages.map(page => page.id)).size !== plan.pages.length || candidates.some(({ current }) => {
          const expected = plan.pages.find(page => page.id === current.page.id);
          return !expected || expected.file !== path.basename(current.filePath) || expected.baseRevision !== current.page.revision;
        })) throw new VaultError(409, "The vault changed after migration planning. No page was migrated; review a fresh plan.");
        if (!candidates.length) return { migrated: 0, backupPath: null };
        const archiveRoot = path.join(historyPath, "migrations");
        await safeDirectory(archiveRoot);
        const backupPath = path.join(archiveRoot, `yaml-to-json-${randomUUID()}`);
        await safeDirectory(backupPath);
        const originalMetadata = await readOptional(metadataPath);
        if (originalMetadata !== null) await atomicWrite(path.join(backupPath, "metadata.before.json"), originalMetadata);
        const manifest = {
          version: 1, completed: false, createdAt: new Date().toISOString(), hadMetadataFile: originalMetadata !== null,
          pages: candidates.map(({ current, source, metadata }) => ({
            id: current.page.id, file: path.basename(current.filePath), baseRevision: current.page.revision,
            originalHash: hash(current.source), bodyHash: hash(source), metadata,
          })),
        };
        // Archive every original (including YAML comments) before removing any header.
        for (const { current } of candidates) {
          await atomicWrite(path.join(backupPath, path.basename(current.filePath)), current.source);
          await snapshot(current);
        }
        await atomicWrite(path.join(backupPath, "manifest.json"), JSON.stringify(manifest, null, 2));
        const latest = await scan();
        if (candidates.some(({ current }) => latest.get(current.page.id)?.page.revision !== current.page.revision))
          throw new VaultError(409, "A page changed while preparing migration backups. No page was migrated.", { backupPath });
        let migrated = 0;
        try {
          for (const { current, source, metadata } of candidates) {
            await persist(current.filePath, { source, metadata }, current);
            migrated++;
          }
          await atomicWrite(path.join(backupPath, "manifest.json"), JSON.stringify({ ...manifest, completed: true }, null, 2));
        } catch (error) {
          throw new VaultError(error instanceof VaultError ? error.status : 503,
            "Migration stopped. Original files and metadata are backed up; completed pages are marked and will not be migrated twice.",
            { migrated, backupPath, cause: error instanceof Error ? error.message : String(error) });
        }
        return { migrated, backupPath };
      });
    },
    importBatch(plan: ImportPlan): Promise<{ id: string; pageIds: string[]; alreadyImported: boolean }> {
      return serialize(async () => {
        await init();
        if (!/^[a-f0-9]{64}$/.test(plan.id)) throw new VaultError(400, "Invalid import identity");
        const archiveRoot = path.join(historyPath, "imports");
        await safeDirectory(archiveRoot);
        const archive = path.join(archiveRoot, plan.id);
        await safeDirectory(archive);
        const manifestPath = path.join(archive, "manifest.json");
        try {
          const stat = await fs.lstat(manifestPath);
          if (!stat.isFile() || stat.isSymbolicLink()) throw new VaultError(422, "Invalid import manifest");
          const previous = JSON.parse(await fs.readFile(manifestPath, "utf8"));
          if (previous.completed === true && previous.id === plan.id)
            return { id: plan.id, pageIds: previous.pageIds, alreadyImported: true };
        } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
        const pages = await scan();
        for (const item of plan.pages) {
          assertId(item.id);
          const decoded = decode(item.source, `${item.id}.md`, item.metadata);
          if (decoded.page.id !== item.id) throw new VaultError(400, "Import identity mismatch");
          const existing = pages.get(item.id);
          if (existing && existing.source !== item.source) throw new VaultError(409, "An imported page has changed. It will not be overwritten.");
          checkParent(item.id, decoded.page.parent, pages);
          pages.set(item.id, decoded);
        }
        const writeNew = async (filename: string, data: Buffer | string) => {
          const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data);
          try {
            const stat = await fs.lstat(filename);
            if (!stat.isFile() || stat.isSymbolicLink() || !(await fs.readFile(filename)).equals(bytes))
              throw new VaultError(409, "Import destination already exists with different content");
            return;
          } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
          const temporary = path.join(path.dirname(filename), `.${randomUUID()}.tmp`);
          try {
            const handle = await fs.open(temporary, "wx", 0o600);
            try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
            // Atomically publish a complete new file, never replace an existing target.
            await fs.link(temporary, filename);
          } finally { await fs.rm(temporary, { force: true }); }
        };
        const manifest = { id: plan.id, name: plan.name, completed: false, pageIds: plan.pages.map(p => p.id), originals: plan.originals.map((file, index) => ({ path: file.path, archive: `${index}.source` })), warnings: plan.warnings, errors: plan.errors };
        await atomicWrite(manifestPath, JSON.stringify(manifest, null, 2));
        try {
          for (const [index, file] of plan.originals.entries()) await writeNew(path.join(archive, `${index}.source`), file.data);
          for (const asset of plan.assets) {
            if (!/^[a-zA-Z0-9_-]+\.[a-z0-9]+$/.test(asset.filename)) throw new VaultError(400, "Invalid imported attachment name");
            await writeNew(path.join(assetsPath, asset.filename), asset.data);
          }
          for (const item of plan.pages) {
            await writeNew(path.join(pagesPath, `${item.id}.md`), item.source);
            await persist(path.join(pagesPath, `${item.id}.md`), { source: item.source, metadata: item.metadata });
          }
          await atomicWrite(manifestPath, JSON.stringify({ ...manifest, completed: true }, null, 2));
        } catch (error) {
          throw new VaultError(500, "Import stopped. Original files are preserved. Retry the same folder selection to resume; existing content will not be overwritten.", { importId: plan.id });
        }
        return { id: plan.id, pageIds: manifest.pageIds, alreadyImported: false };
      });
    },
    async list(options: { includeTrashed?: boolean } = {}): Promise<Page[]> {
      return serialize(async () => {
      const all = [...(await scan()).values()].map((item) => item.page).sort(comparePageOrder);
      const hidden = trashedPageIds(all);
      return options.includeTrashed ? all : all.filter((page) => !hidden.has(page.id));
      });
    },
    async get(id: string): Promise<Page> {
      return serialize(async () => {
      assertId(id);
      const result = (await scan()).get(id);
      if (!result) throw new VaultError(404, "Page not found");
      return result.page;
      });
    },
    async sourceFile(id: string) {
      return serialize(async () => {
      assertId(id);
      const result = (await scan()).get(id);
      if (!result) throw new VaultError(404, "Page not found");
      return { path: result.filePath, source: result.source };
      });
    },
    create(input: PageInput, options: { id?: string } = {}): Promise<Page> {
      return serialize(async () => {
        checkInput(input);
        const pages = await scan();
        const id = options.id ?? randomUUID();
        assertId(id);
        if (pages.has(id)) throw new VaultError(409, "Page ID already exists");
        checkParent(id, input.parent, pages);
        const encoded = encode(undefined, id, input);
        const filePath = path.join(pagesPath, `${id}.md`);
        try {
          await fs.lstat(filePath);
          throw new VaultError(409, "Target page file already exists");
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
        const proposed = decode(encoded.source, filePath, encoded.metadata);
        checkParent(id, proposed.page.parent, pages);
        await persist(filePath, encoded);
        return proposed.page;
      });
    },
    update(id: string, input: PageInput, baseRevision: string): Promise<Page> {
      return serialize(() => updateLocked(id, input, baseRevision));
    },
    move(id: string, input: PageMoveInput, baseRevision: string): Promise<Page> {
      return serialize(async () => {
        assertId(id);
        if (!input || !own(input, "parent") || !own(input, "sidebarOrder") ||
            typeof baseRevision !== "string" || !/^[a-f0-9]{64}$/.test(baseRevision) ||
            !input.baseRevisions || typeof input.baseRevisions !== "object" || Array.isArray(input.baseRevisions))
          throw new VaultError(400, "Moving requires the page revision and destination revisions");
        const patch = { parent: input.parent, sidebarOrder: input.sidebarOrder };
        checkInput(patch);
        for (const anchor of [input.beforeId, input.afterId]) if (anchor !== null) assertId(anchor);
        for (const revision of Object.values(input.baseRevisions)) if (typeof revision !== "string" || !/^[a-f0-9]{64}$/.test(revision))
          throw new VaultError(400, "Invalid destination revision");
        const all = await scan(), source = all.get(id);
        if (!source) throw new VaultError(404, "Page not found");
        if (source.page.revision !== baseRevision) return registerConflict(source, patch, baseRevision);
        const hidden = trashedPageIds([...all.values()].map((item) => item.page));
        if (hidden.has(id)) throw new VaultError(400, "Restore the page from Trash first");
        checkParent(id, input.parent, all);
        const siblings = [...all.values()].map((item) => item.page)
          .filter((page) => page.parent === input.parent && page.id !== id && !hidden.has(page.id)).sort(comparePageOrder);
        const references = [...siblings, ...(input.parent ? [all.get(input.parent)!.page] : [])];
        if (references.length !== Object.keys(input.baseRevisions).length || references.some((page) => input.baseRevisions[page.id] !== page.revision))
          return registerConflict(source, patch, baseRevision);
        const index = input.beforeId === null ? siblings.length : siblings.findIndex((page) => page.id === input.beforeId);
        if (index < 0 || (siblings[index - 1]?.id ?? null) !== input.afterId)
          throw new VaultError(400, "Page order anchors are not adjacent");
        const expected = orderBetween(index ? pageOrderKey(siblings[index - 1]) : null, index < siblings.length ? pageOrderKey(siblings[index]) : null);
        if (input.sidebarOrder !== expected) throw new VaultError(400, "Page order does not match the destination");
        return updateLocked(id, patch, baseRevision);
      });
    },
    duplicate(id: string, baseRevision: string): Promise<Page> {
      return serialize(async () => {
        assertId(id);
        if (typeof baseRevision !== "string" || !/^[a-f0-9]{64}$/.test(baseRevision))
          throw new VaultError(400, "Duplicating requires a valid baseRevision");
        const all = await scan();
        const original = all.get(id);
        if (!original) throw new VaultError(404, "Page not found");
        if (original.page.revision !== baseRevision)
          return registerConflict(original, {}, baseRevision);
        if (trashedPageIds([...all.values()].map((item) => item.page)).has(id))
          throw new VaultError(400, "Restore the page from Trash first");
        const copyId = randomUUID();
        const encoded = encode(original, copyId, {
          title: `${original.page.title.slice(0, 493)} (copy)`,
          favorite: false,
          trashed: false,
        });
        const filePath = path.join(pagesPath, `${copyId}.md`);
        await persist(filePath, encoded);
        return decode(encoded.source, filePath, encoded.metadata).page;
      });
    },
    recycle(id: string, baseRevision: string, baseRevisions: Record<string, string>): Promise<{ recycled: string[] }> {
      return serialize(async () => {
        assertId(id);
        if (!baseRevisions || typeof baseRevisions !== "object" || Array.isArray(baseRevisions) ||
            typeof baseRevision !== "string" || !/^[a-f0-9]{64}$/.test(baseRevision))
          throw new VaultError(400, "Recycling requires page and descendant revisions");
        const all = await scan();
        const target = all.get(id);
        if (!target) throw new VaultError(404, "Page not found");
        if (target.page.revision !== baseRevision) return registerConflict(target, {}, baseRevision);
        if (!target.page.trashed) throw new VaultError(400, "Move the page to Trash first");
        const selected = new Map([[id, target]]);
        for (let changed = true; changed;) {
          changed = false;
          for (const [pageId, item] of all) if (item.page.parent && selected.has(item.page.parent) && !selected.has(pageId)) {
            selected.set(pageId, item); changed = true;
          }
        }
        if (Object.keys(baseRevisions).length !== selected.size || [...selected.keys()].some((pageId) => !Object.prototype.hasOwnProperty.call(baseRevisions, pageId)))
          throw new VaultError(409, "The page tree changed. Reopen Trash before deleting.");
        for (const [pageId, item] of selected) {
          if (!/^[a-f0-9]{64}$/.test(baseRevisions[pageId])) throw new VaultError(400, "Invalid descendant revision");
          if (item.page.revision !== baseRevisions[pageId]) return registerConflict(item, {}, baseRevisions[pageId]);
        }
        // Do not strand active conflict records whose source file is still needed.
        for (const entry of await fs.readdir(conflictsPath, { withFileTypes: true })) {
          if (entry.isFile() && !entry.isSymbolicLink() && entry.name.endsWith(".json")) {
            const record = JSON.parse(await fs.readFile(path.join(conflictsPath, entry.name), "utf8"));
            if (selected.has(record.pageId)) throw new VaultError(400, "Resolve conflicts for this page and its children before deleting.");
          }
        }
        for (const item of selected.values()) await snapshot(item);
        const latest = await scan();
        for (const [pageId, item] of selected) {
          const fresh = latest.get(pageId);
          if (!fresh) throw new VaultError(409, "The page tree changed. Reopen Trash before deleting.");
          if (fresh.page.revision !== item.page.revision) return registerConflict(fresh, {}, item.page.revision);
        }
        if ([...latest.values()].some((item) => item.page.parent && selected.has(item.page.parent) && !selected.has(item.page.id)))
          throw new VaultError(409, "The page tree changed. Reopen Trash before deleting.");
        const recycled: string[] = [];
        // Children first: if Windows refuses one file, its parent remains recoverable in Trash.
        for (const item of [...selected.values()].reverse()) {
          await safeDirectory(pagesPath);
          if (path.dirname(path.resolve(item.filePath)) !== pagesPath) throw new VaultError(400, "Invalid page file path");
          const stat = await fs.lstat(item.filePath);
          if (!stat.isFile() || stat.isSymbolicLink()) throw new VaultError(422, "Cannot recycle symbolic links");
          const fresh = (await scan()).get(item.page.id)!;
          if (fresh.page.revision !== item.page.revision) return registerConflict(fresh, {}, item.page.revision);
          try { await (options.recycleFile ?? recycleFile)(item.filePath); }
          catch {
            throw new VaultError(503, "Windows could not recycle every page. Reopen Trash to see remaining pages; completed files are in the system Recycle Bin and history snapshots are preserved.", { recycled });
          }
          recycled.push(item.page.id);
        }
        return { recycled };
      });
    },
    async listConflicts(): Promise<Conflict[]> {
      return serialize(async () => {
      await init();
      await safeDirectory(conflictsPath);
      const files = await fs.readdir(conflictsPath, { withFileTypes: true });
      const conflicts: Conflict[] = [];
      for (const file of files) {
        if (
          file.isFile() &&
          !file.isSymbolicLink() &&
          file.name.endsWith(".json")
        ) {
          conflicts.push(await conflictRecord(file.name.slice(0, -5)));
        }
      }
      return conflicts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      });
    },
    resolveConflict(
      id: string,
      input: PageInput,
      baseRevision: string,
    ): Promise<Page> {
      return serialize(async () => {
        checkInput(input);
        const conflict = await conflictRecord(id);
        const { title, parent, icon, properties, body, bodyFormat, syntax, favorite, trashed, sidebarOrder } =
          conflict.proposed;
        const page = await updateLocked(
          conflict.pageId,
          {
            title,
            parent,
            icon,
            properties,
            body,
            bodyFormat: bodyFormat || "markdown",
            syntax: syntax ?? null,
            ...(favorite === undefined ? {} : { favorite }),
            ...(trashed === undefined ? {} : { trashed }),
            ...(sidebarOrder === undefined ? {} : { sidebarOrder }),
            ...input,
          },
          baseRevision,
        );
        // Keep proposed Markdown and metadata as an audit trail, outside the active list.
        const resolvedPath = path.join(conflictsPath, "resolved");
        await safeDirectory(resolvedPath);
        await fs.rename(
          path.join(conflictsPath, `${id}.json`),
          path.join(resolvedPath, `${id}.json`),
        );
        await fs.rename(
          path.join(conflictsPath, `${id}.md`),
          path.join(resolvedPath, `${id}.md`),
        );
        return page;
      });
    },
    uploadAsset(name: unknown, contentType: unknown, data: unknown) {
      return serialize(async () => {
        await init();
        await safeDirectory(root);
        await safeDirectory(assetsPath);
        if (
          typeof name !== "string" ||
          !name.trim() ||
          typeof contentType !== "string" ||
          typeof data !== "string"
        ) {
          throw new VaultError(
            400,
            "Attachments require name, contentType, and base64 data",
          );
        }
        if (data.length > 28 * 1024 * 1024)
          throw new VaultError(413, "Attachment exceeds 20 MB");
        if (
          !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
            data,
          )
        ) {
          throw new VaultError(400, "Invalid attachment base64 encoding");
        }
        const bytes = Buffer.from(data, "base64");
        if (bytes.length > 20 * 1024 * 1024)
          throw new VaultError(413, "Attachment exceeds 20 MB");
        const extensions: Record<string, string> = {
          "image/png": ".png",
          "image/jpeg": ".jpg",
          "image/gif": ".gif",
          "image/webp": ".webp",
          "image/avif": ".avif",
          "audio/mpeg": ".mp3",
          "audio/ogg": ".ogg",
          "audio/wav": ".wav",
          "audio/mp4": ".m4a",
          "video/mp4": ".mp4",
          "video/webm": ".webm",
          "application/pdf": ".pdf",
          "text/plain": ".txt",
          "application/zip": ".zip",
        };
        const acceptedType = own(extensions, contentType)
          ? contentType
          : "application/octet-stream";
        const filename = `${randomUUID()}${extensions[acceptedType] ?? ".bin"}`;
        await atomicWrite(path.join(assetsPath, filename), bytes);
        return {
          path: `assets/${filename}`,
          contentType: acceptedType,
          name: path.basename(name.replaceAll("\\", "/")).slice(0, 180),
        };
      });
    },
  };
}
