import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { parseNative } from "../src/markdown-engine/codec.js";
import { renderNotionMarkdown } from "../src/document-format.js";
import {
  validSyntax,
  type SyntaxConfig,
} from "../src/markdown-engine/config.js";
import { type createVault, VaultError } from "./vault.js";

export function syntaxFiles(vault: ReturnType<typeof createVault>) {
  async function read(name: string, base = "", format = "html") {
    await vault.init();
    if (
      typeof name !== "string" ||
      name.length > 500 ||
      /^[\/\\]|^[a-z]:|[\u0000-\u001f]/i.test(name)
    )
      throw new VaultError(400, "Included file path must be inside the vault");
    name = decodeURIComponent(name).replace(/\\/g, "/");
    const root = await fs.realpath(vault.vaultPath);
    const pages = await vault.list(),
      basename = name.replace(/\.md$/i, "");
    const matching = pages.filter(
      (p) => p.title === basename || p.id === basename,
    );
    if (!base && matching.length > 1)
      throw new VaultError(409, "Page name is not unique. Use the page ID.");
    if (!base && matching.length === 1) {
      if (Buffer.byteLength(matching[0].body, "utf8") > 256000)
        throw new VaultError(400, "Included file is too large");
      return { raw: matching[0].body, file: "pages/" + matching[0].id + ".md" };
    }
    const requested = path.resolve(root, base, name),
      relative = path.relative(root, requested);
    if (relative.startsWith("..") || path.isAbsolute(relative))
      throw new VaultError(400, "Included path is outside the vault");
    const candidates = requested.endsWith(".*")
      ? [format, "md", "txt"].map((ext) => requested.slice(0, -1) + ext)
      : [requested, path.join(root, "pages", name)];
    for (const candidate of candidates) {
      try {
        const real = await fs.realpath(candidate),
          rel = path.relative(root, real);
        if (rel.startsWith("..") || path.isAbsolute(rel))
          throw new VaultError(400, "Included link is outside the vault");
        if (!/\.(md|markdown|txt|html|tex|bib|csl)$/i.test(real))
          throw new VaultError(
            400,
            "Only Markdown, text, HTML, TeX, and BibTeX files are supported",
          );
        const stat = await fs.stat(real);
        if (!stat.isFile() || stat.size > 256000)
          throw new VaultError(400, "Included path is too large or is not a file");
        const page = pages.find(
          (p) => "pages/" + p.id + ".md" === rel.replace(/\\/g, "/"),
        );
        return {
          raw: page?.body ?? (await fs.readFile(real, "utf8")),
          file: rel.replace(/\\/g, "/"),
        };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw error;
      }
    }
    throw new VaultError(404, "Included file not found: " + name);
  }
  async function transclusion(name: string, config: SyntaxConfig) {
    if (!validSyntax(config)) throw new VaultError(400, "Invalid dialect configuration");
    const dependencies = new Set<string>();
    let total = 0;
    const expand = async (
      name: string,
      base: string,
      stack: string[],
    ): Promise<string> => {
      if (stack.length >= 8) throw new VaultError(400, "File inclusion exceeds 8 levels");
      const file = await read(name, base);
      if (stack.includes(file.file))
        throw new VaultError(
          400,
          "Circular file inclusion: " + [...stack, file.file].join(" → "),
        );
      total += file.raw.length;
      if (total > 512000) throw new VaultError(400, "Total included content is too large");
      dependencies.add(file.file);
      const doc = parseNative(file.raw, config),
        mapped = new Map<import("prosemirror-model").Node, string>(),
        nodes: import("prosemirror-model").Node[] = [];
      doc.descendants((n) => {
        if (
          ["syntax_block", "syntax_inline"].includes(n.type.name) &&
          n.attrs.kind === "transclusion"
        )
          nodes.push(n);
      });
      for (const n of nodes)
        mapped.set(
          n,
          await expand(
            n.attrs.data?.path || n.attrs.label,
            path.dirname(file.file),
            [...stack, file.file],
          ),
        );
      return renderNotionMarkdown(file.raw, [], {
        document: doc,
        syntaxBlock: (n) => mapped.get(n),
      });
    };
    const html = await expand(name, "", []);
    return {
      html,
      dependencies: [...dependencies],
      revision: createHash("sha256").update(html).digest("hex"),
    };
  }
  return { read, transclusion };
}
