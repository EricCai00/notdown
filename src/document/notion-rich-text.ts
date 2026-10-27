import type MarkdownIt from "markdown-it";
import backticks from "markdown-it/lib/rules_inline/backticks.mjs";
import { decodeXml } from "./notion-syntax";

/** The MCP and public REST grammars are a union: retain both math delimiters. */
export function installNotionRichText(md: MarkdownIt, options: { citations?: boolean; math?: boolean; codeTags?: boolean } = {}) {
  md.inline.ruler.before("html_inline", "notdown_code_tag", (state, silent) => {
    // Observed REST v2 responses use this undocumented spelling. Read it only
    // in Notdown; the contents are literal code, never nested tags or links.
    if (!options.codeTags && !(state.env.notionV2 && state.env.extensions?.codeTags)) return false;
    const match = /^<code>([^\r\n]*?)<\/code>/.exec(state.src.slice(state.pos));
    if (!match) return false;
    if (!silent) {
      const token = state.push("code_inline", "code", 0);
      token.content = decodeXml(match[1]);
      token.meta = { notionCodeTag: true };
    }
    state.pos += match[0].length;
    return true;
  });
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
