import type MarkdownIt from "markdown-it";
import fence from "markdown-it/lib/rules_block/fence.mjs";
import { editorSchema } from "../document/editor-schema";

/** Keep the complete knitr header opaque: options are arbitrary R expressions. */
export function isRChunkHeader(value: string): boolean {
  return /^\{r(?:[\s,][^\r\n]*|)\}$/.test(value.trim());
}

export function installRMarkdown(md: MarkdownIt) {
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
    token.meta = { node: editorSchema.nodes.code_block.create(
      { params: opening[2].trim(), rChunk: true }, value ? editorSchema.text(value) : undefined,
    ) };
    return true;
  }, { alt: ["paragraph", "reference", "blockquote", "list"] });
}
