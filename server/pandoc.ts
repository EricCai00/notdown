import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseFragment, serialize } from "parse5";
import MarkdownIt from "markdown-it";
import { z } from "zod";
import { renderNotionMarkdown } from "../src/document/document-format.js";
import { parseNotionMarkdown } from "../src/document/notion-markdown.js";
import { parseNative } from "../src/markdown-engine/codec.js";
import { supportsOption } from "../src/markdown-engine/config.js";
import {
  variants,
  blockPlugins,
  type Capabilities,
  type RenderResult,
} from "../src/markdown-lab/model.js";
import { renderBlockPlugin } from "../src/markdown-lab/plugins.js";

export class PreviewError extends Error {
  constructor(
    message: string,
    readonly status = 422,
  ) {
    super(message);
  }
}
const requestSchema = z
  .object({
    source: z.string().max(128_000),
    variant: z.enum(variants.map((variant) => variant.id)),
    extensions: z.record(z.string().max(80), z.boolean()).default({}),
    plugins: z
      .array(z.enum(["bookmark"]))
      .max(1) // Accept saved legacy profiles; the retired plugin is inert.
      .default([]),
  })
  .strict();

let running = 0;
function runProgram(
  executable: string,
  args: string[],
  source = "",
  signal?: AbortSignal,
  label = "Renderer",
): Promise<string> {
  if (signal?.aborted)
    return Promise.reject(new PreviewError("Preview cancelled", 499));
  if (running >= 4)
    return Promise.reject(new PreviewError("Preview is busy. Please try again later.", 503));
  return new Promise((resolve, reject) => {
    running++;
    // No shell or request-supplied path/arguments. Only configured local tools run.
    // Pandoc callers add --sandbox for both readers and writers.
    const child = spawn(executable, args, {
      windowsHide: true,
      stdio: "pipe",
    });
    const output: Buffer[] = [];
    let size = 0,
      errorText = "",
      failure: Error | undefined;
    const stop = (error: Error) => {
      failure = error;
      child.kill();
    };
    const abort = () => stop(new PreviewError("Preview cancelled", 499));
    const timer = setTimeout(
      () => stop(new PreviewError(`${label} timed out. Shorten the document and try again.`, 504)),
      8000,
    );
    signal?.addEventListener("abort", abort, { once: true });
    child.on("error", () => {
      failure = new PreviewError(
        `${label} could not start. Check the configured executable and restart the server.`,
        503,
      );
    });
    child.stdout.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 16 * 1024 * 1024) stop(new PreviewError("Preview output is too large", 413));
      else output.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      if (errorText.length < 4000) errorText += chunk.toString("utf8").slice(0, 4000 - errorText.length);
    });
    child.stdin.on("error", () => {
      /* EPIPE is reported by close below. */
    });
    child.on("close", (code) => {
      running--;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      if (failure) reject(failure);
      else if (code !== 0)
        reject(new PreviewError(errorText.trim() || `${label} could not render this content`));
      else resolve(Buffer.concat(output).toString("utf8"));
    });
    child.stdin.end(source, "utf8");
  });
}
function pandoc(args: string[], source = "", signal?: AbortSignal) {
  return runProgram(process.env.PANDOC_PATH || "pandoc", args, source, signal, "Pandoc");
}

