import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { parseDocument, Document, isMap } from "yaml";
import { replaceFile } from "./file-replace.js";
import type { BodyFormat } from "../src/notion-syntax.js";

export type Page = {
  id: string;
  title: string;
  parent: string | null;
  icon: string;
  properties: Record<string, unknown>;
  body: string;
  bodyFormat?: BodyFormat;
  revision: string;
  updated: string;
};
export type PageInput = Partial<
  Pick<Page, "title" | "parent" | "icon" | "properties" | "body" | "bodyFormat">
>;
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
    throw new VaultError(400, "页面 ID 不合法");
}

function checkInput(input: PageInput) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new VaultError(400, "需要页面对象");
  if (
    own(input, "title") &&
    (typeof input.title !== "string" ||
      !input.title.trim() ||
      input.title.length > 500)
  ) {
    throw new VaultError(400, "标题不能为空且不能超过 500 字");
  }
  if (own(input, "parent") && input.parent !== null) assertId(input.parent);
  if (
    own(input, "icon") &&
    (typeof input.icon !== "string" || input.icon.length > 100)
  )
    throw new VaultError(400, "图标不合法");
  if (own(input, "body") && typeof input.body !== "string")
    throw new VaultError(400, "正文必须是 Markdown 字符串");
  if (own(input, "bodyFormat") && !["markdown", "notion-markdown"].includes(input.bodyFormat!))
    throw new VaultError(400, "不支持的正文格式");
  if (own(input, "body") && Buffer.byteLength(input.body!) > 10 * 1024 * 1024)
    throw new VaultError(413, "页面超过 10 MB");
  if (
    own(input, "properties") &&
    (!input.properties ||
      typeof input.properties !== "object" ||
      Array.isArray(input.properties))
  ) {
    throw new VaultError(400, "properties 必须是对象");
  }
}

function decode(source: string, filePath: string): StoredPage {
  const match = /^(?:\uFEFF)?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(
    source,
  );
  if (!match)
    throw new VaultError(
      422,
      `文件缺少 YAML 元信息：${path.basename(filePath)}`,
    );
  const document = parseDocument(match[1], { uniqueKeys: true });
  if (document.errors.length || !isMap(document.contents)) {
    throw new VaultError(
      422,
      `文件的 YAML 元信息不合法：${path.basename(filePath)}`,
    );
  }
  let metadata: Record<string, unknown>;
  try {
    metadata = document.toJS({ maxAliasCount: 50 });
  } catch {
    throw new VaultError(422, `文件 YAML 别名过多：${path.basename(filePath)}`);
  }
  const {
    id,
    title,
    parent = null,
    icon = "📄",
    properties = {},
    updated = "",
    bodyFormat = "markdown",
  } = metadata;
  try {
    assertId(id);
    checkInput({ title, parent, icon, properties, bodyFormat } as PageInput);
    if (typeof updated !== "string") throw new Error("updated");
  } catch {
    throw new VaultError(
      422,
      `文件的页面元信息不合法：${path.basename(filePath)}`,
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
      revision: hash(source),
    },
  };
}

function encode(
  previous: StoredPage | undefined,
  id: string,
  input: PageInput,
): string {
  if (previous && own(input, "bodyFormat") && input.bodyFormat !== previous.page.bodyFormat && !own(input, "body"))
    throw new VaultError(400, "切换正文格式时必须同时提交转换后的完整正文");
  const document = previous ? previous.document.clone() : new Document();
  if (!previous) {
    document.set("id", id);
    document.set("title", input.title ?? "未命名页面");
    document.set("parent", input.parent ?? null);
    document.set("icon", input.icon ?? "📄");
    document.set("properties", input.properties ?? {});
    document.set("bodyFormat", input.bodyFormat ?? "notion-markdown");
  } else {
    for (const key of ["title", "parent", "icon", "properties", "bodyFormat"] as const) {
      if (own(input, key)) document.set(key, input[key]);
    }
  }
  document.set("updated", new Date().toISOString());
  return `---\n${document.toString({ lineWidth: 0 })}---\n${input.body ?? previous?.page.body ?? ""}`;
}

