import type { Buffer } from "buffer";
import { parseFragment } from "parse5";
import { hashBytes, randomUUID } from "./crypto";
import type { VaultPlatform, StorageError } from "./platform";
import { VaultError, type Page } from "./vault";
import { localAssetPath } from "../features/assets/asset-model";
import { pageAssetReferences } from "../features/assets/asset-references";

export type AssetCleanupHost = {
  root: string; platform: VaultPlatform;
  pages(): Promise<Page[]>;
  protectedPages(): Promise<Page[]>;
  readMetadata(): Promise<Record<string, unknown>>;
  readOptional(file: string): Promise<string | null>;
  safeDirectory(directory: string): Promise<void>;
  atomicWrite(file: string, bytes: string | Buffer, expected?: string | null): Promise<void>;
  recycleFile(file: string): Promise<void>;
};

/** Only candidates belonging to permanently deleted pages are considered. Never
 * sweep unrelated uploads, follow links, or turn an uncertain parse into deletion. */
export async function recycleOrphanAssets(host: AssetCleanupHost, deletedPages: Page[]) {
  const deletedAssets: string[] = [], warnings: string[] = [];
  const candidates = new Set(deletedPages.flatMap(page => [...pageAssetReferences(page).references.keys()]));
  if (!candidates.size) return { deletedAssets, warnings };
  const { fs, path } = host.platform;
  const read = async (key: string) => {
    if (localAssetPath(key) !== key) throw new VaultError(422, "Invalid attachment cleanup path");
    let full = host.root;
    const parts = key.split("/");
    for (const [i, part] of parts.entries()) {
      full = path.join(full, part);
      const stat = await fs.lstat(full);
      if (stat.isSymbolicLink() || (i === parts.length - 1 ? !stat.isFile() : !stat.isDirectory())) throw new VaultError(422, "Attachment cleanup cannot follow symbolic links");
    }
    return { file: full, bytes: await fs.readFile(full) };
  };
  try {
    const remaining = await host.pages(), protectedPages = await host.protectedPages();
    const fingerprint = (pages: Page[]) => JSON.stringify(pages.map(page => [page.id, page.revision]).sort());
    const baseline = fingerprint([...remaining, ...protectedPages]);
    const used = new Set<string>();
    for (const page of [...remaining, ...protectedPages]) {
      const result = pageAssetReferences(page);
      if (result.uncertain) throw new VaultError(422, "Some surviving page or conflict source could not be checked");
      for (const key of result.references.keys()) used.add(key);
    }
    const metadata = await host.readMetadata();
    const visitMetadata = (value: unknown) => {
      if (typeof value === "string") { const key = localAssetPath(value); if (key) used.add(key); }
      else if (Array.isArray(value)) value.forEach(visitMetadata);
      else if (value && typeof value === "object") Object.values(value).forEach(visitMetadata);
    };
    for (const [group, value] of Object.entries(metadata)) if (!["pages", "assets"].includes(group)) visitMetadata(value);
    if (metadata.assets !== undefined && (!metadata.assets || typeof metadata.assets !== "object" || Array.isArray(metadata.assets))) throw new VaultError(422, "Invalid attachment metadata");

    // HTML/SVG/CSS can depend on another attachment without a direct page link.
    // Resolve their static links transitively; dynamic code or ambiguous syntax
    // makes this cleanup conservative instead of guessing that files are unused.
    const queue = [...used];
    for (let index = 0; index < queue.length; index++) {
      const key = queue[index];
      if (!/\.(?:html?|svg|css|js|mjs)$/i.test(key)) continue;
      let data;
      try { data = await read(key); } catch (error) { if ((error as StorageError).code === "ENOENT") continue; throw error; }
      if (data.bytes.length > 2 * 1024 * 1024 || /\.(?:m?js)$/i.test(key)) throw new VaultError(422, "Dynamic or large attachment dependencies cannot be checked");
      const source = data.bytes.toString("utf8");
      const add = (value: string) => {
        if (/^(?:data:|https?:|\/\/|#)/i.test(value)) return;
        const resolved = new URL(value, `https://notdown.invalid/${key}`);
        if (resolved.origin !== "https://notdown.invalid") return;
        const target = localAssetPath(resolved.pathname);
        if (target && !used.has(target)) { used.add(target); queue.push(target); }
      };
      const css = (value: string) => {
        if (/\\|@import/i.test(value)) throw new VaultError(422, "Ambiguous stylesheet dependencies cannot be checked");
        for (const match of value.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]*))\s*\)/gi)) add(match[1] ?? match[2] ?? match[3]);
      };
      if (/\.css$/i.test(key)) css(source);
      else {
        const visit = (element: any) => {
          if (["script", "base"].includes(element.tagName)) throw new VaultError(422, "Dynamic attachment dependencies cannot be checked");
          for (const attr of element.attrs ?? []) {
            if (["src", "href", "data", "poster", "xlink:href"].includes(attr.name)) add(attr.value);
            if (attr.name === "style") css(attr.value);
            if (attr.name === "srcset") throw new VaultError(422, "Responsive attachment dependencies cannot be checked");
          }
          if (element.tagName === "style") for (const child of element.childNodes ?? []) css(child.value || "");
          for (const child of element.childNodes ?? []) visit(child);
          if (element.content) visit(element.content);
        };
        visit(parseFragment(source));
      }
    }
    const recovery = path.join(host.root, ".history", "deleted-assets", randomUUID());
    for (const key of candidates) {
      if (used.has(key)) continue;
      let data;
      try { data = await read(key); } catch (error) { if ((error as StorageError).code === "ENOENT") continue; throw error; }
      const record = (metadata.assets as Record<string, unknown> | undefined)?.[key];
      await host.safeDirectory(path.dirname(recovery)); await host.safeDirectory(recovery);
      const id = randomUUID();
      await host.atomicWrite(path.join(recovery, `${id}.bin`), data.bytes, null);
      await host.atomicWrite(path.join(recovery, `${id}.json`), JSON.stringify({ path: key, hash: hashBytes(data.bytes), metadata: record, pages: deletedPages.map(page => ({ id: page.id, revision: page.revision })), createdAt: new Date().toISOString() }), null);
      if (fingerprint([...(await host.pages()), ...(await host.protectedPages())]) !== baseline) throw new VaultError(409, "A page or conflict changed during attachment cleanup");
      if (!(await read(key)).bytes.equals(data.bytes)) throw new VaultError(409, "An attachment changed during cleanup");
      await host.recycleFile(data.file);
      deletedAssets.push(key);
      // Merge only the removed entry into fresh metadata, preserving unknown and
      // concurrently changed entries. CAS failure leaves the recovery material.
      const file = path.join(host.root, "metadata.json"), before = await host.readOptional(file), current = await host.readMetadata();
      const records = current.assets as Record<string, unknown> | undefined;
      if (JSON.stringify(records?.[key]) !== JSON.stringify(record)) throw new VaultError(409, "Attachment metadata changed during cleanup");
      if (record !== undefined) {
        current.assets = { ...records }; delete (current.assets as Record<string, unknown>)[key];
        await host.atomicWrite(file, JSON.stringify(current, null, 2) + "\n", before);
      }
    }
  } catch (error) {
    warnings.push(`Pages were deleted, but some attachments were preserved: ${error instanceof Error ? error.message : String(error)}. Recovery copies are in .history/deleted-assets/.`);
  }
  return { deletedAssets, warnings };
}
