import type MarkdownIt from "markdown-it";
import deflist from "markdown-it-deflist";
import type { SyntaxConfig } from "./config";

/** Pandoc makes every direct paragraph Plain when the term has no following blank line.
 * markdown-it-deflist only hides a definition's single paragraph (PHP Extra behavior).
 */
export function installDefinitionLists(md: MarkdownIt, config: SyntaxConfig) {
  md.use(deflist);
  const pandoc = ["notdown", "markdown", "rmarkdown", "quarto"].includes(config.variant);
  md.core.ruler.after("block", "definition_layout", state => {
    const lines = state.src.split("\n");
    const markerAt = (line: number) => /^[\t >]*([:~])(?:[\t ]|$)/.exec(lines[line] ?? "")?.[1];
    const lists: { level: number; termLine: number; tight?: boolean }[] = [];
    const definitions: { level: number; tight?: boolean }[] = [];
    for (const token of state.tokens) {
      if (token.type === "dl_open") {
        lists.push({ level: token.level, termLine: 0 });
      } else if (token.type === "dl_close") {
        lists.pop();
      } else if (token.type === "dt_open") {
        const list = lists.at(-1);
        if (list && token.level === list.level + 1) {
          list.termLine = token.map?.[0] ?? 0;
          list.tight = undefined;
        }
      } else if (token.type === "dd_open") {
        const list = lists.at(-1);
        let markerLine = token.map?.[0] ?? -1;
        if (list && list.tight === undefined) {
          // The plugin's first dd map can start at the term for later terms.
          list.tight = markerAt(list.termLine + 1) !== undefined;
          markerLine = list.termLine + (list.tight ? 1 : 2);
        }
        const marker = markerAt(markerLine) ?? ":";
        const tight = pandoc ? list?.tight : undefined;
        token.meta = { ...token.meta, definitionTight: tight, definitionMarker: marker };
        definitions.push({ level: token.level, tight });
      } else if (token.type === "dd_close") {
        definitions.pop();
      } else if (token.type === "paragraph_open" || token.type === "paragraph_close") {
        const definition = definitions.at(-1);
        if (definition?.tight !== undefined && token.level === definition.level + 1)
          token.hidden = definition.tight;
      }
    }
  });
}
