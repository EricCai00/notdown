import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { parseDocument, Document, isMap } from "yaml";
import { replaceFile } from "./file-replace.js";
import { trashedPageIds } from "../src/page-hierarchy.js";
import { recycleFile } from "./recycle-file.js";
import { createPeople } from "./people.js";
import { comparePageOrder, orderBetween, pageOrderKey, type PageMoveInput } from "../src/page-order.js";
import type { BodyFormat } from "../src/notion-syntax.js";
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
  document: Document;
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

function decode(source: string, filePath: string): StoredPage {
  const match = /^(?:\uFEFF)?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(
    source,
  );
  if (!match)
    throw new VaultError(
      422,
      `File is missing YAML metadata: ${path.basename(filePath)}`,
    );
  const document = parseDocument(match[1], { uniqueKeys: true });
  if (document.errors.length || !isMap(document.contents)) {
    throw new VaultError(
      422,
      `Invalid YAML metadata in file: ${path.basename(filePath)}`,
    );
  }
  let metadata: Record<string, unknown>;
  try {
    metadata = document.toJS({ maxAliasCount: 50 });
  } catch {
    throw new VaultError(422, `Too many YAML aliases in file: ${path.basename(filePath)}`);
  }
  const {
    id,
    title,
    parent = null,
    icon = "📄",
    properties = {},
    updated = "",
    bodyFormat = "markdown",
    syntax,
    favorite,
    trashed,
    sidebarOrder,
  } = metadata;
  try {
    assertId(id);
    checkInput({ title, parent, icon, properties, bodyFormat } as PageInput);
    checkInput({ ...(favorite === undefined ? {} : { favorite }), ...(trashed === undefined ? {} : { trashed }) } as PageInput);
    if (sidebarOrder !== undefined) checkInput({ sidebarOrder } as PageInput);
    if (syntax !== undefined) {
      if (!validSyntax(syntax)) throw new Error("syntax");
      checkInput({ syntax, bodyFormat } as PageInput);
    }
    if (typeof updated !== "string") throw new Error("updated");
  } catch {
    throw new VaultError(
      422,
      `Invalid page metadata in file: ${path.basename(filePath)}`,
    );
  }
  return {
    document,
    source,
    filePath,
    page: {
      id: id as string,
      title: title as string,
      parent: parent as string | null,
      icon: icon as string,
      properties: properties as Record<string, unknown>,
      updated: updated as string,
      body: source.slice(match[0].length),
      bodyFormat: bodyFormat as BodyFormat,
      ...(syntax === undefined ? {} : { syntax: syntax as SyntaxConfig }),
      revision: hash(source),
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
): string {
  if (
    previous &&
    own(input, "bodyFormat") &&
    input.bodyFormat !== previous.page.bodyFormat &&
    !own(input, "body")
  )
    throw new VaultError(400, "Changing body format requires the complete converted content");
  const document = previous ? previous.document.clone() : new Document();
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
    document.set("id", id);
    document.set("title", input.title ?? "Untitled page");
    document.set("parent", input.parent ?? null);
    document.set("icon", input.icon ?? "📄");
    document.set("properties", input.properties ?? {});
    document.set("bodyFormat", input.bodyFormat ?? "notion-markdown");
  } else {
    for (const key of [
      "title",
      "parent",
      "icon",
      "properties",
      "bodyFormat",
    ] as const) {
      if (own(input, key)) document.set(key, input[key]);
    }
  }
  document.set("updated", new Date().toISOString());
  if (own(input, "sidebarOrder")) document.set("sidebarOrder", input.sidebarOrder);
  for (const key of ["favorite", "trashed"] as const) {
    if (own(input, key)) document.set(key, input[key]);
  }
  if (input.syntax) {
    document.set("syntax", input.syntax);
    document.set("bodyFormat", syntaxFormat(input.syntax));
  } else if (input.syntax === null) document.delete("syntax");
  return `---\n${document.toString({ lineWidth: 0 })}---\n${input.body ?? previous?.page.body ?? ""}`;
}

/** Each mutation is serialized; Markdown files are re-read for every operation. */
export function createVault(vaultPath: string, options: { recycleFile?: (filename: string) => Promise<void> } = {}) {
  const root = path.resolve(vaultPath);
  const pagesPath = path.join(root, "pages");
  const historyPath = path.join(root, ".history");
  const conflictsPath = path.join(historyPath, "conflicts");
  const assetsPath = path.join(root, "assets");
  let queue = Promise.resolve<unknown>(undefined);
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
    const next = queue.then(operation, operation);
    queue = next.catch(() => undefined);
    return next;
  }
  async function scan(): Promise<Map<string, StoredPage>> {
    await init();
    await safeDirectory(root);
    await safeDirectory(pagesPath);
    await safeDirectory(historyPath);
    await safeDirectory(conflictsPath);
    await safeDirectory(assetsPath);
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
      const stored = decode(await fs.readFile(filePath, "utf8"), filePath);
      if (result.has(stored.page.id))
        throw new VaultError(422, `Duplicate page ID: ${stored.page.id}`);
      result.set(stored.page.id, stored);
    }
    return result;
  }
  async function atomicWrite(filePath: string, data: string | Buffer) {
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
    const source = encode(current, current.page.id, input);
    const proposed = decode(source, `${conflictId}.md`).page;
    const record: Omit<Conflict, "current" | "proposed"> = {
      id: conflictId,
      conflictId,
      pageId: current.page.id,
      createdAt: new Date().toISOString(),
      baseRevision,
      currentRevision: current.page.revision,
    };
    await snapshot(current);
    await atomicWrite(path.join(conflictsPath, `${conflictId}.md`), source);
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
    const source = encode(current, id, input);
    await snapshot(current);
    // Re-check after preparing the history snapshot to observe external writers.
    const latestStat = await fs.lstat(current.filePath);
    if (latestStat.isSymbolicLink())
      throw new VaultError(422, "Cannot write to a symbolic link");
    const latest = decode(
      await fs.readFile(current.filePath, "utf8"),
      current.filePath,
    );
    if (latest.page.revision !== baseRevision)
      return registerConflict(latest, input, baseRevision);
    await atomicWrite(current.filePath, source);
    return decode(source, current.filePath).page;
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

  return {
    vaultPath: root,
    assetsPath,
    people: createPeople({ root, init, safeDirectory, atomicWrite, serialize }),
    init,
    async list(options: { includeTrashed?: boolean } = {}): Promise<Page[]> {
      const all = [...(await scan()).values()].map((item) => item.page).sort(comparePageOrder);
      const hidden = trashedPageIds(all);
      return options.includeTrashed ? all : all.filter((page) => !hidden.has(page.id));
    },
    async get(id: string): Promise<Page> {
      assertId(id);
      const result = (await scan()).get(id);
      if (!result) throw new VaultError(404, "Page not found");
      return result.page;
    },
    create(input: PageInput, options: { id?: string } = {}): Promise<Page> {
      return serialize(async () => {
        checkInput(input);
        const pages = await scan();
        const id = options.id ?? randomUUID();
        assertId(id);
        if (pages.has(id)) throw new VaultError(409, "Page ID already exists");
        checkParent(id, input.parent, pages);
        const source = encode(undefined, id, input);
        const filePath = path.join(pagesPath, `${id}.md`);
        try {
          await fs.lstat(filePath);
          throw new VaultError(409, "Target page file already exists");
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
        await atomicWrite(filePath, source);
        return decode(source, filePath).page;
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
        const document = original.document.clone();
        document.set("id", copyId);
        const copy = { ...original, document };
        const source = encode(copy, copyId, {
          title: `${original.page.title.slice(0, 493)} (copy)`,
          favorite: false,
          trashed: false,
        });
        const filePath = path.join(pagesPath, `${copyId}.md`);
        await atomicWrite(filePath, source);
        return decode(source, filePath).page;
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
          const fresh = decode(await fs.readFile(item.filePath, "utf8"), item.filePath);
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