let cachedCapabilities: Promise<Capabilities> | undefined;
/** CSL processing uses only supplied bibliography/style bytes and a sandboxed reader. */
export async function renderCitations(bibliography: string, citations: string[], style?: string) {
  if (style && /<!DOCTYPE|<!ENTITY|rel\s*=\s*["']independent-parent/i.test(style)) throw new PreviewError("Use a self-contained CSL style without external declarations.");
  const parsed = JSON.parse(await pandoc(["--sandbox", "-f", "markdown+citations", "-t", "json"], citations.join("\n\n")));
  const references = JSON.parse(await pandoc(["--sandbox", "-f", "biblatex", "-t", "json"], bibliography));
  parsed.meta = { references: references.meta.references, "link-citations": { t: "MetaBool", c: true } };
  let temporary: string | undefined;
  try {
    const args = ["--sandbox", "--citeproc", "-f", "json", "-t", "html5"];
    if (style) { temporary = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-csl-")); const file = path.join(temporary, "style.csl"); await fs.writeFile(file, style); args.push("--csl", file); }
    const html = await pandoc(args, JSON.stringify(parsed));
    const document = parseFragment(html), paragraphs = document.childNodes.filter((n: any) => n.tagName === "p");
    const rendered: Record<string, string> = {}; citations.forEach((raw, i) => { if (paragraphs[i]) rendered[raw] = serialize(paragraphs[i] as any); });
    const refs = document.childNodes.find((n: any) => n.attrs?.some((a: any) => a.name === "id" && a.value === "refs"));
    return { citations: rendered, bibliography: refs ? serialize(refs as any) : "" };
  } finally { if (temporary && path.dirname(path.resolve(temporary)) === path.resolve(os.tmpdir()) && path.basename(temporary).startsWith("notdown-csl-")) await fs.rm(temporary, { recursive: true, force: true }); }
}
export async function getPandocCapabilities(): Promise<Capabilities> {
  if (!cachedCapabilities) {
    cachedCapabilities = (async () => {
      const version = (await pandoc(["--version"])).split(/\r?\n/)[0];
      const inputFormats = new Set(
        (await pandoc(["--list-input-formats"])).trim().split(/\r?\n/),
      );
      const extensions: Capabilities["extensions"] = {};
      const sourcePositions: Capabilities["sourcePositions"] = {};
      for (const variant of variants.filter(
        (item) => item.engine === "pandoc",
      )) {
        if (!inputFormats.has(variant.id)) continue;
        const list = await pandoc([`--list-extensions=${variant.id}`]);
        // Native source positions belong to a reader capability, not to the
        // assumption that every dialect except `markdown` is CommonMark-based.
        sourcePositions[variant.id] = /^[+-]sourcepos\r?$/m.test(list);
        extensions[variant.id] = Object.fromEntries(
          list
            .trim()
            .split(/\r?\n/)
            .filter(
              (line) =>
                /^[+-][a-z_\d]+$/.test(line) && line.slice(1) !== "sourcepos",
            )
            .map((line) => [line.slice(1), line[0] === "+"]),
        );
      }
      return { available: true, version, extensions, sourcePositions };
    })().catch((error: Error) => {
      cachedCapabilities = undefined;
      return {
        available: false,
        version: "Pandoc disconnected",
        extensions: {},
        sourcePositions: {},
        error: error.message,
      };
    });
  }
  return cachedCapabilities;
}

type ExternalRenderer = "multimarkdown-cli" | "markdown-pl";
type Program = { available: boolean; version: string; error?: string; executable?: string; args?: string[] };
let cachedExternalPrograms: Promise<Record<ExternalRenderer, Program>> | undefined;

async function isFile(file: string): Promise<boolean> {
  try { return (await fs.stat(file)).isFile(); }
  catch { return false; }
}
async function findOnPath(names: string[]): Promise<string | undefined> {
  for (const directory of (process.env.PATH || "").split(path.delimiter)) {
    if (!path.isAbsolute(directory)) continue;
    for (const name of names) {
      const file = path.join(directory, name);
      if (await isFile(file)) return file;
    }
  }
}
async function findMultiMarkdown(): Promise<string | undefined> {
  if (process.env.MULTIMARKDOWN_PATH) return process.env.MULTIMARKDOWN_PATH;
  const fromPath = await findOnPath(process.platform === "win32" ? ["multimarkdown.exe"] : ["multimarkdown"]);
  if (fromPath) return fromPath;
  if (process.platform !== "win32") return;
  for (const root of [process.env.ProgramFiles, process.env["ProgramFiles(x86)"]]) {
    if (!root) continue;
    let names: string[];
    try { names = (await fs.readdir(root)).filter((name) => /^libMultiMarkdown(?:\s|$)/i.test(name)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true })); }
    catch { continue; }
    for (const name of names) {
      const file = path.join(root, name, "bin", "multimarkdown.exe");
      if (await isFile(file)) return file;
    }
  }
}
async function findPerl(): Promise<string | undefined> {
  if (process.env.PERL_PATH) return process.env.PERL_PATH;
  const fromPath = await findOnPath(process.platform === "win32" ? ["perl.exe"] : ["perl"]);
  if (fromPath) return fromPath;
  if (process.platform !== "win32") return;
  for (const file of [
    "C:\\Program Files\\Git\\usr\\bin\\perl.exe",
    "C:\\Strawberry\\perl\\bin\\perl.exe",
  ]) if (await isFile(file)) return file;
}
async function getExternalPrograms(): Promise<Record<ExternalRenderer, Program>> {
  if (!cachedExternalPrograms) cachedExternalPrograms = (async () => {
    const multimarkdownPath = await findMultiMarkdown();
    let multimarkdown: Program = {
      available: false,
      version: "libMultiMarkdown unavailable",
      error: "Install the MultiMarkdown CLI or set MULTIMARKDOWN_PATH, then restart the server.",
    };
    if (multimarkdownPath) {
      try {
        const output = await runProgram(multimarkdownPath, ["--version"], "", undefined, "libMultiMarkdown");
        multimarkdown = {
          available: true,
          version: output.split(/\r?\n/).find((line) => /MultiMarkdown.*v\d/i.test(line))?.trim() || "libMultiMarkdown CLI",
          executable: multimarkdownPath,
          args: ["--snippet", "--notransclude", "--to=html"],
        };
      } catch (error) { multimarkdown.error = (error as Error).message; }
    }

    const script = process.env.MARKDOWN_PL_PATH || await findOnPath(["Markdown.pl", "markdown.pl"]);
    const perl = await findPerl();
    const scriptExists = !!script && await isFile(script);
    const perlExists = !!perl && await isFile(perl);
    let markdownPl: Program = {
      available: false,
      version: "Markdown.pl unavailable",
      error: !script
        ? "Set MARKDOWN_PL_PATH to the trusted Markdown.pl script and restart the server."
        : !scriptExists
          ? "MARKDOWN_PL_PATH does not point to a readable file."
        : !perl
          ? "Install Perl or set PERL_PATH, then restart the server."
          : !perlExists
            ? "PERL_PATH does not point to a readable executable."
            : "Markdown.pl could not be started.",
    };
    if (script && perl && scriptExists && perlExists) {
      try {
        const output = await runProgram(perl, [script], "# Markdown.pl probe\n", undefined, "Markdown.pl");
        if (!/<h1\b/i.test(output)) throw new PreviewError("Markdown.pl did not return HTML", 503);
        markdownPl = { available: true, version: "Markdown.pl (Perl)", executable: perl, args: [script] };
      } catch (error) { markdownPl.error = (error as Error).message; }
    }
    return { "multimarkdown-cli": multimarkdown, "markdown-pl": markdownPl };
  })().catch((error: Error) => {
    cachedExternalPrograms = undefined;
    throw error;
  });
  return cachedExternalPrograms;
}

export async function getMarkdownLabCapabilities(): Promise<Capabilities> {
  const [pandocCapabilities, programs] = await Promise.all([getPandocCapabilities(), getExternalPrograms()]);
  const { "multimarkdown-cli": multimarkdown, "markdown-pl": markdownPl } = programs;
  const publicStatus = (program: Program) => ({ available: program.available, version: program.version, error: program.error });
  return {
    ...pandocCapabilities,
    renderers: {
      "multimarkdown-cli": publicStatus(multimarkdown),
      "markdown-pl": publicStatus(markdownPl),
    },
  };
}

interface AstNode {
  t: string;
  c?: any;
}
interface PandocDocument {
  "pandoc-api-version": number[];
  meta: Record<string, unknown>;
  blocks: AstNode[];
}
function transform(value: any, plugins: string[]): any {
  if (Array.isArray(value))
    return value.map((item) => transform(item, plugins));
  if (!value || typeof value !== "object") return value;
  if (value.t === "CodeBlock") {
    const language = value.c[0][1][0] || "";
    const html = renderBlockPlugin(language, value.c[1], plugins);
    if (html !== undefined) return { t: "RawBlock", c: ["html", html] };
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, transform(item, plugins)]),
  );
}
function sourceLine(node: AstNode): number | undefined {
  const attr = node.t === "Header" ? node.c[1] : node.c?.[0];
  if (!Array.isArray(attr?.[2])) return undefined;
  const pos = attr[2].find((pair: unknown[]) => pair[0] === "data-pos")?.[1];
  const line =
    typeof pos === "string" ? /(?:^|@)(\d+):\d+-/.exec(pos)?.[1] : undefined;
  return line ? Number(line) : undefined;
}
const locator = new MarkdownIt({ html: true });
function blockText(value: any): string {
  if (Array.isArray(value)) return value.map(blockText).join("");
  if (!value || typeof value !== "object") return "";
  if (value.t === "Str") return value.c;
  if (["Space", "SoftBreak", "LineBreak"].includes(value.t)) return " ";
  if (["Code", "Math"].includes(value.t)) return value.c[1];
  if (value.t === "CodeBlock") return value.c[1];
  return blockText(value.c);
}
const normalize = (text: string) =>
  text.replace(/[^\p{L}\p{N}]/gu, "").slice(0, 32);

