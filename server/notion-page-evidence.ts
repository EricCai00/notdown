import { promises as fs } from "node:fs";
import path from "node:path";
import type { PageEntryEvidence } from "../src/document/page-entry-projection";

/** Read existing import evidence without migrating Markdown or metadata.
 * Archived child_page blocks prove resource entries; link_to_page proves links.
 * Missing/ambiguous evidence fails closed to ordinary links.
 */
export function notionPageEvidence(historyPath: string) {
  const cache = new Map<string, { child: Set<string>; references: Set<string> }>();
  const compact = (id: string) => id.replace(/-/g, "").toLowerCase();
  const safeRead = async (filename: string) => {
    const stat = await fs.lstat(filename);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 20 * 1024 * 1024) throw new Error("Invalid import evidence");
    return JSON.parse(await fs.readFile(filename, "utf8"));
  };
  return async (pages: { id: string; parent: string | null; pageEntryEvidence?: PageEntryEvidence }[]) => {
    const batches = new Map<string, typeof pages>();
    for (const page of pages) {
      const batch = /^notion-([a-f0-9]{24})-([a-f0-9-]{36})$/.exec(page.id)?.[1];
      if (batch) batches.set(batch, [...(batches.get(batch) || []), page]);
    }
    if (!batches.size) return;
    let entries;
    try { entries = await fs.readdir(path.join(historyPath, "imports"), { withFileTypes: true }); } catch { return; }
    for (const [batch, members] of batches) {
      const directories = entries.filter(e => e.isDirectory() && !e.isSymbolicLink() && /^[a-f0-9]{64}$/.test(e.name) && e.name.startsWith(batch));
      if (directories.length !== 1) continue;
      const directory = path.join(historyPath, "imports", directories[0].name);
      try {
        let evidence = cache.get(directory);
        if (!evidence) {
          const manifest = await safeRead(path.join(directory, "manifest.json"));
          if (!manifest.completed || !Array.isArray(manifest.originals)) continue;
          evidence = { child: new Set(), references: new Set() };
          let total = 0;
          for (const original of manifest.originals) {
            if (typeof original.path !== "string" || !original.path.startsWith("api/") || !/^\d+\.source$/.test(original.archive)) continue;
            if (++total > 1500) throw new Error("Too many archived responses");
            const response = await safeRead(path.join(directory, original.archive));
            for (const block of Array.isArray(response.results) ? response.results : []) {
              if (block?.type === "child_page" && typeof block.id === "string") evidence.child.add(compact(block.id));
              if (block?.type === "link_to_page" && typeof block.link_to_page?.page_id === "string") evidence.references.add(compact(block.link_to_page.page_id));
            }
          }
          cache.set(directory, evidence);
        }
        for (const page of members) page.pageEntryEvidence = {
          childTargets: members.filter(p => p.parent === page.id && evidence!.child.has(compact(p.id.slice(32)))).map(p => p.id),
          referenceTargets: members.filter(p => evidence!.references.has(compact(p.id.slice(32)))).map(p => p.id),
        };
      } catch { /* Invalid or incomplete archives never confer child semantics. */ }
    }
  };
}