/** Each mutation is serialized; Markdown files are re-read for every operation. */
export function createVault(vaultPath: string) {
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
        throw new VaultError(422, "知识库目录不能是符号链接或普通文件");
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
        throw new VaultError(422, `页面 ID 重复：${stored.page.id}`);
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
        throw new VaultError(422, "不能写入符号链接或目录");
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
        throw new VaultError(400, "父子页面不能形成循环");
      visited.add(cursor);
      const found = pages.get(cursor);
      if (!found) throw new VaultError(400, `父页面不存在：${cursor}`);
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
      "页面已经被其他窗口、设备或外部编辑器修改；已保留你的版本",
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
      throw new VaultError(400, "保存需要有效的 baseRevision");
    const pages = await scan();
    const current = pages.get(id);
    if (!current) throw new VaultError(404, "页面不存在");
    if (current.page.revision !== baseRevision)
      return registerConflict(current, input, baseRevision);
    checkParent(
      id,
      own(input, "parent") ? input.parent : current.page.parent,
      pages,
    );
    const source = encode(current, id, input);
    await snapshot(current);
    // Re-check after preparing the history snapshot to observe external writers.
    const latestStat = await fs.lstat(current.filePath);
    if (latestStat.isSymbolicLink())
      throw new VaultError(422, "不能写入符号链接");
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
        throw new VaultError(422, "冲突文件不合法");
      const record = JSON.parse(await fs.readFile(metadataFile, "utf8"));
      assertId(record.pageId);
      if (record.conflictId !== id) throw new VaultError(422, "冲突记录不匹配");
      const pages = await scan();
      const current = pages.get(record.pageId);
      if (!current) throw new VaultError(404, "冲突对应的页面不存在");
      const proposed = decode(
        await fs.readFile(proposedFile, "utf8"),
        proposedFile,
      ).page;
      if (proposed.id !== record.pageId)
        throw new VaultError(422, "冲突页面 ID 不匹配");
      return { ...record, current: current.page, proposed };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        throw new VaultError(404, "冲突不存在或已解决");
      throw error;
    }
  }

  return {
    vaultPath: root,
    assetsPath,
    init,
    async list(): Promise<Page[]> {
      return [...(await scan()).values()].map((item) => item.page);
    },
    async get(id: string): Promise<Page> {
      assertId(id);
      const result = (await scan()).get(id);
      if (!result) throw new VaultError(404, "页面不存在");
      return result.page;
    },
    create(input: PageInput, options: { id?: string } = {}): Promise<Page> {
      return serialize(async () => {
        checkInput(input);
        const pages = await scan();
        const id = options.id ?? randomUUID();
        assertId(id);
        if (pages.has(id)) throw new VaultError(409, "页面 ID 已存在");
        checkParent(id, input.parent, pages);
        const source = encode(undefined, id, input);
        const filePath = path.join(pagesPath, `${id}.md`);
        try {
          await fs.lstat(filePath);
          throw new VaultError(409, "目标页面文件已存在");
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
        const { title, parent, icon, properties, body, bodyFormat } = conflict.proposed;
        const page = await updateLocked(
          conflict.pageId,
          { title, parent, icon, properties, body, bodyFormat: bodyFormat || "markdown", ...input },
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
            "附件需要 name、contentType 和 base64 data",
          );
        }
        if (data.length > 28 * 1024 * 1024)
          throw new VaultError(413, "附件超过 20 MB");
        if (
          !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
            data,
          )
        ) {
          throw new VaultError(400, "附件 base64 编码不合法");
        }
        const bytes = Buffer.from(data, "base64");
        if (bytes.length > 20 * 1024 * 1024)
          throw new VaultError(413, "附件超过 20 MB");
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
