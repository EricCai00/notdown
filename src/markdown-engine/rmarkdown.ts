import type MarkdownIt from "markdown-it";
import fence from "markdown-it/lib/rules_block/fence.mjs";
import { editorSchema } from "../document/editor-schema";
import type { Node as PMNode } from "prosemirror-model";

/** Keep the complete knitr header opaque: options are arbitrary R expressions. */
export function isRChunkHeader(value: string): boolean {
  return /^\{r(?:[ \t,][^`\r\n]*|)\}$/.test(value.trim());
}

export function rChunkMarkdown(node: PMNode): string {
  const fence = "`".repeat(Math.max(3, ...[...node.textContent.matchAll(/`+/g)].map(match => match[0].length + 1)));
  return `${fence}${node.attrs.header}\n${node.textContent}\n${fence}`;
}

export function installRMarkdown(md: MarkdownIt) {
  // Match before Markdown normalizes code-span whitespace. Longer backtick
  // spans are verbatim examples, not inline R expressions.
  md.inline.ruler.before("backticks", "rmarkdown_inline", (state, silent) => {
    const match = /^`r[ \t]+([^`]+)`/.exec(state.src.slice(state.pos));
    if (!match || !match[1].trim()) return false;
    if (!silent) {
      const token = state.push("source_inline", "", 0);
      token.meta = { node: editorSchema.nodes["inline.executable_expression"].create({ language: "r", raw: match[0], expression: match[1] }, editorSchema.text(match[1])) };
    }
    state.pos += match[0].length;
    return true;
  });
  md.block.ruler.before("fence", "rmarkdown_chunk", (state, start, end, silent) => {
    const line = state.src.slice(state.bMarks[start] + state.tShift[start], state.eMarks[start]);
    const opening = /^(`{3,})(.*)$/.exec(line);
    if (!opening || !isRChunkHeader(opening[2])) return false;
    // Delegate fence nesting and indentation to Markdown's parser. Converting to
    // source_node protects knitr options from Pandoc's attribute interpretation.
    const before = state.tokens.length;
    if (!fence(state, start, end, silent)) return false;
    if (silent) return true;
    const token = state.tokens[before];
    const value = token.content.replace(/\n$/, "");
    token.type = "source_node";
    token.meta = { node: editorSchema.nodes["block.executable_chunk"].create({ language: "r", header: opening[2].trim() }, value ? editorSchema.text(value) : undefined) };
    return true;
  }, { alt: ["paragraph", "reference", "blockquote", "list"] });
}
