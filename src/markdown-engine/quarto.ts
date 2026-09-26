import type MarkdownIt from "markdown-it";
import fence from "markdown-it/lib/rules_block/fence.mjs";
import { parseDocument } from "yaml";
import { editorSchema } from "../document/editor-schema";
import type { Node as PMNode } from "prosemirror-model";

export const quartoLanguages = ["r", "python", "julia", "ojs"] as const;
export type QuartoLanguage = typeof quartoLanguages[number];
export function quartoHeader(value: string): QuartoLanguage | undefined {
  return /^\{(r|python|julia|ojs)\}$/.exec(value.trim())?.[1] as QuartoLanguage | undefined;
}
export function executionLanguage(node: PMNode): QuartoLanguage {
  return node.attrs.language || "r";
}
export function languageLabel(language: string) {
  return ({ r: "R", python: "Python", julia: "Julia", ojs: "Observable JS" } as Record<string, string>)[language] || language;
}

/** Only the contiguous option comment prefix is YAML; program text is opaque. */
export function quartoCell(source: string, language: QuartoLanguage) {
  const lines = source.split("\n"), options: string[] = [];
  const prefix = language === "ojs" ? /^\s*\/\/\|(?: |$)(.*)$/ : /^\s*#\|(?: |$)(.*)$/;
  let index = 0;
  while (index < lines.length) {
    const match = prefix.exec(lines[index]);
    if (!match) break;
    options.push(match[1]); index++;
  }
  const document = parseDocument(options.join("\n"));
  if (document.errors.length) throw new Error(`Invalid Quarto cell options: ${document.errors[0].message}`);
  const value = document.toJS({ maxAliasCount: 30 });
  if (value !== null && (typeof value !== "object" || Array.isArray(value))) throw new Error("Quarto cell options must be a YAML mapping");
  return { code: lines.slice(index).join("\n"), options: (value || {}) as Record<string, unknown> };
}

export function installQuarto(md: MarkdownIt) {
  md.inline.ruler.before("backticks", "quarto_inline", (state, silent) => {
    const match = /^`\{(r|python|julia|ojs)\}[ \t]+([^`\r\n]+)`/.exec(state.src.slice(state.pos));
    if (!match || !match[2].trim()) return false;
    if (!silent) state.push("source_inline", "", 0).meta = {
      node: editorSchema.nodes["inline.executable_expression"].create({ language: match[1], raw: match[0], expression: match[2] }, editorSchema.text(match[2])),
    };
    state.pos += match[0].length;
    return true;
  });
  md.block.ruler.before("fence", "quarto_chunk", (state, start, end, silent) => {
    const line = state.src.slice(state.bMarks[start] + state.tShift[start], state.eMarks[start]);
    const opening = /^(`{3,}|~{3,})(.*)$/.exec(line);
    const language = opening && quartoHeader(opening[2]);
    if (!opening || !language) return false;
    const before = state.tokens.length;
    if (!fence(state, start, end, silent)) return false;
    if (silent) return true;
    const token = state.tokens[before], value = token.content.replace(/\n$/, "");
    token.type = "source_node";
    token.meta = { node: editorSchema.nodes["block.executable_chunk"].create({ language, header: opening[2].trim() }, value ? editorSchema.text(value) : undefined) };
    return true;
  }, { alt: ["paragraph", "reference", "blockquote", "list"] });
}