export async function renderPreview(
  input: unknown,
  signal?: AbortSignal,
): Promise<RenderResult> {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success)
    throw new PreviewError("Invalid preview options or content exceeds 128,000 characters", 400);
  const { source, variant, extensions, plugins } = parsed.data;
  if (variant === "multimarkdown-cli" || variant === "markdown-pl") {
    if (Object.keys(extensions).length || plugins.length)
      throw new PreviewError("Direct renderers do not accept Lab extensions or block plugins", 400);
    const program = (await getExternalPrograms())[variant];
    if (!program.available || !program.executable || !program.args)
      throw new PreviewError(program.error || `${program.version} unavailable`, 503);
    const html = await runProgram(program.executable, program.args, source, signal, program.version);
    return {
      html,
      engine: program.version,
      blocks: parseFragment(html).childNodes.filter((node: any) => !!node.tagName).length,
      mapping: "proportional",
      warnings: ["This renderer does not report source positions; scroll sync follows document progress."],
    };
  }
  if (variant === "notion-markdown" || variant === "notdown") {
    if (variant === "notion-markdown" && Object.keys(extensions).length)
      throw new PreviewError("Optional syntax extensions are not yet available for the Notion dialect", 400);
    const config = { version: 1 as const, variant, extensions };
    if (variant === "notdown") for (const name of Object.keys(extensions)) {
      if (!supportsOption(config, name)) throw new PreviewError(`This dialect does not support extension: ${name}`, 400);
    }
    const doc = variant === "notdown" ? parseNative(source, config) : parseNotionMarkdown(source);
    return {
      html: renderNotionMarkdown(source, [], {
        sourcePositions: true,
        document: doc,
        codeBlock: (language, code) =>
          renderBlockPlugin(language, code, plugins),
      }),
      engine: variant === "notdown" ? "Notdown codec" : "Notdown · Notion codec",
      blocks: doc.childCount,
      mapping: "source",
      warnings: [],
    };
  }
  const capabilities = await getPandocCapabilities();
  if (!capabilities.available)
    throw new PreviewError(capabilities.error || "Pandoc disconnected", 503);
  const supported = capabilities.extensions[variant];
  if (!supported)
    throw new PreviewError(`This Pandoc installation does not support dialect: ${variant}`, 400);
  for (const name of Object.keys(extensions)) {
    if (!Object.hasOwn(supported, name))
      throw new PreviewError(`This dialect does not support extension: ${name}`, 400);
  }
  const exact = capabilities.sourcePositions[variant] === true;
  const format =
    variant +
    Object.entries(extensions)
      .map(([name, enabled]) => `${enabled ? "+" : "-"}${name}`)
      .join("") +
    (exact ? "+sourcepos" : "");
  const document: PandocDocument = JSON.parse(
    await pandoc(["--sandbox", "-f", format, "-t", "json"], source, signal),
  );
  const roots = locator
    .parse(source, {})
    .filter((token) => token.level === 0 && token.nesting !== -1 && token.map);
  const lines = source.split(/\r\n|\n|\r/);
  let cursor = 0;
  document.blocks = document.blocks.map((node, index) => {
    let line = sourceLine(node);
    if (line === undefined) {
      const needle = normalize(blockText(node));
      const found = needle
        ? lines.findIndex(
            (text, at) => at >= cursor && normalize(text).includes(needle),
          )
        : -1;
      line =
        found >= 0
          ? found + 1
          : Math.max(cursor + 1, (roots[index]?.map?.[0] ?? cursor) + 1);
      line = Math.min(lines.length, line);
    }
    cursor = line;
    return {
      t: "Div",
      c: [
        ["", ["lab-source-block"], [["data-source-line", String(line)]]],
        [transform(node, plugins)],
      ],
    };
  });
  // Metadata remains in the source editor. It cannot choose files, templates or filters.
  document.meta = {};
  const html = await pandoc(
    ["--sandbox", "-f", "json", "-t", "html5", "--mathjax", "--wrap=none"],
    JSON.stringify(document),
    signal,
  );
  return {
    html,
    engine: capabilities.version,
    blocks: document.blocks.length,
    mapping: exact ? "source" : "approximate",
    warnings: exact
      ? []
      : [
          "The Pandoc reader for this dialect does not provide line numbers; scroll sync estimates block positions. GFM / CommonMark use parser line numbers.",
        ],
  };
}
