import type MarkdownIt from "markdown-it";
import backticks from "markdown-it/lib/rules_inline/backticks.mjs";

/** The MCP and public REST grammars are a union: retain both math delimiters. */
export function installNotionRichText(md: MarkdownIt, options: { citations?: boolean; math?: boolean } = {}) {
  md.inline.ruler.at("backticks", (state, silent) => {
    const from = state.pos, count = state.tokens.length, pending = state.pending;
    if (!backticks(state, silent)) return false;
    if (/[\r\n]/.test(state.src.slice(from, state.pos))) {
      state.pos = from;
      state.tokens.length = count;
      state.pending = pending;
      return false;
    }
    if (!silent) {
      const token = state.tokens.at(-1);
      if (token?.type === "code_inline") token.content = token.content.replace(/<br\s*\/?\s*>/gi, "\n");
    }
    return true;
  });
  md.inline.ruler.before("text", "notion_mcp_rich_text", (state, silent) => {
    const rest = state.src.slice(state.pos);
    const citation = /^\[\^((?:\{\{\d+\}\}|[a-z][a-z\d+.-]*:[^\]\s<>]+|[a-z\d-]+(?:\.[a-z\d-]+)+(?:[/?#][^\]\s<>]*)?))\]/i.exec(rest);
    if (citation && state.env.nativeFootnoteLabels?.has(citation[1])) return false;
    const mcpMath = /^\$`([^`\r\n]+)`\$/.exec(rest);
    const math = mcpMath || /^\$([^$`\r\n]+)\$/.exec(rest);
    const match = citation || math;
    if (!match) return false;
    if (!citation && options.math === false) return false;
    if (!silent) {
      const literal = citation && options.citations === false;
      const token = state.push(literal ? "text" : citation ? "nfm_citation" : "nfm_math", "", 0);
      token.content = literal ? match[0] : match[1];
      token.meta = { delimiter: mcpMath ? "gfm" : "dollars" };
    }
    state.pos += match[0].length;
    return true;
  });
}
